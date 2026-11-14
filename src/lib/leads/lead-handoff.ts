/**
 * R3.13 · The three hand-offs a visitor row owes the spec: convert to admission, book a trial, and
 * mark not interested with a reason. Nothing here touches a collection — the module answers three
 * questions a screen or a test can ask on its own:
 *
 *   • what may a hand-off form show BEFORE the operator writes anything? Only what the lead already
 *     holds, and never its number: the phone is masked on the form and copied from the lead's own
 *     record on the server when the operator presses the button. A prefill that printed digits would
 *     put them into served HTML, which is exactly what R3.8 proved the Visitors screens do not do.
 *   • what stops a hand-off before it writes? A binned lead, a lead that was already handed over, a
 *     trial slot that is full or in the past or switched off, and — for "not interested" — an empty
 *     reason, because a status that closes a promise without saying why is a row nobody can work.
 *   • which status does each hand-off land on? The vocabulary already carries all three
 *     (`admitted`, `trial_booked`, `not_interested`); this module names them in one place so a screen
 *     cannot drift into inventing a fourth.
 *
 * What this module deliberately does NOT do is guess: no date of birth, no gender, no guardian where
 * the lead has none, no subject a visitor never mentioned. Those stay empty on the form and are the
 * operator's to fill.
 *
 * And it imports nothing from `node:` — the standing rule for `src/lib/leads`, because client
 * components import these modules and a `node:` scheme in a browser bundle fails the production build.
 * The reference generator below uses Web Crypto for exactly that reason.
 */
import {maskPhone} from './vocab';

/** The statuses the three hand-offs land on — the vocabulary's own words, not new ones. */
export const HANDOFF_STATUS={admission:'admitted',trial:'trial_booked',notInterested:'not_interested'} as const;

/** A reason long enough to mean something and short enough to read in the timeline. */
export const NOT_INTERESTED_REASON_MIN=3;
export const NOT_INTERESTED_REASON_MAX=200;

export interface HandoffLead{
  id:string;
  leadId:string;
  studentName:string;
  guardianName:string;
  school:string;
  /** 1–12 or null; the admission and booking grades are strings over the same range. */
  classGroup:number|null;
  phones:{normalized:string;original:string}[];
  admission:string|null;
  trialBooking:string|null;
}

export type HandoffRefusalCode='MISSING'|'BINNED'|'ALREADY_CONVERTED'|'ALREADY_BOOKED'|'NO_PHONE'|'NO_REASON'|'REASON_TOO_SHORT'|'REASON_TOO_LONG'|'SLOT_FULL'|'SLOT_GONE'|'NO_CONSENT';
export interface HandoffRefusal{ok:false;code:HandoffRefusalCode;messageKey:string;messageParams:Record<string,string|number>}
const refusal=(code:HandoffRefusalCode,messageKey:string,messageParams:Record<string,string|number>={}):HandoffRefusal=>({ok:false,code,messageKey,messageParams});

/** The admission grade list is the intake schema's own: classes 4–12, nothing invented above or below. */
export const HANDOFF_GRADES=['4','5','6','7','8','9','10','11','12'] as const;
export function handoffGrade(classGroup:number|null):string{return classGroup!==null&&HANDOFF_GRADES.includes(String(classGroup) as typeof HANDOFF_GRADES[number])?String(classGroup):''}

export interface AdmissionPrefill{
  studentName:string;guardianName:string;school:string;grade:string;
  /** Printed, never submitted: the number the server will copy from the lead. */
  phoneMask:string;hasPhone:boolean;
}
export function admissionPrefill(lead:HandoffLead):AdmissionPrefill{
  const first=lead.phones[0]?.normalized||'';
  return {
    studentName:lead.studentName,
    guardianName:lead.guardianName,
    school:lead.school,
    grade:handoffGrade(lead.classGroup),
    phoneMask:first?maskPhone(first):'',
    hasPhone:!!first,
  };
}

export interface TrialPrefill{studentName:string;grade:string;phoneMask:string;hasPhone:boolean}
export function trialPrefill(lead:HandoffLead):TrialPrefill{
  const first=lead.phones[0]?.normalized||'';
  return {studentName:lead.studentName,grade:handoffGrade(lead.classGroup),phoneMask:first?maskPhone(first):'',hasPhone:!!first};
}

/** The reason behind "not interested": required, trimmed, and bounded. */
export function notInterestedReason(raw:unknown):{ok:true;reason:string}|HandoffRefusal{
  const reason=String(raw||'').trim().replace(/\s+/g,' ');
  if(!reason)return refusal('NO_REASON','errors.NO_REASON');
  if(reason.length<NOT_INTERESTED_REASON_MIN)return refusal('REASON_TOO_SHORT','errors.REASON_TOO_SHORT');
  if(reason.length>NOT_INTERESTED_REASON_MAX)return refusal('REASON_TOO_LONG','errors.REASON_TOO_LONG',{max:NOT_INTERESTED_REASON_MAX});
  return {ok:true,reason};
}

/** A slot an operator may book: switched on, still in the future, and with a seat left. */
export function bookableSlot(slot:{enabled?:boolean|null;startAt:Date|number|string;booked?:number|null;capacity?:number|null},now:Date=new Date()):boolean{
  const start=new Date(slot.startAt);
  if(slot.enabled===false)return false;
  if(Number.isNaN(start.getTime()))return false;
  if(start.getTime()<=now.getTime())return false;
  return (Number(slot.booked)||0)<(Number(slot.capacity)||0);
}

/**
 * The reference an admission or a booking gets: the intake screen's own shape (`ADM-2026-…`), so a
 * hand-off row and a public form row are indistinguishable in the list, in tracking and in export.
 */
export function handoffReference(prefix:'ADM'|'TRI',now:Date=new Date()):string{
  // Web crypto on purpose, not `node:crypto`: this module is imported by a client component for its
  // constants, and a `node:` scheme in a browser bundle fails the production build outright.
  const bytes=new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex=[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('').toUpperCase();
  return `${prefix}-${now.getUTCFullYear()}-${hex}`;
}

/** What stops a hand-off, read off the lead alone — the checks a screen can show before any write. */
export function handoffBlock(lead:Pick<HandoffLead,'admission'|'trialBooking'|'phones'>,kind:'admission'|'trial'):HandoffRefusal|null{
  if(kind==='admission'&&lead.admission)return refusal('ALREADY_CONVERTED','errors.ALREADY_CONVERTED');
  if(kind==='trial'&&lead.trialBooking)return refusal('ALREADY_BOOKED','errors.ALREADY_BOOKED');
  if(!lead.phones.length)return refusal('NO_PHONE','errors.NO_PHONE');
  return null;
}
