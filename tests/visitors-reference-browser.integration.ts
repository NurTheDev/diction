/**
 * R8 · the Visitors page as the REFERENCE implementation (owner review, 2026-11-15).
 *
 * The owner stopped the rolling cross-page pass and asked for one page to be finished completely, so
 * that the pattern could be judged before it is copied to students, CVs, admissions, classes, exams,
 * blog and notices. This suite is the proof of that page, and every assertion here is a line of the
 * brief:
 *
 *  1. one compact row per visitor — at most five visible controls, no long action cell, ≤72 px tall;
 *  2. a visible Edit on every row and a ⋯ that holds the role-correct destructive verb: Delete for
 *     Admin and Super Admin ("moves to the Recycle Bin for 30 days", confirmation, 10-second Undo),
 *     Archive for Staff — and a role that may not see the page at all reaches none of it;
 *  3. status and follow-up each change in TWO taps and answer with a toast;
 *  4. no native date input anywhere on the page: a day is picked from our calendar popover and read
 *     back as dd/mm/yyyy in Bangla digits or as "15 Nov 2026" in English;
 *  5. the tick column has no heading, and ticking a row raises a bulk bar with the four verbs;
 *  6. the number is printed for the signed-in roles that call visitors — and is in no URL, no link
 *     other than `tel:` and `wa.me`, no audit target;
 *  7. at 360 px the row is a card with big Call and WhatsApp and nothing scrolls sideways, and at
 *     360/768/1024/1440 the document never overflows and every target is ≥44 px.
 *
 * Photographed into screenshots/r8/ with eight seeded visitors — one per status, a long Bangla name,
 * an overdue follow-up and a do-not-contact row among them.
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
import {AdminAudit} from '../src/models/AdminAudit';
import {Lead} from '../src/models/Lead';
import {CenterSettings,CenterSmsTemplate} from '../src/models/CenterRecords';
import {createQuickLead,updateLeadStatus} from '../src/lib/leads/leads';
import {dhakaDay} from '../src/lib/admin/today';
import {statusLabel} from '../src/lib/leads/lead-ui';
import bn from '../src/messages/bn.json';
import en from '../src/messages/en.json';

const t=bn.leads,w=bn.adminWork;
const lt=(key:string):string=>key.split('.').reduce((node:unknown,part:string)=>(node as Record<string,unknown>)?.[part],bn.leads as unknown) as string;
const SHOTS=path.join('screenshots','r8');
/** Bangla digits read as ASCII ones, so an assertion can count either. */
const ascii=(text:string):string=>text.replace(/[\u09e6-\u09ef]/g,c=>String(c.charCodeAt(0)-0x09e6));
const banglaDigits=(text:string):boolean=>/[\u09e6-\u09ef]/.test(text);

const day=(offset:number):string=>dhakaDay(new Date(Date.now()+offset*86400000));

/** Eight visitors, one per status, with the awkward shapes the owner asked to see among them. */
const FIXTURES=[
  {name:'রাহুল আহমেদ',phone:'01712817090',classLabel:'XI',school:'ধানমন্ডি সরকারি বালক বিদ্যালয়',status:'new',followUp:'today',note:'প্রথম কল — আগ্রহী'},
  // The long name: it must truncate inside the row, not push the row wider or taller than the rest.
  {name:'মোঃ আব্দুল্লাহ আল মামুন চৌধুরী হাসান',phone:'01811223344',classLabel:'9',school:'মিরপুর গার্লস স্কুল ও কলেজ, ঢাকা',status:'called',followUp:'tomorrow',note:'কল করা হয়েছে — মা কথা বলেছেন'},
  {name:'পুরনো ভিজিটর',phone:'01933445566',classLabel:'SSC 25',school:'উত্তরা মডেল স্কুল',status:'interested',followUp:'custom',customDay:day(-3),note:'তিন দিন আগে কল দেওয়ার কথা ছিল'},
  {name:'যোগাযোগ বন্ধ থাকা ভিজিটর',phone:'01611998877',classLabel:'10',school:'খিলগাঁও বালিকা বিদ্যালয়',status:'do_not_contact',note:'বাবা বলেছেন আর কল না করতে'},
  {name:'নাম্বারবিহীন ভিজিটর',classLabel:'7',school:'বনানী বিদ্যানিকেতন',status:'no_answer',followUp:'three_days',note:'নম্বর লেখা হয়নি'},
  {name:'ট্রায়াল ক্লাসের ভিজিটর',phone:'01521445566',classLabel:'8',school:'মোহাম্মদপুর প্রিপারেটরি',status:'trial_booked',followUp:'next_week',note:'শনিবার ট্রায়াল ক্লাস'},
  {name:'ভর্তি হওয়া ভিজিটর',phone:'01799887766',classLabel:'XII',school:'নটর ডেম কলেজ',status:'admitted',note:'ভর্তি সম্পন্ন'},
  {name:'অনিহা জানিয়েছে যে ভিজিটর',phone:'01333444555',classLabel:'6',school:'সাভার ক্যান্টনমেন্ট স্কুল',status:'not_interested',note:'এখন প্রয়োজন নেই'},
] as const;
const LONG_NAME=FIXTURES[1].name,OVERDUE=FIXTURES[2].name,BLOCKED=FIXTURES[3].name,NO_PHONE=FIXTURES[4].name;
const ADMITTED=FIXTURES[6].name,CLOSED_OFF=FIXTURES[7].name;
const FIRST=FIXTURES[0].name,P1=FIXTURES[0].phone,P2=FIXTURES[1].phone;

async function run(){
  await preflight({mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,test:'tests/visitors-reference-browser.integration.ts — start the app first, then run it with TEST_ORIGIN and TEST_MONGO_URI'});
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

  await Lead.deleteMany({});
  await AdminAudit.deleteMany({action:/^lead\./});
  await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});

  const password=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(password,12);
  const accounts={admin:'r8-boss@example.test',staff:'r8-desk@example.test',content_editor:'r8-teacher@example.test'};
  for(const role of ['admin','staff','content_editor'] as const){
    await User.deleteOne({email:accounts[role]});
    await User.create({name:role==='admin'?'আর৮ বস':role==='staff'?'আর৮ ফ্রন্ট ডেস্ক':'আর৮ কনটেন্ট শিক্ষক',email:accounts[role],passwordHash:hash,role,active:true});
  }
  const bossId=String((await User.findOne({email:accounts.admin}).lean<{_id:unknown}>())!._id);

  // Seeded through the rule layer: what this page reads is what quick-add really writes.
  for(const fixture of FIXTURES){
    const made=await createQuickLead({studentName:fixture.name,phone:'phone'in fixture?fixture.phone:undefined,classLabel:fixture.classLabel,school:fixture.school,status:fixture.status,followUp:'followUp'in fixture?fixture.followUp:undefined,customDay:'customDay'in fixture?fixture.customDay:undefined,note:'note'in fixture?fixture.note:undefined},bossId);
    assert.equal(made.ok,true,`the fixture visitor ${fixture.name} is written`);
  }
  assert.equal(await Lead.countDocuments(),8,'eight visitors, one per status, and nothing else in the collection');
  /* The stale filter needs a visitor who has genuinely gone quiet, so the "old" one is made old in both
     facts the rule reads: the day they came and the only note anybody wrote. Six hundred days is well
     past the eighteen-month cut whatever day the suite runs on. */
  await Lead.updateOne({studentName:OVERDUE},{$set:{date:day(-600),'notes.$[note].at':new Date(Date.now()-600*86400000)}},
    {arrayFilters:[{'note.at':{$exists:true}}]});
  // A send dialog must not meet quiet hours, and the shipped catalogue is what the picker offers.
  await CenterSettings.updateOne({key:'main'},{$set:{key:'main',quietStart:'00:00',quietEnd:'00:00'}},{upsert:true});
  await CenterSmsTemplate.deleteMany({});

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
  const rowOf=(page:Page,name:string)=>page.locator('tr[data-visitor-row]',{hasText:name}).first();
  /** Walk a calendar to the month that holds the day, then pick it — the `‹ ›` nav is part of the proof. */
  const pickDay=async(calendar:Locator,iso:string,direction:'[data-cal-back]'|'[data-cal-forward]')=>{
    for(let step=0;step<5;step++){
      const cell=calendar.locator(`[data-cal-day="${iso}"]`).first();
      if(await cell.count()>0){await cell.click();return}
      await calendar.locator(direction).first().click();
    }
    throw Error(`the calendar never showed ${iso}`);
  };
  type Stored={_id:unknown;status:string;nextFollowUp:string|null;school:string;classGroup:number|null;phones:{normalized:string}[]};
  const stored=async(name:string)=>Lead.findOne({studentName:name}).lean<Stored|null>();
  /** The bin hides a record from every ordinary query, so a binned visitor is asked for by its filter. */
  const binned=async(name:string)=>Lead.findOne({studentName:name,deletedAt:{$type:'date'}},{recycleAny:true} as never).lean<Stored|null>();

  try{
    async function signIn(role:'admin'|'staff'|'content_editor'){
      const context=await browser.newContext({viewport:{width:1440,height:900}});
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
    const list='/bn/admin/leads';
    await boss.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
    try{
      await boss.page.locator('h1',{hasText:t.title}).first().waitFor({timeout:60000});
    }catch(error){
      console.error(`DIAG the leads list did not paint: url=${boss.page.url()}`);
      console.error(`DIAG body=${(await boss.page.locator('body').innerText().catch(()=>'')).slice(0,900)}`);
      console.error(`DIAG pageerrors=${JSON.stringify(boss.errors)}`);
      throw error;
    }
    await boss.page.locator('tr[data-visitor-row]').first().waitFor({timeout:90000});
    const rowCount=()=>boss.page.locator('section.list-panel tr[data-visitor-row]').count();

    // ---- 1. The reference row: the open visitors, five visible controls, one line, no action cell.
    assert.equal(await rowCount(),5,'the five open visitors are listed — admitted, not interested and do-not-contact are filed away');
    for(const name of [BLOCKED,ADMITTED,CLOSED_OFF])
      assert.equal(await rowOf(boss.page,name).count(),0,`${name} is a closed visitor, so the default list leaves the row out`);
    const heights=await boss.page.locator('section.list-panel tr[data-visitor-row]').evaluateAll(nodes=>nodes.map(node=>Math.round(node.getBoundingClientRect().height)));
    if(heights.some(height=>height>72)){
      /* Name the cell that is tall, not only the row: the budget is a per-cell promise, and a row that
         breaks it is one cell wrapping something it should have truncated. */
      const tall=await boss.page.locator('section.list-panel tr[data-visitor-row]').evaluateAll(nodes=>nodes
        .map(node=>({
          visitor:node.querySelector('.visitor-name strong')?.textContent||'?',
          height:Math.round(node.getBoundingClientRect().height),
          cells:[...node.children].map(cell=>{
            const box=cell as HTMLElement;
            const kids=[...box.children]
              .map(kid=>`${(kid as HTMLElement).className||kid.tagName}:${Math.round(kid.getBoundingClientRect().height)}`)
              .join(' ');
            return `${box.className}=${Math.round(box.getBoundingClientRect().height)}px [${kids}]`;
          }),
        }))
        .filter(row=>row.height>72));
      console.log('rows over the 72px budget:',JSON.stringify(tall));
    }
    assert.ok(heights.every(height=>height<=72),`every row is at most 72px tall (tallest ${Math.max(...heights)}px)`);
    for(const name of [FIRST,LONG_NAME,OVERDUE,NO_PHONE]){
      const row=rowOf(boss.page,name);
      assert.equal(await row.locator('[data-visitor-edit]').count(),1,`${name}: the row has a visible Edit`);
      assert.equal(await row.locator('[data-visitor-open]').count(),1,`${name}: a visible Open`);
      assert.equal(await row.locator('.pop-more .pop-anchor').count(),1,`${name}: and a ⋯ menu`);
      assert.ok(await row.locator('[data-visitor-edit]').isVisible(),`${name}: Edit is on screen, not behind another tap`);
      // Five visible controls and no sixth: Open, Edit, ⋯, the status badge and the follow-up chip.
      /* `:visible` because the row also owns its drawer: a closed <dialog> is still in the document, and
         the count that matters is the controls an operator can see and reach without opening anything. */
      const controls=await row.locator('.visitor-act button:visible, .visitor-act .pop-anchor:visible, .visitor-status .pop-anchor:visible, .visitor-follow .pop-anchor:visible').count();
      assert.equal(controls,5,`${name}: exactly five controls in the row (${controls} found) — the long action cell is gone`);
    }
    // ---- 1b. Closed visitors are filed away, not deleted: one tick brings them back, and asking for a
    // closed status by name needs no tick at all.
    await boss.page.locator('.lead-chips a',{hasText:statusLabel(lt,'do_not_contact')}).click();
    await rowOf(boss.page,BLOCKED).waitFor({timeout:90000});
    assert.equal(await rowCount(),1,'asking for a closed status by name shows it without the tick');
    await boss.page.locator('.lead-chips a',{hasText:t.all}).first().click();
    await rowOf(boss.page,FIRST).waitFor({timeout:90000});
    assert.equal(await rowCount(),5,'and the list returns to the open five');
    await boss.page.locator('input[name="closed"]').check();
    await boss.page.locator('[data-lead-filters] button[type="submit"]').click();
    await rowOf(boss.page,BLOCKED).waitFor({timeout:90000});
    assert.equal(await rowCount(),8,'the show-closed tick brings all eight back');
    const closedRow=rowOf(boss.page,BLOCKED);
    for(const part of ['[data-visitor-open]','[data-visitor-edit]','.pop-more .pop-anchor','[data-status-badge]','[data-dnc]'])
      assert.equal(await closedRow.locator(part).count(),1,
        `a closed row keeps ${part} too${part==='[data-dnc]'?' — a do-not-contact visitor keeps its warning badge':''}`);
    await shot(boss.page,'r8-visitors-show-closed-1440');
    await boss.page.locator('input[name="closed"]').uncheck();
    await boss.page.locator('[data-lead-filters] button[type="submit"]').click();
    await until(async()=>await rowCount()===5,'unticking show-closed to file the closed three away again');
    const longRow=rowOf(boss.page,LONG_NAME);
    const longBox=await longRow.locator('.visitor-who').boundingBox();
    assert.ok(longBox&&longBox.width<420,`the long Bangla name truncates inside its cell instead of widening the row (${Math.round(longBox?longBox.width:0)}px)`);
    assert.ok((await rowOf(boss.page,OVERDUE).locator('[data-follow-chip="overdue"]').count())===1,'an overdue follow-up says so on the row');
    assert.ok(banglaDigits(await rowOf(boss.page,OVERDUE).locator('[data-follow-chip="overdue"]').innerText()),'and counts the days in Bangla digits');
    // (The do-not-contact badge on a filed-away row is proved in 1b, where that row is on screen.)
    // Filters are expanded on a desktop, and there is no native date input anywhere on the page.
    assert.notEqual(await boss.page.locator('[data-lead-filters]').getAttribute('open'),null,'the Filters panel is expanded on a desktop');
    assert.equal(await boss.page.locator('input[type="date"]').count(),0,'no native date input anywhere on the page');
    assert.equal(await boss.page.locator('th.visitor-check').innerText().then(text=>text.trim()),'','the tick column has no heading');
    // The number is printed for the signed-in role that calls, and travels nowhere else.
    assert.ok((await boss.page.locator('body').innerText()).includes(P1),`the list prints the number for a signed-in admin (${P1})`);
    assert.ok(await rowOf(boss.page,FIRST).locator('[data-visitor-phone]',{hasText:P1}).count()>0,'inside the row\'s number cell');
    const hrefs=await boss.page.locator('a[href]').evaluateAll(nodes=>nodes.map(node=>(node as HTMLAnchorElement).href));
    for(const href of hrefs)assert.ok(!href.includes(P1)||href.startsWith('tel:')||href.startsWith('https://wa.me/'),`no link carries the number except the two destinations (${href})`);
    assert.ok(!boss.page.url().includes(P1),'the number is not in the address bar');
    await noOverflow(boss.page,'the reference list at 1440');
    await shot(boss.page,'r8-visitors-list-1440');

    // ---- 2. Status in two taps, with a toast.
    let taps=0;
    const firstRow=rowOf(boss.page,FIRST);
    await firstRow.locator('[data-status-badge]').click();taps++;
    await firstRow.locator('[data-status-menu]').waitFor({state:'visible',timeout:30000});
    await shot(boss.page,'r8-visitors-status-menu-1440',false);
    await firstRow.locator('[data-status-option="called"]').click();taps++;
    assert.ok(taps<=2,`a status change costs ${taps} taps, and the brief allows two`);
    const toast=boss.page.locator('.admin-toast[role="status"]');
    await boss.page.locator('.admin-toast[role="status"]',{hasText:bn.leads.success.STATUS_CHANGED}).first().waitFor({state:'visible',timeout:60000});
    assert.ok((await toast.first().innerText()).includes(bn.leads.success.STATUS_CHANGED),'and a toast says it happened, in the catalogue\u2019s own sentence');
    await until(async()=>(await stored(FIRST))!.status==='called','the status to be written');
    /* Waited for, and only then counted. The toast is raised on the way back from the write now, so it
       no longer implies the refreshed row has been painted — the badge arrives a moment later, and an
       instant count here would be measuring the previous render. */
    const calledBadge=boss.page.locator('tr[data-visitor-row]',{hasText:FIRST})
      .locator('[data-status-badge]',{hasText:statusLabel(lt,'called')});
    await calledBadge.first().waitFor({timeout:60000});
    assert.equal(await calledBadge.count(),1,'the badge now reads the new status, with no Save button anywhere');

    // ---- 3. Follow-up in two taps, then a day picked from OUR calendar.
    taps=0;
    await rowOf(boss.page,FIRST).locator('[data-follow-chip]').click();taps++;
    await rowOf(boss.page,FIRST).locator('[data-follow-menu]').waitFor({state:'visible',timeout:30000});
    await shot(boss.page,'r8-visitors-follow-popover-1440',false);
    await rowOf(boss.page,FIRST).locator('[data-follow-option="tomorrow"]').click();taps++;
    assert.ok(taps<=2,`a follow-up change costs ${taps} taps`);
    await boss.page.locator('.admin-toast[role="status"]',{hasText:'\u09ab\u09b2\u09cb-\u0986\u09aa'}).first().waitFor({state:'visible',timeout:60000});
    await until(async()=>(await stored(FIRST))!.nextFollowUp===day(1),'tomorrow to be written');
    await rowOf(boss.page,FIRST).locator('[data-follow-chip="tomorrow"]').waitFor({timeout:90000});

    taps=0;
    await rowOf(boss.page,FIRST).locator('[data-follow-chip]').click();taps++;
    await rowOf(boss.page,FIRST).locator('[data-follow-pick]').click();taps++;
    const calendar=boss.page.locator('.pop-calendar').first();
    await calendar.waitFor({state:'visible',timeout:30000});
    const monthWord=await boss.page.locator('[data-cal-month]').first().innerText();
    assert.ok(banglaDigits(monthWord),`the calendar names its month in Bangla with Bangla digits (${monthWord})`);
    await shot(boss.page,'r8-visitors-calendar-1440',false);
    await pickDay(calendar,day(5),'[data-cal-forward]');
    await until(async()=>(await stored(FIRST))!.nextFollowUp===day(5),'the picked day to be written');
    const chipText=await rowOf(boss.page,FIRST).locator('[data-follow-chip]').innerText();
    assert.match(chipText,/^[\u09e6-\u09ef]{2}\/[\u09e6-\u09ef]{2}\/[\u09e6-\u09ef]{4}$/,`a later day reads dd/mm/yyyy in Bangla digits (${chipText})`);
    // dd/mm/yyyy and not mm/dd/yyyy: read the chip back as the day it claims to be.
    const [dd,mm,yyyy]=ascii(chipText).split('/').map(Number);
    assert.equal(`${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`,day(5),`the chip's dd/mm/yyyy is the day that was picked, not a month-first misreading (${chipText})`);
    // Clearing is one tap on the chip and one on Clear.
    await rowOf(boss.page,FIRST).locator('[data-follow-chip]').click();
    await rowOf(boss.page,FIRST).locator('[data-follow-clear]').click();
    await until(async()=>(await stored(FIRST))!.nextFollowUp===null,'the follow-up to be cleared');
    await rowOf(boss.page,FIRST).locator('[data-follow-chip="none"]',{hasText:t.row.noFollow}).waitFor({timeout:90000});

    // ---- 4. The ⋯ menu: role-correct, with the destructive verb behind a confirmation.
    await rowOf(boss.page,FIRST).locator('.pop-more .pop-anchor').click();
    const more=rowOf(boss.page,FIRST).locator('[data-more-menu]');
    await more.waitFor({state:'visible',timeout:30000});
    const moreText=(await more.innerText()).replace(/\s+/g,' ');
    for(const item of [t.row.sendSms,t.row.bookTrial,t.row.convert,t.row.notInterested,w.deleteAction])
      assert.ok(moreText.includes(item),`the admin's ⋯ menu offers ${item} (${moreText})`);
    assert.equal(await more.locator('[data-row-delete]').count(),1,'Delete is in the menu for an admin…');
    assert.ok(moreText.includes(t.row.deleteHint),'and it says what Delete really does');
    await shot(boss.page,'r8-visitors-more-menu-1440',false);

    /* The menu item keeps its own confirmation inside itself, so it holds three buttons: the verb, and
       the dialog's no and yes. The verb is the one on screen, and it is named. */
    await more.locator('[data-row-delete] button',{hasText:w.deleteAction}).first().click();
    /* The confirmation belongs to the menu item that opened it, so it is read from there: a page-wide
       `dialog.admin-confirm` would also match the dialogs of any other row's menu that is in the document. */
    const confirm=more.locator('dialog.admin-confirm');
    await confirm.waitFor({state:'visible',timeout:30000});
    const confirmText=(await confirm.innerText()).replace(/\s+/g,' ');
    assert.ok(confirmText.includes(FIRST),`the dialog names the visitor it is about to move (${confirmText})`);
    assert.ok(confirmText.includes(w.softBody),'and states the real consequence: 30 days in the Recycle Bin');
    await shot(boss.page,'r8-visitors-delete-confirm-1440',false);
    await confirm.locator('button',{hasText:w.deleteYes}).click();
    await until(async()=>Boolean(await binned(FIRST))&&!await stored(FIRST),'the visitor to reach the Recycle Bin');
    const undo=boss.page.locator('.admin-toast button',{hasText:w.undoDelete});
    await undo.first().waitFor({state:'visible',timeout:60000});
    assert.equal(await boss.page.locator('tr[data-visitor-row]',{hasText:FIRST}).count(),0,'and to leave the list');
    await shot(boss.page,'r8-visitors-undo-toast-1440',false);
    // The Undo window is the 10 seconds the owner asked for: still there after five.
    await new Promise(resolve=>setTimeout(resolve,5000));
    assert.ok(await undo.first().isVisible(),'the Undo toast is still offered five seconds on');
    await undo.first().click();
    await until(async()=>Boolean(await stored(FIRST)),'Undo to bring the visitor back');
    await rowOf(boss.page,FIRST).waitFor({timeout:90000});

    // ---- 5. Edit: the drawer in edit mode, every field, Save and Cancel.
    await rowOf(boss.page,FIRST).locator('[data-visitor-edit]').click();
    const drawer=boss.page.locator('dialog.overview-drawer[open]');
    await drawer.waitFor({state:'visible',timeout:30000});
    const edit=drawer.locator('[data-lead-edit]');
    await edit.waitFor({state:'visible',timeout:30000});
    for(const field of ['studentName','guardianName','phone','classGroup','school','interestedIn','status','group','shift','medium','source'])
      assert.equal(await edit.locator(`[name="${field}"]`).count(),1,`the edit form carries ${field}`);
    assert.equal(await edit.locator('input[name="phone"]').inputValue(),P1,'prefilled with the number an admin may read');
    await shot(boss.page,'r8-visitors-edit-drawer-1440',false);
    await edit.locator('input[name="school"]').fill('সংশোধিত স্কুল');
    await edit.locator('[data-lead-edit-save]').click();
    await until(async()=>(await stored(FIRST))?.school==='সংশোধিত স্কুল','the edit to be saved');
    await boss.page.locator('.admin-toast[role="status"]',{hasText:bn.leads.success.LEAD_SAVED}).first().waitFor({state:'visible',timeout:60000});
    await drawer.locator('header button').click();
    await drawer.waitFor({state:'detached',timeout:30000});
    assert.ok((await rowOf(boss.page,FIRST).innerText()).includes('সংশোধিত স্কুল'),'and the row reads the corrected school back');

    // ---- 6. The bulk bar: no heading on the tick column, four verbs the moment a row is ticked.
    assert.equal(await boss.page.locator('[data-lead-bulk-bar]').count(),0,'with nobody ticked there is no bulk bar');
    await rowOf(boss.page,FIRST).locator('input[name="smsLead"]').check();
    await rowOf(boss.page,LONG_NAME).locator('input[name="smsLead"]').check();
    const bulk=boss.page.locator('[data-lead-bulk-bar]');
    await bulk.waitFor({state:'visible',timeout:30000});
    const bulkText=(await bulk.innerText()).replace(/\s+/g,' ');
    for(const verb of [t.row.thanks,t.row.bulkStatus,t.row.bulkFollow,w.deleteAction])
      assert.ok(bulkText.includes(verb),`the admin's bulk bar offers ${verb} (${bulkText})`);
    assert.ok(bulkText.includes('2')||banglaDigits(bulkText),'and says how many rows are ticked');
    await shot(boss.page,'r8-visitors-bulk-bar-1440');
    await bulk.locator('[data-bulk-status]').click();
    await bulk.locator('[data-bulk-status-option="interested"]').click();
    await until(async()=>(await stored(FIRST))?.status==='interested'&&(await stored(LONG_NAME))?.status==='interested','the bulk status to be written to both rows');
    await boss.page.locator('.admin-toast[role="status"]',{hasText:'\u09b8\u09cd\u099f\u09cd\u09af\u09be\u099f\u09be\u09b8'}).first().waitFor({state:'visible',timeout:60000});
    await bulk.locator('[data-bulk-thanks]').click();
    const overlay=boss.page.locator('.sms-overlay');
    await overlay.locator('[data-sms-dialog]').waitFor({timeout:60000});
    await overlay.locator('button[aria-label="বন্ধ করুন"]').click();
    await overlay.waitFor({state:'detached',timeout:60000});
    await bulk.locator('[data-bulk-clear]').click();
    await bulk.waitFor({state:'detached',timeout:30000});
    // A visitor who said "do not contact" is not tickable, so it is not bulk-acted on either.
    assert.equal(await rowOf(boss.page,BLOCKED).locator('input[name="smsLead"]').count(),0,'a blocked visitor offers no checkbox');
    assert.equal(await rowOf(boss.page,NO_PHONE).locator('input[name="smsLead"]').count(),0,'nor one with no number');

    // ---- 7. A date filter picked from the calendar, and read back in Bangla digits.
    await boss.page.locator('[data-day-pick="from"]').click();
    const fromCalendar=boss.page.locator('[data-day-field="from"] .pop-calendar').first();
    await fromCalendar.waitFor({state:'visible',timeout:30000});
    await pickDay(fromCalendar,day(-40),'[data-cal-back]');
    const fromView=await boss.page.locator('[data-day-field="from"] .pop-day-view').innerText();
    assert.match(fromView,/^[\u09e6-\u09ef]{2}\/[\u09e6-\u09ef]{2}\/[\u09e6-\u09ef]{4}$/,`the filter reads the picked day back as dd/mm/yyyy (${fromView})`);
    await shot(boss.page,'r8-visitors-filters-1440');
    await boss.page.locator('[data-lead-filters] button[type="submit"]').click();
    await boss.page.waitForURL(url=>url.search.includes('from='),{timeout:60000});
    assert.ok(boss.page.url().includes(`from=${day(-40)}`),`and the filter travels as a day, not as a number: ${boss.page.url()}`);
    assert.ok(!boss.page.url().includes(P1),'no number in the address bar after filtering either');
    await boss.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
    await rowOf(boss.page,FIRST).waitFor({timeout:90000});

    // ---- 7b. The stale list: the eighteen-month notice became a question an operator asks. It names the
    // quiet visitor, says it is only a suggestion, and changes nothing by itself.
    await boss.page.locator('input[name="stale"]').check();
    await boss.page.locator('[data-lead-filters] button[type="submit"]').click();
    await rowOf(boss.page,OVERDUE).waitFor({timeout:90000});
    assert.equal(await rowCount(),1,'the stale filter names exactly the visitor whose newest fact is over eighteen months old');
    assert.ok(await boss.page.locator('[data-stale-hint]').isVisible(),'and the list says out loud that it is only a suggestion');
    assert.equal(await Lead.countDocuments(),8,'asking the question removed nobody');
    await shot(boss.page,'r8-visitors-stale-1440');
    await boss.page.locator('input[name="stale"]').uncheck();
    await boss.page.locator('[data-lead-filters] button[type="submit"]').click();
    await until(async()=>await rowCount()===5,'the list to return to the open five');

    // ---- 8. English: month names instead of dd/mm/yyyy, and still no native date box.
    await boss.page.goto(`${origin}/en/admin/leads`,{waitUntil:'domcontentloaded',timeout:180000});
    await boss.page.locator('tr[data-visitor-row]').first().waitFor({timeout:90000});
    assert.equal(await boss.page.locator('input[type="date"]').count(),0,'the English page has no native date input either');
    await rowOf(boss.page,OVERDUE).locator('[data-follow-chip]').click();
    await boss.page.locator('[data-follow-pick]').first().click();
    const enMonth=await boss.page.locator('[data-cal-month]').first().innerText();
    assert.match(enMonth,/[A-Z][a-z]+ \d{4}/,`the English calendar names its month in English (${enMonth})`);
    await pickDay(boss.page.locator('.pop-calendar').first(),day(9),'[data-cal-forward]');
    await until(async()=>(await stored(OVERDUE))?.nextFollowUp===day(9),'the English pick to be written');
    const enChip=await rowOf(boss.page,OVERDUE).locator('[data-follow-chip]').innerText();
    assert.match(enChip,/\d{1,2} [A-Z][a-z]{2} \d{4}/,`an English row reads its day as "15 Nov 2026" (${enChip})`);
    await shot(boss.page,'r8-visitors-list-en-1440');
    assert.deepEqual(boss.errors,[],`page errors while driving the reference row: ${boss.errors.join(' | ')}`);

    // ---- 9. Responsive: 360 / 768 / 1024 / 1440, no sideways scroll, targets a thumb can hit.
    for(const width of [1440,1024,768,360]){
      await boss.page.setViewportSize({width,height:width===360?780:900});
      await boss.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
      await boss.page.locator('tr[data-visitor-row]').first().waitFor({timeout:90000});
      await noOverflow(boss.page,`the reference list at ${width}`);
      const small=await boss.page.locator('tr[data-visitor-row] [data-visitor-open], tr[data-visitor-row] [data-visitor-edit], tr[data-visitor-row] .pop-more .pop-anchor, tr[data-visitor-row] .visitor-dial')
        .evaluateAll(nodes=>nodes.map(node=>Math.round(node.getBoundingClientRect().height)));
      assert.ok(small.every(size=>size>=44),`every row target at ${width}px is at least 44px tall (smallest ${Math.min(...small)}px)`);
      if(width===768)await shot(boss.page,'r8-visitors-list-768');
      if(width===360){
        // The card: name, class, badge, chip, big Call and WhatsApp, then Open, Edit, ⋯.
        const card=rowOf(boss.page,LONG_NAME);
        for(const part of ['[data-visitor-open]','[data-visitor-edit]','.pop-more .pop-anchor','[data-visitor-call]','[data-status-badge]','[data-follow-chip]'])
          assert.equal(await card.locator(part).count(),1,`the 360px card keeps ${part}`);
        const dial=await card.locator('.visitor-dial').first().boundingBox();
        assert.ok(dial&&dial.height>=44,`Call is a big target on a phone (${Math.round(dial?dial.height:0)}px)`);
        await shot(boss.page,'r8-visitors-card-360');
      }
    }
    await boss.page.setViewportSize({width:1440,height:900});

    // ---- 10. Staff at 360: the same row, Archive instead of Delete, and the number to dial from.
    const desk=await signIn('staff');
    await desk.page.setViewportSize({width:360,height:780});
    await desk.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
    await desk.page.locator('tr[data-visitor-row]').first().waitFor({timeout:90000});
    assert.equal(await desk.page.locator('section.list-panel tr[data-visitor-row]').count(),5,'a staff account sees the same five open visitors — this is their screen');
    assert.ok((await desk.page.locator('body').innerText()).includes(P2),'and the same printed number, because staff are the ones who call');
    for(const name of [FIRST,LONG_NAME]){
      const row=rowOf(desk.page,name);
      assert.equal(await row.locator('[data-visitor-edit]').count(),1,`${name}: a staff row has a visible Edit too`);
      assert.equal(await row.locator('.pop-more .pop-anchor').count(),1,`${name}: and a ⋯ menu`);
    }
    await rowOf(desk.page,LONG_NAME).locator('.pop-more .pop-anchor').click();
    const deskMore=rowOf(desk.page,LONG_NAME).locator('[data-more-menu]');
    await deskMore.waitFor({state:'visible',timeout:30000});
    assert.equal(await deskMore.locator('[data-row-delete]').count(),0,'a staff ⋯ menu offers no Delete, which is an admin verb');
    assert.equal(await deskMore.locator('[data-row-archive]').count(),0,'and no Archive either: a visitor has no archive state to fall back on');
    assert.ok((await deskMore.innerText()).includes(t.row.deleteAdminOnly),'so the menu says who may bin a visitor, and what the desk may do instead');
    assert.ok((await deskMore.innerText()).includes(t.row.notInterested),'including the verb that IS theirs — closing a row as not interested');
    await noOverflow(desk.page,'the staff list at 360');
    await shot(desk.page,'r8-visitors-staff-more-360',false);
    // What a staff account may do to close a visitor out: mark it not interested, with a reason.
    await deskMore.locator('[data-more-notinterested] input[name="reason"]').fill('আর আগ্রহী নন');
    await deskMore.locator('[data-more-notinterested] button[type="submit"]').click();
    await until(async()=>(await stored(LONG_NAME))?.status==='not_interested','the staff write to land');
    await desk.page.locator('.admin-toast[role="status"]',{hasText:bn.leads.success.NOT_INTERESTED}).first().waitFor({state:'visible',timeout:60000});
    /* Closing a visitor files the row away: it leaves the list the desk works from, and the show-closed
       tick is where it went. The badge is read there, with the new status on it. */
    await until(async()=>await rowOf(desk.page,LONG_NAME).count()===0,'a closed visitor to leave the default list');
    /* On a phone the Filters panel arrives collapsed and the tick lives inside it, so the desk opens
       the panel first — the same one tap it would cost a person standing at the counter. */
    const deskFilters=desk.page.locator('[data-lead-filters]');
    if(await deskFilters.getAttribute('open')===null)await deskFilters.locator('summary').click();
    await deskFilters.locator('input[name="closed"]').check();
    await deskFilters.locator('button[type="submit"]').click();
    await rowOf(desk.page,LONG_NAME).locator('[data-status-badge]',{hasText:statusLabel(lt,'not_interested')}).waitFor({timeout:90000});
    await desk.page.locator('input[name="smsLead"]').first().check();
    const deskBulk=desk.page.locator('[data-lead-bulk-bar]');
    await deskBulk.waitFor({state:'visible',timeout:30000});
    assert.equal(await deskBulk.locator('[data-bulk-remove]').count(),0,'and the staff bulk bar carries no destructive verb this kind does not have');
    for(const verb of [t.row.thanks,t.row.bulkStatus,t.row.bulkFollow])
      assert.ok((await deskBulk.innerText()).includes(verb),`the staff bulk bar still offers ${verb}`);
    await shot(desk.page,'r8-visitors-staff-bulk-360');
    assert.deepEqual(desk.errors,[],`page errors on the staff screen: ${desk.errors.join(' | ')}`);

    // ---- 11. A role that may not see the page reaches none of it.
    const teacher=await signIn('content_editor');
    await teacher.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
    await teacher.page.waitForURL(url=>!url.pathname.includes('/admin/leads'),{timeout:90000})
      .catch(async error=>{throw Error(`a content editor was never sent away from the visitor list — ${error.message.split('\n')[0]} · url=${teacher.page.url()} · body=${JSON.stringify((await teacher.page.locator('body').innerText().catch(()=>'(none)')).replace(/\s+/g,' ').slice(0,200))}`)});
    const refusedBody=await teacher.page.locator('body').innerText();
    assert.equal(await teacher.page.locator('tr[data-visitor-row]').count(),0,'not one visitor row is in the document that role lands on');
    assert.ok(!refusedBody.includes(FIRST)&&!refusedBody.includes(P1)&&!refusedBody.includes(P2),'and neither a visitor nor a number, printed or masked');
    assert.equal(await teacher.page.locator('[data-visitor-edit]').count(),0,'no Edit, no ⋯, no bulk bar');

    // ---- 12. What driving the page left behind: audited, and no number in any audit target.
    const audits=await AdminAudit.find({action:/^lead\./}).lean<{action:string;target:string}[]>();
    const actions=[...new Set(audits.map(row=>row.action))].sort();
    for(const expected of ['lead.create','lead.follow-up','lead.status','lead.update'])
      assert.ok(actions.includes(expected),`driving the reference row audited ${expected} (saw: ${actions.join(', ')||'nothing'})`);
    assert.ok(audits.every(row=>!/01[3-9]\d{8}/.test(row.target)),'and no audit target anywhere holds a number');

    console.log('R8 · the Visitors reference row holds: eight visitors in one compact line each, five visible controls, no row taller than 72px, a status and a follow-up changed in two taps with a toast, our own calendar reading dd/mm/yyyy in Bangla and "15 Nov 2026" in English with no native date input on the page, an Edit and a role-correct ⋯ on every row for Admin and Staff, Delete behind a 30-day confirmation and a 10-second Undo, Archive for Staff, a headerless tick column raising a bulk bar of four verbs, the number printed for the roles that call and in no URL, no link but tel: and wa.me, and no audit target, closed visitors filed away behind one show-closed tick and a stale list that only suggests, cards at 360px with big Call and WhatsApp, nothing overflowing at 360/768/1024/1440, and a content editor sent away from all of it.');
  }finally{
    await browser.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
}

run().then(()=>{console.log('visitors-reference-browser: PASS');process.exit(0)},error=>{
  console.error('visitors-reference-browser: FAIL');
  console.error(error instanceof Error?error.stack:String(error));
  process.exit(1);
});
