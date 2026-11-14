// @ts-nocheck -- R3.11: the staff ceiling and the narrowed catalog, against a disposable database; synthetic records only.
/**
 * R3.11 · What a staff account can actually do with the SMS money.
 *
 * `tests/sms-staff.test.ts` proves the refusals and the arithmetic with no database. This suite proves
 * what only a collection can: that the catalog handed to a Visitors screen is narrowed by the role that
 * asked for it, that the day's count is read off the batches ONE operator owns on ONE Dhaka day and off
 * what was actually sent rather than what was planned, and that the ceiling stops a send before the
 * provider is asked — leaving no log row, no batch and a Bangla sentence that carries the number.
 * It also proves the three ways the ceiling must NOT bite: a settings value of 0 is the owner turning it
 * off, an automatic send carries no operator so a cron is never stopped by somebody's allowance, and a
 * request whose batch already exists is answered with that batch rather than with a refusal that
 * contradicts the log the operator can read.
 *
 * No real message can leave: `SMS_PROVIDER=mock` and a counting fake provider.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {CenterSettings,CenterSmsBatch,CenterSmsLog} from '../src/models/CenterRecords';
import {createQuickLead} from '../src/lib/leads/leads';
import {runSmsDialog} from '../src/lib/center/sms-dialog';
import {sentMessagesToday,smsBatchExists} from '../src/lib/center/sms-send';
import {dhakaDay} from '../src/lib/admin/today';
import {smsDialogData,visitorSmsDialogData} from '../src/lib/center/sms-dialog-data';
import {STAFF_SMS_TEMPLATE,dailyLimitReachedMessage} from '../src/lib/center/sms-staff';

const P1='01712817090';
const P2='01811223344';
const P3='01933445566';
const CENTER='01711000000';
const EVERY_NUMBER=[P1,P2,P3];

function fakeProvider(){
  const calls=[];
  return {
    calls,
    provider:{
      name:'mock',
      configured:true,
      async send(phone,message){calls.push({kind:'send',items:[{phone,message}]});return {status:'submitted',code:'202'}},
      async sendMany(items){calls.push({kind:'sendMany',items});return {status:'submitted',code:'202'}},
      async balance(){return {ok:true,balance:5000}},
    },
    itemCount(){return calls.reduce((sum,call)=>sum+call.items.length,0)},
  };
}

async function run(){
  await preflight({mongo:true,test:'tests/sms-staff.integration.ts — needs a MongoDB (or TEST_MONGO_URI from npm run test-mode)'});
  const shared=process.env.TEST_MONGO_URI||null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){for(const c of await mongoose.connection.db.listCollections().toArray()){await mongoose.connection.db.collection(c.name).deleteMany({}).catch(()=>{})}}

  const answers=[];
  try{
    const now=new Date();
    const hash=await bcrypt.hash('StaffOnly-2026!',12);
    const desk=await User.create({name:'Front Desk',email:'staff-sms@example.test',passwordHash:hash,role:'staff',active:true});
    const boss=await User.create({name:'Owner',email:'admin-sms@example.test',passwordHash:hash,role:'admin',active:true});
    const deskId=String(desk._id),bossId=String(boss._id);
    // The quiet window starts EMPTY (start equals end) on purpose: CI runs at any Dhaka hour, and with
    // the real window a run at 02:00 would correctly queue every send and the "it went out now"
    // assertions below would fail for the wrong reason.
    await CenterSettings.create({key:'main',smsUnitCost:0.5,quietStart:'00:00',quietEnd:'00:00',institutePhone:CENTER,dailySmsLimitPerUser:1});

    // ── 1. The catalog is narrowed by the role that asked, not by the screen that rendered it.
    const staffKit=await visitorSmsDialogData('staff');
    answers.push(staffKit);
    assert.deepEqual(staffKit.templates.map(row=>row.key),[STAFF_SMS_TEMPLATE],'one template, and it is the thank-you');
    assert.equal(staffKit.staffRestricted,true);
    assert.equal(staffKit.allowPagePick,false,'no one-tap send to everybody on the page');
    assert.equal(staffKit.allowTextEdit,false,'no textarea, so no words of their own');
    assert.equal(staffKit.institutePhone,CENTER,'the one value the thank-you renders still arrives');
    const adminKit=await visitorSmsDialogData('admin');
    answers.push(adminKit);
    assert.ok(adminKit.templates.length>staffKit.templates.length,'an admin keeps the rest of the visitor catalog');
    assert.ok(adminKit.templates.some(row=>row.key==='custom'),'including writing the message themselves');
    assert.deepEqual([adminKit.staffRestricted,adminKit.allowPagePick,adminKit.allowTextEdit],[false,true,true]);
    const editorKit=await visitorSmsDialogData('content_editor');
    assert.deepEqual(editorKit.templates.map(row=>row.key),[STAFF_SMS_TEMPLATE],'a role that may not send at all is handed the narrow kit, not the wide one');
    const studentKit=await smsDialogData();
    answers.push(studentKit);
    assert.deepEqual([studentKit.staffRestricted,studentKit.allowPagePick,studentKit.allowTextEdit],[false,true,true],'the fee screens were never part of this decision');

    // ── 2. Three visitors to spend an allowance on.
    const made=async(studentName,phone)=>{
      const out=await createQuickLead({studentName,phone},deskId,now);
      assert.equal(out.ok,true,`${studentName} must be created, got ${out.code||''}`);
      return out;
    };
    const one=await made('ভিজিটর এক',P1);
    const two=await made('ভিজিটর দুই',P2);
    const three=await made('ভিজিটর তিন',P3);

    // ── 3. The day's count is per operator, per Dhaka day, and per message ACTUALLY SENT.
    assert.equal(await sentMessagesToday(deskId,now),0,'nothing spent yet');
    const backdated=await CenterSmsBatch.create({requestId:randomUUID(),purpose:'visitor_thanks',createdBy:deskId,trigger:'manual',status:'done',recipientCount:7,sentCount:7,segmentCount:7,estimatedCost:3.5});
    // Back-dated through the raw collection, not the model: `timestamps:true` makes `createdAt`
    // immutable, so a Mongoose update strips the $set and a "yesterday" batch stays today's — which would
    // make the day boundary below look proven when it was never tested at all.
    await CenterSmsBatch.collection.updateOne({_id:backdated._id},{$set:{createdAt:new Date(now.getTime()-26*3600*1000)}});
    assert.ok(dhakaDay((await CenterSmsBatch.findById(backdated._id).lean<{createdAt:Date}>()).createdAt)!==dhakaDay(now),
      'the fixture really is yesterday in Dhaka before anything is claimed about it');
    await CenterSmsBatch.create({requestId:randomUUID(),purpose:'due_reminder',createdBy:bossId,trigger:'manual',status:'done',recipientCount:9,sentCount:9,segmentCount:9,estimatedCost:4.5});
    await CenterSmsBatch.create({requestId:randomUUID(),purpose:'visitor_thanks',createdBy:deskId,trigger:'manual',status:'failed',recipientCount:4,sentCount:0,failedCount:4,segmentCount:4,estimatedCost:0});
    assert.equal(await sentMessagesToday(deskId,now),0,'yesterday is another day, and a chunk that sent nothing counts as nothing');
    assert.equal(await sentMessagesToday(bossId,now),9,'somebody else’s allowance is theirs');
    assert.equal(await smsBatchExists('no-such-request'),false);

    // ── 4. The ceiling end to end: the first thank-you goes, the second is refused in Bangla with the
    //       number in it, and the refusal lands BEFORE the provider is asked — so nothing is logged.
    const fake=fakeProvider();
    const call=(input,options={})=>runSmsDialog(input,deskId,{now,role:'staff',provider:fake.provider,...options});
    const base={templateKey:STAFF_SMS_TEMPLATE,target:'guardian',text:''};
    const firstId=randomUUID();

    const firstPreview=await call({mode:'preview',source:'lead',id:one.id,requestId:firstId,...base});
    answers.push(firstPreview.body);
    assert.equal(firstPreview.status,200);
    assert.deepEqual(firstPreview.body.daily,{limit:1,sent:0,remaining:1},'the dialog says what is left before anybody presses send');

    const firstSend=await call({mode:'send',source:'lead',id:one.id,requestId:firstId,...base});
    answers.push(firstSend.body);
    assert.equal(firstSend.body.ok,true,'the first thank-you of the day goes out');
    assert.equal(fake.itemCount(),1);
    assert.equal(await sentMessagesToday(deskId,now),1);
    assert.equal(await smsBatchExists(firstId),true);

    const secondId=randomUUID();
    const secondPreview=await call({mode:'preview',source:'lead',id:two.id,requestId:secondId,...base});
    answers.push(secondPreview.body);
    assert.equal(secondPreview.body.ok,true,'counting recipients is free, so the ceiling never hides the number');
    assert.deepEqual(secondPreview.body.daily,{limit:1,sent:1,remaining:0});

    const refused=await call({mode:'send',source:'lead',id:two.id,requestId:secondId,...base});
    answers.push(refused.body);
    assert.equal(refused.status,409);
    assert.equal(refused.body.blocked,'DAILY_LIMIT');
    assert.equal(refused.body.messageBn,dailyLimitReachedMessage(1,'bn'),'the sentence the owner asked for');
    assert.ok(refused.body.messageBn.includes('সীমা')&&refused.body.messageBn.includes('১'),'it names the ceiling in Bangla digits');
    assert.equal(refused.body.daily.remaining,0);
    assert.equal(fake.itemCount(),1,'the provider was never asked for the refused message');
    assert.equal(await CenterSmsLog.countDocuments({lead:new mongoose.Types.ObjectId(two.id)}),0,'nothing was logged for it');
    assert.equal(await CenterSmsBatch.countDocuments({requestId:secondId}),0,'and no batch either — a refused send leaves no row to retry');

    // ── 5. A double-click on the request that DID go out is answered with the recorded batch, not with
    //       the ceiling: the truth about a send that happened outranks an allowance that ran out.
    const again=await call({mode:'send',source:'lead',id:one.id,requestId:firstId,...base});
    answers.push(again.body);
    assert.equal(again.body.ok,true,'the recorded batch answers');
    assert.equal(fake.itemCount(),1,'and however it is answered, the thank-you is not sent twice');

    // ── 6. Zero is the off switch, and it takes effect on the next send rather than needing a restart.
    await CenterSettings.updateOne({key:'main'},{$set:{dailySmsLimitPerUser:0}});
    // Only a PREVIEW quotes the allowance — a send answers with what it did — so the off switch is read
    // from a preview and then proved by the send that follows it.
    const offId=randomUUID();
    const offPreview=await call({mode:'preview',source:'leads',ids:[two.id,three.id],requestId:offId,...base});
    answers.push(offPreview.body);
    assert.equal(offPreview.body.daily,null,'with the ceiling off the dialog stops quoting a limit that is not in force');
    const unlimited=await call({mode:'send',source:'leads',ids:[two.id,three.id],requestId:offId,...base});
    answers.push(unlimited.body);
    assert.equal(unlimited.body.ok,true,'and a selection of two goes out');
    assert.equal(fake.itemCount(),3);

    // ── 7. An automatic send carries no operator, so the centre's own messages are never counted
    //       against — or stopped by — the person who happens to have configured them.
    await CenterSettings.updateOne({key:'main'},{$set:{dailySmsLimitPerUser:1}});
    const automatic=await runSmsDialog({mode:'preview',source:'lead',id:three.id,requestId:randomUUID(),...base},deskId,{now,provider:fake.provider});
    answers.push(automatic.body);
    assert.equal(automatic.body.ok,true);
    assert.equal(automatic.body.daily,null,'no role, no allowance, nothing to report');

    // ── 8. The allowance is per USER, and the proof is that each of them is quoted their OWN day: the
    //       owner on the nine-message batch seeded in section 3, the desk on the three it actually sent.
    //       Neither number appears in the other's answer, which is the whole claim.
    assert.equal(await sentMessagesToday(bossId,now),9,'the owner’s day holds the owner’s batch');
    assert.equal(await sentMessagesToday(deskId,now),3,'and the desk’s day holds the desk’s own three — the thanked one plus the pair sent after the ceiling was lifted');
    const bossPreview=await runSmsDialog({mode:'preview',source:'lead',id:three.id,requestId:randomUUID(),...base},bossId,{now,role:'admin',provider:fake.provider});
    answers.push(bossPreview.body);
    assert.deepEqual(bossPreview.body.daily,{limit:1,sent:9,remaining:0},'the owner is counted on their own nine, not on the desk’s one');

    // ── 9. What may carry a number, and what may not. A kit is a catalog and a set of flags, so a
    //       visitor's digits have no business in it, and no answer of any kind carries a family key —
    //       that tie is internal and never travels. A PREVIEW does name the numbers it is about to text:
    //       that is R2's dialog and the whole point of a last look before sending, so the claim there is
    //       the positive one — it names exactly the number the operator picked, and nobody else's.
    //       (The list screens are where a number is masked; R3.8 proves that, in the served HTML.)
    for(const kit of [staffKit,adminKit,editorKit,studentKit]){
      const text=JSON.stringify(kit);
      for(const number of EVERY_NUMBER){
        assert.equal(text.includes(number),false,`a catalog holds no visitor number (${number})`);
      }
      assert.equal(/familyKey/i.test(text),false,'and no family key');
    }
    for(const body of answers){
      assert.equal(/familyKey/i.test(JSON.stringify(body)),false,'no dialog answer carries a family key');
    }
    const named=(firstPreview.body.preview.recipients||[]).map(row=>row.phone);
    assert.deepEqual(named,[P1],'a preview names the number of the visitor that was picked, and only that one');

    console.log('Staff SMS against the database: the catalog handed to a Visitors screen is narrowed by the role that asked — staff get the thank-you alone with no page-pick and no textarea, a role that may not send at all gets the same narrow kit, and admin and super admin keep the catalog they had including custom text; the day’s count is read off the batches one operator owns on one Dhaka day and off messages actually sent, so yesterday and a failed chunk count as nothing and another operator’s allowance stays theirs; with the limit at one the first send goes and the second is refused 409 DAILY_LIMIT in a Bangla sentence carrying the number, before the provider is asked, leaving no log row and no batch to retry; a repeated request that already went out is answered by its recorded batch rather than by the ceiling; a limit of 0 turns the ceiling off on the next send and the dialog stops quoting it; an automatic send carries no operator so it is never counted; the allowance is per user, quoted to each operator from their own batches; a catalog holds no visitor number and no answer carries a family key, while a preview names exactly the number the operator picked — the masking of a number belongs to the list screens, and R3.8 proves it there.');
  }finally{
    await mongoose.disconnect();
    await mongo.stop();
  }
}

run().catch(error=>{console.error(error);process.exit(1)});
