'use server';
import {revalidatePath} from 'next/cache';
import {requireAdmin} from '@/lib/admin/guard';
import {autoSendReceipt} from '@/lib/center/sms-dialog';
import {recordCenterCash,voidCenterCash,SharedReceiptError} from '@/lib/center/cash-batch';
export type CashState={status:'idle'|'ok'|'invalid'|'error';message?:string;batchId?:string;replayed?:boolean;conflicts?:{name:string;date:string;amount:number}[];conflictFingerprint?:string};
function digits(v:FormDataEntryValue|null){const s=String(v??'').trim().replace(/[০-৯]/g,c=>String('০১২৩৪৫৬৭৮৯'.indexOf(c)));return /^\d+$/.test(s)?Number(s):NaN}
export async function collectCenterCash(_:CashState,form:FormData):Promise<CashState>{const actor=await requireAdmin();const lines:{type:'monthly'|'admission'|'exam_fee'|'other';month?:number;amount:number;otherLabel:string}[]=[];for(let month=1;month<=12;month++){const raw=String(form.get(`month-${month}`)||'').trim();if(raw)lines.push({type:'monthly',month,amount:digits(raw),otherLabel:''})}for(const type of ['admission','exam_fee','other'] as const){const raw=String(form.get(type)||'').trim();if(raw)lines.push({type,amount:digits(raw),otherLabel:type==='other'?String(form.get('otherLabel')||''):''})}try{const data={requestId:String(form.get('requestId')||''),student:String(form.get('student')||''),academicYear:digits(form.get('academicYear')),receiptNo:String(form.get('receiptNo')||''),paidOn:String(form.get('paidOn')||''),note:String(form.get('note')||''),allowSharedReceipt:form.get('allowShared')==='on',sharedReceiptReason:String(form.get('sharedReason')||''),sharedReceiptSeen:String(form.get('sharedSeen')||''),allowExtra:form.get('allowExtra')==='on',lines};const result=await recordCenterCash(data,actor.id);
      // Automatic receipt SMS (settings toggle, OFF by default). The payment is already saved, so a
      // message that cannot go out must never turn a saved receipt into an error for the operator.
      // A replayed request is skipped: it was sent when the receipt was first recorded.
      const monthly=lines.find(line=>line.type==='monthly');
      if(!result.replayed&&monthly){
        try{
          await autoSendReceipt({student:data.student,amount:lines.reduce((sum,line)=>sum+line.amount,0),month:{year:data.academicYear,month:monthly.month||0},receiptNo:data.receiptNo});
        }catch(error){console.error('Automatic receipt SMS failed',(error as Error).message)}
      }
      for(const lang of ['bn','en']){revalidatePath(`/${lang}/admin/students/${data.student}`);revalidatePath(`/${lang}/admin/students/${data.student}/collect`)}return {status:'ok',batchId:result.batchId,replayed:result.replayed}}catch(e){return {status:'error',message:(e as Error).message||'UNAVAILABLE',...(e instanceof SharedReceiptError?{conflicts:e.conflicts,conflictFingerprint:e.fingerprint}:{})}}}
export async function voidCenterCashAction(form:FormData):Promise<{ok:boolean;message?:string}>{const actor=await requireAdmin();if(form.get('confirm')!=='YES')return {ok:false,message:'CONFIRM'};try{await voidCenterCash(String(form.get('batchId')||''),actor.id,String(form.get('reason')||''));const id=String(form.get('student')||'');for(const lang of ['bn','en']){revalidatePath(`/${lang}/admin/students/${id}`);revalidatePath(`/${lang}/admin/students/${id}/collect`)}return {ok:true}}catch(e){return {ok:false,message:(e as Error).message||'UNAVAILABLE'}}}
