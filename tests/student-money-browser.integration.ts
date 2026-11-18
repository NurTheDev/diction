/**
 * S1 · the three doors that change a student over time, in the browser: a pause, a move, a price.
 *
 * F-01, F-02 and F-03 are findings about what a screen asks before it writes. The rules behind the
 * answers are proved without a browser (tests/student-money-core.test.ts) and against a disposable
 * database (tests/student-money-db.integration.ts). This suite is the half only a browser can settle —
 * that the doors are where the operator is, that each one asks for a MONTH and takes it from the
 * picker rather than from a native box, that the write lands in the record the way the rule says, and
 * that a refusal leaves the sheet open with the reason printed inside it and what the operator typed
 * still in it.
 *
 * What it drives, in Bangla and then in English, at 1440 px and at 360 px:
 *   1. the row's ⋯ offers Hold, Transfer class and Change monthly fee, and the badge opens the same
 *      pause sheet — one implementation, two ways in;
 *   2. a pause asks which month it takes effect from, will not write until one is picked, and the two
 *      months BEFORE it stay on the row's dues chip, on the class's due list and in the all-class
 *      summary (F-01's finding: a pause used to take the whole student out of the count, which
 *      forgave what they already owed);
 *   3. lifting a pause asks which month the student resumes, will not offer a month inside the pause,
 *      closes the range the month before the resume, and bills nothing that was inside it — the chip
 *      reads the same number after the lift as before it;
 *   4. a move lists the classes the centre runs without the one the student is in, writes the class
 *      timeline with the name each class wore, moves the roll, and takes the arrears with it;
 *   5. a price refuses a month the centre has already taken money for and names that month, and a
 *      price written for a month nobody has reached changes nothing that is owed today;
 *   6. the profile carries the same doors and prints both histories — the classes and the months on
 *      hold — because both are about money.
 *
 * Photographed into screenshots/s1: the three sheets in both languages at both widths.
 *
 * Run: npm run test:s1:screens (needs the app and a database: npm run test-mode)
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
import {CenterActivityLog,CenterClassGroup,CenterPayment,CenterSettings,CenterStudent} from '../src/models/CenterRecords';
import {dhakaCalendar} from '../src/lib/center/month-status';
import {calculateStudentDues,monthKey} from '../src/lib/center/dues';
import {liveClassDueSummary} from '../src/lib/center/dues-query';
import {formatNumber} from '../src/lib/admin/format';
import {shortMonth} from '../src/components/admin/list-dates';
import bn from '../src/messages/bn.json';
import enCatalogue from '../src/messages/en.json';

const c=bn.center,row=c.row,en=enCatalogue.center;
/** The catalog groups this suite reads, typed here rather than cast at every assertion. */
type Doors={holdDoor:{title:string;liftTitle:string;month:string};transferDoor:{title:string;class:string;ok:string};
  feeDoor:{title:string;month:string;ok:string;settledMonth:string};history:{holdHelp:string};
  row:{holdOk:string;unholdOk:string;transfer:string;fee:string}};
const doors=c as unknown as Doors,enDoors=en as unknown as Doors;
const monthNames=c.monthNames as string[];
const SHOTS=path.join('screenshots','s1');
const FEE=1000,RAISED=1500,DUE_DAY=10;
const PAUSE_REASON='S1 পরীক্ষার জন্য বিরতি',MOVE_REASON='S1 শ্রেণি বদল',FEE_REASON='S1 বার্ষিক বৃদ্ধি';
const CLASS_A='S1 নবম শ্রেণি',CLASS_B='S1 দশম শ্রেণি';
const PAUSE_STUDENT='S1 বিরতি শিক্ষার্থী',SETTLED_STUDENT='S1 পরিশোধিত শিক্ষার্থী';
/** A pause written by the flag S1 replaced: a status and no months, which is every pause on the record
    before this slice, and the shape the fee run cannot place. */
const LEGACY_STUDENT='S1 পুরোনো হোল্ড শিক্ষার্থী';
/** The same two students as an English list reads them: the record carries both names. */
const PAUSE_EN='S1 pause',SETTLED_EN='S1 settled';
/** Bangla digits read as ASCII ones, so an assertion can count either. */
const ascii=(text:string):string=>text.replace(/[\u09e6-\u09ef]/g,ch=>String(ch.charCodeAt(0)-0x09e6));
const banglaDigits=(text:string):boolean=>/[\u09e6-\u09ef]/.test(text);
const ym=(value:{year:number;month:number}):string=>`${value.year}-${String(value.month).padStart(2,'0')}`;

type Stored={_id:mongoose.Types.ObjectId;studentId:string;status:string;classGroup:mongoose.Types.ObjectId;
  startMonth:{year:number;month:number};revision:number;
  holds:{start:{year:number;month:number};end?:{year:number;month:number}|null;reason:string;recordedBy?:mongoose.Types.ObjectId;endedBy?:mongoose.Types.ObjectId}[];
  classHistory:{classGroup:mongoose.Types.ObjectId;name?:{bn:string;en:string};effectiveFrom:{year:number;month:number};reason?:string;changedBy?:mongoose.Types.ObjectId}[];
  feeHistory:{effectiveFrom:{year:number;month:number};amount:number;reason?:string;changedBy?:mongoose.Types.ObjectId}[]};

async function run(){
  await preflight({mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,
    test:'tests/student-money-browser.integration.ts — the three doors that change a student over time'});
  const shared=process.env.TEST_ORIGIN?process.env.TEST_MONGO_URI:null;
  const mongo=shared?{getUri:()=>shared as string,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3100';
  let ready=false;
  for(let attempt=0;attempt<60&&!ready;attempt++){
    try{ready=(await fetch(`${origin}/api/auth/csrf`)).ok}catch{/* not up yet */}
    if(!ready)await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(!ready)throw Error(`app not reachable at ${origin}`);
  await mkdir(SHOTS,{recursive:true});

  /* A world of its own: the two classes the centre runs and two students — one who has paid nothing,
     and one who has paid every month up to and including Dhaka's own month, which is the month a price
     may not reach. Both are paid and owed on whatever day CI runs, so the fee run starts three Dhaka
     months back and the settled student is settled through this one — including it, because the tenth
     of a month is the due day and this suite must not depend on which side of it the run falls. */
  await CenterStudent.deleteMany({});
  await CenterClassGroup.deleteMany({});
  await CenterPayment.deleteMany({});
  await CenterActivityLog.deleteMany({});
  await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});
  const today=dhakaCalendar(new Date());
  const at=(back:number):{year:number;month:number}=>{
    const index=today.year*12+today.month-1-back;
    return {year:Math.floor(index/12),month:(index%12)+1};
  };
  const START=at(3),THIS=at(0),LAST=at(1),HOLD_FROM=at(1),RESUME=at(-1);
  /** Whether Dhaka's own month has fallen due yet: the tenth of the month is the due day. */
  const thisMonthOwed=today.day>DUE_DAY;
  const password=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(password,12);
  const email='s1-boss@example.test';
  await User.deleteOne({email});
  await User.create({name:'S1 অ্যাডমিন',email,passwordHash:hash,role:'admin',active:true});
  const bossId=(await User.findOne({email}).lean<{_id:mongoose.Types.ObjectId}>())!._id;
  await CenterSettings.updateOne({key:'main'},{$set:{key:'main',quietStart:'00:00',quietEnd:'00:00',
    institutePhone:'01733330000',dueDay:DUE_DAY,smsUnitCost:0.5}},{upsert:true});
  const classA=await CenterClassGroup.create({name:{bn:CLASS_A,en:'S1 Class Nine'},academicYear:today.year,shift:'প্রভাতী',active:true});
  const classB=await CenterClassGroup.create({name:{bn:CLASS_B,en:'S1 Class Ten'},academicYear:today.year,shift:'দিবা',active:true});
  const feeHistory=[{effectiveFrom:START,amount:FEE}];
  const paused=await CenterStudent.create({studentId:'S1-PAUSE',name:{bn:PAUSE_STUDENT,en:PAUSE_EN},classGroup:classA._id,
    startMonth:START,admissionDate:`${ym(START)}-05`,guardianName:'অভিভাবক',guardianPhone:'01711000201',
    roll:'1',feeHistory,status:'active'});
  await CenterStudent.create({studentId:'S1-LEGACY',name:{bn:LEGACY_STUDENT,en:'S1 legacy hold'},
    classGroup:classA._id,startMonth:START,admissionDate:`${ym(START)}-05`,guardianName:'অভিভাবক',
    guardianPhone:'01711000203',roll:'3',feeHistory,status:'on_hold'});
  const settled=await CenterStudent.create({studentId:'S1-SETTLED',name:{bn:SETTLED_STUDENT,en:SETTLED_EN},classGroup:classA._id,
    startMonth:START,admissionDate:`${ym(START)}-05`,guardianName:'অভিভাবক',guardianPhone:'01711000202',
    roll:'2',feeHistory,status:'active'});
  const receipts:unknown[]=[];
  for(const back of [3,2,1,0]){
    const month=at(back);
    receipts.push({student:settled._id,classGroupAtPayment:classA._id,type:'monthly',academicYear:month.year,
      month:month.month,amount:FEE,receiptNo:`S1-${back}`,receiptKey:`s1-${back}`,paidOn:`${ym(month)}-05`,
      receivedBy:bossId,groupId:'s1-seed',status:'valid'});
  }
  await CenterPayment.insertMany(receipts);
  assert.equal((await CenterStudent.findOne({studentId:'S1-LEGACY'}).lean<{holds:unknown[]}>())!.holds.length,0,
    'and a pause written before S1 kept no months, which is the shape the fee run cannot place');
  assert.equal(await CenterStudent.countDocuments(),3,'three students across two classes, and nothing else');

  const browser=await chromium.launch();
  /* A write's answer paints only once React is free, and the same commit asks the page to re-read
     itself: on a one-CPU runner that can hold a toast past a minute, so the wait is generous and the
     proof is unchanged — the toast has to arrive with its own words. */
  const TOAST_MS=120000;
  const shot=(page:Page,name:string,fullPage=false)=>page.screenshot({path:path.join(SHOTS,`${name}.png`),fullPage});
  const toast=(page:Page,text:string):Locator=>page.locator('.admin-toast[role="status"]',{hasText:text}).first();
  const stored=async(name:string):Promise<Stored|null>=>CenterStudent.findOne({'name.bn':name}).lean<Stored|null>();
  /** Wait for a write to land in the record rather than for a sentence to appear on screen. */
  const until=async(check:()=>Promise<boolean>,label:string,timeoutMs=90000):Promise<void>=>{
    const deadline=Date.now()+timeoutMs;
    for(;;){
      if(await check().catch(()=>false))return;
      if(Date.now()>deadline)throw Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
      await new Promise(resolve=>setTimeout(resolve,400));
    }
  };
  /** What the dues engine says a student owes, read the way the app reads it, so a chip can be held
      against the arithmetic rather than against a number this suite invented. */
  const owed=async(name:string):Promise<{total:number;months:number;keys:string[]}>=>{
    const student=await stored(name);
    if(!student)throw Error(`${name} is not in the database`);
    const payments:Record<string,number>={};
    for(const pay of await CenterPayment.find({student:student._id,status:'valid',type:'monthly'})
      .lean<{academicYear:number;month:number;amount:number}[]>()){
      const key=monthKey(pay.academicYear,pay.month);
      payments[key]=(payments[key]||0)+pay.amount;
    }
    const dues=calculateStudentDues({...student,payments,waivers:new Set<string>()} as never,new Date(),DUE_DAY);
    return {total:dues.total,months:dues.months.length,keys:dues.months.map(month=>monthKey(month.year,month.month))};
  };
  /** The month word the row's own ⋯ prints, from the pattern's own formatter. */
  const monthLabel=(value:{year:number;month:number},digits:'bn'|'en'='bn'):string=>shortMonth(ym(value),digits,'bn');

  try{
    async function signIn(width=1440,digits?:'bn'|'en'){
      const context=await browser.newContext({viewport:{width,height:900}});
      if(digits)await context.addCookies([{name:`diction_digits_${String(bossId)}`,value:digits,url:`${origin}/`}]);
      const notes:string[]=[];
      let session:{user?:unknown}|null=null;
      for(let attempt=1;attempt<=3&&!session?.user;attempt++){
        await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});
        const csrf=await (await context.request.get(`${origin}/api/auth/csrf`)).json();
        const callback=await context.request.post(`${origin}/api/auth/callback/credentials`,{
          timeout:180000,maxRedirects:0,headers:{origin,'content-type':'application/x-www-form-urlencoded'},
          form:{csrfToken:csrf.csrfToken,identifier:email,password,callbackUrl:`${origin}/bn/admin`},
        }).catch(()=>null);
        session=await context.request.get(`${origin}/api/auth/session`).then(response=>response.json()).catch(()=>null);
        notes.push(`attempt ${attempt}: callback ${callback?callback.status():'error'}`);
        if(!session?.user)await new Promise(resolve=>setTimeout(resolve,2000));
      }
      if(!session?.user)throw Error(`sign-in failed — ${notes.join(' | ')}`);
      const page=await context.newPage(),errors:string[]=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('dialog',dialog=>dialog.accept());
      page.setDefaultTimeout(60000);
      return {context,page,errors};
    }
    const list='/bn/admin/students';
    const rowOf=(page:Page,name:string):Locator=>page.locator('tr[data-student-row]',{hasText:name}).first();
    const gotoList=async(page:Page,address=list):Promise<void>=>{
      await page.goto(`${origin}${address}`,{waitUntil:'domcontentloaded',timeout:180000});
      await page.locator('tr[data-student-row]').first().waitFor({timeout:90000});
    };
    /** The row's ⋯, opened the way the list's own suite opens it. */
    const openMore=async(page:Page,name:string):Promise<Locator>=>{
      await rowOf(page,name).locator('.student-act .pop-more .pop-anchor').click();
      const menu=rowOf(page,name).locator('[data-more-menu]');
      await menu.waitFor({state:'visible',timeout:60000});
      return menu;
    };
    /** Walk the month picker to a YYYY-MM value and take it: the `‹ ›` years are part of the proof, and
        they are walked towards the value rather than forwards only, so a month in December works on a
        suite that runs in January. */
    const pickMonth=async(scope:Locator,name:string,value:string):Promise<void>=>{
      await scope.locator(`[data-month-choose="${name}"]`).click();
      await scope.locator('[data-month-year]').waitFor({state:'visible',timeout:60000});
      const cell=scope.locator(`[data-month-pick="${value}"]`);
      const year=Number(value.slice(0,4));
      for(let step=0;step<8&&await cell.count()===0;step++){
        const shown=Number(ascii(await scope.locator('[data-month-year]').innerText()));
        await scope.locator(shown>year?'[data-month-back]':'[data-month-forward]').click();
      }
      await cell.click();
    };
    /** Walk a picker to a year and leave it there, without taking a month. */
    const walkTo=async(scope:Locator,name:string,year:number):Promise<void>=>{
      await scope.locator(`[data-month-choose="${name}"]`).click();
      await scope.locator('[data-month-year]').waitFor({state:'visible',timeout:60000});
      for(let step=0;step<8;step++){
        const shown=Number(ascii(await scope.locator('[data-month-year]').innerText()));
        if(shown===year)return;
        await scope.locator(shown>year?'[data-month-back]':'[data-month-forward]').click();
      }
    };
    const noOverflow=async(page:Page,label:string):Promise<void>=>{
      const metrics=await page.evaluate(()=>({clientWidth:document.documentElement.clientWidth,
        scrollWidth:document.documentElement.scrollWidth}));
      assert.ok(metrics.scrollWidth<=metrics.clientWidth+1,
        `${label}: nothing overflows horizontally at ${metrics.clientWidth}px (scrollWidth ${metrics.scrollWidth})`);
    };

    const boss=await signIn();
    await gotoList(boss.page);
    assert.equal(await rowOf(boss.page,PAUSE_STUDENT).count(),1,'the student who has paid nothing is on the list');
    assert.equal(await rowOf(boss.page,SETTLED_STUDENT).count(),1,'and so is the one who has paid every month behind this');
    assert.equal(await rowOf(boss.page,LEGACY_STUDENT).count(),1,'and the one a pause was written for before pauses had months');
    await shot(boss.page,'s1-students-list-bn-1440');

    /* ── 1. the row's ⋯ offers the three doors, and each one is a sheet with a month in it ─────── */
    const menu=await openMore(boss.page,PAUSE_STUDENT);
    for(const [marker,label] of [['hold',c.hold],['transfer',doors.row.transfer],['fee',doors.row.fee]] as const)
      assert.ok((await menu.locator(`[data-more-${marker}]`).innerText()).includes(label),
        `the row's ⋯ offers ${label}`);
    await shot(boss.page,'s1-row-menu-bn-1440');

    /* ── 2. the pause: which month it takes effect from, and what it leaves owed ───────────────── */
    const beforePause=await owed(PAUSE_STUDENT);
    assert.equal(beforePause.months,thisMonthOwed?4:3,
      'every month from enrolment to Dhaka\'s own is owed before anything is written');
    assert.equal(beforePause.total,FEE*beforePause.months,'at the price the student enrolled on');
    await menu.locator('[data-more-hold]').click();
    const holdSheet=boss.page.locator('[data-hold-dialog]');
    await holdSheet.waitFor({state:'visible',timeout:60000});
    assert.ok((await holdSheet.locator('h2').innerText()).includes(doors.holdDoor.title),
      'the sheet the hold opens is the pause door, and it says so');
    assert.ok((await holdSheet.innerText()).includes(doors.holdDoor.month),
      'and it asks which month the pause takes effect from');
    assert.equal(await holdSheet.locator('[data-month-choose="fromMonth"]').count(),1,
      'the month is picked, not typed');
    assert.equal(await holdSheet.locator('[name="reason"]').count(),1,'and a reason is offered');
    assert.ok(await holdSheet.locator('[data-hold-submit]').isDisabled(),
      'the verb is a dead button until a month is picked: the field that carries it is hidden, so a '
      +'browser\'s own validation would never stop it');
    assert.equal(await boss.page.locator('input[type="month"]').count(),0,'with no native month box anywhere on the page');
    await shot(boss.page,'s1-hold-door-bn-1440');
    await pickMonth(holdSheet,'fromMonth',ym(HOLD_FROM));
    assert.ok(await holdSheet.locator('[data-hold-submit]').isEnabled(),'picking the month is what arms the verb');
    await holdSheet.locator('[name="reason"]').fill(PAUSE_REASON);
    await holdSheet.locator('[data-hold-submit]').click();
    await toast(boss.page,doors.row.holdOk).waitFor({state:'visible',timeout:TOAST_MS});
    await until(async()=>{
      const student=await stored(PAUSE_STUDENT);
      return student?.status==='on_hold'&&student.holds.length===1
        &&ym(student.holds[0].start)===ym(HOLD_FROM)&&!student.holds[0].end
        &&student.holds[0].reason===PAUSE_REASON;
    },'the pause to be written as a range of months with its reason');
    await until(async()=>await holdSheet.count()===0,'the sheet to close itself once the write lands');
    /* The finding: the months before the pause are still owed, and the row says so. */
    const whilePaused=await owed(PAUSE_STUDENT);
    assert.equal(whilePaused.total,FEE*2,'the two months before the pause are still owed while it runs');
    assert.deepEqual(whilePaused.keys,[ym(at(3)),ym(at(2))],
      'and the months inside the pause are billed by nobody — not this month, not ever');
    const pauseChip=rowOf(boss.page,PAUSE_STUDENT).locator('[data-dues-chip="due"]');
    await until(async()=>await pauseChip.count()===1,'the row to read the arrears a pause does not forgive');
    assert.ok((await pauseChip.innerText()).includes(formatNumber(FEE*2,'bn')),
      `the paused row carries what it owed before the pause (${await pauseChip.innerText()})`);
    assert.ok(banglaDigits(await pauseChip.innerText()),'in the operator\'s own digits');
    await pauseChip.click();
    const pauseMonths=rowOf(boss.page,PAUSE_STUDENT).locator('[data-dues-months]');
    await pauseMonths.waitFor({state:'visible',timeout:60000});
    assert.equal(await pauseMonths.locator('.pop-item').count(),2,
      'one line per month owed, and the months inside the pause are not among them');
    assert.ok((await pauseMonths.innerText()).includes(monthNames[at(2).month-1]),
      'named from the catalog\'s own month names');
    await shot(boss.page,'s1-dues-months-held-bn-1440');
    await boss.page.keyboard.press('Escape');
    /* A pause written by the flag this door replaced has no month on it, so the fee run cannot say
       which months it skipped. The row says "not counted" and names the way out, rather than reading
       "no dues" over a record nobody has placed — and rather than inventing a debt for the months the
       centre paused, which is what billing one from enrolment would do. */
    const legacyChip=rowOf(boss.page,LEGACY_STUDENT).locator('[data-dues-chip="none"]');
    assert.equal(await legacyChip.count(),1,'a pause with no month on the record is counted for nothing');
    await legacyChip.click();
    const legacyMonths=rowOf(boss.page,LEGACY_STUDENT).locator('[data-dues-months]');
    await legacyMonths.waitFor({state:'visible',timeout:60000});
    assert.ok((await legacyMonths.innerText()).includes(c.row.holdNoMonth),
      `and says why, with the way out of it (${await legacyMonths.innerText()})`);
    await shot(boss.page,'s1-legacy-hold-bn-1440');
    await boss.page.keyboard.press('Escape');
    const heldMenu=await openMore(boss.page,PAUSE_STUDENT);
    assert.ok((await heldMenu.innerText()).includes(monthLabel(HOLD_FROM)),
      'the ⋯ says which month the pause took effect from, where the verb is');
    assert.ok((await heldMenu.innerText()).includes(PAUSE_REASON),'and the reason the operator typed');
    await shot(boss.page,'s1-row-held-menu-bn-1440');
    await boss.page.keyboard.press('Escape');

    /* ── 3. both dues screens carry a paused student's earlier arrears ─────────────────────────── */
    await boss.page.goto(`${origin}/bn/admin/students/dues?class=${String(classA._id)}`,{waitUntil:'domcontentloaded',timeout:180000});
    /* The screen has two tables — the centre's summary and one class's list — so the wait names the
       panel it means. The match is exact because the summary's own heading ends in the same word. */
    const classPanel=boss.page.locator('section.admin-panel')
      .filter({has:boss.page.getByRole('heading',{name:bn.dues.list.overdueHeading,exact:true})});
    await classPanel.locator('table.admin-table tbody tr').first().waitFor({state:'visible',timeout:90000});
    assert.ok((await classPanel.innerText()).includes(PAUSE_STUDENT),
      'the class\'s own due list still names the student the centre paused');
    const pauseLine=classPanel.locator('tbody tr',{hasText:PAUSE_STUDENT}).first();
    assert.ok(ascii(await pauseLine.innerText()).includes(formatNumber(FEE*2,'en')),
      'and carries the two months before the pause, not the months inside it');
    assert.equal(await classPanel.locator('table.admin-table tbody tr').count(),1,
      'and it is the only line: a pause with no month on it is on no due list, because a line on that '
      +'list is a demand, and there is no month to demand for');
    assert.ok(!(await classPanel.innerText()).includes(LEGACY_STUDENT),'which is the student the record has not placed');
    const summaryLine=boss.page.locator(`[data-dues-summary-row="${String(classA._id)}"]`);
    const summaryCells=await summaryLine.locator('td').allInnerTexts();
    assert.equal(ascii(summaryCells[3]).trim(),String(FEE*2),
      'the all-class summary carries the same money, paused student included');
    assert.equal(ascii(summaryCells[0]).trim(),'1','while counting one student running, because the other is paused');
    assert.equal(ascii(summaryCells[1]).trim(),'1','and one owing');
    await shot(boss.page,'s1-dues-held-bn-1440');
    const summaryRead=await liveClassDueSummary();
    assert.equal(summaryRead.rows.find(entry=>entry.classId===String(classA._id))?.total,FEE*2,
      'the read behind the panel is the number the panel paints');


    /* ── 3b. the cash desk still takes the arrears a pause leaves behind ───────────────────────── */
    /* F-01's finding is that arrears vanished while a student was paused. Making them visible again
       is half of it: a number an operator cannot collect is a number the centre never receives, and
       the desk used to close every month cell the moment a student's status said on_hold. What a
       pause closes is the months INSIDE it — the cell's own status says that — so the gate is the
       month's, not the student's, and the months owed before the pause stay open. */
    await boss.page.goto(`${origin}/bn/admin/students/collect?student=${String(paused._id)}`,{waitUntil:'domcontentloaded',timeout:180000});
    await boss.page.locator('.daily-student').waitFor({state:'visible',timeout:90000});
    assert.ok((await boss.page.locator('.daily-student').innerText()).includes(PAUSE_STUDENT),
      'the cash desk opens for a paused student rather than refusing to load one');
    assert.equal(await boss.page.locator('.daily-months button.daily-month').count(),12,
      'and lays the year\u2019s twelve months out as cells an operator picks from');
    assert.ok((await boss.page.locator('body').innerText()).includes(bn.daily.heldNote),
      'with the sentence that says what a pause does here: the months inside it are not billed');
    const heldCells=boss.page.locator('.daily-months button.daily-held');
    assert.ok(await heldCells.count()>=1,'the months inside the pause are on the grid');
    for(const cell of await heldCells.all())
      assert.ok(await cell.isDisabled(),'and every one of them is closed: a held month is never billed, so it is never taken');
    if(at(2).year===at(0).year){
      const owedCells=boss.page.locator('.daily-months button.daily-due');
      assert.equal(await owedCells.count(),2,'the two months before the pause are owed on this desk too');
      for(const cell of await owedCells.all())
        assert.ok(await cell.isEnabled(),'and each of them is open, because a pause does not forgive what ran up before it');
      const deskTotal=boss.page.locator('.daily-total');
      assert.ok(!(ascii(await deskTotal.innerText()).includes(formatNumber(FEE,'en'))),
        'nothing is on the receipt before a month is picked');
      await owedCells.first().click();
      await boss.page.locator('.daily-months button.daily-due.chosen').first().waitFor({state:'visible',timeout:60000});
      await until(async()=>ascii(await deskTotal.innerText().catch(()=>'')).includes(formatNumber(FEE,'en')),
        'the month an operator picks to carry its own amount onto the receipt');
    }
    assert.ok(await boss.page.locator('button.daily-save').isEnabled(),
      'and the pause no longer deadens Save: the desk takes the money the student still owes');
    await shot(boss.page,'s1-collect-held-bn-1440');
    /* Nothing is written here — the suite reloads away from the desk with the month still only picked,
       so the money the later sections count is the money the rules say is owed and not a receipt this
       section invented. */
    await boss.page.goto(`${origin}/bn/admin/students/dues?class=${String(classA._id)}`,{waitUntil:'domcontentloaded',timeout:180000});
    /* ── 4. lifting the pause: which month the student resumes, and nothing billed twice ───────── */
    await gotoList(boss.page);
    await rowOf(boss.page,PAUSE_STUDENT).locator('[data-status-badge]').click();
    const statusMenu=rowOf(boss.page,PAUSE_STUDENT).locator('[data-status-menu]');
    await statusMenu.waitFor({state:'visible',timeout:60000});
    assert.equal(await statusMenu.locator('[data-status-option="active"]').count(),1,
      'the badge is still the switch an operator reaches for');
    await statusMenu.locator('[data-status-option="active"]').click();
    const liftSheet=boss.page.locator('[data-hold-dialog]');
    await liftSheet.waitFor({state:'visible',timeout:60000});
    assert.ok((await liftSheet.locator('h2').innerText()).includes(doors.holdDoor.liftTitle),
      'and it now opens the lifting door, which says it is a lifting');
    assert.equal(await liftSheet.locator('[data-month-choose="resume"]').count(),1,
      'which asks for the month the student resumes in — a lift with no month in it is the flag this replaced');
    await walkTo(liftSheet,'resume',HOLD_FROM.year);
    assert.ok(await liftSheet.locator(`[data-month-pick="${ym(HOLD_FROM)}"]`).isDisabled(),
      'and the picker will not offer a resume month inside the pause: a range cannot end before it began');
    await shot(boss.page,'s1-lift-door-bn-1440');
    await liftSheet.locator('[data-month-choose="resume"]').click();
    await pickMonth(liftSheet,'resume',ym(RESUME));
    await liftSheet.locator('[data-hold-submit]').click();
    await toast(boss.page,doors.row.unholdOk).waitFor({state:'visible',timeout:TOAST_MS});
    await until(async()=>{
      const student=await stored(PAUSE_STUDENT);
      return student?.status==='active'&&student.holds.length===1&&ym(student.holds[0].end||{year:0,month:0})===ym(THIS);
    },'the lift to close the range at the month before the resume');
    assert.deepEqual(await owed(PAUSE_STUDENT),whilePaused,
      'lifting the pause back-bills nothing: the months inside the closed range are owed by nobody');
    await until(async()=>(await rowOf(boss.page,PAUSE_STUDENT).locator('[data-dues-chip]').innerText())
      .includes(formatNumber(FEE*2,'bn')),'the row to read the same number after the lift as before it');
    const holdLog=await CenterActivityLog.findOne({action:'student.hold',target:paused._id})
      .lean<{actor:unknown;after:{fromMonth:string;reason:string}}|null>();
    assert.equal(String(holdLog?.actor),String(bossId),'the pause writes its audit line against the operator');
    assert.equal(holdLog?.after.fromMonth,ym(HOLD_FROM),'carrying the month it took effect from');
    assert.equal(holdLog?.after.reason,PAUSE_REASON,'and the reason');
    const liftLog=await CenterActivityLog.findOne({action:'student.unhold',target:paused._id})
      .lean<{after:{resumeMonth:string;heldUntil:string}}|null>();
    assert.equal(liftLog?.after.resumeMonth,ym(RESUME),'the lift carries the month the student resumed in');
    assert.equal(liftLog?.after.heldUntil,ym(THIS),'and the last month the centre did not bill');

    /* ── 5. the move: the classes the centre runs, a month, and a timeline ─────────────────────── */
    const moveMenu=await openMore(boss.page,PAUSE_STUDENT);
    await moveMenu.locator('[data-more-transfer]').click();
    const moveSheet=boss.page.locator('[data-transfer-dialog]');
    await moveSheet.waitFor({state:'visible',timeout:60000});
    assert.ok((await moveSheet.locator('h2').innerText()).includes(doors.transferDoor.title),'the sheet is the move door');
    const optionValues=await moveSheet.locator('[data-transfer-class] option')
      .evaluateAll(nodes=>nodes.map(node=>(node as HTMLOptionElement).value));
    assert.deepEqual(optionValues,['',String(classB._id)],
      'the list is a "choose a class" line and the class the student can move to');
    const optionText=await moveSheet.locator('[data-transfer-class]').innerText();
    assert.ok(optionText.includes(CLASS_B),'which is the class the centre runs for them');
    assert.ok(!optionText.includes(CLASS_A),'and not the one they are already sitting in: a move to it is not a move');
    assert.ok(await moveSheet.locator('[data-transfer-submit]').isDisabled(),
      'and nothing is written until a class and a month are picked');
    await shot(boss.page,'s1-transfer-door-bn-1440');
    await moveSheet.locator('[data-transfer-class]').selectOption(String(classB._id));
    await pickMonth(moveSheet,'month',ym(THIS));
    await moveSheet.locator('[name="reason"]').fill(MOVE_REASON);
    await moveSheet.locator('[data-transfer-submit]').click();
    await toast(boss.page,doors.transferDoor.ok).waitFor({state:'visible',timeout:TOAST_MS});
    await until(async()=>{
      const student=await stored(PAUSE_STUDENT);
      return !!student&&String(student.classGroup)===String(classB._id)&&student.classHistory.length===2;
    },'the move to write the timeline and move the roll');
    const moved=(await stored(PAUSE_STUDENT))!;
    assert.equal(ym(moved.classHistory[0].effectiveFrom),ym(START),
      'the first line is the class the student left, from the month they enrolled — the timeline starts '
      +'at the beginning, not at the first change anybody happened to make');
    assert.equal(moved.classHistory[0].name?.bn,CLASS_A,
      'carrying the name that class wore, so the line reads without a join to another collection');
    assert.equal(String(moved.classHistory[1].classGroup),String(classB._id),'the second line is the move itself');
    assert.equal(ym(moved.classHistory[1].effectiveFrom),ym(THIS),'from the month the operator picked');
    assert.equal(moved.classHistory[1].reason,MOVE_REASON,'with the reason');
    assert.equal(String(moved.classHistory[1].changedBy),String(bossId),'and who made it');
    assert.equal(await CenterStudent.countDocuments({classGroup:classB._id,studentId:'S1-PAUSE'}),1,
      'the roll the class page reads now holds the student');
    assert.equal(await CenterStudent.countDocuments({classGroup:classA._id,studentId:'S1-PAUSE'}),0,
      'and the class they left no longer does');
    await until(async()=>(await rowOf(boss.page,PAUSE_STUDENT).locator('.student-sub').innerText()).includes(CLASS_B),
      'the row to read the class the student moved to');
    /* The money moves with the student: one class is left with the payer, the other inherits the arrears. */
    assert.equal((await owed(PAUSE_STUDENT)).total,FEE*2,'the arrears are the same money in the class the student arrived on');
    const summaryAfterMove=(await liveClassDueSummary()).rows.find(entry=>entry.classId===String(classB._id));
    assert.equal(summaryAfterMove?.total,FEE*2,'and the summary puts them on the new class\'s line');
    assert.equal(summaryAfterMove?.active,0,
      'a class whose only student is paused runs nobody today and is still owed what they left behind');
    const transferLog=await CenterActivityLog.findOne({action:'student.transfer',target:paused._id})
      .lean<{before:{classGroup:string};after:{classGroup:string;effectiveMonth:string;reason:string}}|null>();
    assert.equal(transferLog?.before.classGroup,String(classA._id),'the move writes where the student was');
    assert.equal(transferLog?.after.classGroup,String(classB._id),'where they are now');
    assert.equal(transferLog?.after.effectiveMonth,ym(THIS),'from which month');
    assert.equal(transferLog?.after.reason,MOVE_REASON,'and why');

    /* ── 6. the price: refused over a settled month, and free for a month nobody has reached ───── */
    const beforePrice=await owed(SETTLED_STUDENT);
    assert.equal(beforePrice.total,0,'the settled student owes nothing on the day this suite runs');
    assert.equal(await CenterPayment.countDocuments({student:settled._id,status:'valid'}),4,
      'because every month up to and including Dhaka\'s own has a receipt on it');
    const feeMenu=await openMore(boss.page,SETTLED_STUDENT);
    await feeMenu.locator('[data-more-fee]').click();
    const feeSheet=boss.page.locator('[data-fee-dialog]');
    await feeSheet.waitFor({state:'visible',timeout:60000});
    assert.ok((await feeSheet.locator('h2').innerText()).includes(doors.feeDoor.title),'the sheet is the price door');
    assert.ok(ascii(await feeSheet.locator('[data-fee-now]').innerText()).includes(formatNumber(FEE,'en')),
      'and it says what the student is on now, so a change is a decision rather than a guess');
    assert.ok(await feeSheet.locator('[data-fee-submit]').isDisabled(),'with nothing written until a month is picked');
    await shot(boss.page,'s1-fee-door-bn-1440');
    await feeSheet.locator('[data-fee-amount]').fill(String(RAISED));
    await pickMonth(feeSheet,'month',ym(LAST));
    await feeSheet.locator('[name="reason"]').fill(FEE_REASON);
    await feeSheet.locator('[data-fee-submit]').click();
    await feeSheet.locator('[data-fee-feedback]').waitFor({state:'visible',timeout:60000});
    const refusal=await feeSheet.locator('[data-fee-feedback]').innerText();
    assert.equal(refusal.trim(),doors.feeDoor.settledMonth.replace('{month}',monthLabel(LAST)).trim(),
      'a price is refused for a month the centre has taken money for, and the refusal names that month '
      +'in the operator\'s own words and digits rather than answering "a month is settled"');
    assert.equal((await stored(SETTLED_STUDENT))!.feeHistory.length,1,'a refusal writes nothing');
    assert.equal(await feeSheet.locator('[data-fee-amount]').inputValue(),String(RAISED),
      'and leaves the sheet open with what the operator typed still in it');
    await shot(boss.page,'s1-fee-refused-bn-1440');
    /* A month nobody has reached is a month a price may be written for — and it changes nothing today. */
    await pickMonth(feeSheet,'month',ym(RESUME));
    await feeSheet.locator('[data-fee-submit]').click();
    await toast(boss.page,doors.feeDoor.ok).waitFor({state:'visible',timeout:TOAST_MS});
    await until(async()=>(await stored(SETTLED_STUDENT))!.feeHistory.length===2,
      'the price to be a line added to the history');
    const priced=(await stored(SETTLED_STUDENT))!.feeHistory;
    assert.equal(priced[0].amount,FEE,'the price the settled months were billed at is untouched');
    assert.equal(ym(priced[0].effectiveFrom),ym(START),'and so is the month it took effect from');
    assert.equal(priced[1].amount,RAISED,'the new price is the line the door added');
    assert.equal(ym(priced[1].effectiveFrom),ym(RESUME),'from the month the operator picked');
    assert.equal(priced[1].reason,FEE_REASON,'with the reason beside it');
    assert.equal(String(priced[1].changedBy),String(bossId),'and who changed it');
    assert.deepEqual(await owed(SETTLED_STUDENT),beforePrice,
      'a price written for a month nobody has reached changes nothing that is owed today');
    const settledReceipts=await CenterPayment.find({student:settled._id}).sort({academicYear:1,month:1})
      .lean<{amount:number}[]>();
    assert.deepEqual(settledReceipts.map(receipt=>receipt.amount),[FEE,FEE,FEE,FEE],
      'and not one settled month was re-priced by a change that came after it');
    const feeLog=await CenterActivityLog.findOne({action:'student.fee',target:settled._id})
      .lean<{before:{amount:number};after:{amount:number;effectiveMonth:string;reason:string}}|null>();
    assert.equal(feeLog?.before.amount,FEE,'the price change writes the price it replaced');
    assert.equal(feeLog?.after.amount,RAISED,'the price it wrote');
    assert.equal(feeLog?.after.effectiveMonth,ym(RESUME),'from which month');
    assert.equal(feeLog?.after.reason,FEE_REASON,'and why');

    /* ── 7. the profile carries the same doors and prints both histories ───────────────────────── */
    await boss.page.goto(`${origin}/bn/admin/students/${String(paused._id)}`,{waitUntil:'domcontentloaded',timeout:180000});
    await boss.page.locator('[data-profile-actions]').waitFor({timeout:60000});
    assert.equal(await boss.page.locator('[data-profile-transfer]').count(),1,'the profile has its own move door');
    assert.equal(await boss.page.locator('[data-profile-fee]').count(),1,'and its own price door');
    const steps=boss.page.locator('[data-class-history] [data-class-step]');
    assert.equal(await steps.count(),2,'and it prints the classes the student has sat in, month by month');
    const timeline=await steps.allInnerTexts();
    assert.ok(timeline[0].includes(CLASS_A)&&timeline[0].includes(monthLabel(START)),
      `the first line is the class they were in, from the month they enrolled (${timeline[0]})`);
    assert.ok(timeline[1].includes(CLASS_B)&&timeline[1].includes(MOVE_REASON),
      `and the second is the move, with the reason the operator typed (${timeline[1]})`);
    const holdLines=boss.page.locator('[data-student-holds] [data-hold-step]');
    assert.equal(await holdLines.count(),1,'the months the fee run skipped are printed too');
    const holdLine=await holdLines.first().innerText();
    assert.ok(holdLine.includes(monthLabel(HOLD_FROM))&&holdLine.includes(monthLabel(THIS))&&holdLine.includes(PAUSE_REASON),
      `the pause is read as a range of months with its reason, not as a flag (${holdLine})`);
    assert.ok((await boss.page.locator('[data-student-holds]').innerText()).includes(doors.history.holdHelp),
      'and the panel says what a paused month means: it is never billed, not even now');
    await shot(boss.page,'s1-profile-history-bn-1440',true);
    /* The profile's badge opens the same pause sheet the row's does. */
    await boss.page.locator('[data-profile-status] [data-status-badge]').click();
    await boss.page.locator('[data-profile-status] [data-status-option="on_hold"]').click();
    const profileHold=boss.page.locator('[data-hold-dialog]');
    await profileHold.waitFor({state:'visible',timeout:60000});
    assert.equal(await profileHold.locator('[data-month-choose="fromMonth"]').count(),1,
      'one implementation, two ways in: the profile asks the same question');
    await shot(boss.page,'s1-hold-door-profile-bn-1440');
    await profileHold.locator('[data-hold-close]').click();
    await until(async()=>await profileHold.count()===0,'the sheet to go when the operator leaves it');
    assert.equal((await stored(PAUSE_STUDENT))!.status,'active','and closing a sheet writes nothing');
    await boss.page.locator('[data-profile-transfer]').click();
    const profileMove=boss.page.locator('[data-transfer-dialog]');
    await profileMove.waitFor({state:'visible',timeout:60000});
    assert.ok((await profileMove.locator('[data-transfer-class]').innerText()).includes(CLASS_A),
      'the profile\'s move door offers the class the student left, because that is now another class');
    await shot(boss.page,'s1-transfer-door-profile-bn-1440');
    await profileMove.locator('[data-transfer-close]').click();
    await until(async()=>await profileMove.count()===0,'the move sheet to go');
    await boss.page.locator('[data-profile-fee]').click();
    const profileFee=boss.page.locator('[data-fee-dialog]');
    await profileFee.waitFor({state:'visible',timeout:60000});
    assert.ok(ascii(await profileFee.locator('[data-fee-now]').innerText()).includes(formatNumber(FEE,'en')),
      'and the profile\'s price door quotes the price this student is on');
    await shot(boss.page,'s1-fee-door-profile-bn-1440');
    await profileFee.locator('[data-fee-close]').click();
    await until(async()=>await profileFee.count()===0,'the price sheet to go');
    assert.deepEqual(boss.errors,[],'the three doors were driven in Bangla without a client-side error');
    await boss.context.close();

    /* ── 8. a phone: the same three sheets at 360 px, and nothing overflowing ──────────────────── */
    const phone=await signIn(360);
    await gotoList(phone.page);
    await noOverflow(phone.page,'the students list at 360px');
    const phoneRow=rowOf(phone.page,PAUSE_STUDENT);
    const phoneMenu=await openMore(phone.page,SETTLED_STUDENT);
    await phoneMenu.locator('[data-more-fee]').click();
    const phoneFee=phone.page.locator('[data-fee-dialog]');
    await phoneFee.waitFor({state:'visible',timeout:60000});
    await noOverflow(phone.page,'the price sheet at 360px');
    await shot(phone.page,'s1-fee-door-bn-360');
    await phoneFee.locator('[data-fee-close]').click();
    await until(async()=>await phoneFee.count()===0,'the price sheet to go at 360px');
    const phoneMenu2=await openMore(phone.page,SETTLED_STUDENT);
    await phoneMenu2.locator('[data-more-transfer]').click();
    const phoneMove=phone.page.locator('[data-transfer-dialog]');
    await phoneMove.waitFor({state:'visible',timeout:60000});
    await noOverflow(phone.page,'the move sheet at 360px');
    await shot(phone.page,'s1-transfer-door-bn-360');
    await phoneMove.locator('[data-transfer-close]').click();
    await until(async()=>await phoneMove.count()===0,'the move sheet to go at 360px');
    await phoneRow.locator('[data-status-badge]').click();
    await phoneRow.locator('[data-status-option="on_hold"]').click();
    const phoneHold=phone.page.locator('[data-hold-dialog]');
    await phoneHold.waitFor({state:'visible',timeout:60000});
    await noOverflow(phone.page,'the pause sheet at 360px');
    await shot(phone.page,'s1-hold-door-bn-360');
    await phoneHold.locator('[data-hold-close]').click();
    await until(async()=>await phoneHold.count()===0,'the pause sheet to go at 360px');
    assert.deepEqual(phone.errors,[],'and no client-side error on a phone');
    await phone.context.close();

    /* ── 9. the same three doors in English, where one of them writes ──────────────────────────── */
    const english=await signIn(1440,'en');
    await gotoList(english.page,'/en/admin/students');
    const enRow=rowOf(english.page,SETTLED_EN);
    await enRow.locator('.student-act .pop-more .pop-anchor').click();
    const enMenu=enRow.locator('[data-more-menu]');
    await enMenu.waitFor({state:'visible',timeout:60000});
    for(const [marker,label] of [['hold',en.hold],['transfer',enDoors.row.transfer],['fee',enDoors.row.fee]] as const)
      assert.ok((await enMenu.locator(`[data-more-${marker}]`).innerText()).includes(label),
        `the English row offers ${label}`);
    await enMenu.locator('[data-more-fee]').click();
    const enFee=english.page.locator('[data-fee-dialog]');
    await enFee.waitFor({state:'visible',timeout:60000});
    assert.ok((await enFee.locator('h2').innerText()).includes(enDoors.feeDoor.title),'the English price door says what it is');
    assert.ok((await enFee.innerText()).includes(enDoors.feeDoor.month),'and asks its question in English');
    const enNow=await enFee.locator('[data-fee-now]').innerText();
    assert.ok(!banglaDigits(enNow),`with the price it quotes in English digits (${enNow})`);
    assert.ok(enNow.includes(formatNumber(FEE,'en'))&&!enNow.includes(formatNumber(RAISED,'en')),
      'which is the price in effect today, not the line the Bangla run added for a month that has not arrived');
    await shot(english.page,'s1-fee-door-en-1440');
    await enFee.locator('[data-fee-close]').click();
    await until(async()=>await enFee.count()===0,'the English price sheet to go');
    await enRow.locator('.student-act .pop-more .pop-anchor').click();
    await enMenu.waitFor({state:'visible',timeout:60000});
    await enMenu.locator('[data-more-transfer]').click();
    const enMove=english.page.locator('[data-transfer-dialog]');
    await enMove.waitFor({state:'visible',timeout:60000});
    assert.ok((await enMove.innerText()).includes(enDoors.transferDoor.class),'the English move door asks for the class');
    assert.ok((await enMove.locator('[data-transfer-class]').innerText()).includes('S1 Class Nine'),
      'and reads the class it offers in English, from the class\'s own English name');
    await shot(english.page,'s1-transfer-door-en-1440');
    await enMove.locator('[data-transfer-close]').click();
    await until(async()=>await enMove.count()===0,'the English move sheet to go');
    /* The pause door writes in English too, so the proof is a write and not only a photograph. */
    await enRow.locator('[data-status-badge]').click();
    await enRow.locator('[data-status-option="on_hold"]').click();
    const enHold=english.page.locator('[data-hold-dialog]');
    await enHold.waitFor({state:'visible',timeout:60000});
    assert.ok((await enHold.locator('h2').innerText()).includes(enDoors.holdDoor.title),'the English badge opens the pause door');
    assert.ok((await enHold.innerText()).includes(enDoors.holdDoor.month),'which asks the effective month in English');
    await shot(english.page,'s1-hold-door-en-1440');
    await pickMonth(enHold,'fromMonth',ym(THIS));
    await enHold.locator('[name="reason"]').fill('S1 English pause');
    await enHold.locator('[data-hold-submit]').click();
    await toast(english.page,enDoors.row.holdOk).waitFor({state:'visible',timeout:TOAST_MS});
    await until(async()=>{
      const student=await stored(SETTLED_STUDENT);
      return student?.status==='on_hold'&&student.holds.length===1&&ym(student.holds[0].start)===ym(THIS);
    },'the English door to write the same kind of range');
    /* …and a pause does not undo a receipt either: the settled months are still settled. */
    assert.deepEqual((await owed(SETTLED_STUDENT)).keys,[],
      'a pause from this month leaves the four settled months settled and bills nothing new');
    const enRow2=rowOf(english.page,PAUSE_EN);
    await english.page.setViewportSize({width:360,height:900});
    await gotoList(english.page,'/en/admin/students');
    await enRow2.locator('.student-act .pop-more .pop-anchor').click();
    const enMenu2=enRow2.locator('[data-more-menu]');
    await enMenu2.waitFor({state:'visible',timeout:60000});
    await enMenu2.locator('[data-more-fee]').click();
    const enFee2=english.page.locator('[data-fee-dialog]');
    await enFee2.waitFor({state:'visible',timeout:60000});
    await noOverflow(english.page,'the English price sheet at 360px');
    await shot(english.page,'s1-fee-door-en-360');
    await enFee2.locator('[data-fee-close]').click();
    await until(async()=>await enFee2.count()===0,'the English price sheet to go at 360px');
    await enRow2.locator('.student-act .pop-more .pop-anchor').click();
    await enMenu2.waitFor({state:'visible',timeout:60000});
    await enMenu2.locator('[data-more-transfer]').click();
    const enMove2=english.page.locator('[data-transfer-dialog]');
    await enMove2.waitFor({state:'visible',timeout:60000});
    await noOverflow(english.page,'the English move sheet at 360px');
    await shot(english.page,'s1-transfer-door-en-360');
    await enMove2.locator('[data-transfer-close]').click();
    await until(async()=>await enMove2.count()===0,'the English move sheet to go at 360px');
    await enRow2.locator('[data-status-badge]').click();
    await enRow2.locator('[data-status-option="on_hold"]').click();
    const enHold2=english.page.locator('[data-hold-dialog]');
    await enHold2.waitFor({state:'visible',timeout:60000});
    await noOverflow(english.page,'the English pause sheet at 360px');
    await shot(english.page,'s1-hold-door-en-360');
    await enHold2.locator('[data-hold-close]').click();
    await until(async()=>await enHold2.count()===0,'the English pause sheet to go');
    assert.equal((await stored(PAUSE_STUDENT))!.status,'active','and the English sheet wrote nothing on the way out');
    assert.deepEqual(english.errors,[],'and no client-side error in English at either width');
    await english.context.close();

    console.log('Student money doors: a pause asks its month and leaves the arrears before it on the row, on the '
      +'class due list and on the all-class summary; lifting one asks a resume month it cannot pick inside the pause '
      +'and back-bills nothing; a move writes the class timeline and moves the roll with the money; a price is refused '
      +'over a settled month with that month named and writes a line for a month nobody has reached; and all three '
      +'doors read the same in Bangla and English at 360px and 1440px.');
  }finally{
    await browser.close();
    await mongoose.disconnect();
    if(!shared)await mongo.stop();
  }
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
