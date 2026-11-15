// @ts-nocheck -- isolated MongoDB suite: one student's results read whole, and who may read them
/**
 * R5 slice 2 · What a result screen is allowed to show, against a real database.
 *
 * The trend's arithmetic is pure and proved in `tests/exam-result-trend.test.ts`; the sentence an SMS
 * carries is pure and proved in `tests/exam-result-message.test.ts`. What only a database can prove is
 * the three things this slice is actually about:
 *
 *  1. **The history is the published ones.** A draft exam has marks that may still move and positions
 *     publishing has not finished ranking, so it never reaches a family — not by a filter applied in
 *     three screens, but by one `status:'published'` in the query that feeds all of them.
 *  2. **Whose.** A portal account reads the children on its own phone number and nobody else's: a
 *     student account matches its own record only, a guardian account matches the children it guards,
 *     and a number that differs in one digit matches nothing — the comparison is exact, never a
 *     pattern, because a loose one is a way to read somebody else's child.
 *  3. **Nothing else.** The payload the portal receives holds marks, totals, grades and positions. It
 *     holds no fee, no payment, no receipt, no due and no phone number, and that is asserted on the
 *     serialized object — on its keys as well as its text — rather than on a screenshot of one screen.
 *
 * It also cross-checks the publish prompt's count against a real send, because a prompt that says 4 and
 * a batch that sends 2 has told the operator a lie with their own software.
 *
 * Run: npm run test:exam:results  (needs the disposable database; CI runs it inside `npm run verify`)
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mongoose from 'mongoose';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {CenterStudent,CenterClassGroup,CenterExam,CenterSettings,CenterSmsBatch,CenterSmsLog} from '../src/models/CenterRecords';
import {createCenterExam,publishCenterExam,saveCenterExamMarks} from '../src/lib/center/exam-batch';
import {DEFAULT_GRADING_RANGES,rangesToBands} from '../src/lib/exams/vocab';
import {studentResultHistory,studentReportCard,portalResultStudents} from '../src/lib/exams/student-results';
import {resultSmsAudience} from '../src/lib/center/exam-result-audience';
import {autoSendClassResults} from '../src/lib/center/sms-dialog';

const bands=rangesToBands(DEFAULT_GRADING_RANGES);
const subjects=[{name:'বাংলা',full:100,pass:33},{name:'গণিত',full:50,pass:20}];
/* 10:00 in Dhaka: outside any quiet window the operator could have set, so what this suite measures is
   what the send does and not what the clock refused. */
const now=new Date('2026-02-02T04:00:00.000Z');

/** Money words a results payload must not be able to carry, in either language. */
const MONEY=/fee|due|paid|payment|receipt|cash|amount|ledger|instal|waiver|discount|বেতন|বকেয়া|রশিদ|ক্যাশ|টাকা/i;
/** Every key in a serialized reader answer, walked, because a field nobody renders is still a field that
    left the server. */
const keysOf=(value:unknown,out:string[]=[]):string[]=>{
  if(Array.isArray(value))for(const entry of value)keysOf(entry,out);
  else if(value&&typeof value==='object')for(const [key,inner] of Object.entries(value as Record<string,unknown>)){out.push(key);keysOf(inner,out)}
  return out;
};

async function run(){
  await preflight({
    mongo:true,browser:false,test:'tests/exam-results.integration.ts — run it with TEST_MONGO_URI (see docs/STALE-TESTS.md)',
  });
  const shared=process.env.TEST_MONGO_URI||null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){
    for(const collection of await mongoose.connection.db.listCollections().toArray())
      await mongoose.connection.db.collection(collection.name).deleteMany({}).catch(()=>{});
  }
  try{
    // ── Two classes, five children, three exams ───────────────────────────────────────────────────────
    const owner=await User.create({name:'Owner',passwordHash:'x',role:'admin'});
    const [classA,classB]=await Promise.all([
      CenterClassGroup.create({name:{bn:'নমুনা নবম ক',en:'Sample Nine A'},academicYear:2026,active:true}),
      CenterClassGroup.create({name:{bn:'নমুনা নবম খ',en:'Sample Nine B'},academicYear:2026,active:true}),
    ]);
    /* S1 and S2 are siblings on one guardian number, which is the case that decides whether a result SMS
       is merged or sent twice, and whether a guardian portal shows one child or two. */
    const student=(id,classGroup,phones,over={})=>CenterStudent.create({
      studentId:id,name:{bn:`নমুনা ছাত্র ${id}`,en:`Sample student ${id}`},classGroup,roll:id.replace(/\D/g,''),
      guardianName:'নমুনা অভিভাবক',admissionDate:'2026-01-01',startMonth:{year:2026,month:1},
      feeHistory:[{effectiveFrom:{year:2026,month:1},amount:1000}],...phones,...over,
    });
    const [s1,s2,s3,s4,s5]=await Promise.all([
      student('RS-1',classA._id,{guardianPhone:'01711000011',studentPhone:'01811000011'}),
      student('RS-2',classA._id,{guardianPhone:'01711000011',studentPhone:'01811000022'}),
      student('RS-3',classB._id,{guardianPhone:'01711000033',studentPhone:'01811000033'}),
      student('RS-4',classA._id,{guardianPhone:'01711000044'},{status:'removed'}),
      student('RS-5',classA._id,{guardianPhone:'01711000055'}),
    ]);

    const request=(name,date,type,classIds)=>({requestId:randomUUID(),classIds,name,date,type,scaleName:'default',subjects,bands});
    const monthly=await createCenterExam(request('নমুনা মাসিক পরীক্ষা','2026-02-01','monthly',[String(classA._id),String(classB._id)]),String(owner._id));
    const model=await createCenterExam(request('নমুনা মডেল টেস্ট','2026-03-01','model_test',[String(classA._id)]),String(owner._id));
    const draft=await createCenterExam(request('নমুনা টার্ম পরীক্ষা','2026-04-01','term',[String(classA._id),String(classB._id)]),String(owner._id));
    const subjectIds=(examId:string)=>CenterExam.findById(examId).lean().then(doc=>doc.subjects.map(s=>String(s._id)));
    const marks=async(examId,studentId,bn,math)=>{
      const ids=await subjectIds(examId);
      await saveCenterExamMarks({examId,studentId,version:-1,marks:[{subject:ids[0],obtained:bn,absent:false},{subject:ids[1],obtained:math,absent:false}]},String(owner._id));
    };
    const absent=async(examId,studentId)=>{
      const ids=await subjectIds(examId);
      await saveCenterExamMarks({examId,studentId,version:-1,marks:ids.map(subject=>({subject,obtained:null,absent:true}))},String(owner._id));
    };
    await marks(monthly.id,String(s1._id),90,45);   // 135/150 = 90%
    await marks(monthly.id,String(s2._id),60,20);   //  80/150 = 53.33%
    await marks(monthly.id,String(s3._id),80,40);   // 120/150 = 80%
    await marks(monthly.id,String(s5._id),70,35);   // 105/150 = 70%
    await marks(model.id,String(s1._id),70,30);     // 100/150 = 66.67%
    await absent(model.id,String(s2._id));
    await marks(draft.id,String(s1._id),95,48);     // marked, but this exam is never published
    await publishCenterExam(monthly.id,String(owner._id));
    await publishCenterExam(model.id,String(owner._id));

    // ── 1. The history: published only, newest first, with its own subject breakdown ──────────────────
    const history=await studentResultHistory(String(s1._id),'bn');
    assert.ok(history,'a student with results has a history');
    assert.equal(history.results.length,2,'the draft exam is not in it: a family reads only what the centre published');
    assert.deepEqual(history.results.map(r=>r.date),['2026-03-01','2026-02-01'],'newest first, so the top row is the one a parent asked about');
    const [latest,first]=history.results;
    assert.equal(latest.name,'নমুনা মডেল টেস্ট');
    assert.deepEqual(latest.subjects.map(s=>[s.name,s.obtained,s.full,s.pass]),[['বাংলা',70,100,33],['গণিত',30,50,20]],
      'each row carries the exam’s own subjects with the marks, the full mark and the pass mark');
    assert.equal(latest.total,100);
    assert.equal(latest.fullTotal,150);
    assert.equal(latest.grade,'A-','100 of 150 is 66.67 percent');
    assert.equal(latest.position,1,'and it is the position publishing wrote for that class');
    assert.equal(latest.className,'নমুনা নবম ক','the class printed is the one the row belongs to');
    assert.equal(first.percentage,90,'90 of 100 … 135 of 150');
    const en=await studentResultHistory(String(s1._id),'en');
    assert.equal(en.name,'Sample student RS-1','an English address reads the English name the operator typed');
    assert.equal(en.className,'Sample Nine A','and the English class');
    assert.equal(en.results[0].name,'নমুনা মডেল টেস্ট',
      'while the exam keeps the Bangla name it was given: an exam is stored with one name, and inventing an English one would be inventing data');

    // Absence is not a score: the row is there, marked absent, holding no position, and out of the line.
    const sibling=await studentResultHistory(String(s2._id),'bn');
    assert.equal(sibling.results.length,2);
    const absentRow=sibling.results.find(r=>r.date==='2026-03-01');
    assert.equal(absentRow.absent,true,'the exam the child missed is in the table');
    assert.equal(absentRow.position,null,'but it holds no position, because a child who sat nothing was never ranked');
    assert.equal(absentRow.total,0);
    assert.deepEqual(absentRow.subjects.map(s=>[s.name,s.obtained,s.absent]),[['বাংলা',null,true],['গণিত',null,true]],
      'and every subject of it reads as absent rather than as zero marks');
    assert.equal(sibling.trend.points.length,1,'so the line is drawn from the one exam they sat');
    assert.equal(sibling.trend.skippedAbsent,1,'with the one that was skipped counted, not swallowed');
    assert.equal(sibling.trend.direction,'none');
    assert.deepEqual(sibling.trend.points.map(p=>p.date),['2026-02-01']);

    // The trend the chart draws is the same series, oldest first, with the step between the last two.
    assert.deepEqual(history.trend.points.map(p=>p.date),['2026-02-01','2026-03-01'],'the line runs oldest to newest');
    assert.equal(history.trend.change,-23.33,'90 percent down to 66.67 is a fall of 23.33 points');
    assert.equal(history.trend.direction,'down','and a fall says it is a fall');
    assert.deepEqual(history.trend.best,{percentage:90,name:'নমুনা মাসিক পরীক্ষা'},'while the best of the series is still named');

    // ── 2. Nothing but marks: the payload is scanned, keys and text ───────────────────────────────────
    for(const [label,payload] of [['history',history],['card',(await studentReportCard(String(s1._id),monthly.id,'bn')).card]]){
      const text=JSON.stringify(payload);
      const moneyKeys=keysOf(payload).filter(key=>MONEY.test(key));
      assert.deepEqual(moneyKeys,[],`the ${label} payload carries a money-shaped key: ${moneyKeys.join(', ')}`);
      assert.equal(MONEY.test(text),false,`the ${label} payload carries a money word somewhere in its text`);
      for(const phone of ['01711000011','01811000011','1711000011'])
        assert.equal(text.includes(phone),false,`the ${label} payload prints a phone number: ${phone}`);
    }

    // ── 3. The report card: two refusals told apart, and the class of the row rather than of today ────
    const card=await studentReportCard(String(s1._id),monthly.id,'bn');
    assert.equal(card.reason,null);
    assert.equal(card.card.result.name,'নমুনা মাসিক পরীক্ষা');
    assert.equal(card.card.student.idLabel,'RS-1','the readable id is on the card, not the ObjectId');
    assert.equal(card.card.student.roll,'1');
    assert.equal(card.card.student.className,'নমুনা নবম ক');
    assert.equal(card.card.result.grade,'A+');
    assert.deepEqual(await studentReportCard(String(s1._id),draft.id,'bn'),{card:null,reason:'NOT_PUBLISHED'},
      'a marked but unpublished exam says the centre is still working on it');
    assert.deepEqual(await studentReportCard(String(s3._id),model.id,'bn'),{card:null,reason:'NO_RESULT'},
      'and a child who was never in that exam says so, instead of sending a parent to ask about a result that cannot exist');
    assert.equal((await studentReportCard(String(s1._id),'not-an-id','bn')).reason,'NO_RESULT');
    /* A promoted child's old report belongs to the class they sat it in: the card reads the result row's
       class, not the student's current one. */
    await CenterStudent.updateOne({_id:s1._id},{$set:{classGroup:classB._id}});
    const promoted=await studentReportCard(String(s1._id),monthly.id,'bn');
    assert.equal(promoted.card.student.className,'নমুনা নবম ক','the report card still names the class the exam was sat in');
    assert.equal((await studentResultHistory(String(s1._id),'bn')).className,'নমুনা নবম খ','while the profile header names the class they are in now');
    await CenterStudent.updateOne({_id:s1._id},{$set:{classGroup:classA._id}});

    // ── 4. Whose: the portal reads its own account's number and nobody else's ─────────────────────────
    const [childAccount,guardianAccount,strangerAccount,removedGuardian,teacherAccount,phoneless]=await Promise.all([
      User.create({name:'নমুনা ছাত্র',passwordHash:'x',role:'student',phone:'01811000011'}),
      User.create({name:'নমুনা অভিভাবক',passwordHash:'x',role:'parent',phone:'01711000011'}),
      User.create({name:'অন্য অভিভাবক',passwordHash:'x',role:'parent',phone:'01711000099'}),
      User.create({name:'বাদ যাওয়া অভিভাবক',passwordHash:'x',role:'parent',phone:'01711000044'}),
      /* A teacher session holds a different number: `User.phone` is unique, and the point of this row is the
         role, not the number. */
      User.create({name:'নমুনা শিক্ষক',passwordHash:'x',role:'teacher',phone:'01822000011'}),
      User.create({name:'নম্বরিহীন',passwordHash:'x',role:'parent'}),
    ]);
    const own=await portalResultStudents({id:String(childAccount._id),role:'student'});
    assert.deepEqual(own.map(entry=>[entry.name,entry.relation]),[['নমুনা ছাত্র RS-1','self']],
      'a student account reads its own record — and not the sibling sitting beside it on the same guardian number');
    const children=await portalResultStudents({id:String(guardianAccount._id),role:'parent'});
    assert.deepEqual(children.map(entry=>entry.name).sort(),['নমুনা ছাত্র RS-1','নমুনা ছাত্র RS-2'],
      'a guardian account reads both of the children it guards');
    assert.deepEqual(children.map(entry=>entry.relation),['child','child']);
    assert.deepEqual(await portalResultStudents({id:String(strangerAccount._id),role:'parent'}),[],
      'a number on no student record reads nothing');
    assert.deepEqual(await portalResultStudents({id:String(removedGuardian._id),role:'parent'}),[],
      'a child the centre has removed is not shown to the portal either');
    assert.deepEqual(await portalResultStudents({id:String(teacherAccount._id),role:'teacher'}),[],
      'a teacher account is not a portal results account, however its number is stored');
    assert.deepEqual(await portalResultStudents({id:String(phoneless._id),role:'parent'}),[],'an account with no number has no evidence to match on');
    /* The exactness of the match, tested against the two numbers a loose one would catch: one that shares
       the last nine digits with a guardian's, and one that shares the first nine with a child's. */
    const [nearTail,nearHead]=await Promise.all([
      User.create({name:'কাছাকাছি এক',passwordHash:'x',role:'parent',phone:'01811000011'.replace(/^018/,'019')}),
      User.create({name:'কাছাকাছি দুই',passwordHash:'x',role:'parent',phone:'01711000012'}),
    ]);
    assert.deepEqual(await portalResultStudents({id:String(nearTail._id),role:'parent'}),[],
      'a number that differs in its first three digits is a different family, not a match on the tail');
    assert.deepEqual(await portalResultStudents({id:String(nearHead._id),role:'parent'}),[],
      'and a number that differs in its last digit is a different family, not a match on the head');
    assert.equal(JSON.stringify(await portalResultStudents({id:String(guardianAccount._id),role:'parent'})).match(/01\d{9}/g),null,
      'the answer names the children; it never carries a number');

    // ── 5. The publish prompt's count is the send's count ─────────────────────────────────────────────
    const before=await resultSmsAudience(monthly.id,now);
    assert.equal(before.classes,2,'the exam covers two classes');
    assert.equal(before.students,4,'four children have a published result in it');
    assert.equal(before.messages,4,'and four messages would go out: the two siblings on one number are never merged, because each quotes a different child');
    assert.equal(before.possible,true,'the mock provider is configured, so a send is possible in test mode');
    assert.equal(before.reason,null);
    assert.equal(before.defaultOn,false,'the automatic-result setting ships off, so the prompt’s box starts unticked');
    const draftCount=await resultSmsAudience(draft.id,now);
    assert.equal(draftCount.messages,1,'the count is asked before publishing, so it reads the rows with the publication gate lifted');
    assert.ok(draftCount.messages>0,'an operator who is about to publish is told what publishing would send');
    await CenterSettings.updateOne({key:'main'},{$set:{autoResult:true}},{upsert:true});
    assert.equal((await resultSmsAudience(monthly.id,now)).defaultOn,true,'and the setting is the box’s starting state, nothing more');

    /* The count is only honest if the send agrees with it, so the send runs — once per class, the way the
       publish action runs it, with the toggle ignored because the operator has just ticked the box. */
    await CenterSettings.updateOne({key:'main'},{$set:{autoResult:false}});
    const skipped=await autoSendClassResults({exam:monthly.id,classGroup:String(classA._id)},{now});
    assert.equal(skipped.attempted,false,'with the setting off and no consent, nothing is attempted');
    const sentA=await autoSendClassResults({exam:monthly.id,classGroup:String(classA._id)},{now,ignoreToggle:true});
    assert.equal(sentA.failed,undefined,'a consented send goes out even with the setting off');
    assert.ok(sentA.batchId,'and it writes a batch');
    const sentB=await autoSendClassResults({exam:monthly.id,classGroup:String(classB._id)},{now,ignoreToggle:true});
    assert.ok(sentB.batchId);
    const batches=await CenterSmsBatch.find({trigger:'auto_result',purpose:'exam_result'}).lean();
    const sentCount=batches.reduce((total,batch)=>total+(batch.sentCount||0),0);
    assert.equal(sentCount,before.messages,`the prompt said ${before.messages} and the send wrote ${sentCount}`);
    const logs=await CenterSmsLog.find({templateKey:'exam_result'}).lean();
    assert.equal(logs.length,before.messages,'one log row per message');
    assert.equal(logs.filter(log=>log.phone==='01711000011').length,2,'the siblings’ guardian number took two messages, one per child');
    assert.deepEqual([...new Set(logs.map(log=>log.status))],['sent']);
    const quoted=[...new Set(logs.map(log=>log.message.match(/ছাত্র RS-\d/)?.[0]||''))].sort();
    assert.deepEqual(quoted,['ছাত্র RS-1','ছাত্র RS-2','ছাত্র RS-3','ছাত্র RS-5'],
      'and the four messages quote four different children, one each');
    const draftSend=await autoSendClassResults({exam:draft.id,classGroup:String(classA._id)},{now,ignoreToggle:true});
    assert.equal(draftSend.reason,'no results','the send still refuses a draft exam: the prompt counts one, publishing sends none');

    console.log('Exam results: a student’s history is the published exams newest first with each subject’s marks and pass mark, an absent exam keeps its row and no position and is left out of the trend with the skip counted, the payload the portal receives carries no money-shaped key, no money word and no phone number, a report card tells an unpublished exam from a child who was never in it and names the class the exam was sat in, a portal account reads only the children on its own exact number — never a sibling on a student account, never a near-miss number, never a removed child, never a teacher session — and the count the publish prompt shows is the count the send writes, with siblings unmerged and a draft exam still refused.');
  }finally{
    await mongoose.disconnect();
    if(!shared)await mongo.stop();
  }
}

run().catch(error=>{console.error(error);process.exit(1)});
