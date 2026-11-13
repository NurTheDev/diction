/**
 * R2.6 in the browser: the SMS centre. Proves the settings form saves (and that the auto-send
 * toggles stay OFF unless they are ticked), the operator's own test message is sent and logged,
 * an invalid number is refused, a template edit is stored and marked edited, an explicit retry
 * re-sends only the failed rows, the history filters work, staff cannot reach any of it, and no
 * credential ever appears in the served HTML. Runs against the disposable test database.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {chromium} from 'playwright';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {AdminAudit} from '../src/models/AdminAudit';
import {CenterClassGroup,CenterStudent,CenterSettings,CenterSmsBatch,CenterSmsLog,CenterSmsTemplate} from '../src/models/CenterRecords';

async function run(){
  await preflight({mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,test:'tests/sms-browser.integration.ts — start the app first, then run it with TEST_ORIGIN and TEST_MONGO_URI'});
  const shared=process.env.TEST_ORIGIN?process.env.TEST_MONGO_URI:null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){
    for(const collection of await mongoose.connection.db!.listCollections().toArray()){
      await mongoose.connection.db!.collection(collection.name).deleteMany({}).catch(()=>{});
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
  const accounts:{[role:string]:string}={};
  for(const role of ['admin','staff']){
    accounts[role]=`sms-${role}@example.test`;
    await User.create({name:`Synthetic ${role}`,email:accounts[role],passwordHash:hash,role,active:true,phone:role==='admin'?'01711000000':''});
  }
  const adminId=String((await User.findOne({email:accounts.admin}).lean<{_id:unknown}>())!._id);

  // Seed: settings, one class, one student, and a partially failed batch so the retry path is real.
  await CenterSettings.create({key:'main',smsUnitCost:0.5,quietStart:'21:00',quietEnd:'07:00',institutePhone:'01711000000',autoReceipt:false,autoResult:false,autoDue:false,autoDueDay:10});
  const group=await CenterClassGroup.create({name:{bn:'এসএমএস ক্লাস',en:'SMS Class'},academicYear:2026});
  const student=await CenterStudent.create({studentId:'SYNTH-SMS-UI',name:{bn:'নমুনা শিক্ষার্থী'},classGroup:group._id,guardianPhone:'01711111111',startMonth:{year:2026,month:1},feeHistory:[{effectiveFrom:{year:2026,month:1},amount:1000}]});
  const batch=await CenterSmsBatch.create({purpose:'due_reminder',templateKey:'due_reminder',createdBy:adminId,audience:'guardian',recipientCount:2,segmentCount:2,estimatedCost:1,sentCount:1,failedCount:1,skippedCount:0,status:'partial'});
  await CenterSmsLog.insertMany([
    {batch:batch._id,student:student._id,phone:'01711111111',message:'ডিকশন কোচিং: পাঠানো বার্তা',segments:1,cost:0.5,templateKey:'due_reminder',month:'2026-03',status:'sent',sentAt:new Date(),providerCode:'202',providerMessage:'এসএমএস জমা হয়েছে (প্রেরণ নিশ্চিত নয়)'},
    {batch:batch._id,student:student._id,phone:'01722222222',message:'ডিকশন কোচিং: ব্যর্থ বার্তা',segments:1,cost:0.5,templateKey:'due_reminder',month:'2026-03',status:'failed',providerCode:'1007',providerMessage:'ব্যালেন্স অপর্যাপ্ত',reason:'1007'},
  ]);

  const browser=await chromium.launch();
  try{
    async function signIn(role:string,width=1440){
      const context=await browser.newContext({viewport:{width,height:900}});
      const notes:string[]=[];
      let session:any=null;
      for(let attempt=1;attempt<=3&&!session?.user;attempt++){
        const csrf=await (await context.request.get(`${origin}/api/auth/csrf`)).json();
        const form={csrfToken:csrf.csrfToken,identifier:accounts[role],password,callbackUrl:`${origin}/en/admin`};
        const headers={origin,'content-type':'application/x-www-form-urlencoded'};
        const callback=await context.request.post(`${origin}/api/auth/callback/credentials`,{timeout:180000,headers,form}).catch(()=>null);
        session=await context.request.get(`${origin}/api/auth/session`).then(r=>r.json()).catch(()=>null);
        notes.push(`attempt ${attempt}: callback ${callback?callback.status():'error'}, session ${JSON.stringify(session).slice(0,120)}`);
        if(!session?.user)await new Promise(resolve=>setTimeout(resolve,2000));
      }
      if(!session?.user)throw Error(`sign-in as ${role} failed — ${notes.join(' | ')}`);
      const page=await context.newPage(),errors:string[]=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('dialog',dialog=>dialog.accept());
      return {context,page,errors};
    }

    const boss=await signIn('admin');
    const audits=(action:string)=>AdminAudit.countDocuments({action});

    // 1. The page renders every section the spec lists, in the page's own language.
    await boss.page.goto(`${origin}/en/admin/sms`,{waitUntil:'domcontentloaded',timeout:180000});
    await boss.page.locator('h1',{hasText:'SMS'}).first().waitFor({timeout:60000});
    for(const heading of ['Connection','This month','Settings','Test message','Templates','Batches','History']){
      await boss.page.locator(`h2:has-text("${heading}")`).first().waitFor({state:'visible',timeout:30000});
    }
    await boss.page.locator('dt:has-text("Provider")').waitFor({state:'visible',timeout:30000});
    for(const label of ['Credentials','Sending gate','Balance']){
      await boss.page.locator(`dt:has-text("${label}")`).first().waitFor({state:'visible',timeout:30000});
    }
    assert.match(await boss.page.locator('dd').first().innerText(),/mock|bulksmsbd/,'the provider name is shown');

    // 2. No credential can reach the browser. The check is a whitelist of the fields this page is
    //    meant to render — Next.js adds its own hidden server-action inputs ($ACTION_ID_…,
    //    $ACTION_KEY) and the retry form carries a batch ObjectId, none of which is a secret, so a
    //    blanket "nothing token-shaped" rule would fail on framework internals instead of a leak.
    const html=await boss.page.content();
    assert.ok(!/(api_?key|apikey|sender_?id)\s*[=:]\s*["']?[A-Za-z0-9_-]{12,}/i.test(html),'no credential value is rendered in the HTML');
    assert.ok(!html.includes('BULKSMSBD_API_KEY='),'the key is named as missing, never shown with a value');
    // Scoped to this page's panels: a layout-level form (sign-out, digit toggle) is not our concern.
    const fields=await boss.page.locator('section.admin-panel input,section.admin-panel textarea,section.admin-panel select').evaluateAll(nodes=>nodes.map(node=>({name:(node as HTMLInputElement).name||'',value:(node as HTMLInputElement).value||''})));
    const names=fields.map(field=>field.name).filter(Boolean);
    const ours=names.filter(name=>!name.startsWith('$')&&name!=='csrfToken');
        // Settings, the test number, the template editor, the batch retry id, the history filter and
    // the class picker that feeds the "new message" dialog.
    const expectedNames=['smsUnitCost','quietStart','quietEnd','institutePhone','autoDueDay','autoReceipt','autoResult','autoDue','phone','key','name','body','active','batchId','status','template','q','smsClass','problemId'];
    assert.deepEqual([...new Set(ours.filter(name=>!expectedNames.includes(name)))].sort(),[],'the page renders only the fields it means to');
    assert.deepEqual(ours.filter(name=>/api_?key|sender_?id|secret|password|token/i.test(name)),[],'no credential field is rendered at all — credentials come from the environment only');
    // And every field we do render holds only the shape it is supposed to hold.
    const shapes:Record<string,RegExp>={smsClass:/^[a-f\d]{24}$/i,problemId:/^[a-f\d]{24}$/i,smsUnitCost:/^\d+(\.\d+)?$/,quietStart:/^([01]\d|2[0-3]):[0-5]\d$/,quietEnd:/^([01]\d|2[0-3]):[0-5]\d$/,institutePhone:/^$|^01[3-9]\d{8}$/,autoDueDay:/^\d{1,2}$/,phone:/^01[3-9]\d{8}$/,batchId:/^[a-f\d]{24}$/i};
    for(const field of fields){
      const shape=shapes[field.name];
      if(shape)assert.match(field.value,shape,`${field.name} holds an unexpected value`);
    }

    // 3. Saving settings persists exactly what was entered, and unticked auto-send stays OFF.
    await boss.page.locator('input[name="smsUnitCost"]').fill('0.75');
    await boss.page.locator('input[name="quietStart"]').fill('22:00');
    await boss.page.locator('input[name="quietEnd"]').fill('06:00');
    await boss.page.locator('input[name="institutePhone"]').fill('01811222333');
    await boss.page.locator('input[name="autoDueDay"]').fill('12');
    await boss.page.locator('input[name="autoReceipt"]').check();
    await boss.page.locator('form:has(input[name="smsUnitCost"]) button').click();
    await boss.page.locator('p.admin-feedback:has-text("Saved.")').first().waitFor({state:'visible',timeout:60000});
    const saved=await CenterSettings.findOne({key:'main'}).lean<any>();
    assert.equal(saved.smsUnitCost,0.75,'the unit cost is stored');
    assert.equal(saved.quietStart,'22:00');
    assert.equal(saved.quietEnd,'06:00');
    assert.equal(saved.institutePhone,'01811222333','the institute number is normalized and stored');
    assert.equal(saved.autoDueDay,12);
    assert.equal(saved.autoReceipt,true,'the ticked toggle turned on');
    assert.equal(saved.autoResult,false,'an unticked toggle stays OFF');
    assert.equal(saved.autoDue,false,'an unticked toggle stays OFF');
    assert.equal(await audits('sms.settings'),1,'saving the settings writes one audit row');

    // 4. A rejected value is refused with a readable reason and changes nothing.
    await boss.page.locator('input[name="institutePhone"]').fill('12345');
    await boss.page.locator('form:has(input[name="smsUnitCost"]) button').click();
    await boss.page.locator('p.admin-feedback.error').first().waitFor({state:'visible',timeout:60000});
    assert.equal((await CenterSettings.findOne({key:'main'}).lean<any>()).institutePhone,'01811222333','a refused save changes nothing');

    // 5. The test message goes to the operator's own number and is logged.
    await boss.page.locator('input[name="institutePhone"]').fill('01811222333');
    await boss.page.locator('form:has(input[name="smsUnitCost"]) button').click();
    await boss.page.locator('p.admin-feedback:has-text("Saved.")').first().waitFor({state:'visible',timeout:60000});
    await boss.page.locator('input[name="phone"]').fill('01711000000');
    await boss.page.locator('form:has(input[name="phone"]) button').click();
    await boss.page.locator('p.admin-feedback:has-text("Test message submitted.")').first().waitFor({state:'visible',timeout:60000});
    const testLog=await CenterSmsLog.findOne({templateKey:'test'}).lean<any>();
    assert.ok(testLog,'the test message is logged');
    assert.equal(testLog.phone,'01711000000');
    assert.equal(testLog.status,'sent');
    assert.ok(!testLog.student,'a test message is not attached to any student');
    assert.equal(await audits('sms.test'),1);

    // 6. An invalid number is refused and logs nothing.
    await boss.page.locator('input[name="phone"]').fill('12345');
    await boss.page.locator('form:has(input[name="phone"]) button').click();
    await boss.page.locator('form:has(input[name="phone"]) p.admin-feedback.error').first().waitFor({state:'visible',timeout:60000});
    assert.equal(await CenterSmsLog.countDocuments({templateKey:'test'}),1,'a refused test message logs nothing');

    // 7. A template edit is stored, marked edited, and the chips are listed for the operator.
    await boss.page.locator('article.admin-template:has(input[name="key"][value="due_reminder"]) textarea[name="body"]').fill('ডিকশন কোচিং: {student_name} এর {due_amount} টাকা বকেয়া। যোগাযোগ: {institute_phone}');
    await boss.page.locator('article.admin-template:has(input[name="key"][value="due_reminder"]) button').click();
    await boss.page.locator('article.admin-template:has(input[name="key"][value="due_reminder"]) p.admin-feedback:has-text("Saved.")').first().waitFor({state:'visible',timeout:60000});
    const template=await CenterSmsTemplate.findOne({key:'due_reminder'}).lean<any>();
    assert.ok(template,'the edited template is stored');
    assert.match(template.body.bn,/বকেয়া/);
    assert.deepEqual([...template.variables].sort(),['due_amount','institute_phone','student_name'],'the chips are derived from the body, never hand-copied');
    await boss.page.reload({waitUntil:'domcontentloaded'});
    await boss.page.locator('article.admin-template:has(input[name="key"][value="due_reminder"]) .admin-badge:has-text("edited")').waitFor({state:'visible',timeout:60000});

    // 8. The history filter shows only what was asked for.
    await boss.page.goto(`${origin}/en/admin/sms?status=failed`,{waitUntil:'domcontentloaded',timeout:180000});
    assert.equal(await boss.page.locator('section:has(h2:has-text("History")) table.admin-table tbody tr').count(),1,'one failed row');
    // Numbers render in the account's digit preference (Bangla by default), so normalize before
    // matching — the assertion is about which row is shown, not about the digit glyphs.
    const historyText=(await boss.page.locator('section:has(h2:has-text("History")) table.admin-table tbody').innerText()).replace(/[০-৯]/g,c=>String('০১২৩৪৫৬৭৮৯'.indexOf(c)));
    assert.match(historyText,/01722222222/,'the filtered row is the failed one');
    assert.ok(!historyText.includes('01711111111'),'the sent row is filtered out');

    // 9. Retry re-sends only the failed row, and the button then disappears.
    const retryButton=boss.page.locator('section:has(h2:has-text("Batches")) form button');
    await retryButton.waitFor({state:'visible',timeout:60000});
    await retryButton.click();
    // A successful retry removes the button entirely — the batch has no failures left — and the
    // client component unmounts with it, so there is no feedback span to wait for. The button
    // disappearing IS the operator-visible outcome, and it is server-rendered, so anchor on it
    // (the same lesson as R1.4: never anchor an absence assertion to client state).
    await boss.page.waitForSelector('section:has(h2:has-text("Batches")) form button',{state:'detached',timeout:60000});
    for(let i=0;i<60;i++){
      const row=await CenterSmsLog.findOne({phone:'01722222222'}).lean<any>();
      if(row?.status==='sent')break;
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    const retried=await CenterSmsLog.findOne({phone:'01722222222'}).lean<any>();
    assert.equal(retried!.status,'sent','the failed row was re-sent');
    assert.equal(await CenterSmsLog.countDocuments({batch:batch._id,status:'failed'}),0);
    assert.equal(await CenterSmsLog.countDocuments({batch:batch._id,status:'sent'}),2,'only the failed row changed; the sent row was not duplicated');
    assert.equal(await audits('sms.retry'),1,'a retry is audited');
    await boss.page.reload({waitUntil:'domcontentloaded'});
    await boss.page.locator('h2:has-text("Batches")').waitFor({timeout:60000});
    assert.equal(await boss.page.locator('section:has(h2:has-text("Batches")) form button').count(),0,'a batch with no failures offers no retry');
    const batchText=(await boss.page.locator('section:has(h2:has-text("Batches")) table.admin-table tbody').innerText()).replace(/[০-৯]/g,c=>String('০১২৩৪৫৬৭৮৯'.indexOf(c)));
    assert.match(batchText,/done/,'the batch is marked done once nothing is left to retry');
    assert.match(batchText,/2 \/ 0/,'and its counts read 2 sent / 0 failed');
    await boss.page.goto(`${origin}/en/admin/sms?status=failed`,{waitUntil:'domcontentloaded',timeout:180000});
    await boss.page.locator('section:has(h2:has-text("History")) p.admin-empty').first().waitFor({state:'visible',timeout:60000});

    // 10. The Bangla page renders the same screen without errors.
    await boss.page.goto(`${origin}/bn/admin/sms`,{waitUntil:'domcontentloaded',timeout:180000});
    await boss.page.locator('h1:has-text("এসএমএস")').first().waitFor({state:'visible',timeout:60000});
    await boss.page.locator('h2:has-text("ইতিহাস")').first().waitFor({state:'visible',timeout:30000});

    // 11. No horizontal overflow at 360 or 1440.
    for(const width of [360,1440]){
      const shot=await signIn('admin',width);
      await shot.page.goto(`${origin}/en/admin/sms`,{waitUntil:'domcontentloaded',timeout:180000});
      await shot.page.locator('h1',{hasText:'SMS'}).first().waitFor({timeout:60000});
      const overflow=await shot.page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
      assert.ok(overflow<=1,`no horizontal overflow at ${width}px (overflowed by ${overflow}px)`);
      assert.deepEqual(shot.errors,[],`page errors at ${width}px: ${shot.errors.join(' | ')}`);
      await shot.context.close();
    }

    // 12. Staff cannot reach the SMS centre: no nav entry and no settings form.
    const staff=await signIn('staff');
    await staff.page.goto(`${origin}/en/admin`,{waitUntil:'domcontentloaded',timeout:180000});
    await staff.page.waitForTimeout(2000);
    assert.equal(await staff.page.locator('nav.admin-nav a[href*="/admin/sms"]').count(),0,'staff see no SMS link');
    await staff.page.goto(`${origin}/en/admin/sms`,{waitUntil:'domcontentloaded',timeout:180000});
    await staff.page.waitForTimeout(2000);
    assert.equal(await staff.page.locator('input[name="smsUnitCost"]').count(),0,'staff never see the SMS settings form');
    assert.equal(await staff.page.locator('form:has(input[name="phone"]) button').count(),0,'staff cannot send a test message');

    assert.deepEqual(boss.errors,[],`page errors as admin: ${boss.errors.join(' | ')}`);
    await boss.context.close();
    await staff.context.close();
  }finally{
    await browser.close();
    await mongoose.connection.dropDatabase().catch(()=>{});
    await mongoose.disconnect();
    await mongo.stop();
  }

  console.log('SMS centre: the settings form saves and unticked auto-send stays off, an invalid institute number is refused without changing anything, a test message reaches only the operator’s own number and is logged, a template edit is stored with derived chips and marked edited, the history filter isolates failed rows, an explicit retry re-sends only those rows and then disappears, the Bangla page matches, nothing overflows at 360 or 1440, staff see no SMS link or form, and no credential appears in the served HTML.');
}

run().catch(error=>{console.error(error);process.exit(1)});
