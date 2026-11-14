/**
 * R4 · Teacher candidates — the vocabulary and the rules that need no database.
 *
 * The same promise the leads vocabulary makes: everything here is pure and importable from a client
 * component (no `node:` import anywhere in `src/lib/teachers`), so the quick-add form, the filter
 * panel, the drawer and the row badges all read the same words the server writes.
 *
 * Three rules from the owner's brief live here rather than in a screen:
 *
 *   1. **Class levels are specific class numbers.** The sheet writes `"6, 7, 8 (Math, Eng) 9-GS"` and
 *      `"Class 4 to 7"`; the reading expands a range into the classes it names, so a filter for
 *      class 9 finds both `"9-GS"` and `"Class 9 to 12"`. Storing ranges would make every filter a
 *      string game and every answer a guess.
 *   2. **A rating is a verdict a person wrote down, and `unrated` is its own state.** A candidate
 *      nobody has met is not "OK"; printing a default star would invent an opinion.
 *   3. **The twelve-month review is a reminder, never a deletion.** `needsReview()` answers whether a
 *      CV has been sitting for a year without a hire; the list says so out loud and the bin stays the
 *      only way a CV leaves.
 */
import {asciiDigits} from '../admin/format';
import {dhakaDay} from '@/lib/admin/today';

export const TEACHER_STATUSES=['new','contacted','interview_scheduled','interviewed','shortlisted','waiting_list','hired','not_suitable','no_response'] as const;
export type TeacherStatus=typeof TEACHER_STATUSES[number];

/** Message-catalog keys: the words live in bn.json / en.json under teacherCvs.statusLabels. */
export const TEACHER_STATUS_LABEL_KEYS:Record<TeacherStatus,string>={
  new:'statusLabels.new',contacted:'statusLabels.contacted',interview_scheduled:'statusLabels.interview_scheduled',
  interviewed:'statusLabels.interviewed',shortlisted:'statusLabels.shortlisted',waiting_list:'statusLabels.waiting_list',
  hired:'statusLabels.hired',not_suitable:'statusLabels.not_suitable',no_response:'statusLabels.no_response',
};

export const TEACHER_RATINGS=['unrated','poor','ok','good','excellent'] as const;
export type TeacherRating=typeof TEACHER_RATINGS[number];
export const TEACHER_RATING_LABEL_KEYS:Record<TeacherRating,string>={
  unrated:'ratingLabels.unrated',poor:'ratingLabels.poor',ok:'ratingLabels.ok',good:'ratingLabels.good',excellent:'ratingLabels.excellent',
};

export const TEACHER_SOURCES=['walk_in','email','facebook','referral','other'] as const;
export type TeacherSource=typeof TEACHER_SOURCES[number];
export const TEACHER_SOURCE_LABEL_KEYS:Record<TeacherSource,string>={
  walk_in:'sourceLabels.walk_in',email:'sourceLabels.email',facebook:'sourceLabels.facebook',referral:'sourceLabels.referral',other:'sourceLabels.other',
};

export const TEACHER_SHIFTS=['morning','evening','any'] as const;
export type TeacherShift=typeof TEACHER_SHIFTS[number];
export const TEACHER_SHIFT_LABEL_KEYS:Record<TeacherShift,string>={
  morning:'shiftLabels.morning',evening:'shiftLabels.evening',any:'shiftLabels.any',
};

/** The configurable subject list the tags come from. Adding one here adds it to every screen. */
export const TEACHER_SUBJECTS=['bangla','english','math','physics','chemistry','biology','ict','accounting','finance','civics','history','geography','religion','other'] as const;
export type TeacherSubject=typeof TEACHER_SUBJECTS[number];
export const TEACHER_SUBJECT_LABEL_KEYS:Record<TeacherSubject,string>={
  bangla:'subjectLabels.bangla',english:'subjectLabels.english',math:'subjectLabels.math',physics:'subjectLabels.physics',
  chemistry:'subjectLabels.chemistry',biology:'subjectLabels.biology',ict:'subjectLabels.ict',accounting:'subjectLabels.accounting',
  finance:'subjectLabels.finance',civics:'subjectLabels.civics',history:'subjectLabels.history',geography:'subjectLabels.geography',
  religion:'subjectLabels.religion',other:'subjectLabels.other',
};

/** Specific classes 1–12: what a range on the sheet expands into, and what a filter asks for. */
export const TEACHER_CLASS_LEVELS=['1','2','3','4','5','6','7','8','9','10','11','12'] as const;
export type TeacherClassLevel=typeof TEACHER_CLASS_LEVELS[number];

export const TEACHER_NOTE_OUTCOMES=['no_response','call_back_later','interested','not_suitable'] as const;
export type TeacherNoteOutcome=typeof TEACHER_NOTE_OUTCOMES[number];
export const TEACHER_NOTE_OUTCOME_LABEL_KEYS:Record<TeacherNoteOutcome,string>={
  no_response:'outcomeLabels.no_response',call_back_later:'outcomeLabels.call_back_later',
  interested:'outcomeLabels.interested',not_suitable:'outcomeLabels.not_suitable',
};

/** A CV that has waited this many days without a hire is worth a second look — a reminder, nothing more. */
export const TEACHER_REVIEW_DAYS=365;

/** True when a CV arrived at least a year ago and nobody has been hired from it yet. */
export function needsReview(receivedDate:string|null|undefined,status:string|null|undefined,now:Date=new Date()):boolean{
  if(!receivedDate||!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate))return false;
  if(status==='hired')return false;
  const then=new Date(`${receivedDate}T00:00:00+06:00`).getTime();
  if(Number.isNaN(then))return false;
  return then<=new Date(now.getTime()-TEACHER_REVIEW_DAYS*86400000).getTime()&&then<=new Date(`${dhakaDay(now)}T00:00:00+06:00`).getTime();
}

/**
 * The availability keyword: a plain substring over the sheet's own words, with Bangla digits folded
 * to ASCII first, because "3.00-6.00" and "৩.০-৬.০০" are the same afternoon. An empty keyword
 * matches everything, which is what "no filter" means.
 */
export function availabilityMatches(availabilityText:string|null|undefined,keyword:string|null|undefined):boolean{
  const needle=asciiDigits(String(keyword||'')).trim().toLowerCase();
  if(!needle)return true;
  return asciiDigits(String(availabilityText||'')).toLowerCase().includes(needle);
}

/**
 * Which of a filter's values the vocabulary accepts; the rest are ignored, never trusted. The input is
 * typed `unknown` on purpose: a page hands it `searchParams`, an action hands it a parsed form, and
 * neither shape is allowed to smuggle a value past the checks below.
 */
export function teacherListQuery(raw:unknown={}){
  const params=(raw||{}) as Record<string,unknown>;
  const one=(value:unknown,allowed:readonly string[]):string=>(allowed as readonly unknown[]).includes(String(value||''))?String(value):'';
  return {
    status:one(params.status,TEACHER_STATUSES),
    rating:one(params.rating,TEACHER_RATINGS),
    source:one(params.source,TEACHER_SOURCES),
    shift:one(params.shift,TEACHER_SHIFTS),
    subject:one(params.subject,TEACHER_SUBJECTS),
    classLevel:one(params.classLevel,TEACHER_CLASS_LEVELS),
    review:params.review==='old'?'old':'',
    q:String(params.q||'').trim().slice(0,80),
    availability:String(params.availability||'').trim().slice(0,60),
    from:/^\d{4}-\d{2}-\d{2}$/.test(String(params.from||''))?String(params.from):'',
    to:/^\d{4}-\d{2}-\d{2}$/.test(String(params.to||''))?String(params.to):'',
  };
}
export type TeacherListQuery=ReturnType<typeof teacherListQuery>;
