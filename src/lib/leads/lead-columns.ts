/**
 * R3 · Visitor leads — reading the sheet's other columns.
 *
 * The Visitor sheet's own columns are Date, Name, Class, Institute (school), Number, Group
 * (Science/Arts/Commerce), Shift, Comments and Medium (Bangla Version / English Version), written in
 * Bangla or English, in any order, sometimes with a column nobody named. Two rules from the brief live
 * here:
 *
 *   • A **value** is mapped only from a lookup table. `বিজ্ঞান`, `Sci` and `Science` all mean science;
 *     `Other` means nothing, and an unmapped cell becomes `null` plus a flag for the owner to settle —
 *     never a default, because a defaulted medium is a wrong textbook.
 *   • A **header** is mapped only from a synonym table. A column this app has no reading for is not
 *     dropped and not attached to the nearest field: it is handed back to the owner as a question
 *     ("what is in this column?"), which is what the import wizard asks in Wave C. `Column 1` and
 *     `Column 2` are the shape a spreadsheet gives a column nobody named, so they get their own
 *     message.
 */
import type {LeadGroup,LeadMedium,LeadShift,LeadSource} from './vocab';
import {renderLeadPair} from './lead-message';

/* Sheets arrive written in Bangla digits as often as ASCII ones, so reading a value always starts by
   turning ৭ into 7. The table is code points because a digit is data, not a word anybody reads. */
const BANGLA_DIGITS=/[\u09e6-\u09ef]/g;
const clean=(raw:unknown):string=>String(raw==null?'':raw).replace(BANGLA_DIGITS,c=>String(c.charCodeAt(0)-0x09e6)).replace(/\s+/g,' ').trim().toLowerCase();

/* i18n-scan-allow-start — every table below is a synonym list for what a SPREADSHEET writes, not
   interface text: `বিজ্ঞান` has to be here for the reader to recognize it. What the owner reads is a
   catalog key (LEAD_SHEET_FIELD_LABEL_KEYS, unmappedHeaderQuestion). */

const GROUPS:Record<string,LeadGroup>={
  science:'science',sci:'science','বিজ্ঞান':'science',
  arts:'arts',art:'arts',humanities:'arts','মানবিক':'arts',
  commerce:'commerce',comm:'commerce',business:'commerce',business_studies:'commerce','ব্যবসায় শিক্ষা':'commerce',বাণিজ্য:'commerce',
};
const MEDIUMS:Record<string,LeadMedium>={
  bangla:'bangla',bn:'bangla','bangla version':'bangla','bangla_version':'bangla','বাংলা':'bangla','বাংলা ভার্সন':'bangla','বাংলা মাধ্যম':'bangla',
  english:'english_version',en:'english_version',ev:'english_version','english version':'english_version','english_version':'english_version','ইংরেজি':'english_version','ইংলিশ ভার্সন':'english_version','ইংরেজি ভার্সন':'english_version',
};
const SHIFTS:Record<string,LeadShift>={
  morning:'morning',day:'morning','সকাল':'morning',প্রভাতী:'morning',
  evening:'evening',night:'evening','সন্ধ্যা':'evening',রাত:'evening',
  any:'any','যেকোনো':'any','যে কোনো':'any',
};
const SOURCES:Record<string,LeadSource>={
  'walk-in':'walk_in',walkin:'walk_in','walk in':'walk_in',visit:'walk_in','সরাসরি':'walk_in','এসেছেন':'walk_in',
  phone:'phone',call:'phone','কল':'phone',ফোন:'phone','মোবাইলে':'phone',
  facebook:'facebook',fb:'facebook','ফেসবুক':'facebook',
  referral:'referral',referred:'referral','পরিচয়':'referral','মাধ্যমে':'referral',
  other:'other',অন্যান্য:'other',
};
// i18n-scan-allow-end

/** null means "not mapped": the caller flags it and asks, it never defaults. */
export function normalizeGroup(raw:unknown):LeadGroup|null{return GROUPS[clean(raw).replace(/\s+/g,'_')]||GROUPS[clean(raw)]||null}
export function normalizeMedium(raw:unknown):LeadMedium|null{return MEDIUMS[clean(raw).replace(/\s+/g,'_')]||MEDIUMS[clean(raw)]||null}
export function normalizeShift(raw:unknown):LeadShift|null{return SHIFTS[clean(raw).replace(/\s+/g,'_')]||SHIFTS[clean(raw)]||null}
export function normalizeSource(raw:unknown):LeadSource|null{return SOURCES[clean(raw).replace(/\s+/g,'_')]||SOURCES[clean(raw)]||null}

/** The fields a sheet column may be mapped onto. Everything else is the owner's answer, not a guess. */
export const LEAD_SHEET_FIELDS=['date','studentName','guardianName','classLabel','school','phones','group','shift','medium','source','interestedIn','status','nextFollowUp','notes'] as const;
export type LeadSheetField=typeof LEAD_SHEET_FIELDS[number];

/** The word for each field, as a catalog key in the `leads` namespace (`leads.sheetFields.date`).
    The import wizard paints it in the owner's language; nothing here chooses one. */
export const LEAD_SHEET_FIELD_LABEL_KEYS:Record<LeadSheetField,string>=Object.fromEntries(
  LEAD_SHEET_FIELDS.map(field=>[field,`sheetFields.${field}`]),
) as Record<LeadSheetField,string>;

// i18n-scan-allow-start — header synonyms written by the sheet's author, for the same reason.
const HEADERS:Record<string,LeadSheetField>={
  date:'date',তারিখ:'date',দিন:'date',visit_date:'date',
  name:'studentName',student_name:'studentName',নাম:'studentName',শিক্ষার্থীর_নাম:'studentName','শিক্ষার্থীর নাম':'studentName',student:'studentName',
  guardian:'guardianName',guardian_name:'guardianName',অভিভাবক:'guardianName','অভিভাবকের নাম':'guardianName',father:'guardianName',বাবা:'guardianName',মা:'guardianName',
  class:'classLabel',class_label:'classLabel',শ্রেণি:'classLabel',ক্লাস:'classLabel',grade:'classLabel',
  institute:'school',school:'school',স্কুল:'school',বিদ্যালয়:'school',প্রতিষ্ঠান:'school',institute_school:'school',
  number:'phones',phone:'phones',mobile:'phones',contact:'phones',নম্বর:'phones',ফোন:'phones',মোবাইল:'phones',numbers:'phones',
  group:'group',গ্রুপ:'group',বিভাগ:'group',
  shift:'shift',শিফট:'shift',সময়:'shift',time:'shift',
  medium:'medium',মাধ্যম:'medium',ভার্সন:'medium',version:'medium',
  source:'source',উৎস:'source',কীভাবে:'source',
  interested_in:'interestedIn',interested:'interestedIn',বিষয়:'interestedIn',subject:'interestedIn',
  status:'status',অবস্থা:'status',
  follow_up:'nextFollowUp',followup:'nextFollowUp',next_follow_up:'nextFollowUp','ফলো আপ':'nextFollowUp','পরে কল':'nextFollowUp',
  comments:'notes',comment:'notes',note:'notes',notes:'notes',মন্তব্য:'notes',নোট:'notes',remark:'notes',remarks:'notes',
};
// i18n-scan-allow-end

/** What a spreadsheet writes for a column nobody named. */
export function isUnnamedColumnHeader(raw:unknown):boolean{
  const text=clean(raw);
  // i18n-scan-allow-start — `অজানা 1` is what a Bangla sheet calls a column nobody named.
  return !text||/^(column|col|field|unnamed)\s*\d*$/.test(text)||/^অজানা\s*\d*$/.test(text);
  // i18n-scan-allow-end
}

/** The header's field, or null — which means the import wizard has to ask, not decide. */
export function mapSheetHeader(raw:unknown):LeadSheetField|null{
  const text=clean(raw);
  if(!text||isUnnamedColumnHeader(text))return null;
  return HEADERS[text]||HEADERS[text.replace(/\s+/g,'_')]||HEADERS[text.replace(/[^\p{L}\p{N}]+/gu,'_')]||null;
}

/** The question the wizard asks for a column it could not read.
 *  The key is what a component translates; the pair is for a wizard that has to keep the question.
 *  A header with no text at all gets its own key, so neither sentence ever quotes empty brackets. */
export function unmappedHeaderQuestion(header:string):{messageKey:string;messageParams:Record<string,string>;messageBn:string;messageEn:string}{
  const messageKey=header?(isUnnamedColumnHeader(header)?'sheetQuestions.unnamed':'sheetQuestions.unknown'):'sheetQuestions.unnamedBlank';
  const messageParams:Record<string,string>=header?{header}:{};
  return {messageKey,messageParams,...renderLeadPair(messageKey,messageParams)};
}
