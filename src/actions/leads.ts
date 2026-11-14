'use server';
/**
 * Visitor-lead server actions (R3 wave B).
 *
 * Only async functions may be exported from a 'use server' module — one non-function export corrupts the
 * whole server-action bundle at runtime (docs/VERIFY.md, trap 2). Every rule lives in
 * `src/lib/leads/leads.ts` and every shared type in `src/lib/leads/lead-ui.ts`; nothing here queries
 * `Lead` itself, so a screen cannot drift from the rule layer.
 *
 * Access follows the brief: Admin and Staff, Teachers excluded — that is `requireArchiver()`, checked
 * before anything is read or written, in every action.
 *
 * Why the number search is an action and not a link: a number in a URL is a number in browser history,
 * in `Referer`, in a proxy log, in a screenshot of the address bar and in anything that reads
 * `location.search`. Posted to an action, it is in one request body, answered once, and gone. The action
 * returns the rows the operator is allowed to see — the list already shows numbers to staff so they can
 * dial them — but it never returns the digits that were typed, only a mask, so nothing echoes the search
 * back into a place it could be copied from. The hits are stripped on the way out too
 * (`searchHitViews`): the rule layer matches on a normalized number and keeps it, and the browser gets
 * the mask plus the `tel:` and `wa.me` destinations, which is all a screen may hold.
 */
import {cookies} from 'next/headers';
import {getLocale,getTranslations} from 'next-intl/server';
import {formatNumber} from '@/lib/admin/format';
import {revalidatePath} from 'next/cache';
import {requireArchiver} from '@/lib/admin/guard';
import {
  addLeadNote,bookLeadTrial,convertLeadToAdmission,createQuickLead,leadDetailByKey,markLeadNotInterested,
  mergeLeads,searchLeadsByPhone,setContactPermission,setLeadFollowUp,tieLeadFamily,trialSlotsForLead,
  updateLeadStatus,
} from '@/lib/leads/leads';
import {
  detailView,FOLLOW_UP_CLEAR,searchHitViews,
  type LeadDetailView,type LeadFormState,type LeadSearchActionState,
} from '@/lib/leads/lead-ui';
import type {FollowUpKey} from '@/lib/leads/vocab';

/** The Visitors list and the Overview both change when a lead does, in either locale. */
function refreshLeads():void{
  for(const locale of ['bn','en']){revalidatePath(`/${locale}/admin/leads`);revalidatePath(`/${locale}/admin`)}
}
/** A merge or a tie also changes the two leads' own pages, so those caches go too. */
function refreshLeadPage(id:string):void{
  if(!id)return;
  for(const locale of ['bn','en'])revalidatePath(`/${locale}/admin/leads/${id}`);
}

async function refused(error:unknown):Promise<LeadFormState>{
  if(String((error as Error)?.message||'')==='UNAUTHORIZED'){
    return {status:'error',message:await leadMsg({messageKey:'actionErrors.NO_WRITE_ACCESS',messageParams:{}})};
  }
  // Not the error text: a driver error can quote the value it choked on, and on this screen that value
  // can be a parent's number. The name is enough to tell a timeout from a validation error.
  console.error('lead action failed',{name:(error as Error)?.name||'unknown'});
  return {status:'error',message:await leadMsg({messageKey:'actionErrors.DID_NOT_GO_THROUGH',messageParams:{}})};
}


/** The acting user's digit preference, so a server-side sentence counts in the digits they chose. */
async function leadDigits(userId:string):Promise<'bn'|'en'>{return (await cookies()).get(`diction_digits_${userId}`)?.value==='en'?'en':'bn'}

/** The language a STORED sentence (a hand-off note) is written in: the operator's own. */
async function leadLanguage():Promise<'bn'|'en'>{try{return (await getLocale())==='en'?'en':'bn'}catch{return 'bn'}}
/** Translate a rule-layer refusal into one sentence in the acting user's locale and digits. */
async function leadMsg(r:{messageKey:string;messageParams?:Record<string,string|number>;messageText?:string},digits:'bn'|'en'='bn'):Promise<string>{
  if(r.messageText)return r.messageText;
  const t=await getTranslations('leads');
  return t(r.messageKey,Object.fromEntries(Object.entries(r.messageParams||{}).map(([k,v])=>[k,typeof v==='number'?formatNumber(v,digits):v])) as never);
}

const IDLE:LeadSearchActionState={status:'idle',hits:[],total:0,masked:'',message:''};
const text=(form:FormData,key:string):string=>String(form.get(key)??'').trim();

/**
 * Find leads by a number, or part of one. Accepts typed digits, Bangla digits, `+88`/`0088`, dashes and
 * spaces, a leading zero or none, and a partial number; refuses anything shorter than four digits.
 * `form.get('phone')` is read as-is and normalized inside the rule layer, so no variant of writing a
 * number gets a different answer.
 */
export async function searchLeadsByNumber(_:LeadSearchActionState|null,form:FormData):Promise<LeadSearchActionState>{
  try{
    const staff=await requireArchiver();
    const digits=await leadDigits(String(staff.id));
    // `staff.id`, not `_id`: getCurrentUser() hands back a projected session user.
    const result=await searchLeadsByPhone(form.get('phone'),new Date(),25,String(staff.id));
    return {status:result.status,hits:searchHitViews(result.hits),total:result.total,masked:result.masked,message:await leadMsg(result,digits)};
  }catch(error){
    if(String((error as Error)?.message||'')==='UNAUTHORIZED'){
      return {...IDLE,status:'unauthorized',message:await leadMsg({messageKey:'actionErrors.NO_READ_ACCESS',messageParams:{}})};
    }
    console.error('lead number search failed',{name:(error as Error)?.name||'unknown'});
    return {...IDLE,status:'error',message:await leadMsg({messageKey:'actionErrors.SEARCH_FAILED',messageParams:{}})};
  }
}

/**
 * Quick-add. The panel is one tap from the mobile bottom bar and the sidebar, and Enter saves it: every
 * field but the note is a single-line input, so the browser's own submit is the shortcut and nothing here
 * has to listen for a key. Four fields are a complete lead; whatever is left empty stays unknown.
 */
export async function quickAddLead(_:LeadFormState|null,form:FormData):Promise<LeadFormState>{
  try{
    const staff=await requireArchiver();
    const digits=await leadDigits(String(staff.id));
    const followUp=text(form,'followUp');
    // R3.10: the duplicate question is answered by whichever button the operator pressed. A merge button
    // carries the lead it names; the sibling and separate buttons carry only the choice.
    const dupMerge=text(form,'dupMerge');
    const dupChoice=text(form,'dupChoice');
    const result=await createQuickLead({
      studentName:text(form,'studentName'),guardianName:text(form,'guardianName'),phone:text(form,'phone'),
      classLabel:text(form,'classLabel'),school:text(form,'school'),interestedIn:text(form,'interestedIn'),
      source:text(form,'source'),status:text(form,'status'),
      followUp:(followUp&&followUp!==FOLLOW_UP_CLEAR?followUp as FollowUpKey:followUp===FOLLOW_UP_CLEAR?'clear':undefined),
      customDay:text(form,'customDay')||undefined,note:text(form,'note'),
      dupChoice:dupMerge?'merge':dupChoice==='sibling'||dupChoice==='separate'?dupChoice:undefined,
      dupTarget:dupMerge||undefined,
    },String(staff.id));
    if(result.ok===false&&'holders' in result){
      // The question, not an error: the form keeps what was typed and the panel lists who holds the number.
      return {status:'dup',holders:result.holders,message:await leadMsg(result,digits)};
    }
    if(result.ok===false)return {status:'error',message:await leadMsg(result,digits),field:result.code};
    refreshLeads();
    if(result.mergedInto){
      return {status:'ok',leadId:result.leadId,message:await leadMsg({messageKey:'success.MERGED_INTO_EXISTING',messageParams:{leadId:result.leadId}},digits)};
    }
    return {status:'ok',leadId:result.leadId,message:await leadMsg({messageKey:'success.SAVED',messageParams:{leadId:result.leadId,family:result.inheritedFrom?await leadMsg({messageKey:'success.SAVED_FAMILY',messageParams:{from:result.inheritedFrom||''}},digits):''}},digits)};
  }catch(error){return await refused(error)}
}

/**
 * R3.10, the drawer's merge: one lead folds into the one open in the drawer and lands in the Recycle
 * Bin, carrying its phones, its notes and its flags. The rule layer refuses a source that became an
 * admission, a trial or a student, so a conversion can never be binned by a merge.
 */
export async function mergeTwoLeads(_:LeadFormState|null,form:FormData):Promise<LeadFormState>{
  try{
    const staff=await requireArchiver();
    const digits=await leadDigits(String(staff.id));
    const result=await mergeLeads(text(form,'targetId'),text(form,'sourceId'),String(staff.id));
    if(result.ok===false)return {status:'error',message:await leadMsg(result,digits),field:result.code};
    refreshLeads();refreshLeadPage(result.id);
    return {status:'ok',leadId:result.leadId,
      message:await leadMsg({messageKey:'success.MERGED_WITH_DETAIL',messageParams:{leadId:result.leadId,source:result.sourceLeadId||'',notes:result.movedNotes||0,phones:result.movedPhones||0}},digits)};
  }catch(error){return await refused(error)}
}

/** R3.10, "add as sibling" for two leads that stay two leads: both wear one family key afterwards. */
export async function tieLeadFamilies(_:LeadFormState|null,form:FormData):Promise<LeadFormState>{
  try{
    const staff=await requireArchiver();
    const digits=await leadDigits(String(staff.id));
    const result=await tieLeadFamily(text(form,'id'),text(form,'otherId'),String(staff.id));
    if(result.ok===false)return {status:'error',message:await leadMsg(result,digits),field:result.code};
    refreshLeads();refreshLeadPage(text(form,'id'));refreshLeadPage(text(form,'otherId'));
    return {status:'ok',message:await leadMsg({messageKey:'success.FAMILY_TIED',messageParams:{}},digits)};
  }catch(error){return await refused(error)}
}

/** The inline status dropdown on every row. `doNotContact` stays sticky; the rule layer owns that. */
export async function changeLeadStatus(_:LeadFormState|null,form:FormData):Promise<LeadFormState>{
  try{
    const staff=await requireArchiver();
    const digits=await leadDigits(String(staff.id));
    const result=await updateLeadStatus(text(form,'id'),text(form,'status'),String(staff.id),new Date(),text(form,'note')||undefined);
    if(result.ok===false)return {status:'error',message:await leadMsg(result,digits),field:result.code};
    refreshLeads();
    return {status:'ok',message:await leadMsg({messageKey:result.doNotContact?'success.STATUS_DNC':'success.STATUS_CHANGED',messageParams:{}},digits)};
  }catch(error){return await refused(error)}
}

/** The five follow-up buttons. The day is computed in the rule layer, never in the browser. */
export async function chooseLeadFollowUp(_:LeadFormState|null,form:FormData):Promise<LeadFormState>{
  try{
    const staff=await requireArchiver();
    const digits=await leadDigits(String(staff.id));
    const key=text(form,'followUp')||FOLLOW_UP_CLEAR;
    const result=await setLeadFollowUp(text(form,'id'),key as FollowUpKey|typeof FOLLOW_UP_CLEAR,String(staff.id),new Date(),text(form,'customDay')||undefined);
    if(result.ok===false)return {status:'error',message:await leadMsg(result,digits),field:result.code};
    refreshLeads();
    return {status:'ok',message:await leadMsg({messageKey:result.nextFollowUp?'success.FOLLOW_UP_SET':'success.FOLLOW_UP_CLEARED',messageParams:result.nextFollowUp?{day:result.nextFollowUp}:{}},digits)};
  }catch(error){return await refused(error)}
}

/** A note in the drawer's timeline. */
export async function writeLeadNote(_:LeadFormState|null,form:FormData):Promise<LeadFormState>{
  try{
    const staff=await requireArchiver();
    const digits=await leadDigits(String(staff.id));
    const result=await addLeadNote(text(form,'id'),text(form,'text'),text(form,'outcome'),String(staff.id));
    if(result.ok===false)return {status:'error',message:await leadMsg(result,digits),field:result.code};
    refreshLeads();
    return {status:'ok',message:await leadMsg({messageKey:'success.NOTE_SAVED',messageParams:{noteCount:result.noteCount||0}},digits)};
  }catch(error){return await refused(error)}
}

/**
 * The drawer's contents, loaded when it opens. Called straight from a client component (not through a
 * form), which is why its argument is a plain id and not `FormData` — an id is not a number, so there is
 * nothing private in the request, and the answer comes back already masked: `detailView()` maps every
 * number on the row to its `tel:`/`wa.me` destination and a mask, so the drawer cannot print one.
 */
export async function loadLeadDetail(key:string):Promise<LeadDetailView|null>{
  try{
    await requireArchiver();
    const detail=await leadDetailByKey(key);
    return detail?detailView(detail):null;
  }catch(error){
    console.error('lead detail failed',{name:(error as Error)?.name||'unknown'});
    return null;
  }
}

/**
 * Lifting "do not contact" — its own action, separate from a status change, because it is the one thing
 * on this screen that puts a parent back on a calling list and must not happen by accident.
 */
export async function liftContactBlock(_:LeadFormState|null,form:FormData):Promise<LeadFormState>{
  try{
    const staff=await requireArchiver();
    const digits=await leadDigits(String(staff.id));
    const result=await setContactPermission(text(form,'id'),text(form,'allowed')==='true',String(staff.id));
    if(result.ok===false)return {status:'error',message:await leadMsg(result,digits),field:result.code};
    refreshLeads();
    return {status:'ok',message:await leadMsg({messageKey:result.doNotContact?'success.CONTACT_STOPPED':'success.CONTACT_ALLOWED',messageParams:{}},digits)};
  }catch(error){return await refused(error)}
}

/**
 * R3.13 · The three hand-offs. Each is a form the Visitors drawer opens, and each one carries the lead's
 * Mongo id and nothing private: the phone is never posted from the browser, because the form never held
 * it — the rule layer copies the number off the lead when the write happens. A refusal comes back with
 * its code in `field`, so the dialog can point at the thing that stopped it.
 */
function subjectList(form:FormData):string[]{
  return form.getAll('subjects').map(value=>String(value)).filter(Boolean).slice(0,5);
}

export async function submitLeadAdmission(_:LeadFormState|null,form:FormData):Promise<LeadFormState>{
  try{
    const staff=await requireArchiver();
    const digits=await leadDigits(String(staff.id));
    const result=await convertLeadToAdmission(text(form,'id'),{
      studentName:text(form,'studentName'),guardianName:text(form,'guardianName'),grade:text(form,'grade'),
      school:text(form,'school'),dob:text(form,'dob'),gender:text(form,'gender'),relation:text(form,'relation'),
      medium:text(form,'medium'),previousResult:text(form,'previousResult'),courseType:text(form,'courseType')||'individual',
      subjects:subjectList(form),packageName:text(form,'packageName'),consent:true,email:text(form,'email'),
    },String(staff.id),new Date(),await leadLanguage());
    if(result.ok===false)return {status:'error',message:await leadMsg(result,digits),field:result.code};
    refreshLeads();refreshLeadPage(text(form,'id'));refreshIntake();
    return {status:'ok',message:await leadMsg({messageKey:'success.ADMISSION_OPENED',messageParams:{reference:result.reference||''}},digits)};
  }catch(error){return await refused(error)}
}

export async function submitLeadTrial(_:LeadFormState|null,form:FormData):Promise<LeadFormState>{
  try{
    const staff=await requireArchiver();
    const digits=await leadDigits(String(staff.id));
    const result=await bookLeadTrial(text(form,'id'),{
      slotId:text(form,'slotId'),slotStartAt:text(form,'slotStartAt'),slotEndAt:text(form,'slotEndAt'),
      grade:text(form,'grade'),subject:text(form,'subject'),studentName:text(form,'studentName'),
      consent:true,email:text(form,'email'),
    },String(staff.id),new Date(),await leadLanguage());
    if(result.ok===false)return {status:'error',message:await leadMsg(result,digits),field:result.code};
    refreshLeads();refreshLeadPage(text(form,'id'));refreshIntake();
    return {status:'ok',message:await leadMsg({messageKey:'success.TRIAL_BOOKED',messageParams:{reference:result.reference||''}},digits)};
  }catch(error){return await refused(error)}
}

export async function submitLeadNotInterested(_:LeadFormState|null,form:FormData):Promise<LeadFormState>{
  try{
    const staff=await requireArchiver();
    const digits=await leadDigits(String(staff.id));
    const result=await markLeadNotInterested(text(form,'id'),text(form,'reason'),String(staff.id));
    if(result.ok===false)return {status:'error',message:await leadMsg(result,digits),field:result.code};
    refreshLeads();refreshLeadPage(text(form,'id'));
    return {status:'ok',message:await leadMsg({messageKey:'success.NOT_INTERESTED_FILED',messageParams:{}},digits)};
  }catch(error){return await refused(error)}
}

/** The trial dialog asks for the slots it may offer when it opens: a seat is a fact of the moment. */
export async function loadLeadTrialSlots(grade:string,subject:string):Promise<{id:string;startAt:string;endAt:string;grade:string;subject:string;seatsLeft:number}[]>{
  await requireArchiver();
  return trialSlotsForLead(grade,subject);
}

/** Admissions and trials both change when a lead is handed over, in either locale. */
function refreshIntake():void{
  for(const locale of ['bn','en']){revalidatePath(`/${locale}/admin/admissions`);revalidatePath(`/${locale}/admin/trials`)}
}
