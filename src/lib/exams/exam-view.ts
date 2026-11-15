/**
 * R5 · Exams — the read side: what an exam screen is allowed to see, assembled once.
 *
 * Two screens show the same exam (the owner's `/admin/center-exams/[id]` and the teacher's
 * `/teacher/exams/[id]`), and the numbers on them must agree, so the view is built here rather than in
 * either page. The scope is an argument, not an afterthought: a teacher's view is filtered to the class
 * groups assigned to them BEFORE anything is read, so a class they do not take never reaches the page —
 * not its students, not its marks, not its averages.
 *
 * What this module deliberately does not read: fees, payments, receipts, dues, the cashbook. An exam view
 * has no reason to touch a ledger, and the brief's rule that a teacher never sees payment data is kept
 * here by never asking for it — a field nobody queries cannot leak.
 */
import mongoose from 'mongoose';
import {CenterClassGroup,CenterExam,CenterExamResult,CenterGradingScale,CenterStudent} from '../../models/CenterRecords';
import {scopeClasses,scopeCoversClass,type ExamScope} from './exam-scope';
import {classSummary,type ClassSummary,type SummaryRow} from './grading';
import {resultMessage,type ResultMessageValues} from './result-message';

/** A class group as a screen names it: the name in the page's language plus the session year. */
export interface ViewClass{id:string;name:string}
export interface ViewSubject{id:string;name:string;full:number;pass:number}
export interface ViewBand{min:number;label:string;point:number}
export interface ViewStudent{
  id:string;name:string;studentId:string;roll:string;version:number;
  marks:Record<string,{obtained:number|null;absent:boolean}>;
}
export interface ViewResult{
  id:string;studentId:string;name:string;classId:string;
  marks:Record<string,{obtained:number|null;absent:boolean}>;
  total:number;fullTotal:number;percentage:number;grade:string;point:number;position:number|null;
}
export interface ExamListView{id:string;name:string;type:string;date:string;status:string;classes:string[];results:number}

interface ExamDoc{
  _id:mongoose.Types.ObjectId;name:{bn:string;en?:string};type:string;date:string;status:string;
  scaleName?:string;classGroups:mongoose.Types.ObjectId[];
  subjects:{_id:mongoose.Types.ObjectId;name:{bn:string;en?:string};fullMarks:number;passMarks:number}[];
  gradeBands:{min:number;label:string;point?:number}[];
}
interface ResultDoc{
  _id:mongoose.Types.ObjectId;student:mongoose.Types.ObjectId;classGroup?:mongoose.Types.ObjectId;
  revision?:number;marks:{subject:mongoose.Types.ObjectId;obtained:number|null;absent:boolean}[];
  total:number;fullTotal:number;percentage:number;grade:string;point?:number;position?:number;absent?:boolean;
}
interface StudentDoc{_id:mongoose.Types.ObjectId;studentId:string;name:{bn:string;en?:string};roll?:string;classGroup:mongoose.Types.ObjectId}

const localName=(name:{bn:string;en?:string},locale:string):string=>(locale==='en'?name.en||name.bn:name.bn)||name.bn;

/* The classes this actor may see are the classes this actor may write: one function, in the scope module,
   answers both, so a read can never be narrower or wider than the write behind it. */
const visibleClasses=scopeClasses;

export interface ExamDetailView{
  id:string;name:string;type:string;date:string;status:string;scaleName:string;
  classes:ViewClass[];subjects:ViewSubject[];bands:ViewBand[];
  students:ViewStudent[];results:ViewResult[];summary:ClassSummary;
  /** True when the class is bigger than the grid is willing to hold at once (500 rows). */
  tooMany:boolean;
  /** True when this actor may enter marks: the exam is a draft and the class is theirs. */
  canWrite:boolean;
}

/** The row ceiling for one grid: a class beyond it is marked in pages, not scrolled forever. */
export const MAX_GRID_ROWS=500;

/**
 * One exam as one screen shows it.
 *
 * Returns `null` when the exam does not exist or this actor may not see a single one of its classes —
 * which is what makes a teacher asking for another class's exam by id get a not-found rather than a
 * grid of children they do not teach.
 */
export async function examDetailView(examId:string,scope:ExamScope,locale:string):Promise<ExamDetailView|null>{
  if(!mongoose.isValidObjectId(examId))return null;
  const exam=await CenterExam.findById(examId).lean<ExamDoc>();
  if(!exam)return null;
  const classIds=visibleClasses(scope,exam.classGroups);
  if(!classIds.length)return null;
  const groups=await CenterClassGroup.find({_id:{$in:classIds}}).select('name academicYear shift').lean<{_id:mongoose.Types.ObjectId;name:{bn:string;en?:string};academicYear:number;shift?:string}[]>();
  const students=await CenterStudent.find({classGroup:{$in:classIds},status:'active'}).select('studentId name roll classGroup')
    .sort({'name.bn':1,_id:1}).limit(MAX_GRID_ROWS+1).lean<StudentDoc[]>();
  const results=await CenterExamResult.find({exam:exam._id,classGroup:{$in:classIds}})
    .select('student classGroup marks total fullTotal percentage grade point position revision')
    .limit(MAX_GRID_ROWS+1).lean<ResultDoc[]>();
  const subjects:ViewSubject[]=exam.subjects.map(subject=>({
    id:String(subject._id),name:localName(subject.name,locale),full:subject.fullMarks,pass:subject.passMarks,
  }));
  const byResult=new Map(results.map(row=>[String(row.student),row]));
  const viewStudents:ViewStudent[]=students.map(student=>{
    const row=byResult.get(String(student._id));
    return {
      id:String(student._id),name:localName(student.name,locale),studentId:String(student.studentId||''),
      roll:String(student.roll||''),version:row?row.revision??0:-1,
      marks:Object.fromEntries((row?.marks||[]).map(mark=>[String(mark.subject),{obtained:mark.absent?null:mark.obtained,absent:!!mark.absent}])),
    };
  });
  const names=new Map(students.map(student=>[String(student._id),localName(student.name,locale)]));
  const viewResults:ViewResult[]=results.map(row=>({
    id:String(row._id),studentId:String(row.student),
    name:names.get(String(row.student))||'',classId:String(row.classGroup||''),
    marks:Object.fromEntries((row.marks||[]).map(mark=>[String(mark.subject),{obtained:mark.absent?null:mark.obtained,absent:!!mark.absent}])),
    total:row.total??0,fullTotal:row.fullTotal??0,percentage:row.percentage??0,grade:String(row.grade||''),
    point:row.point??0,position:row.grade==='ABSENT'?null:row.position??null,
  }));
  // The summary is the stored results' own, so what the owner reads here is what was written, not what
  // the grid happens to hold in a browser tab.
  const summaryRows:SummaryRow[]=results.map(row=>({
    total:row.total??0,grade:String(row.grade||''),
    marks:(row.marks||[]).map(mark=>({subject:String(mark.subject),obtained:mark.absent?null:mark.obtained,absent:!!mark.absent})),
  }));
  return {
    id:String(exam._id),name:localName(exam.name,locale),type:exam.type,date:exam.date,status:exam.status,
    scaleName:String(exam.scaleName||''),
    classes:groups.map(group=>({id:String(group._id),name:`${localName(group.name,locale)}${group.shift?` · ${group.shift}`:''} · ${group.academicYear}`})),
    subjects,
    bands:[...exam.gradeBands].sort((a,b)=>b.min-a.min).map(band=>({min:band.min,label:band.label,point:band.point??0})),
    students:viewStudents,results:viewResults,summary:classSummary(summaryRows,subjects.map(subject=>({id:subject.id,full:subject.full,pass:subject.pass})),viewStudents.length),
    tooMany:students.length>MAX_GRID_ROWS||results.length>MAX_GRID_ROWS,
    canWrite:exam.status==='draft',
  };
}

export interface ExamListFilters{type?:string;status?:string;classId?:string}

/**
 * The exam list this actor may see, filtered and paged.
 *
 * A teacher's list is narrowed to their classes before the query runs, so the count beside the heading is
 * the count of THEIR exams and not the centre's — a number that included other classes would tell a
 * teacher about exams they have no business knowing exist.
 */
export async function examListView(scope:ExamScope,filters:ExamListFilters,page:number,locale:string):Promise<{exams:ExamListView[];total:number;page:number;pages:number}>{
  const where:Record<string,unknown>={};
  if(filters.type)where.type=filters.type;
  if(filters.status==='draft'||filters.status==='published')where.status=filters.status;
  if(scope.classGroups){
    const classes=filters.classId&&scope.classGroups.includes(filters.classId)?[filters.classId]:scope.classGroups;
    where.classGroups={$in:classes};
  }else if(filters.classId&&mongoose.isValidObjectId(filters.classId))where.classGroups=filters.classId;
  const perPage=20,safePage=Math.min(Math.max(1,Number.isSafeInteger(page)?page:1),10000);
  const [docs,total]=await Promise.all([
    CenterExam.find(where).select('name date type status classGroups').sort({date:-1,_id:-1})
      .skip((safePage-1)*perPage).limit(perPage).lean<ExamDoc[]>(),
    CenterExam.countDocuments(where),
  ]);
  const ids=[...new Set(docs.flatMap(doc=>doc.classGroups.map(group=>String(group))))]
    .filter(id=>scopeCoversClass(scope,id));
  const groups=ids.length
    ? await CenterClassGroup.find({_id:{$in:ids}}).select('name academicYear').lean<{_id:mongoose.Types.ObjectId;name:{bn:string;en?:string};academicYear:number}[]>()
    : [];
  const names=new Map(groups.map(group=>[String(group._id),`${localName(group.name,locale)} ${group.academicYear}`.trim()]));
  const counts=new Map(
    (await CenterExamResult.aggregate<{_id:mongoose.Types.ObjectId;count:number}>([
      {$match:{exam:{$in:docs.map(doc=>doc._id)}}},{$group:{_id:'$exam',count:{$sum:1}}},
    ])).map(row=>[String(row._id),row.count]),
  );
  const exams:ExamListView[]=docs.map(doc=>({
    id:String(doc._id),name:localName(doc.name,locale),type:doc.type,date:doc.date,status:doc.status,
    classes:doc.classGroups.map(group=>names.get(String(group))||'—').filter(Boolean),
    results:counts.get(String(doc._id))||0,
  }));
  return {exams,total,page:safePage,pages:Math.max(1,Math.ceil(total/perPage))};
}

/** One published result, as the per-student chips of a result SMS: `null` for a row with nothing to report. */
export interface ExamResultMessage{classId:string;studentId:string;values:ResultMessageValues}

/**
 * R5 slice 2 · The per-student half of a result SMS, read from the rows publishing wrote.
 *
 * `autoSendClassResults` calls this once for the exam and then attaches each bag to the candidate whose
 * `_id` it names, so the message a family receives quotes that child's own marks, total and position —
 * not the class's. The sentence itself is built in `result-message.ts`, which is pure and proved there;
 * this is only the fetch and the keying.
 *
 * No locale and no scope: the template catalog is Bangla, so the exam and subject names are read in Bangla
 * whatever the operator's language is, and the send is already narrowed to one class by its caller — a
 * scope argument here would only be a second way to be wrong. A draft exam returns nothing because it has
 * no positions yet, and an absent or unranked row is left out rather than turned into a message about it.
 */
export async function resultMessagesForExam(examId:string):Promise<ExamResultMessage[]>{
  if(!mongoose.isValidObjectId(examId))return [];
  const exam=await CenterExam.findById(examId).select('name subjects status').lean<ExamDoc>();
  if(!exam||exam.status!=='published')return [];
  const subjects=(exam.subjects||[])
    .map(subject=>({id:String(subject._id),name:(subject.name?.bn||'').trim()}))
    .filter(subject=>!!subject.name);
  const examName=localName(exam.name,'bn');
  const results=await CenterExamResult.find({exam:exam._id})
    .select('student classGroup marks total fullTotal grade position absent').lean<ResultDoc[]>();
  return results.flatMap(row=>{
    const absent=!!row.absent||row.grade==='ABSENT';
    const values=resultMessage({
      examName,subjects,
      marks:(row.marks||[]).map(mark=>({subject:String(mark.subject),obtained:mark.absent?null:mark.obtained,absent:!!mark.absent})),
      // A stored total is quoted, never recomputed here: the message and the result table have to agree.
      total:absent?null:row.total??null,fullTotal:absent?null:row.fullTotal??null,
      position:absent?null:row.position??null,absent,
    });
    if(!values)return [];
    return [{classId:String(row.classGroup||''),studentId:String(row.student),values}];
  });
}

/** The active saved scales, for the exam form's scale picker. */
export async function gradingScales(){
  const scales=await CenterGradingScale.find({}).sort({active:-1,name:1}).limit(20)
    .lean<{_id:mongoose.Types.ObjectId;name:string;ranges:{min:number;max:number;grade:string;point:number}[];active:boolean}[]>();
  return scales.map(scale=>({
    id:String(scale._id),name:scale.name,active:scale.active,
    ranges:scale.ranges.map(range=>({min:range.min,max:range.max,grade:range.grade,point:range.point})),
  }));
}
