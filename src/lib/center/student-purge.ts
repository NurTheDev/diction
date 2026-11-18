/**
 * S2 · F-10 — the second half of removing a student.
 *
 * Removing a student has always been a deliberate act rather than a delete: the row is filed behind the
 * show-removed tick with the month they left and the reason, so a roll from last term can still be
 * printed and a removal can still be undone. What it never had was an end. A student removed in 2019 was
 * still in the collection in 2026, still counted by every query that had to say `status:{$ne:'removed'}`
 * out loud, and still one more row in the backup the centre downloads — because nothing anywhere decided
 * when a removal stops being a record the centre is working from.
 *
 * So a removal is now filed with the date it stops being kept (`removal.purgeAt`), and the daily job drops
 * the ones whose date has passed. Two rules this module holds:
 *
 * · **The window is the centre's, not this file's.** `purgeRetentionDays` in the centre's own settings is
 *   the number of days a removed student is kept, and thirty is the default only because a centre that
 *   has never opened its settings has not chosen one. Nothing here decides the window silently.
 * · **The money outlives the student.** A purge drops the student's own record and nothing else: the
 *   receipts they paid, the waivers they were given and the activity rows that say what happened to them
 *   all stay, because a cashbook that loses a line when a child leaves is a cashbook nobody can audit.
 *   The purge writes one more row of its own, in the name of the administrator who removed the student —
 *   an unattended job with no actor would be a deletion nobody can answer for, and `actor` is required.
 */
import {CenterActivityLog,CenterSettings,CenterStudent} from '@/models/CenterRecords';

/** How long a removed student is kept when the centre has chosen no window of its own. */
export const STUDENT_PURGE_RETENTION_DAYS=30;

/** One day, in the milliseconds a `Date` counts in. */
const DAY=86400000;

interface RemovalWindow{purgeRetentionDays?:number}

/**
 * The window a removed student is kept for, in days.
 *
 * The setting is read as it is stored rather than trusted: a number that is not a whole number of days,
 * is not positive, or is absurdly far out falls back to the default, because a window of `NaN` days is a
 * purge date nobody can compute and a window of a million days is a record that is never dropped.
 */
export function retentionDaysOf(settings:RemovalWindow|null|undefined):number{
  const days=Number(settings?.purgeRetentionDays);
  return Number.isSafeInteger(days)&&days>0&&days<=36500?days:STUDENT_PURGE_RETENTION_DAYS;
}

/** The date a removal made at `now` stops being kept. */
export function studentPurgeAt(now:Date,settings?:RemovalWindow|null):Date{
  return new Date(now.getTime()+retentionDaysOf(settings)*DAY);
}

/** The centre's own window, read where it is stored. */
export async function removalWindow():Promise<RemovalWindow|null>{
  try{
    return await CenterSettings.findOne({key:'main'}).select('purgeRetentionDays')
      .lean<RemovalWindow|null>();
  }catch{return null}
}

export interface StudentPurgeReport{
  /** Removed students whose window had closed and whose record is gone. */
  purged:number;
  /** How many of them left an activity row naming the administrator who removed them. */
  logged:number;
  /** Records the job could not drop. A failure is counted rather than thrown: one student's row that
      will not delete is not a reason to leave the rest of the night's housekeeping undone. */
  failed:number;
}

type DueRow={
  _id:unknown;studentId:string;name:{bn:string;en?:string};
  removal?:{removedAt?:Date;removedBy?:unknown;reason?:string;leaveDate?:string;purgeAt?:Date};
};

/** Read at a time — a centre that closed a whole session has a session's worth of removed students, and
    one query for all of them is a query that runs the job out of its own minute. */
const PAGE=200;

/**
 * Drop the removed students whose window has closed.
 *
 * Only a removal that carries a date of its own is ever dropped: a student removed before this slice has
 * no `purgeAt` at all, and a job that guessed a date for somebody else's decision would be deleting
 * records the centre has not agreed to lose. Those rows stay until an administrator removes them again —
 * or until the centre decides what to do with the history it already has.
 */
export async function purgeRemovedStudents(now:Date=new Date()):Promise<StudentPurgeReport>{
  const report:StudentPurgeReport={purged:0,logged:0,failed:0};
  for(;;){
    const due=await CenterStudent
      .find({status:'removed','removal.purgeAt':{$type:'date',$lte:now}})
      .select('studentId name removal').limit(PAGE).lean<DueRow[]>();
    if(!due.length)break;
    for(const row of due){
      try{
        await CenterStudent.deleteOne({_id:row._id});
        report.purged++;
        const actor=row.removal?.removedBy;
        if(actor){
          await CenterActivityLog.create([{actor,action:'student.purge',target:row._id,
            before:{studentId:row.studentId,name:row.name,
              leaveDate:String(row.removal?.leaveDate||''),reason:String(row.removal?.reason||''),
              purgeAt:row.removal?.purgeAt??null}}]);
          report.logged++;
        }
      }catch{report.failed++}
    }
    if(due.length<PAGE)break;
  }
  return report;
}
