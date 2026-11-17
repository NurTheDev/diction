/**
 * R9 · what a day's sheet says, and when it is worth storing.
 *
 * The daily working sheet is pre-filled from the master routine, and most days nobody changes anything.
 * Writing a copy of the week for every class for every day would fill a 512 MB database with rows that
 * say nothing new, so the rule is the opposite: **a day that matches its master routine writes no
 * document at all.** The sheet exists only when the date has something of its own to say — a different
 * teacher, a moved room, a holiday and its reason, a note — and it is deleted again the moment an edit
 * takes it back to being an exact copy of the week.
 *
 * Deciding "is this the same day?" needs a comparison that ignores everything the engine derives (ids,
 * which master period a copy came from, the timestamps) and reads only what an operator would read:
 * which periods run, when, in what order, with whom and where. That is `daySignature`, and it is also
 * what the sent marks are made of — a sheet that no longer hashes to what was sent has changed since it
 * went out, which is a fact rather than a guess.
 */
import {createHash} from 'node:crypto';
import {dhakaDay} from '@/lib/admin/today';
import {clockMinutes,shiftDate} from './time';

/** Working sheets older than this are pruned by the daily job. Fixed by the brief; not a setting. */
export const DAILY_RETENTION_DAYS=60;

/** A period as the comparison reads it: no ids, no provenance, no timestamps. */
export interface PeriodShape{
  start:string;
  end:string;
  subjectBn:string;
  subjectEn?:string;
  teacher?:string|null;
  room?:string;
  jointWith?:string|null;
  order?:number;
  note?:string;
}

export type DayStatus='normal'|'adjusted'|'holiday';

const trim=(value:unknown):string=>String(value??'').trim();
/** An id read as lower-case text, so the same period stored twice never compares as two. */
const idOf=(value:unknown):string=>{const text=trim(value);return text?text.toLowerCase():''};

/** One period, canonically: the fields an operator reads, in a fixed order, separated so no value can
    leak into the next one. */
export function periodKey(period:PeriodShape):string{
  return [
    trim(period.start),trim(period.end),trim(period.subjectBn),trim(period.subjectEn),
    idOf(period.teacher),trim(period.room).toLowerCase(),idOf(period.jointWith),
    String(Number.isFinite(Number(period.order))?Number(period.order):0),trim(period.note),
  ].join('|');
}

/** Periods in the order the day runs them: by start time, then the owner's own order, then the subject. */
export function sortPeriods<T extends PeriodShape>(periods:T[]):T[]{
  return [...periods].sort((a,b)=>{
    const [startA,startB]=[clockMinutes(a.start),clockMinutes(b.start)];
    if(Number.isFinite(startA)&&Number.isFinite(startB)&&startA!==startB)return startA-startB;
    const orderA=Number(a.order)||0,orderB=Number(b.order)||0;
    if(orderA!==orderB)return orderA-orderB;
    return periodKey(a).localeCompare(periodKey(b));
  });
}

/** The day's own hash: every period it runs, in the order it runs them. */
export function daySignature(periods:PeriodShape[]):string{
  const body=sortPeriods(periods).map(periodKey).join('\n');
  return createHash('sha256').update(body,'utf8').digest('hex');
}

/** Is this day the master day, period for period? Order and ids do not matter; the content does. */
export function sameAsMaster(dayPeriods:PeriodShape[],masterPeriods:PeriodShape[]):boolean{
  return daySignature(dayPeriods)===daySignature(masterPeriods);
}

export interface SheetDraft{
  status:DayStatus;
  notes?:string;
  holidayReason?:string;
  periods:PeriodShape[];
  masterPeriods:PeriodShape[];
  /** A sheet that has been sent is kept whatever it says: it is the record of what went out. */
  sentAt?:Date|string|null;
}

/**
 * Does this draft need a document? Only when it says something the week does not: a status that is not
 * `normal`, a holiday reason, a note, a period the master does not have, or a sent mark to keep.
 *
 * Note what is NOT a reason to store: a day whose periods were copied from the master and never
 * touched. That copy is the week, and the week is already stored.
 */
export function needsDocument(draft:SheetDraft):boolean{
  if(draft.sentAt)return true;
  if(trim(draft.notes))return true;
  if(trim(draft.holidayReason))return true;
  if(draft.status!=='normal')return true;
  return !sameAsMaster(draft.periods,draft.masterPeriods);
}

/** The inverse, named for the code that reads it: an unchanged day writes nothing. */
export function isRedundantCopy(draft:SheetDraft):boolean{return !needsDocument(draft)}

/** A holiday with no reason is a day off nobody can explain later; the sheet asks for one. */
export function holidayNeedsReason(status:DayStatus,reason:string):boolean{
  return status==='holiday'&&!trim(reason);
}

/**
 * The oldest date still worth keeping: Dhaka's today minus the retention window. Working sheets with a
 * date strictly before it are pruned — a sheet dated exactly sixty days back is today's business still.
 */
export function pruneCutoff(now:Date=new Date()):string{
  return shiftDate(dhakaDay(now),-DAILY_RETENTION_DAYS);
}

/** Is this sheet's date one the daily job would prune? The same rule, so a test and the job agree. */
export function isPrunable(date:string,now:Date=new Date()):boolean{
  return trim(date)<pruneCutoff(now);
}

/** Has a sent sheet been edited since it went out? No sent mark, no badge. */
/** A sheet as its sent mark reads it: the day, not only its periods. A holiday declared or a note
 * added after the dispatch went out is as much a change since the send as a moved room is, so the
 * signature the badge compares against covers everything the sheet holds. */
export interface SentSheet{status:DayStatus;notes?:string;holidayReason?:string;periods:PeriodShape[]}
export function sheetSignature(sheet:SentSheet):string{
  return createHash('sha256').update(JSON.stringify({status:sheet.status,notes:trim(sheet.notes),
    reason:trim(sheet.holidayReason),day:daySignature(sheet.periods)})).digest('hex');
}
export function changedSinceSent(sheet:SentSheet,sentSignature:string):boolean{
  const sent=trim(sentSignature);
  if(!sent)return false;
  return sheetSignature(sheet)!==sent;
}

/** `HH:MM` on a five-minute step, or the nearest one below it — what a picker writes back. */
export function snapClock(value:string):string{
  const minutes=clockMinutes(value);
  if(!Number.isFinite(minutes))return '';
  return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(Math.floor((minutes%60)/5)*5).padStart(2,'0')}`;
}
