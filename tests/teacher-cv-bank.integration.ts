// @ts-nocheck -- R4.6: the teacher CV bank, against the disposable database.
/**
 * R4.6 · The CV bank's promises that only a collection can keep.
 *
 * The readings — subjects, free time, salary, dates, columns — are proved without a database in
 * `teacher-cv-parse.test.ts`. This suite proves what the database is for:
 *
 *   • a readable id follows the highest number of the year, restarts each year, and is never handed to
 *     somebody else by a CV that was binned or purged;
 *   • the quick-add asks about a shared number or email instead of writing a twin, names the CV it
 *     found by readable id and mask, and writes the second one only when a hand says they are two;
 *   • a CV bins, disappears from every ordinary query, lists in the bin, comes back, and can be purged —
 *     while a CV that has been hired refuses to bin at all, because the Teacher profile behind it would
 *     be claiming an origin the bin is hiding;
 *   • the hire writes one unpublished Teacher profile carrying the candidate's own name in BOTH
 *     languages, links it back, moves the status to Hired and files a timeline note in one transaction,
 *     and refuses to do it twice;
 *   • the twelve-month review counts and reminds; it deletes nothing and never counts a hired CV;
 *   • a saved teaching need matches the CVs that fit it and only those, and returns whole rows so the
 *     need screen can render the same table the list does;
 *   • the import commit writes exactly the rows the preview showed writable, files the sheet's own
 *     comment as the CV's first note and its unparsed words as tags, refuses a second upload of the same
 *     rows with IMPORT_NOTHING, and undoes by binning what it created and keeping a CV hired since;
 *   • and no phone number this bank feeds to a screen, a log or an audit row is ever a whole number.
 *
 * Every candidate here is synthetic and labelled FAKE; no real CV exists in this repository.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {TeacherCandidate,nextCandidateId} from '../src/models/TeacherCandidate';
import {TeacherImportBatch} from '../src/models/TeacherImportBatch';
import {TeacherContent} from '../src/models/PublicContent';
import {AdminAudit} from '../src/models/AdminAudit';
import {binList,purgeOne,restoreRecord,softDelete} from '../src/lib/admin/recycle';
import {
  addCandidateNote,candidateDetail,candidateStatusCounts,candidatesForSms,createCandidate,hireCandidate,
  listCandidates,reviewCount,scheduleInterview,updateCandidate,
} from '../src/lib/teachers/candidates';
import {listNeeds,needMatches,removeNeed,saveNeed,setNeedFilled} from '../src/lib/teachers/needs';
import {commitCvImport,cvImportHistory,loadCvIndex,undoCvImport} from '../src/lib/teachers/import-commit';
import {emptyCvDecisions,previewCvImport,readCvWorkbook} from '../src/lib/teachers/import-preview';
import {teacherCandidates,teacherSmsTally} from '../src/lib/teachers/cv-sms';

const FIXTURE=path.join('tests','fixtures','Teacher-CV-FAKE-SAMPLE.xlsx');
const CSV=path.join('tests','fixtures','Teacher-CV-FAKE-SAMPLE.csv');
const NOW=new Date(Date.UTC(2026,2,20,6,0,0)); // Dhaka sees 2026-03-20
const NUMBER='01711000111';

/** A whole number must not appear in anything this bank hands to a screen, a log or an audit row. */
function noNumber(value:unknown,label:string){
  const text=typeof value==='string'?value:JSON.stringify(value);
  assert.equal(text.includes(NUMBER),false,`${label} carries no whole number`);
  assert.equal(text.includes('1711000111'),false,`${label} carries no number without its leading zero either`);
}

async function run(){
  await preflight({mongo:true,test:'tests/teacher-cv-bank.integration.ts — run it with TEST_MONGO_URI, or let it raise its own disposable replica set'});
  const shared=process.env.TEST_MONGO_URI||null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){for(const c of await mongoose.connection.db.listCollections().toArray()){await mongoose.connection.db.collection(c.name).deleteMany({}).catch(()=>{})}}
  const actor=await User.create({name:'FAKE CV Keeper',email:'fake-cv-keeper@example.test',
    passwordHash:await bcrypt.hash('fake-cv-bank-only',12),role:'admin',active:true});
  const actorId=String(actor._id);
  try{
    // ── 1. The readable id ───────────────────────────────────────────────────────────────────────
    assert.equal(await nextCandidateId(NOW),'CV-2026-0001','an empty bank starts at one');
    const first=await createCandidate({name:'FAKE Candidate One',phones:[NUMBER],subjects:['math'],classLevels:['9','10'],
      availabilityText:'3.00-6.00',shifts:['evening'],university:'FAKE University',department:'Mathematics',
      receivedDate:'2026-03-01'},actorId,NOW);
    assert.equal(first.ok,true);
    assert.equal(first.candidateId,'CV-2026-0001');
    const second=await createCandidate({name:'FAKE Candidate Two',phones:['01811000222'],subjects:['chemistry'],
      classLevels:['9','10'],shifts:['evening'],receivedDate:'2026-03-02'},actorId,NOW);
    assert.equal(second.candidateId,'CV-2026-0002','the sequence follows the highest id, not a count');
    assert.equal(await nextCandidateId(new Date(Date.UTC(2027,0,5,6,0,0))),'CV-2027-0001','and restarts each year');

    // A binned CV keeps its number: the id would otherwise be handed to somebody else, and two people
    // sharing one reference in one year is a mistake no reader can undo later.
    assert.equal((await softDelete('teacherCandidate',second.id,actorId,NOW)).status,'ok');
    assert.equal(await nextCandidateId(NOW),'CV-2026-0003','a CV in the bin still holds its number');
    assert.equal((await restoreRecord('teacherCandidate',second.id,actorId)).status,'ok','and comes back with it');

    // ── 2. Validation: what a CV must have, and what it must not invent ──────────────────────────
    assert.equal((await createCandidate({name:'',phones:[NUMBER]},actorId,NOW)).code,'NO_NAME','a CV with no name cannot be called or hired');
    assert.equal((await createCandidate({name:'FAKE Bad Mail',email:'not-an-email'},actorId,NOW)).code,'BAD_EMAIL','an email nobody can write to is refused');
    assert.equal((await createCandidate({name:'x'.repeat(121)},actorId,NOW)).code,'NAME_TOO_LONG','and a name longer than the field is refused, not truncated');
    const filtered=await createCandidate({name:'FAKE Candidate Three',subjects:['astrology','math'],classLevels:['13','9'],
      shifts:['night','evening'],source:'tiktok',receivedDate:'nonsense'},actorId,NOW);
    const filteredDoc=await TeacherCandidate.findById(filtered.id).lean();
    assert.deepEqual(filteredDoc.subjects,['math'],'a subject the bank has no entry for is not stored as if it had one');
    assert.deepEqual(filteredDoc.classLevels,['9'],'a class number the bank does not carry is dropped');
    assert.deepEqual(filteredDoc.shifts,['evening'],'and so is a shift it does not carry');
    assert.equal(filteredDoc.source,'walk_in','an unknown source falls back to the one an operator can see and correct');
    assert.equal(filteredDoc.receivedDate,'2026-03-20','a date nobody can read becomes today in Dhaka, not a null');
    assert.equal(filteredDoc.status,'new');
    assert.equal(filteredDoc.rating,'unrated','“unrated” is a state of its own, so a new CV is never scored by default');
    await assert.rejects(()=>TeacherCandidate.create({candidateId:'CV-2026-0001',receivedDate:'2026-03-20',name:'FAKE Twin Id'}),
      /duplicate|E11000/i,'the unique index is the backstop if two admins add at the same moment');

    // ── 3. The duplicate question ────────────────────────────────────────────────────────────────
    const question=await createCandidate({name:'FAKE Candidate One Again',phones:[`0 ${NUMBER.slice(0,5)}-${NUMBER.slice(5)}`],
      email:'fake-one@example.test'},actorId,NOW);
    assert.equal(question.ok,false);
    assert.equal(question.code,'DUPLICATE','a shared number is a question, not an error');
    assert.equal(question.holders.length,1);
    assert.equal(question.holders[0].match,'phone');
    assert.equal(question.holders[0].candidateId,'CV-2026-0001','the CV it found is named by its readable id…');
    assert.equal(question.holders[0].masked,'01****11','…and its number as a mask');
    noNumber(question.holders,'the duplicate question');
    assert.ok(question.messageBn&&question.messageEn,'and the question arrives in both languages');
    const byEmail=await createCandidate({name:'FAKE Candidate One Again',phones:['01911000333'],email:'FAKE-ONE@example.test'},actorId,NOW);
    assert.equal(byEmail.code,'DUPLICATE');
    assert.equal(byEmail.holders[0].match,'email','a shared email asks the same question');
    const separate=await createCandidate({name:'FAKE Candidate One Again',phones:[NUMBER],email:'fake-one@example.test'},actorId,NOW,{dupChoice:'separate'});
    assert.equal(separate.ok,true,'and a hand saying “these are two people” writes the second one');
    assert.equal(separate.candidateId,'CV-2026-0004');
    assert.equal((await candidateDetail(first.id,NOW)).duplicates.length,1,
      'the drawer keeps showing the twin, because two CVs can still be one person to call');

    // ── 4. The list, the drawer and the numbers ──────────────────────────────────────────────────
    const list=await listCandidates({},NOW);
    assert.equal(list.total,4,'four live CVs');
    const listRow=list.rows.find(row=>row.candidateId==='CV-2026-0001');
    assert.deepEqual(listRow.phones.map(phone=>phone.masked),['01****11'],'the list carries masks…');
    assert.equal(listRow.phones[0].tel,`tel:+880${NUMBER.slice(1)}`,'…a tel: destination…');
    assert.equal(listRow.phones[0].whatsapp,`https://wa.me/880${NUMBER.slice(1)}`,'…and a wa.me destination: the only two places a number appears');
    noNumber(list.rows.map(row=>({...row,phones:row.phones.map(phone=>phone.masked)})),'the list');
    const drawn=await candidateDetail(first.id,NOW);
    assert.equal(drawn.row.review,false,'a CV from this month does not need a second look');
    assert.equal(drawn.row.subjects.join(','),'math');
    assert.equal(drawn.notes.length,0);
    assert.equal(drawn.teacher,null,'nothing has been hired from this CV yet');
    noNumber({...drawn.row,phones:drawn.row.phones.map(phone=>phone.masked)},'the drawer');

    assert.equal((await listCandidates({subject:'chemistry',classLevel:'9',shift:'evening'},NOW)).total,1,
      'a filter narrows on the stored vocabulary, not on text');
    const old=await createCandidate({name:'FAKE Candidate Old',phones:['01611000444'],subjects:['physics'],
      receivedDate:'2024-11-05',status:'contacted'},actorId,NOW);
    assert.equal((await listCandidates({review:'old'},NOW)).total,1,'the twelve-month review is one filter, not a second query');
    const counts=await candidateStatusCounts();
    assert.equal(counts.length,9,'the chips print every status in the vocabulary…');
    assert.equal(counts.find(entry=>entry.status==='contacted').count,1,'…with their counts');
    assert.equal(counts.find(entry=>entry.status==='interviewed').count,0,'and a status nobody is in still prints, at zero');

    // ── 5. The twelve-month review reminds and deletes nothing ───────────────────────────────────
    const storedBefore=await TeacherCandidate.countDocuments({}).setOptions({recycleAny:true});
    assert.equal(await reviewCount(NOW),1,'one CV has waited more than a year');
    await updateCandidate(old.id,{status:'hired'},actorId);
    assert.equal(await reviewCount(NOW),0,'a hired CV is not waiting for a second look');
    assert.equal(await TeacherCandidate.countDocuments({}).setOptions({recycleAny:true}),storedBefore,
      'the reminder deleted nothing: every document is still stored');
    assert.equal((await candidateDetail(old.id,NOW)).row.status,'hired');
    assert.equal((await updateCandidate(old.id,{status:'promoted'},actorId)).code,'BAD_STATUS','a status outside the vocabulary is refused');
    assert.equal((await updateCandidate(old.id,{rating:'six stars'},actorId)).code,'BAD_RATING','and so is a rating outside it');
    await updateCandidate(old.id,{status:'shortlisted',rating:'good'},actorId);

    // ── 6. The hire ──────────────────────────────────────────────────────────────────────────────
    const hire=await hireCandidate(old.id,actorId,NOW);
    assert.equal(hire.ok,true);
    const profile=await TeacherContent.findById(hire.teacherId).lean();
    assert.equal(profile.published,false,'the profile is unpublished: a public faculty page is the owner’s decision, not a side effect of a hiring');
    assert.equal(profile.name.bn,'FAKE Candidate Old');
    assert.equal(profile.name.en,'FAKE Candidate Old','and the name is the candidate’s own in both languages, not an invented spelling');
    assert.equal(profile.qualification.bn,'FAKE Candidate Old','with no university on the CV, the name stands in rather than a made-up degree');
    assert.equal(hire.slug,profile.slug);
    assert.equal(await TeacherContent.countDocuments({slug:profile.slug}),1,'one CV made one profile');
    const hired=await candidateDetail(old.id,NOW);
    assert.equal(hired.row.status,'hired','the status follows the hire');
    assert.equal(hired.row.hired,true,'and the row says it is hired, which is what stops the review reminder');
    assert.equal(hired.teacher.id,hire.teacherId,'the link back is on the CV');
    assert.equal(hired.teacher.published,false);
    assert.equal(hired.notes.length,1,'the hire filed a timeline note');
    assert.ok(hired.notes[0].text.includes('FAKE Candidate Old'),'naming the person');
    assert.equal((await hireCandidate(old.id,actorId,NOW)).code,'ALREADY_HIRED','a second hire is refused, so one CV cannot claim two profiles');
    const hiredBin=await softDelete('teacherCandidate',old.id,actorId,NOW);
    assert.equal(hiredBin.status,'blocked','a hired CV refuses to bin…');
    assert.equal(hiredBin.refs[0].messageKey,'recycleBin.kinds.teacherCandidateHired','…and says why, with the profile still standing');
    assert.notEqual(await TeacherContent.findById(hire.teacherId).lean(),null,'the profile was not taken with it');

    // ── 7. Notes, interviews ─────────────────────────────────────────────────────────────────────
    const noted=await addCandidateNote(first.id,'FAKE note: did not come on the 4th','no_response',actorId,NOW);
    assert.equal(noted.ok,true);
    assert.equal(noted.noteCount,1);
    assert.equal((await candidateDetail(first.id,NOW)).notes[0].byName,'FAKE CV Keeper','a note names the person who wrote it');
    assert.equal((await addCandidateNote(first.id,'   ',actorId,NOW)).code,'EMPTY_NOTE','a note with nothing in it is refused');
    assert.equal((await addCandidateNote(first.id,'x'.repeat(1001),'',actorId,NOW)).code,'NOTE_TOO_LONG','and a note longer than the field is refused, not truncated');
    const inventedOutcome=await addCandidateNote(first.id,'FAKE outcome','promoted',actorId,NOW);
    assert.equal(inventedOutcome.ok,true,'an outcome outside the vocabulary is not a refusal…');
    const outcomeNote=(await candidateDetail(first.id,NOW)).notes.find(note=>note.text==='FAKE outcome');
    assert.equal(outcomeNote.outcome,'','…it is stored with no outcome rather than one that was invented');
    const interview=await scheduleInterview(first.id,'2026-03-25T10:00',actorId);
    assert.equal(interview.ok,true);
    assert.equal(interview.status,'interview_scheduled','scheduling an interview moves the status with it');
    const cleared=await scheduleInterview(first.id,null,actorId);
    assert.equal(cleared.interviewAt,null,'and clearing the time leaves the status alone rather than inventing one');
    assert.equal((await scheduleInterview(first.id,'yesterday',actorId)).code,'BAD_INTERVIEW_TIME','a time nobody can read is refused');
    assert.equal((await scheduleInterview(String(new mongoose.Types.ObjectId()),'2026-03-25T10:00',actorId)).code,'MISSING');

    // ── 8. A teaching need matches the CVs that fit it ───────────────────────────────────────────
    const need=await saveNeed({subject:'chemistry',classLevels:['9','10'],shift:'evening',note:'FAKE need'},actorId);
    assert.equal(need.ok,true);
    assert.equal((await saveNeed({},actorId)).code,'NEED_MISSING','an empty need is refused: it would match everybody');
    const matches=await needMatches(need.id,50,NOW);
    assert.deepEqual(matches.map(row=>row.candidateId),['CV-2026-0002'],'the chemistry teacher for classes 9-10 in the evening, and nobody else');
    assert.equal(matches[0].phones[0].masked,'01****22','and a match is a whole row, so the need screen needs no second, thinner table');
    noNumber(matches.map(row=>({...row,phones:row.phones.map(phone=>phone.masked)})),'the need matches');
    const needs=await listNeeds(true);
    assert.equal(needs.length,1);
    assert.equal(needs[0].matches,1,'the list of needs carries its own match count');
    assert.equal(needs[0].filled,false);
    assert.equal((await setNeedFilled(need.id,true)).filled,true,'a filled need says so');
    assert.equal((await setNeedFilled(String(new mongoose.Types.ObjectId()),true)).code,'MISSING');
    const mathNeed=await saveNeed({subject:'math'},actorId);
    assert.equal((await needMatches(mathNeed.id,50,NOW)).length,2,'a subject-only need matches both maths CVs');
    assert.deepEqual(await needMatches(String(new mongoose.Types.ObjectId()),50,NOW),[],'a need that is not there matches nobody, not everybody');
    assert.equal((await removeNeed(mathNeed.id)).ok,true);
    assert.equal((await removeNeed(mathNeed.id)).code,'MISSING','and removing it twice says so');

    // ── 9. The SMS picker: candidates are not students ───────────────────────────────────────────
    const smsRows=await candidatesForSms([first.id,old.id,String(new mongoose.Types.ObjectId())]);
    assert.equal(smsRows.length,2,'a CV that is not there is simply not picked');
    assert.equal(smsRows.every(row=>row.hasPhone),true);
    const pipeline=teacherCandidates(smsRows);
    assert.equal(pipeline[0].status,'active','a candidate enters the pipeline as an active non-student');
    assert.equal(pipeline[0].subjectKind,'lead','and is never described as a fee subject');
    assert.equal(pipeline[0].smsOptOut,false,'a CV has no do-not-contact mark to invent');
    assert.deepEqual(pipeline[0].values,{},'no per-candidate chips: the subject is typed and the institute number is global');
    assert.deepEqual(teacherSmsTally([{hasPhone:true},{hasPhone:false}]),{sendable:1,withoutPhone:1},'the tally says out loud who cannot be reached');

    // ── 10. The import: commit, idempotence, undo ────────────────────────────────────────────────
    const sheets=await readCvWorkbook('Teacher-CV-FAKE-SAMPLE.xlsx',readFileSync(FIXTURE));
    const decisions=emptyCvDecisions();
    const undecided=await commitCvImport({sheets,decisions,fileLabel:'Teacher-CV-FAKE-SAMPLE.xlsx',hash:'fake-hash-cv-1',actorId,actorName:'FAKE CV Keeper',now:NOW});
    assert.equal(undecided.ok,false);
    assert.equal(undecided.code,'IMPORT_UNDECIDED','the doubtful dates need a hand before anything is written');
    const look=previewCvImport(sheets,decisions,{fileLabel:'Teacher-CV-FAKE-SAMPLE.xlsx',hash:'fake-hash-cv-1',now:NOW});
    for(const row of look.rows)if(row.suggestedDate)decisions.accept[row.key]='accept';
    const commit=await commitCvImport({sheets,decisions,fileLabel:'Teacher-CV-FAKE-SAMPLE.xlsx',hash:'fake-hash-cv-1',actorId,actorName:'FAKE CV Keeper',now:NOW});
    assert.equal(commit.ok,true);
    assert.equal(commit.created,8,'eight of the ten rows were writable');
    assert.equal(commit.blocked,2,'the phone-only row and the second row carrying row 1’s number');
    assert.equal(commit.ids.length,8);
    assert.match(commit.batch,/^CIM-20260320-[0-9a-f]{6}$/,'the batch id names its day and is not guessable');

    const one=await TeacherCandidate.findOne({importBatch:commit.batch,name:'FAKE Candidate One'}).lean();
    assert.equal(one.importSource,'wizard:Teacher-CV-FAKE-SAMPLE.xlsx','the CV says which file it came from');
    assert.equal(one.receivedDate,'2024-11-27','a day-first date landed as the day it was written');
    assert.equal(one.notes.length,1,'the sheet’s own comment became the CV’s first timeline note');
    assert.equal(one.notes[0].text,'did not come on the 4th','word for word');
    assert.deepEqual(one.tags,['GS'],'and a word no table knows became a tag rather than a loss');
    const two=await TeacherCandidate.findOne({importBatch:commit.batch,name:'FAKE Candidate Two'}).lean();
    assert.deepEqual(two.tags.sort(),['BGG','Emg']);
    assert.equal(two.expectedSalary,15000,'15k landed as fifteen thousand');
    assert.deepEqual(two.classLevels,['4','5','6','7'],'a range landed as the classes it names');
    const eight=await TeacherCandidate.findOne({importBatch:commit.batch,name:'FAKE Candidate Eight'}).lean();
    assert.equal(eight.notes[0].text,'চতুর্থ তারিখে আসেননি','a Bangla comment is stored in Bangla, not translated or dropped');
    assert.deepEqual(eight.phones.map(phone=>phone.normalized),['01312345678'],'Bangla digits landed as a normalized number');
    const three=await TeacherCandidate.findOne({importBatch:commit.batch,name:'FAKE Candidate Three'}).lean();
    assert.equal(three.receivedDate,'2024-12-15','the accepted year is the year that landed');
    const four=await TeacherCandidate.findOne({importBatch:commit.batch,name:'FAKE Candidate Four'}).lean();
    assert.equal(four.receivedDate,'2026-03-20','an empty date landed as today, because a hand accepted the offer');
    assert.equal(four.notes.length,0,'a row with no comment gets no note');
    assert.equal(await TeacherCandidate.findOne({importBatch:commit.batch,name:''}).lean(),null,'the phone-only row was not written under a blank name');

    const again=await commitCvImport({sheets,decisions,fileLabel:'Teacher-CV-FAKE-SAMPLE.xlsx',hash:'fake-hash-cv-1',actorId,actorName:'FAKE CV Keeper',now:NOW});
    assert.equal(again.ok,false);
    assert.equal(again.code,'IMPORT_NOTHING','the same sheet a second time writes nothing: every row is already on file');
    const history=await cvImportHistory(20);
    assert.equal(history.length,1,'only the batch that wrote something is in the register');
    assert.equal(history[0].created,8);
    assert.equal(history[0].canUndo,true);
    assert.equal(history[0].undoneAt,null);
    const index=await loadCvIndex(previewCvImport(sheets,decisions,{fileLabel:'x',hash:'fake-hash-cv-1',now:NOW}).rows,'fake-hash-cv-1');
    assert.equal(index.hashSeen,true,'a file whose bytes already stand is recognized before anybody presses save');

    assert.equal((await undoCvImport(commit.batch,actorId,'no',NOW)).code,'UNDO_REASON','a reason too short to read is refused');
    assert.equal((await undoCvImport('CIM-19700101-ffffff',actorId,'a reason long enough',NOW)).code,'BATCH_NOT_FOUND','and so is a batch that is not there');

    // One of the batch's CVs has been hired since: the undo stops at it rather than hiding a hiring.
    const hiredFromBatch=String(commit.ids[0]);
    assert.equal((await hireCandidate(hiredFromBatch,actorId,NOW)).ok,true);
    const undo=await undoCvImport(commit.batch,actorId,'FAKE reason: the sheet was the wrong year',NOW);
    assert.equal(undo.ok,true);
    assert.equal(undo.kept,1,'the hired CV stayed');
    assert.equal(undo.binned,7,'the other seven were binned through the same path a hand delete uses');
    assert.equal(undo.restored,0,'nothing had been filled, so nothing had to be restored');
    assert.notEqual(await TeacherCandidate.findById(hiredFromBatch).lean(),null,'the hired CV is still live, with its profile');
    assert.equal(await TeacherCandidate.countDocuments({importBatch:commit.batch}),1,'and the other seven are invisible to every ordinary query');
    assert.equal((await undoCvImport(commit.batch,actorId,'FAKE reason again',NOW)).code,'ALREADY_UNDONE','a second undo of the same batch is refused');
    const afterUndo=await cvImportHistory(20);
    assert.equal(afterUndo[0].canUndo,false,'the register shows it undone');
    assert.equal(afterUndo[0].undoReason,'FAKE reason: the sheet was the wrong year','with the reason the owner gave');

    const csvSheets=await readCvWorkbook('Teacher-CV-FAKE-SAMPLE.csv',readFileSync(CSV));
    const skippedDecisions=emptyCvDecisions();
    const skippedLook=previewCvImport(csvSheets,skippedDecisions,{fileLabel:'Teacher-CV-FAKE-SAMPLE.csv',hash:'fake-hash-cv-2',now:NOW});
    for(const row of skippedLook.rows)skippedDecisions.skip[row.key]=true;
    const skippedAll=await commitCvImport({sheets:csvSheets,decisions:skippedDecisions,fileLabel:'Teacher-CV-FAKE-SAMPLE.csv',hash:'fake-hash-cv-2',actorId,actorName:'FAKE CV Keeper',now:NOW});
    assert.equal(skippedAll.ok,false);
    assert.equal(skippedAll.code,'IMPORT_NOTHING','a sheet the owner skipped row by row writes nothing either');

    // ── 11. The bin, the purge, and a number that is never handed out twice ──────────────────────
    assert.equal((await softDelete('teacherCandidate',filtered.id,actorId,NOW)).status,'ok');
    assert.ok((await binList('teacherCandidate',50)).some(entry=>entry.id===filtered.id),'the bin lists what was binned');
    assert.equal((await binList('teacherCandidate',50)).find(entry=>entry.id===filtered.id).name,'FAKE Candidate Three','by the name an operator would recognize');
    assert.equal((await purgeOne('teacherCandidate',filtered.id,actorId)).status,'ok','and purge destroys it');
    assert.equal(await TeacherCandidate.findById(filtered.id).setOptions({recycleAny:true}).lean(),null,'the document is gone, not hidden');
    const nextAfterPurge=await nextCandidateId(NOW);
    assert.notEqual(nextAfterPurge,'CV-2026-0003','the purged number is never offered to somebody else');
    const afterPurge=await createCandidate({name:'FAKE Candidate After Purge',phones:['01511000555']},actorId,NOW);
    assert.equal(afterPurge.candidateId,nextAfterPurge);

    // ── 12. No number reaches a log or an audit row ──────────────────────────────────────────────
    const audits=await AdminAudit.find({}).sort({createdAt:-1}).limit(30).lean();
    assert.ok(audits.length>0,'the writes were audited');
    assert.ok(audits.some(row=>row.action==='teacher-cv.import'),'including the import, by its batch id and not by its rows');
    noNumber(audits,'the audit trail');
    noNumber(await TeacherImportBatch.find({}).lean(),'the import register');

    console.log('The teacher CV bank against the disposable database: quick-added CVs read CV-2026-0001 to CV-2026-0004 with a binned CV keeping its number, a new year starting at one and a purged number never offered again; a nameless CV, a bad email and an over-long name refused, invented subjects, classes, shifts and sources filtered rather than stored, a new CV unrated, and the unique id index as backstop; a shared number and a shared email both asking the duplicate question and naming the CV by readable id and mask, the second write going through only on a hand’s “these are two people”; masks on every list row, drawer and need match with tel: and wa.me the only destinations a number reaches; a filter narrowing on stored vocabulary and the twelve-month review being one filter that counted one CV, then none once it was hired, with every document still stored because a reminder deletes nothing; a hire writing one unpublished Teacher profile carrying the candidate’s own name in both languages, linking back, moving the status and filing a note in one transaction, refusing a second hire and refusing to bin the hired CV; notes naming their author with an invented outcome stored as none, an interview moving the status and a clearing leaving it alone; a chemistry, classes 9-10, evening need matching exactly the one CV that fits and an empty need refused; candidates entering the SMS pipeline as active non-students with the fee templates refused; the fixture committing eight of ten rows with two blocked, an accepted year landing as 2024-12-15, an empty date as today, Bangla digits normalized, the sheet’s comments as first notes including the Bangla one word for word and its unparsed words as tags, the same sheet a second time writing nothing, and the undo binning seven while keeping the one hired since — a short reason, a missing batch and a second undo all refused; and no whole number anywhere in a list, a drawer, a match, an audit row or the import register.');
  }finally{
    await mongoose.disconnect();
    await mongo.stop();
  }
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
