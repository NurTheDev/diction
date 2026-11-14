/**
 * Step 4 · The staging deployment guide is a document a person can follow, so the parts of it that
 * are checkable are checked here: the locale middleware really does leave `/api/*` alone (which is
 * what keeps Vercel Cron from being redirected to `/bn` and losing its bearer header), the guide
 * exists and names the two scheduled jobs with the schedules `vercel.json` actually ships, and the
 * environment template documents every variable the site needs before it will start.
 *
 * Prose is not asserted — only structure, so rewording the guide cannot break this suite.
 *
 * Run: npx tsx tests/deployment-doc.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path:string):string=>fs.readFileSync(path,'utf8');

// 1. The locale middleware matcher excludes the API, the build assets and every file name, so a cron
//    call, a webhook or the sitemap is never redirected into a locale. Next.js 16 calls this file
//    `proxy.ts`, and there is deliberately no `middleware.ts` beside it.
assert.ok(!fs.existsSync('src/middleware.ts'),'Next 16 routing lives in src/proxy.ts, not middleware.ts');
const proxy=read('src/proxy.ts');
const matcher=proxy.match(/export const config=\{matcher:\[(.*?)\]\}/s);
assert.ok(matcher,'src/proxy.ts publishes a matcher');
const patterns=(matcher![1].match(/'((?:[^'\\]|\\.)*)'/g)||[]).map(p=>p.slice(1,-1));
assert.ok(patterns.some(p=>p.includes('(?!api')),'the matcher excludes /api/*, so cron is never locale-redirected');
assert.ok(patterns.some(p=>p.includes('_next')),'the matcher excludes the build assets');
assert.ok(patterns.some(p=>p.includes('\\.')),'the matcher excludes file names, so the sitemap and manifest survive');
assert.match(proxy,/localePrefix|defaultLocale|routing/,'routing comes from the shared next-intl config');

// 2. Both cron jobs the guide tells the operator to expect are the ones vercel.json ships, at the
//    schedules the guide prints.
const vercel=JSON.parse(read('vercel.json')) as {crons:{path:string;schedule:string}[]};
const byPath=new Map(vercel.crons.map(entry=>[entry.path,entry.schedule]));
assert.equal(byPath.get('/api/admin/jobs/daily'),'0 19 * * *','daily at 19:00 UTC = 01:00 Asia/Dhaka');
assert.equal(byPath.get('/api/admin/jobs/sms-flush'),'5 1 * * *','flush at 01:05 UTC = 07:05 Asia/Dhaka');
assert.equal(vercel.crons.length,2,'two daily jobs: exactly what the Hobby plan allows');

const guide=read('docs/DEPLOYMENT.md');
for(const fact of ['/api/admin/jobs/daily','/api/admin/jobs/sms-flush','0 19 * * *','5 1 * * *','0.0.0.0/0','readWrite','sin1','bom1','Bearer','32','whitelisting OFF','SMS_PROVIDER=mock','src/proxy.ts']){
  assert.ok(guide.includes(fact),`the deployment guide states ${fact}`);
}

// 3. The phone smoke checklist is ten lines, because a checklist nobody finishes is not a checklist.
const smoke=guide.split(/^## 9\./m)[1]?.split(/^## /m)[0]||'';
const steps=smoke.split('\n').filter(line=>/^\d+\.\s/.test(line.trim()));
assert.equal(steps.length,10,`§9 holds a ten-line phone checklist (found ${steps.length})`);

// 4. The template documents what a first-time operator must fill in, and keeps the test-harness
//    variables visibly apart from the ones a deployment needs.
const template=read('.env.example');
for(const variable of ['MONGODB_URI=','NEXTAUTH_SECRET=','NEXTAUTH_URL=','AUTH_URL=','CRON_SECRET=','CENTER_DATA_MODE=','SMS_PROVIDER=','CENTER_SMS_WRITE_ENABLED=','BULKSMSBD_API_KEY=','BULKSMSBD_SENDER_ID=']){
  assert.ok(template.includes(variable),`.env.example documents ${variable}`);
}
assert.match(template,/never set these on Vercel/i,'the template says which variables are test-harness only');
// The invariant that matters: a secret variable in the template is empty, always.
for(const secret of ['NEXTAUTH_SECRET','CRON_SECRET','BULKSMSBD_API_KEY','BULKSMSBD_SENDER_ID','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','RESEND_API_KEY','GEMINI_API_KEY','AI_API_KEY','YOUTUBE_DATA_API_KEY','SEED_ADMIN_PASSWORD']){
  assert.match(template,new RegExp(`^${secret}=\\s*$`,'m'),`${secret} is a placeholder, never a value`);
}

console.log('Deployment guide: the proxy matcher leaves /api/*, /_next/* and file names out of locale routing; vercel.json ships exactly the two daily jobs the guide names at 01:00 and 07:05 Asia/Dhaka; §9 is a ten-line phone checklist; .env.example documents every required variable and marks the test-only ones.');
