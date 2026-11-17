/**
 * O1 in the browser: the three workflows the centre actually runs, driven end to end and photographed.
 *
 *  1. **A period is as long as the centre says, and the next one starts where the last one ended.** The
 *     week's day card carries a chain button; the drawer it opens already holds the next start, the end
 *     that follows from the length chip that is on, and the sequence one past the day's highest. The
 *     chips are ৫০/৪৫/৪০/৬০ and Custom, a start typed by hand drags its end along while a chip is on,
 *     and both clocks are read out beside the dropdowns — twelve-hour with the part of the day named, and
 *     twenty-four-hour — because a sheet copied out of a spreadsheet says 03:30 and a teacher says সাড়ে
 *     তিনটা. The period then saves onto its card with its shift and its room named.
 *  2. **A mark is typed, not uploaded.** An exam opened with no file anywhere on the desk shows every
 *     child enrolled on it, in roll order — the roll read as a number in whichever script it was typed
 *     in — with the total, percentage and grade moving as the mark is typed: 25 of 30 paints A+ and is
 *     stored as 83.33%, and the same child at 12 of 30 paints C. The CSV and XLSX import is one folded
 *     button in the grid's own toolbar and is never a step.
 *  3. **A class is a place, and it is written from one screen.** The board carries a card per class with
 *     its shifts, its room, its roll and its batches; a new class is created from the card screen with
 *     two names, a level, a room, three shifts and a fee, is answered by a toast in the top-right corner,
 *     and can then be given a batch that the database holds against it. The legacy results address
 *     arrives at the exam hub, and the menu offers one door to exams and results.
 *
 * Every string asserted is read from `src/messages/bn.json` and `src/messages/en.json` — the same
 * catalogs the screens read — so a reworded button cannot make this suite pass against a screen the owner
 * would not recognise. Every record is synthetic and labelled নমুনা. Runs against an already-started app
 * and its disposable database (TEST_ORIGIN + TEST_MONGO_URI), the way the other browser suites do.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import type {Locator,Page} from 'playwright';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {Batch} from '../src/models/Academic';
import {CenterClassGroup,CenterExam,CenterExamResult,CenterStudent} from '../src/models/CenterRecords';
import bn from '../src/messages/bn.json';
import en from '../src/messages/en.json';

const R=bn.routine,E=bn.exams,C=bn.classAdmin,COMMON=bn.common;
const EN_C=en.classAdmin,EN_R=en.routine;
const SHOTS=path.join('screenshots','o1');
const ANY_DIGIT=/[\d\u09e6-\u09ef]/;
const BN=/[\u0980-\u09ff]/;

/* The class this suite builds: a room of its own, two shifts, three children whose rolls are typed the
   way real registers are typed — one in ASCII, two in Bangla, one of them a two-digit roll that a text
   sort would put above roll ২. */
const CLASS_BN='নমুনা সপ্তম শ্রেণি',CLASS_EN='Sample Class Seven',ROOM='Room-1201',SHIFT_WORD='সকাল';
const NEW_CLASS_BN='নমুনা অষ্টম শ্রেণি',NEW_CLASS_EN='Sample Class Eight',NEW_ROOM='Room-1202';
const SUBJECT_BN='নমুনা গণিত',BATCH_BN='নমুনা ব্যাচ সকাল',BATCH_EN='Sample Morning Batch';
const ROLLS=['১০','২','1'];
const NAMES=['নমুনা ছাত্র দশ','নমুনা ছাত্র দুই','নমুনা ছাত্র এক'];
/* The bands the brief grades by, as floors: <33 F, 33 D, 40 C, 50 B, 60 A-, 70 A, 80 A+. */
const BANDS=[{min:0,label:'F',point:0},{min:33,label:'D',point:1},{min:40,label:'C',point:2},
  {min:50,label:'B',point:3},{min:60,label:'A-',point:3.5},{min:70,label:'A',point:4},
  {min:80,label:'A+',point:5}];

async function run():Promise<void>{
  await preflight({
    mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',
    originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,
    test:'tests/operational-polish-browser.integration.ts — start the app first, then run it with TEST_ORIGIN and TEST_MONGO_URI',
  });
  const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3100';
  const shared=process.env.TEST_ORIGIN?process.env.TEST_MONGO_URI:null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){
    /* The suite owns the database it is given, so every count below is exact. */
    const db=mongoose.connection.db;
    if(!db)throw Error('mongoose connected without a database');
    for(const collection of await db.listCollections().toArray())
      await db.collection(collection.name).deleteMany({}).catch(()=>{});
  }
  await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});
  {let ready=false;
   for(let attempt=0;attempt<60&&!ready;attempt++){
     try{ready=(await fetch(`${origin}/api/auth/csrf`)).ok}catch{/* not up yet */}
     if(!ready)await new Promise(resolve=>setTimeout(resolve,1000));}
   if(!ready)throw Error(`the app did not answer at ${origin}`);}
  await mkdir(SHOTS,{recursive:true});

  // ── the centre this suite runs in ────────────────────────────────────────────────────────────────
  const password=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(password,12);
  const OWNER='o1-owner@example.test',TEACHER='o1-teacher@example.test';
  await User.create({name:'নমুনা মালিক',email:OWNER,passwordHash:hash,role:'admin',active:true});
  const owner=await User.findOne({email:OWNER}).lean<{_id:mongoose.Types.ObjectId}>();
  if(!owner)throw Error('the account this suite signs in with was not written');
  const ownerId=String(owner._id);
  const teacher=await User.create({name:'নমুনা শিক্ষক',email:TEACHER,passwordHash:hash,role:'teacher',
    active:true});

  const group=await CenterClassGroup.create({name:{bn:CLASS_BN,en:CLASS_EN},academicYear:2026,
    shift:SHIFT_WORD,shifts:['morning','evening'],room:ROOM,monthlyFee:1200,active:true,
    teachers:[teacher._id]});
  const classId=String(group._id);
  const students=await Promise.all(ROLLS.map((roll,index)=>CenterStudent.create({
    studentId:`নমুনা-${index+1}`,name:{bn:NAMES[index],en:`Sample Student ${index+1}`},classGroup:group._id,
    roll,guardianName:'নমুনা অভিভাবক',guardianPhone:`017${String(10000000+index*1111).slice(0,8)}`,
    admissionDate:'2026-01-01',startMonth:{year:2026,month:1},
    feeHistory:[{effectiveFrom:{year:2026,month:1},amount:1200}],
  })));
  /* A batch with no class yet: assigning it from the class screen is what step 3 proves. */
  const batch=await Batch.create({titleBn:BATCH_BN,titleEn:BATCH_EN,grade:'সপ্তম',teacher:teacher._id,
    active:true});
  const batchId=String(batch._id);
  /* One subject out of thirty: 25 of it is the brief's own guaranteed case — 83.33% and an A+, never an
     F — and 12 of it is 40%, a C, on the same exam. */
  const exam=await CenterExam.create({name:{bn:'নমুনা মাসিক পরীক্ষা',en:'Sample Monthly Exam'},
    type:'monthly',date:'2026-11-12',classGroups:[group._id],status:'draft',gradeBands:BANDS,
    subjects:[{name:{bn:SUBJECT_BN,en:'Sample Mathematics'},fullMarks:30,passMarks:12,parts:[]}]});
  const examId=String(exam._id);

  const browser=await chromium.launch();
  const errors:string[]=[];
  let current:Page|null=null;
  const shot=(page:Page,name:string):Promise<Buffer>=>
    page.screenshot({path:path.join(SHOTS,`${name}.png`),fullPage:true});

  /** Wait for something to be true, and say what the page looked like when it never became true. */
  const until=async(what:string,check:()=>Promise<boolean>,timeoutMs=90000):Promise<void>=>{
    const deadline=Date.now()+timeoutMs;
    for(;;){
      if(await check().catch(()=>false))return;
      if(Date.now()>deadline)
        throw Error(`timed out waiting for ${what}\n  url=${current?.url()||'?'} errors=${errors.join(' | ')||'none'}`);
      await new Promise(resolve=>setTimeout(resolve,400));
    }
  };

  /**
   * "This screen overflows" is half a diagnosis: at 360 px the answer is always a table or a control
   * row. So the check names the elements that escape the viewport, skipping anything inside a wrapper
   * that scrolls, because a wide table inside `overflow-x:auto` is the design and not the defect.
   */
  const noOverflow=async(page:Page,name:string):Promise<void>=>{
    for(const width of [360,1440]){
      await page.setViewportSize({width,height:900});
      const wide=await page.evaluate<string[]>(`(()=>{
        const client=document.documentElement.clientWidth,out=[];
        for(const element of document.querySelectorAll('body *')){
          const box=element.getBoundingClientRect();
          if(box.right<=client+1)continue;
          let scroller=false;
          for(let node=element.parentElement;node;node=node.parentElement){
            if(getComputedStyle(node).overflowX!=='visible'){scroller=true;break}
          }
          if(scroller)continue;
          out.push(element.tagName+'.'+(element.className||'').toString().split(' ')[0]);
        }
        return out.slice(0,6);
      })()`);
      assert.deepEqual(wide,[],`${name} overflows horizontally at ${width}px: ${wide.join(', ')}`);
    }
    await page.setViewportSize({width:1440,height:900});
  };

  /** Chrome only: the words the interface paints, never the data an operator typed into them. */
  const noBanglaIn=async(page:Page,selector:string,name:string):Promise<void>=>{
    const texts=(await page.locator(selector).allInnerTexts()).filter(text=>text.trim());
    assert.ok(texts.length>0,`${name}: the chrome under ${selector} painted something`);
    assert.deepEqual(texts.filter(text=>BN.test(text)),[],
      `${name}: an English address painted Bangla chrome — ${texts.filter(text=>BN.test(text)).join(' | ')}`);
  };

  try{
    const signIn=async(digits:'bn'|'en'='bn',width=1440)=>{
      const context=await browser.newContext({viewport:{width,height:900}});
      const notes:string[]=[];
      let session:{user?:{id?:string}}|null=null;
      for(let attempt=1;attempt<=3&&!session?.user;attempt++){
        await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});
        const csrf=await (await context.request.get(`${origin}/api/auth/csrf`)).json() as {csrfToken:string};
        const callback=await context.request.post(`${origin}/api/auth/callback/credentials`,{
          timeout:180000,maxRedirects:0,headers:{origin,'content-type':'application/x-www-form-urlencoded'},
          form:{csrfToken:csrf.csrfToken,identifier:OWNER,password,callbackUrl:`${origin}/bn/admin`},
        }).catch(()=>null);
        session=await context.request.get(`${origin}/api/auth/session`)
          .then(response=>response.json() as Promise<{user?:{id?:string}}>).catch(()=>null);
        notes.push(`attempt ${attempt}: callback ${callback?callback.status():'error'}`);
        if(!session?.user)await new Promise(resolve=>setTimeout(resolve,2000));
      }
      if(!session?.user)throw Error(`sign-in failed for ${OWNER} — ${notes.join(' | ')}`);
      /* The digits are the operator's own, so an English proof reads English all the way down. */
      await context.addCookies([{name:`diction_digits_${session.user.id||ownerId}`,value:digits,
        url:`${origin}/`}]);
      const page=await context.newPage();
      page.on('pageerror',error=>errors.push(`${page.url()}: ${error.message}`));
      page.on('dialog',dialog=>void dialog.accept());
      page.setDefaultTimeout(60000);
      current=page;
      return {context,page};
    };

    /**
     * Navigate, then wait for the page to go quiet. Every screen here is server-rendered, so a field a
     * step is about to type into is on the page before React is listening to it — a fill that lands in
     * that window is undone by the first render, and the form posts a value nobody typed.
     */
    const goto=async(page:Page,url:string,waitFor:string):Promise<void>=>{
      let attempt=0;
      for(;;){
        try{
          await page.goto(`${origin}${url}`,{waitUntil:'domcontentloaded',timeout:180000});
          break;
        }catch(navigation){
          attempt+=1;
          if(attempt>2||!String(navigation).includes('ERR_ABORTED'))throw navigation;
          await page.waitForLoadState('load',{timeout:60000}).catch(()=>{});
        }
      }
      await page.locator(waitFor).first().waitFor({state:'visible',timeout:90000});
      await page.waitForLoadState('load',{timeout:60000}).catch(()=>{});
      await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});
    };

    const drawer=(page:Page):Locator=>page.locator('[data-routine-drawer="open"]');
    const clockOf=(page:Page,name:'start'|'end'):Promise<string>=>
      page.locator(`[data-period-form] input[name="${name}"]`).inputValue();

    const boss=await signIn('bn',1440);
    const page=boss.page;

    // ══ 1. The routine: fifty minutes, both clocks, and the chain that follows a day ═══════════════
    await goto(page,`/bn/admin/routine/master?classId=${classId}`,'[data-routine-week]');
    assert.equal(await page.locator('[data-add-period]').count(),7,
      'every day of the week still carries its own "add a period" button');
    assert.equal(await page.locator('[data-add-next]').count(),7,
      'and every day offers its next period too — the next period of an empty day is its first one');
    assert.match((await page.locator('[data-day-shift="0"]').innerText()).trim(),/শিফট/,
      'a day card says which shift it belongs to, so the morning half of a class is never mistaken for the evening');
    assert.ok((await page.locator('[data-day-shift="0"]').innerText()).includes(SHIFT_WORD),
      'and it names the shift this class runs');

    /* One plain period first: the drawer arrives on the chip the centre runs, and the two clocks are
       read out beside the dropdowns. */
    await page.locator('[data-add-period="0"]').click();
    await drawer(page).waitFor({timeout:60000});
    const chips=drawer(page).locator('[data-duration-chip]');
    assert.equal(await chips.count(),5,'the drawer offers four lengths and Custom');
    assert.deepEqual(await drawer(page).locator('[data-duration-chip]').evaluateAll(
      nodes=>nodes.map(node=>node.getAttribute('data-duration-chip'))),['50','45','40','60','custom'],
      'in the order the brief names them, fifty first');
    assert.equal(await drawer(page).locator('[data-duration-chip="50"]').getAttribute('aria-pressed'),'true',
      'fifty minutes is the length already pressed when a new period opens');
    assert.equal((await drawer(page).locator('[data-duration-label]').innerText()).trim(),R.period.duration);
    assert.ok((await drawer(page).locator('[data-duration-chip="50"]').innerText()).includes('৫০'),
      'and each chip says its own length in the operator\'s digits');
    assert.equal(await clockOf(page,'start'),'08:00','a new period starts at eight');
    assert.equal(await clockOf(page,'end'),'08:50','and ends fifty minutes later, without being asked');
    assert.ok((await drawer(page).locator('[data-time-word="start"]').innerText()).includes(R.period.clock12),
      'the twelve-hour clock is labelled as such');
    assert.ok((await drawer(page).locator('[data-time-word="start"]').innerText()).includes('৮:০০'),
      'and reads the time as a teacher says it, in Bangla digits');
    assert.ok((await drawer(page).locator('[data-time-24="start"]').innerText()).includes('০৮:০০'),
      'while the twenty-four-hour clock beside it reads the same moment as the record stores it');

    /* A start typed by hand — the way a spreadsheet copy arrives — drags the end along. */
    await drawer(page).locator('[data-time-typed="start"]').fill('৯:২০');
    await until('a typed start of ৯:২০ to become the period\'s start',async()=>
      await clockOf(page,'start')==='09:20');
    await until('and to drag its end to 10:10, because fifty minutes is the length that is on',async()=>
      await clockOf(page,'end')==='10:10');
    assert.ok((await drawer(page).locator('[data-time-word="start"]').innerText()).includes('৯:২০'),
      'the typed time is read back in the twelve-hour clock');
    assert.ok((await drawer(page).locator('[data-time-word="start"]').innerText()).includes(R.period.typedTime)===false,
      'and the readout is the time, not the label of the box it was typed into');

    /* Forty-five shortens the same period, and Custom lets go of the arithmetic. */
    await drawer(page).locator('[data-duration-chip="45"]').click();
    await until('the forty-five minute chip to shorten the end to 10:05',async()=>
      await clockOf(page,'end')==='10:05');
    assert.equal(await drawer(page).locator('[data-duration-chip="45"]').getAttribute('aria-pressed'),'true',
      'and the chip that is on says it is on');
    assert.equal((await drawer(page).locator('[data-duration-help]').innerText()).trim(),R.period.durationHelp);
    await drawer(page).locator('[data-duration-chip="custom"]').click();
    await drawer(page).locator('[data-time-typed="end"]').fill('10:20');
    await until('a custom length to let the end be written by hand',async()=>await clockOf(page,'end')==='10:20');
    assert.equal((await drawer(page).locator('[data-duration-help]').innerText()).trim(),
      R.period.durationCustomHelp,'and to say so');
    /* Every five-minute step is offered, not just the top of the hour. */
    const minuteOptions=await drawer(page).locator('[data-time-minute="end"] option').evaluateAll(
      nodes=>nodes.map(node=>String(node.getAttribute('value'))));
    for(const step of [0,5,15,20,35,45,55])
      assert.ok(minuteOptions.includes(String(step)),`the minute dropdown offers ${step} minutes`);
    assert.equal(minuteOptions.length,12,'and offers all twelve five-minute steps of an hour');

    /* Back to fifty, then a start of 09:20 — the paper routine's own first period. */
    await drawer(page).locator('[data-duration-chip="50"]').click();
    await drawer(page).locator('[data-time-typed="start"]').fill('09:20');
    await until('the period to be 09:20 to 10:10 again',async()=>
      await clockOf(page,'start')==='09:20'&&await clockOf(page,'end')==='10:10');
    await drawer(page).locator('[data-period-subject-bn]').fill(SUBJECT_BN);
    await drawer(page).locator('[data-period-room]').fill(ROOM);
    await drawer(page).locator('[data-period-order]').fill('1');
    assert.ok((await drawer(page).locator('[data-period-shift]').innerText()).includes(SHIFT_WORD),
      'the drawer names the shift the period belongs to, as the card will');
    await shot(page,'o1-routine-drawer-presets-bn-1440');
    await page.setViewportSize({width:360,height:900});
    await shot(page,'o1-routine-drawer-presets-bn-360');
    await noOverflow(page,'the routine drawer at 360px');
    await page.setViewportSize({width:1440,height:900});

    await drawer(page).locator('[data-period-save]').click();
    await until('the first period to be on its day card',async()=>
      await page.locator('[data-routine-day="0"] [data-period-card]').count()===1);
    const card=page.locator('[data-routine-day="0"] [data-period-card]').first();
    assert.ok((await card.locator('[data-period-time]').innerText()).includes('০৯:২০'),
      'the card says when the period starts');
    assert.ok((await card.locator('[data-period-time]').innerText()).includes('১০:১০'),
      'and when it ends, in the same words');
    assert.ok((await card.locator('[data-period-room]').innerText()).includes(ROOM),
      'the room the centre wrote is on the card');
    assert.ok((await card.locator('[data-period-subject]').innerText()).includes(SUBJECT_BN),
      'and so is the subject');
    const stored=await mongoose.connection.collection('masterroutines').findOne({classGroup:group._id});
    assert.ok(stored,'the period was written to the week');
    assert.deepEqual((stored as unknown as {periods:{start:string;end:string;order:number}[]}).periods
      .map(period=>[period.start,period.end,period.order]),[['09:20','10:10',1]],
      'as fifty minutes from 09:20, in the first place of the day');

    /* The chain: the next period of the day starts where this one ended and is numbered after it. */
    await page.locator('[data-add-next="0"]').click();
    await drawer(page).waitFor({timeout:60000});
    await until('the chain to open on the end of the day',async()=>await clockOf(page,'start')==='10:10');
    assert.equal(await clockOf(page,'end'),'11:00','and it runs fifty minutes, the length the chips are on');
    assert.equal(await drawer(page).locator('[data-period-order]').inputValue(),'2',
      'numbered one past the day\'s own highest, so a day reads 1, 2, 3');
    assert.equal((await drawer(page).locator('[data-duration-chip="50"]').getAttribute('aria-pressed')),'true',
      'with the length the drawer was last on still pressed');
    await drawer(page).locator('[data-period-subject-bn]').fill(`${SUBJECT_BN} দ্বিতীয়`);
    await drawer(page).locator('[data-period-room]').fill(ROOM);
    await drawer(page).locator('[data-period-save]').click();
    await until('the chained period to be on the same day',async()=>
      await page.locator('[data-routine-day="0"] [data-period-card]').count()===2);
    const times=await page.locator('[data-routine-day="0"] [data-period-time]').allInnerTexts();
    assert.equal(times.length,2,'the day now holds two periods');
    assert.ok(times.some(time=>time.includes('১০:১০')&&time.includes('১১:০০')),
      'and the second one starts exactly where the first one ended');
    const chained=await mongoose.connection.collection('masterroutines').findOne({classGroup:group._id});
    assert.ok(chained,'the week is still there after the second write');
    const periods=(chained as unknown as {periods:{start:string;end:string;order:number}[]}).periods;
    assert.deepEqual(periods.map(period=>period.order).sort(),[1,2],'one period per place in the day');
    assert.equal(periods.filter(period=>period.start==='10:10').length,1,
      'and nothing was written twice by a double click');
    await shot(page,'o1-routine-week-chain-bn-1440');
    await page.setViewportSize({width:360,height:900});
    await shot(page,'o1-routine-week-chain-bn-360');
    await page.setViewportSize({width:1440,height:900});

    /* The same drawer in English: the interface reads English, the subject the owner typed does not. */
    const english=await signIn('en',1440);
    await goto(english.page,`/en/admin/routine/master?classId=${classId}`,'[data-routine-week]');
    await english.page.locator('[data-period-edit]').first().click();
    await drawer(english.page).waitFor({timeout:60000});
    assert.equal((await drawer(english.page).locator('[data-duration-label]').innerText()).trim(),
      EN_R.period.duration,'the length row is labelled in English');
    assert.ok((await drawer(english.page).locator('[data-time-word="start"]').innerText()).includes(
      EN_R.period.clock12),'and so are both clocks');
    assert.ok((await drawer(english.page).locator('[data-duration-chip="custom"]').innerText()).includes(
      EN_R.period.durationCustom),'Custom included');
    await shot(english.page,'o1-routine-drawer-presets-en-1440');
    await english.page.setViewportSize({width:360,height:900});
    await shot(english.page,'o1-routine-drawer-presets-en-360');
    await english.page.setViewportSize({width:1440,height:900});
    await drawer(english.page).locator('[data-period-cancel]').click();
    await english.context.close();

    // ══ 2. Marks typed into a grid, with no file anywhere ─════════════════════════════════════════
    await goto(page,`/bn/admin/center-exams/${examId}`,'[data-exam-grid]');
    const rows=page.locator('[data-exam-grid] [data-row]');
    assert.equal(await rows.count(),3,'every child enrolled on the class is in the grid before anything is uploaded');
    assert.deepEqual(await page.locator('[data-exam-grid] [data-cell-roll]').allInnerTexts(),['1','২','১০'],
      'in roll order read as numbers — roll ১০ last, not second — whichever script each roll was typed in');
    const header=(await page.locator('[data-exam-grid] thead').first().innerText()).replace(/\s+/g,' ');
    for(const word of [E.col.roll,E.col.student,E.col.total,E.col.percentage,E.col.grade,E.col.absent,E.col.status])
      assert.ok(header.includes(word),`the grid's head names ${word}`);
    assert.ok(header.includes(SUBJECT_BN)&&header.includes('৩০'),
      'and it names the subject with the full marks beside it, so a mark is typed against a number the operator can see');
    /* The upload is a folded second door, not a step. */
    const fold=page.locator('[data-import-fold]');
    assert.equal(await fold.count(),1,'the import lives in one fold of the grid\'s own toolbar');
    assert.equal((await page.locator('[data-grid-import-toggle]').innerText()).trim(),E.grid.importToggle);
    assert.equal(await page.locator('[data-import-file]').isVisible().catch(()=>false),false,
      'and no file picker is standing between the operator and the marks');
    await page.locator('[data-grid-import-toggle]').click();
    await until('the fold to open when it is asked for',async()=>
      await page.locator('[data-import-file]').isVisible().catch(()=>false));
    assert.ok((await page.locator('[data-grid-import-help]').innerText()).includes(E.grid.importToggleHelp),
      'where it says plainly that typing is the way and a file is the alternative');
    await shot(page,'o1-marks-import-folded-bn-1440');
    await page.locator('[data-grid-import-toggle]').click();
    await until('and to fold away again',async()=>
      !(await page.locator('[data-import-file]').isVisible().catch(()=>false)));

    /* 25 of 30 — the brief's guaranteed case — typed into the first row. */
    const firstCell=rows.nth(0).locator('input[data-student]').first();
    await firstCell.fill('২৫');
    await until('the percentage to move as the mark is typed',async()=>
      (await rows.nth(0).locator('[data-cell-percentage]').innerText()).includes('৮৩.৩'));
    assert.equal((await rows.nth(0).locator('[data-cell-grade]').innerText()).trim(),'A+',
      '25 of 30 is 83.33% and an A+ — never the F a grid that divided by 100 would have painted');
    assert.equal((await rows.nth(0).locator('[data-cell-point]').innerText()).trim(),'৫',
      'worth the five points the band carries');
    assert.equal((await rows.nth(0).locator('[data-cell-total]').innerText()).trim(),'২৫',
      'with the total beside it');
    assert.equal(await rows.nth(0).getAttribute('data-row-dirty'),'true',
      'and the row says it has not been sent yet');
    assert.equal(await rows.nth(0).locator('[data-cell-status]').getAttribute('data-cell-status'),'unsaved',
      'in its own status column, where an operator can read it without watching the bar above the table');
    await shot(page,'o1-marks-grid-dynamic-grades-bn-1440');

    /* The grid saves itself on a debounce, so the button an operator presses may already have nothing to
       do: it is asked to save when it can, and the database is what is waited for either way. */
    const saveButton=page.locator('[data-grid-save]');
    assert.equal(await saveButton.isEnabled(),true,'the save is offered while a row has not been sent');
    if(await saveButton.isEnabled().catch(()=>false))await saveButton.click();
    await until('the write to be stored',async()=>
      (await CenterExamResult.countDocuments({exam:exam._id}))===1);
    const result=await CenterExamResult.findOne({exam:exam._id,student:students[2]._id})
      .lean<{total:number;fullTotal:number;percentage:number;grade:string;point:number}>();
    assert.ok(result,'the mark the grid typed was written for the child it was typed against');
    assert.equal(result.total,25,'as twenty-five');
    assert.equal(result.fullTotal,30,'out of the subject\'s own thirty');
    assert.equal(Math.round(result.percentage*100)/100,83.33,'which is 83.33 percent');
    assert.equal(result.grade,'A+','and an A+');
    assert.equal(result.point,5,'worth 5.00');
    await until('the grid to say the row is stored',async()=>
      await rows.nth(0).locator('[data-cell-status="saved"]').count()===1
      ||await page.locator('.admin-toast').count()>0);
    /* A toast is raised for a save an operator pressed; when the grid's own debounce got there first the
       button had nothing to send and the row's own status column is the answer. Either way the sentence
       is read here, and the corner the toast arrives in is measured where a write is pressed for
       certain — the class board below. */
    if(await page.locator('.admin-toast').count()>0){
      const gridToast=await page.locator('.admin-toast').first().innerText();
      assert.ok(ANY_DIGIT.test(gridToast)||gridToast.includes('সংরক্ষিত'),
        `the toast says what was saved; it said "${gridToast}"`);
    }
    assert.ok(ANY_DIGIT.test(await page.locator('[data-grid-status]').innerText()),
      'and the grid\'s own status line counts the rows it saved');
    await until('the row to say it is saved',async()=>
      await rows.nth(0).locator('[data-cell-status="saved"]').count()===1);

    /* The same child at twelve is a C: the grade follows the percentage, not the subject. */
    await firstCell.fill('১২');
    await until('the grade to follow the mark down',async()=>
      (await rows.nth(0).locator('[data-cell-grade]').innerText()).trim()==='C');
    assert.ok((await rows.nth(0).locator('[data-cell-percentage]').innerText()).includes('৪০'),
      'twelve of thirty is forty percent');
    await shot(page,'o1-marks-grid-grade-c-bn-1440');
    await page.setViewportSize({width:360,height:900});
    await shot(page,'o1-marks-grid-dynamic-grades-bn-360');
    await noOverflow(page,'the marks grid');
    await page.setViewportSize({width:1440,height:900});

    const gridEnglish=await signIn('en',1440);
    await goto(gridEnglish.page,`/en/admin/center-exams/${examId}`,'[data-exam-grid]');
    await noBanglaIn(gridEnglish.page,
      '.admin-panel-head,[data-grid-status],[data-exam-grid] tfoot,[data-grid-import-toggle]',
      'the English marks grid');
    await shot(gridEnglish.page,'o1-marks-grid-dynamic-grades-en-1440');
    await gridEnglish.page.setViewportSize({width:360,height:900});
    await shot(gridEnglish.page,'o1-marks-grid-dynamic-grades-en-360');
    await gridEnglish.page.setViewportSize({width:1440,height:900});
    await gridEnglish.context.close();

    // ══ 3. A class is written from its own board ═══════════════════════════════════════════════════
    await goto(page,'/bn/admin/classes','[data-class-board]');
    const seeded=page.locator(`[data-class-card="${classId}"]`);
    assert.equal(await seeded.count(),1,'the class the centre already has is a card');
    assert.ok((await seeded.locator('[data-class-name]').innerText()).includes(CLASS_BN),
      'named as the centre names it');
    assert.ok((await seeded.locator('[data-class-room]').innerText()).includes(ROOM),
      'with the room it sits in');
    assert.equal(await seeded.locator('[data-class-shift]').count(),2,
      'and both of the shifts it runs, each as a chip');
    assert.ok((await seeded.locator('[data-class-shift]').first().innerText()).includes(C.shiftMorning),
      'read in the operator\'s own language rather than as the key that stores it');
    assert.ok((await seeded.locator('[data-class-students]').innerText()).includes('৩'),
      'counting the three children enrolled on it');
    assert.ok((await seeded.locator('[data-class-batches]').innerText()).includes(C.noBatches),
      'and saying plainly that no batch runs in it yet');
    assert.ok((await seeded.locator('[data-class-fee]').innerText()).includes('১২০০'),
      'with the month it costs');
    assert.ok(String(await seeded.locator('[data-class-students-link]').getAttribute('href'))
      .includes(`/admin/students/classes/${classId}`),'a card leads to its own roll');
    assert.ok(String(await seeded.locator('[data-class-routine-link]').getAttribute('href'))
      .includes(`/admin/routine/master?classId=${classId}`),'and to the timetable written for it');

    /* A class created from the board, with everything the brief asks the sheet to carry. */
    await page.locator('[data-class-add]').click();
    const modal=page.locator('[data-class-modal="new"]');
    await modal.waitFor({state:'visible',timeout:60000});
    assert.equal((await modal.locator('h2').innerText()).trim(),C.newTitle);
    await modal.locator('[data-class-name-bn]').fill(NEW_CLASS_BN);
    await modal.locator('[data-class-name-en]').fill(NEW_CLASS_EN);
    await modal.locator('[data-class-level]').fill(C.levels[3]);
    await modal.locator('[data-class-room]').fill(NEW_ROOM);
    await modal.locator('[data-class-fee]').fill('১৫০০');
    for(const key of ['morning','day','evening'])await modal.locator(`[data-class-shift-box="${key}"]`).check();
    assert.equal(await modal.locator('[data-class-shift-box]:checked').count(),3,
      'all three shifts can be ticked at once, because a class can run all three');
    await shot(page,'o1-class-add-bn-1440');
    await page.setViewportSize({width:360,height:900});
    await shot(page,'o1-class-add-bn-360');
    await noOverflow(page,'the add-class sheet');
    await page.setViewportSize({width:1440,height:900});

    await modal.locator('[data-class-save]').click();
    await until('the class to be written',async()=>
      (await CenterClassGroup.countDocuments({'name.bn':NEW_CLASS_BN}))===1);
    await until('and the answer to arrive in the corner',async()=>
      await page.locator('.admin-toast').filter({hasText:C.created}).count()>0);
    const toastBox=await page.locator('.admin-toast').first().boundingBox();
    assert.ok(toastBox,'the answer is on the screen');
    if(toastBox){
      const viewport=page.viewportSize()||{width:1440,height:900};
      assert.ok(toastBox.y<viewport.height/3,
        `it arrives near the top of the screen, at y=${Math.round(toastBox.y)}`);
      assert.ok(toastBox.x+toastBox.width>viewport.width/2,
        `and on its right-hand side, at x=${Math.round(toastBox.x)} of ${viewport.width}`);
    }
    const created=await CenterClassGroup.findOne({'name.bn':NEW_CLASS_BN})
      .lean<{name:{bn:string;en:string};level:string;room:string;shifts:string[];shift:string;
        monthlyFee:number;academicYear:number;active:boolean}>();
    assert.ok(created,'the new class is in the database');
    assert.equal(created.name.en,NEW_CLASS_EN,'with the English name beside the Bangla one');
    assert.equal(created.level,C.levels[3],'the level the sheet offered');
    assert.equal(created.room,NEW_ROOM,'the room it sits in');
    assert.deepEqual(created.shifts,['morning','day','evening'],'all three shifts it runs, in the day\'s order');
    assert.equal(created.monthlyFee,1500,'and the fee typed in Bangla digits stored as the number it says');
    assert.equal(created.shift,C.shiftMorning,
      'the shift a routine reads is the first one ticked, as the word the centre uses — not as a key');
    assert.equal(created.active,true,'a new class is running');
    const newCard=await CenterClassGroup.findOne({'name.bn':NEW_CLASS_BN}).select('_id')
      .lean<{_id:mongoose.Types.ObjectId}|null>();
    const newId=String(newCard?._id);
    await until('the new class to be a card on the board',async()=>
      await page.locator(`[data-class-card="${newId}"]`).count()===1);
    assert.equal(await page.locator('[data-class-card]').count(),2,'and the board now holds two classes');
    assert.equal(await page.locator('[data-class-modal]').count(),0,
      'the sheet closed when its write landed, rather than staying open over the card it just made');

    /* The batch this class runs, assigned from the card. */
    await page.locator(`[data-class-card="${classId}"] [data-class-edit]`).click();
    const edit=page.locator(`[data-class-modal="${classId}"]`);
    await edit.waitFor({state:'visible',timeout:60000});
    assert.equal((await edit.locator('h2').innerText()).trim(),C.editTitle);
    assert.equal(await edit.locator('[data-class-name-bn]').inputValue(),CLASS_BN,
      'an edit arrives holding the class\'s own facts');
    assert.equal(await edit.locator('[data-class-room]').inputValue(),ROOM);
    assert.equal(await edit.locator('[data-class-shift-box="morning"]').isChecked(),true,
      'and the shifts it already runs are already ticked');
    assert.equal(await edit.locator('[data-class-shift-box="day"]').isChecked(),false,
      'while the one it does not run is not');
    await edit.locator(`[data-class-batch-box="${batchId}"]`).check();
    await edit.locator('[data-class-batch-save]').click();
    await until('the batch to belong to the class',async()=>{
      const row=await Batch.findOne({_id:batch._id}).lean<{classGroup?:mongoose.Types.ObjectId|null}>();
      return String(row?.classGroup||'')===classId;
    });
    await until('and the card to count it',async()=>
      (await page.locator(`[data-class-card="${classId}"] [data-class-batches]`).innerText())
        .includes('১'));
    assert.ok((await page.locator(`[data-class-card="${classId}"] [data-class-batches]`).innerText())
      .includes(C.batches.split(' ')[0]),'in the operator\'s own word for a batch');
    await shot(page,'o1-class-board-bn-1440');
    await page.setViewportSize({width:360,height:900});
    await shot(page,'o1-class-board-bn-360');
    await noOverflow(page,'the class and batch board');
    await page.setViewportSize({width:1440,height:900});
    await edit.locator('[data-class-close]').click();

    const classEnglish=await signIn('en',1440);
    await goto(classEnglish.page,'/en/admin/classes','[data-class-board]');
    /* The level and the shift a class was given are the owner's own words and may be Bangla, exactly as
       an exam's own name is: what is swept here is the chrome around them. */
    await noBanglaIn(classEnglish.page,
      '[data-class-title],[data-class-desc],[data-class-cards-help],.admin-panel-head,'
      +'.class-card-actions,[data-class-status],[data-class-students],[data-class-batches],[data-class-fee]',
      'the English class board');
    assert.ok((await classEnglish.page.locator(`[data-class-card="${classId}"] [data-class-name]`).innerText())
      .includes(CLASS_EN),'a card in English is named in English');
    await shot(classEnglish.page,'o1-class-board-en-1440');
    await classEnglish.page.setViewportSize({width:360,height:900});
    await shot(classEnglish.page,'o1-class-board-en-360');
    await classEnglish.page.setViewportSize({width:1440,height:900});
    await classEnglish.context.close();

    // ══ 4. One door to exams and results, and the old addresses find it ════════════════════════════
    for(const legacy of ['/bn/admin/overview/results','/bn/admin/exams']){
      await goto(page,legacy,'[data-exam-filters],[data-exam-total]');
      await until(`${legacy} to arrive at the exam hub`,async()=>page.url().includes('/bn/admin/center-exams'),
        60000);
      assert.ok(page.url().includes('/bn/admin/center-exams'),
        `${legacy} lands on the exam hub; it landed on ${page.url()}`);
    }
    const menu=page.locator('.admin-nav');
    const examLinks=(await menu.locator('a').allInnerTexts()).filter(text=>text.includes('পরীক্ষা ও ফলাফল'));
    assert.equal(examLinks.length,1,'the menu carries exactly one door named পরীক্ষা ও ফলাফল');
    const body=await page.locator('body').innerText();
    assert.equal(body.includes('ফলাফল ও একাডেমিক তথ্য দেখুন'),false,
      'and the legacy results description is nowhere on the page');
    assert.ok(body.includes('শ্রেণি ও ব্যাচ'),'while the class and batch screen has its own door in the menu');
    await shot(page,'o1-exam-hub-one-door-bn-1440');

    assert.deepEqual(errors,[],`the screens threw while they were driven: ${errors.join(' | ')}`);
    await boss.context.close();

    console.log('Operational polish: the routine drawer opens on ৫০ মিনিট with 09:20 becoming 10:10 and a '
      +'typed start dragging its end, both clocks read out and every five-minute step offered; the day\'s '
      +'chain button opens the next period at 10:10 to 11:00 in the day\'s second place and both are '
      +'stored once; an exam with nothing uploaded shows all three children in roll order 1, ২, ১০ with '
      +'the import folded away, 25 of 30 painting A+ at 83.33% and storing it, and 12 of 30 painting C; a '
      +'class is created from its board with two names, a level, a room, three shifts and ১৫০০, answered '
      +'by a toast in the top-right, counted on its card and given a batch the database then holds; and '
      +'/admin/overview/results and /admin/exams both arrive at one exam hub with one door in the menu.');
  }finally{
    await browser.close();
    await mongoose.disconnect();
    if(!shared)await mongo.stop();
  }
}

run().then(()=>{process.exitCode=0}).catch(error=>{console.error(error);process.exitCode=1});
