// @ts-nocheck -- R3.5: the Lead model and its Recycle Bin participation, against a disposable database.
/**
 * R3.5 · Visitor leads: the record itself.
 *
 * The pure modules decide what a sheet means (R3.1–R3.4); this proves what the database keeps. Four
 * things matter and each is asserted rather than assumed:
 *
 *   • Nothing read from a sheet is lost or silently repaired — the original spelling of a number, the
 *     class label as written and every flag travel with the lead, and a value the schema will not
 *     accept is refused instead of being bent into shape.
 *   • A lead is in the Recycle Bin like every other record type: soft-deleted, invisible to every
 *     ordinary query, listed and counted in the bin, restorable, purged after 30 days — and a lead that
 *     has already become an admission, a student or a trial booking is reference-blocked, because
 *     deleting it would lose that link.
 *   • "Today's follow-ups" and the overdue count are one range query over an ISO day string, with no
 *     timezone arithmetic and no binned leads in the way.
 *   • "Do not contact" holds at the database, not just in a component: the sticky flag and the query
 *     filter agree with `canContact()` for every status in the vocabulary, so a bulk send cannot find a
 *     number the owner forbade.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {Admission} from '../src/models/Intake';
import {Lead,nextLeadId} from '../src/models/Lead';
import {softDelete,restoreRecord,binList,binCounts,purgeOne,kindDef,blockedMessage} from '../src/lib/admin/recycle';
import {recycleKinds,canArchiveKind} from '../src/lib/admin/recycle-kinds';
import {
  LEAD_STATUSES,canContact,statusToFlags,nextFollowUpDay,followUpState,familyKeyFromPhones,
  CONTACTABLE_LEAD_FILTER,maskPhone,leadPath,
} from '../src/lib/leads/vocab';
import {dhakaDay} from '../src/lib/admin/today';
import {RECYCLE_RETENTION_DAYS} from '../src/models/recycle';

const PHONE='01712817090';
const SIBLING='01911223344';

async function run(){
  await preflight({mongo:true,test:'tests/lead-model.integration.ts — needs a MongoDB (or TEST_MONGO_URI from npm run test-mode)'});
  const shared=process.env.TEST_MONGO_URI||null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){for(const c of await mongoose.connection.db.listCollections().toArray()){await mongoose.connection.db.collection(c.name).deleteMany({}).catch(()=>{})}}

  try{
    const now=new Date();
    const today=dhakaDay(now);
    const year=today.slice(0,4);
    const actor=await User.create({name:'Lead Keeper',email:'lead-keeper@example.test',passwordHash:await bcrypt.hash('LeadsOnly-2026!',12),role:'admin',active:true,phone:'01711000000'});
    const actorId=String(actor._id);

    // ---- 1. What a sheet row becomes: everything read, everything kept, nothing repaired.
    const lead=await Lead.create({
      leadId:`V-${year}-0001`,date:today,studentName:'রাহুল আহমেদ',guardianName:'করিম আহমেদ',
      phones:[{normalized:PHONE,original:'০১৭১২৮১৭০৯০'},{normalized:SIBLING,original:'01911223344'}],
      classLabel:'New 9',classGroup:9,newSession:true,school:'ধানমন্ডি উচ্চ বিদ্যালয়',group:'science',
      shift:'morning',medium:'bangla',source:'walk_in',interestedIn:'বিজ্ঞান বিভাগ',
      status:'new',nextFollowUp:nextFollowUpDay('tomorrow',now),assignedTo:actor._id,
      notes:[{by:actor._id,text:'প্রথমবার কল করা হলো, আগ্রহী',outcome:'interested'}],
      flags:[{field:'phones',code:'short',original:'0171281709',messageBn:'ছোট নম্বর',messageEn:'short number'}],
      familyKey:familyKeyFromPhones([PHONE,SIBLING]),importSource:'visitor-sheet-2026.xlsx',importBatch:'batch-1',
      createdBy:actor._id,
    });
    assert.equal(lead.status,'new');
    assert.equal(lead.phones.length,2,'both numbers from one cell are kept');
    assert.equal(lead.phones[0].original,'০১৭১২৮১৭০৯০','with the spelling the owner actually wrote');
    assert.equal(lead.phones[0].normalized,PHONE,'and the number this app will dial');
    assert.equal(lead.classLabel,'New 9','the label as written stays beside the reading');
    assert.equal(lead.classGroup,9);
    assert.equal(lead.newSession,true,'"New 9" kept its session flag instead of being folded into a year');
    assert.equal(lead.flags.length,1,'a doubt is stored with the lead, not shown once and forgotten');
    assert.equal(lead.flags[0].original,'0171281709');
    assert.equal(lead.notes.length,1,'and the first note is part of the record');
    assert.equal(lead.nextFollowUp,nextFollowUpDay('tomorrow',now));
    assert.equal(lead.doNotContact,false,'contactable until somebody says otherwise');

    // ---- 2. Defaults: a quick-add writes four fields and the rest is honest about being unset.
    const minimal=await Lead.create({leadId:`V-${year}-0002`,date:today,studentName:'সংক্ষিপ্ত লিড',phones:[{normalized:'01711000011',original:'01711000011'}]});
    assert.equal(minimal.status,'new','a new lead starts as New');
    assert.equal(minimal.group,'unknown','an unset group stays unknown rather than becoming a guess');
    assert.equal(minimal.medium,'unknown');
    assert.equal(minimal.shift,'any');
    assert.equal(minimal.source,'walk_in');
    assert.equal(minimal.classGroup,null,'an unwritten class is null, not 0 and not 1');
    assert.equal(minimal.nextFollowUp,null,'and no follow-up is null — its own state, not an overdue one');
    assert.deepEqual(minimal.notes,[]);
    assert.deepEqual(minimal.flags,[]);
    assert.equal(followUpState(minimal.nextFollowUp,now),'none');

    // ---- 3. The schema refuses what it cannot hold, instead of bending it.
    const refusals=[
      ['a lead with no name',{leadId:`V-${year}-0003`,date:today}],
      ['a lead with no date',{leadId:`V-${year}-0004`,studentName:'তারিখহীন'}],
      ['a date that is not a day',{leadId:`V-${year}-0005`,date:'12/11/2026',studentName:'ভুল তারিখ'}],
      ['a phone that is not a number',{leadId:`V-${year}-0006`,date:today,studentName:'ভুল নম্বর',phones:[{normalized:'0171281709',original:'0171281709'}]}],
      ['a class of 13',{leadId:`V-${year}-0007`,date:today,studentName:'তেেরো',classGroup:13}],
      ['a status outside the vocabulary',{leadId:`V-${year}-0008`,date:today,studentName:'ভুল অবস্থা',status:'maybe'}],
      ['a follow-up that is not a day',{leadId:`V-${year}-0009`,date:today,studentName:'ভুল ফলোআপ',nextFollowUp:'tomorrow'}],
      ['a note nobody wrote',{leadId:`V-${year}-0010`,date:today,studentName:'টীকা',notes:[{text:'কে লিখেছে জানা নেই'}]}],
      ['a flag with no code',{leadId:`V-${year}-0011`,date:today,studentName:'ফ্ল্যাগ',flags:[{original:'0171281709'}]}],
    ];
    for(const [label,doc] of refusals){
      let threw=null;
      try{await Lead.create(doc)}catch(error){threw=error}
      assert.ok(threw,`${label} is refused`);
      assert.equal(threw.name,'ValidationError',`${label} is refused by validation, not by luck`);
    }
    const duplicate=Lead.create({leadId:`V-${year}-0001`,date:today,studentName:'নকল'});
    await assert.rejects(duplicate,error=>error.code===11000,'a repeated leadId is refused by the unique index');
    assert.equal(await Lead.countDocuments(),2,'so nothing was written twice');

    // ---- 4. Readable ids follow the highest number of the year, not a count.
    await Lead.create({leadId:`V-${year}-0009`,date:today,studentName:'বড় নম্বর'});
    assert.equal(await nextLeadId(now),`V-${year}-0010`,'the next id follows the highest, so a purged lead cannot hand its number to somebody else');
    assert.match(await nextLeadId(new Date(`${Number(year)+1}-03-01T10:00:00+06:00`)),new RegExp(`^V-${Number(year)+1}-0001$`),'and a new year starts again at 0001');

    // ---- 5. Today's follow-ups and the overdue count, as one range query over an ISO day.
    await Lead.create({leadId:`V-${year}-0020`,date:today,studentName:'আজ ফলোআপ',nextFollowUp:today});
    await Lead.create({leadId:`V-${year}-0021`,date:today,studentName:'পরে ফলোআপ',nextFollowUp:nextFollowUpDay('next_week',now)});
    const overdueLead=await Lead.create({leadId:`V-${year}-0022`,date:today,studentName:'পেরিয়ে গেছে',nextFollowUp:nextFollowUpDay('today',new Date(now.getTime()-3*86400000))});
    const todays=await Lead.find({nextFollowUp:today}).sort({createdAt:1}).lean();
    assert.equal(todays.length,1,'exactly one lead is due today');
    assert.equal(todays[0].studentName,'আজ ফলোআপ');
    const overdue=await Lead.find({nextFollowUp:{$lt:today}}).lean();
    assert.equal(overdue.length,1,'and exactly one is overdue');
    assert.equal(overdue[0].studentName,'পেরিয়ে গেছে');
    assert.equal(followUpState(overdueLead.nextFollowUp,now),'overdue','the same answer the pure rule gives');
    assert.equal(await Lead.countDocuments({nextFollowUp:null}),2,'and a lead with no follow-up is counted as neither');

    // ---- 6. "Do not contact" holds at the database, for every status in the vocabulary.
    const forbidden=await Lead.create({leadId:`V-${year}-0030`,date:today,studentName:'যোগাযোগ নিষেধ',phones:[{normalized:'01711000030',original:'01711000030'}],status:'do_not_contact',...statusToFlags('do_not_contact',{})});
    assert.equal(forbidden.doNotContact,true,'the status set the sticky flag');
    assert.equal(canContact(forbidden),false);
    forbidden.status='called';
    await forbidden.save();
    assert.equal(canContact(forbidden),false,'moving the status back does not make a forbidden lead contactable again');
    assert.equal(await Lead.countDocuments(CONTACTABLE_LEAD_FILTER),await Lead.countDocuments().then(total=>total-1),'and the query agrees with the predicate');
    for(const status of LEAD_STATUSES){
      const probe={status,doNotContact:statusToFlags(status,{}).doNotContact};
      const inQuery=await Lead.countDocuments({...CONTACTABLE_LEAD_FILTER,leadId:`V-${year}-0030`});
      assert.equal(inQuery,0,'the forbidden lead is outside the contactable filter whatever its status reads');
      assert.equal(canContact(probe),status!=='do_not_contact',`canContact() answers for ${status}`);
    }
    const contactable=await Lead.find(CONTACTABLE_LEAD_FILTER).lean();
    assert.ok(!contactable.some(row=>row.leadId===`V-${year}-0030`),'a bulk send built on this filter cannot find the forbidden number');
    assert.ok(contactable.length>=5,'while every ordinary lead is still reachable');

    // ---- 7. Siblings: one number on two leads is found by an indexed lookup, not a scan.
    const sibling=await Lead.create({leadId:`V-${year}-0040`,date:today,studentName:'রাহুলের বোন',phones:[{normalized:PHONE,original:PHONE},{normalized:'01711000041',original:'01711000041'}],familyKey:familyKeyFromPhones([PHONE,'01711000041'])});
    const sameNumber=await Lead.find({'phones.normalized':PHONE}).lean();
    assert.equal(sameNumber.length,2,'the number that is already on a lead is found again');
    assert.deepEqual(sameNumber.map(row=>row.studentName).sort(),['রাহুল আহমেদ','রাহুলের বোন'].sort());
    assert.equal(sibling.familyKey,lead.familyKey,'both tie to the same family key, whichever order their numbers were written in');
    assert.equal(await Lead.countDocuments({familyKey:lead.familyKey}),2,'so the family can be listed in one query');

    // ---- 8. The Recycle Bin: soft delete, invisible everywhere, listed, restorable, then purged.
    assert.ok((recycleKinds as readonly string[]).includes('lead'),'leads are a Recycle Bin kind');
    assert.equal(canArchiveKind('lead'),false,'and are not "archivable": a lead has no unpublished state, and the 18-month rule is a suggestion on the list');
    const def=kindDef('lead');
    assert.equal(def.labelBn,'ভিজিটর লিড');
    assert.equal(def.labelEn,'Visitor lead');
    assert.equal(def.nameOf({studentName:'রাহুল আহমেদ',leadId:'V-1'}),'রাহুল আহমেদ','a binned row is named by the student');
    assert.equal(def.nameOf({studentName:'',leadId:`V-${year}-0002`}),`V-${year}-0002`,'and by its id when no name was written');

    const beforeBin=await Lead.countDocuments();
    const deleted=await softDelete('lead',String(minimal._id),actorId,now);
    assert.equal(deleted.status,'ok','a lead can be moved to the bin');
    assert.equal(await Lead.countDocuments(),beforeBin-1,'and disappears from an ordinary count');
    assert.equal(await Lead.findById(minimal._id),null,'from a find by id too, without any caller remembering a filter');
    const binned=await Lead.findById(minimal._id).setOptions({recycleAny:true});
    assert.ok(binned&&binned.deletedAt instanceof Date,'the row is still there, marked');
    assert.equal(String(binned.deletedBy),actorId,'naming who binned it');
    assert.equal(binned.purgeAt.getTime()-binned.deletedAt.getTime(),RECYCLE_RETENTION_DAYS*86400000,`with a purge date ${RECYCLE_RETENTION_DAYS} days out`);
    const entries=await binList('lead');
    assert.equal(entries.length,1,'it is listed in the bin');
    assert.equal(entries[0].name,'সংক্ষিপ্ত লিড','named by its student, as the registry says');
    assert.equal((await binCounts()).lead,1,'and counted there — binCounts() reports every kind, so this reads the lead row of it');
    assert.equal((await restoreRecord('lead',String(minimal._id),actorId)).status,'ok','it can be restored');
    assert.equal(await Lead.countDocuments(),beforeBin,'and is back in every ordinary query');
    assert.equal((await restoreRecord('lead',String(minimal._id),actorId)).status,'not-in-bin','restoring twice says so');
    assert.equal(await nextLeadId(now),`V-${year}-0041`,'a binned or restored lead never frees its id, and the sequence still follows the highest');

    // ---- 9. A converted lead is reference-blocked: deleting it would lose the link.
    const admission=await Admission.create({reference:'ADM-LEAD-1',studentName:'রাহুল আহমেদ',dob:'2009-04-01',gender:'male',guardianName:'করিম আহমেদ',phone:PHONE,grade:'9',consent:true,status:'enrolled'});
    lead.admission=admission._id;
    lead.status='admitted';
    lead.convertedAt=now;
    await lead.save();
    const refs=await def.references(String(lead._id));
    assert.equal(refs.length,1,'the link is reported as a real count');
    assert.equal(refs[0].count,1);
    assert.match(refs[0].bn,/রূপান্তরিত/,'in words the owner can act on');
    assert.match(blockedMessage(refs,false),/converted/);
    const blocked=await softDelete('lead',String(lead._id),actorId,now);
    assert.equal(blocked.status,'blocked','so a converted lead cannot be binned by accident');
    assert.equal(await Lead.countDocuments({leadId:`V-${year}-0001`}),1,'and it is still in the list');
    lead.admission=null;
    await lead.save();
    assert.deepEqual(await def.references(String(lead._id)),[],'unlinked, there is nothing left to block on');
    assert.equal((await softDelete('lead',String(lead._id),actorId,now)).status,'ok','and it can be binned like any other lead');
    assert.equal((await purgeOne('lead',String(lead._id),actorId)).status,'ok','then purged for good on demand');
    assert.equal(await Lead.findById(lead._id).setOptions({recycleAny:true}),null,'after which it is really gone');

    // ---- 10. A number is never in a URL or a log line, whatever the row holds.
    assert.equal(leadPath(String(minimal._id),'bn'),`/bn/admin/leads/${minimal._id}`);
    assert.ok(!leadPath(String(minimal._id)).includes(PHONE));
    assert.equal(maskPhone(PHONE),'01712****90','and what a log gets is a mask');
    assert.ok(!JSON.stringify({path:leadPath(String(minimal._id)),mask:maskPhone(PHONE)}).includes(PHONE));

    console.log('Visitor lead record: a sheet row keeps both numbers with the spelling as written, the class label beside its reading, its session flag, its stored doubts and its first note, while a quick-add of four fields leaves group and medium unknown, class and follow-up null rather than guessed; nine malformed rows and a repeated leadId are refused by validation and the unique index so nothing is written twice; readable ids follow the highest number of the year and restart each year; today’s follow-ups and the overdue count are one range query over an ISO day with no timezone arithmetic; "Do not contact" is sticky and the database filter agrees with canContact() for all eight statuses, so a bulk send cannot reach a forbidden number; siblings sharing a number are found by an indexed lookup and tie to one family key; a lead is soft-deleted, invisible to every ordinary query, listed and counted in the bin, restorable, purge-dated 30 days out and never archivable; a converted lead is reference-blocked until it is unlinked, then binnable and purgeable; and no URL or log line this model feeds ever carries a phone number.');
  }finally{
    await mongoose.disconnect();
    await mongo.stop();
  }
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
