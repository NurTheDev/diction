// @ts-nocheck -- Recycle Bin engine against a disposable database; synthetic records only.
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {Editorial} from '../src/models/Editorial';
import {CenterClassGroup,CenterStudent,CenterExam,CenterExamResult,CenterSmsLog} from '../src/models/CenterRecords';
import {GET as dailyJob} from '../src/app/api/admin/jobs/daily/route';
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
    assert.equal(await Editorial.countDocuments({_id:post._id,...binFilter}),1,'still in the bin, waiting out its 30 days');
    assert.equal(await Editorial.countDocuments({_id:post._id}),0,'and already invisible to ordinary queries while it waits');
    const late=await purgeExpired(new Date(Date.now()+31*86400000));
    assert.equal(late.find(r=>r.kind==='editorial').purged,1);
    assert.equal(await Editorial.countDocuments({_id:post._id,...binFilter}),0,'purge is the only hard delete, and it is the job that does it');

    // 5. An exam with saved results is reference-blocked too.
    const exam=await CenterExam.create({name:{bn:'নমুনা পরীক্ষা'},type:'monthly',date:'2026-01-02',classGroups:[group._id],subjects:[{name:{bn:'বাংলা'},fullMarks:100,passMarks:33}],gradeBands:[{min:0,label:'F'},{min:80,label:'A+'}],status:'draft'});
    await CenterExamResult.create({exam:exam._id,student:(await CenterStudent.findOne({studentId:'SYNTH-R1'}).lean())._id,classGroup:group._id,marks:[{subject:exam.subjects[0]._id,obtained:80,absent:false}],total:80,fullTotal:100,percentage:80,grade:'A+',recordedBy:actor._id});
    const examBlocked=await softDelete('centerExam',String(exam._id),actorId);
    assert.equal(examBlocked.status,'blocked');
    assert.equal(examBlocked.messageBn,'১ জন শিক্ষার্থীর ফল এই পরীক্ষায় সংরক্ষিত — মুছে ফেলা যাবে না। আর্কাইভ করুন।');

    // 6. Every successful move wrote its audit row; bin queries never see live rows.
    for(const action of ['recycle.delete:classGroup','recycle.restore:classGroup','recycle.delete:editorial']){
      assert.equal(await AdminAudit.countDocuments({action}),1,`audit row for ${action}`);
    }
    assert.equal(await Editorial.countDocuments(binFilter),0);

    // 7. Every query shape hides the bin: aggregate, distinct, bulkWrite and populate. Kept after
    //    the audit-count section so its extra rows do not change those counts.
    const group3=await CenterClassGroup.create({name:{bn:'তৃতীয় ক্লাস'},academicYear:2027});
    const examShape={type:'monthly',subjects:[{name:{bn:'গণিত'},fullMarks:50,passMarks:20}],gradeBands:[{min:0,label:'F'}],status:'draft'};
    const exam3=await CenterExam.create({...examShape,name:{bn:'populate নমুনা'},date:'2026-02-02',classGroups:[group3._id]});
    const livePopulated=await CenterExam.findById(exam3._id).populate('classGroups').lean();
    assert.equal((livePopulated!.classGroups as unknown[]).length,1,'populate of a live reference still works');
    assert.equal((await softDelete('classGroup',String(group3._id),actorId)).status,'blocked','a live exam still uses the class, so it cannot be binned');

    const group4=await CenterClassGroup.create({name:{bn:'চতুর্থ ক্লাস'},academicYear:2027});
    assert.equal((await softDelete('classGroup',String(group4._id),actorId)).status,'ok');
    const exam4=await CenterExam.create({...examShape,name:{bn:'binned populate নমুনা'},date:'2026-03-03',classGroups:[group4._id]});
    const populated=await CenterExam.findById(exam4._id).populate('classGroups').lean();
    assert.deepEqual(populated!.classGroups as unknown[],[],'populate of a binned reference returns nothing');
    assert.deepEqual(await CenterClassGroup.aggregate([{$match:{_id:group4._id}},{$count:'n'}]),[],'aggregate skips binned rows');
    const withBin=await CenterClassGroup.aggregate([{$match:{_id:group4._id}},{$count:'n'}],{recycleAny:true} as never);
    assert.equal(withBin[0]?.n,1,'aggregate opts out only when asked');
    assert.deepEqual(await CenterClassGroup.distinct('academicYear',{_id:group4._id}),[],'distinct skips binned rows');
    const bulk=await CenterClassGroup.bulkWrite([{updateOne:{filter:{_id:group4._id},update:{$set:{order:9}}}}]);
    assert.equal(bulk.modifiedCount,0,'bulkWrite filters are rewritten too');

    // 8. The daily job (§E5) end to end: refused without the bearer secret, and when it runs it
    //    purges only expired rows and trims logs past the retention window.
    const jobSecret='j'.repeat(40);
    process.env.CRON_SECRET=jobSecret;
    const jobUrl='http://localhost:3111/api/admin/jobs/daily';
    const expired=await Editorial.create({kind:'blog',slug:'recycle-expired',title:{bn:'মেয়াদ শেষ নমুনা',en:'Expired sample'},body:{bn:'লেখা',en:'text'},published:true});
    assert.equal((await softDelete('editorial',String(expired._id),actorId)).status,'ok');
    const thirteenMonths=new Date(Date.now()-13*30*24*60*60*1000),lastWeek=new Date(Date.now()-7*24*60*60*1000);
    await Editorial.updateOne({_id:expired._id,...binFilter},{$set:{purgeAt:new Date(Date.now()-60_000),deletedAt:thirteenMonths}});
    // Written straight into the collection: the log schema requires a batch and a student, and the
    // trim only cares about createdAt.
    await mongoose.connection.db.collection('centersmslogs').insertMany([
      {phone:'01711111111',message:'synthetic old',segments:1,status:'sent',createdAt:thirteenMonths},
      {phone:'01722222222',message:'synthetic recent',segments:1,status:'sent',createdAt:lastWeek},
    ]);
    const fresh=await Editorial.create({kind:'blog',slug:'recycle-fresh',title:{bn:'তাজা নমুনা',en:'Fresh sample'},body:{bn:'লেখা',en:'text'},published:true});
    assert.equal((await softDelete('editorial',String(fresh._id),actorId)).status,'ok');

    const refused=await dailyJob(new Request(jobUrl));
    assert.equal(refused.status,401,'the job refuses an unauthenticated call');
    assert.equal(await Editorial.countDocuments({_id:expired._id,...binFilter}),1,'a refused job purges nothing');

    const ran=await dailyJob(new Request(jobUrl,{headers:{authorization:`Bearer ${jobSecret}`}}));
    assert.equal(ran.status,200,await ran.clone().text());
    const report=await ran.json() as {ok:boolean;purged:number;trim:{smsLog:number;activityLog:number}};
    assert.equal(report.ok,true);
    assert.equal(report.purged,1,'only the expired row was purged');
    assert.deepEqual(report.trim,{smsLog:1,activityLog:0},'only the 13-month-old SMS log was trimmed');
    assert.equal(await Editorial.countDocuments({_id:expired._id,...binFilter}),0,'the expired row is gone');
    assert.equal(await mongoose.connection.db!.collection('editorials').countDocuments({_id:expired._id}),0,'gone from storage, not just from queries');
    assert.equal(await Editorial.countDocuments({_id:fresh._id,...binFilter}),1,'a row still inside its 30 days survives');
    assert.equal(await CenterSmsLog.countDocuments({}),1,'the recent SMS log survives');
    console.log('Recycle Bin engine: reference-blocked delete with exact counts, 30-day bin, restore, purge, audit rows, every query shape hidden, and the daily job (401 without the secret; purges only expired rows and trims old logs) passed.');
  }finally{
    await mongoose.disconnect();
    await mongo.stop();
  }
}
run().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
