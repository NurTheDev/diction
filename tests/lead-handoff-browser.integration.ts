/**
 * R3.13 in the browser: the three hand-offs a visitor row owes — convert to admission, book a trial,
 * and close it as "not interested" — driven in Bangla at 360 px and 1440 px and photographed at both,
 * because a hand-off form is a new screen and the owner reads it on a phone at the desk.
 *
 * What is asserted while it is driven:
 *
 *  1. the admission form is PREFILLED with what the lead already holds — name, guardian, school, class
 *     — and the number is a mask in a read-only box, so no digit of it exists in the dialog the browser
 *     was served;
 *  2. writing it makes one admission whose reference is the intake screen's own ADM shape, moves the
 *     lead to "admitted", reports the reference back to the operator, and switches that hand-off off
 *     with the reason on screen, so it cannot be done twice;
 *  3. the trial dialog asks for its slots when it opens and offers only a class that is switched on,
 *     still ahead and not full — saying what is left on it — and booking one takes the seat;
 *  4. "not interested" will not close a row without a reason: two characters cannot be filed, one tap
 *     on a chip writes a reason that means something, and the reason lands in the drawer's own
 *     timeline tagged with why;
 *  5. nothing overflows horizontally at 360 px, and no family key reaches the browser.
 *
 * Runs against an already-started app and its disposable database (TEST_ORIGIN + TEST_MONGO_URI), the
 * same way the other browser suites do. The strings asserted are read from `src/messages/bn.json` — the
 * catalogue the screens read — so a reworded button cannot make this suite pass against a screen the
 * owner would not recognise.
 */
// @ts-nocheck -- a browser suite: Playwright, the running app and a disposable database, driven end to end.
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
import {Admission,Slot,TrialBooking} from '../src/models/Intake';
import {createQuickLead} from '../src/lib/leads/leads';
import {maskPhone} from '../src/lib/leads/vocab';
import bn from '../src/messages/bn.json';

const t=bn.leads;
const SHOTS=path.join('screenshots','r3');

const H_ADM='হ্যান্ড-অফ ভর্তি ভিজিটর',H_TRIAL='হ্যান্ড-অফ ট্রায়াল ভিজিটর',H_CLOSED='হ্যান্ড-অফ আগ্রহহীন ভিজিটর';
const PH1='01744556677',PH2='01844556677',PH3='01944556677';
const GUARDIAN='হ্যান্ড-অফ অভিভাবক',SCHOOL='হ্যান্ড-অফ স্কুল';
const REASON='অন্য কোচিংয়ে ভর্তি হয়ে গেছে';

async function run(){
  await preflight({mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,test:'tests/lead-handoff-browser.integration.ts — start the app first, then run it with TEST_ORIGIN and TEST_MONGO_URI'});
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

  // This suite's own slate: the three fixtures, the intake rows a hand-off can make, and the classes a
  // trial can be booked into. Nothing else in the running app's database is touched.
  await Lead.deleteMany({studentName:{$in:[H_ADM,H_TRIAL,H_CLOSED]}});
  await Admission.deleteMany({phone:{$in:[PH1,PH2,PH3]}});
  await TrialBooking.deleteMany({phone:{$in:[PH1,PH2,PH3]}});
  await Slot.deleteMany({grade:'9',subject:'bangla'});
  await AdminAudit.deleteMany({action:/^lead\./});
  await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});

  const password=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(password,12);
  const accounts={admin:'handoff-boss@example.test',staff:'handoff-desk@example.test'};
  for(const role of ['admin','staff'] as const){
    await User.deleteOne({email:accounts[role]});
    await User.create({name:role==='admin'?'হ্যান্ড-অফ বস':'হ্যান্ড-অফ ডেস্ক',email:accounts[role],passwordHash:hash,role,active:true});
  }
  const bossId=String((await User.findOne({email:accounts.admin}).lean<{_id:unknown}>())!._id);

  const admLead=await createQuickLead({studentName:H_ADM,guardianName:GUARDIAN,phone:PH1,classLabel:'9',school:SCHOOL},bossId);
  const trialLead=await createQuickLead({studentName:H_TRIAL,guardianName:'ট্রায়াল অভিভাবক',phone:PH2,classLabel:'9'},bossId);
  const closedLead=await createQuickLead({studentName:H_CLOSED,phone:PH3,classLabel:'10'},bossId);
  assert.ok(admLead.ok&&trialLead.ok&&closedLead.ok,'the three hand-off fixtures are written');

  // One class with two seats and one that is already full: the dialog may offer the first and must not
  // offer the second, and both are grade 9 Bangla so the lead's own class finds them.
  const slotStart=new Date(Date.now()+3*86400000);slotStart.setMinutes(0,0,0);
  const slot=await Slot.create({grade:'9',subject:'bangla',startAt:slotStart,endAt:new Date(slotStart.getTime()+3600000),capacity:2,booked:0,enabled:true});
  const fullStart=new Date(slotStart.getTime()+7200000);
  await Slot.create({grade:'9',subject:'bangla',startAt:fullStart,endAt:new Date(fullStart.getTime()+3600000),capacity:1,booked:1,enabled:true});

  const browser=await chromium.launch();
  const shot=(page:Page,name:string,fullPage=true)=>page.screenshot({path:path.join(SHOTS,`${name}.png`),fullPage});
  const noOverflow=async(page:Page,label:string)=>{
    const metrics=await page.evaluate(()=>({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));
    assert.ok(metrics.scrollWidth<=metrics.clientWidth+1,`${label}: nothing overflows horizontally at ${metrics.clientWidth}px (scrollWidth ${metrics.scrollWidth})`);
  };
  const rows=(page:Page)=>page.locator('section.list-panel table.admin-table tbody tr');
  /** Wait for the write to land rather than for a sentence to be painted: a revalidate can unmount it. */
  const until=async(check:()=>Promise<boolean>,label:string,timeoutMs=120000)=>{
    const deadline=Date.now()+timeoutMs;
    for(;;){
      if(await check().catch(()=>false))return;
      if(Date.now()>deadline)throw Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
      await new Promise(resolve=>setTimeout(resolve,500));
    }
  };

  try{
    async function signIn(role:'admin'|'staff'){
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
        notes.push(`attempt ${attempt}: callback ${callback?callback.status():'error'}, session ${JSON.stringify(session).slice(0,80)}`);
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
    const desk=await signIn('staff');
    await desk.page.setViewportSize({width:360,height:780});
    const list='/bn/admin/leads';

    const openDrawer=async(page:Page,name:string)=>{
      await page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
      await page.locator('h1',{hasText:t.title}).first().waitFor({timeout:60000});
      await rows(page).filter({hasText:name}).first().waitFor({timeout:90000});
      await rows(page).filter({hasText:name}).first().locator('button',{hasText:t.detail}).first().click();
      const drawer=page.locator('dialog.overview-drawer[open]');
      await drawer.waitFor({state:'visible',timeout:60000});
      // The strip arrives with the detail, so waiting for it is waiting for what the row really holds.
      await drawer.locator('[data-lead-handoff]').waitFor({state:'visible',timeout:90000});
      return drawer;
    };
    const openHandoff=async(page:Page,drawer:Locator,kind:'admission'|'trial'|'not-interested')=>{
      await drawer.locator(`[data-handoff-open="${kind}"]`).click();
      const dialog=page.locator(`dialog.lead-handoff-dialog[data-handoff-dialog="${kind}"]`);
      await dialog.waitFor({state:'visible',timeout:60000});
      return dialog;
    };
    const privateDialog=async(dialog:Locator,number:string,label:string)=>{
      const html=await dialog.innerHTML();
      assert.ok(!html.includes(number),`${label}: the dialog carries no digit of the visitor's number`);
      assert.ok(!html.includes('fam:'),`${label}: and no family key either`);
      assert.ok(html.includes(maskPhone(number)),`${label}: what it shows instead is the mask`);
    };

    // ---- 1. The admission form at 360 px: prefilled from the lead, number masked, nothing overflowing.
    let drawer=await openDrawer(desk.page,H_ADM);
    let dialog=await openHandoff(desk.page,drawer,'admission');
    assert.equal(await dialog.locator('input[name="studentName"]').inputValue(),H_ADM,'the visitor\u2019s own name is already there');
    assert.equal(await dialog.locator('input[name="guardianName"]').inputValue(),GUARDIAN,'and so is the guardian');
    assert.equal(await dialog.locator('input[name="school"]').inputValue(),SCHOOL,'and the school');
    assert.equal(await dialog.locator('[data-handoff-grade]').inputValue(),'9','and the class the lead was written with');
    assert.equal(await dialog.locator('[data-handoff-phone-mask]').inputValue(),maskPhone(PH1),'while the number is only its mask');
    // A missing catalogue key paints its own path instead of a word, and an operator cannot click a
    // key path. Every label on a hand-off screen has to come from the catalogue the screen reads.
    const admissionText=await dialog.innerText();
    assert.ok(admissionText.includes(t.handoffPhoneMask),'the mask is labelled in the operator\u2019s own words');
    assert.ok(!admissionText.includes('leads.'),'and no untranslated key path is painted on the form');
    await privateDialog(dialog,PH1,'the admission form at 360');
    await noOverflow(desk.page,'the admission hand-off at 360');
    await shot(desk.page,'b3-handoff-admission-360',false);
    await dialog.locator('[data-handoff-close]').click();
    await dialog.waitFor({state:'hidden',timeout:60000});

    // ---- 2. The same form at 1440 px, filled in and written: one admission, and the lead moves with it.
    drawer=await openDrawer(boss.page,H_ADM);
    dialog=await openHandoff(boss.page,drawer,'admission');
    await dialog.locator('[data-handoff-dob]').fill('2011-04-09');
    await dialog.locator('[data-handoff-subjects] input[value="bangla"]').check();
    await privateDialog(dialog,PH1,'the admission form at 1440');
    await shot(boss.page,'b3-handoff-admission-1440',false);
    await dialog.locator('[data-handoff-submit]').click();
    await until(async()=>(await Admission.countDocuments({phone:PH1}))===1,'the admission the hand-off wrote is in the collection');
    const admissionRow=await Admission.findOne({phone:PH1}).lean();
    assert.match(admissionRow.reference,/^ADM-\d{4}-[A-F\d]{12}$/,'carrying the intake screen\u2019s own reference shape');
    assert.equal(admissionRow.studentName,H_ADM,'with the name the operator saw');
    assert.equal(admissionRow.guardianName,GUARDIAN,'the guardian the lead held');
    assert.equal(admissionRow.grade,'9','the class it was prefilled with');
    assert.equal(admissionRow.status,'pending','a hand-off opens an application; it does not decide it');
    assert.equal((await Lead.findById(admLead.id).lean()).status,'admitted','and the lead moved to the status the vocabulary has');
    await until(async()=>(await dialog.locator('[data-handoff-message]').innerText().catch(()=>'')).includes(admissionRow.reference),
      'the dialog reports the reference it made');
    // Done means off: the same hand-off cannot be opened a second time, and the strip says why.
    await dialog.locator('[data-handoff-close]').click();
    await until(async()=>await drawer.locator('[data-handoff-open="admission"]').isDisabled().catch(()=>false),
      'the strip switches the admission hand-off off once it is done');
    assert.ok(await drawer.locator('[data-handoff-blocked]').isVisible(),'and says what closed it');
    await shot(boss.page,'b3-handoff-blocked-1440',false);

    // ---- 3. The trial dialog at 1440 px: only a class with a seat left, still ahead, is offered.
    drawer=await openDrawer(boss.page,H_TRIAL);
    dialog=await openHandoff(boss.page,drawer,'trial');
    await dialog.locator('[data-handoff-slot]').first().waitFor({timeout:90000});
    assert.equal(await dialog.locator('[data-handoff-slot]').count(),1,'the full class is not offered, only the one with a seat');
    assert.ok((await dialog.locator('[data-handoff-slots]').innerText()).includes(t.handoffSeats),'and it says what is left on it');
    const trialText=await dialog.innerText();
    assert.ok(trialText.includes(t.handoffGrade),'the grade select is labelled in the operator\u2019s own words');
    assert.ok(!trialText.includes('leads.'),'and no untranslated key path is painted on the form');
    await privateDialog(dialog,PH2,'the trial form at 1440');
    await shot(boss.page,'b3-handoff-trial-1440',false);
    await dialog.locator('[data-handoff-close]').click();
    await dialog.waitFor({state:'hidden',timeout:60000});

    // ---- 4. And booked from the phone at 360 px: the seat goes with it and the lead moves.
    drawer=await openDrawer(desk.page,H_TRIAL);
    dialog=await openHandoff(desk.page,drawer,'trial');
    await dialog.locator('[data-handoff-slot]').first().waitFor({timeout:90000});
    await privateDialog(dialog,PH2,'the trial form at 360');
    await noOverflow(desk.page,'the trial hand-off at 360');
    await shot(desk.page,'b3-handoff-trial-360',false);
    await dialog.locator('[data-handoff-submit]').click();
    await until(async()=>(await TrialBooking.countDocuments({phone:PH2}))===1,'the trial the hand-off booked is in the collection');
    const bookingRow=await TrialBooking.findOne({phone:PH2}).lean();
    assert.match(bookingRow.reference,/^TRI-\d{4}-[A-F\d]{12}$/,'with a reference of its own shape');
    assert.equal(String(bookingRow.slot),String(slot._id),'against the class the operator picked');
    assert.equal(bookingRow.status,'booked');
    assert.equal((await Slot.findById(String(slot._id)).lean()).booked,1,'and the seat went with it');
    assert.equal((await Lead.findById(trialLead.id).lean()).status,'trial_booked','as the lead\u2019s own status');

    // ---- 5. Not interested at 1440 px: no reason, no close — and the reason lands in the timeline.
    drawer=await openDrawer(boss.page,H_CLOSED);
    dialog=await openHandoff(boss.page,drawer,'not-interested');
    const reasonText=await dialog.innerText();
    assert.ok(reasonText.includes(t.handoffReason)&&!reasonText.includes('leads.'),'the reason box is labelled in the operator\u2019s own words, not as a key path');
    await dialog.locator('[data-handoff-reason]').fill('না');
    assert.ok(await dialog.locator('[data-handoff-submit]').isDisabled(),'a reason of two characters cannot be filed');
    await dialog.locator('[data-handoff-reason]').fill(REASON);
    assert.ok(await dialog.locator('[data-handoff-submit]').isEnabled(),'a reason that says something can');
    await shot(boss.page,'b3-handoff-reason-1440',false);
    await dialog.locator('[data-handoff-submit]').click();
    await until(async()=>(await Lead.findById(closedLead.id).lean()).status==='not_interested','the row closed');
    const closedRow=await Lead.findById(closedLead.id).lean();
    assert.equal(closedRow.notes.length,1,'with exactly one note behind it');
    assert.equal(closedRow.notes[0].text,REASON,'which is the reason the operator wrote, word for word');
    assert.equal(closedRow.notes[0].outcome,'not_interested','tagged so the timeline can say why it closed');
    await until(async()=>(await drawer.locator('.lead-notes').innerText().catch(()=>'')).includes(REASON),
      'the reason is readable in the drawer\u2019s own timeline');
    assert.equal((await AdminAudit.findOne({action:'lead.not_interested'}).lean()).target,closedRow.leadId,
      'and the audit names the readable id, not a number');

    // ---- 6. The same dialog on the phone, and a number that never leaves its two destinations.
    drawer=await openDrawer(desk.page,H_CLOSED);
    dialog=await openHandoff(desk.page,drawer,'not-interested');
    await dialog.locator('[data-handoff-chip]').first().click();
    assert.ok((await dialog.locator('[data-handoff-reason]').inputValue()).length>3,'one tap on a chip writes a reason that means something');
    await noOverflow(desk.page,'the reason hand-off at 360');
    await shot(desk.page,'b3-handoff-reason-360',false);
    await dialog.locator('[data-handoff-close]').click();
    await dialog.waitFor({state:'hidden',timeout:60000});
    const pageHtml=await desk.page.content();
    assert.ok(!pageHtml.replace(new RegExp(`tel:\\+88${PH1.slice(1)}`,'g'),'').replace(new RegExp(`https://wa.me/88${PH1.slice(1)}`,'g'),'').includes(PH1),
      'after all three hand-offs the converted visitor\u2019s number still exists only as a call or WhatsApp destination');
    assert.ok(!pageHtml.includes(`fam:${PH1}`),'and no family key reached the browser at any point');

    assert.deepEqual(boss.errors,[],`page errors as admin: ${boss.errors.join(' | ')}`);
    assert.deepEqual(desk.errors,[],`page errors as staff: ${desk.errors.join(' | ')}`);
    await boss.context.close();
    await desk.context.close();
  }finally{
    await browser.close();
    await mongoose.disconnect();
    await mongo.stop();
  }

  console.log('Lead hand-offs in the browser: the Visitors drawer opens three hand-offs, and each one is photographed at 360 px and 1440 px. The admission form arrives prefilled with the name, guardian, school and class the lead already holds and shows the number only as its mask in a read-only box, so no digit of it and no family key exists in the dialog the browser was served; writing it makes one admission carrying the intake screen\u2019s own ADM reference, opens it as pending rather than deciding it, moves the lead to admitted, reports the reference back to the operator and switches that hand-off off with the reason on screen so it cannot be done twice. The trial dialog asks for its classes when it opens and offers only the one that is switched on, still ahead and has a seat left — a full class is not in the list at all — and booking it writes a TRI reference, takes the seat off the class and moves the lead to trial_booked. "Not interested" refuses to close a row without a reason: two characters leave the save button off, one tap on a chip writes a reason that means something, and a real reason moves the status, files itself word for word as a note tagged not_interested, reads back in the drawer\u2019s own timeline and audits the readable id. Nothing overflows horizontally at 360 px, a staff account drives all three, and after every hand-off the visitor\u2019s number still exists in the served HTML only as its tel: and wa.me destinations.');
}

run().catch(error=>{console.error(error);process.exit(1)});
