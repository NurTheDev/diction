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
import {createHash} from 'node:crypto';
import mongoose from 'mongoose';
import {CenterClassGroup} from '@/models/CenterRecords';
import {createSmsProvider,type SmsProvider} from './sms-provider';
import {dhakaCalendar} from './month-status';
import {buildSmsPlan,executeSmsPlan,loadSmsSettings,monthSmsTotals,retryFailedSms} from './sms-send';
import {resolveSmsSource} from './sms-source';
import {isSmsTemplateKey} from './sms-templates';

export type SmsDialogMode='preview'|'send'|'retry';
export type SmsDialogSource='dues'|'class'|'students'|'student'|'receipt';

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
export interface SmsDialogOptions{now?:Date;provider?:SmsProvider}

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
    skipped:plan.skipped.map(item=>({reason:item.reason,labelBn:item.labelBn,labelEn:item.labelEn,studentName:item.studentName,phone:item.phone})),
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
  if(source!=='dues'&&source!=='class'&&source!=='students'&&source!=='student'&&source!=='receipt')return bad('source');
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
  if(source==='student'&&!mongoose.isValidObjectId(String(input.id||'')))return bad('id');
  if(source==='students'&&!idList(input.ids).length)return bad('ids');
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
      globalValues:{class:resolved.className||undefined,subject:subject||undefined},
      now,
    },provider),
  ]);
  const preview=previewOf(plan,names);

  if(mode!=='send')return ok({mode:'preview',preview,institutePhone:settings.institutePhone,className:resolved.className});
  if(plan.blocked)return blocked(plan.blocked,{preview});
  if(!plan.recipientCount)return blocked('NO_RECIPIENTS',{preview});

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
 * saved must stay saved even if the SMS cannot go out.
 */
export async function autoSendReceipt(input:{student:string;amount:number;month:{year:number;month:number};receiptNo:string},options:SmsDialogOptions={}):Promise<{attempted:boolean;batchId?:string;reason?:string}>{
  const now=options.now||new Date();
  const settings=await loadSmsSettings();
  if(!settings.autoReceipt)return {attempted:false,reason:'autoReceipt off'};
  const provider=options.provider||createSmsProvider();
  const resolved=await resolveSmsSource({source:'receipt',receipt:{...input,dueDate:''}},now);
  const plan=await buildSmsPlan({
    requestId:autoRequestId('receipt',input.student,input.receiptNo,input.month.year,input.month.month),
    students:resolved.candidates,
    templateKey:'payment_receipt',
    audience:'guardian',
    onePerPhone:true,
    month:resolved.monthKey||undefined,
    globalValues:{class:resolved.className||undefined},
    now,
  },provider);
  if(plan.blocked||!plan.recipientCount)return {attempted:true,reason:plan.blocked||'no recipient'};
  const summary=await executeSmsPlan(plan,{provider,now});
  return {attempted:true,batchId:summary.batchId};
}

/** One class's overdue reminders, for the daily job when auto-due is switched on. */
export async function autoSendClassDues(classGroup:string,options:SmsDialogOptions={}):Promise<{batchId?:string;sent:number;skipped:number;status?:string;reason?:string}>{
  const now=options.now||new Date();
  const provider=options.provider||createSmsProvider();
  const resolved=await resolveSmsSource({source:'dues',classGroup},now);
  if(!resolved.candidates.length)return {sent:0,skipped:0,reason:'no overdue students'};
  const plan=await buildSmsPlan({
    requestId:autoRequestId('due',classGroup,now.toISOString().slice(0,10)),
    students:resolved.candidates,
    templateKey:'due_reminder',
    audience:'guardian',
    onePerPhone:true,
    month:resolved.monthKey||undefined,
    globalValues:{class:resolved.className||undefined},
    now,
  },provider);
  if(plan.blocked||!plan.recipientCount)return {sent:0,skipped:plan.skipped.length,reason:plan.blocked||'no recipient'};
  // No actor: this is the daily job, and audit() needs a real User ref (a 'system' actor writes
  // nothing at all). The batch and its log rows are the record; the job's response reports the counts.
  const summary=await executeSmsPlan(plan,{provider,skipDuplicates:true,now});
  return {batchId:summary.batchId,sent:summary.sent,skipped:summary.skipped,status:summary.status};
}

/**
 * One class's published results. Not a fee message, so held students are included — that decision is
 * sms-recipients.ts', made from the template's own `feeRelated` flag.
 */
export async function autoSendClassResults(input:{exam:string;classGroup:string},options:SmsDialogOptions={}):Promise<{attempted:boolean;batchId?:string;reason?:string}>{
  const now=options.now||new Date();
  const settings=await loadSmsSettings();
  if(!settings.autoResult)return {attempted:false,reason:'autoResult off'};
  const provider=options.provider||createSmsProvider();
  const resolved=await resolveSmsSource({source:'class',classGroup:input.classGroup},now);
  if(!resolved.candidates.length)return {attempted:true,reason:'no students'};
  const plan=await buildSmsPlan({
    requestId:autoRequestId('result',input.exam,input.classGroup),
    students:resolved.candidates,
    templateKey:'exam_result',
    audience:'guardian',
    onePerPhone:true,
    globalValues:{class:resolved.className||undefined},
    now,
  },provider);
  if(plan.blocked||!plan.recipientCount)return {attempted:true,reason:plan.blocked||'no recipient'};
  const summary=await executeSmsPlan(plan,{provider,now});
  return {attempted:true,batchId:summary.batchId};
}

/**
 * The daily job's automatic due reminders. Runs only when the toggle is on AND today (Asia/Dhaka) is
 * the operator's chosen day of the month, so a missed day never turns into a surprise bulk send on
 * the next run. Every class is its own batch with its own deterministic requestId, so re-running the
 * job on the same day sends nothing twice.
 */
export async function runAutoDue(options:SmsDialogOptions={}):Promise<{ran:boolean;day:number;autoDueDay:number;classes:number;sent:number;skipped:number}>{
  const now=options.now||new Date();
  const settings=await loadSmsSettings();
  const today=dhakaCalendar(now).day;
  const idle={ran:false,day:today,autoDueDay:settings.autoDueDay,classes:0,sent:0,skipped:0};
  if(!settings.autoDue)return idle;
  if(today!==settings.autoDueDay)return idle;
  const groups=await CenterClassGroup.find({active:true}).select('_id').sort({order:1}).limit(200).lean<{_id:unknown}[]>();
  let classes=0,sent=0,skipped=0;
  for(const group of groups){
    try{
      const outcome=await autoSendClassDues(String(group._id),{now,provider:options.provider});
      if(outcome.batchId)classes+=1;
      sent+=outcome.sent;
      skipped+=outcome.skipped;
    }catch(error){
      // One unpriceable class must not stop the others; the job's response reports what did go out.
      console.error('Auto due reminders failed for one class',(error as Error).message);
    }
  }
  return {ran:true,day:today,autoDueDay:settings.autoDueDay,classes,sent,skipped};
}
