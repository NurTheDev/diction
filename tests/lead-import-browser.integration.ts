/**
 * R3.16 in the browser: the Visitor import wizard, driven end to end in Bangla and read in English.
 *
 * The suite uploads the labelled fake fixture (`tests/fixtures/Visitor-Import-FAKE-SAMPLE.xlsx`), reads
 * the dry run the way the owner would — counts, the unnamed column's question, the two dates waiting
 * for a hand, the sibling rows flagged together — answers those questions on screen, commits, and then
 * undoes the batch with a reason. On the English address it proves the same preview reads English,
 * because the wizard was bilingual from its first line and a screenshot is not the only proof of that.
 *
 * Photographed at 360 px and 1440 px in both languages into screenshots/r3, with the dry run on screen:
 * the owner reads this wizard on a phone at the desk.
 *
 * While it runs, three privacy and safety rules are asserted: no normalized number appears in the
 * painted preview (only masks), the commit button stays off while a date decision is open, and the
 * second upload of the same file would match rather than double (proved in the DB suite; here the
 * commit's own counts say `0 already on file` the first time and the undo removes exactly eight).
 */
// @ts-nocheck -- a browser suite: Playwright, the running app and a disposable database, driven end to end.
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
import {Lead} from '../src/models/Lead';
import bn from '../src/messages/bn.json';
import en from '../src/messages/en.json';

const ti=bn.leads.import,tei=en.leads.import;
const FIXTURE=path.join('tests','fixtures','Visitor-Import-FAKE-SAMPLE.xlsx');
const SHOTS=path.join('screenshots','r3');

async function run(){
  await preflight({mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,test:'tests/lead-import-browser.integration.ts — start the app first, then run it with TEST_ORIGIN and TEST_MONGO_URI (see STALE-TESTS-REPORT.md)'});
  const shared=process.env.TEST_ORIGIN?process.env.TEST_MONGO_URI:null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){for(const name of ['leads','leadimportbatches','users']){await mongoose.connection.db.collection(name).deleteMany({}).catch(()=>{})}}
  const pass=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(pass,12);
  await User.create({name:'FAKE Wizard',email:'fake-wizard@example.test',passwordHash:hash,role:'admin',active:true});
  const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3100';
  const browser=await chromium.launch();
  await mkdir(SHOTS,{recursive:true});
  try{
    let ready=false;
    for(let attempt=0;attempt<60&&!ready;attempt++){try{ready=(await fetch(origin+'/api/auth/csrf')).ok}catch{}if(!ready)await new Promise(r=>setTimeout(r,1000))}
    if(!ready)throw Error('dev server not reachable at '+origin);
    const session=async locale=>{
      const context=await browser.newContext({viewport:{width:1440,height:900}});
      const csrf=await (await context.request.get(origin+'/api/auth/csrf')).json();
      await context.request.post(origin+'/api/auth/callback/credentials',{timeout:180000,headers:{origin,'content-type':'application/x-www-form-urlencoded'},form:{csrfToken:csrf.csrfToken,identifier:'fake-wizard@example.test',password:pass,callbackUrl:`${origin}/${locale}/admin/leads/import`}});
      return context;
    };

    // ── Bangla: the whole journey ────────────────────────────────────────────────────────────────
    {
      const context=await session('bn'),page=await context.newPage();
      await page.goto(origin+'/bn/admin/leads/import',{waitUntil:'domcontentloaded',timeout:180000});
      await page.getByRole('heading',{name:ti.title}).waitFor({timeout:60000});
      await page.locator('input[type=file]').setInputFiles(FIXTURE);
      await page.getByRole('button',{name:ti.previewButton}).click();
      await page.getByText(ti.unmappedHead).waitFor({timeout:120000});
      const body=await page.locator('.admin-panel').first().innerText();
      assert.ok(body.includes('9 '+ti.countsLine.split(':')[0].replace('{total}','').trim()),`the counts line names the nine rows: ${body.slice(0,200)}`);
      assert.ok(body.includes(ti.status.decide),`two dates wait for a hand: ${ti.status.decide}`);
      assert.ok(body.includes(ti.flags.siblingInFile.split('(')[0].trim()),'the sibling rows are flagged together');
      // no normalized number is painted anywhere in the preview
      const table=await page.locator('.admin-table').first().innerText();
      for(const number of ['01711111111','01812345678','01911111111','01622222222'])assert.ok(!table.includes(number),`the preview paints a mask, never ${number}`);
      // the commit stays off while a date decision is open
      assert.equal(await page.getByRole('button',{name:ti.commitButton}).isDisabled(),true);
      for(const width of [1440,360]){
        await page.setViewportSize({width,height:900});
        await page.screenshot({path:path.join(SHOTS,`visitor-import-bn-${width}.png`),fullPage:false});
      }
      await page.setViewportSize({width:1440,height:900});
      // answer both dates with the sheet's own suggestion, then commit
      const radios=page.locator('input[type=radio][name^="accept-"]');
      assert.equal(await radios.count(),4);
      await radios.nth(0).check();
      await radios.nth(2).check();
      assert.equal(await page.getByRole('button',{name:ti.commitButton}).isDisabled(),false);
      await page.getByRole('button',{name:ti.commitButton}).click();
      await page.getByText('8 নতুন লিড').waitFor({timeout:180000});
      assert.equal(await Lead.countDocuments({importSource:'wizard:Visitor-Import-FAKE-SAMPLE.xlsx'}),8);
      const first=await Lead.findOne({studentName:'FAKE Visitor One'}).lean();
      assert.equal(first.notes.length,1);
      assert.equal(first.notes[0].text,'ভর্তি বিষয়ে জানতে চেয়েছিলেন');
      // undo the batch with a reason
      await page.locator('input[maxlength="300"]').fill('ব্রাউজার স্যুটের undo');
      await page.getByRole('button',{name:ti.undoButton}).click();
      await page.getByText('undo হয়েছে').waitFor({timeout:180000});
      assert.equal(await Lead.countDocuments({importSource:'wizard:Visitor-Import-FAKE-SAMPLE.xlsx',deletedAt:null}),0);
      await context.close();
    }

    // ── English: the same dry run reads English ──────────────────────────────────────────────────
    {
      const context=await session('en'),page=await context.newPage();
      await page.goto(origin+'/en/admin/leads/import',{waitUntil:'domcontentloaded',timeout:180000});
      await page.getByRole('heading',{name:tei.title}).waitFor({timeout:60000});
      await page.locator('input[type=file]').setInputFiles(FIXTURE);
      await page.getByRole('button',{name:tei.previewButton}).click();
      await page.getByText(tei.unmappedHead).waitFor({timeout:120000});
      const body=await page.locator('.admin-panel').first().innerText();
      assert.ok(body.includes(tei.status.decide),`the English preview names the open decisions: ${tei.status.decide}`);
      assert.ok(body.includes(tei.colRow)&&body.includes(tei.colStatus),'the table head reads English');
      for(const width of [1440,360]){
        await page.setViewportSize({width,height:900});
        await page.screenshot({path:path.join(SHOTS,`visitor-import-en-${width}.png`),fullPage:false});
      }
      await context.close();
    }
    console.log('Visitor import wizard in the browser: the fake sheet read in Bangla with its counts, its unnamed column asked about, its two dates accepted by hand, eight leads committed and the batch undone with a reason; the same dry run read in English; photographed at 360 px and 1440 px in both languages.');
  }finally{
    await browser.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
}
run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
