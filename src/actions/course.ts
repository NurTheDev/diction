'use server';
import {requireAdmin} from '@/lib/admin/guard';
import {audit} from '@/lib/admin/helpers';
import {createSlug} from '@/lib/admin/slug';
import {Course} from '@/models/Course';
import {softDelete} from '@/lib/admin/recycle';
import {courseSchema} from '@/schemas/course';
import {idSchema} from '@/schemas/admin';
import {revalidatePath} from 'next/cache';
import type {ActionState} from './admin';
function refresh(){for(const l of ['bn','en']){revalidatePath(`/${l}/courses`);revalidatePath(`/${l}/admin/courses`)}}
export async function saveCourse(_:ActionState,form:FormData):Promise<ActionState>{try{const admin=await requireAdmin();const parsed=courseSchema.safeParse({...Object.fromEntries(form.entries()),slug:form.has('id')?form.get('slug'):createSlug(form.get('titleEn'),'course'),published:form.get('published')==='on'});if(!parsed.success)return {status:'error'};const d=parsed.data;const values={slug:d.slug,grade:d.grade,subject:d.subject,title:{bn:d.titleBn,en:d.titleEn},description:{bn:d.descriptionBn,en:d.descriptionEn},schedule:{bn:d.scheduleBn,en:d.scheduleEn},fee:{bn:d.feeBn,en:d.feeEn},order:d.order,published:d.published};await Course.init();let target;if(form.has('id')){const id=idSchema.safeParse(form.get('id'));if(!id.success)return {status:'error'};const result=await Course.updateOne({_id:id.data,slug:d.slug},{$set:values},{runValidators:true});if(!result.matchedCount)return {status:'error'};target=id.data}else{const result=await Course.create(values);target=String(result._id)}await audit(admin.id,`course.${form.has('id')?'update':'create'}`,target);refresh();return {status:'ok'};}catch(e){return {status:(e as {code?:number}).code===11000?'conflict':'error'}}}
export async function deleteCourse(_:ActionState,form:FormData):Promise<ActionState>{try{const admin=await requireAdmin();const id=idSchema.safeParse(form.get('id'));if(!id.success)return {status:'error'};const outcome=await softDelete('course',id.data,admin.id);if(outcome.status==='blocked')return {status:'conflict',message:outcome.messageBn};if(outcome.status==='missing')return {status:'error'};refresh();return {status:'ok'};}catch{return {status:'error'}}}
