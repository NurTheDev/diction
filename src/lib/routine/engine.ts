/**
 * R9 · writing a routine, and the two rules that make the writing safe.
 *
 * **One: nothing is locked.** The owner edits anything at will — a period that has already run, a day
 * that has already been sent, a teacher who is already double-booked. The only thing a clash does is
 * say so: the save answers `clash` with the names and the times, the drawer shows the banner and a
 * prominent "save anyway", and the same write with `force` goes straight through. No status freezes a
 * routine, no past date refuses a correction, and no published flag exists to refuse one.
 *
 * **Two: an unchanged day costs nothing.** A working sheet that says exactly what the week says is not
 * stored (`needsDocument` in `day.ts`), and one that has been edited back into a copy of the week is
 * deleted again by the same save. A sheet that has been sent is the exception, and deliberately: it is
 * the record of what went out, so it stays whatever it now says, and its badge says it has changed.
 *
 * Authorization is NOT decided here — the actions in `src/actions/routine.ts` hold the role check, and
 * the recycle engine holds the delete policy. This file moves data and writes the audit row.
 */
import mongoose from 'mongoose';
import {revalidatePath} from 'next/cache';
import {CenterClassGroup} from '@/models/CenterRecords';
import {DailyRoutine,MasterRoutine,TeachingAssignment} from '@/models/Routine';
import {User} from '@/models/User';
import {purgeAtFor} from '@/models/recycle';
import {audit} from '@/lib/admin/helpers';
import {clashesFor,type RoutineClash,type RoutineSlot} from './conflicts';
import {needsDocument,daySignature,type DayStatus,type PeriodShape} from './day';
import {centreSlots,masterWeek,shapeOf,type PeriodView} from './read';
import {weekdayOf} from './time';
import type {AssignmentInput,DailySheetInput,RoutinePeriodInput} from '@/schemas/routine';

export type RoutineOutcome=
  |{status:'ok';id?:string;stored?:boolean;pruned?:boolean;clashes?:RoutineClash[]}
  |{status:'invalid';fields?:string[]}
  |{status:'clash';clashes:RoutineClash[]}
  |{status:'duplicate'}
  |{status:'missing'}
  |{status:'error'};

/**
 * The hydrated documents this file mutates, typed here rather than inferred.
 *
 * `models.X||model('X',schema)` — the shape every model in this repo is exported as, so a hot reload
 * does not recompile a schema — leaves the union too loose for TypeScript to infer a subdocument array
 * out of, and a period read as `any` is a period whose field names nobody checks. So the writer names
 * what it touches: a period is a subdocument with its own `_id`, its own bin stamps and its own
 * `deleteOne`, and the array it lives in answers `.id()`.
 */
interface PeriodSub{
  _id:mongoose.Types.ObjectId;start:string;end:string;subject:{bn:string;en:string};
  teacher:mongoose.Types.ObjectId|null;room:string;jointWith:mongoose.Types.ObjectId|null;
  order:number;note:string;source:string;masterPeriod:mongoose.Types.ObjectId|null;
  deletedAt:Date|null;deletedBy:mongoose.Types.ObjectId|null;purgeAt:Date|null;
  deleteOne():void;
}
interface PeriodList extends Array<PeriodSub>{
  /** Mongoose's own subdocument lookup: the period with this `_id`, or null. */
  id(value:string):PeriodSub|null;
  /** A pushed value is cast by the schema, so the writer hands over plain field values. */
  push(...items:unknown[]):number;
}
type Saved=Promise<unknown>;
interface MasterDoc{
  _id:mongoose.Types.ObjectId;classGroup:mongoose.Types.ObjectId;classLabel:{bn:string;en:string};
  shift:string;weekday:number;active:boolean;periods:PeriodList;
  /* The bin's own three stamps: a day moved out of a shift it no longer holds is binned, not dropped. */
  deletedAt:Date|null;deletedBy:mongoose.Types.ObjectId|null;purgeAt:Date|null;
  save(options?:{session?:mongoose.ClientSession}):Saved;
}
interface DailyDoc{
  _id:mongoose.Types.ObjectId;date:string;classGroup:mongoose.Types.ObjectId;shift:string;
  classLabel:{bn:string;en:string};status:DayStatus;holidayReason:string;notes:string;periods:PeriodList;
  sentAt:Date|null;sentBy:mongoose.Types.ObjectId|null;sentSignature:string;
  save(options?:{session?:mongoose.ClientSession}):Saved;deleteOne():Saved;
}

/** The pages a routine write changes, in both languages. */
export function refreshRoutine():void{
  for(const locale of ['bn','en']){
    for(const route of ['/admin/routine/master','/admin/routine/daily']){
      // Outside a request context (a unit suite, the daily job) there is no cache to invalidate.
      try{revalidatePath(`/${locale}${route}`)}catch{/* nothing cached to refresh */}
    }
  }
}

const validId=(value:unknown):boolean=>mongoose.isValidObjectId(String(value??''));

type ClassDoc={_id:mongoose.Types.ObjectId;name:{bn:string;en?:string}};

/**
 * The class a write is about, and the label the record will carry: `null` when the class is not there,
 * which is the check every write needs anyway, so the name is never read twice.
 */
async function classOf(classId:string):Promise<ClassDoc|null>{
  if(!validId(classId))return null;
  return CenterClassGroup.findById(classId).select('name').lean<ClassDoc|null>();
}

const labelOf=(group:ClassDoc):{bn:string;en:string}=>({bn:group.name?.bn||'',en:group.name?.en||''});

/** The day document for one class, shift and weekday — created the moment a period is written into it. */
async function upsertMasterDay(classId:string,shift:string,weekday:number,actor:string,group:ClassDoc):Promise<MasterDoc|null>{
  return MasterRoutine.findOneAndUpdate(
    {classGroup:classId,shift,weekday},
    /* The label is `$set` and not only `$setOnInsert`: a class renamed since this day was written is a
       class the bin should name correctly the next time anybody touches the day. */
    {$set:{classLabel:labelOf(group)},$setOnInsert:{classGroup:classId,shift,weekday,active:true,createdBy:actor,periods:[]}},
    {upsert:true,new:true,setDefaultsOnInsert:true,runValidators:true},
  ) as unknown as Promise<MasterDoc|null>;
}

/** A period as the clash check reads it, with the teacher's own name so the warning can say who. */
async function proposedSlot(draft:RoutinePeriodInput,weekday:number):Promise<RoutineSlot>{
  let teacherName='';
  if(validId(draft.teacher)){
    const teacher=await User.findById(draft.teacher).select('name').lean<{name:string}|null>();
    teacherName=teacher?.name||'';
  }
  return {periodId:draft.id||undefined,weekday,start:draft.start,end:draft.end,
    teacher:draft.teacher||'',room:draft.room,subject:draft.subjectBn,teacherName};
}

/** A draft period as the storage comparison reads it. */
function draftShape(draft:RoutinePeriodInput):PeriodShape{
  return {start:draft.start,end:draft.end,subjectBn:draft.subjectBn,subjectEn:draft.subjectEn,
    teacher:draft.teacher,room:draft.room,jointWith:draft.jointWith,order:draft.order,note:draft.note};
}

const shapesOf=(periods:PeriodView[]):PeriodShape[]=>periods.map(shapeOf);

export interface MasterPeriodWrite{
  classId:string;shift:string;weekday:number;draft:RoutinePeriodInput;force?:boolean;actor:string;
}

/**
 * Write one period of the master week: create it, edit it, or move it to another day.
 *
 * A move is two documents — the day it leaves and the day it arrives in — so it runs in one
 * transaction: a period that vanished from Sunday and never reached Monday is a hole in the week, and
 * the week is the thing this collection exists to keep.
 */
export async function saveMasterPeriod({classId,shift,weekday,draft,force,actor}:MasterPeriodWrite):Promise<RoutineOutcome>{
  if(!validId(classId)||!Number.isInteger(weekday)||weekday<0||weekday>6)return {status:'invalid',fields:['weekday']};
  if(!shift.trim())return {status:'invalid',fields:['shift']};
  const group=await classOf(classId);
  if(!group)return {status:'invalid',fields:['classId']};

  const proposed=await proposedSlot(draft,weekday);
  const clashes=clashesFor(proposed,await centreSlots(weekday));
  /* The warning is the answer, not a refusal: with `force` the same write goes through unchanged. */
  if(clashes.length&&!force)return {status:'clash',clashes};

  const editing=validId(draft.id);
  const source=editing
    ? await MasterRoutine.findOne({classGroup:classId,shift,'periods._id':draft.id}) as unknown as MasterDoc|null
    : null;
  if(editing&&!source)return {status:'missing'};
  const periodValues={
    start:draft.start,end:draft.end,subject:{bn:draft.subjectBn,en:draft.subjectEn},
    teacher:validId(draft.teacher)?draft.teacher:null,room:draft.room,
    jointWith:validId(draft.jointWith)?draft.jointWith:null,
    order:draft.order,note:draft.note,source:'own' as const,masterPeriod:null,
  };

  const moving=!!source&&source.weekday!==weekday;
  const target=source&&!moving?source:await upsertMasterDay(classId,shift.trim(),weekday,actor,group);
  if(!target)return {status:'error'};
  if(source)source.classLabel=labelOf(group) as never;
  target.classLabel=labelOf(group) as never;

  /* The arriving period's id is struck before the transaction and both writes look for it first:
     Mongo re-runs a transaction callback after a transient error, and a callback that pushes blindly
     would come out of the retry holding the same period twice — a day that double-books itself. */
  const newId=new mongoose.Types.ObjectId();
  const session=await mongoose.startSession();
  try{
    await session.withTransaction(async()=>{
      const arrived=target.periods.id(String(newId));
      if(source){
        const period=source.periods.id(String(draft.id));
        if(!period&&!arrived)throw Object.assign(new Error('MISSING'),{code:'MISSING'});
        if(moving){
          /* The period keeps its own history rather than being recreated: it is the same period, on
             another day, which is what "move to another day" means to the person who wrote it. */
          period?.deleteOne();
          if(!arrived)target.periods.push({...periodValues,_id:newId});
          await source.save({session});
        }else if(period){
          Object.assign(period,periodValues);
        }
      }else if(!arrived){
        target.periods.push({...periodValues,_id:newId});
      }
      await target.save({session});
    });
  }catch(error){
    if((error as {code?:string}).code==='MISSING')return {status:'missing'};
    return {status:'error'};
  }finally{
    await session.endSession();
  }
  await audit(actor,moving?'routine.period.move':'routine.period.save',String(target._id));
  refreshRoutine();
  return {status:'ok',id:String(target._id),clashes};
}

export interface PeriodDeleteWrite{classId:string;shift:string;periodId:string;actor:string;weekday?:number}

/**
 * Delete one period of the master week: into the day's own bin for thirty days, undoable from the toast.
 *
 * A period is a subdocument, so its bin is inside the day it belongs to — deleting the 8:00 period must
 * not bin the class's whole Sunday. `deletedAt` hides it from the grid, `purgeAt` is when the daily job
 * drops it for good, and `restoreMasterPeriod` is the Undo.
 */
export async function deleteMasterPeriod({classId,shift,periodId,actor}:PeriodDeleteWrite):Promise<RoutineOutcome>{
  if(!validId(classId)||!validId(periodId))return {status:'invalid'};
  const doc=await MasterRoutine.findOne({classGroup:classId,shift,'periods._id':periodId}) as unknown as MasterDoc|null;
  const period=doc?.periods.id(periodId);
  if(!doc||!period)return {status:'missing'};
  const now=new Date();
  period.deletedAt=now;
  period.deletedBy=new mongoose.Types.ObjectId(actor);
  period.purgeAt=purgeAtFor(now);
  await doc.save();
  await audit(actor,'routine.period.delete',String(doc._id));
  refreshRoutine();
  return {status:'ok',id:periodId};
}

/** Undo a period delete, from the toast or from the day's ⋯ menu. */
export async function restoreMasterPeriod({classId,shift,periodId,actor}:PeriodDeleteWrite):Promise<RoutineOutcome>{
  if(!validId(classId)||!validId(periodId))return {status:'invalid'};
  const doc=await MasterRoutine.findOne({classGroup:classId,shift,'periods._id':periodId}) as unknown as MasterDoc|null;
  const period=doc?.periods.id(periodId);
  if(!doc||!period)return {status:'missing'};
  period.deletedAt=null;
  period.deletedBy=null;
  period.purgeAt=null;
  await doc.save();
  await audit(actor,'routine.period.restore',String(doc._id));
  refreshRoutine();
  return {status:'ok',id:periodId};
}

export interface MasterDayWrite{id:string;shift:string;active:boolean;actor:string}

/**
 * Edit a day of the week itself: which shift it belongs to, and whether it is switched off.
 *
  * Changing the shift moves the whole day — every period with it — into that shift’s week, so a day
  * is never half in one shift and half in another. Where the class has no day of that weekday in the new
  * shift, the move is one field on the same document and the day keeps its id; where it already has one,
  * the periods join it in a single transaction and the emptied day goes to the Recycle Bin, because the
  * unique index on class + shift + weekday allows only one live day of each.
 */
export async function saveMasterDay({id,shift,active,actor}:MasterDayWrite):Promise<RoutineOutcome>{
  if(!validId(id)||!shift.trim())return {status:'invalid',fields:['shift']};
  const doc=await MasterRoutine.findById(id) as unknown as MasterDoc|null;
  if(!doc)return {status:'missing'};
  const nextShift=shift.trim();
  /* The case the day drawer is opened for: the day stays where it is and its own two words change. */
  if(doc.shift===nextShift){
    doc.active=active;
    await doc.save();
    await audit(actor,'routine.day.save',id);
    refreshRoutine();
    return {status:'ok',id};
  }
  /* Moving a day into another shift. When the class runs no day of this weekday under the new shift, the
     move is ONE FIELD on the same document: the day keeps its id, its periods and its history, and the
     screen that posted the move keeps pointing at a day that still exists. */
  const existing=await MasterRoutine.findOne({classGroup:doc.classGroup,shift:nextShift,
    weekday:doc.weekday}) as unknown as MasterDoc|null;
  if(!existing){
    doc.shift=nextShift;
    doc.active=active;
    await doc.save();
    await audit(actor,'routine.day.shift',id);
    refreshRoutine();
    return {status:'ok',id};
  }
  /* When the class already runs that weekday in the new shift, the periods join the day that is already
     there and the day they came from goes to the bin. Two live documents cannot hold one class, shift and
     weekday — that is the unique index — and an emptied day is not a day anybody asked to keep, so it
     takes the same thirty days in the Recycle Bin everything else this app removes takes. */
  const now=new Date();
  const session=await mongoose.startSession();
  try{
    await session.withTransaction(async()=>{
      /* Values, not subdocuments: a subject pushed from one document into another is a copy of its
         words, never a shared object. */
      const live=doc.periods.filter(period=>!(period.deletedAt instanceof Date))
        .map(period=>({start:period.start,end:period.end,
          subject:{bn:period.subject?.bn||'',en:period.subject?.en||''},teacher:period.teacher,
          room:period.room,jointWith:period.jointWith,order:period.order,note:period.note,
          source:period.source,masterPeriod:period.masterPeriod,_id:new mongoose.Types.ObjectId()}));
      existing.periods.push(...(live as unknown as PeriodSub[]));
      existing.active=active;
      doc.deletedAt=now;
      doc.deletedBy=new mongoose.Types.ObjectId(actor);
      doc.purgeAt=purgeAtFor(now);
      await existing.save({session});
      await doc.save({session});
    });
  }catch{
    return {status:'error'};
  }finally{
    await session.endSession();
  }
  await audit(actor,'routine.day.shift',id);
  refreshRoutine();
  return {status:'ok',id:String(existing._id)};
}

export interface DailyWrite extends DailySheetInput{force?:boolean;actor:string}

/**
 * Save one date's working sheet: its status, its reason, its notes and its periods, all at once.
 *
 * This is the only writer of `DailyRoutine`, which is what makes the storage rule hold: it compares the
 * day against the master day it came from and writes nothing when they agree, deleting the copy when an
 * edit brings them back together. A sheet that has been sent is never deleted — it stays, and its own
 * badge says it has changed since.
 */
export async function saveDailySheet({classId,shift,date,status,holidayReason,notes,periods,force,actor}:DailyWrite):Promise<RoutineOutcome>{
  const group=await classOf(classId);
  if(!group)return {status:'invalid',fields:['classId']};
  const weekday=weekdayOf(date);
  if(!Number.isFinite(weekday))return {status:'invalid',fields:['date']};
  if(status==='holiday'&&!holidayReason.trim())return {status:'invalid',fields:['holidayReason']};

  /* A substitute on Tuesday is a real person in a real room on Tuesday, so the day is checked against
     every other class's week AND every other class's sheet for that date — but never against this
     class's own master day, which is exactly what this sheet is standing in for. */
  const others=await centreSlots(weekday,{excludeClass:classId,date,excludeDailyClass:classId});
  const clashes:RoutineClash[]=[];
  for(const draft of periods){
    const slot=await proposedSlot({...draft,id:''},weekday);
    clashes.push(...clashesFor(slot,others));
  }
  if(clashes.length&&!force)return {status:'clash',clashes};

  const week=await masterWeek(classId,shift,'bn');
  const masterShapes=shapesOf(week.find(day=>day.weekday===weekday)?.periods||[]);
  const existing=await DailyRoutine.findOne({date,classGroup:classId,shift}) as unknown as DailyDoc|null;
  const draft:PeriodShape[]=periods.map(draftShape);

  if(!needsDocument({status,notes,holidayReason,periods:draft,masterPeriods:masterShapes,sentAt:existing?.sentAt})){
    /* Nothing to store: an unchanged day is the week, and the week is already written. */
    if(existing){
      await existing.deleteOne();
      await audit(actor,'routine.daily.prune',String(existing._id));
      refreshRoutine();
      return {status:'ok',stored:false,pruned:true,clashes};
    }
    refreshRoutine();
    return {status:'ok',stored:false,pruned:false,clashes};
  }

  const known=new Map((existing?.periods||[]).map(period=>[String(period._id).toLowerCase(),period]));
  const nextPeriods=periods.map(item=>{
    const prior=item.id?known.get(item.id.toLowerCase()):undefined;
    return {
      _id:prior?prior._id:new mongoose.Types.ObjectId(),
      start:item.start,end:item.end,subject:{bn:item.subjectBn,en:item.subjectEn},
      teacher:validId(item.teacher)?item.teacher:null,room:item.room,
      jointWith:validId(item.jointWith)?item.jointWith:null,order:item.order,note:item.note,
      /* Where the period came from, so the sheet can say "the master routine's" or "this day's own"
         and a reset knows what to put back. */
      source:validId(item.masterPeriod)?'master':'own',
      masterPeriod:validId(item.masterPeriod)?item.masterPeriod:null,
    };
  });

  if(existing){
    existing.status=status;
    existing.holidayReason=holidayReason.trim();
    existing.notes=notes.trim();
    existing.classLabel=labelOf(group) as never;
    existing.periods=nextPeriods as never;
    await existing.save();
    await audit(actor,'routine.daily.save',String(existing._id));
    refreshRoutine();
    return {status:'ok',id:String(existing._id),stored:true,pruned:false,clashes};
  }

  try{
    const created=await DailyRoutine.create({
      date,classGroup:classId,classLabel:labelOf(group),shift,status,
      holidayReason:holidayReason.trim(),notes:notes.trim(),periods:nextPeriods,createdBy:actor,
    });
    await audit(actor,'routine.daily.create',String(created._id));
    refreshRoutine();
    return {status:'ok',id:String(created._id),stored:true,pruned:false,clashes};
  }catch(error){
    return (error as {code?:number}).code===11000?{status:'duplicate'}:{status:'error'};
  }
}

/**
 * Put a date back to its master routine.
 *
 * An unsent sheet is simply dropped — there is nothing in it the week does not already say. A sent one
 * is rewritten as the copy of the week it started from and kept, because the sent marks on it are the
 * record of what went out; the badge then says the sheet has changed since.
 */
export async function resetDailySheet({classId,shift,date,actor}:{classId:string;shift:string;date:string;actor:string}):Promise<RoutineOutcome>{
  if(!validId(classId))return {status:'invalid'};
  const existing=await DailyRoutine.findOne({date,classGroup:classId,shift}) as unknown as DailyDoc|null;
  if(!existing)return {status:'ok',stored:false,pruned:false};
  if(!existing.sentAt){
    await existing.deleteOne();
    await audit(actor,'routine.daily.reset',String(existing._id));
    refreshRoutine();
    return {status:'ok',stored:false,pruned:true};
  }
  const weekday=weekdayOf(date);
  const week=await masterWeek(classId,shift,'bn');
  const master=week.find(day=>day.weekday===weekday)?.periods||[];
  existing.status='normal';
  existing.holidayReason='';
  existing.notes='';
  existing.periods=master.map(period=>({
    _id:new mongoose.Types.ObjectId(),start:period.start,end:period.end,
    subject:{bn:period.subjectBn,en:period.subjectEn},teacher:validId(period.teacherId)?period.teacherId:null,
    room:period.room,jointWith:validId(period.jointWith)?period.jointWith:null,order:period.order,
    note:period.note,source:'master',masterPeriod:period.id,
  })) as never;
  await existing.save();
  await audit(actor,'routine.daily.reset',String(existing._id));
  refreshRoutine();
  return {status:'ok',id:String(existing._id),stored:true};
}

/**
 * The sent marks a dispatch writes. Slice 1 stores them and reads them — the sheet's badge is
 * `changedSinceSent`, computed from the signature written here — and the send that calls this is a
 * later slice. Writing them never touches the day's content.
 */
export async function markDailySheetSent({classId,shift,date,actor,now=new Date()}:
  {classId:string;shift:string;date:string;actor:string;now?:Date}):Promise<RoutineOutcome>{
  const sheet=await DailyRoutine.findOne({date,classGroup:classId,shift}) as unknown as DailyDoc|null;
  if(!sheet)return {status:'missing'};
  const shapes:PeriodShape[]=sheet.periods
    .filter(period=>!(period.deletedAt instanceof Date))
    .map(period=>({start:period.start,end:period.end,subjectBn:period.subject?.bn||'',
      subjectEn:period.subject?.en||'',teacher:period.teacher?String(period.teacher):'',
      room:period.room||'',jointWith:period.jointWith?String(period.jointWith):'',
      order:Number(period.order)||0,note:period.note||''}));
  sheet.sentAt=now;
  sheet.sentBy=new mongoose.Types.ObjectId(actor);
  sheet.sentSignature=daySignature(shapes);
  await sheet.save();
  await audit(actor,'routine.daily.sent',String(sheet._id));
  refreshRoutine();
  return {status:'ok',id:String(sheet._id)};
}

/** Write one teaching assignment: who takes this subject in this class, and how many periods a week. */
export async function saveAssignment({id,teacherId,classId,subjectBn,subjectEn,periodsPerWeek,active,note,actor}:
  AssignmentInput&{actor:string}):Promise<RoutineOutcome>{
  if(!validId(teacherId)||!validId(classId))return {status:'invalid',fields:['teacherId']};
  const [teacher,group]=await Promise.all([
    User.findOne({_id:teacherId,role:'teacher'}).select('name').lean<{name:string}|null>(),
    classOf(classId),
  ]);
  /* An assignment is who actually takes the class, so an id that is not a live teacher account is a
     refusal rather than a row that looks live — the same rule the class page applies to its teachers. */
  if(!teacher)return {status:'invalid',fields:['teacherId']};
  if(!group)return {status:'invalid',fields:['classId']};
  const values={teacher:teacherId,teacherLabel:teacher.name||'',classGroup:classId,classLabel:labelOf(group),
    subject:{bn:subjectBn,en:subjectEn},periodsPerWeek,active,note:note.trim()};
  try{
    if(validId(id)){
      const updated=await TeachingAssignment.findOneAndUpdate({_id:id},{$set:values},{new:true,runValidators:true});
      if(!updated)return {status:'missing'};
      await audit(actor,'routine.assignment.save',id);
      refreshRoutine();
      return {status:'ok',id};
    }
    const created=await TeachingAssignment.create({...values,createdBy:actor});
    await audit(actor,'routine.assignment.create',String(created._id));
    refreshRoutine();
    return {status:'ok',id:String(created._id)};
  }catch(error){
    return (error as {code?:number}).code===11000?{status:'duplicate'}:{status:'error'};
  }
}

/** The status a sheet's own toggle writes, named so a component never hardcodes the three words. */
export const DAY_STATUSES:['normal','adjusted','holiday']=['normal','adjusted','holiday'];
export type {DayStatus};
