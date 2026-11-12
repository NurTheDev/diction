'use server';
import {revalidatePath} from 'next/cache';
import {requireAdmin} from '@/lib/admin/guard';
import {audit} from '@/lib/admin/helpers';
import {LearningMaterial} from '@/models/LearningMaterial';
import {softDelete} from '@/lib/admin/recycle';
import {idSchema,toggleSchema} from '@/schemas/admin';
import type {ActionState} from './admin';
function refresh(){for(const l of ['bn','en'])for(const path of ['/admin/materials','/dashboard/materials','/teacher/materials','/parent/materials'])revalidatePath(`/${l}${path}`)}
export async function setMaterialPublished(_:ActionState,form:FormData):Promise<ActionState>{try{const admin=await requireAdmin();const v=toggleSchema.safeParse(Object.fromEntries(form.entries()));if(!v.success)return {status:'error'};const result=await LearningMaterial.updateOne({_id:v.data.id},{$set:{published:v.data.enabled==='true'}});if(!result.matchedCount)return {status:'error'};await audit(admin.id,'material.publish',v.data.id);refresh();return {status:'ok'};}catch{return {status:'error'}}}
export async function deleteMaterial(_:ActionState,form:FormData):Promise<ActionState>{try{const admin=await requireAdmin();const id=idSchema.safeParse(form.get('id'));if(!id.success)return {status:'error'};const outcome=await softDelete('material',id.data,admin.id);if(outcome.status==='blocked')return {status:'conflict',message:outcome.messageBn};if(outcome.status==='missing')return {status:'error'};refresh();return {status:'ok'};}catch{return {status:'error'}}}
