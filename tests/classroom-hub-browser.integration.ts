/**
 * Group 3 · the centre's own workflow, in the browser: a class is a place, a fee is taken with a
 * discount, an exam is marked by its components, and a month ends in one sheet.
 *
 * Five claims in one suite, because they are one rebuild and they share one seeded centre — two classes
 * with a fee each, six students on the first roll (one absent all month, two level on marks) and two on
 * the second, three Dhaka months of fees owing, and one published exam already held this month:
 *
 *  1. **A class has a page.** The classes list opens into a hub that names the class, its shift, its year,
 *     its roll and what a month costs — the class's own amount when it has one and the amount its students
 *     are actually on when it does not — with enrollment already standing in that class and the roll below
 *     it carrying the same row the Students list runs: Edit, Take payment, and Remove behind a picked month
 *     and a typed reason. Enrolling from the hub writes a student onto that class and the header counts
 *     them; removing one from another class drops that class's count.
 *  2. **The dues screen starts with the whole centre.** One line per class — who is on the roll, who owes,
 *     what a month costs, what is owed — above the picker that opens one class, and each line's action
 *     opens that class's own due list.
 *  3. **A fee can be taken with a discount.** The cash desk types the discount beside the money, the
 *     read-out moves as it is typed, the receipt prints the fee, the discount and the cash, the month is
 *     settled by the fee rather than left owing by the discount, the day's drawer counts the cash, and the
 *     stored payment keeps both numbers.
 *  4. **An exam is marked by its components.** A subject split into creative and multiple-choice adds its
 *     own total up while the creator types, the grid gives each component a column with its own ceiling,
 *     the row total moves the moment a component lands, a component over its ceiling is refused and never
 *     written, the stored result keeps the components behind the mark, and telling the guardians is one
 *     button that answers with counts and a link into the SMS history filtered to that batch — with a child
 *     who is absent, and a child with no marks yet, left out rather than texted a blank result.
 *  5. **A month ends in one sheet.** The marksheet takes a class and a month and prints every student down
 *     the side, every exam of that month across the top, the marks possible and obtained, and the position
 *     that follows — ১ম, ২য়, ৪তম in Bangla and 1st, 2nd, 4th in English, equal totals sharing a position
 *     and saying so, a child with no marks in the month holding no position at all, and one button that
 *     prints it.
 *
 * And because the brief named the jargon rather than one screen: none of these five says "snapshot",
 * "write enabled" or "reconciliation" in either language, and none of them overflows at 360 px, 768 px or
 * 1440 px. Photographed into screenshots/g3 at 360 px and 1440 px.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import type {Browser,Locator,Page} from 'playwright';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {
  CenterClassGroup,CenterExam,CenterExamResult,CenterPayment,CenterSettings,CenterSmsBatch,CenterSmsLog,
  CenterStudent,
} from '../src/models/CenterRecords';
import {dhakaCalendar} from '../src/lib/center/month-status';
import {liveClassDues,liveClassDueSummary} from '../src/lib/center/dues-query';
import {createCenterExam,publishCenterExam,saveCenterExamMarksBatch} from '../src/lib/center/exam-batch';
import {DEFAULT_GRADING_RANGES,rangesToBands} from '../src/lib/exams/vocab';
import bn from '../src/messages/bn.json';
import en from '../src/messages/en.json';

const SHOTS=path.join('screenshots','g3');
const bnDigits=(value:number):string=>String(value).replace(/[0-9]/g,digit=>'০১২৩৪৫৬৭৮৯'[Number(digit)]);
/** Bangla digits read as ASCII ones, so a count can be compared with either. */
const ascii=(text:string):string=>text.replace(/[০-৯]/g,ch=>String(ch.charCodeAt(0)-0x09e6));
const hasBanglaLetters=(text:string):boolean=>/[\u0980-\u09ff]/.test(text.replace(/[০-৯]/g,''));
const ym=(year:number,month:number):string=>`${year}-${String(month).padStart(2,'0')}`;
/** Fill an ICU-less catalog sentence the way next-intl does. */
const fill=(template:string,params:Record<string,string|number>):string=>
  Object.entries(params).reduce((text,[name,value])=>text.split(`{${name}}`).join(String(value)),template);

/**
 * Walk the month picker to a `YYYY-MM` value and take it.
 *
 * The picker's cells carry the whole month, not its number, and its year is walked with the `‹ ›`
 * beside the year it is showing — towards the value rather than forwards only, so a leave month in
 * December still works on a suite that runs in January. The year head is waited for because the
 * popover paints a frame after the anchor is clicked.
 */
const pickMonth=async(scope:Locator,name:string,value:string):Promise<void>=>{
  await scope.locator(`[data-month-choose="${name}"]`).click();
  await scope.locator('[data-month-year]').waitFor({state:'visible',timeout:60000});
  const cell=scope.locator(`[data-month-pick="${value}"]`);
  const year=Number(value.slice(0,4));
  for(let step=0;step<8&&(await cell.count())===0;step++){
    const shown=Number(ascii(await scope.locator('[data-month-year]').innerText()));
    await scope.locator(shown>year?'[data-month-back]':'[data-month-forward]').click();
  }
  await cell.click();
};

const CLASS_A='গ৩ নবম শ্রেণি',CLASS_B='গ৩ দশম শ্রেণি',CLASS_B_EN='Group Three Ten';
const FEE_A=600,FEE_B=500,DISCOUNT=100;
/** Class A's roll, named with the Bangla ordinal letters so a list sorted by `name.bn` keeps this order. */
const ROLL_A=['নমুনা ছাত্র ক','নমুনা ছাত্র খ','নমুনা ছাত্র গ','নমুনা ছাত্র ঘ','নমুনা ছাত্র ঙ'];
const ROLL_B=['নমুনা ছাত্র চ','নমুনা ছাত্র ছ'];
const ABSENT='নমুনা ছাত্র ঘ',PAYER=ROLL_B[0],LEAVER=ROLL_B[1];
const NEW_STUDENT='গ৩ নতুন ভর্তি';
/** The two exams held in this month: one split into components and typed in the browser, one seeded. */
const EXAM_ONE={name:'গ৩ প্রথম মাসিক',subject:'বাংলা',pass:33,
  parts:[{name:'সৃজনশীল',marks:60},{name:'বহুনির্বাচনী',marks:40}]};
const EXAM_TWO={name:'গ৩ দ্বিতীয় মাসিক',subject:'গণিত',full:50,pass:20};
const SCORED_ONE:Record<string,[number,number]|'absent'>={
  'নমুনা ছাত্র ক':[40,35],'নমুনা ছাত্র খ':[50,40],'নমুনা ছাত্র গ':[30,30],'নমুনা ছাত্র ঙ':[45,30],
  'নমুনা ছাত্র ঘ':'absent',
};
const SCORED_TWO:Record<string,number|'absent'>={
  'নমুনা ছাত্র ক':45,'নমুনা ছাত্র খ':40,'নমুনা ছাত্র গ':40,'নমুনা ছাত্র ঙ':45,'নমুনা ছাত্র ঘ':'absent',
};
/** The consolidated totals those marks make — 130, 120, 120, 100, 0 — and the positions that follow:
    the two level on 120 share ২য় and say so, the next position is ৪তম, and the child with no marks at
    all holds none. */
const RANKS_BN:Record<string,string>={
  'নমুনা ছাত্র খ':'১ম','নমুনা ছাত্র ক':'২য় · যুগ্ম','নমুনা ছাত্র ঙ':'২য় · যুগ্ম',
  'নমুনা ছাত্র গ':'৪তম','নমুনা ছাত্র ঘ':'৫তম',
};
const RANKS_EN:Record<string,string>={
  'নমুনা ছাত্র খ':'1st','নমুনা ছাত্র ক':'2nd · joint','নমুনা ছাত্র ঙ':'2nd · joint',
  'নমুনা ছাত্র গ':'4th','নমুনা ছাত্র ঘ':'5th',
};
/* The brief named the words: a screen that says "snapshot", "write enabled" or "reconciliation" is a
   screen written for the person who built it. Neither language may, on any of the five. */
const JARGON=['snapshot','write enabled','reconcil','স্ন্যাপশট','রাইট এনাবেল্ড','রিকনসিলিয়েশন'];

type StudentDoc={_id:mongoose.Types.ObjectId;status:string;classGroup:mongoose.Types.ObjectId};
type ExamDoc={_id:mongoose.Types.ObjectId;status:string;
  subjects:{_id:mongoose.Types.ObjectId;fullMarks:number;parts:{name:{bn:string};marks:number}[]}[]};
type ResultDoc={total:number;fullTotal:number;
  marks:{obtained:number|null;absent:boolean;parts:{name:string;obtained:number|null}[]}[]};
type BatchDoc={_id:mongoose.Types.ObjectId;sentCount:number;skippedCount:number;failedCount:number};
type LogDoc={student:mongoose.Types.ObjectId;message:string;status:string;reason?:string};

async function run(){
  await preflight({
    mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',
    originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,
    test:'tests/classroom-hub-browser.integration.ts — start the app first, then run it with TEST_ORIGIN and TEST_MONGO_URI (see docs/STALE-TESTS.md)',
  });
  const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3100';
  const shared=process.env.TEST_ORIGIN?process.env.TEST_MONGO_URI:null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){
    /* A suite that shares CI's database owns it: everything in it is this suite's seed, so the wipe is
       what makes the counts below exact rather than approximate. */
    const db=mongoose.connection.db;
    if(!db)throw Error('mongoose connected without a database');
    for(const collection of await db.listCollections().toArray()){
      await db.collection(collection.name).deleteMany({}).catch(()=>{});
    }
  }
  await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});
  {let ready=false;
   for(let attempt=0;attempt<60&&!ready;attempt++){
     try{ready=(await fetch(`${origin}/api/auth/csrf`)).ok}catch{/* not up yet */}
     if(!ready)await new Promise(resolve=>setTimeout(resolve,1000));
   }
   if(!ready)throw Error(`the app did not answer at ${origin}`)}
  await mkdir(SHOTS,{recursive:true});

  // ── A centre with three months owing and one exam already held this month ────────────────────────
  const password=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(password,12);
  const BOSS='g3-owner@example.test';
  await User.create({name:'গ৩ মালিক',email:BOSS,passwordHash:hash,role:'admin',active:true});
  const owner=await User.findOne({email:BOSS}).lean<{_id:mongoose.Types.ObjectId}>();
  if(!owner)throw Error('the account this suite signs in with was not written');
  const ownerId=String(owner._id);

  const today=dhakaCalendar(new Date());
  /* The send engine defaults quiet hours to 21:00–07:00 Dhaka, so a send that lands in CI's evening
     queues the result messages instead of sending them and the counts read zero. A window whose start
     equals its end is an empty window by design: the suite owns that setting. */
  await CenterSettings.updateOne({key:'main'},{$set:{key:'main',quietStart:'00:00',quietEnd:'00:00',
    institutePhone:'01733330000',dueDay:10,smsUnitCost:0.5,autoReceipt:false,autoDue:false,autoResult:false,
    dailySmsLimitPerUser:50}},{upsert:true});

  /* Class A carries its own monthly fee; class B does not, so its hub has to read the fee its students
     are actually on — the two ways the header's number can be true. */
  const groupA=await CenterClassGroup.create({name:{bn:CLASS_A,en:'Group Three Nine'},academicYear:today.year,
    shift:'প্রভাতী',active:true,monthlyFee:FEE_A});
  const groupB=await CenterClassGroup.create({name:{bn:CLASS_B,en:CLASS_B_EN},academicYear:today.year,
    shift:'দিবা',active:true});
  const classA=String(groupA._id),classB=String(groupB._id);

  /* Fees start three Dhaka months back, so something is owed whatever day CI runs on. */
  const back=new Date(Date.UTC(today.year,today.month-4,1));
  const startMonth={year:back.getUTCFullYear(),month:back.getUTCMonth()+1};
  const students:Record<string,StudentDoc>={};
  for(const [index,name] of [...ROLL_A,...ROLL_B].entries()){
    const inB=index>=ROLL_A.length;
    students[name]=await CenterStudent.create({
      studentId:`G3-${index+1}`,name:{bn:name,en:name},classGroup:inB?groupB._id:groupA._id,
      roll:String(inB?index-ROLL_A.length+1:index+1),guardianName:'নমুনা অভিভাবক',
      guardianPhone:`017${String(21000000+index*1111111).slice(0,8)}`,
      school:'ধানমন্ডি সরকারি বালক বিদ্যালয়',admissionDate:`${ym(startMonth.year,startMonth.month)}-05`,
      startMonth,feeHistory:[{effectiveFrom:startMonth,amount:inB?FEE_B:FEE_A}],notes:'',status:'active',
    }) as unknown as StudentDoc;
  }

  /* One student of class B paid an earlier month, so the two classes owe different amounts and the
     summary's columns are not all the same number. */
  const earlier=new Date(Date.UTC(today.year,today.month-3,1));
  await CenterPayment.create({student:students[LEAVER]._id,classGroupAtPayment:groupB._id,type:'monthly',
    academicYear:earlier.getUTCFullYear(),month:earlier.getUTCMonth()+1,amount:FEE_B,receiptNo:'G3-1',
    receiptKey:'g3-seed-1',paidOn:`${ym(earlier.getUTCFullYear(),earlier.getUTCMonth()+1)}-12`,
    receivedBy:owner._id,groupId:'g3-seed',status:'valid'});

  /* The second exam of the month, written through the same engine the screen writes through, marked and
     published — so the marksheet has two columns and its positions are the stored ones. */
  const bands=rangesToBands(DEFAULT_GRADING_RANGES);
  const examTwo=await createCenterExam({requestId:randomUUID(),name:EXAM_TWO.name,
    date:`${ym(today.year,today.month)}-05`,type:'class_test',classIds:[classA],scaleName:'',bands,
    subjects:[{name:EXAM_TWO.subject,full:EXAM_TWO.full,pass:EXAM_TWO.pass,parts:[]}]},ownerId);
  const twoDoc=await CenterExam.findById(examTwo.id).lean<ExamDoc>();
  if(!twoDoc)throw Error('the seeded exam was not written');
  const twoSubject=String(twoDoc.subjects[0]._id);
  /* `-1` is the version a row nobody has written yet carries: the engine answers anything else as
     somebody else's row, so a seed that guessed 0 would save nothing and say nothing about it. */
  const seeded=await saveCenterExamMarksBatch({examId:examTwo.id,rows:ROLL_A.map(name=>{
    const scored=SCORED_TWO[name];
    return {studentId:String(students[name]._id),version:-1,
      marks:[{subject:twoSubject,obtained:scored==='absent'?null:scored,absent:scored==='absent'}]};
  })},ownerId);
  assert.equal(seeded.saved,ROLL_A.length,
    `the seeded exam took every mark the suite wrote (${JSON.stringify(seeded.rows)})`);
  await publishCenterExam(examTwo.id,ownerId);
  assert.equal(await CenterExamResult.countDocuments({exam:examTwo.id}),ROLL_A.length,
    'and the published exam holds a row for every child on the roll');

  const duesA=await liveClassDues(classA),duesB=await liveClassDues(classB);
  assert.ok(duesA.total>0&&duesB.total>0,
    `both classes owe something before the month is worked (A ৳${duesA.total}, B ৳${duesB.total})`);
  assert.equal(duesA.rows.length,ROLL_A.length,'every student of class A owes');

  // ── the browser ──────────────────────────────────────────────────────────────────────────────────
  const browser:Browser=await chromium.launch();
  const shot=(page:Page,name:string)=>page.screenshot({path:path.join(SHOTS,`${name}.png`),fullPage:true});
  /* "This screen overflows" is only half a diagnosis: at 360px the answer is always a table or a control
     row, and which one is a CSS question a screenshot cannot settle. So the check names the elements that
     actually escape the viewport — skipping anything inside a wrapper that scrolls, because a wide table
     inside `overflow-x:auto` is the design and not the defect. */
  const noOverflow=async(page:Page,name:string)=>{
    for(const width of [360,768,1440]){
      await page.setViewportSize({width,height:900});
      /* No function-valued `const` inside an evaluated closure: tsx transpiles with esbuild's keepNames,
         which wraps a function assigned to a name in a `__name(...)` helper that does not exist in the
         browser. This stays loops and concatenation so the measurement is what runs. */
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
          for(const attribute of element.attributes){
            if(attribute.name.startsWith('data-')&&hooks.length<40)hooks+=(hooks?' ':'')+attribute.name;
          }
          if(hooks)label+=' ['+hooks+']';
          wide.push(`${label} right=${Math.round(box.right)}`);
          if(wide.length>=6)break;
        }
        return {scroll:document.documentElement.scrollWidth,client,wide};
      });
      assert.ok(measured.scroll<=measured.client+1,
        `${name} overflows horizontally at ${width}px (${measured.scroll} > ${measured.client})`
        +(measured.wide.length?`\n  escaping the viewport: ${measured.wide.join(' | ')}`:''));
    }
    await page.setViewportSize({width:1440,height:900});
  };
  /** Poll until a condition holds: an autosave is a debounce, and a debounce is a wait. */
  const until=async(what:string,check:()=>Promise<boolean>,timeoutMs=90000)=>{
    const deadline=Date.now()+timeoutMs;
    for(;;){
      if(await check().catch(()=>false))return;
      if(Date.now()>deadline)throw Error(`timed out waiting for ${what}`);
      await new Promise(resolve=>setTimeout(resolve,500));
    }
  };

  try{
    /** One signed-in browser context; `digits` is the operator's own digit preference. */
    const signIn=async(width=1440,height=900,digits:'bn'|'en'='bn')=>{
      const context=await browser.newContext({viewport:{width,height}});
      const notes:string[]=[];
      let session:{user?:{id?:string}}|null=null;
      for(let attempt=1;attempt<=3&&!session?.user;attempt++){
        await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});
        const csrf=await (await context.request.get(`${origin}/api/auth/csrf`)).json() as {csrfToken:string};
        const callback=await context.request.post(`${origin}/api/auth/callback/credentials`,{
          timeout:180000,maxRedirects:0,headers:{origin,'content-type':'application/x-www-form-urlencoded'},
          form:{csrfToken:csrf.csrfToken,identifier:BOSS,password,callbackUrl:`${origin}/bn/admin`},
        }).catch(()=>null);
        session=await context.request.get(`${origin}/api/auth/session`)
          .then(response=>response.json() as Promise<{user?:{id?:string}}> ).catch(()=>null);
        notes.push(`attempt ${attempt}: callback ${callback?callback.status():'error'}, session ${JSON.stringify(session).slice(0,60)}`);
        if(!session?.user)await new Promise(resolve=>setTimeout(resolve,2000));
      }
      if(!session?.user)throw Error(`sign-in failed — ${notes.join(' | ')}`);
      await context.addCookies([{name:`diction_digits_${ownerId}`,value:digits,url:`${origin}/`}]);
      const page=await context.newPage(),errors:string[]=[];
      page.on('pageerror',error=>errors.push(`${page.url()}: ${error.message}`));
      page.on('dialog',dialog=>void dialog.accept());
      page.setDefaultTimeout(60000);
      return {context,page,errors};
    };
    /* Chromium answers a navigation started over a client re-read still in flight with `net::ERR_ABORTED`
       rather than with a page, so that one shape is retried; anything else fails on the first attempt. */
    const goto=async(page:Page,url:string,waitFor:string)=>{
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
    };
    /** The words an operator sees on a screen, and nothing the page carries for the browser alone. */
    const visibleWords=(page:Page)=>page.locator('body').innerText();
    const noJargon=async(page:Page,label:string)=>{
      const text=(await visibleWords(page)).toLowerCase();
      for(const word of JARGON){
        assert.equal(text.includes(word.toLowerCase()),false,`${label} does not say "${word}"`);
      }
    };

    const boss=await signIn();
    const page=boss.page;

    // ══ 1. A class is a place: the list opens into its hub ═════════════════════════════════════════
    await goto(page,'/bn/admin/students/classes','[data-class-hub]');
    assert.equal(await page.locator(`[data-class-hub="${classA}"]`).count(),1,
      'every class on the list is a door into its own page');
    assert.ok((await page.locator(`[data-class-hub="${classA}"]`).getAttribute('href')||'')
      .includes(`/admin/students/classes/${classA}`),'and the door is the class\'s own address');
    /* "+ Create a class" stays at the top of the list: the hub is a way in, not a replacement. */
    const createBox=await page.locator('details.center-class-box > summary').first().boundingBox();
    const firstDoor=await page.locator(`[data-class-hub="${classA}"]`).boundingBox();
    assert.ok(createBox&&firstDoor&&createBox.y<firstDoor.y,
      'the create-a-class box is still above the list of classes');
    await noJargon(page,'the classes list');

    await page.locator(`[data-class-hub="${classA}"]`).click();
    await page.locator('[data-class-kpis]').waitFor({state:'visible',timeout:90000});
    assert.equal((await page.locator('[data-class-name]').innerText()).trim(),CLASS_A,'the hub names the class');
    const meta=await page.locator('[data-class-meta]').innerText();
    assert.ok(meta.includes('প্রভাতী')&&meta.includes(bnDigits(today.year)),
      `the hub reads the shift and the year in the operator's own digits (${meta})`);
    assert.equal((await page.locator('[data-class-enrolled]').innerText()).trim(),bnDigits(ROLL_A.length),
      'and counts the roll it is running');
    assert.equal((await page.locator('[data-class-fee]').innerText()).trim(),bnDigits(FEE_A),
      'the fee is the class\'s own amount');
    assert.equal((await page.locator('[data-class-owing]').innerText()).trim(),bnDigits(duesA.rows.length),
      'the number owing is the dues engine\'s own');
    assert.equal(ascii(await page.locator('[data-class-due]').innerText()).trim(),String(duesA.total),
      'and so is what they owe');
    assert.equal(await page.locator('[data-class-collect]').count(),1,'taking a fee is one button in the header');
    assert.equal(await page.locator('[data-class-enroll] > summary').count(),1,
      'and so is enrolling somebody onto this class');
    assert.equal(await page.locator('[data-class-more] a[href*="/admin/center-exams/marksheet"]').count(),1,
      'the class menu reaches this class\'s marksheet');
    await noJargon(page,'the class hub');
    await shot(page,'g3-class-hub-bn-1440');

    /* The class with no amount of its own reads the fee its students are on — and loses a student the
       way the Students list has always allowed, behind a picked month and a typed reason. */
    await goto(page,`/bn/admin/students/classes/${classB}`,'[data-class-kpis]');
    assert.equal((await page.locator('[data-class-name]').innerText()).trim(),CLASS_B,'the second class has its own hub');
    assert.equal((await page.locator('[data-class-fee]').innerText()).trim(),bnDigits(FEE_B),
      'a class with no amount of its own quotes the fee its students are actually on');
    assert.equal((await page.locator('[data-class-enrolled]').innerText()).trim(),bnDigits(ROLL_B.length),
      'and counts its own roll');
    /* A row is picked out by the name on it: the pattern's row marker carries no id, and the name is
       what the operator reads. */
    const rowOf=(name:string)=>page.locator('tr[data-student-row]',{hasText:name}).first();
    const leaverRow=rowOf(LEAVER);
    await leaverRow.waitFor({state:'visible',timeout:60000});
    await leaverRow.locator('.student-act .pop-more .pop-anchor').click();
    const removeForm=leaverRow.locator('[data-more-remove]');
    await removeForm.waitFor({state:'visible',timeout:60000});
    assert.equal(await removeForm.locator('button[type="submit"]').isDisabled(),true,
      'removing a student asks for a month and a reason before it will run');
    await pickMonth(removeForm,'leave',ym(today.year,today.month));
    await removeForm.locator('textarea[name=reason]').fill('গ৩ পরীক্ষা: শিক্ষার্থী অন্য কেন্দ্রে ভর্তি হয়েছে');
    await removeForm.locator('button[type="submit"]').click();
    await until('the student to leave the roll',async()=>
      (await CenterStudent.findById(String(students[LEAVER]._id)).lean<StudentDoc>())?.status==='removed');
    await until('the hub to count the student who left',async()=>{
      if((await page.locator('[data-class-enrolled]').innerText()).trim()===bnDigits(1))return true;
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('[data-class-kpis]').waitFor({state:'visible',timeout:60000});
      return false;
    });
    assert.equal((await page.locator('[data-class-enrolled]').innerText()).trim(),bnDigits(1),
      'and the header drops the student who left');

    // ── enrolling from the hub, with the class already chosen ──────────────────────────────────────
    await goto(page,`/bn/admin/students/classes/${classA}`,'[data-class-kpis]');
    await page.locator('[data-class-enroll] > summary').click();
    const enrollForm=page.locator(`form[data-enroll-class="${classA}"]`);
    await enrollForm.waitFor({state:'visible',timeout:60000});
    assert.equal(await enrollForm.locator('select[name=classGroup]').inputValue(),classA,
      'the enrollment form is already standing in this class');
    /* The box keeps the empty choice it arrived with — a placeholder with words on it, so it is counted
       by the value it carries rather than by the text an operator reads. */
    const offered=await enrollForm.locator('select[name=classGroup]').evaluate((select:HTMLSelectElement)=>{
      let count=0;
      for(let index=0;index<select.options.length;index++)if(select.options[index].value)count+=1;
      return count;
    });
    assert.equal(offered,1,'and offers no other class to choose');
    await enrollForm.locator('[name=nameBn]').fill(NEW_STUDENT);
    await enrollForm.locator('[name=guardianName]').fill('গ৩ নতুন অভিভাবক');
    await enrollForm.locator('[name=guardianPhone]').fill('01799000111');
    await enrollForm.locator('[name=roll]').fill('6');
    await enrollForm.locator('[name=startYear]').fill(String(today.year));
    await enrollForm.locator('[name=startMonth]').selectOption(String(today.month));
    await enrollForm.locator('[name=monthlyFee]').fill(bnDigits(FEE_A));
    await enrollForm.locator('button.button-navy').click();
    await enrollForm.locator('.admin-feedback').waitFor({state:'visible',timeout:90000});
    assert.equal(await enrollForm.locator('.admin-feedback.error').count(),0,
      `enrolling from the hub is accepted (${await enrollForm.locator('.admin-feedback').innerText()})`);
    await until('the new student to be on the class roll',async()=>
      (await CenterStudent.countDocuments({classGroup:classA,status:'active'}))===ROLL_A.length+1);
    const newcomer=await CenterStudent.findOne({'name.bn':NEW_STUDENT}).lean<StudentDoc>();
    if(!newcomer)throw Error('the student the hub enrolled was not written');
    await until('the hub to count the student it just enrolled',async()=>{
      if((await page.locator('[data-class-enrolled]').innerText()).trim()===bnDigits(ROLL_A.length+1))return true;
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('[data-class-kpis]').waitFor({state:'visible',timeout:60000});
      return false;
    });
    assert.equal((await page.locator('[data-class-enrolled]').innerText()).trim(),bnDigits(ROLL_A.length+1),
      'the header counts the student the hub just enrolled');
    /* The roll below is the shared list, so a row keeps every verb it has always had. */
    const row=rowOf(ROLL_A[0]);
    await row.waitFor({state:'visible',timeout:60000});
    assert.equal(await row.locator('[data-student-edit]').count(),1,'a row on the class page still edits inline');
    assert.equal(await row.locator('[data-student-tick]').count(),1,'and still belongs to the bulk bar');
    await row.locator('.student-act .pop-more .pop-anchor').click();
    await row.locator('[data-more-menu]').waitFor({state:'visible',timeout:60000});
    assert.ok((await row.locator('[data-more-view]').getAttribute('href')||'')
      .includes(`/admin/students/${String(students[ROLL_A[0]]._id)}`),'the row menu opens their profile');
    assert.ok((await row.locator('[data-more-payment]').getAttribute('href')||'')
      .includes(`/admin/students/${String(students[ROLL_A[0]]._id)}/collect`),
      'and the row menu takes this student\'s fee');
    assert.equal(await row.locator('[data-more-remove]').count(),1,'and offers Remove behind its own form');
    assert.ok((await row.locator('[data-status-badge]').innerText()).length>0,'the row still says its due status');
    await shot(page,'g3-class-hub-enrolled-bn-1440');
    await noOverflow(page,'the class hub');
    await page.setViewportSize({width:360,height:900});
    await shot(page,'g3-class-hub-bn-360');
    await page.setViewportSize({width:1440,height:900});

    // ══ 2. The dues screen starts with the whole centre ════════════════════════════════════════════
    const summary=await liveClassDueSummary();
    const rowA=summary.rows.find(entry=>entry.classId===classA);
    const rowB=summary.rows.find(entry=>entry.classId===classB);
    assert.ok(rowA&&rowB,'the summary read has a line for each class');
    assert.equal(rowA.active,ROLL_A.length+1,'class A runs the roll the hub enrolled onto');
    assert.equal(rowB.active,1,'and class B the roll it is left with');
    await goto(page,'/bn/admin/students/dues','[data-dues-summary]');
    const summaryBox=await page.locator('[data-dues-summary]').boundingBox();
    const pickerBox=await page.locator('form.admin-filter select[name=class]').first().boundingBox();
    assert.ok(summaryBox&&pickerBox&&summaryBox.y<pickerBox.y,
      'the all-class due summary is above the picker that opens one class');
    assert.equal(await page.locator('[data-dues-summary-row]').count(),summary.rows.length,
      'one line per class the centre runs');
    const lineA=page.locator(`[data-dues-summary-row="${classA}"]`);
    assert.ok((await lineA.innerText()).includes(CLASS_A),'the line names its class');
    const cells=await lineA.locator('td').allInnerTexts();
    assert.equal(ascii(cells[0]).trim(),String(rowA.active),'and counts the students it runs');
    assert.equal(ascii(cells[1]).trim(),String(rowA.owing),'how many of them owe');
    assert.equal(ascii(cells[2]).trim(),String(rowA.monthlyFee),'what a month costs');
    assert.equal(ascii(cells[3]).trim(),String(rowA.total),'and what the class owes in total');
    assert.equal(ascii(await page.locator('[data-dues-summary-total]').innerText()).replace(/[^0-9]/g,''),
      String(summary.total),'the panel head carries the centre\'s own total');
    assert.ok((await page.locator(`[data-dues-summary-view="${classB}"]`).getAttribute('href')||'')
      .includes(`class=${classB}`),'each line\'s action opens that class\'s own due list');
    await noJargon(page,'the due list');
    await shot(page,'g3-dues-summary-bn-1440');
    /* The picker is on the page before the click as well, so "wait for the picker" is answered by the
       page the click has not left yet. The address is what the click changes, so the arrival is waited
       for there and then read again out of the box the new page painted. */
    await Promise.all([
      page.waitForURL(address=>address.searchParams.get('class')===classB,{timeout:90000,waitUntil:'commit'}),
      page.locator(`[data-dues-summary-view="${classB}"]`).click(),
    ]);
    const picker=page.locator('form.admin-filter select[name=class]').first();
    await until('the picker to arrive on that class',async()=>(await picker.inputValue())===classB);
    assert.equal(await picker.inputValue(),classB,'and the picker arrives on that class');
    /* The screen has two tables — the centre's summary and one class's list — so the wait names the
       panel it means rather than the first table on the page. The match is exact because the summary's
       own heading is a sentence that ends in the same word: a substring would pick up both panels and
       count the summary's rows as this class's. */
    const classPanel=page.locator('section.admin-panel')
      .filter({has:page.getByRole('heading',{name:bn.dues.list.overdueHeading,exact:true})});
    await classPanel.locator('table.admin-table tbody tr').first().waitFor({state:'visible',timeout:90000});
    assert.equal(await classPanel.locator('table.admin-table tbody tr').count(),1,
      'class B\'s own list is the one student it is left with');
    assert.ok((await classPanel.innerText()).includes(PAYER),'and names them');
    await noOverflow(page,'the due summary');
    await page.setViewportSize({width:360,height:900});
    await goto(page,'/bn/admin/students/dues','[data-dues-summary]');
    await shot(page,'g3-dues-summary-bn-360');
    await page.setViewportSize({width:1440,height:900});

    // ══ 3. A fee taken with a discount ═════════════════════════════════════════════════════════════
    const beforeB=(await liveClassDues(classB)).total;
    await goto(page,`/bn/admin/students/collect?student=${String(students[PAYER]._id)}`,'.daily-months');
    assert.ok((await page.locator('.daily-student').innerText()).includes(PAYER),
      'the cash desk arrives on the student it was sent to');
    await page.locator('.daily-month.daily-due').first().click();
    /* The save button is standing there before a month is picked, so the click's own answer is waited
       for instead: the month wears `chosen` once the desk has taken it. */
    await page.locator('.daily-month.chosen').first().waitFor({state:'visible',timeout:60000});
    await page.locator('[data-discount]').fill(bnDigits(DISCOUNT));
    /* The read-out is a client re-render away, so it is waited for rather than read straight after the
       keystroke — the claim is about what the operator sees, and what they see arrives a frame later. */
    await until('the read-out to answer the discount',async()=>{
      const text=await page.locator('[data-daily-total]').innerText();
      return text.includes(bn.daily.discountWord)&&text.includes(bnDigits(DISCOUNT))
        &&(await page.locator('[data-daily-cash]').innerText()).includes(bnDigits(FEE_B-DISCOUNT));
    });
    const readOut=await page.locator('[data-daily-total]').innerText();
    assert.ok(readOut.includes(bn.daily.discountWord),`the read-out names the discount beside the fee (${readOut})`);
    assert.ok(readOut.includes(bnDigits(DISCOUNT)),`and what was let go (${readOut})`);
    assert.ok((await page.locator('[data-daily-cash]').innerText()).includes(bnDigits(FEE_B-DISCOUNT)),
      `and the cash that is left to take (${readOut})`);
    await page.getByLabel(bn.daily.receiptLabel,{exact:true}).fill('45');
    await shot(page,'g3-collect-discount-bn-1440');
    await page.locator('button.daily-save').click();
    await page.locator('.daily-success').waitFor({state:'visible',timeout:120000});
    const successText=await page.locator('.daily-success').innerText();
    assert.ok(successText.includes(bnDigits(FEE_B-DISCOUNT)),
      `the receipt says what was handed over, not the fee (${successText})`);
    const discountLine=await page.locator('[data-daily-discount]').innerText();
    assert.ok(discountLine.includes(bnDigits(FEE_B))&&discountLine.includes(bnDigits(DISCOUNT)),
      `and says the fee beside the discount (${discountLine})`);
    /* The receipt is `display:none` on screen and painted only by the print stylesheet, so its words are
       read out of the DOM rather than out of the layout. */
    const printed=(await page.locator('.daily-print').textContent())||'';
    assert.ok(printed.includes(bn.daily.printDiscount)&&printed.includes(bnDigits(DISCOUNT)),
      'the printed receipt carries the discount line');
    assert.ok(printed.includes(bn.daily.printCash)&&printed.includes(bnDigits(FEE_B-DISCOUNT)),
      'and the cash that was taken');
    assert.ok(printed.includes(bn.daily.totalWord)&&printed.includes(bnDigits(FEE_B)),
      'and still shows the fee the month was settled at');
    /* The drawer is re-read after the receipt paints, so it is waited for rather than read in the same
       breath as the success note. */
    await until('the day\'s drawer to count the cash just taken',async()=>
      (await page.locator('.daily-today').innerText()).includes(bnDigits(FEE_B-DISCOUNT)));
    assert.ok((await page.locator('.daily-today').innerText()).includes(bnDigits(FEE_B-DISCOUNT)),
      'the day\'s drawer counts the cash, not the fee');
    const payment=await CenterPayment.findOne({student:students[PAYER]._id,type:'monthly',discount:DISCOUNT})
      .lean<{amount:number;discount:number;month:number;academicYear:number}>();
    assert.ok(payment,'the stored payment keeps the discount beside the fee');
    assert.equal(payment.amount,FEE_B,'the fee it settles is the month\'s own fee');
    assert.equal(payment.discount,DISCOUNT,'and the discount is the taka let go');
    await until('the month to be settled by the fee rather than left owing by the discount',async()=>
      (await liveClassDues(classB)).total===beforeB-FEE_B);
    assert.ok((await liveClassDues(classB)).total===beforeB-FEE_B,
      'the class owes exactly the fee less, not the cash less');
    await noJargon(page,'the cash desk');
    await noOverflow(page,'the cash desk');
    await page.setViewportSize({width:360,height:900});
    await shot(page,'g3-collect-discount-bn-360');
    await page.setViewportSize({width:1440,height:900});

    // ══ 4. An exam marked by its components ════════════════════════════════════════════════════════
    await goto(page,'/bn/admin/center-exams?new=1','[data-exam-form="create"]');
    const form=page.locator('[data-exam-form="create"]');
    await form.locator('[name=name]').fill(EXAM_ONE.name);
    await form.locator(`[name=classId][value="${classA}"]`).check();
    await form.getByLabel(bn.common.dateParts.day,{exact:true}).selectOption(String(Math.min(today.day,28)));
    await form.getByLabel(bn.common.dateParts.month,{exact:true}).selectOption(String(today.month));
    await form.getByLabel(bn.common.dateParts.year,{exact:true}).selectOption(String(today.year));
    await form.locator('[name=type]').selectOption('monthly');
    await form.locator('[name=subject-0]').fill(EXAM_ONE.subject);
    await form.locator('[name=full-0]').fill(bnDigits(100));
    await form.locator('[name=pass-0]').fill(bnDigits(EXAM_ONE.pass));
    /* The subject is split the way the centre splits it, and the total adds itself up as it is typed. */
    for(const [slot,part] of EXAM_ONE.parts.entries()){
      await form.locator(`[data-part-add="0"]`).click();
      await form.locator(`[data-part-row="0-${slot}"] [name=part-0-${slot}-name]`).fill(part.name);
      await form.locator(`[data-part-row="0-${slot}"] [name=part-0-${slot}-marks]`).fill(bnDigits(part.marks));
      const running=EXAM_ONE.parts.slice(0,slot+1).reduce((sum,entry)=>sum+entry.marks,0);
      await until(`the subject's total to add itself up to ${running}`,async()=>
        (await form.locator('[data-part-total="0"]').inputValue())===bnDigits(running));
    }
    assert.equal(await form.locator('[name=full-0]').isEditable(),false,
      'a subject with components has a total that is added up, not typed twice');
    await shot(page,'g3-exam-parts-form-bn-1440');
    await form.locator('[name=confirm]').check();
    await page.waitForFunction(()=>{
      const button=document.querySelector('[data-exam-form="create"] [data-exam-submit]');
      return !!button&&!(button as HTMLButtonElement).disabled;
    },undefined,{timeout:60000});
    await form.locator('[data-exam-submit]').click();
    await form.locator('[data-exam-saved]').waitFor({timeout:90000});
    const examOne=await CenterExam.findOne({'name.bn':EXAM_ONE.name}).lean<ExamDoc>();
    assert.ok(examOne,'the exam was written');
    assert.equal(examOne.subjects[0].fullMarks,100,'the subject\'s total is the sum of its components');
    assert.deepEqual(examOne.subjects[0].parts.map(part=>({name:part.name.bn,marks:part.marks})),EXAM_ONE.parts,
      'and the components themselves are stored with it');
    const examOneId=String(examOne._id),oneSubject=String(examOne.subjects[0]._id);

    await goto(page,`/bn/admin/center-exams/${examOneId}`,'[data-exam-grid]');
    const grid=page.locator('[data-exam-grid]');
    assert.equal(await grid.locator('thead th').count(),9,
      'the grid has a column per component, then the student, the total, the percentage, the grade, the point, the rank and the absent switch');
    const headText=await grid.locator('thead').innerText();
    for(const part of EXAM_ONE.parts){
      assert.ok(headText.includes(part.name),`a component names its own column (${headText})`);
    }
    assert.ok(headText.includes(`/${bnDigits(60)}`)&&headText.includes(`/${bnDigits(40)}`),
      'and each column carries its own ceiling');
    assert.equal(await grid.locator('[data-row]').count(),ROLL_A.length+1,
      'every active student of the class is a row, in the list\'s own order');
    assert.equal(await grid.locator('tfoot [data-summary-subject]').count(),1,
      'one average per subject in the footer, however many columns that subject has');
    const footerCells=await grid.locator('tfoot tr').first().evaluate(
      (row:HTMLElement)=>[...row.children].reduce((sum,cell)=>sum+(Number(cell.getAttribute('colspan'))||1),0));
    assert.equal(footerCells,9,'and the footer spans exactly the columns the body has');

    const cellOf=(student:string,part:number)=>
      grid.locator(`[data-student="${String(students[student]._id)}"][data-subject="${oneSubject}"][data-part="${part}"]`);
    const gridRow=(student:string)=>grid.locator(`[data-row="${String(students[student]._id)}"]`);
    /* Typed in Bangla digits, as the centre types: the row total moves the moment a component lands. */
    await cellOf(ROLL_A[0],0).fill(bnDigits(40));
    await cellOf(ROLL_A[0],1).fill(bnDigits(35));
    await gridRow(ROLL_A[0]).locator('[data-cell-total]').filter({hasText:bnDigits(75)}).waitFor({timeout:60000});
    assert.equal(await cellOf(ROLL_A[0],0).getAttribute('aria-label'),
      `${ROLL_A[0]} · ${EXAM_ONE.subject} · ${EXAM_ONE.parts[0].name}`,
      'a component box says which child, which subject and which part it is');
    /* Over the component's own ceiling: refused in the grid, and never written. */
    await cellOf(ROLL_A[1],0).fill(bnDigits(61));
    await grid.locator('[data-grid-errors]').waitFor({timeout:60000});
    const refusal=await grid.locator('[data-grid-errors]').innerText();
    assert.ok(refusal.includes(EXAM_ONE.parts[0].name)&&refusal.includes(ROLL_A[1])&&refusal.includes(bnDigits(60)),
      `the refusal names the child, the component and its ceiling (${refusal})`);
    assert.equal(await CenterExamResult.countDocuments({exam:examOneId,student:students[ROLL_A[1]]._id}),0,
      'and a refused component is never written');
    await cellOf(ROLL_A[1],0).fill(bnDigits(50));
    await cellOf(ROLL_A[1],1).fill(bnDigits(40));
    await gridRow(ROLL_A[1]).locator('[data-cell-total]').filter({hasText:bnDigits(90)}).waitFor({timeout:60000});
    assert.equal(await grid.locator('[data-grid-errors]').count(),0,'correcting the number clears the refusal');
    for(const [name,scored] of Object.entries(SCORED_ONE)){
      if(scored==='absent'||name===ROLL_A[0]||name===ROLL_A[1])continue;
      await cellOf(name,0).fill(bnDigits(scored[0]));
      await cellOf(name,1).fill(bnDigits(scored[1]));
      await gridRow(name).locator('[data-cell-total]').filter({hasText:bnDigits(scored[0]+scored[1])})
        .waitFor({timeout:60000});
    }
    await gridRow(ABSENT).locator(`[data-absent-row="${String(students[ABSENT]._id)}"]`).click();
    await gridRow(ABSENT).locator('[data-absent="true"]').first().waitFor({timeout:60000});
    await shot(page,'g3-marks-grid-parts-bn-1440');
    /* The grid autosaves on a debounce, so the button may already have nothing to do: ask it to save
       when it can, and let the database be the thing that is waited for either way. */
    const saveButton=grid.locator('[data-grid-save]');
    if(await saveButton.isEnabled().catch(()=>false))await saveButton.click();
    await until('every component mark to be stored',async()=>
      (await CenterExamResult.countDocuments({exam:examOneId}))===ROLL_A.length);
    const stored=await CenterExamResult.findOne({exam:examOneId,student:students[ROLL_A[0]]._id}).lean<ResultDoc>();
    assert.ok(stored,'the first student\'s row was written');
    assert.equal(stored.total,75,'the stored total is what the components add up to');
    assert.equal(stored.fullTotal,100,'against the subject\'s own total');
    assert.deepEqual(stored.marks[0].parts.map(part=>({name:part.name,obtained:part.obtained})),
      [{name:EXAM_ONE.parts[0].name,obtained:40},{name:EXAM_ONE.parts[1].name,obtained:35}],
      'and the result keeps the components behind the mark');
    const absentRow=await CenterExamResult.findOne({exam:examOneId,student:students[ABSENT]._id}).lean<ResultDoc>();
    assert.ok(absentRow&&absentRow.marks[0].absent,'a blank row is stored as absent, not as zero');
    await noJargon(page,'the marks grid');
    await noOverflow(page,'the component marks grid');
    await page.setViewportSize({width:360,height:900});
    await shot(page,'g3-marks-grid-parts-bn-360');
    await page.setViewportSize({width:1440,height:900});

    /* Published with the dialog's SMS box left unticked, so the only batch this suite finds is the one
       the send button below writes — and the screen says so. */
    const publish=page.locator('[data-exam-publish="publish"]');
    await publish.waitFor({timeout:90000});
    await publish.locator('[data-publish-open]').click();
    const dialog=page.locator('[data-publish-dialog]');
    await dialog.waitFor({state:'visible',timeout:60000});
    assert.equal(await dialog.locator('[data-publish-sms]').isChecked(),false,
      'the automatic send starts unticked: the decision belongs to the person holding the mouse');
    await dialog.locator('[data-publish-confirm]').check();
    await dialog.locator('[data-publish-submit]').click();
    await page.locator('[data-exam-publish="unpublish"]').waitFor({timeout:120000});
    assert.equal((await page.locator('[data-publish-status]').innerText()).trim(),bn.exams.publish.smsSkipped,
      'and publishing on its own told nobody');
    assert.equal(await CenterSmsBatch.countDocuments({purpose:'exam_result'}),0,'no batch yet');

    const send=page.locator('[data-exam-send]');
    await send.waitFor({state:'visible',timeout:60000});
    assert.equal(await send.locator('[data-exam-send-submit]').isDisabled(),true,'the send asks first');
    await send.locator('[data-exam-send-confirm]').check();
    await until('the send to be willing',async()=>!(await send.locator('[data-exam-send-submit]').isDisabled()));
    assert.equal(await send.locator('[data-exam-send-submit]').isDisabled(),false,'and one tick is the asking');
    assert.ok((await send.locator('[data-exam-send-history]').getAttribute('href')||'')
      .includes('/admin/sms?template=exam_result'),'the history of result messages is beside the button');
    await send.locator('[data-exam-send-submit]').click();
    await send.locator('[data-exam-send-result]').waitFor({timeout:180000});
    const batches=await CenterSmsBatch.find({purpose:'exam_result',trigger:'auto_result'})
      .lean<BatchDoc[]>();
    assert.equal(batches.length,1,'one batch for the one class this exam covers');
    const [batch]=batches;
    assert.equal(batch.sentCount,4,'four families were told — the four children whose marks are in');
    assert.equal(batch.skippedCount,2,
      'and two were left out: the child who was absent and the child the hub just enrolled');
    assert.equal(batch.failedCount,0,'nothing failed');
    const answer=(await send.locator('[data-exam-send-total]').innerText()).trim();
    assert.equal(answer,fill(bn.exams.results.sentSummary,{sent:bnDigits(batch.sentCount),
      skipped:bnDigits(batch.skippedCount),failed:bnDigits(batch.failedCount)}),
      'the screen says the same counts the batch wrote');
    /* The batch's record is every row it wrote — the four it told and the two it left out, each left-out
       row carrying the reason it was left, because a send that quietly drops two children is a send
       nobody can audit. The told rows are counted apart from the record they live in. */
    const logs=await CenterSmsLog.find({batch:batch._id,status:'sent'}).lean<LogDoc[]>();
    assert.equal(logs.length,4,'four messages went out, one per family told');
    assert.ok(logs.every(log=>log.message.trim().length>10),'and not one of them is blank');
    const left=await CenterSmsLog.find({batch:batch._id,status:{$ne:'sent'}}).lean<LogDoc[]>();
    assert.deepEqual(left.map(row=>String(row.student)).sort(),
      [String(students[ABSENT]._id),String(newcomer._id)].sort(),
      'the two left out are recorded as left out: the absent child and the child with no marks yet');
    assert.ok(left.every(row=>String(row.reason||'').trim().length>0),'and each of them says why');
    const classLine=send.locator(`[data-exam-send-class="${classA}"]`);
    assert.ok((await classLine.innerText()).includes(CLASS_A),'the answer names the class it sent to');
    const proof=classLine.locator('[data-exam-send-proof]');
    assert.ok((await proof.getAttribute('href')||'').includes(`/admin/sms?batch=${String(batch._id)}`),
      'the proof of that send is one click away, filtered to its own batch');
    await shot(page,'g3-result-sms-bn-1440');
    await proof.click();
    await page.locator('[data-sms-batch-filter]').waitFor({state:'visible',timeout:90000});
    const filterNote=await page.locator('[data-sms-batch-filter]').innerText();
    /* The history of one send is the whole record of that send, so the note counts every row the list
       shows and the list holds the two left out beside the four told — a record that hides the children
       nobody was told about is a record with a hole in it. */
    const historyRows=page.locator('[data-sms-card="history"] table.admin-table tbody tr');
    const listed=await historyRows.count();
    assert.equal(listed,6,'six rows: the four told and the two left out');
    assert.ok(filterNote.includes(fill(bn.sms.page.batchFilter,{count:bnDigits(listed)})),
      `the history says it is showing one send, and counts what it shows (${filterNote})`);
    assert.ok(filterNote.includes(bn.sms.page.batchFilterClear),'and offers the way back to all of them');
    /* Read badge by badge: a row's message is a sentence of its own, and a word inside it must not be
       mistaken for the word the row wears. */
    const badges=await historyRows.locator('.admin-badge').allInnerTexts();
    assert.equal(badges.filter(text=>text.trim()===bn.sms.statuses.sent).length,4,
      'four rows wear the sent word');
    const absentHistoryRow=historyRows.filter({hasText:ABSENT});
    assert.equal(await absentHistoryRow.count(),1,'and the absent child is in the record of the send');
    assert.equal((await absentHistoryRow.locator('.admin-badge').first().innerText()).trim(),
      bn.sms.statuses.skipped,'as a row that was left out rather than one that was told');
    await shot(page,'g3-result-sms-proof-bn-1440');

    // ══ 5. A month ends in one sheet ═══════════════════════════════════════════════════════════════
    const month=ym(today.year,today.month);
    await goto(page,'/bn/admin/center-exams/marksheet','[data-marksheet-form]');
    assert.equal((await page.locator('[data-marksheet-title]').innerText()).trim(),bn.exams.marksheet.title,
      'the sheet is its own screen under exams');
    await page.locator('[data-marksheet-form] select[name=class]').selectOption(classA);
    await page.locator('[data-marksheet-form] select[name=month]').selectOption(month);
    await page.locator('[data-marksheet-show]').click();
    await page.locator('[data-marksheet-table]').waitFor({state:'visible',timeout:90000});
    assert.equal(await page.locator('[data-marksheet-exam]').count(),2,
      'both exams held in the month are columns of one sheet');
    assert.equal(await page.locator('[data-marksheet-row]').count(),ROLL_A.length+1,
      'and every student on the roll is a row');
    const heading=await page.locator('[data-marksheet-heading]').innerText();
    assert.ok(heading.includes(CLASS_A),`the sheet names its class and its month (${heading})`);
    for(const name of ROLL_A){
      const line=page.locator(`[data-marksheet-row="${String(students[name]._id)}"]`);
      assert.equal((await line.locator('[data-marksheet-rank]').innerText()).trim(),RANKS_BN[name],
        `${name} holds the position their totals earn, in Bangla ordinals`);
    }
    const top=page.locator(`[data-marksheet-row="${String(students[ROLL_A[1]]._id)}"]`);
    assert.equal((await top.locator('[data-marksheet-possible]').innerText()).trim(),bnDigits(150),
      'the top of the class was marked out of 150');
    assert.equal((await top.locator('[data-marksheet-obtained]').innerText()).trim(),bnDigits(130),
      'and scored 130 of it');
    assert.equal((await top.locator(`[data-marksheet-cell="${examTwo.id}"]`).innerText()).trim(),
      `${bnDigits(40)}/${bnDigits(50)}`,'each exam\'s own column shows the mark against its total');
    assert.equal((await top.locator(`[data-marksheet-cell="${examOneId}"]`).innerText()).trim(),
      `${bnDigits(90)}/${bnDigits(100)}`,'and the exam split into components shows the mark against its own total');
    const absentLine=page.locator(`[data-marksheet-row="${String(students[ABSENT]._id)}"]`);
    assert.equal((await absentLine.locator(`[data-marksheet-cell="${examOneId}"]`).innerText()).trim(),
      bn.exams.grades.absent,'a child who was absent is named absent rather than scored zero');
    const fresh=page.locator(`[data-marksheet-row="${String(newcomer._id)}"]`);
    assert.equal((await fresh.locator('[data-marksheet-rank]').innerText()).trim(),'—',
      'a child with no marks in the month holds no position, rather than coming last');
    assert.equal((await fresh.locator('[data-marksheet-cell]').first().innerText()).trim(),'—',
      'and their cells say nothing was marked');
    assert.equal((await fresh.locator('[data-marksheet-percentage]').innerText()).trim(),'—',
      'with no percentage invented for them');
    assert.equal(await page.locator('[data-marksheet-print]').count(),1,'one button prints the report');
    assert.equal((await page.locator('[data-marksheet-print]').innerText()).trim(),
      bn.exams.marksheet.printButton,'and it says what it does');
    assert.ok((await page.locator('[data-marksheet]').getAttribute('class')||'').includes('report-print'),
      'the sheet itself is the thing the print stylesheet keeps');
    await noJargon(page,'the marksheet');
    await shot(page,'g3-marksheet-bn-1440');
    await noOverflow(page,'the monthly marksheet');
    await page.setViewportSize({width:360,height:900});
    await shot(page,'g3-marksheet-bn-360');
    await page.setViewportSize({width:1440,height:900});

    // ── the same sheet in English, in the operator's own digits ───────────────────────────────────
    const english=await signIn(1440,900,'en');
    await goto(english.page,`/en/admin/center-exams/marksheet?class=${classA}&month=${month}`,
      '[data-marksheet-table]');
    for(const name of ROLL_A){
      const line=english.page.locator(`[data-marksheet-row="${String(students[name]._id)}"]`);
      assert.equal((await line.locator('[data-marksheet-rank]').innerText()).trim(),RANKS_EN[name],
        `${name}'s position reads as an English ordinal on an English address`);
    }
    /* The sheet's own words are English however the children are named: the columns, the heading, the
       positions and the button — not the exam names, which are the centre's own Bangla. */
    const chrome=await english.page.locator(
      '[data-marksheet-title],[data-marksheet-heading],[data-marksheet-print],'
      +'[data-marksheet-table] thead tr th:first-child,[data-marksheet-table] thead tr th:nth-child(n+4),'
      +'[data-marksheet-rank]').allInnerTexts();
    assert.equal(hasBanglaLetters(chrome.join(' ')),false,
      `the sheet's own words carry no Bangla on an English address (${chrome.join(' | ')})`);
    assert.ok((await english.page.locator('[data-marksheet-heading]').innerText()).includes('Group Three Nine'),
      'and the class is named in English where it has an English name');
    const topEn=english.page.locator(`[data-marksheet-row="${String(students[ROLL_A[1]]._id)}"]`);
    assert.equal((await topEn.locator('[data-marksheet-obtained]').innerText()).trim(),'130',
      'the marks read in ASCII digits for an operator who asked for them');
    await noOverflow(english.page,'the English marksheet');
    await shot(english.page,'g3-marksheet-en-1440');
    await english.page.setViewportSize({width:360,height:900});
    await shot(english.page,'g3-marksheet-en-360');
    await english.page.setViewportSize({width:1440,height:900});
    assert.deepEqual(english.errors,[],`no client-side error on the marksheet (${english.errors.join(' | ')})`);
    await english.context.close();

    assert.deepEqual(boss.errors,[],`no client-side error anywhere in the group's screens (${boss.errors.join(' | ')})`);
    await boss.context.close();

    console.log(`Group 3 in the browser, photographed at 360 px and 1440 px into screenshots/g3: a class opens into its own page naming ${CLASS_A}, its প্রভাতী shift, ${bnDigits(ROLL_A.length)} students and a ৳${bnDigits(FEE_A)} month — while ${CLASS_B}, with no amount of its own, quotes the ৳${bnDigits(FEE_B)} its students are on, enrolled ${NEW_STUDENT} from the hub and dropped ${LEAVER} behind a picked month and a typed reason; the due list leads with one line per class (${bnDigits(summary.rows.length)} of them, ৳${bnDigits(summary.total)} owed centre-wide) above the picker that opens one; a fee taken with a ৳${bnDigits(DISCOUNT)} discount settled the month at ৳${bnDigits(FEE_B)}, stored both numbers, printed the discount and counted ৳${bnDigits(FEE_B-DISCOUNT)} in the day's drawer; an exam split into ${EXAM_ONE.parts.map(part=>part.name).join(' ও ')} added its own ${bnDigits(100)} up, marked each part in its own column, refused ${bnDigits(61)} against a ${bnDigits(60)} ceiling without writing it, kept the components inside the stored result, and told ${bnDigits(4)} families by one button while the absent child and the child with no marks were left out — the proof one click away in the SMS history filtered to that batch; and the month's marksheet printed ${bnDigits(2)} exams across ${bnDigits(ROLL_A.length+1)} students, ${RANKS_BN[ROLL_A[1]]} to the top of the class, ${RANKS_BN[ROLL_A[0]]} shared by the two level on ${bnDigits(120)}, and no position at all for a child with no marks — in Bangla and in English, with no jargon and nothing overflowing at 360, 768 or 1440 px.`);
  }finally{
    await browser.close();
    await mongoose.disconnect();
    if(!shared)await mongo.stop();
  }
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
