/**
 * Visitor leads as the SMS pipeline sees them (R3.9).
 *
 * Pure on purpose — no model, no query, no `server-only` import. This is the one place that turns a lead
 * into the shape `resolveRecipients()` reads, so the Visitors list, the detail drawer and a bulk send all
 * describe a visitor the same way, and so the rule can be proven without a database.
 *
 * The rules it carries, and why each one is here rather than in the screen that needed it:
 *
 *  • A lead is not a student and is not dressed up as one. It has no fee holds, no `removed` state and no
 *    guardian/student pair of numbers — it has ONE number, the first written on the sheet, and a sticky
 *    "do not contact" mark. The mark becomes the pipeline's own opt-out switch, which means the sentence
 *    an operator reads for an excluded visitor is the one the pipeline already writes
 *    ("অপ্ট-আউট / যোগাযোগ করবেন না"), not a new lead-specific wording that could drift from it.
 *  • `status` is `'active'`, always. `removed` and `on_hold` are a student's FEE states; inventing one for
 *    a visitor would let a fee rule reach somebody who was never enrolled, and `held` would then silently
 *    drop a thank-you that has no amount in it anyway.
 *  • Only templates a visitor can actually receive are offered. A lead has no fee, no month, no amount and
 *    no enrolled-class name, so a template asking for any of those can only end in the dialog's own
 *    "a value did not render" refusal — a dead end after the operator picked people and pressed send.
 *  • Blocked and phoneless leads are COUNTED, never quietly dropped, because "৩৭ জনকে পাঠানো হবে" and
 *    "৪২ জন বাছা হয়েছে, ৫ জন বাদ" are different promises and only the second one can be checked.
 */
import type {SmsCandidateStudent} from '@/lib/center/sms-recipients';
import type {LeadSmsRow} from './leads';

/**
 * The chips a visitor send can fill: the center's own number (a global value the dialog reads from the
 * center's settings) and a subject the operator types. `visitor_thanks` needs only the first, which is
 * why it is always offered and is the default for every lead entry point.
 */
export const VISITOR_SMS_CHIPS=['institute_phone','subject'] as const;

/** True when a template asks for nothing a lead cannot supply. */
export function visitorTemplateFits(variables:readonly string[]):boolean{
  return (variables||[]).every(chip=>(VISITOR_SMS_CHIPS as readonly string[]).includes(chip));
}

/**
 * What a lead screen needs in hand before it can offer a send: the template catalog narrowed to the ones a
 * visitor can receive, and the center's own number (the one value `visitor_thanks` asks for). Loaded
 * server-side by `visitorSmsDialogData()` and passed down as a plain prop — the browser never asks for the
 * catalog, and an inactive template is simply not in the list.
 */
export interface LeadSmsKit{
  templates:{key:string;name:string;body:string;active:boolean;edited:boolean}[];
  institutePhone:string;
}

/** Leads → SMS candidates. The only translation between the two vocabularies in the codebase. */
export function leadCandidates(rows:LeadSmsRow[]):SmsCandidateStudent[]{
  return (rows||[]).map(row=>({
    id:row.id,
    nameBn:row.studentName,
    status:'active' as const,
    smsOptOut:!row.contactable,
    guardianPhone:row.phone||'',
    studentPhone:'',
    altPhone:'',
    holds:[],
    // No per-lead chips: a visitor send carries no class, month or amount, and the one value its default
    // template needs (`institute_phone`) is the center's, supplied globally by the dialog.
    values:{},
  }));
}

/** The minimum a screen has to know about a row for the tally below. */
export interface LeadSmsRowShape{contactable:boolean;hasPhone:boolean}

export interface LeadSmsTally{
  /** Leads that would actually be reached: contactable AND holding a number. */
  sendable:number;
  /** Leads excluded because they may not be contacted. Reported, never sent. */
  blocked:number;
  /** Leads that may be contacted but hold no number at all. */
  withoutPhone:number;
}

/**
 * What a screen says out loud before anybody presses send. Blocked is counted separately from
 * phoneless because they are different problems with different fixes: one is a promise the center made
 * to a person, the other is a gap in the sheet somebody can still fill in.
 */
export function leadSmsTally(rows:readonly LeadSmsRowShape[]):LeadSmsTally{
  let sendable=0,blocked=0,withoutPhone=0;
  for(const row of rows||[]){
    if(!row.contactable)blocked++;
    else if(!row.hasPhone)withoutPhone++;
    else sendable++;
  }
  return {sendable,blocked,withoutPhone};
}
