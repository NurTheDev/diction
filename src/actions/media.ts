'use server';
import {revalidatePath} from 'next/cache';
import {requireAdmin} from '@/lib/admin/guard';
import {audit} from '@/lib/admin/helpers';
import {getCloudinary} from '@/lib/cloudinary';
import {MediaFile} from '@/models/MediaFile';
import {Editorial} from '@/models/Editorial';
import {HeroBanner} from '@/models/HeroBanner';
import {TeacherContent,SiteSettingsContent} from '@/models/PublicContent';
import {idSchema} from '@/schemas/admin';
import type {ActionState} from './admin';
export async function deleteMedia(_:ActionState,form:FormData):Promise<ActionState>{try{const admin=await requireAdmin();const id=idSchema.safeParse(form.get('id'));if(!id.success)return {status:'error'};const media=await MediaFile.findById(id.data);if(!media||!media.publicId.startsWith('dictioncoaching/'))return {status:'error'};const [editorial,teacher,settings,hero]=await Promise.all([Editorial.exists({$or:[{imageUrl:media.url},{extraImages:media.url}]}),TeacherContent.exists({photoUrl:media.url}),SiteSettingsContent.exists({logoUrl:media.url}),HeroBanner.exists({imageUrl:media.url})]);if(editorial||teacher||settings||hero)return {status:'conflict'};if(media.storage!=='mongo'){const result=await getCloudinary().uploader.destroy(media.publicId,{resource_type:'image'});if(result.result!=='ok'&&result.result!=='not found')return {status:'error'};}await MediaFile.deleteOne({_id:id.data});await audit(admin.id,'media.delete',id.data);for(const locale of ['bn','en'])revalidatePath(`/${locale}/admin/media`);return {status:'ok'};}catch{return {status:'error'};}}
