import 'server-only';
/**
 * Automatic-SMS problems (R2 follow-up).
 *
 * The three automatic sends are best-effort ON PURPOSE: a receipt message that cannot go out must
 * never turn a saved payment into an error, and a result message must never unpublish an exam. That
 * is the right behaviour at the call site and the wrong behaviour for the operator, because a failure
 * that is only a `console.error` line on a serverless host is a failure nobody ever sees — the toggle
 * looks on, the money is spent on nothing, and the guardian simply never gets the message.
 *
 * So every automatic send that does not go out is stored here, in the operator's language, with the
 * context needed to run it again. This module owns the vocabulary and the storage; the retry itself
 * lives in sms-dialog.ts, next to the three functions it re-runs (that keeps the import one-way).
 *
 * Nothing in here may throw. A problem record is a courtesy: if the database is the thing that is
 * broken, recording must fail quietly rather than add a second failure to the first.
 */
import {createHash} from 'node:crypto';
import mongoose from 'mongoose';
import {CenterSmsAutoProblem} from '@/models/CenterRecords';
import {redactSmsSecrets,smsCodeMessage} from './sms-provider';

/** Which automatic send failed. The same three names the batch's `trigger` field uses. */
export type AutoSmsTrigger='auto_receipt'|'auto_due'|'auto_result';

/**
 * What has to be run again. Deliberately flat and JSON-serializable: it is stored as text, so a
 * retry after a redeploy still knows exactly what it was trying to do.
 */
export type AutoSmsContext=
  |{trigger:'auto_receipt';student:string;amount:number;year:number;month:number;receiptNo:string}
  |{trigger:'auto_due';classGroup:string;day:string}
  |{trigger:'auto_result';exam:string;classGroup:string};

/** The trigger names an operator reads, in one place so no screen can drift from another. */
export const AUTO_SMS_TRIGGER_LABELS:Record<AutoSmsTrigger,{bn:string;en:string}>={
  auto_receipt:{bn:'স্বয়ংক্রিয় পেমেন্ট রসিদ',en:'Automatic payment receipt'},
  auto_due:{bn:'স্বয়ংক্রিয় বকেয়া স্মারক',en:'Automatic due reminder'},
  auto_result:{bn:'স্বয়ংক্রিয় পরীক্ষার ফলাফল',en:'Automatic exam result'},
};

export function autoSmsTriggerLabel(trigger:string):{bn:string;en:string}{
  return AUTO_SMS_TRIGGER_LABELS[trigger as AutoSmsTrigger]||{bn:'স্বয়ংক্রিয় এসএমএস',en:'Automatic SMS'};
}

/** Anything the auto-sends can hand us: an Error, a reason string, or a provider code. */
export type AutoSmsCause=Error|string|{code?:string;reason?:string;message?:string;paths?:string[]}|null|undefined;

function causeText(cause:AutoSmsCause):string{
  if(!cause)return '';
  if(typeof cause==='string')return cause;
  if(cause instanceof Error){
    const paths=(cause as Error&{paths?:string[]}).paths;
    return paths&&paths.length?`${cause.message}: ${paths.join(', ')}`:cause.message;
  }
  return String(cause.code||cause.reason||cause.message||'');
}

export interface AutoSmsProblemText{messageBn:string;messageEn:string;code:string}

/**
 * One plain sentence in Bangla per known cause. The operator is not a developer: "SMS_NOT_CONFIGURED"
 * is a fact about the environment they can act on, and a provider code already has an official Bangla
 * meaning in the provider's own table, so that table is reused rather than paraphrased.
 * Anything unknown is shown as an unexpected problem with the redacted message, never a stack trace
 * and never a credential.
 */
export function autoProblemText(trigger:AutoSmsTrigger,cause:AutoSmsCause):AutoSmsProblemText{
  const what=AUTO_SMS_TRIGGER_LABELS[trigger];
  const raw=redactSmsSecrets(causeText(cause)).slice(0,200);
  const prefix={bn:`${what.bn} পাঠানো যায়নি। `,en:`The ${what.en.toLowerCase()} did not go out. `};
  const out=(messageBn:string,messageEn:string,code=''):AutoSmsProblemText=>({
    messageBn:`${prefix.bn}${messageBn}`,messageEn:`${prefix.en}${messageEn}`,code,
  });

  if(/SMS_NOT_CONFIGURED/i.test(raw))return out(
    'প্রদানকারীর তথ্য সেট করা হয়নি — SMS_PROVIDER, BULKSMSBD_API_KEY ও BULKSMSBD_SENDER_ID দেখুন।',
    'The provider is not configured — check SMS_PROVIDER, BULKSMSBD_API_KEY and BULKSMSBD_SENDER_ID.',
    'SMS_NOT_CONFIGURED');
  if(/SMS_DISABLED/i.test(raw))return out(
    'পাঠানোর গেট বন্ধ — CENTER_SMS_WRITE_ENABLED=true নয়।',
    'The sending gate is closed — CENTER_SMS_WRITE_ENABLED is not "true".',
    'SMS_DISABLED');
  if(/SMS_INVALID/i.test(raw))return out(
    'নম্বর বা বার্তাটি গ্রহণযোগ্য নয়।',
    'The number or the message was not acceptable.',
    'SMS_INVALID');
  if(/EMPTY_MESSAGE/i.test(raw))return out(
    'বার্তার লেখা খালি।',
    'The message body is empty.',
    'EMPTY_MESSAGE');
  const chip=raw.match(/UNRENDERED_VARIABLE:(\{?\w+\}?)/i);
  if(chip)return out(
    `বার্তায় ${chip[1]} এর কোনো মান নেই — পাঠানো হলে লেখাটি ফাঁকা থেকে যেত।`,
    `${chip[1]} has no value, so the message would have gone out with a hole in it.`,
    'UNRENDERED_VARIABLE');
  if(/TEMPLATE_NOT_FOUND/i.test(raw))return out(
    'টেমপ্লেটটি পাওয়া যায়নি।',
    'The template could not be found.',
    'TEMPLATE_NOT_FOUND');
  if(/NO_RECIPIENTS|no recipient/i.test(raw))return out(
    'পাঠানোর মতো কোনো নম্বর নেই — অভিভাবকের নম্বরটি যোগ করুন।',
    'There is no number to send to — add the guardian’s number.',
    'NO_RECIPIENTS');
  if(/TOO_MANY_STUDENTS/i.test(raw))return out(
    'ক্লাসটি একসাথে হিসাব করার মতো অবস্থায় নেই।',
    'The class could not be priced live.',
    'TOO_MANY_STUDENTS');
  if(/INVALID_STUDENT/i.test(raw))return out('শিক্ষার্থীটি পাওয়া যায়নি।','The student could not be found.','INVALID_STUDENT');
  if(/INVALID_CLASS/i.test(raw))return out('ক্লাসটি পাওয়া যায়নি।','The class could not be found.','INVALID_CLASS');
  if(/validation failed|ValidationError/i.test(raw))return out(
    `ডাটাবেসে সংরক্ষণ করা যায়নি (${raw.split(':').pop()?.trim().slice(0,60)||'তথ্য অসম্পূর্ণ'})।`,
    `It could not be stored (${raw.slice(0,120)}).`,
    'VALIDATION');
  const code=raw.match(/\b(1\d{3}|202)\b/);
  // The provider publishes one official meaning per code, already in Bangla, so that table is reused
  // rather than paraphrased; the English line names the code and quotes it.
  if(code)return out(
    `${smsCodeMessage(code[1])} (কোড ${code[1]})।`,
    `The provider answered ${code[1]}: ${smsCodeMessage(code[1])}`,
    code[1]);
  if(/fetch failed|network|timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|abort/i.test(raw))return out(
    'নেটওয়ার্ক সমস্যায় পাঠানো যায়নি। আবার চেষ্টা করুন।',
    'A network problem stopped it. Try again.',
    'NETWORK');
  if(/balance/i.test(raw))return out(
    'ব্যালান্স জানা যায়নি, তাই পাঠানো হয়নি।',
    'The balance could not be read, so nothing was sent.',
    'BALANCE');
  if(!raw)return out('কারণ জানা যায়নি।','The cause is unknown.','');
  return out(
    `অপ্রত্যাশিত সমস্যা: ${raw.slice(0,120)}`,
    `Unexpected problem: ${raw.slice(0,120)}`,
    'UNEXPECTED');
}

/** One stable key per problem, so a repeating failure is one row with a count, not a pile of rows. */
export function autoProblemKey(context:AutoSmsContext):string{
  const canonical=JSON.stringify(context,Object.keys(context).sort());
  return createHash('sha1').update(canonical).digest('hex');
}

export interface RecordAutoSmsProblemInput{
  context:AutoSmsContext;
  cause:AutoSmsCause;
  /** One line naming the receipt / class / exam, shown beside the message. */
  who?:string;
  batchId?:string;
  studentId?:string;
  classGroupId?:string;
}

/**
 * Store the failure, or fold it into the open row for the same key. Never throws: this runs inside a
 * payment save and a publish, and both must succeed whatever happens here.
 */
export async function recordAutoSmsProblem(input:RecordAutoSmsProblemInput):Promise<string>{
  try{
    const key=autoProblemKey(input.context);
    const {messageBn,messageEn,code}=autoProblemText(input.context.trigger,input.cause);
    const now=new Date();
    const patch={messageBn,messageEn,code,batch:input.batchId||undefined,lastAttemptAt:now};
    const open=await CenterSmsAutoProblem.findOne({key,resolved:false}).select('_id attempts').lean<{_id:mongoose.Types.ObjectId;attempts?:number}|null>();
    if(open){
      await CenterSmsAutoProblem.updateOne({_id:open._id},{$set:patch,$inc:{attempts:1}});
      return String(open._id);
    }
    const row=await CenterSmsAutoProblem.create({
      key,trigger:input.context.trigger,messageBn,messageEn,code,
      who:(input.who||'').slice(0,200),context:JSON.stringify(input.context).slice(0,2000),
      batch:input.batchId||undefined,
      student:input.studentId&&mongoose.isValidObjectId(input.studentId)?input.studentId:undefined,
      classGroup:input.classGroupId&&mongoose.isValidObjectId(input.classGroupId)?input.classGroupId:undefined,
      attempts:1,lastAttemptAt:now,
    });
    return String(row._id);
  }catch(error){
    // Two sends can fail at the same instant and race on the unique key; the loser folds into the
    // winner's row. Anything else is logged and dropped — the payment still stands.
    try{
      const key=autoProblemKey(input.context);
      const {messageBn,messageEn,code}=autoProblemText(input.context.trigger,input.cause);
      await CenterSmsAutoProblem.updateOne(
        {key,resolved:false},
        {$set:{messageBn,messageEn,code,lastAttemptAt:new Date()},$inc:{attempts:1}},
      );
    }catch{/* the database itself is the problem; there is nowhere left to put it */}
    console.error('Could not record an automatic SMS problem',(error as Error).message);
    return '';
  }
}

export interface AutoSmsProblemRow{
  id:string;trigger:AutoSmsTrigger;messageBn:string;messageEn:string;who:string;code:string;
  attempts:number;at:string;lastAttemptAt:string;batchId:string;studentId:string;classGroupId:string;
  context:AutoSmsContext|null;
}

function parseContext(raw:string):AutoSmsContext|null{
  try{
    const parsed=JSON.parse(raw) as AutoSmsContext;
    if(parsed&&typeof parsed==='object'&&typeof parsed.trigger==='string')return parsed;
  }catch{/* a row we cannot read is still worth showing, just not worth retrying */}
  return null;
}

/** Mongoose's `find().lean<T>()` generic types a single document, not the array — declare and cast. */
interface ProblemDoc{
  _id:mongoose.Types.ObjectId;trigger:AutoSmsTrigger;messageBn:string;messageEn:string;who?:string;
  code?:string;attempts?:number;createdAt?:Date;lastAttemptAt?:Date;batch?:mongoose.Types.ObjectId;
  student?:mongoose.Types.ObjectId;classGroup?:mongoose.Types.ObjectId;context:string;resolved?:boolean;
}

function toRow(row:ProblemDoc):AutoSmsProblemRow{
  return {
    id:String(row._id),trigger:row.trigger,messageBn:row.messageBn,messageEn:row.messageEn,
    who:row.who||'',code:row.code||'',attempts:row.attempts||1,
    at:(row.createdAt||new Date()).toISOString(),
    lastAttemptAt:(row.lastAttemptAt||row.createdAt||new Date()).toISOString(),
    batchId:row.batch?String(row.batch):'',
    studentId:row.student?String(row.student):'',
    classGroupId:row.classGroup?String(row.classGroup):'',
    context:parseContext(row.context),
  };
}

/** What the card shows: how many are open, and the most recent ones with their plain-language reason. */
export async function autoSmsProblems(limit=6):Promise<{count:number;items:AutoSmsProblemRow[]}>{
  try{
    const [count,rows]=await Promise.all([
      CenterSmsAutoProblem.countDocuments({resolved:false}),
      CenterSmsAutoProblem.find({resolved:false}).sort({lastAttemptAt:-1,createdAt:-1}).limit(limit)
        .lean() as unknown as Promise<ProblemDoc[]>,
    ]);
    return {count,items:rows.map(toRow)};
  }catch(error){
    console.error('Could not read automatic SMS problems',(error as Error).message);
    return {count:0,items:[]};
  }
}

/** One open problem, for the retry path. */
export async function findAutoSmsProblem(id:string):Promise<AutoSmsProblemRow|null>{
  if(!mongoose.isValidObjectId(id))return null;
  const row=await CenterSmsAutoProblem.findById(id).lean() as unknown as ProblemDoc|null;
  if(!row||row.resolved)return null;
  return toRow(row);
}

/** The problem is gone: the message went out, or the batch it belongs to is finished. */
export async function resolveAutoSmsProblem(id:string,actor:string,note:{bn:string;en:string}):Promise<void>{
  await CenterSmsAutoProblem.updateOne(
    {_id:id},
    {$set:{resolved:true,resolvedAt:new Date(),messageBn:note.bn,messageEn:note.en,resolvedBy:mongoose.isValidObjectId(actor)?actor:undefined}},
  ).catch(error=>console.error('Could not resolve an automatic SMS problem',(error as Error).message));
}

/** A retry that failed again: same row, one more attempt, the new reason in the operator's words. */
export async function noteAutoSmsRetryFailed(id:string,trigger:AutoSmsTrigger,cause:AutoSmsCause,batchId?:string):Promise<void>{
  const {messageBn,messageEn,code}=autoProblemText(trigger,cause);
  await CenterSmsAutoProblem.updateOne(
    {_id:id},
    {$set:{messageBn,messageEn,code,lastAttemptAt:new Date(),batch:batchId||undefined},$inc:{attempts:1}},
  ).catch(error=>console.error('Could not update an automatic SMS problem',(error as Error).message));
}
