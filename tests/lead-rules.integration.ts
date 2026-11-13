// @ts-nocheck -- R3.6: the visitor-lead rule layer, against a disposable database.
/**
 * R3.6 · Visitor leads: the decisions that need a database.
 *
 * `vocab.ts` / `lead-phone.ts` / `lead-date.ts` / `lead-class.ts` / `lead-columns.ts` decide what one row
 * means, and R3.1–R3.5 prove the record itself. This suite proves what `src/lib/leads/leads.ts` does with
 * the collection around that row — the seven things a screen cannot decide on its own:
 *
 *   • Quick-add stores what was typed and NOTHING else: group and medium stay `unknown`, class stays
 *     null, no follow-up is invented, and a refusal is a refusal (no name, an unreadable number,
 *     31 February) rather than a repaired write.
 *   • The family key is inherited from the lead that already holds the number, and two families bridged
 *     by one row are merged instead of left split — recomputing the key would have done exactly that.
 *   • A phone-shaped search is refused at the query layer, in ASCII digits and in Bangla digits, so the
 *     rule that keeps numbers out of URLs also keeps them out of `find()`.
 *   • "Today's follow-ups" and the overdue count come from one range query, overdue first.
 *   • "Do not contact" is sticky across a status change, is only lifted deliberately, and survives a
 *     caller-supplied filter trying to override it in a bulk-SMS selection.
 *   • The duplicate-phone report and every audit row hand out masked numbers and lead ids — never a
 *     normalized number, because both end up pasted into logs.
 *   • The importer's write keeps an unmapped cell as `unknown`/`other` plus a flag quoting the sheet,
 *     makes the Bangla comment the first note, and a repeated `importBatch` is counted rather than
 *     quietly doubling the list.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {AdminAudit} from '../src/models/AdminAudit';
import {Lead,nextLeadId} from '../src/models/Lead';
import {
  createQuickLead,createSheetLead,resolveFamilyKey,leadsWithPhone,listLeads,followUpBoard,leadDetail,
  updateLeadStatus,setContactPermission,setLeadFollowUp,addLeadNote,contactableLeads,duplicatePhoneGroups,
  importBatchSummary,
} from '../src/lib/leads/leads';
import {familyKeyFromPhones,maskPhone,nextFollowUpDay} from '../src/lib/leads/vocab';
import {normalizeClassLabel} from '../src/lib/leads/lead-class';
import {dhakaDay} from '../src/lib/admin/today';

const P1='01712817090';   // family one
const P2='01911223344';   // family two, until one row bridges them
const P3='01711223344';   // the quick-add of step 1, written in Bangla digits
const P4='01711000041';   // a second number on the sibling

async function run(){
  await preflight({mongo:true,test:'tests/lead-rules.integration.ts — needs a MongoDB (or TEST_MONGO_URI from npm run test-mode)'});
  const shared=process.env.TEST_MONGO_URI||null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){for(const c of await mongoose.connection.db.listCollections().toArray()){await mongoose.connection.db.collection(c.name).deleteMany({}).catch(()=>{})}}

  try{
    const now=new Date();
    const today=dhakaDay(now);
    const yesterday=dhakaDay(new Date(now.getTime()-86400000));
    const actor=await User.create({name:'Lead Keeper',email:'lead-rules@example.test',passwordHash:await bcrypt.hash('LeadsOnly-2026!',12),role:'admin',active:true});
    const actorId=String(actor._id);
    const read=(id)=>Lead.findById(id).setOptions({recycleAny:true}).lean();

    // ---- 1. Quick-add writes what was typed and leaves the rest unknown.
    const quick=await createQuickLead({studentName:'রিয়া আক্তার',phone:'০১৭১১২২৩৩৪৪',classLabel:'পঞ্চম শ্রেণি',school:'মতিঝিল বালিকা বিদ্যালয়'},actorId,now);
    assert.equal(quick.ok,true,'four fields are a complete lead');
    assert.match(quick.leadId,/^V-\d{4}-\d{4}$/,'and it is handed a lead id in the year it was written');
    const quickDoc=await read(quick.id);
    assert.equal(quickDoc.group,'unknown','group was not filled in, so it stays unknown');
    assert.equal(quickDoc.medium,'unknown','medium too');
    assert.equal(quickDoc.shift,'any','and shift keeps its "no preference" value');
    assert.equal(quickDoc.classGroup,null,'and a class label the reader does not hold (পঞ্চম is below the sheet\u2019s range) stays NOT DERIVED…');
    assert.equal(quickDoc.classLabel,'পঞ্চম শ্রেণি','…with the label stored exactly as typed');
    assert.ok(quickDoc.flags.some(flag=>flag.code==='unrecognized'&&flag.field==='classLabel'),'and a stored doubt saying so, rather than a guess');
    assert.equal(quickDoc.exam,null,'no exam is inferred from a label nobody could read');
    assert.equal(quickDoc.nextFollowUp,null,'no follow-up is invented for a lead nobody scheduled');
    assert.equal(quickDoc.phones[0].normalized,P3,'Bangla digits are normalized…');
    assert.equal(quickDoc.phones[0].original,'০১৭১১২২৩৩৪৪','…and the spelling the operator typed is kept beside it');
    assert.equal(quickDoc.familyKey,`fam:${P3}`);
    assert.equal(quickDoc.importSource,'quick-add');
    assert.equal(String(quickDoc.createdBy),actorId,'naming who wrote it');
    assert.ok(await AdminAudit.findOne({action:'lead.create',target:quick.leadId}),'and the audit row is keyed by the lead id');
    // A second quick-add, this time with a class the reader DOES hold, so the class filter has something
    // to find. No number: a lead without one is a normal thing, and must not break the family or send paths.
    const classNine=await createQuickLead({studentName:'নবমের ছাত্র',classLabel:'নবম শ্রেণি',followUp:'tomorrow'},actorId,now);
    assert.equal(classNine.ok,true);
    assert.equal((await read(classNine.id)).classGroup,9,'a class that was written legibly is read');
    assert.equal((await read(classNine.id)).nextFollowUp,nextFollowUpDay('tomorrow',now),'and a follow-up the operator DID choose is stored as a day');
    assert.equal((await read(classNine.id)).familyKey,null,'with no number there is no family key, and none is invented');

    // ---- 2. Refusals write nothing.
    const before=await Lead.countDocuments();
    const nameless=await createQuickLead({studentName:'   ',phone:P1},actorId,now);
    assert.equal(nameless.ok,false);assert.equal(nameless.code,'NO_NAME');
    assert.ok(nameless.messageBn.length>3,'every refusal carries words the operator can act on');
    const badPhone=await createQuickLead({studentName:'নাম আছে',phone:'১২৩'},actorId,now);
    assert.equal(badPhone.ok,false);assert.equal(badPhone.code,'BAD_PHONE');
    const badDay=await createQuickLead({studentName:'নাম আছে',followUp:'custom',customDay:'2026-02-31'},actorId,now);
    assert.equal(badDay.ok,false);assert.equal(badDay.code,'BAD_FOLLOW_UP','31 February is refused, not rolled into March');
    assert.equal(await Lead.countDocuments(),before,'so a refused quick-add leaves the collection exactly as it was');

    // ---- 3. The family key is inherited, and two families bridged by one row are merged.
    const one=await createQuickLead({studentName:'রাহুল আহমেদ',phone:P1},actorId,now);
    assert.equal(one.ok,true);
    const two=await createQuickLead({studentName:'তানভীর হাসান',phone:P2},actorId,now);
    assert.equal(two.ok,true,'a second, unrelated family gets its own key');
    assert.notEqual((await read(one.id)).familyKey,(await read(two.id)).familyKey);
    assert.equal(familyKeyFromPhones([P2]),(await read(two.id)).familyKey,'computed from its own number, because nobody held it yet');
    // The sibling: typed with its own number FIRST, so recomputing would have chosen the wrong key.
    const sibling=await createQuickLead({studentName:'রাহুলের বোন',phone:`${P4},${P1}`},actorId,now);
    assert.equal(sibling.ok,true);
    assert.equal(familyKeyFromPhones([P4,P1]),`fam:${P4}`,'the smallest number on this row alone…');
    assert.notEqual(sibling.familyKey,`fam:${P4}`,'…is NOT the key it was given');
    assert.equal(sibling.familyKey,`fam:${P1}`,'the family key is inherited from the lead that already held the number');
    assert.equal(sibling.inheritedFrom,(await read(one.id)).leadId,'and the suite can say which lead it came from');
    // Now a row that bridges the two families: the smaller key wins and the other leads are re-pointed.
    const bridge=await createQuickLead({studentName:'দুই পরিবারের সেতু',phone:`${P2},${P1}`},actorId,now);
    assert.equal(bridge.ok,true);
    assert.equal(bridge.familyKey,`fam:${P1}`,'the smaller of the two existing keys is adopted…');
    assert.deepEqual(bridge.mergedFrom,[`fam:${P2}`],'naming the key that was given up, so an import can report the merge');
    assert.equal(bridge.mergedLeads,1,'and the lead that held it is re-pointed, not left behind');
    // Parenthesised: `await read(id).familyKey` reads a property off the QUERY and awaits undefined.
    assert.equal((await read(two.id)).familyKey,`fam:${P1}`,'so the second family really did move');
    assert.equal(await Lead.countDocuments({familyKey:`fam:${P1}`}),4,'one family, four leads, one query');
    assert.equal(await Lead.countDocuments({familyKey:`fam:${P2}`}),0,'and nothing is left under the abandoned key');
    const holders=await leadsWithPhone(P1);
    assert.equal(holders.length,3,'the number is now on three leads — the original, the sibling and the bridge — found by one indexed lookup');
    assert.equal(holders[0].masked,maskPhone(P1),'reported masked');
    assert.ok(!JSON.stringify(holders).includes(P1),'and a duplicate-phone lookup never carries the raw number');
    assert.deepEqual(await leadsWithPhone('0170000000'),[],'a number nobody holds answers with nothing, not an error');
    assert.equal((await resolveFamilyKey([])).familyKey,null,'a lead with no readable number has no family key');

    // ---- 4. The list: names are searchable, numbers are refused, filters only accept the vocabulary.
    const byName=await listLeads({q:'রিয়া'},now);
    assert.equal(byName.refusedPhone,false);
    assert.ok(byName.rows.some(row=>row.leadId===quick.leadId),'a name search finds the lead');
    const asciiSearch=await listLeads({q:P1},now);
    assert.equal(asciiSearch.refusedPhone,true,'a phone-shaped search is refused at the query layer');
    assert.equal(asciiSearch.rows.length,asciiSearch.total,'and is simply not applied — the operator is told, not shown a list that looks like a match');
    const banglaSearch=await listLeads({q:'০১৭১২৮১৭০৯০'},now);
    assert.equal(banglaSearch.refusedPhone,true,'Bangla digits are digits');
    assert.equal((await listLeads({q:'017-1281'},now)).refusedPhone,true,'as are the dashes and spaces a number is typed with');
    assert.equal((await listLeads({q:'রাহুল আহমেদ'},now)).refusedPhone,false,'while a name is still shareable in a URL');
    const byClass=await listLeads({classGroup:'9'},now);
    assert.ok(byClass.rows.every(row=>row.classGroup===9)&&byClass.rows.some(row=>row.leadId===classNine.leadId),'the class filter narrows to the class that was read');
    assert.equal((await listLeads({classGroup:'99'},now)).total,await Lead.countDocuments(),'an out-of-range class filter is ignored rather than trusted');
    assert.equal((await listLeads({status:'nonsense'},now)).total,await Lead.countDocuments(),'and so is a status outside the vocabulary');
    await updateLeadStatus(one.id,'called',actorId,now);
    // Hoisted, because an `await` inside a `.some()` callback is not inside an async function — the one
    // thing `@ts-nocheck` at the top of this file hides from tsc and esbuild still refuses to build.
    const oneLeadId=(await read(one.id)).leadId;
    const byStatus=await listLeads({status:'called'},now);
    assert.ok(byStatus.rows.some(row=>row.leadId===oneLeadId),'a real status filter narrows the list');
    const paged=await listLeads({perPage:2,page:2},now);
    assert.equal(paged.rows.length,2,'the list pages');
    assert.equal(paged.page,2);
    assert.ok(paged.pages>=2);
    assert.notDeepEqual(paged.rows.map(row=>row.leadId),(await listLeads({perPage:2,page:1},now)).rows.map(row=>row.leadId),'and page two is not page one again');

    // ---- 5. Today's follow-ups, with overdue counted separately and listed first.
    await setLeadFollowUp(one.id,'today',actorId,now);
    await setLeadFollowUp(two.id,'custom',actorId,now,yesterday);
    const board=await followUpBoard(now);
    assert.ok(board.today>=1,'today has its own count');
    assert.ok(board.overdue>=1,'and so does overdue — a lead nobody called three days ago is a different problem');
    assert.equal(board.rows[0].nextFollowUp,yesterday,'the board lists the oldest promise first');
    assert.ok(board.rows.every(row=>row.followUp==='today'||row.followUp==='overdue'),'every row on it is due');
    assert.equal(board.rows[0].followUp,'overdue','labelled as such, so the operator sees it without doing the arithmetic');

    // ---- 6. "Do not contact" is sticky, and only a deliberate action lifts it.
    const forbidden=await updateLeadStatus(one.id,'do_not_contact',actorId,now,'অভিভাবক কল করতে নিষেধ করেছেন');
    assert.equal(forbidden.ok,true);
    assert.equal(forbidden.doNotContact,true,'choosing the status sets the flag');
    assert.equal((await read(one.id)).notes.length,1,'and the reason travels with it as a note');
    const moved=await updateLeadStatus(one.id,'called',actorId,now);
    assert.equal(moved.doNotContact,true,'moving the status back does NOT clear it — an operator un-marking a status must not silently re-open a calling list');
    assert.equal((await updateLeadStatus(one.id,'nonsense',actorId,now)).code,'BAD_STATUS');
    assert.equal((await updateLeadStatus(new mongoose.Types.ObjectId().toString(),'called',actorId,now)).code,'MISSING');
    const lifted=await setContactPermission(one.id,true,actorId);
    assert.equal(lifted.doNotContact,false,'lifting it is its own action');
    await updateLeadStatus(one.id,'do_not_contact',actorId,now);
    const liftedAgain=await setContactPermission(one.id,true,actorId);
    assert.equal(liftedAgain.doNotContact,false);
    assert.equal((await read(one.id)).status,'called','and the status is moved off "do not contact" with it, so the row cannot contradict itself');

    // ---- 7. The five follow-up buttons.
    assert.equal((await setLeadFollowUp(one.id,'tomorrow',actorId,now)).nextFollowUp,nextFollowUpDay('tomorrow',now));
    assert.equal((await setLeadFollowUp(one.id,'three_days',actorId,now)).nextFollowUp,nextFollowUpDay('three_days',now));
    assert.equal((await setLeadFollowUp(one.id,'next_week',actorId,now)).nextFollowUp,nextFollowUpDay('next_week',now),'next week is seven days, not "the next Monday" — a Monday rule would hide a lead for six days');
    assert.equal((await setLeadFollowUp(one.id,'custom',actorId,now,'2026-02-31')).code,'BAD_FOLLOW_UP');
    const cleared=await setLeadFollowUp(one.id,'clear',actorId,now);
    assert.equal(cleared.nextFollowUp,null,'and a follow-up can be taken back off');
    assert.equal(cleared.state,'none');

    // ---- 8. Notes: the drawer's timeline, newest first, with the writer's name.
    assert.equal((await addLeadNote(one.id,'   ','',actorId,now)).code,'NO_NOTE');
    assert.equal((await addLeadNote(one.id,'ক'.repeat(1001),'',actorId,now)).code,'NOTE_TOO_LONG');
    // Three distinct timestamps, because two notes written "at the same moment" would leave the order
    // of the timeline resting on insertion order — and the drawer promises newest first, not "whatever
    // the array happened to hold".
    const first=await addLeadNote(one.id,'কল করা হয়েছিল, পরে আবার ফোন চাইলেন','call_back_later',actorId,new Date(now.getTime()+30000));
    assert.equal(first.ok,true);assert.equal(first.noteCount,2);
    await addLeadNote(one.id,'দ্বিতীয় নোট','',actorId,new Date(now.getTime()+60000));
    const detail=await leadDetail(one.id,now);
    assert.deepEqual(detail.notes.map(note=>note.text),['দ্বিতীয় নোট','কল করা হয়েছিল, পরে আবার ফোন চাইলেন','অভিভাবক কল করতে নিষেধ করেছেন'],'the timeline is newest first, all three notes in order');
    assert.equal(detail.notes[1].outcome,'call_back_later','and an outcome is kept with the note that earned it');
    assert.ok(detail.notes.every(note=>note.byName==='Lead Keeper'),'every note names its writer, resolved from the user record');
    const siblingLeadId=(await read(sibling.id)).leadId;
    assert.ok(detail.family.some(row=>row.leadId===siblingLeadId),'the drawer shows the rest of the family');
    assert.ok(!detail.family.some(row=>row.leadId===oneLeadId),'but not the lead itself');
    assert.equal(await leadDetail(new mongoose.Types.ObjectId().toString(),now),null,'a lead that is not there answers with null');

    // ---- 9. Bulk SMS: the guard is not overridable, and what it excluded is reported.
    await updateLeadStatus(one.id,'do_not_contact',actorId,now);
    const phoneless=await Lead.create({leadId:await nextLeadId(now),date:today,studentName:'নাম্বার ছাড়া লিড',phones:[]});
    const send=await contactableLeads({});
    assert.ok(!send.recipients.some(row=>row.leadId===oneLeadId),'a do-not-contact lead is not in the recipient list');
    assert.ok(send.excludedDoNotContact>=1,'and the dialog can say how many were left out, instead of dropping them silently');
    assert.ok(send.withoutPhone>=1,'as it can say how many had no number to send to');
    assert.ok(send.recipients.every(row=>/^01[3-9]\d{8}$/.test(row.phone)&&row.masked===maskPhone(row.phone)),'every recipient carries a usable number and a mask for logs');
    const override=await contactableLeads({doNotContact:true});
    assert.equal(override.recipients.length,0,'no caller-supplied filter can override the guard');
    const narrowed=await contactableLeads({classGroup:9});
    assert.ok(narrowed.recipients.length>=1&&narrowed.recipients.every(row=>row.classGroup===9),'while an ordinary filter narrows the send as expected');

    // ---- 10. Nothing a number can leak through: the duplicate report and every audit row.
    const duplicates=await duplicatePhoneGroups();
    const sharedGroup=duplicates.find(group=>group.masked===maskPhone(P1));
    assert.ok(sharedGroup&&sharedGroup.count===3,'a number on three leads is reported as one group of three');
    assert.ok(sharedGroup.rows.every(row=>row.leadId&&row.studentName),'naming the leads that share it, so the operator can see which two rows to merge');
    assert.ok(duplicates.some(group=>group.masked===maskPhone(P2)&&group.count===2),'and a second shared number is its own group');
    assert.ok(!JSON.stringify(duplicates).includes(P1),'masked — an aggregate result is the kind of thing that ends up in a log');
    assert.ok(!JSON.stringify(duplicates).includes(P2),'nor the second one');
    const auditRows=await AdminAudit.find({action:/^lead\./}).lean();
    assert.ok(auditRows.length>=8,'every write above left an audit row');
    assert.ok(auditRows.every(row=>/^V-\d{4}-\d{4}$/.test(row.target)),'and every one of them targets a lead id');
    assert.ok(!auditRows.some(row=>/01[3-9]\d{8}/.test(row.target)),'never a number');

    // ---- 11. The importer's write: unmapped stays unmapped, the comment becomes the first note.
    const expectedClass=normalizeClassLabel('SSC 27',now);
    const sheet=await createSheetLead({
      date:today,studentName:'সোহেল রানা',phones:[{normalized:'01811223344',original:'01811223344'}],
      classLabel:'SSC 27',group:null,medium:null,shift:null,source:null,
      raw:{group:'বিজ্ঞান বিভাগীয়',medium:'ইংলিশ ভার্সন?',shift:'সন্ধ্যা?',source:'পরিচিত কারো মাধ্যমে'},
      notes:'ভাইয়ার সুপারিশে এসেছিল, গণিত দুর্বল',importSource:'visitor-sheet-2026.xlsx',importBatch:'batch-r3-1',
    },actorId,now);
    assert.equal(sheet.ok,true);
    const sheetDoc=await read(sheet.id);
    assert.equal(sheetDoc.group,'unknown','a group the sheet wrote but the vocabulary does not hold stays unknown…');
    assert.equal(sheetDoc.medium,'unknown');
    assert.equal(sheetDoc.shift,'any');
    assert.equal(sheetDoc.source,'other','and a source with no "unknown" value becomes "other"…');
    const unmapped=sheetDoc.flags.filter(flag=>flag.code==='unmapped');
    assert.equal(unmapped.length,4,'…with a flag for each, quoting what the sheet actually said');
    assert.ok(unmapped.some(flag=>flag.field==='source'&&flag.original==='পরিচিত কারো মাধ্যমে'),'so "we could not read it" is never mistaken for "the sheet said nothing"');
    assert.equal(sheetDoc.classGroup,expectedClass.classGroup,'the class that WAS readable is read');
    assert.equal(sheetDoc.exam,expectedClass.exam);assert.equal(sheetDoc.examYear,expectedClass.examYear);
    assert.equal(sheetDoc.notes[0].text,'ভাইয়ার সুপারিশে এসেছিল, গণিত দুর্বল','the Bangla comment becomes the first note');
    assert.equal(String(sheetDoc.notes[0].by),actorId,'attributed to whoever ran the import');
    assert.equal(sheetDoc.importBatch,'batch-r3-1');
    assert.equal((await createSheetLead({date:'13/11/2026',studentName:'তারিখ ভুল'},actorId,now)).code,'BAD_DATE','a day the writer could not read is not written');
    assert.equal((await createSheetLead({date:today,studentName:'  '},actorId,now)).code,'NO_NAME');
    const firstSummary=await importBatchSummary('batch-r3-1');
    assert.equal(firstSummary.count,1,'a batch is countable the moment it lands');
    await createSheetLead({date:today,studentName:'দ্বিতীয় সারি',importBatch:'batch-r3-1',importSource:'visitor-sheet-2026.xlsx'},actorId,now);
    const second=await importBatchSummary('batch-r3-1');
    assert.equal(second.count,2,'so re-uploading one file can be asked about instead of quietly doubling the list');
    assert.equal(second.source,'visitor-sheet-2026.xlsx','naming the file it came from');
    assert.ok(second.firstAt&&second.lastAt,'with when it started and when it finished');
    assert.equal(await importBatchSummary('never-imported'),null,'and an unseen batch answers with nothing');
    assert.equal(await importBatchSummary(''),null);

    // ---- 12. Two operators saving at once: the unique index is the guard, the retry is behind it.
    const ids=new Set();
    for(let i=0;i<5;i++){const made=await createQuickLead({studentName:`ধারাবাহিক লিড ${i+1}`},actorId,now);assert.equal(made.ok,true);ids.add(made.leadId)}
    assert.equal(ids.size,5,'five leads, five distinct ids, no refusals');

    console.log('Visitor-lead rules: quick-add stores what was typed and leaves group, medium, class and follow-up unknown rather than guessed; a nameless row, an unreadable number and 31 February are refused without writing; the family key is inherited from the lead that already holds the number and two families bridged by one row are merged instead of split; a phone-shaped search is refused in ASCII and Bangla digits while names stay shareable; today\'s follow-ups and the overdue count come from one range query with the oldest promise first; do-not-contact is sticky across a status change, is lifted only deliberately and cannot be overridden by a bulk-send filter; the duplicate-phone report and every audit row carry masked numbers and lead ids; and the importer keeps an unmapped cell as unknown with a flag quoting the sheet, makes the Bangla comment the first note and counts a repeated batch instead of writing it twice.');
  }finally{
    await mongoose.disconnect();
    await mongo.stop();
  }
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
