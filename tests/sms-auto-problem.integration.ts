// @ts-nocheck -- R2 follow-up: automatic-SMS problems against a disposable database; synthetic only.
/**
 * R2 follow-up · "Automatic SMS problems".
 *
 * The three automatic sends are best-effort ON PURPOSE: a receipt message that cannot go out must
 * never turn a saved payment into an error, and a result message must never unpublish an exam. That
 * rule used to make failures invisible — the caller swallows the error, so all anyone got was a
 * console line on a host nobody reads, while the toggle looked on and nothing was ever sent.
 *
 * What this proves, against a database with counting fake providers (no network, no real message):
 *   • a toggle that is OFF records nothing — that is the system working, not a problem
 *   • the exact sequence the payment action performs: the payment is saved FIRST, then the message
 *     fails, and the failure neither throws at the caller nor touches the saved payment
 *   • the failure is stored with the trigger, the receipt it was for, the provider's own Bangla
 *     meaning for its code, and the context needed to run it again — and the card's data source
 *     reports it as one open problem with a plain Bangla sentence
 *   • a repeating failure folds into ONE row that counts attempts instead of piling up
 *   • Retry, on a batch whose rows the provider rejected, re-sends only those rows, resolves the row
 *     against the admin who clicked it, and audits the retry
 *   • Retry, when no batch was ever created (the balance call itself failed), runs the whole
 *     automatic send again under a fresh request id, because the old one is spent
 *   • a class nobody is in and a send queued for quiet hours are NOT problems: no false alarms
 *   • every trigger has its own words, and a credential inside an error never reaches the operator
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {AdminAudit} from '../src/models/AdminAudit';
import {
  CenterClassGroup,CenterStudent,CenterSettings,CenterPayment,CenterSmsBatch,CenterSmsLog,CenterSmsAutoProblem,
} from '../src/models/CenterRecords';
import {recordCenterCash} from '../src/lib/center/cash-batch';
import {autoSendReceipt,autoSendClassDues,autoSendClassResults,retryAutoSmsProblem} from '../src/lib/center/sms-dialog';
import {
  autoSmsProblems,autoProblemText,autoProblemKey,AUTO_SMS_TRIGGER_LABELS,
} from '../src/lib/center/sms-auto-problems';
import {dhakaCalendar} from '../src/lib/center/month-status';

const API_KEY='sk-autoproblem-integration-4d2f';
const SENDER_ID='DictionTestSender';

/** A provider that answers whatever it is told, and counts the messages it was asked for. */
function fakeProvider(answer={status:'submitted',code:'202'},balance=5000){
  const calls=[];
  return {
    calls,
    provider:{
      name:'mock',
      configured:true,
      async send(phone,message){calls.push({kind:'send',items:[{phone,message}]});return answer},
      async sendMany(items){calls.push({kind:'sendMany',items});return answer},
      async balance(){return {ok:true,balance}},
    },
    itemCount(){return calls.reduce((sum,call)=>sum+call.items.length,0)},
  };
}

/** A provider whose balance call dies, so no plan and no batch are ever built. */
function noBalanceProvider(message='fetch failed'){
  return {
    provider:{
      name:'mock',
      configured:true,
      async send(){throw Error(message)},
      async sendMany(){throw Error(message)},
      async balance(){throw Error(message)},
    },
  };
}

/** Dhaka HH:MM some minutes from `base` — used to build a quiet window that certainly contains now. */
function dhakaClock(base:Date,offsetMinutes:number):string{
  const shifted=new Date(base.getTime()+offsetMinutes*60000);
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(shifted);
  return `${String(Number(parts.find(p=>p.type==='hour').value)%24).padStart(2,'0')}:${parts.find(p=>p.type==='minute').value}`;
}

async function run(){
  await preflight({mongo:true,test:'tests/sms-auto-problem.integration.ts — needs a MongoDB (or TEST_MONGO_URI from npm run test-mode)'});
  const shared=process.env.TEST_MONGO_URI||null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){for(const c of await mongoose.connection.db.listCollections().toArray()){await mongoose.connection.db.collection(c.name).deleteMany({}).catch(()=>{})}}
  process.env.BULKSMSBD_API_KEY=API_KEY;
  process.env.BULKSMSBD_SENDER_ID=SENDER_ID;
  process.env.SMS_PROVIDER='mock';

  try{
    // Real "now": recordCenterCash prices against today in Dhaka, so a synthetic clock would make the
    // payment itself invalid, and the point of this suite is that the payment is real and safe.
    const now=new Date();
    const today=dhakaCalendar(now);
    const dueMonth=today.month-2>=1?{year:today.year,month:today.month-2}:{year:today.year-1,month:today.month+10};
    const paidOn=`${today.year}-${String(today.month).padStart(2,'0')}-${String(today.day).padStart(2,'0')}`;
    const startMonth=today.month-4>=1?{year:today.year,month:today.month-4}:{year:today.year-1,month:today.month+8};

    const actor=await User.create({name:'Auto Problem Actor',email:'sms-auto@example.test',passwordHash:await bcrypt.hash('AutoOnly-2026!',12),role:'admin',active:true,phone:'01712220000'});
    const actorId=String(actor._id);
    const group=await CenterClassGroup.create({name:{bn:'সমস্যা ক্লাস',en:'Problem Class'},academicYear:today.year});
    const emptyGroup=await CenterClassGroup.create({name:{bn:'খালি ক্লাস',en:'Empty Class'},academicYear:today.year});
    // The quiet window starts EMPTY (start equals end): CI can run at any Dhaka hour, and the queued
    // phase below builds a real window around `now` only when it needs one.
    await CenterSettings.create({key:'main',smsUnitCost:0.5,quietStart:'00:00',quietEnd:'00:00',institutePhone:'01712220000',dueDay:10,autoReceipt:false,autoResult:false,autoDue:false,autoDueDay:today.day});
    const base={classGroup:group._id,startMonth,feeHistory:[{effectiveFrom:startMonth,amount:1000}],admissionDate:`${startMonth.year}-${String(startMonth.month).padStart(2,'0')}-05`};
    const payer=await CenterStudent.create({studentId:'SYNTH-AP-1',name:{bn:'রসিদ শিক্ষার্থী'},guardianName:'অভিভাবক',guardianPhone:'01712223334',...base});
    await CenterStudent.create({studentId:'SYNTH-AP-2',name:{bn:'নম্বরহীন শিক্ষার্থী'},guardianName:'অভিভাবক',guardianPhone:'',...base});

    const receiptInput={student:String(payer._id),amount:1200,month:dueMonth,receiptNo:'9101'};

    // ---- 1. A toggle that is OFF is the system working, not a problem to report.
    const working=fakeProvider();
    const off=await autoSendReceipt(receiptInput,{now,provider:working.provider});
    assert.equal(off.attempted,false,'autoReceipt ships OFF');
    assert.equal(off.failed,undefined);
    assert.equal(await CenterSmsAutoProblem.countDocuments(),0,'and an untouched toggle records nothing at all');
    assert.equal(working.itemCount(),0);

    // ---- 2. The money first, then the message: exactly the sequence the payment action performs.
    await CenterSettings.updateOne({key:'main'},{$set:{autoReceipt:true}});
    const cash=await recordCenterCash({
      requestId:randomUUID(),student:String(payer._id),academicYear:dueMonth.year,receiptNo:'9101',paidOn,note:'',
      allowSharedReceipt:false,lines:[{type:'monthly',month:dueMonth.month,amount:1200,otherLabel:''}],
    },actorId);
    assert.ok(cash&&(cash.batchId||cash.receiptNo),'the payment is recorded before any message is attempted');
    assert.equal(await CenterPayment.countDocuments({student:payer._id,status:'valid'}),1,'one valid payment row');

    // The provider refuses the message: not enough balance, which is the most likely real cause and is
    // NOT one of the codes the sender retries by itself.
    const broke=fakeProvider({status:'rejected',code:'1007'});
    let thrown=null,outcome=null;
    try{
      outcome=await autoSendReceipt(receiptInput,{now,provider:broke.provider});
    }catch(error){thrown=error}
    assert.equal(thrown,null,'a failed automatic receipt never throws at its caller — that is what keeps a saved payment from becoming an error');
    assert.equal(outcome.attempted,true,'it was attempted: the toggle is on');
    assert.equal(outcome.failed,true,'and it did not go out');
    assert.equal(outcome.reason,'1007','the provider’s code is what came back');
    assert.ok(outcome.problem,'and it reports the problem row it stored');
    assert.equal(await CenterPayment.countDocuments({student:payer._id,status:'valid'}),1,'the saved payment is still saved, untouched');
    assert.equal(await CenterSmsLog.countDocuments({status:'sent'}),0,'nothing was sent to anybody');
    assert.equal(broke.itemCount(),1,'the provider was asked once, and refused');

    // ---- 3. What the operator sees: one open problem, in plain Bangla, naming the receipt.
    const problems=await autoSmsProblems();
    assert.equal(problems.count,1,'one open problem');
    assert.equal(problems.items.length,1);
    const item=problems.items[0];
    assert.equal(item.trigger,'auto_receipt');
    assert.equal(item.id,String(outcome.problem));
    assert.ok(item.messageBn.startsWith(AUTO_SMS_TRIGGER_LABELS.auto_receipt.bn),'the sentence names which automatic send failed');
    assert.match(item.messageBn,/পাঠানো যায়নি/,'and says plainly that it did not go out');
    assert.match(item.messageBn,/ব্যালেন্স অপর্যাপ্ত/,'quoting the provider’s own Bangla meaning for its code');
    assert.match(item.messageBn,/কোড 1007/,'and the code itself, for whoever has to call the provider');
    assert.equal(item.code,'1007');
    assert.match(item.who,/9101/,'the row names the receipt it was for');
    assert.match(item.who,/রসিদ শিক্ষার্থী/,'and the student behind it');
    assert.match(item.messageEn,/did not go out/,'with an English line for the English UI');
    assert.equal(item.attempts,1);
    assert.ok(item.batchId,'it points at the batch whose rows failed');
    assert.equal(item.context.trigger,'auto_receipt','and it kept exactly what to run again');
    assert.equal(item.context.receiptNo,'9101');
    assert.equal(String(item.context.student),String(payer._id));
    assert.ok(!JSON.stringify(item).includes(API_KEY),'no credential reaches the card');
    assert.ok(!item.messageBn.includes('\n')&&!item.messageEn.includes('Error'),'a sentence, never an exception or a stack trace');

    // ---- 4. The same failure again is one row with a count, not a pile of rows.
    const again=await autoSendReceipt(receiptInput,{now,provider:fakeProvider({status:'rejected',code:'1007'}).provider});
    assert.equal(again.failed,true);
    assert.equal(await CenterSmsAutoProblem.countDocuments(),1,'a repeating failure folds into the open row');
    const folded=(await autoSmsProblems()).items[0];
    assert.equal(folded.attempts,2,'which counts the tries instead');
    assert.equal(folded.id,item.id);

    // ---- 5. Retry, with a provider that now works: only the failed rows go out again.
    const retrier=fakeProvider();
    const retried=await retryAutoSmsProblem(item.id,actorId,{now,provider:retrier.provider});
    assert.equal(retried.ok,true,'the retry worked');
    assert.equal(retried.sent,1,'the one refused message went out');
    assert.equal(retrier.itemCount(),1,'and only that one was asked for again');
    assert.match(retried.messageBn,/পাঠানো হয়েছে/,'the operator is told in their own language');
    assert.equal(await CenterSmsLog.countDocuments({status:'sent',phone:'01712223334'}),1,'the receipt is durable now');
    assert.equal((await autoSmsProblems()).count,0,'so the card is empty again');
    const resolved=await CenterSmsAutoProblem.findOne({}).lean();
    assert.equal(resolved.resolved,true,'the row is kept, resolved, as the record of what happened');
    assert.equal(String(resolved.resolvedBy),actorId,'naming the admin who retried it');
    assert.ok(resolved.resolvedAt instanceof Date);
    assert.equal(await AdminAudit.countDocuments({actor:actor._id,action:'sms.autoretry'}),1,'and a human retry is audited');
    const missing=await retryAutoSmsProblem(item.id,actorId,{now,provider:retrier.provider});
    assert.equal(missing.ok,false,'retrying a problem that is already closed says so');
    assert.match(missing.messageBn,/আর খোলা নেই/);
    assert.equal(retrier.itemCount(),1,'without sending anything again');

    // ---- 6. No batch at all: the balance call died, so the whole send has to run again.
    await CenterSettings.updateOne({key:'main'},{$set:{autoResult:true}});
    const batchesBefore=await CenterSmsBatch.countDocuments();
    const noBatch=await autoSendClassResults({exam:'synthetic-exam',classGroup:String(group._id)},{now,provider:noBalanceProvider().provider});
    assert.equal(noBatch.attempted,true);
    assert.equal(noBatch.failed,true);
    assert.ok(noBatch.problem);
    assert.equal(await CenterSmsBatch.countDocuments(),batchesBefore,'no batch was ever created');
    const second=(await autoSmsProblems()).items[0];
    assert.equal(second.trigger,'auto_result');
    assert.equal(second.batchId,'','so there is nothing to retry row by row');
    assert.match(second.messageBn,/নেটওয়ার্ক/,'and the operator is told it was a network problem, not a bad number');
    assert.match(second.who,/সমস্যা ক্লাস/,'naming the class it was for');

    const rerun=await retryAutoSmsProblem(second.id,actorId,{now,provider:fakeProvider().provider});
    assert.equal(rerun.ok,true,'the retry ran the whole automatic send again');
    assert.ok(rerun.batchId,'and made its own batch, because the original request id was spent');
    assert.equal(await CenterSmsBatch.countDocuments(),batchesBefore+1,'exactly one new batch');
    assert.ok(rerun.sent>=1,'the result messages went out this time');
    assert.equal(await CenterSmsLog.countDocuments({status:'sent',templateKey:'exam_result'})>=1,true);
    assert.equal((await autoSmsProblems()).count,0,'and the card is empty again');
    assert.equal(await CenterSmsAutoProblem.countDocuments({resolved:true}),2,'both problems stay on record, resolved');

    // ---- 7. No false alarms: a class nobody is in, and a reminder queued for quiet hours.
    await CenterSettings.updateOne({key:'main'},{$set:{autoDue:true}});
    const nobody=await autoSendClassDues(String(emptyGroup._id),{now,provider:fakeProvider().provider});
    assert.equal(nobody.reason,'no overdue students');
    assert.equal(nobody.failed,undefined,'a class with nobody overdue is not a failure');
    await CenterSettings.updateOne({key:'main'},{$set:{quietStart:dhakaClock(now,-60),quietEnd:dhakaClock(now,60)}});
    const queued=await autoSendClassDues(String(group._id),{now,provider:fakeProvider().provider});
    assert.equal(queued.status,'queued','inside quiet hours the reminder waits instead of going out');
    assert.equal(queued.failed,undefined,'and waiting is the system working');
    assert.equal((await autoSmsProblems()).count,0,'so neither shows up as a problem');
    assert.equal(await CenterSmsBatch.countDocuments({status:'queued'}),1,'the queued batch is real and will go out at the flush');
    await CenterSettings.updateOne({key:'main'},{$set:{quietStart:'00:00',quietEnd:'00:00'}});

    // ---- 8. Every trigger has its own words, and a credential never reaches the operator.
    for(const trigger of ['auto_receipt','auto_due','auto_result']){
      const text=autoProblemText(trigger,'SMS_NOT_CONFIGURED');
      assert.ok(text.messageBn.startsWith(AUTO_SMS_TRIGGER_LABELS[trigger].bn),`${trigger} names itself in Bangla`);
      assert.match(text.messageBn,/সেট করা হয়নি/,'and says what is missing');
      assert.match(text.messageEn,/not configured/);
      assert.equal(text.code,'SMS_NOT_CONFIGURED');
    }
    assert.match(autoProblemText('auto_receipt','SMS_DISABLED').messageBn,/CENTER_SMS_WRITE_ENABLED/,'the gate is named, because that one is a setting the operator controls');
    assert.match(autoProblemText('auto_receipt','NO_RECIPIENTS').messageBn,/নম্বর/,'a missing number says so');
    assert.match(autoProblemText('auto_receipt','UNRENDERED_VARIABLE:{subject}').messageBn,/মান নেই/,'an unfilled chip says so');
    assert.equal(autoProblemText('auto_receipt',null).messageBn.includes('কারণ জানা যায়নি'),true,'an unknown cause is admitted, not invented');
    const leaked=autoProblemText('auto_receipt',Error(`request failed with api_key=${API_KEY} and senderid=${SENDER_ID}`));
    assert.ok(!leaked.messageBn.includes(API_KEY),'a credential inside an error is redacted before the operator sees it');
    assert.ok(!leaked.messageEn.includes(SENDER_ID));
    assert.ok(!leaked.messageBn.includes('\n'),'and an error is flattened into one readable line');
    assert.equal(autoProblemKey({trigger:'auto_receipt',student:'a',amount:1,year:2026,month:1,receiptNo:'1'}),
      autoProblemKey({trigger:'auto_receipt',receiptNo:'1',month:1,year:2026,amount:1,student:'a'}),
      'the key is stable however the context is written, which is what folds repeats into one row');

    console.log('Automatic SMS problems: a toggle that is off records nothing; a payment is saved first and a refused receipt message neither throws at its caller nor touches it; the failure is stored with its trigger, its receipt, the provider’s own Bangla meaning for code 1007 and the context to run again, and the card reports one open problem in plain Bangla with no credential and no stack trace; the same failure again folds into one row that counts attempts; Retry on a refused batch re-sends only the failed rows, resolves the row against the admin who clicked and audits it, and refuses to retry a closed problem; Retry with no batch at all runs the whole send again under a fresh request id; a class nobody is in and a reminder queued for quiet hours are not problems; and every trigger has its own words, with a credential redacted before it can reach the operator.');
  }finally{
    await mongoose.disconnect();
    await mongo.stop();
  }
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
