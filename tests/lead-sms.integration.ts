// @ts-nocheck -- R3.9: the visitor SMS entry point, against a disposable database; synthetic leads only.
/**
 * R3.9 · Send SMS from the Visitors screens.
 *
 * `tests/lead-sms.test.ts` proves the translation from a lead to an SMS candidate with no database. This
 * suite proves what only a collection can: that the entry points read leads through the rule layer, that
 * "do not contact" survives every filter a caller can supply, that a send writes log rows pointing at the
 * LEAD and never at a student reference, and that a visitor blocked after the dialog was opened is still
 * not texted.
 *
 * No real message can leave: `SMS_PROVIDER=mock` and a counting fake provider, so the only thing this file
 * sends is an assertion.
 *
 *   • `leadsForSms()` returns blocked and phoneless leads instead of dropping them, so the dialog can name
 *     them; it reads only the first normalized number; it drops ids that are not ObjectIds; it is capped;
 *     and a binned lead is not in it at all.
 *   • `contactableLeadSelection()` answers the SAME filter the list drew, counts what it excluded, and
 *     cannot be widened by a caller-supplied filter that asks for blocked leads by name.
 *   • `resolveSmsSource()` routes `lead` and `leads`, marks the subject kind, and resolves an id-less
 *     request to NOBODY rather than to everybody in the book.
 *   • `buildSmsPlan()` renders `visitor_thanks` with the center's own number, folds a family that shares a
 *     number into one message, skips a blocked visitor by name, and warns about a repeat within 24 hours —
 *     including across a month boundary, which a student send does not look at and must not.
 *   • `executeSmsPlan()` writes one log row per visitor covered, each carrying `lead` and no `student`,
 *     books the cost to the current month, and audits a batch id with no phone number in it.
 *   • `runSmsDialog()` refuses a malformed id, an empty or invented selection and an unknown source,
 *     previews an all-blocked selection with the reasons in Bangla, refuses to send it, re-reads permission
 *     at plan time, and one requestId means one batch — so a double-click cannot thank a family twice.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {AdminAudit} from '../src/models/AdminAudit';
import {CenterSettings,CenterSmsBatch,CenterSmsLog} from '../src/models/CenterRecords';
import {softDelete} from '../src/lib/admin/recycle';
import {
  contactableLeadSelection,createQuickLead,leadsForSms,listLeads,setContactPermission,updateLeadStatus,
} from '../src/lib/leads/leads';
import {resolveSmsSource} from '../src/lib/center/sms-source';
import {
  buildSmsPlan,dhakaMonthKey,executeSmsPlan,monthSmsTotals,previousMonthKey,recentDuplicateStudents,
} from '../src/lib/center/sms-send';
import {runSmsDialog} from '../src/lib/center/sms-dialog';

const P1='01712817090';   // রাহুল — and the second number written in the same cell
const P2='01811223344';
const P3='01933445566';   // blocked by the sticky mark
const P4='01611998877';   // blocked by the status
const P5='01511778899';   // binned
const P6='01733667788';   // created last, for the double-click proof
const CENTER='01711000000';
const EVERY_NUMBER=[P1,P2,P3,P4,P5,P6,CENTER];

/** A provider that counts what it was handed and never touches a network. */
function fakeProvider(answer={status:'submitted',code:'202'}){
  const calls=[];
  return {
    calls,
    provider:{
      name:'mock',
      configured:true,
      async send(phone,message){calls.push({kind:'send',items:[{phone,message}]});return answer},
      async sendMany(items){calls.push({kind:'sendMany',items});return answer},
      async balance(){return {ok:true,balance:5000}},
    },
    itemCount(){return calls.reduce((sum,call)=>sum+call.items.length,0)},
  };
}

async function run(){
  await preflight({mongo:true,test:'tests/lead-sms.integration.ts — needs a MongoDB (or TEST_MONGO_URI from npm run test-mode)'});
  const shared=process.env.TEST_MONGO_URI||null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){for(const c of await mongoose.connection.db.listCollections().toArray()){await mongoose.connection.db.collection(c.name).deleteMany({}).catch(()=>{})}}
  process.env.SMS_PROVIDER='mock';
  process.env.BULKSMSBD_API_KEY='sk-lead-sms-integration';

  try{
    const now=new Date();
    const month=dhakaMonthKey(now);
    const actor=await User.create({name:'Front Desk',email:'lead-sms@example.test',passwordHash:await bcrypt.hash('LeadsOnly-2026!',12),role:'admin',active:true});
    const actorId=String(actor._id);
    // The quiet window starts EMPTY (start equals end) on purpose: CI runs at any Dhaka hour, and with the
    // real 21:00–07:00 default a run at 02:00 would correctly queue every send and the "it went out now"
    // assertions below would fail for the wrong reason.
    await CenterSettings.create({key:'main',smsUnitCost:0.5,quietStart:'00:00',quietEnd:'00:00',institutePhone:CENTER});

    // ── fixtures: one family on a shared number, a lead with no number, both kinds of blocked, one to bin
    const made=async (studentName,phone,over={})=>{
      const out=await createQuickLead({studentName,phone,...over},actorId,now);
      assert.equal(out.ok,true,`${studentName} must be created, got ${out.code||''}`);
      return out;
    };
    const rahul=await made('রাহুল',`${P1}, ${P2}`,{classLabel:'দশম শ্রেণি'});
    const sister=await made('রাহুলের বোন',P1,{classLabel:'অষ্টম শ্রেণি'});
    const noPhone=await made('নাম্বারহীন ভিজিটর','');
    const marked=await made('যোগাযোগ করবেন না',P3);
    const byStatus=await made('অবস্থায় বন্ধ',P4);
    const binned=await made('বিনে যাওয়া ভিজিটর',P5);
    assert.equal((await setContactPermission(marked.id,false,actorId)).ok,true,'the sticky mark is set');
    assert.equal((await updateLeadStatus(byStatus.id,'do_not_contact',actorId,now)).ok,true,'and so is the status');
    assert.equal((await softDelete('lead',binned.id,actorId,now)).status,'ok','the sixth lead is binned');
    const allIds=[rahul.id,sister.id,noPhone.id,marked.id,byStatus.id,binned.id];

    // ── 1. `leadsForSms()`: blocked and phoneless leads are RETURNED, named, and never texted.
    const rows=await leadsForSms(allIds);
    assert.equal(rows.length,5,'a binned lead is not in the answer at all');
    assert.ok(!rows.some(row=>row.id===binned.id),'and its id is not quietly kept');
    const byId=Object.fromEntries(rows.map(row=>[row.id,row]));
    assert.equal(byId[marked.id].contactable,false,'the sticky mark is re-read here, at plan time');
    assert.equal(byId[byStatus.id].contactable,false,'and so is the status');
    assert.equal(byId[noPhone.id].phone,'','a lead with no number reports an empty number rather than vanishing');
    assert.equal(byId[rahul.id].phone,P1,'only the FIRST number is read');
    assert.ok(!rows.some(row=>row.phone===P2),'the second number in one cell is never a second thank-you');
    assert.equal(byId[rahul.id].leadId,rahul.leadId,'each row still carries the readable id an operator checks');
    assert.deepEqual(await leadsForSms(['not-an-id','','nope']),[],'an invented id answers nobody');
    assert.equal((await leadsForSms([...allIds,...allIds])).length,5,'a repeated id is one lead');
    assert.equal((await leadsForSms(rows.map(row=>row.id).concat(rows.map(row=>row.id)),3)).length,3,'and the answer is capped at what the caller asked for');
    assert.deepEqual(await leadsForSms([]),[],'an empty selection is an empty answer');

    // ── 2. The bulk selection: the same filter as the list, and no filter can widen it.
    const selection=await contactableLeadSelection({},now);
    assert.equal(selection.matched,5,'the list shows five live leads');
    assert.equal(selection.recipients.length,2,'two of them may be texted');
    assert.deepEqual(selection.recipients.map(row=>row.phone).sort(),[P1,P1],'the family shares one number, which the pipeline folds into one message');
    assert.equal(selection.excludedDoNotContact,2,'two are excluded by "do not contact" — the mark and the status');
    assert.equal(selection.withoutPhone,1,'one has no number');
    assert.ok(!selection.recipients.some(row=>[P3,P4,P5].includes(row.phone)),'no blocked or binned number is in it');
    // What the list drew and what the send covers are the same set of people, filters included.
    const named=await contactableLeadSelection({q:'রাহুলের বোন'},now);
    const listed=await listLeads({q:'রাহুলের বোন',page:1,perPage:100},now);
    assert.equal(named.matched,listed.total,'a name filter narrows the send exactly as it narrows the list');
    assert.equal(named.recipients.length,1);
    assert.equal(named.recipients[0].id,sister.id);
    const newOnly=await contactableLeadSelection({status:'new'},now);
    assert.equal(newOnly.matched,4,'the sticky mark does not change the status');
    assert.equal(newOnly.recipients.length,2);
    assert.equal(newOnly.excludedDoNotContact,1,'only the blocked lead INSIDE this filter is counted as excluded');
    // A caller asking for the blocked ones by name still gets nobody: the guard is an $and around the
    // filter, so no value — and no raw Mongo operator smuggled in as one — can cancel it.
    for(const hostile of [{status:'do_not_contact'},{doNotContact:false},{doNotContact:{$ne:true}},{status:{$ne:'new'}},{contactable:true}]){
      const attempt=await contactableLeadSelection(hostile,now);
      assert.ok(!attempt.recipients.some(row=>[P3,P4].includes(row.phone)),`${JSON.stringify(hostile)} must not smuggle a blocked lead into a send`);
    }
    const blockedOnly=await contactableLeadSelection({status:'do_not_contact'},now);
    assert.equal(blockedOnly.recipients.length,0,'a filter that selects ONLY blocked leads resolves to nobody');
    assert.equal(blockedOnly.excludedDoNotContact,blockedOnly.matched,'and reports every one of them as excluded');

    // ── 3. The entry points route, mark the subject kind, and never mean "everybody".
    const one=await resolveSmsSource({source:'lead',id:rahul.id},now);
    assert.equal(one.subjectKind,'lead','a lead send says so, because the log row depends on it');
    assert.equal(one.candidates.length,1);
    assert.equal(one.candidates[0].id,rahul.id,'the candidate carries the lead id, never a made-up student id');
    assert.equal(one.className,'','a visitor has no class to name in the message');
    const many=await resolveSmsSource({source:'leads',ids:allIds},now);
    assert.equal(many.subjectKind,'lead');
    assert.equal(many.candidates.length,5,'a binned lead is not a candidate');
    assert.equal(many.candidates.filter(c=>c.smsOptOut).length,2,'both blocked visitors arrive already opted out');
    assert.ok(many.candidates.every(c=>c.status==='active'),'no visitor is given a student fee state');
    assert.deepEqual((await resolveSmsSource({source:'leads'},now)).candidates,[],'a selection with no ids is nobody');
    assert.deepEqual((await resolveSmsSource({source:'lead'},now)).candidates,[],'a single lead with no id is nobody');
    assert.deepEqual((await resolveSmsSource({source:'leads',ids:['nope']},now)).candidates,[],'and a selection of invented ids is nobody');
    // `dues` and `class` throw on an invalid class on purpose, so the check that an older entry point is
    // still a STUDENT send uses `students` with no ids — which resolves to nobody, as it always has.
    assert.equal((await resolveSmsSource({source:'students'},now)).subjectKind,'student','every older entry point is still a student send');

    // ── 4. The plan: `visitor_thanks` renders, the family folds into one message, and every exclusion is
    //       named with a reason in both languages.
    const plan=await buildSmsPlan({
      requestId:randomUUID(),students:many.candidates,templateKey:'visitor_thanks',audience:'guardian',
      onePerPhone:true,subjectKind:'lead',globalValues:{institute_phone:CENTER},month,now,
    });
    assert.equal(plan.subjectKind,'lead','the plan carries the subject kind into the log write');
    assert.equal(plan.purpose,'visitor_thanks');
    assert.equal(plan.blocked,null,'the visitor template needs nothing a lead cannot supply');
    assert.equal(plan.recipientCount,1,'one family, one number, one message');
    assert.deepEqual(plan.items[0].studentIds.slice().sort(),[rahul.id,sister.id].sort(),'and it is traceable to both visitors');
    assert.ok(plan.body.includes(CENTER),'the center’s own number is rendered into the body');
    assert.ok(!plan.body.includes('{'),'no chip is left behind');
    const skippedNames=plan.skipped.map(item=>[item.studentName,item.reason]);
    assert.ok(skippedNames.some(([name,reason])=>name==='যোগাযোগ করবেন না'&&reason==='opted_out'),'the blocked visitor is named in the skip list');
    assert.ok(skippedNames.some(([name,reason])=>name==='নাম্বারহীন ভিজিটর'&&reason==='missing_phone'),'and so is the one with no number');
    assert.equal(plan.skipped.length,3,'three of the five candidates cannot be reached, and all three are reported');
    assert.ok(plan.skipped.every(item=>item.labelBn&&item.labelEn),'every skip carries both labels');
    assert.ok(plan.skipped.every(item=>!item.phone),'a skipped visitor carries no number to leak');
    assert.equal(plan.month,month,'the cost is booked to the month it was sent in, even though a visitor has no fee month');

    // ── 5. The send: one log row per visitor covered, each carrying `lead` and NO student reference.
    const send=fakeProvider();
    const outcome=await executeSmsPlan(plan,{actor:actorId,provider:send.provider,now});
    assert.equal(outcome.status,'done');
    assert.equal(outcome.sent,1,'one message went out');
    assert.equal(send.itemCount(),1,'the provider was handed exactly what the plan contained');
    const logs=await CenterSmsLog.find({batch:outcome.batchId}).lean();
    assert.equal(logs.length,2,'one row per visitor the grouped message covers');
    assert.deepEqual(logs.map(row=>String(row.lead)).sort(),[rahul.id,sister.id].sort(),'each points at its lead');
    assert.ok(logs.every(row=>!row.student),'and none of them at a student reference');
    assert.ok(logs.every(row=>row.status==='sent'&&row.templateKey==='visitor_thanks'&&row.month===month));
    const batch=await CenterSmsBatch.findById(outcome.batchId).lean();
    assert.equal(batch.purpose,'visitor_thanks');
    assert.equal(batch.sentCount,1);
    assert.equal(batch.recipientCount,1);
    assert.equal(batch.skippedCount,3,'the three who could not be reached are counted on the batch');
    // A student send still writes `student` and no `lead` — the two subjects never share a field.
    const studentLog=await CenterSmsLog.create({phone:CENTER,message:'শিক্ষার্থী বার্তা',segments:1,cost:0,templateKey:'due_reminder',month,status:'sent',student:new mongoose.Types.ObjectId()});
    assert.ok(!(await CenterSmsLog.findById(studentLog._id).lean()).lead);
    const totals=await monthSmsTotals(now);
    assert.ok(totals.sent>=2,'the visitor rows are counted in the month’s totals like any other send');
    // The audit row names a batch: not a person, and never a number.
    const audits=await AdminAudit.find({action:/^sms\./}).lean();
    assert.ok(audits.length>=1,'the send wrote an audit row');
    assert.equal(audits[0].target,String(outcome.batchId),'and its target is the batch');
    for(const row of audits){
      const text=JSON.stringify(row);
      for(const number of EVERY_NUMBER)assert.ok(!text.includes(number),'an sms audit row must not carry a phone number');
    }

    // ── 6. The 24-hour warning reads the LEAD rows, and only the lead rows.
    assert.deepEqual(await recentDuplicateStudents('visitor_thanks',[rahul.id],month,now,24,'lead'),[rahul.id],'the visitor just thanked is reported as a repeat');
    assert.deepEqual(await recentDuplicateStudents('visitor_thanks',[rahul.id],month,now,24,'student'),[],'the same id is not a student, so a student-keyed lookup finds nothing');
    assert.deepEqual(await recentDuplicateStudents('visitor_thanks',[noPhone.id],month,now,24,'lead'),[],'a lead that was not texted is not reported');
    // A thank-you sent two hours before a month boundary is still "already sent today" after it.
    await CenterSmsLog.create({phone:P4,message:'পুরোনো ধন্যবাদ',segments:1,cost:0.5,templateKey:'visitor_thanks',month:previousMonthKey(month),status:'sent',lead:byStatus.id,createdAt:new Date(now.getTime()-2*60*60*1000)});
    assert.deepEqual(await recentDuplicateStudents('visitor_thanks',[byStatus.id],[month,previousMonthKey(month)],now,24,'lead'),[byStatus.id],'a lead send looks at both months, so a boundary cannot hide a repeat');
    assert.deepEqual(await recentDuplicateStudents('visitor_thanks',[byStatus.id],month,now,24,'lead'),[],'one month alone would have missed it');
    const noPhonePlan=await buildSmsPlan({
      requestId:randomUUID(),students:(await resolveSmsSource({source:'lead',id:noPhone.id},now)).candidates,
      templateKey:'visitor_thanks',audience:'guardian',subjectKind:'lead',globalValues:{institute_phone:CENTER},month,now,
    });
    assert.deepEqual(noPhonePlan.duplicates,[],'no warning is invented for a lead that was not texted');
    assert.equal(noPhonePlan.recipientCount,0,'and a lead with no number still produces no message');
    assert.equal(previousMonthKey('2026-01'),'2025-12','January rolls back a year');
    assert.equal(previousMonthKey('2026-03'),'2026-02');
    assert.equal(previousMonthKey('2026-13'),'2026-13','an impossible month answers itself');
    assert.equal(previousMonthKey('nonsense'),'nonsense','and so does an unreadable one');

    // ── 7. The dialog: refusals first, then a preview that names who is left out, then the send's refusal.
    const call=(input,options={})=>runSmsDialog(input,actorId,{now,provider:options.provider||fakeProvider().provider,...options});
    const base={mode:'preview',templateKey:'visitor_thanks',target:'guardian',requestId:randomUUID()};
    assert.equal((await call({...base,source:'lead',id:'nope'})).body.detail,'id','a malformed lead id is refused, not guessed at');
    assert.equal((await call({...base,source:'leads',ids:[]})).body.detail,'ids','an empty selection is refused rather than read as everybody');
    assert.equal((await call({...base,source:'leads'})).body.detail,'ids');
    assert.equal((await call({...base,source:'leads',ids:['nope','also-nope']})).body.detail,'ids','and so is a selection of invented ids');
    assert.equal((await call({...base,source:'nobody',ids:[rahul.id]})).body.detail,'source','an unknown source is refused');
    // A preview of a binned lead still answers — the dialog's job is to report — and it is the SEND that
    // refuses, because a preview writes nothing and a refusal there would hide the reason from the operator.
    const binnedPreview=await call({...base,source:'lead',id:binned.id,requestId:randomUUID()});
    assert.equal(binnedPreview.status,200);
    assert.equal(binnedPreview.body.preview.phones,0,'a binned lead is not a candidate, so there is nothing to send');
    const binnedAttempt=await call({...base,mode:'send',source:'lead',id:binned.id,requestId:randomUUID()});
    assert.equal(binnedAttempt.status,409,'and the send refuses');
    assert.equal(binnedAttempt.body.blocked,'NO_RECIPIENTS');
    const allBlocked=await call({...base,source:'leads',ids:[marked.id,byStatus.id,noPhone.id],requestId:randomUUID()});
    assert.equal(allBlocked.status,200,'a preview of an all-blocked selection still answers — it is the send that refuses');
    assert.equal(allBlocked.body.preview.phones,0);
    assert.equal(allBlocked.body.preview.skippedCount,3,'all three are reported, each with a reason');
    assert.ok(allBlocked.body.preview.skipped.some(item=>item.studentName==='যোগাযোগ করবেন না'&&item.labelBn.includes('যোগাযোগ করবেন না')),'and the operator reads why in Bangla');
    const blockedSend=await call({...base,mode:'send',source:'leads',ids:[marked.id,byStatus.id],requestId:randomUUID()});
    assert.equal(blockedSend.status,409);
    assert.equal(blockedSend.body.blocked,'NO_RECIPIENTS','a send to only blocked visitors sends nothing');
    const preview=await call({...base,source:'leads',ids:allIds,requestId:randomUUID()});
    assert.equal(preview.status,200);
    assert.equal(preview.body.mode,'preview');
    assert.equal(preview.body.preview.phones,1,'the family’s shared number is one message');
    assert.ok(preview.body.preview.body.includes(CENTER));
    assert.equal(preview.body.institutePhone,CENTER);

    // ── 8. Permission is re-read at plan time: a visitor blocked AFTER the dialog opened is not texted.
    const stale={templateKey:'visitor_thanks',target:'guardian',source:'leads',ids:[rahul.id]};
    const beforeBlock=await call({...stale,mode:'preview',requestId:randomUUID()});
    assert.equal(beforeBlock.body.preview.phones,1,'before the block, this visitor is reachable');
    await setContactPermission(rahul.id,false,actorId);
    const afterBlock=await call({...stale,mode:'preview',requestId:randomUUID()});
    assert.equal(afterBlock.body.preview.phones,0,'the same selection a minute later reaches nobody');
    assert.ok(afterBlock.body.preview.skipped.some(item=>item.reason==='opted_out'),'and the preview says why');
    const refusedSend=await call({...stale,mode:'send',requestId:randomUUID()});
    assert.equal(refusedSend.status,409,'so the send refuses instead of texting somebody who said no');
    assert.equal(await CenterSmsLog.countDocuments({lead:rahul.id}),1,'no second message was written for the blocked visitor');

    // ── 9. One requestId is one batch, so a double-click cannot thank a visitor twice.
    const fresh=await made('ইদানীং আসা ভিজিটর',P6);
    const requestId=randomUUID();
    const provider=fakeProvider();
    const attempt={mode:'send',source:'lead',id:fresh.id,templateKey:'visitor_thanks',target:'guardian',requestId};
    const firstSend=await call(attempt,{provider:provider.provider});
    assert.equal(firstSend.status,200);
    assert.equal(firstSend.body.ok,true);
    const sentFirst=provider.itemCount();
    assert.equal(sentFirst,1,'the thank-you went out once');
    const secondSend=await call(attempt,{provider:provider.provider});
    assert.equal(provider.itemCount(),sentFirst,'the repeat handed the provider nothing new');
    assert.equal(secondSend.body.ok,true,'and it answered with the winner rather than an error');
    assert.equal(await CenterSmsBatch.countDocuments({requestId}),1,'one requestId, one batch');
    const freshLogs=await CenterSmsLog.find({lead:fresh.id}).lean();
    assert.equal(freshLogs.length,1,'one thank-you, one row');
    assert.ok(freshLogs.every(row=>!row.student),'pointing at the lead and at no student');
    // A different requestId is a deliberate second send, not an accident: it is allowed, and the preview
    // is where the operator is told the visitor was already thanked today.
    const warned=await call({mode:'preview',source:'lead',id:fresh.id,templateKey:'visitor_thanks',target:'guardian',requestId:randomUUID()});
    assert.deepEqual(warned.body.preview.duplicates.map(item=>item.name),['ইদানীং আসা ভিজিটর'],'the repeat is named in the preview');

    console.log('Visitor SMS entry point: leadsForSms returns blocked and phoneless leads by name, reads only the first number, drops invented ids, is capped and never returns a binned lead; the bulk selection answers the same filter as the list, counts its exclusions and cannot be widened by a caller filter — even one written as a raw Mongo operator — that asks for blocked leads; resolveSmsSource routes one lead and a selection, marks the subject kind and resolves an id-less request to nobody; visitor_thanks renders with the center number, folds a family sharing one number into a single message traceable to both visitors, and names all three exclusions with reasons in both languages; the send writes one log row per visitor carrying the lead and no student reference, books the cost to the current month, counts the skipped on the batch and audits a batch id with no phone number in it; the 24-hour repeat warning reads the lead rows only and still catches a thank-you sent two hours before a month boundary; the dialog refuses a malformed id, an empty or invented selection, an unknown source and a send to only blocked visitors, previews them with Bangla reasons, and re-reads permission so a visitor blocked after the dialog opened is not texted; and one requestId means one batch, so a double-click cannot thank a visitor twice while a deliberate second send is warned about by name.');
  }finally{
    await mongoose.disconnect();
    await mongo.stop();
  }
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
