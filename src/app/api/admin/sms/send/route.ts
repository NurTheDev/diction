/**
 * The HTTP half of SendSmsDialog (R2). Everything that matters — validation, the plan, idempotency,
 * quiet hours, the retry — lives in src/lib/center/sms-dialog.ts so it can be tested directly; this
 * handler adds only the session guard, the origin check, JSON decoding and the rate limit.
 *
 * The dialog is one client component reused by five screens, so a server action pre-bound to a single
 * page would not do. Credentials never appear in a response: only the provider's balance number.
 */
import {NextResponse} from 'next/server';
import {getStaff} from '@/lib/admin/guard';
import {smsSendPolicyRefusal,type SmsPolicyInput,smsPolicyMessage} from '@/lib/center/sms-staff';
import {sameOrigin,noStore} from '@/lib/practice-security';
import {boundedJson} from '@/lib/achievement-workflow';
import {checkRateLimit} from '@/lib/rate-limit';
import {runSmsDialog,type SmsDialogInput} from '@/lib/center/sms-dialog';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

export async function POST(request:Request){
  try{
    // R3.11: staff may stand at this door now, so the guard is the wide one and the POLICY is the
    // narrow one: role, source and template are checked before a plan is built or a peso is counted.
    const admin=await getStaff();
    if(!admin)return NextResponse.json({ok:false,error:'unauthorized'},{status:401,headers:noStore});
    if(!sameOrigin(request))return NextResponse.json({ok:false,error:'forbidden'},{status:403,headers:noStore});
    const input=await boundedJson(request,32_768) as SmsDialogInput;
    if(!input||typeof input!=='object')return NextResponse.json({ok:false,error:'invalid',detail:'body'},{status:400,headers:noStore});
    const refusal=smsSendPolicyRefusal(admin.role,input as SmsPolicyInput);
    if(refusal){
      return NextResponse.json({ok:false,error:'policy',detail:refusal.code,messageBn:smsPolicyMessage(refusal,'bn'),messageEn:smsPolicyMessage(refusal,'en')},{status:403,headers:noStore});
    }
    const mode=String(input.mode||'preview');
    // Sending and retrying spend money, so they are rate limited per operator; previewing is not.
    if((mode==='send'||mode==='retry')&&!await checkRateLimit(`sms-${mode}:${admin.id}`,20)){
      return NextResponse.json({ok:false,error:'rate'},{status:429,headers:noStore});
    }
    const outcome=await runSmsDialog(input,admin.id,{role:admin.role});
    return NextResponse.json(outcome.body,{status:outcome.status,headers:noStore});
  }catch(error){
    const message=(error as Error)?.message||'';
    if(['INVALID_CLASS','INVALID_STUDENT','EMPTY_MESSAGE','TEMPLATE_NOT_FOUND','NO_RECIPIENTS','NOTHING_TO_RETRY'].includes(message)||message.startsWith('UNRENDERED_VARIABLE')){
      return NextResponse.json({ok:false,error:'invalid',detail:message},{status:400,headers:noStore});
    }
    console.error('SMS send failed');
    return NextResponse.json({ok:false,error:'unavailable'},{status:503,headers:noStore});
  }
}
