/**
 * R9 · Slice 2 · the routine's own memory: the last twenty changes of every day, kept inside the day.
 *
 * A coaching centre asks "who moved my 8 o'clock period?" about as often as it asks anything else, and
 * the answer used to be nobody's recollection. So every write to a master day or a working sheet leaves
 * one entry here: who wrote it, when by the wall clock, a catalog code the screen turns into a sentence
 * in whichever language it is being read in, and the whole day as it stood once the write was in — which
 * is what makes "Restore this version" a revert to a stored state rather than a guess at undoing.
 *
 * Two bounds keep this a memory and not an archive, because the database behind it is 512 MB:
 *
 *   • **twenty entries**, capped in code the moment an entry is pushed — the question is always "what
 *     changed lately", never "what changed last monsoon";
 *   • **ninety days**, pruned by the same daily job that prunes the sheets, so an entry outlives the
 *     week it describes but not the term.
 */
import mongoose from 'mongoose';
import {shiftDate} from './time';
import {dhakaDay} from '@/lib/admin/today';
import type {DayStatus} from './day';

/** How many edits one day remembers. Fixed by the brief; not a setting. */
export const HISTORY_CAP=20;
/** How long an entry lives before the daily job drops it. Fixed by the brief; not a setting. */
export const HISTORY_RETENTION_DAYS=90;

/** One period as a snapshot holds it: values only, no ids, no provenance beyond what a restore needs. */
export interface SnapshotPeriod{
  start:string;
  end:string;
  subjectBn:string;
  subjectEn:string;
  teacher:string;
  room:string;
  jointWith:string;
  order:number;
  note:string;
  source:'master'|'own';
  masterPeriod:string;
}

/** A whole day as one entry remembers it — everything a restore puts back, nothing else. */
export interface HistorySnapshot{
  shift:string;
  active:boolean;
  status:DayStatus;
  holidayReason:string;
  notes:string;
  periods:SnapshotPeriod[];
}

/** What the screen paints for one entry: the catalog code, its parameters, and the Dhaka wall clock. */
export interface HistoryView{
  id:string;
  at:string;
  byName:string;
  code:string;
  params:Record<string,string|number>;
}

/** Keep only the newest `HISTORY_CAP` entries — called on every push, so the array never grows past it. */
export function capHistory<T>(entries:T[]):T[]{
  return entries.length>HISTORY_CAP?entries.slice(entries.length-HISTORY_CAP):entries;
}

/** The oldest date whose entries survive the daily job, as a day string in Asia/Dhaka. */
export function historyCutoff(now:Date=new Date()):string{
  return shiftDate(dhakaDay(now),-HISTORY_RETENTION_DAYS);
}

/** One entry as the database holds it — the model's own shape, read loosely so a writer and a lean read agree. */
export interface StoredHistoryEntry{
  _id?:unknown;
  at?:Date|string;
  by?:unknown;
  byName?:string;
  code?:string;
  params?:Record<string,string|number>;
  snapshot?:HistorySnapshot;
}

/**
 * What a writer pushes: who, which catalog code, and the words that code needs. The document it is
 * pushed onto already carries its new values, so the snapshot taken here is the state this entry
 * restored to — "restore this version" puts the day back exactly as it reads at that moment.
 */
export interface HistoryDraft{
  actor:string;
  actorName:string;
  code:string;
  params?:Record<string,string|number>;
  /**
   * A struck id for the entry, for the writes that run inside a transaction. Mongo re-runs a transaction
   * callback after a transient error, and a callback that pushes blindly would come out of the retry
   * holding the same entry twice — a day that remembers one change as two.
   */
  entryId?:string;
}

/** A period as a routine document holds it, read loosely enough for the master day and the sheet alike. */
export interface HistoryPeriodSource{
  start:string;
  end:string;
  subject?:{bn?:string;en?:string}|null;
  teacher?:unknown;
  room?:string;
  jointWith?:unknown;
  order?:number;
  note?:string;
  source?:string;
  masterPeriod?:unknown;
  deletedAt?:unknown;
}

export interface HistoryCarrier{
  shift?:string;
  active?:boolean;
  status?:string;
  holidayReason?:string;
  notes?:string;
  periods?:HistoryPeriodSource[];
  history?:unknown[];
}

/**
 * Note the change a day has just had. Binned periods stay out of the snapshot — they are not part of the
 * day, and the Recycle Bin is what brings one back — and the array is capped here, on every push, so a
 * day never carries twenty-one entries even for a moment.
 */
export function recordHistory(doc:HistoryCarrier,draft:HistoryDraft):void{
  const periods:SnapshotPeriod[]=(doc.periods||[])
    .filter(period=>!(period.deletedAt instanceof Date))
    .map(period=>({
      start:period.start,end:period.end,
      subjectBn:period.subject?.bn||'',subjectEn:period.subject?.en||'',
      teacher:period.teacher?String(period.teacher):'',
      room:period.room||'',jointWith:period.jointWith?String(period.jointWith):'',
      order:typeof period.order==='number'?period.order:0,note:period.note||'',
      source:period.source==='master'?'master':'own',
      masterPeriod:period.masterPeriod?String(period.masterPeriod):'',
    }));
  const status:DayStatus=doc.status==='holiday'||doc.status==='adjusted'?doc.status:'normal';
  const entry:StoredHistoryEntry={
    at:new Date(),
    by:mongoose.isValidObjectId(draft.actor)?new mongoose.Types.ObjectId(draft.actor):null,
    byName:draft.actorName,code:draft.code,params:draft.params||{},
    snapshot:{shift:doc.shift||'',active:doc.active!==false,status,
      holidayReason:doc.holidayReason||'',notes:doc.notes||'',periods},
  };
  const held=Array.isArray(doc.history)?(doc.history as StoredHistoryEntry[]):[];
  if(draft.entryId&&held.some(candidate=>String(candidate._id||'')===draft.entryId))return;
  if(draft.entryId)entry._id=new mongoose.Types.ObjectId(draft.entryId);
  doc.history=capHistory([...held,entry]);
}

/** The entries a screen paints, newest first: the wall clock as text, the name, the code and its words. */
export function historyViews(entries:StoredHistoryEntry[]|undefined):HistoryView[]{
  if(!Array.isArray(entries))return [];
  return entries.map((entry,index)=>({
    id:entry._id?String(entry._id):`entry-${index}`,
    at:entry.at instanceof Date?entry.at.toISOString():String(entry.at||''),
    byName:String(entry.byName||''),
    code:String(entry.code||''),
    params:entry.params&&typeof entry.params==='object'?entry.params:{},
  })).reverse();
}

/** The snapshot one "restore this version" tap puts back, or nothing when the entry has gone. */
export function snapshotFor(entries:StoredHistoryEntry[]|undefined,id:string):HistorySnapshot|null{
  if(!Array.isArray(entries))return null;
  const entry=entries.find(candidate=>String(candidate._id||'')===id);
  return entry?.snapshot||null;
}

/** Drop the entries older than the retention window — the daily job's half of keeping history small. */
export function pruneHistory<T extends StoredHistoryEntry>(entries:T[],now:Date=new Date()):T[]{
  const cutoff=historyCutoff(now);
  return entries.filter(entry=>{
    const at=entry.at instanceof Date?entry.at:new Date(String(entry.at||''));
    if(Number.isNaN(at.getTime()))return false;
    return dhakaDay(at)>=cutoff;
  });
}
