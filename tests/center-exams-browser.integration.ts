/**
 * R5 in the browser: exams and results — the grid a teacher types through, the sheet they upload, the
 * result the owner publishes, and the wall around what a teacher can see.
 *
 * The experimental write gate this suite used to assert is gone. R5 retired `CENTER_EXAM_WRITE_ENABLED`
 * and exam writes are a normal feature, so what is proven here is the flow the owner actually gets and the
 * authorization that replaced the flag: role plus the class groups a teacher is assigned to.
 *
 *  1. an exam manager creates an exam for TWO classes, two subjects typed in Bangla digits, the standard
 *     grading scale shown in the form before anything is written — and the create button is enabled
 *     because a person ticked the review box, not because an environment variable allows it;
 *  2. the grid is keyboard-first: Enter moves down a column, an arrow moves one cell, and a mark typed in
 *     Bangla digits is read as the number it says;
 *  3. total, grade, GPA point and position appear as the teacher types, and the rows save themselves —
 *     one batched request — with the database holding what the screen showed;
 *  4. a mark over the full mark is refused in the cell with a Bangla sentence and is never written;
 *  5. a block copied out of a spreadsheet pastes in from the cell the teacher is standing in;
 *  6. `A` is absence: the row toggle marks every subject absent, the result is stored as ABSENT rather
 *     than as zero marks, and the student is left out of the class average and out of the ranking;
 *  7. a CSV sheet is previewed — rows matched to students, an unmatched row and an incomplete row listed
 *     rather than guessed, a column that is not a subject left unread and named — and only the ready rows
 *     are committed;
 *  8. publishing is a question first: the prompt counts the messages its SMS box would send, unticked
 *     publishes and sends nothing, ticked publishes and sends one batch per class with the setting still
 *     off — then freezing the exam, ranking each class on its own and offering the way back;
 *  9. a teacher on no class sees no exam at all — an empty scope is an empty list, not everybody's;
 * 10. the owner assigns the teachers on the classes screen, which is the only place that list is written,
 *     and the assignment is what the teacher's scope reads on their next page load;
 * 11. the grading scale is the owner's screen: a saved scale appears in the list and in the exam form's
 *     picker, and an exam manager is shown no scale form at all;
 * 12. a teacher now sees only the class assigned to them, on a screen with no payment, due, receipt or
 *     cash word anywhere in it and no link into the admin, and the other class’s teacher sees only theirs;
 * 13. a content editor is shown no exam list, the English addresses paint no Bangla in their chrome, and
 *     nothing overflows horizontally at 360, 768 or 1440 px.
 *
 * Screens are photographed at 360 px and 1440 px into screenshots/r5/ in both languages.
 *
 * Runs against an already-started app and its disposable database (TEST_ORIGIN + TEST_MONGO_URI). Every
 * student, teacher and exam is synthetic and labelled নমুনা, and every string asserted is read out of
 * `src/messages/bn.json` — the same catalog the screens read, so a reworded button cannot make this suite
 * pass against a screen the owner would not recognise.
 */
// @ts-nocheck -- isolated browser test against the disposable database
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import type {Page,BrowserContext} from 'playwright';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {CenterStudent,CenterClassGroup,CenterExam,CenterExamResult,CenterGradingScale,CenterSmsBatch,CenterSettings} from '../src/models/CenterRecords';
import bn from '../src/messages/bn.json';
import en from '../src/messages/en.json';

const t=bn.exams;
const en_t=en.exams;
const SHOTS=path.join('screenshots','r5');
const BN=/[\u0980-\u09ff]/;

/** Read a dotted key out of a catalog the way next-intl does. */
const key=(table,dotted)=>dotted.split('.').reduce((node,part)=>node?.[part],table);
/** Fill an ICU-less catalog sentence: the exam strings substitute names and counts, nothing else. */
const fill=(template,params)=>Object.entries(params).reduce((text,[name,value])=>text.split(`{${name}}`).join(String(value)),template);
const bnDigits=value=>String(value).replace(/[0-9]/g,digit=>'০১২৩৪৫৬৭৮৯'[Number(digit)]);

/** Poll until a condition holds: an autosave is a debounce, and a debounce is a wait. */
async function until(what,check,timeoutMs=60000){
  const deadline=Date.now()+timeoutMs;
  for(;;){
    if(await check().catch(()=>false))return;
    if(Date.now()>deadline)throw new Error(`timed out waiting for ${what}`);
    await new Promise(resolve=>setTimeout(resolve,500));
  }
}

async function run(){
  await preflight({
    mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',
    originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,
    test:'tests/center-exams-browser.integration.ts — start the app first, then run it with TEST_ORIGIN and TEST_MONGO_URI (see docs/STALE-TESTS.md)',
  });
  const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3100';
  const shared=process.env.TEST_ORIGIN?process.env.TEST_MONGO_URI:null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){
    for(const collection of await mongoose.connection.db.listCollections().toArray()){
      await mongoose.connection.db.collection(collection.name).deleteMany({}).catch(()=>{});
    }
  }
  await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});
  /* The send engine defaults quiet hours to 21:00–07:00 Dhaka, so a publish that lands in CI's evening
     queues the result messages instead of sending them, and the send-count assertions read zero. A
     window whose start equals its end is an empty window by design: the suite owns that setting, and
     the counts it promises stay exactly as strict. */
  await CenterSettings.updateOne({key:'main'},{$set:{quietStart:'00:00',quietEnd:'00:00'}},{upsert:true});
  await mkdir(SHOTS,{recursive:true});

  const pass=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(pass,12);
  const account=(name,role,email)=>User.create({name,email,passwordHash:hash,role,active:true});
  const [manager,owner,editor,teacherA,teacherB]=await Promise.all([
    account('নমুনা পরীক্ষা পরিচালক','exam_manager','r5-manager@example.test'),
    account('নমুনা মালিক','admin','r5-owner@example.test'),
    account('নমুনা সম্পাদক','content_editor','r5-editor@example.test'),
    account('নমুনা শিক্ষক ক','teacher','r5-teacher-a@example.test'),
    account('নমুনা শিক্ষক খ','teacher','r5-teacher-b@example.test'),
  ]);
  const [classA,classB]=await Promise.all([
    CenterClassGroup.create({name:{bn:'নমুনা নবম ক',en:'Sample Nine A'},academicYear:2026,active:true}),
    CenterClassGroup.create({name:{bn:'নমুনা নবম খ',en:'Sample Nine B'},academicYear:2026,active:true}),
  ]);
  /* Named with the Bangla ordinal letters on purpose: the marks grid lists a class by `name.bn`, and
     ক খ গ ঘ ঙ sort in the order they were created, so a pasted block lands on the row the suite names. */
  const makeStudent=(studentId,name,classGroup)=>CenterStudent.create({
    studentId,name:{bn:name,en:name},classGroup,guardianName:'নমুনা অভিভাবক',
    guardianPhone:`017${randomBytes(4).toString('hex').slice(0,8).replace(/[^\d]/g,'0')}`,
    admissionDate:'2026-01-01',startMonth:{year:2026,month:1},feeHistory:[{effectiveFrom:{year:2026,month:1},amount:1000}],
  });
  const [s1,s2,s3,s4,s5]=await Promise.all([
    makeStudent('নমুনা-১','নমুনা ছাত্র ক',classA._id),
    makeStudent('নমুনা-২','নমুনা ছাত্র খ',classA._id),
    makeStudent('নমুনা-৩','নমুনা ছাত্র গ',classA._id),
    makeStudent('নমুনা-৪','নমুনা ছাত্র ঘ',classA._id),
    makeStudent('নমুনা-৫','নমুনা ছাত্র ঙ',classB._id),
  ]);

  const browser=await chromium.launch();
  const errors=[];
  const sheetsDir=path.join(os.tmpdir(),`r5-exam-${randomBytes(4).toString('hex')}`);
  await mkdir(sheetsDir,{recursive:true});
  try{
    {let ready=false;for(let index=0;index<60&&!ready;index++){try{ready=(await fetch(origin+'/api/auth/csrf')).ok}catch{/* not up yet */}if(!ready)await new Promise(resolve=>setTimeout(resolve,1000))}
     if(!ready)throw new Error('the app did not answer at '+origin)}

    async function session(email,userId,locale='bn'){
      const context=await browser.newContext({viewport:{width:1440,height:900}});
      const csrf=await (await context.request.get(origin+'/api/auth/csrf')).json();
      await context.request.post(origin+'/api/auth/callback/credentials',{
        timeout:180000,headers:{origin,'content-type':'application/x-www-form-urlencoded'},
        form:{csrfToken:csrf.csrfToken,identifier:email,password:pass,callbackUrl:`${origin}/${locale}/admin`},
      });
      // An English proof reads English all the way down, digits included: the digits are the operator's own.
      await context.addCookies([{name:`diction_digits_${userId}`,value:locale==='en'?'en':'bn',url:origin+'/'}]);
      const page=await context.newPage();
      page.on('pageerror',error=>errors.push(`${page.url()}: ${error.message}`));
      return {context,page};
    }
    const shot=(page,name)=>page.screenshot({path:path.join(SHOTS,`${name}.png`),fullPage:true});
    /* "This screen overflows" is only half a diagnosis: at 360px the answer is always a table or a
       control row, and which one is a CSS question that a screenshot cannot settle. So the check names the
       elements that actually escape the viewport — skipping anything inside a wrapper that scrolls, because
       a wide table inside `overflow-x:auto` is the design and not the defect. */
    const noOverflow=async(page,name)=>{
      for(const width of [360,768,1440]){
        await page.setViewportSize({width,height:900});
        /* No function-valued `const` inside an evaluated closure: tsx transpiles with esbuild's
           keepNames, which wraps a function assigned to a name in a `__name(...)` helper that does not
           exist in the browser — the house shape for `page.evaluate` here is one expression, and this
           stays loops and concatenation so the measurement is what runs, not a transpiler artefact. */
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
            let hooks='';
            for(const attribute of element.attributes)if(attribute.name.startsWith('data-')&&hooks.length<40)hooks+=(hooks?' ':'')+attribute.name;
            if(hooks)label+=' ['+hooks+']';
            wide.push(label+' right='+Math.round(box.right));
            if(wide.length>=6)break;
          }
          return {scroll:document.documentElement.scrollWidth,client,wide};
        });
        assert.ok(measured.scroll<=measured.client+1,
          `${name} overflows horizontally at ${width}px (${measured.scroll} > ${measured.client})`+(measured.wide.length?`\n  escaping the viewport: ${measured.wide.join(' | ')}`:''));
      }
      await page.setViewportSize({width:1440,height:900});
    };
    /** The grid labels a cell with the student and the subject, in the catalog's own words. */
    const cellLabel=(student,subject)=>fill(String(key(bn,'exams.grid.cellLabel')),{student,subject});
    const cellOf=(page,student,subject)=>page.locator(`[aria-label="${cellLabel(student,subject)}"]`).first();

    // ── 1. An exam manager creates an exam for two classes, in Bangla digits ────────────────────
    const managerSession=await session('r5-manager@example.test',String(manager._id));
    const page=managerSession.page;
    /* `?new=1` since R8 slice 2: the list keeps one primary action and the create form opens on
       demand, so a suite that means to fill the form has to ask for it. */
    await page.goto(origin+'/bn/admin/center-exams?new=1',{waitUntil:'domcontentloaded',timeout:180000});
    assert.ok(page.url().includes('center-exams'),'an exam manager was not let in; landed on '+page.url());
    await page.locator('h1').filter({hasText:t.list.title}).waitFor({timeout:60000});
    const form=page.locator('[data-exam-form="create"]');
    await form.waitFor({timeout:60000});
    await form.locator('[name=name]').fill('নমুনা মাসিক পরীক্ষা');
    await form.locator('[name=classId]').first().check();
    await form.locator('[name=classId]').nth(1).check();
    await form.getByLabel(String(key(bn,'common.dateParts.day')),{exact:true}).selectOption('2');
    await form.getByLabel(String(key(bn,'common.dateParts.month')),{exact:true}).selectOption('2');
    await form.getByLabel(String(key(bn,'common.dateParts.year')),{exact:true}).selectOption('2026');
    await form.locator('[name=type]').selectOption('monthly');
    await form.locator('[name=subject-0]').fill('বাংলা');
    await form.locator('[name=full-0]').fill(bnDigits(100));
    await form.locator('[name=pass-0]').fill(bnDigits(33));
    await form.getByRole('button',{name:t.form.addSubject}).click();
    await form.locator('[name=subject-1]').fill('গণিত');
    await form.locator('[name=full-1]').fill(bnDigits(50));
    await form.locator('[name=pass-1]').fill(bnDigits(20));
    await form.locator('[data-scale-preview]').waitFor();
    assert.equal(await form.locator('[data-scale-preview] tbody tr').count(),7,'the form shows the seven bands of the standard scale before anything is written');
    const createButton=form.locator('[data-exam-submit]');
    /* The button enables itself once the form has minted its request id and a class is ticked — that is the
       whole of the condition now. It used to also need CENTER_EXAM_WRITE_ENABLED, so waiting for it here is
       the proof that nothing outside the page decides whether an exam can be written. */
    await page.waitForFunction(()=>{const button=document.querySelector('[data-exam-form="create"] [data-exam-submit]');return !!button&&!(button as HTMLButtonElement).disabled},undefined,{timeout:60000});
    assert.equal(await createButton.isDisabled(),false,'the create button is enabled in normal mode: no environment gate decides it any more');
    await form.locator('[name=confirm]').check();
    await createButton.click();
    await form.locator('[data-exam-saved]').waitFor({timeout:90000});
    const exam=await CenterExam.findOne({'name.bn':'নমুনা মাসিক পরীক্ষা'}).lean();
    assert.ok(exam,'the exam was written');
    assert.equal(exam.status,'draft','a new exam is a draft');
    assert.equal(exam.classGroups.length,2,'and it covers both classes');
    assert.equal(exam.gradeBands.length,7,'the scale was snapshotted onto the exam');
    assert.equal(exam.gradeBands.find(band=>band.label==='A+').point,5,'with the GPA point each band carries');
    assert.equal(exam.subjects[0].fullMarks,100,'a full mark typed in Bangla digits was read as the number it says');
    const examId=String(exam._id);
    const subjectIds=exam.subjects.map(subject=>String(subject._id));
    await shot(page,'exams-list-bn-1440');
    await page.setViewportSize({width:360,height:900});
    await shot(page,'exams-list-bn-360');
    await noOverflow(page,'the exam list');

    // ── 2–4. The grid: keyboard first, live totals, a refusal that is never written ─────────────
    await page.goto(`${origin}/bn/admin/center-exams/${examId}`,{waitUntil:'domcontentloaded',timeout:180000});
    const grid=page.locator('[data-exam-grid]');
    await grid.waitFor({timeout:60000});
    assert.equal(await grid.getAttribute('data-editable'),'yes','a draft exam takes marks');
    assert.equal(await page.locator('[data-row]').count(),5,'both classes are on one grid for the owner');
    await cellOf(page,'নমুনা ছাত্র ক','বাংলা').click();
    await page.keyboard.type(bnDigits(90));
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),cellLabel('নমুনা ছাত্র খ','বাংলা'),'Enter moved down the same column');
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),cellLabel('নমুনা ছাত্র ক','বাংলা'),'ArrowUp came back up it');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),cellLabel('নমুনা ছাত্র ক','গণিত'),'ArrowRight moved across to the next subject');
    await page.keyboard.type(bnDigits(45));
    const rowOne=page.locator(`[data-row="${String(s1._id)}"]`);
    await rowOne.locator('[data-cell-total]').filter({hasText:bnDigits(135)}).waitFor({timeout:30000});
    assert.equal(await rowOne.locator('[data-cell-grade]').innerText(),'A+','90 + 45 of 150 is 90%, an A+ on the standard scale');
    assert.equal(await rowOne.locator('[data-cell-point]').innerText(),bnDigits(5),'A+ is worth 5');
    assert.equal(await rowOne.locator('[data-cell-position]').innerText(),bnDigits(1),'and the first position, worked out while the teacher types');

    await cellOf(page,'নমুনা ছাত্র খ','বাংলা').fill(bnDigits(101));
    await grid.locator('[data-grid-errors]').waitFor({timeout:30000});
    const refusal=await grid.locator('[data-grid-errors]').innerText();
    assert.ok(refusal.includes(fill(String(key(bn,'exams.grid.errors.outOfRange')),{student:'নমুনা ছাত্র খ',subject:'বাংলা',full:bnDigits(100)})),
      `the refusal names the full mark it broke; got: ${refusal}`);
    assert.equal(await CenterExamResult.countDocuments({student:s2._id}),0,'and a refused mark is never written');

    // ── 5. A block out of a spreadsheet lands where the teacher is standing ─────────────────────
    await cellOf(page,'নমুনা ছাত্র খ','বাংলা').click();
    await page.evaluate(([label,text])=>{
      const target=document.querySelector(`[aria-label="${label}"]`);
      target.focus();
      const transfer=new DataTransfer();
      transfer.setData('text/plain',text);
      transfer.setData('text',text);
      target.dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));
    },[cellLabel('নমুনা ছাত্র খ','বাংলা'),'70\t30\n60\t25']);
    assert.equal(await cellOf(page,'নমুনা ছাত্র খ','বাংলা').inputValue(),'70','the pasted block began at the focused cell');
    assert.equal(await cellOf(page,'নমুনা ছাত্র খ','গণিত').inputValue(),'30','ran across its row');
    assert.equal(await cellOf(page,'নমুনা ছাত্র গ','বাংলা').inputValue(),'60','and down into the next');
    assert.ok(/ঘর বসানো হয়েছে/.test(await page.locator('[data-grid-status]').innerText()),'and the grid says what the paste did');

    // ── 6. Absence for a whole row ──────────────────────────────────────────────────────────────
    await page.locator(`[data-absent-row="${String(s4._id)}"]`).click();
    const absentRow=page.locator(`[data-row="${String(s4._id)}"]`);
    await absentRow.locator('[data-absent="true"]').first().waitFor({timeout:30000});
    assert.equal(await absentRow.locator('[data-absent="true"]').count(),2,'every subject of the row is absent');
    assert.equal(await absentRow.locator('[data-cell-grade]').innerText(),t.grades.absent,'the row reads as absent, not as zero');
    assert.equal(await absentRow.locator('[data-cell-position]').innerText(),'—','and an absent student holds no position');

    // ── 3 (continued). The autosave is a debounce, so wait for the database rather than click ───
    await until('four results in the database',async()=>(await CenterExamResult.countDocuments({exam:examId}))===4);
    await until('the grid to say it saved',async()=>/সংরক্ষিত/.test(await page.locator('[data-grid-status]').innerText()));
    const stored=await CenterExamResult.find({exam:examId}).lean();
    const storedOf=studentId=>stored.find(row=>String(row.student)===String(studentId));
    assert.equal(storedOf(s1._id).total,135,'the stored total is the total the screen showed');
    assert.equal(storedOf(s1._id).grade,'A+');
    assert.equal(storedOf(s1._id).point,5,'and so is the GPA point');
    assert.equal(storedOf(s2._id).total,100,'the pasted row was stored as one batch with the typed one');
    assert.equal(storedOf(s3._id).total,85);
    assert.equal(storedOf(s4._id).grade,'ABSENT','absence was stored as absence');
    assert.equal(storedOf(s4._id).marks.every(mark=>mark.absent&&mark.obtained===null),true,'with no mark hiding inside it');
    /* The summary is read cell by cell rather than as one blob of text: "৩" appears in a dozen numbers on
       this screen, and a loose read would happily pass against the wrong one. */
    const summaryOf=async what=>(await page.locator(`[data-summary-${what}]`).innerText()).trim();
    assert.equal(await summaryOf('students'),bnDigits(5),'five students are on the grid');
    assert.equal(await summaryOf('counted'),bnDigits(3),'three of them have a whole row of marks');
    assert.equal(await summaryOf('absent'),bnDigits(1),'one is absent');
    assert.equal(await summaryOf('passed'),bnDigits(3),'all three cleared every subject’s pass mark, and the unmarked row counts as neither passed nor absent');
    assert.equal(await summaryOf('passrate'),`${bnDigits(100)}%`,'so the pass rate is a hundred');
    assert.equal(await summaryOf('highest'),bnDigits(135),'the highest total is the row typed by hand');
    assert.equal(await summaryOf('lowest'),bnDigits(85),'and the lowest is a pasted row');
    assert.equal(await summaryOf('average'),bnDigits(106.7),'the average is over those who sat, not over the absent student');

    // ── 7. A CSV sheet, previewed then committed ────────────────────────────────────────────────
    const csvPath=path.join(sheetsDir,'namuna-marks.csv');
    await writeFile(csvPath,[
      'Student ID,বাংলা,গণিত,মন্তব্য',
      'নমুনা-৫,৮০,৪০,ভালো',
      'নমুনা-১,99,49,',
      'নমুনা-নেই,70,30,',
      'নমুনা-২,A,,',
    ].join('\n'),'utf8');
    const importPanel=page.locator('[data-marks-import]');
    await importPanel.locator('[data-import-file]').setInputFiles(csvPath);
    await importPanel.locator('[data-import-preview]').click();
    await importPanel.locator('[data-import-table]').waitFor({timeout:90000});
    assert.ok((await importPanel.locator('[data-import-counts]').innerText()).includes(bnDigits(4)),'the preview counts the four rows of the sheet');
    assert.ok((await importPanel.locator('[data-import-unused]').innerText()).includes('মন্তব্য'),'a column that is not a subject of this exam is left unread, and named');
    const statusOf=row=>importPanel.locator(`[data-import-row="${row}"]`).getAttribute('data-import-status');
    assert.equal(await statusOf(2),'ready','the other class’s student matched by their id');
    assert.equal(await statusOf(3),'ready','and a row of ASCII digits is read too');
    assert.equal(await statusOf(4),'unmatched','a student who is not in this exam is listed, not written');
    assert.equal(await statusOf(5),'incomplete','and a row with a hole in it is not committed');
    await shot(page,'exam-marks-import-bn-1440');
    await importPanel.locator('[data-import-confirm]').click();
    await importPanel.locator('[data-import-outcome]').waitFor({timeout:90000});
    await until('the uploaded rows are stored',async()=>(await CenterExamResult.countDocuments({exam:examId}))===5);
    const uploaded=await CenterExamResult.findOne({exam:examId,student:s5._id}).lean();
    assert.equal(uploaded.total,120,'the uploaded marks were stored');
    assert.equal(String(uploaded.classGroup),String(classB._id),'and their result knows which class it belongs to');
    assert.equal((await CenterExamResult.findOne({exam:examId,student:s1._id}).lean()).total,148,'the sheet overwrote the typed marks of the student it named');
    assert.equal((await CenterExamResult.findOne({exam:examId,student:s2._id}).lean()).total,100,'and left the incomplete row alone');

    // ── 8. Publishing freezes the exam and ranks each class on its own ──────────────────────────
    await page.reload({waitUntil:'domcontentloaded',timeout:180000});
    await page.locator('[data-exam-grid]').waitFor({timeout:60000});
    await shot(page,'exam-marks-grid-bn-1440');
    await page.setViewportSize({width:360,height:900});
    await shot(page,'exam-marks-grid-bn-360');
    await page.setViewportSize({width:1440,height:900});
    await noOverflow(page,'the marks grid');
    const publish=page.locator('[data-exam-publish="publish"]');
    /* R5 slice 2 turned publishing into a question rather than a button: a dialog holding the review box,
       the result-SMS box and the count of what ticking that box would send. The count is compared with the
       rows the database can actually quote, because a prompt that says four and a send that writes two has
       told the operator a lie with their own software. */
    await publish.locator('[data-publish-open]').click();
    const dialog=page.locator('[data-publish-dialog]');
    await dialog.waitFor({state:'visible',timeout:60000});
    assert.equal((await dialog.locator('h2').innerText()).trim(),t.publish.dialogTitle,'the question is asked before anything is frozen');
    assert.equal(await dialog.locator('[data-publish-sms]').isChecked(),false,
      'the SMS box starts unticked: the automatic-result setting ships off, and the setting is only the box’s starting state — the decision belongs to the person holding the mouse');
    const quotable=await CenterExamResult.countDocuments({exam:examId,grade:{$ne:'ABSENT'}});
    assert.equal(quotable,4,'four of the five rows can be quoted; the absent student has no result to send');
    assert.ok((await dialog.locator('[data-publish-count]').innerText()).includes(bnDigits(quotable)),
      `the prompt counts the messages ticking the box would send, and it counted ${bnDigits(quotable)}`);
    await shot(page,'exam-publish-prompt-bn-1440');
    await page.setViewportSize({width:360,height:900});
    await shot(page,'exam-publish-prompt-bn-360');
    await noOverflow(page,'the publish prompt');
    await page.setViewportSize({width:1440,height:900});
    /* Unticked: publish, and send nothing. */
    await dialog.locator('[data-publish-confirm]').check();
    await dialog.locator('[data-publish-submit]').click();
    await page.locator('[data-exam-publish="unpublish"]').waitFor({timeout:90000});
    assert.equal((await page.locator('[data-publish-status]').innerText()).trim(),t.publish.smsSkipped,
      'and the screen says the messages did not go out, rather than leaving the operator to wonder');
    assert.equal(await CenterSmsBatch.countDocuments({purpose:'exam_result'}),0,'because nothing was sent');
    assert.equal((await CenterExam.findById(examId).lean()).status,'published','the exam is published');
    assert.equal(await page.locator('[data-exam-grid]').getAttribute('data-editable'),'no','and a published exam takes no more marks');
    const ranked=await CenterExamResult.find({exam:examId}).lean();
    const positionOf=studentId=>ranked.find(row=>String(row.student)===String(studentId))?.position;
    assert.equal(positionOf(s1._id),1,'148 is first in Nine A');
    assert.equal(positionOf(s2._id),2,'100 is second');
    assert.equal(positionOf(s3._id),3,'and 85 third');
    assert.equal(positionOf(s4._id),undefined,'the absent student holds no position at all — not a last one');
    assert.equal(positionOf(s5._id),1,'and the only student of Nine B is first in Nine B, not fourth in the exam');
    const serverOf=async what=>(await page.locator(`[data-server-${what}]`).innerText()).trim();
    assert.equal(await serverOf('students'),bnDigits(5),'the stored summary counts every student of the exam');
    assert.equal(await serverOf('counted'),bnDigits(4),'four have a result');
    assert.equal(await serverOf('absent'),bnDigits(1),'one of them is an absence, and it is not a zero');
    assert.equal(await serverOf('highest'),bnDigits(148),'the sheet that overwrote the typed row is the highest total now');
    assert.equal(await serverOf('lowest'),bnDigits(85));
    await shot(page,'exam-published-bn-1440');

    const unpublish=page.locator('[data-exam-publish="unpublish"]');
    await unpublish.locator('[name=confirm]').check();
    await unpublish.getByRole('button',{name:t.publish.unpublishButton}).click();
    await page.locator('[data-exam-publish="publish"]').waitFor({timeout:90000});
    assert.equal((await CenterExam.findById(examId).lean()).status,'draft','unpublishing is the only way back into a result, and it works');

    /* Ticked: publish AND send, with the setting still off — the operator consented to this exam's messages
       in the prompt, which is a stronger authority than a toggle somebody left on months ago. Then unpublish
       again, so the rest of the suite reads the same draft it always has. */
    await page.locator('[data-publish-open]').click();
    await dialog.waitFor({state:'visible',timeout:60000});
    await dialog.locator('[data-publish-sms]').check();
    await dialog.locator('[data-publish-confirm]').check();
    await dialog.locator('[data-publish-submit]').click();
    await page.locator('[data-exam-publish="unpublish"]').waitFor({timeout:90000});
    assert.equal((await page.locator('[data-publish-status]').innerText()).trim(),t.publish.smsSent,'the screen says the messages went out');
    const batches=await CenterSmsBatch.find({purpose:'exam_result',trigger:'auto_result'}).lean();
    assert.equal(batches.length,2,'one batch per class, because a result message quotes a class’s own students and their own positions');
    assert.equal(batches.reduce((total,batch)=>total+(batch.sentCount||0),0),quotable,`and the send wrote the ${quotable} messages the prompt had promised`);
    await page.locator('[data-exam-publish="unpublish"]').locator('[name=confirm]').check();
    await page.locator('[data-exam-publish="unpublish"]').getByRole('button',{name:t.publish.unpublishButton}).click();
    await page.locator('[data-exam-publish="publish"]').waitFor({timeout:90000});
    assert.equal((await CenterExam.findById(examId).lean()).status,'draft','the exam is a draft again for the screens that follow');

    // ── 9. A teacher on no class sees nothing at all ────────────────────────────────────────────
    /* The classes exist and the exam exists, and no teacher is assigned to either. An empty scope has to
       read as an empty list — the refusal that matters most here is the one that looks like a blank page. */
    const emptySession=await session('r5-teacher-a@example.test',String(teacherA._id));
    const emptyPage=emptySession.page;
    await emptyPage.goto(origin+'/bn/teacher/exams',{waitUntil:'domcontentloaded',timeout:180000});
    await emptyPage.locator('[data-teacher-scope]').waitFor({timeout:60000});
    assert.equal(await emptyPage.locator('[data-teacher-exam-row]').count(),0,'a teacher assigned to no class sees no exam');
    assert.equal(await emptyPage.locator('[data-teacher-empty]').count(),1,'and the screen says so instead of showing an empty table');
    assert.ok((await emptyPage.locator('[data-teacher-scope]').innerText()).includes('০টি'),'the scope note counts zero classes');
    await shot(emptyPage,'teacher-exams-empty-bn-1440');
    await emptySession.context.close();

    // ── 10–11. The owner assigns the teachers, then sets the scale ──────────────────────────────
    const ownerSession=await session('r5-owner@example.test',String(owner._id));
    const ownerPage=ownerSession.page;
    await ownerPage.goto(origin+'/bn/admin/grading-scale',{waitUntil:'domcontentloaded',timeout:180000});
    await ownerPage.locator('h1').filter({hasText:t.scale.title}).waitFor({timeout:60000});
    assert.equal(await ownerPage.locator('[data-scale-default] tbody tr').count(),7,'the standard scale is shown as the starting point');
    const scaleForm=ownerPage.locator('[data-scale-form]');
    await scaleForm.locator('[name=name]').fill('নমুনা কঠোর স্কেল');
    await scaleForm.locator('[data-scale-save]').click();
    await scaleForm.locator('[data-scale-saved]').waitFor({timeout:90000});
    assert.equal(await CenterGradingScale.countDocuments({name:'নমুনা কঠোর স্কেল'}),1,'the scale was saved');
    await ownerPage.goto(origin+'/bn/admin/center-exams?new=1',{waitUntil:'domcontentloaded',timeout:180000});
    const picker=ownerPage.locator('[data-exam-form="create"] [data-exam-scale]');
    await picker.waitFor({timeout:60000});
    assert.ok((await picker.locator('option').allInnerTexts()).some(option=>option.includes('নমুনা কঠোর স্কেল')),'and the exam form offers the saved scale');
    await shot(ownerPage,'grading-scale-bn-1440');
    await noOverflow(ownerPage,'the grading scale screen');

    /* The assignment is the whole of a teacher's scope, and this screen is the only place it is written, so
       it is driven here rather than seeded: tick one teacher on one class, save, and read the class back. */
    await ownerPage.goto(origin+'/bn/admin/students/classes',{waitUntil:'domcontentloaded',timeout:180000});
    const classEdit=ownerPage.locator(`[data-class-edit="${String(classA._id)}"]`);
    // The editor is a <details>: its summary is the way in, and a closed one hides every tick box.
    await ownerPage.locator(`[data-class-summary="${String(classA._id)}"]`).click();
    await classEdit.locator(`[data-teacher-option="${String(teacherA._id)}"]`).waitFor({state:'visible',timeout:60000});
    const options=await ownerPage.locator('[data-class-teachers] [data-teacher-check]').evaluateAll(nodes=>nodes.map(node=>node.value));
    assert.ok(options.includes(String(teacherA._id)),'every live teacher account is offered');
    assert.ok(!options.includes(String(owner._id))&&!options.includes(String(manager._id)),'and no account of another role is — an assignment is an authorization, not a name on a list');
    await classEdit.locator(`[data-teacher-check="${String(teacherA._id)}"]`).check();
    await classEdit.locator('button').first().click();
    await classEdit.locator('[data-class-saved="yes"]').waitFor({timeout:90000});
    await until('the class to hold its teacher',async()=>{
      const group=await CenterClassGroup.findById(classA._id).lean();
      return (group?.teachers||[]).map(String).includes(String(teacherA._id));
    });
    const secondEdit=ownerPage.locator(`[data-class-edit="${String(classB._id)}"]`);
    await ownerPage.locator(`[data-class-summary="${String(classB._id)}"]`).click();
    await secondEdit.locator(`[data-teacher-check="${String(teacherB._id)}"]`).waitFor({state:'visible',timeout:60000});
    await secondEdit.locator(`[data-teacher-check="${String(teacherB._id)}"]`).check();
    await secondEdit.locator('button').first().click();
    await secondEdit.locator('[data-class-saved="yes"]').waitFor({timeout:90000});
    await until('the second class to hold its teacher',async()=>{
      const group=await CenterClassGroup.findById(classB._id).lean();
      return (group?.teachers||[]).map(String).includes(String(teacherB._id));
    });
    await ownerPage.reload({waitUntil:'domcontentloaded',timeout:180000});
    assert.ok((await ownerPage.locator(`[data-class-summary="${String(classA._id)}"]`).innerText()).includes('নমুনা শিক্ষক ক'),
      'and the row names who takes the class, so the owner reads the assignment without opening anything');
    await shot(ownerPage,'classes-teachers-bn-1440');
    await noOverflow(ownerPage,'the classes screen');
    /* An English proof reads English all the way down, digits included: the digits are the operator's own
       per-account cookie, not a property of the address they typed, so the English sweep sets it the same way
       the language sweep does. */
    await ownerSession.context.addCookies([{name:`diction_digits_${String(owner._id)}`,value:'en',url:origin+'/'}]);
    await ownerPage.goto(origin+'/en/admin/grading-scale',{waitUntil:'domcontentloaded',timeout:180000});
    await ownerPage.locator('h1').filter({hasText:en_t.scale.title}).waitFor({timeout:60000});
    const scaleChrome=await ownerPage.locator('.admin-panel-head,.admin-heading,.admin-table thead').allInnerTexts();
    assert.deepEqual(scaleChrome.filter(text=>BN.test(text)),[],'the English scale screen paints no Bangla in its chrome');
    await shot(ownerPage,'grading-scale-en-1440');
    await ownerSession.context.close();

    // An exam manager runs exams but does not decide what a grade is worth centre-wide.
    await page.goto(origin+'/bn/admin/grading-scale',{waitUntil:'domcontentloaded',timeout:180000});
    assert.equal(await page.locator('[data-scale-form]').count(),0,'an exam manager is shown no scale form');

    // ── 12. A teacher sees their class, and no money at all ─────────────────────────────────────
    const teacherSession=await session('r5-teacher-a@example.test',String(teacherA._id));
    const teacherPage=teacherSession.page;
    /* Reached the way a teacher actually reaches it: from the portal home they already use, not from an
       address somebody had to tell them. The entry is on the home screen and says what it does not show. */
    await teacherPage.goto(origin+'/bn/teacher',{waitUntil:'domcontentloaded',timeout:180000});
    const entry=teacherPage.locator('[data-teacher-exams-entry]');
    await entry.waitFor({timeout:60000});
    await entry.locator('a').click();
    await teacherPage.waitForURL('**/teacher/exams',{timeout:60000});
    assert.ok(teacherPage.url().includes('teacher/exams'),'the portal entry did not reach the exam list; landed on '+teacherPage.url());
    await teacherPage.locator('[data-teacher-exams]').waitFor({timeout:60000});
    assert.equal(await teacherPage.locator('[data-teacher-exam-row]').count(),1,'one exam reaches the class they take');
    assert.ok((await teacherPage.locator('[data-teacher-scope]').innerText()).includes(bnDigits(1)),'and the screen says how many classes are theirs');
    await shot(teacherPage,'teacher-exams-bn-1440');
    await teacherPage.setViewportSize({width:360,height:900});
    await shot(teacherPage,'teacher-exams-bn-360');
    await teacherPage.setViewportSize({width:1440,height:900});
    await noOverflow(teacherPage,'the teacher exam list');
    await teacherPage.locator('[data-teacher-open]').first().click();
    await teacherPage.locator('[data-exam-grid]').waitFor({timeout:60000});
    assert.equal(await teacherPage.locator('[data-row]').count(),4,'only their own class is on the grid');
    assert.equal(await teacherPage.locator(`[data-row="${String(s5._id)}"]`).count(),0,'the other class’s student is not there at all');
    /* What the teacher READS, not every byte the tab has collected: this screen was reached by clicking,
       and a client-side navigation leaves the flight chunks of the page before it in the document, so
       `page.content()` here would also be searched for the exam list's own sentences. The data behind the
       screen is scanned where it is built — `tests/exam-flow.integration.ts` walks the teacher's view for
       any payment field — and the links out of it are checked just below, against this screen's DOM. */
    const teacherText=await teacherPage.locator('body').innerText();
    /* A client component whose namespace no provider ships does not fail loudly — next-intl hands back the
       key path and the screen reads `exams.grid.save` where a sentence belongs. This page is outside the
       admin tree, so nothing above it ships `exams`, and a scan for catalog paths is the cheapest way to
       know the grid a teacher is given is the grid that was written. */
    assert.equal(/\b(?:exams|admin|nav|common)\.[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+/.test(teacherText),false,
      "the teacher's grid reads sentences, not the catalog's key paths");
    for(const word of ['বেতন','বকেয়া','রশিদ','ক্যাশ','ফি লেজার','টাকা জমা']){
      assert.ok(!teacherText.includes(word),`a teacher's exam screen never says ${word}`);
    }
    for(const href of ['/admin/students/collect','/admin/students/fees-grid','/admin/students/dues','/admin/center-exams','/admin/sms']){
      assert.equal(await teacherPage.locator(`a[href*="${href}"]`).count(),0,`a teacher's exam screen has no link into ${href}`);
    }
    assert.equal(await teacherPage.locator('[data-exam-grid]').getAttribute('data-editable'),'yes','and a draft exam is theirs to mark');
    await cellOf(teacherPage,'নমুনা ছাত্র ক','গণিত').fill(bnDigits(48));
    await until('the teacher’s mark is stored',async()=>{
      const row=await CenterExamResult.findOne({exam:examId,student:s1._id}).lean();
      return row?.marks.find(mark=>String(mark.subject)===subjectIds[1])?.obtained===48;
    });
    await shot(teacherPage,'teacher-marks-grid-bn-1440');
    await teacherPage.setViewportSize({width:360,height:900});
    await shot(teacherPage,'teacher-marks-grid-bn-360');
    await teacherPage.setViewportSize({width:1440,height:900});
    await noOverflow(teacherPage,'the teacher marks grid');
    await teacherSession.context.close();

    // A teacher of the other class sees the same exam as their own class, and nothing of the first one.
    const otherSession=await session('r5-teacher-b@example.test',String(teacherB._id));
    await otherSession.page.goto(`${origin}/bn/teacher/exams/${examId}`,{waitUntil:'domcontentloaded',timeout:180000});
    await otherSession.page.locator('[data-exam-grid]').waitFor({timeout:60000});
    assert.equal(await otherSession.page.locator('[data-row]').count(),1,'one student: their own class');
    assert.equal(await otherSession.page.locator(`[data-row="${String(s1._id)}"]`).count(),0,'and not a single student of the class they do not take');
    await shot(otherSession.page,'teacher-other-class-bn-1440');
    await otherSession.context.close();

    // ── 13. English chrome, a redirected editor, and the overflow rule ──────────────────────────
    const english=await session('r5-manager@example.test',String(manager._id),'en');
    await english.page.goto(origin+'/en/admin/center-exams?new=1',{waitUntil:'domcontentloaded',timeout:180000});
    await english.page.locator('h1').filter({hasText:en_t.list.title}).waitFor({timeout:60000});
    /* The filter form is read one select at a time rather than as a box: its third select lists the
       centre's classes, and a class named in Bangla is data the owner typed, not interface chrome.
       The account box in the top bar is the same case one level up — it holds the signed-in person's
       own name, and this fixture is named in Bangla on purpose because the Bangla steps read that name
       off the screen. So the chrome is swept line by line with that one box subtracted, rather than the
       fixture being renamed to suit the assertion; a Bangla line anywhere else in the chrome still
       fails, which is the whole point of the sweep. */
    const accountLines=(await english.page.locator('.admin-user-menu summary').innerText()).split('\n').map(line=>line.trim());
    const chromeBangla=(await english.page.locator('.admin-top,.admin-nav,.admin-panel-head,.admin-heading,.admin-table thead').allInnerTexts())
      .flatMap(text=>text.split('\n')).map(line=>line.trim()).filter(line=>BN.test(line)&&!accountLines.includes(line));
    assert.deepEqual(chromeBangla,[],'the English exam list paints no Bangla in its chrome');
    assert.equal((await english.page.locator('[data-exam-filters] [name=type] option').allInnerTexts())[1],en_t.typeLabels.monthly,'and the type filter reads as English');
    assert.equal(await english.page.locator('[data-exam-status="draft"]').first().innerText(),en_t.status.draft,'and a status reads as English');
    await shot(english.page,'exams-list-en-1440');
    await english.page.setViewportSize({width:360,height:900});
    await shot(english.page,'exams-list-en-360');
    await english.page.setViewportSize({width:1440,height:900});
    await english.page.goto(`${origin}/en/admin/center-exams/${examId}`,{waitUntil:'domcontentloaded',timeout:180000});
    await english.page.locator('[data-exam-grid]').waitFor({timeout:60000});
    /* The grid's own header row is left out on purpose: it names the exam's subjects, which are data the
       owner typed in Bangla, not interface chrome — the same line the language sweep draws. */
    assert.deepEqual((await english.page.locator('.admin-panel-head,[data-exam-summary] dt,[data-grid-status],[data-exam-grid] tfoot').allInnerTexts()).filter(text=>BN.test(text)),[],
      'the English exam detail paints no Bangla in its chrome either — its heading is left out because it carries the exam’s own Bangla name');
    await shot(english.page,'exam-marks-grid-en-1440');
    await noOverflow(english.page,'the English exam detail');
    await english.context.close();

    const editorSession=await session('r5-editor@example.test',String(editor._id));
    await editorSession.page.goto(origin+'/bn/admin/center-exams',{waitUntil:'domcontentloaded',timeout:180000});
    assert.equal(await editorSession.page.locator('[data-exam-form="create"],[data-exam-row]').count(),0,'a content editor is shown no exam list and no create form');
    assert.equal(await editorSession.page.locator('h1').filter({hasText:t.list.title}).count(),0,'and no exam heading');
    await editorSession.context.close();

    assert.deepEqual(errors,[],'no page error was thrown on any screen driven here');
    console.log('Exams in the browser, photographed at 360 px and 1440 px into screenshots/r5: an exam manager created a two-class exam in Bangla digits with the create button enabled — the write gate is retired — typed and arrowed through the grid, watched 135 of 150 become an A+ worth 5 in position ১, saw ১০১ refused in the cell and never written, pasted a spreadsheet block from the focused cell, marked a row absent and watched it hold no position, let four rows autosave in one batch, previewed a CSV (2 ready, 1 unmatched, 1 incomplete, an unread column named) and committed it, published so Nine A ranked 1–4 with the absent student out and Nine B ranked first on its own, unpublished again; a teacher on no class saw no exam at all until the owner ticked them on the classes screen — the only place that list is written — and the row then named who takes the class; the owner saved a grading scale the exam form then offered while the exam manager was shown no scale form; that teacher then saw only their 4 students with no payment word and no admin link anywhere, and the other class’s teacher saw only their 1; the English addresses paint no Bangla, a content editor is shown no list, and nothing overflows at 360, 768 or 1440.');
  }finally{
    await browser.close();
    await rm(sheetsDir,{recursive:true,force:true}).catch(()=>{});
    await mongoose.disconnect();
    await mongo.stop();
  }
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
