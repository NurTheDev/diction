/**
 * R5 slice 2 · One student's results, read whole: the history a profile shows, the trend a chart draws,
 * the report card a family prints, and the portal's answer to "whose results may this session see?".
 *
 * What this module deliberately does not read: fees, payments, receipts, dues, the cashbook, guardian
 * numbers. The portal half of R5 slice 2 is a results screen for a student or a guardian, and the brief's
 * rule that a portal never shows payment data is kept here the only way that holds — by never asking for
 * it. The three portal routes that render this read `select()` lists below that name no ledger field, and
 * `tests/exam-results.integration.ts` serializes what comes back and fails on a payment word.
 *
 * Only **published** exams are ever returned. A draft is the operator's working paper: it has marks that
 * may still change and positions that publishing has not finished ranking, so a family reading one would be
 * reading a number the centre has not stood behind. That is one `status:'published'` in one query rather
 * than a filter applied in three places.
 */
import 'server-only';
import mongoose from 'mongoose';
import {CenterClassGroup,CenterExam,CenterExamResult,CenterStudent} from '@/models/CenterRecords';
import {User} from '@/models/User';
import {normalizePhone} from '@/lib/center/phone';
import {trendOf,type TrendExam,type TrendSeries} from './result-trend';

export interface ResultSubject{name:string;obtained:number|null;full:number;pass:number;absent:boolean}
export interface StudentResult{
  examId:string;name:string;type:string;date:string;className:string;
  subjects:ResultSubject[];
  total:number;fullTotal:number;percentage:number;grade:string;point:number;
  position:number|null;absent:boolean;
}
export interface StudentResultHistory{
  studentId:string;name:string;idLabel:string;roll:string;className:string;
  results:StudentResult[];
  trend:TrendSeries;
}
/** A student the signed-in portal account may see, and why: their own number, or the number they guard. */
export interface PortalStudent{id:string;name:string;relation:'self'|'child'}

interface ExamDoc{
  _id:mongoose.Types.ObjectId;name:{bn:string;en?:string};type:string;date:string;status:string;
  subjects:{_id:mongoose.Types.ObjectId;name:{bn:string;en?:string};fullMarks:number;passMarks:number}[];
}
interface RowDoc{
  _id:mongoose.Types.ObjectId;exam:mongoose.Types.ObjectId;classGroup?:mongoose.Types.ObjectId;
  marks:{subject:mongoose.Types.ObjectId;obtained:number|null;absent:boolean}[];
  total:number;fullTotal:number;percentage:number;grade:string;point?:number;position?:number;
}
const localName=(name:{bn:string;en?:string},locale:string):string=>(locale==='en'?name.en||name.bn:name.bn)||name.bn;

/**
 * The published results of one student, newest first, each with its own subject breakdown and the class it
 * was sat in — the class of the result row, not the class the student is in now, because a promoted child's
 * old report belongs to the class they were in when they sat it.
 */
export async function studentResultHistory(studentId:string,locale:string):Promise<StudentResultHistory|null>{
  if(!mongoose.isValidObjectId(studentId))return null;
  const student=await CenterStudent.findById(studentId).select('studentId name roll classGroup').lean<{
    _id:mongoose.Types.ObjectId;studentId:string;name:{bn:string;en?:string};roll?:string;classGroup:mongoose.Types.ObjectId}>();
  if(!student)return null;
  const rows=await CenterExamResult.find({student:student._id})
    .select('exam classGroup marks total fullTotal percentage grade point position').lean<RowDoc[]>();
  const results=await assembleResults(rows,locale);
  const group=await CenterClassGroup.findById(student.classGroup).select('name shift academicYear')
    .lean<{name:{bn:string;en?:string};shift?:string;academicYear?:number}>();
  const trendExams:TrendExam[]=results.map(result=>({
    id:result.examId,name:result.name,date:result.date,percentage:result.percentage,
    position:result.position,grade:result.grade,absent:result.absent,
  }));
  return {
    studentId:String(student._id),name:localName(student.name,locale),
    idLabel:String(student.studentId||''),roll:String(student.roll||''),
    className:group?className(group,locale):'',
    // The table reads newest first; the trend sorts itself oldest first, because a rise is a direction.
    results:results.sort((a,b)=>b.date.localeCompare(a.date)||b.name.localeCompare(a.name,'bn')),
    trend:trendOf(trendExams),
  };
}

export interface ReportCardData{result:StudentResult;student:{name:string;idLabel:string;roll:string;className:string}}
/**
 * One exam's report card, or the reason there is none. The two reasons are told apart because they mean
 * different things to the person reading: `NOT_PUBLISHED` is the centre still working, and `NO_RESULT` is
 * this child not being in that exam at all — a screen that said "not published" for both would send a
 * parent to ask about a result that was never going to exist.
 */
export interface ReportCardAnswer{card:ReportCardData|null;reason:'NOT_PUBLISHED'|'NO_RESULT'|null}

export async function studentReportCard(studentId:string,examId:string,locale:string):Promise<ReportCardAnswer>{
  const none=(reason:ReportCardAnswer['reason']):ReportCardAnswer=>({card:null,reason});
  if(!mongoose.isValidObjectId(studentId)||!mongoose.isValidObjectId(examId))return none('NO_RESULT');
  const student=await CenterStudent.findById(studentId).select('studentId name roll classGroup').lean<{
    _id:mongoose.Types.ObjectId;studentId:string;name:{bn:string;en?:string};roll?:string;classGroup:mongoose.Types.ObjectId}>();
  if(!student)return none('NO_RESULT');
  const exam=await CenterExam.findById(examId).select('status').lean<{status:string}>();
  if(!exam)return none('NO_RESULT');
  if(exam.status!=='published')return none('NOT_PUBLISHED');
  const row=await CenterExamResult.findOne({exam:examId,student:student._id})
    .select('exam classGroup marks total fullTotal percentage grade point position').lean<RowDoc>();
  if(!row)return none('NO_RESULT');
  const [result]=await assembleResults([row],locale);
  if(!result)return none('NOT_PUBLISHED');
  const group=await CenterClassGroup.findById(row.classGroup||student.classGroup).select('name shift academicYear')
    .lean<{name:{bn:string;en?:string};shift?:string;academicYear?:number}>();
  return {card:{result,student:{name:localName(student.name,locale),idLabel:String(student.studentId||''),roll:String(student.roll||''),className:group?className(group,locale):''}},reason:null};
}

/**
 * Which students a signed-in portal account may read. There is no stored link between a portal account and
 * a centre student — the identity evidence this product already trusts is the phone number: it is what the
 * result SMS is sent to, and what the operator typed for that child. So the same number answers here.
 *
 * A student account matches their own number; a guardian account matches the guardian or alternative number
 * on the child's record. The comparison is an exact one on the normalized number and nothing looser: a
 * student record's three phone fields are validated as `01[3-9]XXXXXXXX` when they are written, so there is
 * no `+880` spelling to catch, and a partial or pattern match would be a way to read somebody else's child.
 * Each row is re-checked through `normalizePhone` after the query anyway, because a rule this load-bearing
 * should not depend on one validation having been applied on the day the row was written.
 *
 * A removed student is left out: the centre has ended that record, and the rule that a removed student is
 * never contacted applies to what a portal shows as much as to what an SMS sends. The number is read from
 * the account here rather than passed in by a page, because a route that could hand this function somebody
 * else's phone could hand it somebody else's child.
 */
export async function portalResultStudents(user:{id:string;role:string}):Promise<PortalStudent[]>{
  if(user.role!=='student'&&user.role!=='parent')return [];
  const account=await User.findById(user.id).select('phone').lean<{phone?:string}>();
  const normalized=normalizePhone(String(account?.phone||''));
  if(!normalized)return [];
  const fields=user.role==='student'?['studentPhone']:['guardianPhone','altPhone'];
  const query=user.role==='student'
    ? {studentPhone:normalized,status:{$ne:'removed'}}
    : {$or:[{guardianPhone:normalized},{altPhone:normalized}],status:{$ne:'removed'}};
  const found=await CenterStudent.find(query).select('name studentPhone guardianPhone altPhone').limit(20)
    .lean<{_id:mongoose.Types.ObjectId;name:{bn:string;en?:string};studentPhone?:string;guardianPhone?:string;altPhone?:string}[]>();
  const matches=(value:unknown):boolean=>normalizePhone(String(value||''))===normalized;
  return found
    .filter(student=>fields.some(field=>matches((student as Record<string,unknown>)[field])))
    .map(student=>({id:String(student._id),name:localName(student.name,'bn'),relation:user.role==='student'?'self' as const:'child' as const}));
}

const className=(group:{name:{bn:string;en?:string};shift?:string;academicYear?:number},locale:string):string=>
  `${localName(group.name,locale)}${group.shift?` · ${group.shift}`:''}${group.academicYear?` · ${group.academicYear}`:''}`;

/** Stored rows into the shape every screen prints, keeping only rows whose exam is published. */
async function assembleResults(rows:RowDoc[],locale:string):Promise<StudentResult[]>{
  if(!rows.length)return [];
  const examIds=[...new Set(rows.map(row=>String(row.exam)))];
  const exams=await CenterExam.find({_id:{$in:examIds},status:'published'})
    .select('name type date subjects').lean<ExamDoc[]>();
  const byExam=new Map(exams.map(exam=>[String(exam._id),exam]));
  const groupIds=[...new Set(rows.map(row=>String(row.classGroup||'')).filter(Boolean))];
  const groups=await CenterClassGroup.find({_id:{$in:groupIds}}).select('name shift academicYear')
    .lean<{_id:mongoose.Types.ObjectId;name:{bn:string;en?:string};shift?:string;academicYear?:number}[]>();
  const byGroup=new Map(groups.map(group=>[String(group._id),group]));
  const out:StudentResult[]=[];
  for(const row of rows){
    const exam=byExam.get(String(row.exam));
    if(!exam)continue;
    // Absence is the grade the engine writes; the row itself has no absent flag.
    const absent=row.grade==='ABSENT';
    const marks=new Map((row.marks||[]).map(mark=>[String(mark.subject),mark]));
    const group=row.classGroup?byGroup.get(String(row.classGroup)):undefined;
    out.push({
      examId:String(exam._id),name:localName(exam.name,locale),type:exam.type,date:exam.date,
      className:group?className(group,locale):'',
      subjects:(exam.subjects||[]).map(subject=>{
        const mark=marks.get(String(subject._id));
        const subjectAbsent=!!mark?.absent;
        return {
          name:localName(subject.name,locale),
          obtained:subjectAbsent||mark?.obtained==null?null:mark.obtained,
          full:subject.fullMarks,pass:subject.passMarks,absent:subjectAbsent,
        };
      }),
      total:absent?0:row.total??0,fullTotal:row.fullTotal??0,percentage:absent?0:row.percentage??0,
      grade:String(row.grade||''),point:row.point??0,position:absent?null:row.position??null,absent,
    });
  }
  return out;
}
