/**
 * R2.7 in the browser: ONE reusable SendSmsDialog. Proves the four steps the spec lists — recipients
 * with skipped numbers and their reasons, the guardian/student/both choice and one-message-per-phone;
 * the template picker with variable chips; a live preview of the first three messages with
 * characters, segments and cost against the balance; and ONE green send button with progress, a
 * result summary and no retry offered when nothing failed. It also proves the dialog is the same
 * component on every screen R2 can reach: the due list, a student profile, the student list's bulk
 * action, the payment success screen and the SMS page — that a second click sends no second request,
 * that the figures on screen are the figures in the database, and that staff get none of it.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {chromium} from 'playwright';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {CenterClassGroup,CenterStudent,CenterSettings,CenterSmsBatch,CenterSmsLog} from '../src/models/CenterRecords';
import {dhakaCalendar} from '../src/lib/center/month-status';
import {liveClassDues} from '../src/lib/center/dues-query';
import {formatNumber} from '../src/lib/admin/format';

/** Phones and amounts are rendered in the account's digit preference, Bangla by default. */
const ascii=(text:string):string=>text.replace(/[০-৯]/g,c=>String('০১২৩৪৫৬৭৮৯'.indexOf(c)));

async function run(){
  await preflight({mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,test:'tests/sms-dialog-browser.integration.ts — start the app first, then run it with TEST_ORIGIN and TEST_MONGO_URI'});
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
    accounts[role]=`dialog-${role}@example.test`;
    await User.create({name:`Synthetic ${role}`,email:accounts[role],passwordHash:hash,role,active:true,phone:role==='admin'?'01733330000':''});
  }

  // Dues must be real on whatever day CI runs, so the fee history starts three Dhaka months back.
  const today=dhakaCalendar(new Date());
  const back=new Date(Date.UTC(today.year,today.month-1-3,1));
  const startMonth={year:back.getUTCFullYear(),month:back.getUTCMonth()+1};
  const admissionDate=`${startMonth.year}-${String(startMonth.month).padStart(2,'0')}-05`;

  await CenterSettings.create({key:'main',smsUnitCost:0.5,quietStart:'00:00',quietEnd:'00:00',institutePhone:'01733330000',dueDay:10,autoReceipt:false,autoResult:false,autoDue:false,autoDueDay:10});
  const group=await CenterClassGroup.create({name:{bn:'ডায়ালগ ক্লাস',en:'Dialog Class'},academicYear:today.year});
  const fee=(amount:number)=>[{effectiveFrom:startMonth,amount}];
  const common={classGroup:group._id,startMonth,admissionDate,guardianName:'অভিভাবক'};
  const payer=await CenterStudent.create({studentId:'DLG-1',name:{bn:'প্রদানকারী শিক্ষার্থী'},...common,guardianPhone:'01733333331',feeHistory:fee(1000)});
  const siblingA=await CenterStudent.create({studentId:'DLG-2',name:{bn:'ভাই শিক্ষার্থী'},...common,guardianPhone:'01733333332',feeHistory:fee(1000)});
  const siblingB=await CenterStudent.create({studentId:'DLG-3',name:{bn:'বোন শিক্ষার্থী'},...common,guardianPhone:'01733333332',feeHistory:fee(500)});
  await CenterStudent.create({studentId:'DLG-4',name:{bn:'সরানো শিক্ষার্থী'},...common,guardianPhone:'01733333334',feeHistory:fee(1000),status:'removed',removal:{reason:'synthetic',removedAt:new Date(),purgeAt:new Date(Date.now()+365*86400000)}});
  await CenterStudent.create({studentId:'DLG-5',name:{bn:'অপ্টআউট শিক্ষার্থী'},...common,guardianPhone:'01733333335',feeHistory:fee(1000),smsOptOut:true});
  await CenterStudent.create({studentId:'DLG-6',name:{bn:'হোল্ড শিক্ষার্থী'},...common,guardianPhone:'01733333336',feeHistory:fee(1000),status:'on_hold',holds:[{start:{year:today.year,month:today.month},end:{year:today.year,month:today.month},reason:'synthetic',recordedBy:(await User.findOne({email:accounts.admin}).lean<any>())._id}]});
  await CenterStudent.create({studentId:'DLG-7',name:{bn:'নম্বরহীন শিক্ষার্থী'},...common,guardianPhone:'',feeHistory:fee(1000)});
  const studentPhoneOnly=await CenterStudent.create({studentId:'DLG-8',name:{bn:'নিজের নম্বরের শিক্ষার্থী'},...common,guardianPhone:'',studentPhone:'01733333338',feeHistory:fee(1000)});

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
    const {page}=boss;
    /** Every send request the dialog makes, so a second click can be proved to make no second send. */
    const sendRequests:string[]=[];
    page.on('request',request=>{
      if(!request.url().endsWith('/api/admin/sms/send'))return;
      const body=request.postData()||'';
      if(body.includes('"mode":"send"'))sendRequests.push(body);
    });
    let lastAnswer='no request yet';
    page.on('response',response=>{
      if(!response.url().endsWith('/api/admin/sms/send'))return;
      void response.text().then(text=>{lastAnswer=`${response.status()} ${text.slice(0,220)}`}).catch(()=>{lastAnswer=`${response.status()}`});
    });
    const dialog=page.locator('[data-sms-dialog]');
    const step=(n:number)=>page.locator(`[data-sms-step="${n}"]`);
    const summary=async()=>ascii(await page.locator('[data-sms-summary]').innerText());
    /** Wait for the debounced preview to land, and report what the endpoint said if it never does. */
    async function expectSummary(pattern:RegExp,why:string){
      for(let i=0;i<60&&!(await summary()).match(pattern);i++)await new Promise(resolve=>setTimeout(resolve,500));
      assert.match(await summary(),pattern,`${why} — last answer from /api/admin/sms/send: ${lastAnswer}`);
    }
    async function openDialog(path:string,label:string){
      await page.goto(`${origin}${path}`,{waitUntil:'domcontentloaded',timeout:180000});
      const trigger=page.locator('[data-sms-open]').first();
      await trigger.waitFor({state:'visible',timeout:60000});
      assert.match(await trigger.innerText(),new RegExp(label),'the entry point is labelled for the operator');
      await trigger.click();
      await dialog.waitFor({state:'visible',timeout:60000});
      await step(1).waitFor({state:'visible',timeout:60000});
    }
    async function toStep(n:number){
      for(let target=2;target<=n;target++){
        await page.locator('[data-sms-next]').click();
        await step(target).waitFor({state:'visible',timeout:60000});
      }
    }

    // 1. The due list offers "Send reminder", and step one counts exactly the numbers it will use.
    const duesUrl=`/bn/admin/students/dues?class=${group._id}`;
    await openDialog(duesUrl,'স্মারক পাঠান');
    await expectSummary(/মোট 2 নম্বর · 2 বার্তা/,'the due list counts two numbers: the payer and the two siblings sharing one phone');
    const skippedText=await page.locator('[data-sms-skipped]').innerText();
    assert.match(skippedText,/3টি নম্বর বাদ পড়েছে/,'three numbers are skipped and the operator is told');
    assert.match(skippedText,/অপ্ট-আউট/,'one reason is opt-out');
    assert.match(skippedText,/নম্বর নেই/,'another is a missing number');
    assert.ok(!skippedText.includes('সরানো শিক্ষার্থী'),'a removed student is never even counted');
    assert.ok(!skippedText.includes('হোল্ডে'),'and the DUE list has no held student, because the due list itself excludes them');

    // The recipient list is collapsible, and the sibling option changes the count.
    await page.locator('[data-sms-recipients-toggle]').click();
    const rows=page.locator('[data-sms-recipients] tbody tr');
    await rows.first().waitFor({state:'visible',timeout:30000});
    assert.equal(await rows.count(),2,'the collapsible list shows the messages that would go out');
    assert.match(ascii(await rows.nth(1).innerText()),/01733333332/,'the shared number is listed once');
    await page.locator('[data-sms-recipients-toggle]').click();

    await page.locator('input[name="smsGroupSiblings"]').click();
    await expectSummary(/মোট 3 নম্বর · 3 বার্তা/,'turning sibling grouping off makes the two children two messages');
    await page.locator('input[name="smsGroupSiblings"]').click();
    await expectSummary(/মোট 2 নম্বর/,'and turning it back on merges them again');

    await page.locator('input[name="smsTarget"][value="student"]').check();
    await expectSummary(/মোট 1 নম্বর/,'only one student has their own phone');
    await page.locator('input[name="smsTarget"][value="guardian"]').check();
    await expectSummary(/মোট 2 নম্বর/,'the guardian choice is back');

    // 2. Step two: the template picker and the variable chips.
    await toStep(2);
    const templates=page.locator('input[name="smsTemplate"]');
    assert.ok(await templates.count()>=6,'the picker offers the shipped templates');
    assert.equal(await page.locator('input[name="smsTemplate"][value="due_reminder"]').isChecked(),true,'the caller chose the default template');
    const body=await page.locator('#sms-custom-text').inputValue();
    assert.match(body,/ডিকশন কোচিং/,'the Bangla body is shown even on a Bangla screen');
    assert.match(body,/\{student_name\}/,'with its chips unrendered, so the operator sees what will be substituted');
    const chips=page.locator('[data-sms-chip]');
    assert.equal(await chips.count(),9,'all nine spec variables are offered as chips');
    await page.locator('[data-sms-chip="receipt_no"]').click();
    assert.match(await page.locator('#sms-custom-text').inputValue(),/\{receipt_no\}/,'a chip is inserted into the text');
    assert.equal(await page.locator('input[name="smsTemplate"][value="custom"]').isChecked(),true,'and typing or chipping switches to the custom template');
    await page.locator('input[name="smsTemplate"][value="due_reminder"]').check();

    // 3. Step three: the live preview of the first messages, with the figures the spec asks for.
    await toStep(3);
    const previews=page.locator('[data-sms-preview]');
    await previews.first().waitFor({state:'visible',timeout:60000});
    assert.equal(await previews.count(),2,'the first messages are previewed verbatim');
    const previewText=await page.locator('[data-sms-previews]').innerText();
    assert.match(previewText,/ডিকশন কোচিং/,'every message is the shipped Bangla body');
    assert.match(previewText,/প্রদানকারী শিক্ষার্থী/,'the student name was substituted');
    assert.match(previewText,/01733333332/,'and the shared number is previewed once, for both siblings');
    assert.ok(!previewText.includes('{'),'no chip survived into any message');
    const characters=Number(await page.locator('[data-sms-characters]').innerText());
    const messages=Number(await page.locator('[data-sms-messages]').innerText());
    const segments=Number(await page.locator('[data-sms-segments]').innerText());
    const cost=await page.locator('[data-sms-cost]').innerText();
    const balance=await page.locator('[data-sms-balance]').innerText();
    assert.ok(characters>50,'characters are counted');
    assert.equal(messages,2);
    assert.ok(segments>=messages,'a long Bangla body is split into 67-character segments');
    assert.equal(cost,`৳${(segments*0.5).toFixed(2)}`,'the estimated cost is segments times the stored unit cost');
    assert.match(balance,/৳\d/,'and the balance is shown beside it');
    assert.equal(await page.locator('[data-sms-low-balance]').count(),0,'no low-balance warning when the balance covers it');

    // 4. Step four: ONE green send button, progress, and a result summary.
    await toStep(4);
    const send=page.locator('[data-sms-send]');
    assert.equal(await send.count(),1,'exactly one send button');
    assert.ok((await send.getAttribute('class')||'').includes('sms-send'),'and it is the green one');
    assert.equal(await page.locator('.sms-foot button').count(),2,'the footer holds Back and Send only');
    await send.click();
    // A second click must not produce a second send request: the button is disabled the moment it is
    // clicked, and the requestId is the same anyway. The click may fail because the button is gone by
    // then, which is the point — either way only one request may have been made.
    await send.click({force:true,timeout:3000}).catch(()=>{});
    await page.locator('[data-sms-result]').waitFor({state:'visible',timeout:120000});
    const resultText=ascii(await page.locator('[data-sms-result]').innerText());
    assert.match(resultText,/পাঠানো হয়েছে/,'the result says it was sent');
    assert.match(resultText,/সফল: 2 · ব্যর্থ: 0 · বাদ: 3/,'with the real counts');
    assert.equal(sendRequests.length,1,'one send request for two clicks');
    assert.equal(await page.locator('[data-sms-retry]').count(),0,'a send with no failures offers no retry');
    assert.equal(await CenterSmsBatch.countDocuments(),1,'one batch');
    const sentRows=await CenterSmsLog.find({status:'sent'}).lean<any[]>();
    assert.equal(sentRows.length,3,'one durable row per (recipient, student), so the merged sibling message stays traceable to both children');
    assert.deepEqual(sentRows.map(row=>row.phone).sort(),['01733333331','01733333332','01733333332'],'while the guardian’s shared number still holds ONE message');
    assert.equal(new Set(sentRows.map(row=>row.message)).size,2,'two distinct messages went out, not three');
    assert.ok(sentRows.every(row=>row.segments>=1&&row.cost>=0.5),'each row carries its own segments and cost');
    assert.equal(await CenterSmsLog.countDocuments({status:'skipped',reason:'opted_out'}),0,'the opted-out student is counted on the batch but stored in no row — SmsLog.phone is required and must stay a real number');
    assert.equal(await CenterSmsLog.countDocuments({phone:'01733333335'}),0,'so the opted-out number appears nowhere in the log, and was never sent');
    assert.equal(await CenterSmsLog.countDocuments({phone:'01733333334'}),0,'the removed student appears nowhere');
    // The amount is live pricing, so the expectation is computed the way the app computes it instead
    // of being hardcoded: on whatever day CI runs, the guardian must be told the SUM for her number.
    const priced=await liveClassDues(String(group._id));
    const totalOf=(id:string):number=>priced.rows.find(row=>String(row.student._id)===id)?.total||0;
    const mergedTotal=formatNumber(totalOf(String(siblingA._id))+totalOf(String(siblingB._id)),'bn');
    const groupedRow=sentRows.find(row=>row.phone==='01733333332');
    assert.ok(groupedRow.message.includes(mergedTotal),`the sibling message quotes the summed total (${mergedTotal}), not one child's share`);
    assert.ok(groupedRow.message.includes('ভাই শিক্ষার্থী')&&groupedRow.message.includes('বোন শিক্ষার্থী'),'and names both children, so the guardian knows whose total it is');
    assert.equal(await page.locator('[data-sms-done]').count(),1,'the footer becomes Done once the result is in');
    assert.deepEqual(boss.errors,[],'no client-side error during the whole flow');

    // 5. The same dialog opens from a student profile.
    await openDialog(`/bn/admin/students/${payer._id}`,'এসএমএস');
    await expectSummary(/মোট 1 নম্বর/,'one profile is one student');
    assert.equal(await dialog.locator('h2').innerText(),'এসএমএস পাঠান','the caller names the dialog');
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden',timeout:30000});

    // 6. …and from the student list's bulk action, for exactly the ticked students.
    await page.goto(`${origin}/bn/admin/students`,{waitUntil:'domcontentloaded',timeout:180000});
    const boxes=page.locator('input[name="smsStudent"]');
    await boxes.first().waitFor({state:'visible',timeout:60000});
    assert.equal(await page.locator('[data-sms-open]').count(),0,'no bulk button before anything is ticked');
    // Rows are sorted by Bangla name, so tick two named students rather than two positions: the
    // payer and one sibling, who have different numbers and both have dues.
    const tick=async(name:string)=>{
      const row=page.locator('tbody tr').filter({hasText:name});
      await row.locator('input[name="smsStudent"]').check();
    };
    await tick('প্রদানকারী শিক্ষার্থী');
    await tick('বোন শিক্ষার্থী');
    const bulk=page.locator('[data-sms-open]').first();
    await bulk.waitFor({state:'visible',timeout:30000});
    assert.match(ascii(await bulk.innerText()),/নির্বাচিত 2 জনকে এসএমএস/,'the button says how many were chosen');
    await bulk.click();
    await dialog.waitFor({state:'visible',timeout:60000});
    await expectSummary(/মোট 2 নম্বর · 2 বার্তা/,'the selection, and only the selection, is counted');
    await toStep(2);
    await page.locator('[data-sms-back]').click();
    await step(1).waitFor({state:'visible',timeout:30000});
    assert.equal(await page.locator('[data-sms-back]').isDisabled(),true,'Back is disabled on the first step, so an operator can never step out of the dialog backwards');
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden',timeout:30000});

    // 7. The payment success screen offers the receipt message, pre-filled with that receipt.
    await page.goto(`${origin}/bn/admin/students/collect?student=${payer._id}`,{waitUntil:'domcontentloaded',timeout:180000});
    const dueMonth=page.locator('.daily-months button.daily-due').first();
    await dueMonth.waitFor({state:'visible',timeout:60000});
    await dueMonth.click();
    await page.locator('input[aria-label="ক্যাশবুক পৃষ্ঠা নম্বর"]').fill('9001');
    await page.locator('.daily-save').click();
    await page.locator('.daily-success').waitFor({state:'visible',timeout:120000});
    const receiptTrigger=page.locator('.daily-success [data-sms-open]');
    await receiptTrigger.waitFor({state:'visible',timeout:60000});
    assert.match(await receiptTrigger.innerText(),/রসিদ এসএমএস পাঠান/,'the success screen offers the receipt SMS');
    await receiptTrigger.click();
    await dialog.waitFor({state:'visible',timeout:60000});
    await expectSummary(/মোট 1 নম্বর/,'a receipt is one student');
    await toStep(2);
    assert.equal(await page.locator('input[name="smsTemplate"][value="payment_receipt"]').isChecked(),true,'the receipt template is already chosen');
    await toStep(3);
    assert.match(ascii(await page.locator('[data-sms-preview]').first().innerText()),/9001/,'and the receipt number is already in the message');
    await toStep(4);
    await page.locator('[data-sms-send]').click();
    await page.locator('[data-sms-result]').waitFor({state:'visible',timeout:120000});
    assert.match(ascii(await page.locator('[data-sms-result]').innerText()),/সফল: 1/,'one receipt message');
    const receiptRow=await CenterSmsLog.findOne({status:'sent',phone:'01733333331',templateKey:'payment_receipt'}).lean<any>();
    assert.ok(receiptRow,'the receipt message is durable');
    assert.match(ascii(receiptRow.message),/9001/,'the number the operator typed, in the digits the screen shows');
    assert.equal(String(receiptRow.student),String(payer._id),'and it is linked to the student');

    // 8. The SMS page's "new message" reaches a whole class, and asks for the one value it cannot know.
    await openDialog('/bn/admin/sms','নতুন বার্তা');
    await expectSummary(/মোট 3 নম্বর · 3 বার্তা/,'the whole class counts the payer, the merged siblings and the held student');
    const classSkips=await page.locator('[data-sms-skipped]').innerText();
    assert.match(classSkips,/অপ্ট-আউট/,'the opted-out number is still skipped');
    assert.match(classSkips,/নম্বর নেই/,'and so are the two with no guardian number');
    assert.ok(!classSkips.includes('হোল্ডে'),'but a notice is not about fees, so the held student is not skipped');
    await page.locator('[data-sms-recipients-toggle]').click();
    await page.locator('[data-sms-recipients] tbody tr').first().waitFor({state:'visible',timeout:30000});
    assert.match(ascii(await page.locator('[data-sms-recipients]').innerText()),/01733333336/,'the held student really is on the list for a non-fee message');
    await page.locator('[data-sms-recipients-toggle]').click();
    await toStep(2);
    assert.equal(await page.locator('input[name="smsTemplate"][value="notice"]').isChecked(),true,'a notice is the default for a new message');
    await page.locator('#sms-subject').waitFor({state:'visible',timeout:30000});
    await page.locator('#sms-subject').fill('বার্ষিক পরীক্ষার রুটিন');
    await toStep(3);
    for(let i=0;i<40&&!(await page.locator('[data-sms-preview]').first().innerText()).includes('বার্ষিক পরীক্ষার রুটিন');i++)await new Promise(resolve=>setTimeout(resolve,500));
    assert.match(await page.locator('[data-sms-preview]').first().innerText(),/বার্ষিক পরীক্ষার রুটিন/,'the subject the operator typed is in the preview');
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden',timeout:30000});

    // 9. English labels, a narrow screen, staff, and no credential in the served HTML.
    await page.goto(`${origin}/en/admin/students/dues?class=${group._id}`,{waitUntil:'domcontentloaded',timeout:180000});
    const enTrigger=page.locator('[data-sms-open]').first();
    await enTrigger.waitFor({state:'visible',timeout:60000});
    assert.match(await enTrigger.innerText(),/Send reminder/,'the entry point follows the page language');
    await enTrigger.click();
    await dialog.waitFor({state:'visible',timeout:60000});
    assert.equal(await dialog.locator('h2').innerText(),'Send due reminders');
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden',timeout:30000});

    const narrow=await signIn('admin',360);
    await narrow.page.goto(`${origin}/bn/admin/students/dues?class=${group._id}`,{waitUntil:'domcontentloaded',timeout:180000});
    await narrow.page.locator('[data-sms-open]').first().click();
    await narrow.page.locator('[data-sms-dialog]').waitFor({state:'visible',timeout:60000});
    const overflow=await narrow.page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
    assert.ok(overflow.scroll<=overflow.client+1,`the open dialog does not overflow 360px (${overflow.scroll} vs ${overflow.client})`);
    assert.ok(await narrow.page.locator('[data-sms-next]').isVisible(),'and its controls stay reachable');
    await narrow.page.screenshot({path:'/home/user/.cache/screenshots/sms-dialog-360.png',fullPage:false}).catch(()=>{});
    await narrow.context.close();

    const html=await page.content();
    for(const needle of ['BULKSMSBD_API_KEY','sk-dialog','api_key='])assert.ok(!html.includes(needle),`the served HTML never mentions ${needle}`);

    const worker=await signIn('staff');
    await worker.page.goto(`${origin}/bn/admin/students/dues?class=${group._id}`,{waitUntil:'domcontentloaded',timeout:180000});
    assert.equal(await worker.page.locator('[data-sms-open]').count(),0,'staff get no send button');
    await worker.page.goto(`${origin}/bn/admin/sms`,{waitUntil:'domcontentloaded',timeout:180000});
    assert.equal(await worker.page.locator('[data-sms-open]').count(),0,'and no new-message control on the SMS page');
    await worker.context.close();

    console.log('SendSmsDialog: one reusable four-step dialog opened from the due list, a student profile, the student list’s bulk action, the payment success screen and the SMS page — step one counts the real numbers and lists every skipped one with its reason (opted out, no number, held for a fee message; a removed student is never counted), guardian/student/both and one-message-per-phone change exactly who is included, step two offers the templates with all nine variable chips, step three previews the first messages verbatim with characters, segments and cost against the balance, step four has one green send button that made a single request for two clicks and reported sent 2 / failed 0 / skipped 3, with one stored row per (recipient, student) so the merged sibling message is traceable to both children, a receipt send carries its own number and student, a class notice asks for its subject, nothing overflows at 360px, the labels follow the page language, staff get no control, and no credential reaches the browser.');
  }finally{
    await browser.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
}

run().catch(error=>{console.error(error);process.exit(1)});
