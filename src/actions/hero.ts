'use server';
import {revalidatePath} from 'next/cache';
import {requireAdmin} from '@/lib/admin/guard';
import {audit} from '@/lib/admin/helpers';
import {HeroBanner} from '@/models/HeroBanner';
import {heroSchema} from '@/schemas/hero';
import type {ActionState} from './admin';
export async function saveHero(_:ActionState,form:FormData):Promise<ActionState>{try{const admin=await requireAdmin();const parsed=heroSchema.safeParse({...Object.fromEntries(form.entries()),published:form.get('published')==='on'});if(!parsed.success)return {status:'error'};const d=parsed.data;await HeroBanner.init();await HeroBanner.updateOne({key:'home'},{$set:{title1:{bn:d.title1Bn,en:d.title1En},title2:{bn:d.title2Bn,en:d.title2En},description:{bn:d.descriptionBn,en:d.descriptionEn},imageAlt:{bn:d.imageAltBn,en:d.imageAltEn},imageUrl:d.imageUrl,published:d.published},$setOnInsert:{key:'home'}},{upsert:true,runValidators:true});await audit(admin.id,'hero.update','home');for(const locale of ['bn','en']){revalidatePath(`/${locale}`);revalidatePath(`/${locale}/admin/hero`)}return {status:'ok'};}catch{return {status:'error'}}}
