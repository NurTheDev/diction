/**
 * S2 · the class record and a removal's own end, against a disposable database.
 *
 * The rules are proved without a database in tests/class-workflow-core.test.ts, and the screens that ask
 * them are proved in a browser in tests/class-workflow-browser.integration.ts. What only a database can
 * settle is the half that lives underneath both:
 *
 *   · F-09 the name rule is an INDEX, and an index is not a schema. Two classes the centre is running may
 *     not wear one name in one session and shift; a class that has been archived, or filed in the
 *     Recycle Bin, gives that name back — and a database written before the change still carries the
 *     wider rule under the same index name, which is why the nightly job's `syncIndexes()` is part of the
 *     proof rather than a comment about it;
 *   · F-16 a class that costs nothing and a class nobody has priced both store zero, so the record has to
 *     hold the sentence behind it and read it back;
 *   · F-10 a removal is dropped when its own window closes and not before, a removal with no window is
 *     never dropped by a guess, the money the student paid outlives them, and the deletion leaves an
 *     activity row naming the administrator who removed them.
 *
 * Synthetic records only, written with names and ids of their own and deleted by the same query, so a run
 * beside the app's own seeded centre changes nothing it did not create.
 *
 * Run: npm run test:s2:db
 */
import assert from 'node:assert/strict';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {CenterActivityLog,CenterClassGroup,CenterPayment,CenterSettings,CenterStudent} from '../src/models/CenterRecords';
import {syncClassIndexes} from '../src/lib/admin/cron';
import {purgeRemovedStudents,removalWindow,studentPurgeAt} from '../src/lib/center/student-purge';
import {dhakaCalendar} from '../src/lib/center/month-status';

const DAY=86400000;
const today=dhakaCalendar(new Date());
const NAME='S2DB নবম শ্রেণি',NAME_EN='S2DB Class Nine',SHIFT='সকাল';
const START={year:today.year,month:1};

type Stored={_id:mongoose.Types.ObjectId;name:{bn:string;en?:string};shift:string;shifts:string[];level:string;
  room:string;academicYear:number;active:boolean;monthlyFee:number;feeFree:boolean;teachers:mongoose.Types.ObjectId[];
  deletedAt:Date|null};
const read=(id:unknown):Promise<Stored|null>=>CenterClassGroup.findOne({_id:id}).lean<Stored|null>();
/* The Recycle Bin's own filter is a query hook: a `deleteMany` that does not mention `deletedAt` leaves a
   binned row exactly where it was. This suite bins one of its own fixtures on purpose, so its cleanups go
   straight to the collection — a leftover from an aborted run would otherwise be a duplicate that has
   nothing to do with the rule being proved. */
const wipeClasses=():Promise<unknown>=>CenterClassGroup.collection.deleteMany({'name.bn':/^S2DB/});

/** The error a duplicate write answers with, or null when the write landed. */
async function duplicateOf(write:()=>Promise<unknown>):Promise<number|null>{
  try{await write();return null}catch(error){return (error as {code?:number}).code??-1}
}

async function run(){
  await preflight({mongo:true,test:'tests/class-workflow-db.integration.ts — needs a MongoDB (or TEST_MONGO_URI from npm run test-mode)'});
  const shared=process.env.TEST_ORIGIN?process.env.TEST_MONGO_URI:null;
  const mongo=shared?{getUri:()=>shared as string,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  try{
    await CenterStudent.deleteMany({studentId:/^S2DB-/});
    await wipeClasses();
    await CenterPayment.deleteMany({groupId:'s2db'});
    await CenterActivityLog.deleteMany({action:'student.purge'});
    const stamp=Date.now();
    const actor=await User.create({name:'S2DB actor',passwordHash:'x',role:'admin',email:`s2db-${stamp}@example.test`});
    /* The indexes are the subject of one section below, so they are built here rather than left to
       whichever query happens to arrive first. */
    await CenterClassGroup.init();
    await CenterClassGroup.syncIndexes();

    /* ── 1. F-16 · the record holds the sentence behind a zero ───────────────────────────────────── */
    const free=await CenterClassGroup.create({name:{bn:`${NAME} ফ্রি`,en:`${NAME_EN} free`},academicYear:today.year,
      shift:SHIFT,shifts:['morning'],active:true,monthlyFee:0,feeFree:true});
    const unset=await CenterClassGroup.create({name:{bn:`${NAME} অমীমাংসিত`,en:`${NAME_EN} unset`},academicYear:today.year,
      shift:SHIFT,shifts:['morning'],active:true,monthlyFee:0});
    const priced=await CenterClassGroup.create({name:{bn:`${NAME} দামি`,en:`${NAME_EN} priced`},academicYear:today.year,
      shift:SHIFT,shifts:['morning'],active:true,monthlyFee:1200});
    assert.equal((await read(free._id))!.feeFree,true,
      'a class the centre runs for free says so on the record, rather than leaving a zero to mean two things');
    assert.equal((await read(unset._id))!.feeFree,false,
      'and a class nobody has priced stores no such claim — the same zero, the other meaning');
    assert.equal((await read(priced._id))!.feeFree,false,'a priced class is neither');
    assert.equal((await read(priced._id))!.monthlyFee,1200,'and keeps the number it was given');

    /* ── 2. F-09 · the name rule binds the classes the centre is running ─────────────────────────── */
    const first=await CenterClassGroup.create({name:{bn:NAME,en:NAME_EN},academicYear:today.year,shift:SHIFT,
      shifts:['morning'],active:true,monthlyFee:1200});
    assert.equal(await duplicateOf(()=>CenterClassGroup.create({name:{bn:NAME,en:'Another'},academicYear:today.year,
      shift:SHIFT,shifts:['morning'],active:true})),11000,
      'two classes the centre is running may not wear one name in one session and shift');
    assert.equal(await duplicateOf(()=>CenterClassGroup.create({name:{bn:NAME,en:'Another'},academicYear:today.year+1,
      shift:SHIFT,active:true})),null,
      'a new session is a new class, and always was');

    await CenterClassGroup.updateOne({_id:first._id},{$set:{active:false}});
    assert.equal(await duplicateOf(()=>CenterClassGroup.create({name:{bn:NAME,en:'This year'},academicYear:today.year,
      shift:SHIFT,shifts:['morning'],active:true})),null,
      'an archived class gives its name back: closing last year\u2019s class is not a reason this year\u2019s '
      +'cannot be opened, which is what the wider index said');

    const binned=await CenterClassGroup.create({name:{bn:`${NAME} বিন`,en:`${NAME_EN} binned`},academicYear:today.year,
      shift:'দুপুর',shifts:['day'],active:true});
    await CenterClassGroup.updateOne({_id:binned._id},{$set:{deletedAt:new Date(),purgeAt:new Date(Date.now()+30*DAY)}});
    assert.equal(await duplicateOf(()=>CenterClassGroup.create({name:{bn:`${NAME} বিন`,en:`${NAME_EN} again`},
      academicYear:today.year,shift:'দুপুর',shifts:['day'],active:true})),null,
      'and so does a class filed in the Recycle Bin, because a record of last year is not a class anybody '
      +'can enrol into');

    /* ── 3. F-09 · an index is not a schema, so the nightly job brings one in line ────────────────── */
    /* The wide index below is unique over EVERY class, and section 2 has just proved that an archived
       class and a binned one both give their name back — so it would be refused by the very rows that
       demonstrate the rule. They are cleared first: what this section is about is the index, not the rows. */
    await wipeClasses();
    await CenterClassGroup.collection.dropIndexes();
    await CenterClassGroup.collection.createIndex({'name.bn':1,academicYear:1,shift:1},{unique:true});
    const legacy=await CenterClassGroup.create({name:{bn:`${NAME} পুরোনো`,en:`${NAME_EN} legacy`},
      academicYear:today.year,shift:'সন্ধ্যা',shifts:['evening'],active:true});
    await CenterClassGroup.updateOne({_id:legacy._id},{$set:{active:false}});
    assert.equal(await duplicateOf(()=>CenterClassGroup.create({name:{bn:`${NAME} পুরোনো`,en:'Again'},
      academicYear:today.year,shift:'সন্ধ্যা',active:true})),11000,
      'a database written before the change still refuses it: the wider index is still in force under the '
      +'very same name, and the fix would be true in the source and false where it runs');
    const dropped=await syncClassIndexes();
    assert.ok(dropped.dropped.length>=1,
      `the nightly job drops the index the schema no longer declares (${dropped.dropped.join(', ')})`);
    const unique=(await CenterClassGroup.collection.indexes())
      .find(index=>index.unique&&index.key?.['name.bn']===1&&index.key?.academicYear===1&&index.key?.shift===1);
    assert.deepEqual(unique?.partialFilterExpression,{deletedAt:null,active:true},
      'and creates the rule the schema declares in its place, filtered to the classes that are live and running');
    assert.equal(await duplicateOf(()=>CenterClassGroup.create({name:{bn:`${NAME} পুরোনো`,en:'This year'},
      academicYear:today.year,shift:'সন্ধ্যা',shifts:['evening'],active:true})),null,
      'so the archived class gives its name back on the database the centre is actually running');

    /* ── 4. F-10 · the window a removal is kept for is the centre's own ──────────────────────────── */
    /* The centre's settings are one document the whole app shares, so this section reads what it is
       about to change and puts it back: a suite that proves a window by leaving one behind is a suite
       that decides the next one's arithmetic. */
    const settingsBefore=await CenterSettings.findOne({key:'main'}).select('purgeRetentionDays')
      .lean<{purgeRetentionDays?:number}|null>();
    await CenterSettings.updateOne({key:'main'},{$set:{key:'main',purgeRetentionDays:45}},{upsert:true});
    const window=await removalWindow();
    const now=new Date();
    assert.equal(studentPurgeAt(now,window).getTime(),now.getTime()+45*DAY,
      'a removal made today is kept for the forty-five days the centre has chosen');
    await CenterSettings.updateOne({key:'main'},{$unset:{purgeRetentionDays:''}});
    assert.equal(studentPurgeAt(now,await removalWindow()).getTime(),now.getTime()+30*DAY,
      'and for thirty when it has chosen none');
    if(settingsBefore&&Number.isSafeInteger(Number(settingsBefore.purgeRetentionDays)))
      await CenterSettings.updateOne({key:'main'},{$set:{purgeRetentionDays:settingsBefore.purgeRetentionDays}});
    else if(settingsBefore)await CenterSettings.updateOne({key:'main'},{$unset:{purgeRetentionDays:''}});
    else await CenterSettings.deleteOne({key:'main'});

    /* ── 5. F-10 · and the nightly job drops what the window has closed on ───────────────────────── */
    const feeHistory=[{effectiveFrom:START,amount:900}];
    const due=await CenterStudent.create({studentId:'S2DB-DUE',name:{bn:'S2DB মেয়াদ শেষ'},classGroup:first._id,
      startMonth:START,guardianPhone:'01711000301',feeHistory,status:'removed',
      removal:{removedAt:new Date(now.getTime()-40*DAY),removedBy:actor._id,reason:'S2DB পরীক্ষা',
        leaveDate:`${today.year}-01`,purgeAt:new Date(now.getTime()-10*DAY)}});
    await CenterPayment.create({student:due._id,classGroupAtPayment:first._id,type:'monthly',academicYear:START.year,
      month:START.month,amount:900,receiptNo:'S2DB-1',receiptKey:'s2db-1',paidOn:`${today.year}-01-05`,
      receivedBy:actor._id,groupId:'s2db',status:'valid'});
    /* A removal nobody attributed: the record still goes, but there is no name to write it in. */
    const orphan=await CenterStudent.create({studentId:'S2DB-ORPHAN',name:{bn:'S2DB বেওয়ারিশ'},classGroup:first._id,
      startMonth:START,guardianPhone:'01711000304',feeHistory,status:'removed',
      removal:{removedAt:new Date(now.getTime()-400*DAY),reason:'S2DB পুরোনো',leaveDate:`${today.year-1}-01`,
        purgeAt:new Date(now.getTime()-300*DAY)}});
    const future=await CenterStudent.create({studentId:'S2DB-FUTURE',name:{bn:'S2DB ভবিষ্যৎ'},classGroup:first._id,
      startMonth:START,guardianPhone:'01711000302',feeHistory,status:'removed',
      removal:{removedAt:now,removedBy:actor._id,reason:'S2DB পরীক্ষা',leaveDate:`${today.year}-01`,
        purgeAt:new Date(now.getTime()+29*DAY)}});
    const windowless=await CenterStudent.create({studentId:'S2DB-NOWINDOW',name:{bn:'S2DB জানালাহীন'},classGroup:first._id,
      startMonth:START,guardianPhone:'01711000305',feeHistory,status:'removed',
      removal:{removedAt:new Date(now.getTime()-900*DAY),removedBy:actor._id,reason:'S2DB পুরোনো',
        leaveDate:`${today.year-2}-01`}});
    const running=await CenterStudent.create({studentId:'S2DB-RUNNING',name:{bn:'S2DB চলমান'},classGroup:first._id,
      startMonth:START,guardianPhone:'01711000303',feeHistory,status:'active'});

    const report=await purgeRemovedStudents(now);
    assert.equal(report.purged,2,'the two removals whose window had closed are gone');
    assert.equal(report.logged,1,'and one of them left an activity row, because only one had a name to write it in');
    assert.equal(report.failed,0,'with nothing the job could not do');
    assert.equal(await CenterStudent.countDocuments({studentId:'S2DB-DUE'}),0,
      'a removal past its own date is dropped');
    assert.equal(await CenterStudent.countDocuments({studentId:'S2DB-ORPHAN'}),0,
      'including one nobody attributed, which is still a record the centre agreed to stop keeping');
    assert.equal(await CenterStudent.countDocuments({studentId:'S2DB-FUTURE'}),1,
      'a removal inside its window is not touched: the window is a promise, not a suggestion');
    assert.equal(await CenterStudent.countDocuments({studentId:'S2DB-NOWINDOW'}),1,
      'and a removal written before this slice has no window anybody agreed to, so a guess does not drop it');
    assert.equal(await CenterStudent.countDocuments({studentId:'S2DB-RUNNING'}),1,
      'a student the centre is running is not a removal at all');
    const row=await CenterActivityLog.findOne({action:'student.purge',target:due._id})
      .lean<{actor:mongoose.Types.ObjectId;before:{studentId:string;leaveDate:string;purgeAt:string}}|null>();
    assert.ok(row,'the drop leaves an audit row of its own');
    assert.equal(String(row!.actor),String(actor._id),
      'in the name of the administrator who removed the student: an unattended deletion nobody can answer '
      +'for is a deletion nobody can audit');
    assert.equal(row!.before.studentId,'S2DB-DUE','naming the record that went');
    assert.equal(row!.before.leaveDate,`${today.year}-01`,'the month it left in');
    assert.equal(await CenterPayment.countDocuments({student:due._id}),1,
      'and the money outlives the student: a cashbook that loses a line when a child leaves is a cashbook '
      +'nobody can audit');
    assert.equal(await CenterActivityLog.countDocuments({action:'student.purge',target:orphan._id}),0,
      'a record with no name behind it is dropped without inventing one');

    /* ── 6. the class record keeps every field the one editor writes ─────────────────────────────── */
    const teacher=await User.create({name:'S2DB শিক্ষক',passwordHash:'x',role:'teacher',
      email:`s2db-teacher-${stamp}@example.test`,active:true});
    const whole=await CenterClassGroup.create({name:{bn:`${NAME} পূর্ণ`,en:`${NAME_EN} whole`},level:'নবম শ্রেণি',
      shift:SHIFT,shifts:['morning','evening'],room:'Room-1201',academicYear:today.year,active:true,
      monthlyFee:1200,feeFree:false,teachers:[teacher._id]});
    const stored=await read(whole._id);
    assert.equal(stored!.level,'নবম শ্রেণি','the level a class teaches is stored on it');
    assert.equal(stored!.room,'Room-1201','the room it sits in');
    assert.deepEqual(stored!.shifts,['morning','evening'],'the shifts it runs, as canonical keys');
    assert.equal(stored!.shift,SHIFT,'and the word a routine reads beside them');
    assert.deepEqual(stored!.teachers.map(String),[String(teacher._id)],
      'the teachers who take it — which is what decides whose marks grid opens');

    await CenterStudent.deleteMany({studentId:/^S2DB-/});
    await wipeClasses();
    await CenterPayment.deleteMany({groupId:'s2db'});
    await CenterActivityLog.deleteMany({action:'student.purge'});
    await User.deleteMany({email:new RegExp(`^s2db-.*-${stamp}@example\\.test$`)});

    console.log('Class record: a name is unique only among the classes the centre is running, so an archived '
      +'or binned class gives it back — and a database written before that rule is brought in line by the '
      +'nightly sync rather than left enforcing the old one; a class stores the sentence behind a zero, so free '
      +'is not "not decided yet"; a removal is dropped when its own window closes and never before, a removal '
      +'with no window is left alone, the money outlives the student, and the drop names whoever removed them.');
  }finally{
    await mongoose.disconnect();
    await mongo.stop();
  }
}
run().catch(error=>{console.error(error);process.exit(1)});
