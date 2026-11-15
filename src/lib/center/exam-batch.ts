/**
 * Internal transaction engines for the centre's exams. Live authorization and flags must be enforced by
 * callers (`lib/exams/exam-scope` decides who may write, and the actions ask it before coming here).
 *
 * The rules this layer keeps, because a result is a document about a child and every one of them is a
 * way of not writing a wrong one:
 *
 *   • **Every write is a transaction with the locks taken first.** Marks for one student take the exam
 *     lock and that student's lock, in a sorted order, so two teachers saving in the same second cannot
 *     interleave: one wins, the other gets a refusal rather than a half-written row.
 *   • **A request id makes a create replayable.** A retried submission that carries the same id and the
 *     same shape returns the exam it already made; the same id with a DIFFERENT shape is a conflict, not
 *     a second exam, because "the button was pressed twice" and "two exams were asked for" look
 *     identical from the network and only the payload can tell them apart.
 *   • **Marks are revision-checked.** A save names the revision it read; if the row moved on, the write
 *     is refused as stale instead of overwriting somebody else's mark.
 *   • **A published exam is frozen.** Marks cannot be entered against it, and its shape cannot be
 *     edited; an owner who has to correct it unpublishes first, which is logged and is the only door
 *     back into a draft.
 *   • **Position is a class fact.** Ranking happens inside the class group the student belongs to, ties
 *     share a position, and an absent student is left out entirely — so an exam covering three classes
 *     produces three 1st places, not one.
 */
import mongoose from 'mongoose';import {z} from 'zod';import {CenterExam,CenterExamResult,CenterStudent,CenterClassGroup,CenterActivityLog} from '@/models/CenterRecords';import {acquireCenterLocks,studentLock} from './import-locks';import {calculateExam,validateBands} from './exam-marks';import {pointFor} from '@/lib/exams/grading';
const id=z.string().regex(/^[a-f0-9]{24}$/i),uuid=z.string().uuid(),validDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(x=>{const d=new Date(x+'T00:00:00Z');return !isNaN(+d)&&d.toISOString().slice(0,10)===x});
const subjectInput=z.object({name:z.string().trim().min(1).max(100),full:z.number().int().min(1).max(10000),pass:z.number().int().min(0).max(10000)});
const bandInput=z.object({min:z.number().int().min(0).max(100),label:z.string().trim().min(1).max(20),point:z.number().min(0).max(5).default(0)});
const examShape={classIds:z.array(id).min(1).max(12),name:z.string().trim().min(1).max(120),date:validDate,type:z.enum(['monthly','model_test','term','class_test','other']),scaleName:z.string().trim().max(80).default(''),subjects:z.array(subjectInput).min(1).max(8),bands:z.array(bandInput).min(1).max(12)};
const examShapeSchema=z.object(examShape),examInput=examShapeSchema.extend({requestId:uuid});
/** The two shape rules a schema cannot express on its own: a pass mark at or under its full mark, and
    a band list that is a scale (sorted, distinct, and reaching 0 — see validateBands). */
function checkShape(data:z.infer<typeof examShapeSchema>):void{
  if(data.subjects.some(s=>s.pass>s.full))throw Error('INVALID_EXAM');
  try{validateBands(data.bands.map(b=>({min:b.min,label:b.label})))}catch{throw Error('INVALID_EXAM')}
}
/** An exam's bands with the GPA point each one carries, sorted from the top down and re-validated. */
const bandsWithPoints=(exam:Ex)=>{const bands=[...exam.gradeBands].sort((a,b)=>b.min-a.min).map(b=>({min:b.min,label:b.label,point:b.point??0}));validateBands(bands.map(b=>({min:b.min,label:b.label})));return bands};

/* `allowedClasses` is the actor's slice of the exam: absent for an owner or an exam manager, who reach
   every class, and the assigned list for a teacher. The narrowing happens in here, inside the same
   transaction as the write, rather than in the caller — a check made outside the transaction is a check
   against a database that may have moved by the time the mark lands. */
const allowed=z.array(z.string()).optional();
const markInput=z.object({examId:id,studentId:id,version:z.number().int().min(-1),allowedClasses:allowed,marks:z.array(z.object({subject:id,obtained:z.number().int().min(0).nullable(),absent:z.boolean()})).min(1).max(8)});
const batchInput=z.object({examId:id,allowedClasses:allowed,rows:z.array(z.object({studentId:id,version:z.number().int().min(-1),marks:z.array(z.object({subject:id,obtained:z.number().int().min(0).nullable(),absent:z.boolean()})).min(1).max(8)})).min(1).max(500)});
type Ex={_id:mongoose.Types.ObjectId;requestId?:string;createdBy?:mongoose.Types.ObjectId;name:{bn:string};type:string;date:string;scaleName?:string;classGroups:mongoose.Types.ObjectId[];gradeBands:{min:number;label:string;point?:number}[];subjects:{_id:mongoose.Types.ObjectId;name:{bn:string};fullMarks:number;passMarks:number}[];status:string};
type Row={_id:mongoose.Types.ObjectId;student:mongoose.Types.ObjectId;classGroup?:mongoose.Types.ObjectId;revision?:number;marks?:{subject:string;obtained:number|null;absent:boolean}[];total?:number;grade?:string;percentage?:number;position?:number};
/** An exam may be asked for one class at a time (the old single-class form) or several at once (R5). */
export function classIdsOf(input:unknown):string[]{const raw=(input as {classIds?:unknown;classId?:unknown})||{};const list=Array.isArray(raw.classIds)?raw.classIds:raw.classId?[raw.classId]:[];return [...new Set(list.map(x=>String(x).toLowerCase()))]}
const sortedIds=(list:{toString():string}[])=>list.map(x=>String(x).toLowerCase()).sort();
/**
 * The classes of this exam the actor may write into.
 *
 * A student outside it is refused as `STUDENT_UNAVAILABLE` — the same answer the engine already gives for a
 * student who is not in the exam at all, and deliberately so: to a caller who forged a row for another
 * teacher's class, the two cases are one sentence, and neither confirms who is in whose class.
 */
function reachable(exam:Ex,allowedClasses?:string[]){
  const classes=exam.classGroups.map(group=>String(group).toLowerCase());
  if(!allowedClasses?.length)return classes;
  const slice=new Set(allowedClasses.map(group=>group.toLowerCase()));
  return classes.filter(group=>slice.has(group));
}
/** One student's marks, recalculated, as the row stores them. Shared by the single save and the batch. */
function applyMarks(exam:Ex,studentId:string,version:number,marks:{subject:string;obtained:number|null;absent:boolean}[],actor:string,classGroup:string){
  const normalized=marks.map(m=>({...m,subject:m.subject.toLowerCase()})),bands=bandsWithPoints(exam);
  const calculated=calculateExam(exam.subjects.map(s=>({id:String(s._id),full:s.fullMarks,pass:s.passMarks})),bands,normalized);
  return {value:{classGroup,marks:normalized,total:calculated.total,fullTotal:calculated.fullTotal,percentage:calculated.percentage,grade:calculated.grade,point:pointFor(bands,calculated.percentage,calculated.grade),recordedBy:actor},calculated,bands,normalized};
}
export async function createCenterExam(input:unknown,actor:string){
  if(!mongoose.isValidObjectId(actor))throw Error('INVALID_ACTOR');
  const parsed=examInput.safeParse({...input as object,classIds:classIdsOf(input)});if(!parsed.success)throw Error('INVALID_EXAM');
  const p=parsed.data,classIds=sortedIds(p.classIds),req=p.requestId.toLowerCase();
  await CenterExam.init();const session=await mongoose.startSession();let resultId='';
  try{
    await session.withTransaction(async()=>{
      await acquireCenterLocks([`exam-create:${req}`],session);
      const found=await CenterExam.findOne({requestId:req}).session(session).lean<Ex>();
      if(found){
        if(String(found.createdBy)!==actor.toLowerCase()||found.name.bn!==p.name||found.type!==p.type||found.date!==p.date||JSON.stringify(sortedIds(found.classGroups))!==JSON.stringify(classIds)||JSON.stringify(found.subjects.map(s=>({name:s.name.bn,full:s.fullMarks,pass:s.passMarks})))!==JSON.stringify(p.subjects)||JSON.stringify(validateBands(found.gradeBands))!==JSON.stringify(validateBands(p.bands.map(b=>({min:b.min,label:b.label})))))throw Error('REQUEST_CONFLICT');
        resultId=String(found._id);return;
      }
      const groups=await CenterClassGroup.find({_id:{$in:classIds},active:true}).session(session).select('_id').lean<{_id:mongoose.Types.ObjectId}[]>();
      if(groups.length!==classIds.length)throw Error('CLASS_UNAVAILABLE');
      const [created]=await CenterExam.create([{requestId:req,createdBy:actor,name:{bn:p.name,en:''},date:p.date,type:p.type,scaleName:p.scaleName,classGroups:groups.map(g=>g._id),subjects:p.subjects.map(s=>({name:{bn:s.name,en:''},fullMarks:s.full,passMarks:s.pass})),gradeBands:validateBands(p.bands.map(b=>({min:b.min,label:b.label}))).map((b,i)=>({...b,point:p.bands.find(x=>x.min===b.min)?.point??0})),status:'draft'}],{session});
      resultId=String(created._id);
      await CenterActivityLog.create([{actor,action:'exam.create',target:created._id,after:{classGroups:classIds,name:p.name,date:p.date,type:p.type,subjects:p.subjects.length}}],{session});
    });
    return {id:resultId};
  }finally{await session.endSession()}
}
/**
 * Change a draft exam's shape.
 *
 * A published exam refuses everything (`EXAM_PUBLISHED`): the owner unpublishes first, so a correction
 * to a result somebody has already been told about is a deliberate, logged act rather than an edit.
 * Subjects are frozen once the first result exists (`SUBJECTS_LOCKED`) — a mark of 90 against a full
 * mark that moved to 80 is a number that no longer means what it said, and no recalculation can recover
 * what the teacher actually wrote. Bands are NOT frozen: changing a boundary recomputes every stored
 * result's grade and point inside the same transaction, because a grade is derived and a mark is not.
 */
export async function updateCenterExam(input:unknown,actor:string){
  if(!mongoose.isValidObjectId(actor))throw Error('INVALID_ACTOR');
  const raw=input as {examId?:string};
  if(!raw?.examId||!mongoose.isValidObjectId(raw.examId))throw Error('INVALID_EXAM');
  const parsed=examShapeSchema.safeParse({...raw,classIds:classIdsOf(raw)});
  if(!parsed.success)throw Error('INVALID_EXAM');
  checkShape(parsed.data);
  const p=parsed.data,classIds=sortedIds(p.classIds),examId=String(raw.examId).toLowerCase();
  const session=await mongoose.startSession();
  try{
    await session.withTransaction(async()=>{
      await acquireCenterLocks([`exam:${examId}`],session);
      const exam=await CenterExam.findById(examId).session(session).lean<Ex>();
      if(!exam)throw Error('EXAM_UNAVAILABLE');
      if(exam.status!=='draft')throw Error('EXAM_PUBLISHED');
      const before={name:exam.name.bn,type:exam.type,date:exam.date,classGroups:sortedIds(exam.classGroups),subjects:exam.subjects.map(s=>({id:String(s._id),name:s.name.bn,full:s.fullMarks,pass:s.passMarks})),bands:exam.gradeBands.map(b=>({min:b.min,label:b.label,point:b.point??0}))};
      const results=await CenterExamResult.find({exam:exam._id}).session(session).lean<Row[]>();
      const sameSubjects=JSON.stringify(before.subjects.map(s=>({name:s.name,full:s.full,pass:s.pass})))===JSON.stringify(p.subjects.map(s=>({name:s.name,full:s.full,pass:s.pass})));
      if(results.length&&!sameSubjects)throw Error('SUBJECTS_LOCKED');
      const removed=before.classGroups.filter(group=>!classIds.includes(group));
      if(removed.length&&results.some(row=>row.classGroup&&removed.includes(String(row.classGroup).toLowerCase())))throw Error('CLASS_HAS_RESULTS');
      const groups=await CenterClassGroup.find({_id:{$in:classIds},active:true}).session(session).select('_id').lean<{_id:mongoose.Types.ObjectId}[]>();
      if(groups.length!==classIds.length)throw Error('CLASS_UNAVAILABLE');
      const bands=validateBands(p.bands.map(b=>({min:b.min,label:b.label}))).map(b=>({...b,point:p.bands.find(x=>x.min===b.min)?.point??0}));
      const bandsChanged=JSON.stringify(bands)!==JSON.stringify(before.bands.map(b=>({min:b.min,label:b.label,point:b.point})));
      // Subjects are written only while no result exists: once a mark is stored it points at a subject
      // id, and a subject that moved would leave that mark describing something else.
      await CenterExam.updateOne({_id:exam._id,status:'draft'},{$set:{name:{bn:p.name,en:''},date:p.date,type:p.type,scaleName:p.scaleName,classGroups:groups.map(g=>g._id),gradeBands:bands,...(results.length?{}:{subjects:p.subjects.map(s=>({name:{bn:s.name,en:''},fullMarks:s.full,passMarks:s.pass}))})}},{session,runValidators:true});
      // A boundary that moved moves every grade already stored: recompute inside the same transaction so
      // the exam never holds two different ideas of what 79% is worth.
      let recomputed=0;
      if(bandsChanged&&results.length){
        for(const row of results){
          /* `subject` is stored as an ObjectId and the engine compares ids as lowercase hex, so it is read
             through `String` here exactly as `applyMarks` normalizes it on the way in. Without that, every
             row looks like a mark for a subject this exam does not have, and tightening a scale on an exam
             anyone has sat fails with INVALID_MARKS instead of moving the grades. */
          const marks=(row.marks||[]).map(m=>({subject:String(m.subject).toLowerCase(),obtained:m.absent?null:m.obtained,absent:!!m.absent}));
          if(marks.length!==exam.subjects.length)continue;
          const calculated=calculateExam(exam.subjects.map(s=>({id:String(s._id),full:s.fullMarks,pass:s.passMarks})),bands,marks);
          await CenterExamResult.updateOne({_id:row._id},{$set:{grade:calculated.grade,percentage:calculated.percentage,point:pointFor(bands,calculated.percentage,calculated.grade)}},{session,runValidators:true});
          recomputed+=1;
        }
      }
      await CenterActivityLog.create([{actor,action:'exam.update',target:exam._id,before,after:{name:p.name,type:p.type,date:p.date,classGroups:classIds,subjects:p.subjects.length,bands:bands.map(b=>({min:b.min,label:b.label,point:b.point})),recomputed}}],{session});
    });
    return {id:examId};
  }finally{await session.endSession()}
}
export async function saveCenterExamMarks(input:unknown,actor:string){
  if(!mongoose.isValidObjectId(actor))throw Error('INVALID_ACTOR');
  const x=markInput.safeParse(input);if(!x.success)throw Error('INVALID_MARKS');
  const p=x.data;await CenterExamResult.init();const session=await mongoose.startSession();
  try{
    await session.withTransaction(async()=>{
      await acquireCenterLocks([`exam:${p.examId.toLowerCase()}`,studentLock(p.studentId)],session);
      const ex=await CenterExam.findById(p.examId).session(session).lean<Ex>();
      if(!ex||ex.status!=='draft'||!ex.classGroups.length)throw Error('EXAM_UNAVAILABLE');
      const student=await CenterStudent.findOne({_id:p.studentId,classGroup:{$in:reachable(ex,p.allowedClasses)},status:'active'}).session(session).select('_id classGroup').lean<{_id:mongoose.Types.ObjectId;classGroup:mongoose.Types.ObjectId}>();
      if(!student)throw Error('STUDENT_UNAVAILABLE');
      const current=await CenterExamResult.findOne({exam:p.examId,student:p.studentId}).session(session).lean<Row>();
      if((current?(current.revision??0):-1)!==p.version)throw Error('STALE_RESULT');
      const applied=applyMarks(ex,p.studentId,p.version,p.marks,actor,String(student.classGroup)),value={exam:ex._id,student:p.studentId,...applied.value};
      if(current){
        const updated=await CenterExamResult.updateOne({_id:current._id,...(p.version===0?{$or:[{revision:0},{revision:{$exists:false}}]}:{revision:p.version})},{$set:value,$inc:{revision:1}},{session,runValidators:true});
        if(updated.modifiedCount!==1)throw Error('STALE_RESULT');
      }else await CenterExamResult.create([{...value,revision:0}],{session});
      await CenterStudent.updateOne({_id:p.studentId},{$inc:{revision:1}},{session});
      await CenterActivityLog.create([{actor,action:'exam.marks',target:ex._id,before:current?{student:p.studentId,marks:current.marks,total:current.total,grade:current.grade}:null,after:{student:p.studentId,marks:value.marks,total:applied.calculated.total,grade:applied.calculated.grade}}],{session});
    });
  }finally{await session.endSession()}
}
export interface BatchRowOutcome{studentId:string;status:'saved'|'stale'|'refused';reason?:string}
/**
 * One round trip for every row the grid changed, which is what makes an autosave usable.
 *
 * Each row is still revision-checked on its own and a row that went stale is reported rather than
 * retried or forced: the batch is a convenience for the network, never a licence to overwrite. Rows
 * whose student is not in one of the exam's classes, or whose marks do not match the exam's subjects,
 * come back `refused` with the reason, and the rows that did land are committed with them — so a sheet
 * pasted over a class that has one wrong name still saves the rest and says which one it did not.
 */
export async function saveCenterExamMarksBatch(input:unknown,actor:string):Promise<{saved:number;rows:BatchRowOutcome[]}>{
  if(!mongoose.isValidObjectId(actor))throw Error('INVALID_ACTOR');
  const parsed=batchInput.safeParse(input);if(!parsed.success)throw Error('INVALID_MARKS');
  const p=parsed.data;await CenterExamResult.init();const session=await mongoose.startSession();
  const rows:BatchRowOutcome[]=[];let saved=0;
  try{
    await session.withTransaction(async()=>{
      const students=[...new Set(p.rows.map(r=>r.studentId.toLowerCase()))];
      await acquireCenterLocks([`exam:${p.examId.toLowerCase()}`,...students.map(studentLock)].sort(),session);
      const ex=await CenterExam.findById(p.examId).session(session).lean<Ex>();
      if(!ex||ex.status!=='draft'||!ex.classGroups.length)throw Error('EXAM_UNAVAILABLE');
      const roster=await CenterStudent.find({_id:{$in:students},classGroup:{$in:reachable(ex,p.allowedClasses)},status:'active'}).session(session).select('_id classGroup').lean<{_id:mongoose.Types.ObjectId;classGroup:mongoose.Types.ObjectId}[]>();
      const byId=new Map(roster.map(s=>[String(s._id).toLowerCase(),s]));
      const existing=await CenterExamResult.find({exam:ex._id,student:{$in:students}}).session(session).lean<Row[]>();
      const currentByStudent=new Map(existing.map(row=>[String(row.student).toLowerCase(),row]));
      for(const row of p.rows){
        const key=row.studentId.toLowerCase();
        const student=byId.get(key);
        if(!student){rows.push({studentId:row.studentId,status:'refused',reason:'STUDENT_UNAVAILABLE'});continue}
        const current=currentByStudent.get(key);
        if((current?(current.revision??0):-1)!==row.version){rows.push({studentId:row.studentId,status:'stale',reason:'STALE_RESULT'});continue}
        try{
          const applied=applyMarks(ex,row.studentId,row.version,row.marks,actor,String(student.classGroup)),value={exam:ex._id,student:student._id,...applied.value};
          if(current){
            const updated=await CenterExamResult.updateOne({_id:current._id,...(row.version===0?{$or:[{revision:0},{revision:{$exists:false}}]}:{revision:row.version})},{$set:value,$inc:{revision:1}},{session,runValidators:true});
            if(updated.modifiedCount!==1){rows.push({studentId:row.studentId,status:'stale',reason:'STALE_RESULT'});continue}
          }else{const [created]=await CenterExamResult.create([{...value,revision:0}],{session});currentByStudent.set(key,{_id:created._id,student:student._id,classGroup:student.classGroup,revision:0,marks:value.marks,total:value.total,grade:value.grade})}
          await CenterStudent.updateOne({_id:student._id},{$inc:{revision:1}},{session});
          await CenterActivityLog.create([{actor,action:'exam.marks',target:ex._id,before:current?{student:key,marks:current.marks,total:current.total,grade:current.grade}:null,after:{student:key,marks:value.marks,total:applied.calculated.total,grade:applied.calculated.grade}}],{session});
          saved+=1;rows.push({studentId:row.studentId,status:'saved'});
        }catch(error){rows.push({studentId:row.studentId,status:'refused',reason:(error as Error)?.message||'INVALID_MARKS'})}
      }
    });
    return {saved,rows};
  }finally{await session.endSession()}
}
/**
 * Publish: freeze the exam and write each class's positions.
 *
 * Positions are computed here rather than at marks time because a position is a fact about the whole
 * class, and the whole class is only complete when the owner says it is. Ranking is per class group,
 * ties share a position and the next one skips (1st, 2nd, 2nd, 4th), and an absent student gets no
 * position at all — the `—` on the sheet is the truth, and a number there would be a rank nobody earned.
 * Publishing twice is a no-op, so a double-click cannot re-rank a published result.
 */
export async function publishCenterExam(examId:string,actor:string){
  if(!mongoose.isValidObjectId(examId)||!mongoose.isValidObjectId(actor))throw Error('INVALID_REQUEST');
  const session=await mongoose.startSession();let published=false;
  try{
    await session.withTransaction(async()=>{
      await acquireCenterLocks([`exam:${examId.toLowerCase()}`],session);
      const exam=await CenterExam.findById(examId).session(session).lean<Ex>();
      if(!exam)throw Error('EXAM_UNAVAILABLE');
      if(exam.status==='published')return;
      const results=await CenterExamResult.find({exam:exam._id}).session(session).lean<Row[]>();
      if(!results.length)throw Error('NO_RESULTS');
      const byClass=new Map<string,Row[]>();
      for(const row of results){const key=String(row.classGroup||'');const list=byClass.get(key)||[];list.push(row);byClass.set(key,list)}
      for(const [,list] of byClass){
        const positions=new Map<string,number>();
        [...list].filter(row=>row.grade!=='ABSENT').sort((a,b)=>(b.total??0)-(a.total??0)).forEach((row,index)=>{
          const ahead=list.filter(other=>other.grade!=='ABSENT'&&(other.total??0)>(row.total??0)).length;
          positions.set(String(row._id),index===0?1:ahead+1);
        });
        for(const row of list){
          const position=positions.get(String(row._id));
          await CenterExamResult.updateOne({_id:row._id},position?{$set:{position}}:{$unset:{position:1}},{session,runValidators:true});
        }
      }
      await CenterExam.updateOne({_id:examId,status:'draft'},{$set:{status:'published'}},{session,runValidators:true});
      published=true;
      await CenterActivityLog.create([{actor,action:'exam.publish',target:examId,after:{results:results.length,classes:byClass.size}}],{session});
    });
    return {published};
  }finally{await session.endSession()}
}
/**
 * Take a published exam back to draft.
 *
 * The only door back into a result, and it is logged with the count of results it unfroze: a published
 * result may already have been sent to a guardian by SMS, so correcting one is an act somebody should be
 * able to see was done, by whom and when.
 */
export async function unpublishCenterExam(examId:string,actor:string){
  if(!mongoose.isValidObjectId(examId)||!mongoose.isValidObjectId(actor))throw Error('INVALID_REQUEST');
  const session=await mongoose.startSession();
  try{
    await session.withTransaction(async()=>{
      await acquireCenterLocks([`exam:${examId.toLowerCase()}`],session);
      const exam=await CenterExam.findById(examId).session(session).lean<Ex>();
      if(!exam)throw Error('EXAM_UNAVAILABLE');
      if(exam.status!=='published')return;
      const results=await CenterExamResult.countDocuments({exam:exam._id}).session(session);
      await CenterExam.updateOne({_id:examId,status:'published'},{$set:{status:'draft'}},{session,runValidators:true});
      await CenterActivityLog.create([{actor,action:'exam.unpublish',target:examId,after:{results}}],{session});
    });
  }finally{await session.endSession()}
}
