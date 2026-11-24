/**
 * Visitor message schedules — the words and the day arithmetic, with no database in them.
 *
 * Client-safe on purpose: the schedule form, the server action and the list all read the same status
 * words and the same day rules, so a form cannot offer a date the action will refuse. The actual send
 * lives in `lead-schedule-db.ts`, which is server-only.
 *
 * The send window is fixed. The centre's queue job runs at 07:05 Asia/Dhaka (the end of the default
 * quiet hours), so "the 12th" means the 12th's send window — not a promise of 12:00:00. Saying that
 * plainly on the form is cheaper than a scheduler that pretends to minute precision it cannot keep.
 */
import {dhakaDay} from '@/lib/admin/today';

/** The daily send window, in Dhaka time. Must match the `sms-flush` cron in vercel.json. */
export const LEAD_SCHEDULE_SEND_TIME='07:05';
/** One schedule's audience ceiling. A campaign bigger than this goes class by class. */
export const LEAD_SCHEDULE_LIMIT=1000;
/** The message ceiling, the same 600 characters the send dialog accepts. */
export const LEAD_SCHEDULE_MAX_TEXT=600;

export const LEAD_SCHEDULE_STATUSES=['scheduled','sending','queued','sent','partial','failed','cancelled'] as const;
export type LeadScheduleStatus=typeof LEAD_SCHEDULE_STATUSES[number];

/** Catalog keys under `leads.schedules.status.*`. */
export const LEAD_SCHEDULE_STATUS_LABEL_KEYS:Record<LeadScheduleStatus,string>={
  scheduled:'schedules.status.scheduled',sending:'schedules.status.sending',queued:'schedules.status.queued',
  sent:'schedules.status.sent',partial:'schedules.status.partial',failed:'schedules.status.failed',
  cancelled:'schedules.status.cancelled',
};

/** Badge modifiers already in the stylesheet, by meaning rather than by colour name. */
export const LEAD_SCHEDULE_STATUS_BADGE:Record<LeadScheduleStatus,string>={
  scheduled:'pending',sending:'pending',queued:'pending',sent:'approved',partial:'pending',failed:'rejected',cancelled:'disabled',
};

/**
 * A failure is stored as a short machine word (never an exception, which can quote a number). This maps
 * the words the send pipeline can produce to a sentence the operator can act on; an unknown word falls
 * back to the generic "did not complete" line rather than printing a code at somebody.
 */
export function leadScheduleFailureKey(failure:string):string{
  if(!failure)return '';
  if(failure==='NO_RECIPIENTS')return 'schedules.failure.noRecipients';
  if(failure==='EMPTY_MESSAGE')return 'schedules.failure.emptyMessage';
  if(failure==='MISSING_INSTITUTE_PHONE')return 'schedules.failure.missingInstitutePhone';
  if(failure.startsWith('UNRENDERED_VARIABLE'))return 'schedules.failure.unrendered';
  if(failure==='TEMPLATE_NOT_FOUND')return 'schedules.failure.templateMissing';
  if(failure==='QUEUED')return 'schedules.failure.queued';
  return 'schedules.failure.sendFailed';
}

const DAY_PATTERN=/^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day in `YYYY-MM-DD`, or null. `2026-02-31` is not a day. */
export function leadScheduleDay(value:unknown):string|null{
  const text=String(value??'').trim();
  if(!DAY_PATTERN.test(text))return null;
  const [year,month,day]=text.split('-').map(Number);
  const probe=new Date(Date.UTC(year,month-1,day));
  if(probe.getUTCFullYear()!==year||probe.getUTCMonth()!==month-1||probe.getUTCDate()!==day)return null;
  return text;
}

/** The day at the send window, in Dhaka. Bangladesh has no daylight saving, so +06:00 is exact. */
export function leadScheduleInstant(day:string):Date{
  return new Date(`${day}T${LEAD_SCHEDULE_SEND_TIME}:00+06:00`);
}

export type LeadScheduleRefusal='INVALID_DAY'|'PAST_DAY'|'TOO_FAR'|'EMPTY_MESSAGE'|'TEXT_TOO_LONG'|'INVALID_TEMPLATE'|'MISSING_SUBJECT'|'INVALID_VARIABLE'|'INVALID_CLASS'|'NO_RECIPIENTS'|'TOO_MANY'|'NOT_FOUND'|'ALREADY_RUN';
export type LeadScheduleCheck={ok:true;day:string;at:Date}|{ok:false;code:LeadScheduleRefusal};

/** Whether a typed day can be scheduled, and the instant it means. */
export function checkLeadScheduleDay(value:unknown,now=new Date()):LeadScheduleCheck{
  const day=leadScheduleDay(value);
  if(!day)return {ok:false,code:'INVALID_DAY'};
  const today=dhakaDay(now);
  if(day<today)return {ok:false,code:'PAST_DAY'};
  /* A year out is a typo, not a plan: a schedule nobody will remember is worse than a refusal. */
  const ceiling=new Date(now.getTime()+366*24*60*60*1000);
  if(day>dhakaDay(ceiling))return {ok:false,code:'TOO_FAR'};
  return {ok:true,day,at:leadScheduleInstant(day)};
}

/** Whether the message half is usable. The template itself is checked against the catalog on the server. */
export function checkLeadScheduleMessage(templateKey:unknown,text:unknown):{ok:true}|{ok:false;code:LeadScheduleRefusal}{
  const key=String(templateKey??'').trim();
  if(!key)return {ok:false,code:'INVALID_TEMPLATE'};
  if(key!=='custom')return {ok:true};
  const body=String(text??'').trim();
  if(!body)return {ok:false,code:'EMPTY_MESSAGE'};
  if(body.length>LEAD_SCHEDULE_MAX_TEXT)return {ok:false,code:'TEXT_TOO_LONG'};
  return {ok:true};
}

/** A class filter as the form sends it: `''` for every class, or 1–12. */
export function leadScheduleClass(value:unknown):number|null|'INVALID'{
  const text=String(value??'').trim();
  if(!text)return null;
  const number=Number(text);
  return Number.isInteger(number)&&number>=1&&number<=12?number:'INVALID';
}


