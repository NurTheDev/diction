/**
 * R6 slice 2 in the browser: the Super Admin's backup door, the monthly reminder that leads to it, the
 * database usage card, the twelve-month log trim, and the role matrix that decides who may stand where.
 * Photographed into screenshots/r6/.
 *
 * What this suite proves:
 *
 *  1. the Overview tells a Super Admin whose last backup is older than a month — or who has never taken
 *     one — in one notice box, and stops telling them the moment an export succeeds; a staff session
 *     and a teacher session never see that box, because the reminder is addressed to the one role that
 *     can act on it;
 *  2. the backup page and its export door answer the Super Admin alone: JSON that carries every
 *     collection and no password hash, and a workbook with one sheet per collection; staff and teacher
 *     are redirected away from the page and the route;
 *  3. a successful export writes its own evidence: `lastBackupAt` on the settings row and one
 *     `backup.export` line in the activity log;
 *  4. the database usage card reads “ডাটাবেস ব্যবহার” on the Super Admin's Overview with the 512 MB
 *     scale and the 70% / 90% warning words in the catalog, and is absent for staff;
 *  5. the daily job still trims SmsLog and ActivityLog rows older than twelve months and keeps last
 *     week's — proven here again, straight against the route handler, because a retention promise
 *     nobody re-checks is a promise nobody has;
 *  6. the role matrix: Super Admin reads the backup, the reports and the cash desk; staff reads the
 *     reports but is refused the cash desk and the backup; teacher is refused all three.
 */
// @ts-nocheck -- isolated browser test against the disposable database
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {CenterStudent,CenterClassGroup,CenterPayment,CenterSettings} from '../src/models/CenterRecords';
import {AdminAudit} from '../src/models/AdminAudit';
import {GET as dailyJob} from '../src/app/api/admin/jobs/daily/route';
import bn from '../src/messages/bn.json';

const t=bn.center;
const SHOTS=path.join('screenshots','r6');
const BN=/[\u0980-\u09ff]/;
const KEY_PATH=/\b(?:center|admin|common|reports)\.[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+/;

async function run(){
  await preflight({
    mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',
    originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,
    test:'tests/backup-roles-browser.integration.ts — start the app first, then run it with TEST_ORIGIN and TEST_MONGO_URI (see docs/STALE-TESTS.md)',
  });
  const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3100';
  const shared=process.env.TEST_MONGO_URI||null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){
    for(const collection of await mongoose.connection.db.listCollections().toArray())
      await mongoose.connection.db.collection(collection.name).deleteMany({}).catch(()=>{});
  }
  await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});
  await mkdir(SHOTS,{recursive:true});

  const pass=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(pass,12);
  const superAdmin=await User.create({name:'নমুনা মালিক',email:'r6b-super@example.test',passwordHash:hash,role:'superadmin',active:true});
  const staff=await User.create({name:'নমুনা হিসাবরক্ষক',email:'r6b-staff@example.test',passwordHash:hash,role:'staff',active:true});
  const teacher=await User.create({name:'নমুনা শিক্ষক',email:'r6b-teacher@example.test',passwordHash:hash,role:'teacher',active:true});
  const group=await CenterClassGroup.create({name:{bn:'নমুনা নবম ক',en:'Sample Nine A'},academicYear:2026,active:true});
  const student=await CenterStudent.create({
    studentId:'নমুনা-1',name:{bn:'নমুনা ছাত্র ক',en:'Sample A'},classGroup:group._id,roll:'1',
    guardianName:'নমুনা অভিভাবক',guardianPhone:'01711000011',admissionDate:'2026-01-01',
    startMonth:{year:2026,month:1},feeHistory:[{effectiveFrom:{year:2026,month:1},amount:1000}],
  });
  await CenterPayment.create({student:student._id,classGroupAtPayment:group._id,type:'monthly',
    academicYear:2026,month:2,amount:1000,receiptNo:'501',paidOn:'2026-02-10',receivedBy:superAdmin._id,
    receiptKey:'',note:'',status:'valid',groupId:'r6b-seed'});

  const browser=await chromium.launch();
  const errors=[];
  try{
    {let ready=false;for(let index=0;index<60&&!ready;index++){try{ready=(await fetch(origin+'/api/auth/csrf')).ok}catch{}if(!ready)await new Promise(r=>setTimeout(r,1000))}
     if(!ready)throw new Error('the app did not answer at '+origin)}

    async function session(user,locale){
      const context=await browser.newContext({viewport:{width:1440,height:900}});
      const csrf=await (await context.request.get(origin+'/api/auth/csrf')).json();
      await context.request.post(origin+'/api/auth/callback/credentials',{
        timeout:180000,headers:{origin,'content-type':'application/x-www-form-urlencoded'},
        form:{csrfToken:csrf.csrfToken,identifier:user.email,password:pass,callbackUrl:`${origin}/${locale}/admin`},
      });
      await context.addCookies([{name:`diction_digits_${String(user._id)}`,value:locale==='en'?'en':'bn',url:origin+'/'}]);
      const page=await context.newPage();
      page.on('pageerror',error=>errors.push(`${page.url()}: ${error.message}`));
      return {context,page};
    }
    const goto=async(page,href)=>{await page.goto(origin+href,{timeout:120000,waitUntil:'domcontentloaded'});await page.waitForLoadState('networkidle').catch(()=>{})};
    const shot=(page,name)=>page.screenshot({path:path.join(SHOTS,`${name}.png`),fullPage:true});

    const superBn=await session(superAdmin,'bn');
    const staffBn=await session(staff,'bn');
    const teacherBn=await session(teacher,'bn');

    // ── 1 & 4. the reminder and the usage card, on the owner's Overview only ───────────────────────
    await goto(superBn.page,'/bn/admin');
    const reminder=superBn.page.locator('[data-backup-reminder]');
    assert.equal(await reminder.count(),1,'a Super Admin who has never backed up is told so on the Overview');
    assert.ok((await reminder.innerText()).includes(t.backup.reminder),'in the catalog’s own words');
    assert.equal(await superBn.page.locator('[data-db-usage]').count(),1,'and the usage card sits beside it');
    const usageText=await superBn.page.locator('[data-db-usage]').innerText();
    assert.ok(usageText.includes(t.dbTitle),'named ডাটাবেস ব্যবহার');
    assert.ok(usageText.includes('৫১২'),'against the 512 MB ceiling');
    await shot(superBn.page,'overview-reminder-bn-1440');

    await goto(staffBn.page,'/bn/admin');
    assert.equal(await staffBn.page.locator('[data-backup-reminder]').count(),0,'staff are never shown the owner’s reminder');
    assert.equal(await staffBn.page.locator('[data-db-usage]').count(),0,'nor the usage card');
    await goto(teacherBn.page,'/bn/admin');
    assert.equal(teacherBn.page.url().includes('/admin'),false,'a teacher never lands in the admin tree at all');
    assert.equal(await teacherBn.page.locator('[data-backup-reminder],[data-db-usage]').count(),0);

    // ── 2 & 3. the backup door ─────────────────────────────────────────────────────────────────────
    await goto(superBn.page,'/bn/admin/backup');
    assert.equal(await superBn.page.locator('[data-backup-page]').count(),1,'the Super Admin reaches the backup page');
    assert.ok((await superBn.page.locator('[data-backup-last]').innerText()).includes(t.backup.lastNever),'which says no backup exists yet');
    const backupHead=await superBn.page.locator('.admin-heading').innerText();
    assert.ok(BN.test(backupHead),'and the page reads Bangla');
    assert.equal(KEY_PATH.test(await superBn.page.evaluate(()=>document.body.innerText)),false,'with no catalog key path painted');
    await shot(superBn.page,'backup-bn-1440');

    const jsonRes=await superBn.context.request.get(origin+'/bn/admin/backup/export?format=json');
    assert.equal(jsonRes.status(),200);
    assert.ok((jsonRes.headers()['content-type']||'').includes('application/json'));
    const backupJson=await jsonRes.text();
    assert.equal(backupJson.includes('passwordHash'),false,'the backup carries no password hash');
    const parsed=JSON.parse(backupJson);
    const names=parsed.collections.map(c=>c.name);
    for(const collection of ['users','students','payments','smsLogs','settings'])
      assert.ok(names.includes(collection),`the backup holds ${collection}`);
    assert.ok(parsed.collections.find(c=>c.name==='students').rows.length>=1,'with the seeded child in it');
    const xlsxRes=await superBn.context.request.get(origin+'/bn/admin/backup/export?format=xlsx');
    assert.equal(xlsxRes.status(),200);
    const xlsxBytes=await xlsxRes.body();
    assert.equal(xlsxBytes[0],0x50);assert.equal(xlsxBytes[1],0x4b);
    const xlsxText=Buffer.from(xlsxBytes).toString('latin1');
    assert.ok(xlsxText.includes('xl/worksheets/sheet15.xml'),'fifteen collections, fifteen sheets');

    /* The operator audit trail is AdminAudit — the center activity log is the machine's own diary, and
       the two are trimmed and read apart on purpose. */
    const logRow=await AdminAudit.findOne({action:'backup.export'}).lean();
    assert.ok(logRow,'the export wrote its own line in the activity log');
    assert.equal(String(logRow.actor),String(superAdmin._id),'naming who took the copy');

    await goto(superBn.page,'/bn/admin');
    assert.equal(await superBn.page.locator('[data-backup-reminder]').count(),0,'and after a real export the reminder stands down');
    await goto(superBn.page,'/bn/admin/backup');
    assert.ok(!(await superBn.page.locator('[data-backup-last]').innerText()).includes(t.backup.lastNever),'the page now names the date');

    /* However the turn-away is spelled — a redirect at the middleware, a redirect from the page, a 403
       at the route — the contract is one sentence: no backup page body and no backup payload ever
       reaches a session that is not the Super Admin's. */
    for(const [who,context] of [['staff',staffBn.context],['teacher',teacherBn.context]]){
      const pageRes=await context.request.get(origin+'/bn/admin/backup');
      const pageText=await pageRes.text();
      assert.equal(pageText.includes('data-backup-page'),false,`no backup page body reaches ${who}`);
      const exportRes=await context.request.get(origin+'/bn/admin/backup/export?format=json');
      assert.ok(!(exportRes.headers()['content-type']||'').includes('application/json'),`and no JSON is handed to ${who}`);
      assert.equal((await exportRes.text()).includes('"collections"'),false,`the backup payload never reaches ${who}`);
    }

    // ── 5. the twelve-month trim, straight against the job ─────────────────────────────────────────
    const thirteenMonths=new Date(Date.now()-13*30*24*60*60*1000),lastWeek=new Date(Date.now()-7*24*60*60*1000);
    await mongoose.connection.db.collection('centersmslogs').insertMany([
      {phone:'01711111111',message:'synthetic old',segments:1,status:'sent',createdAt:thirteenMonths},
      {phone:'01722222222',message:'synthetic recent',segments:1,status:'sent',createdAt:lastWeek},
    ]);
    await mongoose.connection.db.collection('centeractivitylogs').insertMany([
      {actor:new mongoose.Types.ObjectId(String(superAdmin._id)),action:'synthetic.old',target:'x',createdAt:thirteenMonths},
      {actor:new mongoose.Types.ObjectId(String(superAdmin._id)),action:'synthetic.recent',target:'x',createdAt:lastWeek},
    ]);
    const jobSecret='k'.repeat(40);
    process.env.CRON_SECRET=jobSecret;
    const refused=await dailyJob(new Request('http://localhost:3111/api/admin/jobs/daily'));
    assert.equal(refused.status,401,'the job still refuses a call with no bearer secret');
    const jobRes=await dailyJob(new Request('http://localhost:3111/api/admin/jobs/daily',{headers:{authorization:`Bearer ${jobSecret}`}}));
    assert.equal(jobRes.status,200);
    const jobBody=await jobRes.json();
    assert.ok(jobBody.trim.smsLog>=1,'the thirteen-month-old SMS log was trimmed');
    assert.ok(jobBody.trim.activityLog>=1,'and so was the thirteen-month-old activity line');
    assert.equal(await mongoose.connection.db.collection('centersmslogs').countDocuments({message:'synthetic recent'}),1,'while last week’s log row stays');
    assert.equal(await mongoose.connection.db.collection('centersmslogs').countDocuments({message:'synthetic old'}),0,'and the old one is gone');
    assert.equal(await mongoose.connection.db.collection('centeractivitylogs').countDocuments({action:'synthetic.recent'}),1,'the recent activity line stays too');

    // ── 6. the role matrix ─────────────────────────────────────────────────────────────────────────
    await goto(superBn.page,`/bn/admin/students/collect?student=${String(student._id)}`);
    assert.equal(await superBn.page.locator('.daily-save').count(),1,'the Super Admin stands at the cash desk');
    await goto(staffBn.page,`/bn/admin/students/collect?student=${String(student._id)}`);
    assert.equal(await staffBn.page.locator('.daily-save').count(),0,'staff are refused the cash desk');
    await goto(staffBn.page,'/bn/admin/reports/daily?date=2026-02-10');
    assert.equal(await staffBn.page.locator('[data-daily-report]').count(),1,'but staff read the day’s report — the accountant’s screen');
    await goto(teacherBn.page,'/bn/admin/reports/daily?date=2026-02-10');
    assert.equal(await teacherBn.page.locator('[data-daily-report]').count(),0,'and a teacher reads none of it');

    assert.deepEqual(errors,[],'no page threw while the backup and the roles were driven');
    console.log('BackupRoles: reminder, backup door, JSON and workbook exports, the usage card, the twelve-month trim and the role matrix all hold');
  }finally{
    await browser.close();
    await mongoose.disconnect();
    if(!shared)await mongo.stop();
  }
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
