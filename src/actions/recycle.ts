'use server';
import {revalidatePath} from 'next/cache';
import {getLocale} from 'next-intl/server';
import {requireAdmin,requireArchiver,getStaff} from '@/lib/admin/guard';
import {softDelete,restoreRecord,purgeOne,archiveRecord,kindDef,type RecycleKind} from '@/lib/admin/recycle';
import {binFilter} from '@/models/recycle';
import {kindSchema} from '@/lib/admin/recycle-kinds';
import {idSchema} from '@/schemas/admin';
import {z} from 'zod';
import type {ActionState} from './admin';



function refreshBin():void{
  for(const locale of ['bn','en'])revalidatePath(`/${locale}/admin/recycle-bin`);
}

/** The reference sentence the operator reads must be in the language they are working in. */
async function currentLocale():Promise<'bn'|'en'>{
  try{return (await getLocale())==='en'?'en':'bn'}catch{return 'bn'}
}

/** Row-action Delete: bins the record for 30 days. Admin and super admin only. */
export async function softDeleteItem(_:ActionState,form:FormData):Promise<ActionState>{
  try{
    const admin=await requireAdmin();
    const kind=kindSchema.safeParse(form.get('kind')),id=idSchema.safeParse(form.get('id'));
    if(!kind.success||!id.success)return {status:'error'};
    const outcome=await softDelete(kind.data as RecycleKind,id.data,admin.id);
    if(outcome.status==='blocked')return {status:'conflict',message:(await currentLocale())==='en'?outcome.messageEn:outcome.messageBn};
    if(outcome.status==='missing')return {status:'error'};
    refreshBin();
    return {status:'ok',message:outcome.name};
  }catch{return {status:'error'}}
}

/** Restore from the Recycle Bin: the staff floor (staff, admin, super admin). */
export async function restoreBinItem(_:ActionState,form:FormData):Promise<ActionState>{
  try{
    const archiver=await requireArchiver();
    const kind=kindSchema.safeParse(form.get('kind')),id=idSchema.safeParse(form.get('id'));
    if(!kind.success||!id.success)return {status:'error'};
    const outcome=await restoreRecord(kind.data as RecycleKind,id.data,archiver.id);
    if(outcome.status!=='ok')return {status:'error'};
    refreshBin();
    return {status:'ok'};
  }catch{return {status:'error'}}
}

/** Bulk Delete from a list: bins every selected row, reporting any that were reference-blocked. */
export async function bulkDeleteItems(_:ActionState,form:FormData):Promise<ActionState>{
  try{
    const admin=await requireAdmin();
    const kind=kindSchema.safeParse(form.get('kind'));
    if(!kind.success)return {status:'error'};
    const ids=form.getAll('ids').map(value=>idSchema.safeParse(value)).filter(result=>result.success).map(result=>result.data);
    if(!ids.length)return {status:'error'};
    const language=await currentLocale();
    let done=0;const blocked:string[]=[];
    for(const id of ids){
      const outcome=await softDelete(kind.data as RecycleKind,id,admin.id);
      if(outcome.status==='ok')done++;
      else if(outcome.status==='blocked')blocked.push(language==='en'?outcome.messageEn:outcome.messageBn);
    }
    refreshBin();
    if(!done&&blocked.length)return {status:'conflict',message:blocked.join(' ')};
    return {status:'ok',message:blocked.length?blocked.join(' '):String(done)};
  }catch{return {status:'error'}}
}

/** Bulk Restore from the Recycle Bin. */
export async function bulkRestoreItems(_:ActionState,form:FormData):Promise<ActionState>{
  try{
    const archiver=await requireArchiver();
    const kind=kindSchema.safeParse(form.get('kind'));
    if(!kind.success)return {status:'error'};
    const ids=form.getAll('ids').map(value=>idSchema.safeParse(value)).filter(result=>result.success).map(result=>result.data);
    if(!ids.length)return {status:'error'};
    let done=0;
    for(const id of ids){
      if((await restoreRecord(kind.data as RecycleKind,id,archiver.id)).status==='ok')done++;
    }
    refreshBin();
    return done?{status:'ok',message:String(done)}:{status:'error'};
  }catch{return {status:'error'}}
}

/** Archive/hide instead of delete — the staff floor, offered when a delete is reference-blocked. */
export async function archiveItem(_:ActionState,form:FormData):Promise<ActionState>{
  try{
    const archiver=await requireArchiver();
    const kind=kindSchema.safeParse(form.get('kind')),id=idSchema.safeParse(form.get('id'));
    if(!kind.success||!id.success)return {status:'error'};
    const outcome=await archiveRecord(kind.data as RecycleKind,id.data,archiver.id);
    if(outcome.status!=='ok')return {status:'error'};
    return {status:'ok'};
  }catch{return {status:'error'}}
}

/** "Delete forever" in the Recycle Bin: super admin only, and the exact name must be typed. */
export async function purgeForeverItem(_:ActionState,form:FormData):Promise<ActionState>{
  try{
    const user=await getStaff();
    if(!user||user.role!=='superadmin')return {status:'error'};
    const kind=kindSchema.safeParse(form.get('kind')),id=idSchema.safeParse(form.get('id'));
    if(!kind.success||!id.success)return {status:'error'};
    const def=kindDef(kind.data as RecycleKind);
    // The record is binned, so the read must opt out of the auto-hide rule.
    const doc=await def.model().findOne({_id:id.data,...binFilter}).lean<Record<string,unknown>>();
    const expected=doc?def.nameOf(doc as never):'';
    const typed=String(form.get('confirmName')||'').trim();
    if(!expected||typed!==expected)return {status:'conflict'};
    const outcome=await purgeOne(kind.data as RecycleKind,id.data,user.id);
    if(outcome.status!=='ok')return {status:'error'};
    refreshBin();
    return {status:'ok'};
  }catch{return {status:'error'}}
}
