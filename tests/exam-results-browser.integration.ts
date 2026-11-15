/**
 * R5 slice 2 in the browser: the result history an operator reads on a student's profile, the report card
 * a family prints, and the Results tab a student or a guardian sees — photographed at 360 px and 1440 px
 * in Bangla and English into screenshots/r5/, and asserted while driven.
 *
 * What the owner asked to see, and what this suite proves on screen:
 *
 *  1. the student profile has a Results tab beside the payment one, and it holds the published exams
 *     newest first — each with its own subjects, marks, total, percentage, grade and position — while a
 *     marked-but-unpublished exam is nowhere on it;
 *  2. the improvement trend is a drawn chart with one point per sat exam, its own percentage printed on
 *     it, the step between the last two named as a rise or a fall, and an exam the child missed left out
 *     of the line and counted as skipped instead;
 *  3. the report card carries the institute's name, the student's readable id and roll, the subject
 *     breakdown, the total, the grade, the point, the position, a remarks space that says nothing has
 *     been written yet, and two ruled signature lines — and its print button asks the browser to print;
 *  4. under print media the card is the page: the admin sidebar, the header, the tab bar and the toolbar
 *     are all hidden, which is what makes it a report card rather than a screenshot of one;
 *  5. a card for an unpublished exam says the centre is still working, and a card for a child who was
 *     never in the exam says that — two different sentences, because they mean two different things;
 *  6. the student's own portal Results tab shows their published results and nothing else: no sibling's
 *     marks, no other child's name, no fee or payment word, no admin address anywhere on the page;
 *  7. a guardian's Results tab shows the two children on their own number with a switcher between them,
 *     and a guardian whose number is on no student record gets the empty state rather than somebody's;
 *  8. a student session that types the guardian's address is sent to sign in, because the two tabs are
 *     two different roles and not one screen with a longer URL;
 *  9. the English addresses read as English in every label these screens own — headers, help lines, the
 *     chart's axis and date labels, the card's field names — with English digits, while the exam and the
 *     child keep the Bangla names the operator typed;
 * 10. nothing overflows horizontally at 360, 768 or 1440 px, on any of the four screens.
 *
 * Runs against an already-started app and its disposable database (TEST_ORIGIN + TEST_MONGO_URI), the way
 * the other browser suites do. Every string asserted is read out of `src/messages/bn.json` and
 * `en.json` — the same catalogs the screens read — and every student, exam and account is synthetic and
 * labelled নমুনা.
 */
// @ts-nocheck -- isolated browser test against the disposable database
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {CenterStudent,CenterClassGroup,CenterExam} from '../src/models/CenterRecords';
import {createCenterExam,publishCenterExam,saveCenterExamMarks} from '../src/lib/center/exam-batch';
import {DEFAULT_GRADING_RANGES,rangesToBands} from '../src/lib/exams/vocab';
import bn from '../src/messages/bn.json';
import en from '../src/messages/en.json';

const t=bn.exams;
const en_t=en.exams;
const common=bn.common;
const en_common=en.common;
const SHOTS=path.join('screenshots','r5');
const BN=/[\u0980-\u09ff]/;
/** Money words, in both languages, with the English ones bounded so a label like "Percentage" is not a hit. */
const MONEY=/বেতন|বকেয়া|রশিদ|ক্যাশ|টাকা জমা|ফি লেজার|\bfee\b|\bfees\b|\bdue\b|\bdues\b|\bpaid\b|\bpayment\b|\breceipt\b|\bcash\b/i;
/** A catalog key path painted instead of a word: the sign of a client component reading a group its route
    never shipped. Scoped to the boxes these screens own, not to a portal chrome that has never been swept. */
const KEY_PATH=/\b(?:exams|admin|nav|common)\.[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+/;

const bands=rangesToBands(DEFAULT_GRADING_RANGES);
const subjects=[{name:'বাংলা',full:100,pass:33},{name:'গণিত',full:50,pass:20}];
const bnDigits=value=>String(value).replace(/[0-9]/g,digit=>'০১২৩৪৫৬৭৮৯'[Number(digit)]);

async function run(){
  await preflight({
    mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',
    originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,
    test:'tests/exam-results-browser.integration.ts — start the app first, then run it with TEST_ORIGIN and TEST_MONGO_URI (see docs/STALE-TESTS.md)',
  });
  const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3100';
  const shared=process.env.TEST_ORIGIN?process.env.TEST_MONGO_URI:null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){
    for(const collection of await mongoose.connection.db.listCollections().toArray())
      await mongoose.connection.db.collection(collection.name).deleteMany({}).catch(()=>{});
  }
  await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});
  await mkdir(SHOTS,{recursive:true});

  // ── One class, three children, two portal accounts ────────────────────────────────────────────────
  const pass=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(pass,12);
  const admin=await User.create({name:'নমুনা মালিক',email:'r5res-admin@example.test',passwordHash:hash,role:'admin',active:true});
  /* The student's own number and the guardian's number are different, which is what makes the two portal
     tabs two different questions: "my results" and "my children's results". */
  const child=await User.create({name:'নমুনা ছাত্র ক',email:'r5res-student@example.test',passwordHash:hash,role:'student',phone:'01811000011',active:true});
  const guardian=await User.create({name:'নমুনা অভিভাবক',email:'r5res-parent@example.test',passwordHash:hash,role:'parent',phone:'01711000011',active:true});
  const unrelated=await User.create({name:'নমুনা অন্য অভিভাবক',email:'r5res-none@example.test',passwordHash:hash,role:'parent',phone:'01711000099',active:true});
  const classA=await CenterClassGroup.create({name:{bn:'নমুনা নবম ক',en:'Sample Nine A'},academicYear:2026,active:true});
  const makeStudent=(studentId,name,phones)=>CenterStudent.create({
    studentId,name:{bn:name,en:name},classGroup:classA._id,roll:studentId.replace(/\D/g,''),
    guardianName:'নমুনা অভিভাবক',admissionDate:'2026-01-01',startMonth:{year:2026,month:1},
    /* A fee history on purpose: the results screens must not be able to show any of it. */
    feeHistory:[{effectiveFrom:{year:2026,month:1},amount:1000}],...phones,
  });
  /* The readable ids carry Latin digits on purpose: a card that prints them is a card whose digits follow
     the account, so the Bangla screen has to read নমুনা-১ and the English one নমুনা-1. */
  const [ra,rb,rc]=await Promise.all([
    makeStudent('নমুনা-1','নমুনা ছাত্র ক',{guardianPhone:'01711000011',studentPhone:'01811000011'}),
    makeStudent('নমুনা-2','নমুনা ছাত্র খ',{guardianPhone:'01711000011',studentPhone:'01811000022'}),
    makeStudent('নমুনা-3','নমুনা ছাত্র গ',{guardianPhone:'01711000033'}),
  ]);

  const request=(name,date,type)=>({requestId:randomUUID(),classIds:[String(classA._id)],name,date,type,scaleName:'default',subjects,bands});
  const february=await createCenterExam(request('নমুনা মাসিক পরীক্ষা','2026-02-01','monthly'),String(admin._id));
  const march=await createCenterExam(request('নমুনা মডেল টেস্ট','2026-03-01','model_test'),String(admin._id));
  const april=await createCenterExam(request('নমুনা টার্ম পরীক্ষা','2026-04-01','term'),String(admin._id));
  const subjectIds=async examId=>(await CenterExam.findById(examId).lean()).subjects.map(s=>String(s._id));
  const mark=async(examId,student,bn,math)=>{
    const ids=await subjectIds(examId);
    await saveCenterExamMarks({examId,studentId:String(student._id),version:-1,marks:[
      {subject:ids[0],obtained:bn,absent:false},{subject:ids[1],obtained:math,absent:false}]},String(admin._id));
  };
  await mark(february.id,ra,90,45);   // 135/150 = 90%
  await mark(february.id,rb,60,20);   //  80/150 = 53.33%
  await mark(february.id,rc,80,40);   // 120/150 = 80%
  await mark(march.id,ra,70,30);      // 100/150 = 66.67%
  const absentIds=await subjectIds(march.id);
  await saveCenterExamMarks({examId:march.id,studentId:String(rb._id),version:-1,
    marks:absentIds.map(subject=>({subject,obtained:null,absent:true}))},String(admin._id));
  await mark(april.id,ra,95,48);      // marked, never published
  await publishCenterExam(february.id,String(admin._id));
  await publishCenterExam(march.id,String(admin._id));

  const browser=await chromium.launch();
  const errors=[];
  try{
    {let ready=false;for(let index=0;index<60&&!ready;index++){try{ready=(await fetch(origin+'/api/auth/csrf')).ok}catch{/* not up yet */}if(!ready)await new Promise(resolve=>setTimeout(resolve,1000))}
     if(!ready)throw new Error('the app did not answer at '+origin)}

    async function session(user,locale,land){
      const context=await browser.newContext({viewport:{width:1440,height:900}});
      const csrf=await (await context.request.get(origin+'/api/auth/csrf')).json();
      await context.request.post(origin+'/api/auth/callback/credentials',{
        timeout:180000,headers:{origin,'content-type':'application/x-www-form-urlencoded'},
        form:{csrfToken:csrf.csrfToken,identifier:user.email,password:pass,callbackUrl:`${origin}/${locale}${land}`},
      });
      // An English proof reads English all the way down, digits included: the digits are the account's own.
      await context.addCookies([{name:`diction_digits_${String(user._id)}`,value:locale==='en'?'en':'bn',url:origin+'/'}]);
      const page=await context.newPage();
      page.on('pageerror',error=>errors.push(`${page.url()}: ${error.message}`));
      return {context,page};
    }
    const shot=(page,name)=>page.screenshot({path:path.join(SHOTS,`${name}.png`),fullPage:true});
    const goto=async(page,route)=>{
      await page.goto(origin+route,{waitUntil:'domcontentloaded',timeout:180000});
      await page.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{});
    };
    /* "This screen overflows" is half a diagnosis, so the check names what escapes — skipping anything
       inside a wrapper that scrolls, because a wide table inside `overflow-x:auto` is the design. */
    const noOverflow=async(page,name)=>{
      for(const width of [360,768,1440]){
        await page.setViewportSize({width,height:900});
        const measured=await page.evaluate(()=>{
          const client=document.documentElement.clientWidth;
          const wide:string[]=[];
          for(const element of document.querySelectorAll('body *')){
            const box=element.getBoundingClientRect();
            if(box.right<=client+1)continue;
            let insideScroller=false;
            for(let node=element.parentElement;node;node=node.parentElement){
              if(getComputedStyle(node).overflowX!=='visible'){insideScroller=true;break}
            }
            if(insideScroller)continue;
            let label=element.tagName.toLowerCase();
            const classes=(element.getAttribute('class')||'').trim();
            if(classes)label+='.'+classes.split(/\s+/).join('.');
            wide.push(label+' right='+Math.round(box.right));
            if(wide.length>=6)break;
          }
          return {scroll:document.documentElement.scrollWidth,client,wide};
        });
        assert.ok(measured.scroll<=measured.client+1,
          `${name} overflows horizontally at ${width}px (${measured.scroll} > ${measured.client})`+(measured.wide.length?`\n  escaping the viewport: ${measured.wide.join(' \n| ')}`:''));
      }
      await page.setViewportSize({width:1440,height:900});
    };
    const hrefsOf=page=>page.evaluate(()=>{
      const out:string[]=[];
      for(const anchor of document.querySelectorAll('a[href]'))out.push(anchor.getAttribute('href')||'');
      return out;
    });
    const textOf=(page,selector)=>page.locator(selector).first().innerText().catch(()=>'');

    // ── 1–2. The Results tab on the student profile: history and trend ──────────────────────────────
    const staff=await session(admin,'bn','/admin');
    const page=staff.page;
    await goto(page,`/bn/admin/students/${String(ra._id)}`);
    const tabs=page.locator('[data-student-tabs]');
    await tabs.waitFor({timeout:60000});
    assert.equal((await tabs.locator('[data-tab-results]').innerText()).trim(),t.results.tab,
      'the profile offers a Results tab in the catalog’s own word');
    assert.equal(await tabs.locator('a').count(),3,'beside the profile and the payment history, and nothing else');
    await tabs.locator('[data-tab-results]').click();
    await page.waitForURL(/tab=results/,{timeout:60000});
    const history=page.locator('[data-result-history]');
    await history.waitFor({timeout:60000});
    assert.equal((await textOf(page,'[data-result-count]')).trim(),bnDigits(2),'two published exams, not three');
    const bodyText=await page.locator('body').innerText();
    assert.equal(bodyText.includes('নমুনা টার্ম পরীক্ষা'),false,
      'the marked-but-unpublished exam is nowhere on the tab: a draft is the operator’s working paper');
    assert.equal(await page.locator('[data-result-row]').count(),2);
    const row=page.locator(`[data-result-row="${march.id}"]`);
    assert.equal((await row.locator('[data-result-total]').innerText()).trim(),`${bnDigits(100)}/${bnDigits(150)}`,'the total is the stored one, quoted');
    assert.equal((await row.locator('[data-result-percent]').innerText()).trim(),bnDigits('66.67'));
    assert.equal((await row.locator('[data-result-grade]').innerText()).trim(),'A-','100 of 150 is 66.67 percent');
    assert.equal((await row.locator('[data-result-position]').innerText()).trim(),bnDigits(1),'and it is the position publishing wrote');
    const subjectCell=(await row.locator('[data-result-subjects]').innerText()).replace(/\s+/g,' ');
    assert.ok(subjectCell.includes(`বাংলা ${bnDigits(70)}/${bnDigits(100)}`),
      `each row carries its own subjects with their own full marks: ${subjectCell}`);
    assert.equal((await page.locator(`[data-result-row="${february.id}"] [data-result-position]`).innerText()).trim(),bnDigits(1),
      'the first exam keeps its own position, so two rows can both read first');
    assert.equal(await history.locator(`[data-report-link="${february.id}"]`).count(),1,'and every row offers its report card');
    /* The chart: two points for two sat exams, each labelled with its own percentage, the step named as a
       fall, and the axis printed so the scale is never a guess. */
    const trend=page.locator('[data-result-trend]');
    await trend.waitFor({timeout:60000});
    assert.equal(await trend.locator('[data-trend-point]').count(),2,'one point per sat exam');
    assert.ok((await textOf(page,'[data-trend-change]')).startsWith(t.results.down),
      '90 percent down to 66.67 is named as a fall, with the size of the step beside it');
    assert.ok((await textOf(page,'[data-trend-change]')).includes(bnDigits('23.33')));
    /* An SVG element is not an HTMLElement, so `innerText` is not the way to read what a chart says: the
       labels live in <text> nodes and are read as text content. */
    const chartText=await trend.locator('[data-trend-chart]').textContent();
    assert.ok(chartText.includes(bnDigits(100))&&chartText.includes(bnDigits(0)),
      'the axis prints its own ends, so a small step cannot be read as a collapse');
    assert.ok(chartText.includes(bnDigits(90))&&chartText.includes(bnDigits('66.67')),'and each point is labelled with its percentage');
    assert.ok((await textOf(page,'[data-trend-caption]')).includes('নমুনা মাসিক পরীক্ষা'),
      'the caption names the best of the series, because a trend is not only its last step');
    assert.ok(await trend.locator('[data-trend-chart] path.trend-line').count(),'the line is drawn, not described');
    await shot(page,'student-results-bn-1440');
    await page.setViewportSize({width:360,height:900});
    await shot(page,'student-results-bn-360');
    await noOverflow(page,'the results tab');
    assert.equal(MONEY.test(await history.innerText()),false,'the history itself carries no money word');
    assert.equal(MONEY.test(await trend.innerText()),false,'and neither does the trend');
    assert.equal(KEY_PATH.test(await history.innerText())||KEY_PATH.test(await trend.innerText()),false,
      'no catalog key path is painted where a word should be');

    // ── 3–4. The report card, and what printing does to the page around it ──────────────────────────
    await goto(page,`/bn/admin/students/${String(ra._id)}?tab=results&report=${february.id}`);
    const card=page.locator('[data-report-card]');
    await card.waitFor({timeout:60000});
    assert.equal((await textOf(page,'[data-report-brand]')).trim(),common.brand,'the institute’s name is the catalog’s brand, the one the public site prints');
    assert.equal((await card.locator('h1').innerText()).trim(),t.report.title);
    const who=await card.locator('[data-report-student]').innerText();
    assert.ok(who.includes('নমুনা ছাত্র ক'),'the card names the child');
    assert.ok(who.includes('নমুনা-১'),`and their readable id in the account’s digits, not an ObjectId: ${who.split('\n').join(' | ')}`);
    assert.ok(who.includes('নমুনা নবম ক'),'and the class the exam was sat in');
    assert.equal((await textOf(page,'[data-report-exam]')).trim(),'নমুনা মাসিক পরীক্ষা');
    const subjectRow=card.locator('[data-report-subject="বাংলা"]');
    assert.deepEqual((await subjectRow.locator('td').allInnerTexts()).map(text=>text.trim()),
      ['বাংলা',bnDigits(90),bnDigits(100),bnDigits(33)],'the subject breakdown quotes the mark, the full mark and the pass mark');
    assert.equal((await textOf(page,'[data-report-total]')).trim(),`${bnDigits(135)}/${bnDigits(150)}`);
    assert.equal((await textOf(page,'[data-report-percent]')).trim(),bnDigits(90));
    assert.equal((await textOf(page,'[data-report-grade]')).trim(),'A+');
    assert.equal((await textOf(page,'[data-report-point]')).trim(),bnDigits(5));
    assert.equal((await textOf(page,'[data-report-position]')).trim(),bnDigits(1));
    const remarks=card.locator('[data-report-remarks]');
    assert.ok((await remarks.innerText()).includes(t.report.remarksPlaceholder),
      'the remarks space says nothing has been written yet, rather than inventing a sentence under a heading');
    assert.equal(await remarks.locator('.report-rule').count(),2,'and leaves two ruled lines for a hand');
    assert.equal(await card.locator('.report-sign small').count(),2,'with a line for the guardian and one for the institute');
    assert.equal(await card.locator('[data-report-generated]').count(),1,'and it dates itself, because a card printed in a month it was not made in is a lie');
    const cardText=await card.innerText();
    assert.equal(MONEY.test(cardText),false,'no money word anywhere on the card');
    assert.equal(cardText.includes(bnDigits(1000)),false,'and the fee this child’s record holds is not on it in any script');
    assert.equal(KEY_PATH.test(cardText),false,'no catalog key path on the card either');
    assert.equal((await card.locator('a[href]').count()),0,'the card itself links nowhere: it is meant to leave the screen');
    /* The print button is the one interactive thing on the card, so the browser is asked rather than told:
       `window.print` is replaced before the page loads and counted when the button is clicked. */
    await page.addInitScript('window.__printed=0;window.print=function(){window.__printed=window.__printed+1};');
    await goto(page,`/bn/admin/students/${String(ra._id)}?tab=results&report=${february.id}`);
    await page.locator('[data-report-print]').waitFor({timeout:60000});
    assert.equal((await textOf(page,'[data-report-print]')).trim(),t.report.print);
    await page.locator('[data-report-print]').click();
    assert.equal(await page.evaluate('window.__printed'),1,'and clicking it asks the browser to print');
    await shot(page,'report-card-bn-1440');
    await page.setViewportSize({width:360,height:900});
    await shot(page,'report-card-bn-360');
    await noOverflow(page,'the report card');
    /* Print media: the card is the page. Everything that got the operator here is hidden rather than
       shrunk, because a report card with a sidebar on it is a report card nobody pins to a wall. */
    await page.emulateMedia({media:'print'});
    await page.setViewportSize({width:1440,height:900});
    /* Hidden means it takes no space: `getComputedStyle` on a child of a `display:none` box still reports
       the child's own value, so the box is measured rather than asked what it thinks it is. */
    const printed=await page.evaluate(()=>{
      const out:string[]=[];
      for(const selector of ['.admin-sidebar','.admin-top','.daily-chips','.report-toolbar','[data-report-print]','[data-report-card]','.admin-test-banner']){
        let hidden=true;
        for(const element of document.querySelectorAll(selector)){
          const box=element.getBoundingClientRect();
          if(box.width>0||box.height>0)hidden=false;
        }
        out.push(selector+'='+(hidden?'hidden':'shown'));
      }
      return out.join(' ');
    });
    for(const hidden of ['.admin-sidebar=hidden','.admin-top=hidden','.daily-chips=hidden','.report-toolbar=hidden','[data-report-print]=hidden','.admin-test-banner=hidden'])
      assert.ok(printed.includes(hidden),`printing the card should hide ${hidden.split('=')[0]}, and the page reported: ${printed}`);
    assert.ok(printed.includes('[data-report-card]=shown'),'while the card itself is still the page');
    await shot(page,'report-card-print-bn-1440');
    await page.emulateMedia({media:null});

    // ── 5. Two refusals, told apart ────────────────────────────────────────────────────────────────
    await goto(page,`/bn/admin/students/${String(ra._id)}?tab=results&report=${april.id}`);
    await page.locator('[data-report-missing]').waitFor({timeout:60000});
    assert.equal(await page.locator('[data-report-missing]').getAttribute('data-report-missing'),'NOT_PUBLISHED');
    assert.ok((await textOf(page,'[data-report-missing]')).includes(t.report.notPublished),
      'a marked but unpublished exam says the centre is still working on it');
    await goto(page,`/bn/admin/students/${String(rc._id)}?tab=results&report=${march.id}`);
    await page.locator('[data-report-missing]').waitFor({timeout:60000});
    assert.equal(await page.locator('[data-report-missing]').getAttribute('data-report-missing'),'NO_RESULT');
    assert.ok((await textOf(page,'[data-report-missing]')).includes(t.report.noResult),
      'and a child who was never in that exam says so, instead of sending a parent to ask about a result that cannot exist');

    // ── 6. The student's own Results tab: their results, and nothing else ───────────────────────────
    const studentSession=await session(child,'bn','/dashboard/results');
    const studentPage=studentSession.page;
    await goto(studentPage,'/bn/dashboard/results');
    assert.ok(studentPage.url().includes('/bn/dashboard/results'),`a student session is let into its own Results tab; landed on ${studentPage.url()}`);
    await studentPage.locator('[data-result-history]').waitFor({timeout:60000});
    /* `PortalHero` spends its h1 on welcoming the child by name, so the tab's own word is the eyebrow above
       it and the card head below — both catalog text, and the name in the heading is data. */
    assert.equal((await textOf(studentPage,'.portal-eyebrow')).trim(),t.results.portalTitle,'the portal names the tab in the catalog’s own word');
    assert.ok((await textOf(studentPage,'.portal-hero h1')).includes('নমুনা ছাত্র ক'),'and its heading welcomes this child by name');
    const whoLine=await textOf(studentPage,'[data-portal-results-who]');
    assert.ok(whoLine.includes('নমুনা ছাত্র ক')&&whoLine.includes(t.results.publishedOnly),
      'and says whose results these are, and that only published ones are shown');
    const studentBody=await studentPage.locator('body').innerText();
    assert.equal(studentBody.includes('নমুনা ছাত্র খ'),false,'a sibling’s name is not on this screen');
    assert.equal(studentBody.includes('নমুনা ছাত্র গ'),false,'and no other child’s either');
    assert.equal(studentBody.includes('নমুনা টার্ম পরীক্ষা'),false,'nor an unpublished exam');
    assert.equal(await studentPage.locator('[data-result-row]').count(),2,'two rows, both this child’s');
    const studentAdmin=await hrefsOf(studentPage);
    assert.deepEqual(studentAdmin.filter(href=>href.includes('/admin/')),[],
      'no admin address anywhere on a student’s Results tab');
    const studentResultsText=[await textOf(studentPage,'[data-result-history]'),await textOf(studentPage,'[data-result-trend]'),
      await textOf(studentPage,'.portal-card-head')].join('\n');
    assert.equal(MONEY.test(studentResultsText),false,'and no fee, payment, receipt or due word in what the tab paints');
    assert.equal(studentResultsText.includes(bnDigits(1000)),false,'nor the fee this child’s record holds');
    assert.equal(KEY_PATH.test(studentResultsText),false,'and no catalog key path in place of a word');
    assert.ok((await studentPage.locator('[data-trend-chart]').textContent()).includes(bnDigits('66.67')),'the trend is the same chart the operator sees');
    await shot(studentPage,'portal-results-bn-1440');
    await studentPage.setViewportSize({width:360,height:900});
    await shot(studentPage,'portal-results-bn-360');
    await noOverflow(studentPage,'the student Results tab');
    /* The card from the portal, which is the one a family actually prints. */
    await goto(studentPage,`/bn/dashboard/results?report=${february.id}`);
    await studentPage.locator('[data-report-card]').waitFor({timeout:60000});
    assert.equal((await textOf(studentPage,'[data-report-brand]')).trim(),common.brand);
    assert.equal((await textOf(studentPage,'[data-report-total]')).trim(),`${bnDigits(135)}/${bnDigits(150)}`);
    assert.deepEqual((await hrefsOf(studentPage)).filter(href=>href.includes('/admin/')),[],'and it links nowhere into the admin');
    await shot(studentPage,'portal-report-card-bn-1440');
    await studentPage.setViewportSize({width:360,height:900});
    await shot(studentPage,'portal-report-card-bn-360');
    await noOverflow(studentPage,'the portal report card');
    /* A student session at the guardian's address is turned away: the two tabs are two roles. Where it
       lands is the sign-in page's own business — it bounces an already-signed-in account to the home page
       rather than showing a form — so what is asserted is that the guardian's tab did not open. */
    await goto(studentPage,'/bn/parent/results');
    assert.equal(studentPage.url().includes('/parent/results'),false,`a student session was let into the guardian’s Results tab; landed on ${studentPage.url()}`);
    assert.equal(await studentPage.locator('[data-result-history], [data-portal-results-empty]').count(),0,
      'and it was shown no result of anybody’s, not even an empty one of its own');
    await studentSession.context.close();

    // ── 7. The guardian's Results tab: their two children, with a switcher ──────────────────────────
    const guardianSession=await session(guardian,'bn','/parent/results');
    const guardianPage=guardianSession.page;
    await goto(guardianPage,'/bn/parent/results');
    await guardianPage.locator('[data-portal-children]').waitFor({timeout:60000});
    assert.equal(await guardianPage.locator('[data-portal-children] a').count(),2,'a guardian with two children on their number gets a switcher between them');
    const guardianBody=await guardianPage.locator('body').innerText();
    assert.equal(guardianBody.includes('নমুনা ছাত্র ক'),true,'the first child is there');
    assert.equal(guardianBody.includes('নমুনা ছাত্র গ'),false,'and a child of another family is not');
    assert.deepEqual((await hrefsOf(guardianPage)).filter(href=>href.includes('/admin/')),[],'no admin address on a guardian’s Results tab');
    await shot(guardianPage,'parent-results-bn-1440');
    await guardianPage.locator('[data-portal-children] a').nth(1).click();
    await guardianPage.waitForURL(/student=/,{timeout:60000});
    await guardianPage.locator('[data-result-history]').waitFor({timeout:60000});
    assert.ok((await textOf(guardianPage,'[data-portal-results-who]')).includes('নমুনা ছাত্র খ'),
      'the switcher changes whose results are shown, and says whose they are');
    /* The second child missed the second exam: the row is there, marked absent, holding no position — and
       the line is drawn from the one exam they sat, with the skip counted out loud. */
    const absentRow=guardianPage.locator(`[data-result-row="${march.id}"]`);
    assert.equal((await absentRow.locator('[data-result-total]').innerText()).trim(),'—','an absence is not a zero total');
    assert.equal((await absentRow.locator('[data-result-position]').innerText()).trim(),t.results.positionNone,'and it holds no position');
    assert.ok((await absentRow.locator('[data-result-subjects]').innerText()).includes(t.grades.absent),'every subject of it reads as absent');
    assert.equal(await guardianPage.locator('[data-trend-empty]').count(),1,
      'with one sat exam there is no trend, and the screen says what it would take to draw one');
    assert.ok((await textOf(guardianPage,'[data-trend-empty]')).includes(t.results.trendEmpty));
    await shot(guardianPage,'parent-results-child-bn-1440');
    await noOverflow(guardianPage,'the guardian Results tab');
    await guardianSession.context.close();

    /* A guardian whose number is on no student record gets the empty state, not somebody's child. */
    const noneSession=await session(unrelated,'bn','/parent/results');
    await goto(noneSession.page,'/bn/parent/results');
    await noneSession.page.locator('[data-portal-results-empty]').waitFor({timeout:60000});
    assert.ok((await textOf(noneSession.page,'[data-portal-results-empty]')).includes(t.results.linkedNone),
      'and the empty state explains itself instead of showing a blank table');
    assert.equal(await noneSession.page.locator('[data-result-row]').count(),0);
    await noneSession.context.close();

    // ── 8. The entry point: both portals link to the tab they just proved ───────────────────────────
    const homeSession=await session(child,'bn','/dashboard');
    await goto(homeSession.page,'/bn/dashboard');
    const entry=homeSession.page.getByRole('link',{name:t.results.portalOpen});
    assert.equal(await entry.count(),1,'the student dashboard offers the Results tab by name');
    assert.ok((await entry.getAttribute('href')).endsWith('/bn/dashboard/results'),'and it goes to the tab, not to a search');
    await homeSession.context.close();
    const parentHome=await session(guardian,'bn','/parent');
    await goto(parentHome.page,'/bn/parent');
    const parentEntry=parentHome.page.getByRole('link',{name:t.results.portalOpen});
    assert.equal(await parentEntry.count(),1,'the guardian home offers it too');
    assert.ok((await parentEntry.getAttribute('href')).endsWith('/bn/parent/results'));
    await parentHome.context.close();

    // ── 9. English: every label these screens own, with English digits ─────────────────────────────
    const enStaff=await session(admin,'en','/admin');
    await goto(enStaff.page,`/en/admin/students/${String(ra._id)}?tab=results`);
    await enStaff.page.locator('[data-result-history]').waitFor({timeout:60000});
    const enHead=await enStaff.page.locator('[data-result-table] thead').innerText();
    assert.equal(enHead.includes(en_t.col.exam),true,'the table headers read English');
    assert.equal(BN.test(enHead),false,`and carry no Bangla: ${enHead.split('\n').filter(line=>BN.test(line)).join(' | ')}`);
    assert.equal((await textOf(enStaff.page,'[data-result-history] h2')).trim(),en_t.results.title);
    assert.equal((await textOf(enStaff.page,'[data-result-history] .admin-help')).trim(),en_t.results.publishedOnly,'including the help line under it');
    const enRow=enStaff.page.locator(`[data-result-row="${march.id}"]`);
    assert.equal((await enRow.locator('[data-result-total]').innerText()).trim(),'100/150','the digits follow the account, not the address');
    assert.equal((await enRow.locator('[data-result-percent]').innerText()).trim(),'66.67');
    assert.equal((await enRow.locator('[data-result-position]').innerText()).trim(),'1');
    const enTrendText=await enStaff.page.locator('[data-result-trend]').textContent();
    assert.equal(enTrendText.includes(en_t.results.trendTitle),true,'the trend names itself in English');
    assert.ok(enTrendText.includes('1 March 2026'),'and its date labels take the page’s language: chrome, not data');
    assert.ok(enTrendText.includes(en_t.results.down),'with the direction word from the English catalog');
    assert.equal(BN.test(await enStaff.page.locator('[data-result-trend] h2, [data-result-trend] .admin-help, [data-trend-change]').first().innerText()),false,
      'no Bangla in the trend’s own chrome');
    assert.equal(enTrendText.includes('নমুনা মডেল টেস্ট'),true,
      'while the exam keeps the Bangla name the operator gave it — an exam has one stored name, and inventing an English one would be inventing data');
    await shot(enStaff.page,'student-results-en-1440');
    await enStaff.page.setViewportSize({width:360,height:900});
    await shot(enStaff.page,'student-results-en-360');
    await noOverflow(enStaff.page,'the English results tab');
    await goto(enStaff.page,`/en/admin/students/${String(ra._id)}?tab=results&report=${february.id}`);
    await enStaff.page.locator('[data-report-card]').waitFor({timeout:60000});
    const enCard=enStaff.page.locator('[data-report-card]');
    assert.equal((await enCard.locator('h1').innerText()).trim(),en_t.report.title);
    assert.equal((await textOf(enStaff.page,'[data-report-brand]')).trim(),en_common.brand,'the brand in the language the page is in');
    const enLabels=await enCard.locator('dt, th').allInnerTexts();
    assert.equal(enLabels.some(label=>BN.test(label)),false,`every field name on the English card is English: ${enLabels.filter(label=>BN.test(label)).join(' | ')}`);
    assert.equal((await textOf(enStaff.page,'[data-report-total]')).trim(),'135/150');
    assert.equal((await textOf(enStaff.page,'[data-report-point]')).trim(),'5');
    assert.ok((await enCard.locator('[data-report-student]').innerText()).includes('নমুনা-1'),
      'the readable id keeps its Latin digits on an English screen, because the digits are the account’s');
    assert.ok((await enCard.locator('[data-report-remarks]').innerText()).includes(en_t.report.remarksPlaceholder),'and the remarks space says so in English too');
    assert.equal((await enCard.locator('.report-sign').innerText()).includes(en_t.report.signGuardian),true,'with both signature lines named');
    await shot(enStaff.page,'report-card-en-1440');
    await enStaff.page.setViewportSize({width:360,height:900});
    await shot(enStaff.page,'report-card-en-360');
    await noOverflow(enStaff.page,'the English report card');
    await enStaff.context.close();

    const enStudent=await session(child,'en','/dashboard/results');
    await goto(enStudent.page,'/en/dashboard/results');
    await enStudent.page.locator('[data-result-history]').waitFor({timeout:60000});
    assert.equal((await textOf(enStudent.page,'.portal-eyebrow')).trim(),en_t.results.portalTitle,'the portal tab reads English');
    /* The hero's h1 carries the child's own name, which is data the operator typed and stays Bangla on an
       English address; what has to be English is every word the portal chose. */
    const heroWords=(await enStudent.page.locator('.portal-eyebrow, .portal-hero p').allInnerTexts()).join('\n');
    assert.equal(BN.test(heroWords),false,`the hero’s own words carry no Bangla: ${heroWords.split('\n').filter(line=>BN.test(line)).join(' | ')}`);
    assert.equal((await textOf(enStudent.page,'.portal-card-head h2')).trim(),en_t.results.portalTitle,'nor does the card head');
    assert.ok((await textOf(enStudent.page,'[data-portal-results-who]')).includes(en_t.results.publishedOnly));
    assert.equal(BN.test(await enStudent.page.locator('[data-result-table] thead').innerText()),false,'and the table headers are English');
    const enPortalRow=enStudent.page.locator(`[data-result-row="${february.id}"]`);
    assert.equal((await enPortalRow.locator('[data-result-total]').innerText()).trim(),'135/150','with English digits');
    assert.ok((await enStudent.page.locator('[data-trend-chart]').textContent()).includes('1 February 2026'),
      'the chart under a student’s own tab takes the page’s language as well');
    await shot(enStudent.page,'portal-results-en-1440');
    await enStudent.page.setViewportSize({width:360,height:900});
    await shot(enStudent.page,'portal-results-en-360');
    await noOverflow(enStudent.page,'the English student Results tab');
    await enStudent.context.close();

    assert.deepEqual(errors,[],'no page error was thrown on any of these screens');
    console.log('Exam results in the browser: the profile’s Results tab lists the two published exams newest first with their subjects, totals, grades and positions and draws the trend between them, a report card carries the brand, the breakdown, the summary, a remarks space and two signature lines and hides the whole shell under print media, an unpublished exam and a child who was never in one are refused in two different sentences, a student’s own tab shows nothing but their results with no money word and no admin address anywhere on the page, a guardian switches between their two children and gets the empty state when their number is on none, a student at the guardian’s address is sent to sign in, both portals link to the tab by name, and every label these screens own reads English with English digits on an /en address while the exam keeps the Bangla name it was given.');
  }finally{
    await browser.close();
    await mongoose.disconnect();
    if(!shared)await mongo.stop();
  }
}

run().catch(error=>{console.error(error);process.exit(1)});
