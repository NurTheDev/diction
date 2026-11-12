'use server';
import {getAdmin} from '@/lib/admin/guard';
import {audit} from '@/lib/admin/helpers';
import {CenterSettings} from '@/models/CenterRecords';
import {managedStaffRoles} from '@/schemas/admin-staff';
import {z} from 'zod';
import type {ActionState} from './admin';

const roleSchema=z.enum(managedStaffRoles);

/**
 * The disable path for managed roles (R1 §E6, third wave): switching a role off here signs its
 * holders out of every admin page (the guards read CenterSettings.disabledRoles), without touching
 * a single account. Super admins only; your own role cannot be switched off under your feet, and
 * superadmin is not a managed role at all.
 */
export async function setRoleDisabled(_:ActionState,form:FormData):Promise<ActionState>{
  try{
    const actor=await getAdmin();
    if(!actor||actor.role!=='superadmin')return {status:'error'};
    const role=roleSchema.safeParse(form.get('role'));
    const disabled=form.get('disabled')==='true';
    if(!role.success)return {status:'error'};
    if((role.data as string)===actor.role)return {status:'error',message:'own-role'};
    await CenterSettings.updateOne({key:'main'},disabled?{$addToSet:{disabledRoles:role.data}}:{$pull:{disabledRoles:role.data}},{upsert:true,runValidators:true});
    await audit(actor.id,disabled?'role.disable':'role.enable',role.data);
    return {status:'ok',message:role.data};
  }catch{return {status:'error'}}
}
