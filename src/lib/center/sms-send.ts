/**
 * SMS send orchestration (R2).
 *
 * This is the only module that turns a plan into provider calls and durable log rows. It owns:
 *   • idempotency — one CenterSmsBatch per requestId (unique index), so a double-click or a
 *     browser refresh cannot send twice; the second call returns the first batch untouched;
 *   • batching — about 100 recipients per provider call, so 500 recipients is 5 calls;
 *   • retries — only for codes that provably were not submitted (1005 internal error). An
 *     `unknown` outcome is never auto-retried: a timeout may have happened after submission, and
 *     a blind retry would double-send. The operator's explicit "Retry failed" is the only path;
 *   • quiet hours — a send inside the window is stored as a `queued` batch with `scheduledFor`,
 *     and flushQueuedSms() (daily job) sends it when the window closes;
 *   • audit — every log row carries segments and cost, so "this month's cost" is a stored sum and
 *     not a guess from today's unit cost.
 *
 * Authorization is the caller's job: server actions gate with requireAdmin()/getListAccess().
 */
import 'server-only';
import {getTranslations} from 'next-intl/server';
import {CenterSmsBatch,CenterSmsLog,CenterSmsTemplate,CenterSettings} from '@/models/CenterRecords';
import {dhakaDay} from '@/lib/admin/today';
import {audit} from '@/lib/admin/helpers';
import {SMS_BATCH_SIZE,createSmsProvider,estimateSms,smsCodeMessage,type SmsProvider} from './sms-provider';
import {chunkRecipients,resolveRecipients,SMS_SKIP_LABEL_KEYS,type SmsAudience,type SmsCandidateStudent,type SmsSkipReason} from './sms-recipients';
import {defaultTemplate,renderSmsTemplate,templateVariablesOf,type SmsVariable} from './sms-templates';
import {inQuietHours,msUntilQuietEnds,quietUntilLabel} from './sms-quiet';
import {normalizePhone} from './phone';

/** Provider codes worth one automatic retry: the message provably was not submitted. */
const TRANSIENT_CODES=new Set(['1005']);

const TEST_SMS_BODY='ডিকশন কোচিং: এসএমএস সংযোগ পরীক্ষা। যোগাযোগ: {institute_phone}'; // i18n-scan-allow: SMS message body
export interface SmsSettingsRow{
  unitCost:number;quietStart:string;quietEnd:string;institutePhone:string;
  autoReceipt:boolean;autoResult:boolean;autoDue:boolean;autoDueDay:number;
  /** R3.11: the per-user daily send ceiling; null when the settings row predates the field. */
  dailySmsLimitPerUser:number|null;
}

/** The `YYYY-MM` key before a `YYYY-MM` key. An unreadable key answers itself, never a wrong month. */
export function previousMonthKey(month:string):string{
  const [year,part]=String(month||'').split('-').map(Number);
  if(!Number.isFinite(year)||!Number.isFinite(part)||part<1||part>12)return month;
  return part===1?`${year-1}-12`:`${year}-${String(part-1).padStart(2,'0')}`;
}

export async function loadSmsSettings():Promise<SmsSettingsRow>{
  const row=await CenterSettings.findOne({key:'main'}).lean<Partial<SmsSettingsRow>&{smsUnitCost?:number}|null>();
  const unitCost=Number(row?.smsUnitCost);
  return {
    unitCost:Number.isFinite(unitCost)&&unitCost>=0?unitCost:0,
    quietStart:String(row?.quietStart||'21:00'),
    quietEnd:String(row?.quietEnd||'07:00'),
    institutePhone:String(row?.institutePhone||''),
    dailySmsLimitPerUser:row?.dailySmsLimitPerUser===undefined||row?.dailySmsLimitPerUser===null?null:Number(row?.dailySmsLimitPerUser),
    autoReceipt:row?.autoReceipt===true,
    autoResult:row?.autoResult===true,
    autoDue:row?.autoDue===true,
    autoDueDay:Number.isFinite(Number(row?.autoDueDay))?Number(row?.autoDueDay):10,
  };
}

export interface SmsTemplateRow{
  key:string;name:string;body:string;variables:string[];purpose:string;feeRelated:boolean;
  /** True when an operator edited this template in the database. */
  edited:boolean;active:boolean;
}

/**
 * The template catalog: the shipped Bangla defaults with database edits layered on top. A default
 * is never deleted by an edit — an inactive database row hides that template from the picker.
 */
export async function loadSmsTemplates():Promise<SmsTemplateRow[]>{
  const stored=await CenterSmsTemplate.find({}).lean<{key:string;name:string;body?:{bn:string};variables?:string[];active?:boolean}[]>();
  const byKey=new Map(stored.map(row=>[row.key,row]));
  const rows:SmsTemplateRow[]=[];
  for(const fallback of [defaultTemplate('payment_receipt')!,defaultTemplate('due_reminder')!,defaultTemplate('pending_reminder')!,defaultTemplate('visitor_thanks')!,defaultTemplate('teacher_opening')!,defaultTemplate('exam_result')!,defaultTemplate('notice')!,defaultTemplate('custom')!]){
    const override=byKey.get(fallback.key);
    const body=String(override?.body?.bn??fallback.body);
    rows.push({
      key:fallback.key,
      name:String(override?.name||fallback.name),
      body,
      variables:override?.variables?.length?override.variables:[...fallback.variables],
      purpose:fallback.purpose,
      feeRelated:fallback.feeRelated,
      edited:!!override&&body!==fallback.body,
      active:override?.active!==false,
    });
    byKey.delete(fallback.key);
  }
  // Operator-created templates that are not one of the defaults.
  for(const [key,override] of byKey){
    rows.push({key,name:String(override.name),body:String(override.body?.bn||''),variables:override.variables||[],purpose:'custom',feeRelated:false,edited:true,active:override.active!==false});
  }
  return rows;
}

export async function smsTemplateBody(key:string):Promise<{body:string;feeRelated:boolean;purpose:string}|null>{
  const templates=await loadSmsTemplates();
  const row=templates.find(t=>t.key===key&&t.active);
  return row?{body:row.body,feeRelated:row.feeRelated,purpose:row.purpose}:null;
}

export function estimatedSmsCost(segments:number,unitCost:number):number{
  const total=segments*unitCost;
  return Number.isFinite(total)&&total>=0?Math.round(total*100)/100:0;
}

/** Dhaka YYYY-MM, the basis for both the duplicate warning and this month's cost. */
export function dhakaMonthKey(now:Date=new Date()):string{
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit'}).formatToParts(now);
  return `${parts.find(p=>p.type==='year')?.value}-${parts.find(p=>p.type==='month')?.value}`;
}

export interface SmsPlanInput{
  requestId:string;
  students:SmsCandidateStudent[];
  /** Either a catalog key or, for `custom`, free text. */
  templateKey?:string;
  customText?:string;
  audience:SmsAudience;
  onePerPhone?:boolean;
  /** Overrides the template's own fee flag — a custom message about fees must say so. */
  feeMessage?:boolean;
  globalValues?:Partial<Record<SmsVariable,string|number|null>>;
  /** Fee month for the duplicate warning; defaults to the current Dhaka month. */
  month?:string;
  /**
   * Whose ids `students` carries. A visitor send (R3.9) points its log rows and its 24-hour duplicate
   * warning at the lead; everything else is a student send and stays exactly as it was.
   */
  subjectKind?:'student'|'lead';
  now?:Date;
}

export interface SmsPlanItem{phone:string;studentIds:string[];studentName:string;message:string;segments:number;cost:number}
export interface SmsPlanSkipped{studentId:string;studentName:string;phone:string;reason:SmsSkipReason;labelKey:string}

export interface SmsPlan{
  requestId:string;
  templateKey:string;
  purpose:string;
  /** Carried from the input, because the log write and the retry have to know whose id a row holds. */
  subjectKind:'student'|'lead';
  audience:SmsAudience;
  month:string;
  body:string;
  items:SmsPlanItem[];
  skipped:SmsPlanSkipped[];
  groupingRefused:{phone:string;reason:string}[];
  /** Students who already got this template+month within 24 hours — the dialog offers "skip those". */
  duplicates:string[];
  recipientCount:number;
  segmentCount:number;
  estimatedCost:number;
  unitCost:number;
  balance:{ok:true;balance:number}|{ok:false;code?:string};
  lowBalance:boolean;
  quiet:boolean;
  quietUntil:string;
  /** Refuse to send: an unrendered chip or an empty body would go out as garbage. */
  blocked:string|null;
}

/**
 * Build the exact plan the operator approves. Read-only: no batch, no log row, no provider call.
 * The dialog renders this, and executeSmsPlan() sends precisely this — nothing is re-decided later.
 */
export async function buildSmsPlan(input:SmsPlanInput,provider:SmsProvider=createSmsProvider()):Promise<SmsPlan>{
  const now=input.now||new Date();
  const settings=await loadSmsSettings();
  const month=input.month||dhakaMonthKey(now);
  const subjectKind=input.subjectKind||'student';
  const custom=!!input.customText;
  const templateKey=custom?'custom':String(input.templateKey||'custom');

  let body='',purpose='custom',feeRelated=false;
  if(custom){
    body=String(input.customText||'');
  }else{
    const found=await smsTemplateBody(templateKey);
    if(!found)return emptyPlan(input,templateKey,month,settings,now,'TEMPLATE_NOT_FOUND');
    body=found.body;purpose=found.purpose;feeRelated=found.feeRelated;
  }
  if(input.feeMessage!==undefined)feeRelated=input.feeMessage;
  // Checked before any rendering: estimateSms() throws on an empty body, and the operator must get a
  // blocked plan they can read, not an exception.
  if(!body.trim())return emptyPlan(input,templateKey,month,settings,now,'EMPTY_MESSAGE');

  const globalValues={institute_phone:settings.institutePhone,...(input.globalValues||{})};
  const resolved=resolveRecipients(input.students,{
    audience:input.audience,feeMessage:feeRelated,onePerPhone:input.onePerPhone,globalValues,now,
  });

  // A chip with no value would render as a hole in the sentence — so that recipient is
  // reported incomplete instead of being sent a broken message. Unknown chips (a typo) still block
  // the whole plan below, because they affect every recipient identically.
  const requiredChips=templateVariablesOf(body);
  const items:SmsPlanItem[]=[];
  const incomplete:SmsPlanSkipped[]=[];
  for(const recipient of resolved.recipients){
    const missing=requiredChips.filter(variable=>{
      const raw=recipient.values[variable];
      return raw===undefined||raw===null||String(raw).trim()==='';
    });
    if(missing.length){
      for(const studentId of recipient.studentIds){
        incomplete.push({studentId,studentName:recipient.studentName,phone:recipient.phone,reason:'missing_value',labelKey:SMS_SKIP_LABEL_KEYS.missing_value});
      }
      continue;
    }
    const message=renderSmsTemplate(body,recipient.values);
    const {segments}=estimateSms(message);
    items.push({phone:recipient.phone,studentIds:recipient.studentIds,studentName:recipient.studentName,message,segments,cost:estimatedSmsCost(segments,settings.unitCost)});
  }

  const skipped:SmsPlanSkipped[]=[
    ...resolved.skipped.map(entry=>({...entry,labelKey:SMS_SKIP_LABEL_KEYS[entry.reason]})),
    ...incomplete,
  ];

  const segmentCount=items.reduce((sum,item)=>sum+item.segments,0);
  const estimatedCost=estimatedSmsCost(segmentCount,settings.unitCost);
  const balance=await provider.balance();
  /**
   * A visitor send warns on a 24-HOUR window, but the log row it reads back carries the month its cost was
   * booked to — so a thank-you sent at 23:00 on the last day of a month and another at 00:30 on the first
   * day of the next fall in the same 24 hours and in two different months. Looking at both keeps the
   * warning honest at the boundary, which is exactly when "we already texted this person today" matters.
   * A student send stays on its own month, because a due reminder IS a monthly message.
   */
  const duplicateMonths=subjectKind==='lead'?[month,previousMonthKey(month)]:month;
  const duplicates=await recentDuplicateStudents(templateKey,resolved.recipients.flatMap(r=>r.studentIds),duplicateMonths,now,24,subjectKind==='lead'?'lead':'student');

  // An unrendered {chip} means the operator picked a variable we have no value for.
  const unrendered=items.find(item=>/\{\w+\}/.test(item.message));
  const blocked=!body.trim()?'EMPTY_MESSAGE':unrendered?`UNRENDERED_VARIABLE:${unrendered.message.match(/\{\w+\}/)?.[0]}`:null;

  return {
    requestId:input.requestId,templateKey,purpose,subjectKind,audience:input.audience,month,body,
    items,skipped,groupingRefused:resolved.groupingRefused,duplicates,
    recipientCount:items.length,segmentCount,estimatedCost,unitCost:settings.unitCost,
    balance,lowBalance:balance.ok&&estimatedCost>balance.balance,
    quiet:inQuietHours(settings.quietStart,settings.quietEnd,now),
    quietUntil:quietUntilLabel(settings.quietEnd),
    blocked,
  };
}

function emptyPlan(input:SmsPlanInput,templateKey:string,month:string,settings:SmsSettingsRow,now:Date,blocked:string):SmsPlan{
  return {
    requestId:input.requestId,templateKey,purpose:'custom',subjectKind:input.subjectKind||'student',audience:input.audience,month,body:'',
    items:[],skipped:[],groupingRefused:[],duplicates:[],recipientCount:0,segmentCount:0,
    estimatedCost:0,unitCost:settings.unitCost,balance:{ok:false},lowBalance:false,
    quiet:inQuietHours(settings.quietStart,settings.quietEnd,now),quietUntil:quietUntilLabel(settings.quietEnd),blocked,
  };
}

/**
 * Subjects who already received this template for this month within the last `hours`. `field` says which
 * subject the ids are: a student send warns from the `student` rows, a visitor send from the `lead` rows
 * (R3.9), and the two never mix — a lead id in a student reference would warn about the wrong person.
 */
export async function recentDuplicateStudents(templateKey:string,studentIds:string[],month:string|string[],now:Date=new Date(),hours=24,field:'student'|'lead'='student'):Promise<string[]>{
  if(!templateKey||templateKey==='custom'||!studentIds.length)return [];
  const since=new Date(now.getTime()-hours*60*60*1000);
  const rows=await CenterSmsLog.find({templateKey,month:Array.isArray(month)?{$in:month}:month,[field]:{$in:studentIds},status:{$in:['sent','queued']},createdAt:{$gte:since}})
    .select(field).limit(5000).lean<Record<'student'|'lead',unknown>[]>();
  return [...new Set(rows.map(row=>String(row[field]??'')).filter(id=>id&&id!=='undefined'))];
}

export interface SmsSendSummary{
  batchId:string;requestId:string;status:'done'|'partial'|'failed'|'queued'|'existing';
  sent:number;failed:number;skipped:number;queued:number;
  recipientCount:number;segmentCount:number;estimatedCost:number;
  quietUntil?:string;message:string;
}

/** Who asked for this batch: an operator in the dialog, or one of the three automatic sends. */
export type SmsBatchTrigger='manual'|'auto_receipt'|'auto_due'|'auto_result';

export interface SmsExecuteOptions{
  /** The acting admin's User id. Required for a human send; the daily job passes undefined. */
  actor?:string;
  provider?:SmsProvider;
  /** Send even inside quiet hours (the operator confirmed the warning). */
  force?:boolean;
  /**
   * Why this batch exists. An automatic send has no actor — the daily job is not a user — so the
   * trigger is the audit trail in place of `createdBy`, which the schema therefore does not require.
   */
  trigger?:SmsBatchTrigger;
  /** Drop recipients already sent this template+month in the last 24 hours ("skip those"). */
  skipDuplicates?:boolean;
  now?:Date;
}

/**
 * Send an approved plan. Idempotent on plan.requestId: if a batch already carries it, that batch is
 * returned as-is and nothing is sent again — this is what makes a double-click harmless.
 */
export async function executeSmsPlan(plan:SmsPlan,options:SmsExecuteOptions={}):Promise<SmsSendSummary>{
  const now=options.now||new Date();
  const provider=options.provider||createSmsProvider();
  const settings=await loadSmsSettings();

  const existing=await CenterSmsBatch.findOne({requestId:plan.requestId}).lean<{_id:unknown;status:string;sentCount:number;failedCount:number;skippedCount:number;recipientCount:number;segmentCount:number;estimatedCost:number;quiet:boolean}|null>();
  if(existing)return summarizeExisting(existing,plan);

  let items=plan.items;
  const duplicateSkips=options.skipDuplicates?items.filter(item=>item.studentIds.some(id=>plan.duplicates.includes(id))):[];
  if(options.skipDuplicates)items=items.filter(item=>!item.studentIds.some(id=>plan.duplicates.includes(id)));

  const queue=plan.quiet&&!options.force;
  const segmentCount=items.reduce((sum,item)=>sum+item.segments,0);
  const estimatedCost=estimatedSmsCost(segmentCount,settings.unitCost);
  const skippedCount=plan.skipped.length+duplicateSkips.length;

  let batch:({_id:unknown}|null)=null;
  try{
    batch=await CenterSmsBatch.create({
      requestId:plan.requestId,purpose:plan.purpose,createdBy:options.actor,trigger:options.trigger||'manual',templateKey:plan.templateKey,
      audience:plan.audience,recipientCount:items.length,segmentCount,estimatedCost,skippedCount,
      status:queue?'queued':'sending',quiet:queue,scheduledFor:queue?new Date(now.getTime()+msUntilQuietEnds(settings.quietStart,settings.quietEnd,now)):undefined,
    });
  }catch(error){
    // Lost a race with an identical requestId: the winner's batch is the answer, never a second send.
    if((error as {code?:number}).code===11000){
      const winner=await CenterSmsBatch.findOne({requestId:plan.requestId}).lean<typeof existing>();
      if(winner)return summarizeExisting(winner,plan);
    }
    throw error;
  }

  const batchId=String(batch!._id);
  // Log rows are the durable plan: skipped numbers keep their reason, and queued messages wait here
  // until the window closes. A skip with no phone at all (removed / opted out / missing number) is
  // counted on the batch instead, because SmsLog.phone is required and must stay a real number.
  // One subject per row: a visitor send points at the lead, a student send at the student, and neither
  // id ever goes in the other's reference.
  const subjectOf=(id:string):{student?:string;lead?:string}=>plan.subjectKind==='lead'?{lead:id}:{student:id};
  const pendingRows:PendingRow[]=[];
  for(const item of items){
    // One row per (recipient, student): a sibling-grouped message stays traceable to every child.
    for(const studentId of item.studentIds){
      pendingRows.push({batch:batchId,...subjectOf(studentId),phone:item.phone,message:item.message,segments:item.segments,cost:item.cost,templateKey:plan.templateKey,month:plan.month,status:'queued'});
    }
  }
  const skippedRows:PendingRow[]=[];
  for(const entry of plan.skipped){
    if(!entry.phone)continue;
    skippedRows.push({batch:batchId,...subjectOf(entry.studentId),phone:entry.phone,message:plan.body||'',segments:1,cost:0,templateKey:plan.templateKey,month:plan.month,status:'skipped',reason:entry.reason});
  }
  for(const item of duplicateSkips){
    for(const studentId of item.studentIds){
      skippedRows.push({batch:batchId,...subjectOf(studentId),phone:item.phone,message:item.message,segments:1,cost:0,templateKey:plan.templateKey,month:plan.month,status:'skipped',reason:'duplicate'});
    }
  }
  if(skippedRows.length)await CenterSmsLog.insertMany(skippedRows,{ordered:false});
  // Keep the inserted documents: their _ids are what the per-chunk outcome updates, so a retry or a
  // flush can never touch a row belonging to another batch or another phone.
  const pending=pendingRows.length?await CenterSmsLog.insertMany(pendingRows,{ordered:false}) as unknown as PendingRow[]:[];

  if(queue){
    if(options.actor)await audit(options.actor,'sms.queue',batchId);
    return {batchId,requestId:plan.requestId,status:'queued',sent:0,failed:0,skipped:skippedCount,queued:items.length,recipientCount:items.length,segmentCount,estimatedCost,quietUntil:plan.quietUntil,message:`quiet-hours: queued until ${plan.quietUntil}`};
  }

  const outcome=await sendChunks(pending,provider,now);
  await finalizeBatch(batchId,outcome,skippedCount,items.length,segmentCount,estimatedCost);
  if(options.actor)await audit(options.actor,outcome.failed?'sms.send.partial':'sms.send',batchId);
  return {
    batchId,requestId:plan.requestId,
    status:outcome.failed===0?'done':outcome.sent===0?'failed':'partial',
    sent:outcome.sent,failed:outcome.failed,skipped:skippedCount,queued:0,
    recipientCount:items.length,segmentCount,estimatedCost,
    message:outcome.failed?`${outcome.sent} sent, ${outcome.failed} failed`:`${outcome.sent} sent`,
  };
}

/** One log row per (recipient, student) so a sibling-grouped message is traceable to every child. */
interface PendingRow{_id?:unknown;batch:string;student?:string;lead?:string;phone:string;message:string;segments:number;cost:number;templateKey:string;month:string;status:string;reason?:string}

/**
 * Send in provider-sized chunks. Rows are grouped by phone because the provider answers once per
 * call, so every student sharing that phone legitimately shares the outcome. `sent`/`failed` count
 * messages (phones), which is what the provider bills and what the batch reports.
 */
async function sendChunks(rows:PendingRow[],provider:SmsProvider,now:Date):Promise<{sent:number;failed:number}>{
  let sent=0,failed=0;
  const byPhone=new Map<string,PendingRow[]>();
  for(const row of rows){
    const list=byPhone.get(row.phone)||[];
    list.push(row);
    byPhone.set(row.phone,list);
  }
  for(const chunk of chunkRecipients([...byPhone.keys()],SMS_BATCH_SIZE)){
    const items=chunk.map(phone=>({phone,message:byPhone.get(phone)![0].message}));
    let outcome=await provider.sendMany(items);
    // One automatic retry, and only for a code proving the provider never took the message. An
    // `unknown` outcome is never retried here: it may already have been submitted.
    if(outcome.status==='rejected'&&outcome.code&&TRANSIENT_CODES.has(outcome.code))outcome=await provider.sendMany(items);
    const affected=chunk.flatMap(phone=>byPhone.get(phone)!);
    if(outcome.status==='submitted'){
      sent+=chunk.length;
      await markRows(affected,'sent',{sentAt:now,providerCode:outcome.code||'',providerMessage:smsCodeMessage(outcome.code)});
    }else{
      failed+=chunk.length;
      await markRows(affected,'failed',{providerCode:outcome.code||'',providerMessage:smsCodeMessage(outcome.code),reason:outcome.status==='unknown'?'unknown':(outcome.code||'rejected')});
    }
  }
  return {sent,failed};
}

/** Update by _id whenever we hold them; the fallback can only ever match still-queued rows. */
async function markRows(rows:PendingRow[],status:string,extra:Record<string,unknown>):Promise<void>{
  if(!rows.length)return;
  const ids=rows.map(row=>row._id).filter(Boolean);
  const filter=ids.length===rows.length
    ? {_id:{$in:ids}}
    : {batch:rows[0].batch,phone:{$in:[...new Set(rows.map(row=>row.phone))]},status:'queued'};
  await CenterSmsLog.updateMany(filter,{$set:{status,...extra}} as never);
}

async function finalizeBatch(batchId:string,outcome:{sent:number;failed:number},skipped:number,recipientCount:number,segmentCount:number,estimatedCost:number):Promise<void>{
  const status=outcome.failed===0?'done':outcome.sent===0?'failed':'partial';
  await CenterSmsBatch.updateOne({_id:batchId},{$set:{status,sentCount:outcome.sent,failedCount:outcome.failed,skippedCount:skipped,recipientCount,segmentCount,estimatedCost}});
}

function summarizeExisting(existing:{_id:unknown;status:string;sentCount:number;failedCount:number;skippedCount:number;recipientCount:number;segmentCount:number;estimatedCost:number;quiet:boolean},plan:SmsPlan):SmsSendSummary{
  return {
    batchId:String(existing._id),requestId:plan.requestId,status:'existing',
    sent:existing.sentCount||0,failed:existing.failedCount||0,skipped:existing.skippedCount||0,queued:existing.quiet?existing.recipientCount:0,
    recipientCount:existing.recipientCount||0,segmentCount:existing.segmentCount||0,estimatedCost:existing.estimatedCost||0,
    message:'this requestId was already used; nothing was sent again',
  };
}

/**
 * Retry the failed rows of one batch. Only an operator can trigger it, because a previous `unknown`
 * outcome may already have reached the provider — the UI says so before the button is enabled.
 */
export async function retryFailedSms(batchId:string,actor:string,provider:SmsProvider=createSmsProvider()):Promise<{retried:number;sent:number;failed:number}>{
  const rows=await CenterSmsLog.find({batch:batchId,status:'failed'}).limit(20000).lean<PendingRow[]>();
  if(!rows.length)return {retried:0,sent:0,failed:0};
  await CenterSmsLog.updateMany({_id:{$in:rows.map(row=>(row as {_id:unknown})._id)}},{$set:{status:'queued',reason:undefined}} as never);
  const outcome=await sendChunks(rows,provider,new Date());
  const batch=await CenterSmsBatch.findById(batchId).lean<{sentCount?:number;failedCount?:number}|null>();
  await CenterSmsBatch.updateOne({_id:batchId},{$set:{
    sentCount:(batch?.sentCount||0)+outcome.sent,
    failedCount:Math.max(0,(batch?.failedCount||0)-rows.length+outcome.failed),
    status:outcome.failed===0?'done':'partial',
  }});
  await audit(actor,'sms.retry',batchId);
  return {retried:rows.length,sent:outcome.sent,failed:outcome.failed};
}

/** Send every queued batch whose window has opened. Called by the daily job. */
export async function flushQueuedSms(now:Date=new Date(),provider:SmsProvider=createSmsProvider()):Promise<{batches:number;sent:number;failed:number}>{
  const due=await CenterSmsBatch.find({status:'queued',scheduledFor:{$lte:now}}).limit(50).lean<{_id:unknown}[]>();
  let sent=0,failed=0;
  for(const batch of due){
    const batchId=String(batch._id);
    const rows=await CenterSmsLog.find({batch:batch._id,status:'queued'}).limit(20000).lean<PendingRow[]>();
    if(!rows.length){await CenterSmsBatch.updateOne({_id:batchId},{$set:{status:'done'}});continue}
    const outcome=await sendChunks(rows,provider,now);
    await finalizeBatch(batchId,outcome,0,rows.length,rows.reduce((sum,row)=>sum+row.segments,0),rows.reduce((sum,row)=>sum+row.cost,0));
    sent+=outcome.sent;failed+=outcome.failed;
  }
  return {batches:due.length,sent,failed};
}

/** A single test message to the operator's own number — never to a student. */
export async function sendTestSms(phone:string,actor:string,provider:SmsProvider=createSmsProvider()):Promise<{status:'sent'|'failed'|'invalid';message:string}>{
  const normalized=normalizePhone(phone);
  if(!normalized)return {status:'invalid',message:(await getTranslations('sms'))('invalidTestNumber')};
  const settings=await loadSmsSettings();
  const body=renderSmsTemplate(TEST_SMS_BODY,{institute_phone:settings.institutePhone});
  const outcome=await provider.send(normalized,body);
  if(outcome.status!=='submitted')return {status:'failed',message:smsCodeMessage(outcome.code)};
  await CenterSmsLog.insertMany([{phone:normalized,message:body,segments:estimateSms(body).segments,cost:estimatedSmsCost(estimateSms(body).segments,settings.unitCost),templateKey:'test',status:'sent',sentAt:new Date(),providerCode:outcome.code||'',providerMessage:smsCodeMessage(outcome.code)}]);
  await audit(actor,'sms.test',normalized);
  return {status:'sent',message:(await getTranslations('sms'))('testQueued')};
}

export interface SmsMonthTotals{sent:number;failed:number;skipped:number;queued:number;segments:number;cost:number}

/** One aggregate row per log status. */
interface SmsMonthRow{_id:string;n:number;segments:number;cost:number}

/** This month's history totals for the SMS page. Cost is the stored sum, not today's unit cost. */
/**
 * Whether this requestId has already produced a batch. The dialog asks before it refuses a send on the
 * daily ceiling: a double-click after the allowance ran out must be answered with "it already went"
 * (the recorded batch) rather than with a refusal that contradicts the log the operator can read.
 */
export async function smsBatchExists(requestId:string):Promise<boolean>{
  return !!(await CenterSmsBatch.exists({requestId}));
}

/**
 * How many messages ONE operator's sends actually delivered today, Dhaka day (R3.11): the ceiling is
 * per user and per day, so it is read off the batches that carry their id, counting what was sent —
 * not what was planned — because a failed chunk must not spend tomorrow's allowance. The day is
 * compared in Dhaka on this side of the query on purpose: a range built from a day string would
 * disagree with the cron's own clock by the offset, and a centre's bookkeeping keeps one clock.
 */
export async function sentMessagesToday(actor:string,now:Date=new Date()):Promise<number>{
  const day=dhakaDay(now);
  const rows=await CenterSmsBatch.find({createdBy:actor}).select('createdAt sentCount').lean<{createdAt:Date;sentCount:number}[]>();
  return rows
    .filter(row=>dhakaDay(new Date(row.createdAt))===day)
    .reduce((sum,row)=>sum+(Number(row.sentCount)||0),0);
}

export async function monthSmsTotals(now:Date=new Date()):Promise<SmsMonthTotals>{
  const start=new Date(`${dhakaMonthKey(now)}-01T00:00:00+06:00`);
  const rows=await CenterSmsLog.aggregate([
    {$match:{createdAt:{$gte:start}}},
    {$group:{_id:'$status',n:{$sum:1},segments:{$sum:'$segments'},cost:{$sum:{$ifNull:['$cost',0]}}}},
  ]) as unknown as SmsMonthRow[];
  const pick=(status:string):SmsMonthRow|undefined=>rows.find(row=>row._id===status);
  const sent=pick('sent');
  return {
    sent:sent?.n||0,failed:pick('failed')?.n||0,skipped:pick('skipped')?.n||0,queued:pick('queued')?.n||0,
    segments:rows.reduce((sum,row)=>sum+row.segments,0),
    cost:Math.round(rows.reduce((sum,row)=>sum+row.cost,0)*100)/100,
  };
}
