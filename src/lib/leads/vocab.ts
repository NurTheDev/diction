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
import {dhakaDay,dhakaToday} from '@/lib/admin/today';

export const LEAD_STATUSES=['new','called','interested','trial_booked','admitted','not_interested','no_answer','do_not_contact'] as const;
export type LeadStatus=typeof LEAD_STATUSES[number];

export const LEAD_STATUS_LABELS:Record<LeadStatus,{bn:string;en:string}>={
  new:{bn:'নতুন',en:'New'},
  called:{bn:'কল করা হয়েছে',en:'Called'},
  interested:{bn:'আগ্রহী',en:'Interested'},
  trial_booked:{bn:'ট্রায়াল নির্ধারিত',en:'Trial booked'},
  admitted:{bn:'ভর্তি',en:'Admitted'},
  not_interested:{bn:'আগ্রহী নন',en:'Not interested'},
  no_answer:{bn:'সাড়া নেই',en:'No answer'},
  do_not_contact:{bn:'যোগাযোগ করবেন না',en:'Do not contact'},
};

export const LEAD_SOURCES=['walk_in','phone','facebook','referral','other'] as const;
export type LeadSource=typeof LEAD_SOURCES[number];

export const LEAD_SOURCE_LABELS:Record<LeadSource,{bn:string;en:string}>={
  walk_in:{bn:'সরাসরি এসেছেন',en:'Walk-in'},
  phone:{bn:'ফোনে জানতে চেয়েছেন',en:'Phone'},
  facebook:{bn:'ফেসবুক',en:'Facebook'},
  referral:{bn:'পরিচিত কারো মাধ্যমে',en:'Referral'},
  other:{bn:'অন্যান্য',en:'Other'},
};

export const LEAD_SHIFTS=['morning','evening','any'] as const;
export type LeadShift=typeof LEAD_SHIFTS[number];

export const LEAD_SHIFT_LABELS:Record<LeadShift,{bn:string;en:string}>={
  morning:{bn:'সকাল',en:'Morning'},
  evening:{bn:'সন্ধ্যা',en:'Evening'},
  any:{bn:'যেকোনো',en:'Any'},
};

/** "Bangla Version" and "English Version" are how the sheet says it; unknown stays unknown. */
export const LEAD_MEDIUMS=['bangla','english_version','unknown'] as const;
export type LeadMedium=typeof LEAD_MEDIUMS[number];

export const LEAD_MEDIUM_LABELS:Record<LeadMedium,{bn:string;en:string}>={
  bangla:{bn:'বাংলা ভার্সন',en:'Bangla Version'},
  english_version:{bn:'ইংলিশ ভার্সন',en:'English Version'},
  unknown:{bn:'অজানা',en:'Unknown'},
};

export const LEAD_GROUPS=['science','arts','commerce','unknown'] as const;
export type LeadGroup=typeof LEAD_GROUPS[number];

export const LEAD_GROUP_LABELS:Record<LeadGroup,{bn:string;en:string}>={
  science:{bn:'বিজ্ঞান',en:'Science'},
  arts:{bn:'মানবিক',en:'Arts'},
  commerce:{bn:'ব্যবসায় শিক্ষা',en:'Commerce'},
  unknown:{bn:'অজানা',en:'Unknown'},
};

/** What a note can conclude. A note with no outcome is allowed: not every call ends in a verdict. */
export const LEAD_NOTE_OUTCOMES=['no_answer','call_back_later','interested','not_interested'] as const;
export type LeadNoteOutcome=typeof LEAD_NOTE_OUTCOMES[number];

export const LEAD_NOTE_OUTCOME_LABELS:Record<LeadNoteOutcome,{bn:string;en:string}>={
  no_answer:{bn:'সাড়া নেই',en:'No answer'},
  call_back_later:{bn:'পরে কল করতে হবে',en:'Call back later'},
  interested:{bn:'আগ্রহী',en:'Interested'},
  not_interested:{bn:'আগ্রহী নন',en:'Not interested'},
};

/**
 * The quick next-follow-up buttons on every row. `custom` opens a date field instead of guessing:
 * "next week" means seven days, not "the next Monday", because the owner's sheet says a number of
 * days and a wrong guess would hide a lead that should have been called.
 */
export const FOLLOW_UP_OPTIONS=[
  {key:'today',days:0,bn:'আজ',en:'Today'},
  {key:'tomorrow',days:1,bn:'আগামীকাল',en:'Tomorrow'},
  {key:'three_days',days:3,bn:'তিন দিন পরে',en:'In 3 days'},
  {key:'next_week',days:7,bn:'পরের সপ্তাহে',en:'Next week'},
  {key:'custom',days:null,bn:'তারিখ বেছে নিন',en:'Pick a date'},
] as const;
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
}):{href:string;refusedPhone:boolean}{
  const locale=params.locale==='en'?'en':'bn';
  const search=new URLSearchParams();
  let refusedPhone=false;
  const text=String(params.q||'').trim();
  if(text){
    // Digits, spaces, dashes and a leading + are how a number is typed; anything else is a name.
    // Bangla digits are digits: ০১৭১২৮১৭০৯০ must be refused just as firmly as 01712817090.
    const ascii=text.replace(/[০-৯]/g,c=>String('০১২৩৪৫৬৭৮৯'.indexOf(c)));
    if(/^[\d\s()+.-]{7,}$/.test(ascii))refusedPhone=true;else search.set('q',text);
  }
  for(const [key,value] of Object.entries({
    status:params.status,classGroup:params.classGroup,group:params.group,shift:params.shift,
    medium:params.medium,source:params.source,from:params.from,to:params.to,followUp:params.followUp,
  }))if(value)search.set(key,String(value));
  if(params.page&&params.page>1)search.set('page',String(params.page));
  const query=search.toString();
  return {href:`/${locale}${LEAD_LIST_PATH}${query?`?${query}`:''}`,refusedPhone};
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
