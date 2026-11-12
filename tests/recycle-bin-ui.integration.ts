// @ts-nocheck -- R1 §E4 Recycle Bin UI in a real browser against the disposable test database.
/**
 * What this proves, in the running app:
 *  1. row Delete opens a ConfirmDialog that names the item and says 30 days in the Recycle Bin
 *  2. delete + Undo inside the 10-second window (the record and the public page both come back)
 *  3. bulk select + delete, with Undo for the whole selection
 *  4. a referenced record cannot be deleted: the toast shows the counts plus an Archive button
 *  5. delete + restore from the Recycle Bin page (filter by type, days left, search)
 *  6. Delete forever is Super Admin only and needs the item's exact name typed
 *  7. staff can archive but never delete; content_editor sees neither
 *  8. no horizontal overflow at 360 / 768 / 1440, no page errors, Bangla strings present
 *  9. every move wrote its audit row
 *
 * Run it the way the harness does: start the app, then
 *   TEST_ORIGIN=... TEST_MONGO_URI=... TEST_MONGO_DB=... npx tsx tests/recycle-bin-ui.integration.ts
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {chromium} from 'playwright';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {Editorial} from '../src/models/Editorial';
import {CenterClassGroup,CenterStudent} from '../src/models/CenterRecords';
import {AdminAudit} from '../src/models/AdminAudit';
import {binFilter} from '../src/models/recycle';

const TITLES={undo:'রিসাইকেল নমুনা — আনডু',bulkA:'রিসাইকেল নমুনা — বাল্ক এক',bulkB:'রিসাইকেল নমুনা — বাল্ক দুই',bin:'রিসাইকেল নমুনা — বিন রিস্টোর',forever:'রিসাইকেল নমুনা — চিরতরে মুছে ফেলা',staff:'রিসাইকেল নমুনা — স্টাফ আর্কাইভ'};
const SLUGS={'undo':'recycle-ui-undo','bulkA':'recycle-ui-bulk-a','bulkB':'recycle-ui-bulk-b','bin':'recycle-ui-bin','forever':'recycle-ui-forever','staff':'recycle-ui-staff'};
const CLASS_NAME='নমুনা ক্লাস — রেফারেন্স ব্লক';
/** What the English admin lists render. The engine's own name (dialogs, bin rows) is Bangla-first. */
const EN={undo:'Recycle sample undo',bulkA:'Recycle sample bulkA',bulkB:'Recycle sample bulkB',bin:'Recycle sample bin',forever:'Recycle sample forever',staff:'Recycle sample staff'};

async function run(){
  await preflight({mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,test:'tests/recycle-bin-ui.integration.ts — start the app first, then run it with TEST_ORIGIN and TEST_MONGO_URI (see STALE-TESTS-REPORT.md)'});
  const shared=process.env.TEST_ORIGIN?process.env.TEST_MONGO_URI:null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){
    for(const collection of await mongoose.connection.db.listCollections().toArray()){
      await mongoose.connection.db.collection(collection.name).deleteMany({}).catch(()=>{});
    }
  }
  const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3100';
  let ready=false;
  for(let i=0;i<60&&!ready;i++){
    try{ready=(await fetch(`${origin}/api/auth/csrf`)).ok}catch{}
    if(!ready)await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(!ready)throw Error(`app not reachable at ${origin}`);

  const password=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(password,12);
  const accounts={};
  for(const role of ['superadmin','admin','staff','content_editor']){
    accounts[role]=`recycle-${role}@example.test`;
    await User.create({name:`Synthetic ${role}`,email:accounts[role],passwordHash:hash,role,active:true});
  }
  for(const [key,slug] of Object.entries(SLUGS)){
    await Editorial.create({kind:'blog',slug,title:{bn:TITLES[key],en:`Recycle sample ${key}`},body:{bn:'নমুনা লেখা',en:'sample body'},published:true});
  }
  const group=await CenterClassGroup.create({name:{bn:CLASS_NAME,en:'Sample class — reference block'},academicYear:2027});
  for(const [index,studentId] of ['SYNTH-RB-1','SYNTH-RB-2'].entries()){
    await CenterStudent.create({studentId,name:{bn:`নমুনা ছাত্র ${index+1}`},classGroup:group._id,guardianName:'অভিভাবক',guardianPhone:index?'01712345671':'01712345670',admissionDate:'2027-01-01',startMonth:{year:2027,month:1},feeHistory:[{effectiveFrom:{year:2027,month:1},amount:1000}]});
  }
  const editorialByTitle=title=>Editorial.findOne({'title.bn':title}).lean();
  const stored=slug=>mongoose.connection.db.collection('editorials').countDocuments({slug});
  const publicBlog=async slug=>{const response=await fetch(`${origin}/en/blog/${slug}`);return {status:response.status,body:await response.text()}};

  // Same-database probe, before any sign-in: if the app does not serve the post this test just
  // wrote, the two are on different databases and every later assertion would be meaningless.
  const probe=await fetch(`${origin}/en/blog/${SLUGS.undo}`);
  assert.equal(probe.status,200,`the app does not serve the synthetic blog post this test just wrote (HTTP ${probe.status}, TEST_MONGO_DB=${process.env.TEST_MONGO_DB||'(unset)'}) — test and app are on different databases`);
  const written=await User.findOne({email:accounts.superadmin}).select('+passwordHash').lean();
  assert.ok(written&&await bcrypt.compare(password,written.passwordHash),'the synthetic super admin is stored with a matching password hash');

  const browser=await chromium.launch();
  try{
    async function signIn(role,width=1440){
      const context=await browser.newContext({viewport:{width,height:900}});
      const notes=[];
      let session=null;
      for(let attempt=1;attempt<=3&&!session?.user;attempt++){
        const csrfResponse=await context.request.get(`${origin}/api/auth/csrf`);
        const csrf=await csrfResponse.json();
        const form={csrfToken:csrf.csrfToken,identifier:accounts[role],password,callbackUrl:`${origin}/en/admin`};
        const headers={origin,'content-type':'application/x-www-form-urlencoded'};
        // Attempt 1 mirrors the screenshot pass (do not follow the 302); later attempts follow it.
        const callback=attempt===1
          ? await context.request.post(`${origin}/api/auth/callback/credentials`,{maxRedirects:0,timeout:180000,headers,form}).catch(error=>({status:()=>`error: ${(error as Error).message.slice(0,80)}`} as never))
          : await context.request.post(`${origin}/api/auth/callback/credentials`,{timeout:180000,headers,form});
        session=await context.request.get(`${origin}/api/auth/session`).then(response=>response.json()).catch(()=>null);
        notes.push(`attempt ${attempt}: csrf ${csrfResponse.status()} token=${csrf.csrfToken?'yes':'no'}, callback ${callback.status()}, session ${JSON.stringify(session).slice(0,160)}`);
        if(!session?.user)await new Promise(resolve=>setTimeout(resolve,2000));
      }
      if(!session?.user){
        // Last resort: the real login form, which posts to the server action instead of the REST callback.
        const form=await context.newPage();
        await form.goto(`${origin}/en/login`,{waitUntil:'domcontentloaded',timeout:180000});
        if(await form.locator('input[name=identifier]').count()){
          await form.locator('input[name=identifier]').fill(accounts[role]);
          await form.locator('input[name=password]').fill(password);
          await form.locator('button.button-navy').first().click();
          await form.waitForURL(/\/(en|bn)\/(admin|portal|dashboard)/,{timeout:60000}).catch(()=>{});
          session=await context.request.get(`${origin}/api/auth/session`).then(response=>response.json()).catch(()=>null);
          notes.push(`form login landed on ${form.url()}, session ${JSON.stringify(session).slice(0,160)}`);
        }else{
          notes.push('the login form was not rendered at /en/login (auth services reported as not configured)');
        }
        await form.close();
      }
      if(!session?.user)throw Error(`sign-in as ${role} failed — ${notes.join(' | ')}`);
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('dialog',dialog=>dialog.accept());
      return {context,page,errors};
    }
    const row=(page,title)=>page.locator('table.admin-table tbody tr').filter({hasText:title});
    const toast=page=>page.locator('.admin-toast');

    // ── 1+2. named ConfirmDialog, delete, public page goes away, Undo brings it back ─────────
    const su=await signIn('superadmin');
    await su.page.goto(`${origin}/en/admin/content?kind=blog`,{waitUntil:'domcontentloaded',timeout:180000});
    if(!su.page.url().includes('/admin/content'))throw Error(`super admin did not reach the content list; landed on ${su.page.url()} — usually a TEST_MONGO_DB mismatch`);
    assert.equal((await publicBlog(SLUGS.undo)).status,200,'the blog post is public before the delete');

    await row(su.page,EN.undo).getByRole('button',{name:'Delete',exact:true}).click();
    const dialog=su.page.getByRole('dialog');
    await dialog.waitFor();
    // The row dialog is named from the list, so on /en it carries the English title; the bin rows
    // and the forever dialog are named by the engine, which is Bangla-first.
    assert.match(await dialog.locator('h2').innerText(),new RegExp(EN.undo.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),'the dialog names the item');
    assert.match(await dialog.locator('p').first().innerText(),/Recycle Bin for 30 days/,'the dialog states the real 30-day consequence');
    assert.ok(!(await dialog.innerText()).includes('cannot be undone'),'the dialog does not claim irreversibility where undo exists');
    await dialog.getByRole('button',{name:'Yes, delete'}).click();

    await toast(su.page).getByText('Moved to the Recycle Bin.').waitFor({timeout:60000});
    const undo=toast(su.page).getByRole('button',{name:'Undo',exact:true});
    assert.ok(await undo.isVisible(),'the Undo affordance is in the toast');
    await row(su.page,EN.undo).waitFor({state:'detached',timeout:60000});
    assert.ok((await editorialByTitle(TITLES.undo)).deletedAt instanceof Date,'the record is binned, not destroyed');
    assert.equal(await stored(SLUGS.undo),1,'the row is still in storage during the 30 days');
    const gone=await publicBlog(SLUGS.undo);
    assert.ok(gone.status===404||!gone.body.includes(TITLES.undo),'the public blog page stops serving a binned post immediately');

    await undo.click();
    await toast(su.page).getByText('Restored.').waitFor({timeout:60000});
    await row(su.page,EN.undo).waitFor({timeout:60000});
    assert.equal((await editorialByTitle(TITLES.undo)).deletedAt,null,'Undo cleared deletedAt');
    assert.equal((await publicBlog(SLUGS.undo)).status,200,'and the public page serves it again');

    // ── 3. bulk select + delete, then Undo for the whole selection ───────────────────────────
    const bar=su.page.locator('.admin-bulk-bar');
    // Counts render in the account's digit preference (Bangla by default), so match either set.
    const selectedCount=/([0-9]+|[\u09E6-\u09EF]+) selected/;
    const digitsOf=text=>Number(String(text.match(selectedCount)[1]).replace(/[\u09E6-\u09EF]/g,c=>String('\u09E6\u09E7\u09E8\u09E9\u09EA\u09EB\u09EC\u09ED\u09EE\u09EF'.indexOf(c))));
    await bar.waitFor();
    assert.equal(digitsOf(await bar.innerText()),0,'nothing is selected to start with');
    await su.page.locator('thead input.admin-checkbox').check();
    await su.page.waitForFunction(()=>/[0-9\u09E6-\u09EF]+ selected/.test(document.querySelector('.admin-bulk-bar')?.textContent||''),{timeout:20000});
    assert.equal(digitsOf(await bar.innerText()),6,'select-all picks up all six blog rows');
    await su.page.locator('thead input.admin-checkbox').uncheck();
    await su.page.waitForFunction(()=>/([0]|\u09E6) selected/.test(document.querySelector('.admin-bulk-bar')?.textContent||''),{timeout:20000});
    for(const title of [EN.bulkA,EN.bulkB])await row(su.page,title).locator('input.admin-checkbox').check();
    await su.page.waitForFunction(()=>/([2]|\u09E8) selected/.test(document.querySelector('.admin-bulk-bar')?.textContent||''),{timeout:20000});
    assert.equal(digitsOf(await bar.innerText()),2,'two rows are selected');
    await bar.getByRole('button',{name:'Delete selected'}).click();
    await toast(su.page).getByText('Moved to the Recycle Bin.').waitFor({timeout:60000});
    for(const title of [EN.bulkA,EN.bulkB])await row(su.page,title).waitFor({state:'detached',timeout:60000});
    assert.ok((await editorialByTitle(TITLES.bulkA)).deletedAt instanceof Date);
    assert.ok((await editorialByTitle(TITLES.bulkB)).deletedAt instanceof Date);
    await toast(su.page).getByRole('button',{name:'Undo',exact:true}).click();
    await toast(su.page).getByText('Restored.').waitFor({timeout:60000});
    for(const title of [EN.bulkA,EN.bulkB])await row(su.page,title).waitFor({timeout:60000});
    assert.equal((await editorialByTitle(TITLES.bulkA)).deletedAt,null,'bulk Undo restored the first row');
    assert.equal((await editorialByTitle(TITLES.bulkB)).deletedAt,null,'bulk Undo restored the second row');

    // ── 4. referenced record: blocked with real counts, plus the Archive escape hatch ────────
    await su.page.goto(`${origin}/en/admin/students/classes`,{waitUntil:'domcontentloaded',timeout:180000});
    const classCard=su.page.locator(`[data-class-id="${String(group._id)}"]`);
    await classCard.getByRole('button',{name:'Delete',exact:true}).click();
    await su.page.getByRole('dialog').getByRole('button',{name:'Yes, delete'}).click();
    await toast(su.page).getByText('cannot be deleted. Archive it instead.',{exact:false}).waitFor({timeout:60000});
    assert.match(await toast(su.page).innerText(),/2 student\(s\) use this class/,'the blocked toast carries the real reference count');
    assert.equal((await CenterClassGroup.findById(group._id).lean()).deletedAt,null,'a blocked delete bins nothing');
    await toast(su.page).getByRole('button',{name:'Archive',exact:true}).click();
    await toast(su.page).getByText('Archived.').waitFor({timeout:60000});
    const archivedGroup=await CenterClassGroup.findById(group._id).lean();
    assert.equal(archivedGroup.active,false,'Archive hid the class');
    assert.equal(archivedGroup.deletedAt,null,'Archive is not a delete');

    // ── 5. delete + restore from the Recycle Bin page (filter, search, days left) ────────────
    await su.page.goto(`${origin}/en/admin/content?kind=blog`,{waitUntil:'domcontentloaded',timeout:180000});
    await row(su.page,EN.bin).getByRole('button',{name:'Delete',exact:true}).click();
    await su.page.getByRole('dialog').getByRole('button',{name:'Yes, delete'}).click();
    await toast(su.page).getByText('Moved to the Recycle Bin.').waitFor({timeout:60000});
    await su.page.goto(`${origin}/en/admin/recycle-bin`,{waitUntil:'domcontentloaded',timeout:180000});
    await su.page.locator('h1').filter({hasText:'Recycle Bin'}).waitFor({timeout:60000});
    const binRow=su.page.locator('table.admin-table tbody tr').filter({hasText:TITLES.bin});
    await binRow.waitFor({timeout:60000});
    assert.match(await binRow.innerText(),/([0-9]+|[০-৯]+) days left/,'the bin shows days left before the purge');
    await su.page.locator('select[name=kind]').selectOption('editorial');
    await su.page.getByRole('button',{name:'Search',exact:true}).click();
    await su.page.waitForURL(/kind=editorial/,{timeout:60000});
    await su.page.locator('table.admin-table tbody tr').filter({hasText:TITLES.bin}).waitFor({timeout:60000});
    await su.page.locator('input[name=q]').fill('বিন রিস্টোর');
    await su.page.getByRole('button',{name:'Search',exact:true}).click();
    await su.page.waitForURL(/q=/,{timeout:60000});
    assert.equal(await su.page.locator('table.admin-table tbody tr').count(),1,'search narrows the bin to the one record');
    await su.page.locator('table.admin-table tbody tr').getByRole('button',{name:'Restore',exact:true}).click();
    await toast(su.page).getByText('Restored.').waitFor({timeout:60000});
    await su.page.locator('table.admin-table tbody tr').filter({hasText:TITLES.bin}).waitFor({state:'detached',timeout:60000});
    assert.equal((await editorialByTitle(TITLES.bin)).deletedAt,null,'Restore from the bin cleared deletedAt');

    // ── 6. Delete forever: super admin only, exact name typed ────────────────────────────────
    await su.page.goto(`${origin}/en/admin/content?kind=blog`,{waitUntil:'domcontentloaded',timeout:180000});
    await row(su.page,EN.forever).getByRole('button',{name:'Delete',exact:true}).click();
    await su.page.getByRole('dialog').getByRole('button',{name:'Yes, delete'}).click();
    await toast(su.page).getByText('Moved to the Recycle Bin.').waitFor({timeout:60000});
    await su.page.goto(`${origin}/en/admin/recycle-bin`,{waitUntil:'domcontentloaded',timeout:180000});
    const foreverRow=su.page.locator('table.admin-table tbody tr').filter({hasText:TITLES.forever});
    await foreverRow.waitFor({timeout:60000});
    await foreverRow.getByRole('button',{name:'Delete forever',exact:true}).click();
    const foreverDialog=su.page.getByRole('dialog');
    await foreverDialog.waitFor();
    assert.match(await foreverDialog.locator('h2').innerText(),new RegExp(TITLES.forever.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),'the forever dialog names the item');
    await foreverDialog.locator('input[name=confirmName]').fill('wrong name on purpose');
    await foreverDialog.getByRole('button',{name:'Delete forever',exact:true}).click();
    await toast(su.page).getByText('The name did not match, so nothing was deleted.').waitFor({timeout:60000});
    assert.equal(await stored(SLUGS.forever),1,'a mistyped name destroys nothing');
    await foreverRow.getByRole('button',{name:'Delete forever',exact:true}).click();
    await foreverDialog.locator('input[name=confirmName]').fill(TITLES.forever);
    await foreverDialog.getByRole('button',{name:'Delete forever',exact:true}).click();
    await toast(su.page).getByText('Deleted forever.').waitFor({timeout:60000});
    await foreverRow.waitFor({state:'detached',timeout:60000});
    assert.equal(await stored(SLUGS.forever),0,'Delete forever removed the row from storage');

    // ── 6b. the client-fetched lists (lecture sheets) use the same dialog and Undo ───────────
    const sheetTitle='রিসাইকেল নমুনা শিট';
    const pdf=Buffer.from('%PDF-1.4\n% synthetic recycle sample\n%%EOF');
    const created=await su.context.request.post(`${origin}/api/admin/public-sheets`,{multipart:{
      titleBn:sheetTitle,titleEn:'Recycle sample sheet',descriptionBn:'',descriptionEn:'',className:'',subject:'',
      file:{name:'recycle-sample.pdf',mimeType:'application/pdf',buffer:pdf},
    }});
    assert.equal(created.status(),201,await created.text());
    const sheetId=(await created.json()).id;
    await su.page.goto(`${origin}/en/admin/public-sheets`,{waitUntil:'domcontentloaded',timeout:180000});
    const sheetCard=su.page.locator('article.sheet-admin-item').filter({hasText:sheetTitle});
    await sheetCard.waitFor({timeout:60000});
    await sheetCard.getByRole('button',{name:'Delete',exact:true}).click();
    const sheetDialog=su.page.getByRole('dialog');
    await sheetDialog.waitFor();
    assert.match(await sheetDialog.locator('h2').innerText(),/Recycle sample sheet/,'the sheet dialog names the sheet, not "this item"');
    assert.match(await sheetDialog.locator('p').first().innerText(),/Recycle Bin for 30 days/);
    await sheetDialog.getByRole('button',{name:'Yes, delete'}).click();
    await toast(su.page).getByText('Moved to the Recycle Bin.').waitFor({timeout:60000});
    await sheetCard.waitFor({state:'detached',timeout:60000});
    assert.ok((await mongoose.connection.db.collection('publicsheets').countDocuments({_id:new mongoose.Types.ObjectId(sheetId),deletedAt:{$type:'date'}}))===1,'the sheet is binned');
    await toast(su.page).getByRole('button',{name:'Undo',exact:true}).click();
    await toast(su.page).getByText('Restored.').waitFor({timeout:60000});
    await sheetCard.waitFor({timeout:60000});
    assert.equal(await mongoose.connection.db.collection('publicsheets').countDocuments({_id:new mongoose.Types.ObjectId(sheetId),deletedAt:{$type:'date'}}),0,'Undo brought the sheet back into the client-fetched list');

    // ── 8a. Bangla strings and Bangla digits on the bin page ─────────────────────────────────
    await su.page.goto(`${origin}/bn/admin/recycle-bin`,{waitUntil:'domcontentloaded',timeout:180000});
    await su.page.locator('h1').filter({hasText:'রিসাইকেল বিন'}).waitFor({timeout:60000});
    assert.match(await su.page.locator('select[name=kind]').innerText(),/ব্লগ\/নোটিশ\/ভিডিও/,'the type filter is translated');

    // ── 8b. no overflow at 360 / 768 / 1440 on both pages ────────────────────────────────────
    for(const width of [360,768,1440]){
      for(const path of ['/en/admin/content?kind=blog','/en/admin/recycle-bin','/en/admin/students/classes']){
        await su.page.setViewportSize({width,height:900});
        await su.page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:180000});
        const size=await su.page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
        assert.ok(size.scroll<=size.client+1,`horizontal overflow at ${width}px on ${path}: ${JSON.stringify(size)}`);
      }
    }
    assert.deepEqual(su.errors,[],`page errors as super admin: ${su.errors.join(' | ')}`);
    await su.context.close();

    // ── 7. permissions: staff archives but never deletes; content_editor has neither ──────────
    const staff=await signIn('staff',360);
    await staff.page.goto(`${origin}/en/admin/content?kind=blog`,{waitUntil:'domcontentloaded',timeout:180000});
    assert.ok(staff.page.url().includes('/admin/content'),`staff must reach the content list; landed on ${staff.page.url()}`);
    assert.equal(await staff.page.getByRole('button',{name:'Delete',exact:true}).count(),0,'staff sees no Delete anywhere on the list');
    assert.equal(await staff.page.locator('.admin-bulk-bar').count(),0,'staff gets no bulk delete bar');
    assert.ok(await staff.page.getByRole('button',{name:'Archive',exact:true}).first().isVisible(),'staff can archive');
    await staff.page.goto(`${origin}/en/admin/recycle-bin`,{waitUntil:'domcontentloaded',timeout:180000});
    assert.ok(staff.page.url().includes('/admin/recycle-bin'),`staff must reach the Recycle Bin; landed on ${staff.page.url()}`);
    assert.ok(await staff.page.getByRole('button',{name:'Restore',exact:true}).first().isVisible(),'staff can restore');
    assert.equal(await staff.page.getByRole('button',{name:'Delete forever',exact:true}).count(),0,'Delete forever is Super Admin only');
    await staff.page.goto(`${origin}/en/admin/students/classes`,{waitUntil:'domcontentloaded',timeout:180000});
    assert.equal(await staff.page.getByRole('button',{name:'Delete',exact:true}).count(),0,'staff sees no Delete on class management either');
    assert.deepEqual(staff.errors,[],`page errors as staff: ${staff.errors.join(' | ')}`);
    await staff.context.close();

    const editor=await signIn('content_editor',360);
    await editor.page.goto(`${origin}/en/admin/content?kind=blog`,{waitUntil:'domcontentloaded',timeout:180000});
    assert.ok(editor.page.url().includes('/admin/content'),`content_editor must reach the blog list; landed on ${editor.page.url()}`);
    assert.equal(await editor.page.getByRole('button',{name:'Delete',exact:true}).count(),0,'content_editor sees no Delete');
    assert.equal(await editor.page.getByRole('button',{name:'Archive',exact:true}).count(),0,'content_editor sees no Archive either — archiving is the staff floor');
    await editor.page.goto(`${origin}/en/admin/recycle-bin`,{waitUntil:'domcontentloaded',timeout:180000});
    assert.ok(!editor.page.url().includes('/admin/recycle-bin'),`content_editor must be kept out of the Recycle Bin; landed on ${editor.page.url()}`);
    await editor.context.close();

    // ── 9. audit trail ───────────────────────────────────────────────────────────────────────
    for(const action of ['recycle.delete:editorial','recycle.restore:editorial','recycle.purge:editorial','recycle.archive:classGroup']){
      assert.ok(await AdminAudit.countDocuments({action})>=1,`missing audit row for ${action}`);
    }
    assert.equal(await Editorial.countDocuments({...binFilter,slug:{$in:Object.values(SLUGS)}}),0,'every binned sample was restored or purged; nothing is left behind');
    assert.equal(await CenterClassGroup.countDocuments(binFilter),0,'the archived class was never binned');

    console.log('Recycle Bin UI: named 30-day ConfirmDialog, delete + Undo (row and public page), bulk select + delete + Undo, blocked delete showing "2 student(s) use this class" with a working Archive, delete + restore from the bin with type filter and search, Delete forever gated on the typed name and on Super Admin, the same dialog and Undo on the client-fetched lecture-sheet list, staff able to archive and restore but never to delete, content_editor seeing no destructive control, no overflow at 360/768/1440, no page errors, and an audit row per move — against the disposable test database.');
  }finally{
    await browser.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
}
run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
