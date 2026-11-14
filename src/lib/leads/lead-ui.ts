/**
 * Shared by the Visitors screens and their server actions: the shape a form returns, the labels the
 * vocabulary carries, and the plain view objects a client component is handed.
 *
 * Nothing here touches the database or `node:`, because client components import it — one server-only
 * import in this file would break every screen in wave B. The rules themselves stay in `leads.ts` and
 * the vocabulary in `vocab.ts`; this module only decides how a rule's answer is *shown*.
 */
// A type-only import: it is erased at compile time, so this file stays client-safe (see the header).
import type {LeadSearchHit} from './leads';
import {
  admissionPrefill,handoffBlock,trialPrefill,
  type AdmissionPrefill,type HandoffLead,type HandoffRefusal,type TrialPrefill,
} from './lead-handoff';
import {leadListQuery,maskPhone} from './vocab';
import {telHref,whatsappHref} from './lead-phone';
import {
  FOLLOW_UP_LABEL_KEYS,FOLLOW_UP_OPTIONS,LEAD_GROUP_LABEL_KEYS,LEAD_MEDIUM_LABEL_KEYS,LEAD_NOTE_OUTCOME_LABEL_KEYS,
  LEAD_NOTE_OUTCOMES,LEAD_SHIFT_LABEL_KEYS,LEAD_SOURCE_LABEL_KEYS,LEAD_STATUS_LABEL_KEYS,LEAD_STATUSES,
  type FollowUpKey,type LeadGroup,type LeadMedium,type LeadShift,type LeadSource,type LeadStatus,
} from './vocab';

/**
 * The list's filters, minus the locale and the page number: the shape a search box must carry with it so
 * looking up a name does not throw the filters away, and the shape a page hands its links.
 */
export type LeadListFiltersShape=Omit<Parameters<typeof leadListQuery>[0],'locale'|'page'>;

/** What every lead form action hands back to `useActionState`. */
export type LeadFormState={
  status:'idle'|'ok'|'error'|'dup';
  message:string;
  /** Set on a successful quick-add, so the panel can say which id it wrote. */
  leadId?:string;
  /** Which field a refusal was about, so the panel can point at it. */
  field?:string;
  /** R3.10: the leads already holding a number quick-add was given, while the operator chooses. */
  holders?:LeadDupHolderView[];
};

/**
 * A duplicate-phone holder as a screen may see it (R3.10): name, both ids, status, day and the MASK.
 * No digits and no family key — the same two absences `LeadRowView` keeps, for the same reason.
 */
export interface LeadDupHolderView{id:string;leadId:string;studentName:string;status:LeadStatus;date:string;masked:string}

export const idleLeadForm:LeadFormState={status:'idle',message:''};

export function leadFormMessage(state:LeadFormState|null):string{return state?.message||''}

/** The clear control is not one of the five options — it is the sixth control, and it clears the day. */
export const FOLLOW_UP_CLEAR='clear';

/** A translator for the leads namespace — `useTranslations('leads')` or `await getTranslations('leads')`. */
export type LeadTranslator=(key:string)=>string;
const label=(t:LeadTranslator,key:string|undefined,fallback:string):string=>key?t(key):fallback;

export function statusLabel(t:LeadTranslator,status:LeadStatus|string):string{
  return label(t,LEAD_STATUS_LABEL_KEYS[status as LeadStatus],String(status||''));
}
export function sourceLabel(t:LeadTranslator,source:LeadSource|string):string{
  return label(t,LEAD_SOURCE_LABEL_KEYS[source as LeadSource],String(source||''));
}
export function groupLabel(t:LeadTranslator,group:LeadGroup|string):string{
  return label(t,LEAD_GROUP_LABEL_KEYS[group as LeadGroup],String(group||''));
}
export function shiftLabel(t:LeadTranslator,shift:LeadShift|string):string{
  return label(t,LEAD_SHIFT_LABEL_KEYS[shift as LeadShift],String(shift||''));
}
export function mediumLabel(t:LeadTranslator,medium:LeadMedium|string):string{
  return label(t,LEAD_MEDIUM_LABEL_KEYS[medium as LeadMedium],String(medium||''));
}
export function noteOutcomeLabel(t:LeadTranslator,outcome:string):string{
  return label(t,LEAD_NOTE_OUTCOME_LABEL_KEYS[outcome as keyof typeof LEAD_NOTE_OUTCOME_LABEL_KEYS],String(outcome||''));
}

/** The five quick follow-up buttons, in the order the brief lists them. */
export function followUpLabel(t:LeadTranslator,key:FollowUpKey|typeof FOLLOW_UP_CLEAR):string{
  if(key===FOLLOW_UP_CLEAR)return t('followUpLabels.clear');
  return label(t,FOLLOW_UP_LABEL_KEYS[key],'');
}

export const LEAD_STATUS_OPTIONS=LEAD_STATUSES as readonly LeadStatus[];
export const LEAD_SOURCE_OPTIONS=Object.keys(LEAD_SOURCE_LABEL_KEYS) as LeadSource[];
export const LEAD_GROUP_OPTIONS=Object.keys(LEAD_GROUP_LABEL_KEYS) as LeadGroup[];
export const LEAD_SHIFT_OPTIONS=Object.keys(LEAD_SHIFT_LABEL_KEYS) as LeadShift[];
export const LEAD_MEDIUM_OPTIONS=Object.keys(LEAD_MEDIUM_LABEL_KEYS) as LeadMedium[];
export const LEAD_NOTE_OUTCOME_OPTIONS=LEAD_NOTE_OUTCOMES as readonly string[];
export const FOLLOW_UP_KEYS=FOLLOW_UP_OPTIONS.map(option=>option.key);

/**
 * Badge colours are the stylesheet's own modifiers (`.admin-badge.approved` and friends in
 * `src/app/globals.css`) — a status gets an existing word, never a new class.
 */
const STATUS_BADGE:Record<LeadStatus,string>={
  new:'',called:'unread',interested:'pending',trial_booked:'booked',admitted:'approved',
  not_interested:'cancelled',no_answer:'pending',do_not_contact:'disabled',
};
const FOLLOW_UP_BADGE:Record<'none'|'today'|'overdue'|'later',string>={none:'',today:'pending',overdue:'rejected',later:''};
export function statusBadge(status:LeadStatus|string):string{return STATUS_BADGE[status as LeadStatus]??''}
export function followUpBadge(state:'none'|'today'|'overdue'|'later'):string{return FOLLOW_UP_BADGE[state]??''}

/**
 * What a screen may carry. Three things are deliberately NOT here, because each one is a number:
 *
 *  - `familyKey`, which IS the smallest normalized number of a family with a prefix on it;
 *  - a flag's `original`, the raw cell text, which can hold a second number that is perfectly valid;
 *  - a phone's `original`, the number exactly as it was written.
 *
 * All three stay in the database, where the importer's report and an audit row can use them. A screen
 * gets the mask and the two destinations the brief requires — `tel:` and `wa.me` — and nothing else, so
 * no served HTML, no flight payload and no screenshot can carry a number that could be copied out.
 */
export interface LeadPhoneView{masked:string;tel:string;whatsapp:string}
export interface LeadFlagView{field:string;code:string;messageBn:string;messageEn:string;suggested:string}
export interface LeadRowView{
  id:string;leadId:string;date:string;studentName:string;guardianName:string;phones:LeadPhoneView[];
  classLabel:string;classGroup:number|null;school:string;group:string;shift:string;medium:string;
  source:string;interestedIn:string;status:LeadStatus;doNotContact:boolean;contactable:boolean;
  nextFollowUp:string|null;followUp:'none'|'today'|'overdue'|'later';
  flags:LeadFlagView[];noteCount:number;lastNote:LeadNoteText;converted:boolean;createdAt:Date;
}
export type LeadNoteText={at:Date;text:string;outcome:string}|null;
export interface LeadNoteView{at:Date;text:string;outcome:string;byName:string}
export interface LeadDetailView{
  row:LeadRowView;notes:LeadNoteView[];family:LeadRowView[];
  /** Number-mates outside the family: the drawer's "shares this number with" block (R3.10). */
  dupMates:LeadDupHolderView[];
  /**
   * R3.13 · What the three hand-offs may open with. Built here, from the raw row, so the client that
   * renders them can never be handed a number: the prefills carry names, a class, a school and a mask.
   */
  handoff:LeadHandoffView;
}

/** The hand-off strip's own view: prefills, and the refusal each hand-off would already meet. */
export interface LeadHandoffView{
  admission:AdmissionPrefill;
  trial:TrialPrefill;
  blockedAdmission:HandoffRefusal|null;
  blockedTrial:HandoffRefusal|null;
  /** `doNotContact` does not close a hand-off — a parent who said "stop calling" may still be admitted. */
  doNotContact:boolean;
  status:LeadStatus;
}

/** What `leads.ts` hands a screen: structurally the same row, with raw numbers still on it. */
export interface LeadRowSource{
  id:string;leadId:string;date:string;studentName:string;guardianName:string;
  phones:{normalized:string;original:string}[];classLabel:string;classGroup:number|null;school:string;
  group:string;shift:string;medium:string;source:string;interestedIn:string;status:LeadStatus;
  doNotContact:boolean;contactable:boolean;nextFollowUp:string|null;
  followUp:'none'|'today'|'overdue'|'later';familyKey:string|null;flags:LeadFlagRowSource[];
  noteCount:number;lastNote:LeadNoteText;converted:boolean;createdAt:Date;
}
/** A flag as the rule layer stores it, raw text and all — `rowView()` is what takes the text back out. */
export interface LeadFlagRowSource{field:string;code:string;original:string;messageBn:string;messageEn:string;suggested:string}

/**
 * What the drawer needs to open: enough to show a header and dial a number, with the rest loaded when
 * it opens. Both a list row and a number-search hit satisfy it, so one drawer serves both screens.
 */
export interface LeadDrawerSeed{
  id:string;leadId:string;studentName:string;guardianName?:string;date:string;phones:LeadPhoneView[];
  classLabel?:string;classGroup?:number|null;school?:string;status:LeadStatus;doNotContact:boolean;
  contactable?:boolean;nextFollowUp:string|null;followUp:'none'|'today'|'overdue'|'later';
}

export function phoneViews(phones:{normalized:string;original:string}[]):LeadPhoneView[]{
  return (phones||[]).map(phone=>({
    masked:maskPhone(phone.normalized),tel:telHref(phone.normalized),whatsapp:whatsappHref(phone.normalized),
  }));
}

/** One call, so a screen cannot forget to mask a number, build a `tel:` from raw text, or hand over a key. */
export function rowView(row:LeadRowSource):LeadRowView{
  const {familyKey:_familyKey,...shown}=row;
  return {...shown,phones:phoneViews(row.phones),flags:(row.flags||[]).map(({original:_original,...flag})=>flag)};
}

export function detailView(detail:{row:LeadRowSource;notes:{at:Date;text:string;outcome:string;byName:string}[];family:LeadRowSource[];dupMates?:LeadDupHolderView[];handoffSource?:{admission:string|null;trialBooking:string|null}}):LeadDetailView{
  const row=detail.row;
  const handoffLead:HandoffLead={
    id:String(row.id),leadId:row.leadId,studentName:row.studentName,guardianName:row.guardianName,
    school:row.school,classGroup:row.classGroup,phones:row.phones||[],
    admission:detail.handoffSource?.admission||null,trialBooking:detail.handoffSource?.trialBooking||null,
  };
  return {
    row:rowView(row),notes:detail.notes||[],family:(detail.family||[]).map(rowView),dupMates:detail.dupMates||[],
    handoff:{
      admission:admissionPrefill(handoffLead),
      trial:trialPrefill(handoffLead),
      blockedAdmission:handoffBlock(handoffLead,'admission'),
      blockedTrial:handoffBlock(handoffLead,'trial'),
      doNotContact:row.doNotContact,status:row.status,
    },
  };
}

/**
 * What a number search hands back to the form that asked. It lives here rather than in `leads.ts`
 * because a client component imports it, and here rather than in `src/actions/leads.ts` because a
 * 'use server' module may export nothing but async functions.
 *
 * A hit is the rule layer's `LeadSearchHit` with its phones replaced by views. The rule layer keeps the
 * normalized number — that is what it matched on, and its own integration test reads it — while the
 * browser is handed the mask and the two destinations, so the digits cross no wire they do not have to.
 */
export type LeadSearchHitView=Omit<LeadSearchHit,'phones'>&{phones:LeadPhoneView[]};

export interface LeadSearchActionState{
  status:'idle'|'found'|'empty'|'refused'|'unauthorized'|'error';
  hits:LeadSearchHitView[];total:number;masked:string;message:string;
}

/** The strip, for one search answer: every phone becomes a view and nothing else is touched. */
export function searchHitViews(hits:LeadSearchHit[]):LeadSearchHitView[]{
  return (hits||[]).map(({phones,...hit})=>({...hit,phones:phoneViews(phones)}));
}
