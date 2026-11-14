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
import bnMessages from '@/messages/bn.json';
import enMessages from '@/messages/en.json';

/** One catalog sentence rendered in both languages: a stored problem row keeps the pair. */
function smsPair(key:string,params:Record<string,string|number>={}):{messageBn:string;messageEn:string}{
  const fill=(template:string):string=>String(template).replace(/\{(\w+)\}/g,(whole,name)=>(name in params?String(params[name]):whole));
  const at=(catalog:unknown):string=>fill(String(key.split('.').reduce<unknown>((node,part)=>((node||{}) as Record<string,unknown>)[part],catalog)??key));
  return {messageBn:at(bnMessages.sms),messageEn:at(enMessages.sms)};
}


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
/** Trigger names as catalog keys, so every screen reads them in the operator's language. */
export const AUTO_SMS_TRIGGER_LABEL_KEYS:Record<AutoSmsTrigger,string>={
  auto_receipt:'triggers.auto_receipt',auto_due:'triggers.auto_due',auto_result:'triggers.auto_result',
};

export function autoSmsTriggerLabelKey(trigger:string):string{
  return AUTO_SMS_TRIGGER_LABEL_KEYS[trigger as AutoSmsTrigger]||'triggers.auto_any';
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
  const triggerKey=autoSmsTriggerLabelKey(trigger);
  const triggerWord=(catalog:unknown):string=>String(triggerKey.split('.').reduce<unknown>((node,part)=>((node||{}) as Record<string,unknown>)[part],catalog)??triggerKey);
  const raw=redactSmsSecrets(causeText(cause)).slice(0,200);
  const out=(key:string,params:Record<string,string|number>={},code=''):AutoSmsProblemText=>{
    const prefixBn=smsPair('problems.prefix',{trigger:triggerWord(bnMessages.sms)}).messageBn;
    const prefixEn=smsPair('problems.prefix',{trigger:triggerWord(enMessages.sms).toLowerCase()}).messageEn;
    const body=smsPair(key,params);
    return {messageBn:`${prefixBn}${body.messageBn}`,messageEn:`${prefixEn}${body.messageEn}`,code};
  };

  if(/SMS_NOT_CONFIGURED/i.test(raw))return out('problems.notConfigured',{},'SMS_NOT_CONFIGURED');
  if(/SMS_DISABLED/i.test(raw))return out('problems.disabled',{},'SMS_DISABLED');
  if(/SMS_INVALID/i.test(raw))return out('problems.invalid',{},'SMS_INVALID');
  if(/EMPTY_MESSAGE/i.test(raw))return out('problems.emptyMessage',{},'EMPTY_MESSAGE');
  const chip=raw.match(/UNRENDERED_VARIABLE:(\{?\w+\}?)/i);
  if(chip)return out('problems.unrenderedVariable',{chip:chip[1]},'UNRENDERED_VARIABLE');
  if(/TEMPLATE_NOT_FOUND/i.test(raw))return out('problems.templateNotFound',{},'TEMPLATE_NOT_FOUND');
  if(/NO_RECIPIENTS|no recipient/i.test(raw))return out('problems.noRecipients',{},'NO_RECIPIENTS');
  if(/TOO_MANY_STUDENTS/i.test(raw))return out('problems.tooManyStudents',{},'TOO_MANY_STUDENTS');
  if(/INVALID_STUDENT/i.test(raw))return out('problems.invalidStudent',{},'INVALID_STUDENT');
  if(/INVALID_CLASS/i.test(raw))return out('problems.invalidClass',{},'INVALID_CLASS');
  if(/validation failed|ValidationError/i.test(raw))return out('problems.validation',{detail:(raw.split(':').pop()?.trim()||raw).slice(0,60)},'VALIDATION');
  const code=raw.match(/\b(1\d{3}|202)\b/);
  // The provider publishes one official meaning per code, already in Bangla, so that table is reused
  // rather than paraphrased; the English line names the code and quotes it.
  if(code)return out('problems.providerCode',{message:smsCodeMessage(code[1],'bn'),code:code[1]},code[1]);
  if(/fetch failed|network|timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|abort/i.test(raw))return out('problems.network',{},'NETWORK');
  if(/balance/i.test(raw))return out('problems.balance',{},'BALANCE');
  if(!raw)return out('problems.unknownCause',{},'');
  return out('problems.unexpected',{detail:raw.slice(0,120)},'UNEXPECTED');
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
