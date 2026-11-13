// @ts-nocheck -- R2 SendSmsDialog contract against a disposable database; synthetic records only.
/**
 * R2 · The dialog's server contract. One function, three modes, proved against a database with a
 * counting fake provider (no network, no real message ever leaves):
 *   a preview is read-only and reports recipients, skipped numbers with reasons, the first three
 *   messages, characters/segments/cost against the balance and a low-balance warning · sibling
 *   grouping on and off · guardian / student / both · the due list is DUE only · a receipt carries
 *   its own amount, month and number · an empty body or an unrendered chip is refused instead of
 *   sent · one requestId is one batch, so a double-click cannot send twice · "skip those" drops the
 *   students already messaged in 24 hours · retry re-sends only failed rows and refuses when there
 *   are none · quiet hours queue and the flush sends · the three auto-send toggles are OFF by
 *   default and idempotent when switched on · and no credential appears in any response or row.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {CenterClassGroup,CenterStudent,CenterSettings,CenterPayment,CenterSmsBatch,CenterSmsLog} from '../src/models/CenterRecords';
import {runSmsDialog,autoSendReceipt,autoSendClassDues,autoSendClassResults,runAutoDue,autoRequestId} from '../src/lib/center/sms-dialog';
import {flushQueuedSms} from '../src/lib/center/sms-send';
import {SMS_SKIP_REASONS} from '../src/lib/center/sms-recipients';
import {estimateSms} from '../src/lib/center/sms-provider';

const API_KEY='sk-dialog-integration-9a1c';
const SENDER_ID='DictionTestSender';
/** Every response the dialog returns, so one pass at the end can prove no credential leaked. */
const bodies=[];

function fakeProvider(answer={status:'submitted',code:'202'},balance=5000){
  const calls=[];
  return {
    calls,
    provider:{
      name:'mock',
      configured:true,
      async send(phone,message){calls.push({kind:'send',items:[{phone,message}]});return typeof answer==='function'?answer(calls.length):answer},
      async sendMany(items){calls.push({kind:'sendMany',items});return typeof answer==='function'?answer(calls.length):answer},
      async balance(){return {ok:true,balance}},
    },
    itemCount(){return calls.reduce((sum,call)=>sum+call.items.length,0)},
  };
}

/** Dhaka HH:MM some minutes from `base` — used to build a quiet window that certainly contains now. */
function dhakaClock(base:Date,offsetMinutes:number):string{
  const shifted=new Date(base.getTime()+offsetMinutes*60000);
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(shifted);
  return `${String(Number(parts.find(p=>p.type==='hour').value)%24).padStart(2,'0')}:${parts.find(p=>p.type==='minute').value}`;
}

async function run(){
  await preflight({mongo:true,test:'tests/sms-dialog.integration.ts — needs a MongoDB (or TEST_MONGO_URI from npm run test-mode)'});
  const shared=process.env.TEST_MONGO_URI||null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){for(const c of await mongoose.connection.db.listCollections().toArray()){await mongoose.connection.db.collection(c.name).deleteMany({}).catch(()=>{})}}
  process.env.BULKSMSBD_API_KEY=API_KEY;
  process.env.BULKSMSBD_SENDER_ID=SENDER_ID;
  process.env.SMS_PROVIDER='mock';

  try{
    // A fixed "now" in Dhaka: 20 March 2026, ten days after the due day, so January to March are
    // overdue for a student who started in January and never paid.
    const now=new Date('2026-03-20T10:00:00+06:00');
    const actor=await User.create({name:'Dialog Actor',email:'sms-dialog@example.test',passwordHash:await bcrypt.hash('Dialog-Only-2026!',12),role:'admin',active:true,phone:'01711000000'});
    const actorId=String(actor._id);
    const group=await CenterClassGroup.create({name:{bn:'ডায়ালগ ক্লাস',en:'Dialog Class'},academicYear:2026});
    const classId=String(group._id);
    // The quiet window starts EMPTY (start equals end): CI can run at any Dhaka hour, and phase 8
    // builds a real window around `now` when it needs one.
    await CenterSettings.create({key:'main',smsUnitCost:0.5,quietStart:'00:00',quietEnd:'00:00',institutePhone:'01711000000',dueDay:10,autoReceipt:false,autoResult:false,autoDue:false,autoDueDay:10});

    const base={classGroup:group._id,startMonth:{year:2026,month:1},feeHistory:[{effectiveFrom:{year:2026,month:1},amount:1000}],admissionDate:'2026-01-05'};
    const make=(index,over={})=>CenterStudent.create({studentId:`SYNTH-DLG-${index}`,name:{bn:`শিক্ষার্থী ${index}`},guardianName:'অভিভাবক',...base,...over});

    const paid=await make(1,{guardianPhone:'01711000001'});
    const siblingA=await make(2,{guardianPhone:'01711000002'});
    const siblingB=await make(3,{guardianPhone:'01711000002',feeHistory:[{effectiveFrom:{year:2026,month:1},amount:500}]});
    const removed=await make(4,{guardianPhone:'01711000004',status:'removed',removal:{reason:'synthetic',removedAt:now}});
    const optedOut=await make(5,{guardianPhone:'01711000005',smsOptOut:true});
    const held=await make(7,{guardianPhone:'01711000007',status:'on_hold',holds:[{start:{year:2026,month:3},end:{year:2026,month:4},reason:'synthetic',recordedBy:actor._id}]});
    const studentOnly=await make(8,{guardianPhone:'',studentPhone:'01711000008'});
    const paidUp=await make(9,{guardianPhone:'01711000009'});
    await CenterPayment.insertMany([1,2,3].map(month=>({student:paidUp._id,classGroupAtPayment:group._id,type:'monthly',academicYear:2026,month,amount:1000,receiptNo:'SYNTH-PAID',paidOn:'2026-01-05',receivedBy:actor._id,groupId:'synthetic',status:'valid'})));

    const idOf=doc=>String(doc._id);
    const call=(input,options={})=>runSmsDialog(input,actorId,{now,provider:options.provider||fakeProvider().provider}).then(outcome=>{bodies.push(JSON.stringify(outcome.body));return outcome});
    const previewOf=outcome=>outcome.body.preview;

    // ---- 1. A preview from the class source: who is in, who is skipped and why, and the figures.
    const one=await call({mode:'preview',source:'class',classGroup:classId,templateKey:'due_reminder',target:'guardian',groupSiblings:true,requestId:randomUUID()});
    assert.equal(one.status,200,'a preview is a normal response');
    const p1=previewOf(one);
    assert.deepEqual(p1.recipients.map(item=>item.phone).sort(),['01711000001','01711000002'],'siblings share one message and the paid-up, removed, opted-out, held and phoneless students are not messaged');
    assert.equal(p1.messages,2);
    assert.equal(p1.phones,2);
    const grouped=p1.recipients.find(item=>item.phone==='01711000002');
    assert.match(grouped.preview,/৪৫০০/,'the grouped sibling message quotes the summed total in Bangla digits (3000 + 1500)');
    assert.equal(p1.unitCost,0.5);
    assert.equal(p1.cost,p1.segments*0.5,'cost is segments times the stored unit cost');
    assert.equal(p1.balance,5000);
    assert.equal(p1.balanceOk,true);
    assert.equal(p1.lowBalance,false);
    assert.equal(p1.quiet,false,'an empty quiet window never blocks');
    assert.equal(p1.blocked,null);
    assert.equal(p1.month,'2026-03','the class source is not a dues list, so its duplicate-warning key is the current Dhaka month, never prose');
    assert.ok(p1.recipients.every(item=>!/\{\w+\}/.test(item.preview)),'no chip survives into a preview');
    assert.deepEqual([...new Set(p1.skipped.map(item=>item.reason))].sort(),['held','missing_phone','missing_value','opted_out'].sort(),'exactly the reasons this class deserves');
    for(const reason of p1.skipped.map(item=>item.reason))assert.ok(SMS_SKIP_REASONS.includes(reason),'every reason comes from the closed vocabulary');
    assert.ok(p1.skipped.every(item=>item.labelBn&&item.labelEn),'each reason carries both labels, so the dialog can show the operator\'s language');
    assert.equal(p1.skipped.filter(item=>item.reason==='held').length,1,'a held student is excluded from a fee message');
    assert.ok(!p1.recipients.some(item=>item.phone==='01711000004')&&!p1.skipped.some(item=>item.phone==='01711000004'),'a removed student is neither messaged nor listed');
    assert.equal(p1.recipients.length,Math.min(3,p1.messages),'the preview shows at most the first three messages');
    assert.equal(previewOf(one).recipients[0].preview.includes('ডিকশন কোচিং'),true,'the message is the shipped Bangla template');
    assert.equal(one.body.institutePhone,'01711000000');
    assert.equal(await CenterSmsBatch.countDocuments(),0,'a preview writes no batch');
    assert.equal(await CenterSmsLog.countDocuments(),0,'and no log row');

    // ---- 2. One message per phone off, and the guardian / student / both choice.
    const ungrouped=previewOf(await call({mode:'preview',source:'class',classGroup:classId,templateKey:'due_reminder',target:'guardian',groupSiblings:false,requestId:randomUUID()}));
    assert.equal(ungrouped.messages,3,'without sibling grouping the two children are two messages');
    assert.match(ungrouped.recipients.find(item=>item.phone==='01711000002').preview,/৩০০০|১৫০০/,'and each quotes its own total');
    const toStudent=previewOf(await call({mode:'preview',source:'class',classGroup:classId,templateKey:'due_reminder',target:'student',groupSiblings:true,requestId:randomUUID()}));
    assert.deepEqual(toStudent.recipients.map(item=>item.phone),['01711000008'],'the student choice reaches the student who has a student phone');
    const toBoth=previewOf(await call({mode:'preview',source:'class',classGroup:classId,templateKey:'due_reminder',target:'both',groupSiblings:true,requestId:randomUUID()}));
    const bothPhones=toBoth.recipients.map(item=>item.phone);
    assert.ok(bothPhones.includes('01711000001')&&bothPhones.includes('01711000008'),'both reaches guardians and students');
    const notFee=previewOf(await call({mode:'preview',source:'class',classGroup:classId,templateKey:'visitor_thanks',target:'guardian',requestId:randomUUID()}));
    assert.ok(notFee.recipients.some(item=>item.phone==='01711000007'),'a held student does receive a message that is not about fees');

    // ---- 3. The due-list source is DUE only, and the receipt source carries its own values.
    const dues=previewOf(await call({mode:'preview',source:'dues',classGroup:classId,templateKey:'due_reminder',target:'guardian',requestId:randomUUID()}));
    assert.equal(dues.messages,2,'the overdue list messages the same two numbers the screen shows');
    assert.ok(!dues.recipients.some(item=>item.phone==='01711000009'),'a student with nothing owed is not on the due list');
    assert.ok(!dues.skipped.some(item=>item.reason==='missing_value'),'so no one is skipped for a missing amount either');
    assert.equal(dues.month,'2026-01','the DUE list keys its duplicate warning to the earliest overdue month (January of the three owed)');
    const receipt=previewOf(await call({mode:'preview',source:'receipt',templateKey:'payment_receipt',target:'guardian',requestId:randomUUID(),
      receipt:{student:idOf(paid),amount:1500,month:'2026-03',receiptNo:'SYNTH-R77'}}));
    assert.equal(receipt.messages,1);
    assert.match(receipt.recipients[0].preview,/১৫০০/,'the receipt amount is rendered in Bangla digits');
    assert.match(receipt.recipients[0].preview,/SYNTH-R77/,'with the receipt number');
    assert.match(receipt.recipients[0].preview,/মার্চ/,'and the month it was for');

    // ---- 4. Nothing broken is ever sent: an empty body and an unrendered chip are refused.
    const emptyBody=await call({mode:'send',source:'class',classGroup:classId,templateKey:'custom',text:'   ',target:'guardian',requestId:randomUUID()});
    assert.equal(emptyBody.status,409);
    assert.equal(emptyBody.body.blocked,'EMPTY_MESSAGE');
    // A notice with no subject: {subject} is a KNOWN chip, so it is never rendered as a hole. Every
    // recipient is reported incomplete instead, which leaves nothing to send — and the send is refused
    // with the reason, plus the preview that explains it. Only an UNKNOWN chip (a typo) blocks the
    // whole plan as UNRENDERED_VARIABLE, because that one affects every recipient identically.
    const noSubject=await call({mode:'send',source:'class',classGroup:classId,templateKey:'notice',target:'guardian',requestId:randomUUID()});
    assert.equal(noSubject.status,409);
    assert.equal(noSubject.body.blocked,'NO_RECIPIENTS','a notice with no subject is refused rather than sent with a hole in it');
    assert.equal(noSubject.body.preview.phones,0,'nobody is left to send it to');
    const incomplete=noSubject.body.preview.skipped.filter((item:{reason:string})=>item.reason==='missing_value');
    assert.ok(incomplete.length>=4,'and the operator is told why: every number that would have been used is reported incomplete, one row per student');
    assert.ok(incomplete.some((item:{phone:string})=>item.phone==='01711000007'),'even the held student, whom a notice does reach, is incomplete without a subject');
    assert.ok(noSubject.body.preview.skipped.every((item:{labelBn:string;labelEn:string})=>item.labelBn&&item.labelEn),'each reason stated in both languages');
    const withSubject=previewOf(await call({mode:'preview',source:'class',classGroup:classId,templateKey:'notice',subject:'বার্ষিক পরীক্ষার রুটিন',target:'guardian',requestId:randomUUID()}));
    assert.equal(withSubject.blocked,null,'the same notice with its subject is not blocked at all');
    assert.equal(withSubject.skipped.filter(item=>item.reason==='missing_value').length,0,'and nobody is incomplete any more');
    assert.ok(withSubject.recipients[0].preview.includes('বার্ষিক পরীক্ষার রুটিন'),'the subject the operator typed is in the message');
    const emptyPreview=previewOf(await call({mode:'preview',source:'class',classGroup:classId,templateKey:'custom',text:'',target:'guardian',requestId:randomUUID()}));
    assert.equal(emptyPreview.blocked,'EMPTY_MESSAGE','a preview reports the block instead of throwing');
    assert.equal(await CenterSmsBatch.countDocuments(),0,'nothing refused was stored');

    // ---- 5. Low balance is warned about, with the real numbers.
    const broke=previewOf(await call({mode:'preview',source:'class',classGroup:classId,templateKey:'due_reminder',target:'guardian',requestId:randomUUID()},{provider:fakeProvider(undefined,0).provider}));
    assert.equal(broke.balance,0);
    assert.equal(broke.lowBalance,true,'a cost above the balance raises the warning');
    const cheap=previewOf(await call({mode:'preview',source:'class',classGroup:classId,templateKey:'due_reminder',target:'guardian',requestId:randomUUID()},{provider:fakeProvider(undefined,1000).provider}));
    assert.equal(cheap.lowBalance,false);

    // ---- 6. Send: one requestId is one batch, so a double-click cannot send twice.
    const requestId=randomUUID();
    const sender=fakeProvider();
    const sent=await call({mode:'send',source:'dues',classGroup:classId,templateKey:'due_reminder',target:'guardian',groupSiblings:true,requestId},{provider:sender.provider});
    assert.equal(sent.status,200);
    assert.equal(sent.body.status,'done');
    assert.equal(sent.body.sent,2);
    assert.equal(sent.body.failed,0);
    assert.equal(sent.body.skipped,2,'the opted-out and the phoneless student are counted on the batch — the held one is not on the DUE list at all, because only active students are priced');
    const batchId=sent.body.batchId;
    assert.equal(await CenterSmsBatch.countDocuments(),1);
    const manualBatch=await CenterSmsBatch.findById(batchId).lean();
    assert.equal(String(manualBatch.createdBy),actorId,'a send from the dialog records the operator who approved it');
    assert.equal(manualBatch.trigger,'manual','and says a person asked for it, not a job');
    assert.equal(await CenterSmsLog.countDocuments({batch:batchId,status:'sent'}),3,'one durable row per (recipient, student): the merged sibling message stays traceable to both children');
    assert.equal(await CenterSmsLog.countDocuments({batch:batchId,status:'sent',phone:'01711000002'}),2,'so the one message the guardian got is recorded against each of her two children');
    assert.equal(await CenterSmsLog.countDocuments({batch:batchId,status:'skipped'}),0,'and no row for a skip that has no number at all: SmsLog.phone is required, so those are counted on the batch instead');
    const sentRow=await CenterSmsLog.findOne({batch:batchId,status:'sent'}).lean();
    // The stored row is the audit trail, so it is checked against its own message rather than against
    // a number written down by hand: Bangla cannot go as GSM-7, a full reminder is longer than one
    // 67-character segment, and the cost is those segments at the stored unit price.
    const measured=estimateSms(sentRow.message);
    assert.equal(measured.encoding,'Unicode','a Bangla reminder is sent as unicode, never as GSM-7');
    assert.equal(sentRow.segments,measured.segments,'and the row carries the segments its own message really needs');
    assert.ok(sentRow.segments>=2,'which for a reminder this long is more than one segment');
    assert.equal(sentRow.cost,sentRow.segments*0.5,'so its stored cost is those segments times the unit cost, not a guess from today’s settings');
    assert.equal(sentRow.templateKey,'due_reminder');
    assert.equal(sentRow.month,'2026-01');
    assert.equal(sender.itemCount(),2,'the provider was asked for exactly the two messages');

    const again=await call({mode:'send',source:'dues',classGroup:classId,templateKey:'due_reminder',target:'guardian',groupSiblings:true,requestId},{provider:sender.provider});
    assert.equal(again.body.status,'existing','the same request answered from the first batch');
    assert.equal(again.body.batchId,batchId);
    assert.equal(await CenterSmsBatch.countDocuments(),1,'no second batch');
    assert.equal(await CenterSmsLog.countDocuments({batch:batchId,status:'sent'}),3,'and no second row for anyone');
    assert.equal(sender.itemCount(),2,'the provider was not called again');

    // A different request is a different send, and it is stopped by the 24-hour duplicate rule.
    const warned=previewOf(await call({mode:'preview',source:'dues',classGroup:classId,templateKey:'due_reminder',target:'guardian',requestId:randomUUID()}));
    assert.equal(warned.duplicates.length,3,'all three students behind those two numbers were already messaged');
    assert.ok(warned.duplicates.every(item=>item.name),'and the dialog can name them');
    const skipper=fakeProvider();
    const skippedSend=await call({mode:'send',source:'dues',classGroup:classId,templateKey:'due_reminder',target:'guardian',requestId:randomUUID(),skipDuplicates:true},{provider:skipper.provider});
    assert.equal(skippedSend.body.sent,0,'"skip those" sends nothing to a student already messaged today');
    assert.equal(skipper.itemCount(),0);
    assert.equal(await CenterSmsLog.countDocuments({status:'skipped',reason:'duplicate'}),3,'one skipped row per student, including both siblings');

    // ---- 7. Retry re-sends only the failed rows, and refuses when there is nothing to retry.
    await CenterSmsLog.updateOne({batch:batchId,phone:'01711000002'},{status:'failed',providerCode:'1005'});
    await CenterSmsBatch.updateOne({_id:batchId},{status:'partial',failedCount:1,sentCount:1});
    const retrier=fakeProvider();
    const retried=await call({mode:'retry',batchId},{provider:retrier.provider});
    assert.equal(retried.status,200);
    assert.equal(retried.body.retried,1);
    assert.equal(retried.body.sent,1);
    assert.equal(retried.body.failed,0);
    assert.equal(retrier.itemCount(),1,'only the failed message was sent again');
    assert.equal(await CenterSmsLog.countDocuments({batch:batchId,status:'sent'}),3,'the retried row is back to sent and its sibling row was never touched');
    assert.equal(await CenterSmsLog.countDocuments({batch:batchId,status:'failed'}),0);
    const nothing=await call({mode:'retry',batchId});
    assert.equal(nothing.status,409);
    assert.equal(nothing.body.blocked,'NOTHING_TO_RETRY','a batch with no failures is not sent again by accident');

    // ---- 8. Quiet hours queue the batch; the flush job sends it when the window closes.
    await CenterSettings.updateOne({key:'main'},{$set:{quietStart:dhakaClock(now,-60),quietEnd:dhakaClock(now,60)}});
    const queuer=fakeProvider();
    const queued=await call({mode:'send',source:'class',classGroup:classId,templateKey:'visitor_thanks',target:'guardian',requestId:randomUUID()},{provider:queuer.provider});
    assert.equal(queued.body.status,'queued','inside quiet hours nothing is sent');
    assert.equal(queuer.itemCount(),0);
    const queuedBatch=await CenterSmsBatch.findById(queued.body.batchId).lean();
    assert.equal(queuedBatch.quiet,true);
    assert.ok(queuedBatch.scheduledFor.getTime()>now.getTime(),'and it is scheduled for after the window');
    const waiting=await CenterSmsLog.countDocuments({batch:queued.body.batchId,status:'queued'});
    assert.ok(waiting>=queued.body.recipientCount,'every message waits as at least one log row');
    assert.equal(await CenterSmsLog.countDocuments({batch:queued.body.batchId,status:'queued',phone:'01711000002'}),2,'and a merged sibling message waits once per child, so the flush still knows who it is for');
    const forced=await call({mode:'send',source:'class',classGroup:classId,templateKey:'visitor_thanks',target:'guardian',force:true,requestId:randomUUID()},{provider:queuer.provider});
    assert.equal(forced.body.status,'done','"send anyway" is the operator\'s override');
    const flushed=await flushQueuedSms(new Date(now.getTime()+3*3600*1000),queuer.provider);
    assert.equal(flushed.batches,1,'the queued batch was flushed once its time came');
    assert.equal((await CenterSmsBatch.findById(queued.body.batchId).lean()).status,'done');
    await CenterSettings.updateOne({key:'main'},{$set:{quietStart:'00:00',quietEnd:'00:00'}});

    // ---- 9. The three auto-send toggles: OFF by default, idempotent when switched on.
    const batchesBefore=await CenterSmsBatch.countDocuments();
    const receiptOff=await autoSendReceipt({student:idOf(paid),amount:1200,month:{year:2026,month:3},receiptNo:'SYNTH-AUTO'},{now});
    assert.equal(receiptOff.attempted,false,'autoReceipt ships OFF and sends nothing');
    assert.equal(await CenterSmsBatch.countDocuments(),batchesBefore);
    await CenterSettings.updateOne({key:'main'},{$set:{autoReceipt:true}});
    const receiptOn=await autoSendReceipt({student:idOf(paid),amount:1200,month:{year:2026,month:3},receiptNo:'SYNTH-AUTO'},{now});
    assert.equal(receiptOn.attempted,true);
    assert.ok(receiptOn.batchId);
    // An automatic send is not a person, so it has no createdBy — and the schema must not require one,
    // or every automatic message would fail validation and be swallowed by the caller's try/catch. The
    // trigger is the audit trail in its place.
    const receiptBatch=await CenterSmsBatch.findById(receiptOn.batchId).lean();
    assert.equal(receiptBatch.trigger,'auto_receipt','the batch says what created it');
    assert.equal(receiptBatch.createdBy,undefined,'and that no human did');
    const receiptRow=await CenterSmsLog.findOne({batch:receiptOn.batchId,status:'sent'}).lean();
    assert.match(receiptRow.message,/১২০০/,'the automatic receipt quotes the amount');
    assert.match(receiptRow.message,/SYNTH-AUTO/,'and the receipt number');
    const receiptTwice=await autoSendReceipt({student:idOf(paid),amount:1200,month:{year:2026,month:3},receiptNo:'SYNTH-AUTO'},{now});
    assert.equal(receiptTwice.batchId,receiptOn.batchId,'the same receipt can never produce a second message');
    assert.equal(await CenterSmsLog.countDocuments({batch:receiptOn.batchId,status:'sent'}),1);

    const dueOff=await runAutoDue({now});
    assert.equal(dueOff.ran,false,'autoDue ships OFF');
    await CenterSettings.updateOne({key:'main'},{$set:{autoDue:true,autoDueDay:10}});
    const wrongDay=await runAutoDue({now});
    assert.equal(wrongDay.ran,false,'and it only runs on the day the operator chose, never to catch up');
    assert.equal(wrongDay.day,20);
    await CenterSettings.updateOne({key:'main'},{$set:{autoDueDay:20}});
    const guarded=await runAutoDue({now});
    assert.equal(guarded.ran,true,'on the day the operator chose, the job runs');
    assert.equal(guarded.classes,1,'one batch for the one class with overdue students');
    assert.equal(guarded.sent,0,'but phase 6 already sent this reminder by hand, so the job messages nobody twice in a day');
    assert.equal(guarded.skipped,4,'the two students who cannot be messaged plus the two numbers already reached today');
    // Two days later, with no reminder inside the last 24 hours, the same job really does send.
    await CenterSmsLog.deleteMany({templateKey:'due_reminder'});
    const later=new Date('2026-03-22T10:00:00+06:00');
    await CenterSettings.updateOne({key:'main'},{$set:{autoDueDay:22}});
    const dueOn=await runAutoDue({now:later});
    assert.equal(dueOn.ran,true);
    assert.equal(dueOn.classes,1);
    assert.equal(dueOn.sent,2,'the overdue reminders went out: one message per phone, siblings merged');
    assert.equal((await CenterSmsBatch.findOne({trigger:'auto_due'}).lean()).createdBy,undefined,'the job’s own batch is stored with no creator and its trigger as the record');
    const afterAutoDue=await CenterSmsBatch.countDocuments();
    const dueTwice=await runAutoDue({now:later});
    assert.equal(dueTwice.ran,true);
    assert.equal(await CenterSmsBatch.countDocuments(),afterAutoDue,'re-running the job on the same day sends nothing new');

    const resultOff=await autoSendClassResults({exam:'synthetic-exam',classGroup:classId},{now});
    assert.equal(resultOff.attempted,false,'autoResult ships OFF');
    await CenterSettings.updateOne({key:'main'},{$set:{autoResult:true}});
    const resultOn=await autoSendClassResults({exam:'synthetic-exam',classGroup:classId},{now});
    assert.equal(resultOn.attempted,true);
    assert.ok(resultOn.batchId);
    assert.equal((await CenterSmsBatch.findById(resultOn.batchId).lean()).trigger,'auto_result','and a published result says so too');
    const resultRows=await CenterSmsLog.countDocuments({batch:resultOn.batchId,status:'sent'});
    assert.ok(resultRows>=3,'a result message is not about fees, so held and paid-up students get it too');
    assert.equal(await CenterSmsLog.countDocuments({batch:resultOn.batchId,phone:'01711000005'}),0,'but an opted-out number is never used');
    assert.equal(await CenterSmsLog.countDocuments({phone:'01711000004'}),0,'and a removed student is never contacted by any path');

    // ---- 10. Requests are validated before anything is read.
    for(const [label,input] of [
      ['an unknown source',{mode:'preview',source:'everyone',templateKey:'notice',requestId:randomUUID()}],
      ['a non-UUID requestId',{mode:'preview',source:'class',classGroup:classId,templateKey:'notice',requestId:'not-a-uuid'}],
      ['an unknown template',{mode:'preview',source:'class',classGroup:classId,templateKey:'party_invite',requestId:randomUUID()}],
      ['an unknown audience',{mode:'preview',source:'class',classGroup:classId,templateKey:'notice',target:'everyone',requestId:randomUUID()}],
      ['a malformed class',{mode:'preview',source:'dues',classGroup:'nope',templateKey:'due_reminder',requestId:randomUUID()}],
      ['a selection with no valid id',{mode:'preview',source:'students',ids:['nope'],templateKey:'notice',requestId:randomUUID()}],
      ['a receipt with no month',{mode:'preview',source:'receipt',templateKey:'payment_receipt',requestId:randomUUID(),receipt:{student:idOf(paid),amount:10,month:'March',receiptNo:'X'}}],
      ['a retry of a malformed batch',{mode:'retry',batchId:'nope'}],
    ]){
      const outcome=await call(input);
      assert.equal(outcome.status,400,`${label} is refused`);
      assert.equal(outcome.body.ok,false);
    }
    assert.equal(await CenterSmsBatch.countDocuments(),afterAutoDue+1,'only the automatic result batch was added since; every refused request in this phase stored nothing');

    // ---- 11. Deterministic keys, and no credential anywhere.
    assert.match(autoRequestId('a','b'),/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,'an automatic requestId satisfies the batch schema');
    assert.equal(autoRequestId('receipt','x','1'),autoRequestId('receipt','x','1'),'and is stable, which is what makes an auto-send idempotent');
    assert.notEqual(autoRequestId('receipt','x','1'),autoRequestId('receipt','x','2'));
    const everything=bodies.join('\n');
    for(const needle of [API_KEY,SENDER_ID,'BULKSMSBD','api_key','apiKey']){
      assert.ok(!everything.includes(needle),`no response mentions ${needle}`);
    }
    for(const row of await CenterSmsLog.find({}).lean()){
      assert.ok(!JSON.stringify(row).includes(API_KEY),'no stored row carries the key');
    }

    console.log('SMS dialog contract: one guarded endpoint for preview, send and retry — a preview is read-only and reports recipients, skipped numbers with a reason from the closed vocabulary, the first three messages, segments and cost against the balance plus a low-balance warning; sibling grouping, guardian/student/both and the DUE-only list change exactly who is counted; an empty body or an unrendered chip is refused instead of sent; one requestId is one batch so a double-click sends nothing twice; "skip those" drops students messaged within 24 hours; retry re-sends only failed rows and refuses when there are none; quiet hours queue and the flush job sends; the three auto-send toggles are OFF by default, idempotent when on, and stored with their trigger and no creator because a job is not a person; malformed requests are refused before anything is read; and no credential appears in a response or a stored row.');
  }finally{
    await mongoose.disconnect();
    await mongo.stop();
  }
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
