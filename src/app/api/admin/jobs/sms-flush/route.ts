import {NextResponse} from 'next/server';
import {cronAuthorized} from '@/lib/admin/cron';
import {flushQueuedSms} from '@/lib/center/sms-send';

export const dynamic='force-dynamic';
export const maxDuration=60;

/**
 * The queued-SMS flush (R2).
 *
 * A send made inside quiet hours is stored as a `queued` batch with `scheduledFor` at the moment the
 * window closes; this job is what actually sends it. It runs just after the default window ends
 * (07:05 Asia/Dhaka) and touches only batches whose scheduled time has passed, so an operator who
 * changes quiet hours still gets their messages on the next run rather than at a wrong hour.
 *
 * Same bearer-secret policy as the daily job: no valid `CRON_SECRET`, no work.
 */
export async function GET(request:Request){
  if(!cronAuthorized(request.headers.get('authorization'),process.env.CRON_SECRET)){
    return NextResponse.json({error:'unauthorized'},{status:401});
  }
  try{
    const outcome=await flushQueuedSms(new Date());
    if(outcome.failed)console.error(`SMS flush: ${outcome.failed} message(s) failed and stay failed for an explicit retry.`);
    return NextResponse.json({ok:true,...outcome});
  }catch(error){
    console.error('SMS flush failed.',error);
    return NextResponse.json({error:'unavailable'},{status:503});
  }
}
