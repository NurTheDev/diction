import {NextResponse} from 'next/server';
import {cronAuthorized} from '@/lib/admin/cron';
import {purgeExpired} from '@/lib/admin/recycle';
import {trimOldLogs} from '@/lib/admin/cron';

export const dynamic='force-dynamic';
export const maxDuration=60;

/**
 * The daily housekeeping job (R1 §E5): purge Recycle Bin rows whose 30 days are up (Cloudinary
 * assets first) and trim the SMS/activity logs past 12 months. Vercel Crons calls it on the
 * schedule in vercel.json with `Authorization: Bearer $CRON_SECRET`; without a valid secret it
 * answers 401 and touches nothing.
 */
export async function GET(request:Request){
  if(!cronAuthorized(request.headers.get('authorization'),process.env.CRON_SECRET)){
    return NextResponse.json({error:'unauthorized'},{status:401});
  }
  try{
    const [purge,trim]=await Promise.all([purgeExpired(),trimOldLogs()]);
    const purged=purge.reduce((sum,report)=>sum+report.purged,0);
    const assetFailures=purge.reduce((sum,report)=>sum+report.assetFailures,0);
    if(assetFailures)console.error(`Daily job: ${assetFailures} Cloudinary asset(s) could not be destroyed; the records were still purged.`);
    return NextResponse.json({ok:true,purged,assetFailures,trim});
  }catch(error){
    console.error('Daily job failed.',error);
    return NextResponse.json({error:'unavailable'},{status:503});
  }
}
