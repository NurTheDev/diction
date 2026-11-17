/**
 * R9 · the routine's own reading of a clock and a calendar day.
 *
 * Pure, and deliberately outside every client boundary: a Server Component that imports a plain value
 * from a `'use client'` module receives a client *reference* instead and its segment never fills, which
 * is how the Visitors list once died (see `src/components/admin/list-dates.ts`). Both the pages and the
 * client drawers import these words, so they live here with no directive at all.
 *
 * Two rules the whole feature rests on:
 *   · a period's time is `HH:MM` text, never a `Date` — a wall-clock time has no timezone to shift;
 *   · a date is Dhaka's own day, never the server's — the operator's midnight is six hours ahead of UTC,
 *     so a sheet built from `new Date()` opens on yesterday's date for six hours every evening.
 */
import {dhakaDay} from '@/lib/admin/today';
import {formatDigits,formatNumber,type Digits} from '@/lib/admin/format';


export type Language='bn'|'en';

const CLOCK=/^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY=/^(\d{4})-(\d{2})-(\d{2})$/;

/** Minutes after midnight, or `NaN` for anything that is not `HH:MM`. */
export function clockMinutes(value:string):number{
  const match=CLOCK.exec(String(value).trim());
  if(!match)return NaN;
  return Number(match[1])*60+Number(match[2]);
}

export function validClock(value:string):boolean{return Number.isFinite(clockMinutes(value))}

/** `HH:MM` from minutes after midnight, wrapped into one day so a typo cannot store `25:00`. */
export function clockOfMinutes(minutes:number):string{
  const whole=Math.floor(((minutes%1440)+1440)%1440);
  return `${String(Math.floor(whole/60)).padStart(2,'0')}:${String(whole%60).padStart(2,'0')}`;
}

/** Two periods clash when they share a minute: they overlap unless one ends as the other starts. */
export function overlaps(startA:string,endA:string,startB:string,endB:string):boolean{
  const [a,b,c,d]=[clockMinutes(startA),clockMinutes(endA),clockMinutes(startB),clockMinutes(endB)];
  if([a,b,c,d].some(value=>!Number.isFinite(value)))return false;
  return a<d&&c<b;
}

/** How long a period runs, in minutes; zero or negative when the end is not after the start. */
export function durationMinutes(start:string,end:string):number{
  const [a,b]=[clockMinutes(start),clockMinutes(end)];
  return Number.isFinite(a)&&Number.isFinite(b)?b-a:0;
}

/** An hour or a minute as its own option reads: padded in ASCII first, then folded into the digits the
    screen reads, so no Bangla character is ever written into a component. */
export function hourWord(hour:number,digits:Digits='bn'):string{return formatDigits(String(hour).padStart(2,'0'),digits)}
export function minuteWord(minute:number,digits:Digits='bn'):string{return formatDigits(String(minute).padStart(2,'0'),digits)}

/** A time read in the operator's own digits: the hour and the minute the screen's own digits spell. */
export function clockWord(value:string,digits:Digits='bn'):string{return formatDigits(String(value).trim(),digits)}

/** A period as the grid reads it: `০৮:০০ – ০৯:০০`. */
export function rangeWord(start:string,end:string,digits:Digits='bn'):string{
  return `${clockWord(start,digits)} – ${clockWord(end,digits)}`;
}

/**
 * The weekday a date falls on, 0 = Sunday … 6 = Saturday — the week as Bangladesh reads it, which is
 * also `Intl`'s own numbering, so the calendar head and the grid agree without a conversion table.
 * Built from the date's parts rather than from a timestamp, so no timezone can move it a day.
 */
export function weekdayOf(date:string):number{
  const match=DAY.exec(String(date).trim());
  if(!match)return NaN;
  return new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]))).getUTCDay();
}

/** A date moved by a number of days (negative goes back), still `YYYY-MM-DD` and still Dhaka's day. */
export function shiftDate(date:string,days:number):string{
  const match=DAY.exec(String(date).trim());
  if(!match)return date;
  const at=new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])+days));
  return at.toISOString().slice(0,10);
}

/** Is this date before Dhaka's today? A past sheet is fully editable; it only says so. */
export function hasPassed(date:string,now:Date=new Date()):boolean{
  return String(date).trim()<dhakaDay(now);
}

/** The weekday's own name, from `Intl` — never a hardcoded table in either language. */
export function weekdayName(index:number,language:Language='bn',style:'long'|'short'='long'):string{
  const at=new Date(Date.UTC(2024,0,7+(((index%7)+7)%7)));
  return new Intl.DateTimeFormat(language==='bn'?'bn-BD':'en-GB',{weekday:style,timeZone:'UTC'}).format(at);
}

/** Seven weekday names starting on Sunday, in the screen's own language. */
export function weekdayNames(language:Language='bn',style:'long'|'short'='long'):string[]{
  return Array.from({length:7},(_,index)=>weekdayName(index,language,style));
}

/** A date read back the way the pattern reads one: `১২/১১/২০২৬` or `12 Nov 2026`. Never mm/dd/yyyy. */
export function dayWord(date:string,digits:Digits='bn',language:Language='bn'):string{
  const match=DAY.exec(String(date).trim());
  if(!match)return String(date);
  const [year,month,day]=[Number(match[1]),Number(match[2]),Number(match[3])];
  if(language==='en'){
    const name=new Intl.DateTimeFormat('en-GB',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,day)));
    return `${formatNumber(day,'en')} ${name} ${formatNumber(year,'en')}`;
  }
  return formatDigits(`${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`,digits);
}

/** A date with its weekday: `বৃহস্পতিবার · ১২/১১/২০২৬` — what the daily sheet's head reads. */
export function dayHeading(date:string,digits:Digits='bn',language:Language='bn'):string{
  const index=weekdayOf(date);
  if(!Number.isFinite(index))return dayWord(date,digits,language);
  return `${weekdayName(index,language)} · ${dayWord(date,digits,language)}`;
}

/** The minutes a time picker offers: five-minute steps, because a class does not start at 08:07. */
export const MINUTE_STEPS=[0,5,10,15,20,25,30,35,40,45,50,55] as const;
