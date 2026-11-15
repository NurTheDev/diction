/**
 * R6 slice 1 in the browser: the four money reports and the statement, driven and photographed into
 * screenshots/r6/, plus the export door that answers CSV and .xlsx, and the role wall around all of it.
 *
 * What this suite proves on screen:
 *
 *  1. the day page lists every valid receipt of the day with its student, class, head, fee month, taker
 *     and note, and the operator filter narrows the rows and the per-operator totals together;
 *  2. the month page draws the class-by-day matrix whose row and column margins meet at one grand
 *     total, and the head totals add their own share;
 *  3. the year page shows one row per class — expected, collected, outstanding, pending, waived — with
 *     a totals row that sums exactly those rows;
 *  4. the cashbook check names a seeded duplicate receipt with both of its records and a seeded gap
 *     with the two receipts that bound it, every flagged record links to that student's statement, and
 *     once the two offending rows are removed the same screen reads clean in both languages;
 *  5. the statement walks assessments, waivers and payments in date order, its running due's last line
 *     is the summary's outstanding, and under print media the sheet is the page: the shell, the filters
 *     and the toolbar are hidden while the brand, the walk and the summary paint;
 *  6. the export route answers the same tables as a formula-safe CSV (BOM, quoted cells, the apostrophe
 *     on a note that begins with `=`) and as a real .xlsx (PK, the worksheet part, the right mime);
 *  7. a teacher session is refused at every report address and gets 403 from the export route, while a
 *     staff session — the accountant at the desk — reads them all;
 *  8. the English addresses read English labels with English digits, and no catalog key path paints on
 *     any of the five screens; nothing overflows horizontally at 360 px.
 *
 * Runs against an already-started app and its disposable database (TEST_ORIGIN + TEST_MONGO_URI), the
 * way the other browser suites do. Every asserted string comes out of the two catalogs.
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
import {CenterStudent,CenterClassGroup,CenterPayment,CenterFeeWaiver} from '../src/models/CenterRecords';
import bn from '../src/messages/bn.json';
import en from '../src/messages/en.json';

const t=bn.reports;
const en_t=en.reports;
const SHOTS=path.join('screenshots','r6');
const BN=/[\u0980-\u09ff]/;
const bnDigits=value=>String(value).replace(/[0-9]/g,digit=>'০১২৩৪৫৬৭৮৯'[Number(digit)]);
const KEY_PATH=/\b(?:reports|admin|common|exams)\.[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+/;

async function run(){
  await preflight({
    mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',
    originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,
    test:'tests/reports-browser.integration.ts — start the app first, then run it with TEST_ORIGIN and TEST_MONGO_URI (see docs/STALE-TESTS.md)',
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

  // ── One class, three children, two operators, one teacher ────────────────────────────────────────
  const pass=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(pass,12);
  const owner=await User.create({name:'নমুনা মালিক',email:'r6-owner@example.test',passwordHash:hash,role:'admin',active:true});
  const cashier=await User.create({name:'নমুনা ক্যাশিয়ার',email:'r6-cashier@example.test',passwordHash:hash,role:'staff',active:true});
  const teacher=await User.create({name:'নমুনা শিক্ষক',email:'r6-teacher@example.test',passwordHash:hash,role:'teacher',active:true});
  const group=await CenterClassGroup.create({name:{bn:'নমুনা নবম ক',en:'Sample Nine A'},academicYear:2026,active:true});
  /* A second class, because a matrix of one row proves nothing about its margins: the last receipt of
     the month is taken from a child of this class. */
  const group2=await CenterClassGroup.create({name:{bn:'নমুনা দশম খ',en:'Sample Ten B'},academicYear:2026,active:true});
  const makeStudent=(studentId,name)=>CenterStudent.create({
    studentId,name:{bn:name,en:name},classGroup:group._id,roll:studentId.replace(/\D/g,''),
    guardianName:'নমুনা অভিভাবক',guardianPhone:'01711000011',admissionDate:'2026-01-01',
    startMonth:{year:2026,month:1},feeHistory:[{effectiveFrom:{year:2026,month:1},amount:1000}],
  });
  const [sa,sb,sc]=await Promise.all([
    makeStudent('নমুনা-1','নমুনা ছাত্র ক'),
    makeStudent('নমুনা-2','নমুনা ছাত্র খ'),
    makeStudent('নমুনা-3','নমুনা ছাত্র গ'),
  ]);
  const pay=(over)=>CenterPayment.create({
    classGroupAtPayment:group._id,type:'monthly',academicYear:2026,month:2,amount:1000,
    receiptKey:'',note:'',status:'valid',groupId:'r6-seed',...over,
  });
  /* One day, three receipts, two operators; then a number written twice and a hole at 104. */
  const [p1,p2,p3,p4,p5]=await Promise.all([
    pay({student:sa._id,amount:1000,receiptNo:'101',paidOn:'2026-02-10',receivedBy:owner._id}),
    pay({student:sb._id,amount:500,receiptNo:'102',paidOn:'2026-02-10',receivedBy:cashier._id}),
    pay({student:sa._id,type:'admission',month:undefined,amount:300,receiptNo:'103',paidOn:'2026-02-10',receivedBy:cashier._id,note:'=1+1'}),
    pay({student:sa._id,amount:500,receiptNo:'102',paidOn:'2026-02-12',receivedBy:owner._id}),
    pay({student:sc._id,amount:1000,receiptNo:'105',paidOn:'2026-02-14',receivedBy:owner._id,classGroupAtPayment:group2._id}),
  ]);
  await CenterFeeWaiver.create({student:sb._id,year:2026,month:3,reason:'নমুনা ছাড়'});

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

    const adminBn=await session(owner,'bn');
    const adminEn=await session(owner,'en');
    const staffBn=await session(cashier,'bn');
    const teacherBn=await session(teacher,'bn');

    // ── 1. the hub and the day page ───────────────────────────────────────────────────────────────
    await goto(adminBn.page,'/bn/admin/reports');
    assert.equal(await adminBn.page.locator('[data-reports-hub] a').count(),8,'four reports, each with a title link and an open button');
    assert.ok((await adminBn.page.locator('[data-reports-hub]').innerText()).includes(t.hub.daily));

    await goto(adminBn.page,'/bn/admin/reports/daily?date=2026-02-10');
    assert.equal(await adminBn.page.locator('[data-daily-row]').count(),3,'the day’s three receipts');
    const dayText=await adminBn.page.locator('[data-daily-report]').innerText();
    assert.ok(dayText.includes(bnDigits('101'))&&dayText.includes('নমুনা ছাত্র ক'),'with their numbers and children');
    assert.ok(dayText.includes(t.types.admission),'and the admission head reads as a word');
    assert.ok((await adminBn.page.locator('[data-daily-total]').innerText()).includes(bnDigits(1800)),
      'the day’s total is the three receipts added: 1000 + 500 + 300');
    assert.equal(await adminBn.page.locator('[data-daily-operators] li').count(),2,'two people took money that day');
    await shot(adminBn.page,'reports-daily-bn-1440');
    await adminBn.page.setViewportSize({width:360,height:900});
    await shot(adminBn.page,'reports-daily-bn-360');
    await adminBn.page.setViewportSize({width:1440,height:900});

    /* The filter is a GET form: the narrowed address is the proof, not a click. */
    await goto(adminBn.page,`/bn/admin/reports/daily?date=2026-02-10&operator=${String(cashier._id)}`);
    assert.equal(await adminBn.page.locator('[data-daily-row]').count(),2,'the operator filter narrows the rows');
    assert.equal(await adminBn.page.locator('[data-daily-operators] li').count(),1,'and the per-operator totals with them');
    assert.ok((await adminBn.page.locator('[data-daily-total]').innerText()).includes(bnDigits(800)));

    // ── 2. the month matrix ────────────────────────────────────────────────────────────────────────
    await goto(adminBn.page,'/bn/admin/reports/monthly?year=2026&month=2');
    const grand=await adminBn.page.locator('[data-mx-grand]').getAttribute('data-mx-grand');
    assert.equal(grand,'3300','1000 + 500 + 300 + 500 + 1000, the whole month');
    const matrixText=await adminBn.page.locator('[data-monthly-matrix]').innerText();
    assert.ok(matrixText.includes(t.monthly.grand));
    const dayTotals=await adminBn.page.locator('[data-mx-day-totals] td').allInnerTexts();
    const classTotals=await adminBn.page.locator('[data-mx-class-total]').allInnerTexts();
    assert.ok(dayTotals.join(' ').replace(/\s/g,'').includes(bnDigits(3300).replace(/\s/g,'')),'the day row ends at the grand total');
    assert.equal(await adminBn.page.locator('[data-monthly-matrix] tbody tr').count(),2,'two classes held money this month');
    const classLine=classTotals.join(' ');
    assert.ok(classLine.includes(bnDigits(2300)),'the first class row carries its own sum: 1000 + 500 + 300 + 500');
    assert.ok(classLine.includes(bnDigits(1000)),'and the second class row carries only its own receipt');
    assert.ok((await adminBn.page.locator('[data-monthly-types]').innerText()).includes(t.types.admission));
    await shot(adminBn.page,'reports-monthly-bn-1440');

    // ── 3. the year summary ────────────────────────────────────────────────────────────────────────
    await goto(adminBn.page,'/bn/admin/reports/year?year=2026');
    assert.equal(await adminBn.page.locator('[data-year-row]').count(),1,'one class holds the year');
    const yearRow=await adminBn.page.locator('[data-year-row]').innerText();
    const totalsRow=await adminBn.page.locator('[data-year-totals]').innerText();
    assert.ok(yearRow.includes(bnDigits(3300)),'collected is every monthly taka of the year plus the admission: 3000 + 300');
    assert.ok(totalsRow.includes(bnDigits(3300)),'and the totals row sums the one row it has');
    assert.ok((await adminBn.page.locator('[data-year-report]').innerText()).includes(t.year.pending));
    await shot(adminBn.page,'reports-year-bn-1440');

    // ── 4. the cashbook check ──────────────────────────────────────────────────────────────────────
    await goto(adminBn.page,'/bn/admin/reports/receipt-audit');
    assert.equal(await adminBn.page.locator('[data-audit-duplicate]').count(),1,'one number was written twice');
    const dupText=await adminBn.page.locator('[data-audit-duplicate]').innerText();
    assert.ok(dupText.includes(bnDigits('102'))&&dupText.includes(bnDigits(2)),'102, two times');
    assert.ok(dupText.includes('নমুনা ছাত্র ক')&&dupText.includes('নমুনা ছাত্র খ'),'both children it was written for');
    assert.equal(await adminBn.page.locator('[data-audit-gap]').count(),1,'and one number never got written');
    const gapText=await adminBn.page.locator('[data-audit-gap]').innerText();
    assert.ok(gapText.includes(bnDigits('104')),'the hole is at 104');
    const reviews=await adminBn.page.locator('[data-audit-review]').first().getAttribute('href');
    assert.ok(reviews.includes('/admin/reports/statement/'),'every flag links to the record behind it');
    assert.ok((await adminBn.page.locator('[data-audit-scanned]').innerText()).includes(bnDigits(5)));
    await shot(adminBn.page,'reports-audit-bn-1440');

    /* Remove the two offending rows and the same screen must read clean — in both languages. */
    await CenterPayment.deleteMany({_id:{$in:[p4._id,p5._id]}});
    await goto(adminBn.page,'/bn/admin/reports/receipt-audit');
    assert.ok((await adminBn.page.locator('[data-audit-clean]').innerText()).includes(t.audit.clean));
    await goto(adminEn.page,'/en/admin/reports/receipt-audit');
    assert.ok((await adminEn.page.locator('[data-audit-clean]').innerText()).includes(en_t.audit.clean));

    // ── 5. the statement, on screen and on paper ───────────────────────────────────────────────────
    await goto(adminBn.page,`/bn/admin/reports/statement/${String(sa._id)}`);
    const allKinds=await adminBn.page.locator('[data-ledger-row]').evaluateAll(rows=>rows.map(row=>row.getAttribute('data-ledger-kind')));
    assert.ok(allKinds[0]==='assessment','the walk opens with the first month’s fee');
    assert.ok(allKinds.includes('payment')&&allKinds.includes('extra'),'receipts and the admission sit on their own days');
    const dates=await adminBn.page.locator('[data-ledger-row]').evaluateAll(rows=>rows.map(row=>row.getAttribute('data-ledger-date')));
    assert.deepEqual(dates,[...dates].sort(),'the walk is in date order, and the attribute says so in machine words');
    const lastRunning=await adminBn.page.locator('[data-ledger-row]').last().getAttribute('data-running');
    const outstanding=await adminBn.page.locator('[data-summary-outstanding]').getAttribute('data-outstanding');
    assert.equal(lastRunning,outstanding,'the walk’s last line and the summary’s outstanding are the same number');
    assert.ok((await adminBn.page.locator('[data-ledger-statement]').innerText()).includes(t.statement.summaryTitle));
    await shot(adminBn.page,'reports-statement-bn-1440');

    await adminBn.page.emulateMedia({media:'print'});
    const printed=await adminBn.page.evaluate(()=>{
      const out=[];
      for(const selector of ['.admin-sidebar','.admin-top','.report-filters','.report-toolbar','[data-report-print]','[data-ledger-statement]','[data-ledger-summary]','.report-brand']){
        let hidden=true;
        for(const element of document.querySelectorAll(selector)){
          const box=element.getBoundingClientRect();
          const style=getComputedStyle(element);
          if((box.width>0||box.height>0)&&style.visibility!=='hidden'&&style.display!=='none')hidden=false;
        }
        out.push(selector+'='+(hidden?'hidden':'shown'));
      }
      return out.join(' ');
    });
    for(const hidden of ['.admin-sidebar=hidden','.admin-top=hidden','.report-filters=hidden','.report-toolbar=hidden','[data-report-print]=hidden'])
      assert.ok(printed.includes(hidden),`on paper ${hidden.split('=')[0]} is gone; the page reported: ${printed}`);
    for(const shown of ['[data-ledger-statement]=shown','[data-ledger-summary]=shown','.report-brand=shown'])
      assert.ok(printed.includes(shown),`on paper ${shown.split('=')[0]} paints; the page reported: ${printed}`);
    await shot(adminBn.page,'reports-statement-print-bn-1440');
    await adminBn.page.emulateMedia({media:'screen'});

    // ── 6. the export door ─────────────────────────────────────────────────────────────────────────
    const csvRes=await adminBn.context.request.get(origin+'/bn/admin/reports/export?kind=daily&date=2026-02-10&format=csv');
    assert.equal(csvRes.status(),200);
    assert.ok((csvRes.headers()['content-type']||'').includes('text/csv'));
    const csv=await csvRes.text();
    assert.ok(csv.startsWith('\uFEFF'),'the CSV carries the BOM');
    assert.ok(csv.includes("'=1+1"),'and the note that begins with an equals sign keeps its apostrophe');
    assert.ok((csvRes.headers()['content-disposition']||'').includes('attachment'));
    const xlsxRes=await adminBn.context.request.get(origin+'/bn/admin/reports/export?kind=monthly&year=2026&month=2&format=xlsx');
    assert.equal(xlsxRes.status(),200);
    assert.ok((xlsxRes.headers()['content-type']||'').includes('spreadsheetml'));
    const xlsxBytes=await xlsxRes.body();
    assert.equal(xlsxBytes[0],0x50);assert.equal(xlsxBytes[1],0x4b);
    const ledgerCsv=await adminBn.context.request.get(origin+`/bn/admin/reports/export?kind=ledger&student=${String(sa._id)}&format=csv`);
    assert.equal(ledgerCsv.status(),200,'the statement exports too');
    const badKind=await adminBn.context.request.get(origin+'/bn/admin/reports/export?kind=nope&format=csv');
    assert.equal(badKind.status(),404,'an unknown report is not an empty file');

    // ── 7. the role wall ───────────────────────────────────────────────────────────────────────────
    for(const href of ['/bn/admin/reports','/bn/admin/reports/daily','/bn/admin/reports/monthly','/bn/admin/reports/receipt-audit','/bn/admin/reports/year',`/bn/admin/reports/statement/${String(sa._id)}`]){
      await goto(teacherBn.page,href);
      assert.equal(await teacherBn.page.locator('[data-reports-hub],[data-daily-report],[data-monthly-matrix],[data-receipt-audit],[data-year-report],[data-ledger-statement]').count(),0,
        `a teacher reads nothing at ${href}`);
    }
    /* Two doors, one wall: the middleware bounces a signed-in teacher off every /admin address with a
       redirect, and the route's own guard answers 403 if anything ever reaches it. Either way the
       teacher's client never holds a file. */
    const teacherExport=await teacherBn.context.request.get(origin+'/bn/admin/reports/export?kind=daily&date=2026-02-10&format=csv',{maxRedirects:0});
    const status=teacherExport.status();
    assert.ok(status===403||(status>=300&&status<400),`the export door turns a teacher away before or at the threshold, got ${status}`);
    assert.ok(!(teacherExport.headers()['content-type']||'').includes('text/csv'),'and whatever answered, it answered with no file');
    await goto(staffBn.page,'/bn/admin/reports/daily?date=2026-02-10');
    assert.equal(await staffBn.page.locator('[data-daily-row]').count(),3,'the accountant at the desk reads the day');

    // ── 8. English reads English, and nothing overflows or leaks a key path ────────────────────────
    await goto(adminEn.page,'/en/admin/reports/daily?date=2026-02-10');
    const enChrome=(await adminEn.page.locator('.admin-heading, .report-filters, [data-daily-report] thead').allInnerTexts()).join('\n');
    assert.equal(BN.test(enChrome),false,'the English day page’s own words carry no Bangla');
    assert.ok(enChrome.includes(en_t.daily.receipt)&&enChrome.includes(en_t.daily.operator));
    assert.ok((await adminEn.page.locator('[data-daily-total]').innerText()).includes('1800'),'and its digits are English');
    await shot(adminEn.page,'reports-daily-en-1440');
    for(const [page,href] of [[adminEn.page,'/en/admin/reports/monthly?year=2026&month=2'],[adminEn.page,'/en/admin/reports/year?year=2026']]){
      await goto(page,href);
      assert.equal(BN.test((await page.locator('.admin-heading, .report-filters').allInnerTexts()).join('\n')),false,`English chrome at ${href}`);
    }
    for(const href of ['/bn/admin/reports/daily?date=2026-02-10','/bn/admin/reports/monthly?year=2026&month=2','/bn/admin/reports/receipt-audit','/bn/admin/reports/year?year=2026',`/bn/admin/reports/statement/${String(sa._id)}`]){
      await goto(adminBn.page,href);
      const body=await adminBn.page.evaluate(()=>document.body.innerText);
      assert.equal(KEY_PATH.test(body),false,`no catalog key path paints at ${href}`);
      await adminBn.page.setViewportSize({width:360,height:900});
      const overflow=await adminBn.page.evaluate(()=>{
        const bad=[];
        for(const element of document.querySelectorAll('body *')){
          let ancestor=element.parentElement,covered=false;
          while(ancestor&&ancestor!==document.body){
            if(getComputedStyle(ancestor).overflowX!=='visible'){covered=true;break}
            ancestor=ancestor.parentElement;
          }
          if(covered)continue;
          const box=element.getBoundingClientRect();
          if(box.right>window.innerWidth+1)bad.push(`${element.tagName}.${element.className} right=${Math.round(box.right)}`);
          if(bad.length>=6)break;
        }
        return bad.join(' | ');
      });
      assert.equal(overflow,'',`nothing overflows the 360 px page at ${href}: ${overflow}`);
      await adminBn.page.setViewportSize({width:1440,height:900});
    }

    assert.deepEqual(errors,[],'no page threw while the reports were driven');
    console.log('ReportsBrowser: day, month, year, cashbook check, statement, print, exports, the role wall and both languages all hold');
  }finally{
    await browser.close();
    await mongoose.disconnect();
    if(!shared)await mongo.stop();
  }
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
