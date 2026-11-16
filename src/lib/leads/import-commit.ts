/**
 * R3 · Visitor import — the write half: commit, history, undo.
 *
 * The commit re-runs the very preview the owner just read, this time with their decisions and with a
 * live index of the collection, so what lands is exactly what was shown and a row that is already on
 * file is matched instead of doubled. That is the idempotent re-import: upload the same file twice and
 * the second pass writes nothing, because every number (or name and day) finds its lead first.
 *
 * Each written row goes through `createSheetLead`, the importer's write from wave A: it keeps the
 * number as written beside its normalized form, stores every doubt as a flag pair, makes the Bangla
 * comment the first note, and inherits or mints the `familyKey` — so siblings arriving in one file end
 * up in one family without a second rule here.
 *
 * Undo is the batch, not the row: it bins every lead the batch created that has not since been
 * converted to an admission, a trial or a student, through the same Recycle Bin path a hand delete
 * uses, and marks the batch undone with the reason. A batch whose leads were converted stays
 * standing — an undo must not reach through a conversion into somebody's intake record.
 */
import {randomBytes} from 'node:crypto';
import {Lead} from '@/models/Lead';
import {LeadImportBatch} from '@/models/LeadImportBatch';
import {softDelete} from '@/lib/admin/recycle';
import {audit} from '@/lib/admin/helpers';
import {createSheetLead,type Refusal,type SheetLeadInput} from './leads';
import type {LeadFlagRow} from '@/models/Lead';
import {
  previewLeadImport,flagPair,leadNameKey,
  type LeadImportDecision,type LeadImportPreview,type LeadImportRow,type LeadSheetGrid,
} from './import-preview';

const refuse=(code:string,messageKey:string,messageParams:Record<string,string|number>={}):Refusal=>
  ({ok:false,code,messageKey,messageParams});

export interface LeadImportCommitOk{
  ok:true;batch:string;created:number;matched:number;skipped:number;blocked:number;siblings:number;leadIds:string[];
}
export type LeadImportCommitResult=LeadImportCommitOk|Refusal;

/** The live index the second preview pass matches against: numbers, and names tied to a day. */
async function existingIndex(rows:LeadImportRow[]):Promise<{phones:Record<string,string>;names:Record<string,string>}>{
  const norms=[...new Set(rows.flatMap(row=>row.phones.map(phone=>phone.normalized)))];
  const names=[...new Set(rows.map(row=>row.name).filter(Boolean))];
  const phones:Record<string,string>={},namesIndex:Record<string,string>={};
  if(norms.length){
    const holders=await Lead.find({deletedAt:null,'phones.normalized':{$in:norms}}).select('leadId studentName phones').lean<{leadId:string;studentName:string;phones:{normalized:string}[]}[]>();
    for(const holder of holders)for(const phone of holder.phones||[])if(norms.includes(phone.normalized))phones[phone.normalized]=`${holder.leadId} · ${holder.studentName}`;
  }
  if(names.length){
    const same=await Lead.find({deletedAt:null,studentName:{$in:names}}).select('leadId studentName date').lean<{leadId:string;studentName:string;date:string}[]>();
    for(const doc of same)namesIndex[`${leadNameKey(doc.studentName)}|${doc.date}`]=`${doc.leadId} · ${doc.studentName}`;
  }
  return {phones,names:namesIndex};
}

/** Flags the preview owns and `createSheetLead` will not re-derive: dates, phones, siblings, gaps. */
function carriedFlags(row:LeadImportRow):LeadFlagRow[]{
  return row.flags
    .filter(flag=>flag.field==='date'||flag.field==='phones'||(flag.field==='classLabel'&&flag.code==='missing'))
    .map(flag=>{
      const original=flag.field==='date'?row.dateRaw:flag.field==='phones'?row.phones.map(p=>p.original).join(', '):row.classLabel;
      return {field:flag.field,code:flag.code,original:original.slice(0,200),...flagPair(flag),suggested:flag.suggested};
    });
}

function toInput(row:LeadImportRow,batch:string,fileLabel:string):SheetLeadInput{
  return {
    date:String(row.dateDay),studentName:row.name,guardianName:row.guardian,
    phones:row.phones.map(phone=>({normalized:phone.normalized,original:phone.original})),
    classLabel:row.classLabel,classGroup:row.classGroup,newSession:row.newSession,exam:row.exam,examYear:row.examYear,
    school:row.school,group:row.group as SheetLeadInput['group'],shift:row.shift as SheetLeadInput['shift'],
    medium:row.medium as SheetLeadInput['medium'],source:row.source as SheetLeadInput['source'],
    interestedIn:row.interestedIn,
    status:/^(new|called|interested|trial_booked|admitted|not_interested|no_answer|do_not_contact)$/.test(row.statusFromSheet)?row.statusFromSheet as SheetLeadInput['status']:null,
    nextFollowUp:/^\d{4}-\d{2}-\d{2}$/.test(row.nextFollowUp)?row.nextFollowUp:null,
    notes:row.notes,flags:carriedFlags(row),
    importSource:`wizard:${fileLabel}`.slice(0,200),importBatch:batch,
    raw:{group:row.groupRaw||null,medium:row.mediumRaw||null,shift:row.shiftRaw||null,source:row.sourceRaw||null},
  };
}

export async function commitLeadImport(opts:{
  sheets:LeadSheetGrid[];decisions:LeadImportDecision;fileLabel:string;hash:string;
  actorId:string;actorName:string;now?:Date;
}):Promise<LeadImportCommitResult>{
  const now=opts.now||new Date();
  const first=previewLeadImport(opts.sheets,opts.decisions,{fileLabel:opts.fileLabel,hash:opts.hash,now});
  const previous=await LeadImportBatch.findOne({hash:opts.hash,undoneAt:null}).select('batch').lean<{batch:string}|null>();
  const preview:LeadImportPreview=previous
    ? previewLeadImport(opts.sheets,opts.decisions,{fileLabel:opts.fileLabel,hash:opts.hash,now,previousBatch:previous.batch,existing:await existingIndex(first.rows)})
    : first;
  const undecided=preview.rows.filter(row=>row.status==='decide');
  if(undecided.length)return refuse('IMPORT_UNDECIDED','import.errors.undecided',{count:undecided.length});
  const writable=preview.rows.filter(row=>row.status==='ready');
  if(!writable.length)return refuse('IMPORT_NOTHING','import.errors.nothing',{
    matched:preview.counts.matched,blocked:preview.counts.blocked,skipped:preview.counts.skipped});
  const stamp=`${now.getUTCFullYear()}${String(now.getUTCMonth()+1).padStart(2,'0')}${String(now.getUTCDate()).padStart(2,'0')}`;
  const batch=`LIM-${stamp}-${randomBytes(3).toString('hex')}`;
  const leadIds:string[]=[];
  let blocked=preview.counts.blocked;
  for(const row of writable){
    const result=await createSheetLead(toInput(row,batch,opts.fileLabel),opts.actorId,now);
    if(result.ok)leadIds.push(result.id);
    else blocked++;
  }
  await LeadImportBatch.create({
    batch,fileLabel:opts.fileLabel.slice(0,200),hash:opts.hash,rows:preview.counts.total,
    created:leadIds.length,matched:preview.counts.matched,skipped:preview.counts.skipped,blocked,siblings:preview.counts.siblings,
    actor:opts.actorId,actorName:opts.actorName.slice(0,120),at:now,undoneAt:null,undoBy:null,undoReason:'',
  });
  await audit(opts.actorId,'lead.import',batch);
  return {ok:true,batch,created:leadIds.length,matched:preview.counts.matched,skipped:preview.counts.skipped,blocked,siblings:preview.counts.siblings,leadIds};
}

export interface LeadImportBatchRow{
  batch:string;fileLabel:string;rows:number;created:number;matched:number;skipped:number;blocked:number;siblings:number;
  actorName:string;at:Date;undoneAt:Date|null;undoReason:string;
}

export async function leadImportHistory(limit=20):Promise<LeadImportBatchRow[]>{
  const docs=await LeadImportBatch.find().sort({at:-1}).limit(limit).lean<LeadImportBatchRow[]>();
  return docs;
}

export interface LeadImportUndoOk{ok:true;batch:string;removed:number;kept:number}
export type LeadImportUndoResult=LeadImportUndoOk|Refusal;

export async function undoLeadImport(batch:string,actorId:string,reason:string,now:Date=new Date()):Promise<LeadImportUndoResult>{
  const clean=String(batch||'').trim();
  if(!clean)return refuse('BATCH_NOT_FOUND','import.errors.batchNotFound');
  if(String(reason||'').trim().length<3)return refuse('UNDO_REASON','import.errors.undoReason');
  const doc=await LeadImportBatch.findOne({batch:clean});
  if(!doc)return refuse('BATCH_NOT_FOUND','import.errors.batchNotFound');
  if(doc.undoneAt)return refuse('ALREADY_UNDONE','import.errors.alreadyUndone');
  const latest=await LeadImportBatch.findOne({undoneAt:null}).sort({at:-1}).select('batch').lean<{batch:string}|null>();
  if(!latest||latest.batch!==clean)return refuse('NOT_LATEST','import.errors.notLatest');
  const leads=await Lead.find({importBatch:clean,deletedAt:null}).select('_id leadId admission trialBooking student').lean<{_id:unknown;leadId:string;admission:unknown;trialBooking:unknown;student:unknown}[]>();
  let removed=0;
  for(const lead of leads){
    if(lead.admission||lead.trialBooking||lead.student)continue;
    const result=await softDelete('lead',String(lead._id),actorId,now);
    if(result.status==='ok')removed++;
  }
  await LeadImportBatch.updateOne({batch:clean},{undoneAt:now,undoBy:actorId,undoReason:String(reason).trim().slice(0,300)});
  await audit(actorId,'lead.import.undo',clean);
  return {ok:true,batch:clean,removed,kept:leads.length-removed};
}
