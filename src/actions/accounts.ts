'use server';
import {revalidatePath} from 'next/cache';
import {requireAdmin} from '@/lib/admin/guard';
import {audit} from '@/lib/admin/helpers';
import {User} from '@/models/User';
import {toggleSchema} from '@/schemas/admin';
import type {ActionState} from './admin';
/** Administrators may only change the status of teacher, student or parent accounts. */
export async function setPortalAccountActive(_:ActionState,form:FormData):Promise<ActionState>{try{const admin=await requireAdmin();const v=toggleSchema.safeParse(Object.fromEntries(form.entries()));if(!v.success)return {status:'error'};const enabled=v.data.enabled==='true';const result=await User.updateOne({_id:v.data.id,role:{$in:['teacher','student','parent']},active:!enabled},{$set:{active:enabled},$unset:{resetTokenHash:1,resetExpiresAt:1},$inc:{sessionVersion:1}});if(!result.matchedCount)return {status:'error'};await audit(admin.id,enabled?'portal.user.activate':'portal.user.deactivate',v.data.id);for(const l of ['bn','en']){revalidatePath(`/${l}/admin/accounts`);revalidatePath(`/${l}/admin/academics`)}return {status:'ok'};}catch{return {status:'error'}}}
/** Updating contact details revokes all existing sessions and any outstanding reset link. */
export async function editPortalAccount(_:ActionState,form:FormData):Promise<ActionState>{try{const admin=await requireAdmin();const {editPortalAccountSchema}=await import('@/schemas/accounts');const v=editPortalAccountSchema.safeParse(Object.fromEntries(form.entries()));if(!v.success)return {status:'error'};await User.init();const result=await User.updateOne({_id:v.data.id,role:{$in:['teacher','student','parent']}},{$set:{name:v.data.name,email:v.data.email},$unset:{resetTokenHash:1,resetExpiresAt:1},$inc:{sessionVersion:1}},{runValidators:true});if(!result.matchedCount)return {status:'error'};await audit(admin.id,'portal.user.update',v.data.id);for(const l of ['bn','en']){revalidatePath(`/${l}/admin/accounts`);revalidatePath(`/${l}/admin/academics`)}return {status:'ok'};}catch(error){return {status:(error as {code?:number}).code===11000?'conflict':'error'}}}
