/**
 * R1 §E5 — the daily scheduled job, without a database.
 *
 * Proves the bearer-secret contract (Vercel Crons sends `Authorization: Bearer $CRON_SECRET`),
 * the secret policy, the route's refusal path, the `vercel.json` cron entry and the 12-month log
 * trim window. The live purge-through-the-route proof runs in `tests/recycle-bin.integration.ts`.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GET,dynamic,maxDuration} from '../src/app/api/admin/jobs/daily/route';
import {cronAuthorized,cronSecretValid,CRON_SECRET_MIN_LENGTH,LOG_RETENTION_MONTHS} from '../src/lib/admin/cron';

const secret='a'.repeat(CRON_SECRET_MIN_LENGTH);
const url='http://localhost:3111/api/admin/jobs/daily';

// Secret policy: present and long enough, or the job does not run at all.
assert.equal(cronSecretValid(secret),true);
assert.equal(cronSecretValid(undefined),false,'a missing secret must never authorize the job');
assert.equal(cronSecretValid(''),false);
assert.equal(cronSecretValid('  '),false);
assert.equal(cronSecretValid('short'),false,'a short secret is refused rather than trusted');
assert.equal(CRON_SECRET_MIN_LENGTH,32);

// Header contract.
assert.equal(cronAuthorized(`Bearer ${secret}`,secret),true);
assert.equal(cronAuthorized(`bearer ${secret}`,secret),true,'the scheme is case-insensitive');
assert.equal(cronAuthorized(secret,secret),false,'a bare secret without the Bearer scheme is refused');
assert.equal(cronAuthorized(`Bearer ${'b'.repeat(CRON_SECRET_MIN_LENGTH)}`,secret),false,'a wrong secret is refused');
assert.equal(cronAuthorized(`Bearer ${secret.toUpperCase()}`,secret),false);
assert.equal(cronAuthorized(`Bearer ${secret.slice(1)}`,secret),false,'a truncated secret is refused');
assert.equal(cronAuthorized(null,secret),false);
assert.equal(cronAuthorized(`Bearer ${secret}`,undefined),false,'no secret configured means no access');
assert.equal(cronAuthorized(`Bearer ${secret}`,'short'),false);

async function routeChecks():Promise<void>{
// Route refusal: 401 before it touches the database.
process.env.CRON_SECRET=secret;
assert.equal((await GET(new Request(url))).status,401,'an unauthenticated call is refused');
assert.equal((await GET(new Request(url,{headers:{authorization:'Bearer wrong'}}))).status,401);
assert.equal((await GET(new Request(url,{headers:{authorization:`Basic ${secret}`}}))).status,401,'only the Bearer scheme is accepted');
delete process.env.CRON_SECRET;
assert.equal((await GET(new Request(url,{headers:{authorization:`Bearer ${secret}`}}))).status,401,'with no secret configured the job refuses to run');
assert.equal(dynamic,'force-dynamic','the job must never be cached');
assert.ok(maxDuration>=30,'the job needs room to destroy Cloudinary assets');
}

// Deployment: the cron entry exists and points at this route once a day.
const vercel=JSON.parse(readFileSync('vercel.json','utf8')) as {crons:{path:string;schedule:string}[]};
const job=vercel.crons?.find(entry=>entry.path==='/api/admin/jobs/daily');
assert.ok(job,'vercel.json schedules the daily job');
assert.equal(job!.schedule,'0 19 * * *','daily at 19:00 UTC = 01:00 Asia/Dhaka');
assert.equal(LOG_RETENTION_MONTHS,12,'SMS and activity logs are trimmed after 12 months');

// Documented for the operator.
assert.match(readFileSync('.env.example','utf8'),/CRON_SECRET=/,'.env.example documents CRON_SECRET');

async function main():Promise<void>{
  await routeChecks();
  console.log('Daily job: bearer-secret auth (401 when missing, wrong, short or non-Bearer; refuses with no secret configured), vercel.json schedules it daily at 01:00 Asia/Dhaka, logs trim after 12 months.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
