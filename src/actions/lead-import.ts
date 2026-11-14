'use server';
/**
 * R3 · Visitor import wizard — the three server actions.
 *
 * The file travels by form post, never by URL: a visitor sheet is a list of names and numbers, and a
 * number in an address is a number in browser history and in every log between here and the proxy.
 * The preview answers with the dry run and nothing else; the commit posts the same file again with the
 * owner's decisions and its hash, so a file that changed on the way is refused instead of half-written.
 *
 * Every refusal is a catalog key under `leads.import.errors` plus its params — the wizard renders the
 * sentence in the reader's language, exactly like the paysheet import does. Access is `requireArchiver`
 * (Admin and Staff; Teachers have no visitors access at all), checked before a byte is read.
 */
import {createHash} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {requireArchiver} from '@/lib/admin/guard';
import {
  emptyLeadDecisions,emptyLeadImportState,previewLeadImport,readLeadWorkbook,
  type LeadImportDecision,type LeadImportState,type LeadSheetGrid,
} from '@/lib/leads/import-preview';
import {commitLeadImport,undoLeadImport} from '@/lib/leads/import-commit';

const MAX_BYTES=8*1024*1024;

function refreshLeads():void{
  for(const locale of ['bn','en']){revalidatePath(`/${locale}/admin/leads`);revalidatePath(`/${locale}/admin`)}
}

async function sheetsFromForm(form:FormData,state:{errorKey:string|null;errorParams:Record<string,string|number>}):Promise<{sheets:LeadSheetGrid[];hash:string;name:string}|null>{
  const file=form.get('file');
  if(!(file instanceof File)||!file.size){state.errorKey='import.errors.fileMissing';return null}
  if(file.size>MAX_BYTES){state.errorKey='import.errors.notWorkbook';return null}
  const buffer=Buffer.from(await file.arrayBuffer());
  let sheets:LeadSheetGrid[];
  try{sheets=await readLeadWorkbook(file.name,buffer)}
  catch(error){state.errorKey=(error as {code?:string}).code==='EMPTY_WORKBOOK'?'import.errors.emptyWorkbook':'import.errors.notWorkbook';return null}
  return {sheets,hash:createHash('sha256').update(buffer).digest('hex'),name:file.name};
}

function decisionsFromForm(form:FormData):LeadImportDecision{
  try{
    const parsed=JSON.parse(String(form.get('decisions')||'{}')) as Partial<LeadImportDecision>;
    return {mapping:parsed.mapping||{},accept:parsed.accept||{},skip:parsed.skip||{}};
  }catch{return emptyLeadDecisions()}
}

/** The dry run: read the sheet, map what can be mapped, ask about the rest, write nothing. */
export async function previewVisitorImport(_:LeadImportState|null,form:FormData):Promise<LeadImportState>{
  const state=emptyLeadImportState();
  try{
    await requireArchiver();
    const read=await sheetsFromForm(form,state);
    if(!read)return state;
    state.preview=previewLeadImport(read.sheets,emptyLeadDecisions(),{fileLabel:read.name,hash:read.hash});
    state.decisions=emptyLeadDecisions();
  }catch{state.errorKey='import.errors.failed'}
  return state;
}

/** The write: the same preview, re-run with the owner's decisions, then one `createSheetLead` per row. */
export async function commitVisitorImport(_:LeadImportState|null,form:FormData):Promise<LeadImportState>{
  const state=emptyLeadImportState();
  try{
    const actor=await requireArchiver();
    const read=await sheetsFromForm(form,state);
    if(!read)return state;
    const expected=String(form.get('hash')||'');
    if(expected&&expected!==read.hash){state.errorKey='import.errors.hashChanged';return state}
    const decisions=decisionsFromForm(form);
    const result=await commitLeadImport({sheets:read.sheets,decisions,fileLabel:read.name,hash:read.hash,actorId:actor.id,actorName:actor.name});
    if(!result.ok){state.errorKey=result.messageKey;state.errorParams=result.messageParams||{};return state}
    state.preview=previewLeadImport(read.sheets,decisions,{fileLabel:read.name,hash:read.hash});
    state.decisions=decisions;
    state.result={batch:result.batch,created:result.created,matched:result.matched,skipped:result.skipped,blocked:result.blocked,siblings:result.siblings};
    refreshLeads();
  }catch{state.errorKey='import.errors.failed'}
  return state;
}

/** Undo the latest batch: bin what it created, keep what has since become an admission or a student. */
export async function undoVisitorImport(_:LeadImportState|null,form:FormData):Promise<LeadImportState>{
  const state=emptyLeadImportState();
  try{
    const actor=await requireArchiver();
    const result=await undoLeadImport(String(form.get('batch')||''),actor.id,String(form.get('reason')||''));
    if(!result.ok){state.errorKey=result.messageKey;state.errorParams=result.messageParams||{};return state}
    state.undone={batch:result.batch,removed:result.removed};
    refreshLeads();
  }catch{state.errorKey='import.errors.failed'}
  return state;
}
