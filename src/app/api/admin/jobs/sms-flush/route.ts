import {NextResponse} from 'next/server';
import {cronAuthorized} from '@/lib/admin/cron';
import {flushQueuedSms} from '@/lib/center/sms-send';
import {reconcileLeadSchedules,runDueLeadSchedules} from '@/lib/leads/lead-schedule-db';

export const dynamic='force-dynamic';
export const maxDuration=60;

/**
 * The daily SMS window (R2), plus the visitor schedules that are due (R3 schedule).
 *
 * A send made inside quiet hours is stored as a `queued` batch with `scheduledFor` at the moment the
 * window closes; this job is what actually sends it. It runs just after the default window ends
 * (07:05 Asia/Dhaka) and touches only batches whose scheduled time has passed, so an operator who
 * changes quiet hours still gets their messages on the next run rather than at a wrong hour.
 *
 * A scheduled visitor message runs HERE after the flush. This is the only place it runs, so the
 * 07:05 promise on the form is exact: a schedule due on a day the platform skipped is picked up by
 * the next run, because the query asks for everything whose time has passed, not only for today.
 * Reconciliation runs afterwards so a schedule that was queued (custom quiet hours covering 07:05)
 * becomes "sent", "partly sent" or "failed" from its batch, rather than sitting on "queued" forever.
 *
 * Same bearer-secret policy as the daily job: no valid `CRON_SECRET`, no work.
 */
export async function GET(request:Request){
  if(!cronAuthorized(request.headers.get('authorization'),process.env.CRON_SECRET)){
    return NextResponse.json({error:'unauthorized'},{status:401});
  }
  try{
    const schedules=await runDueLeadSchedules(new Date());
    const outcome=await flushQueuedSms(new Date());
    const reconciled=await reconcileLeadSchedules();
    if(outcome.failed)console.error(`SMS flush: ${outcome.failed} message(s) failed and stay failed for an explicit retry.`);
    if(schedules.failed||schedules.sent)console.log(`Visitor schedules: ${schedules.due} due, ${schedules.sent} sent, ${schedules.failed} failed, ${schedules.skipped} skipped.`);
    return NextResponse.json({ok:true,...outcome,schedules,reconciled});
  }catch(error){
    console.error('SMS flush failed.',error);
    return NextResponse.json({error:'unavailable'},{status:503});
  }
}
