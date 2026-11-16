/**
 * Group 2 · the operator's own screens, at 360 px and 1440 px, in Bangla and in English.
 *
 * Four claims in one suite, because they are one redesign and they share one seeded centre — a class
 * that paid today, a class that owes, three visitors with one promise due and one promise late, a batch
 * that half-failed and the automatic send it left behind:
 *
 *  1. **The dashboard reads in two tiers.** The day's four numbers come first, each a door to the screen
 *     that works it, each painted in the digits the operator chose and in the colour of its own state
 *     (green going fine, amber wants a look, red a promise passed or a send stuck, grey a read that
 *     failed and says "not counted" rather than showing a zero). Under them the four verbs of a morning,
 *     offered only to a role that may use them. Below the intake panels, the public site's own work is
 *     folded under one summary that names itself — folded, not hidden: one tap opens it. And the staff
 *     desk is untouched, because R3.12 gave the front desk the visitor queue and nothing else.
 *  2. **Forms line up on a phone.** The cash desk's search and the dues list's class filter used to put
 *     the word beside the control, where the control's own intrinsic width pushed the panel past the
 *     viewport and the word landed on top of it. Now the word is above, the control fills the row, and
 *     nothing overflows at 360 px. At the bottom of every screen the fixed bar covers nothing tappable.
 *  3. **The SMS centre is three cards**, split by who is reading: the operator's send and balance, the
 *     auditor's history, the mechanic's connection and retries. Everyday tools are in the first card and
 *     nowhere else, diagnostics in the third and nowhere else, the page's one definition list is the
 *     diagnostic one, and no variable name reaches the served HTML — the four sentences that used to
 *     name one now tell a person what to do instead.
 *  4. **The menu is five operator groups**, painted from both catalogues in the order the day happens,
 *     with the same doors every role has always had: grouping is presentation, permission is not (the
 *     frozen table behind that sentence is tests/nav-groups.test.ts, which runs without a browser).
 *
 * Photographed into screenshots/g2 at both widths and in both languages.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import type {Page} from 'playwright';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {Lead} from '../src/models/Lead';
import {CenterActivityLog,CenterCashBatch,CenterClassGroup,CenterPayment,CenterSettings,CenterSmsAutoProblem,CenterSmsBatch,CenterSmsLog,CenterSmsTemplate,CenterStudent} from '../src/models/CenterRecords';
import {createQuickLead} from '../src/lib/leads/leads';
import {dhakaCalendar} from '../src/lib/center/month-status';
import {loadYearSummary} from '../src/lib/reports/year-summary-data';
import {autoProblemText} from '../src/lib/center/sms-auto-problems';
import {formatNumber} from '../src/lib/admin/format';
import {navGroups,permitted} from '../src/components/admin/nav-items';
import bn from '../src/messages/bn.json';
import en from '../src/messages/en.json';

const SHOTS=path.join('screenshots','g2');
const O=bn.adminRedesign.operations,OE=en.adminRedesign.operations;
const CURRENCY_BN=bn.common.currency,CURRENCY_EN=en.common.currency;
/** Bangla digits read as ASCII ones, so an assertion can count either. */
const ascii=(text:string):string=>text.replace(/[\u09e6-\u09ef]/g,ch=>String(ch.charCodeAt(0)-0x09e6));
const hasBanglaDigits=(text:string):boolean=>/[\u09e6-\u09ef]/.test(text);
const hasBanglaLetters=(text:string):boolean=>/[\u0980-\u09a0\u09a1-\u09b0\u09b2-\u09c0\u09c1-\u09f2]/.test(text);
const ym=(year:number,month:number):string=>`${year}-${String(month).padStart(2,'0')}`;
const day=(offset:number):string=>{
  const now=new Date(Date.now()+offset*86400000);
  const d=dhakaCalendar(now);
  return `${d.year}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}`;
};
const hash64=(text:string):string=>createHash('sha256').update(text).digest('hex');

/* The centre this suite seeds: one class, three students, one receipt taken today. */
const PAID_TODAY='গ২ আজকের টাকা',OWES_ONE='গ২ এক মাস বাকি',OWES_TWO='গ২ দুই মাস বাকি',HELD='গ২ বিরতিতে';
const CLASS_A='নবম শ্রেণি';
const FEE={[PAID_TODAY]:1200,[OWES_ONE]:1000,[OWES_TWO]:900,[HELD]:1300} as Record<string,number>;
const CASH_TODAY=FEE[PAID_TODAY];
const VISITORS=[
  {name:'গ২ ভিজিটর আজকের',phone:'01712817001',followUp:0},   // promised a call today
  {name:'গ২ ভিজিটর দেরির',phone:'01712817002',followUp:-3},   // promised three days ago: overdue
  {name:'গ২ ভিজিটর নতুন',phone:'01712817003',followUp:null},  // no promise yet
] as const;
const SMS_PHONE='01733330001';

async function run(){
  await preflight({
    mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',
    originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,
    test:'tests/dashboard-ops-browser.integration.ts — start the app first, then run it with TEST_ORIGIN and TEST_MONGO_URI (see docs/STALE-TESTS.md)',
  });
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

  // ── A centre with a day in it ──────────────────────────────────────────────────────────────────
  await CenterStudent.deleteMany({});
  await CenterClassGroup.deleteMany({});
  await CenterPayment.deleteMany({});
  await CenterCashBatch.deleteMany({});
  await CenterSmsLog.deleteMany({});
  await CenterSmsBatch.deleteMany({});
  await CenterSmsAutoProblem.deleteMany({});
  await CenterSmsTemplate.deleteMany({});
  await CenterActivityLog.deleteMany({});
  await Lead.deleteMany({});
  await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});

  const password=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(password,12);
  const accounts={admin:'g2-boss@example.test',staff:'g2-desk@example.test'};
  for(const role of ['admin','staff'] as const){
    await User.deleteOne({email:accounts[role]});
    await User.create({name:role==='admin'?'গ২ অ্যাডমিন':'গ২ ফ্রন্ট ডেস্ক',email:accounts[role],passwordHash:hash,role,active:true});
  }
  const boss=await User.findOne({email:accounts.admin}).lean<{_id:mongoose.Types.ObjectId}>();
  const desk=await User.findOne({email:accounts.staff}).lean<{_id:mongoose.Types.ObjectId}>();
  if(!boss||!desk)throw Error('the two accounts this suite signs in with were not written');
  const bossId=String(boss._id),deskId=String(desk._id);

  const today=dhakaCalendar(new Date());
  /* Fees start three Dhaka months back, so what is owed is owed on whatever day CI runs — and the
     student who paid today is paid through today, which is the number the cash card must show. */
  const back=new Date(Date.UTC(today.year,today.month-1-3,1));
  const startMonth={year:back.getUTCFullYear(),month:back.getUTCMonth()+1};
  const admissionDate=`${ym(startMonth.year,startMonth.month)}-05`;
  await CenterSettings.updateOne({key:'main'},{$set:{key:'main',quietStart:'00:00',quietEnd:'00:00',
    institutePhone:'01733330000',dueDay:10,smsUnitCost:0.5,autoReceipt:true,autoDue:false,autoResult:false,
    dailySmsLimitPerUser:2,autoDueDay:12}},{upsert:true});

  const groupA=await CenterClassGroup.create({name:{bn:CLASS_A,en:'Class Nine'},academicYear:today.year,shift:'প্রভাতী',active:true});
  const students:Record<string,{_id:mongoose.Types.ObjectId}>={};
  for(const [index,name] of [PAID_TODAY,OWES_ONE,OWES_TWO,HELD].entries()){
    students[name]=await CenterStudent.create({
      studentId:`G2-${index+1}`,name:{bn:name,en:''},classGroup:groupA._id,startMonth,admissionDate,
      guardianName:'অভিভাবক',guardianPhone:`017${String(11000000+index*1111111).slice(0,8)}`,
      school:'ধানমন্ডি সরকারি বালক বিদ্যালয়',roll:String(index+1),
      feeHistory:[{effectiveFrom:startMonth,amount:FEE[name]}],notes:'',
      status:name===HELD?'on_hold':'active',
      ...(name===HELD?{holds:[{start:{year:startMonth.year,month:startMonth.month},reason:'পরীক্ষার বিরতি',recordedBy:boss._id}]}:{}),
    });
  }

  /* Today's cash, written the way the cash desk writes it: a payment and the batch that receipts it.
     `todayCenterCash` sums the batches whose `paidOn` is today's Dhaka day, so this is a real receipt
     and not a number painted for the test. */
  const receipt=await CenterPayment.create({
    student:students[PAID_TODAY]._id,classGroupAtPayment:groupA._id,type:'monthly',
    academicYear:today.year,month:today.month,amount:CASH_TODAY,receiptNo:'G2-রসিদ-১',
    receiptKey:'g2-receipt-1',paidOn:day(0),receivedBy:boss._id,groupId:'g2-seed',status:'valid',
  });
  await CenterCashBatch.create({requestId:randomUUID(),planHash:hash64('g2-cash-1'),student:students[PAID_TODAY]._id,
    receiptNo:'G2-রসিদ-১',receiptKey:'g2-receipt-1',paidOn:day(0),actor:boss._id,
    paymentIds:[receipt._id],status:'valid'});

  /* Three visitors: one promise due today, one three days late, one with no promise yet. */
  for(const visitor of VISITORS){
    const made=await createQuickLead({studentName:visitor.name,phone:visitor.phone,classLabel:'9',
      school:'ধানমন্ডি সরকারি বালক বিদ্যালয়',status:'new'},bossId);
    assert.equal(made.ok,true,`the fixture visitor ${visitor.name} is written`);
    if(visitor.followUp!==null)
      await Lead.updateOne({studentName:visitor.name},{$set:{nextFollowUp:day(visitor.followUp)}});
  }

  /* A batch that half-failed, the two log rows behind it, and the automatic send that did not go out —
     the third card's reason to exist. */
  const smsBatch=await CenterSmsBatch.create({requestId:randomUUID(),purpose:'due_reminder',createdBy:boss._id,
    trigger:'auto_due',templateKey:'due_reminder',audience:'guardian',recipientCount:3,sentCount:2,failedCount:1,
    skippedCount:0,segmentCount:3,estimatedCost:1.5,status:'partial'});
  await CenterSmsLog.insertMany([
    {batch:smsBatch._id,student:students[OWES_ONE]._id,phone:SMS_PHONE,message:'গ২ বকেয়া স্মারক',segments:1,cost:0.5,
     templateKey:'due_reminder',month:ym(today.year,today.month),status:'sent'},
    {batch:smsBatch._id,student:students[OWES_TWO]._id,phone:'01733330002',message:'গ২ বকেয়া স্মারক',segments:1,cost:0.5,
     templateKey:'due_reminder',month:ym(today.year,today.month),status:'failed',reason:'SMS_DISABLED',providerCode:'1003'},
  ]);
  const problem=autoProblemText('auto_due','SMS_DISABLED');
  await CenterSmsAutoProblem.create({key:'g2-problem-1',trigger:'auto_due',messageBn:problem.messageBn,
    messageEn:problem.messageEn,code:problem.code,who:CLASS_A,context:JSON.stringify({classGroup:String(groupA._id)}),
    attempts:1,lastAttemptAt:new Date(),resolved:false});

  /* What the year's own arithmetic says is outstanding — the number the dues card is defined to paint.
     The arithmetic is R6's proof (test:report:math); this suite proves the card paints it. */
  const summary=await loadYearSummary(today.year,'bn');
  const OUTSTANDING=summary.totals.outstanding;
  assert.ok(OUTSTANDING>0,`the seeded centre owes something this year (got ${OUTSTANDING})`);
  const ACTIVE=await CenterStudent.countDocuments({status:'active'});
  const HELD_COUNT=await CenterStudent.countDocuments({status:'on_hold'});

  // ── the browser ────────────────────────────────────────────────────────────────────────────────
  const browser=await chromium.launch();
  const shot=(page:Page,name:string,fullPage=true)=>page.screenshot({path:path.join(SHOTS,`${name}.png`),fullPage});
  const noOverflow=async(page:Page,label:string)=>{
    const metrics=await page.evaluate(()=>({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));
    assert.ok(metrics.scrollWidth<=metrics.clientWidth+1,`${label}: nothing overflows horizontally at ${metrics.clientWidth}px (scrollWidth ${metrics.scrollWidth})`);
  };
  /** Scrolled to the very bottom: is anything a finger would tap hiding under the fixed bar? */
  const nothingUnderTheBar=async(page:Page,label:string)=>{
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    const measured=await page.evaluate(()=>{
      const nav=document.querySelector('nav.admin-bottom-nav');
      if(!nav)return null;
      const top=nav.getBoundingClientRect().top,view=window.innerHeight;
      const under:string[]=[];
      const targets='.admin-content button,.admin-content a,.admin-content input,.admin-content select,.admin-content textarea,.admin-content table,.admin-content summary';
      for(const element of Array.from(document.querySelectorAll<HTMLElement>(targets))){
        const box=element.getBoundingClientRect();
        if(box.height===0||box.width===0)continue;
        if(box.bottom>top+1&&box.top<view)
          under.push(`${element.tagName.toLowerCase()}.${String(element.className||'').split(' ')[0]} bottom ${Math.round(box.bottom)}`);
      }
      return {top:Math.round(top),under:under.slice(0,6)};
    });
    assert.ok(measured,`${label}: the phone's bottom bar is on the page`);
    assert.deepEqual(measured.under,[],`${label}: nothing tappable hides under the bottom bar (its top edge is ${measured.top}px)`);
  };
  /** The word above its control, and the control filling the row: the two halves of the 360px fix. */
  const stacked=async(page:Page,labelSelector:string,controlSelector:string,label:string)=>{
    const boxes=await page.evaluate(([word,control])=>{
      const a=document.querySelector(word)?.getBoundingClientRect();
      const holder=document.querySelector(control)?.parentElement;
      const b=document.querySelector(control)?.getBoundingClientRect();
      if(!a||!b||!holder)return null;
      return {wordBottom:a.bottom,controlTop:b.top,controlWidth:b.width,rowWidth:holder.getBoundingClientRect().width};
    },[labelSelector,controlSelector]);
    assert.ok(boxes,`${label}: the word and its control are both on the page`);
    assert.ok(boxes.wordBottom<=boxes.controlTop+1,
      `${label}: the label sits above its control, not on top of it (label bottom ${Math.round(boxes.wordBottom)}px, control top ${Math.round(boxes.controlTop)}px)`);
    assert.ok(boxes.controlWidth>=boxes.rowWidth*0.9,
      `${label}: the control fills its row at 360px (${Math.round(boxes.controlWidth)}px of ${Math.round(boxes.rowWidth)}px)`);
  };

  try{
    /** One signed-in browser context. `digits` sets the operator's own digit preference, the way the
        header's toggle does, so an English pass reads English all the way down — numbers included. */
    async function signIn(role:keyof typeof accounts,width=1440,height=900,digits?:'bn'|'en'){
      const context=await browser.newContext({viewport:{width,height}});
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
      if(digits)await context.addCookies([{name:`diction_digits_${role==='admin'?bossId:deskId}`,value:digits,url:origin+'/'}]);
      const page=await context.newPage(),errors:string[]=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('dialog',dialog=>dialog.accept());
      page.setDefaultTimeout(60000);
      return {context,page,errors};
    }
    const goto=async(page:Page,url:string,waitFor:string)=>{
      await page.goto(`${origin}${url}`,{waitUntil:'domcontentloaded',timeout:180000});
      await page.locator(waitFor).first().waitFor({state:'visible',timeout:60000});
    };

    // ══ 1. The dashboard's two tiers ═════════════════════════════════════════════════════════════
    const bossSession=await signIn('admin');
    const page=bossSession.page;
    await goto(page,'/bn/admin','[data-daily-operations]');

    /* The order IS the redesign: welcome line, the day's tier, the visitor queue, the intake panels,
       and the site's own work folded at the bottom. No function-valued `const` inside an evaluated
       closure: tsx transpiles with esbuild's keepNames, which wraps a function assigned to a name in a
       `__name(...)` helper that does not exist in the browser, so the three comparisons are written
       out — the house shape for `page.evaluate` here is one expression per fact. */
    const order=await page.evaluate(()=>{
      const heading=document.querySelector('.overview-heading');
      const ops=document.querySelector('[data-daily-operations]');
      const intake=document.querySelector('.admin-kpis:not(.ops-kpis)');
      const site=document.querySelector('[data-site-management]');
      if(!heading||!ops||!intake||!site)return null;
      const following=Node.DOCUMENT_POSITION_FOLLOWING;
      return {
        headingThenOps:(heading.compareDocumentPosition(ops)&following)!==0,
        opsThenIntake:(ops.compareDocumentPosition(intake)&following)!==0,
        intakeThenSite:(intake.compareDocumentPosition(site)&following)!==0,
      };
    });
    assert.ok(order,'the dashboard paints its heading, both tiers and the intake panels');
    assert.deepEqual(order,{headingThenOps:true,opsThenIntake:true,intakeThenSite:true},
      'the day\'s work is the first tier and the public site\'s work is the last');

    // Four cards, each with a state of its own.
    const markers=await page.locator('[data-ops-card]').evaluateAll(nodes=>nodes.map(node=>({
      marker:node.getAttribute('data-ops-card')||'',
      tone:[...node.classList].find(name=>name.startsWith('tone-'))||'',
      href:node.getAttribute('href')||'',
      number:(node.querySelector('.ops-number')?.textContent||'').trim(),
      sub:(node.querySelector('.ops-sub')?.textContent||'').trim(),
      label:(node.querySelector('.admin-kpi-top span')?.textContent||'').trim(),
    })));
    assert.deepEqual(markers.map(card=>card.marker),['cash','dues','visitors','sms'],'the tier is four cards, in the order the day uses them');
    const card=(marker:string)=>{const found=markers.find(item=>item.marker===marker);assert.ok(found,`the ${marker} card is painted`);return found};

    /* Money: today's one receipt, in the operator's own digits, with the count of receipts under it. */
    assert.equal(card('cash').label,O.cash,'the cash card is named from the catalogue');
    assert.equal(card('cash').number,`${CURRENCY_BN}${formatNumber(CASH_TODAY,'bn')}`,
      `the cash card reads today's real total (${CASH_TODAY}) in Bangla digits`);
    assert.equal(card('cash').sub,O.cashSub.replace('{receipts}',formatNumber(1,'bn')),'and says how many receipts that is');
    assert.equal(card('cash').tone,'tone-good','a day that has taken money is green');
    assert.equal(card('cash').href,'/bn/admin/students/collect','and it is the door to the cash desk');
    assert.ok(hasBanglaDigits(card('cash').number),'a Bangla dashboard reads Bangla digits');

    /* What is owed: the year summary's own total, amber because it is not zero, with the running and
       held counts under it. */
    assert.equal(card('dues').label,O.outstanding);
    assert.equal(card('dues').number,`${CURRENCY_BN}${formatNumber(OUTSTANDING,'bn')}`,
      `the dues card reads the year's own outstanding total (${OUTSTANDING}), the number the year report answers with`);
    assert.equal(card('dues').tone,'tone-warn','money owed is amber, not green and not red');
    assert.equal(card('dues').href,'/bn/admin/students/dues','and it is the door to the dues list');
    assert.equal(card('dues').sub,O.studentsSub.replace('{active}',formatNumber(ACTIVE,'bn')).replace('{held}',formatNumber(HELD_COUNT,'bn')),
      'with the running and held counts beside it');

    /* Promises: due today as the number, the late ones called out separately in their own colour. */
    assert.equal(card('visitors').label,O.followUps);
    assert.equal(card('visitors').number,formatNumber(1,'bn'),'the visitors card counts the promises due today');
    assert.equal(card('visitors').tone,'tone-alert','a promise whose day has passed is red');
    assert.equal(card('visitors').href,'/bn/admin/leads?followUp=today','and it is the door to the queue');
    assert.equal(card('visitors').sub,
      `${O.visitorsSub.replace('{fresh}',formatNumber(3,'bn'))} · ${O.overdue.replace('{late}',formatNumber(1,'bn'))}`,
      'with the new visitors and the late promise named, not folded into one total');

    /* Credit: the balance the provider answers with, red because a send is stuck. */
    assert.equal(card('sms').label,O.sms);
    assert.equal(card('sms').href,'/bn/admin/sms','and it is the door to the SMS centre');
    assert.equal(card('sms').tone,'tone-alert','a stuck send makes the credit card red even when the balance can be read');
    assert.equal(card('sms').sub,O.smsAlerts.replace('{count}',formatNumber(1,'bn')),'and the card says one message is stuck');
    const DASHBOARD_CREDIT=card('sms').number;
    assert.ok(/^\D*[\u09e6-\u09ef]+$/.test(DASHBOARD_CREDIT),`the credit is a number in the operator's digits (${DASHBOARD_CREDIT})`);

    /* The four verbs of a morning — and each is a door the administrator's role may open. */
    const verbs=await page.locator('[data-quick-action]').evaluateAll(nodes=>nodes.map(node=>({
      key:node.getAttribute('data-quick-action')||'',href:node.getAttribute('href')||'',
      text:(node.textContent||'').replace(/\s+/g,' ').trim(),
      tall:node.getBoundingClientRect().height,
    })));
    assert.deepEqual(verbs.map(verb=>verb.key),['centerDailyCash','leads','batches','sms'],'the toolbar is the four verbs the owner named');
    assert.deepEqual(verbs.map(verb=>verb.href),['/bn/admin/students/collect','/bn/admin/leads?new=1','/bn/admin/batches','/bn/admin/sms'],
      'each verb goes to the screen that does it');
    assert.deepEqual(verbs.map(verb=>verb.text),[O.collect,O.newVisitor,O.routine,O.sendSms],'each verb reads as the catalogue says, in Bangla');
    assert.ok(verbs.every(verb=>verb.tall>=44),'every verb is a 44px target');
    assert.equal(await page.locator('[data-quick-actions]').getAttribute('aria-label'),O.quick,'and the toolbar names itself for a screen reader');

    /* The site tier: folded, named, and one tap from open. */
    const fold=page.locator('[data-site-fold]');
    assert.equal(await fold.evaluate(node=>node.hasAttribute('open')),false,'the public site\'s work arrives folded — below the day, not above it');
    assert.ok((await fold.locator('summary').innerText()).includes(bn.adminRedesign.site.title),'the fold names itself');
    assert.ok((await fold.locator('summary').innerText()).includes(bn.adminRedesign.site.lede),'and says what is inside it');
    assert.equal(await fold.locator('[data-site-link]:visible').count(),0,'folded means none of its doors is on screen');
    await fold.locator('summary').click();
    await page.waitForTimeout(300);
    const doors=await fold.locator('[data-site-link]').evaluateAll(nodes=>nodes.map(node=>({
      key:node.getAttribute('data-site-link')||'',href:node.getAttribute('href')||'',
      tall:node.getBoundingClientRect().height,visible:node.getBoundingClientRect().height>0,
    })));
    assert.ok(doors.length>=4,`one tap opens the fold and its doors are there (${doors.length})`);
    assert.ok(doors.every(door=>door.visible&&door.tall>=40),'and every door is a real target');
    for(const door of doors)assert.equal(permitted(door.key,'admin'),true,`the fold offers no door the administrator may not open (${door.key})`);
    assert.equal(await fold.locator('.checklist').count(),1,'the site-readiness checklist is part of the same fold');
    await shot(page,'g2-dashboard-bn-1440');
    await noOverflow(page,'the Bangla dashboard at 1440px');
    assert.deepEqual(bossSession.errors,[],'no client-side error on the dashboard');

    // ── the same screen on a phone ──
    await page.setViewportSize({width:360,height:780});
    await goto(page,'/bn/admin','[data-daily-operations]');
    await noOverflow(page,'the Bangla dashboard at 360px');
    const phoneCards=await page.locator('[data-ops-card]').evaluateAll(nodes=>nodes.map(node=>{
      const box=node.getBoundingClientRect();
      return {marker:node.getAttribute('data-ops-card'),top:Math.round(box.top),width:Math.round(box.width)};
    }));
    assert.equal(phoneCards.length,4,'all four cards survive 360px');
    assert.equal(phoneCards[0].top,phoneCards[1].top,'the cards keep two to a row rather than stacking off the first screen');
    assert.notEqual(phoneCards[0].top,phoneCards[2].top,'and the second pair sits below the first');
    const cardWidths=phoneCards.map(item=>item.width);
    assert.ok(cardWidths.every(width=>width>=140&&width<=200),`each card is a phone-sized tile (${cardWidths.join(', ')}px)`);
    const phoneVerbs=await page.locator('[data-quick-action]').evaluateAll(nodes=>nodes.map(node=>{
      const box=node.getBoundingClientRect();
      return {key:node.getAttribute('data-quick-action'),top:Math.round(box.top),width:Math.round(box.width),height:Math.round(box.height)};
    }));
    assert.equal(phoneVerbs[0].top,phoneVerbs[1].top,'the four verbs become a 2×2 block on a phone');
    assert.notEqual(phoneVerbs[0].top,phoneVerbs[2].top,'two on the first row, two on the second');
    assert.ok(phoneVerbs.every(verb=>verb.height>=44&&verb.width>=140),'and each is a thumb-sized target');
    await nothingUnderTheBar(page,'the Bangla dashboard at 360px');
    await shot(page,'g2-dashboard-bn-360');

    /* The drawer: five groups, painted from the Bangla catalogue, every target a real one. */
    await page.locator('.admin-mobilebar button[aria-expanded]').click();
    await page.locator('aside.admin-sidebar.open').waitFor({state:'visible',timeout:30000});
    const drawerGroups=await page.locator('.admin-nav .admin-group-toggle').allInnerTexts();
    assert.deepEqual(drawerGroups.map(text=>text.replace(/[＋−]/g,'').trim()),
      navGroups.filter(group=>group.items.some(([,key])=>permitted(key as string,'admin'))).map(group=>bn.adminRedesign.groups[group.key as keyof typeof bn.adminRedesign.groups]),
      'the drawer lists the five operator groups, in the order the day happens, in Bangla');
    const drawerLinks=await page.locator('aside.admin-sidebar.open nav.admin-nav a').evaluateAll(nodes=>nodes.map(node=>({
      text:(node.textContent||'').trim(),tall:Math.round(node.getBoundingClientRect().height),
    })));
    assert.ok(drawerLinks.length>=6,`the open group's doors are painted (${drawerLinks.length})`);
    assert.ok(drawerLinks.every(link=>link.tall>=44),'every door in the drawer is a 44px target');
    assert.ok(drawerLinks.some(link=>link.text.includes(bn.adminRedesign.items.centerDailyCash)),'the cash desk is in the drawer');
    assert.ok(drawerLinks.some(link=>link.text.includes(bn.adminRedesign.items.leadsFunnel)),'and so is the funnel, beside the visitor list it counts');
    await shot(page,'g2-dashboard-drawer-bn-360');
    await page.locator('.admin-drawer-close').click();
    await page.locator('aside.admin-sidebar.open').waitFor({state:'hidden',timeout:30000});
    const bottomBar=await page.locator('nav.admin-bottom-nav a, nav.admin-bottom-nav button').evaluateAll(nodes=>nodes.map(node=>({
      tall:Math.round(node.getBoundingClientRect().height),text:(node.textContent||'').trim(),
    })));
    assert.equal(bottomBar.length,4,'the bottom bar still has exactly four targets');
    assert.ok(bottomBar.every(item=>item.tall>=44),'and each is 44px tall');
    await bossSession.context.close();

    // ── the same dashboard in English, with English digits ──
    const enSession=await signIn('admin',1440,900,'en');
    await goto(enSession.page,'/en/admin','[data-daily-operations]');
    const enCards=await enSession.page.locator('[data-ops-card]').evaluateAll(nodes=>nodes.map(node=>({
      marker:node.getAttribute('data-ops-card')||'',
      label:(node.querySelector('.admin-kpi-top span')?.textContent||'').trim(),
      number:(node.querySelector('.ops-number')?.textContent||'').trim(),
      sub:(node.querySelector('.ops-sub')?.textContent||'').trim(),
    })));
    assert.deepEqual(enCards.map(item=>item.label),[OE.cash,OE.outstanding,OE.followUps,OE.sms],'the English dashboard names its cards from the English catalogue');
    assert.equal(enCards[0].number,`${CURRENCY_EN}${formatNumber(CASH_TODAY,'en')}`,'and reads the same money in English digits');
    assert.equal(enCards[2].sub,`${OE.visitorsSub.replace('{fresh}',formatNumber(3,'en'))} · ${OE.overdue.replace('{late}',formatNumber(1,'en'))}`,'the same promise, in English');
    const enTierText=await enSession.page.locator('[data-daily-operations]').innerText();
    assert.equal(hasBanglaLetters(enTierText),false,`the English tier carries no Bangla word: ${enTierText.split('\n').find(line=>hasBanglaLetters(line))||''}`);
    assert.equal(hasBanglaDigits(enTierText),false,'and no Bangla digit, because the operator asked for English digits');
    const enVerbs=await enSession.page.locator('[data-quick-action]').allInnerTexts();
    assert.deepEqual(enVerbs.map(text=>text.replace(/\s+/g,' ').trim()),[OE.collect,OE.newVisitor,OE.routine,OE.sendSms],'the four verbs read English');
    const enGroups=await enSession.page.locator('.admin-nav .admin-group-toggle').allInnerTexts();
    assert.deepEqual(enGroups.map(text=>text.replace(/[＋−]/g,'').trim()),
      navGroups.map(group=>en.adminRedesign.groups[group.key as keyof typeof en.adminRedesign.groups]),
      'the sidebar\'s five groups read English on an English address');
    await noOverflow(enSession.page,'the English dashboard at 1440px');
    await shot(enSession.page,'g2-dashboard-en-1440');
    await enSession.page.setViewportSize({width:360,height:780});
    await goto(enSession.page,'/en/admin','[data-daily-operations]');
    await noOverflow(enSession.page,'the English dashboard at 360px');
    await shot(enSession.page,'g2-dashboard-en-360');
    assert.deepEqual(enSession.errors,[],'no client-side error on the English dashboard');
    await enSession.context.close();

    /* The front desk: R3.12 gave staff the visitor queue and nothing else, and a redesign does not get
       to widen that. The new tiers are the administrator's. */
    const deskSession=await signIn('staff',1440);
    await goto(deskSession.page,'/bn/admin','h2');
    assert.equal(await deskSession.page.locator('[data-daily-operations]').count(),0,'a staff session gets no operations tier');
    assert.equal(await deskSession.page.locator('[data-quick-actions]').count(),0,'no toolbar');
    assert.equal(await deskSession.page.locator('[data-site-management]').count(),0,'no site tier');
    assert.equal(await deskSession.page.locator('.admin-kpis').count(),0,'and none of the intake counters');
    assert.equal(await deskSession.page.locator('.overview-heading').count(),0,'nor the owner\'s welcome heading');
    assert.ok((await deskSession.page.locator('.admin-panel-head h2').first().innerText()).includes(bn.leads.followUpsTitle),
      'what a staff session gets is the visitor queue, as R3.12 decided');
    /* Grouping moved nobody's permission: the drawer offers a staff account no cash desk and no SMS. */
    await deskSession.page.setViewportSize({width:360,height:780});
    await goto(deskSession.page,'/bn/admin','h2');
    await deskSession.page.locator('.admin-mobilebar button[aria-expanded]').click();
    await deskSession.page.locator('aside.admin-sidebar.open').waitFor({state:'visible',timeout:30000});
    const deskGroups=(await deskSession.page.locator('.admin-nav .admin-group-toggle').allInnerTexts()).map(text=>text.replace(/[＋−]/g,'').trim());
    assert.deepEqual(deskGroups,
      navGroups.filter(group=>group.items.some(([,key])=>permitted(key as string,'staff'))).map(group=>bn.adminRedesign.groups[group.key as keyof typeof bn.adminRedesign.groups]),
      'a staff drawer lists only the groups that hold a door they may open');
    assert.equal(await deskSession.page.locator('aside.admin-sidebar.open nav.admin-nav a[href*="/admin/students/collect"]').count(),0,'no cash desk in a staff drawer');
    assert.equal(await deskSession.page.locator('aside.admin-sidebar.open nav.admin-nav a[href*="/admin/sms"]').count(),0,'and no SMS centre — spending is not the front desk\'s');
    await shot(deskSession.page,'g2-dashboard-staff-bn-360');
    await deskSession.context.close();

    // ══ 2. Forms and search line up at 360px ═════════════════════════════════════════════════════
    const phone=await signIn('admin',360,780);
    await goto(phone.page,'/bn/admin/students/collect','label.daily-search-label');
    await stacked(phone.page,'label.daily-search-label','input.daily-search','the cash desk\'s search');
    await noOverflow(phone.page,'the cash desk at 360px');
    /* Taken to the end of the screen, because that is where the button a finger needs lives: search for
       a student, pick them from the results, and the month grid and its Save arrive below the fold. */
    await phone.page.locator('input.daily-search').fill(PAID_TODAY);
    await phone.page.locator('.daily-results button').first().waitFor({state:'visible',timeout:60000});
    await phone.page.locator('.daily-results button').first().click();
    await phone.page.locator('button.daily-save').waitFor({state:'visible',timeout:60000});
    await phone.page.locator('.daily-student').waitFor({state:'visible',timeout:30000});
    await noOverflow(phone.page,'the cash desk at 360px with a student chosen');
    await nothingUnderTheBar(phone.page,'the cash desk at 360px');
    await shot(phone.page,'g2-collect-bn-360');

    await goto(phone.page,`/bn/admin/students/dues?class=${groupA._id}`,'form.admin-filter');
    await stacked(phone.page,'form.admin-filter label','select.admin-select[name="class"]','the dues list\'s class filter');
    await noOverflow(phone.page,'the dues list at 360px');
    await nothingUnderTheBar(phone.page,'the dues list at 360px');
    await shot(phone.page,'g2-dues-bn-360');

    /* The same two screens in English at the same width: the fix is in the layout, not in one language's
       words being shorter than the other's. */
    const phoneEn=await signIn('admin',360,780,'en');
    await goto(phoneEn.page,'/en/admin/students/collect','label.daily-search-label');
    await stacked(phoneEn.page,'label.daily-search-label','input.daily-search','the English cash desk\'s search');
    await noOverflow(phoneEn.page,'the English cash desk at 360px');
    await nothingUnderTheBar(phoneEn.page,'the English cash desk at 360px');
    await shot(phoneEn.page,'g2-collect-en-360');
    await phoneEn.page.setViewportSize({width:1440,height:900});
    await goto(phoneEn.page,'/en/admin/students/collect','label.daily-search-label');
    await noOverflow(phoneEn.page,'the English cash desk at 1440px');
    await shot(phoneEn.page,'g2-collect-en-1440');
    await phoneEn.context.close();

    await phone.page.setViewportSize({width:1440,height:900});
    await goto(phone.page,'/bn/admin/students/collect','label.daily-search-label');
    await noOverflow(phone.page,'the cash desk at 1440px');
    await shot(phone.page,'g2-collect-bn-1440');
    await phone.context.close();

    // ══ 3. The SMS centre in three cards ═════════════════════════════════════════════════════════
    const smsSession=await signIn('admin');
    await goto(smsSession.page,'/bn/admin/sms','[data-sms-card="send"]');
    const cards=await smsSession.page.locator('[data-sms-card]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-sms-card')));
    assert.deepEqual(cards,['send','history','diagnostic'],'the SMS centre is three cards, in the order a person reads them');
    const send=smsSession.page.locator('[data-sms-card="send"]');
    const history=smsSession.page.locator('[data-sms-card="history"]');
    const diagnostic=smsSession.page.locator('[data-sms-card="diagnostic"]');
    const head=(card:typeof send)=>card.locator('.sms-card-head h2').innerText();
    assert.deepEqual([await head(send),await head(history),await head(diagnostic)],
      [bn.sms.page.cardSend,bn.sms.page.cardHistory,bn.sms.page.cardDiagnostic],'each card is named from the Bangla catalogue');

    /* Card one is the day's work: the credit, this month, the class message, a test to one's own number,
       the template bodies and the settings that shape a send. */
    assert.equal((await send.locator('[data-sms-credit] strong').innerText()).trim(),DASHBOARD_CREDIT,
      'the balance on the SMS page and the pill on the dashboard are the same read, not two opinions');
    assert.ok((await send.locator('[data-sms-credit] span').innerText()).includes(bn.sms.page.creditLeft),'the tile says what the number is');
    assert.ok((await send.locator('h2').allInnerTexts()).some(text=>text.includes(bn.sms.page.month)),'this month\'s totals are in the daily card');
    assert.equal(await send.locator('.sms-tiles li').count(),6,'as six tiles a person can glance at');
    assert.equal(await send.locator('[data-sms-open]').count(),1,'the class message is one tap away');
    assert.ok(await send.locator('input[name="smsUnitCost"]').count()>=1,'and so are the settings that shape a send');
    assert.ok(await send.locator('input[name="phone"]').count()>=1,'and the test message to the operator\'s own number');
    assert.ok(await send.locator('article.admin-template').count()>=1,'and the template bodies');
    /* Card two is the audit trail, and only that. */
    assert.ok(await history.locator('select[name="status"]').count()>=1,'the history card holds the filters');
    assert.ok(await history.locator('input[name="q"]').count()>=1,'a search by number or name');
    const logRow=history.locator('table.admin-table tbody tr').first();
    await logRow.waitFor({state:'visible',timeout:30000});
    const rowText=(await logRow.innerText()).replace(/\s+/g,' ');
    assert.ok(rowText.includes(`${CURRENCY_BN}${formatNumber(0.5,'bn')}`),`the row carries its own cost: ${rowText}`);
    assert.ok(rowText.includes(bn.sms.statuses.sent)||rowText.includes(bn.sms.statuses.failed),`and its delivery status in Bangla: ${rowText}`);
    assert.equal(await history.locator('[data-sms-open]').count(),0,'the history card is not where a message is composed');
    /* Card three is the mechanic's: the connection, the stuck sends and their retry — and nothing else. */
    assert.equal(await diagnostic.locator('[data-sms-problems]').count(),1,'the automatic send that did not go out leads the diagnostic card');
    assert.equal((await diagnostic.locator('[data-sms-problem-count]').innerText()).trim(),formatNumber(1,'bn'),'counting the one this suite seeded');
    assert.ok((await diagnostic.locator('[data-sms-problem]').first().innerText()).includes(bn.sms.problems.disabled),
      'and it says so in a sentence an operator has, not in the name of a variable');
    const definitions=await diagnostic.locator('dl dt').allInnerTexts();
    assert.deepEqual(definitions.map(text=>text.trim()),[bn.sms.page.provider,bn.sms.page.credentials,bn.sms.page.sendingGate,bn.sms.page.balance],
      'the connection reads provider, credentials, sending gate, balance');
    assert.match((await diagnostic.locator('dl dd').first().innerText()).trim(),/mock|bulksmsbd/,'and names the provider that answers');
    assert.equal(await diagnostic.locator('input[name="batchId"]').count(),1,'the half-failed batch offers its retry here');
    assert.equal(await diagnostic.locator('[data-sms-open]').count(),0,'no everyday tool lives in the diagnostic card');
    assert.equal(await diagnostic.locator('input[name="smsUnitCost"]').count(),0,'and no settings form either');
    assert.equal(await send.locator('input[name="batchId"]').count(),0,'no retry in the daily card');
    assert.equal(await send.locator('[data-sms-problems]').count(),0,'and no stuck-send panel in it either');
    /* One definition list on the whole page, and it is the diagnostic one: the machine-readable block
       stays in the machine's card, and the first `dd` anyone reads is the provider's name. */
    assert.equal(await smsSession.page.locator('dl').count(),1,'the page has exactly one definition list');
    assert.equal(await smsSession.page.locator('[data-sms-card="diagnostic"] dl').count(),1,'and it belongs to the third card');
    assert.match((await smsSession.page.locator('dd').first().innerText()).trim(),/mock|bulksmsbd/,
      'so the first definition on the page is the provider');
    /* No variable name reaches the reader. The four sentences that used to name one now say what to do,
       and the deployment papers — which the person who can turn a knob reads — still name it. */
    const html=await smsSession.page.content();
    for(const name of ['CENTER_SMS_WRITE_ENABLED','NEXTAUTH_URL','PUBLIC_AI_ENABLED','CENTER_IMPORT_WRITE_ENABLED'])
      assert.equal(html.includes(name),false,`the served SMS page never names ${name}`);
    await noOverflow(smsSession.page,'the SMS centre at 1440px');
    await shot(smsSession.page,'g2-sms-bn-1440');
    await smsSession.page.setViewportSize({width:360,height:780});
    await goto(smsSession.page,'/bn/admin/sms','[data-sms-card="send"]');
    await noOverflow(smsSession.page,'the SMS centre at 360px');
    const stackedCards=await smsSession.page.locator('[data-sms-card]').evaluateAll(nodes=>nodes.map(node=>Math.round(node.getBoundingClientRect().width)));
    assert.ok(stackedCards.every(width=>Math.abs(width-stackedCards[0])<=2),`the three cards are the same width, one under another (${stackedCards.join(', ')}px)`);
    await nothingUnderTheBar(smsSession.page,'the SMS centre at 360px');
    await shot(smsSession.page,'g2-sms-bn-360');
    await smsSession.page.setViewportSize({width:1440,height:900});
    await goto(smsSession.page,'/en/admin/sms','[data-sms-card="send"]');
    const enHeads=[await smsSession.page.locator('[data-sms-card="send"] .sms-card-head h2').innerText(),
      await smsSession.page.locator('[data-sms-card="history"] .sms-card-head h2').innerText(),
      await smsSession.page.locator('[data-sms-card="diagnostic"] .sms-card-head h2').innerText()];
    assert.deepEqual(enHeads.map(text=>text.trim()),[en.sms.page.cardSend,en.sms.page.cardHistory,en.sms.page.cardDiagnostic],
      'the three cards read English on an English address');
    const enHeadsText=enHeads.join(' ');
    assert.equal(hasBanglaLetters(enHeadsText),false,'with no Bangla in the card headings');
    await noOverflow(smsSession.page,'the English SMS centre at 1440px');
    await shot(smsSession.page,'g2-sms-en-1440');
    await smsSession.page.setViewportSize({width:360,height:780});
    await goto(smsSession.page,'/en/admin/sms','[data-sms-card="send"]');
    await noOverflow(smsSession.page,'the English SMS centre at 360px');
    await shot(smsSession.page,'g2-sms-en-360');
    assert.deepEqual(smsSession.errors,[],'no client-side error anywhere in the SMS centre');
    await smsSession.context.close();

    console.log(`Operator screens: the dashboard leads with today's four numbers — ${CURRENCY_BN}${formatNumber(CASH_TODAY,'bn')} taken today in Bangla digits and ${CURRENCY_EN}${formatNumber(CASH_TODAY,'en')} in English, ${formatNumber(OUTSTANDING,'bn')} owed, one promise due and one late in red, one message stuck — with the four verbs under them and the public site's work folded below; a staff session still gets the visitor queue alone; the cash desk's search and the dues filter put the word above the control and fill the row at 360px with nothing tappable under the bottom bar; the SMS centre is three cards with the retry and the connection in the third, one definition list on the page and no variable name in the served HTML; and the drawer lists five operator groups in both languages with every role's doors unchanged.`);
  }finally{
    await browser.close();
    await mongoose.disconnect();
    if(!shared)await mongo.stop();
  }
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
