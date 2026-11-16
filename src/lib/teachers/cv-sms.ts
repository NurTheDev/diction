/**
 * R4 · Teacher candidates as the SMS pipeline sees them.
 *
 * Pure on purpose — no model, no query, no `server-only` import — for the same reason `lead-sms.ts` is
 * pure: this is the one place that turns a CV into the shape `resolveRecipients()` reads, so the CV list,
 * the Find-a-teacher screen and a bulk send all describe a candidate the same way, and the rule can be
 * proven without a database.
 *
 * The rules it carries:
 *
 *  • **A candidate is not a student and is not dressed up as one.** No fee holds, no `removed` state, no
 *    guardian/student pair of numbers: one number, the first one written on the CV. `status` is always
 *    `'active'`, because `removed` and `on_hold` are a student's FEE states and inventing one for an
 *    applicant would let a fee rule reach somebody who was never enrolled.
 *  • **Only templates a candidate can actually receive are offered.** `teacher_opening` needs `{subject}`
 *    — which the operator types, or which comes from the teaching need they saved — and
 *    `{institute_phone}`, which is the centre's own number and is supplied globally by the dialog. A
 *    template asking for a month, an amount or a class name can only end in the dialog's own "a value did
 *    not render" refusal, after the operator picked people and pressed send.
 *  • **A CV with no number is COUNTED, never quietly dropped**, so "9 will be texted" and "12 picked, 3
 *    without a number" are the same promise read two ways and either can be checked. There is no
 *    opt-out on a CV — nobody has applied and then asked not to be called — so the tally has no blocked
 *    column, and inventing one would print a zero that looks like a rule.
 */
import type {SmsCandidateStudent} from '@/lib/center/sms-recipients';

/** The chips a candidate send can fill: the centre's own number, and the subject the operator names. */
export const TEACHER_SMS_CHIPS=['institute_phone','subject'] as const;

/** True when a template asks for nothing a candidate can supply. */
export function teacherTemplateFits(variables:readonly string[]):boolean{
  return (variables||[]).every(chip=>(TEACHER_SMS_CHIPS as readonly string[]).includes(chip));
}

/** What a CV screen needs in hand before it can offer a send. Loaded server-side, passed as a prop. */
export interface TeacherSmsKit{
  templates:{key:string;name:string;body:string;active:boolean;edited:boolean}[];
  institutePhone:string;
}

/** The row shape the tally needs — and all a screen is allowed to hold about a number. */
export interface TeacherSmsRow{id:string;candidateId:string;name:string;phone:string;hasPhone:boolean}

/** Candidates → SMS candidates. The only translation between the two vocabularies in the codebase. */
export function teacherCandidates(rows:TeacherSmsRow[]):SmsCandidateStudent[]{
  return (rows||[]).map(row=>({
    id:row.id,
    nameBn:row.name,
    status:'active' as const,
    smsOptOut:false,
    guardianPhone:row.phone||'',
    studentPhone:'',
    altPhone:'',
    holds:[],
    // No per-candidate chips: the subject is typed by the operator (or read off a saved teaching need),
    // and the institute's number is the dialog's own global value.
    values:{},
  }));
}

export interface TeacherSmsTally{
  /** Candidates that would actually be reached: holding a number to reach them on. */
  sendable:number;
  /** Candidates with no number on file. Reported, never sent. */
  withoutPhone:number;
}

/** What a screen says out loud before anybody presses send. */
export function teacherSmsTally(rows:readonly {hasPhone:boolean}[]):TeacherSmsTally{
  let sendable=0,withoutPhone=0;
  for(const row of rows||[]){
    if(row.hasPhone)sendable+=1;
    else withoutPhone+=1;
  }
  return {sendable,withoutPhone};
}
