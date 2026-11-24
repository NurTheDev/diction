/**
 * Visitor message schedules — the database half.
 *
 * This is deliberately a thin layer over machinery that already exists. A schedule stores *who* and
 * *what*, and the moment it is due it is handed to the same `resolveSmsSource` → `buildSmsPlan` →
 * `executeSmsPlan` pipeline every manual send uses. That is what makes the promises on the form true:
 *
 *   • a lead marked "do not contact" after the schedule was written is re-read and skipped at send
 *     time, with the same sentence the dialog would show;
 *   • quiet hours, batching, retries, cost and the `CenterSmsLog` audit rows are unchanged, because
 *     this file never talks to a provider itself;
 *   • a job that runs twice sends once: the request id is derived from the schedule's own id, and
 *     `CenterSmsBatch.requestId` is unique.
 *
 * The job claims a row with a conditional `findOneAndUpdate` before doing anything, so two cron
 * invocations cannot both spend the balance. A claim older than ten minutes is treated as abandoned
 * (the process died between claim and send) and is retried; idempotency still protects that retry.
 */
import 'server-only';
import mongoose,{type FilterQuery} from 'mongoose';
import {Lead} from '@/models/Lead';
import {LeadSmsSchedule} from '@/models/LeadSchedule';
import {CenterSmsBatch} from '@/models/CenterRecords';
import {audit} from '@/lib/admin/helpers';
import {autoRequestId} from '@/lib/center/sms-dialog';
import {buildSmsPlan,executeSmsPlan,loadSmsTemplates,type SmsSendSummary} from '@/lib/center/sms-send';
import {resolveSmsSource} from '@/lib/center/sms-source';
import {createSmsProvider,type SmsProvider} from '@/lib/center/sms-provider';
import {visitorTemplateFits} from './lead-sms';
import {contactableLeads} from './leads';
import {CONTACTABLE_LEAD_FILTER,LEAD_CLOSED_STATUSES} from './vocab';
import {
  checkLeadScheduleDay,checkLeadScheduleMessage,LEAD_SCHEDULE_LIMIT,LEAD_SCHEDULE_MAX_TEXT,
  leadScheduleClass,type LeadScheduleRefusal,type LeadScheduleStatus,
} from './lead-schedule';

export interface LeadScheduleInput{
  title?:unknown;
  day?:unknown;
  classGroup?:unknown;
  templateKey?:unknown;
  text?:unknown;
  subject?:unknown;
  createdBy?:string;
}

export type LeadScheduleWriteResult=
  |{ok:true;id:string;count:number;at:Date}
  |{ok:false;code:LeadScheduleRefusal};

/** The shape a screen reads. Deliberately no lead ids: a list has no use for them. */
export interface LeadScheduleRow{
  id:string;title:string;day:string;scheduledFor:Date;templateKey:string;text:string;subject:string;
  classGroup:number|null;expectedCount:number;status:LeadScheduleStatus;batchId:string|null;
  sentCount:number;failedCount:number;skippedCount:number;failure:string;ranAt:Date|null;createdAt:Date;
}

interface ScheduleDoc{
  _id:unknown;title?:string;day:string;scheduledFor:Date;templateKey:string;text?:string;subject?:string;
  classGroup?:number|null;expectedCount?:number;status:LeadScheduleStatus;batchId?:unknown;
  sentCount?:number;failedCount?:number;skippedCount?:number;failure?:string;ranAt?:Date|null;createdAt:Date;
  leadIds?:unknown[];updatedAt?:Date;
}

function toRow(doc:ScheduleDoc):LeadScheduleRow{
  return {
    id:String(doc._id),title:String(doc.title||''),day:doc.day,scheduledFor:doc.scheduledFor,
    templateKey:doc.templateKey,text:String(doc.text||''),subject:String(doc.subject||''),
    classGroup:doc.classGroup??null,expectedCount:Number(doc.expectedCount)||0,status:doc.status,
    batchId:doc.batchId?String(doc.batchId):null,
    sentCount:Number(doc.sentCount)||0,failedCount:Number(doc.failedCount)||0,
    skippedCount:Number(doc.skippedCount)||0,failure:String(doc.failure||''),ranAt:doc.ranAt||null,
    createdAt:doc.createdAt,
  };
}

/**
 * Write a schedule. Everything is checked again here even when the form checked it: the form is a
 * keyboard, and a schedule spends money later without anybody present to see the mistake.
 */
export async function createLeadSchedule(input:LeadScheduleInput):Promise<LeadScheduleWriteResult>{
  const day=checkLeadScheduleDay(input.day);
  if(day.ok===false)return {ok:false,code:day.code};

  const message=checkLeadScheduleMessage(input.templateKey,input.text);
  if(message.ok===false)return {ok:false,code:message.code};

  const templateKey=String(input.templateKey||'').trim();
  const text=templateKey==='custom'?String(input.text||'').trim().slice(0,LEAD_SCHEDULE_MAX_TEXT):'';
  const subject=String(input.subject||'').trim().slice(0,120);
  let needsSubject=/\{subject\}/.test(text);
  if(templateKey!=='custom'){
    const templates=await loadSmsTemplates();
    const found=templates.find(row=>row.key===templateKey&&row.active);
    // Only templates a visitor can actually fill are allowed: a fee chip on a lead can only end in
    // "a value did not render" after the operator has already picked everybody.
    if(!found||!visitorTemplateFits(found.variables))return {ok:false,code:'INVALID_TEMPLATE'};
    needsSubject=needsSubject||found.variables.includes('subject');
  }else{
    // A custom message may only name the two values a visitor send can supply. Catching a typo here
    // is kinder than a schedule that quietly fails on the morning it was meant to go out.
    for(const match of text.matchAll(/\{(\w+)\}/g)){
      if(!['institute_phone','subject'].includes(match[1]))return {ok:false,code:'INVALID_VARIABLE'};
    }
  }
  if(needsSubject&&!subject)return {ok:false,code:'MISSING_SUBJECT'};

  const classGroup=leadScheduleClass(input.classGroup);
  if(classGroup==='INVALID')return {ok:false,code:'INVALID_CLASS'};

  /* The audience is a snapshot of ids, but only of leads that may be contacted today. The final check
     is repeated at send time; this one is what the operator sees as the expected count. */
  const filter:FilterQuery<unknown>={status:{$nin:[...LEAD_CLOSED_STATUSES]}};
  if(classGroup)filter.classGroup=classGroup;
  const selection=await contactableLeads(filter,LEAD_SCHEDULE_LIMIT);
  /* A campaign bigger than one schedule can hold is refused rather than silently trimmed: the class
     count on the form is the whole class, and sending the newest thousand of it without saying so
     would be a promise the operator never made. */
  if(selection.recipients.length>=LEAD_SCHEDULE_LIMIT){
    const eligible=await Lead.countDocuments({$and:[{...CONTACTABLE_LEAD_FILTER},filter,{'phones.0':{$exists:true}}]});
    if(eligible>LEAD_SCHEDULE_LIMIT)return {ok:false,code:'TOO_MANY'};
  }
  const leadIds=selection.recipients.map(row=>row.id).filter(id=>mongoose.isValidObjectId(id));
  if(!leadIds.length)return {ok:false,code:'NO_RECIPIENTS'};

  const createdBy=input.createdBy&&mongoose.isValidObjectId(input.createdBy)?input.createdBy:null;
  const created=await LeadSmsSchedule.create({
    title:String(input.title||'').trim().slice(0,120),
    day:day.day,scheduledFor:day.at,
    templateKey,text,subject,
    leadIds,classGroup,expectedCount:leadIds.length,status:'scheduled',
    createdBy,
  });
  if(createdBy)await audit(createdBy,'lead.schedule',String(created._id));
  return {ok:true,id:String(created._id),count:leadIds.length,at:day.at};
}

/** What the page shows: work still waiting, then the most recent finished schedules. */
export async function listLeadSchedules():Promise<{upcoming:LeadScheduleRow[];recent:LeadScheduleRow[]}>{
  const [upcoming,recent]=await Promise.all([
    LeadSmsSchedule.find({status:{$in:['scheduled','sending','queued']}}).sort({scheduledFor:1}).limit(50).lean<ScheduleDoc[]>(),
    LeadSmsSchedule.find({status:{$in:['sent','partial','failed','cancelled']}}).sort({scheduledFor:-1}).limit(15).lean<ScheduleDoc[]>(),
  ]);
  return {upcoming:upcoming.map(toRow),recent:recent.map(toRow)};
}

/** Cancel a schedule that has not run. A schedule already sent is history and cannot be rewritten. */
export async function cancelLeadSchedule(id:unknown,actor:string):Promise<{ok:boolean;code?:LeadScheduleRefusal}>{
  const key=String(id||'');
  if(!mongoose.isValidObjectId(key))return {ok:false,code:'NOT_FOUND'};
  const result=await LeadSmsSchedule.updateOne({_id:key,status:'scheduled'},{$set:{status:'cancelled'}});
  if(!result.matchedCount)return {ok:false,code:'ALREADY_RUN'};
  await audit(actor,'lead.schedule.cancel',key);
  return {ok:true};
}

/** One due schedule, sent through the shared pipeline. Always resolves to a final state. */
async function runOne(doc:ScheduleDoc,now:Date,provider:SmsProvider):Promise<{sent:number;failed:number;skipped:number}>{
  const id=String(doc._id);
  const claimed=await LeadSmsSchedule.findOneAndUpdate(
    {_id:doc._id,status:doc.status},{$set:{status:'sending'}},{new:true},
  ).lean<ScheduleDoc|null>();
  if(!claimed)return {sent:0,failed:0,skipped:0};

  try{
    const ids=(claimed.leadIds||[]).map(String);
    const resolved=await resolveSmsSource({source:'leads',ids},now);
    // No ids is a plan with no recipients, never "everybody": the resolver's own rule.
    const plan=await buildSmsPlan({
      requestId:autoRequestId('lead-schedule',id),
      students:resolved.candidates,
      templateKey:claimed.templateKey==='custom'?'custom':claimed.templateKey,
      customText:claimed.templateKey==='custom'?claimed.text:undefined,
      audience:'guardian',onePerPhone:true,subjectKind:'lead',
      globalValues:{subject:claimed.subject||undefined},
      now,
    },provider);
    if(plan.blocked||!plan.recipientCount){
      await finish(id,{status:'failed',failure:plan.blocked||'NO_RECIPIENTS',ranAt:now});
      return {sent:0,failed:0,skipped:0};
    }
    // `skipDuplicates` is on for the same reason it is on for an automatic due reminder: a schedule
    // that runs twice already cannot send twice, and a family texted yesterday should not get the
    // same message again today just because two schedules overlap.
    const summary=await executeSmsPlan(plan,{provider,now,trigger:'scheduled',skipDuplicates:true});
    let status=statusOf(summary);
    let failure=status==='failed'?'SEND_FAILED':status==='queued'?'QUEUED':'';
    if(summary.status==='existing'){
      /* This schedule was claimed before and the process died between the claim and the bookkeeping.
         The batch is the truth: a batch still queued or sending is not "sent", and one that already
         finished keeps its own verdict. No second message is sent — the request id saw to that. */
      const row=await CenterSmsBatch.findById(summary.batchId).select('status').lean<{status?:string}|null>();
      status=row?.status==='done'?'sent':row?.status==='partial'?'partial':row?.status==='failed'?'failed':'queued';
      failure=status==='failed'?'SEND_FAILED':'';
    }
    await finish(id,{
      status,batchId:summary.batchId,sentCount:summary.sent,failedCount:summary.failed,
      skippedCount:summary.skipped,failure,ranAt:now,
    });
    return {sent:summary.sent,failed:summary.failed,skipped:summary.skipped};
  }catch(error){
    // Never the exception text: a driver error can quote the value it choked on, and on this path
    // that value can be a phone number. The name is enough to tell a timeout from a validation error.
    console.error('Scheduled visitor SMS failed',{name:(error as Error)?.name||'unknown'});
    await finish(id,{status:'failed',failure:'SEND_FAILED',ranAt:now});
    return {sent:0,failed:0,skipped:0};
  }
}

function statusOf(summary:SmsSendSummary):LeadScheduleStatus{
  if(summary.status==='queued')return 'queued';
  if(summary.failed>0)return summary.sent>0?'partial':'failed';
  return 'sent';
}

async function finish(id:string,set:Record<string,unknown>):Promise<void>{
  try{
    await LeadSmsSchedule.updateOne({_id:id},{$set:set});
  }catch(error){
    // The batch is already durable; a failed bookkeeping write is reported, not thrown at the cron.
    console.error('Scheduled visitor SMS could not record its result',{name:(error as Error)?.name||'unknown'});
  }
}

/**
 * A schedule whose plan was queued by quiet hours is finished by the flush, not by itself. Its batch
 * carries the truth (what was sent, what failed, what was skipped), so this copies the batch's final
 * state back onto the schedule once the flush has run. Rows still waiting stay `queued` — the next
 * flush will answer them.
 */
export async function reconcileLeadSchedules():Promise<number>{
  const rows=await LeadSmsSchedule.find({status:'queued',batchId:{$ne:null}})
    .select('batchId').limit(50).lean<{_id:unknown;batchId:unknown}[]>();
  if(!rows.length)return 0;
  const batches=await CenterSmsBatch.find({_id:{$in:rows.map(row=>row.batchId)}})
    .select('status sentCount failedCount skippedCount')
    .lean<{_id:unknown;status:string;sentCount?:number;failedCount?:number;skippedCount?:number}[]>();
  const byId=new Map(batches.map(batch=>[String(batch._id),batch]));

  let updated=0;
  for(const row of rows){
    const batch=byId.get(String(row.batchId));
    if(!batch)continue;
    const status:LeadScheduleStatus|null=
      batch.status==='done'?'sent':batch.status==='partial'?'partial':batch.status==='failed'?'failed':null;
    // `queued`/`sending` means the flush has not reached it yet: leave the row alone.
    if(!status)continue;
    await finish(String(row._id),{
      status,sentCount:batch.sentCount||0,failedCount:batch.failedCount||0,
      skippedCount:batch.skippedCount||0,failure:status==='failed'?'SEND_FAILED':'',ranAt:new Date(),
    });
    updated++;
  }
  return updated;
}

export interface LeadScheduleRunReport{due:number;sent:number;failed:number;skipped:number}

/**
 * Send every schedule whose day has arrived. Called only by the 07:05 flush, so the window on the form
 * is the window the send keeps. The query asks for everything whose time has passed — not only today's
 * — so a run the platform skipped is caught up by the next one instead of being lost.
 */
export async function runDueLeadSchedules(now:Date=new Date(),provider?:SmsProvider):Promise<LeadScheduleRunReport>{
  const client=provider||createSmsProvider();
  const abandoned=new Date(now.getTime()-10*60*1000);
  /* A cron that fires a few seconds early must not make a schedule wait a whole day: the window is a
     minute on a shared clock, not an exact instant. Five minutes can never reach yesterday's window,
     so this grace never sends a schedule a day early. */
  const dueBefore=new Date(now.getTime()+5*60*1000);
  const due=await LeadSmsSchedule.find({
    $or:[{status:'scheduled',scheduledFor:{$lte:dueBefore}},{status:'sending',updatedAt:{$lte:abandoned}}],
  }).sort({scheduledFor:1}).limit(25).lean<ScheduleDoc[]>();

  let sent=0,failed=0,skipped=0;
  for(const doc of due){
    const result=await runOne(doc,now,client);
    sent+=result.sent;failed+=result.failed;skipped+=result.skipped;
  }
  return {due:due.length,sent,failed,skipped};
}
