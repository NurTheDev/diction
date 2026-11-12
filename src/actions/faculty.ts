'use server';
import {revalidatePath} from 'next/cache';
import {requireAdmin} from '@/lib/admin/guard';
import {audit} from '@/lib/admin/helpers';
import {createSlug} from '@/lib/admin/slug';
import {TeacherContent} from '@/models/PublicContent';
import {facultySchema} from '@/schemas/faculty';
import {idSchema} from '@/schemas/admin';
import type {ActionState} from './admin';
function refresh(){for(const locale of ['bn','en']){revalidatePath(`/${locale}`);revalidatePath(`/${locale}/teachers`);revalidatePath(`/${locale}/admin/faculty`);}}
export async function saveFaculty(_:ActionState,form:FormData):Promise<ActionState>{try{const admin=await requireAdmin();const input={...Object.fromEntries(form.entries()),slug:form.has('id')?form.get('slug'):createSlug(form.get('nameEn'),'teacher'),director:form.get('director')==='on',published:form.get('published')==='on'};const v=facultySchema.safeParse(input);if(!v.success)return {status:'error'};const d=v.data;const values={slug:d.slug,name:{bn:d.nameBn,en:d.nameEn},qualification:{bn:d.qualificationBn,en:d.qualificationEn},bio:{bn:d.bioBn,en:d.bioEn},director:d.director,published:d.published,order:d.order,photoUrl:d.photoUrl};await TeacherContent.init();if(form.has('id')){const id=idSchema.safeParse(form.get('id'));if(!id.success)return {status:'error'};const result=await TeacherContent.updateOne({_id:id.data,slug:d.slug},{$set:values},{runValidators:true});if(!result.matchedCount)return {status:'error'};await audit(admin.id,'faculty.update',id.data);}else{const result=await TeacherContent.create(values);await audit(admin.id,'faculty.create',String(result._id));}refresh();return {status:'ok'};}catch(error){return {status:(error as {code?:number}).code===11000?'conflict':'error'};}}
