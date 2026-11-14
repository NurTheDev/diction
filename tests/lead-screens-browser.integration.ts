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
import {createQuickLead,followUpBoard,updateLeadStatus} from '../src/lib/leads/leads';
import {CenterSettings,CenterSmsLog,CenterSmsTemplate} from '../src/models/CenterRecords';
import {defaultTemplate} from '../src/lib/center/sms-templates';
import {followUpLabel,statusLabel} from '../src/lib/leads/lead-ui';
import {maskPhone} from '../src/lib/leads/vocab';
import {dhakaDay} from '../src/lib/admin/today';
import {formatNumber} from '../src/lib/admin/format';
import bn from '../src/messages/bn.json';

const t=bn.leads;
/** Resolve a nested leads key the way next-intl does, so the label helpers can be exercised here. */
const lt=(key:string):string=>key.split('.').reduce((node:unknown,part:string)=>(node as Record<string,unknown>)?.[part],bn.leads as unknown) as string;
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
  const sister=await createQuickLead({studentName:SISTER,phone:P1,classLabel:'9',followUp:'today',dupChoice:'sibling'},bossId);
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

  /** Every value the search box had to be given twice, kept because a refill is a fact worth reporting. */
  const refills:string[]=[];
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
    assert.ok(body.includes(statusLabel(lt,'new')),'with its status');
    assert.ok(body.includes(statusLabel(lt,'do_not_contact')),'including the do-not-contact one');
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
    const searchInput=()=>search.locator('input[name="phone"]');
    /**
     * What the search panel is showing right now, for the message a failed assertion leaves behind. A
     * timeout on its own says "an element never appeared"; this says what appeared instead. The panel is
     * counted rather than assumed, because a locator that matches no panel and one that matches two both
     * throw and those are opposite facts — `miniButtons` is the closed panel's own button, and `tools`
     * and `body` say whether the panel folded away or the whole page fell over to the error boundary.
     */
    const searchState=async(label:string)=>{
      const url=boss.page.url();
      const panels=await search.count();
      const mini=await boss.page.locator('div.lead-tools button.admin-mini-button',{hasText:t.search}).count();
      const input=await searchInput().first().inputValue().catch(()=>'(no input)');
      const disabled=await submitSearch().first().isDisabled().catch(()=>'(no button)');
      const feedback=await boss.page.locator('p.admin-feedback').allInnerTexts().catch(()=>[]);
      const hitRows=await search.locator('table.admin-table tbody tr').count().catch(()=>-1);
      const tools=(await boss.page.locator('div.lead-tools').first().innerText().catch(()=>'(no tools)')).replace(/\s+/g,' ').slice(0,140);
      const body=(await boss.page.locator('body').innerText().catch(()=>'(no body)')).replace(/\s+/g,' ').slice(0,180);
      return `${label} · url=${url} · panels=${panels} · miniButtons=${mini} · input=${JSON.stringify(input)} · submitDisabled=${disabled} · feedback=${JSON.stringify(feedback)} · hitRows=${hitRows} · refills=${JSON.stringify(refills)} · tools="${tools}" · body="${body}"`;
    };
    /**
     * Whether the search panel has finished with a submit, read in the browser and scoped to the panel by
     * its own label: the quick-add panel sits next to it with a form of the same shape, and document
     * order would pick that one up first.
     *
     * `ready` is the button coming back — a React form action disables it while the action is in flight.
     * `found` and `refused` read the answer itself, and they read it together with two marks of the
     * commit that carried it: the button enabled again, and the box cleared, because React resets a form
     * when its action commits (`recursivelyResetForms` → `form.reset()`). Without those, "a row is
     * visible" is satisfied instantly by the rows of the PREVIOUS search — still on screen, still two of
     * them — and proves nothing about the search just submitted. That false green is what let the Bangla
     * digits step pass on the four digits step's results while the step after it raced the same commit.
     */
    const searchSettled=(want:'ready'|'found'|'refused')=>boss.page.waitForFunction(({label,ask})=>{
      const panel=document.querySelector(`section.admin-panel[aria-label="${label}"]`);
      if(!panel)return false;
      const form=panel.querySelector('form.admin-panel-body');
      if(!form)return false;
      const button=form.querySelector('button[type="submit"]') as HTMLButtonElement|null;
      if(!button||button.disabled)return false;
      if(ask==='ready')return true;
      const input=form.querySelector('input[name="phone"]') as HTMLInputElement|null;
      if(!input||input.value!=='')return false; // the commit that answered also cleared the box
      const rows=panel.querySelectorAll('table.admin-table tbody tr').length;
      return ask==='found'?rows>0:!!form.querySelector('p.admin-feedback')&&rows===0;
    },{label:t.search,ask:want},{timeout:90000});
    /**
     * One number search, from a settled box to its answer.
     *
     * React resets a form when its action commits — `recursivelyResetForms` calls `form.reset()` in the
     * commit that carries the answer — so the search that just finished empties the box, and the submit
     * button stays disabled until that commit lands. A Playwright click waits for the button to come
     * back, so a value typed while an earlier search is still in flight is wiped before the click ever
     * happens: the box arrives empty, an empty box is a word search, and a word search with nothing typed
     * has nowhere to go — the panel folded away and no answer was left to wait for. That is what the two
     * digits step timed out on while the four digit steps beside it passed. So this waits for the button
     * first, types, and then confirms the box still holds the value it is about to submit.
     */
    const searchNumber=async(value:string,want:'found'|'refused')=>{
      await searchSettled('ready')
        .catch(async error=>{throw Error(`the search box never came back before ${JSON.stringify(value)} — ${error.message.split('\n')[0]} · ${await searchState(`the box should have been ready for ${value}`)}`)});
      await searchInput().fill(value);
      if(await searchInput().inputValue()!==value){refills.push(value);await searchInput().fill(value);}
      assert.equal(await searchInput().inputValue(),value,`the box holds ${JSON.stringify(value)} at the moment it is submitted`);
      await submitSearch().click();
      await searchSettled(want)
        .catch(async error=>{throw Error(`a search for ${JSON.stringify(value)} never answered — ${error.message.split('\n')[0]} · ${await searchState(`a search for ${value} should have been answered`)}`)});
    };
    // The panel's own button when it is closed; when it is already open there is nothing to click, and
    // clicking by text alone would land on the submit button inside it and search for nothing.
    const openSearch=boss.page.locator('div.lead-tools button.admin-mini-button',{hasText:t.search});
    if(await openSearch.count()>0)await openSearch.first().click();
    await searchInput().waitFor({state:'visible',timeout:30000});
    await searchNumber('7090','found');
    const hits=search.locator('table.admin-table tbody tr');
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

    await searchNumber('৭০৯০','found');
    assert.equal(await search.locator('table.admin-table tbody tr').count(),2,'Bangla digits find the same two leads');

    // Two digits is a number attempt and gets the number rule's own answer. It is NOT sent off as a word
    // search, because an empty list would read as "no such visitor" — a wrong and expensive answer at a
    // front desk — while the truth is "that is too short to look anybody up by".
    await searchNumber('12','refused');
    assert.equal(await search.locator('table.admin-table tbody tr').count(),0,'two digits are refused rather than matched against everybody');
    assert.ok(!new URL(boss.page.url()).search.includes('q='),'and a number attempt never became a URL, not even a short one');
    const refusal=await search.locator('p.admin-feedback.error').first().innerText();
    assert.ok(refusal.includes(formatNumber(2,'bn'))&&refusal.includes(formatNumber(4,'bn')),
      `the refusal counts digits in Bangla (${refusal}) …`);
    assert.ok(!refusal.includes('12'),'…without quoting what was typed');

    // A name is the other half of the box: it may travel in the address bar, so a filtered list can be
    // handed to another admin, and it filters the list rather than answering inside the panel.
    await searchSettled('ready')
      .catch(async error=>{throw Error(`the search box never came back before a name — ${error.message.split('\n')[0]} · ${await searchState('the box should have been ready for a name')}`)});
    await searchInput().fill(OLD);
    if(await searchInput().inputValue()!==OLD){refills.push(OLD);await searchInput().fill(OLD);}
    assert.equal(await searchInput().inputValue(),OLD,'the box holds the name at the moment it is submitted');
    await submitSearch().click();
    await boss.page.waitForURL(/q=/,{timeout:90000})
      .catch(async error=>{throw Error(`a name never became a shareable URL — ${error.message.split('\n')[0]} · ${await searchState('a name should have become ?q=')}`)});
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
    await row.locator('.admin-badge',{hasText:statusLabel(lt,'called')}).first().waitFor({timeout:90000});
    assert.equal((await Lead.findOne({studentName:RAHUL}).lean<{status:string}>())!.status,'called','the inline dropdown really changed the status, and the row re-rendered with it');

    const followUpOf=async()=>(await Lead.findOne({studentName:RAHUL}).lean<{nextFollowUp:string|null}>())!.nextFollowUp;
    for(const [key,offset] of [['today',0],['tomorrow',1],['three_days',3],['next_week',7]] as [string,number][]){
      const label=followUpLabel(lt,key as 'today'),expected=day(offset);
      await row.locator('form:has(button[name="followUp"]) button',{hasText:label}).first().click();
      await until(async()=>(await followUpOf())===expected,`"${label}" to write ${expected}`);
      assert.equal(await followUpOf(),expected,`"${label}" writes ${expected} — a day in Dhaka, computed by the rule layer and never by the browser`);
    }
    await row.locator('form:has(button[name="followUp"]) button',{hasText:followUpLabel(lt,'clear')}).first().click();
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
    await widgetRow.locator('button',{hasText:followUpLabel(lt,'tomorrow')}).first().click();
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
    /**
     * The page refuses a role by sending it away — `getArchiver()` and `redirect()`, the way the Recycle
     * Bin and the Overview already do — so what is waited for is the address bar leaving the visitor list,
     * which is a fact about the refusal rather than about one particular screen. It used to be left to
     * `requireArchiver()` throwing into `admin/error.tsx`, whose sentence is "could not load data, check
     * the database connection and permissions": an owner reading that goes and looks at the database when
     * the truth is that a teacher is not allowed in. The guard still runs before a single lead is read,
     * and the assertions below are what prove it — no visitor, no mask, no number, no row, no sidebar
     * item, no quick-add form, anywhere in the document the refused role ends up on.
     */
    await teacher.page.waitForURL(url=>!url.pathname.includes('/admin/leads'),{timeout:90000})
      .catch(async error=>{throw Error(`a content editor was never sent away from the visitor list — ${error.message.split('\n')[0]} · url=${teacher.page.url()} · headings=${JSON.stringify(await teacher.page.locator('h1,h2').allInnerTexts().catch(()=>[]))} · pageErrors=${JSON.stringify(teacher.errors)} · body=${JSON.stringify((await teacher.page.locator('body').innerText().catch(()=>'(no body)')).replace(/\s+/g,' ').slice(0,300))}`)});
    assert.ok(!teacher.page.url().includes('/admin/leads'),`a content editor reaches no visitor list; landed on ${teacher.page.url()}`);
    const teacherBody=await teacher.page.locator('body').innerText();
    assert.ok(!teacherBody.includes(RAHUL)&&!teacherBody.includes(MASK_1)&&!teacherBody.includes(P1),
      `a content editor sees no visitor and no number, masked or whole (the page said: ${teacherBody.replace(/\s+/g,' ').slice(0,160)})`);
    assert.equal(await teacher.page.locator('table.admin-table tbody tr',{hasText:RAHUL}).count(),0,'not one row of the list is in the document');
    assert.equal(await teacher.page.locator('nav.admin-nav a[href*="/admin/leads"]').count(),0,'the sidebar has no Visitors item for that role');
    assert.equal(await teacher.page.locator('input[name="studentName"]').count(),0,'and there is no quick-add form');

    // ---- 9. What driving the screens left in the audit log.
    const audits=await AdminAudit.find({action:/^lead\./}).lean<{action:string;target:string}[]>();
    const actions=[...new Set(audits.map(row=>row.action))].sort();
    for(const expected of ['lead.create','lead.follow-up','lead.note','lead.phone-search','lead.status']){
      assert.ok(actions.includes(expected),`driving the screens audited ${expected} (saw: ${actions.join(', ')||'nothing'})`);
    }
    assert.ok(audits.every(row=>!/01[3-9]\d{8}/.test(row.target)),'and no audit target anywhere holds a number');

    /**
     * ---- 10. R3.9 · Send SMS from the Visitors list: who is in the send, who is not, and why.
     *
     * The rules themselves are proved against the database in tests/lead-sms.integration.ts; what only a
     * browser can prove is that the screen SAYS them — that a blocked visitor offers no checkbox and shows
     * why instead, that the count beside the button is the count that will be sent, and that the dialog a
     * visitor send opens is the same one every other send opens, already on `visitor_thanks` and with no
     * guardian-or-student question to answer, because a lead has one number and no fee to talk about.
     *
     * No message is sent here. The provider in test mode is the mock, but a send would write rows the
     * other sections' counts do not expect, and the DB suite already proves the write end to end.
     */
    /**
     * Section 6 lifted this block on purpose — proving the lift works is its job — so the row that must NOT
     * offer a checkbox is contactable by now. Section 10 puts the block back, because what is being proven
     * here is the row an operator cannot pick and the count above the list that says why. Nothing after this
     * section reads the fixture, and the counts below are read from the page rather than assumed.
     */
    const blockedId=blocked.ok?blocked.id:'';
    assert.ok(blockedId,'the blocked fixture lead exists');
    await updateLeadStatus(blockedId,'do_not_contact',bossId);
    // The picker offers the shipped catalogue: an earlier suite may have left edited templates behind in
    // this disposable database, and the assertion below is about what ships.
    await CenterSmsTemplate.deleteMany({});
    const thanks=defaultTemplate('visitor_thanks')!;

    /** What the dialog must look like for a visitor send, at whatever width it is being photographed. */
    const checkVisitorDialog=async(label:string)=>{
      const overlay=boss.page.locator('.sms-overlay');
      await overlay.locator('[data-sms-dialog]').waitFor({timeout:60000}).catch(async error=>{
        throw Error(`${label}: the visitor SMS dialog never opened — ${error.message.split('\n')[0]} · url=${boss.page.url()} · body=${JSON.stringify((await boss.page.locator('body').innerText().catch(()=>'(none)')).replace(/\s+/g,' ').slice(0,300))} · pageErrors=${JSON.stringify(boss.errors)}`);
      });
      assert.ok((await overlay.locator('h2').first().innerText()).includes(t.smsBulkTitle),`${label}: the dialog is titled for visitors`);
      // A lead has one number, so the dialog asks no guardian-or-student question and says whose number it uses.
      assert.equal(await overlay.locator('input[name="smsTarget"]').count(),0,`${label}: a visitor send offers no audience choice`);
      assert.ok((await overlay.innerText()).includes('ভিজিটরের নম্বর'),`${label}: and it says the visitor's number is the one used`);
      assert.ok((await overlay.innerText()).includes('লিডের প্রথম নম্বরটিতেই পাঠানো হয়।'),`${label}: the first number on the lead, out loud`);
      // The preview the dialog loads on its own is the server resolving THIS selection of leads.
      await until(async()=>{
        const summary=await overlay.locator('[data-sms-summary]').innerText().catch(()=>'');
        return summary.includes('মোট')&&!summary.includes('প্রাপক গণনা হচ্ছে');
      },`${label}: the dialog counted the picked visitors`,60000);
      const summary=await overlay.locator('[data-sms-summary]').innerText();
      assert.ok(summary.includes('2'),`${label}: two picked visitors are two numbers, and the dialog says so (${summary.replace(/\s+/g,' ')})`);
    };

    for(const width of [360,1440]){
      await boss.page.setViewportSize({width,height:900});
      await boss.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
      await rows(boss.page).first().waitFor({timeout:60000});
      const bar=boss.page.locator('[data-lead-sms-bar]');
      await bar.waitFor({timeout:60000}).catch(async error=>{
        throw Error(`the visitor SMS bar never rendered at ${width}px — ${error.message.split('\n')[0]} · url=${boss.page.url()} · headings=${JSON.stringify(await boss.page.locator('h1,h2').allInnerTexts().catch(()=>[]))} · pageErrors=${JSON.stringify(boss.errors)}`);
      });
      const boxes=boss.page.locator('section.list-panel input[name="smsLead"]');
      const boxCount=await boxes.count();
      const blockedCells=boss.page.locator('section.list-panel [data-sms-blocked]');
      const phonelessCells=boss.page.locator('section.list-panel [data-sms-nophone]');
      const blockedCount=await blockedCells.count();
      const phonelessCount=await phonelessCells.count();
      assert.ok(boxCount>0,`${width}px: every row that may be texted offers a checkbox`);
      assert.equal(await blockedCells.first().innerText(),t.smsBlockedRow,`${width}px: a blocked visitor's cell says "left out" instead of offering a checkbox`);
      assert.equal(await phonelessCells.first().innerText(),t.noPhone,`${width}px: a visitor with no number says so`);
      assert.equal(await rows(boss.page).filter({hasText:BLOCKED}).first().locator('input[name="smsLead"]').count(),0,
        `${width}px: the lead marked do-not-contact cannot be picked at all`);
      // The bar reports the exclusions in the same digits the rest of the screen uses, and counts them
      // apart: a promise made to a person is not the same sentence as a gap in the sheet.
      const barText=(await bar.innerText()).replace(/\s+/g,' ');
      assert.ok(barText.includes(t.smsSelectPage),`${width}px: the bar offers to pick the page`);
      assert.ok(barText.includes(t.smsExcluded.replace('{count}',formatNumber(blockedCount,'bn'))),
        `${width}px: the bar counts the ${blockedCount} excluded by "do not contact" out loud (${barText})`);
      assert.ok(barText.includes(t.smsNoPhoneCount.replace('{count}',formatNumber(phonelessCount,'bn'))),
        `${width}px: and the ${phonelessCount} with no number, separately (${barText})`);
      // Scoped to the bar: every row also carries a closed drawer with its own single-lead Send SMS in it,
      // so a page-wide count would be counting buttons that are in the document but not on screen.
      assert.equal(await bar.locator('button[data-sms-open]').count(),0,
        `${width}px: with nobody picked there is no send button — it appears when there is something to send`);
      if(width===360)await noOverflow(boss.page,'the Visitors list with the SMS picker');

      // Pick two visitors: the button appears and counts exactly what will be handed to the dialog.
      await rows(boss.page).filter({hasText:RAHUL}).first().locator('input[name="smsLead"]').check();
      await rows(boss.page).filter({hasText:NEXT_WEEK}).first().locator('input[name="smsLead"]').check();
      const openButton=bar.locator('button[data-sms-open]');
      await openButton.waitFor({timeout:60000});
      assert.ok((await openButton.innerText()).includes(t.smsSelected.replace('{count}',formatNumber(2,'bn'))),
        `${width}px: the button says how many are in the send (${(await openButton.innerText()).replace(/\s+/g,' ')})`);
      // Picking the whole page is one tap, and it never picks a blocked visitor.
      await bar.locator('input[name="smsLeadPage"]').check();
      const pagePicks=await boxes.evaluateAll(nodes=>nodes.filter(node=>(node as HTMLInputElement).checked).length);
      assert.equal(pagePicks,boxCount,`${width}px: "everyone on this page" means every row that may be texted`);
      assert.ok((await bar.locator('button[data-sms-open]').innerText()).includes(formatNumber(boxCount,'bn')),
        `${width}px: and the button now counts all ${boxCount} of them`);
      assert.equal(await rows(boss.page).filter({hasText:BLOCKED}).first().locator('input[name="smsLead"]:checked').count(),0,
        `${width}px: the blocked visitor is still not among them`);
      // Back to the two the dialog will be checked with.
      await bar.locator('input[name="smsLeadPage"]').uncheck();
      await rows(boss.page).filter({hasText:RAHUL}).first().locator('input[name="smsLead"]').check();
      await rows(boss.page).filter({hasText:NEXT_WEEK}).first().locator('input[name="smsLead"]').check();
      await shot(boss.page,`b2-visitor-sms-${width}`);
      if(width===360)await noOverflow(boss.page,'the Visitors list with two visitors picked');

      await bar.locator('button[data-sms-open]').click();
      await checkVisitorDialog(`${width}px`);
      await shot(boss.page,`b2-visitor-sms-dialog-${width}`,false);
      if(width===360)await noOverflow(boss.page,'the visitor SMS dialog');

      // Step 2 is the catalogue: already on the visitor template, with the shipped body, and without any
      // template whose chips a lead could never fill.
      await boss.page.locator('[data-sms-next]').click();
      const overlay=boss.page.locator('.sms-overlay');
      await overlay.locator('[data-sms-step="2"]').waitFor({timeout:60000});
      assert.equal(await overlay.locator('input[name="smsTemplate"]:checked').inputValue(),'visitor_thanks',
        `${width}px: a visitor send opens on the visitor template`);
      assert.equal(await overlay.locator('input[name="smsTemplate"][value="due_reminder"]').count(),0,
        `${width}px: a due reminder is not offered to somebody who owes nothing`);
      assert.equal(await overlay.locator('input[name="smsTemplate"][value="payment_receipt"]').count(),0,
        `${width}px: nor a receipt, nor any template a lead has no value for`);
      assert.equal(await overlay.locator('textarea[name="smsText"]').inputValue(),thanks.body,
        `${width}px: and the message shown is the shipped visitor body, chips and all`);
      await shot(boss.page,`b2-visitor-sms-template-${width}`,false);
      await overlay.locator('button[aria-label="বন্ধ করুন"]').click();
      await boss.page.locator('.sms-overlay').waitFor({state:'detached',timeout:60000});
    }

    // R3.11 reversed what used to be asserted here. A staff account DOES get the picker now — narrowed to
    // the visitors they tick and to the thank-you template — so "no bar at all" is no longer the truth and
    // keeping it would be a proof of a screen the owner did not ask for. The narrowing itself is section
    // 12; the role that may not spend money on SMS at all is section 8's teacher, who never reaches a list.
    await desk.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
    await rows(desk.page).first().waitFor({timeout:60000});
    assert.equal(await desk.page.locator('[data-lead-sms-bar]').count(),1,'a staff user gets the picker the decision gave them');
    assert.equal(await desk.page.locator('input[name="smsLeadPage"]').count(),0,'without the one tap that picks everybody on the page');
    assert.ok((await desk.page.locator('body').innerText()).includes(RAHUL),'and the list itself is still theirs to work');
    // The drawer keeps its own single-lead send, and it too is offered only where a send may happen.
    await boss.page.setViewportSize({width:1440,height:900});
    await boss.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
    await rows(boss.page).first().waitFor({timeout:60000});
    // `smsRow`/`smsDrawer`, not `rahulRow`/`drawer`: section 3 already opened that drawer in this scope.
    const smsRow=rows(boss.page).filter({hasText:RAHUL}).first();
    await smsRow.locator('button',{hasText:t.detail}).first().click();
    const smsDrawer=boss.page.locator('dialog.overview-drawer[open]');
    await smsDrawer.waitFor({timeout:60000});
    await smsDrawer.locator('button[data-sms-open]').waitFor({timeout:60000});
    assert.equal(await smsDrawer.locator('button[data-sms-open]').count(),1,'one visitor, one Send SMS in the drawer');
    await shot(boss.page,'b2-visitor-sms-drawer-1440',false);
    await smsDrawer.locator('button[data-sms-open]').click();
    const oneOverlay=boss.page.locator('.sms-overlay');
    await oneOverlay.locator('[data-sms-dialog]').waitFor({timeout:60000});
    assert.ok((await oneOverlay.locator('h2').first().innerText()).includes(t.smsOneTitle),'titled for this one visitor');
    assert.equal(await oneOverlay.locator('input[name="smsTarget"]').count(),0,'and with the same one-number rule');
    await shot(boss.page,'b2-visitor-sms-one-1440',false);
    await oneOverlay.locator('button[aria-label="বন্ধ করুন"]').click();
    await oneOverlay.waitFor({state:'detached',timeout:60000});
    await smsDrawer.locator('button',{hasText:t.close}).first().click();
    await boss.page.locator('dialog.overview-drawer[open]').waitFor({state:'detached',timeout:60000})
      .catch(()=>{/* the drawer closing is not what this section is about */});

    // ---- 11. Duplicate phones (R3.10): the question, its three answers, and the drawer's mates.
    const DUP='ডুপ্লিকেট ভিজিটর',DUP2='দোকানদার ভিজিটর',M1='মার্জ প্রথম',M2='মার্জ দ্বিতীয়',T1='টাই প্রথম',T2='টাই দ্বিতীয়';
    const P6='01911223344',P7='01922334455';
    const typeAdd=async(name:string,phone:string)=>{
      const addPanel=panel(boss.page,t.addTitle);
      await addPanel.locator('input[name="studentName"]').waitFor({state:'visible',timeout:60000});
      await addPanel.locator('input[name="studentName"]').fill(name);
      await addPanel.locator('input[name="phone"]').fill(phone);
      await addPanel.locator('input[name="phone"]').press('Enter');
      return addPanel;
    };
    await boss.page.setViewportSize({width:360,height:900});
    await boss.page.goto(`${origin}${list}?new=1`,{waitUntil:'domcontentloaded',timeout:180000});
    // (a) A held number becomes a QUESTION: holders named and masked, and nothing written while it asks.
    let dupPanel=await typeAdd(DUP,P1);
    const ask=dupPanel.locator('[data-dup-ask]');
    await ask.waitFor({state:'visible',timeout:90000}).catch(async error=>{
      throw Error(`the duplicate question never appeared — ${error.message.split('\n')[0]} · url=${boss.page.url()} · body=${JSON.stringify((await dupPanel.innerText().catch(()=>'(none)')).replace(/\s+/g,' ').slice(0,300))} · pageErrors=${JSON.stringify(boss.errors)}`);
    });
    const askText=(await ask.innerText()).replace(/\s+/g,' ');
    assert.ok(askText.includes(RAHUL),`the question names who holds the number: ${askText.slice(0,200)}`);
    assert.ok(askText.includes(MASK_1),'the number is shown as its mask');
    assert.ok(!askText.includes(P1),'and never as digits');
    assert.equal(await Lead.countDocuments({studentName:DUP}),0,'nothing was written while the question stands');
    assert.equal(await dupPanel.locator('input[name="phone"]').inputValue(),P1,'and the question keeps what was typed, so an answer carries the entry it applies to');
    await noOverflow(boss.page,'the duplicate question at 360');
    await shot(boss.page,'b2-visitor-dup-360');
    // (b) The same question at desk width, then the sibling answer.
    await boss.page.setViewportSize({width:1440,height:900});
    await shot(boss.page,'b2-visitor-dup-1440');
    await ask.locator('button[name="dupChoice"][value="sibling"]').click();
    await until(async()=>(await Lead.countDocuments({studentName:DUP}))===1,'the sibling answer wrote exactly one lead',90000);
    const dupDoc=await Lead.findOne({studentName:DUP}).lean<{familyKey:string|null}>();
    const rahulDoc=await Lead.findOne({studentName:RAHUL}).lean<{familyKey:string|null}>();
    assert.equal(dupDoc!.familyKey,rahulDoc!.familyKey,'the sibling inherited the holder family key');
    // (c) "Keep as a separate lead": two strangers on one number, and NO family key on the new one.
    dupPanel=await typeAdd(DUP2,P1);
    const ask2=dupPanel.locator('[data-dup-ask]');
    await ask2.waitFor({state:'visible',timeout:90000});
    assert.ok(((await ask2.innerText()).replace(/\s+/g,' ')).includes(DUP),'the question now lists the sibling too');
    await ask2.locator('button[name="dupChoice"][value="separate"]').click();
    await until(async()=>(await Lead.countDocuments({studentName:DUP2}))===1,'the separate answer wrote one lead',90000);
    const strangerDoc=await Lead.findOne({studentName:DUP2}).lean<{familyKey:string|null}>();
    assert.equal(strangerDoc!.familyKey,null,'a separate lead carries no family key at all');
    // (d) The drawer names the number-mates outside the family, masked, and merges one on purpose.
    await boss.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
    await rows(boss.page).filter({hasText:DUP2}).first().waitFor({timeout:90000});
    await rows(boss.page).filter({hasText:DUP2}).first().locator('button',{hasText:t.detail}).first().click();
    const dupDrawer=boss.page.locator('dialog.overview-drawer[open]');
    await dupDrawer.waitFor({state:'visible',timeout:60000});
    const mates=dupDrawer.locator('[data-dup-mates]');
    await mates.waitFor({state:'visible',timeout:90000});
    const matesText=(await mates.innerText()).replace(/\s+/g,' ');
    assert.ok(matesText.includes(RAHUL)&&matesText.includes(SISTER),'the keyless stranger sees the whole holder family as mates');
    assert.ok(matesText.includes(MASK_1)&&!matesText.includes(P1),'masked here too');
    await shot(boss.page,'b2-visitor-dup-drawer-1440',false);
    // Merging bins the source behind the browser's own confirm; every page in this suite already
    // carries a standing dialog-acceptor from the sign-in helper, so the confirm is accepted for us.
    await mates.locator('li',{hasText:RAHUL}).locator('button',{hasText:t.dupMerge}).click();
    await until(async()=>{
      // The bin hides its rows from a plain find (every query carries a live-only filter unless it
      // speaks about deletedAt), so the proof of binning is a query that speaks about it.
      const gone=await Lead.findOne({studentName:RAHUL,deletedAt:{$ne:null}}).lean<{deletedAt:Date|null}>();
      return !!gone&&!!gone.deletedAt;
    },'the merged lead reached the bin',90000);
    await until(async()=>(await dupDrawer.locator('[data-dup-mates]').count())===0,'the drawer re-read itself and the block emptied',90000);
    assert.ok(((await dupDrawer.innerText()).replace(/\s+/g,' ')).includes(SISTER),'and the merged family now lists the sibling');
    await dupDrawer.locator('button',{hasText:t.close}).first().click();
    await boss.page.locator('dialog.overview-drawer[open]').waitFor({state:'detached',timeout:60000}).catch(()=>{});
    // (e) Quick-add's own merge button: the entry folds into the named lead and writes no row.
    // The panel is one tap away, literally: the list arrived folded, so arrive with it open.
    await boss.page.goto(`${origin}${list}?new=1`,{waitUntil:'domcontentloaded',timeout:180000});
    dupPanel=await typeAdd(M1,P6);
    await dupPanel.locator('p.admin-feedback').first().waitFor({state:'visible',timeout:90000});
    assert.equal(await dupPanel.locator('[data-dup-ask]').count(),0,'a number nobody holds asks nothing');
    dupPanel=await typeAdd(M2,P6);
    const ask3=dupPanel.locator('[data-dup-ask]');
    await ask3.waitFor({state:'visible',timeout:90000});
    await ask3.locator('button[name="dupMerge"]').click();
    // Wait for the merge RECORD, not for the absence of a row: "M2 was never written" is true the
    // moment the question appears, so polling it would read the target before the merge commits.
    await until(async()=>{
      const m=await Lead.findOne({studentName:M1}).lean<{notes:{text:string}[]}>();
      return !!m&&(m.notes||[]).some(note=>note.text.includes('quick-add merge'));
    },'the merge record landed on the named lead',90000);
    assert.equal(await Lead.countDocuments({studentName:M2}),0,'and the merge wrote no second row');
    // (f) Tying two leads that stay two: the mate block empties and the family list takes over.
    // One submission at a time: a commit resets the form, so typing the next entry while the
    // previous save is still in flight would type into a form React is about to empty.
    await typeAdd(T1,P7);
    await until(async()=>(await Lead.countDocuments({studentName:T1}))===1,'the first of the pair was written',90000);
    await typeAdd(T2,P7);
    const ask4=panel(boss.page,t.addTitle).locator('[data-dup-ask]');
    await ask4.waitFor({state:'visible',timeout:90000});
    await ask4.locator('button[name="dupChoice"][value="separate"]').click();
    await until(async()=>(await Lead.countDocuments({studentName:T2}))===1,'the second stranger was written',90000);
    await boss.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
    await rows(boss.page).filter({hasText:T2}).first().waitFor({timeout:90000});
    await rows(boss.page).filter({hasText:T2}).first().locator('button',{hasText:t.detail}).first().click();
    const tieDrawer=boss.page.locator('dialog.overview-drawer[open]');
    await tieDrawer.waitFor({state:'visible',timeout:60000});
    await tieDrawer.locator('[data-dup-mates] li',{hasText:T1}).waitFor({state:'visible',timeout:90000});
    await tieDrawer.locator('[data-dup-mates] li',{hasText:T1}).locator('button',{hasText:t.dupTie}).click();
    await until(async()=>(await tieDrawer.locator('[data-dup-mates]').count())===0,'after the tie there are no mates outside the family',90000);
    assert.ok(((await tieDrawer.innerText()).replace(/\s+/g,' ')).includes(T1),'the tied lead moved into the family list');
    await tieDrawer.locator('button',{hasText:t.close}).first().click();
    await boss.page.locator('dialog.overview-drawer[open]').waitFor({state:'detached',timeout:60000}).catch(()=>{});


    // ---- 12. Staff SMS and the staff Overview (R3.11): the owner's two decisions, on screen.
    const STAFF_THANKS='স্টাফের ধন্যবাদ ভিজিটর',STAFF_SECOND='স্টাফের দ্বিতীয় ভিজিটর';
    const P8='01977889900',P9='01988990011';
    const thanked=await createQuickLead({studentName:STAFF_THANKS,phone:P8,classLabel:'10',followUp:'today'},bossId);
    assert.equal(thanked.ok,true,'the visitor the desk will thank is written');
    const refused=await createQuickLead({studentName:STAFF_SECOND,phone:P9,classLabel:'9',followUp:'today'},bossId);
    assert.equal(refused.ok,true,'and so is the one the ceiling will stop');
    const thankedId=thanked.ok?thanked.id:'',refusedId=refused.ok?refused.id:'';

    // (a) The ceiling is a setting, so it is written the way the owner writes it: through the form.
    await boss.page.setViewportSize({width:1440,height:900});
    await boss.page.goto(`${origin}/bn/admin/sms`,{waitUntil:'domcontentloaded',timeout:180000});
    const limitInput=boss.page.locator('input[name="dailySmsLimitPerUser"]');
    await limitInput.waitFor({timeout:90000});
    assert.equal(await limitInput.inputValue(),'30','the ceiling ships at thirty a day');
    await shot(boss.page,'b2-sms-limit-1440',false);
    await limitInput.fill('1');
    await boss.page.locator('form:has(input[name="dailySmsLimitPerUser"]) button[type="submit"], form:has(input[name="dailySmsLimitPerUser"]) button.button-navy').first().click();
    await until(async()=>{
      const row=await CenterSettings.findOne({key:'main'}).lean<{dailySmsLimitPerUser?:number}|null>();
      return Number(row?.dailySmsLimitPerUser)===1;
    },'the settings form saved the ceiling',90000);
    // CI runs at any Dhaka hour, and inside the real quiet window a send is queued rather than sent —
    // which would prove the clock instead of the ceiling. The window is emptied for the two sends below.
    await CenterSettings.updateOne({key:'main'},{$set:{quietStart:'00:00',quietEnd:'00:00'}});

    // (b) The picker a staff account gets: rows to tick, a hint about what they may send, and no page-pick.
    await desk.page.setViewportSize({width:360,height:780});
    await desk.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
    await rows(desk.page).filter({hasText:STAFF_THANKS}).first().waitFor({timeout:90000});
    const staffBar=desk.page.locator('[data-lead-sms-bar]');
    await staffBar.waitFor({timeout:60000});
    assert.equal(await staffBar.locator('[data-sms-staff-hint]').count(),1,'the bar says what a staff send may be');
    assert.ok((await staffBar.innerText()).includes(t.smsStaffHint),'in the words the catalogue ships');
    assert.equal(await staffBar.locator('button[data-sms-open]').count(),0,'with nobody ticked there is no send button');
    await rows(desk.page).filter({hasText:STAFF_THANKS}).first().locator('input[name="smsLead"]').check();
    const staffOpen=staffBar.locator('button[data-sms-open]');
    await staffOpen.waitFor({timeout:60000});
    assert.equal(await rows(desk.page).filter({hasText:BLOCKED}).first().locator('input[name="smsLead"]').count(),0,
      'and a visitor marked do-not-contact is not tickable by anybody, staff included');
    await noOverflow(desk.page,'the Visitors list with a staff pick at 360');
    await shot(desk.page,'b2-visitor-staff-360');

    // (c) The dialog: one template, the message shown and not written, and today's allowance in plain view.
    await staffOpen.click();
    const staffOverlay=desk.page.locator('.sms-overlay');
    await staffOverlay.locator('[data-sms-dialog]').waitFor({timeout:60000});
    await until(async()=>{
      const summary=await staffOverlay.locator('[data-sms-summary]').innerText().catch(()=>'');
      return summary.includes('মোট')&&!summary.includes('প্রাপক গণনা হচ্ছে');
    },'the staff dialog counted the one visitor they ticked',60000);
    const dailyLine=await staffOverlay.locator('[data-sms-daily]').innerText();
    assert.ok(dailyLine.includes('সীমা')&&dailyLine.includes('১'),`the dialog says what today's ceiling leaves (${dailyLine.replace(/\s+/g,' ')})`);
    await desk.page.locator('[data-sms-next]').click();
    await staffOverlay.locator('[data-sms-step="2"]').waitFor({timeout:60000});
    assert.equal(await staffOverlay.locator('input[name="smsTemplate"]').count(),1,'one template offered, so nothing to wander to');
    assert.equal(await staffOverlay.locator('input[name="smsTemplate"]').first().inputValue(),'visitor_thanks');
    assert.equal(await staffOverlay.locator('#sms-custom-text').count(),0,'no textarea: a staff send is not a place to write');
    assert.equal(await staffOverlay.locator('[data-sms-chip]').count(),0,'and no chips to bend the message into something else');
    assert.equal((await staffOverlay.locator('[data-sms-locked]').innerText()).trim(),thanks.body.trim(),
      'the message on screen is the shipped thank-you, word for word');
    await shot(desk.page,'b2-visitor-staff-dialog-360',false);
    await desk.page.setViewportSize({width:1440,height:900});
    await shot(desk.page,'b2-visitor-staff-dialog-1440',false);
    await desk.page.setViewportSize({width:360,height:780});

    // (d) And it goes: one visitor, one message, one log row — the mock provider is all that answers.
    await desk.page.locator('[data-sms-next]').click();
    await staffOverlay.locator('[data-sms-step="3"]').waitFor({timeout:60000});
    await desk.page.locator('[data-sms-next]').click();
    await staffOverlay.locator('[data-sms-send]').waitFor({timeout:60000});
    await desk.page.locator('[data-sms-send]').click();
    await until(async()=>(await CenterSmsLog.countDocuments({lead:new mongoose.Types.ObjectId(thankedId),templateKey:'visitor_thanks'}))===1,
      'the thank-you the desk sent was logged against the visitor',120000);
    await staffOverlay.locator('[data-sms-result]').waitFor({timeout:60000});
    assert.ok((await staffOverlay.locator('[data-sms-result-title]').innerText()).includes('পাঠানো হয়েছে'),'and the dialog says it went');

    // (e) The ceiling: the same desk, one more visitor, and the day's single message already spent.
    await desk.page.goto(`${origin}${list}`,{waitUntil:'domcontentloaded',timeout:180000});
    await rows(desk.page).filter({hasText:STAFF_SECOND}).first().waitFor({timeout:90000});
    await rows(desk.page).filter({hasText:STAFF_SECOND}).first().locator('input[name="smsLead"]').check();
    await desk.page.locator('[data-lead-sms-bar] button[data-sms-open]').click();
    const limitOverlay=desk.page.locator('.sms-overlay');
    await limitOverlay.locator('[data-sms-dialog]').waitFor({timeout:60000});
    await until(async()=>(await limitOverlay.locator('[data-sms-daily]').innerText().catch(()=>'')).includes('০টি বাকি'),
      'the dialog reports an allowance with nothing left in it',60000);
    await desk.page.locator('[data-sms-next]').click();
    await limitOverlay.locator('[data-sms-step="2"]').waitFor({timeout:60000});
    await desk.page.locator('[data-sms-next]').click();
    await limitOverlay.locator('[data-sms-step="3"]').waitFor({timeout:60000});
    await desk.page.locator('[data-sms-next]').click();
    await limitOverlay.locator('[data-sms-send]').waitFor({timeout:60000});
    await desk.page.locator('[data-sms-send]').click();
    await until(async()=>(await limitOverlay.locator('[data-sms-result-text]').innerText().catch(()=>'')).includes('সীমা'),
      'the refusal arrived in Bangla',120000);
    const refusalText=(await limitOverlay.locator('[data-sms-result-text]').innerText()).replace(/\s+/g,' ');
    assert.ok(refusalText.includes('১')&&refusalText.includes('আগামীকাল'),`the sentence carries the limit and says when it comes back (${refusalText})`);
    assert.equal(await CenterSmsLog.countDocuments({lead:new mongoose.Types.ObjectId(refusedId)}),0,'nothing was sent to the second visitor');
    await shot(desk.page,'b2-visitor-staff-limit-360',false);
    await limitOverlay.locator('button[aria-label="বন্ধ করুন"]').click();
    await desk.page.locator('.sms-overlay').waitFor({state:'detached',timeout:60000}).catch(()=>{});

    // (f) The staff Overview: today's follow-ups and the overdue count, and none of the owner's panels.
    await desk.page.goto(`${origin}/bn/admin`,{waitUntil:'domcontentloaded',timeout:180000});
    const queue=panel(desk.page,t.followUpsTitle);
    await queue.waitFor({timeout:90000});
    const queueText=(await queue.innerText()).replace(/\s+/g,' ');
    const board=await followUpBoard(new Date(),6);
    assert.ok(queueText.includes(t.todayBadge.replace('{n}',formatNumber(board.today,'bn'))),
      `today's count is the board's own number (${queueText.slice(0,140)})`);
    assert.ok(queueText.includes(t.overdueBadge.replace('{n}',formatNumber(board.overdue,'bn'))),'and so is the count of promises already late');
    assert.ok(board.today>0&&board.overdue>0,'the fixtures left something due today and something overdue, so both counts are real');
    assert.equal(await desk.page.locator('.admin-kpis').count(),0,'the intake counters are not a staff screen');
    assert.equal(await desk.page.locator('.overview-heading').count(),0,'nor is the owner’s welcome heading');
    assert.equal(await desk.page.locator('section.admin-panel h2',{hasText:'স্বয়ংক্রিয় এসএমএস সমস্যা'}).count(),0,'nor the automatic-SMS problems');
    assert.ok(await queue.locator('table.admin-table tbody tr').count()>0,'and the queue lists the names the desk works from, not just two numbers');
    await noOverflow(desk.page,'the staff Overview at 360');
    await shot(desk.page,'b2-staff-overview-360');
    await desk.page.setViewportSize({width:1440,height:900});
    await noOverflow(desk.page,'the staff Overview at 1440');
    await shot(desk.page,'b2-staff-overview-1440');
    await desk.page.setViewportSize({width:360,height:780});
    // Leave the centre as it was found: the ceiling back at its shipped value and the quiet window real.
    await CenterSettings.updateOne({key:'main'},{$set:{dailySmsLimitPerUser:30,quietStart:'21:00',quietEnd:'07:00'}});

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

  console.log('Visitor screens: the list shows every lead with its status, its follow-up day and its number masked, the digits living only in the tel: and wa.me destinations and in nothing else the browser is served, and no family key reaching it at all; quick-add is one labelled tap on the mobile bottom bar, four fields with the rest behind "more", saves on Enter, reports the id it wrote, reads XII as class 12 and leaves status, group and medium un-guessed; the drawer loads the notes timeline, saves a note with an outcome and its writer’s name, and lists the family; one search box sends four digits — typed in Bangla too — to a server action that finds both leads sharing a number and refuses two digits in Bangla that counts them without quoting them and without turning them into a word search, while a name travels as a shareable URL parameter and a number typed into the address bar is refused; the row controls change a status, write each of the four quick follow-up days in Dhaka, clear one again and lift a contact block deliberately; the Overview counts today’s follow-ups and the overdue ones separately, works the queue from there and moves the count with it; a content editor reaches none of it; nothing overflows horizontally at 360 px; every screen audited what it did with masked targets; and all five screens are photographed at 360 px and 1440 px in screenshots/r3. Each search was read from the commit that answered it — the button back and the box cleared, never the rows a previous search left on screen — and the box '+(refills.length?'had to be typed twice for '+refills.join(', ')+' because React cleared it in between':'held what was typed every time it was submitted')+'. A number that is already on the list turns quick-add into a question instead of a second row: the holders are named and masked with no digits anywhere in the question, nothing is written while it stands, and its three answers are a sibling that inherits the holder family key, a merge that folds the entry into the named lead writing no row at all, and a separate lead that carries no key so two strangers on one number are not one family; the drawer lists the number-mates outside the family, merges one behind the browser own confirm into the bin with its notes and numbers, and ties two leads that stay two into one family — the question photographed at 360 px and 1440 px and the mates block at 1440 px. A staff account spends the SMS money only where the owner allowed: the picker without the one tap that picks everybody, the dialog with one template and the message shown rather than written, today’s allowance quoted before the send, a thank-you that goes and is logged against the visitor, and a second one stopped by the ceiling in a Bangla sentence that carries the number and says when it comes back — the ceiling itself written through the settings form at 1440 px, and the staff Overview reduced to today’s follow-ups and the overdue count at both widths.');
}

run().catch(error=>{console.error(error);process.exit(1)});
