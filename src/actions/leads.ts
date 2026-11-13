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
import {revalidatePath} from 'next/cache';
import {requireArchiver} from '@/lib/admin/guard';
import {
  addLeadNote,createQuickLead,leadDetailByKey,searchLeadsByPhone,setContactPermission,setLeadFollowUp,
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

function refused(error:unknown):LeadFormState{
  if(String((error as Error)?.message||'')==='UNAUTHORIZED'){
    return {status:'error',messageBn:'ভিজিটর তালিকায় লেখার অনুমতি নেই।',messageEn:'You do not have access to the visitor list.'};
  }
  // Not the error text: a driver error can quote the value it choked on, and on this screen that value
  // can be a parent's number. The name is enough to tell a timeout from a validation error.
  console.error('lead action failed',{name:(error as Error)?.name||'unknown'});
  return {status:'error',messageBn:'কাজটি করা যায়নি। আবার চেষ্টা করুন।',messageEn:'That did not go through. Please try again.'};
}

const IDLE:LeadSearchActionState={status:'idle',hits:[],total:0,masked:'',messageBn:'',messageEn:''};
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
    // `staff.id`, not `_id`: getCurrentUser() hands back a projected session user.
    const result=await searchLeadsByPhone(form.get('phone'),new Date(),25,String(staff.id));
    return {status:result.status,hits:searchHitViews(result.hits),total:result.total,masked:result.masked,messageBn:result.messageBn,messageEn:result.messageEn};
  }catch(error){
    if(String((error as Error)?.message||'')==='UNAUTHORIZED'){
      return {...IDLE,status:'unauthorized',messageBn:'ভিজিটর তালিকা দেখার অনুমতি নেই।',messageEn:'You do not have access to the visitor list.'};
    }
    console.error('lead number search failed',{name:(error as Error)?.name||'unknown'});
    return {...IDLE,status:'error',messageBn:'নাম্বার দিয়ে খোঁজা যায়নি। আবার চেষ্টা করুন।',messageEn:'The number search did not run. Please try again.'};
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
    const followUp=text(form,'followUp');
    const result=await createQuickLead({
      studentName:text(form,'studentName'),guardianName:text(form,'guardianName'),phone:text(form,'phone'),
      classLabel:text(form,'classLabel'),school:text(form,'school'),interestedIn:text(form,'interestedIn'),
      source:text(form,'source'),status:text(form,'status'),
      followUp:(followUp&&followUp!==FOLLOW_UP_CLEAR?followUp as FollowUpKey:followUp===FOLLOW_UP_CLEAR?'clear':undefined),
      customDay:text(form,'customDay')||undefined,note:text(form,'note'),
    },String(staff.id));
    if(result.ok===false)return {status:'error',messageBn:result.messageBn,messageEn:result.messageEn,field:result.code};
    refreshLeads();
    return {status:'ok',leadId:result.leadId,messageBn:`সংরক্ষিত হয়েছে — ${result.leadId}${result.inheritedFrom?` · একই পরিবারের ${result.inheritedFrom} লিডের সাথে যুক্ত`:''}`,messageEn:`Saved — ${result.leadId}${result.inheritedFrom?` · joined to ${result.inheritedFrom} in the same family`:''}`};
  }catch(error){return refused(error)}
}

/** The inline status dropdown on every row. `doNotContact` stays sticky; the rule layer owns that. */
export async function changeLeadStatus(_:LeadFormState|null,form:FormData):Promise<LeadFormState>{
  try{
    const staff=await requireArchiver();
    const result=await updateLeadStatus(text(form,'id'),text(form,'status'),String(staff.id),new Date(),text(form,'note')||undefined);
    if(result.ok===false)return {status:'error',messageBn:result.messageBn,messageEn:result.messageEn,field:result.code};
    refreshLeads();
    return {status:'ok',messageBn:result.doNotContact?'অবস্থা বদলেছে — এই লিডে আর যোগাযোগ করা হবে না।':'অবস্থা বদলেছে।',messageEn:result.doNotContact?'Status changed — this lead will not be contacted.':'Status changed.'};
  }catch(error){return refused(error)}
}

/** The five follow-up buttons. The day is computed in the rule layer, never in the browser. */
export async function chooseLeadFollowUp(_:LeadFormState|null,form:FormData):Promise<LeadFormState>{
  try{
    const staff=await requireArchiver();
    const key=text(form,'followUp')||FOLLOW_UP_CLEAR;
    const result=await setLeadFollowUp(text(form,'id'),key as FollowUpKey|typeof FOLLOW_UP_CLEAR,String(staff.id),new Date(),text(form,'customDay')||undefined);
    if(result.ok===false)return {status:'error',messageBn:result.messageBn,messageEn:result.messageEn,field:result.code};
    refreshLeads();
    return {status:'ok',messageBn:result.nextFollowUp?`ফলো-আপ বসেছে: ${result.nextFollowUp}`:'ফলো-আপ বাদ দেওয়া হয়েছে।',messageEn:result.nextFollowUp?`Follow-up set: ${result.nextFollowUp}`:'Follow-up cleared.'};
  }catch(error){return refused(error)}
}

/** A note in the drawer's timeline. */
export async function writeLeadNote(_:LeadFormState|null,form:FormData):Promise<LeadFormState>{
  try{
    const staff=await requireArchiver();
    const result=await addLeadNote(text(form,'id'),text(form,'text'),text(form,'outcome'),String(staff.id));
    if(result.ok===false)return {status:'error',messageBn:result.messageBn,messageEn:result.messageEn,field:result.code};
    refreshLeads();
    return {status:'ok',messageBn:`টীকা সংরক্ষিত হয়েছে (${result.noteCount}টি)।`,messageEn:`Note saved (${result.noteCount} in all).`};
  }catch(error){return refused(error)}
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
    const result=await setContactPermission(text(form,'id'),text(form,'allowed')==='true',String(staff.id));
    if(result.ok===false)return {status:'error',messageBn:result.messageBn,messageEn:result.messageEn,field:result.code};
    refreshLeads();
    return {status:'ok',messageBn:result.doNotContact?'এই লিডে যোগাযোগ বন্ধ রাখা হয়েছে।':'যোগাযোগের অনুমতি ফিরিয়ে দেওয়া হয়েছে।',messageEn:result.doNotContact?'This lead stays off the contact list.':'Contact allowed again.'};
  }catch(error){return refused(error)}
}
