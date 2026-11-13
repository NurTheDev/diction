/**
 * R3.11 — the owner's two staff decisions, as rules with no database in them.
 *
 *  1. Staff may send the visitor thank-you to leads they ticked — single row or a selection — and
 *     nothing else: no other source, no other template, no custom text, no retry of somebody else's
 *     batch. Admin and Super Admin keep every source and every template. The dialog is the only door:
 *     there is no staff bulk endpoint, and the server re-checks every one of these on each request,
 *     because a hidden button is a courtesy and this is the gate.
 *  2. Every sender has a daily ceiling of real sends (default 30, one setting, per user, Dhaka day),
 *     so a mis-clicked selection cannot spend a month's balance before anybody notices. The ceiling
 *     speaks Bangla when it is reached, and the dialog shows what is left of it before any send.
 *
 * Nothing here queries a collection: the policy reads only the role and the request, and the two
 * sentences are built from a number, so both can be proven without a database and reused by the
 * route, the dialog and the tests from one place.
 */
import {formatNumber} from '@/lib/admin/format';

/** The only sources a staff send may name: one visitor, or the visitors a screen listed. */
export const STAFF_SMS_SOURCES=['lead','leads'] as const;
/** The only template a staff send may use — the thank-you, never a fee rule and never free text. */
export const STAFF_SMS_TEMPLATE='visitor_thanks';
/** The ceiling when the settings row predates the field or was never written. */
export const DEFAULT_DAILY_SMS_LIMIT=30;
/**
 * Who the ceiling counts. It is a per-user guard against a mis-clicked selection spending a month's
 * balance, so today it covers every role that can stand at the dialog; one name in this list is the
 * whole switch if the owner ever wants an admin's bulk send left uncounted.
 */
export const DAILY_LIMIT_ROLES=['staff','admin','superadmin'] as const;
export function dailyLimitApplies(role:string):boolean{return (DAILY_LIMIT_ROLES as readonly string[]).includes(role)}

export interface SmsPolicyRefusal{code:'ROLE'|'STAFF_SOURCE'|'STAFF_TEMPLATE'|'STAFF_RETRY';messageBn:string;messageEn:string}

/** The request the route already parsed: read loosely, because the policy is the first thing to see it. */
export type SmsPolicyInput={mode?:unknown;source?:unknown;templateKey?:unknown;text?:unknown;[key:string]:unknown};

export function smsSendPolicyRefusal(role:string,input:SmsPolicyInput):SmsPolicyRefusal|null{
  if(role==='admin'||role==='superadmin')return null;
  if(role!=='staff'){
    return {code:'ROLE',
      messageBn:'এই ভূমিকা থেকে এসএমএস পাঠানোর অনুমতি নেই।',
      messageEn:'This role may not send SMS at all.'};
  }
  if(String(input.mode||'preview')==='retry'){
    return {code:'STAFF_RETRY',
      messageBn:'পুনরায় পাঠানোর অনুমতি স্টাফের নেই — ব্যর্থ ব্যাচ আবার পাঠানো অ্যাডমিনের কাজ।',
      messageEn:'Staff may not retry a failed batch — retrying is an admin action.'};
  }
  const source=String(input.source||'');
  if(source&&!(STAFF_SMS_SOURCES as readonly string[]).includes(source)){
    return {code:'STAFF_SOURCE',
      messageBn:'স্টাফ শুধু ভিজিটরদের এসএমএস পাঠাতে পারেন — বকেয়া বা রসিদের বার্তা নয়।',
      messageEn:'Staff may send to visitors only — not to dues, receipts or classes.'};
  }
  // The template has to be NAMED, and no text may ride along with it: `buildSmsPlan()` treats any
  // non-empty customText as the message and ignores the template, so "visitor_thanks plus my own words"
  // would otherwise be custom text wearing the thank-you's name.
  const templateKey=String(input.templateKey||'');
  const freeText=String(input.text||'').trim();
  if(templateKey!==STAFF_SMS_TEMPLATE||freeText){
    return {code:'STAFF_TEMPLATE',
      messageBn:'স্টাফ শুধু ভিজিটর ধন্যবাদ টেমপ্লেটটি পাঠাতে পারেন, নিজের লেখা বার্তা নয়।',
      messageEn:'Staff may send only the visitor thank-you template, never custom text.'};
  }
  return null;
}

/** What the ceiling is for this centre: the setting, or the default when the row predates the field. A setting of 0 means no ceiling. */
export function dailySmsLimitOf(settings:{dailySmsLimitPerUser?:number|null|undefined}):number{
  const value=Number(settings?.dailySmsLimitPerUser??DEFAULT_DAILY_SMS_LIMIT);
  if(!Number.isFinite(value)||value<0)return DEFAULT_DAILY_SMS_LIMIT;
  return Math.floor(value);
}

/** The dialog's own line about the ceiling, in the digits the operator reads. */
export function dailyLimitLine(limit:number,remaining:number,language:'bn'|'en'):string{
  const digits=language==='bn'?'bn':'en';
  return language==='bn'
    ?`আজকের এসএমএস সীমা: ${formatNumber(limit,digits)}টির মধ্যে ${formatNumber(remaining,digits)}টি বাকি`
    :`Today's SMS limit: ${formatNumber(remaining,digits)} of ${formatNumber(limit,digits)} left`;
}

/** The sentence the operator reads when the ceiling stops a send. */
export function dailyLimitReachedMessage(limit:number,language:'bn'|'en'):string{
  const digits=language==='bn'?'bn':'en';
  return language==='bn'
    ?`আজকের জন্য আপনার এসএমএস পাঠানোর সীমা (${formatNumber(limit,digits)}টি) শেষ। আগামীকাল আবার চেষ্টা করুন।`
    :`You have reached today's SMS limit (${formatNumber(limit,digits)} messages). Please try again tomorrow.`;
}
