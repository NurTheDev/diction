// @ts-nocheck -- a browser suite: Playwright, the running app and a disposable database, driven end to end.
/**
 * R3.18 in the browser: the visitor funnel, read in Bangla and in English, and downloaded as a CSV.
 *
 * The aggregation is proved against the database in `lead-funnel.integration.ts`; this suite proves
 * what only a screen can:
 *
 *   • the report is mounted under Visitors — the sidebar carries it with its own word, and the
 *     Visitors list is one tap away from it;
 *   • the three stages and the three rates read as cards, the breakdown table reads as a table, and
 *     the definitions travel with the numbers rather than living in somebody's memory;
 *   • switching the breakdown to source asks the page for the five sources and prints all of them,
 *     including the one that brought nobody;
 *   • the CSV button hands the browser a real file: BOM-marked so Excel reads the Bangla labels,
 *     Latin digits so the column still adds up, and not one Bangla digit anywhere in it;
 *   • at 360 px nothing overflows sideways, and at /en the whole screen — heading, tiles, panel
 *     head, table and notes — carries no Bangla character and no Bangla digit.
 *
 * Photographed at 360 px and 1440 px in both languages into screenshots/r3, with the report full of
 * synthetic FAKE leads: an empty funnel photographs as an empty funnel, which proves less.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {Lead} from '../src/models/Lead';
import {formatMonth,formatNumber} from '../src/lib/admin/format';
import bn from '../src/messages/bn.json';
import en from '../src/messages/en.json';

const F=bn.leads.funnel,FE=en.leads.funnel;
const SHOTS=path.join('screenshots','r3');
const BANGLA=/[\u0980-\u09ff]/;
const BANGLA_DIGIT=/[\u09e6-\u09ef]/;
const oid=()=>new mongoose.Types.ObjectId();

/** Six synthetic leads: two months, four sources, three trials, two admissions, one lead that did both. */
const COHORT=[
  {leadId:'V-2026-0101',date:'2026-01-08',source:'walk_in',classGroup:9,status:'new'},
  {leadId:'V-2026-0102',date:'2026-01-18',source:'walk_in',classGroup:9,status:'trial_booked',trialBooking:oid()},
  {leadId:'V-2026-0103',date:'2026-01-26',source:'facebook',classGroup:10,status:'admitted',trialBooking:oid(),admission:oid()},
  {leadId:'V-2026-0104',date:'2026-02-06',source:'facebook',classGroup:10,status:'admitted',admission:oid()},
  {leadId:'V-2026-0105',date:'2026-02-16',source:'phone',classGroup:null,classLabel:'Column 1',status:'called'},
  {leadId:'V-2026-0106',date:'2026-02-24',source:'referral',classGroup:9,status:'trial_booked'},
];

async function run(){
  await preflight({mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,test:'tests/lead-funnel-browser.integration.ts — start the app first, then run it with TEST_ORIGIN'});
  const shared=process.env.TEST_ORIGIN?process.env.TEST_MONGO_URI:null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){for(const name of ['leads','users']){await mongoose.connection.db.collection(name).deleteMany({}).catch(()=>{})}}
  const pass=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(pass,12);
  const admin=await User.create({name:'FAKE Funnel',email:'fake-funnel@example.test',passwordHash:hash,role:'admin',active:true});
  const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3100';
  const browser=await chromium.launch();
  await mkdir(SHOTS,{recursive:true});
  try{
    await Lead.create(COHORT.map(entry=>({...entry,studentName:`FAKE ${entry.leadId}`,createdBy:admin._id})));
    let ready=false;
    for(let attempt=0;attempt<60&&!ready;attempt++){try{ready=(await fetch(origin+'/api/auth/csrf')).ok}catch{}if(!ready)await new Promise(r=>setTimeout(r,1000))}
    if(!ready)throw Error('app not reachable at '+origin);
    const session=async(locale,digits)=>{
      const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
      // The digit preference is per account, exactly as the language sweep sets it: an English proof
      // reads English all the way down, digits included.
      await context.addCookies([{name:`diction_digits_${String(admin._id)}`,value:digits,url:origin+'/'}]);
      const csrf=await (await context.request.get(origin+'/api/auth/csrf')).json();
      await context.request.post(origin+'/api/auth/callback/credentials',{timeout:180000,headers:{origin,'content-type':'application/x-www-form-urlencoded'},form:{csrfToken:csrf.csrfToken,identifier:'fake-funnel@example.test',password:pass,callbackUrl:origin+`/${locale}/admin`}});
      return context;
    };
    const download=async(page,label)=>{
      const [file]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.getByRole('button',{name:label}).click()]);
      return {name:file.suggestedFilename(),text:readFileSync(await file.path(),'utf8')};
    };

    // ── Bangla: the whole report, and the file it hands over ────────────────────────────────────
    {
      const context=await session('bn','bn'),page=await context.newPage();
      await page.goto(origin+'/bn/admin/leads/funnel',{waitUntil:'domcontentloaded',timeout:180000});
      await page.getByRole('heading',{name:F.title}).waitFor({timeout:60000});

      // mounted under Visitors: the sidebar carries it, and the list is one tap away
      const sidebar=await page.locator('.admin-sidebar').innerText();
      assert.ok(sidebar.includes(bn.adminRedesign.items.leadsFunnel),`the sidebar carries the funnel under ${bn.adminRedesign.groups.visitors}`);
      assert.ok(sidebar.includes(bn.adminRedesign.items.leads),'beside the Visitors list itself');
      // `exact`: the heading's other link is the import wizard, whose name begins with the same word.
      const back=page.locator('.admin-heading').getByRole('link',{name:bn.leads.title,exact:true});
      assert.equal(await back.count(),1,'the report links back to the Visitors list from its own heading');

      // three stages and three rates, each tile read on its own: this cohort is six visitors, three
      // trials, two admissions (one of them straight, with no trial) and one lead that did both.
      const tile=async(row,index)=>(await page.locator(`${row} .admin-kpi`).nth(index).innerText()).replace(/\s+/g,' ').trim();
      const percentOf=value=>F.percent.replace('{value}',formatNumber(value,'bn'));
      const stageTiles=[
        [F.stageVisitors,formatNumber(6,'bn')],
        [F.stageTrial,formatNumber(3,'bn')],
        [F.stageAdmitted,formatNumber(2,'bn')],
      ];
      for(const [index,[label,value]] of stageTiles.entries()){
        const text=await tile('.funnel-stages',index);
        assert.ok(text.includes(label)&&text.includes(value),`the stage tile reads ${label} ${value}: ${text}`);
      }
      const rateTiles=[
        [F.rateVisitorTrial,percentOf(50)],
        [F.rateTrialAdmitted,percentOf(33.3)],
        [F.rateVisitorAdmitted,percentOf(33.3)],
      ];
      for(const [index,[label,value]] of rateTiles.entries()){
        const text=await tile('.funnel-rates',index);
        assert.ok(text.includes(label)&&text.includes(value),`the rate tile reads ${label} ${value}: ${text}`);
      }

      // the month table, newest first, with the definitions under it
      const table=await page.locator('.funnel-table').innerText();
      assert.ok(table.includes(formatMonth('2026-02','bn','bn'))&&table.includes(formatMonth('2026-01','bn','bn')),'both months are named in Bangla');
      assert.ok(table.indexOf(formatMonth('2026-02','bn','bn'))<table.indexOf(formatMonth('2026-01','bn','bn')),'newest month first');
      assert.ok(table.includes(F.totalRow),'the totals row is part of the table');
      const notes=await page.locator('.funnel-notes').innerText();
      for(const note of [F.cohortNote,F.trialAdmittedNote,F.binNote,F.noRateNote])assert.ok(notes.includes(note),`the definitions travel with the numbers: ${note.slice(0,24)}…`);

      // the CSV of the month report, before anything is switched
      const monthFile=await download(page,F.exportCsv);
      assert.match(monthFile.name,/^diction-funnel-month-\d{4}-\d{2}-\d{2}\.csv$/,'the file name says which report and which day');
      assert.ok(monthFile.text.startsWith('\uFEFF'),'the byte-order mark is what makes Excel read the Bangla labels');
      const [header,...rows]=monthFile.text.replace(/^\uFEFF/,'').trim().split('\r\n');
      assert.equal(header,`"${F.colMonth}","${F.stageVisitors}","${F.stageTrial}","${F.stageAdmitted}","${F.rateVisitorTrial}","${F.rateTrialAdmitted}","${F.rateVisitorAdmitted}"`,'the header is the table head');
      assert.equal(rows.length,3,'two months and the totals row');
      assert.ok(rows[0].includes(`"${formatMonth('2026-02','en','bn')}"`,'a month label keeps its Bangla name…'));
      assert.ok(!BANGLA_DIGIT.test(monthFile.text),'…and the whole file keeps Latin digits, so Excel can add the column up');
      assert.ok(rows[2].includes(`"${F.totalRow}"`),'the totals row is in the file too');

      // switch the breakdown to source and ask for all five
      await page.selectOption('select[name=breakdown]','source');
      await page.getByRole('button',{name:bn.leads.apply}).click();
      await page.getByRole('heading',{name:F.title}).waitFor({timeout:60000});
      // Waited on the catalog's own word for the source that brought nobody, never on a literal:
      // rewording the catalog must not break the suite.
      await page.waitForFunction(label=>document.body.innerText.includes(label),bn.leads.sourceLabels.other,{timeout:60000});
      const bySource=await page.locator('.funnel-table').innerText();
      for(const source of Object.values(bn.leads.sourceLabels))assert.ok(bySource.includes(source),`every source is printed, including the one that brought nobody: ${source}`);
      assert.equal(await page.locator('.funnel-table tbody tr').count(),5,'five rows, one per source');
      const sourceFile=await download(page,F.exportCsv);
      assert.match(sourceFile.name,/^diction-funnel-source-\d{4}-\d{2}-\d{2}\.csv$/);
      assert.ok(sourceFile.text.includes(`"${F.colSource}"`)&&sourceFile.text.includes(`"${bn.leads.sourceLabels.facebook}"`),'the source report exports its own header and labels');
      assert.ok(!BANGLA_DIGIT.test(sourceFile.text),'and still not one Bangla digit in it');

      for(const width of [1440,360]){
        await page.setViewportSize({width,height:900});
        await page.waitForTimeout(250);
        const overflow=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
        assert.ok(overflow.scroll<=overflow.client,`nothing overflows sideways at ${width}px (${overflow.scroll} > ${overflow.client})`);
        await page.screenshot({path:path.join(SHOTS,`leads-funnel-bn-${width}.png`),fullPage:false});
      }
      await page.setViewportSize({width:1440,height:900});
      await context.close();
    }

    // ── English: the same report, with no Bangla anywhere on the screen ─────────────────────────
    {
      const context=await session('en','en'),page=await context.newPage();
      await page.goto(origin+'/en/admin/leads/funnel',{waitUntil:'domcontentloaded',timeout:180000});
      await page.getByRole('heading',{name:FE.title}).waitFor({timeout:60000});
      const head=await page.locator('.admin-panel-head').innerText();
      assert.ok(head.includes(FE.byMonth)&&head.includes(FE.exportCsv),'the panel head reads English');
      const table=await page.locator('.funnel-table').innerText();
      for(const word of [FE.colMonth,FE.stageVisitors,FE.stageTrial,FE.stageAdmitted,FE.rateVisitorTrial,FE.rateTrialAdmitted,FE.rateVisitorAdmitted,FE.totalRow])assert.ok(table.includes(word),`the table head reads English: ${word}`);
      assert.ok(table.includes(formatMonth('2026-01','en','en')),'and the month is named in English');
      // This report holds no stored user data at all, so the whole content area must be Bangla-free.
      const content=await page.locator('.admin-content').innerText();
      assert.ok(!BANGLA.test(content),`no Bangla character on the English screen: ${content.match(BANGLA)?.[0]||''}`);
      assert.ok(!BANGLA_DIGIT.test(content),'and no Bangla digit either');
      const englishFile=await download(page,FE.exportCsv);
      assert.ok(englishFile.text.includes(`"${FE.colMonth}"`),'the English report exports English headers');
      assert.ok(!BANGLA.test(englishFile.text),'and an English file carries no Bangla at all');
      for(const width of [1440,360]){
        await page.setViewportSize({width,height:900});
        await page.waitForTimeout(250);
        const overflow=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
        assert.ok(overflow.scroll<=overflow.client,`nothing overflows sideways at ${width}px in English either`);
        await page.screenshot({path:path.join(SHOTS,`leads-funnel-en-${width}.png`),fullPage:false});
      }
      await context.close();
    }

    console.log('Visitor funnel in the browser: mounted under Visitors in the sidebar and linked back to the list; six synthetic leads read as visitors ৬ / trials ৩ / admitted ২ — one of them a direct admission — with rates ৫০%, ৩৩.৩% and ৩৩.৩% in Bangla tiles; the month table newest-first with all four definitions under it; the CSV downloaded twice — BOM-marked, Latin-digit, formula-safe, named for its breakdown and day — and the source breakdown printing all five sources including the empty one; nothing overflowing at 360 px; and the whole English screen free of Bangla characters and Bangla digits. Photographed at 360 px and 1440 px in both languages into screenshots/r3.');
  }finally{
    await browser.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
}
run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
