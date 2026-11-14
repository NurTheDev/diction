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
import bnMessages from '@/messages/bn.json';
import enMessages from '@/messages/en.json';

/** One catalog sentence with its numbers already in the reader's digits. */
function smsLine(language:'bn'|'en',key:'dailyLimitLine'|'dailyLimitReached',params:Record<string,string>):string{
  const template=(language==='bn'?bnMessages.sms:enMessages.sms)[key] as string;
  return template.replace(/\{(\w+)\}/g,(whole,name)=>params[name]??whole);
}

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

export interface SmsPolicyRefusal{code:'ROLE'|'STAFF_SOURCE'|'STAFF_TEMPLATE'|'STAFF_RETRY';messageKey:string}

/** The refusal sentence in one language, from the catalog — the route and the action both use it. */
export function smsPolicyMessage(refusal:SmsPolicyRefusal,language:'bn'|'en'):string{
  const policy=(language==='bn'?bnMessages.sms:enMessages.sms).policy as Record<string,string>;
  return policy[refusal.messageKey.slice('policy.'.length)]||refusal.messageKey;
}

/** The request the route already parsed: read loosely, because the policy is the first thing to see it. */
export type SmsPolicyInput={mode?:unknown;source?:unknown;templateKey?:unknown;text?:unknown;[key:string]:unknown};

export function smsSendPolicyRefusal(role:string,input:SmsPolicyInput):SmsPolicyRefusal|null{
  if(role==='admin'||role==='superadmin')return null;
  if(role!=='staff'){
    return {code:'ROLE',messageKey:'policy.ROLE'};
  }
  if(String(input.mode||'preview')==='retry'){
    return {code:'STAFF_RETRY',messageKey:'policy.STAFF_RETRY'};
  }
  const source=String(input.source||'');
  if(source&&!(STAFF_SMS_SOURCES as readonly string[]).includes(source)){
    return {code:'STAFF_SOURCE',messageKey:'policy.STAFF_SOURCE'};
  }
  // The template has to be NAMED, and no text may ride along with it: `buildSmsPlan()` treats any
  // non-empty customText as the message and ignores the template, so "visitor_thanks plus my own words"
  // would otherwise be custom text wearing the thank-you's name.
  const templateKey=String(input.templateKey||'');
  const freeText=String(input.text||'').trim();
  if(templateKey!==STAFF_SMS_TEMPLATE||freeText){
    return {code:'STAFF_TEMPLATE',messageKey:'policy.STAFF_TEMPLATE'};
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
  return smsLine(language,'dailyLimitLine',{limit:formatNumber(limit,digits),remaining:formatNumber(remaining,digits)});
}

/** The sentence the operator reads when the ceiling stops a send. */
export function dailyLimitReachedMessage(limit:number,language:'bn'|'en'):string{
  return smsLine(language,'dailyLimitReached',{limit:formatNumber(limit,language==='bn'?'bn':'en')});
}
