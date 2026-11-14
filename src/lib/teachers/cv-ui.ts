/**
 * R4 · The shapes a CV screen is allowed to hold.
 *
 * The rule layer (`candidates.ts`) reads a CV whole, including the normalized numbers it matches on. A
 * browser has no business holding those: they are not needed to paint a row, and anything in a client
 * bundle can be copied out of it. So every view here is the same row minus the digits — a mask for the
 * operator to read, and the two `tel:` / `wa.me` destinations the brief requires, which are the only
 * places a number may appear.
 *
 * The dates become ISO strings for the same reason the leads' views do: a `Date` crossing the
 * server → client boundary is a timezone question nobody asked, and an ISO day or instant is not.
 *
 * This file imports no model and no `server-only` module, so a client component can import the types.
 */
import type {CandidateDetail,CandidateDupHolder,CandidateRow,TeacherListResult} from './candidates';
/* The vocabulary's own label keys, so a badge on the list and a chip in the drawer cannot drift. */
import {
  TEACHER_NOTE_OUTCOME_LABEL_KEYS,TEACHER_RATING_LABEL_KEYS,TEACHER_SHIFT_LABEL_KEYS,
  TEACHER_SOURCE_LABEL_KEYS,TEACHER_STATUS_LABEL_KEYS,TEACHER_SUBJECT_LABEL_KEYS,
  type TeacherNoteOutcome,type TeacherRating,type TeacherShift,type TeacherSource,type TeacherStatus,type TeacherSubject,
} from './vocab';

export interface CandidatePhoneView{masked:string;tel:string;whatsapp:string}

export type CandidateRowView=Omit<CandidateRow,'phones'|'interviewAt'|'lastNote'>&{
  phones:CandidatePhoneView[];
  interviewAt:string;
  lastNote:{at:string;text:string;outcome:string}|null;
};

export function candidateRowView(row:CandidateRow):CandidateRowView{
  const {phones,interviewAt,lastNote,...rest}=row;
  return {
    ...rest,
    phones:phones.map(({masked,tel,whatsapp})=>({masked,tel,whatsapp})),
    interviewAt:interviewAt?interviewAt.toISOString():'',
    lastNote:lastNote?{at:lastNote.at.toISOString(),text:lastNote.text,outcome:lastNote.outcome}:null,
  };
}

export interface CandidateListView{rows:CandidateRowView[];total:number;page:number;pages:number;perPage:number}

export function candidateListView(result:TeacherListResult):CandidateListView{
  return {rows:result.rows.map(candidateRowView),total:result.total,page:result.page,pages:result.pages,perPage:result.perPage};
}

export interface CandidateDupView{id:string;candidateId:string;name:string;status:string;receivedDate:string;masked:string;match:'phone'|'email'}

export function dupViews(holders:CandidateDupHolder[]):CandidateDupView[]{
  return (holders||[]).map(({id,candidateId,name,status,receivedDate,masked,match})=>({id,candidateId,name,status,receivedDate,masked,match}));
}

export interface CandidateDetailView{
  row:CandidateRowView;
  notes:{at:string;text:string;outcome:string;byName:string}[];
  teacher:{id:string;slug:string;name:string;published:boolean}|null;
  duplicates:CandidateDupView[];
}

export function candidateDetailView(detail:CandidateDetail):CandidateDetailView{
  return {
    row:candidateRowView(detail.row),
    notes:detail.notes.map(note=>({at:note.at.toISOString(),text:note.text,outcome:note.outcome,byName:note.byName})),
    teacher:detail.teacher,
    duplicates:dupViews(detail.duplicates),
  };
}

/** One form answer: a sentence in the reader's language, plus the ids a screen has to keep. */
export type CvFormState={
  status:'idle'|'ok'|'error'|'dup';
  message:string;
  /** The rule-layer code, so a form can mark the field it belongs to. */
  field?:string;
  id?:string;
  candidateId?:string;
  /** The CVs already on file, when the write was refused because somebody holds the same number. */
  duplicates?:CandidateDupView[];
};

export const idleCvFormState=():CvFormState=>({status:'idle',message:''});

export type CvTranslator=(key:string)=>string;
const label=(t:CvTranslator,key:string|undefined,fallback:string):string=>key?t(key):fallback;

export function statusLabel(t:CvTranslator,status:TeacherStatus|string):string{
  return label(t,TEACHER_STATUS_LABEL_KEYS[status as TeacherStatus],String(status||''));
}
export function ratingLabel(t:CvTranslator,rating:TeacherRating|string):string{
  return label(t,TEACHER_RATING_LABEL_KEYS[rating as TeacherRating],String(rating||''));
}
export function sourceLabel(t:CvTranslator,source:TeacherSource|string):string{
  return label(t,TEACHER_SOURCE_LABEL_KEYS[source as TeacherSource],String(source||''));
}
export function shiftLabel(t:CvTranslator,shift:TeacherShift|string):string{
  return label(t,TEACHER_SHIFT_LABEL_KEYS[shift as TeacherShift],String(shift||''));
}
export function subjectLabel(t:CvTranslator,subject:TeacherSubject|string):string{
  return label(t,TEACHER_SUBJECT_LABEL_KEYS[subject as TeacherSubject],String(subject||''));
}
export function outcomeLabel(t:CvTranslator,outcome:TeacherNoteOutcome|string):string{
  return outcome?label(t,TEACHER_NOTE_OUTCOME_LABEL_KEYS[outcome as TeacherNoteOutcome],String(outcome)):'';
}

/** The badge colour an admin table already uses: green for settled, amber for in flight, grey for closed. */
export function statusBadge(status:string):'enabled'|'pending'|'disabled'{
  if(status==='hired'||status==='shortlisted')return 'enabled';
  if(status==='not_suitable'||status==='no_response')return 'disabled';
  return 'pending';
}

/** A rating is a verdict somebody wrote; `unrated` is grey, not a low score in disguise. */
export function ratingBadge(rating:string):'enabled'|'pending'|'disabled'{
  if(rating==='good'||rating==='excellent')return 'enabled';
  if(rating==='unrated')return 'disabled';
  return 'pending';
}
