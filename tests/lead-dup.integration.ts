// @ts-nocheck -- R3.10: duplicate phones against a disposable database; synthetic leads only.
/**
 * R3.10 · Duplicate phone detection: warn, show, sibling or merge.
 *
 * The spec gives quick-add one sentence about duplicates — warn, show the existing leads, allow "add as
 * sibling" or merge — and this suite is what makes that sentence a behavior: no second lead is written
 * until the operator answers; the answer "sibling" inherits the holder's family key; "separate" carries
 * no key at all so two strangers on one shop number are not one family; "merge" folds the entry into
 * the named lead and writes nothing new; and a merge of two EXISTING leads moves phones, notes and
 * flags, bins the source through the Recycle Bin's own door, re-points its family, and refuses a source
 * that already became an admission or a student.
 *
 * Nothing here can send an SMS or reach a provider: the suite never builds a plan.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {AdminAudit} from '../src/models/AdminAudit';
import {Lead} from '../src/models/Lead';
import {binList} from '../src/lib/admin/recycle';
import {
  createQuickLead,duplicateHolders,leadDetail,mergeLeads,tieLeadFamily,
} from '../src/lib/leads/leads';
import {familyKeyFromPhones} from '../src/lib/leads/vocab';

const P1='01712817090';  // the shared number
const P2='01811223344';  // a second number written into one cell
const P3='01933445566';
const P4='01611998877';
const P5='01511778899';

async function run(){
  await preflight({mongo:true,test:'tests/lead-dup.integration.ts — needs a MongoDB (or TEST_MONGO_URI from npm run test-mode)'});
  const shared=process.env.TEST_MONGO_URI||null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){for(const c of await mongoose.connection.db.listCollections().toArray()){await mongoose.connection.db.collection(c.name).deleteMany({}).catch(()=>{})}}

  try{
    const now=new Date();
    const actor=await User.create({name:'Front Desk',email:'lead-dup@example.test',passwordHash:await bcrypt.hash('LeadsOnly-2026!',12),role:'admin',active:true});
    const actorId=String(actor._id);
    const read=(id)=>Lead.findById(id).lean();
    const count=()=>Lead.countDocuments({deletedAt:null});

    // ── 1. A new number saves silently and holds no duplicates.
    const first=await createQuickLead({studentName:'রাহুল',phone:P1,school:''},actorId,now);
    assert.equal(first.ok,true,'the first lead saves without a question');
    assert.equal(first.familyKey,familyKeyFromPhones([P1]),'computed from its own number, because nobody held it yet');
    assert.deepEqual(await duplicateHolders([P2]),[],'a number nobody holds reports no holders');

    // ── 2. The same number again: the question, not a second lead.
    const before=await count();
    const asked=await createQuickLead({studentName:'রাহুলের বোন',phone:P1,classLabel:'অষ্টম'},actorId,now);
    assert.equal(asked.ok,false);
    assert.equal(asked.code,'DUPLICATE_PHONE','quick-add asks instead of writing');
    assert.equal(await count(),before,'and nothing was created while it asks');
    assert.equal(asked.holders.length,1,'the holder is shown');
    assert.equal(asked.holders[0].leadId,first.leadId);
    assert.equal(asked.holders[0].studentName,'রাহুল');
    assert.equal(asked.holders[0].masked,'01712****90','as a mask, never as digits');
    const wired=JSON.stringify(asked);
    assert.ok(!wired.includes(P1),'no normalized number travels in the question');
    assert.ok(!wired.includes('fam:'),'and no family key either — the key IS a number');

    // ── 3. "Add as sibling": a second lead, in the holder's family.
    const sibling=await createQuickLead({studentName:'রাহুলের বোন',phone:P1,classLabel:'অষ্টম',dupChoice:'sibling'},actorId,now);
    assert.equal(sibling.ok,true);
    assert.equal(sibling.familyKey,first.familyKey,'the sibling inherits the holder key, not the one its own row would compute');
    assert.equal(sibling.inheritedFrom,first.leadId,'and the save says who it was inherited from');
    const firstAfter=await read(first.id);
    assert.equal(firstAfter.notes.length,0,'the holder was not touched by the sibling');

    // ── 4. "Keep as a separate lead": one shop number, two unrelated people, NO family.
    const stranger=await createQuickLead({studentName:'দোকানদার',phone:P1,dupChoice:'separate'},actorId,now);
    assert.equal(stranger.ok,true);
    assert.equal(stranger.familyKey,null,'separate carries no family key at all');
    assert.notEqual(stranger.familyKey,first.familyKey,'so the stranger is not listed in the holder family');
    const holdersNow=await duplicateHolders([P1]);
    assert.equal(holdersNow.length,3,'the question lists every live holder now');

    // ── 5. "Merge into that lead": the entry folds in, no row is created.
    const beforeMerge=await count();
    const merged=await createQuickLead({
      studentName:'রাহুল (ভুল করে আবার)',phone:`${P1}, ${P2}`,guardianName:'মা',school:'মডেল স্কুল',note:'দ্বিতীয় নাম্বারটি নেওয়া হলো',
      dupChoice:'merge',dupTarget:first.id,
    },actorId,now);
    assert.equal(merged.ok,true);
    assert.equal(merged.mergedInto,true,'the write landed on the existing lead');
    assert.equal(merged.leadId,first.leadId,'and reports THAT lead, not a new id');
    assert.equal(await count(),beforeMerge,'no row was created by a merge');
    const mergedTarget=await Lead.findById(first.id).lean();
    assert.equal(mergedTarget.school,'মডেল স্কুল','an empty school filled from the entry');
    assert.equal(mergedTarget.guardianName,'মা','an empty guardian filled too');
    assert.deepEqual(mergedTarget.phones.map(phone=>phone.normalized),[P1,P2],'the second number in the cell moved in');
    assert.equal(mergedTarget.studentName,'রাহুল','the name the target already had was NOT overwritten');
    const texts=mergedTarget.notes.map(note=>note.text);
    assert.ok(texts.some(text=>text.includes('দ্বিতীয় নাম্বারটি')),'the entry note travelled with the merge');
    assert.ok(texts.some(text=>text.includes('quick-add merge')),'and the merge left its own record');
    const audits=await AdminAudit.find({action:'lead.merge'}).lean();
    assert.equal(audits.length,1,'one audit row for the merge');
    assert.equal(String(audits[0].target),first.leadId,'pointing at the readable id, not at a number');

    // ── 6. Merging two EXISTING leads: phones, notes and flags move; the source is binned; its family re-points.
    const sourceLead=await createQuickLead({studentName:'পুরনো লিড',phone:`${P3}, ${P4}`,school:'পুরনো স্কুল',note:'আগের টীকা'},actorId,now);
    assert.equal(sourceLead.ok,true);
    const cousin=await createQuickLead({studentName:'পুরনো লিডের বোন',phone:P4,dupChoice:'sibling'},actorId,now);
    assert.equal(cousin.ok,true);
    assert.equal(cousin.familyKey,sourceLead.familyKey,'the cousin ties to the source family before the merge');
    const targetLead=await createQuickLead({studentName:'নতুন লিড',phone:P3,dupChoice:'separate'},actorId,now);
    assert.equal(targetLead.ok,true);
    const moved=await mergeLeads(targetLead.id,sourceLead.id,actorId,now);
    assert.equal(moved.ok,true,`merge must succeed, got ${moved.code||''}`);
    assert.equal(moved.sourceLeadId,sourceLead.leadId);
    const binnedRow=await read(sourceLead.id);
    if(!binnedRow){
      // Never seen in a local run (no MongoDB here), so the suite carries its own census: who is in the
      // collection after the merge, and binned or live, so a vanished source names itself in CI.
      const census=await Lead.find({}).select('leadId studentName deletedAt').lean();
      throw Error(`the merged source vanished: id=${sourceLead.id} leadId=${sourceLead.leadId} movedOk=${moved.ok===true} movedLeadId=${moved.leadId||''} census=${JSON.stringify(census.map(row=>({leadId:row.leadId,name:row.studentName,binned:!!row.deletedAt})))}`);
    }
    assert.ok(binnedRow.deletedAt,'the source is in the bin afterwards');
    const bin=await binList('lead');
    assert.ok(bin.some(entry=>entry.id===sourceLead.id),'and the Recycle Bin lists it');
    const after=await Lead.findById(targetLead.id).lean();
    assert.deepEqual(after.phones.map(phone=>phone.normalized).sort(),[P3,P4].sort(),'the source second number moved in');
    assert.equal(after.school,'পুরনো স্কুল','the empty school filled');
    assert.ok(after.notes.some(note=>note.text.includes('আগের টীকা')),'the source note moved with its writer');
    assert.ok(after.notes.some(note=>note.text.includes(`merge ${sourceLead.leadId}`)),'and the merge record names the binned lead');
    const cousinAfter=await read(cousin.id);
    assert.equal(cousinAfter.familyKey,after.familyKey,'the source family was re-pointed to the surviving key');
    const holdersP4=await duplicateHolders([P4]);
    assert.deepEqual(holdersP4.map(holder=>holder.id).sort(),[targetLead.id,cousin.id].sort(),'the moved number is held by the survivor and the cousin');
    assert.ok(!holdersP4.some(holder=>holder.id===sourceLead.id),'and a binned lead holds no number any more');

    // ── 7. A converted lead cannot be merged away.
    const converted=await createQuickLead({studentName:'ভর্তি হওয়া ভিজিটর',phone:P5},actorId,now);
    assert.equal(converted.ok,true);
    await Lead.updateOne({_id:converted.id},{$set:{student:new mongoose.Types.ObjectId(),convertedAt:now}});
    const home=await createQuickLead({studentName:'দ্বিতীয় কপি',phone:P5,dupChoice:'sibling'},actorId,now);
    assert.equal(home.ok,true);
    const refused=await mergeLeads(home.id,converted.id,actorId,now);
    assert.equal(refused.ok,false);
    assert.equal(refused.code,'SOURCE_CONVERTED','the conversion is named, not a reference count');
    assert.equal((await read(converted.id)).deletedAt,null,'and the converted lead is still live');

    // ── 8. Tying two leads that stay two.
    const tieA=await createQuickLead({studentName:'ক',phone:'01733667788'},actorId,now);
    const tieB=await createQuickLead({studentName:'খ',phone:'01744556677'},actorId,now);
    assert.equal(tieA.ok,true);
    assert.equal(tieB.ok,true);
    const tied=await tieLeadFamily(tieA.id,tieB.id,actorId);
    assert.equal(tied.ok,true);
    assert.equal((await read(tieA.id)).familyKey,tied.familyKey);
    assert.equal((await read(tieB.id)).familyKey,tied.familyKey,'both wear one key afterwards');
    const selfTie=await tieLeadFamily(tieA.id,tieA.id,actorId);
    assert.equal(selfTie.ok,false,'a lead cannot be tied to itself');

    // ── 9. The drawer's block: number-mates outside the family, and gone once tied.
    const detailBefore=await leadDetail(stranger.id);
    assert.ok(detailBefore.dupMates.some(mate=>mate.id===first.id),'the stranger sees the holder family as a number-mate');
    assert.ok(detailBefore.dupMates.some(mate=>mate.id===sibling.id),'the sibling shares the number and is not in the keyless stranger family, so it is a mate too');
    const firstDetail=await leadDetail(first.id);
    assert.ok(!firstDetail.dupMates.some(mate=>mate.id===sibling.id),'a same-family lead is in the family list, never twice');
    assert.ok(firstDetail.dupMates.some(mate=>mate.id===stranger.id),'but the keyless stranger shows up as a mate');
    const tiedStranger=await tieLeadFamily(stranger.id,first.id,actorId);
    assert.equal(tiedStranger.ok,true);
    const detailAfter=await leadDetail(stranger.id);
    assert.deepEqual(detailAfter.dupMates,[],'once tied, the family list covers them and the block empties');
    assert.ok(detailAfter.family.some(member=>member.id===first.id));

    console.log('Duplicate phones: quick-add with a held number asks instead of writing and shows every live holder by name and mask with no digits and no family key in the question; "add as sibling" inherits the holder key and says who from; "keep as a separate lead" carries no key at all so two strangers on one number are not one family; "merge" folds the entry into the named lead filling only empty fields, moving a second number written in the same cell and the entry note, and writing no row; merging two existing leads moves phones, notes and the family re-point, bins the source through the Recycle Bin and audits the readable id; a converted lead is refused by name and stays live; tying two leads puts both on one key; and the drawer lists number-mates outside the family until a tie makes them family.');
  }finally{
    await mongoose.disconnect();
    await mongo.stop();
  }
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
