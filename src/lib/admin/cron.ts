/**
 * Authorization and housekeeping for the daily scheduled job (R1 §E5).
 *
 * Vercel Crons calls the route with `Authorization: Bearer <CRON_SECRET>`; the same header works
 * for a manual curl. The secret is required and must be long: with it missing or short the job
 * refuses to run rather than running unauthenticated.
 */
import {CenterActivityLog,CenterSettings,CenterSmsLog} from '@/models/CenterRecords';

export const CRON_SECRET_MIN_LENGTH=32;
export const LOG_RETENTION_MONTHS=12;

export function cronSecretValid(secret:string|undefined):boolean{
  return !!secret&&secret.trim().length>=CRON_SECRET_MIN_LENGTH;
}

export function cronAuthorized(authorizationHeader:string|null,secret:string|undefined):boolean{
  if(!cronSecretValid(secret)||!authorizationHeader)return false;
  const match=authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if(!match)return false;
  const provided=match[1].trim(),expected=String(secret).trim();
  if(provided.length!==expected.length)return false;
  let diff=0;
  for(let i=0;i<expected.length;i++)diff|=provided.charCodeAt(i)^expected.charCodeAt(i);
  return diff===0;
}

export interface TrimReport{smsLog:number;activityLog:number}

/** Drop log rows older than the retention window; both logs are append-only otherwise. */
export async function logRetentionMonths():Promise<number>{
  const settings=await CenterSettings.findOne().lean<{logRetentionMonths?:number}>();
  const months=Number(settings?.logRetentionMonths);
  return Number.isFinite(months)&&months>0?months:LOG_RETENTION_MONTHS;
}

export async function trimOldLogs(now:Date=new Date()):Promise<TrimReport>{
  const months=await logRetentionMonths();
  const cutoff=new Date(now.getTime()-months*30*24*60*60*1000);
  const [smsLog,activityLog]=await Promise.all([
    CenterSmsLog.deleteMany({createdAt:{$lt:cutoff}}),
    CenterActivityLog.deleteMany({createdAt:{$lt:cutoff}}),
  ]);
  return {smsLog:smsLog.deletedCount,activityLog:activityLog.deletedCount};
}
