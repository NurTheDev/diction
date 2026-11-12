'use server';
import {requireAdmin} from '@/lib/admin/guard';
import {linkLegacyStudent} from '@/lib/center/legacy-link';
import {revalidatePath} from 'next/cache';
export type LegacyLinkState={status:'idle'|'ok'|'error';message?:string};
export async function linkLegacyStudentAction(_:LegacyLinkState,form:FormData):Promise<LegacyLinkState>{const actor=await requireAdmin();if(process.env.CENTER_LEGACY_LINK_ENABLED!=='true')return {status:'error',message:'DISABLED'};if(form.get('confirm')!=='YES')return {status:'error',message:'CONFIRM'};try{const result=await linkLegacyStudent({legacyId:String(form.get('legacy')||''),centerId:String(form.get('center')||''),actor:actor.id,reason:String(form.get('reason')||'')});for(const l of ['bn','en'])revalidatePath(`/${l}/admin/students/legacy-review`);return {status:'ok',message:result.replayed?'ALREADY_LINKED':'LINKED'}}catch(e){return {status:'error',message:(e as Error).message}}}
