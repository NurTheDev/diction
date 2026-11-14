// @ts-nocheck -- R3.13: the three hand-offs against a disposable database; synthetic leads, admissions and slots only.
/**
 * R3.13 · Convert to admission, book a trial, mark not interested — as writes.
 *
 * `tests/lead-handoff.test.ts` proves the rules with no database. This suite proves what only a
 * collection can: that a hand-off writes the intake row AND moves the lead in one transaction, that the
 * number on the intake row is the lead's own number rather than anything a form posted, that a seat is
 * taken with the same guarded increment the public booking uses so two operators cannot sell the last
 * one twice, that a hand-off already done refuses itself, and that "not interested" will not close a
 * row without a reason filed where the timeline keeps it.
 *
 * The last section is the privacy one: the view a drawer is handed — prefills included — carries masks
 * and no family key, so the hand-off forms cannot become the place a number finally leaks.
 *
 * Nothing here can send an SMS or reach a provider: no plan is ever built.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {AdminAudit} from '../src/models/AdminAudit';
import {Lead} from '../src/models/Lead';
import {Admission,Slot,TrialBooking} from '../src/models/Intake';
import {softDelete} from '../src/lib/admin/recycle';
import {
  bookLeadTrial,convertLeadToAdmission,createQuickLead,leadDetail,markLeadNotInterested,
  trialSlotsForLead,
} from '../src/lib/leads/leads';
import {detailView} from '../src/lib/leads/lead-ui';
import {maskPhone} from '../src/lib/leads/vocab';

const P1='01712817090';
const P2='01811223344';
const P3='01933445566';
const NOW=new Date('2026-11-12T05:00:00.000Z');
const FUTURE=new Date('2026-11-20T10:00:00.000Z');
const PAST=new Date('2026-11-01T10:00:00.000Z');

const ADMISSION_INPUT={
  studentName:'রাহুল হাসান',guardianName:'করিম হাসান',grade:'9',school:'ঢাকা কলেজ',
  dob:'2011-04-09',gender:'male',relation:'অভিভাবক',medium:'bangla',previousResult:'পঞ্চম: জিপিএ ৫',
  courseType:'individual',subjects:['bangla','math'],packageName:'',consent:true,email:'',
};

async function run(){
  await preflight({mongo:true,test:'tests/lead-handoff.integration.ts — needs a MongoDB (or TEST_MONGO_URI from npm run test-mode)'});
  const shared=process.env.TEST_MONGO_URI||null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){for(const c of await mongoose.connection.db.listCollections().toArray()){await mongoose.connection.db.collection(c.name).deleteMany({}).catch(()=>{})}}

  try{
    const actor=await User.create({name:'Front Desk',email:'lead-handoff@example.test',passwordHash:await bcrypt.hash('LeadsOnly-2026!',12),role:'admin',active:true});
    const actorId=String(actor._id);
    const read=(id)=>Lead.findById(id).setOptions({recycleAny:true}).lean();
    const audits=(action)=>AdminAudit.find({action}).lean();

    // A slot the centre actually runs, and two seats on it.
    const slot=await Slot.create({grade:'9',subject:'bangla',startAt:FUTURE,endAt:new Date(FUTURE.getTime()+3600000),capacity:2,booked:0,enabled:true});
    const slotId=String(slot._id);

    // ── 1. Convert to admission: one write, two rows.
    const first=await createQuickLead({studentName:'রাহুল হাসান',guardianName:'করিম হাসান',phone:P1,classLabel:'নবম',school:'ঢাকা কলেজ'},actorId,NOW);
    assert.equal(first.ok,true,'the lead is there to hand over');
    const converted=await convertLeadToAdmission(first.id,ADMISSION_INPUT,actorId,NOW);
    assert.equal(converted.ok,true,`a live lead converts: ${JSON.stringify(converted)}`);
    assert.match(converted.reference,/^ADM-\d{4}-[A-F\d]{12}$/,'the reference is the intake screen\'s own shape');
    const admission=await Admission.findById(converted.id).lean();
    assert.equal(admission.reference,converted.reference);
    assert.equal(admission.phone,P1,'the number came off the LEAD — no form ever posted one');
    assert.equal(admission.studentName,'রাহুল হাসান');
    assert.equal(admission.guardianName,'করিম হাসান');
    assert.equal(admission.grade,'9');
    assert.equal(admission.status,'pending','a hand-off opens an application, it does not decide it');
    assert.equal(admission.consent,true);
    assert.deepEqual(admission.subjects,['bangla','math']);
    const leadAfter=await read(first.id);
    assert.equal(leadAfter.status,'admitted','the lead moved to the status the vocabulary already has');
    assert.equal(String(leadAfter.admission),converted.id,'and points at the row it made');
    assert.equal(leadAfter.convertedAt.getTime(),NOW.getTime(),'the day it was handed over is recorded');
    assert.equal(leadAfter.phones[0].normalized,P1,'the lead kept its number; a hand-off copies, it does not move');
    const note=leadAfter.notes[leadAfter.notes.length-1];
    assert.ok(note.text.includes(converted.reference),'the timeline names the application it opened');
    assert.equal(note.outcome,'interested');
    const convertAudit=await audits('lead.admission');
    assert.equal(convertAudit.length,1,'one audit row for the hand-off');
    assert.equal(convertAudit[0].target,leadAfter.leadId,'and it names the readable id, never a number');
    assert.ok(!JSON.stringify(convertAudit).includes(P1),'no digit of the visitor\'s number in the audit');

    // ── 2. The same hand-off again refuses itself, and writes nothing second.
    const again=await convertLeadToAdmission(first.id,ADMISSION_INPUT,actorId,NOW);
    assert.equal(again.ok,false);
    assert.equal(again.code,'ALREADY_CONVERTED');
    assert.ok(again.messageBn.includes('ভর্তি')&&again.messageEn.toLowerCase().includes('admission'));
    assert.equal(await Admission.countDocuments({}),1,'no second application behind one visitor');

    // ── 3. Book a trial: the seat is taken and the lead moves.
    const second=await createQuickLead({studentName:'সাদিয়া আক্তার',guardianName:'জলিল আক্তার',phone:P2,classLabel:'নবম'},actorId,NOW);
    const booked=await bookLeadTrial(second.id,{
      slotId,slotStartAt:FUTURE.toISOString(),slotEndAt:new Date(FUTURE.getTime()+3600000).toISOString(),
      grade:'9',subject:'bangla',studentName:'সাদিয়া আক্তার',consent:true,email:'',
    },actorId,NOW);
    assert.equal(booked.ok,true,`an open seat books: ${JSON.stringify(booked)}`);
    assert.match(booked.reference,/^TRI-\d{4}-[A-F\d]{12}$/);
    const booking=await TrialBooking.findById(booked.id).lean();
    assert.equal(String(booking.slot),slotId);
    assert.equal(booking.phone,P2,'again the lead\'s own number');
    assert.equal(booking.status,'booked');
    assert.equal((await Slot.findById(slotId).lean()).booked,1,'the seat count moved with it');
    const leadBooked=await read(second.id);
    assert.equal(leadBooked.status,'trial_booked');
    assert.equal(String(leadBooked.trialBooking),booked.id);
    assert.ok(leadBooked.notes.some(row=>row.text.includes(booked.reference)),'and the timeline names the class');
    assert.equal((await audits('lead.trial')).length,1);

    // ── 4. A trial already booked refuses a second one — one visitor, one seat.
    const secondBooking=await bookLeadTrial(second.id,{
      slotId,slotStartAt:FUTURE.toISOString(),slotEndAt:new Date(FUTURE.getTime()+3600000).toISOString(),
      grade:'9',subject:'bangla',studentName:'সাদিয়া আক্তার',consent:true,email:'',
    },actorId,NOW);
    assert.equal(secondBooking.ok,false);
    assert.equal(secondBooking.code,'ALREADY_BOOKED');
    assert.equal((await Slot.findById(slotId).lean()).booked,1,'and no seat was taken by a refusal');

    // ── 5. The seat list a dialog is handed: bookable slots only, with what is left on them.
    const full=await Slot.create({grade:'9',subject:'bangla',startAt:new Date(FUTURE.getTime()+7200000),endAt:new Date(FUTURE.getTime()+10800000),capacity:1,booked:1,enabled:true});
    const off=await Slot.create({grade:'9',subject:'bangla',startAt:new Date(FUTURE.getTime()+14400000),endAt:new Date(FUTURE.getTime()+18000000),capacity:3,booked:0,enabled:false});
    const gone=await Slot.create({grade:'9',subject:'bangla',startAt:PAST,endAt:new Date(PAST.getTime()+3600000),capacity:3,booked:0,enabled:true});
    const offered=await trialSlotsForLead('9','bangla',NOW);
    const ids=offered.map(row=>row.id);
    assert.ok(ids.includes(slotId),'the slot with a seat left is offered');
    assert.equal(ids.includes(String(full._id)),false,'a full class is not');
    assert.equal(ids.includes(String(off._id)),false,'a class the centre switched off is not');
    assert.equal(ids.includes(String(gone._id)),false,'and a class that already started is not');
    assert.equal(offered.find(row=>row.id===slotId).seatsLeft,1,'one seat of two is left');
    assert.ok(!JSON.stringify(offered).includes(P1)&&!JSON.stringify(offered).includes(P2),'a seat list carries no visitor at all');

    // ── 6. The refusals a slot can give: full, and gone.
    const third=await createQuickLead({studentName:'নিপুণ রায়',phone:P3,classLabel:'নবম'},actorId,NOW);
    const oneSeat=await Slot.create({grade:'9',subject:'bangla',startAt:new Date(FUTURE.getTime()+21600000),endAt:new Date(FUTURE.getTime()+25200000),capacity:1,booked:0,enabled:true});
    const takenByThird=await bookLeadTrial(third.id,{
      slotId:String(oneSeat._id),slotStartAt:oneSeat.startAt.toISOString(),slotEndAt:oneSeat.endAt.toISOString(),
      grade:'9',subject:'bangla',studentName:'নিপুণ রায়',consent:true,email:'',
    },actorId,NOW);
    assert.equal(takenByThird.ok,true,'the last seat goes to the first hand-off that asks for it');
    const fourth=await createQuickLead({studentName:'তানভীর আহমেদ',phone:'01611998877',classLabel:'নবম'},actorId,NOW);
    const noSeat=await bookLeadTrial(fourth.id,{
      slotId:String(oneSeat._id),slotStartAt:oneSeat.startAt.toISOString(),slotEndAt:oneSeat.endAt.toISOString(),
      grade:'9',subject:'bangla',studentName:'তানভীর আহমেদ',consent:true,email:'',
    },actorId,NOW);
    assert.equal(noSeat.ok,false);
    assert.equal(noSeat.code,'SLOT_FULL');
    assert.ok(noSeat.messageBn.includes('আসন'),'the Bangla refusal says it is the seats');
    assert.equal((await Slot.findById(String(oneSeat._id)).lean()).booked,1,'never oversold');
    assert.equal((await read(fourth.id)).status,'new','and a refused hand-off leaves the lead where it was');
    const pastSlot=await bookLeadTrial(fourth.id,{
      slotId:String(gone._id),slotStartAt:PAST.toISOString(),slotEndAt:new Date(PAST.getTime()+3600000).toISOString(),
      grade:'9',subject:'bangla',studentName:'তানভীর আহমেদ',consent:true,email:'',
    },actorId,NOW);
    assert.equal(pastSlot.ok,false);
    assert.equal(pastSlot.code,'SLOT_GONE','a class that started is not a class to book');
    assert.equal((await TrialBooking.countDocuments({})).length,2,'two bookings in all: the refusals wrote nothing');

    // ── 7. Not interested will not close a row without saying why.
    const fifth=await createQuickLead({studentName:'মেহেদী হাসান',phone:'01511778899',classLabel:'দশম'},actorId,NOW);
    const noReason=await markLeadNotInterested(fifth.id,'',actorId,NOW);
    assert.equal(noReason.ok,false);
    assert.equal(noReason.code,'NO_REASON');
    assert.ok(noReason.messageBn.includes('কারণ'));
    assert.equal((await read(fifth.id)).status,'new','an empty reason changes nothing');
    assert.equal((await read(fifth.id)).notes.length,0,'and files no note');
    const shortReason=await markLeadNotInterested(fifth.id,'না',actorId,NOW);
    assert.equal(shortReason.ok===false&&shortReason.code,'REASON_TOO_SHORT');
    const closed=await markLeadNotInterested(fifth.id,'  অন্য কোচিংয়ে  ভর্তি হয়ে গেছে  ',actorId,NOW);
    assert.equal(closed.ok,true);
    assert.equal(closed.noteCount,1);
    const leadClosed=await read(fifth.id);
    assert.equal(leadClosed.status,'not_interested');
    assert.equal(leadClosed.notes[0].text,'অন্য কোচিংয়ে ভর্তি হয়ে গেছে','the reason is filed trimmed, as one line');
    assert.equal(leadClosed.notes[0].outcome,'not_interested','and tagged so the timeline can say why it closed');
    assert.equal(String(leadClosed.notes[0].by),actorId,'with the operator who closed it');
    const closedAudit=await audits('lead.not_interested');
    assert.equal(closedAudit.length,1);
    assert.equal(closedAudit[0].target,leadClosed.leadId);
    assert.ok(!JSON.stringify(closedAudit).includes('01511778899'),'the reason is on the lead, not in the audit');

    // ── 8. A binned lead hands nothing over: the operator's next move is the Recycle Bin, not a form.
    const sixth=await createQuickLead({studentName:'বিনে যাওয়া লিড',phone:'01722334455',classLabel:'নবম'},actorId,NOW);
    await softDelete('lead',sixth.id,actorId,NOW);
    assert.equal((await convertLeadToAdmission(sixth.id,ADMISSION_INPUT,actorId,NOW)).code,'BINNED');
    assert.equal((await bookLeadTrial(sixth.id,{
      slotId,slotStartAt:FUTURE.toISOString(),slotEndAt:new Date(FUTURE.getTime()+3600000).toISOString(),
      grade:'9',subject:'bangla',studentName:'বিনে যাওয়া লিড',consent:true,email:'',
    },actorId,NOW)).code,'BINNED');
    assert.equal((await markLeadNotInterested(sixth.id,'কারণ লিখেছি',actorId,NOW)).code,'BINNED');
    assert.equal((await read(sixth.id)).status,'new','nothing moved while it sat in the bin');

    // ── 9. A lead with no number cannot be handed over either way.
    const seventh=await createQuickLead({studentName:'নাম্বারবিহীন',classLabel:'নবম'},actorId,NOW);
    assert.equal((await convertLeadToAdmission(seventh.id,ADMISSION_INPUT,actorId,NOW)).code,'NO_PHONE');
    assert.equal((await bookLeadTrial(seventh.id,{
      slotId,slotStartAt:FUTURE.toISOString(),slotEndAt:new Date(FUTURE.getTime()+3600000).toISOString(),
      grade:'9',subject:'bangla',studentName:'নাম্বারবিহীন',consent:true,email:'',
    },actorId,NOW)).code,'NO_PHONE');
    assert.equal((await markLeadNotInterested(seventh.id,'যোগাযোগের নাম্বার নেই',actorId,NOW)).ok,true,'but it can still be closed with a reason');

    // ── 10. Consent is not a checkbox the server trusts: without it neither hand-off writes.
    const eighth=await createQuickLead({studentName:'সম্মতিবিহীন',phone:'01733445566',classLabel:'নবম'},actorId,NOW);
    assert.equal((await convertLeadToAdmission(eighth.id,{...ADMISSION_INPUT,consent:false},actorId,NOW)).code,'NO_CONSENT');
    assert.equal((await bookLeadTrial(eighth.id,{
      slotId,slotStartAt:FUTURE.toISOString(),slotEndAt:new Date(FUTURE.getTime()+3600000).toISOString(),
      grade:'9',subject:'bangla',studentName:'সম্মতিবিহীন',consent:false,email:'',
    },actorId,NOW)).code,'NO_CONSENT');
    assert.equal(await Admission.countDocuments({}),1,'and nothing was written while it asked');

    // ── 11. What a drawer is handed: masks, prefills and refusals — never a number or a family key.
    const detail=await leadDetail(first.id,NOW);
    const view=detailView(detail);
    assert.equal(view.handoff.admission.phoneMask,maskPhone(P1),'the prefill shows the mask');
    assert.equal(view.handoff.admission.studentName,'রাহুল হাসান','and what the lead already knows');
    assert.equal(view.handoff.admission.grade,'9');
    assert.equal(view.handoff.trial.phoneMask,maskPhone(P1));
    assert.equal(view.handoff.blockedAdmission.code,'ALREADY_CONVERTED','the button that is already done says so');
    assert.equal(view.handoff.blockedTrial,null,'a converted lead may still book a trial');
    const served=JSON.stringify(view);
    assert.ok(!served.includes(P1)&&!served.includes(P2),'no hand-off view carries a number');
    assert.ok(!/familyKey/i.test(served),'and no family key anywhere in the drawer\'s answer');
    const freshView=detailView(await leadDetail(seventh.id,NOW));
    assert.equal(freshView.handoff.blockedAdmission.code,'NO_PHONE','a lead with no number says so before the form opens');
    assert.equal(freshView.handoff.admission.phoneMask,'');

    console.log('Lead hand-offs: converting a visitor writes one admission and moves the lead in the same breath — the reference is the intake screen\'s own ADM shape, the number on the application is the lead\'s own because no form ever posted one, the status becomes admitted with the day recorded, the timeline names the application and the audit names the readable id and no digit; converting twice refuses itself as ALREADY_CONVERTED and writes no second row; booking a trial takes the seat with the guarded increment, moves the lead to trial_booked and names the class in the timeline, and a second booking for the same visitor refuses as ALREADY_BOOKED without taking a seat; the list a dialog is offered holds only slots that are switched on, still ahead and not full, with what is left on each and no visitor on any of them; a full class refuses as SLOT_FULL and a class that already started as SLOT_GONE, leaving the lead where it was and never overselling; "not interested" refuses an empty reason and a two-character one, files a real reason trimmed as one note tagged not_interested against the operator who wrote it, and moves the status; a binned lead refuses all three as BINNED with nothing moved, a lead with no number refuses both hand-offs as NO_PHONE but may still be closed with a reason, and neither hand-off writes without consent; and the view a drawer is handed carries masks, prefills and refusals with no number and no family key in any of it.');
  }finally{
    await mongoose.disconnect();
    await mongo.stop();
  }
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
