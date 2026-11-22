/**
 * R9 · Slice 2 · the tools that change many periods at once.
 *
 * Editing one period at a time is right for one period. It is wrong for the four things a centre
 * actually does in a hurry:
 *
 *   • **a shift of the clock** — the morning assembly ran long, so every period of the day moves ten
 *     minutes;
 *   • **a field written across a selection** — the room changed, the teacher changed, the subject
 *     changed, for the six periods ticked in the grid;
 *   • **a teacher away** — "replace X with Y from date A to date B", which touches the week and every
 *     working sheet inside the range, and must show what it will touch *before* it touches it;
 *   • **a whole day** — moved to another weekday, or duplicated onto one.
 *
 * Every tool here follows the two rules the single-period writer follows. **Nothing is locked**: a clash
 * is a warning that comes back with names and times, and the same call with `force` writes anyway.
 * **Every write is one write**: a day changed in bulk leaves exactly one history entry, so a day's memory
 * reads "six periods moved by ten minutes" rather than six identical lines.
 *
 * Previews are separate functions that only read. A preview and its apply walk the same documents and
 * compute the same next values, so what the operator saw is what gets written.
 */
import mongoose from 'mongoose';
import {CenterClassGroup} from '@/models/CenterRecords';
import {DailyRoutine,MasterRoutine} from '@/models/Routine';
import {User} from '@/models/User';
import {purgeAtFor} from '@/models/recycle';
import {audit} from '@/lib/admin/helpers';
import {clashesFor,type RoutineClash,type RoutineSlot} from './conflicts';
import {dayTypeOf,needsDocument,type DayStatus,type PeriodShape} from './day';
import {recordHistory,snapshotFor,type HistoryCarrier,type StoredHistoryEntry} from './history';
import {actorName,centreSlots,masterWeek,shapeOf} from './read';
import {refreshRoutine,type RoutineOutcome} from './engine';
import {clockMinutes,clockOfMinutes,weekdayOf} from './time';

/**
 * The documents this file mutates, named here for the same reason the single-period writer names them:
 * a period read as `any` is a period whose field names nobody checks.
 */
interface PeriodSub{
  _id:mongoose.Types.ObjectId;start:string;end:string;subject:{bn:string;en:string};
  teacher:mongoose.Types.ObjectId|null;room:string;jointWith:mongoose.Types.ObjectId|null;
  order:number;note:string;source:string;masterPeriod:mongoose.Types.ObjectId|null;
  deletedAt:Date|null;deletedBy:mongoose.Types.ObjectId|null;purgeAt:Date|null;
  deleteOne():void;
}
interface PeriodList extends Array<PeriodSub>{
  id(value:string):PeriodSub|null;
  push(...items:unknown[]):number;
}
type Saved=Promise<unknown>;
interface MasterDoc extends HistoryCarrier{
  _id:mongoose.Types.ObjectId;classGroup:mongoose.Types.ObjectId;classLabel:{bn:string;en:string};
  shift:string;weekday:number;active:boolean;dayType?:string;periods:PeriodList;history:StoredHistoryEntry[];
  deletedAt:Date|null;deletedBy:mongoose.Types.ObjectId|null;purgeAt:Date|null;
  save(options?:{session?:mongoose.ClientSession}):Saved;
}
interface DailyDoc extends HistoryCarrier{
  _id:mongoose.Types.ObjectId;date:string;classGroup:mongoose.Types.ObjectId;shift:string;
  classLabel:{bn:string;en:string};status:DayStatus;holidayReason:string;notes:string;
  examSubjectBn?:string;examSubjectEn?:string;examMode?:string;
  periods:PeriodList;history:StoredHistoryEntry[];
  sentAt:Date|null;sentBy:mongoose.Types.ObjectId|null;sentSignature:string;
  save(options?:{session?:mongoose.ClientSession}):Saved;deleteOne():Saved;
}
type ClassDoc={_id:mongoose.Types.ObjectId;name:{bn:string;en?:string}};

const validId=(value:unknown):boolean=>mongoose.isValidObjectId(String(value??''));
const live=(period:PeriodSub):boolean=>!(period.deletedAt instanceof Date);
const trim=(value:unknown):string=>String(value??'').trim();

/** How many periods one bulk call may touch: a day holds a handful, and a form post should stay small. */
export const BULK_LIMIT=80;
/** The clock granularity the whole routine keeps — a shift by seven minutes is a shift nobody meant. */
export const BULK_STEP=5;
/** How far a bulk shift may move a period, in minutes: four hours either way covers any assembly. */
export const BULK_SHIFT_LIMIT=240;

async function classDocs(ids:string[]):Promise<Map<string,ClassDoc>>{
  const unique=[...new Set(ids.filter(validId))];
  if(!unique.length)return new Map();
  const docs=await CenterClassGroup.find({_id:{$in:unique}}).select('name').lean<ClassDoc[]>();
  return new Map(docs.map(doc=>[String(doc._id),doc]));
}

async function teacherNames(ids:string[]):Promise<Map<string,string>>{
  const unique=[...new Set(ids.filter(validId))];
  if(!unique.length)return new Map();
  const docs=await User.find({_id:{$in:unique}}).select('name')
    .lean<{_id:mongoose.Types.ObjectId;name:string}[]>();
  return new Map(docs.map(doc=>[String(doc._id),doc.name||'']));
}

/* ------------------------------------------------------------------ bulk edit */

/**
 * One bulk edit as the form posts it. `minutes` moves every selected period's clock; the three `set`
 * flags say which field is being written across the selection, so an empty room can be *set* to empty
 * rather than being read as "leave the room alone".
 */
export interface BulkEditInput{
  classId:string;
  shift:string;
  weekday:number;
  periodIds:string[];
  minutes:number;
  setRoom:boolean;
  room:string;
  setTeacher:boolean;
  teacher:string;
  setSubject:boolean;
  subjectBn:string;
  subjectEn:string;
}

/** One selected period as the preview paints it: what it says now, and what it will say. */
export interface BulkRow{
  id:string;
  className:string;
  weekday:number;
  start:string;
  end:string;
  nextStart:string;
  nextEnd:string;
  room:string;
  nextRoom:string;
  teacherId:string;
  nextTeacherId:string;
  teacherName:string;
  nextTeacherName:string;
  subjectBn:string;
  subjectEn:string;
  nextSubjectBn:string;
  nextSubjectEn:string;
}

export interface BulkPreview{
  rows:BulkRow[];
  clashes:RoutineClash[];
  /** Which field names the check refused, when it refused — the form marks them. */
  invalid:string[];
}

/** What a bulk call answers: how many periods it wrote, and the clashes it warned about on the way. */
export type BulkOutcome=
  |{status:'ok';touched:number;clashes:RoutineClash[]}
  |{status:'invalid';fields:string[]}
  |{status:'clash';clashes:RoutineClash[]}
  |{status:'missing'}
  |{status:'error'};

/** One period's next values, once they are known to fit the clock. */
interface BulkNext{start:string;end:string;room:string;teacher:string;subjectBn:string;subjectEn:string}

/** The next values of one period under a bulk edit, or the reason the edit does not fit. */
function nextOf(period:PeriodSub,input:BulkEditInput):BulkNext|{invalid:string}{
  let start=period.start;
  let end=period.end;
  if(input.minutes){
    const from=clockMinutes(period.start)+input.minutes;
    const to=clockMinutes(period.end)+input.minutes;
    if(!Number.isFinite(from)||!Number.isFinite(to)||from<0||to>1439||to<=from)return {invalid:'minutes'};
    start=clockOfMinutes(from);
    end=clockOfMinutes(to);
  }
  const teacher=input.setTeacher?trim(input.teacher):period.teacher?String(period.teacher):'';
  if(input.setTeacher&&teacher&&!validId(teacher))return {invalid:'teacher'};
  const subjectBn=input.setSubject?trim(input.subjectBn):period.subject?.bn||'';
  if(input.setSubject&&!subjectBn)return {invalid:'subjectBn'};
  return {
    start,end,
    room:input.setRoom?trim(input.room):period.room||'',
    teacher,subjectBn,subjectEn:input.setSubject?trim(input.subjectEn):period.subject?.en||'',
  };
}

/** Nothing to do is a refused form, not a silent success: the operator ticked boxes and asked for no change. */
function bulkInvalid(input:BulkEditInput):string[]{
  const fields:string[]=[];
  if(!validId(input.classId))fields.push('classId');
  if(!trim(input.shift))fields.push('shift');
  if(!Number.isInteger(input.weekday)||input.weekday<0||input.weekday>6)fields.push('weekday');
  if(!input.periodIds.length||input.periodIds.length>BULK_LIMIT)fields.push('periodIds');
  if(input.minutes%BULK_STEP!==0||Math.abs(input.minutes)>BULK_SHIFT_LIMIT)fields.push('minutes');
  if(!input.minutes&&!input.setRoom&&!input.setTeacher&&!input.setSubject)fields.push('change');
  return fields;
}

/** Load the day and the selected periods inside it, once, for both the preview and the write. */
async function bulkTargets(input:BulkEditInput):Promise<{doc:MasterDoc|null;group:ClassDoc|null;
  periods:PeriodSub[];invalid:string[]}>{
  const invalid=bulkInvalid(input);
  if(invalid.length)return {doc:null,group:null,periods:[],invalid};
  const group=await CenterClassGroup.findById(input.classId).select('name').lean<ClassDoc|null>();
  if(!group)return {doc:null,group:null,periods:[],invalid:['classId']};
  const doc=await MasterRoutine.findOne({classGroup:input.classId,shift:trim(input.shift),
    weekday:input.weekday}) as unknown as MasterDoc|null;
  if(!doc)return {doc:null,group,periods:[],invalid:[]};
  const wanted=new Set(input.periodIds.map(id=>trim(id).toLowerCase()));
  const periods=doc.periods.filter(period=>live(period)&&wanted.has(String(period._id).toLowerCase()));
  return {doc,group,periods,invalid:periods.length?[]:['periodIds']};
}

/**
 * What a bulk edit will do, without doing it: one row per selected period with its next values, and the
 * clashes those next values land in.
 */
export async function previewBulkEdit(input:BulkEditInput):Promise<BulkPreview>{
  const {doc,group,periods,invalid}=await bulkTargets(input);
  if(invalid.length||!doc||!group)return {rows:[],clashes:[],invalid};
  const className=group.name?.bn||'';
  const drafts=new Map<string,BulkNext>();
  for(const period of periods){
    const next=nextOf(period,input);
    if('invalid' in next)return {rows:[],clashes:[],invalid:[next.invalid]};
    drafts.set(String(period._id),next as BulkNext);
  }
  const names=await teacherNames([...periods.map(period=>String(period.teacher||'')),
    ...(input.setTeacher?[input.teacher]:[])]);
  const edited=new Set(periods.map(period=>String(period._id).toLowerCase()));
  const proposed:RoutineSlot[]=periods.flatMap(period=>{
    const next=drafts.get(String(period._id));
    if(!next)return [];
    return [{periodId:String(period._id),classId:String(doc.classGroup),weekday:input.weekday,
      start:next.start,end:next.end,teacher:next.teacher,room:next.room,className,
      subject:next.subjectBn,teacherName:names.get(next.teacher)||''}];
  });
  /* What the day will hold once the edit is in: everything the centre already has at that minute apart
     from the periods being edited, plus the edited periods as they will be. Two ticked periods moved onto
     each other are a clash the operator is told about, and a period is never compared with itself. */
  const others=[...(await centreSlots(input.weekday))
    .filter(slot=>!edited.has(String(slot.periodId||'').toLowerCase())),...proposed];
  const rows:BulkRow[]=[];
  const clashes:RoutineClash[]=[];
  for(const period of periods){
    const next=drafts.get(String(period._id));
    if(!next)continue;
    const slot=proposed.find(candidate=>candidate.periodId===String(period._id));
    if(slot)clashes.push(...clashesFor(slot,others));
    rows.push({
      id:String(period._id),className,weekday:input.weekday,
      start:period.start,end:period.end,nextStart:next.start,nextEnd:next.end,
      room:period.room||'',nextRoom:next.room,
      teacherId:period.teacher?String(period.teacher):'',nextTeacherId:next.teacher,
      teacherName:names.get(period.teacher?String(period.teacher):'')||'',
      nextTeacherName:names.get(next.teacher)||'',
      subjectBn:period.subject?.bn||'',subjectEn:period.subject?.en||'',
      nextSubjectBn:next.subjectBn,nextSubjectEn:next.subjectEn,
    });
  }
  return {rows,clashes,invalid:[]};
}

/**
 * Write a bulk edit. One document, one save, one history entry naming how many periods it changed —
 * and the same clash warning the single-period writer gives, so a bulk shift onto a busy teacher asks
 * once, for all of them, instead of six times.
 */
export async function applyBulkEdit(input:BulkEditInput&{force?:boolean;actor:string}):Promise<BulkOutcome>{
  const preview=await previewBulkEdit(input);
  if(preview.invalid.length)return {status:'invalid',fields:preview.invalid};
  if(!preview.rows.length)return {status:'missing'};
  if(preview.clashes.length&&!input.force)return {status:'clash',clashes:preview.clashes};
  const {doc,group}=await bulkTargets(input);
  if(!doc||!group)return {status:'missing'};
  const wanted=new Set(input.periodIds.map(id=>trim(id).toLowerCase()));
  let touched=0;
  for(const period of doc.periods){
    if(!live(period)||!wanted.has(String(period._id).toLowerCase()))continue;
    const next=nextOf(period,input);
    if('invalid' in next)continue;
    period.start=next.start;
    period.end=next.end;
    period.room=next.room;
    period.teacher=next.teacher?new mongoose.Types.ObjectId(next.teacher):null;
    period.subject={bn:next.subjectBn,en:next.subjectEn};
    touched+=1;
  }
  if(!touched)return {status:'missing'};
  doc.classLabel={bn:group.name?.bn||'',en:group.name?.en||''} as never;
  const who=await actorName(input.actor);
  recordHistory(doc,{actor:input.actor,actorName:who,
    code:input.minutes?'bulkShift':'bulkFields',
    params:input.minutes?{count:touched,minutes:input.minutes}:{count:touched}});
  try{
    await doc.save();
  }catch{
    return {status:'error'};
  }
  await audit(input.actor,input.minutes?'routine.bulk.shift':'routine.bulk.fields',String(doc._id));
  refreshRoutine();
  return {status:'ok',touched,clashes:preview.clashes};
}

/* ------------------------------------------------------------- replace a teacher */

/**
 * "Replace teacher X with teacher Y from date A to date B."
 *
 * The range is what makes this a sick-leave tool rather than a rename: working sheets inside it are
 * rewritten, and the week itself is rewritten only when `master` is asked for — because a teacher away
 * for a fortnight comes back, and the week should not have to be rebuilt when they do. `classId` and
 * `shift` narrow it further; empty means every class and every shift.
 */
export interface ReplaceTeacherInput{
  from:string;
  to:string;
  fromDate:string;
  toDate:string;
  master:boolean;
  daily:boolean;
  classId:string;
  shift:string;
}

/** One period the replacement will touch, as the preview lists it. */
export interface ReplaceRow{
  kind:'master'|'daily';
  /** The sheet's date, or empty for a day of the week that happens every week. */
  date:string;
  weekday:number;
  classId:string;
  className:string;
  shift:string;
  start:string;
  end:string;
  subjectBn:string;
  subjectEn:string;
  room:string;
}

export interface ReplacePreview{
  rows:ReplaceRow[];
  clashes:RoutineClash[];
  fromName:string;
  toName:string;
  invalid:string[];
}

export type ReplaceOutcome=
  |{status:'ok';touched:number;days:number;clashes:RoutineClash[]}
  |{status:'invalid';fields:string[]}
  |{status:'clash';clashes:RoutineClash[]}
  |{status:'missing'}
  |{status:'error'};

const DAY=/^\d{4}-\d{2}-\d{2}$/;

function replaceInvalid(input:ReplaceTeacherInput):string[]{
  const fields:string[]=[];
  if(!validId(input.from))fields.push('from');
  if(!validId(input.to))fields.push('to');
  if(validId(input.from)&&validId(input.to)&&trim(input.from).toLowerCase()===trim(input.to).toLowerCase())fields.push('to');
  if(!DAY.test(input.fromDate)||!DAY.test(input.toDate))fields.push('fromDate');
  if(DAY.test(input.fromDate)&&DAY.test(input.toDate)&&input.toDate<input.fromDate)fields.push('toDate');
  if(!input.master&&!input.daily)fields.push('scope');
  if(input.classId&&!validId(input.classId))fields.push('classId');
  return fields;
}

/** The documents the replacement walks: the week's days, and every sheet inside the range. */
async function replaceTargets(input:ReplaceTeacherInput):Promise<{masters:MasterDoc[];dailies:DailyDoc[]}>{
  const teacher=new mongoose.Types.ObjectId(trim(input.from));
  const shift=trim(input.shift);
  const masterFilter:Record<string,unknown>={'periods.teacher':teacher};
  if(validId(input.classId))masterFilter.classGroup=input.classId;
  if(shift)masterFilter.shift=shift;
  const dailyFilter:Record<string,unknown>={'periods.teacher':teacher,date:{$gte:input.fromDate,$lte:input.toDate}};
  if(validId(input.classId))dailyFilter.classGroup=input.classId;
  if(shift)dailyFilter.shift=shift;
  const [masters,dailies]=await Promise.all([
    input.master?MasterRoutine.find(masterFilter) as unknown as Promise<MasterDoc[]>:Promise.resolve([]),
    input.daily?DailyRoutine.find(dailyFilter) as unknown as Promise<DailyDoc[]>:Promise.resolve([]),
  ]);
  return {masters,dailies};
}

/** The periods of one document this replacement touches, in the order the day runs. */
function replacePeriods(doc:MasterDoc|DailyDoc,input:ReplaceTeacherInput):PeriodSub[]{
  const from=trim(input.from).toLowerCase();
  return doc.periods.filter(period=>live(period)&&String(period.teacher||'').toLowerCase()===from);
}

/**
 * What the replacement will do, without doing it: every affected period, and every clash the incoming
 * teacher lands in — which is the whole point of a preview, because a substitute who is already teaching
 * another class at 10:00 is the thing the owner needs to see before the week is rewritten.
 */
export async function previewReplaceTeacher(input:ReplaceTeacherInput):Promise<ReplacePreview>{
  const invalid=replaceInvalid(input);
  if(invalid.length)return {rows:[],clashes:[],fromName:'',toName:'',invalid};
  const {masters,dailies}=await replaceTargets(input);
  const names=await teacherNames([input.from,input.to]);
  const classes=await classDocs([...masters,...dailies].map(doc=>String(doc.classGroup)));
  const rows:ReplaceRow[]=[];
  const clashes:RoutineClash[]=[];
  const proposed:{key:string;slot:RoutineSlot}[]=[];
  /* One clash walk per weekday, not per period: a week's worth of replacements asks the centre's week
     once, and the range's sheets ask once per date they hold. */
  const slotsByKey=new Map<string,RoutineSlot[]>();
  const slotsFor=async(weekday:number,date?:string):Promise<RoutineSlot[]>=>{
    /* Nothing is excluded here on purpose: the incoming teacher may be double-booked by another class,
       by another sheet of the same date, or by the same class at the same minute, and all three are the
       warning this preview exists to give. A period never clashes with itself — `clashesFor` knows its id. */
    const key=date?`date:${date}`:`weekday:${weekday}`;
    const held=slotsByKey.get(key);
    if(held)return held;
    const slots=date?await centreSlots(weekday,{date}):await centreSlots(weekday);
    slotsByKey.set(key,slots);
    return slots;
  };
  const toName=names.get(trim(input.to))||'';
  const gather=(doc:MasterDoc|DailyDoc,kind:'master'|'daily',date:string,weekday:number):void=>{
    const classId=String(doc.classGroup);
    const className=classes.get(classId)?.name?.bn||'';
    for(const period of replacePeriods(doc,input)){
      rows.push({kind,date,weekday,classId,className,shift:doc.shift,start:period.start,end:period.end,
        subjectBn:period.subject?.bn||'',subjectEn:period.subject?.en||'',room:period.room||''});
      proposed.push({key:date?`date:${date}`:`weekday:${weekday}`,
        slot:{periodId:String(period._id),classId,weekday,start:period.start,end:period.end,
          teacher:trim(input.to),room:period.room||'',className,subject:period.subject?.bn||'',
          teacherName:toName}});
    }
  };
  for(const doc of masters)gather(doc,'master','',doc.weekday);
  for(const doc of dailies)gather(doc,'daily',doc.date,weekdayOf(doc.date));
  /* The comparison is against the day as it will be: the periods being replaced are taken out — they are
     the ones changing hands, and comparing a period with its own old teacher would invent a clash — and
     the same periods as they will be are put back in, so two classes handed to one substitute at one
     minute are reported to the person about to do it. */
  const replaced=new Set(proposed.map(entry=>entry.slot.periodId||''));
  for(const key of [...new Set(proposed.map(entry=>entry.key))]){
    const group=proposed.filter(entry=>entry.key===key);
    const first=group[0].slot;
    const held=key.startsWith('date:')
      ? await slotsFor(first.weekday,key.slice('date:'.length))
      : await slotsFor(first.weekday);
    const others=[...held.filter(slot=>!replaced.has(String(slot.periodId||''))),
      ...group.map(entry=>entry.slot)];
    for(const entry of group)clashes.push(...clashesFor(entry.slot,others));
  }
  return {rows,clashes,fromName:names.get(trim(input.from))||'',toName,invalid:[]};
}

/**
 * Write the replacement.
 *
 * Every document touched leaves one history entry saying how many of its periods changed hands, and a
 * sheet that was already sent keeps its sent signature — so its badge says "changed since sent", which
 * is exactly the truth: the message that went out named the teacher who is now away.
 *
 * A sheet that has not been sent and ends up saying precisely what the week says is dropped again, the
 * same way the single-day save drops it: an unchanged day costs nothing.
 */
export async function applyReplaceTeacher(input:ReplaceTeacherInput&{force?:boolean;actor:string}):Promise<ReplaceOutcome>{
  const preview=await previewReplaceTeacher(input);
  if(preview.invalid.length)return {status:'invalid',fields:preview.invalid};
  if(!preview.rows.length)return {status:'missing'};
  if(preview.clashes.length&&!input.force)return {status:'clash',clashes:preview.clashes};
  const {masters,dailies}=await replaceTargets(input);
  const groups=await classDocs([...masters,...dailies].map(doc=>String(doc.classGroup)));
  const to=validId(input.to)?new mongoose.Types.ObjectId(trim(input.to)):null;
  const who=await actorName(input.actor);
  const fromName=preview.fromName;
  const toName=preview.toName;
  let touched=0;
  let days=0;
  const session=await mongoose.startSession();
  try{
    await session.withTransaction(async()=>{
      for(const doc of masters){
        const periods=replacePeriods(doc,input);
        if(!periods.length)continue;
        for(const period of periods){
          period.teacher=to;
          touched+=1;
        }
        const group=groups.get(String(doc.classGroup));
        if(group)doc.classLabel={bn:group.name?.bn||'',en:group.name?.en||''} as never;
        recordHistory(doc,{actor:input.actor,actorName:who,code:'replaceTeacher',
          params:{count:periods.length,from:fromName,to:toName}});
        await doc.save({session});
        days+=1;
      }
      for(const doc of dailies){
        const periods=replacePeriods(doc,input);
        if(!periods.length)continue;
        for(const period of periods){
          period.teacher=to;
          touched+=1;
        }
        const group=groups.get(String(doc.classGroup));
        if(group)doc.classLabel={bn:group.name?.bn||'',en:group.name?.en||''} as never;
        recordHistory(doc,{actor:input.actor,actorName:who,code:'replaceTeacher',
          params:{count:periods.length,from:fromName,to:toName}});
        /* The storage rule still holds after a bulk write: a sheet nobody has sent that now says exactly
           what the week says is not worth a document. */
        if(!doc.sentAt){
          const week=await masterWeek(String(doc.classGroup),doc.shift,'bn');
          const masterShapes=week.find(day=>day.weekday===weekdayOf(doc.date))?.periods.map(shapeOf)||[];
          const shapes:PeriodShape[]=doc.periods.filter(live).map(period=>({
            start:period.start,end:period.end,subjectBn:period.subject?.bn||'',
            subjectEn:period.subject?.en||'',teacher:period.teacher?String(period.teacher):'',
            room:period.room||'',jointWith:period.jointWith?String(period.jointWith):'',
            order:Number(period.order)||0,note:period.note||''}));
          if(!needsDocument({status:doc.status,notes:doc.notes,holidayReason:doc.holidayReason,
            periods:shapes,masterPeriods:masterShapes,sentAt:doc.sentAt,
            exam:!!doc.examSubjectBn||!!doc.examSubjectEn||doc.examMode==='exam'})){
            await doc.deleteOne();
            days+=1;
            continue;
          }
        }
        await doc.save({session});
        days+=1;
      }
    });
  }catch{
    return {status:'error'};
  }finally{
    await session.endSession();
  }
  if(!touched)return {status:'missing'};
  await audit(input.actor,'routine.teacher.replace',trim(input.from));
  refreshRoutine();
  return {status:'ok',touched,days,clashes:preview.clashes};
}

/* -------------------------------------------------------------------- day operations */

export interface DayOpInput{classId:string;shift:string;from:number;to:number}

export interface DayOpPreview{
  /** The periods the operation carries, as the day runs them. */
  rows:{id:string;start:string;end:string;subjectBn:string;subjectEn:string;room:string;teacherName:string}[];
  clashes:RoutineClash[];
  /** True when the day it lands in already exists, so its periods join the periods already there. */
  merges:boolean;
  invalid:string[];
}

function dayOpInvalid(input:DayOpInput):string[]{
  const fields:string[]=[];
  if(!validId(input.classId))fields.push('classId');
  if(!trim(input.shift))fields.push('shift');
  if(!Number.isInteger(input.from)||input.from<0||input.from>6)fields.push('from');
  if(!Number.isInteger(input.to)||input.to<0||input.to>6)fields.push('to');
  if(input.from===input.to)fields.push('to');
  return fields;
}

/** The periods a day operation carries, and the clashes they land in on the day they arrive. */
async function dayOpPreview(input:DayOpInput,copy:boolean):Promise<DayOpPreview>{
  const invalid=dayOpInvalid(input);
  if(invalid.length)return {rows:[],clashes:[],merges:false,invalid};
  const doc=await MasterRoutine.findOne({classGroup:input.classId,shift:trim(input.shift),
    weekday:input.from}) as unknown as MasterDoc|null;
  if(!doc)return {rows:[],clashes:[],merges:false,invalid:[]};
  const periods=doc.periods.filter(live);
  if(!periods.length)return {rows:[],clashes:[],merges:false,invalid:['from']};
  const target=await MasterRoutine.findOne({classGroup:input.classId,shift:trim(input.shift),
    weekday:input.to}) as unknown as MasterDoc|null;
  /* A weekly day off takes no new class: its own kept periods may be edited or moved off it, but no
     period — not one, and not a whole day's worth — can land on it. The day drawer does not even offer
     those weekdays, and this is the refusal that makes the rule true from a form posted past it. */
  if(target&&dayTypeOf(target.dayType)==='off')return {rows:[],clashes:[],merges:false,invalid:['to']};
  const group=await CenterClassGroup.findById(input.classId).select('name').lean<ClassDoc|null>();
  const className=group?.name?.bn||'';
  const names=await teacherNames(periods.map(period=>String(period.teacher||'')));
  /* A move empties the day it leaves, so its own periods are not standing in the way at the day it
     arrives in; a duplicate leaves them where they are, and they are not at the new weekday either. */
  const moving:RoutineSlot[]=periods.map(period=>({periodId:String(period._id),
    classId:String(doc.classGroup),weekday:input.to,start:period.start,end:period.end,
    teacher:period.teacher?String(period.teacher):'',room:period.room||'',className,
    subject:period.subject?.bn||'',teacherName:names.get(String(period.teacher||''))||''}));
  /* The day they land in, as it will be once they land: what is already there, minus the periods on their
     way (a move takes them out of the day they leave, and a duplicate leaves them on another weekday),
     plus the arriving periods themselves — so two of them landing on each other is a warning too. */
  const others=[...(await centreSlots(input.to))
    .filter(slot=>!periods.some(period=>String(period._id)===String(slot.periodId||''))),...moving];
  const clashes:RoutineClash[]=[];
  const rows:DayOpPreview['rows']=[];
  for(const [index,period] of periods.entries()){
    clashes.push(...clashesFor(moving[index],others));
    rows.push({id:String(period._id),start:period.start,end:period.end,
      subjectBn:period.subject?.bn||'',subjectEn:period.subject?.en||'',room:period.room||'',
      teacherName:names.get(String(period.teacher||''))||''});
  }
  return {rows,clashes,merges:!!target&&target.periods.some(live),invalid:[]};
}

/** What "move this day" will do, without doing it. */
export async function previewMoveDay(input:DayOpInput):Promise<DayOpPreview>{
  return dayOpPreview(input,false);
}

/** What "duplicate this day" will do, without doing it. */
export async function previewDuplicateDay(input:DayOpInput):Promise<DayOpPreview>{
  return dayOpPreview(input,true);
}

export type DayOpOutcome=
  |{status:'ok';touched:number;clashes:RoutineClash[];merged:boolean}
  |{status:'invalid';fields:string[]}
  |{status:'clash';clashes:RoutineClash[]}
  |{status:'missing'}
  |{status:'error'};

/** The plain values of one period, so a copy across documents is a copy of words and never a shared object. */
function valuesOf(period:PeriodSub,_id:mongoose.Types.ObjectId):Record<string,unknown>{
  return {_id,start:period.start,end:period.end,
    subject:{bn:period.subject?.bn||'',en:period.subject?.en||''},
    teacher:period.teacher,room:period.room||'',jointWith:period.jointWith,
    order:Number(period.order)||0,note:period.note||'',source:period.source||'own',
    masterPeriod:period.masterPeriod};
}

/**
 * Move every period of one weekday to another.
 *
 * Where the class runs nothing on the day it moves to, the move is one field: the day keeps its id, its
 * periods and its own memory, and only its weekday changes. Where the class already runs that day, the
 * periods join it in a single transaction and the emptied day goes to the Recycle Bin — the unique index
 * on class + shift + weekday leaves no third answer, and an emptied day is not a day anybody asked to
 * keep. The periods keep their own ids, so a joint session pointing at one still points at it.
 */
export async function moveMasterDay(input:DayOpInput&{force?:boolean;actor:string}):Promise<DayOpOutcome>{
  const preview=await previewMoveDay(input);
  if(preview.invalid.length)return {status:'invalid',fields:preview.invalid};
  if(!preview.rows.length)return {status:'missing'};
  if(preview.clashes.length&&!input.force)return {status:'clash',clashes:preview.clashes};
  const doc=await MasterRoutine.findOne({classGroup:input.classId,shift:trim(input.shift),
    weekday:input.from}) as unknown as MasterDoc|null;
  if(!doc)return {status:'missing'};
  const periods=doc.periods.filter(live);
  if(!periods.length)return {status:'missing'};
  const who=await actorName(input.actor);
  const target=await MasterRoutine.findOne({classGroup:input.classId,shift:trim(input.shift),
    weekday:input.to}) as unknown as MasterDoc|null;
  if(!target){
    doc.weekday=input.to;
    recordHistory(doc,{actor:input.actor,actorName:who,code:'dayMove',
      params:{count:periods.length,to:input.to}});
    try{
      await doc.save();
    }catch{
      return {status:'error'};
    }
    await audit(input.actor,'routine.day.move',String(doc._id));
    refreshRoutine();
    return {status:'ok',touched:periods.length,clashes:preview.clashes,merged:false};
  }
  const now=new Date();
  const session=await mongoose.startSession();
  try{
    await session.withTransaction(async()=>{
      const carried=periods.map(period=>valuesOf(period,period._id));
      const held=new Set(target.periods.filter(live).map(period=>String(period._id)));
      for(const values of carried){
        if(held.has(String(values._id)))values._id=new mongoose.Types.ObjectId();
      }
      target.periods.push(...carried);
      recordHistory(target,{actor:input.actor,actorName:who,code:'dayMove',
        params:{count:carried.length,to:input.to}});
      /* The day they left is empty, so it takes the same thirty days in the bin everything else this
         app removes takes — and its own memory goes with it, which is where the move is recorded from. */
      recordHistory(doc,{actor:input.actor,actorName:who,code:'dayMove',
        params:{count:carried.length,to:input.to}});
      for(const period of [...doc.periods])if(live(period))period.deleteOne();
      doc.deletedAt=now;
      doc.deletedBy=validId(input.actor)?new mongoose.Types.ObjectId(input.actor):null;
      doc.purgeAt=purgeAtFor(now);
      await target.save({session});
      await doc.save({session});
    });
  }catch{
    return {status:'error'};
  }finally{
    await session.endSession();
  }
  await audit(input.actor,'routine.day.move',String(target._id));
  refreshRoutine();
  return {status:'ok',touched:periods.length,clashes:preview.clashes,merged:true};
}

/**
 * Duplicate a whole day onto another weekday: the periods are copied, new ids for the copies, and the day
 * they came from is left exactly as it was. Where the class already runs the day it copies onto, the
 * copies join the periods already there.
 */
export async function duplicateMasterDay(input:DayOpInput&{force?:boolean;actor:string}):Promise<DayOpOutcome>{
  const preview=await previewDuplicateDay(input);
  if(preview.invalid.length)return {status:'invalid',fields:preview.invalid};
  if(!preview.rows.length)return {status:'missing'};
  if(preview.clashes.length&&!input.force)return {status:'clash',clashes:preview.clashes};
  const doc=await MasterRoutine.findOne({classGroup:input.classId,shift:trim(input.shift),
    weekday:input.from}) as unknown as MasterDoc|null;
  if(!doc)return {status:'missing'};
  const periods=doc.periods.filter(live);
  if(!periods.length)return {status:'missing'};
  const who=await actorName(input.actor);
  const group=await CenterClassGroup.findById(input.classId).select('name').lean<ClassDoc|null>();
  const label={bn:group?.name?.bn||'',en:group?.name?.en||''};
  const target=await MasterRoutine.findOne({classGroup:input.classId,shift:trim(input.shift),
    weekday:input.to}) as unknown as MasterDoc|null;
  const copies=periods.map(period=>valuesOf(period,new mongoose.Types.ObjectId()));
  if(!target){
    try{
      const created=await MasterRoutine.create({classGroup:input.classId,classLabel:label,
        shift:trim(input.shift),weekday:input.to,active:true,periods:copies,createdBy:input.actor,
        history:[]}) as unknown as MasterDoc;
      recordHistory(created,{actor:input.actor,actorName:who,code:'dayDuplicate',
        params:{count:copies.length,from:input.from}});
      await created.save();
      await audit(input.actor,'routine.day.duplicate',String(created._id));
      refreshRoutine();
      return {status:'ok',touched:copies.length,clashes:preview.clashes,merged:false};
    }catch{
      return {status:'error'};
    }
  }
  target.periods.push(...copies);
  target.classLabel=label as never;
  recordHistory(target,{actor:input.actor,actorName:who,code:'dayDuplicate',
    params:{count:copies.length,from:input.from}});
  try{
    await target.save();
  }catch{
    return {status:'error'};
  }
  await audit(input.actor,'routine.day.duplicate',String(target._id));
  refreshRoutine();
  return {status:'ok',touched:copies.length,clashes:preview.clashes,merged:true};
}

/* ------------------------------------------------------------------- restore a version */

export interface RestoreInput{kind:'master'|'daily';id:string;entryId:string}

/**
 * Put a day back to one of the versions it remembers.
 *
 * The snapshot holds the day's content, not its identity: which class it belongs to, which weekday or
 * which date it is, are never restored, because a restore that moved a day would collide with the day
 * already standing there. Periods in the day's bin are left in the bin — they are not part of the day,
 * and the Recycle Bin is what brings one back — and the restore is itself an edit, so it leaves its own
 * entry behind and the version restored can be restored back to.
 */
export async function restoreHistory(input:RestoreInput&{force?:boolean;actor:string}):Promise<RoutineOutcome>{
  if(!validId(input.id)||!trim(input.entryId))return {status:'invalid',fields:['entryId']};
  const doc=input.kind==='master'
    ? await MasterRoutine.findById(input.id) as unknown as MasterDoc|null
    : await DailyRoutine.findById(input.id) as unknown as DailyDoc|null;
  if(!doc)return {status:'missing'};
  const snapshot=snapshotFor(doc.history as StoredHistoryEntry[]|undefined,trim(input.entryId));
  if(!snapshot)return {status:'missing'};
  const weekday=input.kind==='master'?(doc as MasterDoc).weekday:weekdayOf((doc as DailyDoc).date);
  const classId=String(doc.classGroup);
  const group=await CenterClassGroup.findById(classId).select('name').lean<ClassDoc|null>();
  const className=group?.name?.bn||'';
  const clashes:RoutineClash[]=[];
  /* The day's own bin is not part of the day, so it is not part of a restore: those periods stay exactly
     where they are, binned, and the Recycle Bin is still what brings one of them back. */
  const names=await teacherNames(snapshot.periods.map(period=>period.teacher));
  const proposed:RoutineSlot[]=snapshot.periods.map((period,index)=>({periodId:`restore-${index}`,
    classId,weekday,start:period.start,end:period.end,teacher:period.teacher,room:period.room,
    className,subject:period.subjectBn,teacherName:names.get(period.teacher)||''}));
  /* The day as it will be once the version is back. Its own current periods are left out of the
     comparison — they are exactly what the restore replaces, and a day argued with itself would warn
     about every restore — and the restored periods are put in, so a version that double-books itself is
     still reported. */
  const mine=new Set(doc.periods.filter(live).map(period=>String(period._id)));
  const held=await centreSlots(weekday,input.kind==='daily'
    ? {excludeClass:classId,date:(doc as DailyDoc).date,excludeDailyClass:classId}
    : {});
  const others=[...held.filter(slot=>!mine.has(String(slot.periodId||''))),...proposed];
  for(const slot of proposed)clashes.push(...clashesFor(slot,others));
  if(clashes.length&&!input.force)return {status:'clash',clashes};
  const restored=snapshot.periods.map(period=>({
    _id:new mongoose.Types.ObjectId(),start:period.start,end:period.end,
    subject:{bn:period.subjectBn,en:period.subjectEn},
    teacher:validId(period.teacher)?new mongoose.Types.ObjectId(period.teacher):null,
    room:period.room||'',jointWith:validId(period.jointWith)?new mongoose.Types.ObjectId(period.jointWith):null,
    order:Number(period.order)||0,note:period.note||'',
    source:period.source==='master'?'master':'own',
    masterPeriod:validId(period.masterPeriod)?new mongoose.Types.ObjectId(period.masterPeriod):null,
  }));
  for(const period of [...doc.periods])if(live(period))period.deleteOne();
  doc.periods.push(...restored);
  if(input.kind==='daily'){
    const sheet=doc as DailyDoc;
    sheet.status=snapshot.status;
    sheet.holidayReason=snapshot.holidayReason||'';
    sheet.notes=snapshot.notes||'';
  }else{
    (doc as MasterDoc).active=snapshot.active!==false;
  }
  if(group)doc.classLabel={bn:group.name?.bn||'',en:group.name?.en||''} as never;
  const who=await actorName(input.actor);
  recordHistory(doc,{actor:input.actor,actorName:who,code:'restored',
    params:{count:restored.length}});
  try{
    await doc.save();
  }catch{
    return {status:'error'};
  }
  await audit(input.actor,`routine.${input.kind}.restore`,String(doc._id));
  refreshRoutine();
  return {status:'ok',id:String(doc._id),clashes};
}
