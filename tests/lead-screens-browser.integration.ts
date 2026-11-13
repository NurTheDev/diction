/**
 * R3.8 in the browser: the Visitors screens — the five things the owner asked to see before approving
 * wave B, photographed at 360 px and 1440 px into screenshots/r3/, and asserted while they are driven.
 *
 *  1. the list: every fixture lead, its status, its follow-up day, its number as a mask, and the digits
 *     existing only inside the `tel:` and `wa.me` destinations — nowhere in the visible text and nowhere
 *     in the served HTML outside those two hrefs;
 *  2. quick-add opened with ONE tap on the mobile bottom bar, saved with Enter, reporting the id it
 *     wrote and clearing itself for the next visitor;
 *  3. the detail drawer: fields, the notes timeline, a note saved with an outcome, the family;
 *  4. the search box: four digits find both leads that share a number (typed in Bangla digits too),
 *     two digits are refused, a NAME travels as a URL parameter and a number never does;
 *  5. the Overview widget: today's follow-ups and the overdue count as two separate numbers, with the
 *     row controls that work the queue from there.
 *
 * Plus what a screen must not do: overflow horizontally at 360 px, show any of this to a teacher role,
 * print a family key (which is a number with a prefix on it), or put a digit in the address bar.
 *
 * Runs against an already-started app and its disposable database (TEST_ORIGIN + TEST_MONGO_URI), the
 * same way the other browser suites do. The UI is driven in Bangla, and the strings asserted are read
 * from `src/messages/bn.json` — the same catalogue the screens read, so a reworded button cannot make
 * this suite pass against a screen the owner would not recognise.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import type {Page} from 'playwright';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {AdminAudit} from '../src/models/AdminAudit';
import {Lead} from '../src/models/Lead';
import {createQuickLead,updateLeadStatus} from '../src/lib/leads/leads';
import {followUpLabel,statusLabel} from '../src/lib/leads/lead-ui';
import {maskPhone} from '../src/lib/leads/vocab';
import {dhakaDay} from '../src/lib/admin/today';
import {formatNumber} from '../src/lib/admin/format';
import bn from '../src/messages/bn.json';

const t=bn.leads;
const SHOTS=path.join('screenshots','r3');

const P1='01712817090',P2='01811223344',P3='01933445566',P4='01611998877';
const RAHUL='রাহুল আহমেদ',SISTER='রাহুলের বোন',OLD='পুরনো ভিজিটর',NO_PHONE='নাম্বারবিহীন ভিজিটর';
const BLOCKED='যোগাযোগ বন্ধ থাকা লিড',NEXT_WEEK='পরের সপ্তাহের ভিজিটর';
const TYPED='কুইক অ্যাডে লেখা ভিজিটর',TYPED_PHONE='01521445566';
const MASK_1=maskPhone(P1),MASK_2=maskPhone(P2);
const SECOND_NOTE='দ্বিতীয় কল — ভর্তি ফর্ম নিতে আসবেন';

const day=(offset:number):string=>dhakaDay(new Date(Date.now()+offset*86400000));
const today=day(0);

async function run(){
  await preflight({mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,test:'tests/lead-screens-browser.integration.ts — start the app first, then run it with TEST_ORIGIN and TEST_MONGO_URI'});
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

  // A clean slate for the collection these screens read, so the counts below are this suite's own and
  // not whatever an earlier suite left behind. Only leads and lead audit rows are touched: the running
  // app's own users and settings are somebody else's business.
  await Lead.deleteMany({});
  await AdminAudit.deleteMany({action:/^lead\./});
  await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});

  const password=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(password,12);
  const accounts={admin:'lead-boss@example.test',staff:'lead-desk@example.test',content_editor:'lead-teacher@example.test'};
  const names={admin:'লিড বস',staff:'ফ্রন্ট ডেস্ক',content_editor:'কনটেন্ট শিক্ষক'};
  for(const role of ['admin','staff','content_editor'] as const){
    await User.deleteOne({email:accounts[role]});
    await User.create({name:names[role],email:accounts[role],passwordHash:hash,role,active:true});
  }
  const bossId=String((await User.findOne({email:accounts.admin}).lean<{_id:unknown}>())!._id);

  // Seeded through the rule layer, not around it: what the screens read is what quick-add really writes.
  const rahul=await createQuickLead({studentName:RAHUL,guardianName:'করিম আহমেদ',phone:P1,classLabel:'XI',school:'ধানমন্ডি সরকারি বালক বিদ্যালয়',followUp:'today',note:'প্রথম কল — আগ্রহী'},bossId);
  assert.equal(rahul.ok,true,'the first fixture lead is written');
  const sister=await createQuickLead({studentName:SISTER,phone:P1,classLabel:'9',followUp:'today'},bossId);
  assert.equal(sister.ok,true,'the sibling is written');
  assert.equal(sister.ok&&sister.familyKey,rahul.ok&&rahul.familyKey,'and shares one family key with it');
  await createQuickLead({studentName:OLD,phone:P2,classLabel:'SSC 25',followUp:'custom',customDay:day(-3)},bossId);
  await createQuickLead({studentName:NO_PHONE,classLabel:'7',followUp:'today'},bossId);
  const blocked=await createQuickLead({studentName:BLOCKED,phone:P3,classLabel:'10'},bossId);
  if(blocked.ok)await updateLeadStatus(blocked.id,'do_not_contact',bossId);
  await createQuickLead({studentName:NEXT_WEEK,phone:P4,classLabel:'8',followUp:'next_week'},bossId);
  const oldRow=await Lead.findOne({studentName:OLD}).lean<{_id:unknown}>();
  if(oldRow)await updateLeadStatus(String(oldRow._id),'interested',bossId);
  assert.equal(await Lead.countDocuments(),6,'six fixture leads, and nothing else in the collection');

  const browser=await chromium.launch();
  const shot=(page:Page,name:string,fullPage=true)=>page.screenshot({path:path.join(SHOTS,`${name}.png`),fullPage});
  const noOverflow=async(page:Page,label:string)=>{
    const metrics=await page.evaluate(()=>({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));
    assert.ok(metrics.scrollWidth<=metrics.clientWidth+1,`${label}: nothing overflows horizontally at ${metrics.clientWidth}px (scrollWidth ${metrics.scrollWidth})`);
    return metrics;
  };
  /** A number may exist in the served HTML only as one of the two destinations the brief requires. */
  const onlyAsDestination=async(page:Page,number:string,label:string)=>{
    const html=await page.content();
    const stripped=html.split(`tel:+88${number.slice(1)}`).join('').split(`https://wa.me/88${number.slice(1)}`).join('');
    assert.ok(!stripped.includes(number),`${label}: ${number} appears nowhere in the served HTML outside its tel: and wa.me destinations`);
    assert.ok(html.includes(`tel:+88${number.slice(1)}`),`${label}: and the call destination it needs is there`);
  };
  const panel=(page:Page,heading:string)=>page.locator('section.admin-panel',{has:page.locator('h2',{hasText:heading})}).first();
  /**
   * The list's own rows, never the search panel's: after a search the page can hold two tables, and
   * counting rows across both would pass or fail on whichever one happened to render last.
   */
  const rows=(page:Page)=>page.locator('section.list-panel table.admin-table tbody tr');
  /**
   * Wait for a write to land in the database rather than for a sentence to appear on screen. A server
   * action revalidates the page it was called from, so a row that just changed can unmount before its
   * own feedback is ever painted — the database is the thing that has to be true.
   */
  const until=async(check:()=>Promise<boolean>,label:string,timeoutMs=90000)=>{
    const deadline=Date.now()+timeoutMs;
    for(;;){
      if(await check().catch(()=>false))return;
      if(Date.now()>deadline)throw Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
      await new Promise(resolve=>setTimeout(resolve,500));
    }
  };

  try{
    async function signIn(role:'admin'|'staff'|'content_editor',width=1440){
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
    const desk=await signIn('staff',360);
    await desk.page.setViewportSize({width:360,height:780});
    const list='/bn/admin/leads';

    // ---- 1. The list, at both widths, in the language the owner reads.
    await boss.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
    await boss.page.locator('h1',{hasText:t.title}).first().waitFor({timeout:60000});
    await rows(boss.page).first().waitFor({timeout:60000});
    const body=await boss.page.locator('body').innerText();
    for(const name of [RAHUL,SISTER,OLD,NO_PHONE,BLOCKED,NEXT_WEEK])assert.ok(body.includes(name),`the list shows ${name}`);
    assert.ok(body.includes(MASK_1),`a number is shown as its mask (${MASK_1})`);
    assert.ok(!body.includes(P1),'and the number itself is never printed');
    assert.ok(body.includes(statusLabel('new','bn')),'with its status');
    assert.ok(body.includes(statusLabel('do_not_contact','bn')),'including the do-not-contact one');
    assert.ok(body.includes(t.noPhone),'a lead with no number says so instead of leaving an empty cell');
    assert.ok(body.includes(t.lastNote),'the last note is on the row, so the queue can be read without opening anything');
    assert.ok(await boss.page.locator(`a[href="tel:+88${P1.slice(1)}"]`).count()>0,'the call destination is a real link');
    assert.ok(await boss.page.locator(`a[href="https://wa.me/88${P1.slice(1)}"]`).count()>0,'and so is WhatsApp');
    await onlyAsDestination(boss.page,P1,'the list');
    // The family key is the smallest number of a family with `fam:` in front of it, so a screen that
    // carried it would hand the browser a number that reads like an id.
    assert.ok(!(await boss.page.content()).includes(`fam:${P1}`),'no family key reaches the browser');
    const wide=await noOverflow(boss.page,'the list at 1440');
    assert.ok(wide.clientWidth>=1200,'the desktop viewport really is desktop width');
    await shot(boss.page,'b2-visitors-list-1440');

    await desk.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
    await desk.page.locator('h1',{hasText:t.title}).first().waitFor({timeout:60000});
    await rows(desk.page).first().waitFor({timeout:60000});
    await noOverflow(desk.page,'the list at 360');
    await shot(desk.page,'b2-visitors-list-360');
    assert.ok((await desk.page.locator('body').innerText()).includes(RAHUL),'a staff account sees the same list — this is their screen');

    // ---- 2. Quick-add: one tap on the mobile bottom bar, Enter saves.
    const quickAdd=desk.page.locator('nav.admin-bottom-nav a[href="/bn/admin/leads?new=1"]');
    await quickAdd.waitFor({state:'visible',timeout:60000});
    assert.equal(await desk.page.locator('nav.admin-bottom-nav a, nav.admin-bottom-nav button').count(),4,'the bottom bar still has exactly four targets');
    const box=await quickAdd.boundingBox();
    assert.ok(box&&box.height>=44,`the quick-add target is ${Math.round(box?box.height:0)}px tall — a thumb can hit it`);
    assert.equal((await quickAdd.innerText()).trim(),t.add,'and it is labelled "new visitor", not a bare plus');
    await quickAdd.click();
    const addPanel=panel(desk.page,t.addTitle);
    await addPanel.locator('h2',{hasText:t.addTitle}).waitFor({state:'visible',timeout:60000});
    await addPanel.locator('input[name="studentName"]').waitFor({state:'visible',timeout:30000});
    assert.equal(await addPanel.locator('input:not([type="hidden"]),select').count(),4,'four fields is a complete lead, and nothing else is in the way');
    await noOverflow(desk.page,'quick-add at 360');
    await shot(desk.page,'b2-quick-add-360');
    await addPanel.locator('button',{hasText:t.fields}).click();
    assert.ok(await addPanel.locator('input:not([type="hidden"]),select').count()>4,'the rest of the fields are one tap away, behind "more"');
    await addPanel.locator('button',{hasText:t.fields}).click();

    await addPanel.locator('input[name="studentName"]').fill(TYPED);
    await addPanel.locator('input[name="phone"]').fill(TYPED_PHONE);
    await addPanel.locator('input[name="classLabel"]').fill('XII');
    await addPanel.locator('input[name="school"]').fill('মিরপুর গার্লস স্কুল');
    await addPanel.locator('input[name="school"]').press('Enter');
    const saved=addPanel.locator('p.admin-feedback').first();
    await saved.waitFor({state:'visible',timeout:90000});
    const savedText=await saved.innerText();
    assert.match(savedText,/V-\d{4}-\d{4}/,`saving with Enter reports the id it wrote: ${savedText}`);
    assert.ok(savedText.includes('সংরক্ষিত'),'and says so in Bangla');
    await desk.page.locator('table.admin-table tbody tr',{hasText:TYPED}).first().waitFor({timeout:90000});
    assert.equal(await addPanel.locator('input[name="studentName"]').inputValue(),'','the panel cleared itself for the next visitor');
    assert.equal(await addPanel.locator('input[name="phone"]').inputValue(),'','including the number');
    assert.ok(!/\d{4,}/.test(new URL(desk.page.url()).search),`quick-add put no digits in the address bar: ${desk.page.url()}`);
    await shot(desk.page,'b2-quick-add-saved-360');
    const typedRow=await Lead.findOne({studentName:TYPED}).lean<{leadId:string;phones:{normalized:string}[];classGroup:number|null;status:string;group:string;medium:string}>();
    assert.ok(typedRow,'Enter really wrote the lead to the database');
    assert.equal(typedRow!.classGroup,12,'XII was read as class 12 on the way in');
    assert.equal(typedRow!.phones[0].normalized,TYPED_PHONE,'the number was normalized');
    assert.equal(typedRow!.status,'new','a status nobody chose stays New…');
    assert.equal(typedRow!.group,'unknown','…and a group nobody chose stays unknown rather than being guessed');
    assert.equal(typedRow!.medium,'unknown','as does the medium');

    // The same panel at desktop width, opened by the button above the list rather than the bottom bar.
    await boss.page.goto(`${origin}${list}?new=1`,{waitUntil:'domcontentloaded',timeout:180000});
    const wideAdd=panel(boss.page,t.addTitle);
    await wideAdd.locator('h2',{hasText:t.addTitle}).waitFor({state:'visible',timeout:60000});
    await noOverflow(boss.page,'quick-add at 1440');
    await shot(boss.page,'b2-quick-add-1440');
    await wideAdd.locator('button',{hasText:t.close}).click();
    await boss.page.locator('div.lead-tools button',{hasText:t.add}).first().waitFor({state:'visible',timeout:30000});

    // ---- 3. The detail drawer, with the notes timeline.
    const rahulRow=boss.page.locator('table.admin-table tbody tr',{hasText:RAHUL}).first();
    await rahulRow.locator('button',{hasText:t.detail}).first().click();
    const drawer=boss.page.locator('dialog.overview-drawer[open]');
    await drawer.waitFor({state:'visible',timeout:60000});
    await drawer.locator('h3',{hasText:t.notes}).waitFor({state:'visible',timeout:60000});
    await drawer.locator('ul.lead-notes li',{hasText:'প্রথম কল'}).first().waitFor({state:'visible',timeout:90000});
    const drawerText=await drawer.innerText();
    assert.ok(drawerText.includes(MASK_1),'the drawer masks the number too');
    assert.ok(!drawerText.includes(P1),'and never prints it');
    assert.ok(drawerText.includes(SISTER),'the family is listed, so a sibling is visible without searching for one');
    assert.ok(!drawerText.includes(t.noNotes),'the timeline shows the note quick-add wrote, not an empty state');
    await onlyAsDestination(boss.page,P1,'the drawer');
    await noOverflow(boss.page,'the drawer at 1440');
    await shot(boss.page,'b2-detail-drawer-1440',false);

    await drawer.locator('input[name="text"]').fill(SECOND_NOTE);
    await drawer.locator('select[name="outcome"]').selectOption('interested');
    await drawer.locator('button',{hasText:t.addNote}).click();
    await until(async()=>{const row=await Lead.findOne({studentName:RAHUL}).lean<{notes:unknown[]}>();return ((row&&row.notes)||[]).length===2},'the note to be written');
    await drawer.locator('ul.lead-notes li',{hasText:SECOND_NOTE}).first().waitFor({timeout:90000});
    const afterNote=await drawer.locator('ul.lead-notes:not(.lead-family)').innerText();
    assert.ok(afterNote.includes('আগ্রহী'),'the outcome is named beside the note');
    assert.ok(afterNote.includes(names.admin),'and so is whoever wrote it');
    const storedNotes=await Lead.findOne({studentName:RAHUL}).lean<{notes:{text:string;outcome:string}[]}>();
    assert.equal(storedNotes!.notes.length,2,'both notes are in the database');
    assert.equal(storedNotes!.notes[1].outcome,'interested');
    // A modal drawer left open puts its backdrop over everything else on the page, so the next click
    // would be intercepted by it rather than reaching the search button.
    await drawer.locator('header button').click();
    await drawer.waitFor({state:'detached',timeout:30000});

    await desk.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
    await desk.page.locator('table.admin-table tbody tr',{hasText:RAHUL}).first().locator('button',{hasText:t.detail}).first().click();
    const deskDrawer=desk.page.locator('dialog.overview-drawer[open]');
    await deskDrawer.locator('ul.lead-notes li').first().waitFor({state:'visible',timeout:90000});
    await noOverflow(desk.page,'the drawer at 360');
    await shot(desk.page,'b2-detail-drawer-360',false);
    await deskDrawer.locator('header button').click();
    await deskDrawer.waitFor({state:'detached',timeout:30000});

    // ---- 4. One search box: a number posts to an action, a name goes in the URL.
    const search=boss.page.locator(`section.admin-panel[aria-label="${t.search}"]`);
    /**
     * The panel's own submit button, named by the form it sits in. Every result row carries a drawer, and
     * a closed `<dialog>` is still in the DOM with its note form inside it — so "the submit button in this
     * panel" is three buttons once two hits have been rendered, and Playwright refuses to pick one.
     */
    const submitSearch=()=>search.locator('form.admin-panel-body button[type="submit"]');
    /**
     * What the search panel is showing right now, for the message a failed assertion leaves behind. A
     * timeout on its own says "an element never appeared"; this says what appeared instead.
     */
    const searchState=async()=>{
      const url=boss.page.url();
      const input=await search.locator('input[name="phone"]').inputValue().catch(()=>'(no input)');
      const feedback=await search.locator('p.admin-feedback').allInnerTexts().catch(()=>[]);
      const hitRows=await search.locator('table.admin-table tbody tr').count().catch(()=>-1);
      const panelText=(await search.innerText().catch(()=>'(panel gone)')).replace(/\s+/g,' ').slice(0,200);
      return `url=${url} · input=${JSON.stringify(input)} · feedback=${JSON.stringify(feedback)} · hitRows=${hitRows} · panel="${panelText}"`;
    };
    await boss.page.locator('div.lead-tools button',{hasText:t.search}).first().click();
    await search.locator('input[name="phone"]').waitFor({state:'visible',timeout:30000});
    await search.locator('input[name="phone"]').fill('7090');
    await submitSearch().click();
    const hits=search.locator('table.admin-table tbody tr');
    await hits.first().waitFor({state:'visible',timeout:90000})
      .catch(async error=>{throw Error(`four digits never drew a result row — ${error.message.split('\n')[0]} · ${await searchState()}`)});
    assert.equal(await hits.count(),2,'four digits off a crumpled sheet find both leads that share the number');
    // `first()`, never "the row with the name in it": the search sorts by date, and two leads written in
    // the same instant have no order this suite is allowed to depend on.
    const hitText=(await Promise.all([hits.nth(0).innerText(),hits.nth(1).innerText()])).join(' · ');
    assert.ok(hitText.includes(RAHUL),'the hit names the lead…');
    assert.ok(hitText.includes(MASK_1),'…and masks its number');
    assert.ok(!(await boss.page.locator('body').innerText()).includes('7090'),'not even the fragment that was typed is echoed back');
    assert.ok(!/\d{4,}/.test(new URL(boss.page.url()).search),`the search stayed out of the address bar: ${boss.page.url()}`);
    await onlyAsDestination(boss.page,P1,'the search results');
    await noOverflow(boss.page,'the search results at 1440');
    await shot(boss.page,'b2-number-search-1440');

    await search.locator('input[name="phone"]').fill('৭০৯০');
    await submitSearch().click();
    await search.locator('table.admin-table tbody tr').first().waitFor({state:'visible',timeout:90000})
      .catch(async error=>{throw Error(`Bangla digits never drew a result row — ${error.message.split('\n')[0]} · ${await searchState()}`)});
    assert.equal(await search.locator('table.admin-table tbody tr').count(),2,'Bangla digits find the same two leads');

    // Two digits is a number attempt and gets the number rule's own answer. It is NOT sent off as a word
    // search, because an empty list would read as "no such visitor" — a wrong and expensive answer at a
    // front desk — while the truth is "that is too short to look anybody up by".
    await search.locator('input[name="phone"]').fill('12');
    await submitSearch().click();
    await search.locator('p.admin-feedback.error').first().waitFor({state:'visible',timeout:90000})
      .catch(async error=>{throw Error(`two digits never drew the number rule's refusal — ${error.message.split('\n')[0]} · ${await searchState()}`)});
    assert.equal(await search.locator('table.admin-table tbody tr').count(),0,'two digits are refused rather than matched against everybody');
    assert.ok(!new URL(boss.page.url()).search.includes('q='),'and a number attempt never became a URL, not even a short one');
    const refusal=await search.locator('p.admin-feedback.error').first().innerText();
    assert.ok(refusal.includes(formatNumber(2,'bn'))&&refusal.includes(formatNumber(4,'bn')),
      `the refusal counts digits in Bangla (${refusal}) …`);
    assert.ok(!refusal.includes('12'),'…without quoting what was typed');

    await search.locator('input[name="phone"]').fill(OLD);
    await submitSearch().click();
    await boss.page.waitForURL(/q=/,{timeout:90000})
      .catch(async error=>{throw Error(`a name never became a shareable URL — ${error.message.split('\n')[0]} · ${await searchState()}`)});
    assert.equal(new URL(boss.page.url()).searchParams.get('q'),OLD,'a name DOES travel in the URL, so a filtered list can be shared between two admins');
    await boss.page.locator('table.admin-table tbody tr',{hasText:OLD}).first().waitFor({timeout:60000});
    assert.equal(await rows(boss.page).count(),1,'and it filters the list');

    // The same box at 360, with a number in it, for the owner's screenshot.
    await desk.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
    const deskSearch=desk.page.locator(`section.admin-panel[aria-label="${t.search}"]`);
    await desk.page.locator('div.lead-tools button',{hasText:t.search}).first().click();
    await deskSearch.locator('input[name="phone"]').waitFor({state:'visible',timeout:30000});
    await deskSearch.locator('input[name="phone"]').fill(P2.slice(-4));
    await deskSearch.locator('form.admin-panel-body button[type="submit"]').click();
    await deskSearch.locator('table.admin-table tbody tr').first().waitFor({state:'visible',timeout:90000})
      .catch(async error=>{throw Error(`the same search at 360 px never drew a result row — ${error.message.split('\n')[0]} · url=${desk.page.url()}`)});
    assert.ok((await deskSearch.innerText()).includes(MASK_2),'the number that was searched for comes back masked');
    await noOverflow(desk.page,'the search box at 360');
    await shot(desk.page,'b2-number-search-360');

    // ---- 5. A row's controls: status, the quick follow-up days, and lifting a contact block.
    await boss.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
    await boss.page.locator('table.admin-table tbody tr',{hasText:RAHUL}).first().waitFor({timeout:60000});
    const row=boss.page.locator('table.admin-table tbody tr',{hasText:RAHUL}).first();
    await row.locator('select[name="status"]').selectOption('called');
    await row.locator('form:has(select[name="status"]) button[type="submit"]').click();
    await until(async()=>(await Lead.findOne({studentName:RAHUL}).lean<{status:string}>())!.status==='called','the inline status dropdown to write');
    await row.locator('.admin-badge',{hasText:statusLabel('called','bn')}).first().waitFor({timeout:90000});
    assert.equal((await Lead.findOne({studentName:RAHUL}).lean<{status:string}>())!.status,'called','the inline dropdown really changed the status, and the row re-rendered with it');

    const followUpOf=async()=>(await Lead.findOne({studentName:RAHUL}).lean<{nextFollowUp:string|null}>())!.nextFollowUp;
    for(const [key,offset] of [['today',0],['tomorrow',1],['three_days',3],['next_week',7]] as [string,number][]){
      const label=followUpLabel(key as 'today','bn'),expected=day(offset);
      await row.locator('form:has(button[name="followUp"]) button',{hasText:label}).first().click();
      await until(async()=>(await followUpOf())===expected,`"${label}" to write ${expected}`);
      assert.equal(await followUpOf(),expected,`"${label}" writes ${expected} — a day in Dhaka, computed by the rule layer and never by the browser`);
    }
    await row.locator('form:has(button[name="followUp"]) button',{hasText:followUpLabel('clear','bn')}).first().click();
    await until(async()=>(await followUpOf())===null,'"clear" to take the promise away');
    assert.equal(await followUpOf(),null,'and "clear" leaves no follow-up behind');

    // A status chip is a real filter, and this is the last moment it can be proven: lifting the block
    // below moves this lead off the chip it is filtered by.
    await boss.page.goto(`${origin}${list}?status=do_not_contact`,{waitUntil:'domcontentloaded',timeout:180000});
    await boss.page.locator('table.admin-table tbody tr',{hasText:BLOCKED}).first().waitFor({timeout:60000});
    assert.equal(await rows(boss.page).count(),1,'the "do not contact" chip shows the one lead that is blocked');
    const blockedRow=boss.page.locator('table.admin-table tbody tr',{hasText:BLOCKED}).first();
    await blockedRow.locator('button',{hasText:t.allowContact}).first().click();
    // The row leaves this filtered list as soon as the page revalidates, so nothing here waits on it.
    await until(async()=>(await Lead.findOne({studentName:BLOCKED}).lean<{doNotContact:boolean}>())!.doNotContact===false,'the contact block to lift');
    const unblocked=await Lead.findOne({studentName:BLOCKED}).lean<{doNotContact:boolean;status:string}>();
    assert.equal(unblocked!.doNotContact,false,'lifting the block is its own deliberate button, and it works');
    assert.notEqual(unblocked!.status,'do_not_contact','…and it moves the status off "do not contact" with it');

    // ---- 6. The Overview widget: today's follow-ups, with overdue as its own number.
    await boss.page.goto(`${origin}/bn/admin`,{waitUntil:'domcontentloaded',timeout:180000});
    const widget=panel(boss.page,t.followUpsTitle);
    await widget.locator('h2',{hasText:t.followUpsTitle}).waitFor({state:'visible',timeout:60000});
    await widget.locator('table.admin-table tbody tr').first().waitFor({timeout:60000});
    const widgetText=await widget.innerText();
    assert.ok(widgetText.includes(t.todayBadge.replace('{n}',formatNumber(2,'bn'))),
      `today's count is its own number — SISTER and NO_PHONE are due, RAHUL was just cleared: ${widgetText.slice(0,90)}`);
    assert.ok(widgetText.includes(t.overdueBadge.replace('{n}',formatNumber(1,'bn'))),'and the overdue one is counted separately, never folded into today');
    assert.ok(widgetText.includes(SISTER)&&widgetText.includes(OLD),'the queue lists the lead due today and the promise whose day passed');
    assert.ok(!widgetText.includes(NEXT_WEEK),'a follow-up next week is not today’s work');
    assert.ok(widgetText.includes(MASK_1)&&widgetText.includes(MASK_2),'numbers are masked here too');
    assert.ok(!widgetText.includes(P2),'and never printed');
    await onlyAsDestination(boss.page,P2,'the Overview widget');
    await noOverflow(boss.page,'the Overview at 1440');
    await shot(boss.page,'b2-overview-follow-ups-1440');

    // Working the queue from the widget: one tap moves a lead to tomorrow and it leaves today's list.
    const widgetRow=widget.locator('table.admin-table tbody tr',{hasText:SISTER}).first();
    await widgetRow.locator('button',{hasText:followUpLabel('tomorrow','bn')}).first().click();
    // The row leaves the widget as soon as the page revalidates, so its own feedback may never be
    // painted — what has to be true is the day it wrote.
    await until(async()=>(await Lead.findOne({studentName:SISTER}).lean<{nextFollowUp:string|null}>())!.nextFollowUp===day(1),'the widget’s Tomorrow button to write');
    await boss.page.reload({waitUntil:'domcontentloaded',timeout:180000});
    await panel(boss.page,t.followUpsTitle).locator('h2',{hasText:t.followUpsTitle}).waitFor({state:'visible',timeout:60000});
    const afterMove=await panel(boss.page,t.followUpsTitle).innerText();
    assert.ok(!afterMove.includes(SISTER),'and the lead promised for tomorrow is no longer in today’s queue');
    assert.ok(afterMove.includes(t.todayBadge.replace('{n}',formatNumber(1,'bn'))),'so the count moved with it');

    // The Overview is the admin home; a staff account is turned away there, so the 360 shot of the same
    // widget comes from an admin context rather than pretending the staff home is the same screen.
    const mobile=await signIn('admin',360);
    await mobile.page.setViewportSize({width:360,height:780});
    await mobile.page.goto(`${origin}/bn/admin`,{waitUntil:'domcontentloaded',timeout:180000});
    await panel(mobile.page,t.followUpsTitle).locator('h2',{hasText:t.followUpsTitle}).waitFor({state:'visible',timeout:60000});
    await noOverflow(mobile.page,'the Overview at 360');
    await shot(mobile.page,'b2-overview-follow-ups-360');
    assert.deepEqual(mobile.errors,[],`page errors on the mobile Overview: ${mobile.errors.join(' | ')}`);

    // ---- 7. The queue the sidebar's second item opens, the chips, and a number typed into the URL.
    await boss.page.goto(`${origin}${list}?followUp=overdue`,{waitUntil:'domcontentloaded',timeout:180000});
    await boss.page.locator('table.admin-table tbody tr',{hasText:OLD}).first().waitFor({timeout:60000});
    assert.equal(await rows(boss.page).count(),1,'the overdue filter shows the one lead whose day has passed');
    await boss.page.goto(`${origin}${list}?status=interested`,{waitUntil:'domcontentloaded',timeout:180000});
    await boss.page.locator('table.admin-table tbody tr',{hasText:OLD}).first().waitFor({timeout:60000});
    assert.equal(await rows(boss.page).count(),1,'and a second chip filters the same way — one interested lead, and only it');
    await boss.page.goto(`${origin}${list}?q=${P1}`,{waitUntil:'domcontentloaded',timeout:180000});
    await boss.page.locator('h1',{hasText:t.title}).first().waitFor({timeout:60000});
    await boss.page.locator('p.admin-feedback.error').first().waitFor({state:'visible',timeout:60000});
    assert.equal(await rows(boss.page).count(),7,'a number typed straight into the address bar is refused as a search, so the whole list is rendered instead of being quietly searched by number');
    assert.ok((await boss.page.locator('p.admin-feedback.error').first().innerText()).length>10,'and the page says why');

    // ---- 8. A teacher role reaches none of it.
    const teacher=await signIn('content_editor');
    await teacher.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
    // The guard throws before a single lead is read, and the admin error boundary is what a refused role
    // sees — waited for as an element rather than slept on, because the shell streams in first.
    await teacher.page.locator('h2',{hasText:bn.admin.pageUnavailable}).first().waitFor({timeout:60000});
    const teacherBody=await teacher.page.locator('body').innerText();
    assert.ok(!teacherBody.includes(RAHUL)&&!teacherBody.includes(MASK_1),'a content editor sees no visitor and no number');
    assert.ok(teacherBody.includes(bn.admin.pageUnavailable),`the screen is refused outright rather than half-rendered (the page said: ${teacherBody.slice(0,120)})`);
    assert.equal(await teacher.page.locator('nav.admin-nav a[href*="/admin/leads"]').count(),0,'the sidebar has no Visitors item for that role');
    assert.equal(await teacher.page.locator('input[name="studentName"]').count(),0,'and there is no quick-add form');

    // ---- 9. What driving the screens left in the audit log.
    const audits=await AdminAudit.find({action:/^lead\./}).lean<{action:string;target:string}[]>();
    const actions=[...new Set(audits.map(row=>row.action))].sort();
    for(const expected of ['lead.create','lead.follow-up','lead.note','lead.phone-search','lead.status']){
      assert.ok(actions.includes(expected),`driving the screens audited ${expected} (saw: ${actions.join(', ')||'nothing'})`);
    }
    assert.ok(audits.every(row=>!/01[3-9]\d{8}/.test(row.target)),'and no audit target anywhere holds a number');

    assert.deepEqual(boss.errors,[],`page errors as admin: ${boss.errors.join(' | ')}`);
    assert.deepEqual(desk.errors,[],`page errors as staff: ${desk.errors.join(' | ')}`);
    await boss.context.close();
    await desk.context.close();
    await mobile.context.close();
    await teacher.context.close();
  }finally{
    await browser.close();
    await mongoose.disconnect();
    await mongo.stop();
  }

  console.log('Visitor screens: the list shows every lead with its status, its follow-up day and its number masked, the digits living only in the tel: and wa.me destinations and in nothing else the browser is served, and no family key reaching it at all; quick-add is one labelled tap on the mobile bottom bar, four fields with the rest behind "more", saves on Enter, reports the id it wrote, reads XII as class 12 and leaves status, group and medium un-guessed; the drawer loads the notes timeline, saves a note with an outcome and its writer’s name, and lists the family; one search box sends four digits — typed in Bangla too — to a server action that finds both leads sharing a number and refuses two digits in Bangla that counts them without quoting them and without turning them into a word search, while a name travels as a shareable URL parameter and a number typed into the address bar is refused; the row controls change a status, write each of the four quick follow-up days in Dhaka, clear one again and lift a contact block deliberately; the Overview counts today’s follow-ups and the overdue ones separately, works the queue from there and moves the count with it; a content editor reaches none of it; nothing overflows horizontally at 360 px; every screen audited what it did with masked targets; and all five screens are photographed at 360 px and 1440 px in screenshots/r3.');
}

run().catch(error=>{console.error(error);process.exit(1)});
