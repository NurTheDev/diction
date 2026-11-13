'use server';
/**
 * Visitor-lead server actions (R3).
 *
 * Only async functions may be exported from a 'use server' module — one non-function export corrupts the
 * whole server-action bundle at runtime (docs/VERIFY.md, trap 2). Every rule lives in
 * `src/lib/leads/leads.ts`, which these actions call; nothing here queries `Lead` itself.
 *
 * Access follows the brief: Admin and Staff (Teachers excluded), which is exactly `requireArchiver()`.
 *
 * Why the number search is an action and not a link: a number in a URL is a number in browser history,
 * in `Referer`, in a proxy log, in a screenshot of the address bar and in anything that reads
 * `location.search`. Posted to an action, it is in one request body, answered once, and gone. The action
 * returns the rows the operator is allowed to see — the list already shows numbers to staff so they can
 * dial them — but it never returns the digits that were typed, only a mask, so nothing echoes the search
 * back into a place it could be copied from.
 */
import {requireArchiver} from '@/lib/admin/guard';
import {searchLeadsByPhone,type LeadSearchActionState} from '@/lib/leads/leads';

const IDLE:LeadSearchActionState={status:'idle',hits:[],total:0,masked:'',messageBn:'',messageEn:''};

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
    return {status:result.status,hits:result.hits,total:result.total,masked:result.masked,messageBn:result.messageBn,messageEn:result.messageEn};
  }catch(error){
    if(String((error as Error)?.message||'')==='UNAUTHORIZED'){
      return {...IDLE,status:'unauthorized',messageBn:'ভিজিটর তালিকা দেখার অনুমতি নেই।',messageEn:'You do not have access to the visitor list.'};
    }
    // Not the error text: a driver error can quote the value it choked on, and here that value is a
    // parent's number. The name is enough to tell a timeout from a validation error in the log.
    console.error('lead number search failed',{name:(error as Error)?.name||'unknown'});
    return {...IDLE,status:'error',messageBn:'নাম্বার দিয়ে খোঁজা যায়নি। আবার চেষ্টা করুন।',messageEn:'The number search did not run. Please try again.'};
  }
}
