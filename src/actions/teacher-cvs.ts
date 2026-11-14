'use server';
/**
 * R4 · Teacher CV bank — the server actions.
 *
 * Only async functions may be exported from a 'use server' module: one non-function export corrupts the
 * whole server-action bundle at runtime (docs/VERIFY.md, trap 2). Every rule lives in
 * `src/lib/teachers/*` and every shared view type in `src/lib/teachers/cv-ui.ts`; nothing here queries
 * `TeacherCandidate` itself, so a screen cannot drift from the rule layer.
 *
 * Access follows the brief: **Super Admin and Admin only** — `requireAdmin()`, checked before anything is
 * read or written, in every action. Teachers and staff have no CV access at all, and a CV is never public.
 *
 * Why the drawer posts instead of linking: a candidate's number must not travel in a URL, so the row
 * actions are form posts with an id, and what comes back is a sentence in the operator's language plus the
 * ids the screen already had. The refusals are catalog keys with params, never error text — a driver error
 * can quote the value it choked on, and on this screen that value can be somebody's phone number.
 */
import {getLocale,getTranslations} from 'next-intl/server';
import {revalidatePath} from 'next/cache';
import {formatNumber} from '@/lib/admin/format';
import {requireAdmin} from '@/lib/admin/guard';
import {audit} from '@/lib/admin/helpers';
import {
  addCandidateNote,candidateDetail,hireCandidate,scheduleInterview,updateCandidate,createCandidate,
} from '@/lib/teachers/candidates';
import {listNeeds,removeNeed,saveNeed,setNeedFilled} from '@/lib/teachers/needs';
import {candidateDetailView,dupViews,type CvFormState} from '@/lib/teachers/cv-ui';

const text=(form:FormData,name:string):string=>String(form.get(name)??'').trim();
const list=(form:FormData,name:string):string[]=>form.getAll(name).map(value=>String(value).trim()).filter(Boolean);

/** The CV list, the Find-a-teacher screen and the Teachers module all change when a CV does. */
function refreshCvs():void{
  for(const locale of ['bn','en']){
    revalidatePath(`/${locale}/admin/teacher-cvs`);
    revalidatePath(`/${locale}/admin/teacher-cvs/find`);
    revalidatePath(`/${locale}/admin/faculty`);
    revalidatePath(`/${locale}/admin`);
  }
}

async function digitsFor():Promise<'bn'|'en'>{return (await getLocale())==='en'?'en':'bn'}

/** Translate a rule-layer refusal into one sentence in the acting operator's language and digits. */
async function cvMsg(refusal:{messageKey:string;messageParams?:Record<string,string|number>}):Promise<string>{
  const digits=await digitsFor();
  const t=await getTranslations('teacherCvs');
  return t(refusal.messageKey,Object.fromEntries(Object.entries(refusal.messageParams||{})
    .map(([key,value])=>[key,typeof value==='number'?formatNumber(value,digits):value])) as never);
}

async function refused(error:unknown):Promise<CvFormState>{
  if(String((error as Error)?.message||'')==='UNAUTHORIZED'){
    return {status:'error',message:await cvMsg({messageKey:'errors.FORBIDDEN'})};
  }
  // Not the error text: a driver error can quote the value it choked on, which here can be a number.
  console.error('teacher CV action failed',{name:(error as Error)?.name||'unknown'});
  return {status:'error',message:await cvMsg({messageKey:'errors.UNKNOWN'})};
}

/**
 * The quick add: name, one number, subjects, class levels, university and an optional CV file, saved by
 * pressing Enter. A CV that shares a number or an email with one already on file comes back as the
 * duplicate QUESTION rather than a write, and "save anyway" (`dupChoice=separate`) is the answer.
 */
export async function quickAddCv(_:CvFormState|null,form:FormData):Promise<CvFormState>{
  try{
    const actor=await requireAdmin();
    const result=await createCandidate({
      name:text(form,'name'),
      phones:[text(form,'phone'),...list(form,'phones')],
      email:text(form,'email'),department:text(form,'department'),university:text(form,'university'),
      currentInstitute:text(form,'currentInstitute'),
      subjectsText:text(form,'subjectsText'),subjects:list(form,'subjects'),classLevels:list(form,'classLevels'),
      availabilityText:text(form,'availabilityText'),shifts:list(form,'shifts'),tags:list(form,'tags'),
      expectedSalary:text(form,'expectedSalary')||null,source:text(form,'source')||'walk_in',
      receivedDate:text(form,'receivedDate')||undefined,
      cvFile:text(form,'cvFile'),cvPublicId:text(form,'cvPublicId'),
      photo:text(form,'photo'),photoPublicId:text(form,'photoPublicId'),
      importSource:null,importBatch:null,
    },String(actor.id),new Date(),{dupChoice:text(form,'dupChoice')==='separate'?'separate':undefined});
    if(result.ok===false&&'holders' in result){
      return {status:'dup',message:await cvMsg(result),duplicates:dupViews(result.holders)};
    }
    if(result.ok===false)return {status:'error',message:await cvMsg(result),field:result.code};
    await audit(String(actor.id),'teacher-cv.create',result.candidateId);
    refreshCvs();
    return {status:'ok',id:result.id,candidateId:result.candidateId,
      message:await cvMsg({messageKey:'success.saved',messageParams:{candidateId:result.candidateId}})};
  }catch(error){return refused(error)}
}

/** The drawer's field edits: status, rating, source, the free-text fields, tags and the file addresses. */
export async function saveCvFields(_:CvFormState|null,form:FormData):Promise<CvFormState>{
  try{
    const actor=await requireAdmin();
    const id=text(form,'id');
    const result=await updateCandidate(id,{
      status:text(form,'status')||undefined,rating:text(form,'rating')||undefined,
      source:text(form,'source')||undefined,
      shifts:form.has('shifts')?list(form,'shifts'):undefined,
      subjects:form.has('subjects')?list(form,'subjects'):undefined,
      classLevels:form.has('classLevels')?list(form,'classLevels'):undefined,
      department:form.has('department')?text(form,'department'):undefined,
      university:form.has('university')?text(form,'university'):undefined,
      currentInstitute:form.has('currentInstitute')?text(form,'currentInstitute'):undefined,
      subjectsText:form.has('subjectsText')?text(form,'subjectsText'):undefined,
      availabilityText:form.has('availabilityText')?text(form,'availabilityText'):undefined,
      email:form.has('email')?text(form,'email'):undefined,
      tags:form.has('tags')?text(form,'tags').split(/[,;\n]/).map(tag=>tag.trim()).filter(Boolean):undefined,
      expectedSalary:form.has('expectedSalary')?(text(form,'expectedSalary')||null):undefined,
      cvFile:form.has('cvFile')?text(form,'cvFile'):undefined,
      cvPublicId:form.has('cvPublicId')?text(form,'cvPublicId'):undefined,
      photo:form.has('photo')?text(form,'photo'):undefined,
      photoPublicId:form.has('photoPublicId')?text(form,'photoPublicId'):undefined,
    },String(actor.id));
    if(result.ok===false)return {status:'error',message:await cvMsg(result),field:result.code};
    await audit(String(actor.id),'teacher-cv.update',id);
    refreshCvs();
    return {status:'ok',id,message:await cvMsg({messageKey:'success.fieldSaved'})};
  }catch(error){return refused(error)}
}

/** One entry in the candidate's timeline. The note is written in the operator's own language. */
export async function addCvNote(_:CvFormState|null,form:FormData):Promise<CvFormState>{
  try{
    const actor=await requireAdmin();
    const id=text(form,'id');
    const result=await addCandidateNote(id,text(form,'text'),text(form,'outcome'),String(actor.id));
    if(result.ok===false)return {status:'error',message:await cvMsg(result),field:result.code};
    await audit(String(actor.id),'teacher-cv.note',id);
    refreshCvs();
    return {status:'ok',id,message:await cvMsg({messageKey:'success.noteAdded'})};
  }catch(error){return refused(error)}
}

/** Scheduling an interview moves the status with it; an empty time clears it and leaves the status. */
export async function setCvInterview(_:CvFormState|null,form:FormData):Promise<CvFormState>{
  try{
    const actor=await requireAdmin();
    const id=text(form,'id');
    const when=text(form,'interviewAt');
    const result=await scheduleInterview(id,when||null,String(actor.id));
    if(result.ok===false)return {status:'error',message:await cvMsg(result),field:result.code};
    await audit(String(actor.id),'teacher-cv.interview',id);
    refreshCvs();
    return {status:'ok',id,message:await cvMsg({messageKey:result.interviewAt?'success.interviewSaved':'success.interviewCleared'})};
  }catch(error){return refused(error)}
}

/**
 * The hire: one transaction writes the Teacher profile, the link back and the timeline note. The profile
 * is created UNPUBLISHED, because a public faculty page is a decision the owner makes with words and a
 * photo — not a side effect of a hiring — and the link (`hiredAsTeacherId`) is what stops a second press
 * from minting a twin.
 */
export async function hireCv(_:CvFormState|null,form:FormData):Promise<CvFormState>{
  try{
    const actor=await requireAdmin();
    const id=text(form,'id');
    const result=await hireCandidate(id,String(actor.id));
    if(result.ok===false)return {status:'error',message:await cvMsg(result),field:result.code};
    await audit(String(actor.id),'teacher-cv.hire',`${id}:${result.slug}`);
    refreshCvs();
    return {status:'ok',id,message:await cvMsg({messageKey:'success.hired',messageParams:{name:text(form,'name')||'',slug:result.slug}})};
  }catch(error){return refused(error)}
}

/** The drawer, re-read after a write so the timeline and the duplicate list are the truth again. */
export async function reloadCvDetail(id:string):Promise<{ok:true;detail:ReturnType<typeof candidateDetailView>}|{ok:false;message:string}>{
  try{
    await requireAdmin();
    const detail=await candidateDetail(String(id||''));
    if(!detail)return {ok:false,message:await cvMsg({messageKey:'errors.MISSING'})};
    return {ok:true,detail:candidateDetailView(detail)};
  }catch(error){
    const state=await refused(error);
    return {ok:false,message:state.message};
  }
}

/** A saved teaching need: the question the Find-a-teacher screen can answer again tomorrow. */
export async function saveTeachingNeed(_:CvFormState|null,form:FormData):Promise<CvFormState>{
  try{
    const actor=await requireAdmin();
    const result=await saveNeed({
      subject:text(form,'subject'),classLevels:list(form,'classLevels'),
      shift:text(form,'shift'),note:text(form,'note'),
    },String(actor.id));
    if(result.ok===false)return {status:'error',message:await cvMsg(result),field:result.code};
    await audit(String(actor.id),'teacher-need.save',result.id);
    refreshCvs();
    return {status:'ok',id:result.id,message:await cvMsg({messageKey:'success.needSaved'})};
  }catch(error){return refused(error)}
}

export async function setTeachingNeedFilled(_:CvFormState|null,form:FormData):Promise<CvFormState>{
  try{
    const actor=await requireAdmin();
    const id=text(form,'needId');
    const result=await setNeedFilled(id,form.get('filled')==='true'||form.get('filled')==='on');
    if(result.ok===false)return {status:'error',message:await cvMsg(result),field:result.code};
    await audit(String(actor.id),'teacher-need.filled',id);
    refreshCvs();
    return {status:'ok',id,message:await cvMsg({messageKey:'success.needStatus'})};
  }catch(error){return refused(error)}
}

export async function removeTeachingNeed(_:CvFormState|null,form:FormData):Promise<CvFormState>{
  try{
    const actor=await requireAdmin();
    const id=text(form,'needId');
    const result=await removeNeed(id);
    if(result.ok===false)return {status:'error',message:await cvMsg(result),field:result.code};
    await audit(String(actor.id),'teacher-need.remove',id);
    refreshCvs();
    return {status:'ok',id,message:await cvMsg({messageKey:'success.needRemoved'})};
  }catch(error){return refused(error)}
}

/** The open needs, for a screen that has just written one and wants the list back without a reload. */
export async function reloadTeachingNeeds():Promise<{ok:true;needs:Awaited<ReturnType<typeof listNeeds>>}|{ok:false;message:string}>{
  try{
    await requireAdmin();
    return {ok:true,needs:await listNeeds()};
  }catch(error){
    const state=await refused(error);
    return {ok:false,message:state.message};
  }
}
