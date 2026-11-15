'use server';
/**
 * R5 · Exams — the server actions behind the exam list, the marks grid and the grading scale.
 *
 * Three things this module is deliberate about:
 *
 *   • **The experimental write gate is gone.** `CENTER_EXAM_WRITE_ENABLED` existed while the exam screen
 *     was half-built, so a create could be refused with `DISABLED` no matter who asked. R5 finishes the
 *     screen, so writes are allowed in normal mode and the thing that decides who may write is the scope
 *     in `lib/exams/exam-scope` — a teacher only for the classes assigned to them, staff only to archive,
 *     an exam manager without the grading scale. Authorization by role, not by environment variable: a
 *     flag that is off in production and on in CI protects nothing and hides a real refusal.
 *   • **Every refusal is a catalog key plus its params.** An engine throws a code (`STALE_RESULT`,
 *     `SUBJECTS_LOCKED`, `CLASS_UNAVAILABLE`); this module turns the code into `exams.errors.*` and the
 *     screen paints the sentence in the operator's language. No string here is ever shown to a person.
 *   • **Digits are folded before they are parsed.** A teacher typing on a Bangla keyboard writes ৮০, and
 *     a sheet exported from a Bangla spreadsheet writes it too; both mean 80, and refusing either would
 *     be refusing the language the centre works in.
 */
import {createHash} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {scopeClasses,scopeCovers,type ExamScope} from '@/lib/exams/exam-scope';
import {getExamScope} from '@/lib/exams/exam-actor';
import {createCenterExam,updateCenterExam,publishCenterExam,unpublishCenterExam,saveCenterExamMarksBatch} from '@/lib/center/exam-batch';
import {CenterExam,CenterExamResult,CenterStudent,CenterClassGroup,CenterGradingScale} from '@/models/CenterRecords';
import {audit} from '@/lib/admin/helpers';
import {autoSendClassResults} from '@/lib/center/sms-dialog';
import {readWorkbook} from '@/lib/sheets/workbook';
import {previewMarksSheet,type RosterEntry} from '@/lib/exams/grid';
import {rangesToBands,bandsToRanges,DEFAULT_GRADING_RANGES,MAX_EXAM_SUBJECTS,MAX_EXAM_CLASSES,type GradeRange} from '@/lib/exams/vocab';
import {validateRanges} from '@/lib/exams/grading';
import type {ExamRefusal,ExamState,ExamShape,GridRow,MarksImportState} from '@/lib/exams/exam-state';
import {asciiDigits} from '@/lib/admin/format';

/** A sheet may be up to 5 MB: a class of 500 with eight subjects is nowhere near that. */
const MAX_SHEET_BYTES=5*1024*1024;
/** The most rows a preview carries back to the browser, so a wrong file cannot drown the screen. */
const MAX_PREVIEW_ROWS=500;

const digits=(value:FormDataEntryValue|null):string=>asciiDigits(String(value??'').trim());
const number=(value:FormDataEntryValue|null):number=>{const text=digits(value);return /^\d+$/.test(text)?Number(text):NaN};
const decimal=(value:FormDataEntryValue|null):number=>{const text=digits(value);return /^\d+(\.\d+)?$/.test(text)?Number(text):NaN};

/** Engine code → the catalog key that explains it, so a refusal reads as a sentence in both languages. */
const ENGINE_KEYS:Record<string,string>={
  UNAUTHORIZED:'errors.unauthorized',INVALID_ACTOR:'errors.unauthorized',INVALID_EXAM:'errors.invalidExam',
  REQUEST_CONFLICT:'errors.requestConflict',CLASS_UNAVAILABLE:'errors.classUnavailable',
  EXAM_UNAVAILABLE:'errors.examUnavailable',EXAM_PUBLISHED:'errors.examPublished',
  SUBJECTS_LOCKED:'errors.subjectsLocked',CLASS_HAS_RESULTS:'errors.classHasResults',
  STUDENT_UNAVAILABLE:'errors.studentUnavailable',STALE_RESULT:'errors.staleResult',
  INVALID_MARKS:'errors.invalidMarks',NO_RESULTS:'errors.noResults',INVALID_REQUEST:'errors.invalidExam',
  CONFIRM:'errors.confirm',NO_CLASS:'errors.noClass',NO_SUBJECT:'errors.noSubject',
  SCALE_NOT_FOUND:'errors.scaleNotFound',SCALE_NAME:'errors.scaleName',SCALE_INVALID:'errors.scaleInvalid',
  SCALE_DUPLICATE_GRADE:'errors.scaleDuplicateGrade',SCALE_MISSING_ZERO:'errors.scaleMissingZero',
  SCALE_MISSING_HUNDRED:'errors.scaleMissingHundred',SCALE_OVERLAP:'errors.scaleOverlap',SCALE_GAP:'errors.scaleGap',
  FILE_CHANGED:'errors.fileChanged',
};
const keyFor=(code:string):string=>ENGINE_KEYS[code]||'errors.failed';
const refused=(code:string,params:Record<string,string|number>={}):ExamState=>({status:'error',messageKey:keyFor(code),messageParams:params});

function refresh(examId?:string):void{
  for(const locale of ['bn','en']){
    revalidatePath(`/${locale}/admin/center-exams`);
    revalidatePath(`/${locale}/teacher/exams`);
    if(examId){
      revalidatePath(`/${locale}/admin/center-exams/${examId}`);
      revalidatePath(`/${locale}/teacher/exams/${examId}`);
    }
  }
}

/** The live scope, or an error state: every action asks before it reads a byte or a row. */
async function scope(needs:(scope:ExamScope)=>boolean):Promise<{scope:ExamScope}|{state:ExamState}>{
  const resolved=await getExamScope();
  if(!resolved||!needs(resolved))return {state:refused('UNAUTHORIZED')};
  return {scope:resolved};
}

/** Subjects as the form posts them: rows are positional, and a row with a name is a subject. */
function subjectsFromForm(form:FormData):{name:string;full:number;pass:number}[]{
  const subjects:{name:string;full:number;pass:number}[]=[];
  for(let index=0;index<MAX_EXAM_SUBJECTS;index+=1){
    const name=String(form.get(`subject-${index}`)||'').trim();
    if(!name&&!form.has(`full-${index}`))continue;
    subjects.push({name,full:number(form.get(`full-${index}`)),pass:number(form.get(`pass-${index}`))});
  }
  return subjects;
}

/**
 * Bands as the form posts them.
 *
 * Two ways in, one answer: pick a saved scale (the usual case, and the only way a centre keeps one idea
 * of what an A+ is), or type `min:label[:point]` lines for a one-off scale this exam alone uses. A line
 * with no point is given 0 rather than refused — a scale that cannot state its points still grades.
 */
function bandsFromForm(form:FormData):{bands:ExamShape['bands'];scaleName:string}{
  const typed=String(form.get('bands')||'').split('\n').filter(line=>line.trim()).map(line=>{
    /* i18n-scan-allow: the band parser accepts the Bangla digits a sheet author types, the same folding asciiDigits does */
    const parts=digits(line).split(':').map(part=>part.trim());
    return {min:Number(parts[0]),label:String(line.split(':').slice(1)[0]||'').trim(),point:decimal(parts[2]??null)};
  }).filter(band=>Number.isFinite(band.min)&&band.label);
  if(typed.length)return {bands:typed.map(band=>({min:band.min,label:band.label,point:Number.isFinite(band.point)?band.point:0})),scaleName:String(form.get('scaleName')||'').trim().slice(0,80)};
  return {bands:[],scaleName:''};
}

/** The scale an exam is created from: the chosen saved scale, or the standard Bangladeshi ranges. */
async function rangesFor(form:FormData):Promise<{ranges:GradeRange[];scaleName:string;error?:string}>{
  const scaleId=String(form.get('scaleId')||'').trim();
  if(scaleId){
    const saved=await CenterGradingScale.findById(scaleId).lean<{name:string;ranges:GradeRange[]}|null>();
    if(!saved)return {ranges:[],scaleName:'',error:'SCALE_NOT_FOUND'};
    return {ranges:saved.ranges.map(range=>({min:range.min,max:range.max,grade:range.grade,point:range.point})),scaleName:saved.name};
  }
  const typed=bandsFromForm(form);
  if(typed.bands.length)return {ranges:bandsToRanges(typed.bands),scaleName:typed.scaleName};
  return {ranges:DEFAULT_GRADING_RANGES,scaleName:'default'};
}

const classIdsFrom=(form:FormData):string[]=>{
  const all=form.getAll('classId').map(value=>String(value).trim()).filter(Boolean);
  if(all.length)return [...new Set(all)].slice(0,MAX_EXAM_CLASSES);
  const single=String(form.get('classId')||'').trim();
  return single?[single]:[];
};

/** The exam as the form describes it: shape, classes, subjects, and the scale snapshotted into bands. */
async function shapeFromForm(form:FormData):Promise<ExamShape|{error:string}>{
  const resolved=await rangesFor(form);
  if(resolved.error)return {error:resolved.error};
  return {
    name:String(form.get('name')||'').trim().slice(0,120),
    date:String(form.get('date')||'').trim(),
    type:String(form.get('type')||'').trim(),
    classIds:classIdsFrom(form),
    subjects:subjectsFromForm(form),
    bands:rangesToBands(resolved.ranges),
    scaleName:resolved.scaleName,
  };
}

/** A create: the exam is a draft, its classes are checked, its scale is snapshotted into its bands. */
export async function createExamAction(_:ExamState,form:FormData):Promise<ExamState>{
  const actor=await scope(scope_=>scope_.manage);
  if('state' in actor)return actor.state;
  if(form.get('confirm')!=='YES')return refused('CONFIRM');
  try{
    const shape=await shapeFromForm(form);
    if('error' in shape)return refused(shape.error==='SCALE_NOT_FOUND'?'SCALE_NOT_FOUND':'INVALID_EXAM');
    if(!shape.classIds.length)return refused('NO_CLASS');
    if(!shape.subjects.length)return refused('NO_SUBJECT');
    const out=await createCenterExam({requestId:String(form.get('requestId')||''),...shape},actor.scope.userId);
    await audit(actor.scope.userId,'exam.create',out.id);
    refresh(out.id);
    return {status:'ok',id:out.id};
  }catch(error){return refused((error as Error).message)}
}

/** An edit: a draft only, and the engine decides what a stored result has frozen. */
export async function updateExamAction(_:ExamState,form:FormData):Promise<ExamState>{
  const actor=await scope(scope_=>scope_.manage);
  if('state' in actor)return actor.state;
  const examId=String(form.get('exam')||'').trim();
  if(!examId)return refused('INVALID_EXAM');
  const exam=await CenterExam.findById(examId).select('classGroups').lean<{classGroups:unknown[]}|null>();
  if(!exam)return refused('EXAM_UNAVAILABLE');
  if(!scopeCovers(actor.scope,exam.classGroups))return refused('UNAUTHORIZED');
  try{
    const shape=await shapeFromForm(form);
    if('error' in shape)return refused(shape.error==='SCALE_NOT_FOUND'?'SCALE_NOT_FOUND':'INVALID_EXAM');
    if(!shape.classIds.length)return refused('NO_CLASS');
    await updateCenterExam({examId,...shape},actor.scope.userId);
    await audit(actor.scope.userId,'exam.update',examId);
    refresh(examId);
    return {status:'ok',id:examId};
  }catch(error){return refused((error as Error).message)}
}

/**
 * The grid's autosave: every row the teacher changed, in one round trip.
 *
 * A row that went stale comes back named rather than silently dropped, because a stale row means a
 * second person is marking the same class and the teacher has to know their own edit did not land.
 */
export async function saveMarksBatchAction(_:ExamState,form:FormData):Promise<ExamState>{
  const actor=await scope(scope_=>true);
  if('state' in actor)return actor.state;
  const examId=String(form.get('exam')||'').trim();
  let rows:GridRow[]=[];
  try{rows=JSON.parse(String(form.get('rows')||'[]')) as GridRow[]}catch{return refused('INVALID_MARKS')}
  if(!examId||!Array.isArray(rows)||!rows.length)return refused('INVALID_MARKS');
  const exam=await CenterExam.findById(examId).select('classGroups status').lean<{classGroups:unknown[];status:string}|null>();
  if(!exam)return refused('EXAM_UNAVAILABLE');
  /* Marks are not an act that speaks for the whole exam, so the question is not "does this actor reach
     every class of it" but "which of its classes are theirs" — a teacher who takes Nine A marks Nine A in
     an exam that also covers Nine B. An empty answer is the refusal, and the answer itself travels into the
     engine so the narrowing happens inside the write transaction rather than before it. */
  const allowed=scopeClasses(actor.scope,exam.classGroups);
  if(!allowed.length)return refused('UNAUTHORIZED');
  try{
    const out=await saveCenterExamMarksBatch({examId,rows,...(actor.scope.classGroups?{allowedClasses:allowed}:{})},actor.scope.userId);
    const refusals:ExamRefusal[]=out.rows.filter(row=>row.status!=='saved').map(row=>({
      studentId:row.studentId,reason:row.reason||row.status,messageKey:keyFor(row.reason||'INVALID_MARKS'),
    }));
    refresh(examId);
    return {status:refusals.length?'error':'ok',saved:out.saved,refusals,
      stale:out.rows.filter(row=>row.status==='stale').map(row=>row.studentId),
      ...(refusals.length?{messageKey:refusals[0].messageKey}:{})};
  }catch(error){return refused((error as Error).message)}
}

/** Publish: freeze the exam, write each class's positions, then offer the result SMS. */
export async function publishExamAction(_:ExamState,form:FormData):Promise<ExamState>{
  const actor=await scope(scope_=>scope_.publish);
  if('state' in actor)return actor.state;
  if(form.get('confirm')!=='YES')return refused('CONFIRM');
  const id=String(form.get('exam')||'').trim();
  const exam=await CenterExam.findById(id).select('classGroups').lean<{classGroups:unknown[]}|null>();
  if(!exam)return refused('EXAM_UNAVAILABLE');
  if(!scopeCovers(actor.scope,exam.classGroups))return refused('UNAUTHORIZED');
  try{
    await publishCenterExam(id,actor.scope.userId);
    // Automatic result SMS (a settings toggle, OFF by default). Publishing must succeed even when a
    // message cannot go out, so the send is best-effort and only logged — one class at a time, since a
    // result SMS is about a class's own students and their own positions.
    for(const group of exam.classGroups){
      try{await autoSendClassResults({exam:id,classGroup:String(group)})}
      catch(error){console.error('Automatic result SMS failed',(error as Error).message)}
    }
    refresh(id);
    return {status:'ok',id};
  }catch(error){return refused((error as Error).message)}
}

/** Unpublish: the only way back into a published result, and the log says who took it and how many rows. */
export async function unpublishExamAction(_:ExamState,form:FormData):Promise<ExamState>{
  const actor=await scope(scope_=>scope_.publish);
  if('state' in actor)return actor.state;
  if(form.get('confirm')!=='YES')return refused('CONFIRM');
  const id=String(form.get('exam')||'').trim();
  const exam=await CenterExam.findById(id).select('classGroups').lean<{classGroups:unknown[]}|null>();
  if(!exam)return refused('EXAM_UNAVAILABLE');
  if(!scopeCovers(actor.scope,exam.classGroups))return refused('UNAUTHORIZED');
  try{
    await unpublishCenterExam(id,actor.scope.userId);
    await audit(actor.scope.userId,'exam.unpublish',id);
    refresh(id);
    return {status:'ok',id};
  }catch(error){return refused((error as Error).message)}
}

/**
 * Save the centre's grading scale.
 *
 * Ranges are validated as a scale before anything is written: they must cover 0 to 100 with no gap and
 * no overlap, because a percentage that falls in a hole has no grade, and a percentage in two ranges has
 * two. Marking one scale active makes it the default for the next exam; exams already created keep the
 * bands they snapshotted, so a result published in March never changes meaning in December.
 */
export async function saveGradingScaleAction(_:ExamState,form:FormData):Promise<ExamState>{
  const actor=await scope(scope_=>scope_.scale);
  if('state' in actor)return actor.state;
  const scaleId=String(form.get('scale')||'').trim();
  const name=String(form.get('name')||'').trim().slice(0,100);
  if(!name)return refused('SCALE_NAME');
  let ranges:GradeRange[]=[];
  try{ranges=JSON.parse(String(form.get('ranges')||'[]')) as GradeRange[]}catch{return refused('SCALE_INVALID')}
  const checked=validateRanges(ranges);
  if(checked.error)return refused(checked.error,checked.params||{});
  try{
    if(scaleId){
      const updated=await CenterGradingScale.updateOne({_id:scaleId},{$set:{name,ranges:checked.ranges,active:form.get('active')==='YES'}},{runValidators:true});
      if(!updated.modifiedCount&&!updated.matchedCount)return refused('SCALE_NOT_FOUND');
      if(form.get('active')==='YES')await CenterGradingScale.updateMany({_id:{$ne:scaleId}},{$set:{active:false}});
      await audit(actor.scope.userId,'grading.update',scaleId);
    }else{
      const active=form.get('active')==='YES';
      if(active)await CenterGradingScale.updateMany({},{$set:{active:false}});
      const [created]=await CenterGradingScale.create([{name,ranges:checked.ranges,active}]);
      await audit(actor.scope.userId,'grading.create',String(created._id));
    }
    for(const locale of ['bn','en'])revalidatePath(`/${locale}/admin/grading-scale`);
    return {status:'ok'};
  }catch(error){return refused((error as Error).message)}
}

/** The roster an upload may be matched against: the students of the exam's own classes, and no others. */
async function rosterFor(examId:string,actorScope:ExamScope):Promise<{entries:RosterEntry[];subjects:{id:string;name:string;nameEn?:string;full:number}[];classes:string[]}|null>{
  const exam=await CenterExam.findById(examId).select('subjects classGroups').lean<{subjects:{_id:unknown;name:{bn:string;en?:string};fullMarks:number}[];classGroups:unknown[]}|null>();
  if(!exam)return null;
  /* The roster an upload is matched against is the actor's slice of the exam, and nothing wider: a sheet
     naming a student of another teacher's class comes back unmatched and listed, which is the honest
     answer, instead of matching a child the uploader has no business writing marks for. */
  const classes=scopeClasses(actorScope,exam.classGroups);
  if(!classes.length)return null;
  const students=await CenterStudent.find({classGroup:{$in:classes},status:'active'}).select('studentId name roll classGroup').sort({studentId:1}).lean<{_id:unknown;studentId:string;name:{bn:string;en?:string};roll?:string;classGroup:unknown}[]>();
  return {
    // The slice travels back with the roster, so a commit narrows its write by the same answer that
    // narrowed the match — one question, asked once, used for both.
    classes,
    subjects:exam.subjects.map(subject=>({id:String(subject._id),name:subject.name.bn,nameEn:subject.name.en,full:subject.fullMarks})),
    entries:students.map(student=>({
      id:String(student._id),studentId:String(student.studentId||''),
      name:String(student.name?.bn||''),nameEn:String(student.name?.en||''),roll:String(student.roll||''),
    })),
  };
}

/** Read the uploaded sheet, or answer with the refusal that explains why it could not be read. */
async function sheetsFrom(form:FormData):Promise<{sheets:{name:string;grid:unknown[][]}[];hash:string;name:string}|{state:MarksImportState}>{
  const file=form.get('file');
  if(!(file instanceof File)||!file.size)return {state:{status:'error',messageKey:'import.errors.noFile'}};
  if(file.size>MAX_SHEET_BYTES)return {state:{status:'error',messageKey:'import.errors.tooLarge'}};
  const buffer=Buffer.from(await file.arrayBuffer());
  try{
    return {sheets:await readWorkbook(file.name,buffer),hash:createHash('sha256').update(buffer).digest('hex'),name:file.name};
  }catch(error){
    const code=(error as {code?:string}).code;
    return {state:{status:'error',messageKey:code==='EMPTY_SHEET'?'import.errors.empty':'import.errors.notASheet'}};
  }
}

/**
 * The dry run of a marks upload: every row read, matched to a student or refused, nothing written.
 *
 * The answer carries the sheet's hash, and the commit must present the same file with the same hash —
 * so what the teacher reviewed is exactly what lands, even if the file on their disk changed meanwhile.
 */
export async function previewMarksAction(_:MarksImportState,form:FormData):Promise<MarksImportState>{
  const actor=await scope(scope_=>true);
  if('state' in actor)return actor.state;
  const examId=String(form.get('exam')||'').trim();
  const roster=await rosterFor(examId,actor.scope);
  if(!roster)return refused('EXAM_UNAVAILABLE');
  const read=await sheetsFrom(form);
  if('state' in read)return read.state;
  const preview=previewMarksSheet(read.sheets,{subjects:roster.subjects,roster:roster.entries,fileLabel:read.name});
  if(preview.refusal)return {status:'error',messageKey:preview.refusal.messageKey,hash:read.hash,fileLabel:read.name};
  return {
    status:'ok',hash:read.hash,fileLabel:preview.fileLabel,sheet:preview.sheet,
    studentColumn:preview.studentColumn,subjectColumns:preview.subjectColumns,unusedHeaders:preview.unusedHeaders,
    counts:preview.counts,
    rows:preview.rows.slice(0,MAX_PREVIEW_ROWS).map(row=>({
      row:row.row,status:row.status,statusKey:row.statusKey,
      studentId:row.student?.id||'',studentName:row.student?row.student.name:'',
      matches:row.matches.map(entry=>`${entry.studentId} ${entry.name}`.trim()),
      cells:row.cells.map(cell=>({
        subject:cell.subject,raw:cell.raw,ok:cell.read.ok===true,
        ...(cell.read.ok===false?{messageKey:cell.read.messageKey}:{}),
        full:roster.subjects.find(subject=>subject.id===cell.subject)?.full??0,
      })),
      refusals:row.refusals.map(refusal=>({messageKey:refusal.messageKey})),
    })),
  };
}

/**
 * Commit the upload the teacher just reviewed.
 *
 * Only the rows the preview called `ready` are written, and only for classes this actor may mark: a
 * teacher uploading a sheet that happens to name another class's student gets that row refused, not
 * written. The batch goes through the same revision-checked engine the grid uses, so an upload cannot
 * overwrite a mark a second teacher saved while the file was being read.
 */
export async function commitMarksAction(_:MarksImportState,form:FormData):Promise<MarksImportState>{
  const actor=await scope(scope_=>true);
  if('state' in actor)return actor.state;
  const examId=String(form.get('exam')||'').trim();
  const roster=await rosterFor(examId,actor.scope);
  if(!roster)return refused('EXAM_UNAVAILABLE');
  const read=await sheetsFrom(form);
  if('state' in read)return read.state;
  if(String(form.get('hash')||'')!==read.hash)return refused('FILE_CHANGED');
  const preview=previewMarksSheet(read.sheets,{subjects:roster.subjects,roster:roster.entries,fileLabel:read.name});
  if(preview.refusal)return {status:'error',messageKey:preview.refusal.messageKey};
  const revisions=new Map(
    (await CenterExamResult.find({exam:examId}).select('student revision').lean<{student:unknown;revision?:number}[]>())
      .map(row=>[String(row.student),row.revision??0]),
  );
  const rows:GridRow[]=preview.rows.filter(row=>row.status==='ready'&&row.student).map(row=>({
    studentId:row.student!.id,
    version:revisions.get(row.student!.id)??-1,
    marks:row.cells.map(cell=>{
      const read_=cell.read as {ok:true;obtained:number|null;absent:boolean};
      return {subject:cell.subject,obtained:read_.obtained,absent:read_.absent};
    }),
  }));
  if(!rows.length)return {status:'error',messageKey:'import.errors.nothingToSave',saved:0};
  try{
    /* The roster this sheet was matched against was already the actor's slice of the exam, so every row here
       is one of their students — and the slice is passed again anyway, because a commit is a write and the
       write is the place the wall belongs. */
    const out=await saveCenterExamMarksBatch({examId,rows,...(actor.scope.classGroups?{allowedClasses:roster.classes}:{})},actor.scope.userId);
    const refusals:ExamRefusal[]=out.rows.filter(row=>row.status!=='saved').map(row=>({
      studentId:row.studentId,reason:row.reason||row.status,messageKey:keyFor(row.reason||'INVALID_MARKS'),
    }));
    await audit(actor.scope.userId,'exam.import',examId);
    refresh(examId);
    return {status:out.saved?'ok':'error',saved:out.saved,refusals,fileLabel:read.name,
      ...(out.saved?{}:{messageKey:'import.errors.nothingSaved'})};
  }catch(error){return refused((error as Error).message)}
}
