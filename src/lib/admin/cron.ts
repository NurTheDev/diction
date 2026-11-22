/**
 * Authorization and housekeeping for the daily scheduled job (R1 §E5).
 *
 * Vercel Crons calls the route with `Authorization: Bearer <CRON_SECRET>`; the same header works
 * for a manual curl. The secret is required and must be long: with it missing or short the job
 * refuses to run rather than running unauthenticated.
 */
import {CenterActivityLog,CenterClassGroup,CenterSettings,CenterSmsLog} from '@/models/CenterRecords';

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

/**
 * S2 · F-09 — bring the class indexes in line with the schema they are declared in.
 *
 * A class name used to be unique across every class the centre had ever written, so archiving Class Nine
 * kept the name taken and this year's Class Nine could not be created. The rule is partial now: it binds
 * only the classes that are live and running. But an index is not a schema — a database written before the
 * change still carries the wider index under the very same name, and Mongoose's own `init()` cannot
 * replace one: it reports the conflict and leaves the old rule in force, so the fix would be true in the
 * code and false in the database it runs against. The nightly job asks the model to drop what its schema
 * no longer declares and create what it does, which is the one place a change to an index reaches an
 * existing database without an operator having to run a migration by hand.
 */
export async function syncClassIndexes():Promise<{dropped:string[]}>{
  try{
    return {dropped:await CenterClassGroup.syncIndexes()};
  }catch(error){
    /* A night without the sync is a night the old rule stays in force, which is what it was yesterday;
       the housekeeping that did run is not worth losing over it. */
    console.error('Daily job: the class indexes could not be brought in line with the schema.',error);
    return {dropped:[]};
  }
}
