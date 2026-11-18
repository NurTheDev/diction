import {NextResponse} from 'next/server';
import {cronAuthorized} from '@/lib/admin/cron';
import {purgeExpired} from '@/lib/admin/recycle';
import {syncClassIndexes,trimOldLogs} from '@/lib/admin/cron';
import {purgeRemovedStudents} from '@/lib/center/student-purge';
import {purgeExpiredProofMilestones} from '@/lib/admin/proof-bin';
import {flushQueuedSms} from '@/lib/center/sms-send';
import {routineRetention} from '@/lib/routine/retention';
import {runAutoDue} from '@/lib/center/sms-dialog';

export const dynamic='force-dynamic';
export const maxDuration=60;

/**
 * The daily housekeeping job (R1 §E5): purge Recycle Bin rows whose 30 days are up (Cloudinary
 * assets first) and trim the SMS/activity logs past 12 months. Vercel Crons calls it on the
 * schedule in vercel.json with `Authorization: Bearer $CRON_SECRET`; without a valid secret it
 * answers 401 and touches nothing.
 *
 * R9 adds the routine's own housekeeping under its own `routine` key, again so the R1 `trim` report
 * keeps its exact shape: working sheets older than sixty days are pruned (a sheet that was sent lives
 * as long as the logs that say what went out), and periods deleted from a week are dropped once their
 * thirty days in that day's own bin are up.
 *
 * R2 adds the SMS half, reported under its own `sms` key so the R1 `trim` report keeps its exact
 * shape: send the automatic due reminders when that toggle is on and today is the chosen day, and
 * flush any batch queued by quiet hours whose time has come. This job runs at 01:00 Asia/Dhaka,
 * inside the default quiet window, so an automatic reminder is queued here and goes out at 07:05 —
 * the dedicated flush job's schedule — rather than waking a parent at one in the morning.
 */
export async function GET(request:Request){
  if(!cronAuthorized(request.headers.get('authorization'),process.env.CRON_SECRET)){
    return NextResponse.json({error:'unauthorized'},{status:401});
  }
  try{
    const [purge,trim,proofMilestones,autoDue,routine,students,indexes]=await Promise.all([purgeExpired(),trimOldLogs(),purgeExpiredProofMilestones(),runAutoDue(),routineRetention(),purgeRemovedStudents(),syncClassIndexes()]);
    // Flushed after the auto-send: a reminder queued by quiet hours is not due yet at this hour.
    const flush=await flushQueuedSms();
    const purged=purge.reduce((sum,report)=>sum+report.purged,0);
    const assetFailures=purge.reduce((sum,report)=>sum+report.assetFailures,0);
    if(assetFailures)console.error(`Daily job: ${assetFailures} Cloudinary asset(s) could not be destroyed; the records were still purged.`);
    /* F-10 · the count is said out loud as well as returned: a nightly job that dropped a hundred
       students' records and left the number only in a JSON body nobody reads is a job whose work cannot
       be checked the next morning. */
    if(students.purged||students.failed)console.log(`Daily job: ${students.purged} removed student(s) past their retention window were purged (${students.logged} activity row(s) written, ${students.failed} failure(s)).`);
    if(indexes.dropped.length)console.log(`Daily job: ${indexes.dropped.length} class index(es) replaced to match the schema: ${indexes.dropped.join(', ')}.`);
    return NextResponse.json({ok:true,purged,assetFailures,trim:{...trim,proofMilestones},sms:{autoDue,flush},routine,students,indexes});
  }catch(error){
    console.error('Daily job failed.',error);
    return NextResponse.json({error:'unavailable'},{status:503});
  }
}
