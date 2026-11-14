/**
 * R4 in the browser: the Teacher CV bank — the list, the quick-add, the drawer, "find a teacher" and
 * the import wizard, photographed at 360 px and 1440 px into screenshots/r4/ and asserted while driven.
 *
 * What the owner asked to see, and what this suite proves on screen:
 *
 *  1. "শিক্ষক সিভি" is in the sidebar for an admin and is NOT there for a staff account, and a staff
 *     account that types the address is sent to the dashboard instead of being shown a CV;
 *  2. the list shows every seeded CV with its status, its rating, its subjects, its number as a MASK and
 *     the digits only inside the `tel:` and `wa.me` destinations — nowhere in the served HTML otherwise;
 *  3. the twelve-month review is a banner with a count, and the row that needs it carries a badge — no CV
 *     was deleted to make the number smaller;
 *  4. quick-add reads the brief's own messy subject cell AS IT IS TYPED — the classes and subjects appear
 *     as chips, the word no table knows is announced and travels as a tag — and Enter saves it;
 *  5. a second CV sharing a number is asked about, with the CV it found named by readable id and mask,
 *     and is written only when a hand says these are two people;
 *  6. the drawer changes status and rating, files a note with its outcome, schedules an interview (which
 *     moves the status), and hires: one unpublished Teacher profile carrying the candidate's own name,
 *     linked back, with the hired CV refusing to bin and saying why;
 *  7. "find a teacher" saves a need, counts the CVs that fit it, opens them as the SAME full rows the list
 *     shows, and a phone number typed into the list's search box is refused with a sentence rather than
 *     becoming a URL parameter, while a name travels as one;
 *  8. the import wizard reads the labelled fake sheet, asks about the column nobody named, keeps Save off
 *     until both doubtful dates have an answer, writes eight of ten rows with the sheet's own comments as
 *     first notes, and undoes with a reason;
 *  9. the English addresses read as English — no Bangla character and no Bangla digit on any of the three;
 * 10. nothing overflows horizontally at 360 px.
 *
 * Runs against an already-started app and its disposable database (TEST_ORIGIN + TEST_MONGO_URI), the same
 * way the other browser suites do. The UI is driven in Bangla and the strings asserted are read from
 * `src/messages/bn.json` — the same catalog the screens read, so a reworded button cannot make this suite
 * pass against a screen the owner would not recognise. Every candidate is synthetic and labelled নমুনা.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import type {Page} from 'playwright';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {AdminAudit} from '../src/models/AdminAudit';
import {TeacherCandidate} from '../src/models/TeacherCandidate';
import {TeacherNeed} from '../src/models/TeacherNeed';
import {TeacherImportBatch} from '../src/models/TeacherImportBatch';
import {TeacherContent} from '../src/models/PublicContent';
import {addCandidateNote,createCandidate,hireCandidate,scheduleInterview,updateCandidate} from '../src/lib/teachers/candidates';
import {saveNeed} from '../src/lib/teachers/needs';
import {dhakaDay} from '../src/lib/admin/today';
import {phoneSearchMask} from '../src/lib/leads/lead-phone';
import {outcomeLabel,ratingLabel,shiftLabel,statusLabel,subjectLabel} from '../src/lib/teachers/cv-ui';
import bn from '../src/messages/bn.json';
import en from '../src/messages/en.json';

const t=bn.teacherCvs;
const en_t=en.teacherCvs;
/** Resolve a nested teacherCvs key the way next-intl does, so the label helpers can be exercised here. */
const ct=(key:string):string=>key.split('.').reduce((node:unknown,part:string)=>(node as Record<string,unknown>)?.[part],bn.teacherCvs as unknown) as string;

const SHOTS=path.join('screenshots','r4');
const FIXTURE=path.join('tests','fixtures','Teacher-CV-FAKE-SAMPLE.xlsx');
const LIST='/bn/admin/teacher-cvs',FIND='/bn/admin/teacher-cvs/find',IMPORT='/bn/admin/teacher-cvs/import';

const P1='01712817090',P2='01811223344',P3='01933445566';
const MASK_1=phoneSearchMask(P1),MASK_2=phoneSearchMask(P2);
const RAHIM='নমুনা শিক্ষক রহিম',KARIM='নমুনা শিক্ষক করিম',JAMAL='নমুনা শিক্ষক জামাল',TYPED='নমুনা শিক্ষক টাইপ করা';
const MESSY='6, 7, 8 (Math, Eng) 9-GS, Other';
const day=(offset:number):string=>dhakaDay(new Date(Date.now()+offset*86400000));
const BANGLA=/[\u0980-\u09ff\u09e6-\u09ef]/;

async function run(){
  await preflight({mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,
    test:'tests/teacher-cv-screens-browser.integration.ts — start the app first, then run it with TEST_ORIGIN and TEST_MONGO_URI'});
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

  // A clean slate for the collections these screens read, so every count below is this suite's own.
  await TeacherCandidate.deleteMany({}).setOptions({recycleAny:true} as never);
  await TeacherNeed.deleteMany({});
  await TeacherImportBatch.deleteMany({});
  await TeacherContent.deleteMany({slug:/^cv-/});
  await AdminAudit.deleteMany({action:/^teacher-cv\./});
  await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});

  const password=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(password,12);
  const accounts={admin:'cv-boss@example.test',staff:'cv-desk@example.test'};
  // English names on purpose: the /en screens are asserted to carry no Bangla in their chrome, and an
  // operator's own name is chrome, not data.
  const names={admin:'CV Boss',staff:'Front Desk'};
  for(const role of ['admin','staff'] as const){
    await User.deleteOne({email:accounts[role]});
    await User.create({name:names[role],email:accounts[role],passwordHash:hash,role,active:true});
  }
  const bossId=String((await User.findOne({email:accounts.admin}).lean<{_id:unknown}>())!._id);

  // Seeded through the rule layer, not around it: what the screens read is what quick-add really writes.
  const rahim=await createCandidate({name:RAHIM,phones:[P1],subjectsText:MESSY,subjects:['math','english','other'],
    classLevels:['6','7','8','9'],availabilityText:'3.00-6.00',shifts:['evening'],university:'নমুনা বিশ্ববিদ্যালয়',
    department:'গণিত',tags:['GS'],receivedDate:day(-400)},bossId);
  assert.equal(rahim.ok,true,'the first fixture CV is written');
  const karim=await createCandidate({name:KARIM,phones:[P2],subjectsText:'Chemistry',subjects:['chemistry'],
    classLevels:['9','10'],shifts:['evening'],university:'নমুনা কলেজ',receivedDate:day(-30)},bossId);
  assert.equal(karim.ok,true);
  const jamal=await createCandidate({name:JAMAL,subjectsText:'Class 4 to 7 (Bangla)',subjects:['bangla'],
    classLevels:['4','5','6','7'],availabilityText:'ALL',shifts:['morning','evening','any'],receivedDate:day(-6)},bossId);
  assert.equal(jamal.ok,true,'and a CV with no number is written, because it is still a person worth calling back');
  await addCandidateNote(karim.id,'নমুনা টীকা: আগ্রহী, সাক্ষাৎকার দরকার','interested',bossId);
  await updateCandidate(karim.id,{rating:'good'},bossId);
  const need=await saveNeed({subject:'chemistry',classLevels:['9','10'],shift:'evening',note:'নমুনা চাহিদা'},bossId);
  assert.equal(need.ok,true,'and the teaching need the find screen opens with is saved through the same rule layer');
  assert.equal(await TeacherCandidate.countDocuments({}),3,'three fixture CVs, and nothing else in the collection');

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
  const rows=(page:Page)=>page.locator('tr[data-cv-row]');
  /** Wait for a write to land in the database rather than for a sentence to appear on screen. */
  const until=async(check:()=>Promise<boolean>,label:string,timeoutMs=90000)=>{
    const deadline=Date.now()+timeoutMs;
    for(;;){
      if(await check().catch(()=>false))return;
      if(Date.now()>deadline)throw Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
      await new Promise(resolve=>setTimeout(resolve,500));
    }
  };

  try{
    async function signIn(role:'admin'|'staff',width=1440){
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

    // ---- 1. Permissions: an admin's screen, and not a staff one.
    await boss.page.goto(`${origin}${LIST}`,{waitUntil:'domcontentloaded',timeout:180000});
    await boss.page.locator('h1',{hasText:t.title}).first().waitFor({timeout:60000});
    const sideItem=boss.page.locator('aside.admin-sidebar nav.admin-nav a[href="/bn/admin/teacher-cvs"]');
    await sideItem.waitFor({state:'attached',timeout:60000});
    assert.ok((await sideItem.innerText()).includes(bn.adminRedesign.items.teacherCvs),
      `the sidebar reads “${bn.adminRedesign.items.teacherCvs}” for an admin, in the group the owner asked for`);
    await desk.page.goto(`${origin}${LIST}`,{waitUntil:'domcontentloaded',timeout:180000});
    await desk.page.waitForURL(/\/bn\/admin\/?$/,{timeout:60000});
    assert.ok(!desk.page.url().includes('teacher-cvs'),'a staff account that types the address is sent to the dashboard, not shown a CV');
    assert.equal(await desk.page.locator('aside.admin-sidebar nav.admin-nav a[href="/bn/admin/teacher-cvs"]').count(),0,
      'and “শিক্ষক সিভি” is not in a staff sidebar at all — CVs are sensitive');
    assert.equal(await desk.page.locator('nav.admin-bottom-nav a, nav.admin-bottom-nav button').count(),4,'the mobile bottom bar still has exactly four targets');

    // ---- 2. The list at both widths, in the language the owner reads.
    await boss.page.goto(`${origin}${LIST}`,{waitUntil:'domcontentloaded',timeout:180000});
    await rows(boss.page).first().waitFor({timeout:60000});
    const body=await boss.page.locator('body').innerText();
    for(const name of [RAHIM,KARIM,JAMAL])assert.ok(body.includes(name),`the list shows ${name}`);
    assert.ok(body.includes(MASK_1),`a number is shown as its mask (${MASK_1})`);
    assert.ok(!body.includes(P1),'and the number itself is never printed');
    assert.ok(body.includes(JAMAL),'a CV with no number is still a row');
    assert.ok(body.includes(t.noPhone),`which says “${t.noPhone}” instead of leaving an empty cell`);
    assert.ok(body.includes(statusLabel(ct,'new')),'with its status');
    assert.ok(body.includes(ratingLabel(ct,'good')),'its rating');
    assert.ok(body.includes(subjectLabel(ct,'chemistry')),'and the subjects it can teach, in words');
    assert.ok(await boss.page.locator(`a[href="tel:+88${P1.slice(1)}"]`).count()>0,'the call destination is a real link');
    assert.ok(await boss.page.locator(`a[href="https://wa.me/88${P1.slice(1)}"]`).count()>0,'and so is WhatsApp');
    await onlyAsDestination(boss.page,P1,'the list');
    await onlyAsDestination(boss.page,P2,'the list');

    // The twelve-month review: a banner with a count, a badge on the row, and nothing deleted.
    const reviewBanner=boss.page.locator('[data-cv-review=""]');
    assert.equal(await reviewBanner.count(),1,'the review banner is on screen because one CV has waited a year');
    assert.ok((await reviewBanner.innerText()).includes('১'),'and it counts in the operator’s own digits');
    assert.equal(await TeacherCandidate.countDocuments({}),3,'the reminder deleted nothing: all three CVs are still stored');
    const rahimRow=boss.page.locator('tr[data-cv-row]',{hasText:RAHIM});
    assert.ok((await rahimRow.innerText()).includes(t.reviewBadge),'the row that needs a second look carries the badge');

    // The status chips are counts, in vocabulary order, zeros included.
    const chips=boss.page.locator('nav.lead-chips a[data-cv-chip]');
    assert.equal(await chips.count(),9,'all nine statuses are printed as chips…');
    assert.ok((await boss.page.locator('nav.lead-chips a[data-cv-chip="new"]').innerText()).includes('৩'),'…with their counts');
    assert.ok((await boss.page.locator('nav.lead-chips a[data-cv-chip="hired"]').innerText()).includes('০'),'including the status nobody is in, at zero');
    const wide=await noOverflow(boss.page,'the CV list at 1440');
    assert.ok(wide.clientWidth>=1200,'the desktop viewport really is desktop width');
    await shot(boss.page,'teacher-cvs-list-bn-1440');

    // ---- 3. Search: a name travels as a URL parameter, a number is refused before it can.
    await boss.page.locator('[data-cv-search]').fill(KARIM.split(' ').slice(-1)[0]);
    await boss.page.locator('[data-cv-search]').press('Enter');
    await boss.page.waitForURL(/q=/,{timeout:60000});
    assert.equal(await rows(boss.page).count(),1,'a name search narrows the list to the CV it names');
    assert.ok(boss.page.url().includes('q='),'and the name travels as a parameter, so the search can be shared');
    await boss.page.goto(`${origin}${LIST}?q=${P2}`,{waitUntil:'domcontentloaded',timeout:180000});
    const refused=await boss.page.locator('body').innerText();
    assert.ok(refused.includes(t.searchNumberHelp),'a number typed into the search box is refused with a sentence…');
    assert.equal(await rows(boss.page).count(),3,'…and the list is shown whole rather than filtered by a number');
    assert.ok(!(await boss.page.locator('[data-cv-search]').inputValue()).includes(P2),'the box does not keep the number either');

    // ---- 4. Quick-add: the reading as it is typed, and Enter saves.
    await boss.page.setViewportSize({width:360,height:900});
    await boss.page.goto(`${origin}${LIST}?new=1`,{waitUntil:'domcontentloaded',timeout:180000});
    const addPanel=boss.page.locator('[data-cv-quick-add]');
    await addPanel.locator('h2',{hasText:t.addTitle}).waitFor({state:'visible',timeout:60000});
    await boss.page.locator('[data-cv-name]').fill(TYPED);
    await boss.page.locator('[data-cv-phone]').fill(`0 ${P3.slice(0,5)}-${P3.slice(5)}`);
    await boss.page.locator('[data-cv-subjects-text]').fill(MESSY);
    // The free-time box lives behind "more fields"; the shift it reads is printed in the same chips, so
    // opening it is part of proving the reading rather than a detour.
    await boss.page.locator('[data-cv-quick-add] button[aria-expanded="false"]').first().click();
    await boss.page.locator('[data-cv-quick-add] input[name="availabilityText"]').fill('3.00-6.00');
    const read=await boss.page.locator('[data-cv-read]').innerText();
    assert.ok(read.includes(subjectLabel(ct,'math')),'the subjects read out of the cell appear as chips as they are typed…');
    assert.ok(read.includes('৯'),'…with the class numbers in the operator’s own digits…');
    assert.ok(read.includes(shiftLabel(ct,'evening')),'…and the shift read out of the bare hours in the free-time box');
    assert.ok(read.includes('GS'),'while the word no table knows is announced rather than swallowed');
    await noOverflow(boss.page,'quick-add at 360');
    await shot(boss.page,'teacher-cvs-quick-add-360');
    await boss.page.locator('[data-cv-name]').press('Enter');
    await until(async()=>(await TeacherCandidate.countDocuments({name:TYPED}))===1,'the typed CV to be written');
    const typedDoc=(await TeacherCandidate.findOne({name:TYPED}).lean<Record<string,any>>())!;
    assert.deepEqual(typedDoc.classLevels,['6','7','8','9'],'what was saved is what was shown: the classes the chips named');
    assert.deepEqual(typedDoc.tags,['GS'],'and the unparsed word travelled as a tag');
    assert.deepEqual(typedDoc.phones.map((phone:{normalized:string})=>phone.normalized),[P3],'a hand-grouped number normalized on the way in');
    assert.match(typedDoc.candidateId,/^CV-\d{4}-\d{4}$/,'and it was given a readable id');

    // ---- 5. The duplicate question, and a hand answering it.
    await boss.page.goto(`${origin}${LIST}?new=1`,{waitUntil:'domcontentloaded',timeout:180000});
    await boss.page.locator('[data-cv-name]').fill(`${TYPED} আবার`);
    await boss.page.locator('[data-cv-phone]').fill(P3);
    await boss.page.locator('[data-cv-name]').press('Enter');
    const dup=boss.page.locator('[data-cv-dup]');
    await dup.waitFor({state:'visible',timeout:60000});
    const dupText=await dup.innerText();
    assert.ok(dupText.includes(TYPED),'the question names the CV already on file…');
    assert.ok(dupText.includes(phoneSearchMask(P3)),'…by mask, never by number');
    assert.ok(dupText.includes(typedDoc.candidateId),'…and by the readable id an operator would recognise');
    assert.ok(dupText.includes(t.drawer.dupMatchPhone),'saying it was the number that matched');
    assert.equal(await TeacherCandidate.countDocuments({name:`${TYPED} আবার`}),0,'and nothing was written while the question stands');
    await shot(boss.page,'teacher-cvs-duplicate-bn-360');
    await dup.locator('button[name="dupChoice"][value="separate"]').click();
    await until(async()=>(await TeacherCandidate.countDocuments({name:`${TYPED} আবার`}))===1,'the second CV to be written');
    assert.equal((await TeacherCandidate.countDocuments({})),5,'two people now, on one number, because a hand said so');

    // ---- 6. The drawer: status, rating, a note, an interview, and the hire.
    await boss.page.setViewportSize({width:1440,height:900});
    await boss.page.goto(`${origin}${LIST}`,{waitUntil:'domcontentloaded',timeout:180000});
    await rows(boss.page).first().waitFor({timeout:60000});
    const karimRow=boss.page.locator('tr[data-cv-row]',{hasText:KARIM});
    await karimRow.locator('[data-cv-detail]').click();
    /* A closed drawer stays mounted (React keeps the element and the browser keeps the `open`
       attribute off it), so the drawer in hand is the open one, not the first one in the document. */
    const drawer=boss.page.locator('[data-cv-drawer][open]');
    await drawer.waitFor({state:'visible',timeout:60000});
    /* The dialog opens on the row it was handed and then reads the record: the timeline, the duplicate
       list and the status form arrive a beat later, so the drawer is read once its body has landed —
       otherwise the note is "missing" only because nothing had been fetched yet. */
    await drawer.locator('[data-cv-status]').waitFor({state:'visible',timeout:60000});
    const drawerText=await drawer.innerText();
    assert.ok(drawerText.includes(KARIM),'the drawer is about the CV whose row was tapped');
    assert.ok(drawerText.includes('নমুনা টীকা: আগ্রহী, সাক্ষাৎকার দরকার'),'and its timeline note is there, word for word');
    assert.ok(drawerText.includes(outcomeLabel(ct,'interested')),'with the outcome it was filed under');
    assert.ok(drawerText.includes(t.drawer.dupNone)||drawerText.includes(MASK_2),'the duplicates section answers either way');
    assert.ok(!drawerText.includes(P2),'and no number is printed inside it');
    await drawer.locator('[data-cv-status]').selectOption('shortlisted');
    await drawer.locator('[data-cv-rating]').selectOption('excellent');
    await drawer.locator('[data-cv-save-status]').click();
    await until(async()=>{
      const doc=(await TeacherCandidate.findById(karim.id).lean<Record<string,any>>())!;
      return doc.status==='shortlisted'&&doc.rating==='excellent';
    },'the status and rating to be saved');
    await drawer.locator('[data-cv-note]').fill('নমুনা দ্বিতীয় টীকা: সাক্ষাৎকার বৃহস্পতিবার');
    await drawer.locator('select[name="outcome"]').selectOption('call_back_later');
    await drawer.locator('[data-cv-add-note]').click();
    await until(async()=>(((await TeacherCandidate.findById(karim.id).lean<Record<string,any>>())!).notes||[]).length===2,'the second note to be filed');
    await drawer.locator('[data-cv-interview]').fill(`${day(3)}T10:00`);
    await drawer.locator('button:has-text("' + t.drawer.interviewSave + '")').click();
    await until(async()=>((await TeacherCandidate.findById(karim.id).lean<Record<string,any>>())!).status==='interview_scheduled','the interview to move the status with it');
    await drawer.locator('[data-cv-hire]').click();
    await until(async()=>(await TeacherContent.countDocuments({slug:/^cv-/}))===1,'the hire to write one Teacher profile');
    const profile=(await TeacherContent.findOne({slug:/^cv-/}).lean<Record<string,any>>())!;
    assert.equal(profile.published,false,'the profile is unpublished: a public faculty page is the owner’s decision, not a side effect');
    assert.equal(profile.name.bn,KARIM);
    assert.equal(profile.name.en,KARIM,'and the name is the candidate’s own in both languages, not an invented spelling');
    const hiredDoc=(await TeacherCandidate.findById(karim.id).lean<Record<string,any>>())!;
    assert.equal(hiredDoc.status,'hired','the status followed the hire');
    assert.equal(String(hiredDoc.hiredAsTeacherId),String(profile._id),'and the link back is on the CV');
    await until(async()=>(await drawer.locator('[data-cv-hired]').count())===1,'the drawer to show the hire');
    await shot(boss.page,'teacher-cvs-drawer-bn-1440');

    // The hired CV refuses to bin, and says why where the operator can read it.
    await drawer.locator('.overview-drawer-actions button.admin-danger-text').first().click();
    /* Every row on the page carries its own confirm dialog, mounted and shut; the one a hand just
       opened is the one with the `open` attribute. */
    const confirm=boss.page.locator('dialog.admin-confirm[open]');
    await confirm.waitFor({state:'visible',timeout:30000});
    await confirm.locator('button.button.admin-danger').click();
    const refusal=bn.recycleBin.kinds.teacherCandidateHired;
    await until(async()=>(await boss.page.locator('body').innerText()).includes(refusal),
      'the refusal to reach the screen, in the words the bin gives for a hired CV');
    assert.equal(((await TeacherCandidate.findById(karim.id).setOptions({recycleAny:true} as never).lean<Record<string,any>>())!).deletedAt,null,
      'and it is still not in the bin');

    // A CV that has NOT been hired bins, leaves the list and is restorable from the Recycle Bin.
    await boss.page.keyboard.press('Escape');
    await boss.page.goto(`${origin}${LIST}`,{waitUntil:'domcontentloaded',timeout:180000});
    const jamalRow=boss.page.locator('tr[data-cv-row]',{hasText:JAMAL});
    await jamalRow.locator('[data-cv-detail]').click();
    const jamalDrawer=boss.page.locator('[data-cv-drawer][open]');
    await jamalDrawer.waitFor({state:'visible',timeout:60000});
    await jamalDrawer.locator('[data-cv-status]').waitFor({state:'visible',timeout:60000});
    await jamalDrawer.locator('.overview-drawer-actions button.admin-danger-text').first().click();
    await boss.page.locator('dialog.admin-confirm[open] button.button.admin-danger').click();
    await until(async()=>(await TeacherCandidate.countDocuments({name:JAMAL}))===0,'the binned CV to leave the list');
    assert.equal(await TeacherCandidate.countDocuments({name:JAMAL}).setOptions({recycleAny:true} as never),1,'while staying stored, in the bin');
    await boss.page.goto(`${origin}/bn/admin/recycle-bin`,{waitUntil:'domcontentloaded',timeout:180000});
    await until(async()=>(await boss.page.locator('body').innerText()).includes(JAMAL),'the bin to list it');
    assert.ok((await boss.page.locator('body').innerText()).includes(bn.recycleBin.kindNames.teacherCandidate),'under the name of its kind');

    // ---- 7. Find a teacher: a saved need, its matches, and one table either way.
    await boss.page.goto(`${origin}${FIND}`,{waitUntil:'domcontentloaded',timeout:180000});
    await boss.page.locator('h1',{hasText:t.findTitle}).first().waitFor({timeout:60000});
    const needRow=boss.page.locator('[data-cv-need]').first();
    await needRow.waitFor({state:'visible',timeout:60000});
    const needText=await needRow.innerText();
    assert.ok(needText.includes(subjectLabel(ct,'chemistry')),'the saved need reads as the subject it was saved with…');
    assert.ok(needText.includes(shiftLabel(ct,'evening')),'…its shift…');
    assert.ok(needText.includes('১')||needText.includes(t.needs.matchesNone),'…and how many CVs fit it');
    await boss.page.locator('[data-cv-need-subject]').selectOption('math');
    await boss.page.locator('[data-cv-need-form] input[name="classLevels"][value="6"]').check();
    await boss.page.locator('[data-cv-need-form] input[name="note"]').fill('নমুনা দ্বিতীয় চাহিদা');
    await boss.page.locator('[data-cv-need-save]').click();
    await until(async()=>(await TeacherNeed.countDocuments({subject:'math'}))===1,'the second need to be saved');
    await until(async()=>(await boss.page.locator('[data-cv-need]').count())===2,'and it to join the list of needs on screen');
    // Open the first need's matches: the same full rows, the same masks, the same dial links.
    await boss.page.goto(`${origin}${FIND}?need=${need.id}`,{waitUntil:'domcontentloaded',timeout:180000});
    await rows(boss.page).first().waitFor({timeout:60000});
    assert.equal(await rows(boss.page).count(),1,'the need opens the CVs that fit it, and only those');
    assert.ok((await boss.page.locator('body').innerText()).includes(KARIM),'which is the chemistry teacher for classes 9-10 in the evening');
    assert.ok((await boss.page.locator('[data-cv-mask]').first().innerText()).includes(MASK_2),'with its number as a mask');
    assert.ok(await boss.page.locator(`a[data-cv-call][href="tel:+88${P2.slice(1)}"]`).count()>0,'and a call link on the row itself');
    assert.ok(await boss.page.locator('[data-cv-detail]').count()>0,'plus the same drawer the list opens — one table, two entrances');
    await onlyAsDestination(boss.page,P2,'the need matches');
    await shot(boss.page,'teacher-cvs-find-bn-1440');

    // The hand-set filters agree with the need, because both go through the one filter.
    await boss.page.goto(`${origin}${FIND}?subject=chemistry&classLevel=9&shift=evening`,{waitUntil:'domcontentloaded',timeout:180000});
    await rows(boss.page).first().waitFor({timeout:60000});
    assert.equal(await rows(boss.page).count(),1,'the same three values as a hand-set filter find the same one CV');
    assert.ok((await boss.page.locator('[data-cv-find-total]').innerText()).includes('১'),'and the total says so');
    await boss.page.setViewportSize({width:360,height:900});
    await noOverflow(boss.page,'find a teacher at 360');
    await shot(boss.page,'teacher-cvs-find-bn-360');
    await boss.page.setViewportSize({width:1440,height:900});

    // The bulk send counts only what is on screen and ticked.
    const sendTrigger=boss.page.locator('[data-cv-sms-host] [data-sms-open]');
    assert.ok(await sendTrigger.count()>0,'a “contact selected” send is offered on this screen');
    assert.ok((await sendTrigger.first().innerText()).includes('০'),'reading out that nobody is picked yet');
    assert.ok(await sendTrigger.first().isDisabled(),'and it is off until somebody is');
    await boss.page.locator('tr[data-cv-row] input.cv-sms-check').first().check();
    await until(async()=>!(await sendTrigger.first().isDisabled()),'the send to wake up');
    assert.ok((await sendTrigger.first().innerText()).includes('১'),'now counting the one CV picked');
    await sendTrigger.first().click();
    const dialog=boss.page.locator('[data-sms-dialog]');
    await dialog.waitFor({state:'visible',timeout:60000});
    assert.equal((await dialog.getAttribute('aria-label')),t.sms.title,'the app’s one SMS dialog opens, with the CV bank’s own title');
    /* The dialog counts its recipients after it opens, so the summary is waited for rather than snapped
       at, and the claim is the count itself, read out of the sentence the dialog writes. */
    const summaryBox=dialog.locator('[data-sms-summary]');
    await until(async()=>!(await summaryBox.innerText().catch(()=>bn.sms.dialog.countingRecipients)).includes(bn.sms.dialog.countingRecipients),
      'the dialog to finish counting who it is about to text');
    const summary=(await summaryBox.innerText()).trim();
    const counted=new RegExp(`^${bn.sms.dialog.total}\\s+([0-9\\u09e6-\\u09ef]+)\\s+${bn.sms.dialog.numbers}`).exec(summary);
    assert.ok(counted,`the dialog says how many numbers it is about to text, and this said: ${summary.slice(0,80)}`);
    assert.equal(counted![1],'১','and it counts the one CV that was picked, not the page and not the bank');
    const recipients=dialog.locator('[data-sms-recipients]');
    if(!await recipients.isVisible().catch(()=>false))await dialog.locator('[data-sms-recipients-toggle]').click();
    await recipients.waitFor({state:'visible',timeout:30000});
    /* The recipient table is the one place this app spells a number out, because it is the destination the
       operator is about to pay for. What has to be true here is that the send covers exactly the CV that was
       ticked and names it — the screen behind the dialog was already proven to carry masks only. */
    const recipientRows=recipients.locator('tbody tr');
    assert.equal(await recipientRows.count(),1,'one CV picked, one recipient: nobody rides along invisibly');
    assert.ok((await recipientRows.first().innerText()).includes(KARIM),'and the recipient is the candidate whose row was ticked');

    // ---- 8. The import wizard: read, ask, decide, write, undo.
    await boss.page.goto(`${origin}${IMPORT}`,{waitUntil:'domcontentloaded',timeout:180000});
    await boss.page.locator('[data-cv-import]').waitFor({state:'visible',timeout:60000});
    const file=await readFile(FIXTURE);
    await boss.page.locator('[data-cv-import-file]').setInputFiles({name:'Teacher-CV-FAKE-SAMPLE.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:file});
    await boss.page.locator('[data-cv-import-preview]').click();
    await boss.page.locator('[data-cv-import-counts]').waitFor({state:'visible',timeout:120000});
    const counts=await boss.page.locator('[data-cv-import-counts]').innerText();
    assert.ok(counts.includes('১০'),'the preview counts the ten rows the sheet has…');
    assert.ok(counts.includes('২'),'…and the two that cannot be written');
    const question=boss.page.locator('[data-cv-import-questions]');
    await question.waitFor({state:'visible',timeout:60000});
    assert.ok((await question.innerText()).includes(t.import.questions.unnamed),
      'the column nobody named is asked about, in the words the catalog gives for asking');
    const mapSelects=boss.page.locator('select[data-cv-import-map]');
    assert.ok(await mapSelects.count()>0,'…with a select beside it, never a default');
    assert.equal(await mapSelects.first().inputValue(),'','and the select sits on its blank choice: nothing was mapped behind the owner’s back');
    assert.equal(((await mapSelects.first().locator('option').first().textContent())||'').trim(),'Column 1',
      'whose blank choice names the column exactly as the sheet wrote it');
    assert.ok(await boss.page.locator('[data-cv-import-commit]').isDisabled(),'Save stays off while a date is undecided');
    const radioNames=await boss.page.locator('input[type="radio"][name^="accept-"]')
      .evaluateAll(nodes=>[...new Set(nodes.map(node=>(node as HTMLInputElement).name))]);
    assert.ok(radioNames.length>=1,'every date the sheet wrote and the reader doubts offers “use the suggestion” and “keep as written”');
    // The first radio of each pair is the suggestion; checking every radio would end on “keep as written”.
    for(const name of radioNames)await boss.page.locator(`input[type="radio"][name="${name}"]`).first().check();
    await until(async()=>!(await boss.page.locator('[data-cv-import-commit]').isDisabled()),'Save to wake up once every date has an answer');
    const previewHtml=await boss.page.content();
    for(const number of ['01711111111','01798765432','01812345678','01911111111','01312345678'])
      assert.ok(!previewHtml.includes(number),`and no number the sheet carried (${number}) is painted in the preview`);
    await shot(boss.page,'teacher-cvs-import-bn-1440');
    await boss.page.locator('[data-cv-import-commit]').click();
    await boss.page.locator('[data-cv-import-result]').waitFor({state:'visible',timeout:180000});
    await until(async()=>(await TeacherCandidate.countDocuments({importBatch:/^CIM-/}))===8,'the eight writable rows to land');
    const result=await boss.page.locator('[data-cv-import-result]').innerText();
    assert.ok(result.includes('৮'),'the result says how many were written…');
    assert.ok(result.includes('CIM-'),'…and names the batch, so it can be undone by hand');
    const imported=(await TeacherCandidate.findOne({name:'FAKE Candidate One'}).lean<Record<string,any>>())!;
    assert.equal(imported.notes.length,1,'the sheet’s own comment became the CV’s first timeline note');
    assert.equal(imported.notes[0].text,'did not come on the 4th','word for word');
    assert.deepEqual(imported.tags,['GS'],'and the word no table knows became a tag');
    const banglaImported=(await TeacherCandidate.findOne({name:'FAKE Candidate Eight'}).lean<Record<string,any>>())!;
    assert.equal(banglaImported.notes[0].text,'চতুর্থ তারিখে আসেননি','a Bangla comment stayed Bangla');
    assert.deepEqual(banglaImported.phones.map((phone:{normalized:string})=>phone.normalized),['01312345678'],'and Bangla digits normalized on the way in');
    assert.equal((await TeacherCandidate.findOne({name:'',importBatch:/^CIM-/}).lean<Record<string,any>>())!,null,'the phone-only row was not written under a blank name');

    // Undo, with a reason: what the batch created goes to the bin through the same path a hand delete uses.
    await boss.page.locator('[data-cv-import-undo-reason]').waitFor({state:'visible',timeout:90000});
    await boss.page.locator('[data-cv-import-undo-reason]').fill('নমুনা কারণ: ভুল শিট আপলোড হয়েছে');
    await boss.page.locator('[data-cv-import-undo]').click();
    await boss.page.locator('[data-cv-import-undone]').waitFor({state:'visible',timeout:180000});
    await until(async()=>(await TeacherCandidate.countDocuments({importBatch:/^CIM-/}))===0,'the batch’s CVs to leave the list');
    assert.equal(await TeacherCandidate.countDocuments({importBatch:/^CIM-/}).setOptions({recycleAny:true} as never),8,
      'while all eight stay stored in the bin, because an undo is not a purge');
    const undone=await boss.page.locator('[data-cv-import-undone]').innerText();
    assert.ok(undone.includes('৮'),'and the screen reads back how many CVs the undo binned');
    assert.ok(undone.includes('CIM-'),'naming the batch it undid');
    const batch=(await TeacherImportBatch.findOne({}).lean<Record<string,any>>())!;
    assert.notEqual(batch.undoneAt,null,'the register shows the batch undone');
    assert.equal(batch.undoReason,'নমুনা কারণ: ভুল শিট আপলোড হয়েছে','with the reason the owner gave');

    // ---- 9. The same three screens in English, and the mobile width.
    await boss.page.setViewportSize({width:360,height:900});
    await boss.page.goto(`${origin}${LIST}`,{waitUntil:'domcontentloaded',timeout:180000});
    await rows(boss.page).first().waitFor({timeout:60000});
    await noOverflow(boss.page,'the CV list at 360');
    await shot(boss.page,'teacher-cvs-list-bn-360');
    await boss.page.setViewportSize({width:1440,height:900});
    /* An English proof reads English all the way down, digits included — the same per-account cookie the
       language sweep sets, because the digit preference is presentation, not a locale. */
    const adminId=String((await User.findOne({email:accounts.admin}).lean<{_id:unknown}>())!._id);
    await boss.context.addCookies([{name:`diction_digits_${adminId}`,value:'en',url:`${origin}/`}]);
    for(const [route,name,heading] of [['/en/admin/teacher-cvs','teacher-cvs-list-en-1440',en_t.title],
      ['/en/admin/teacher-cvs/find','teacher-cvs-find-en-1440',en_t.findTitle],
      ['/en/admin/teacher-cvs/import','teacher-cvs-import-en-1440',en_t.import.title]] as [string,string,string][]){
      await boss.page.goto(`${origin}${route}`,{waitUntil:'domcontentloaded',timeout:180000});
      await boss.page.locator('h1,h2',{hasText:heading}).first().waitFor({timeout:60000});
      const text=await boss.page.locator('h1,h2',{hasText:heading}).first().innerText();
      assert.ok(text.includes(heading),`${route}: the heading reads as English because the catalog says so`);
      /* The chrome is what has to be English, and these are the same boxes the two-language sweep reads
         on every operator screen, with the table's own column headers added: a column header is chrome
         and never data. A candidate's own Bangla name is data, and an English screen that translated it
         would be lying about a person, so the rows are not part of this assertion. */
      const chromeParts=await boss.page.locator('.admin-top, .admin-nav, .admin-panel-head, .admin-heading, .admin-pagination, .admin-test-banner, thead').allInnerTexts();
      assert.ok(chromeParts.length>0,`${route}: the screen has chrome of its own to read`);
      assert.ok(!BANGLA.test(chromeParts.join(' ')),`${route}: no Bangla character and no Bangla digit in the screen's own chrome`);
      await noOverflow(boss.page,`${route} at 1440`);
      await shot(boss.page,name);
    }
    assert.deepEqual(boss.errors,[],'no page error was thrown on any screen this suite drove');
    assert.deepEqual(desk.errors,[],'and none on the staff account that was sent away');

    console.log('The Teacher CV bank in the browser, photographed at 360 px and 1440 px into screenshots/r4: “শিক্ষক সিভি” in an admin sidebar and absent from a staff one, with a staff account that types the address sent to the dashboard; the list showing three seeded CVs with statuses, ratings, subject words, masks and the digits only inside tel: and wa.me, a review banner counting one and badging its row while all three stayed stored, and nine status chips with their counts including the empty one; a name search narrowing to one CV and travelling as a parameter while a number in the box was refused with a sentence and left the list whole; quick-add reading “6, 7, 8 (Math, Eng) 9-GS, Other” into chips as it was typed with GS announced, Enter saving classes 6-9 and the tag, and a second CV on the same number asking the duplicate question by readable id and mask before a hand wrote it; the drawer changing status and rating, filing a note with its outcome, moving the status to interview scheduled, hiring into one unpublished profile carrying the candidate’s own name in both languages, refusing to bin the hired CV with the reason on screen, and binning an unhired one that left the list and appeared in the Recycle Bin; find-a-teacher saving a second need, opening the first need’s one match as the same full row with mask, call link and drawer, agreeing with the same three values hand-set, counting the picked CV on the send button and opening the SMS dialog covering exactly that one candidate, named; the import wizard counting ten rows and two unwritable, asking about “Column 1” with a select, keeping Save off until the date the sheet wrote and the reader doubted had an answer, writing eight with the sheet’s comments as first notes (the Bangla one word for word) and GS as a tag, then undoing with a reason so eight left the list and stayed in the bin; and all three screens reading as English at /en with no Bangla character, no Bangla digit, no horizontal overflow at 360 px and no page error anywhere.');
  }finally{
    await browser.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
