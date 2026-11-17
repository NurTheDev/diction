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

/** The step the minutes are offered in, so a picker and a chain cannot drift apart. */
export const MINUTE_STEP=5;

/**
 * The lengths a period is offered in, in minutes, and the one the centre's own paper schedule uses.
 *
 * A period here is fifty minutes and the day is three of them back to back — 09:20 to 10:10, 10:10 to
 * 11:00, 11:00 to 11:50 in the morning shift — so fifty is the chip that is already pressed when a
 * drawer opens on a new period. The others are what a centre shortens a period to when a batch runs
 * forty-five or forty minutes, and sixty is the hour a lab or a double period takes. Nothing here is a
 * limit: a time the chips do not name is still a time, which is what the `custom` chip is for.
 */
export const PERIOD_DURATIONS=[50,45,40,60] as const;
export type PeriodDuration=typeof PERIOD_DURATIONS[number];
export const DEFAULT_PERIOD_MINUTES:PeriodDuration=50;

/** The last minute a period can end on: a wall clock in `HH:MM` has no twenty-fourth hour. */
const LAST_MINUTE=23*60+60-MINUTE_STEP;

/**
 * The end of a period that starts at `start` and runs `minutes`.
 *
 * Clamped to the last step of the day rather than wrapped, because a period that ran past midnight
 * would come back as an end before its own start and read as a negative length.
 */
export function endAfter(start:string,minutes:number):string{
  const from=clockMinutes(start);
  if(!Number.isFinite(from))return start;
  const length=Number.isFinite(minutes)&&minutes>0?Math.round(minutes):DEFAULT_PERIOD_MINUTES;
  return clockOfMinutes(Math.min(from+length,LAST_MINUTE));
}

/** Which chip a period's own two times press, or `null` when no preset length says them. */
export function presetFor(start:string,end:string):PeriodDuration|null{
  const length=durationMinutes(start,end);
  return (PERIOD_DURATIONS as readonly number[]).includes(length)?(length as PeriodDuration):null;
}

/** One period of a day, as the chain reads it: its two times and the sequence it was written with. */
export interface ChainPeriod{start:string;end:string;order:number}

/** What "+ the next period" prefills: the times and the sequence, from the day's own periods. */
export interface ChainSeed{start:string;end:string;order:number}

/**
 * The next period of a day, worked out from the periods the day already holds.
 *
 * Three facts, and each is the day's own rather than a guess:
 *   · it starts when the last one ends — the latest `end` on the day, not the last row the operator
 *     happened to write, so a period added out of order still chains from the end of the day;
 *   · it runs the length the chips are on, which is fifty minutes unless the operator pressed another;
 *   · its sequence is one past the highest on the day, so a day of three reads 1, 2, 3 and never two
 *     periods claiming the same place in the order the day is read in.
 *
 * A day with nothing on it has no end to chain from, so it starts at `firstStart` — the shift's own
 * first period where the screen knows it, and the drawer's own default where it does not.
 */
export function nextPeriodSeed(periods:ChainPeriod[],minutes:number=DEFAULT_PERIOD_MINUTES,
  firstStart='08:00'):ChainSeed{
  const ends=periods.map(period=>clockMinutes(period.end)).filter(value=>Number.isFinite(value));
  const start=ends.length?clockOfMinutes(Math.max(...ends)):firstStart;
  const orders=periods.map(period=>Number(period.order)).filter(value=>Number.isSafeInteger(value));
  return {start,end:endAfter(start,minutes),order:orders.length?Math.max(...orders)+1:1};
}

/** The hour as a twelve-hour clock reads it: 0 and 13 both read 12, 15 reads 3. */
export function hour12Of(hour:number):number{
  const whole=((Math.floor(hour)%12)+12)%12;
  return whole===0?12:whole;
}

/**
 * A time on a twelve-hour clock, in the screen's own digits: `৯:২০` beside the `০৯:২০` the record
 * stores. The part of the day is a word from the catalog and is added by the screen, not here — this
 * returns numbers only, so no component has to hold a Bangla string to offer both clocks.
 */
export function clock12Word(value:string,digits:Digits='bn'):string{
  const minutes=clockMinutes(value);
  if(!Number.isFinite(minutes))return formatDigits(String(value).trim(),digits);
  const hour=Math.floor(minutes/60);
  return formatDigits(`${hour12Of(hour)}:${String(minutes%60).padStart(2,'0')}`,digits);
}
