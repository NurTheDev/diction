/**
 * R9 · reading a routine: the week, the day's working sheet, the teachers and the clashes.
 *
 * Everything a routine screen paints is read here, once, and handed to the page as plain data. Two
 * decisions shape it:
 *
 *   • **The week is seven days whether or not they have been written.** A day with no document is an
 *     empty column, not a missing one — the "+ Add Period" button lives in it, and that button is the
 *     only way a week is ever started.
 *   • **The daily sheet is a merge, and the merge is honest about where each period came from.** A day
 *     nobody has touched reads its master's periods with `source:'master'`; a day somebody has written
 *     reads its own. The sheet never invents a document to read from, which is what keeps the storage
 *     rule in `day.ts` true on the read side too.
 *
 * Teacher and class names are resolved here rather than in a component, so a screen never paints an id
 * where a person's name belongs.
 */
import mongoose from 'mongoose';
import {CenterClassGroup} from '@/models/CenterRecords';
import {DailyRoutine,MasterRoutine,TeachingAssignment} from '@/models/Routine';
import {User} from '@/models/User';
import {daySignature,changedSinceSent,type DayStatus,type PeriodShape} from './day';
import {historyViews,type HistoryView,type StoredHistoryEntry} from './history';
import {dhakaDay} from '@/lib/admin/today';
import {hasPassed,shiftDate,weekdayOf,type Language} from './time';
import {roomKey,type RoutineSlot} from './conflicts';
import {routineShiftWords} from '@/lib/classes/class-shared';

export interface RoutineClass{id:string;nameBn:string;nameEn:string;name:string;shift:string;shifts:string[];active:boolean}
export interface RoutineTeacher{id:string;name:string}

export interface PeriodView{
  id:string;
  start:string;
  end:string;
  subjectBn:string;
  subjectEn:string;
  teacherId:string;
  teacherName:string;
  room:string;
  jointWith:string;
  order:number;
  note:string;
}

export interface MasterDayView{
  weekday:number;
  /** `null` until the day has been written — an empty column is not a missing one. */
  id:string|null;
  shift:string;
  active:boolean;
  periods:PeriodView[];
  /** Periods sitting in this day's own bin, so the ⋯ menu can say how many and offer them back. */
  binned:number;
  /** The day's own memory: the last twenty changes, newest first. */
  history:HistoryView[];
  updatedAt:string;
}

export interface DailyPeriodView extends PeriodView{source:'master'|'own';masterPeriod:string}

export interface DailySheetView{
  date:string;
  weekday:number;
  classId:string;
  className:string;
  shift:string;
  /** Was a document found? A sheet that reads its master has none, and that is the point. */
  stored:boolean;
  docId:string|null;
  status:DayStatus;
  holidayReason:string;
  notes:string;
  periods:DailyPeriodView[];
  masterPeriods:PeriodView[];
  sent:boolean;
  sentAt:string|null;
  /** Who sent it, named — the dispatch panel says "sent by" beside the time. */
  sentByName:string;
  changedSinceSent:boolean;
  passed:boolean;
  signature:string;
  /** The sheet's own memory: the last twenty changes, newest first. */
  history:HistoryView[];
}

/** One period of a teacher's own day, whichever class it belongs to. */
export interface TeacherRow{
  start:string;
  end:string;
  classId:string;
  className:string;
  shift:string;
  room:string;
  subjectBn:string;
  subjectEn:string;
  /** True when the day's working sheet says so rather than the week — a substitute, a moved room. */
  daily:boolean;
}

/** One date of a teacher's schedule. */
export interface TeacherDay{date:string;weekday:number;rows:TeacherRow[]}

/** A teacher's own timetable: today, and the seven days from today. */
export interface TeacherSchedule{today:TeacherDay;week:TeacherDay[]}

/** One class's day, as the printable notice reads it. */
export interface NoticeClass{
  classId:string;
  className:string;
  shift:string;
  status:DayStatus;
  holidayReason:string;
  notes:string;
  periods:PeriodView[];
  /** True when this date has its own sheet; false when the class simply runs the week. */
  stored:boolean;
}

/** The day's routine across every class — the sheet of paper that goes on the bulletin board. */
export interface DayNotice{date:string;weekday:number;classes:NoticeClass[]}

export interface AssignmentView{
  id:string;
  teacherId:string;
  teacherName:string;
  subjectBn:string;
  subjectEn:string;
  classId:string;
  className:string;
  periodsPerWeek:number;
  active:boolean;
  note:string;
  updatedAt:string;
}

type ClassDoc={_id:mongoose.Types.ObjectId;name:{bn:string;en?:string};shift?:string;shifts?:string[];active?:boolean;order?:number};
type UserDoc={_id:mongoose.Types.ObjectId;name:string};
type StoredPeriod={_id:mongoose.Types.ObjectId;start:string;end:string;subject:{bn:string;en?:string};
  teacher?:mongoose.Types.ObjectId|null;room?:string;jointWith?:mongoose.Types.ObjectId|null;order?:number;
  note?:string;source?:string;masterPeriod?:mongoose.Types.ObjectId|null;
  deletedAt?:Date|null;purgeAt?:Date|null};
type MasterDoc={_id:mongoose.Types.ObjectId;classGroup:mongoose.Types.ObjectId;shift:string;weekday:number;
  active?:boolean;periods:StoredPeriod[];history?:StoredHistoryEntry[];updatedAt:Date};
type DailyDoc={_id:mongoose.Types.ObjectId;date:string;classGroup:mongoose.Types.ObjectId;shift:string;
  status?:DayStatus;holidayReason?:string;notes?:string;periods:StoredPeriod[];
  sentAt?:Date|null;sentBy?:mongoose.Types.ObjectId|null;sentSignature?:string;
  history?:StoredHistoryEntry[];updatedAt:Date};
type AssignmentDoc={_id:mongoose.Types.ObjectId;teacher:mongoose.Types.ObjectId;classGroup:mongoose.Types.ObjectId;
  subject:{bn:string;en?:string};periodsPerWeek:number;active?:boolean;note?:string;updatedAt:Date};

/** The classes a routine can be written for, in the order the owner reads them. */
export async function routineClasses(language:Language):Promise<RoutineClass[]>{
  const docs=await CenterClassGroup.find({}).sort({active:-1,order:1,'name.bn':1}).limit(300).lean<ClassDoc[]>();
  return docs.map(doc=>({
    id:String(doc._id),nameBn:doc.name.bn,nameEn:doc.name.en||'',
    name:(language==='bn'?doc.name.bn:doc.name.en)||doc.name.bn,
    shift:doc.shift||'',shifts:(doc.shifts||[]).map(value=>String(value)).filter(Boolean),
    active:doc.active!==false,
  }));
}

/** One class, or null: what a page addresses with `?class=`. */
export async function routineClass(classId:string,language:Language):Promise<RoutineClass|null>{
  if(!mongoose.isValidObjectId(classId))return null;
  const doc=await CenterClassGroup.findById(classId).lean<ClassDoc|null>();
  if(!doc)return null;
  return {id:String(doc._id),nameBn:doc.name.bn,nameEn:doc.name.en||'',
    name:(language==='bn'?doc.name.bn:doc.name.en)||doc.name.bn,shift:doc.shift||'',
    shifts:(doc.shifts||[]).map(value=>String(value)).filter(Boolean),active:doc.active!==false};
}

/**
 * The shifts a class's week can be written under: every shift its card says it runs, then any shift
 * already stored in its routines.
 *
 * The class's `shifts[]` holds canonical keys while a routine stores the Bangla label behind a key, so
 * `labels` is the catalog's three words in the day's order. A legacy class with only a free `shift`
 * keeps that word exactly as it stands.
 */
export async function shiftsForClass(
  group:Pick<RoutineClass,'id'|'shift'|'shifts'>,
  labels:readonly string[],
):Promise<string[]>{
  const found=routineShiftWords(group,labels);
  if(!mongoose.isValidObjectId(group.id))return found;
  const [master,daily]=await Promise.all([
    MasterRoutine.distinct('shift',{classGroup:group.id}),
    DailyRoutine.distinct('shift',{classGroup:group.id}),
  ]);
  const all=[...found,...[...master,...daily].map(value=>String(value).trim()).filter(Boolean)];
  return [...new Set(all)];
}

/** Every teacher account, for the picker a period's teacher is chosen from. */
export async function teacherOptions():Promise<RoutineTeacher[]>{
  const docs=await User.find({role:'teacher',active:true}).sort({name:1}).limit(300).select('name').lean<UserDoc[]>();
  return docs.map(doc=>({id:String(doc._id),name:doc.name}));
}

/** Names for a set of ids, in one query — a screen never paints an id where a name belongs. */
async function namesFor(ids:string[]):Promise<Map<string,string>>{
  const unique=[...new Set(ids.filter(id=>mongoose.isValidObjectId(id)))];
  if(!unique.length)return new Map();
  const docs=await User.find({_id:{$in:unique}}).select('name').lean<UserDoc[]>();
  return new Map(docs.map(doc=>[String(doc._id),doc.name]));
}

/** The name a history entry says made the change — the operator's own, from their account. */
export async function actorName(actor:string):Promise<string>{
  if(!mongoose.isValidObjectId(String(actor??'')))return '';
  return (await namesFor([String(actor)])).get(String(actor))||'';
}

const live=(period:StoredPeriod):boolean=>!(period.deletedAt instanceof Date);

function viewOf(period:StoredPeriod,teacherNames:Map<string,string>):PeriodView{
  const teacherId=period.teacher?String(period.teacher):'';
  return {
    id:String(period._id),start:period.start,end:period.end,
    subjectBn:period.subject?.bn||'',subjectEn:period.subject?.en||'',
    teacherId,teacherName:teacherNames.get(teacherId)||'',
    room:period.room||'',jointWith:period.jointWith?String(period.jointWith):'',
    order:Number(period.order)||0,note:period.note||'',
  };
}

/** The order a day reads in: by start time, then the owner's own order, then the subject. */
function byDay(a:PeriodView,b:PeriodView):number{
  const minutes=(value:string):number=>Number(value.slice(0,2))*60+Number(value.slice(3,5));
  return minutes(a.start)-minutes(b.start)||a.order-b.order||a.subjectBn.localeCompare(b.subjectBn);
}

/** A stored period as the comparison in `day.ts` reads it. */
export function shapeOf(period:PeriodView):PeriodShape{
  return {start:period.start,end:period.end,subjectBn:period.subjectBn,subjectEn:period.subjectEn,
    teacher:period.teacherId,room:period.room,jointWith:period.jointWith,order:period.order,note:period.note};
}

/**
 * The seven days of one class's week, empty columns included.
 *
 * Binned periods are counted but not listed: a period in the bin is invisible to the grid and visible
 * to the day's ⋯ menu, which is where it comes back from.
 */
export async function masterWeek(classId:string,shift:string,language:Language):Promise<MasterDayView[]>{
  const empty=(weekday:number):MasterDayView=>({weekday,id:null,shift,active:true,periods:[],binned:0,
    history:[],updatedAt:''});
  if(!mongoose.isValidObjectId(classId))return Array.from({length:7},(_,index)=>empty(index));
  const docs=await MasterRoutine.find({classGroup:classId,shift}).lean<MasterDoc[]>();
  const byWeekday=new Map(docs.map(doc=>[doc.weekday,doc]));
  const teacherNames=await namesFor(docs.flatMap(doc=>doc.periods.filter(live).map(period=>String(period.teacher||''))));
  return Array.from({length:7},(_,weekday)=>{
    const doc=byWeekday.get(weekday);
    if(!doc)return empty(weekday);
    const periods=doc.periods.filter(live).map(period=>viewOf(period,teacherNames)).sort(byDay);
    return {weekday,id:String(doc._id),shift:doc.shift,active:doc.active!==false,periods,
      binned:doc.periods.length-periods.length,history:historyViews(doc.history),
      updatedAt:doc.updatedAt.toISOString()};
  });
}

/**
 * Every period the centre has written for one weekday, as the clash check reads it — across classes,
 * because a teacher double-booked is only visible from the class they were double-booked *out of*.
 * `excludeClass` drops one class's own slots, which is how the daily sheet avoids arguing with the
 * master day it is standing in for.
 */
export async function centreSlots(weekday:number,opts:{excludeClass?:string;excludeDailyClass?:string;date?:string}={}):Promise<RoutineSlot[]>{
  const filter:Record<string,unknown>={weekday};
  if(opts.excludeClass&&mongoose.isValidObjectId(opts.excludeClass))filter.classGroup={$ne:opts.excludeClass};
  const docs=await MasterRoutine.find(filter).lean<MasterDoc[]>();
  const classes=await CenterClassGroup.find({_id:{$in:docs.map(doc=>doc.classGroup)}}).lean<ClassDoc[]>();
  const className=new Map(classes.map(doc=>[String(doc._id),(doc.name.bn||'').trim()]));
  const teacherNames=await namesFor(docs.flatMap(doc=>doc.periods.filter(live).map(period=>String(period.teacher||''))));
  const slots:RoutineSlot[]=docs.flatMap(doc=>doc.periods.filter(live).map(period=>{
    const view=viewOf(period,teacherNames);
    return {periodId:view.id,classId:String(doc.classGroup),weekday:doc.weekday,start:view.start,
      end:view.end,teacher:view.teacherId,room:view.room,
      className:className.get(String(doc.classGroup))||'',subject:view.subjectBn,
      teacherName:view.teacherName};
  }));
  /* Other classes' working sheets for the same date are part of the day too: a substitute written into
     Tuesday's sheet is a real person in a real room on Tuesday. */
  if(opts.date){
    const dailyFilter:Record<string,unknown>={date:opts.date};
    if(opts.excludeDailyClass&&mongoose.isValidObjectId(opts.excludeDailyClass))dailyFilter.classGroup={$ne:opts.excludeDailyClass};
    const sheets=await DailyRoutine.find(dailyFilter).lean<DailyDoc[]>();
    const sheetClasses=await CenterClassGroup.find({_id:{$in:sheets.map(sheet=>sheet.classGroup)}}).lean<ClassDoc[]>();
    const sheetName=new Map(sheetClasses.map(doc=>[String(doc._id),(doc.name.bn||'').trim()]));
    const sheetTeachers=await namesFor(sheets.flatMap(sheet=>sheet.periods.filter(live).map(period=>String(period.teacher||''))));
    for(const sheet of sheets){
      for(const period of sheet.periods.filter(live)){
        const view=viewOf(period,sheetTeachers);
        slots.push({periodId:view.id,classId:String(sheet.classGroup),weekday:weekdayOf(sheet.date),
          start:view.start,end:view.end,
          teacher:view.teacherId,room:view.room,className:sheetName.get(String(sheet.classGroup))||'',
          subject:view.subjectBn,teacherName:view.teacherName});
      }
    }
  }
  return slots;
}

/**
 * The whole week the centre has written, in one read.
 *
 * The banner on the master page and the joint-session picker both need every class's periods, and
 * asking one weekday at a time is seven round trips for one list. Class and teacher names are resolved
 * once for the whole week, so a clash line can name the person and the class it landed on.
 */
export async function centreWeek():Promise<RoutineSlot[]>{
  const docs=await MasterRoutine.find({}).limit(2000).lean<MasterDoc[]>();
  const classes=await CenterClassGroup.find({_id:{$in:docs.map(doc=>doc.classGroup)}}).lean<ClassDoc[]>();
  const className=new Map(classes.map(doc=>[String(doc._id),(doc.name.bn||'').trim()]));
  const teacherNames=await namesFor(docs.flatMap(doc=>doc.periods.filter(live).map(period=>String(period.teacher||''))));
  return docs.flatMap(doc=>doc.periods.filter(live).map(period=>{
    const view=viewOf(period,teacherNames);
    return {periodId:view.id,classId:String(doc.classGroup),weekday:doc.weekday,start:view.start,
      end:view.end,teacher:view.teacherId,room:view.room,
      className:className.get(String(doc.classGroup))||'',subject:view.subjectBn,
      teacherName:view.teacherName};
  }));
}

/** The joint-session choices for every weekday of the week, from one read of it. */
export function jointOptionsForWeek(slots:RoutineSlot[]):{weekday:number;options:{id:string;label:string}[]}[]{
  return Array.from({length:7},(_,weekday)=>({
    weekday,
    options:slots.filter(slot=>slot.weekday===weekday&&slot.periodId)
      .sort((a,b)=>a.start.localeCompare(b.start)||String(a.className||'').localeCompare(String(b.className||'')))
      .map(slot=>({id:String(slot.periodId),
        label:[`${slot.start}–${slot.end}`,slot.className,slot.subject].filter(Boolean).join(' · ')})),
  }));
}

/**
 * The periods the centre already runs on one weekday, for the joint-session picker: a period is joined
 * to another period, so the choice is a list of real ones, labelled with the time, the class and the
 * subject — never a key the owner has to invent.
 */
export async function jointOptions(weekday:number):Promise<{id:string;label:string}[]>{
  const slots=await centreSlots(weekday);
  const seen=new Set<string>();
  const out:{id:string;label:string}[]=[];
  for(const slot of [...slots].sort((a,b)=>a.start.localeCompare(b.start)||String(a.className||'').localeCompare(String(b.className||'')))){
    if(!slot.periodId||seen.has(slot.periodId))continue;
    seen.add(slot.periodId);
    out.push({id:slot.periodId,
      label:[`${slot.start}–${slot.end}`,slot.className,slot.subject].filter(Boolean).join(' · ')});
  }
  return out;
}

/**
 * One date's working sheet, merged with the master day it starts from.
 *
 * Returns `null` only when the class or the date is not real; a day with nothing written is a sheet
 * full of the master's periods and `stored:false`, which is the honest empty state.
 */
export async function dailySheet(classId:string,shift:string,date:string,language:Language):Promise<DailySheetView|null>{
  const group=await routineClass(classId,language);
  if(!group||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
  const weekday=weekdayOf(date);
  const [week,doc]=await Promise.all([
    masterWeek(classId,shift,language),
    DailyRoutine.findOne({date,classGroup:classId,shift}).lean<DailyDoc|null>(),
  ]);
  const masterDay=week.find(day=>day.weekday===weekday);
  const masterPeriods=masterDay?.periods||[];
  const teacherNames=await namesFor([...(doc?.periods||[]).filter(live).map(period=>String(period.teacher||'')),
    ...(doc?.sentBy?[String(doc.sentBy)]:[])]);
  const periods:DailyPeriodView[]=(doc?doc.periods.filter(live).map(period=>{
    const view=viewOf(period,teacherNames);
    return {...view,source:(period.source==='master'?'master':'own') as 'master'|'own',
      masterPeriod:period.masterPeriod?String(period.masterPeriod):''};
  }):masterPeriods.map(view=>({...view,source:'master' as const,masterPeriod:view.id}))).sort(byDay);
  const status:DayStatus=doc?.status||'normal';
  const sentAt=doc?.sentAt instanceof Date?doc.sentAt:null;
  return {
    date,weekday,classId,className:group.name,shift,
    stored:!!doc,docId:doc?String(doc._id):null,
    status,holidayReason:doc?.holidayReason||'',notes:doc?.notes||'',
    periods,masterPeriods,
    sent:!!sentAt,sentAt:sentAt?sentAt.toISOString():null,
    sentByName:doc?.sentBy?teacherNames.get(String(doc.sentBy))||'':'',
    changedSinceSent:changedSinceSent({status,notes:doc?.notes||'',
      holidayReason:doc?.holidayReason||'',periods:periods.map(shapeOf)},doc?.sentSignature||''),
    passed:hasPassed(date),
    signature:daySignature(periods.map(shapeOf)),
    history:historyViews(doc?.history),
  };
}

/** The teaching assignments: the standing answer to who takes what, and how often. */
export async function assignments(language:Language,classId?:string):Promise<AssignmentView[]>{
  const filter:Record<string,unknown>=classId&&mongoose.isValidObjectId(classId)?{classGroup:classId}:{};
  const docs=await TeachingAssignment.find(filter).sort({active:-1,'subject.bn':1}).limit(300).lean<AssignmentDoc[]>();
  const [teachers,classes]=await Promise.all([
    namesFor(docs.map(doc=>String(doc.teacher))),
    CenterClassGroup.find({_id:{$in:docs.map(doc=>doc.classGroup)}}).lean<ClassDoc[]>(),
  ]);
  const className=new Map(classes.map(doc=>[String(doc._id),(language==='bn'?doc.name.bn:doc.name.en)||doc.name.bn]));
  return docs.map(doc=>({
    id:String(doc._id),teacherId:String(doc.teacher),teacherName:teachers.get(String(doc.teacher))||'',
    subjectBn:doc.subject?.bn||'',subjectEn:doc.subject?.en||'',
    classId:String(doc.classGroup),className:className.get(String(doc.classGroup))||'',
    periodsPerWeek:Number(doc.periodsPerWeek)||0,active:doc.active!==false,note:doc.note||'',
    updatedAt:doc.updatedAt.toISOString(),
  }));
}

/** The shifts already written anywhere, so a day's editor offers them rather than asking for a typo. */
export async function knownShifts():Promise<string[]>{
  const values=await MasterRoutine.distinct('shift');
  return [...new Set(values.map(value=>String(value).trim()).filter(Boolean))].sort();
}

/** A room is a room however it is spelled; this is the fold the clash check uses, exposed for a picker. */
export async function knownRooms():Promise<string[]>{
  const docs=await MasterRoutine.find({}).select('periods.room').limit(500).lean<{periods:StoredPeriod[]}[]>();
  const rooms=new Set<string>();
  for(const doc of docs)for(const period of doc.periods||[]){
    const room=String(period.room||'').trim();
    if(room)rooms.add(room);
  }
  return [...rooms].sort((a,b)=>roomKey(a).localeCompare(roomKey(b)));
}

/* ------------------------------------------------------- the day as one person, or as one notice, reads it */

/** The dates a teacher's schedule covers: Dhaka's today, and the six days after it. */
export function scheduleDates(now:Date=new Date()):string[]{
  const today=dhakaDay(now);
  return Array.from({length:7},(_,index)=>shiftDate(today,index));
}

const classNames=(docs:{classGroup:mongoose.Types.ObjectId}[],language:Language):Promise<Map<string,string>>=>
  CenterClassGroup.find({_id:{$in:docs.map(doc=>doc.classGroup)}}).lean<ClassDoc[]>()
    .then(found=>new Map(found.map(doc=>[String(doc._id),
      (language==='bn'?doc.name.bn:doc.name.en)||doc.name.bn||''])));

/**
 * One teacher's own timetable: today, then the week ahead.
 *
 * A date's working sheet speaks for its class on that date and the week does not — that is the whole
 * split this collection exists for — so a teacher who has been replaced on Tuesday sees Tuesday as the
 * sheet says it is, and Wednesday as the week says it is. Periods in a bin are not part of any day.
 */
export async function teacherSchedule(teacherId:string,language:Language,now:Date=new Date()):Promise<TeacherSchedule|null>{
  if(!mongoose.isValidObjectId(String(teacherId??'')))return null;
  const dates=scheduleDates(now);
  const weekdays=[...new Set(dates.map(date=>weekdayOf(date)))];
  const [masters,sheets]=await Promise.all([
    MasterRoutine.find({weekday:{$in:weekdays}}).lean<MasterDoc[]>(),
    DailyRoutine.find({date:{$in:dates}}).lean<DailyDoc[]>(),
  ]);
  const names=await classNames([...masters,...sheets],language);
  const wanted=String(teacherId).toLowerCase();
  const held=new Set(sheets.map(sheet=>[sheet.date,String(sheet.classGroup),sheet.shift].join('~')));
  const days:TeacherDay[]=dates.map(date=>{
    const weekday=weekdayOf(date);
    const rows:TeacherRow[]=[];
    const push=(period:StoredPeriod,shift:string,classId:string,daily:boolean):void=>{
      if(String(period.teacher||'').toLowerCase()!==wanted)return;
      rows.push({start:period.start,end:period.end,classId,
        className:names.get(classId)||'',shift,room:period.room||'',
        subjectBn:period.subject?.bn||'',subjectEn:period.subject?.en||'',daily});
    };
    for(const doc of masters){
      if(doc.weekday!==weekday||doc.active===false)continue;
      const classId=String(doc.classGroup);
      /* The sheet for this class, shift and date has the last word, so the week stays quiet about it. */
      if(held.has([date,classId,doc.shift].join('~')))continue;
      for(const period of doc.periods.filter(live))push(period,doc.shift,classId,false);
    }
    for(const sheet of sheets){
      if(sheet.date!==date)continue;
      const classId=String(sheet.classGroup);
      for(const period of sheet.periods.filter(live))push(period,sheet.shift,classId,true);
    }
    rows.sort((a,b)=>a.start.localeCompare(b.start)||a.className.localeCompare(b.className));
    return {date,weekday,rows};
  });
  return {today:days[0]||{date:dates[0]||'',weekday:0,rows:[]},week:days};
}

/**
 * The day's routine across every class: the bulletin-board notice.
 *
 * Same rule as a teacher's own day — a date's sheet speaks for its class, the week speaks where no sheet
 * does — so one printed sheet is what actually runs, holidays and their reasons included, for every class
 * and shift the centre wrote.
 */
export async function printNotice(date:string,language:Language):Promise<DayNotice|null>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
  const weekday=weekdayOf(date);
  const [masters,sheets,groups]=await Promise.all([
    MasterRoutine.find({weekday}).lean<MasterDoc[]>(),
    DailyRoutine.find({date}).lean<DailyDoc[]>(),
    routineClasses(language),
  ]);
  const teacherNames=await namesFor([...masters,...sheets]
    .flatMap(doc=>doc.periods.filter(live).map(period=>String(period.teacher||''))));
  const nameOf=new Map(groups.map(group=>[group.id,group.name]));
  const held=new Set(sheets.map(sheet=>[String(sheet.classGroup),sheet.shift].join('~')));
  const notices=new Map<string,NoticeClass>();
  for(const doc of masters){
    const classId=String(doc.classGroup);
    const key=[classId,doc.shift].join('~');
    if(doc.active===false||held.has(key))continue;
    notices.set(key,{classId,className:nameOf.get(classId)||'',shift:doc.shift,status:'normal',
      holidayReason:'',notes:'',stored:false,
      periods:doc.periods.filter(live).map(period=>viewOf(period,teacherNames)).sort(byDay)});
  }
  for(const sheet of sheets){
    const classId=String(sheet.classGroup);
    notices.set([classId,sheet.shift].join('~'),{classId,className:nameOf.get(classId)||'',shift:sheet.shift,
      status:sheet.status||'normal',holidayReason:sheet.holidayReason||'',notes:sheet.notes||'',stored:true,
      periods:sheet.periods.filter(live).map(period=>viewOf(period,teacherNames)).sort(byDay)});
  }
  const order=new Map(groups.map((group,index)=>[group.id,index]));
  const classes=[...notices.values()].sort((a,b)=>
    (order.get(a.classId)??Number.MAX_SAFE_INTEGER)-(order.get(b.classId)??Number.MAX_SAFE_INTEGER)
    ||a.shift.localeCompare(b.shift));
  return {date,weekday,classes};
}
