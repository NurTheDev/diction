'use server';
import {revalidatePath} from 'next/cache';
import {requireAdmin} from '@/lib/admin/guard';
import {MediaFile} from '@/models/MediaFile';
import {softDelete} from '@/lib/admin/recycle';
import {idSchema} from '@/schemas/admin';
import type {ActionState} from './admin';
export async function deleteMedia(_:ActionState,form:FormData):Promise<ActionState>{try{const admin=await requireAdmin();const id=idSchema.safeParse(form.get('id'));if(!id.success)return {status:'error'};const media=await MediaFile.findById(id.data);if(!media||!media.publicId.startsWith('dictioncoaching/'))return {status:'error'};const outcome=await softDelete('media',id.data,admin.id);if(outcome.status==='blocked')return {status:'conflict'};if(outcome.status==='missing')return {status:'error'};for(const locale of ['bn','en'])revalidatePath(`/${locale}/admin/media`);return {status:'ok'};}catch{return {status:'error'};}}
