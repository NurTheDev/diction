// @ts-nocheck -- isolated MongoDB suite with synthetic students, teachers and exams
/**
 * R5 · Exams — the flow against a real database.
 *
 * The pure arithmetic has its own suite (`tests/exam-rules.test.ts`, `tests/exam-grid.test.ts`). This one
 * proves what only a database can: that a teacher's scope is the classes assigned to them and nothing
 * else, that a batch of marks lands as one write with a stale row named rather than forced, that an exam
 * covering two classes ranks each class on its own, that publishing freezes the exam and unpublishing is
 * the only way back, and that an exam's shape is editable only as far as its stored results allow.
 *
 * It also asserts the negative that the brief cares most about: a teacher's exam view is built without
 * ever reading a fee, a payment, a receipt or the cashbook, so there is no ledger field in anything the
 * screen is handed.
 *
 * Run: npm run test:exam:db  (needs the disposable database; CI runs it inside `npm run verify`)
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mongoose from 'mongoose';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {CenterStudent,CenterClassGroup,CenterExam,CenterExamResult,CenterActivityLog,CenterGradingScale} from '../src/models/CenterRecords';
import {createCenterExam,updateCenterExam,saveCenterExamMarks,saveCenterExamMarksBatch,publishCenterExam,unpublishCenterExam} from '../src/lib/center/exam-batch';
import {teacherClassGroups,scopeClasses,scopeCovers,scopeCoversClass,scopeFilter,type ExamScope} from '../src/lib/exams/exam-scope';
import {examDetailView,examListView,gradingScales} from '../src/lib/exams/exam-view';
import {DEFAULT_GRADING_RANGES,rangesToBands} from '../src/lib/exams/vocab';

const bands=rangesToBands(DEFAULT_GRADING_RANGES);
const subjects=[{name:'বাংলা',full:100,pass:33},{name:'গণিত',full:50,pass:20}];

const teacherScope=(userId:string,classGroups:string[]):ExamScope=>
  ({userId,role:'teacher',name:'শিক্ষক',manage:false,publish:false,scale:false,archive:false,classGroups,teacher:true});

async function run(){
  await preflight({
    mongo:true,browser:false,test:'tests/exam-flow.integration.ts — run it with TEST_MONGO_URI (see docs/STALE-TESTS.md)',
  });
  const shared=process.env.TEST_MONGO_URI||null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){
    for(const collection of await mongoose.connection.db.listCollections().toArray()){
      await mongoose.connection.db.collection(collection.name).deleteMany({}).catch(()=>{});
    }
  }
  try{
    // ── Two classes, four students, two teachers ────────────────────────────────────────────────
    const [owner,manager,teacherA,teacherB,outsider]=await Promise.all([
      User.create({name:'Owner',passwordHash:'x',role:'admin'}),
      User.create({name:'Exam manager',passwordHash:'x',role:'exam_manager'}),
      User.create({name:'শিক্ষক ক',passwordHash:'x',role:'teacher'}),
      User.create({name:'শিক্ষক খ',passwordHash:'x',role:'teacher'}),
      User.create({name:'Content editor',passwordHash:'x',role:'content_editor'}),
    ]);
    const [classA,classB,classC]=await Promise.all([
      CenterClassGroup.create({name:{bn:'নবম ক',en:'Nine A'},academicYear:2026,active:true,teachers:[teacherA._id]}),
      CenterClassGroup.create({name:{bn:'নবম খ',en:'Nine B'},academicYear:2026,active:true,teachers:[teacherB._id]}),
      /* Nine C is in no exam. It exists so that "this student is not in the exam" and "this student is in
         the exam but in another teacher's class" stay two separate refusals with two separate causes. */
      CenterClassGroup.create({name:{bn:'নবম গ',en:'Nine C'},academicYear:2026,active:true}),
    ]);
    const student=(id,classGroup,marks)=>CenterStudent.create({
      studentId:id,name:{bn:`ছাত্র ${id}`,en:`Student ${id}`},classGroup,guardianName:'অভিভাবক',
      guardianPhone:`017${id.replace(/\D/g,'').padStart(8,'0')}`,admissionDate:'2026-01-01',
      startMonth:{year:2026,month:1},feeHistory:[{effectiveFrom:{year:2026,month:1},amount:1000}],
    });
    const [a1,a2,a3,b1,c1]=await Promise.all([
      student('EX-1',classA._id),student('EX-2',classA._id),student('EX-3',classA._id),student('EX-4',classB._id),
      student('EX-5',classC._id),
    ]);

    // ── A teacher's scope is the classes assigned to them ───────────────────────────────────────
    assert.deepEqual((await teacherClassGroups(String(teacherA._id))).map(String),[String(classA._id)],'teacher A takes Nine A');
    assert.deepEqual((await teacherClassGroups(String(teacherB._id))).map(String),[String(classB._id)],'teacher B takes Nine B');
    const unassigned=await User.create({name:'নতুন শিক্ষক',passwordHash:'x',role:'teacher'});
    assert.deepEqual(await teacherClassGroups(String(unassigned._id)),[],'a teacher on no class has no scope at all');
    const scopeA=teacherScope(String(teacherA._id),await teacherClassGroups(String(teacherA._id)));
    const ownerScope={userId:String(owner._id),role:'admin',name:'Owner',manage:true,publish:true,scale:true,archive:true,classGroups:null,teacher:false};
    assert.equal(scopeCovers(scopeA,[classA._id]),true,'teacher A reaches Nine A');
    assert.equal(scopeCovers(scopeA,[classB._id]),false,'and never Nine B');
    /* `scopeCovers` is the whole-exam question — the right one for publishing, reshaping and scaling, which
       speak for every class at once. Marks are not that kind of act, so they ask `scopeClasses` instead. */
    assert.equal(scopeCovers(scopeA,[classA._id,classB._id]),false,'an exam covering a class they do not take is not theirs to publish or reshape');
    assert.equal(scopeCovers(ownerScope,[classA._id,classB._id]),true,'the owner reaches every class');
    assert.equal(scopeCoversClass(scopeA,classB._id),false);
    assert.deepEqual(scopeClasses(scopeA,[classA._id,classB._id]),[String(classA._id)],'but Nine A inside that exam is theirs to mark');
    assert.deepEqual(scopeClasses(scopeA,[classB._id]),[],'and an exam with none of their classes is none of theirs');
    assert.deepEqual(scopeClasses(ownerScope,[classA._id,classB._id]),[String(classA._id),String(classB._id)],'while the owner’s slice is the whole exam');
    assert.deepEqual(scopeFilter(scopeA),{_id:{$in:[String(classA._id)]}},'a teacher list query is narrowed before it runs');
    assert.deepEqual(scopeFilter(ownerScope),{},'and an owner list query is not');

    // ── One exam, two classes ───────────────────────────────────────────────────────────────────
    const request={requestId:randomUUID(),classIds:[String(classA._id),String(classB._id)],name:'মাসিক পরীক্ষা',date:'2026-02-01',type:'monthly',scaleName:'default',subjects,bands};
    const created=await createCenterExam(request,String(owner._id));
    const again=await createCenterExam(request,String(owner._id));
    assert.equal(created.id,again.id,'the same request id returns the exam it already made');
    await assert.rejects(()=>createCenterExam({...request,name:'অন্য নাম'},String(owner._id)),/REQUEST_CONFLICT/,'the same id with a different shape is a conflict, not a second exam');
    await assert.rejects(()=>createCenterExam({...request,requestId:randomUUID(),classIds:[String(new mongoose.Types.ObjectId())]},String(owner._id)),/CLASS_UNAVAILABLE/,'a class that is not there is refused');
    const exam=await CenterExam.findById(created.id).lean();
    assert.equal(exam.status,'draft','a new exam is a draft');
    assert.equal(exam.classGroups.length,2,'and it may cover two classes');
    assert.equal(exam.gradeBands.length,7,'the scale was snapshotted onto the exam');
    assert.equal(exam.gradeBands[0].point,5,'with the GPA point each band carries');

    // ── Marks, one row at a time and in a batch ─────────────────────────────────────────────────
    const subjectIds=exam.subjects.map(s=>String(s._id));
    const marksOf=(bn,math)=>[{subject:subjectIds[0],obtained:bn,absent:false},{subject:subjectIds[1],obtained:math,absent:false}];
    const absent=()=>[{subject:subjectIds[0],obtained:null,absent:true},{subject:subjectIds[1],obtained:null,absent:true}];
    await saveCenterExamMarks({examId:created.id,studentId:String(a1._id),version:-1,marks:marksOf(90,45)},String(teacherA._id));
    const first=await CenterExamResult.findOne({student:a1._id}).lean();
    assert.equal(first.total,135,'90 + 45');
    assert.equal(first.grade,'A+','135 of 150 is 90%');
    assert.equal(first.point,5,'and A+ is worth 5.00');
    assert.equal(String(first.classGroup),String(classA._id),'the result knows which class it belongs to');
    assert.equal(first.revision,0);
    await assert.rejects(()=>saveCenterExamMarks({examId:created.id,studentId:String(a1._id),version:-1,marks:marksOf(80,40)},String(teacherA._id)),/STALE_RESULT/,'a save that names an old revision is refused');
    await assert.rejects(()=>saveCenterExamMarks({examId:created.id,studentId:String(c1._id),version:-1,marks:marksOf(80,40)},String(teacherA._id)),/STUDENT_UNAVAILABLE/,'a student of a class the exam does not cover cannot be marked into it by accident');

    const batch=await saveCenterExamMarksBatch({examId:created.id,rows:[
      {studentId:String(a2._id),version:-1,marks:marksOf(85,40)},
      {studentId:String(a3._id),version:-1,marks:marksOf(85,40)},
      {studentId:String(b1._id),version:-1,marks:marksOf(70,30)},
      {studentId:String(a1._id),version:-1,marks:marksOf(10,10)},
      {studentId:String(new mongoose.Types.ObjectId()),version:-1,marks:marksOf(50,25)},
    ]},String(teacherA._id));
    assert.equal(batch.saved,3,'three rows landed in one round trip');
    assert.deepEqual(batch.rows.map(row=>row.status),['saved','saved','saved','stale','refused'],'a stale row is named, and a student who is not in the class is refused');
    assert.equal(batch.rows[3].reason,'STALE_RESULT');
    assert.equal(batch.rows[4].reason,'STUDENT_UNAVAILABLE');
    assert.equal((await CenterExamResult.findOne({student:a1._id}).lean()).total,135,'and the stale write did not touch the mark that was already there');
    assert.equal((await CenterExamResult.findOne({student:b1._id}).lean()).total,100,'the other class was marked in the same batch');

    await saveCenterExamMarksBatch({examId:created.id,rows:[{studentId:String(a3._id),version:0,marks:absent()}]},String(teacherA._id));
    assert.equal((await CenterExamResult.findOne({student:a3._id}).lean()).grade,'ABSENT','absence is stored as absence');
    /* A mark over the full mark is refused, and the two writers refuse it differently on purpose. The
       single save throws: one row, one answer. The batch names the row instead, because one bad cell in a
       paste of forty must not throw away the thirty-nine good ones — but it writes nothing either way. */
    const overFull=await saveCenterExamMarksBatch({examId:created.id,rows:[{studentId:String(a1._id),version:0,marks:[{subject:subjectIds[0],obtained:120,absent:false}]}]},String(teacherA._id));
    assert.equal(overFull.saved,0,'a batch with a mark over the full mark saves nothing');
    assert.deepEqual(overFull.rows.map(row=>[row.status,row.reason]),[['refused','INVALID_MARKS']],'and names the row it refused');
    await assert.rejects(()=>saveCenterExamMarks({examId:created.id,studentId:String(a1._id),version:0,marks:[{subject:subjectIds[0],obtained:120,absent:false}]},String(teacherA._id)),/INVALID_MARKS/,'the single save refuses it outright');
    assert.equal((await CenterExamResult.findOne({student:a1._id}).lean()).total,135,'and the mark that was already there is untouched by either refusal');
    assert.equal(await CenterActivityLog.countDocuments({action:'exam.marks'}),5,'every marks write is logged');

    // ── Two teachers, one row, one write ─────────────────────────────────────────────────────────
    /* The grid autosaves on a debounce, so the same row can be posted twice from two tabs before either
       answer arrives. The revision is what settles it: exactly one write lands, the other is refused as
       stale, and the student ends up with one result rather than two. */
    const race=await Promise.allSettled([
      saveCenterExamMarks({examId:created.id,studentId:String(b1._id),version:0,marks:marksOf(70,30)},String(teacherB._id)),
      saveCenterExamMarks({examId:created.id,studentId:String(b1._id),version:0,marks:marksOf(70,30)},String(teacherB._id)),
    ]);
    assert.equal(race.filter(outcome=>outcome.status==='fulfilled').length,1,'exactly one of the two concurrent writes is fulfilled');
    assert.match(String((race.find(outcome=>outcome.status==='rejected') as PromiseRejectedResult).reason),/STALE_RESULT/,'and the loser is told it was stale, not silently dropped');
    assert.equal(await CenterExamResult.countDocuments({student:b1._id}),1,'one result for one student, however many times the row was posted');
    assert.equal((await CenterExamResult.findOne({student:b1._id}).lean()).revision,1,'and the revision moved exactly once');

    // ── A teacher's slice of an exam that covers two classes ───────────────────────────────────
    /* The grid a teacher is shown holds their own class alone, so this path is only reachable by a request
       built by hand — which is exactly why the narrowing lives in the engine, inside the transaction, and
       not in the caller. Both refusals answer `STUDENT_UNAVAILABLE`, the same sentence the engine gives for
       a student who is not in the exam at all, so a forged row learns nothing about whose class is whose. */
    const slice=await saveCenterExamMarksBatch({examId:created.id,allowedClasses:[String(classA._id)],rows:[
      {studentId:String(b1._id),version:1,marks:marksOf(70,30)},
      {studentId:String(c1._id),version:-1,marks:marksOf(70,30)},
    ]},String(teacherA._id));
    assert.equal(slice.saved,0,'a teacher writes nothing into a class they do not take');
    assert.deepEqual(slice.rows.map(row=>[row.status,row.reason]),[['refused','STUDENT_UNAVAILABLE'],['refused','STUDENT_UNAVAILABLE']],
      'another teacher’s student and a student outside the exam are both refused');
    assert.equal((await CenterExamResult.findOne({student:b1._id}).lean()).total,100,'and the refused write left the stored mark exactly as it was');
    await assert.rejects(()=>saveCenterExamMarks({examId:created.id,studentId:String(b1._id),version:1,allowedClasses:[String(classA._id)],marks:marksOf(70,30)},String(teacherA._id)),
      /STUDENT_UNAVAILABLE/,'the single save narrows the same way the batch does');
    assert.equal(await CenterActivityLog.countDocuments({action:'exam.marks'}),6,'a refusal is not a marks write and is not logged as one');
    /* And the same teacher, in the same exam, marking their own class: the wall is per class, not per exam. */
    const own=await saveCenterExamMarksBatch({examId:created.id,allowedClasses:[String(classA._id)],rows:[
      {studentId:String(a2._id),version:0,marks:marksOf(85,40)},
    ]},String(teacherA._id));
    assert.equal(own.saved,1,'their own class in a two-class exam is theirs to mark');
    assert.equal((await CenterExamResult.findOne({student:a2._id}).lean()).total,125,'and the mark is the one they wrote');
    // That write moved this row's revision to 1, which is the revision the ranking section below names.
    assert.equal((await CenterExamResult.findOne({student:a2._id}).lean()).revision,1,'one write, one revision');

    // ── Each class ranks on its own ─────────────────────────────────────────────────────────────
    await saveCenterExamMarksBatch({examId:created.id,rows:[
      {studentId:String(a2._id),version:1,marks:marksOf(85,40)},
    ]},String(teacherA._id));
    const published=await publishCenterExam(created.id,String(owner._id));
    assert.equal(published.published,true);
    const results=await CenterExamResult.find({}).lean();
    const positionOf=studentId=>results.find(row=>String(row.student)===String(studentId))?.position;
    assert.equal(positionOf(a1._id),1,'135 is first in Nine A');
    assert.equal(positionOf(a2._id),2,'125 is second');
    assert.equal(positionOf(a3._id),undefined,'an absent student gets no position');
    assert.equal(positionOf(b1._id),1,'and the only student of Nine B is first in Nine B, not fourth in the exam');
    assert.equal(await CenterActivityLog.countDocuments({action:'exam.publish'}),1);
    await publishCenterExam(created.id,String(owner._id));
    assert.equal(await CenterActivityLog.countDocuments({action:'exam.publish'}),1,'publishing twice is a no-op');
    await assert.rejects(()=>saveCenterExamMarks({examId:created.id,studentId:String(a1._id),version:1,marks:marksOf(50,25)},String(teacherA._id)),/EXAM_UNAVAILABLE/,'a published exam takes no marks');
    await assert.rejects(()=>updateCenterExam({examId:created.id,classIds:[String(classA._id)],name:'নতুন নাম',date:'2026-02-02',type:'monthly',subjects,bands},String(owner._id)),/EXAM_PUBLISHED/,'and a published exam keeps its shape');

    // ── Unpublish is the only way back, and it is logged ────────────────────────────────────────
    await unpublishCenterExam(created.id,String(owner._id));
    assert.equal((await CenterExam.findById(created.id).lean()).status,'draft');
    assert.equal(await CenterActivityLog.countDocuments({action:'exam.unpublish'}),1,'taking a result back is an act somebody can see was done');
    /* Version 0: this row was created at the top of the suite and every write aimed at it since was a
       refusal — the stale one, the over-full one, the published one — so 0 is still what it holds. Naming
       the revision the row actually has is the point of the check: a write that landed unasked for shows up
       here as a stale refusal rather than as a mystery three sections later. */
    await saveCenterExamMarks({examId:created.id,studentId:String(a1._id),version:0,marks:marksOf(60,30)},String(teacherA._id));
    const moved=await CenterExamResult.findOne({student:a1._id}).lean();
    assert.equal(moved.total,90,'and the marks move again');
    assert.equal(moved.revision,1,'one write on this row, so one revision');
    await publishCenterExam(created.id,String(owner._id));
    const reranked=await CenterExamResult.find({}).lean();
    assert.equal(reranked.find(row=>String(row.student)===String(a2._id)).position,1,'publishing again re-ranks the class on the marks as they now are');

    // ── What an edit may and may not do ─────────────────────────────────────────────────────────
    await unpublishCenterExam(created.id,String(owner._id));
    await assert.rejects(()=>updateCenterExam({examId:created.id,classIds:[String(classA._id),String(classB._id)],name:'মাসিক পরীক্ষা',date:'2026-02-01',type:'monthly',
      subjects:[{name:'বাংলা',full:100,pass:33},{name:'গণিত',full:100,pass:40}],bands},String(owner._id)),/SUBJECTS_LOCKED/,'subjects are frozen once a result exists: a full mark that moved would change what a stored mark means');
    await assert.rejects(()=>updateCenterExam({examId:created.id,classIds:[String(classA._id)],name:'মাসিক পরীক্ষা',date:'2026-02-01',type:'monthly',subjects,bands},String(owner._id)),/CLASS_HAS_RESULTS/,'a class with stored results cannot be dropped from the exam');
    const stricter=rangesToBands([
      {min:90,max:100,grade:'A+',point:5},{min:80,max:89,grade:'A',point:4},{min:70,max:79,grade:'A-',point:3.5},
      {min:60,max:69,grade:'B',point:3},{min:50,max:59,grade:'C',point:2},{min:40,max:49,grade:'D',point:1},{min:0,max:39,grade:'F',point:0},
    ]);
    await updateCenterExam({examId:created.id,classIds:[String(classA._id),String(classB._id)],name:'মাসিক পরীক্ষা (সংশোধিত)',date:'2026-02-03',type:'term',scaleName:'কঠোর স্কেল',subjects,bands:stricter},String(owner._id));
    const edited=await CenterExam.findById(created.id).lean();
    assert.equal(edited.name.bn,'মাসিক পরীক্ষা (সংশোধিত)','the name moved');
    assert.equal(edited.type,'term','the type moved');
    assert.equal(edited.gradeBands[0].min,90,'and so did the scale');
    const movedGrade=await CenterExamResult.findOne({student:a1._id}).lean();
    assert.equal(movedGrade.grade,'B','a boundary that moved moved every stored grade with it: 60% is a B on the stricter scale');
    assert.equal(movedGrade.point,3,'and its point');
    assert.equal(movedGrade.total,90,'the mark itself is untouched — a grade is derived, a mark is not');

    // ── The view each actor gets ────────────────────────────────────────────────────────────────
    const ownerView=await examDetailView(created.id,ownerScope,'bn');
    assert.equal(ownerView.students.length,4,'the owner sees both classes');
    assert.equal(ownerView.results.length,4);
    assert.equal(ownerView.summary.students,4);
    const teacherView=await examDetailView(created.id,scopeA,'bn');
    assert.equal(teacherView.students.length,3,'teacher A sees only Nine A');
    assert.deepEqual(teacherView.students.map(s=>s.studentId).sort(),['EX-1','EX-2','EX-3']);
    assert.equal(teacherView.summary.students,3,'and the summary is their class alone');
    assert.equal(teacherView.classes.length,1);
    const scopeB=teacherScope(String(teacherB._id),[String(classB._id)]);
    const viewB=await examDetailView(created.id,scopeB,'bn');
    assert.equal(viewB.students.length,1,'teacher B sees only Nine B');
    assert.equal(viewB.results[0].position,1,'ranked inside their own class');
    assert.equal(await examDetailView(created.id,teacherScope(String(unassigned._id),[]),'bn'),null,'a teacher on no class gets no exam at all');
    const json=JSON.stringify(teacherView);
    for(const word of ['fee','payment','receipt','cash','due','amount','guardianPhone']){
      assert.ok(!json.toLowerCase().includes(word),`a teacher's exam view carries no ${word} — nothing about money is even queried`);
    }
    const teacherList=await examListView(scopeA,{},1,'bn');
    assert.equal(teacherList.total,1,'one exam reaches Nine A');
    const outsiderList=await examListView(teacherScope(String(unassigned._id),[]),{},1,'bn');
    assert.equal(outsiderList.total,0,'a teacher on no class sees no exam, and is told nothing about the ones there are');
    const filtered=await examListView(ownerScope,{type:'term'},1,'bn');
    assert.equal(filtered.total,1,'the owner can narrow by type');
    assert.equal((await examListView(ownerScope,{type:'monthly'},1,'bn')).total,0,'and a filter that matches nothing says so');

    // ── The grading scale the centre saves ──────────────────────────────────────────────────────
    await CenterGradingScale.create([{name:'মান স্কেল',ranges:DEFAULT_GRADING_RANGES,active:true}]);
    const second=await CenterGradingScale.create([{name:'কঠোর স্কেল',ranges:DEFAULT_GRADING_RANGES.map(range=>({...range})),active:true}]);
    await CenterGradingScale.updateMany({_id:{$ne:second._id}},{$set:{active:false}});
    const scales=await gradingScales();
    assert.equal(scales.length,2,'both scales are listed');
    assert.equal(scales.filter(scale=>scale.active).length,1,'and exactly one is the default');
    assert.equal(scales[0].name,'কঠোর স্কেল','the active one first, because it is the one a form will pick');
    assert.equal(scales[0].ranges[0].point,5,'a saved scale carries its points');

    // ── No results, no publication ──────────────────────────────────────────────────────────────
    const empty=await createCenterExam({requestId:randomUUID(),classIds:[String(classA._id)],name:'খালি পরীক্ষা',date:'2026-03-01',type:'class_test',subjects,bands},String(manager._id));
    await assert.rejects(()=>publishCenterExam(empty.id,String(manager._id)),/NO_RESULTS/,'an exam with nothing marked cannot be published');
    const emptyView=await examDetailView(empty.id,scopeA,'en');
    assert.equal(emptyView.students.length,3,'the class is still listed, so the grid can be filled');
    assert.equal(emptyView.results.length,0);
    assert.equal(emptyView.summary.average,null,'and an empty class says nothing to average, not 0');
    assert.equal(emptyView.canWrite,true);

    console.log('Exam flow: teacher class scope with no payment field anywhere, one exam over two classes, batched marks with a stale row named, per-class positions with ties and absence, publish and unpublish, what an edit may change, and the saved grading scales passed.');
  }finally{
    await mongoose.disconnect();
    await mongo.stop();
  }
}

run().catch(error=>{console.error(error);process.exit(1)});
