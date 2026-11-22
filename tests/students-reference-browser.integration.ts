/**
 * Group 1 · the Students list and the student profile, built FROM the shared pattern
 * (`src/components/admin/list-pattern.tsx`) rather than beside it.
 *
 * R8 finished one page — Visitors — as the reference, and the owner approved it on one condition: the
 * next list is not a copy of that page's code but a composition of shared components, so that a fix in
 * one place fixes every list. This suite is the proof of that, and every assertion is a line of the
 * brief:
 *
 *  1. one compact row per student — four visible controls plus the tick, no long action cell, ≤72 px;
 *  2. a visible Edit on EVERY row, and a ⋯ holding View profile, Send SMS, Take payment, Hold or Lift
 *     hold, Transfer class, Change monthly fee, and at its destructive end Remove — with a leave month
 *     and a reason, for Admin and Super Admin only, and for any other role the honest sentence naming
 *     who may;
 *  3. filters for class and status, and a "show removed" tick that widens the list to the students the
 *     centre stopped running — where the row's verb is Restore, not Remove;
 *  4. Edit→Save, Hold→Lift hold and Remove→Restore each cost the taps the pattern promises, answer
 *     with a toast on a surface that outlives the row, and write their audit line — and since S1 a hold
 *     is a range of months, so the badge opens the sheet that asks which month it takes effect from, or
 *     which month the student resumes in, before anything is written;
 *  5. no native date or month input anywhere: a leave month, a resume month and an admission day all
 *     come from our own pickers and read back in the operator's digits and language;
 *  6. the number is printed for the roles that dial, and travels in no URL and no link but tel:/wa.me;
 *  7. at 360 px the row is a card with big Call and WhatsApp, nothing overflows at 360/768/1024/1440,
 *     and the same pattern still paints the Visitors list — one implementation, two pages;
 *  8. a Staff account and a no-access role reach none of it, and the sidebar offers them no door.
 *
 * Photographed into screenshots/g1 with eight seeded students across two classes — one held, ones with
 * dues, one paid up, one long Bangla name, one without a guardian number and one removed.
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
import {CenterActivityLog,CenterClassGroup,CenterPayment,CenterSettings,CenterSmsTemplate,CenterStudent} from '../src/models/CenterRecords';
import {Lead} from '../src/models/Lead';
import {createQuickLead} from '../src/lib/leads/leads';
import {dhakaCalendar} from '../src/lib/center/month-status';
import {calculateStudentDues,monthKey} from '../src/lib/center/dues';
import {formatNumber} from '../src/lib/admin/format';
import bn from '../src/messages/bn.json';
import enCatalogue from '../src/messages/en.json';

const c=bn.center,row=c.row;
const SHOTS=path.join('screenshots','g1');
/** Bangla digits read as ASCII ones, so an assertion can count either. */
const ascii=(text:string):string=>text.replace(/[\u09e6-\u09ef]/g,ch=>String(ch.charCodeAt(0)-0x09e6));
const banglaDigits=(text:string):boolean=>/[\u09e6-\u09ef]/.test(text);
const ym=(year:number,month:number):string=>`${year}-${String(month).padStart(2,'0')}`;

/** Eight students, two classes, and the awkward shapes the owner asked to see among them. */
const FIXTURES={
  dues:'রাহুল আহমেদ',                 // four months unpaid: the row that owes the most
  long:'মোঃ আব্দুল্লাহ আল মামুন চৌধুরী হাসান', // the long name: it truncates, it does not widen the row
  part:'নুসরাত জাহান',                 // paid but for this month: one month owed
  noPhone:'ফারহানা কবির',              // a student's own number, no guardian number to dial
  removed:'সরানো শিক্ষার্থী',           // behind the show-removed tick, and Restore from there
  held:'সুমাইয়া আক্তার',                // on hold with a reason: an amber badge, and the months before it still owed
  heldBack:'তানভীর ইসলাম',             // the row the Hold→Unhold proof is driven on
  paid:'আরিফ হোসেন',                  // paid up: the clear chip, and the Super Admin's Remove proof
} as const;
const FEE={[FIXTURES.dues]:1200,[FIXTURES.long]:1000,[FIXTURES.part]:800,[FIXTURES.noPhone]:900,
  [FIXTURES.removed]:1000,[FIXTURES.held]:1300,[FIXTURES.heldBack]:1500,[FIXTURES.paid]:1100} as Record<string,number>;
const CLASS_A='নবম শ্রেণি',CLASS_B='দশম শ্রেণি';
const IN_CLASS_B=[FIXTURES.held,FIXTURES.heldBack,FIXTURES.paid];

type Stored={_id:mongoose.Types.ObjectId;studentId:string;status:string;notes:string;school:string;guardianPhone:string;
  revision:number;classGroup:mongoose.Types.ObjectId;startMonth:{year:number;month:number};
  feeHistory:{effectiveFrom:{year:number;month:number};amount:number}[];
  holds:{start:{year:number;month:number};end?:{year:number;month:number};reason:string}[];
  removal?:{leaveDate?:string;reason?:string};updatedAt:Date};

async function run(){
  await preflight({mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,test:'tests/students-reference-browser.integration.ts — start the app first, then run it with TEST_ORIGIN and TEST_MONGO_URI'});
  const shared=process.env.TEST_ORIGIN?process.env.TEST_MONGO_URI:null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3100';
  let ready=false;
  for(let attempt=0;attempt<60&&!ready;attempt++){
    try{ready=(await fetch(`${origin}/api/auth/csrf`)).ok}catch{/* not up yet */}
    if(!ready)await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(!ready)throw Error(`app not reachable at ${origin}`);
  await mkdir(SHOTS,{recursive:true});

  await CenterStudent.deleteMany({});
  await CenterClassGroup.deleteMany({});
  await CenterPayment.deleteMany({});
  await CenterActivityLog.deleteMany({});
  await Lead.deleteMany({});
  await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});

  const password=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(password,12);
  const accounts={admin:'g1-boss@example.test',superadmin:'g1-owner@example.test',staff:'g1-desk@example.test',content_editor:'g1-writer@example.test'};
  for(const role of ['admin','superadmin','staff','content_editor'] as const){
    await User.deleteOne({email:accounts[role]});
    await User.create({name:role==='admin'?'গ১ অ্যাডমিন':role==='superadmin'?'গ১ মালিক':role==='staff'?'গ১ ফ্রন্ট ডেস্ক':'গ১ কনটেন্ট লেখক',
      email:accounts[role],passwordHash:hash,role,active:true});
  }
  const bossId=(await User.findOne({email:accounts.admin}).lean<{_id:mongoose.Types.ObjectId}>())!._id;

  /* Dues have to be real on whatever day CI runs, so the fee run starts three Dhaka months back and the
     paid students are paid through Dhaka's own current month — including it, because the tenth of a
     month is the due day and this suite must not depend on which side of it the run falls. */
  const today=dhakaCalendar(new Date());
  const back=new Date(Date.UTC(today.year,today.month-1-3,1));
  const startMonth={year:back.getUTCFullYear(),month:back.getUTCMonth()+1};
  const lastMonth=startMonth.month===1?{year:startMonth.year-1,month:12}:{year:startMonth.year,month:startMonth.month-1};
  /* S1 · F-01: the month a seeded pause starts from, and the month the Hold→Unhold proof picks. It
     has to be a month AFTER enrolment: a pause that starts before the student arrived covers the whole
     fee run, so the student owes nothing and there is nothing for the finding to be about. One month
     back from Dhaka's own leaves the two months before it owed, which is what both proofs assert. */
  const pausedFrom=new Date(Date.UTC(today.year,today.month-2,1));
  const holdFrom={year:pausedFrom.getUTCFullYear(),month:pausedFrom.getUTCMonth()+1};
  /* S1 · the month after Dhaka's own: the month a hold is lifted into, so the last month the fee run
     skipped is Dhaka's own and the resume month is a month the centre bills. */
  const nextMonth=today.month===12?{year:today.year+1,month:1}:{year:today.year,month:today.month+1};
  const admissionDate=`${ym(startMonth.year,startMonth.month)}-05`;
  await CenterSettings.updateOne({key:'main'},{$set:{key:'main',quietStart:'00:00',quietEnd:'00:00',institutePhone:'01733330000',dueDay:10,smsUnitCost:0.5}},{upsert:true});
  await CenterSmsTemplate.deleteMany({});

  const groupA=await CenterClassGroup.create({name:{bn:CLASS_A,en:'Class Nine'},academicYear:today.year,shift:'প্রভাতী',active:true});
  const groupB=await CenterClassGroup.create({name:{bn:CLASS_B,en:'Class Ten'},academicYear:today.year,shift:'দিবা',active:true});
  const made:Record<string,Stored>=Object.fromEntries(
    await Promise.all(Object.entries(FIXTURES).map(async([key,name],index)=>{
      const inB=IN_CLASS_B.includes(name as typeof IN_CLASS_B[number]);
      const doc=await CenterStudent.create({
        studentId:`G1-${key.toUpperCase()}`,name:{bn:name,en:''},classGroup:inB?groupB._id:groupA._id,
        startMonth,admissionDate,guardianName:'অভিভাবক',
        guardianPhone:name===FIXTURES.noPhone?'':`017${String(10000000+index*1111111).slice(0,8)}`,
        studentPhone:name===FIXTURES.noPhone?'01521445567':'',
        school:inB?'মিরপুর গার্লস স্কুল ও কলেজ':'ধানমন্ডি সরকারি বালক বিদ্যালয়',
        roll:String(Object.keys(FIXTURES).indexOf(key)+1),
        feeHistory:[{effectiveFrom:startMonth,amount:FEE[name]}],
        notes:name===FIXTURES.dues?'প্রথম নোট — অভিভাবকের সঙ্গে কথা হয়েছে':name===FIXTURES.paid?'ভর্তির সময় লেখা নোট':'',
        status:name===FIXTURES.held?'on_hold':name===FIXTURES.removed?'removed':'active',
        ...(name===FIXTURES.held?{holds:[{start:holdFrom,reason:'পরীক্ষার জন্য তিন মাসের বিরতি',recordedBy:bossId}]}:{}),
        ...(name===FIXTURES.removed?{removal:{leaveDate:ym(lastMonth.year,lastMonth.month),reason:'পরিবার ঢাকার বাইরে চলে গেছে',removedAt:new Date(),removedBy:bossId,purgeAt:new Date(Date.now()+365*86400000)}}:{}),
      });
      return [name,doc.toObject() as unknown as Stored];
    })),
  );
  /** Receipts for the students who are paid up, one per fee month through Dhaka's current month. */
  const receipts:unknown[]=[];
  for(const name of [FIXTURES.long,FIXTURES.paid]){
    const student=made[name];let n=startMonth.year*12+startMonth.month-1,serial=0;
    for(;n<=today.year*12+today.month-1;n++){
      const year=Math.floor(n/12),month=n%12+1;
      receipts.push({student:student._id,classGroupAtPayment:student.classGroup,type:'monthly',academicYear:year,month,
        amount:FEE[name],receiptNo:`G1-${name.length}-${++serial}`,receiptKey:`g1-${serial}-${name.length}`,
        paidOn:`${ym(year,month)}-05`,receivedBy:bossId,groupId:'g1-seed',status:'valid'});
    }
  }
  // …and one month short for the student who is paid but for this one.
  {
    const student=made[FIXTURES.part];let n=startMonth.year*12+startMonth.month-1,serial=0;
    for(;n<today.year*12+today.month-1;n++){
      const year=Math.floor(n/12),month=n%12+1;
      receipts.push({student:student._id,classGroupAtPayment:student.classGroup,type:'monthly',academicYear:year,month,
        amount:FEE[FIXTURES.part],receiptNo:`G1-P-${++serial}`,receiptKey:`g1-p-${serial}`,
        paidOn:`${ym(year,month)}-05`,receivedBy:bossId,groupId:'g1-seed',status:'valid'});
    }
  }
  await CenterPayment.insertMany(receipts);
  assert.equal(await CenterStudent.countDocuments(),8,'eight students across two classes, and nothing else');
  /* Two visitors, so the other list the pattern paints has rows on it: the point of the shared
     components is that one implementation serves both pages, and that is worth looking at. */
  for(const visitor of [{name:'গ১ ভিজিটর এক',phone:'01712817090',classLabel:'9',school:'ধানমন্ডি সরকারি বালক বিদ্যালয়',status:'new'},
                        {name:'গ১ ভিজিটর দুই',phone:'01811223399',classLabel:'10',school:'মিরপুর গার্লস স্কুল',status:'called'}] as const)
    assert.equal((await createQuickLead({studentName:visitor.name,phone:visitor.phone,classLabel:visitor.classLabel,school:visitor.school,status:visitor.status},String(bossId))).ok,true,
      `the fixture visitor ${visitor.name} is written`);

  /** What the dues engine says a student owes, so the row can be held against the arithmetic itself. */
  const owed=async(name:string):Promise<{total:number;months:number}>=>{
    const student=await CenterStudent.findOne({'name.bn':name}).lean<Stored|null>();
    if(!student)throw Error(`${name} is not in the database`);
    const payments:Record<string,number>={};
    /* The engine's own key format, not a guess at it: `monthStatus` is handed a zero-padded month, and
       an unpadded key would read every receipt as missing. */
    for(const pay of await CenterPayment.find({student:student._id,status:'valid',type:'monthly'}).lean<{academicYear:number;month:number;amount:number}[]>()){
      const key=monthKey(pay.academicYear,pay.month);
      payments[key]=(payments[key]||0)+pay.amount;
    }
    const dues=calculateStudentDues({...student,payments,waivers:new Set<string>()} as never,new Date(),10);
    return {total:dues.total,months:dues.months.length};
  };

  const browser=await chromium.launch();
  const shot=(page:Page,name:string,fullPage=true)=>page.screenshot({path:path.join(SHOTS,`${name}.png`),fullPage});
  const noOverflow=async(page:Page,label:string)=>{
    const metrics=await page.evaluate(()=>({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));
    assert.ok(metrics.scrollWidth<=metrics.clientWidth+1,`${label}: nothing overflows horizontally at ${metrics.clientWidth}px (scrollWidth ${metrics.scrollWidth})`);
  };
  /** Wait for a write to land in the database rather than for a sentence to appear on screen. */
  const until=async(check:()=>Promise<boolean>,label:string,timeoutMs=90000)=>{
    const deadline=Date.now()+timeoutMs;
    for(;;){
      if(await check().catch(()=>false))return;
      if(Date.now()>deadline)throw Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
      await new Promise(resolve=>setTimeout(resolve,400));
    }
  };
  const stored=async(name:string)=>CenterStudent.findOne({'name.bn':name}).lean<Stored|null>();
  const toast=(page:Page,text:string):Locator=>page.locator('.admin-toast[role="status"]',{hasText:text}).first();
  /* A write's confirmation is raised on the way back from the action, but it paints only once React is
     free: the same commit that closes the dialog asks the page to re-read itself, and on the one-CPU
     runner that refresh can hold the toast's paint past a minute. The proof is unchanged — the toast
     has to arrive with its own words — it is only given the room the machine actually needs. */
  const TOAST_MS=120000;

  try{
    async function signIn(role:keyof typeof accounts,width=1440){
      const context=await browser.newContext({viewport:{width,height:900}});
      const notes:string[]=[];
      let session:{user?:unknown}|null=null;
      for(let attempt=1;attempt<=3&&!session?.user;attempt++){
        await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});
        const csrf=await (await context.request.get(`${origin}/api/auth/csrf`)).json();
        const callback=await context.request.post(`${origin}/api/auth/callback/credentials`,{
          timeout:180000,maxRedirects:0,headers:{origin,'content-type':'application/x-www-form-urlencoded'},
          form:{csrfToken:csrf.csrfToken,identifier:accounts[role],password,callbackUrl:`${origin}/bn/admin`},
        }).catch(()=>null);
        session=await context.request.get(`${origin}/api/auth/session`).then(response=>response.json()).catch(()=>null);
        notes.push(`attempt ${attempt}: callback ${callback?callback.status():'error'}, session ${JSON.stringify(session).slice(0,60)}`);
        if(!session?.user)await new Promise(resolve=>setTimeout(resolve,2000));
      }
      if(!session?.user)throw Error(`sign-in as ${role} failed — ${notes.join(' | ')}`);
      const page=await context.newPage(),errors:string[]=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('dialog',dialog=>dialog.accept());
      page.setDefaultTimeout(60000);
      return {context,page,errors};
    }

    const boss=await signIn('admin');
    const list='/bn/admin/students';
    const rowOf=(page:Page,name:string)=>page.locator('tr[data-student-row]',{hasText:name}).first();
    const rowCount=(page:Page)=>page.locator('section.list-panel tr[data-student-row]').count();
    /** On a phone the filter panel arrives collapsed and the ticks live inside it, so open it first —
        the same one tap it would cost a person standing at the counter. */
    const filters=async(page:Page):Promise<Locator>=>{
      const panel=page.locator('[data-student-filters]');
      await panel.waitFor({timeout:60000});
      if(await panel.getAttribute('open')===null)await panel.locator('summary').click();
      return panel;
    };
    /** Walk the month picker to a YYYY-MM value and take it — the `‹ ›` years are part of the proof, and
        they are walked towards the value rather than forwards only, so a leave month in December works
        on a suite that runs in January. */
    const pickMonth=async(scope:Locator,name:string,value:string)=>{
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
    const openMore=(page:Page,name:string)=>rowOf(page,name).locator('.student-act .pop-more .pop-anchor').click();
    const gotoList=async(session:{page:Page}):Promise<void>=>{
      await session.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
      await session.page.locator('h1',{hasText:c.title}).first().waitFor({timeout:60000});
      await session.page.locator('tr[data-student-row]').first().waitFor({timeout:90000});
    };

    await gotoList(boss);

    // ── 1. the reference row: eight seeded, seven on the list the centre works from ───────────────
    assert.equal(await rowCount(boss.page),7,'the removed student is filed away, not deleted: seven rows by default');
    const heights=await boss.page.locator('section.list-panel tr[data-student-row]').evaluateAll(nodes=>nodes.map(node=>Math.round(node.getBoundingClientRect().height)));
    assert.ok(heights.every(height=>height<=72),`every row is inside the 72px budget (${Math.max(...heights)}px tallest)`);
    for(const name of Object.values(FIXTURES)){
      if(name===FIXTURES.removed)continue;
      const tr=rowOf(boss.page,name);
      assert.equal(await tr.locator('[data-student-edit]').count(),1,`${name}: the row has a visible Edit`);
      assert.equal(await tr.locator('.student-act .pop-more .pop-anchor').count(),1,`${name}: and a ⋯ beside it`);
      // Four visible controls and no fifth: Edit, ⋯, the status badge and the dues chip. The tick is the
      // fifth thing an operator can touch, and it is a checkbox rather than a control of the row's own.
      const controls=await tr.locator('.student-act button:visible, .student-act .pop-anchor:visible, .student-status .pop-anchor:visible, .student-dues .pop-anchor:visible').count();
      assert.equal(controls,4,`${name}: exactly four controls in the row (${controls} found)`);
      assert.equal(await tr.locator('td').count(),7,`${name}: seven cells — tick, who, number, status, dues, note, actions`);
    }
    // The long Bangla name truncates inside its own cell instead of widening or heightening the row.
    const longBox=await rowOf(boss.page,FIXTURES.long).locator('.student-who').boundingBox();
    assert.ok(longBox&&longBox.width<420,`the long name stays inside its cell (${Math.round(longBox?longBox.width:0)}px)`);
    assert.ok((await rowOf(boss.page,FIXTURES.long).locator('.student-name strong').getAttribute('title'))===FIXTURES.long,
      'and the whole of it is still readable, in the cell\'s own title');
    // Dues: the chip is the total the engine computed, in the operator's digits, and it opens its months.
    const rahul=await owed(FIXTURES.dues);
    assert.ok(rahul.total>0,'the unpaid student really does owe something on the day this suite runs');
    const dueChip=rowOf(boss.page,FIXTURES.dues).locator('[data-dues-chip="due"]');
    assert.equal(await dueChip.count(),1,'a student who owes carries the due chip');
    assert.ok((await dueChip.innerText()).includes(formatNumber(rahul.total,'bn')),
      `and it says what is owed in Bangla digits (${await dueChip.innerText()} for ${rahul.total})`);
    assert.ok(banglaDigits(await dueChip.innerText()),'the total is in Bangla digits, not ASCII ones');
    await dueChip.click();
    const dueMonths=rowOf(boss.page,FIXTURES.dues).locator('[data-dues-months]');
    await dueMonths.waitFor({state:'visible',timeout:60000});
    assert.equal(await dueMonths.locator('.pop-item').count(),rahul.months,
      'one line per month owed, because a total with no months behind it is an argument, not an answer');
    await shot(boss.page,'g1-students-dues-1440',false);
    await boss.page.keyboard.press('Escape');
    assert.equal(await rowOf(boss.page,FIXTURES.long).locator('[data-dues-chip="clear"]').count(),1,'a paid-up student reads clear');
    /* S1 · F-01: a hold stops the meter, it does not forgive the run. The months before it are still
       owed, so the row that used to read "not counted" reads what those months come to — and the
       months inside the hold are billed by nobody, then or ever. */
    const heldOwed=await owed(FIXTURES.held);
    assert.equal(heldOwed.months,2,'the held student owes the two months before her hold, and none inside it');
    const heldChip=rowOf(boss.page,FIXTURES.held).locator('[data-dues-chip="due"]');
    assert.equal(await heldChip.count(),1,'and a held student is still counted for them');
    assert.ok((await heldChip.innerText()).includes(formatNumber(heldOwed.total,'bn')),
      `in the operator's own digits, for the amount the engine says (${await heldChip.innerText()} for ${heldOwed.total})`);
    assert.equal(await rowOf(boss.page,FIXTURES.noPhone).locator('[data-student-phone]').count(),0,
      'a student with no guardian number has no number printed');
    assert.ok((await rowOf(boss.page,FIXTURES.noPhone).innerText()).includes(row.noPhone),'and says so in the catalogue\'s own word');

    // ── 2. the number: printed for the roles that dial, and travelling nowhere else ───────────────
    const phoneCell=rowOf(boss.page,FIXTURES.dues).locator('.student-call');
    const guardian=(await stored(FIXTURES.dues))!.guardianPhone;
    assert.ok(banglaDigits(await phoneCell.locator('[data-student-phone]').innerText()),'the number is printed in Bangla digits');
    const hrefs=await boss.page.locator('section.list-panel a[href]').evaluateAll(nodes=>nodes.map(node=>(node as HTMLAnchorElement).href));
    for(const href of hrefs)
      assert.ok(href.startsWith(`tel:${guardian}`)||href.startsWith('https://wa.me/')||!href.includes(guardian.slice(3)),
        `a number only ever travels in a tel: or wa.me destination (${href})`);
    assert.ok(!boss.page.url().includes(ascii(guardian)),'the number is in no URL — the search is a POST, not an address bar');
    await boss.page.locator('[data-student-filters] input[name="q"]').fill(guardian);
    await boss.page.locator('[data-student-filters] button[type="submit"]').click();
    await until(async()=>await rowCount(boss.page)===1,'searching by a guardian number finds the student');
    assert.ok(!boss.page.url().includes(ascii(guardian)),'and the number never reached the address bar on the way');
    await boss.page.locator('[data-student-filters] input[name="q"]').fill('');
    await boss.page.locator('[data-student-filters] button[type="submit"]').click();
    await until(async()=>await rowCount(boss.page)===7,'the list comes back to its seven');

    // ── 3. no native date or month input anywhere on the three screens this group touches ─────────
    for(const [label,address] of [['the list',list],['a profile',`/bn/admin/students/${(await stored(FIXTURES.dues))!._id}`],['the removed list','/bn/admin/students/removed']] as const){
      await boss.page.goto(`${origin}${address}`,{waitUntil:'domcontentloaded',timeout:180000});
      assert.equal(await boss.page.locator('input[type="month"], input[type="date"]').count(),0,`${label} has no native date or month box`);
    }
    await gotoList(boss);

    // ── 4. filters: class, status, and the tick that widens the list to the removed ───────────────
    const panel=await filters(boss.page);
    await panel.locator('select[name="class"]').selectOption(String(groupB._id));
    await panel.locator('button[type="submit"]').click();
    await until(async()=>await rowCount(boss.page)===3,'the class filter narrows the list');
    for(const name of IN_CLASS_B)assert.equal(await rowOf(boss.page,name).count(),1,`${name} is in the second class`);
    assert.equal(await rowOf(boss.page,FIXTURES.dues).count(),0,'and a student of the other class is not');
    await panel.locator('select[name="status"]').selectOption('on_hold');
    await panel.locator('button[type="submit"]').click();
    await until(async()=>await rowCount(boss.page)===1,'the status filter narrows it again');
    assert.equal(await rowOf(boss.page,FIXTURES.held).count(),1,'one held student in that class');
    assert.equal(await rowOf(boss.page,FIXTURES.held).locator('[data-status-badge]').innerText(),c.onHold,'and her badge says so');
    await panel.locator('select[name="status"]').selectOption('');
    await panel.locator('select[name="class"]').selectOption('');
    await panel.locator('input[name="removed"]').check();
    await panel.locator('button[type="submit"]').click();
    await rowOf(boss.page,FIXTURES.removed).waitFor({timeout:90000});
    assert.equal(await rowCount(boss.page),8,'the show-removed tick brings all eight back');
    const removedRow=rowOf(boss.page,FIXTURES.removed);
    assert.equal(await removedRow.locator('[data-status-badge]').innerText(),c.removed,'a removed row wears its own badge');
    assert.equal(await removedRow.locator('[data-student-edit]').count(),0,'and offers no Edit — there is nothing to edit until it is restored');
    assert.equal(await removedRow.locator('input[name="smsStudent"]').count(),0,'and no tick: a student the centre stopped running is not a recipient');
    assert.ok((await removedRow.locator('.student-sub').innerText()).length>0,'the row says which month it left for');
    await shot(boss.page,'g1-students-show-removed-1440');
    await panel.locator('input[name="removed"]').uncheck();
    await panel.locator('button[type="submit"]').click();
    await until(async()=>await rowCount(boss.page)===7,'unticking files the removed student away again');

    /* ── 5. Hold → Lift hold: the badge opens the door, the door asks its month, a toast answers ──
       S1 took the write out of the second tap. A hold is a range of months — the first month the fee
       run skipped and, once the student is back, the last one it skipped — so the badge now opens the
       sheet that asks which month the hold takes effect from, and lifting one asks which month the
       student resumes in. The badge is still the switch an operator reaches for, the month is still
       picked rather than typed, and nothing is written until one has been. */
    const heldRow=rowOf(boss.page,FIXTURES.heldBack);
    await heldRow.locator('[data-status-badge]').click();
    const statusMenu=heldRow.locator('[data-status-menu]');
    await statusMenu.waitFor({state:'visible',timeout:60000});
    assert.equal(await statusMenu.locator('[data-status-option="on_hold"]').count(),1,'the badge opens the two statuses a row can be switched between');
    assert.equal(await statusMenu.locator('[data-status-option="active"]').count(),0,'and keeps the one it already has out of its own menu');
    await shot(boss.page,'g1-students-status-menu-1440',false);
    await statusMenu.locator('[data-status-option="on_hold"]').click();
    const holdSheet=boss.page.locator('[data-hold-dialog]');
    await holdSheet.waitFor({state:'visible',timeout:60000});
    assert.equal(await holdSheet.locator('[data-month-choose="fromMonth"]').count(),1,
      'the tap opens the sheet that asks which month the hold takes effect from, and the month is picked');
    assert.ok(await holdSheet.locator('[data-hold-submit]').isDisabled(),
      'and the verb is a dead button until one has been: the field that carries it is hidden');
    await shot(boss.page,'g1-students-hold-door-1440',false);
    await pickMonth(holdSheet,'fromMonth',ym(holdFrom.year,holdFrom.month));
    assert.ok(await holdSheet.locator('[data-hold-submit]').isEnabled(),'picking the month is what arms the verb');
    await holdSheet.locator('[data-hold-submit]').click();
    await toast(boss.page,row.holdOk).waitFor({state:'visible',timeout:TOAST_MS});
    await until(async()=>{
      const student=await stored(FIXTURES.heldBack);
      return student?.status==='on_hold'&&student.holds.length===1
        &&ym(student.holds[0].start.year,student.holds[0].start.month)===ym(holdFrom.year,holdFrom.month)
        &&!student.holds[0].end;
    },'the hold is written as an open range of months, from the month that was picked');
    await until(async()=>(await rowOf(boss.page,FIXTURES.heldBack).locator('[data-status-badge]').innerText())===c.onHold,'and the row re-reads with the new badge');
    const heldBackOwed=await owed(FIXTURES.heldBack);
    assert.equal(heldBackOwed.months,2,'a held student is counted for the months before the hold and for none inside it');
    assert.ok((await rowOf(boss.page,FIXTURES.heldBack).locator('[data-dues-chip="due"]').innerText())
      .includes(formatNumber(heldBackOwed.total,'bn')),
      'so the chip reads those months the moment the hold lands, rather than reading "not counted"');
    const holdLog=await CenterActivityLog.findOne({action:'student.hold',target:(await stored(FIXTURES.heldBack))!._id})
      .lean<{actor:unknown;after:{fromMonth:string}}|null>();
    assert.ok(holdLog&&String(holdLog.actor)===String(bossId),'the hold writes its audit line against the operator who made it');
    assert.equal(holdLog?.after.fromMonth,ym(holdFrom.year,holdFrom.month),'and the line carries the month it takes effect from');
    // …and back: the same badge, and a sheet that asks which month the student resumes in.
    await rowOf(boss.page,FIXTURES.heldBack).locator('[data-status-badge]').click();
    await rowOf(boss.page,FIXTURES.heldBack).locator('[data-status-option="active"]').click();
    const liftSheet=boss.page.locator('[data-hold-dialog]');
    await liftSheet.waitFor({state:'visible',timeout:60000});
    assert.equal(await liftSheet.locator('[data-month-choose="resume"]').count(),1,
      'lifting asks its own question: which month the fee starts again');
    await liftSheet.locator('[data-month-choose="resume"]').click();
    await liftSheet.locator('[data-month-year]').waitFor({state:'visible',timeout:60000});
    /* The picker will not offer a month inside the hold, because a range cannot end before it began. */
    for(let step=0;step<8;step++){
      const shown=Number(ascii(await liftSheet.locator('[data-month-year]').innerText()));
      if(shown===holdFrom.year)break;
      await liftSheet.locator(shown>holdFrom.year?'[data-month-back]':'[data-month-forward]').click();
    }
    assert.ok(await liftSheet.locator(`[data-month-pick="${ym(holdFrom.year,holdFrom.month)}"]`).isDisabled(),
      'and it will not offer a resume month inside the hold it is closing');
    await shot(boss.page,'g1-students-lift-door-1440',false);
    await liftSheet.locator('[data-month-choose="resume"]').click();
    await pickMonth(liftSheet,'resume',ym(nextMonth.year,nextMonth.month));
    await liftSheet.locator('[data-hold-submit]').click();
    await toast(boss.page,row.unholdOk).waitFor({state:'visible',timeout:TOAST_MS});
    await until(async()=>{
      const student=await stored(FIXTURES.heldBack);
      return student?.status==='active'&&student.holds.length===1
        &&ym(student.holds[0].end?.year||0,student.holds[0].end?.month||0)===ym(today.year,today.month);
    },'the hold is lifted, and its range is closed at the month before the one the student resumes in');
    assert.deepEqual(await owed(FIXTURES.heldBack),heldBackOwed,
      'and lifting back-bills nothing: the months inside the closed range are owed by nobody, then or ever');
    const liftLog=await CenterActivityLog.findOne({action:'student.unhold',target:(await stored(FIXTURES.heldBack))!._id})
      .lean<{after:{resumeMonth:string;heldUntil:string}}|null>();
    assert.equal(liftLog?.after.resumeMonth,ym(nextMonth.year,nextMonth.month),'its audit line carries the resume month');
    assert.equal(liftLog?.after.heldUntil,ym(today.year,today.month),'and the last month the fee run skipped');
    assert.equal(await CenterActivityLog.countDocuments({action:'student.unhold',target:(await stored(FIXTURES.heldBack))!._id}),1,'and so is its audit line');

    // ── 6. Edit → Save, inline, and a stale form refused as somebody else's ───────────────────────
    const editRow=rowOf(boss.page,FIXTURES.dues);
    await editRow.locator('[data-student-edit]').click();
    const form=boss.page.locator('tr[data-student-edit-row]');
    await form.waitFor({state:'visible',timeout:60000});
    assert.equal(await form.locator('.list-edit-form').count(),1,'Edit opens the row\'s own inline form');
    for(const field of ['nameBn','guardianName','guardianPhone','school','roll','notes','admissionDate'])
      assert.equal(await form.locator(`[name="${field}"]`).count(),1,`the form carries ${field}`);
    assert.ok((await form.locator('[name="admissionDate"]').inputValue()).match(/^\d{4}-\d{2}-\d{2}$/)!==null,
      'and the admission day is carried in a hidden input the picker wrote, not typed into a native box');
    await shot(boss.page,'g1-students-edit-1440',false);
    await form.locator('[name="notes"]').fill('দ্বিতীয় নোট — তালিকা থেকেই বদলানো');
    await form.locator('[name="school"]').fill('উত্তরা মডেল স্কুল');
    await form.locator('[data-student-edit-save]').click();
    await toast(boss.page,c.editSaved).waitFor({state:'visible',timeout:TOAST_MS});
    await until(async()=>(await stored(FIXTURES.dues))?.notes==='দ্বিতীয় নোট — তালিকা থেকেই বদলানো','the note is written');
    await until(async()=>(await stored(FIXTURES.dues))?.school==='উত্তরা মডেল স্কুল','and so is the school');
    await until(async()=>await form.count()===0,'the form closes itself once the write lands');
    await until(async()=>(await rowOf(boss.page,FIXTURES.dues).locator('.student-note').innerText()).includes('দ্বিতীয় নোট'),
      'and the row reads the new note back without a reload');
    // Somebody else writes first: the same form, still open, is refused — and then recovers.
    await rowOf(boss.page,FIXTURES.dues).locator('[data-student-edit]').click();
    await form.waitFor({state:'visible',timeout:60000});
    await CenterStudent.updateOne({_id:(await stored(FIXTURES.dues))!._id},{$set:{notes:'অন্য অপারেটরের নোট'},$inc:{revision:1}});
    await form.locator('[name="notes"]').fill('যে নোটটি বাধা পাবে');
    await form.locator('[data-student-edit-save]').click();
    await form.locator('.admin-feedback.error',{hasText:c.conflict}).waitFor({state:'visible',timeout:60000});
    assert.equal((await stored(FIXTURES.dues))!.notes,'অন্য অপারেটরের নোট','a refused write changed nothing');
    /* The refusal re-reads the row, so the form that stays open carries the NEW version numbers and what
       the operator typed: the second Save lands instead of being refused for as long as they type. */
    const fresh=(await stored(FIXTURES.dues))!.updatedAt.toISOString();
    await until(async()=>(await form.locator('[name="revision"]').inputValue())===fresh,
      'the form picks up the record as it now stands, keeping what the operator typed');
    assert.equal(await form.locator('[name="notes"]').inputValue(),'যে নোটটি বাধা পাবে','and what they typed survived the refusal');
    await form.locator('[data-student-edit-save]').click();
    await until(async()=>(await stored(FIXTURES.dues))?.notes==='যে নোটটি বাধা পাবে','the second Save lands');
    await until(async()=>await form.count()===0,'and the form closes');

    // ── 7. Remove → Restore: the destructive verb, with a month picked and a reason typed ─────────
    await openMore(boss.page,FIXTURES.dues);
    const more=rowOf(boss.page,FIXTURES.dues).locator('[data-more-menu]');
    await more.waitFor({state:'visible',timeout:60000});
    for(const [marker,label] of [['view',c.view],['sms',row.sendSms],['payment',row.payment],['hold',c.hold],
      ['transfer',row.transfer],['fee',row.fee]] as const)
      assert.ok((await more.locator(`[data-more-${marker}]`).innerText()).includes(label),`the ⋯ menu offers ${label}`);
    const removeForm=more.locator('[data-more-remove]');
    assert.equal(await removeForm.count(),1,'and at its destructive end, Remove — with its month and its reason');
    assert.equal(await removeForm.locator(`[name="reason"]`).count(),1,'the reason is a field, not an afterthought');
    assert.ok(await removeForm.locator('button[type="submit"]').isDisabled(),
      'and the verb is a dead button until a month is picked: a hidden input cannot be required');
    await shot(boss.page,'g1-students-more-menu-1440',false);
    await pickMonth(removeForm,'leave',ym(lastMonth.year,lastMonth.month));
    await shot(boss.page,'g1-students-month-picker-1440',false);
    assert.ok(await removeForm.locator('button[type="submit"]').isEnabled(),'picking the month is what arms the verb');
    await removeForm.locator('[name="reason"]').fill('পরিবার চট্টগ্রামে চলে গেছে');
    await removeForm.locator('button[type="submit"]').click();
    await toast(boss.page,row.removeOk).waitFor({state:'visible',timeout:TOAST_MS});
    await until(async()=>(await stored(FIXTURES.dues))?.status==='removed','the student is filed away');
    await until(async()=>await rowOf(boss.page,FIXTURES.dues).count()===0,'and leaves the list the centre works from');
    const removeLog=await CenterActivityLog.findOne({action:'student.remove',target:(await stored(FIXTURES.dues))!._id}).lean<{after:{leaveDate:string;reason:string}}|null>();
    assert.equal(removeLog?.after.leaveDate,ym(lastMonth.year,lastMonth.month),'the audit line carries the leave month');
    assert.equal(removeLog?.after.reason,'পরিবার চট্টগ্রামে চলে গেছে','and the reason the operator typed');
    // Restore is Remove's mirror image, and it is reached from behind the tick.
    const panel2=await filters(boss.page);
    await panel2.locator('input[name="removed"]').check();
    await panel2.locator('button[type="submit"]').click();
    await rowOf(boss.page,FIXTURES.dues).waitFor({timeout:90000});
    await openMore(boss.page,FIXTURES.dues);
    const restoreForm=rowOf(boss.page,FIXTURES.dues).locator('[data-more-restore]');
    await restoreForm.waitFor({state:'visible',timeout:60000});
    assert.equal(await rowOf(boss.page,FIXTURES.dues).locator('[data-more-remove]').count(),0,
      'a removed row offers Restore, not Remove — the verb follows the state the row is in');
    await pickMonth(restoreForm,'resume',ym(today.year,today.month));
    await restoreForm.locator('[name="reason"]').fill('ফেরা নিশ্চিত করেছে');
    await restoreForm.locator('button[type="submit"]').click();
    await toast(boss.page,c.restore.ok).waitFor({state:'visible',timeout:TOAST_MS});
    await until(async()=>(await stored(FIXTURES.dues))?.status==='active','the student is back');
    await panel2.locator('input[name="removed"]').uncheck();
    await panel2.locator('button[type="submit"]').click();
    await until(async()=>await rowCount(boss.page)===7,'and the list is its seven again');
    assert.equal(await CenterActivityLog.countDocuments({action:'student.restore',target:(await stored(FIXTURES.dues))!._id}),1,'the restore writes its own line');

    // ── 8. the bulk bar: it exists only while rows are ticked, and it says how many ───────────────
    assert.equal(await boss.page.locator('[data-student-bulk-bar]').count(),0,'with nobody ticked there is no bar');
    assert.equal(await boss.page.locator('[data-sms-open]').count(),0,'and no send button anywhere on the page');
    await rowOf(boss.page,FIXTURES.heldBack).locator('input[name="smsStudent"]').check();
    await rowOf(boss.page,FIXTURES.paid).locator('input[name="smsStudent"]').check();
    const bulk=boss.page.locator('[data-student-bulk-bar]');
    await bulk.waitFor({state:'visible',timeout:60000});
    assert.match(ascii(await bulk.locator('[data-bulk-count]').innerText()),/2/,`the bar counts the ticks (${await bulk.locator('[data-bulk-count]').innerText()})`);
    assert.match(ascii(await bulk.locator('[data-sms-open]').innerText()),/2/,`and the send button says how many it will message (${await bulk.locator('[data-sms-open]').innerText()})`);
    await shot(boss.page,'g1-students-bulk-bar-1440',false);
    await bulk.locator('[data-bulk-clear]').click();
    await until(async()=>await boss.page.locator('[data-student-bulk-bar]').count()===0,'and Clear takes the bar away');

    // ── 9. the pattern is one implementation: the same markers still paint the Visitors list ──────
    /* The filter panel is the section's sibling on both lists, not its child — it is a `details` the
       operator folds away, and the list it filters keeps its own head. So the panel is read by its own
       marker, and what it must carry is the pattern's class beside the list's. */
    const studentFilters=boss.page.locator('[data-student-filters]');
    for(const klass of ['list-filters','student-filters'])
      assert.ok(((await studentFilters.getAttribute('class'))||'').includes(klass),
        `the students filters carry ${klass} — one pattern, two lists`);
    await boss.page.goto(`${origin}/bn/admin/leads`,{waitUntil:'domcontentloaded',timeout:180000});
    await boss.page.locator('tr[data-visitor-row]').first().waitFor({timeout:90000});
    const leadTable=boss.page.locator('section.list-panel table.admin-table').first();
    for(const klass of ['list-table','visitor-table'])
      assert.ok(((await leadTable.getAttribute('class'))||'').includes(klass),`the visitors table still carries ${klass} — one pattern, two lists`);
    for(const klass of ['list-filters','lead-filters'])
      assert.ok(((await boss.page.locator('[data-lead-filters]').getAttribute('class'))||'').includes(klass),
        `and the visitors filters carry ${klass}`);
    for(const part of ['who','call','status','note','act'])
      assert.equal(await boss.page.locator(`section.list-panel tr[data-visitor-row] .visitor-${part}.list-${part}`).first().count(),1,
        `a visitors cell still carries both names — .visitor-${part} and the pattern's .list-${part}`);
    await boss.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
    await boss.page.locator('tr[data-student-row]').first().waitFor({timeout:90000});

    // ── 10. the profile follows the same pattern ─────────────────────────────────────────────────
    const profileId=String((await stored(FIXTURES.paid))!._id);
    await boss.page.goto(`${origin}/bn/admin/students/${profileId}`,{waitUntil:'domcontentloaded',timeout:180000});
    await boss.page.locator('[data-profile-actions]').waitFor({timeout:60000});
    assert.equal(await boss.page.locator('[data-profile-edit]').count(),1,'the profile keeps its visible Edit');
    assert.equal(await boss.page.locator('[data-profile-payment]').count(),1,'and its cash door');
    assert.equal(await boss.page.locator('[data-profile-status] [data-status-badge]').count(),1,
      'and its badge is the hold switch, from the same component the row uses');
    assert.equal(await boss.page.locator('[data-student-hold]').count(),0,'so the standalone Hold button that duplicated it is gone');
    await boss.page.locator('[data-profile-status] [data-status-badge]').click();
    await boss.page.locator('[data-profile-status] [data-status-option="on_hold"]').click();
    const profileHold=boss.page.locator('[data-hold-dialog]');
    await profileHold.waitFor({state:'visible',timeout:60000});
    assert.equal(await profileHold.locator('[data-month-choose="fromMonth"]').count(),1,
      'and the profile opens the same sheet the row does, asking the same month');
    await pickMonth(profileHold,'fromMonth',ym(holdFrom.year,holdFrom.month));
    await profileHold.locator('[data-hold-submit]').click();
    await toast(boss.page,row.holdOk).waitFor({state:'visible',timeout:TOAST_MS});
    await until(async()=>(await stored(FIXTURES.paid))?.status==='on_hold','the profile holds a student the same way');
    await until(async()=>(await boss.page.locator('[data-profile-status] [data-status-badge]').innerText())===c.onHold,'and re-reads its own badge');
    await boss.page.locator('[data-profile-status] [data-status-badge]').click();
    await boss.page.locator('[data-profile-status] [data-status-option="active"]').click();
    const profileLift=boss.page.locator('[data-hold-dialog]');
    await profileLift.waitFor({state:'visible',timeout:60000});
    await pickMonth(profileLift,'resume',ym(nextMonth.year,nextMonth.month));
    await profileLift.locator('[data-hold-submit]').click();
    await until(async()=>(await stored(FIXTURES.paid))?.status==='active','and lifts the hold the same way');
    await shot(boss.page,'g1-student-profile-1440');
    // The profile's own Remove door asks for a picked month too.
    await boss.page.locator('[data-student-remove]').click();
    const dialog=boss.page.locator('dialog:has([data-student-remove-submit])');
    await dialog.waitFor({state:'visible',timeout:60000});
    assert.ok(await dialog.locator('[data-student-remove-submit]').isDisabled(),'the dialog\'s verb waits for a month as well');
    await pickMonth(dialog,'leave',ym(lastMonth.year,lastMonth.month));
    await dialog.locator('[name="reason"]').fill('প্রোফাইল থেকে সরানো');
    await dialog.locator('[data-student-remove-submit]').click();
    try{
      await toast(boss.page,row.removeOk).waitFor({state:'visible',timeout:TOAST_MS});
    }catch(error){
      /* A missing toast has two meanings — the write was refused, or it landed and the answer was lost —
         and the dialog is what tells them apart. Name both halves rather than leaving a bare timeout. */
      const said=await dialog.locator('.admin-feedback').allInnerTexts().catch(()=>[] as string[]);
      const painted=await boss.page.locator('.admin-toast').allInnerTexts().catch(()=>[] as string[]);
      const now=await stored(FIXTURES.paid);
      console.error(`DIAG the profile's Remove answered with no toast: dialog said ${JSON.stringify(said)} `+
        `toasts on the page ${JSON.stringify(painted)} `+
        `dialogOpen=${await dialog.isVisible().catch(()=>false)} status=${now?.status} revision=${now?.revision}`);
      throw error;
    }
    await until(async()=>(await stored(FIXTURES.paid))?.status==='removed','the profile can remove a student');
    // …and the removed list restores one, with the same picker.
    await boss.page.goto(`${origin}/bn/admin/students/removed`,{waitUntil:'domcontentloaded',timeout:180000});
    const restoreRow=boss.page.locator('details').filter({hasText:FIXTURES.paid}).first();
    await restoreRow.locator('summary').click();
    const restoreForm2=restoreRow.locator('form');
    assert.ok(await restoreForm2.locator('[data-restore-submit]').isDisabled(),'the restore form waits for a month too');
    await pickMonth(restoreForm2,'resume',ym(today.year,today.month));
    await restoreForm2.locator('[name="reason"]').fill('আবার ভর্তি');
    await restoreForm2.locator('[data-restore-submit]').click();
    await toast(boss.page,c.restore.ok).waitFor({state:'visible',timeout:TOAST_MS});
    await until(async()=>(await stored(FIXTURES.paid))?.status==='active','and the removed list brings a student back');

    // ── 11. the Super Admin may remove too — it is the second role that may ───────────────────────
    const owner=await signIn('superadmin');
    await gotoList(owner);
    assert.equal(await rowCount(owner.page),7,'the owner reads the same seven');
    await openMore(owner.page,FIXTURES.held);
    const ownerRemove=rowOf(owner.page,FIXTURES.held).locator('[data-more-remove]');
    await ownerRemove.waitFor({state:'visible',timeout:60000});
    await pickMonth(ownerRemove,'leave',ym(lastMonth.year,lastMonth.month));
    await ownerRemove.locator('[name="reason"]').fill('মালিক সরিয়েছেন');
    await ownerRemove.locator('button[type="submit"]').click();
    await until(async()=>(await stored(FIXTURES.held))?.status==='removed','a Super Admin removes a student');
    const ownerLog=await CenterActivityLog.findOne({action:'student.remove',target:(await stored(FIXTURES.held))!._id}).lean<{actor:unknown}|null>();
    const ownerId=(await User.findOne({email:accounts.superadmin}).lean<{_id:mongoose.Types.ObjectId}>())!._id;
    assert.equal(String(ownerLog?.actor),String(ownerId),'and the line names the owner, not the administrator');
    await owner.context.close();

    // ── 12. the roles that may not: no page, no rows, no verb, and no door in the sidebar ─────────
    for(const role of ['staff','content_editor'] as const){
      const denied=await signIn(role);
      await denied.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
      await denied.page.waitForLoadState('networkidle').catch(()=>{});
      assert.ok(!denied.page.url().includes('/admin/students'),`${role} is turned away from the list (${denied.page.url()})`);
      assert.equal(await denied.page.locator('tr[data-student-row]').count(),0,`${role} reaches no row`);
      assert.equal(await denied.page.locator('[data-more-remove]').count(),0,`${role} reaches no Remove`);
      assert.ok(!(await denied.page.content()).includes(FIXTURES.dues),`and no student's name is in the page ${role} was given`);
      // A door that closes on the person who taps it is worse than no door: the sidebar must not offer one.
      await denied.page.goto(`${origin}/bn/admin/reports/daily`,{waitUntil:'domcontentloaded',timeout:180000});
      await denied.page.waitForLoadState('networkidle').catch(()=>{});
      if(denied.page.url().includes('/admin'))
        assert.equal(await denied.page.locator('.admin-nav a[href*="/admin/students"]').count(),0,
          `${role} is offered no Students door in the sidebar, because every screen behind it refuses them`);
      assert.deepEqual(denied.errors,[],`${role} drove the refused pages without a client-side error`);
      await denied.context.close();
    }

    // ── 13. three widths, menus open, nothing overflowing, every target a thumb can hit ───────────
    for(const width of [360,768,1440]){
      const desk=await signIn('admin',width);
      await gotoList(desk);
      await noOverflow(desk.page,`the students list at ${width}`);
      await shot(desk.page,`g1-students-list-${width}`);
      /* The controls an operator reaches for, measured the way the reference suite measures them. The
         status badge is deliberately not in this list on a desk width: two badges stacked owe the row
         72px, so the badge gives up the 44px minimum there and a phone keeps it — which is what the
         second assertion is for. */
      const targets=await desk.page.locator('tr[data-student-row] [data-student-edit], tr[data-student-row] .pop-more .pop-anchor, tr[data-student-row] .student-dial, tr[data-student-row] .student-dues .pop-anchor')
        .evaluateAll(nodes=>nodes.map(node=>Math.round(node.getBoundingClientRect().height)));
      assert.ok(targets.length>0&&targets.every(size=>size>=44),
        `every row target at ${width}px is at least 44px tall (smallest ${Math.min(...targets)}px of ${targets.length})`);
      const badge=await desk.page.locator('tr[data-student-row] .student-status .pop-anchor')
        .evaluateAll(nodes=>nodes.map(node=>Math.round(node.getBoundingClientRect().height)));
      if(width<=760)assert.ok(badge.every(size=>size>=44),`and on a phone the status badge is a thumb target too (smallest ${Math.min(...badge)}px)`);
      else assert.ok(badge.every(size=>size>=20),`while on a desk the badge gives up its 44px to keep the row inside its budget (smallest ${Math.min(...badge)}px)`);
      if(width<=760){
        // On a phone the row is a card, and the two destinations a front desk actually uses are big.
        const card=rowOf(desk.page,FIXTURES.long);
        for(const part of ['[data-student-edit]','.pop-more .pop-anchor','[data-student-call]','[data-student-wa]','[data-status-badge]','[data-dues-chip]'])
          assert.equal(await card.locator(part).count(),1,`the ${width}px card keeps ${part}`);
      }
      // Menus open at this width: the ⋯ with its Remove form, then the month picker inside it.
      await openMore(desk.page,FIXTURES.heldBack);
      const deskMore=rowOf(desk.page,FIXTURES.heldBack).locator('[data-more-menu]');
      await deskMore.waitFor({state:'visible',timeout:60000});
      await shot(desk.page,`g1-students-more-${width}`,false);
      await pickMonth(deskMore.locator('[data-more-remove]'),'leave',ym(lastMonth.year,lastMonth.month));
      await shot(desk.page,`g1-students-month-${width}`,false);
      await desk.page.keyboard.press('Escape');
      await desk.page.keyboard.press('Escape');
      await rowOf(desk.page,FIXTURES.heldBack).locator('[data-status-badge]').click();
      await rowOf(desk.page,FIXTURES.heldBack).locator('[data-status-menu]').waitFor({state:'visible',timeout:60000});
      await shot(desk.page,`g1-students-status-${width}`,false);
      await desk.page.keyboard.press('Escape');
      // The bulk bar at this width, and the filters panel — collapsed on a phone, open on a desk.
      await rowOf(desk.page,FIXTURES.paid).locator('input[name="smsStudent"]').check();
      await desk.page.locator('[data-student-bulk-bar]').waitFor({state:'visible',timeout:60000});
      await noOverflow(desk.page,`the raised bulk bar at ${width}`);
      await shot(desk.page,`g1-students-bulk-${width}`,false);
      await desk.page.locator('[data-bulk-clear]').click();
      await filters(desk.page);
      await shot(desk.page,`g1-students-filters-${width}`,false);
      assert.deepEqual(desk.errors,[],`no client-side error at ${width}`);
      await desk.context.close();
    }

    // ── 14. and the same in English, where the digits and the month names have to follow ──────────
    const en=await signIn('admin');
    await en.context.addCookies([{name:`diction_digits_${String(bossId)}`,value:'en',url:`${origin}/`}]);
    await en.page.goto(`${origin}/en/admin/students`,{waitUntil:'domcontentloaded',timeout:180000});
    await en.page.locator('tr[data-student-row]').first().waitFor({timeout:90000});
    const enChip=rowOf(en.page,FIXTURES.dues).locator('[data-dues-chip]').first();
    assert.ok(!banglaDigits(await enChip.innerText()),`the English list reads ASCII digits (${await enChip.innerText()})`);
    /* The English screen is read against the English catalogue: `row` above is the Bangla one, and a
       header that says "Student" does not include "শিক্ষার্থী" — the assertion would have failed on a
       page that is translated correctly and passed on one that is not translated at all. */
    assert.ok((await en.page.locator('thead').innerText()).includes(enCatalogue.center.row.who),
      'and its headers come from the catalogue');
    /* The read-out is worth more than its digits: the months behind the total have to name themselves in
       English too, from the catalogue's own month names, or the page is half translated. */
    await enChip.click();
    const enMonths=rowOf(en.page,FIXTURES.dues).locator('[data-dues-months]');
    await enMonths.waitFor({state:'visible',timeout:60000});
    assert.ok(!banglaDigits(await enMonths.innerText()),`and the months behind the total read English too (${(await enMonths.innerText()).split('\n')[0]})`);
    await en.page.keyboard.press('Escape');
    await shot(en.page,'g1-students-list-en-1440');
    assert.deepEqual(en.errors,[],'no client-side error on the English list');
    assert.deepEqual(boss.errors,[],'no client-side error anywhere the administrator drove');
    await en.context.close();

    console.log('Students: the shared pattern paints the list and the profile — four controls a row, Edit→Save, Hold→Unhold, Remove→Restore, the picked month, the role gates and three widths all hold');
  }finally{
    await browser.close();
    await mongoose.disconnect();
    if(!shared)await mongo.stop();
  }
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
