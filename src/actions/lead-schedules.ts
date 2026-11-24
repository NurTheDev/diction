'use server';
/**
 * Visitor message schedules — the two server actions the screen needs.
 *
 * Authorization is `requireAdmin()`: a schedule spends money later with nobody watching, so writing
 * one is the same door as sending SMS directly. Staff keep their one thank-you send in the dialog;
 * a campaign is an administrator's tool.
 *
 * The rules themselves live in `src/lib/leads/lead-schedule-db.ts`. This file only turns a form into
 * that call and its refusal code into one sentence in the reader's language and digits.
 */
import {revalidatePath} from 'next/cache';
import {getLocale,getTranslations} from 'next-intl/server';
import {requireAdmin} from '@/lib/admin/guard';
import {formatNumber} from '@/lib/admin/format';
import {cancelLeadSchedule,createLeadSchedule} from '@/lib/leads/lead-schedule-db';
import {LEAD_SCHEDULE_LIMIT,LEAD_SCHEDULE_MAX_TEXT,type LeadScheduleRefusal} from '@/lib/leads/lead-schedule';
import type {ActionState} from '@/actions/admin';

async function sentence(code:LeadScheduleRefusal|undefined):Promise<string>{
  const t=await getTranslations('leads');
  let language:'bn'|'en'='bn';
  try{language=(await getLocale())==='en'?'en':'bn'}catch{/* outside a request the default is fine */}
  const digits=language==='en'?'en':'bn';
  const key=
    code==='PAST_DAY'?'schedules.errors.dayPast'
    :code==='TOO_FAR'?'schedules.errors.dayFar'
    :code==='INVALID_DAY'?'schedules.errors.dayInvalid'
    :code==='EMPTY_MESSAGE'?'schedules.errors.messageEmpty'
    :code==='TEXT_TOO_LONG'?'schedules.errors.messageLong'
    :code==='INVALID_TEMPLATE'?'schedules.errors.templateInvalid'
    :code==='MISSING_SUBJECT'?'schedules.errors.subjectMissing'
    :code==='INVALID_VARIABLE'?'schedules.errors.variableInvalid'
    :code==='INVALID_CLASS'?'schedules.errors.classInvalid'
    :code==='NO_RECIPIENTS'?'schedules.errors.noRecipients'
    :code==='TOO_MANY'?'schedules.errors.tooMany'
    :code==='ALREADY_RUN'||code==='NOT_FOUND'?'schedules.errors.notWaiting'
    :'schedules.errors.didNotGoThrough';
  return t(key,{
    max:formatNumber(LEAD_SCHEDULE_MAX_TEXT,digits),
    limit:formatNumber(LEAD_SCHEDULE_LIMIT,digits),
  });
}

function refresh():void{
  for(const locale of ['bn','en']){
    revalidatePath(`/${locale}/admin/leads/schedules`);
    revalidatePath(`/${locale}/admin/leads`);
  }
}

/** Schedule one message for a class (or every class) on a future day. */
export async function createLeadScheduleAction(_:ActionState,form:FormData):Promise<ActionState>{
  let admin;
  try{admin=await requireAdmin()}catch{return {status:'error',reason:'unavailable'}}
  try{
    const result=await createLeadSchedule({
      title:form.get('title'),day:form.get('day'),classGroup:form.get('classGroup'),
      templateKey:form.get('templateKey'),text:form.get('text'),subject:form.get('subject'),
      createdBy:admin.id,
    });
    if(result.ok===false)return {status:'error',reason:result.code==='PAST_DAY'?'past':'invalid',message:await sentence(result.code)};
    refresh();
    const t=await getTranslations('leads');
    let language:'bn'|'en'='bn';
    try{language=(await getLocale())==='en'?'en':'bn'}catch{/* default */}
    const digits=language==='en'?'en':'bn';
    return {status:'ok',message:t('schedules.created',{count:formatNumber(result.count,digits)})};
  }catch(error){
    console.error('Lead schedule create failed',{name:(error as Error)?.name||'unknown'});
    return {status:'error',reason:'unavailable',message:await sentence(undefined)};
  }
}

/** Cancel a schedule that has not run yet. */
export async function cancelLeadScheduleAction(_:ActionState,form:FormData):Promise<ActionState>{
  let admin;
  try{admin=await requireAdmin()}catch{return {status:'error',reason:'unavailable'}}
  try{
    const result=await cancelLeadSchedule(form.get('id'),admin.id);
    if(!result.ok)return {status:'error',reason:'invalid',message:await sentence(result.code)};
    refresh();
    const t=await getTranslations('leads');
    return {status:'ok',message:t('schedules.cancelled')};
  }catch(error){
    console.error('Lead schedule cancel failed',{name:(error as Error)?.name||'unknown'});
    return {status:'error',reason:'unavailable',message:await sentence(undefined)};
  }
}
