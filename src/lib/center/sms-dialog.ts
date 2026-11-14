/**
 * The server contract behind SendSmsDialog (R2).
 *
 * One function, three modes — preview, send, retry — so the dialog has exactly one way to reach the
 * provider and that way is testable without a browser. The route handler adds only what HTTP needs:
 * the session guard, the origin check and JSON decoding.
 *
 * Rules this function enforces, in the order an operator meets them:
 *   • the request is validated before anything is read (an unknown source resolves to nobody);
 *   • the preview is built by buildSmsPlan, which is read-only — no batch, no log row, no send;
 *   • a blocked plan (empty body, unrendered chip) is refused with 409 instead of being sent;
 *   • a send is idempotent on requestId: the same key twice is one batch, so a double-click or a
 *     refreshed tab cannot send twice;
 *   • "skip those" drops the students who already had this template for this month in 24 hours;
 *   • quiet hours queue the batch unless the operator confirmed "send anyway";
 *   • a retry re-sends only the failed rows of one batch, and never a batch that has none.
 *
 * Credentials are never part of a response: only the provider's balance number is.
 */
import 'server-only';
import bnMessages from '@/messages/bn.json';
import enMessages from '@/messages/en.json';
/** One catalog sentence in both languages: a resolved problem row stores the pair it was closed with. */
function smsPair(key:string,params:Record<string,string|number>={}):{bn:string;en:string}{
  const fill=(template:string):string=>String(template).replace(/\{(\w+)\}/g,(whole,name)=>(name in params?String(params[name]):whole));
  const at=(catalog:unknown):string=>fill(String(key.split('.').reduce<unknown>((node,part)=>((node||{}) as Record<string,unknown>)[part],catalog)??key));
  return {bn:at(bnMessages.sms),en:at(enMessages.sms)};
}


import {createHash} from 'node:crypto';
import mongoose from 'mongoose';
import {CenterClassGroup,CenterSmsBatch,CenterSmsLog} from '@/models/CenterRecords';
import {audit} from '@/lib/admin/helpers';
import {createSmsProvider,type SmsProvider} from './sms-provider';
import {dhakaCalendar} from './month-status';
import {buildSmsPlan,executeSmsPlan,loadSmsSettings,monthSmsTotals,retryFailedSms,sentMessagesToday,smsBatchExists} from './sms-send';
import {dailyLimitApplies,dailySmsLimitOf,dailyLimitReachedMessage} from './sms-staff';
import {resolveSmsSource} from './sms-source';
import {isSmsTemplateKey} from './sms-templates';
import {
  autoProblemText,findAutoSmsProblem,noteAutoSmsRetryFailed,recordAutoSmsProblem,resolveAutoSmsProblem,
  type AutoSmsCause,type AutoSmsContext,type AutoSmsTrigger,
} from './sms-auto-problems';

export type SmsDialogMode='preview'|'send'|'retry';
export type SmsDialogSource='dues'|'class'|'students'|'student'|'receipt'|'lead'|'leads';

/** CenterSmsBatch.requestId is constrained to a 36-character UUID; anything else cannot be stored. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The dialog can hold a selection, but not the whole school — a bigger send goes class by class. */
const MAX_IDS=1000;
const MAX_TEXT=600;

export interface SmsDialogInput{
  mode?:string;
  source?:string;
  classGroup?:string;
  ids?:unknown;
  id?:string;
  batchId?:string;
  receipt?:{student?:string;amount?:unknown;month?:string;receiptNo?:string;dueDate?:string};
  templateKey?:string;
  text?:string;
  subject?:string;
  target?:string;
  groupSiblings?:unknown;
  force?:unknown;
  skipDuplicates?:unknown;
  requestId?:string;
}

export interface SmsDialogOutcome{status:number;body:Record<string,unknown>}

/**
 * `provider` is an injection point for tests: the counting fake in tests/sms-dialog.integration.ts
 * proves the failure paths (a refused send, a batch with failures to retry) without a network and
 * without a real message ever leaving. Production passes nothing and gets the configured provider.
 */
export interface SmsDialogOptions{
  now?:Date;
  provider?:SmsProvider;
  /**
   * A human retry of a recorded problem. It gets its own request id, because the whole point of
   * `autoRequestId` is that the SAME attempt can never send twice — and a retry is a new attempt,
   * authorized by a named admin. Attempt 1 (or none) keeps the original id byte for byte.
   */
  attempt?:number;
  /** False only inside retryAutoSmsProblem, which owns the problem row it is retrying. */
  record?:boolean;
  /** True only inside retryAutoSmsProblem: an operator asked for this one message by name. */
  ignoreToggle?:boolean;
  /**
   * R3.11: who is asking, so the per-user daily ceiling can be counted for them. Absent for the
   * automatic sends and for retries of a recorded problem, which are the centre's own messages and
   * not an operator's — a cron must never be stopped by somebody's allowance.
   */
  role?:string;
}

/**
 * A deterministic requestId for the automatic sends. CenterSmsBatch.requestId is constrained to a
 * 36-character hex-and-dash UUID, and it is what makes an auto-send idempotent: the same receipt, or
 * the same class on the same day, can never produce a second batch.
 */
export function autoRequestId(...parts:(string|number)[]):string{
  const hex=createHash('sha1').update(parts.join('|')).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

const ok=(body:Record<string,unknown>,status=200):SmsDialogOutcome=>({status,body:{ok:true,...body}});
const bad=(detail:string,status=400):SmsDialogOutcome=>({status,body:{ok:false,error:'invalid',detail}});
const blocked=(reason:string,extra:Record<string,unknown>={}):SmsDialogOutcome=>({status:409,body:{ok:false,blocked:reason,...extra}});

function idList(value:unknown):string[]{
  if(!Array.isArray(value))return [];
  return value.filter((item):item is string=>typeof item==='string'&&mongoose.isValidObjectId(item)).slice(0,MAX_IDS);
}

type Plan=Awaited<ReturnType<typeof buildSmsPlan>>;

/** The plan reduced to what the dialog shows: figures, the first three messages, skips with reasons. */
export function previewOf(plan:Plan,names:Map<string,string>){
  return {
    phones:plan.recipientCount,
    messages:plan.recipientCount,
    segments:plan.segmentCount,
    cost:plan.estimatedCost,
    unitCost:plan.unitCost,
    balance:plan.balance.ok?plan.balance.balance:null,
    balanceOk:plan.balance.ok,
    lowBalance:plan.lowBalance,
    quiet:plan.quiet,
    quietUntil:plan.quietUntil,
    blocked:plan.blocked,
    month:plan.month,
    body:plan.body,
    recipients:plan.items.slice(0,3).map(item=>({phone:item.phone,studentName:item.studentName,preview:item.message,segments:item.segments,cost:item.cost})),
    skipped:plan.skipped.map(item=>({reason:item.reason,labelKey:item.labelKey,studentName:item.studentName,phone:item.phone})),
    skippedCount:plan.skipped.length,
    groupingRefused:plan.groupingRefused.map(item=>({phone:item.phone,reason:item.reason})),
    duplicates:plan.duplicates.map(id=>({id,name:names.get(id)||''})),
  };
}

export type SmsPreviewBody=ReturnType<typeof previewOf>;

/**
 * Run one dialog request. `actor` is the signed-in admin's User id; authorization itself is the
 * caller's job (the route handler answers 401 before this is reached).
 */
export async function runSmsDialog(input:SmsDialogInput,actor:string,options:SmsDialogOptions={}):Promise<SmsDialogOutcome>{
  const now=options.now||new Date();
  const mode=(String(input.mode||'preview')==='send'||String(input.mode)==='retry'?String(input.mode):'preview') as SmsDialogMode;
  const provider=options.provider||createSmsProvider();

  if(mode==='retry'){
    const batchId=String(input.batchId||'');
    if(!mongoose.isValidObjectId(batchId))return bad('batchId');
    const outcome=await retryFailedSms(batchId,actor,provider);
    if(!outcome.retried)return blocked('NOTHING_TO_RETRY',{batchId,retried:0,sent:outcome.sent,failed:outcome.failed});
    return ok({mode:'retry',batchId,retried:outcome.retried,sent:outcome.sent,failed:outcome.failed,monthTotals:await monthSmsTotals(now)});
  }

  const source=String(input.source||'');
  if(source!=='dues'&&source!=='class'&&source!=='students'&&source!=='student'&&source!=='receipt'&&source!=='lead'&&source!=='leads')return bad('source');
  const templateKey=String(input.templateKey||'');
  if(!isSmsTemplateKey(templateKey))return bad('templateKey');
  const target=String(input.target||'guardian');
  if(target!=='guardian'&&target!=='student'&&target!=='both')return bad('target');
  const requestId=String(input.requestId||'');
  if(!UUID.test(requestId))return bad('requestId');
  const text=String(input.text||'').slice(0,MAX_TEXT);
  /** {subject} is the one value no source can know: a notice topic, or the subject a teacher is needed for. */
  const subject=String(input.subject||'').slice(0,120);
  const groupSiblings=input.groupSiblings!==false;
  const force=input.force===true;
  const skipDuplicates=input.skipDuplicates===true;
  if(source==='dues'||source==='class'){
    if(!mongoose.isValidObjectId(String(input.classGroup||'')))return bad('classGroup');
  }
  // One student or one visitor is an id; a selection of either is a list of ids. A visitor send with no
  // ids is refused rather than read as "everybody in the book" (R3.9).
  if((source==='student'||source==='lead')&&!mongoose.isValidObjectId(String(input.id||'')))return bad('id');
  if((source==='students'||source==='leads')&&!idList(input.ids).length)return bad('ids');
  const raw=input.receipt&&typeof input.receipt==='object'?input.receipt:undefined;
  const [receiptYear,receiptMonth]=String(raw?.month||'').split('-').map(Number);
  const receipt=raw?{
    student:String(raw.student||''),
    amount:Number(raw.amount),
    month:{year:receiptYear,month:receiptMonth},
    receiptNo:String(raw.receiptNo||'').slice(0,40),
    dueDate:String(raw.dueDate||'').slice(0,20),
  }:undefined;
  if(source==='receipt'&&(!receipt||!mongoose.isValidObjectId(receipt.student)||!Number.isFinite(receipt.amount)||receipt.amount<0
    ||!Number.isInteger(receipt.month.year)||receipt.month.year<1900||receipt.month.year>2200
    ||!Number.isInteger(receipt.month.month)||receipt.month.month<1||receipt.month.month>12))return bad('receipt');

  const resolved=await resolveSmsSource({
    source:source as SmsDialogSource,
    classGroup:String(input.classGroup||''),
    ids:idList(input.ids),
    id:String(input.id||''),
    receipt,
  },now);
  const names=new Map(resolved.candidates.map(candidate=>[candidate.id,candidate.nameBn]));
  const [settings,plan]=await Promise.all([
    loadSmsSettings(),
    buildSmsPlan({
      requestId,
      students:resolved.candidates,
      templateKey,
      customText:text,
      audience:target,
      onePerPhone:groupSiblings,
      month:resolved.monthKey||undefined,
      subjectKind:resolved.subjectKind,
      globalValues:{class:resolved.className||undefined,subject:subject||undefined},
      now,
    },provider),
  ]);
  const preview=previewOf(plan,names);
  // R3.11: the per-user daily ceiling, read here and not in the route so EVERY caller of the dialog —
  // the HTTP door, a test — spends the same allowance. Zero means the owner turned it off, and an
  // automatic send (no role) is never counted against anybody's day.
  const limit=options.role&&dailyLimitApplies(options.role)?dailySmsLimitOf(settings):0;
  const sent=limit>0?await sentMessagesToday(actor,now):0;
  const remaining=Math.max(0,limit-sent);
  const daily=limit>0?{limit,sent,remaining}:null;

  if(mode!=='send')return ok({mode:'preview',preview,institutePhone:settings.institutePhone,className:resolved.className,daily});
  if(plan.blocked)return blocked(plan.blocked,{preview});
  if(!plan.recipientCount)return blocked('NO_RECIPIENTS',{preview});
  if(daily&&plan.recipientCount>remaining&&!(await smsBatchExists(plan.requestId))){
    return blocked('DAILY_LIMIT',{preview,daily,
      messageBn:dailyLimitReachedMessage(limit,'bn'),messageEn:dailyLimitReachedMessage(limit,'en')});
  }

  const summary=await executeSmsPlan(plan,{actor,provider,force,skipDuplicates,now});
  return ok({
    mode:'send',
    batchId:summary.batchId,
    status:summary.status,
    sent:summary.sent,
    failed:summary.failed,
    skipped:summary.skipped,
    queued:summary.queued,
    recipientCount:summary.recipientCount,
    segmentCount:summary.segmentCount,
    estimatedCost:summary.estimatedCost,
    quietUntil:summary.quietUntil||'',
    message:summary.message,
    monthTotals:await monthSmsTotals(now),
    preview,
  });
}

/**
 * The automatic sends the settings page offers. Every one is guarded by its own toggle, all of which
 * ship OFF, and none of them may break the operation that triggered them: a receipt that is already
 * saved must stay saved even if the SMS cannot go out, and a published result must stay published.
 *
 * That rule is why these functions never throw — and it is also why a failure here used to be
 * invisible, because every caller swallows the error on purpose. So "did not go out" is recorded as an
 * automatic-SMS problem (src/lib/center/sms-auto-problems.ts), which the SMS page and the Overview
 * show in plain Bangla with a Retry button. Did not go out means any of: an exception, a blocked plan,
 * no recipient to send to, or a batch whose messages the provider rejected. What is NOT a problem: a
 * toggle that is off, a class with nobody overdue, and a send that is queued for quiet hours — those
 * are the system working.
 */
async function batchCounts(batchId:string):Promise<{status:string;sent:number;failed:number}|null>{
  if(!batchId||!mongoose.isValidObjectId(batchId))return null;
  const row=await CenterSmsBatch.findById(batchId).select('status sentCount failedCount').lean() as unknown as
    {status?:string;sentCount?:number;failedCount?:number}|null;
  if(!row)return null;
  return {status:String(row.status||''),sent:Number(row.sentCount)||0,failed:Number(row.failedCount)||0};
}

/** Why a batch did not fully go out, in the provider's own code when there is one. Empty means fine. */
async function failedBatchCause(batchId:string):Promise<string>{
  const counts=await batchCounts(batchId);
  if(!counts||!counts.failed)return '';
  const row=await CenterSmsLog.findOne({batch:batchId,status:'failed'}).select('providerCode reason').lean() as unknown as
    {providerCode?:string;reason?:string}|null;
  return String(row?.providerCode||row?.reason||'failed');
}

/** A retried attempt needs its own request id, or idempotency would answer with the failed batch. */
function autoKey(parts:(string|number)[],options:SmsDialogOptions):string{
  return options.attempt&&options.attempt>1?autoRequestId(...parts,String(options.attempt)):autoRequestId(...parts);
}

/** Store a failure unless the caller owns the row already (a retry updates its own). */
async function failAuto(trigger:AutoSmsTrigger,context:AutoSmsContext,cause:AutoSmsCause,
  extra:{who?:string;batchId?:string;studentId?:string;classGroupId?:string},options:SmsDialogOptions):Promise<string>{
  if(options.record===false)return '';
  return recordAutoSmsProblem({context,cause,...extra});
}

export interface AutoSendOutcome{attempted:boolean;batchId?:string;reason?:string;problem?:string;failed?:boolean}

export async function autoSendReceipt(input:{student:string;amount:number;month:{year:number;month:number};receiptNo:string},options:SmsDialogOptions={}):Promise<AutoSendOutcome>{
  const context:AutoSmsContext={trigger:'auto_receipt',student:input.student,amount:input.amount,year:input.month.year,month:input.month.month,receiptNo:input.receiptNo};
  const now=options.now||new Date();
  let on=false,who=smsPair('who.receipt',{no:input.receiptNo}).bn;
  try{
    const settings=await loadSmsSettings();
    if(!settings.autoReceipt&&!options.ignoreToggle)return {attempted:false,reason:'autoReceipt off'};
    on=true;
    const provider=options.provider||createSmsProvider();
    const resolved=await resolveSmsSource({source:'receipt',receipt:{...input,dueDate:''}},now);
    const studentName=resolved.candidates[0]?.nameBn||'';
    if(studentName)who=`${who} · ${studentName}`;
    const plan=await buildSmsPlan({
      requestId:autoKey(['receipt',input.student,input.receiptNo,input.month.year,input.month.month],options),
      students:resolved.candidates,
      templateKey:'payment_receipt',
      audience:'guardian',
      onePerPhone:true,
      month:resolved.monthKey||undefined,
      globalValues:{class:resolved.className||undefined},
      now,
    },provider);
    if(plan.blocked||!plan.recipientCount){
      const reason=plan.blocked||'no recipient';
      const problem=await failAuto('auto_receipt',context,reason,{who,studentId:input.student},options);
      return {attempted:true,reason,failed:true,problem:problem||undefined};
    }
    // No actor: an automatic send is not a person. The batch's trigger says what created it.
    const summary=await executeSmsPlan(plan,{provider,now,trigger:'auto_receipt'});
    const cause=await failedBatchCause(summary.batchId);
    if(cause){
      const problem=await failAuto('auto_receipt',context,{code:cause},{who,batchId:summary.batchId,studentId:input.student},options);
      return {attempted:true,batchId:summary.batchId,reason:cause,failed:true,problem:problem||undefined};
    }
    return {attempted:true,batchId:summary.batchId};
  }catch(error){
    // The payment is saved. This must not become the operator's error, only the operator's to-do.
    if(!on){console.error('Automatic receipt SMS could not even read its settings',(error as Error).message);return {attempted:false,failed:true,reason:(error as Error).message}}
    const problem=await failAuto('auto_receipt',context,error as Error,{who,studentId:input.student},options);
    return {attempted:true,failed:true,reason:(error as Error).message,problem:problem||undefined};
  }
}

export interface AutoDueOutcome{batchId?:string;sent:number;skipped:number;status?:string;reason?:string;problem?:string;failed?:boolean}

/** One class's overdue reminders, for the daily job when auto-due is switched on. */
export async function autoSendClassDues(classGroup:string,options:SmsDialogOptions={}):Promise<AutoDueOutcome>{
  const now=options.now||new Date();
  const day=now.toISOString().slice(0,10);
  const context:AutoSmsContext={trigger:'auto_due',classGroup,day};
  let on=false,who='';
  try{
    const settings=await loadSmsSettings();
    if(!settings.autoDue&&!options.ignoreToggle)return {sent:0,skipped:0,reason:'autoDue off'};
    on=true;
    const provider=options.provider||createSmsProvider();
    const resolved=await resolveSmsSource({source:'dues',classGroup},now);
    who=`${resolved.className||smsPair('who.classFallback').bn} · ${day}`;
    // Nobody overdue is not a failure; it is the class having paid.
    if(!resolved.candidates.length)return {sent:0,skipped:0,reason:'no overdue students'};
    const plan=await buildSmsPlan({
      requestId:autoKey(['due',classGroup,day],options),
      students:resolved.candidates,
      templateKey:'due_reminder',
      audience:'guardian',
      onePerPhone:true,
      month:resolved.monthKey||undefined,
      globalValues:{class:resolved.className||undefined},
      now,
    },provider);
    if(plan.blocked||!plan.recipientCount){
      const reason=plan.blocked||'no recipient';
      const problem=await failAuto('auto_due',context,reason,{who,classGroupId:classGroup},options);
      return {sent:0,skipped:plan.skipped.length,reason,failed:true,problem:problem||undefined};
    }
    // No actor: this is the daily job, and audit() needs a real User ref (a 'system' actor writes
    // nothing at all). The batch and its log rows are the record; the job's response reports the counts.
    const summary=await executeSmsPlan(plan,{provider,skipDuplicates:true,now,trigger:'auto_due'});
    const cause=await failedBatchCause(summary.batchId);
    if(cause){
      const problem=await failAuto('auto_due',context,{code:cause},{who,batchId:summary.batchId,classGroupId:classGroup},options);
      return {batchId:summary.batchId,sent:summary.sent,skipped:summary.skipped,status:summary.status,reason:cause,failed:true,problem:problem||undefined};
    }
    return {batchId:summary.batchId,sent:summary.sent,skipped:summary.skipped,status:summary.status};
  }catch(error){
    // One unpriceable class must not stop the daily job, and must not be silent either.
    if(!on){console.error('Automatic due reminders could not even read their settings',(error as Error).message);return {sent:0,skipped:0,failed:true,reason:(error as Error).message}}
    const problem=await failAuto('auto_due',context,error as Error,{who,classGroupId:classGroup},options);
    return {sent:0,skipped:0,failed:true,reason:(error as Error).message,problem:problem||undefined};
  }
}

/**
 * One class's published results. Not a fee message, so held students are included — that decision is
 * sms-recipients.ts', made from the template's own `feeRelated` flag.
 */
export async function autoSendClassResults(input:{exam:string;classGroup:string},options:SmsDialogOptions={}):Promise<AutoSendOutcome>{
  const context:AutoSmsContext={trigger:'auto_result',exam:input.exam,classGroup:input.classGroup};
  const now=options.now||new Date();
  let on=false,who='';
  try{
    const settings=await loadSmsSettings();
    if(!settings.autoResult&&!options.ignoreToggle)return {attempted:false,reason:'autoResult off'};
    on=true;
    const provider=options.provider||createSmsProvider();
    const resolved=await resolveSmsSource({source:'class',classGroup:input.classGroup},now);
    who=resolved.className||smsPair('who.classFallback').bn;
    if(!resolved.candidates.length)return {attempted:true,reason:'no students'};
    const plan=await buildSmsPlan({
      requestId:autoKey(['result',input.exam,input.classGroup],options),
      students:resolved.candidates,
      templateKey:'exam_result',
      audience:'guardian',
      onePerPhone:true,
      globalValues:{class:resolved.className||undefined},
      now,
    },provider);
    if(plan.blocked||!plan.recipientCount){
      const reason=plan.blocked||'no recipient';
      const problem=await failAuto('auto_result',context,reason,{who,classGroupId:input.classGroup},options);
      return {attempted:true,reason,failed:true,problem:problem||undefined};
    }
    const summary=await executeSmsPlan(plan,{provider,now,trigger:'auto_result'});
    const cause=await failedBatchCause(summary.batchId);
    if(cause){
      const problem=await failAuto('auto_result',context,{code:cause},{who,batchId:summary.batchId,classGroupId:input.classGroup},options);
      return {attempted:true,batchId:summary.batchId,reason:cause,failed:true,problem:problem||undefined};
    }
    return {attempted:true,batchId:summary.batchId};
  }catch(error){
    if(!on){console.error('Automatic result SMS could not even read its settings',(error as Error).message);return {attempted:false,failed:true,reason:(error as Error).message}}
    const problem=await failAuto('auto_result',context,error as Error,{who,classGroupId:input.classGroup},options);
    return {attempted:true,failed:true,reason:(error as Error).message,problem:problem||undefined};
  }
}

/**
 * The daily job's automatic due reminders. Runs only when the toggle is on AND today (Asia/Dhaka) is
 * the operator's chosen day of the month, so a missed day never turns into a surprise bulk send on the
 * next run. Every class is its own batch with its own deterministic requestId, so re-running the job
 * on the same day sends nothing twice.
 */
export async function runAutoDue(options:SmsDialogOptions={}):Promise<{ran:boolean;day:number;autoDueDay:number;classes:number;sent:number;skipped:number;problems:number}>{
  const now=options.now||new Date();
  const settings=await loadSmsSettings();
  const today=dhakaCalendar(now).day;
  const idle={ran:false,day:today,autoDueDay:settings.autoDueDay,classes:0,sent:0,skipped:0,problems:0};
  if(!settings.autoDue)return idle;
  if(today!==settings.autoDueDay)return idle;
  const groups=await CenterClassGroup.find({active:true}).select('_id').sort({order:1}).limit(200).lean<{_id:unknown}[]>();
  let classes=0,sent=0,skipped=0,problems=0;
  for(const group of groups){
    try{
      const outcome=await autoSendClassDues(String(group._id),{now,provider:options.provider,record:options.record});
      if(outcome.batchId)classes+=1;
      sent+=outcome.sent;
      skipped+=outcome.skipped;
      if(outcome.problem)problems+=1;
    }catch(error){
      // autoSendClassDues records and returns instead of throwing, so this is the last-resort net: one
      // unpriceable class must not stop the others, and the job's response reports what did go out.
      problems+=1;
      console.error('Auto due reminders failed for one class',(error as Error).message);
    }
  }
  return {ran:true,day:today,autoDueDay:settings.autoDueDay,classes,sent,skipped,problems};
}

export interface AutoSmsRetryResult{ok:boolean;messageBn:string;messageEn:string;sent:number;batchId:string}

/**
 * Retry one recorded automatic-SMS problem, as the admin who clicked. Two paths, because they are not
 * the same act: a batch that exists has messages already built and priced, so its failed rows are
 * re-sent (and a batch that turned out fine, or that is waiting for quiet hours, is simply closed);
 * with no usable batch the automatic send is run again under a fresh request id, since the old one is
 * spent. Either way the row is resolved on success and updated with the new reason on failure, and
 * either way it is audited against a real user.
 */
export async function retryAutoSmsProblem(id:string,actor:string,options:SmsDialogOptions={}):Promise<AutoSmsRetryResult>{
  const row=await findAutoSmsProblem(id);
  if(!row||!row.context){const text=smsPair('results.notOpen');return {ok:false,messageBn:text.bn,messageEn:text.en,sent:0,batchId:''};}
  const provider=options.provider||createSmsProvider();
  const now=options.now||new Date();
  await audit(actor,'sms.autoretry',id);
  const done=async(key:string,params:Record<string,string|number>,sent:number,batchId:string):Promise<AutoSmsRetryResult>=>{
    const text=smsPair(key,params);const messageBn=text.bn,messageEn=text.en;
    await resolveAutoSmsProblem(id,actor,{bn:messageBn,en:messageEn});
    return {ok:true,messageBn,messageEn,sent,batchId};
  };
  const stillBroken=async(cause:AutoSmsCause,batchId:string):Promise<AutoSmsRetryResult>=>{
    await noteAutoSmsRetryFailed(id,row.trigger,cause,batchId||undefined);
    const text=autoProblemText(row.trigger,cause);
    return {ok:false,messageBn:text.messageBn,messageEn:text.messageEn,sent:0,batchId};
  };
  try{
    if(row.batchId){
      const counts=await batchCounts(row.batchId);
      if(counts?.status==='done')return await done('results.alreadySent',{},counts.sent,row.batchId);
      if(counts?.status==='queued')return await done('results.queued',{},0,row.batchId);
      if(counts?.failed){
        const result=await retryFailedSms(row.batchId,actor,provider);
        if(result.retried&&result.failed===0){
          return await done('results.sentCount',{count:result.sent},result.sent,row.batchId);
        }
        const cause=await failedBatchCause(row.batchId);
        return await stillBroken({code:cause||'failed'},row.batchId);
      }
    }
    const attempt=row.attempts+1;
    const runOptions:SmsDialogOptions={...options,provider,now,attempt,record:false,ignoreToggle:true};
    const context=row.context;
    const outcome=context.trigger==='auto_receipt'
      ? await autoSendReceipt({student:context.student,amount:context.amount,month:{year:context.year,month:context.month},receiptNo:context.receiptNo},runOptions)
      : context.trigger==='auto_due'
        ? await autoSendClassDues(context.classGroup,runOptions)
        : await autoSendClassResults({exam:context.exam,classGroup:context.classGroup},runOptions);
    const batchId=outcome.batchId||'';
    const reason=outcome.reason||'';
    // Nothing left to send is not a failure to retry: the class paid, or the student list emptied.
    if(reason==='no overdue students'||reason==='no students'){
      return await done('results.nothingLeft',{},0,batchId);
    }
    if(reason)return await stillBroken(reason,batchId);
    const cause=await failedBatchCause(batchId);
    if(cause)return await stillBroken({code:cause},batchId);
    const counts=await batchCounts(batchId);
    return await done('results.retryWorked',{},counts?.sent||0,batchId);
  }catch(error){
    return await stillBroken(error as Error,'');
  }
}
