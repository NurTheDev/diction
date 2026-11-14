/**
 * SMS templates (R2). Pure module: no database, no server-only import, so the catalog and the
 * variable substitution can be unit-tested directly. Database overrides (CenterSmsTemplate) are
 * merged on top by src/lib/center/sms-send.ts — message content stays Bangla, and every default
 * below is the exact wording the owner's spec lists.
 */

/** The variable chips the dialog offers. Never hand-copy this list into a component. */
/**
 * A template's name travels as a catalog key (`templates.due_reminder`) until an operator writes
 * their own in the database, so whoever paints a name resolves it against the `sms` namespace's
 * `templates` group. A name that is not a key reads as itself: that is an operator's own wording,
 * and it is the only case where the stored string is the sentence.
 */
export function smsTemplateName(names:Record<string,string>,value:string):string{return names[value]||value}

export const SMS_VARIABLES=['student_name','class','month','due_amount','receipt_no','amount','due_date','institute_phone','subject'] as const;
export type SmsVariable=typeof SMS_VARIABLES[number];

export type SmsTemplateKey='payment_receipt'|'due_reminder'|'pending_reminder'|'visitor_thanks'|'teacher_opening'|'exam_result'|'custom'|'notice';

export interface SmsTemplateDefault{
  key:SmsTemplateKey;
  name:string;
  /** Bangla body; the spec keeps message content in Bangla even on the English UI. */
  body:string;
  variables:SmsVariable[];
  /** Batch purpose stored on CenterSmsBatch. */
  purpose:'payment_receipt'|'due_reminder'|'exam_result'|'visitor_thanks'|'teacher_opening'|'notice'|'custom';
  /** True for a message about fees — held students only receive those. */
  feeRelated:boolean;
  /** Auto-send is offered for this template; every auto-send toggle ships OFF. */
  autoSendKey?:'autoReceipt'|'autoResult'|'autoDue';
}

/* Template BODIES are SMS message content and stay Bangla on purpose (the owner's allow-list);
   only their NAMES are catalog keys, resolved against the sms namespace by whoever paints them. */
// i18n-scan-allow-start: SMS message bodies — content, not interface.
export const SMS_TEMPLATE_DEFAULTS:SmsTemplateDefault[]=[
  {key:'payment_receipt',name:'templates.payment_receipt',body:'ডিকশন কোচিং: {student_name} এর {month} মাসের {amount} টাকা পেয়েছি। রসিদ নং {receipt_no}। ধন্যবাদ।',variables:['student_name','month','amount','receipt_no'],purpose:'payment_receipt',feeRelated:true,autoSendKey:'autoReceipt'},
  {key:'due_reminder',name:'templates.due_reminder',body:'ডিকশন কোচিং: প্রিয় অভিভাবক, {student_name} এর {month} মাসের {due_amount} টাকা বকেয়া আছে। অনুগ্রহ করে দ্রুত পরিশোধ করুন। যোগাযোগ: {institute_phone}',variables:['student_name','month','due_amount','institute_phone'],purpose:'due_reminder',feeRelated:true,autoSendKey:'autoDue'},
  {key:'pending_reminder',name:'templates.pending_reminder',body:'ডিকশন কোচিং: {student_name} এর {month} মাসের {amount} টাকা আগামী {due_date} তারিখের মধ্যে দিলে ভালো হয়। ধন্যবাদ।',variables:['student_name','month','amount','due_date'],purpose:'due_reminder',feeRelated:true},
  {key:'visitor_thanks',name:'templates.visitor_thanks',body:'ডিকশন কোচিং-এ আসার জন্য ধন্যবাদ। ভর্তি সংক্রান্ত তথ্যের জন্য যোগাযোগ করুন: {institute_phone}',variables:['institute_phone'],purpose:'visitor_thanks',feeRelated:false},
  {key:'teacher_opening',name:'templates.teacher_opening',body:'ডিকশন কোচিং: আমাদের {subject} বিষয়ে শিক্ষক প্রয়োজন। আগ্রহী হলে যোগাযোগ করুন: {institute_phone}',variables:['subject','institute_phone'],purpose:'teacher_opening',feeRelated:false},
  {key:'exam_result',name:'templates.exam_result',body:'ডিকশন কোচিং: {student_name} এর ফলাফল প্রকাশ হয়েছে। বিস্তারিত দেখতে পোর্টেলে লগইন করুন। যোগাযোগ: {institute_phone}',variables:['student_name','institute_phone'],purpose:'exam_result',feeRelated:false,autoSendKey:'autoResult'},
  {key:'custom',name:'templates.custom',body:'',variables:[],purpose:'custom',feeRelated:false},
  {key:'notice',name:'templates.notice',body:'ডিকশন কোচিং: {subject}',variables:['subject'],purpose:'notice',feeRelated:false},
];
// i18n-scan-allow-end

export const SMS_TEMPLATE_KEYS=SMS_TEMPLATE_DEFAULTS.map(t=>t.key);

export function defaultTemplate(key:string):SmsTemplateDefault|undefined{
  return SMS_TEMPLATE_DEFAULTS.find(t=>t.key===key);
}

export function isSmsTemplateKey(value:unknown):value is SmsTemplateKey{
  return typeof value==='string'&&SMS_TEMPLATE_KEYS.includes(value as SmsTemplateKey);
}

/**
 * Substitute `{chip}` variables. A known variable with an empty value becomes an empty string;
 * an UNKNOWN chip is left in the text on purpose, so a typo is visible to the operator in the
 * preview instead of silently sending a half-rendered message.
 */
export function renderSmsTemplate(body:string,values:Partial<Record<SmsVariable,string|number|null|undefined>>):string{
  return String(body).replace(/\{(\w+)\}/g,(chip,name:string)=>{
    if(!(SMS_VARIABLES as readonly string[]).includes(name))return chip;
    const raw=values[name as SmsVariable];
    if(raw===null||raw===undefined)return '';
    return String(raw).trim();
  });
}

/** Chips a body actually uses, in first-appearance order, restricted to the known set. */
export function templateVariablesOf(body:string):SmsVariable[]{
  const seen=new Set<SmsVariable>();
  for(const match of String(body).matchAll(/\{(\w+)\}/g)){
    const name=match[1];
    if((SMS_VARIABLES as readonly string[]).includes(name))seen.add(name as SmsVariable);
  }
  return [...seen];
}

/** True when the body still contains a chip we do not know how to fill. */
export function hasUnknownChip(body:string):boolean{
  return [...String(body).matchAll(/\{(\w+)\}/g)].some(m=>!(SMS_VARIABLES as readonly string[]).includes(m[1]));
}
