/**
 * R3 · Visitor leads — reading the sheet's dates.
 *
 * The owner's Visitor sheet is written by hand, so a date arrives as `2/12/2024`, `15.12.24`,
 * `2-12-24`, in Bangla digits, or as a real Date from an xlsx cell. One rule decides all of them:
 * **day first**, because that is how a date is written in Bangladesh. Two-digit years mean 20xx.
 *
 * The rule that matters more than the parsing is what happens when a date is doubtful. It is never
 * repaired. A row where both parts could be a month is marked ambiguous and shown to the owner as
 * the day it was read; a year that disagrees with the rest of the sheet is flagged with a *suggested*
 * fix and nothing is written until the owner accepts it. Guessing a date silently would move a
 * follow-up, and a follow-up that moved is a family nobody called.
 */
import {renderLeadPair} from './lead-message';
import {dhakaDay} from '@/lib/admin/today';

/** A doubt about one date. The key and params are what an answerer translates; the pair is what a
 *  stored flag carries, because a lead written under one locale must explain itself under the other. */

/** One date sentence, from the `leads.dateFlags` catalog: a key for whoever answers, and the rendered
    pair for whatever stores the doubt. Numbers take the digits of the language they are rendered in. */
const dateText=(key:string,params:Record<string,string|number>={}):{messageKey:string;messageParams:Record<string,string|number>;messageBn:string;messageEn:string}=>({messageKey:`dateFlags.${key}`,messageParams:params,...renderLeadPair(`dateFlags.${key}`,params)});
export interface DateFlag{code:string;messageKey:string;messageParams:Record<string,string|number>;messageBn:string;messageEn:string;suggested?:string}

export type SheetDateResult=
  |{ok:true;day:string;format:string;ambiguous:boolean;flags:DateFlag[]}
  |{ok:false;reason:'empty'|'unparseable'|'impossible';raw:string;messageKey:string;messageParams:Record<string,string|number>;messageBn:string;messageEn:string};

const DIGITS=/[\u09e6-\u09ef]/g;
const banglaToAscii=(text:string)=>text.replace(DIGITS,c=>String(c.charCodeAt(0)-0x09e6));
/** A real calendar check, so 2024-02-31 is refused instead of rolling into March. */
function realDay(year:number,month:number,day:number):string|null{
  if(month<1||month>12||day<1||day>31)return null;
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

export function parseSheetDate(raw:unknown,now:Date=new Date()):SheetDateResult{
  const text=typeof raw==='string'?banglaToAscii(raw).trim():'';
  const original=text||(raw==null?'':String(raw));

  if(raw instanceof Date&&!Number.isNaN(raw.getTime())){
    // An xlsx cell arrives as a real date at UTC midnight; Dhaka is +06:00, so it is still that day.
    return {ok:true,day:dhakaDay(raw),format:'cell',ambiguous:false,flags:rowFlags(dhakaDay(raw),now)};
  }
  if(!text)return {ok:false,reason:'empty',raw:original,...dateText('empty')};

  // ISO first: 2024-12-02 has no ambiguity to resolve.
  const iso=text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if(iso){
    const day=realDay(Number(iso[1]),Number(iso[2]),Number(iso[3]));
    return day
      ? {ok:true,day,format:'iso',ambiguous:false,flags:rowFlags(day,now)}
      : impossible(original,`${iso[1]}-${iso[2]}-${iso[3]}`);
  }

  const parts=text.match(/^(\d{1,4})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{2,4})$/);
  if(!parts){
    // One or two numbers only ("15/12", "2024") is not a date this app will invent the rest of.
    return {ok:false,reason:'unparseable',raw:original,
      ...dateText('unreadable',{value:original})};
  }
  const first=Number(parts[1]),second=Number(parts[2]),third=Number(parts[3]);
  const year=third<100?2000+third:third;
  if(year<2000||year>2100){
    // A two-digit year means 20xx by rule; a four-digit one outside 2000–2100 is simply refused, and
    // the two get different sentences because only one of them is a rule the owner can rely on.
    return {ok:false,reason:'unparseable',raw:original,
      ...dateText(third<100?'yearUnreadable':'yearOutOfRange',{year:third})};
  }
  // Day first, always. When both parts could be a month the reading is a policy, not a certainty, so
  // it is reported as ambiguous rather than quietly chosen.
  const ambiguous=first<=12&&second<=12&&first!==second;
  const day=realDay(year,second,first);
  if(!day){
    // A month beyond 12 in the first slot means the writer put the month first; that is still read,
    // but only when it produces a real date, and it is reported so the owner can see the exception.
    const swapped=second>12?realDay(year,first,second):null;
    if(swapped)return {ok:true,day:swapped,format:'month-first',ambiguous:true,flags:rowFlags(swapped,now)};
    return impossible(original,`${first}/${second}/${year}`);
  }
  return {ok:true,day,format:`d${text.includes('.')?'.':text.includes('-')?'-':'/'}m`,ambiguous,flags:rowFlags(day,now)};
}

function impossible(raw:string,reading:string):SheetDateResult{
  return {ok:false,reason:'impossible',raw,
    ...dateText('impossibleDate',{value:raw,reading})};
}

/** Per-row doubts: a date in the future, or one far older than any live lead could be. */
function rowFlags(day:string,now:Date):DateFlag[]{
  const flags:DateFlag[]=[];
  const today=dhakaDay(now);
  if(day>today)flags.push({code:'future',...dateText('futureDate',{day})});
  const oldest=new Date(Date.UTC(Number(today.slice(0,4))-5,Number(today.slice(5,7))-1,Number(today.slice(8,10))));
  if(day<dhakaDay(oldest))flags.push({code:'very_old',...dateText('veryOld',{day})});
  return flags;
}

/**
 * A year that disagrees with the rest of the sheet — `2014` among rows that all say `2024` — is
 * almost always a slipped digit. This names those rows and offers the sheet's own year with the same
 * month and day, when that is a real date and not in the future. It changes nothing: the suggestion
 * is shown in the import preview and the owner accepts or corrects each row.
 */
export function flagSuspiciousYears(rows:{id:string;day:string|null|undefined}[],now:Date=new Date()):Record<string,DateFlag>{
  const counts=new Map<number,number>();
  for(const row of rows){
    if(!row.day||!/^\d{4}-\d{2}-\d{2}$/.test(row.day))continue;
    const year=Number(row.day.slice(0,4));
    counts.set(year,(counts.get(year)||0)+1);
  }
  const flagged:Record<string,DateFlag>={};
  // One year holding most of the sheet is the sheet's year; a tie has no majority to appeal to, so
  // nothing is flagged rather than picking a winner.
  const ranked=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
  if(ranked.length<2||ranked[0][1]===ranked[1][1])return flagged;
  const [modalYear,modalCount]=ranked[0];
  if(modalCount<Math.max(2,rows.length*0.5))return flagged;
  const today=dhakaDay(now);
  for(const row of rows){
    if(!row.day||!/^\d{4}-\d{2}-\d{2}$/.test(row.day))continue;
    const year=Number(row.day.slice(0,4));
    if(year===modalYear)continue;
    // The doubt is always named. A suggested fix is offered only when it is a real date and not in the
    // future — a suggestion nobody could accept is worse than none, because it invites a click.
    const suggested=realDay(modalYear,Number(row.day.slice(5,7)),Number(row.day.slice(8,10)));
    const usable=suggested&&suggested<=today?suggested:undefined;
    flagged[row.id]={code:'year_out_of_range',
      ...dateText(usable?'yearMismatchSuggested':'yearMismatch',{year,modal:modalYear,usable:usable||''}),
      suggested:usable};
  }
  return flagged;
}
