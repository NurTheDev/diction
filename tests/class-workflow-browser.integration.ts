/**
 * S2 · the class workflow in the browser: one editor, a fee that says which of two things it is, a class
 * that cannot be closed while children are on it, a hub that answers for a closed class and for a wrong
 * address, and a removal that asks where the student comes back to.
 *
 * The rules behind these screens are proved without a browser (tests/class-workflow-core.test.ts) and
 * against a disposable database (tests/class-workflow-db.integration.ts). What only a browser can settle
 * is the other half of each finding: that the ONE editor is the editor every surface renders — the board's
 * sheet, the list's fold and the create box, with every field a class has on all three — that a fee arrives
 * as two facts and leaves as two facts, that a refusal is printed where the operator is looking with the
 * count in their own digits and their draft still in the boxes, that a closed class says so instead of
 * offering enrolment, that a wrong address lists every class instead of dead-ending, that a list keeps the
 * page the operator walked to when a write re-reads it, and that a restore with nowhere to go back to asks
 * which running class the student comes back to — and only then.
 *
 * Driven in Bangla and then in English at 1440 px, and on a phone at 360 px. Photographed into
 * screenshots/s2.
 *
 * Run: npm run test:s2:screens (needs the app and a database: npm run test-mode)
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
import {CenterActivityLog,CenterClassGroup,CenterStudent} from '../src/models/CenterRecords';
import {dhakaCalendar} from '../src/lib/center/month-status';
import bnMessages from '../src/messages/bn.json';
import enMessages from '../src/messages/en.json';

/* The catalogs are imported with their literal types, so the groups this suite reads are widened once
   here rather than cast at every assertion. */
type Copy={classAdmin:Record<string,string>;center:{hub:Record<string,string>;restore:Record<string,string>;
  row:Record<string,string>} & Record<string,string>};
const BN=(bnMessages as unknown as Copy),EN=(enMessages as unknown as Copy);
const caBn=BN.classAdmin,caEn=EN.classAdmin,hubBn=BN.center.hub,hubEn=EN.center.hub;
const restoreBn=BN.center.restore,restoreEn=EN.center.restore;

const SHOTS=path.join('screenshots','s2');
const FEE=1000,NEW_FEE=1800,CLOSED_FEE=800,ENROL_FEE=900,ROLL_COUNT=25;
const NINE='S2 নবম শ্রেণি',NINE_EN='S2 Class Nine';
const TEN='S2 দশম শ্রেণি',TEN_EN='S2 Class Ten';
const FREE='S2 ফ্রি কোচিং',FREE_EN='S2 Free Coaching';
const CLOSED='S2 বন্ধ শ্রেণি',CLOSED_EN='S2 Closed Class';
/** A class written before the shift boxes existed: a word, and no keys at all. */
const LEGACY='S2 পুরোনো শ্রেণি',LEGACY_EN='S2 Legacy Class';
/** The class this suite creates through the one editor, and then closes because nobody is on it. */
const NEW_CLASS='S2 সন্ধ্যা ব্যাচ',NEW_CLASS_EN='S2 Evening Batch';
const ONE='S2 এক শিক্ষার্থী',PAUSED='S2 বিরতি শিক্ষার্থী';
const REMOVED_A='S2 অপসারিত এক',REMOVED_B='S2 অপসারিত দুই',REMOVED_C='S2 অপসারিত তিন';
const TEACHER='S2 শিক্ষক';
const ROOM_EDIT='Room-9B',NEW_ROOM='Room-202';
const RESTORE_REASON='S2 ভর্তি ফেরানো হলো';

/** Bangla digits read as ASCII ones, so an assertion can count either. */
const ascii=(text:string):string=>text.replace(/[\u09e6-\u09ef]/g,ch=>String(ch.charCodeAt(0)-0x09e6));
/** ASCII digits written as Bangla ones: the digits a Bangla screen prints a count in. */
const toBn=(text:string):string=>text.replace(/[0-9]/g,ch=>String.fromCharCode(0x09e6+Number(ch)));
const ym=(value:{year:number;month:number}):string=>`${value.year}-${String(value.month).padStart(2,'0')}`;
/** The refusal's own sentence, in the language being read, with the count in that language's digits. */
const refused=(count:number,digits:'bn'|'en'):string=>
  (digits==='bn'?caBn:caEn).archiveRefused.replace('{count}',digits==='bn'?toBn(String(count)):String(count));

type StoredClass={_id:mongoose.Types.ObjectId;name:{bn:string;en?:string};level:string;room:string;shift:string;
  shifts:string[];academicYear:number;active:boolean;monthlyFee:number;feeFree:boolean;
  teachers:mongoose.Types.ObjectId[]};
type StoredStudent={_id:mongoose.Types.ObjectId;studentId:string;status:string;classGroup:mongoose.Types.ObjectId;
  classHistory:{classGroup:mongoose.Types.ObjectId;name?:{bn:string;en?:string};
    effectiveFrom:{year:number;month:number}}[];removal?:{leaveDate?:string;purgeAt?:Date}|null};
const readClass=(id:unknown):Promise<StoredClass|null>=>CenterClassGroup.findOne({_id:id}).lean<StoredClass|null>();
const classNamed=(nameBn:string):Promise<StoredClass|null>=>CenterClassGroup.findOne({'name.bn':nameBn}).lean<StoredClass|null>();

async function run(){
  await preflight({mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,
    test:'tests/class-workflow-browser.integration.ts — the class workflow the centre runs its term on'});
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

  /* A world of its own: five classes — one priced, one nobody has priced, one the centre runs for free,
     one it has closed, and one written before the shift boxes existed — a teacher to assign, two children
     on the priced class (one of them paused, because a pause is a seat kept), a roll of twenty-five on the
     unpriced one so the list has a second page, and three removals: two filed against the closed class,
     which is the case F-12 exists for, and one against a class that is still running, which is the case
     the door must stay quiet about. */
  await CenterStudent.deleteMany({});
  await CenterClassGroup.deleteMany({});
  await CenterActivityLog.deleteMany({});
  await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});
  const today=dhakaCalendar(new Date());
  const at=(back:number):{year:number;month:number}=>{
    const index=today.year*12+today.month-1-back;
    return {year:Math.floor(index/12),month:(index%12)+1};
  };
  const START=at(3),THIS=at(0),LAST=at(1);
  const password=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(password,12);
  const email='s2-boss@example.test',teacherEmail='s2-teacher@example.test';
  await User.deleteMany({email:{$in:[email,teacherEmail]}});
  await User.create({name:'S2 অ্যাডমিন',email,passwordHash:hash,role:'admin',active:true});
  await User.create({name:TEACHER,email:teacherEmail,passwordHash:hash,role:'teacher',active:true});
  const bossId=(await User.findOne({email}).lean<{_id:mongoose.Types.ObjectId}>())!._id;
  const teacherId=String((await User.findOne({email:teacherEmail}).lean<{_id:mongoose.Types.ObjectId}>())!._id);

  const nine=await CenterClassGroup.create({name:{bn:NINE,en:NINE_EN},level:'নবম শ্রেণি',shift:'সকাল',
    shifts:['morning'],room:'Room-9',academicYear:today.year,active:true,monthlyFee:FEE});
  const ten=await CenterClassGroup.create({name:{bn:TEN,en:TEN_EN},level:'দশম শ্রেণি',shift:'দুপুর',
    shifts:['day'],room:'Room-10',academicYear:today.year,active:true,monthlyFee:0});
  const free=await CenterClassGroup.create({name:{bn:FREE,en:FREE_EN},level:'একাদশ শ্রেণি',shift:'সন্ধ্যা',
    shifts:['evening'],room:'Room-11',academicYear:today.year,active:true,monthlyFee:0,feeFree:true});
  const closed=await CenterClassGroup.create({name:{bn:CLOSED,en:CLOSED_EN},level:'নবম শ্রেণি',shift:'সকাল',
    shifts:['morning'],room:'Room-12',academicYear:today.year-1,active:false,monthlyFee:CLOSED_FEE});
  /* F-08's legacy shape: the word a class wore before the boxes existed, and no keys to match it. */
  const legacy=await CenterClassGroup.create({name:{bn:LEGACY,en:LEGACY_EN},level:'দশম শ্রেণি',shift:'সন্ধ্যা',
    shifts:[],room:'Room-13',academicYear:today.year,active:true,monthlyFee:700});
  const nineId=String(nine._id),tenId=String(ten._id),freeId=String(free._id),closedId=String(closed._id),
    legacyId=String(legacy._id);
  const feeHistory=[{effectiveFrom:START,amount:FEE}];
  const student=(fields:Record<string,unknown>):Promise<unknown>=>CenterStudent.create({
    startMonth:START,admissionDate:`${ym(START)}-05`,guardianName:'অভিভাবক',feeHistory,...fields});
  await student({studentId:'S2-ONE',name:{bn:ONE,en:'S2 one'},classGroup:nine._id,guardianPhone:'01711000401',
    roll:'1',status:'active'});
  /* A paused child is still on the class: F-05 counts them, and the hub's own enrolled count does not. */
  await student({studentId:'S2-PAUSED',name:{bn:PAUSED,en:'S2 paused'},classGroup:nine._id,
    guardianPhone:'01711000402',roll:'2',status:'on_hold',
    holds:[{start:LAST,reason:'S2 পরীক্ষা',recordedBy:bossId}]});
  const roll:unknown[]=[];
  for(let index=1;index<=ROLL_COUNT;index++){
    const label=String(index).padStart(2,'0');
    roll.push({studentId:`S2-ROLL-${label}`,name:{bn:`S2 তালিকা ${label}`,en:`S2 roll ${label}`},
      classGroup:ten._id,startMonth:START,admissionDate:`${ym(START)}-05`,guardianName:'অভিভাবক',
      guardianPhone:`017110004${label}`,roll:label,feeHistory:[{effectiveFrom:START,amount:ENROL_FEE}],
      status:'active'});
  }
  await CenterStudent.insertMany(roll);
  const removal=(back:number,purgeIn:number):{removedAt:Date;removedBy:mongoose.Types.ObjectId;reason:string;
    leaveDate:string;purgeAt:Date}=>({removedAt:new Date(Date.now()-back*86400000),removedBy:bossId,
      reason:'S2 পরীক্ষার জন্য অপসারণ',leaveDate:ym(LAST),purgeAt:new Date(Date.now()+purgeIn*86400000)});
  /* Two removals filed against the class the centre has closed, and one against a class it still runs. */
  const removedA=await student({studentId:'S2-REMOVED-A',name:{bn:REMOVED_A,en:'S2 removed one'},
    classGroup:closed._id,guardianPhone:'01711000451',roll:'11',status:'removed',
    removal:removal(5,25)}) as {_id:mongoose.Types.ObjectId};
  await student({studentId:'S2-REMOVED-B',name:{bn:REMOVED_B,en:'S2 removed two'},classGroup:closed._id,
    guardianPhone:'01711000452',roll:'12',status:'removed',removal:removal(4,26)});
  await student({studentId:'S2-REMOVED-C',name:{bn:REMOVED_C,en:'S2 removed three'},classGroup:nine._id,
    guardianPhone:'01711000453',roll:'13',status:'removed',removal:removal(3,27)});
  await CenterClassGroup.init();
  await CenterClassGroup.syncIndexes();
  assert.equal(await CenterStudent.countDocuments({status:'active'}),ROLL_COUNT+1,
    'the world this suite drives: twenty-five on the unpriced class and one on the priced one');

  const browser=await chromium.launch();
  /* A write's answer paints only once React is free, and the same commit asks the page to re-read itself:
     on a one-CPU runner that can hold a toast past a minute, so the wait is generous. */
  const TOAST_MS=120000;
  const shot=(page:Page,name:string,fullPage=false)=>page.screenshot({path:path.join(SHOTS,`${name}.png`),fullPage});
  const until=async(check:()=>Promise<boolean>,label:string,timeoutMs=90000):Promise<void>=>{
    const deadline=Date.now()+timeoutMs;
    for(;;){
      if(await check().catch(()=>false))return;
      if(Date.now()>deadline)throw Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
      await new Promise(resolve=>setTimeout(resolve,400));
    }
  };
  /** How many children a class is holding: the count F-05 refuses an archive by, read the way the action
      reads it — a paused child counts, one who has left does not. */
  const holding=(classId:string):Promise<number>=>
    CenterStudent.countDocuments({classGroup:classId,status:{$ne:'removed'}});

  const opened:{close:()=>Promise<void>}[]=[];
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
      opened.push({close:()=>context.close()});
      return {context,page,errors};
    }
    const goto=async(page:Page,address:string,marker:string):Promise<void>=>{
      await page.goto(`${origin}${address}`,{waitUntil:'domcontentloaded',timeout:180000});
      await page.locator(marker).first().waitFor({timeout:90000});
    };
    /** Walk the month picker to a YYYY-MM value and take it, the way every door in this app takes one. */
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
    const noOverflow=async(page:Page,label:string):Promise<void>=>{
      const metrics=await page.evaluate(()=>({clientWidth:document.documentElement.clientWidth,
        scrollWidth:document.documentElement.scrollWidth}));
      assert.ok(metrics.scrollWidth<=metrics.clientWidth+1,
        `${label}: nothing overflows horizontally at ${metrics.clientWidth}px (scrollWidth ${metrics.scrollWidth})`);
    };
    /* F-04 · the fields the ONE editor has. Every surface that writes a class is held to this list, so a
       screen cannot offer half a class and quietly keep whatever the other screen last wrote for the rest. */
    const FIELDS=['[data-class-name-bn]','[data-class-name-en]','[data-class-level]','[data-class-room]',
      '[data-class-fee]','[data-class-fee-free]','[data-class-shift-boxes]','[data-class-teachers]',
      '[data-class-save]'];
    const assertEditor=async(scope:Locator,variant:'dialog'|'inline',isNew:boolean,label:string):Promise<void>=>{
      assert.equal(await scope.locator(`[data-class-editor="${variant}"]`).count(),1,
        `${label}: the one class editor, in its ${variant} shape`);
      for(const field of FIELDS)assert.equal(await scope.locator(field).count(),1,
        `${label}: ${field} is on the one editor, not on one screen's own form`);
      assert.equal(await scope.locator('[data-class-year]').count(),isNew?1:0,
        `${label}: the year is offered on a new class and written once — an edit posts the class's own year`);
      assert.equal(await scope.locator('[data-class-active-box]').count(),isNew?0:1,
        `${label}: whether the class is running is a tick on a class that exists`);
    };
    /** A class row's fold on the class list, opened: the second of the three surfaces. */
    const openFold=async(page:Page,classId:string):Promise<Locator>=>{
      const fold=page.locator(`details:has([data-class-summary="${classId}"])`).first();
      await fold.locator(`[data-class-summary="${classId}"]`).click();
      await fold.locator('[data-class-editor="inline"]').waitFor({state:'visible',timeout:60000});
      return fold;
    };

    /* ── 1. Bangla, 1440 · the board: the one editor, the fee's two meanings, the refusal ─────────── */
    const boss=await signIn();
    const page=boss.page;
    await goto(page,'/bn/admin/classes','[data-class-board]');
    assert.equal(ascii(await page.locator('[data-class-count]').innerText()),'5',
      'the board counts every class the centre has, live ones first');
    await noOverflow(page,'the class board');

    /* F-16 · three facts, three sentences, on the cards the owner reads without opening anything. */
    const card=(classId:string):Locator=>page.locator(`[data-class-card="${classId}"]`);
    const feeOfCard=async(classId:string):Promise<{state:string;text:string}>=>{
      const fee=card(classId).locator('[data-class-fee]');
      return {state:String(await fee.getAttribute('data-class-fee')),text:(await fee.innerText()).trim()};
    };
    assert.deepEqual(await feeOfCard(nineId),{state:'set',text:`মাসিক বেতন: ৳${toBn(String(FEE))}`},
      'a class with a price says the price');
    assert.deepEqual(await feeOfCard(freeId),{state:'free',text:caBn.feeFreeWord},
      'a class the centre runs for free says so — which is the sentence a zero used to lose');
    assert.deepEqual(await feeOfCard(tenId),{state:'unset',text:caBn.feeNone},
      'and a class nobody has priced says that instead, rather than reading as free');
    const nineCount=(await card(nineId).locator('[data-class-students]').innerText()).trim();
    assert.equal(ascii(nineCount).includes(String(await CenterStudent.countDocuments({classGroup:nineId,status:'active'}))),true,
      'a card counts the children running on the class, read in the same pass as the card itself');
    assert.ok(nineCount.includes('জন শিক্ষার্থী'),'in the sentence the catalog holds for a count of children');
    await shot(page,'s2-class-board-bn-1440',true);

    /* F-04 · surface one: the board's sheet is the one editor, opened on an empty class. */
    await page.locator('[data-class-add]').click();
    const modal=page.locator('[data-class-modal="new"]');
    await modal.waitFor({state:'visible',timeout:60000});
    await assertEditor(modal,'dialog',true,'the board\'s add sheet');
    assert.equal(await modal.locator(`[data-teacher-option="${teacherId}"]`).count(),1,
      'and it offers the teachers a class may be given, so the marks grid is decided where the class is');
    await shot(page,'s2-class-editor-bn-1440');

    /* F-08 + F-09 · a class made whole from this one form: the boxes are the truth and the word follows
       them, in the order the day happens rather than the order the operator clicked. */
    await modal.locator('[data-class-name-bn]').fill(NEW_CLASS);
    await modal.locator('[data-class-name-en]').fill(NEW_CLASS_EN);
    await modal.locator('[data-class-level]').fill('দশম শ্রেণি');
    await modal.locator('[data-class-room]').fill(NEW_ROOM);
    await modal.locator('[data-class-fee]').fill(toBn(String(NEW_FEE)));
    await modal.locator('[data-class-shift-box="evening"]').check();
    await modal.locator('[data-class-shift-box="day"]').check();
    await modal.locator(`[data-teacher-check="${teacherId}"]`).check();
    await modal.locator('[data-class-save]').click();
    await until(async()=>await classNamed(NEW_CLASS)!==null,'the new class in the record',TOAST_MS);
    const made=await classNamed(NEW_CLASS);
    assert.equal(made!.level,'দশম শ্রেণি','the level a class teaches is written from the board\'s own sheet');
    assert.equal(made!.room,NEW_ROOM,'and so is the room it sits in — fields the second form never had');
    assert.deepEqual(made!.shifts,['day','evening'],
      'the shifts are stored as the canonical keys, in the order the day happens, not the order clicked');
    assert.equal(made!.shift,'দুপুর','and the word the routine reads is derived from the first of them');
    assert.equal(made!.monthlyFee,NEW_FEE,'a fee typed in Bangla digits is stored as the number it names');
    assert.equal(made!.feeFree,false,'and a class with a price is not marked free');
    assert.deepEqual(made!.teachers.map(String),[teacherId],'the teacher ticked is the teacher stored');
    assert.equal(made!.active,true,'a class is created running');
    const newId=String(made!._id);
    await until(async()=>await card(newId).count()===1,'the new card on the board',TOAST_MS);
    assert.equal(ascii(await page.locator('[data-class-count]').innerText()),'6',
      'and the board counts it without a reload');
    assert.equal((await feeOfCard(newId)).state,'set','its card reads the price back');

    /* F-09 · the name rule, in the browser: the same name in the same session and shift is refused. */
    await page.locator('[data-class-add]').click();
    const dupe=page.locator('[data-class-modal="new"]');
    await dupe.waitFor({state:'visible',timeout:60000});
    await dupe.locator('[data-class-name-bn]').fill(NINE);
    await dupe.locator('[data-class-shift-box="morning"]').check();
    await dupe.locator('[data-class-save]').click();
    await dupe.locator('[data-class-duplicate]').waitFor({state:'visible',timeout:TOAST_MS});
    assert.equal((await dupe.locator('[data-class-duplicate]').innerText()).trim(),caBn.duplicate,
      'a class the centre is running already wears that name in that session and shift');
    assert.equal(await classNamed(NEW_CLASS).then(row=>row!==null&&String(row._id)===newId),true,
      'and the refusal writes nothing: the board still holds the classes it held');
    await dupe.locator('[data-class-cancel]').click();
    await page.locator('[data-class-modal="new"]').waitFor({state:'detached',timeout:60000});

    /* F-05 · a class with children on it is not closed, and the refusal is printed where the operator is
       looking, with the count in their own digits and the way out beside it. */
    const onNine=await holding(nineId);
    assert.equal(onNine,2,'the priced class holds two children: one running and one paused');
    await page.locator(`[data-class-edit="${nineId}"]`).click();
    const nineModal=page.locator(`[data-class-modal="${nineId}"]`);
    await nineModal.waitFor({state:'visible',timeout:60000});
    await assertEditor(nineModal,'dialog',false,'the board\'s edit sheet');
    assert.equal(await nineModal.locator('[data-class-name-bn]').inputValue(),NINE,
      'the sheet opens on the class\'s own facts');
    await nineModal.locator('[data-class-active-box]').uncheck();
    await nineModal.locator('[data-class-save]').click();
    const refusal=nineModal.locator('[data-class-archive-refused]');
    await refusal.waitFor({state:'visible',timeout:TOAST_MS});
    assert.equal((await refusal.locator('p').first().innerText()).trim(),refused(onNine,'bn'),
      'the refusal is the brief\'s own sentence with the count in it, in the operator\'s digits');
    assert.equal((await refusal.locator('p.admin-help').innerText()).trim(),caBn.archiveRefusedHelp,
      'and the way out is printed beside it rather than left to be guessed');
    assert.equal(await refusal.getAttribute('data-class-archive-count'),String(onNine),
      'the count travels as a number a screen can be tested against');
    assert.equal(await nineModal.locator('[data-class-name-bn]').inputValue(),NINE,
      'a refusal leaves the draft where the operator put it: nothing they typed is lost');
    assert.equal(await readClass(nineId).then(row=>row!.active),true,
      'and the class is still running — the refusal is the write that did not happen');
    await shot(page,'s2-archive-refused-bn-1440');
    await nineModal.locator('[data-class-cancel]').click();

    /* F-05's other half: the refusal is a count, not a ban. A class with nobody on it closes. */
    await page.locator(`[data-class-edit="${newId}"]`).click();
    const newModal=page.locator(`[data-class-modal="${newId}"]`);
    await newModal.waitFor({state:'visible',timeout:60000});
    await newModal.locator('[data-class-active-box]').uncheck();
    await newModal.locator('[data-class-save]').click();
    await until(async()=>await readClass(newId).then(row=>row!.active===false),
      'the empty class closed',TOAST_MS);
    await until(async()=>await card(newId).getAttribute('data-class-active')==='false',
      'the card to read the class as closed',TOAST_MS);
    assert.equal((await card(newId).locator('[data-class-status]').innerText()).trim(),caBn.statusArchived,
      'and its card says so in the word the board uses for a closed class');

    /* ── 2. Bangla · the class list: the same editor folded into a row, and the legacy backfill ───── */
    await goto(page,'/bn/admin/students/classes','[data-class-hub]');
    await noOverflow(page,'the class list');
    assert.equal(await page.locator(`[data-class-hub="${nineId}"]`).count(),1,
      'every class on the list is a door into its own page');
    const fold=await openFold(page,nineId);
    await assertEditor(fold,'inline',false,'the class list\'s fold');
    assert.equal(await fold.locator(`[data-teacher-option="${teacherId}"]`).count(),1,
      'the fold offers the same teachers the board\'s sheet does');
    await fold.locator('[data-class-room]').fill(ROOM_EDIT);
    await fold.locator(`[data-teacher-check="${teacherId}"]`).check();
    await fold.locator('[data-class-save]').click();
    await fold.locator('[data-class-saved="yes"]').waitFor({state:'visible',timeout:TOAST_MS});
    await until(async()=>await readClass(nineId).then(row=>row!.room===ROOM_EDIT
      &&row!.teachers.map(String).includes(teacherId)),'the room and the teacher in the record',TOAST_MS);
    await shot(page,'s2-class-list-bn-1440',true);
    await goto(page,'/bn/admin/students/classes','[data-class-hub]');
    const summary=page.locator(`[data-class-summary="${nineId}"]`);
    assert.ok((await summary.innerText()).includes(TEACHER),
      'and the row names the teacher who takes the class, so the owner reads the assignment without '
      +'opening anything');

    /* F-04 · surface three: "create a class" on this page is the same editor on an empty class. */
    const create=page.locator('[data-class-create]');
    await create.locator('> summary').click();
    await create.locator('[data-class-editor="inline"]').waitFor({state:'visible',timeout:60000});
    await assertEditor(create,'inline',true,'the create box on the class list');

    /* F-08 · a class written before the boxes holds a word and no keys: the first save through the one
       editor gives it the canonical key its own word means, so the boxes open ticked from then on. */
    const legacyFold=await openFold(page,legacyId);
    await legacyFold.locator('[data-class-room]').fill('Room-13B');
    await legacyFold.locator('[data-class-save]').click();
    await legacyFold.locator('[data-class-saved="yes"]').waitFor({state:'visible',timeout:TOAST_MS});
    await until(async()=>await readClass(legacyId).then(row=>row!.shifts.length===1),
      'the legacy class to gain its canonical shift key',TOAST_MS);
    assert.deepEqual((await readClass(legacyId))!.shifts,['evening'],
      'a shift word nobody ticked a box for is recognised as the key it always meant');
    assert.equal((await readClass(legacyId))!.shift,'সন্ধ্যা','and the word the routine reads is unchanged');
    await goto(page,'/bn/admin/students/classes','[data-class-hub]');
    const legacyFold2=await openFold(page,legacyId);
    assert.equal(await legacyFold2.locator('[data-class-shift-box="evening"]').isChecked(),true,
      'so the next editor that opens on this class opens with the box ticked — the word and the keys agree');

    /* ── 3. Bangla · the hub: a price, a free class, a closed one, a wrong address, a second page ── */
    await goto(page,`/bn/admin/students/classes/${nineId}`,'[data-class-hub]');
    assert.equal((await page.locator('[data-class-name]').innerText()).trim(),NINE,
      'the class page names the class it is standing in');
    assert.equal(await page.locator('[data-class-fee]').getAttribute('data-class-fee'),'set',
      'and its fee reads as a price that has been set');
    assert.equal(ascii(await page.locator('[data-class-fee]').innerText()),String(FEE),
      'printing the class\'s own amount, in the operator\'s digits');
    assert.equal(ascii(await page.locator('[data-class-enrolled]').innerText()),'1',
      'counting the children running on it');
    /* F-07 · the enrolment form standing in a class opens with that class's own price in the fee box. */
    const enrol=page.locator('[data-class-enroll]');
    await enrol.locator('> summary').click();
    const enrolForm=enrol.locator('form.center-student-form');
    await enrolForm.locator('[data-enroll-class-select]').waitFor({state:'visible',timeout:60000});
    assert.equal(await enrolForm.locator('[data-enroll-class-select]').inputValue(),nineId,
      'the class is already chosen, because the operator is standing in it');
    assert.equal(await enrolForm.locator('[data-enroll-fee]').inputValue(),String(FEE),
      'and the fee box opens with the price the class advertises — a number to confirm, not to remember');
    await shot(page,'s2-class-hub-fee-bn-1440');

    await goto(page,`/bn/admin/students/classes/${freeId}`,'[data-class-hub]');
    assert.equal(await page.locator('[data-class-fee]').getAttribute('data-class-fee'),'free',
      'a class the centre runs for free says so on its own page');
    assert.equal((await page.locator('[data-class-fee]').innerText()).trim(),hubBn.feeFree,
      'in the word the catalogs hold for it');
    await page.locator('[data-class-enroll] > summary').click();
    assert.equal(await page.locator('[data-enroll-fee]').inputValue(),'0',
      'and a child enrolled onto it starts at zero taka, which is a price rather than a gap');

    /* F-06 · a closed class is a record, not a door: the enrolment form is what put children on a class
       nobody is running. */
    await goto(page,`/bn/admin/students/classes/${closedId}`,'[data-class-hub]');
    const banner=page.locator('[data-class-archived]');
    await banner.waitFor({state:'visible',timeout:60000});
    assert.equal((await banner.locator('[data-class-archived-title]').innerText()).trim(),hubBn.archivedBanner,
      'a closed class says it is closed');
    assert.equal((await banner.locator('[data-class-archived-note]').innerText()).trim(),hubBn.archivedNote,
      'says what is still readable here, and how to open it again');
    assert.equal(await page.locator('[data-class-enroll]').count(),0,
      'and offers no enrolment form: a child enrolled onto it would land on a roll nobody opens');
    assert.equal(await page.locator('[data-class-archived-open]').getAttribute('href'),
      '/bn/admin/students/classes','the way out is the class list, where the tick that runs it lives');
    assert.ok(String(await page.locator('[data-class-archived-records]').getAttribute('href'))
      .startsWith('/bn/admin/students/dues?class='),'and the other way out is the history the class has');
    assert.equal((await page.locator('[data-class-meta]').innerText()).includes(hubBn.archived),true,
      'while the heading reads the class as closed');
    await shot(page,'s2-class-archived-bn-1440');

    /* F-15 · an address that names no class is a wrong turn, not a dead end. */
    for(const address of ['000000000000000000000000','not-a-class']){
      await goto(page,`/bn/admin/students/classes/${address}`,'[data-class-unknown]');
      assert.equal((await page.locator('[data-class-unknown]').innerText()).trim(),hubBn.unknownClass,
        `a class the address does not name says so (${address})`);
      assert.equal((await page.locator('[data-class-unknown-note]').innerText()).trim(),hubBn.unknownNote,
        `and says what it is showing instead (${address})`);
      assert.equal(ascii(await page.locator('[data-list-total]').getAttribute('data-list-total')||''),
        String(await CenterStudent.countDocuments({status:{$ne:'removed'}})),
        `the list below it is every class's, not an empty one (${address})`);
      assert.equal(await page.locator('[data-list-empty]').count(),0,
        `so the screen is an answer rather than a gap (${address})`);
    }
    await shot(page,'s2-class-unknown-bn-1440');

    /* F-14 · the roll below the hub is paged by the number the server used, and F-11 · a write re-reads
       the page the operator walked to instead of dropping them back at the top. */
    await goto(page,`/bn/admin/students/classes/${tenId}`,'[data-class-hub]');
    const pager=page.locator('[data-list-page]');
    assert.equal(await pager.getAttribute('data-list-total'),String(ROLL_COUNT),
      'the roll says how many children the class holds');
    assert.equal(await pager.getAttribute('data-list-pages'),'2','and counts them twenty to a page');
    assert.equal(await pager.getAttribute('data-list-page'),'1','opening on the first');
    assert.equal(await page.locator('tr[data-student-row]').count(),20,'twenty rows on it');
    await pager.locator('button').last().click();
    await until(async()=>await pager.getAttribute('data-list-page')==='2','the second page of the roll');
    assert.equal(await page.locator('tr[data-student-row]').count(),ROLL_COUNT-20,
      'and the rest of the roll on the second');
    await shot(page,'s2-list-page2-bn-1440');
    /* A class nobody has priced leaves the fee box to the operator, and says so in the box's own words. */
    await page.locator('[data-class-enroll] > summary').click();
    const tenForm=page.locator('[data-class-enroll] form.center-student-form');
    assert.equal(await tenForm.locator('[data-enroll-fee]').inputValue(),'',
      'a class nobody has priced fills nothing in: an empty box is not a zero');
    assert.equal(await tenForm.locator('[data-enroll-fee]').getAttribute('placeholder'),BN.center.feeNotSet,
      'and the box says what would fill it');
    assert.equal((await tenForm.locator('[data-enroll-fee]').locator('xpath=following-sibling::small[1]')
      .innerText()).includes(BN.center.feeFromClass),true,'with the sentence that explains where a fee comes from');
    await tenForm.locator('input[name="nameBn"]').fill('S2 নতুন ভর্তি');
    await tenForm.locator('input[name="nameEn"]').fill('S2 new admission');
    await tenForm.locator('input[name="guardianName"]').fill('অভিভাবক');
    await tenForm.locator('input[name="guardianPhone"]').fill('01711000499');
    await tenForm.locator('[data-enroll-fee]').fill(String(ENROL_FEE));
    await tenForm.locator('button.button-navy').click();
    await until(async()=>await CenterStudent.countDocuments({classGroup:tenId,status:'active'})===ROLL_COUNT+1,
      'the enrolment in the record',TOAST_MS);
    await until(async()=>await pager.getAttribute('data-list-total')===String(ROLL_COUNT+1),
      'the roll to re-read itself after the write',TOAST_MS);
    assert.equal(await pager.getAttribute('data-list-page'),'2',
      'and the list keeps the page the operator walked to: a write re-reads the roll, it does not move '
      +'the person reading it');
    assert.equal(await page.locator('tr[data-student-row]').count(),ROLL_COUNT+1-20,
      'with the new child counted on the page it belongs to');

    /* ── 4. Bangla · F-12: a removal whose class is closed asks where the student comes back to ──── */
    await goto(page,'/bn/admin/students/removed','details.center-preview-row');
    await noOverflow(page,'the removed list');
    const doorOf=(studentId:string):Locator=>
      page.locator('details.center-preview-row',{hasText:studentId}).first();
    const doorA=doorOf('S2-REMOVED-A');
    await doorA.locator('> summary').click();
    const formA=doorA.locator(`[data-restore-form="${String(removedA._id)}"]`);
    await formA.locator('[data-restore-class]').waitFor({state:'visible',timeout:60000});
    assert.equal((await formA.locator('[data-restore-class-label]').innerText()).includes(restoreBn.classLabel),
      true,'a student whose class is closed is asked which class they come back to');
    assert.equal((await formA.locator('[data-restore-class-note]').innerText()).trim(),restoreBn.classNote,
      'and told why: the class they left is not there to come back to');
    assert.equal(await formA.locator(`[data-restore-class-option="${nineId}"]`).count(),1,
      'the classes that are running are offered');
    assert.equal(await formA.locator(`[data-restore-class-option="${closedId}"]`).count(),0,
      'and the class the centre has closed is not — restoring onto it would seat a child on a roll '
      +'nobody opens');
    assert.equal(await formA.locator('[data-restore-class-none]').count(),0,
      'with no "there is nothing to pick" note while classes are running');
    assert.equal(await formA.locator('[data-restore-submit]').isDisabled(),true,
      'and the write is refused until a month and a class have both been given');
    await formA.locator('[data-restore-class]').selectOption(nineId);
    assert.equal(await formA.locator('[data-restore-submit]').isDisabled(),true,
      'a class alone is not enough: the month the fee starts again is still owed');
    await formA.locator('input[name="reason"]').fill(RESTORE_REASON);
    assert.equal(await formA.locator('[data-restore-submit]').isDisabled(),true,
      'and neither is a reason alone');
    await pickMonth(formA,'resume',ym(THIS));
    assert.equal(await formA.locator('[data-restore-submit]').isDisabled(),false,
      'with a month and a class both given, the door writes');
    await shot(page,'s2-restore-class-bn-1440');
    await formA.locator('[data-restore-submit]').click();
    await until(async()=>await CenterStudent.findById(removedA._id).lean<StoredStudent|null>()
      .then(row=>row?.status==='active'&&String(row!.classGroup)===nineId),
      'the restore, carrying the move with it',TOAST_MS);
    const back=await CenterStudent.findById(removedA._id).lean<StoredStudent|null>();
    assert.equal(back!.status,'active','the student is running again');
    assert.equal(String(back!.classGroup),nineId,'on the class the operator picked, not the one that closed');
    const step=back!.classHistory[back!.classHistory.length-1];
    assert.equal(String(step.classGroup),nineId,'and the class timeline carries the move as its own line');
    assert.equal(step.name?.bn,NINE,'with the name the class it moved to wears');
    assert.equal(ym(step.effectiveFrom),ym(THIS),'taking effect from the month the fee starts again');
    const log=await CenterActivityLog.findOne({action:'student.restore',target:removedA._id})
      .lean<{actor:mongoose.Types.ObjectId;after:{classGroup?:string;resumeMonth?:string}}|null>();
    assert.ok(log,'the restore writes its own audit line');
    assert.equal(String(log!.actor),String(bossId),'naming who wrote it');
    assert.equal(log!.after.classGroup,nineId,'and the class the student was moved to');
    assert.equal(log!.after.resumeMonth,ym(THIS),'and the month they came back in');
    await goto(page,'/bn/admin/students/removed','details.center-preview-row');
    assert.equal(await doorOf('S2-REMOVED-A').count(),0,
      'and the removed list no longer holds a student who came back');
    assert.equal(await doorOf('S2-REMOVED-B').count(),1,'while the one nobody has restored is still on it');
    /* The same door, for a student whose class is still running: it stays quiet, because there is
       somewhere to come back to. */
    const doorC=doorOf('S2-REMOVED-C');
    await doorC.locator('> summary').click();
    const formC=doorC.locator('[data-restore-form]').first();
    assert.equal(await formC.locator('[data-restore-class]').count(),0,
      'a student whose class the centre still runs is not asked where to come back to');
    assert.equal(await formC.locator('[data-restore-class-none]').count(),0,
      'and is told nothing about classes that are not there');
    assert.equal(await holding(nineId),3,
      'so the priced class now holds three children, which is the count its next archive is refused by');

    /* ── 5. English, 1440 · the same doors in the other language ─────────────────────────────────── */
    const english=await signIn(1440,'en');
    const en=english.page;
    await goto(en,'/en/admin/classes','[data-class-board]');
    await noOverflow(en,'the class board in English');
    assert.deepEqual(await (async()=>{
      const fee=en.locator(`[data-class-card="${freeId}"] [data-class-fee]`);
      return {state:String(await fee.getAttribute('data-class-fee')),text:(await fee.innerText()).trim()};
    })(),{state:'free',text:caEn.feeFreeWord},'a free class reads as free in English too');
    assert.equal((await en.locator(`[data-class-card="${tenId}"] [data-class-fee]`).innerText()).trim(),
      caEn.feeNone,'and an unpriced one as not set yet');
    const onNineNow=await holding(nineId);
    await en.locator(`[data-class-edit="${nineId}"]`).click();
    const enModal=en.locator(`[data-class-modal="${nineId}"]`);
    await enModal.waitFor({state:'visible',timeout:60000});
    await assertEditor(enModal,'dialog',false,'the board\'s edit sheet in English');
    assert.equal(await enModal.locator('[data-class-name-en]').inputValue(),NINE_EN,
      'and it opens on the class\'s English name on an English screen');
    await enModal.locator('[data-class-active-box]').uncheck();
    await enModal.locator('[data-class-save]').click();
    const enRefusal=enModal.locator('[data-class-archive-refused]');
    await enRefusal.waitFor({state:'visible',timeout:TOAST_MS});
    assert.equal((await enRefusal.locator('p').first().innerText()).trim(),refused(onNineNow,'en'),
      'the refusal is the same sentence in English, with the count in ASCII digits');
    assert.equal((await enRefusal.locator('p.admin-help').innerText()).trim(),caEn.archiveRefusedHelp,
      'and the way out beside it');
    await shot(en,'s2-archive-refused-en-1440');
    await enModal.locator('[data-class-cancel]').click();

    await goto(en,`/en/admin/students/classes/${closedId}`,'[data-class-archived]');
    assert.equal((await en.locator('[data-class-archived-title]').innerText()).trim(),hubEn.archivedBanner,
      'a closed class says so in English');
    assert.equal((await en.locator('[data-class-archived-note]').innerText()).trim(),hubEn.archivedNote,
      'with the same two ways out');
    assert.equal(await en.locator('[data-class-enroll]').count(),0,'and still offers no enrolment');
    await shot(en,'s2-class-archived-en-1440');

    await goto(en,'/en/admin/students/classes/nope','[data-class-unknown]');
    assert.equal((await en.locator('[data-class-unknown]').innerText()).trim(),hubEn.unknownClass,
      'a wrong address says so in English');
    assert.equal((await en.locator('[data-class-unknown-note]').innerText()).trim(),hubEn.unknownNote,
      'and says what it shows instead');

    await goto(en,'/en/admin/students/classes/'+nineId,'[data-class-hub]');
    await en.locator('[data-class-enroll] > summary').click();
    assert.equal(await en.locator('[data-enroll-fee]').inputValue(),String(FEE),
      'the price a class advertises fills the box on an English screen too');
    assert.equal(await en.locator('[data-enroll-class-select]').inputValue(),nineId,
      'with the class already chosen');
    assert.ok((await en.locator('[data-enroll-class-select]').innerText()).includes(NINE_EN),
      'and the class named in English');

    await goto(en,'/en/admin/students/removed','details.center-preview-row');
    const enB=en.locator('details.center-preview-row',{hasText:'S2-REMOVED-B'}).first();
    await enB.locator('> summary').click();
    const enFormB=enB.locator('[data-restore-form]').first();
    await enFormB.locator('[data-restore-class]').waitFor({state:'visible',timeout:60000});
    assert.equal((await enFormB.locator('[data-restore-class-label]').innerText()).includes(restoreEn.classLabel),
      true,'the second removal, whose class is closed, is asked in English');
    assert.equal((await enFormB.locator('[data-restore-class-note]').innerText()).trim(),restoreEn.classNote,
      'and told why in English');
    assert.ok((await enFormB.locator('[data-restore-class]').innerText()).includes(NINE_EN),
      'offering the running classes by their English names');
    assert.equal(await enFormB.locator(`[data-restore-class-option="${closedId}"]`).count(),0,
      'and not the closed one');
    await shot(en,'s2-restore-class-en-1440');
    const enC=en.locator('details.center-preview-row',{hasText:'S2-REMOVED-C'}).first();
    await enC.locator('> summary').click();
    assert.equal(await enC.locator('[data-restore-form]').first().locator('[data-restore-class]').count(),0,
      'while a removal whose class is running asks no such question in either language');

    /* ── 6. Bangla, 360 · a phone: the editor, the hub and the restore door all fit ──────────────── */
    const phone=await signIn(360);
    const small=phone.page;
    await goto(small,'/bn/admin/classes','[data-class-board]');
    await noOverflow(small,'the class board on a phone');
    await small.locator('[data-class-add]').click();
    const smallModal=small.locator('[data-class-modal="new"]');
    await smallModal.waitFor({state:'visible',timeout:60000});
    await assertEditor(smallModal,'dialog',true,'the one editor on a phone');
    for(const field of FIELDS){
      const box=await smallModal.locator(field).first().boundingBox();
      assert.ok(box&&box.width>0&&box.width<=360,`${field} fits a 360px phone`);
    }
    await shot(small,'s2-class-editor-bn-360');
    await smallModal.locator('[data-class-cancel]').click();

    await goto(small,`/bn/admin/students/classes/${nineId}`,'[data-class-hub]');
    await noOverflow(small,'the class hub on a phone');
    await shot(small,'s2-class-hub-bn-360',true);
    await goto(small,`/bn/admin/students/classes/${closedId}`,'[data-class-archived]');
    await noOverflow(small,'a closed class on a phone');
    await goto(small,'/bn/admin/students/removed','details.center-preview-row');
    await noOverflow(small,'the removed list on a phone');
    const smallDoor=small.locator('details.center-preview-row',{hasText:'S2-REMOVED-B'}).first();
    await smallDoor.locator('> summary').click();
    const smallForm=smallDoor.locator('[data-restore-form]').first();
    await smallForm.locator('[data-restore-class]').waitFor({state:'visible',timeout:60000});
    const selectBox=await smallForm.locator('[data-restore-class]').boundingBox();
    assert.ok(selectBox&&selectBox.width>0&&selectBox.width<=360,
      'the class a restore asks for is a thumb-wide control on a phone');
    const submitBox=await smallForm.locator('[data-restore-submit]').boundingBox();
    assert.ok(submitBox&&submitBox.height>=32,`the restore button is a thumb target (${submitBox?.height}px)`);
    await noOverflow(small,'the removed list on a phone with the restore door open');
    await shot(small,'s2-restore-class-bn-360');

    assert.deepEqual(boss.errors,[],'no page error on the Bangla run');
    assert.deepEqual(english.errors,[],'no page error on the English run');
    assert.deepEqual(phone.errors,[],'no page error on the phone run');

    await CenterStudent.deleteMany({});
    await CenterClassGroup.deleteMany({});
    await CenterActivityLog.deleteMany({});
    await User.deleteMany({email:{$in:[email,teacherEmail]}});

    console.log('Class workflow on screen: one editor holds every field a class has and all three surfaces '
      +'render it — the board\'s sheet, the list\'s fold and the create box; a fee reads as a price, as free '
      +'or as not decided yet on the card, on the hub and in the enrolment box it fills; a class with children '
      +'on it is refused in the brief\'s own sentence with the count in the operator\'s digits and the draft '
      +'kept, while a class with nobody on it closes; a shift word is derived from the boxes and a class '
      +'written before them gains its key on the first save; a closed class says so instead of offering '
      +'enrolment and a wrong address lists every class; a roll of twenty-five pages by twenty and keeps the '
      +'page the operator walked to across a write; and a removal whose class is closed asks which running '
      +'class the student comes back to, moves them there in one write, and stays quiet when their class is '
      +'still running — in Bangla and in English at 1440px, and on a phone at 360px.');
  }finally{
    for(const context of opened)await context.close().catch(()=>{});
    await browser.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
}
run().catch(error=>{console.error(error);process.exit(1)});
