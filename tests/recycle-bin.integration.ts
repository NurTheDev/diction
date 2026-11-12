// @ts-nocheck -- Recycle Bin engine against a disposable database; synthetic records only.
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {Editorial} from '../src/models/Editorial';
import {CenterClassGroup,CenterStudent,CenterExam,CenterExamResult} from '../src/models/CenterRecords';
import {AdminAudit} from '../src/models/AdminAudit';
import {softDelete,restoreRecord,binList,binCounts,purgeExpired} from '../src/lib/admin/recycle';
import {liveFilter,binFilter} from '../src/models/recycle';

async function run(){
  await preflight({mongo:true,test:'tests/recycle-bin.integration.ts — needs a MongoDB (or TEST_MONGO_URI from npm run test-mode)'});
  const shared=process.env.TEST_MONGO_URI||null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){for(const c of await mongoose.connection.db.listCollections().toArray()){await mongoose.connection.db.collection(c.name).deleteMany({}).catch(()=>{})}}
  try{
    const hash=await bcrypt.hash('Recycle-Only-2026!',12);
    const actor=await User.create({name:'Recycle Actor',email:'recycle-actor@example.test',passwordHash:hash,role:'admin',active:true});
    const actorId=String(actor._id);

    // 1. A class with students cannot be deleted: the message carries the real count.
    const group=await CenterClassGroup.create({name:{bn:'নমুনা ক্লাস',en:'Sample'},academicYear:2026});
    await CenterStudent.create([
      {studentId:'SYNTH-R1',name:{bn:'প্রথম'},classGroup:group._id,guardianPhone:'01711111111',startMonth:{year:2026,month:1},feeHistory:[{effectiveFrom:{year:2026,month:1},amount:1000}]},
      {studentId:'SYNTH-R2',name:{bn:'দ্বিতীয়'},classGroup:group._id,guardianPhone:'01722222222',startMonth:{year:2026,month:1},feeHistory:[{effectiveFrom:{year:2026,month:1},amount:1000}]},
    ]);
    const blocked=await softDelete('classGroup',String(group._id),actorId);
    assert.equal(blocked.status,'blocked');
    assert.equal(blocked.messageBn,'২ জন শিক্ষার্থী এই ক্লাস ব্যবহার করে — মুছে ফেলা যাবে না। আর্কাইভ করুন।');
    assert.equal(blocked.messageEn,'2 student(s) use this class — cannot be deleted. Archive it instead.');
    assert.equal(await CenterClassGroup.countDocuments({...liveFilter,_id:group._id}),1,'a blocked delete changes nothing');
    assert.equal(await AdminAudit.countDocuments({action:'recycle.delete:classGroup'}),0,'a blocked delete writes no delete entry');

    // 2. Once the students are gone the class goes to the bin for exactly 30 days.
    await CenterStudent.updateMany({classGroup:group._id},{$set:{status:'removed'}});
    const before=new Date();
    const deleted=await softDelete('classGroup',String(group._id),actorId);
    assert.equal(deleted.status,'ok');
    assert.ok(deleted.purgeAt.getTime()-before.getTime()>=29*86400000&&deleted.purgeAt.getTime()-before.getTime()<=30*86400000+5000);
    const binned=await CenterClassGroup.findOne({_id:group._id,...binFilter}).lean();
    assert.ok(binned.deletedAt instanceof Date&&binned.purgeAt instanceof Date&&String(binned.deletedBy)===actorId);
    assert.equal((await binCounts()).classGroup,1);
    const entries=await binList('classGroup');
    assert.equal(entries.length,1);
    assert.equal(entries[0].name,'নমুনা ক্লাস 2026');

    // 2b. While binned, the record is invisible to ordinary reads and untouchable by
    // ordinary writes — the schema-level invariant every list and public page relies on.
    assert.equal(await CenterClassGroup.countDocuments({}),0,'a binned row leaves every plain query');
    assert.deepEqual(await CenterClassGroup.find({}).lean(),[]);
    assert.equal(await CenterClassGroup.countDocuments(binFilter),1,'the bin query still sees it');
    const untouched=await CenterClassGroup.updateOne({_id:group._id},{$set:{order:7}});
    assert.equal(untouched.matchedCount,0,'an unflagged write cannot touch a binned row');

    // 3. Restore brings it back with no bin fields left behind.
    assert.equal((await restoreRecord('classGroup',String(group._id),actorId)).status,'ok');
    const restored=await CenterClassGroup.findById(group._id).lean();
    assert.equal(restored.deletedAt,null);assert.equal(restored.purgeAt,null);
    assert.equal((await binCounts()).classGroup,0);
    assert.equal((await restoreRecord('classGroup',String(group._id),actorId)).status,'not-in-bin');
    assert.equal(await CenterClassGroup.countDocuments({}),1,'restored rows are visible to plain queries again');

    // 4. Simple content deletes straight to the bin, and purge respects the 30 days.
    const post=await Editorial.create({kind:'blog',slug:'recycle-sample',title:{bn:'নমুনা',en:'Sample'},body:{bn:'লেখা',en:'text'},published:false});
    assert.equal((await softDelete('editorial',String(post._id),actorId)).status,'ok');
    const tooEarly=await purgeExpired(new Date());
    assert.equal(tooEarly.find(r=>r.kind==='editorial').purged,0,'nothing purges before its 30 days are up');
    assert.equal(await Editorial.countDocuments({_id:post._id}),1);
    const late=await purgeExpired(new Date(Date.now()+31*86400000));
    assert.equal(late.find(r=>r.kind==='editorial').purged,1);
    assert.equal(await Editorial.countDocuments({_id:post._id}),0,'purge is the only hard delete, and it is the job that does it');

    // 5. An exam with saved results is reference-blocked too.
    const exam=await CenterExam.create({name:{bn:'নমুনা পরীক্ষা'},type:'monthly',date:'2026-01-02',classGroups:[group._id],subjects:[{name:{bn:'বাংলা'},fullMarks:100,passMarks:33}],gradeBands:[{min:0,label:'F'},{min:80,label:'A+'}],status:'draft'});
    await CenterExamResult.create({exam:exam._id,student:(await CenterStudent.findOne({studentId:'SYNTH-R1'}).lean())._id,classGroup:group._id,marks:[{subject:exam.subjects[0]._id,obtained:80,absent:false}],total:80,fullTotal:100,percentage:80,grade:'A+'});
    const examBlocked=await softDelete('centerExam',String(exam._id),actorId);
    assert.equal(examBlocked.status,'blocked');
    assert.equal(examBlocked.messageBn,'১ জন শিক্ষার্থীর ফল এই পরীক্ষায় সংরক্ষিত — মুছে ফেলা যাবে না। আর্কাইভ করুন।');

    // 6. Every successful move wrote its audit row; bin queries never see live rows.
    for(const action of ['recycle.delete:classGroup','recycle.restore:classGroup','recycle.delete:editorial']){
      assert.equal(await AdminAudit.countDocuments({action}),1,`audit row for ${action}`);
    }
    assert.equal(await Editorial.countDocuments(binFilter),0);
    console.log('Recycle Bin engine: reference-blocked delete with exact counts, 30-day bin, restore, purge and audit rows passed.');
  }finally{
    await mongoose.disconnect();
    await mongo.stop();
  }
}
run().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
