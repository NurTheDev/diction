/**
 * Shared by the Visitors screens and their server actions: the shape a form returns, the labels the
 * vocabulary carries, and the plain view objects a client component is handed.
 *
 * Nothing here touches the database or `node:`, because client components import it — one server-only
 * import in this file would break every screen in wave B. The rules themselves stay in `leads.ts` and
 * the vocabulary in `vocab.ts`; this module only decides how a rule's answer is *shown*.
 */
import {leadListQuery,maskPhone} from './vocab';
import {telHref,whatsappHref} from './lead-phone';
import {
  FOLLOW_UP_OPTIONS,LEAD_GROUP_LABELS,LEAD_MEDIUM_LABELS,LEAD_NOTE_OUTCOME_LABELS,LEAD_NOTE_OUTCOMES,
  LEAD_SHIFT_LABELS,LEAD_SOURCE_LABELS,LEAD_STATUS_LABELS,LEAD_STATUSES,
  type FollowUpKey,type LeadGroup,type LeadMedium,type LeadShift,type LeadSource,type LeadStatus,
} from './vocab';

/**
 * The list's filters, minus the locale and the page number: the shape a search box must carry with it so
 * looking up a name does not throw the filters away, and the shape a page hands its links.
 */
export type LeadListFiltersShape=Omit<Parameters<typeof leadListQuery>[0],'locale'|'page'>;

/** What every lead form action hands back to `useActionState`. */
export type LeadFormState={
  status:'idle'|'ok'|'error';
  messageBn:string;
  messageEn:string;
  /** Set on a successful quick-add, so the panel can say which id it wrote. */
  leadId?:string;
  /** Which field a refusal was about, so the panel can point at it. */
  field?:string;
};

export const idleLeadForm:LeadFormState={status:'idle',messageBn:'',messageEn:''};

export function leadFormMessage(state:LeadFormState|null|undefined,language:'bn'|'en'):string{
  if(!state||state.status==='idle')return '';
  return language==='bn'?state.messageBn:state.messageEn;
}

/** `follow-up বাদ দিন` is not one of the five options — it is the sixth control, and it clears the day. */
export const FOLLOW_UP_CLEAR='clear';

type Labels={bn:string;en:string};
const pick=(labels:Labels|undefined,fallback:string,language:'bn'|'en'):string=>
  labels?(language==='bn'?labels.bn:labels.en):fallback;

export function statusLabel(status:LeadStatus|string,language:'bn'|'en'):string{
  return pick(LEAD_STATUS_LABELS[status as LeadStatus],String(status||''),language);
}
export function sourceLabel(source:LeadSource|string,language:'bn'|'en'):string{
  return pick(LEAD_SOURCE_LABELS[source as LeadSource],String(source||''),language);
}
export function groupLabel(group:LeadGroup|string,language:'bn'|'en'):string{
  return pick(LEAD_GROUP_LABELS[group as LeadGroup],String(group||''),language);
}
export function shiftLabel(shift:LeadShift|string,language:'bn'|'en'):string{
  return pick(LEAD_SHIFT_LABELS[shift as LeadShift],String(shift||''),language);
}
export function mediumLabel(medium:LeadMedium|string,language:'bn'|'en'):string{
  return pick(LEAD_MEDIUM_LABELS[medium as LeadMedium],String(medium||''),language);
}
export function noteOutcomeLabel(outcome:string,language:'bn'|'en'):string{
  return pick(LEAD_NOTE_OUTCOME_LABELS[outcome as keyof typeof LEAD_NOTE_OUTCOME_LABELS],String(outcome||''),language);
}

/** The five quick follow-up buttons, in the order the brief lists them. */
export function followUpLabel(key:FollowUpKey|typeof FOLLOW_UP_CLEAR,language:'bn'|'en'):string{
  if(key===FOLLOW_UP_CLEAR)return language==='bn'?'বাদ দিন':'Clear';
  const option=FOLLOW_UP_OPTIONS.find(entry=>entry.key===key);
  return option?(language==='bn'?option.bn:option.en):'';
}

export const LEAD_STATUS_OPTIONS=LEAD_STATUSES as readonly LeadStatus[];
export const LEAD_SOURCE_OPTIONS=Object.keys(LEAD_SOURCE_LABELS) as LeadSource[];
export const LEAD_GROUP_OPTIONS=Object.keys(LEAD_GROUP_LABELS) as LeadGroup[];
export const LEAD_SHIFT_OPTIONS=Object.keys(LEAD_SHIFT_LABELS) as LeadShift[];
export const LEAD_MEDIUM_OPTIONS=Object.keys(LEAD_MEDIUM_LABELS) as LeadMedium[];
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
export interface LeadDetailView{row:LeadRowView;notes:LeadNoteView[];family:LeadRowView[]}

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

export function detailView(detail:{row:LeadRowSource;notes:{at:Date;text:string;outcome:string;byName:string}[];family:LeadRowSource[]}):LeadDetailView{
  return {row:rowView(detail.row),notes:detail.notes||[],family:(detail.family||[]).map(rowView)};
}
