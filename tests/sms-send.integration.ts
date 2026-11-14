// @ts-nocheck -- R2 SMS send engine against a disposable database; synthetic records only.
/**
 * R2 · Sending. Everything the spec demands of a real send, proved against a database with a
 * counting fake provider (no network, no real message ever leaves):
 *   500 recipients in batches of 100 without timeout · a double-click sends once · invalid and
 *   missing numbers skipped with reasons · sibling grouping · quiet-hours queueing and its flush ·
 *   segment and cost estimates for short and long Bangla · the 24-hour duplicate warning with
 *   "skip those" · retry-failed · and the API key never appearing in a stored row or a payload.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import bnMessages from '../src/messages/bn.json';
import enMessages from '../src/messages/en.json';
/** One sms-namespace key read out of a catalog: the labels live in the message files now. */
const smsLabel=(catalog:unknown,key:string):string=>String(key.split('.').reduce((node:unknown,part:string)=>(node as Record<string,unknown>)?.[part],catalog)??'');
const bothLabels=(key:string):boolean=>!!smsLabel(bnMessages.sms,key).trim()&&!!smsLabel(enMessages.sms,key).trim();

import {randomUUID} from 'node:crypto';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {CenterClassGroup,CenterStudent,CenterSettings,CenterSmsBatch,CenterSmsLog} from '../src/models/CenterRecords';
import {buildSmsPlan,executeSmsPlan,flushQueuedSms,loadSmsTemplates,monthSmsTotals,recentDuplicateStudents,retryFailedSms,sendTestSms,dhakaMonthKey} from '../src/lib/center/sms-send';
import {estimateSms} from '../src/lib/center/sms-provider';

const API_KEY='sk-integration-4d8e2f6a';

/** A provider that counts calls and can be told what to answer. */
function fakeProvider(answer={status:'submitted',code:'202'}){
  const calls=[];
  return {
    calls,
    provider:{
      name:'mock',
      configured:true,
      async send(phone,message){calls.push({kind:'send',items:[{phone,message}]});return typeof answer==='function'?answer(calls.length):answer},
      async sendMany(items){calls.push({kind:'sendMany',items});return typeof answer==='function'?answer(calls.length):answer},
      async balance(){return {ok:true,balance:5000}},
    },
    itemCount(){return calls.reduce((sum,call)=>sum+call.items.length,0)},
  };
}

/** Dhaka HH:MM some minutes from `base`, used to build a quiet window that certainly contains now. */
function dhakaClock(base:Date,offsetMinutes:number):string{
  const shifted=new Date(base.getTime()+offsetMinutes*60000);
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(shifted);
  const hour=Number(parts.find(p=>p.type==='hour').value)%24;
  const minute=Number(parts.find(p=>p.type==='minute').value);
  return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}

async function run(){
  await preflight({mongo:true,test:'tests/sms-send.integration.ts — needs a MongoDB (or TEST_MONGO_URI from npm run test-mode)'});
  const shared=process.env.TEST_MONGO_URI||null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){for(const c of await mongoose.connection.db.listCollections().toArray()){await mongoose.connection.db.collection(c.name).deleteMany({}).catch(()=>{})}}
  process.env.BULKSMSBD_API_KEY=API_KEY;
  process.env.BULKSMSBD_SENDER_ID='DictionTest';
  process.env.SMS_PROVIDER='mock';

  try{
    const actor=await User.create({name:'SMS Actor',email:'sms-actor@example.test',passwordHash:await bcrypt.hash('Sms-Only-2026!',12),role:'admin',active:true});
    const actorId=String(actor._id);
    const group=await CenterClassGroup.create({name:{bn:'এসএমএস ক্লাস',en:'SMS Class'},academicYear:2026});
    // The quiet window starts EMPTY (start equals end), because CI can run at any Dhaka hour: with
    // the real 21:00–07:00 default a run at 02:00 Dhaka would correctly queue every send and the
    // "it went out now" assertions below would fail for the wrong reason. Phase 8 sets a real
    // window built around `now` to prove queueing, then clears it again.
    await CenterSettings.create({key:'main',smsUnitCost:0.5,quietStart:'00:00',quietEnd:'00:00',institutePhone:'01711000000'});

    // One student factory: a valid guardian number by default, everything the schema requires.
    async function makeStudent(index,over={}){
      const doc=await CenterStudent.create({
        studentId:`SYNTH-SMS-${index}`,name:{bn:`শিক্ষার্থী ${index}`},classGroup:group._id,
        guardianPhone:`017${String(10000000+index).slice(0,8)}`,
        startMonth:{year:2026,month:1},feeHistory:[{effectiveFrom:{year:2026,month:1},amount:1000}],...over,
      });
      return doc;
    }
    const candidate=(doc,values={})=>({
      id:String(doc._id),nameBn:doc.name.bn,status:doc.status,smsOptOut:doc.smsOptOut,
      guardianPhone:doc.guardianPhone,studentPhone:doc.studentPhone,altPhone:doc.altPhone,
      holds:doc.holds||[],values:{month:'মার্চ ২০২৬',due_amount:1200,...values},
    });

    // 1. Segment and cost estimates: a short Bangla body is one Unicode segment, a long one splits
    //    at 67 per segment, and the cost is segments × the configured unit cost — never a guess.
    const shortBody='ডিকশন কোচিং: রহিম এর মার্চ মাসের ৫০০ টাকা পেয়েছি। ধন্যবাদ।';
    assert.equal(estimateSms(shortBody).encoding,'Unicode','Bangla is Unicode');
    assert.equal(estimateSms(shortBody).segments,1);
    const longBody='ক'.repeat(140);
    assert.equal(estimateSms(longBody).segments,3,'140 Bangla characters need three 67-character segments');
    const one=await makeStudent(1);
    const shortPlan=await buildSmsPlan({requestId:randomUUID(),students:[candidate(one)],customText:shortBody,audience:'guardian'});
    assert.equal(shortPlan.recipientCount,1);
    assert.equal(shortPlan.segmentCount,1);
    assert.equal(shortPlan.estimatedCost,0.5,'one segment at ৳0.50');
    const longPlan=await buildSmsPlan({requestId:randomUUID(),students:[candidate(one)],customText:longBody,audience:'guardian'});
    assert.equal(longPlan.segmentCount,3);
    assert.equal(longPlan.estimatedCost,1.5,'three segments at ৳0.50');
    assert.equal(shortPlan.items[0].message,shortBody,'a custom body goes out unchanged');

    // 2. A blocked plan: an empty body, and a chip we have no value for, must never be sent.
    const emptyPlan=await buildSmsPlan({requestId:randomUUID(),students:[candidate(one)],customText:'   ',audience:'guardian'});
    assert.equal(emptyPlan.blocked,'EMPTY_MESSAGE');
    assert.equal(emptyPlan.items.length,0);
    const typoPlan=await buildSmsPlan({requestId:randomUUID(),students:[candidate(one)],customText:'নমস্কার {bogus_chip}',audience:'guardian'});
    assert.ok(typoPlan.blocked?.startsWith('UNRENDERED_VARIABLE'),`an unknown chip blocks the send, got ${typoPlan.blocked}`);
    // A known chip with no value makes that ONE recipient incomplete rather than sending a hole.
    const holePlan=await buildSmsPlan({requestId:randomUUID(),students:[candidate(one,{due_amount:''})],templateKey:'due_reminder',audience:'guardian'});
    assert.equal(holePlan.items.length,0,'no message with a missing amount is sent');
    assert.equal(holePlan.skipped[0].reason,'missing_value');
    assert.ok(bothLabels(holePlan.skipped[0].labelKey),'the operator reads a reason in their own language');

    // 3. 500 recipients go out in five provider calls of at most 100, quickly, and every one is logged.
    const many=[];
    for(let index=100;index<600;index++)many.push(candidate(await makeStudent(index)));
    assert.equal(many.length,500);
    const big=fakeProvider();
    const bigPlan=await buildSmsPlan({requestId:randomUUID(),students:many,templateKey:'due_reminder',audience:'guardian',month:'2026-03'});
    assert.equal(bigPlan.recipientCount,500);
    assert.equal(bigPlan.blocked,null);
    const startedAt=Date.now();
    const bigResult=await executeSmsPlan(bigPlan,{actor:actorId,provider:big.provider});
    const elapsed=Date.now()-startedAt;
    assert.equal(bigResult.status,'done');
    assert.equal(bigResult.sent,500);
    assert.equal(big.calls.length,5,'500 recipients is five batches of 100');
    assert.ok(big.calls.every(call=>call.items.length<=100),'no batch exceeds 100');
    assert.equal(big.itemCount(),500,'every recipient was handed to the provider exactly once');
    assert.ok(elapsed<60000,`500 recipients must not time out (took ${elapsed}ms)`);
    assert.equal(await CenterSmsLog.countDocuments({batch:bigResult.batchId,status:'sent'}),500);
    const batch=await CenterSmsBatch.findById(bigResult.batchId).lean();
    assert.equal(batch.status,'done');
    assert.equal(batch.sentCount,500);
    assert.equal(batch.templateKey,'due_reminder');
    assert.equal(batch.purpose,'due_reminder');
    assert.ok(batch.estimatedCost>0,'the batch records what it cost');
    const sentLog=await CenterSmsLog.findOne({batch:bigResult.batchId}).lean();
    assert.equal(sentLog.providerCode,'202');
    assert.ok(sentLog.providerMessage.includes('জমা'),'the log carries the Bangla provider sentence');
    assert.ok(sentLog.cost>0&&sentLog.segments>=1,'each row stores its own segments and cost');

    // 4. Idempotency: the same requestId twice sends once. This is the double-click guarantee.
    const callsBefore=big.calls.length;
    const again=await executeSmsPlan(bigPlan,{actor:actorId,provider:big.provider});
    assert.equal(again.status,'existing');
    assert.equal(big.calls.length,callsBefore,'the second call reached the provider zero times');
    assert.equal(await CenterSmsBatch.countDocuments({requestId:bigPlan.requestId}),1,'one batch per requestId');
    assert.equal(await CenterSmsLog.countDocuments({batch:bigResult.batchId,status:'sent'}),500,'no duplicate log rows');
    assert.ok(again.message.includes('already used'));

    // 5. Skip reasons: removed, opted out, held (fee message), missing and invalid numbers.
    const removed=await makeStudent(900,{status:'removed'});
    const opted=await makeStudent(901,{smsOptOut:true});
    const held=await makeStudent(902,{holds:[{start:{year:2026,month:1},reason:'বকেয়া',recordedBy:actor._id}]});
    const noPhone=await makeStudent(903,{guardianPhone:''});
    // The student schema rejects an invalid number, so the bad number is carried on the candidate
    // (a plain object) instead — which is exactly where a bad import or a legacy typo surfaces.
    const badPhone={...candidate(await makeStudent(904)),guardianPhone:'017111'};
    const goodOne=await makeStudent(905);
    const mixed=await buildSmsPlan({
      requestId:randomUUID(),
      students:[candidate(removed),candidate(opted),candidate(held),candidate(noPhone),badPhone,candidate(goodOne)],
      templateKey:'due_reminder',audience:'guardian',
    });
    assert.equal(mixed.recipientCount,1,'only the reachable, willing, non-held student is sent to');
    const reasons=mixed.skipped.map(entry=>entry.reason).sort();
    assert.deepEqual(reasons,['held','invalid_phone','missing_phone','opted_out','removed']);
    assert.ok(mixed.skipped.every(entry=>bothLabels(entry.labelKey)),'every skip shows a reason in both languages');
    // The same held student DOES receive a non-fee message.
    const nonFee=await buildSmsPlan({requestId:randomUUID(),students:[candidate(held)],customText:'ডিকশন কোচিং: ছুটির নোটিশ।',audience:'guardian'});
    assert.equal(nonFee.recipientCount,1,'a held student may receive a non-fee message');

    // 6. Sibling grouping: one message per phone with a summed total; ungrouped sends two.
    const sibA=await makeStudent(910,{guardianPhone:'01799999999'});
    const sibB=await makeStudent(911,{guardianPhone:'01799999999',name:{bn:'দ্বিতীয় ভাই'}});
    const grouped=await buildSmsPlan({
      requestId:randomUUID(),students:[candidate(sibA,{due_amount:550}),candidate(sibB,{due_amount:770})],
      templateKey:'due_reminder',audience:'guardian',onePerPhone:true,
    });
    assert.equal(grouped.recipientCount,1,'siblings on one number get a single message');
    assert.ok(grouped.items[0].message.includes('1320'),'the guardian is told the summed total, not one child’s share');
    assert.deepEqual(grouped.items[0].studentIds.sort(),[String(sibA._id),String(sibB._id)].sort());
    const ungrouped=await buildSmsPlan({
      requestId:randomUUID(),students:[candidate(sibA,{due_amount:550}),candidate(sibB,{due_amount:770})],
      templateKey:'due_reminder',audience:'guardian',onePerPhone:false,
    });
    assert.equal(ungrouped.recipientCount,2,'without the option each child gets their own message');
    // An ambiguous amount refuses the merge instead of stating a wrong total.
    const ambiguous=await buildSmsPlan({
      requestId:randomUUID(),students:[candidate(sibA,{due_amount:500}),candidate(sibB,{due_amount:''})],
      templateKey:'due_reminder',audience:'guardian',onePerPhone:true,
    });
    assert.equal(ambiguous.groupingRefused.length,1,'the dialog must explain why grouping did not happen');

    // 7. The 24-hour duplicate warning, and "skip those" acting on it.
    const dupes=await recentDuplicateStudents('due_reminder',[String(one._id)],'2026-03');
    assert.ok(Array.isArray(dupes));
    const dupePlan=await buildSmsPlan({
      requestId:randomUUID(),students:many.slice(0,5),templateKey:'due_reminder',audience:'guardian',month:'2026-03',
    });
    assert.equal(dupePlan.duplicates.length,5,'all five were already sent this template+month within 24 hours');
    const skipDupes=fakeProvider();
    const dupeResult=await executeSmsPlan(dupePlan,{actor:actorId,provider:skipDupes.provider,skipDuplicates:true});
    assert.equal(dupeResult.sent,0,'nothing is sent again');
    assert.equal(dupeResult.skipped,5);
    assert.equal(await CenterSmsLog.countDocuments({batch:dupeResult.batchId,status:'skipped',reason:'duplicate'}),5);
    // A different month is not a duplicate.
    const freshMonth=await buildSmsPlan({requestId:randomUUID(),students:many.slice(0,5),templateKey:'due_reminder',audience:'guardian',month:'2026-04'});
    assert.equal(freshMonth.duplicates.length,0,'another month is a new message, not a duplicate');

    // 8. Quiet hours: queued, not sent — then flushed by the daily job when the window closes.
    const now=new Date();
    await CenterSettings.updateOne({key:'main'},{$set:{quietStart:dhakaClock(now,0),quietEnd:dhakaClock(now,120)}});
    const quietStudent=await makeStudent(920);
    const quiet=fakeProvider();
    const quietPlan=await buildSmsPlan({requestId:randomUUID(),students:[candidate(quietStudent)],templateKey:'due_reminder',audience:'guardian',month:'2026-05',now});
    assert.equal(quietPlan.quiet,true,'the window built around now is quiet');
    const quietResult=await executeSmsPlan(quietPlan,{actor:actorId,provider:quiet.provider,now});
    assert.equal(quietResult.status,'queued');
    assert.equal(quiet.calls.length,0,'nothing reaches the provider during quiet hours');
    assert.equal(await CenterSmsLog.countDocuments({batch:quietResult.batchId,status:'queued'}),1);
    const queuedBatch=await CenterSmsBatch.findById(quietResult.batchId).lean();
    assert.equal(queuedBatch.quiet,true);
    assert.ok(queuedBatch.scheduledFor>now,'the batch records when it may be sent');
    // Forcing sends immediately, which is the operator's explicit override.
    const forced=fakeProvider();
    const forcedPlan=await buildSmsPlan({requestId:randomUUID(),students:[candidate(quietStudent)],templateKey:'due_reminder',audience:'guardian',month:'2026-06',now});
    const forcedResult=await executeSmsPlan(forcedPlan,{actor:actorId,provider:forced.provider,force:true,now});
    assert.equal(forcedResult.status,'done','force sends despite quiet hours');
    assert.equal(forced.calls.length,1);
    // The flush happens once the window has closed.
    const flushed=await flushQueuedSms(new Date(now.getTime()+180*60000),quiet.provider);
    assert.equal(flushed.batches,1);
    assert.equal(flushed.sent,1);
    assert.equal(await CenterSmsLog.countDocuments({batch:quietResult.batchId,status:'sent'}),1,'the queued row became a sent row');
    assert.equal(await CenterSmsLog.countDocuments({batch:quietResult.batchId,status:'queued'}),0);
    const afterFlush=await CenterSmsBatch.findById(quietResult.batchId).lean();
    assert.equal(afterFlush.status,'done');
    // Restoring a window that excludes now, so the remaining phases send normally.
    await CenterSettings.updateOne({key:'main'},{$set:{quietStart:dhakaClock(now,120),quietEnd:dhakaClock(now,180)}});
    const openNow=await buildSmsPlan({requestId:randomUUID(),students:[candidate(quietStudent)],customText:'নোটিশ',audience:'guardian'});
    assert.equal(openNow.quiet,false,'outside the window the plan is not quiet');

    // 9. Failures: a permanent rejection is logged with its Bangla reason and never auto-retried,
    //    while 1005 (internal error) is retried exactly once.
    const poor=fakeProvider({status:'rejected',code:'1007'});
    const poorStudent=await makeStudent(930);
    const poorPlan=await buildSmsPlan({requestId:randomUUID(),students:[candidate(poorStudent)],customText:'ডিকশন কোচিং: নোটিশ',audience:'guardian'});
    const poorResult=await executeSmsPlan(poorPlan,{actor:actorId,provider:poor.provider});
    assert.equal(poorResult.status,'failed');
    assert.equal(poorResult.failed,1);
    assert.equal(poor.calls.length,1,'an insufficient-balance rejection is not retried into the ground');
    const poorLog=await CenterSmsLog.findOne({batch:poorResult.batchId}).lean();
    assert.equal(poorLog.status,'failed');
    assert.equal(poorLog.providerCode,'1007');
    assert.ok(poorLog.providerMessage.includes('অপর্যাপ্ত'));
    const transient=fakeProvider(call=>call===1?{status:'rejected',code:'1005'}:{status:'submitted',code:'202'});
    const transientPlan=await buildSmsPlan({requestId:randomUUID(),students:[candidate(await makeStudent(931))],customText:'ডিকশন কোচিং: নোটিশ',audience:'guardian'});
    const transientResult=await executeSmsPlan(transientPlan,{actor:actorId,provider:transient.provider});
    assert.equal(transient.calls.length,2,'a 1005 internal error is retried exactly once');
    assert.equal(transientResult.sent,1,'and the retry succeeded');
    assert.equal(transientResult.status,'done');

    // 10. Retry failed: the operator's explicit path re-sends only the failed rows of that batch.
    const retry=fakeProvider();
    const retryResult=await retryFailedSms(poorResult.batchId,actorId,retry.provider);
    assert.equal(retryResult.retried,1);
    assert.equal(retryResult.sent,1);
    assert.equal(await CenterSmsLog.countDocuments({batch:poorResult.batchId,status:'sent'}),1);
    assert.equal(await CenterSmsLog.countDocuments({batch:poorResult.batchId,status:'failed'}),0);
    const retriedBatch=await CenterSmsBatch.findById(poorResult.batchId).lean();
    assert.equal(retriedBatch.status,'done');
    assert.equal(retry.calls.length,1,'only the failed row was re-sent, not the whole batch');

    // 11. The test message goes to the operator's own number, and a bad number is refused.
    const test=fakeProvider();
    const testResult=await sendTestSms('01712345678',actorId,test.provider);
    assert.equal(testResult.status,'sent');
    assert.equal(test.calls[0].items[0].phone,'01712345678');
    assert.ok(test.calls[0].items[0].message.includes('পরীক্ষা'),'it says it is a connection test');
    assert.equal(await CenterSmsLog.countDocuments({templateKey:'test',status:'sent'}),1);
    assert.equal((await sendTestSms('12345',actorId,test.provider)).status,'invalid');

    // 12. Templates come from the database when edited, and the defaults otherwise.
    const templates=await loadSmsTemplates();
    assert.ok(templates.length>=8,'the catalog carries every default');
    assert.equal(templates.find(t=>t.key==='due_reminder').edited,false,'unedited defaults say so');
    assert.ok(templates.every(t=>t.purpose&&t.key));

    // 13. This month's totals are stored sums, not a re-derivation from today's unit cost.
    const totals=await monthSmsTotals(new Date());
    assert.ok(totals.sent>=503,`sent rows this month: ${totals.sent}`);
    assert.ok(totals.skipped>=5);
    assert.ok(totals.cost>0,'cost is summed from the rows');
    assert.ok(Number.isFinite(totals.segments)&&totals.segments>0);

    // 14. The API key never reaches a stored row, a plan, a summary or an audit target.
    const planJson=JSON.stringify(bigPlan);
    const summaryJson=JSON.stringify(bigResult);
    assert.ok(!planJson.includes(API_KEY),'the plan carries no credential');
    assert.ok(!summaryJson.includes(API_KEY),'the summary carries no credential');
    const everyLog=await CenterSmsLog.find({}).limit(5000).lean();
    const everyBatch=await CenterSmsBatch.find({}).limit(100).lean();
    const stored=JSON.stringify(everyLog)+JSON.stringify(everyBatch);
    assert.ok(!stored.includes(API_KEY),'no log or batch row contains the API key');
    assert.ok(!stored.includes('DictionTest'),'no log or batch row contains the sender id');

    console.log(`SMS sending: 500 recipients went out in ${big.calls.length} batches of at most 100 in ${elapsed}ms, a repeated requestId sent nothing a second time, removed/opted-out/held/missing/invalid numbers were each skipped with a reason, siblings grouped into one message with a summed total, quiet hours queued the batch until the flush sent it, a 1005 was retried once while a 1007 was not, retry-failed re-sent only the failed row, month totals are stored sums, and the API key appears in no stored row or returned payload.`);
  }finally{
    await mongoose.connection.dropDatabase().catch(()=>{});
    await mongoose.disconnect();
    await mongo.stop();
  }
}

run().catch(error=>{console.error(error);process.exit(1)});
