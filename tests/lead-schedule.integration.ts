// @ts-nocheck -- visitor message schedules against a disposable database; synthetic records only.
/**
 * Visitor message schedules, end to end against a database with a counting fake provider.
 *
 * The unit suite proves the day arithmetic. This proves the promises the screen makes:
 *
 *   • a schedule's audience is decided again at send time, so a family that said "do not contact"
 *     after the schedule was written is skipped, not texted;
 *   • the send goes through the same pipeline as a manual one, and the batch records
 *     `trigger:'scheduled'`;
 *   • running the job twice sends once (the request id is the schedule's own id);
 *   • cancelling stops a message that has not left;
 *   • a plan queued by quiet hours becomes "sent" from its batch once the flush runs, instead of
 *     sitting on "queued" forever.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {Lead,nextLeadId} from '../src/models/Lead';
import {LeadSmsSchedule} from '../src/models/LeadSchedule';
import {CenterSettings,CenterSmsBatch,CenterSmsLog} from '../src/models/CenterRecords';
import {dhakaDay} from '../src/lib/admin/today';
import {leadScheduleInstant} from '../src/lib/leads/lead-schedule';
import {
  cancelLeadSchedule,createLeadSchedule,reconcileLeadSchedules,runDueLeadSchedules,
} from '../src/lib/leads/lead-schedule-db';
import {flushQueuedSms} from '../src/lib/center/sms-send';

/** A provider that counts calls and answers "submitted"; no network, no real message. */
function fakeProvider(){
  const calls=[];
  const answer={status:'submitted',code:'202'};
  return {
    calls,
    provider:{
      name:'mock',
      configured:true,
      async send(phone,message){calls.push({phone,message});return answer},
      async sendMany(items){calls.push(...items);return answer},
      async balance(){return {ok:true,balance:5000}},
    },
  };
}

async function run(){
  await preflight({mongo:true,test:'tests/lead-schedule.integration.ts — needs a MongoDB (or TEST_MONGO_URI from npm run test-mode)'});
  const shared=process.env.TEST_MONGO_URI||null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){for(const c of await mongoose.connection.db.listCollections().toArray()){await mongoose.connection.db.collection(c.name).deleteMany({}).catch(()=>{})}}

  try{
    const actor=await User.create({name:'Schedule Keeper',email:'schedule-keeper@example.test',passwordHash:await bcrypt.hash('Schedules-2026!',12),role:'admin',active:true});
    const actorId=String(actor._id);
    // Quiet hours off by default: the test must not depend on the hour CI runs at.
    await CenterSettings.create({key:'main',smsUnitCost:0.5,quietStart:'00:00',quietEnd:'00:00',institutePhone:'01711000000'});

    const today=dhakaDay(new Date());
    async function makeLead(name,phone,over={}){
      return Lead.create({leadId:await nextLeadId(),date:today,studentName:name,phones:[{normalized:phone,original:phone}],...over});
    }
    const rahul=await makeLead('রাহুল আহমেদ','01712817090',{classGroup:9,status:'called'});
    const rina=await makeLead('রিনা আক্তার','01911223344',{classGroup:9,status:'called'});
    const classTen=await makeLead('সাজিদ হাসান','01811223344',{classGroup:10,status:'new'});

    // Tomorrow, so the write path accepts the day whatever the clock says.
    const day=dhakaDay(new Date(Date.now()+24*60*60*1000));
    const at=leadScheduleInstant(day);

    // ---- 1. A schedule stores the audience it can contact today.
    const created=await createLeadSchedule({
      title:'Class Nine follow-up',day,classGroup:'9',templateKey:'visitor_thanks',createdBy:actorId,
    });
    assert.equal(created.ok,true,'the schedule is written');
    if(created.ok===false)throw new Error(created.code);
    assert.equal(created.count,2,'both contactable class-nine visitors are in the audience');
    assert.equal(created.at.toISOString(),at.toISOString(),'the send time is 07:05 Asia/Dhaka');

    // ---- 2. "Do not contact" is honoured at send time, not at schedule time.
    rina.doNotContact=true;
    await rina.save();

    const fake=fakeProvider();
    const first=await runDueLeadSchedules(at,fake.provider);
    assert.equal(first.due,1,'one schedule was due');
    assert.equal(first.sent,1,'the still-contactable visitor got the message');
    assert.equal(first.skipped,1,'the one who opted out was skipped');
    assert.equal(fake.calls.length,1,'exactly one message left the building');
    assert.equal(fake.calls[0].phone,rahul.phones[0].normalized,'and it went to the contactable number');
    assert.ok(!fake.calls.some(call=>call.phone===rina.phones[0].normalized),'the opted-out number never appears');

    const sent=await LeadSmsSchedule.findById(created.id).lean();
    assert.equal(sent.status,'sent');
    assert.equal(sent.sentCount,1);
    assert.equal(sent.skippedCount,1);
    assert.ok(sent.batchId,'the batch that did the send is recorded');
    const batch=await CenterSmsBatch.findById(sent.batchId).lean();
    assert.equal(batch.trigger,'scheduled','the batch says a schedule created it');
    assert.equal(batch.status,'done');
    assert.equal(batch.sentCount,1);

    // ---- 3. A second run of the same job sends nothing again.
    const second=await runDueLeadSchedules(at,fake.provider);
    assert.equal(second.due,0,'the schedule is no longer waiting');
    assert.equal(fake.calls.length,1,'and no second message was sent');

    // ---- 4. Cancelling stops a message that has not left.
    const cancelable=await createLeadSchedule({day,classGroup:'10',templateKey:'visitor_thanks',createdBy:actorId});
    assert.equal(cancelable.ok,true);
    if(cancelable.ok===false)throw new Error(cancelable.code);
    const cancelled=await cancelLeadSchedule(cancelable.id,actorId);
    assert.equal(cancelled.ok,true,'a waiting schedule can be cancelled');
    const third=await runDueLeadSchedules(at,fake.provider);
    assert.equal(third.due,0,'a cancelled schedule is not due');
    assert.equal(fake.calls.length,1,'and nothing was sent for it');
    assert.equal((await LeadSmsSchedule.findById(cancelable.id).lean()).status,'cancelled');
    assert.equal(await CenterSmsLog.countDocuments({lead:classTen._id}),0,'no log row exists for the cancelled send');

    // ---- 5. Quiet hours queue the plan; the flush sends it and reconciliation records the truth.
    await CenterSettings.updateOne({key:'main'},{$set:{quietStart:'06:00',quietEnd:'08:00'}});
    const queued=await createLeadSchedule({day,classGroup:'10',templateKey:'visitor_thanks',createdBy:actorId});
    assert.equal(queued.ok,true);
    if(queued.ok===false)throw new Error(queued.code);

    const fourth=await runDueLeadSchedules(at,fake.provider);
    assert.equal(fourth.due,1);
    const waiting=await LeadSmsSchedule.findById(queued.id).lean();
    assert.equal(waiting.status,'queued','a plan inside quiet hours waits for the window');
    assert.ok(waiting.batchId,'its batch is already durable');
    assert.equal((await CenterSmsBatch.findById(waiting.batchId).lean()).status,'queued');
    assert.equal(fake.calls.length,1,'nothing left during quiet hours');

    const flushed=await flushQueuedSms(new Date(at.getTime()+60*60*1000),fake.provider);
    assert.equal(flushed.sent,1,'the flush sends the queued message');
    assert.equal(fake.calls.length,2,'one more message, to the class-ten visitor');
    assert.equal(await reconcileLeadSchedules(),1,'the schedule is reconciled from its batch');
    const finished=await LeadSmsSchedule.findById(queued.id).lean();
    assert.equal(finished.status,'sent','and it no longer sits on "queued"');
    assert.equal(finished.sentCount,1);

    console.log('Visitor schedules: the audience is re-read at send time (an opt-out after the schedule was written is skipped), one send carries trigger "scheduled", a second run sends nothing, a cancelled schedule never leaves, and a quiet-hours plan becomes "sent" from its batch when the flush runs.');
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
}

run().catch(error=>{console.error(error);process.exit(1)});
