/**
 * R3 · Visitor leads — the vocabulary and the rules that need no database.
 *
 * Replaces the owner's "Visitor sheet". Everything here is pure and importable from a client
 * component on purpose (no `node:` import anywhere in `src/lib/leads`), so the quick-add form, the
 * inline status dropdown and the follow-up buttons all read the same words the server writes — one
 * vocabulary, no drift between a screen and a row.
 *
 * Three rules from the owner's brief live here rather than in a screen, because a screen can be
 * rebuilt and a rule must not move with it:
 *
 *   1. **"Do not contact" is sticky.** It is both a status and its own boolean, and the boolean
 *      survives a status change: moving a lead back to "Called" must not silently make it
 *      contactable again. Only an explicit un-mark clears it, and `canContact()` is the single
 *      gate every sending path asks — including bulk SMS.
 *   2. **A phone number never appears in a URL we generate, in an audit target, or in a log.** A
 *      lead is addressed by its id. `maskPhone()` is what a log line gets. The two destinations
 *      that must carry a number — the `tel:` and `wa.me` links the brief asks for on every row —
 *      are third-party hrefs rendered in the operator's own browser, never a route of this app,
 *      never a query parameter, never logged and never audited.
 *   3. **A follow-up is a day, not an instant.** It is stored and compared as `YYYY-MM-DD` in
 *      Asia/Dhaka, so "today" and "overdue" mean the same thing at 23:59 as at 00:01 and do not
 *      depend on the zone the server happens to run in.
 */
import {asciiDigits} from '../admin/format';
import {dhakaDay,dhakaToday} from '@/lib/admin/today';
import {isNumberAttempt,PHONE_SEARCH_MIN_DIGITS} from './lead-phone';

export const LEAD_STATUSES=['new','called','interested','trial_booked','admitted','not_interested','no_answer','do_not_contact'] as const;
export type LeadStatus=typeof LEAD_STATUSES[number];

/** Message-catalog keys: the words live in bn.json / en.json under leads.statusLabels. */
export const LEAD_STATUS_LABEL_KEYS:Record<LeadStatus,string>={new:'statusLabels.new',called:'statusLabels.called',interested:'statusLabels.interested',trial_booked:'statusLabels.trial_booked',admitted:'statusLabels.admitted',not_interested:'statusLabels.not_interested',no_answer:'statusLabels.no_answer',do_not_contact:'statusLabels.do_not_contact'};

export const LEAD_SOURCES=['walk_in','phone','facebook','referral','other'] as const;
export type LeadSource=typeof LEAD_SOURCES[number];

export const LEAD_SOURCE_LABEL_KEYS:Record<LeadSource,string>={walk_in:'sourceLabels.walk_in',phone:'sourceLabels.phone',facebook:'sourceLabels.facebook',referral:'sourceLabels.referral',other:'sourceLabels.other'};

export const LEAD_SHIFTS=['morning','evening','any'] as const;
export type LeadShift=typeof LEAD_SHIFTS[number];

export const LEAD_SHIFT_LABEL_KEYS:Record<LeadShift,string>={morning:'shiftLabels.morning',evening:'shiftLabels.evening',any:'shiftLabels.any'};

/** "Bangla Version" and "English Version" are how the sheet says it; unknown stays unknown. */
export const LEAD_MEDIUMS=['bangla','english_version','unknown'] as const;
export type LeadMedium=typeof LEAD_MEDIUMS[number];

export const LEAD_MEDIUM_LABEL_KEYS:Record<LeadMedium,string>={bangla:'mediumLabels.bangla',english_version:'mediumLabels.english_version',unknown:'mediumLabels.unknown'};

export const LEAD_GROUPS=['science','arts','commerce','unknown'] as const;
export type LeadGroup=typeof LEAD_GROUPS[number];

export const LEAD_GROUP_LABEL_KEYS:Record<LeadGroup,string>={science:'groupLabels.science',arts:'groupLabels.arts',commerce:'groupLabels.commerce',unknown:'groupLabels.unknown'};

/** What a note can conclude. A note with no outcome is allowed: not every call ends in a verdict. */
export const LEAD_NOTE_OUTCOMES=['no_answer','call_back_later','interested','not_interested'] as const;
export type LeadNoteOutcome=typeof LEAD_NOTE_OUTCOMES[number];

export const LEAD_NOTE_OUTCOME_LABEL_KEYS:Record<LeadNoteOutcome,string>={no_answer:'outcomeLabels.no_answer',call_back_later:'outcomeLabels.call_back_later',interested:'outcomeLabels.interested',not_interested:'outcomeLabels.not_interested'};

/**
 * The quick next-follow-up buttons on every row. `custom` opens a date field instead of guessing:
 * "next week" means seven days, not "the next Monday", because the owner's sheet says a number of
 * days and a wrong guess would hide a lead that should have been called.
 */
export const FOLLOW_UP_OPTIONS=[
  {key:'today',days:0},
  {key:'tomorrow',days:1},
  {key:'three_days',days:3},
  {key:'next_week',days:7},
  {key:'custom',days:null},
] as const;
/** Button words live in the catalog under leads.followUpLabels. */
export const FOLLOW_UP_LABEL_KEYS:Record<FollowUpKey|string,string>={today:'followUpLabels.today',tomorrow:'followUpLabels.tomorrow',three_days:'followUpLabels.three_days',next_week:'followUpLabels.next_week',custom:'followUpLabels.custom'};
export type FollowUpKey=typeof FOLLOW_UP_OPTIONS[number]['key'];

/** `YYYY-MM-DD` in Dhaka, `days` from today. `custom` needs the day the operator chose. */
export function nextFollowUpDay(key:FollowUpKey,now:Date=new Date(),customDay?:string):string|null{
  if(key==='custom'){
    if(!customDay||!/^\d{4}-\d{2}-\d{2}$/.test(customDay))return null;
    const [year,month,day]=customDay.split('-').map(Number);
    // A real calendar check: 2026-02-31 is not a day, and silently rolling it into March would move
    // a follow-up the operator did not choose.
    const date=new Date(Date.UTC(year,month-1,day));
    if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
    return customDay;
  }
  const option=FOLLOW_UP_OPTIONS.find(entry=>entry.key===key);
  if(!option||option.days===null)return null;
  return dhakaDay(new Date(now.getTime()+option.days*86400000));
}

/**
 * Today in Dhaka, both as a day string (to compare a follow-up against) and as the midnight-to-
 * midnight range (to query `nextFollowUpAt` with). The two come from one call so they cannot drift.
 */
export function followUpWindows(now:Date=new Date()):{today:string;range:{start:Date;end:Date}}{
  const {start,end}=dhakaToday(now);
  return {today:dhakaDay(now),range:{start,end}};
}

/**
 * Is a lead due today, overdue, or neither? Compared as days: a follow-up set for today is due all
 * day, and anything before today is overdue — including one nobody moved for a month.
 */
export function followUpState(day:string|null|undefined,now:Date=new Date()):'none'|'today'|'overdue'|'later'{
  if(!day||!/^\d{4}-\d{2}-\d{2}$/.test(day))return 'none';
  const today=dhakaDay(now);
  if(day<today)return 'overdue';
  if(day===today)return 'today';
  return 'later';
}

/**
 * The single gate every sending path asks before it uses a lead's number: the quick SMS, the
 * `visitor_thanks` template, a bulk send to a selection, and any future reminder. A lead marked
 * "Do not contact" is excluded even when the operator ticks its row by hand — the tick is not a
 * stronger instruction than the mark, and the brief says the mark is always respected.
 */
export function canContact(lead:{status?:string|null;doNotContact?:boolean|null}):boolean{
  return !lead.doNotContact&&lead.status!=='do_not_contact';
}

/**
 * The same rule as `canContact()`, as a query — so a bulk send to a selection filters at the database
 * and cannot drift from the predicate a single send uses. Both conditions, because the flag is sticky:
 * a lead whose status moved on but whose flag was never cleared is still not to be contacted.
 */
export const CONTACTABLE_LEAD_FILTER={doNotContact:{$ne:true},status:{$ne:'do_not_contact'}} as const;

/** Setting the status also sets the sticky flag; clearing the flag is an explicit act of its own. */
export function statusToFlags(status:LeadStatus,current:{doNotContact?:boolean|null}):{doNotContact:boolean}{
  return {doNotContact:status==='do_not_contact'?true:!!current.doNotContact};
}

/** What a log line, an audit target or an error message gets instead of a number. */
export function maskPhone(phone:string):string{
  const digits=String(phone||'').replace(/\D/g,'');
  if(digits.length<4)return '—';
  if(digits.length<=6)return `${digits.slice(0,2)}****`;
  return `${digits.slice(0,5)}****${digits.slice(-2)}`;
}

/** A lead is addressed by id. Nothing that carries a number is ever a route of this app. */
export function leadPath(leadId:string,locale:'bn'|'en'='bn'):string{
  return `/${locale}/admin/leads/${encodeURIComponent(leadId)}`;
}

export const LEAD_LIST_PATH='/admin/leads';

/**
 * The list's URL filters. Free text is deliberately NOT a URL parameter: a typed phone number would
 * end up in browser history and in the host's access log, so a search that looks like a number is
 * refused here and the caller posts it to the guarded search endpoint instead. Names and schools are
 * fine in a URL, because that is what makes a filtered list shareable between two admins.
 */
export function leadListQuery(params:{
  locale?:'bn'|'en';q?:string;status?:string;classGroup?:string;group?:string;shift?:string;medium?:string;
  source?:string;from?:string;to?:string;followUp?:'today'|'overdue'|'none';page?:number;
}):{href:string;refusedPhone:boolean;numberShaped:boolean}{
  const locale=params.locale==='en'?'en':'bn';
  const search=new URLSearchParams();
  let refusedPhone=false,numberShaped=false;
  const text=String(params.q||'').trim();
  if(text){
    // Digits, spaces, dashes and a leading + are how a number is typed; anything else is a name.
    // Bangla digits are digits: a number typed in Bangla digits must be refused just as firmly as its ASCII form.
    //
    // The threshold is PHONE_SEARCH_MIN_DIGITS, not a longer run, and the two must move together: a
    // fragment short enough to slip into a URL would be long enough for the posted number search to
    // find somebody, so the same digit run cannot be allowed in one path and refused in the other.
    // Searching BY NUMBER is a staff requirement — it simply travels as a form submission, never as a
    // query parameter (see `searchLeadsByPhone` and `src/actions/leads.ts`).
    const ascii=asciiDigits(text);
    // One reading of "typed a number", in `lead-phone.ts`, shared with the search box and with the
    // number search itself. `numberShaped` is that question; `refusedPhone` adds the length at which a
    // number search could actually find somebody, which is the length below which a fragment is still
    // safe in a URL. The two must move together: a fragment short enough to slip into a URL would be
    // long enough for the posted search to find somebody, so the same digit run cannot be allowed in one
    // path and refused in the other.
    numberShaped=isNumberAttempt(text);
    if(numberShaped&&text.length>=PHONE_SEARCH_MIN_DIGITS)refusedPhone=true;
    if(!refusedPhone)search.set('q',text);
  }
  for(const [key,value] of Object.entries({
    status:params.status,classGroup:params.classGroup,group:params.group,shift:params.shift,
    medium:params.medium,source:params.source,from:params.from,to:params.to,followUp:params.followUp,
  }))if(value)search.set(key,String(value));
  if(params.page&&params.page>1)search.set('page',String(params.page));
  const query=search.toString();
  return {href:`/${locale}${LEAD_LIST_PATH}${query?`?${query}`:''}`,refusedPhone,numberShaped};
}

/**
 * A family key ties siblings together. It is the smallest normalized number they share, prefixed so
 * it can never be mistaken for an id — readable on purpose, because the owner has to be able to see
 * which number joined two leads. Leads that share a number inherit an EXISTING key rather than
 * deriving a new one (that union is a database question, `src/lib/leads/leads.ts`); this function is
 * only the starting point for a lead nobody is related to yet.
 */
export function familyKeyFromPhones(phones:(string|null|undefined)[]):string|null{
  const usable=phones.map(phone=>String(phone||'').trim()).filter(phone=>/^01[3-9]\d{8}$/.test(phone)).sort();
  return usable.length?`fam:${usable[0]}`:null;
}

/**
 * Archiving is a SUGGESTION, never an automatic delete: a lead older than 18 months is offered to
 * the operator, who decides. The day is computed with month overflow handled by the calendar (18
 * months after 2024-09-30 is 2026-03-30, not a hand-rolled 540 days).
 */
export function archiveSuggestionDay(dateDay:string):string|null{
  if(!dateDay||!/^\d{4}-\d{2}-\d{2}$/.test(dateDay))return null;
  const [year,month,day]=dateDay.split('-').map(Number);
  return dhakaDay(new Date(Date.UTC(year,month-1+18,day)));
}

export function suggestsArchive(dateDay:string,now:Date=new Date()):boolean{
  const day=archiveSuggestionDay(dateDay);
  return !!day&&day<=dhakaDay(now);
}
