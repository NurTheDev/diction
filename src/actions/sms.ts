'use server';
/**
 * SMS server actions (R2).
 *
 * Only async functions may be exported from a 'use server' module — a single non-function export
 * corrupts the whole server-action bundle at runtime (see docs/VERIFY.md, trap 2). Shared values
 * therefore live in src/lib/center/sms-*.ts, and every action here is guarded before it touches
 * anything: sending SMS spends real money, so this is admin and super admin only.
 */
import {revalidatePath} from 'next/cache';
import {getLocale} from 'next-intl/server';
import {z} from 'zod';
import {requireAdmin} from '@/lib/admin/guard';
import {audit} from '@/lib/admin/helpers';
import {CenterSettings,CenterSmsTemplate} from '@/models/CenterRecords';
import {parseClock} from '@/lib/center/sms-quiet';
import {normalizePhone} from '@/lib/center/phone';
import {retryFailedSms,sendTestSms} from '@/lib/center/sms-send';
import type {ActionState} from './admin';

function refreshSms():void{
  for(const locale of ['bn','en'])revalidatePath(`/${locale}/admin/sms`);
}

/** Form feedback follows the page language. Provider response codes stay Bangla by design. */
async function localeIsEn():Promise<boolean>{
  try{return (await getLocale())==='en'}catch{return false}
}

/** Checkboxes arrive as 'on' or as an explicit 'true' from a hidden input; anything else is off. */
function checked(value:FormDataEntryValue|null):boolean{return value==='on'||value==='true'}

const settingsSchema=z.object({
  smsUnitCost:z.coerce.number().min(0).max(1000),
  quietStart:z.string().trim().max(5),
  quietEnd:z.string().trim().max(5),
  institutePhone:z.string().trim().max(20),
  autoDueDay:z.coerce.number().int().min(1).max(31),
});

/**
 * Save the SMS settings. Every auto-send toggle ships OFF and stays off unless it is explicitly
 * ticked, so a partially submitted form can never switch sending on by accident.
 */
export async function saveSmsSettings(_:ActionState,form:FormData):Promise<ActionState>{
  try{
    const admin=await requireAdmin();
    const parsed=settingsSchema.safeParse({
      smsUnitCost:form.get('smsUnitCost')??0,
      quietStart:form.get('quietStart')??'',
      quietEnd:form.get('quietEnd')??'',
      institutePhone:form.get('institutePhone')??'',
      autoDueDay:form.get('autoDueDay')??10,
    });
    if(!parsed.success)return {status:'error',reason:'invalid'};
    // An unparsable clock would silently disable quiet hours, so refuse it instead of saving it.
    if(parseClock(parsed.data.quietStart)===null||parseClock(parsed.data.quietEnd)===null){
      return {status:'error',reason:'invalid',message:(await localeIsEn())?'Enter the time as HH:MM':'সময় HH:MM ফরম্যাটে দিন'};
    }
    const phone=parsed.data.institutePhone.trim();
    if(phone&&!normalizePhone(phone))return {status:'error',reason:'invalid',message:(await localeIsEn())?'The institute number is not valid':'প্রতিষ্ঠানের নম্বর সঠিক নয়'};
    await CenterSettings.updateOne(
      {key:'main'},
      {$set:{
        smsUnitCost:parsed.data.smsUnitCost,
        quietStart:parsed.data.quietStart,
        quietEnd:parsed.data.quietEnd,
        institutePhone:normalizePhone(phone)||'',
        autoReceipt:checked(form.get('autoReceipt')),
        autoResult:checked(form.get('autoResult')),
        autoDue:checked(form.get('autoDue')),
        autoDueDay:parsed.data.autoDueDay,
      }},
      {upsert:true,runValidators:true,setDefaultsOnInsert:true},
    );
    await audit(admin.id,'sms.settings','main');
    refreshSms();
    return {status:'ok'};
  }catch{return {status:'error',reason:'unavailable'}}
}

/**
 * Send one test message to the operator's own number. Never to a student: the point is to prove the
 * credentials, sender id and IP whitelist without spending a family's patience.
 */
export async function sendTestSmsAction(_:ActionState,form:FormData):Promise<ActionState>{
  try{
    const admin=await requireAdmin();
    const raw=String(form.get('phone')||'').trim();
    const phone=normalizePhone(raw);
    if(!phone)return {status:'error',reason:'invalid',message:'নম্বরটি সঠিক নয় (০১XXXXXXXXX)'};
    const result=await sendTestSms(phone,admin.id);
    refreshSms();
    const en=await localeIsEn();
    if(result.status!=='sent')return {status:'error',reason:'unavailable',message:en?`Not sent: ${result.message}`:`পাঠানো যায়নি: ${result.message}`};
    return {status:'ok',message:en?'Test message submitted.':'পরীক্ষামূলক এসএমএস জমা হয়েছে।'};
  }catch{return {status:'error',reason:'unavailable'}}
}

const batchIdSchema=z.string().regex(/^[a-f\d]{24}$/i);

/** Re-send only the failed rows of one batch. Explicit, audited, and never automatic. */
export async function retrySmsBatch(_:ActionState,form:FormData):Promise<ActionState>{
  try{
    const admin=await requireAdmin();
    const parsed=batchIdSchema.safeParse(String(form.get('batchId')||''));
    if(!parsed.success)return {status:'error',reason:'invalid'};
    const result=await retryFailedSms(parsed.data,admin.id);
    refreshSms();
    if(!result.retried)return {status:'error',reason:'invalid',message:(await localeIsEn())?'No failed messages to retry':'রিট্রাই করার মতো ব্যর্থ বার্তা নেই'};
    return {status:'ok',message:`${result.sent}/${result.retried}`};
  }catch{return {status:'error',reason:'unavailable'}}
}

const templateSchema=z.object({
  key:z.string().trim().min(2).max(80),
  name:z.string().trim().min(1).max(120),
  body:z.string().trim().max(2000),
});

/**
 * Save an edited template. Message content stays Bangla; a template body may be empty only for the
 * free-text `custom` entry, which is never stored.
 */
export async function saveSmsTemplate(_:ActionState,form:FormData):Promise<ActionState>{
  try{
    const admin=await requireAdmin();
    const parsed=templateSchema.safeParse({key:form.get('key'),name:form.get('name'),body:form.get('body')});
    if(!parsed.success)return {status:'error',reason:'invalid'};
    if(parsed.data.key==='custom')return {status:'error',reason:'invalid',message:(await localeIsEn())?'Free text is not stored as a template':'নিজের লেখা বার্তা সংরক্ষণ করা হয় না'};
    if(!parsed.data.body)return {status:'error',reason:'invalid',message:(await localeIsEn())?'The message body cannot be empty':'বার্তার লেখা খালি রাখা যাবে না'};
    const variables=[...new Set([...parsed.data.body.matchAll(/\{(\w+)\}/g)].map(match=>match[1]))];
    await CenterSmsTemplate.updateOne(
      {key:parsed.data.key},
      // An unchecked checkbox submits nothing at all, so absence must mean "not active" — falling
      // back to true here would silently re-activate a template the operator just switched off.
      {$set:{name:parsed.data.name,body:{bn:parsed.data.body},variables,active:checked(form.get('active'))}},
      {upsert:true,runValidators:true,setDefaultsOnInsert:true},
    );
    await audit(admin.id,'sms.template',parsed.data.key);
    refreshSms();
    return {status:'ok'};
  }catch{return {status:'error',reason:'unavailable'}}
}
