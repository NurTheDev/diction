/**
 * Where a send gets its recipients from (R2).
 *
 * One resolver for every entry point — the due list, a student profile, a bulk selection on the
 * student list, a payment receipt and the SMS page's own "new message" — so the dialog, the preview
 * endpoint and the daily auto-send job all build candidates the same way. It returns plain objects;
 * every rule about who may actually be contacted stays in sms-recipients.ts and is not repeated here.
 *
 * Two separate notions of month, because they answer different questions:
 *   • `monthLabel` is what the message says ("মার্চ", "জানুয়ারি–মার্চ ২০২৬") — Bangla prose with
 *     Bangla digits, matching the Bangla template bodies it is substituted into;
 *   • `monthKey` is the YYYY-MM key stored on the log rows, which is what the 24-hour
 *     "same template/student/month already sent" warning compares. Feeding it prose would silently
 *     disable the warning.
 *
 * Money is never calculated here. Dues come from liveClassDues() — the same live calculation the due
 * list and the CSV export show — so a reminder can never disagree with the screen the operator read.
 */
import 'server-only';
import mongoose from 'mongoose';
import {CenterClassGroup,CenterSettings,CenterStudent} from '@/models/CenterRecords';
import {formatDate,formatNumber} from '@/lib/admin/format';
import {dhakaCalendar} from './month-status';
import {liveClassDues} from './dues-query';
import type {SmsCandidateStudent,SmsHoldPeriod} from './sms-recipients';
import type {SmsVariable} from './sms-templates';

export type SmsSource='dues'|'class'|'students'|'student'|'receipt';

const MONTHS_BN=['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
/** A hard ceiling: one dialog send is bounded. A whole-school send goes class by class. */
export const SMS_SOURCE_LIMIT=1000;
const SELECTION='name studentId status smsOptOut guardianPhone studentPhone altPhone holds classGroup';

const bn=(value:number|string):string=>formatNumber(Number(value),'bn');

type YearMonth={year:number;month:number};

/** "মার্চ" for this year, "মার্চ ২০২৫" for an older one, "জানুয়ারি–মার্চ ২০২৫" for a range. */
export function monthLabel(months:YearMonth[],now=new Date()):string{
  if(!months.length)return '';
  const sorted=[...months].sort((a,b)=>a.year*12+a.month-(b.year*12+b.month));
  const thisYear=dhakaCalendar(now).year;
  const name=(item:YearMonth)=>MONTHS_BN[item.month-1];
  if(sorted.length===1){
    const only=sorted[0];
    return only.year===thisYear?name(only):`${name(only)} ${bn(only.year)}`;
  }
  const first=sorted[0],last=sorted[sorted.length-1];
  const span=first.year===last.year
    ?`${name(first)}–${name(last)}`
    :`${name(first)} ${bn(first.year)}–${name(last)}`;
  return last.year===thisYear?span:`${span} ${bn(last.year)}`;
}

export function monthKey(months:YearMonth[],now=new Date()):string{
  if(!months.length){const today=dhakaCalendar(now);return `${today.year}-${String(today.month).padStart(2,'0')}`}
  const sorted=[...months].sort((a,b)=>a.year*12+a.month-(b.year*12+b.month));
  return `${sorted[0].year}-${String(sorted[0].month).padStart(2,'0')}`;
}

type StudentDoc={
  _id:mongoose.Types.ObjectId;name:{bn:string;en?:string};studentId:string;status:'active'|'on_hold'|'removed';
  smsOptOut?:boolean;guardianPhone?:string;studentPhone?:string;altPhone?:string;
  holds?:{start:YearMonth;end?:YearMonth|null}[];classGroup?:mongoose.Types.ObjectId;
};

function candidate(doc:StudentDoc,values:Partial<Record<SmsVariable,string|number|null>>):SmsCandidateStudent{
  const holds:SmsHoldPeriod[]=(doc.holds||[]).map(hold=>({start:hold.start,end:hold.end??null}));
  return {
    id:String(doc._id),
    nameBn:doc.name.bn,
    status:doc.status,
    smsOptOut:doc.smsOptOut===true,
    guardianPhone:doc.guardianPhone||'',
    studentPhone:doc.studentPhone||'',
    altPhone:doc.altPhone||'',
    holds,
    values,
  };
}

export interface SmsSourceResult{candidates:SmsCandidateStudent[];className:string;monthKey:string;monthLabel:string}

/**
 * Fee values for a set of student documents, from each student's own live dues. A due reminder sent
 * from a profile or a bulk selection therefore quotes the same amount the due list shows. Students
 * with nothing owed simply have no {due_amount}: the plan reports them as skipped with a reason
 * instead of sending a message with a hole in it.
 */
async function withFeeValues(docs:StudentDoc[],now:Date):Promise<SmsCandidateStudent[]>{
  const names=await classNames([...new Set(docs.map(doc=>String(doc.classGroup||'')).filter(Boolean))]);
  const groups=[...new Set(docs.map(doc=>String(doc.classGroup||'')).filter(id=>mongoose.isValidObjectId(id)))];
  const duesByStudent=new Map<string,{months:YearMonth[];total:number}>();
  for(const group of groups){
    try{
      const dues=await liveClassDues(group,now);
      for(const row of dues.rows)duesByStudent.set(String(row.student._id),{months:row.months,total:row.total});
    }catch{
      // A class too big to price live must not block a notice or a thank-you message.
    }
  }
  return docs.map(doc=>{
    const due=duesByStudent.get(String(doc._id));
    return candidate(doc,{
      class:names.get(String(doc.classGroup))||'',
      ...(due?{month:monthLabel(due.months,now),due_amount:bn(due.total)}:{}),
    });
  });
}

const EMPTY:SmsSourceResult={candidates:[],className:'',monthKey:'',monthLabel:''};

async function classNames(ids:string[]):Promise<Map<string,string>>{
  const valid=ids.filter(id=>mongoose.isValidObjectId(id));
  if(!valid.length)return new Map();
  const rows=await CenterClassGroup.find({_id:{$in:valid}}).select('name').lean<{_id:mongoose.Types.ObjectId;name:{bn:string}}[]>();
  return new Map(rows.map(row=>[String(row._id),row.name.bn]));
}

/** The overdue list of one class — DUE only, exactly what the due list on screen shows. */
export async function candidatesFromDues(classGroup:string,now=new Date()):Promise<SmsSourceResult>{
  if(!mongoose.isValidObjectId(classGroup))throw Error('INVALID_CLASS');
  const [group,dues]=await Promise.all([
    CenterClassGroup.findById(classGroup).select('name').lean<{name:{bn:string;en?:string}}|null>(),
    liveClassDues(classGroup,now),
  ]);
  const className=group?.name.bn||'';
  const allMonths=[...new Set(dues.rows.flatMap(row=>row.months.map(item=>`${item.year}-${item.month}`)))].map(key=>{
    const [year,month]=key.split('-').map(Number);
    return {year,month};
  });
  const [docs,dueDayRow]=await Promise.all([
    CenterStudent.find({_id:{$in:dues.rows.map(row=>row.student._id)}}).select(SELECTION).lean<StudentDoc[]>(),
    CenterSettings.findOne({key:'main'}).select('dueDay').lean<{dueDay?:number}|null>(),
  ]);
  const byId=new Map(docs.map(doc=>[String(doc._id),doc]));
  // {due_date} is the class's payment day this month: the date an overdue reminder asks for.
  const today=dhakaCalendar(now);
  const dueDay=Math.min(Number(dueDayRow?.dueDay)||10,28);
  const dueDate=formatDate(new Date(`${today.year}-${String(today.month).padStart(2,'0')}-${String(dueDay).padStart(2,'0')}T00:00:00+06:00`),'bn','bn');
  const candidates=dues.rows.flatMap(row=>{
    const doc=byId.get(String(row.student._id));
    if(!doc)return [];
    return [candidate(doc,{class:className,month:monthLabel(row.months,now),due_amount:bn(row.total),due_date:dueDate})];
  });
  return {candidates,className,monthKey:monthKey(allMonths,now),monthLabel:monthLabel(allMonths,now)};
}

/**
 * An explicit selection — the student list's bulk action or one profile. Fee values are attached from
 * each student's own live dues, so a due reminder sent from a profile says the same amount as the due
 * list. Students with nothing owed simply have no {due_amount}, which the plan reports as a skip with
 * a reason rather than sending a message with a hole in it.
 */
export async function candidatesFromIds(ids:string[],now=new Date()):Promise<SmsSourceResult>{
  const valid=[...new Set(ids.filter(id=>mongoose.isValidObjectId(id)))].slice(0,SMS_SOURCE_LIMIT);
  if(!valid.length)return EMPTY;
  const docs=await CenterStudent.find({_id:{$in:valid}}).select(SELECTION).lean<StudentDoc[]>();
  return finish(docs,now);
}

/**
 * Every current student of one class — the SMS page's "new message" and a notice or result send.
 * Removed students are never included; `on_hold` students are, because a notice is not a fee message
 * and sms-recipients.ts is what excludes them from fee templates.
 */
export async function candidatesFromClass(classGroup:string,now=new Date()):Promise<SmsSourceResult>{
  if(!mongoose.isValidObjectId(classGroup))throw Error('INVALID_CLASS');
  const docs=await CenterStudent.find({classGroup:new mongoose.Types.ObjectId(classGroup),status:{$ne:'removed'}})
    .select(SELECTION).sort({'name.bn':1,_id:1}).limit(SMS_SOURCE_LIMIT).lean<StudentDoc[]>();
  return finish(docs,now);
}

async function finish(docs:StudentDoc[],now:Date):Promise<SmsSourceResult>{
  const candidates=await withFeeValues(docs,now);
  const groups=[...new Set(docs.map(doc=>String(doc.classGroup||'')).filter(id=>mongoose.isValidObjectId(id)))];
  const names=await classNames(groups);
  const today=dhakaCalendar(now);
  return {
    candidates,
    className:groups.length===1?names.get(groups[0])||'':'',
    monthKey:monthKey([],now),
    monthLabel:monthLabel([{year:today.year,month:today.month}],now),
  };
}

/** One payment receipt: amount, month and receipt number come from the payment just recorded. */
export async function candidatesFromReceipt(input:{student:string;amount:number;month:YearMonth;receiptNo:string;dueDate?:string},now=new Date()):Promise<SmsSourceResult>{
  if(!mongoose.isValidObjectId(input.student))throw Error('INVALID_STUDENT');
  const doc=await CenterStudent.findById(input.student).select(SELECTION).lean<StudentDoc|null>();
  if(!doc)return EMPTY;
  const names=await classNames([String(doc.classGroup||'')]);
  const className=names.get(String(doc.classGroup))||'';
  const label=monthLabel([input.month],now);
  return {
    candidates:[candidate(doc,{
      class:className,
      amount:bn(input.amount),
      month:label,
      receipt_no:input.receiptNo,
      due_date:input.dueDate||formatDate(new Date(`${monthKey([input.month],now)}-10T00:00:00+06:00`),'bn','bn'),
    })],
    className,
    monthKey:monthKey([input.month],now),
    monthLabel:label,
  };
}

/** Route a source request to its resolver. An unknown source resolves to nobody, never to everybody. */
export async function resolveSmsSource(request:{
  source:SmsSource;classGroup?:string;ids?:string[];id?:string;
  receipt?:{student:string;amount:number;month:YearMonth;receiptNo:string;dueDate?:string};
},now=new Date()):Promise<SmsSourceResult>{
  if(request.source==='dues')return candidatesFromDues(String(request.classGroup||''),now);
  if(request.source==='class')return candidatesFromClass(String(request.classGroup||''),now);
  if(request.source==='receipt'&&request.receipt)return candidatesFromReceipt(request.receipt,now);
  if(request.source==='student'&&request.id)return candidatesFromIds([request.id],now);
  if(request.source==='students'&&request.ids?.length)return candidatesFromIds(request.ids,now);
  return EMPTY;
}
