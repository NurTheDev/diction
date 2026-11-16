'use server';
/**
 * R4 · Teacher CV import wizard — the three server actions.
 *
 * The file travels by form post, never by URL: a teacher sheet is a list of names and numbers, and a
 * number in an address is a number in browser history and in every log between here and the proxy. The
 * preview answers with the dry run and nothing else; the commit posts the same file again with the
 * owner's decisions and its hash, so a file that changed on the way is refused instead of half-written.
 *
 * Every refusal is a catalog key inside `teacherCvs` plus its params — the wizard renders the sentence in
 * the reader's language. Access is `requireAdmin()` (Super Admin and Admin only), checked before a byte is
 * read: the CV bank is not a staff screen, and an import is the widest write it has.
 */
import {createHash} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {requireAdmin} from '@/lib/admin/guard';
import {audit} from '@/lib/admin/helpers';
import {
  emptyCvDecisions,emptyCvImportState,previewCvImport,readCvWorkbook,
  type CvImportDecision,type CvImportState,type CvSheetGrid,
} from '@/lib/teachers/import-preview';
import {commitCvImport,cvImportHistory,undoCvImport} from '@/lib/teachers/import-commit';

/** The brief's ceiling for an attached CV, applied to the sheet as well: 5 MB is a lot of rows. */
const MAX_BYTES=5*1024*1024;

function refreshCvs():void{
  for(const locale of ['bn','en']){
    revalidatePath(`/${locale}/admin/teacher-cvs`);
    revalidatePath(`/${locale}/admin/teacher-cvs/find`);
    revalidatePath(`/${locale}/admin/teacher-cvs/import`);
  }
}

async function sheetsFromForm(form:FormData,state:CvImportState):Promise<{sheets:CvSheetGrid[];hash:string;name:string}|null>{
  const file=form.get('file');
  if(!(file instanceof File)||!file.size){state.errorKey='errors.NO_FILE';return null}
  if(file.size>MAX_BYTES){state.errorKey='errors.FILE_TOO_LARGE';return null}
  const buffer=Buffer.from(await file.arrayBuffer());
  let sheets:CvSheetGrid[];
  try{sheets=await readCvWorkbook(file.name,buffer)}
  catch(error){
    state.errorKey=(error as {code?:string}).code==='EMPTY_SHEET'?'errors.SHEET_EMPTY':'errors.BAD_SHEET_TYPE';
    return null;
  }
  return {sheets,hash:createHash('sha256').update(buffer).digest('hex'),name:file.name};
}

function decisionsFromForm(form:FormData):CvImportDecision{
  try{
    const parsed=JSON.parse(String(form.get('decisions')||'{}')) as Partial<CvImportDecision>;
    return {mapping:parsed.mapping||{},accept:parsed.accept||{},skip:parsed.skip||{}};
  }catch{return emptyCvDecisions()}
}

/** The dry run: read the sheet, map what can be mapped, ask about the rest, write nothing. */
export async function previewCvSheet(_:CvImportState|null,form:FormData):Promise<CvImportState>{
  const state=emptyCvImportState();
  try{
    await requireAdmin();
    const read=await sheetsFromForm(form,state);
    if(!read)return state;
    state.preview=previewCvImport(read.sheets,emptyCvDecisions(),{fileLabel:read.name,hash:read.hash});
    state.decisions=emptyCvDecisions();
  }catch{state.errorKey='errors.UNKNOWN'}
  return state;
}

/** The write: the same preview, re-run with the owner's decisions and a live index, then one CV per row. */
export async function commitCvSheet(_:CvImportState|null,form:FormData):Promise<CvImportState>{
  const state=emptyCvImportState();
  try{
    const actor=await requireAdmin();
    const read=await sheetsFromForm(form,state);
    if(!read)return state;
    const expected=String(form.get('hash')||'');
    if(expected&&expected!==read.hash){state.errorKey='errors.HASH_CHANGED';return state}
    const decisions=decisionsFromForm(form);
    const result=await commitCvImport({sheets:read.sheets,decisions,fileLabel:read.name,hash:read.hash,
      actorId:String(actor.id),actorName:String(actor.name||'')});
    if(!result.ok){state.errorKey=result.messageKey;state.errorParams=result.messageParams||{};return state}
    state.preview=previewCvImport(read.sheets,decisions,{fileLabel:read.name,hash:read.hash});
    state.decisions=decisions;
    state.result={batch:result.batch,created:result.created,updated:result.updated,matched:result.matched,
      blocked:result.blocked,skipped:result.skipped,flagged:result.flagged};
    await audit(String(actor.id),'teacher-cv.import.commit',result.batch);
    refreshCvs();
  }catch{state.errorKey='errors.UNKNOWN'}
  return state;
}

/** Undo the latest batch: bin what it created, put back what it filled in, keep what has been hired. */
export async function undoCvSheet(_:CvImportState|null,form:FormData):Promise<CvImportState>{
  const state=emptyCvImportState();
  try{
    const actor=await requireAdmin();
    const batch=String(form.get('batch')||'');
    const result=await undoCvImport(batch,String(actor.id),String(form.get('reason')||''));
    if(!result.ok){state.errorKey=result.messageKey;state.errorParams=result.messageParams||{};return state}
    state.undone={batch:result.batch,binned:result.binned,restored:result.restored,kept:result.kept};
    await audit(String(actor.id),'teacher-cv.import.undo',result.batch);
    refreshCvs();
  }catch{state.errorKey='errors.UNKNOWN'}
  return state;
}

/** The last twenty batches, for the history panel under the wizard. */
export async function reloadCvImportHistory():Promise<{ok:true;history:Awaited<ReturnType<typeof cvImportHistory>>}|{ok:false;message:string}>{
  try{
    await requireAdmin();
    return {ok:true,history:await cvImportHistory(20)};
  }catch{return {ok:false,message:''}}
}
