/**
 * R4 · Teacher CV import — the write half: index, commit, history, undo.
 *
 * The commit re-runs the very preview the owner just read, this time with their decisions and with a
 * live index of the collection, so what lands is exactly what was shown and a CV that is already on
 * file is matched instead of doubled. That is the idempotent re-import: upload the same file twice and
 * the second pass writes nothing, because every number (or name and day) finds its CV first.
 *
 * A matched row is not thrown away either — it fills the gaps the existing CV has (an email, a
 * university, a subject cell that was blank) and records the fields it replaced, so undo can put them
 * back. Filling a gap is a change to a record somebody already read, which is why it is counted
 * separately from a created CV and shown as its own row status rather than folded into "updated".
 *
 * Undo is the batch, not the row: it bins every CV the batch created through the same Recycle Bin path
 * a hand delete uses — unless that CV has since been hired, because an undo must not reach through a
 * hiring into the Teachers module — and it restores the fields a gap-fill replaced. Then the batch is
 * marked undone with the reason, and only the newest standing batch can be undone at all.
 */
import {randomBytes} from 'node:crypto';
import mongoose from 'mongoose';
import {TeacherCandidate} from '@/models/TeacherCandidate';
import {TeacherImportBatch,type ITeacherImportItem} from '@/models/TeacherImportBatch';
import {softDelete} from '@/lib/admin/recycle';
import {audit} from '@/lib/admin/helpers';
import {addCandidateNote,createCandidate,updateCandidate,type CandidateUpdatePatch,type Refusal} from './candidates';
import {renderTeacherPair} from './teacher-message';
import {
  previewCvImport,emptyCvIndex,
  type CvExistingIndex,type CvImportDecision,type CvImportPreview,type CvImportRow,type CvSheetGrid,
} from './import-preview';

const refuse=(code:string,messageKey:string,messageParams:Record<string,string|number>={}):Refusal=>
  ({ok:false,code,messageKey,messageParams,...renderTeacherPair(messageKey,messageParams)});

export const nameKey=(name:string)=>name.toLowerCase().replace(/\s+/g,' ').trim();

/** The fields a matched row may fill, and how to tell whether the CV on file still lacks them. */
const GAP_FIELDS=['email','department','university','currentInstitute','subjectsText','availabilityText'] as const;

/**
 * What is already on file, narrowed to the CVs this sheet could possibly match: the ones holding one of
 * the sheet's numbers, and the ones written on one of the sheet's days. A CV bank is small, but reading
 * all of it to import twelve rows would still be the wrong shape of query.
 */
export async function loadCvIndex(rows:CvImportRow[],hash:string):Promise<CvExistingIndex>{
  const index:CvExistingIndex=emptyCvIndex();
  const phones=[...new Set(rows.flatMap(row=>row.phones.map(phone=>phone.normalized)))];
  const days=[...new Set(rows.map(row=>row.receivedDate).filter(Boolean))];
  const or=[];
  if(phones.length)or.push({'phones.normalized':{$in:phones}});
  if(days.length)or.push({receivedDate:{$in:days}});
  if(!or.length){index.hashSeen=await hashSeen(hash);return index}
  const docs=await TeacherCandidate.find({$or:or})
    .select('candidateId name receivedDate phones email department university currentInstitute subjectsText subjects classLevels availabilityText expectedSalary')
    .lean<Record<string,any>[]>();
  for(const doc of docs){
    const holder={id:String(doc._id),candidateId:String(doc.candidateId),name:String(doc.name)};
    for(const phone of (doc.phones||[]) as {normalized:string}[])index.byPhone[phone.normalized]=holder;
    index.byNameDay[`${nameKey(String(doc.name))}|${String(doc.receivedDate)}`]=holder;
    const gaps:Record<string,boolean>={};
    for(const field of GAP_FIELDS)gaps[field]=!String(doc[field]||'').trim();
    gaps.subjects=!(doc.subjects||[]).length;
    gaps.classLevels=!(doc.classLevels||[]).length;
    gaps.expectedSalary=doc.expectedSalary===null||doc.expectedSalary===undefined;
    index.gaps[holder.id]=gaps;
  }
  index.hashSeen=await hashSeen(hash);
  return index;
}
async function hashSeen(hash:string):Promise<boolean>{
  if(!hash)return false;
  return !!(await TeacherImportBatch.findOne({hash,undoneAt:null}).select('_id').lean<{_id:unknown}|null>());
}

/** The patch a matched row writes: only the fields the CV on file still lacks. */
function gapPatch(row:CvImportRow):Record<string,unknown>{
  const patch:Record<string,unknown>={};
  if(row.match?.fills.includes('email')&&row.email)patch.email=row.email;
  if(row.match?.fills.includes('department')&&row.department)patch.department=row.department;
  if(row.match?.fills.includes('university')&&row.university)patch.university=row.university;
  if(row.match?.fills.includes('currentInstitute')&&row.currentInstitute)patch.currentInstitute=row.currentInstitute;
  if(row.match?.fills.includes('subjectsText')&&row.subjectsText){
    patch.subjectsText=row.subjectsText;
    if(row.subjects.length)patch.subjects=row.subjects;
    if(row.classLevels.length)patch.classLevels=row.classLevels;
  }
  if(row.match?.fills.includes('availabilityText')&&row.availabilityText){
    patch.availabilityText=row.availabilityText;
    if(row.shifts.length)patch.shifts=row.shifts;
  }
  if(row.match?.fills.includes('expectedSalary')&&row.expectedSalary!==null)patch.expectedSalary=row.expectedSalary;
  return patch;
}

export interface CvImportCommitOk{ok:true;batch:string;created:number;updated:number;matched:number;blocked:number;skipped:number;flagged:number;ids:string[]}
export type CvImportCommitResult=CvImportCommitOk|Refusal;

export async function commitCvImport(opts:{
  sheets:CvSheetGrid[];decisions:CvImportDecision;fileLabel:string;hash:string;
  actorId:string;actorName:string;now?:Date;
}):Promise<CvImportCommitResult>{
  const now=opts.now||new Date();
  const first=previewCvImport(opts.sheets,opts.decisions,{fileLabel:opts.fileLabel,hash:opts.hash,now});
  const existing=await loadCvIndex(first.rows,opts.hash);
  const preview:CvImportPreview=previewCvImport(opts.sheets,opts.decisions,{fileLabel:opts.fileLabel,hash:opts.hash,now,existing});
  /* A date the sheet wrote and the reader doubts is not written until a hand has chosen: the preview
     offers a year, and guessing here would put a date in the bank that nobody accepted. This is the same
     gate the Visitors commit keeps, and the wizard's Save button is off for exactly this set of rows. */
  const undecided=preview.rows.filter(row=>row.suggestedDate&&row.dateRaw&&!opts.decisions.accept[row.key]);
  if(undecided.length)return refuse('IMPORT_UNDECIDED','errors.importUndecided',{count:undecided.length});
  const writable=preview.rows.filter(row=>row.status==='ready'||row.status==='flagged');
  const fillable=preview.rows.filter(row=>row.status==='updated');
  if(!writable.length&&!fillable.length){
    return refuse('IMPORT_NOTHING','errors.importNothing',{
      matched:preview.counts.matched,blocked:preview.counts.blocked,skipped:preview.counts.skipped});
  }
  const stamp=`${now.getUTCFullYear()}${String(now.getUTCMonth()+1).padStart(2,'0')}${String(now.getUTCDate()).padStart(2,'0')}`;
  const batch=`CIM-${stamp}-${randomBytes(3).toString('hex')}`;
  const items:ITeacherImportItem[]=[];
  const ids:string[]=[];
  let created=0,updated=0,blocked=preview.counts.blocked;

  for(const row of writable){
    const result=await createCandidate({
      name:row.name,phones:row.phones.map(phone=>phone.original||phone.normalized),email:row.email,
      department:row.department,university:row.university,currentInstitute:row.currentInstitute,
      subjectsText:row.subjectsText,subjects:row.subjects,classLevels:row.classLevels,
      availabilityText:row.availabilityText,shifts:row.shifts,expectedSalary:row.expectedSalary,
      source:row.source,receivedDate:row.receivedDate,
      importSource:`wizard:${opts.fileLabel}`.slice(0,200),importBatch:batch,
    },opts.actorId,now);
    if(result.ok===false){blocked+=1;items.push({row:row.row,candidate:null,action:'skipped',before:null});continue}
    created+=1;ids.push(result.id);
    items.push({row:row.row,candidate:new mongoose.Types.ObjectId(result.id),action:'created',before:null});
    // The sheet's own comment becomes the CV's first timeline note, exactly as a lead's does, and an
    // unrecognized subject word becomes a tag rather than a loss.
    if(row.notes)await addCandidateNote(result.id,row.notes,'',opts.actorId,now);
    if(row.tags.length)await updateCandidate(result.id,{tags:row.tags},opts.actorId);
  }

  for(const row of fillable){
    if(!row.match)continue;
    const patch=gapPatch(row);
    if(!Object.keys(patch).length){items.push({row:row.row,candidate:null,action:'skipped',before:null});continue}
    const before=await TeacherCandidate.findById(row.match.id).select([...GAP_FIELDS,'subjects','classLevels','shifts','expectedSalary']).lean<Record<string,any>|null>();
    const result=await updateCandidate(row.match.id,patch as CandidateUpdatePatch,opts.actorId);
    if(result.ok===false){blocked+=1;items.push({row:row.row,candidate:null,action:'skipped',before:null});continue}
    updated+=1;
    items.push({row:row.row,candidate:new mongoose.Types.ObjectId(row.match.id),action:'updated',
      before:before?Object.fromEntries(Object.entries(before).filter(([key])=>key!=='_id')):null});
  }

  await TeacherImportBatch.create({
    batch,fileLabel:opts.fileLabel.slice(0,200),hash:opts.hash,rows:preview.counts.rows,
    created,updated,skipped:preview.counts.skipped,flagged:preview.counts.flagged,items,
    actor:opts.actorId,actorName:opts.actorName.slice(0,120),at:now,undoneAt:null,undoBy:null,undoReason:'',
  });
  await audit(opts.actorId,'teacher-cv.import',batch);
  return {ok:true,batch,created,updated,matched:preview.counts.matched,blocked,skipped:preview.counts.skipped,flagged:preview.counts.flagged,ids};
}

export interface CvImportBatchRow{
  batch:string;fileLabel:string;rows:number;created:number;updated:number;skipped:number;flagged:number;
  at:Date;actorName:string;undoneAt:Date|null;undoReason:string;canUndo:boolean;
}

export async function cvImportHistory(limit=20):Promise<CvImportBatchRow[]>{
  const rows=await TeacherImportBatch.find({}).sort({at:-1}).limit(Math.min(Math.max(limit,1),50))
    .lean<Record<string,any>[]>();
  const latest=await TeacherImportBatch.findOne({undoneAt:null}).sort({at:-1}).select('batch').lean<{batch:string}|null>();
  return rows.map(row=>({
    batch:String(row.batch),fileLabel:String(row.fileLabel),rows:Number(row.rows)||0,created:Number(row.created)||0,
    updated:Number(row.updated)||0,skipped:Number(row.skipped)||0,flagged:Number(row.flagged)||0,
    at:new Date(row.at),actorName:String(row.actorName||''),
    undoneAt:row.undoneAt?new Date(row.undoneAt):null,undoReason:String(row.undoReason||''),
    canUndo:!row.undoneAt&&!!latest&&latest.batch===String(row.batch),
  }));
}

export interface CvImportUndoOk{ok:true;batch:string;binned:number;restored:number;kept:number}
export type CvImportUndoResult=CvImportUndoOk|Refusal;

export async function undoCvImport(batch:string,actorId:string,reason:string,now:Date=new Date()):Promise<CvImportUndoResult>{
  const clean=String(batch||'').trim();
  if(!clean)return refuse('BATCH_NOT_FOUND','errors.BATCH_NOT_FOUND');
  if(String(reason||'').trim().length<3)return refuse('UNDO_REASON','errors.UNDO_REASON');
  const doc=await TeacherImportBatch.findOne({batch:clean});
  if(!doc)return refuse('BATCH_NOT_FOUND','errors.BATCH_NOT_FOUND');
  if(doc.undoneAt)return refuse('ALREADY_UNDONE','errors.ALREADY_UNDONE');
  const latest=await TeacherImportBatch.findOne({undoneAt:null}).sort({at:-1}).select('batch').lean<{batch:string}|null>();
  if(!latest||latest.batch!==clean)return refuse('UNDO_NOT_LATEST','errors.UNDO_NOT_LATEST');

  let binned=0,restored=0,kept=0;
  for(const item of doc.items||[]){
    if(!item.candidate){kept+=1;continue}
    const id=String(item.candidate);
    if(item.action==='created'){
      const live=await TeacherCandidate.findById(id).select('hiredAsTeacherId').lean<{hiredAsTeacherId:unknown}|null>();
      // A CV that has been hired since is a hiring record now; the undo stops at it and says so.
      if(!live||live.hiredAsTeacherId){kept+=1;continue}
      const result=await softDelete('teacherCandidate',id,actorId,now);
      if(result.status==='ok')binned+=1;else kept+=1;
      continue;
    }
    if(item.action==='updated'&&item.before){
      const before=item.before as Record<string,unknown>;
      await TeacherCandidate.updateOne({_id:id},{$set:before} as mongoose.UpdateQuery<Record<string,any>>);
      restored+=1;
    }
  }
  await TeacherImportBatch.updateOne({batch:clean},{undoneAt:now,undoBy:actorId,undoReason:String(reason).trim().slice(0,300)});
  await audit(actorId,'teacher-cv.import.undo',clean);
  return {ok:true,batch:clean,binned,restored,kept};
}

