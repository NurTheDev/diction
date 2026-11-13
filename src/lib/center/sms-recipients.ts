/**
 * Recipient resolution for SMS sending (R2). Pure module — no database, no server-only import —
 * so every rule can be unit-tested on plain objects and reused by the dialog preview, the batch
 * action and the daily auto-send job alike.
 *
 * Rules, straight from the spec:
 *   • never send to removed students;
 *   • respect smsOptOut (the single "opted out / do not contact" switch on the student record);
 *   • held students receive NON-fee messages only — a fee demand never goes to a held family;
 *   • normalize phones (01XXXXXXXXX) and dedupe;
 *   • skipped numbers are reported WITH a reason, because the dialog must show them;
 *   • optional "one message per phone for siblings".
 */
import {normalizePhone} from './phone';
import {SMS_VARIABLES,type SmsVariable} from './sms-templates';

export type SmsAudience='guardian'|'student'|'both';

export const SMS_SKIP_REASONS=['missing_phone','invalid_phone','opted_out','removed','held','duplicate','missing_value'] as const;
export type SmsSkipReason=typeof SMS_SKIP_REASONS[number];

/** What the operator reads for each reason, in both languages. */
export const SMS_SKIP_LABELS:Record<SmsSkipReason,{bn:string;en:string}>={
  missing_phone:{bn:'নম্বর নেই',en:'No phone number'},
  invalid_phone:{bn:'নম্বর সঠিক নয়',en:'Invalid number'},
  opted_out:{bn:'অপ্ট-আউট / যোগাযোগ করবেন না',en:'Opted out / do not contact'},
  removed:{bn:'সরানো শিক্ষার্থী',en:'Removed student'},
  held:{bn:'হোল্ডে আছেন; ফি-সংশ্লিষ্ট বার্তা পাঠানো হয়নি',en:'On hold; fee message not sent'},
  duplicate:{bn:'একই নম্বরে একই বার্তা আগেই আছে',en:'Same message to this number already queued'},
  missing_value:{bn:'বার্তার তথ্য অসম্পূর্ণ',en:'Message data incomplete'},
};

export interface SmsHoldPeriod{start:{year:number;month:number};end?:{year:number;month:number}|null}

export interface SmsCandidateStudent{
  id:string;
  /** Display name; Bangla first, matching how the rest of the admin UI renders names. */
  nameBn:string;
  status:'active'|'on_hold'|'removed';
  smsOptOut?:boolean;
  guardianPhone?:string;
  studentPhone?:string;
  altPhone?:string;
  holds?:SmsHoldPeriod[];
  /** Per-student template values ({month}, {due_amount}, {amount}, {receipt_no}, {class}, …). */
  values?:Partial<Record<SmsVariable,string|number|null>>;
}

export interface SmsRecipient{
  phone:string;
  /** Every student this message covers — one for a normal send, several for a grouped sibling send. */
  studentIds:string[];
  studentName:string;
  values:Partial<Record<SmsVariable,string|number|null>>;
  /** True when several siblings were merged into one message. */
  grouped:boolean;
}

export interface SmsSkipped{studentId:string;studentName:string;phone:string;reason:SmsSkipReason}

export interface ResolveOptions{
  audience:SmsAudience;
  /** True when the template is about fees — held students are then excluded. */
  feeMessage:boolean;
  /** "One message per phone for siblings". */
  onePerPhone?:boolean;
  /** Values shared by every recipient ({institute_phone}, {subject}, {due_date}, …). */
  globalValues?:Partial<Record<SmsVariable,string|number|null>>;
  now?:Date;
}

export interface ResolvedRecipients{
  recipients:SmsRecipient[];
  skipped:SmsSkipped[];
  /** Phones where sibling grouping was requested but refused, with the reason — shown in the dialog. */
  groupingRefused:{phone:string;reason:string}[];
}

const MONEY_VARIABLES:SmsVariable[]=['due_amount','amount'];

const BANGLA_DIGITS='০১২৩৪৫৬৭৮৯';
const toAsciiDigits=(value:string):string=>value.replace(/[০-৯]/g,c=>String(BANGLA_DIGITS.indexOf(c)));
const toBanglaDigits=(value:string):string=>value.replace(/[0-9]/g,c=>BANGLA_DIGITS[Number(c)]);
/**
 * Money arrives already localized: a Bangla message wants "৩০০০ টাকা", so callers format the amount
 * before it becomes a chip value. Summing those amounts for one shared number must therefore read
 * Bangla digits too — otherwise every real sibling send would be "ambiguous" and silently split into
 * two messages, which is the one thing one-message-per-phone exists to prevent.
 */
function parseLocalizedAmount(value:string|number):number{
  const text=String(value).trim();
  return Number(toAsciiDigits(text));
}

/** Dhaka calendar month index, matching src/lib/center/month-status.ts semantics. */
function monthIndex(date:Date):number{
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit'}).formatToParts(date);
  const year=Number(parts.find(p=>p.type==='year')?.value),month=Number(parts.find(p=>p.type==='month')?.value);
  return year*12+month-1;
}

/** A hold with no end date is open-ended; a hold counts when it covers the current Dhaka month. */
export function isHeldNow(student:SmsCandidateStudent,now:Date=new Date()):boolean{
  if(student.status==='on_hold')return true;
  if(student.status!=='active')return false;
  const current=monthIndex(now);
  return (student.holds||[]).some(hold=>{
    const start=hold.start.year*12+hold.start.month-1;
    const end=hold.end?hold.end.year*12+hold.end.month-1:undefined;
    return start<=current&&(end===undefined||current<=end);
  });
}

function phonesFor(student:SmsCandidateStudent,audience:SmsAudience):string[]{
  if(audience==='guardian')return [student.guardianPhone||'',student.altPhone||''];
  if(audience==='student')return [student.studentPhone||''];
  return [student.guardianPhone||'',student.studentPhone||'',student.altPhone||''];
}

/**
 * Merge the chips of every student sharing one phone. Returns null — "do not group" — whenever a
 * merged message could not be true for all of them: a sibling missing a value the others have, a
 * non-numeric amount, or two different classes/receipts. Refusing is the safe answer: each student
 * then gets their own correct message instead of one plausible-looking wrong total.
 */
function mergeValues(list:SmsCandidateStudent[],globalValues:Partial<Record<SmsVariable,string|number|null>>):Partial<Record<SmsVariable,string|number|null>>|null{
  const merged:Partial<Record<SmsVariable,string|number|null>>={...globalValues};
  for(const variable of SMS_VARIABLES){
    if(variable==='student_name')continue;
    const all=list.map(s=>s.values?.[variable]);
    const filled=all.filter(v=>v!==undefined&&v!==null&&String(v).trim()!=='');
    if(!filled.length)continue;
    // Some sibling lacks a chip the others have — we cannot state one honest sentence for the group.
    if(list.length>1&&filled.length!==list.length)return null;
    if(MONEY_VARIABLES.includes(variable)){
      const numbers=filled.map(value=>parseLocalizedAmount(value as string|number));
      if(numbers.some(n=>!Number.isFinite(n)))return null;
      if(list.length===1){merged[variable]=filled[0] as string|number;continue}
      const total=numbers.reduce((a,b)=>a+b,0);
      // Answer in the script the operator's own values used, so the merged message still reads Bangla.
      const bangla=filled.some(v=>/[০-৯]/.test(String(v)));
      merged[variable]=bangla?toBanglaDigits(String(total)):total;
    }else{
      // Non-money chips: siblings share a guardian phone but not necessarily a class or a receipt.
      const unique=new Set(filled.map(v=>String(v).trim()));
      if(unique.size!==1)return null;
      merged[variable]=filled[0] as string|number;
    }
  }
  return merged;
}

interface SmsCandidate{student:SmsCandidateStudent;phone:string;values:Partial<Record<SmsVariable,string|number|null>>}

/**
 * Turn a list of students into the exact set of messages to send, plus every number that was
 * dropped and why. Deterministic and side-effect free: the dialog preview and the real send call
 * this same function, so what the operator approves is what goes out.
 */
export function resolveRecipients(students:SmsCandidateStudent[],options:ResolveOptions):ResolvedRecipients{
  const now=options.now||new Date();
  const globalValues=options.globalValues||{};
  const skipped:SmsSkipped[]=[];
  const groupingRefused:{phone:string;reason:string}[]=[];
  const candidates:SmsCandidate[]=[];

  for(const student of students){
    const skip=(reason:SmsSkipReason,phone:string):void=>{skipped.push({studentId:student.id,studentName:student.nameBn,phone,reason})};
    if(student.status==='removed'){skip('removed','');continue}
    if(student.smsOptOut){skip('opted_out','');continue}
    const held=isHeldNow(student,now);
    if(held&&options.feeMessage){skip('held','');continue}

    const raw=phonesFor(student,options.audience);
    let usable=0,sawText=false;
    for(const value of raw){
      const text=String(value||'').trim();
      if(!text){continue}
      sawText=true;
      const phone=normalizePhone(text);
      if(!phone){skip('invalid_phone',text);continue}
      usable++;
      candidates.push({student,phone,values:{...globalValues,...(student.values||{}),student_name:student.nameBn}});
    }
    // "No number" is only true when there was no text at all. A number that failed validation is
    // reported once, as invalid — two contradictory reasons for one student would be noise.
    if(!usable&&!sawText)skip('missing_phone','');
  }

  // Dedupe identical (phone, student) pairs — "both" can list the same number twice.
  const seenPair=new Set<string>();
  const deduped=candidates.filter(candidate=>{
    const key=`${candidate.phone}:${candidate.student.id}`;
    if(seenPair.has(key))return false;
    seenPair.add(key);
    return true;
  });

  if(!options.onePerPhone){
    // One message per student per phone. A phone shared by siblings still receives one per child,
    // so mark the repeats as duplicates only when the message body would be identical.
    const recipients:SmsRecipient[]=[];
    const seenMessage=new Set<string>();
    for(const candidate of deduped){
      const key=`${candidate.phone}:${JSON.stringify(candidate.values)}`;
      if(seenMessage.has(key)){
        skipped.push({studentId:candidate.student.id,studentName:candidate.student.nameBn,phone:candidate.phone,reason:'duplicate'});
        continue;
      }
      seenMessage.add(key);
      recipients.push({phone:candidate.phone,studentIds:[candidate.student.id],studentName:candidate.student.nameBn,values:candidate.values,grouped:false});
    }
    return {recipients,skipped,groupingRefused};
  }

  // Sibling grouping: one message per phone. Refuse the merge (and send per student instead) when
  // the merged text could state a wrong amount or mix two different classes/receipts.
  const byPhone=new Map<string,SmsCandidate[]>();
  for(const candidate of deduped){
    const list=byPhone.get(candidate.phone)||[];
    list.push(candidate);
    byPhone.set(candidate.phone,list);
  }
  const recipients:SmsRecipient[]=[];
  for(const [phone,list] of byPhone){
    const merged=mergeValues(list.map(c=>c.student),globalValues);
    if(!merged){
      groupingRefused.push({phone,reason:'siblings differ on amount/class, so each gets their own message'});
      for(const candidate of list)recipients.push({phone,studentIds:[candidate.student.id],studentName:candidate.student.nameBn,values:candidate.values,grouped:false});
      continue;
    }
    const names=list.map(c=>c.student.nameBn);
    recipients.push({
      phone,
      studentIds:list.map(c=>c.student.id),
      studentName:names.join(' ও '),
      values:{...merged,student_name:names.join(' ও ')},
      grouped:list.length>1,
    });
  }
  return {recipients,skipped,groupingRefused};
}

/** Batch a flat list into provider-sized chunks (about 100 per call). */
export function chunkRecipients<T>(items:T[],size:number):T[][]{
  const out:T[][]=[];
  for(let index=0;index<items.length;index+=size)out.push(items.slice(index,index+size));
  return out;
}
