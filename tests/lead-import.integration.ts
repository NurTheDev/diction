// @ts-nocheck -- R3.15: the visitor import commit, against the disposable database.
/**
 * R3.15 · The Visitor import write half, against the disposable database.
 *
 * The dry run is proved without a database in `lead-import.test.ts`; this suite proves the four
 * promises that need the collection:
 *
 *   • the commit writes exactly the rows the preview showed ready — the Bangla comment becomes the
 *     lead's FIRST note, the two rows that share a number land in one `familyKey`, every doubt is
 *     stored as a flag pair, and the batch id ties them together;
 *   • the same file a second time writes NOTHING: every row matches its lead by number (or by name
 *     and day where the sheet had no number), and the commit refuses with `IMPORT_NOTHING` rather
 *     than doubling the list — that is the idempotent re-import;
 *   • undo bins what the batch created through the same Recycle Bin path a hand delete uses, and
 *     leaves the register showing the batch undone with its reason;
 *   • a second undo of the same batch, and an undo of a batch that is not the latest, are refused.
 *
 * The fixture is the labelled fake one; no real visitor or student data exists in this repository.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {Lead} from '../src/models/Lead';
import {LeadImportBatch} from '../src/models/LeadImportBatch';
import {readLeadWorkbook,emptyLeadDecisions} from '../src/lib/leads/import-preview';
import {commitLeadImport,leadImportHistory,undoLeadImport} from '../src/lib/leads/import-commit';

const FIXTURE=path.join('tests','fixtures','Visitor-Import-FAKE-SAMPLE.xlsx');
const NOW=new Date(Date.UTC(2026,0,10,6,0,0)); // Dhaka sees 2026-01-10

async function run(){
  await preflight({mongo:true,test:'tests/lead-import.integration.ts — run it with TEST_MONGO_URI, or let it raise its own disposable replica set'});
  const shared=process.env.TEST_MONGO_URI||null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){for(const c of await mongoose.connection.db.listCollections().toArray()){await mongoose.connection.db.collection(c.name).deleteMany({}).catch(()=>{})}}
  const pass='fake-visitor-import-actor',hash=await bcrypt.hash(pass,12);
  const actor=await User.create({name:'FAKE Importer',email:'fake-importer@example.test',passwordHash:hash,role:'admin',active:true});
  const actorId=String(actor._id);
  try{
    const sheets=await readLeadWorkbook('Visitor-Import-FAKE-SAMPLE.xlsx',readFileSync(FIXTURE));
    const fileHash='fake-hash-1';
    const decisions={...emptyLeadDecisions(),accept:{}};
    // the two doubtful dates need a hand before anything can be written
    const first=await commitLeadImport({sheets,decisions,fileLabel:'Visitor-Import-FAKE-SAMPLE.xlsx',hash:fileHash,actorId,actorName:'FAKE Importer',now:NOW});
    assert.equal(first.ok,false);
    assert.equal(first.code,'IMPORT_UNDECIDED');
    const previewish=(await import('../src/lib/leads/import-preview')).previewLeadImport;
    const look=previewish(sheets,decisions,{now:NOW});
    for(const row of look.rows)if(row.status==='decide')decisions.accept[row.key]='accept';

    // ── the commit writes exactly what the preview showed ready ──────────────────────────────────
    const commit=await commitLeadImport({sheets,decisions,fileLabel:'Visitor-Import-FAKE-SAMPLE.xlsx',hash:fileHash,actorId,actorName:'FAKE Importer',now:NOW});
    assert.equal(commit.ok,true);
    assert.equal(commit.created,8);
    assert.equal(commit.blocked,1);
    assert.equal(commit.matched,0);
    assert.equal(commit.siblings,2);
    const leads=await Lead.find({importBatch:commit.batch}).setOptions({recycleAny:true}).lean();
    assert.equal(leads.length,8);
    const one=leads.find(doc=>doc.studentName==='FAKE Visitor One');
    assert.equal(one.notes.length,1); // the Bangla comment is the FIRST note
    assert.equal(one.notes[0].text,'ভর্তি বিষয়ে জানতে চেয়েছিলেন');
    assert.equal(String(one.notes[0].by),actorId);
    const six=leads.find(doc=>doc.studentName==='FAKE Visitor Six');
    assert.ok(one.familyKey&&six.familyKey&&one.familyKey===six.familyKey); // siblings, one family
    const three=leads.find(doc=>doc.studentName==='FAKE Visitor Three');
    assert.equal(three.date,'2025-11-20'); // the accepted suggestion, not the slipped year
    const four=leads.find(doc=>doc.studentName==='FAKE Visitor Four');
    assert.equal(four.date,'2026-01-10'); // the accepted "today"
    assert.ok(four.flags.some(flag=>flag.code==='short')); // the doubt is stored, in both languages
    assert.ok(four.flags.some(flag=>flag.messageBn&&flag.messageEn));
    assert.equal(four.importSource,'wizard:Visitor-Import-FAKE-SAMPLE.xlsx');

    // ── the same file again writes nothing ───────────────────────────────────────────────────────
    const again=await commitLeadImport({sheets,decisions,fileLabel:'Visitor-Import-FAKE-SAMPLE.xlsx',hash:fileHash,actorId,actorName:'FAKE Importer',now:NOW});
    assert.equal(again.ok,false);
    assert.equal(again.code,'IMPORT_NOTHING');
    assert.equal(await Lead.countDocuments({importBatch:commit.batch}),8);

    // ── the register, then the undo ──────────────────────────────────────────────────────────────
    const history=await leadImportHistory();
    assert.equal(history.length,1);
    assert.equal(history[0].created,8);
    assert.equal(history[0].undoneAt,null);
    const noReason=await undoLeadImport(commit.batch,actorId,'');
    assert.equal(noReason.ok,false);
    assert.equal(noReason.code,'UNDO_REASON');
    const undo=await undoLeadImport(commit.batch,actorId,'fixture teardown check',NOW);
    assert.equal(undo.ok,true);
    assert.equal(undo.removed,8);
    const binned=await Lead.find({importBatch:commit.batch,deletedAt:{$ne:null}}).setOptions({recycleAny:true}).countDocuments();
    assert.equal(binned,8);
    const after=await leadImportHistory();
    assert.ok(after[0].undoneAt);
    assert.equal(after[0].undoReason,'fixture teardown check');
    const twice=await undoLeadImport(commit.batch,actorId,'again');
    assert.equal(twice.ok,false);
    assert.equal(twice.code,'ALREADY_UNDONE');
    // and after an undo the same file imports again, because its leads are in the bin
    const third=await commitLeadImport({sheets,decisions,fileLabel:'Visitor-Import-FAKE-SAMPLE.xlsx',hash:'fake-hash-2',actorId,actorName:'FAKE Importer',now:NOW});
    assert.equal(third.ok,true);
    assert.equal(third.created,8);
    const stillUndone=await undoLeadImport(commit.batch,actorId,'old batch');
    assert.equal(stillUndone.ok,false);
    assert.equal(stillUndone.code,'ALREADY_UNDONE');
    // NOT_LATEST: an active batch that is not the newest one cannot be undone either
    await LeadImportBatch.create({batch:'LIM-20260111-ffffff',fileLabel:'a newer register row',hash:'fake-hash-9',rows:0,created:0,matched:0,skipped:0,blocked:0,siblings:0,actor:actorId,actorName:'FAKE Importer',at:new Date(NOW.getTime()+3600*1000),undoneAt:null,undoBy:null,undoReason:''});
    const notLatest=await undoLeadImport(third.batch,actorId,'older active batch');
    assert.equal(notLatest.ok,false);
    assert.equal(notLatest.code,'NOT_LATEST');
    await LeadImportBatch.deleteMany({});
    console.log('Visitor import commit: 8 synthetic leads written with the Bangla comment as first note and one familyKey across the sibling rows; the same file again wrote nothing (IMPORT_NOTHING); undo binned all 8 through the Recycle Bin and the register shows the batch undone with its reason.');
  }finally{
    await mongoose.disconnect();
    await mongo.stop();
  }
}
run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
