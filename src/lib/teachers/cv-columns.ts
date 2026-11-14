/**
 * R4 · Teacher CV import — which column of the sheet is which field of a CV.
 *
 * The owner's teacher sheet is written by whoever collected the CVs, so a column may be called `Name`,
 * `নাম`, `Teacher Name` or nothing at all. This file is the only place that decides, and it decides by
 * lookup: a header in the synonym table maps, anything else comes back `null`, and `null` means the
 * wizard has to ASK. A column nobody named is a question with a select beside it, never a default —
 * guessing that an unnamed column is a phone number is how a sheet of names becomes a bank of CVs with
 * nobody in them.
 *
 * The labels are catalog keys, not sentences: the wizard paints them in the reader's language.
 */
import {isUnnamedColumnHeader} from '@/lib/leads/lead-columns';
import {renderTeacherPair} from './teacher-message';

export const CV_SHEET_FIELDS=['receivedDate','name','phones','email','department','university','currentInstitute','subjectsText','classLevels','availabilityText','shifts','expectedSalary','source','tags','notes'] as const;
export type CvSheetField=typeof CV_SHEET_FIELDS[number];

/** The word for each field, as a catalog key in the `teacherCvs` namespace (`import.fields.name`). */
export const CV_SHEET_FIELD_LABEL_KEYS:Record<CvSheetField,string>=Object.fromEntries(
  CV_SHEET_FIELDS.map(field=>[field,`import.fields.${field}`]),
) as Record<CvSheetField,string>;

const clean=(raw:unknown):string=>String(raw==null?'':raw).trim().toLowerCase();

// i18n-scan-allow-start — header synonyms written by the sheet's author, not sentences this app paints.
const HEADERS:Record<string,CvSheetField>={
  date:'receivedDate',received:'receivedDate',received_date:'receivedDate',cv_date:'receivedDate',তারিখ:'receivedDate',পাওয়ার_তারিখ:'receivedDate','পাওয়ার তারিখ':'receivedDate',দিন:'receivedDate',
  name:'name',teacher_name:'name',candidate_name:'name',নাম:'name',শিক্ষক:'name','শিক্ষকের নাম':'name','প্রার্থীর নাম':'name',
  phone:'phones',phones:'phones',number:'phones',mobile:'phones',contact:'phones',নম্বর:'phones',ফোন:'phones',মোবাইল:'phones','মোবাইল নম্বর':'phones',
  email:'email',mail:'email',ইমেইল:'email','ই-মেইল':'email',
  department:'department',dept:'department',বিভাগ:'department',সাবজেক্ট_ডিপার্টমেন্ট:'department',
  university:'university',college:'university',varsity:'university',বিশ্ববিদ্যালয়:'university',ভার্সিটি:'university',কলেজ:'university',
  current_institute:'currentInstitute',institute:'currentInstitute',workplace:'currentInstitute',currently_teaching:'currentInstitute','বর্তমান প্রতিষ্ঠান':'currentInstitute',কর্মরত_প্রতিষ্ঠান:'currentInstitute',
  subject:'subjectsText',subjects:'subjectsText',subject_text:'subjectsText',পড়ানোর_বিষয়:'subjectsText','পড়ানোর বিষয়':'subjectsText',বিষয়:'subjectsText',
  class:'classLevels',classes:'classLevels',class_levels:'classLevels',শ্রেণি:'classLevels',ক্লাস:'classLevels',
  availability:'availabilityText',free_time:'availabilityText',time:'availabilityText',সময়:'availabilityText','অবসর সময়':'availabilityText',ফ্রি_টাইম:'availabilityText',
  shift:'shifts',shifts:'shifts',শিফট:'shifts',
  salary:'expectedSalary',expected_salary:'expectedSalary',বেতন:'expectedSalary','প্রত্যাশিত বেতন':'expectedSalary',
  source:'source',উৎস:'source',মাধ্যম:'source',কীভাবে:'source',
  tags:'tags',ট্যাগ:'tags',
  note:'notes',notes:'notes',comment:'notes',comments:'notes',remark:'notes',remarks:'notes',মন্তব্য:'notes',নোট:'notes',
};
// i18n-scan-allow-end

/** The header's field, or null — which means the import wizard has to ask, not decide. */
export function mapCvHeader(raw:unknown):CvSheetField|null{
  const text=clean(raw);
  if(!text||isUnnamedColumnHeader(text))return null;
  return HEADERS[text]||HEADERS[text.replace(/\s+/g,'_')]||HEADERS[text.replace(/[^\p{L}\p{N}]+/gu,'_')]||null;
}

/** The question the wizard asks for a column it could not read, in both languages at once. */
export function unmappedCvHeaderQuestion(header:string):{messageKey:string;messageParams:Record<string,string>;messageBn:string;messageEn:string}{
  const messageKey=header?(isUnnamedColumnHeader(header)?'import.questions.unnamed':'import.questions.unknown'):'import.questions.unnamedBlank';
  const messageParams:Record<string,string>=header?{header}:{};
  return {messageKey,messageParams,...renderTeacherPair(messageKey,messageParams)};
}
