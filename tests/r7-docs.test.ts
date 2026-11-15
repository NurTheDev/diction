/**
 * R7 — the handover papers prove themselves.
 *
 * A deployment guide that drifts from the code is worse than none: an owner follows it into a wall.
 * So every promise R7 makes on paper is asserted here against the paper and the code together —
 * the README's setup and directory map, the environment template's completeness against every
 * variable the source actually reads, the production Atlas and BulkSMSBD notes, the go-live
 * checklist's order (brake after rollout, receipt before due before results), and the operations
 * guide's three rhythms. Docs are requirements; requirements get proofs.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const read=(rel:string)=>readFile(path.join(process.cwd(),rel),'utf8');
const fold=(text:string)=>text.replace(/\s+/g,' ');

async function main(){
  const [readme,envExample,deployment,goLive,operations]=await Promise.all([
    read('README.md'),read('.env.example'),read('docs/DEPLOYMENT.md'),read('docs/GO-LIVE.md'),read('docs/OPERATIONS.md'),
  ]);

  // ── 1. README: overview, stack, setup, architecture, and the directory map ────────────────────
  for(const heading of ['# Diction Coaching Center','## Tech stack','## Run locally','## Architecture overview','## Directory map','## Documentation index'])
    assert.ok(readme.includes(heading),`the README carries ${heading}`);
  for(const step of ['npm ci','cp .env.example .env.local','npm run seed','npm run dev','npm test','npm run test:i18n','npm run verify'])
    assert.ok(readme.includes(step),`the README's local setup names ${step}`);
  assert.ok(readme.includes('VERIFY_STRICT=1'),'and names the strict gate');
  for(const modulePath of ['src/app/[locale]/admin/students/','src/lib/center/cash-batch.ts','src/lib/center/sms-','src/app/[locale]/admin/leads/','src/app/[locale]/admin/faculty/','src/lib/exams/','src/lib/reports/','src/app/[locale]/admin/backup/','src/lib/auth.ts','src/messages/'])
    assert.ok(readme.includes(modulePath),`the directory map points at ${modulePath}`);
  for(const word of ['students','fees','sms','leads','teachers','exams','reports','backup','auth','i18n'])
    assert.ok(new RegExp(`\\| ${word} \\|`).test(readme),`and names the ${word} module in its own row`);

  // ── 2. .env.example: every variable the source reads, described, with safe dummies ────────────
  const sources=await Promise.all(['src','scripts'].map(async root=>{
    const files:string[]=[];
    const walk=async(dir:string):Promise<void>=>{
      for(const entry of await (await import('node:fs/promises')).readdir(dir,{withFileTypes:true})){
        const full=path.join(dir,entry.name);
        if(entry.isDirectory())await walk(full);
        else if(/\.(ts|tsx|mts)$/.test(entry.name))files.push(await readFile(full,'utf8'));
      }
    };
    await walk(root);
    return files.join('\n');
  }));
  const runtimeOnly=new Set(['NEXT_RUNTIME','NODE_ENV']);
  const used=new Set<string>();
  for(const source of sources)for(const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g))used.add(match[1]);
  for(const name of ['AUTH_URL','SEED_ADMIN_EMAIL','SEED_ADMIN_PASSWORD'])used.add(name);
  for(const name of used){
    if(runtimeOnly.has(name))continue;
    /* Line-anchored: the name must stand as its own word, assigned or listed, not hide inside a
       longer variable's spelling (AUTH_URL inside NEXTAUTH_URL would otherwise sneak through). */
    assert.ok(new RegExp(`(^|[^A-Z0-9_])${name}(?=[=\\s])`,'m').test(envExample),`.env.example documents ${name}`);
  }
  assert.ok(/^NEXTAUTH_SECRET=$/m.test(envExample),'secrets ship empty, never with a dummy that could reach production');
  assert.ok(/^CRON_SECRET=$/m.test(envExample),'and so does the cron bearer');
  assert.ok(/^BULKSMSBD_API_KEY=$/m.test(envExample),'and the gateway key');
  assert.ok(envExample.includes('mongodb+srv://<db_username>:<db_password>@'),'the URI shows the placeholder shape, not a real host');
  assert.ok(envExample.includes('0.0.0.0/0'),'and names the Atlas network entry serverless hosting forces');

  // ── 3. DEPLOYMENT: pooling band, region matching, whitelist, masking, Unicode limits ──────────
  const dep=fold(deployment);
  assert.ok(dep.includes('maxPoolSize: 5'),'the deployment guide states the pool the code opens');
  assert.ok(dep.includes('5–10')||dep.includes('5-10'),'and the band it must stay inside');
  assert.ok(dep.includes('ap-southeast-1')&&dep.includes('ap-south-1'),'region matching names Singapore and Mumbai');
  assert.ok(dep.includes('0.0.0.0/0'),'the open network entry is documented with its reason');
  assert.ok(dep.includes('Turn IP whitelisting OFF'),'BulkSMSBD IP whitelisting must be off for Vercel');
  assert.ok(dep.includes('Masking rules')&&dep.includes('redacted'),'the masking rules are written down');
  assert.ok(dep.includes('Unicode character limits'),'and so are the Unicode limits');
  assert.ok(dep.includes('160')&&dep.includes('153')&&dep.includes('70')&&dep.includes('67'),'GSM 160/153 and Unicode 70/67, both bands');

  // ── 4. GO-LIVE: a–f in order, bootstrap command, crons, rollout order, brake, ten lines ───────
  for(const section of ['## a)','## b)','## c)','## d)','## e)','## f)'])
    assert.ok(goLive.includes(section),`the go-live guide carries section ${section}`);
  assert.ok(goLive.includes('npm ci && npm run seed'),'the bootstrap command is copy-pasteable');
  assert.ok(goLive.includes('SEED_ADMIN_EMAIL')&&goLive.includes('SEED_ADMIN_PASSWORD'),'named with their one-time nature');
  assert.ok(goLive.includes('0 19 * * *')&&goLive.includes('5 1 * * *'),'both cron schedules, verbatim');
  assert.ok(goLive.includes('NEXTAUTH_SECRET')&&goLive.includes('CRON_SECRET')&&goLive.includes('MONGODB_URI'),'the Vercel environment names the required variables');
  assert.ok(goLive.includes('balance'),'the live balance check is a launch step');
  assert.ok(goLive.includes('one test message to your own phone'),'and the single real test SMS');
  const rollout=goLive.indexOf('receipt after a payment'),due=goLive.indexOf('due reminder'),results=goLive.indexOf('exam result after publishing');
  assert.ok(rollout>-1&&due>rollout&&results>due,'the rollout order is receipt, then due reminder, then results');
  const brake=goLive.indexOf('Emergency brake');
  assert.ok(brake>results,'the brake is taught after the rollout, not before');
  assert.ok(goLive.includes('CENTER_SMS_WRITE_ENABLED=false'),'the hard brake names the exact gate');
  const smoke=goLive.slice(goLive.indexOf('## f)'));
  const lines=smoke.split('\n').filter(line=>/^\d+\.\s/.test(line.trim()));
  assert.equal(lines.length,10,`the mobile smoke test is exactly ten lines, got ${lines.length}`);
  assert.ok(goLive.includes('manual backup first'),'import day starts with a manual backup');
  assert.ok(goLive.includes('rotate any credential'),'and ends with rotating anything exposed');

  // ── 5. OPERATIONS: backup rhythm, storage ceiling, the bin's three verbs, handover pack ───────
  const ops=fold(operations);
  assert.ok(ops.includes('Monthly backup export and offline archive'),'the backup rhythm has its own section');
  assert.ok(ops.includes('thirty days')&&ops.includes('lastBackupAt'),'the reminder’s month is explained');
  assert.ok(ops.includes('diction-backup-YYYY-MM-DD'),'the archive keeps the export’s own name');
  assert.ok(ops.includes('encrypted external drive'),'two offline copies, one of them encrypted');
  assert.ok(ops.includes('512 MB'),'the free-tier ceiling is named');
  assert.ok(ops.includes('70%')&&ops.includes('90%'),'both warning thresholds, with their megabytes');
  assert.ok(ops.includes('twelve months'),'log trimming bounds the growth');
  assert.ok(ops.includes('30 days')&&ops.includes('RECYCLE_RETENTION_DAYS'),'the bin’s window, in words and in code');
  assert.ok(ops.includes('Restore')&&ops.includes('Delete forever'),'restore and permanent purge, each with its role');
  assert.ok(ops.includes('Handover pack'),'and the pack a new operator receives');

  console.log('R7 papers hold: README setup and map, env template complete against the source, Atlas and BulkSMSBD production notes, go-live a–f with the brake after the rollout, operations rhythms.');
}
main().catch(error=>{console.error(error);process.exit(1)});
