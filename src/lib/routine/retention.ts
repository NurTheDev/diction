/**
 * R9 · the routine's own housekeeping, run by the daily job.
 *
 * Two things grow, and both are bounded here rather than left to an operator who will not remember:
 *
 *   • **Working sheets.** A `DailyRoutine` is a day's own words, and a day that is sixty days old has
 *     said them already: the master week is the permanent record, the sheet was the working paper. So
 *     the job prunes sheets older than the window. A sheet in the Recycle Bin is not this job's business
 *     — the bin's own purge has it after thirty days. A sheet that was SENT is the exception, and only
 *     for a while: it is the copy of what went out, so it lives as long as the SMS and activity logs
 *     that say the same thing do, and then it goes too. Nothing here is kept forever, because the
 *     database this runs on is 512 MB.
 *   • **Binned periods.** A period deleted from the week sits in its day's own bin for thirty days — the
 *     window every other record in this app has — and then the job drops it for good.
 *   • **A day's memory.** Every day keeps the last twenty changes inside itself, and an entry older than
 *     ninety days is dropped here. The cap is what keeps one day small; this is what keeps an old day from
 *     carrying the term's whole diary.
 *
 * The counts come back so the job can report them, and nothing here throws: a housekeeping failure must
 * not take the rest of the daily job with it.
 */
import {DailyRoutine,MasterRoutine} from '@/models/Routine';
import {dhakaDay} from '@/lib/admin/today';
import {LOG_RETENTION_MONTHS,logRetentionMonths} from '@/lib/admin/cron';
import {shiftDate} from './time';
import {DAILY_RETENTION_DAYS,pruneCutoff} from './day';
import {HISTORY_RETENTION_DAYS,historyCutoff} from './history';

export {DAILY_RETENTION_DAYS,HISTORY_RETENTION_DAYS,pruneCutoff,historyCutoff};

export interface RoutineRetentionReport{
  /** Working sheets pruned because their date is older than sixty days and nothing was sent from them. */
  dailySheets:number;
  /** Sent sheets pruned because they are older than the log window that says the same thing. */
  sentSheets:number;
  /** Binned periods whose thirty days were up, in master weeks and working sheets alike. */
  periods:number;
  /** History entries older than ninety days, dropped from the days that still held them. */
  history:number;
}

/** The oldest date a SENT sheet is kept: the log window, not the sixty-day working-paper window. */
export function sentSheetCutoff(now:Date=new Date(),retentionMonths:number=LOG_RETENTION_MONTHS):string{
  return shiftDate(dhakaDay(now),-Math.round(retentionMonths*30));
}

/** The instant an entry ages out: Dhaka's cutoff day, read from the start of that day. */
export function historyCutoffAt(now:Date=new Date()):Date{
  return new Date(`${historyCutoff(now)}T00:00:00+06:00`);
}

/** How many history entries in one collection are due, counted before they are pulled. */
async function dueHistory(collection:typeof MasterRoutine,cutoff:Date):Promise<number>{
  const rows=await collection.aggregate<{due:number}>([
    {$match:{'history.at':{$lt:cutoff}}},
    {$project:{due:{$size:{$filter:{input:'$history',as:'entry',cond:{$lt:['$$entry.at',cutoff]}}}}}},
  ]);
  return rows.reduce((total,row)=>total+(Number(row.due)||0),0);
}

/** How many binned periods in one collection are due, counted before they are pulled. */
async function duePeriods(collection:typeof MasterRoutine,now:Date):Promise<number>{
  const rows=await collection.aggregate<{due:number}>([
    {$match:{'periods.purgeAt':{$lte:now}}},
    {$project:{due:{$size:{$filter:{input:'$periods',as:'period',
      cond:{$lte:['$$period.purgeAt',now]}}}}}},
  ]);
  return rows.reduce((total,row)=>total+(Number(row.due)||0),0);
}

/**
 * Prune the working sheets whose date has aged out, and drop the binned periods whose thirty days are up.
 * `now` is a parameter so a suite can prove the window without waiting sixty days for it.
 */
export async function routineRetention(now:Date=new Date(),months?:number):Promise<RoutineRetentionReport>{
  /* The centre's own log window, read the way the log trim reads it: a setting the owner changed is a
     setting this respects. */
  const retentionMonths=months??await logRetentionMonths();
  const cutoff=pruneCutoff(now);
  const sentCutoff=sentSheetCutoff(now,retentionMonths);
  const agedOut=historyCutoffAt(now);
  const [pruned,sentPruned,masterDue,dailyDue,masterHistory,dailyHistory]=await Promise.all([
    DailyRoutine.deleteMany({date:{$lt:cutoff},sentAt:null}),
    DailyRoutine.deleteMany({date:{$lt:sentCutoff},sentAt:{$ne:null}}),
    duePeriods(MasterRoutine,now),
    duePeriods(DailyRoutine,now),
    dueHistory(MasterRoutine,agedOut),
    dueHistory(DailyRoutine,agedOut),
  ]);
  await Promise.all([
    MasterRoutine.updateMany({},{$pull:{periods:{purgeAt:{$lte:now}}}}),
    DailyRoutine.updateMany({},{$pull:{periods:{purgeAt:{$lte:now}}}}),
    /* Only the days that actually hold an aged entry are written to, so a day that has been edited
       lately is never touched by the job at all. */
    MasterRoutine.updateMany({'history.at':{$lt:agedOut}},{$pull:{history:{at:{$lt:agedOut}}}}),
    DailyRoutine.updateMany({'history.at':{$lt:agedOut}},{$pull:{history:{at:{$lt:agedOut}}}}),
  ]);
  return {dailySheets:pruned.deletedCount||0,sentSheets:sentPruned.deletedCount||0,
    periods:masterDue+dailyDue,history:masterHistory+dailyHistory};
}
