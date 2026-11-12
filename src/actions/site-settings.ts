'use server';
import {revalidatePath} from 'next/cache';
import {requireAdmin} from '@/lib/admin/guard';
import {audit} from '@/lib/admin/helpers';
import {SiteSettingsContent} from '@/models/PublicContent';
import {siteSettingsSchema} from '@/schemas/site-settings';
import {siteSettings} from '@/data/seed-content';
import type {ActionState} from './admin';
export async function saveSiteSettings(_:ActionState,form:FormData):Promise<ActionState>{try{const admin=await requireAdmin();const parsed=siteSettingsSchema.safeParse(Object.fromEntries(form.entries()));if(!parsed.success)return {status:'error'};const d=parsed.data;await SiteSettingsContent.init();await SiteSettingsContent.updateOne({key:'main'},{$set:{...(d.website!==undefined?{website:d.website}:{}),...(d.taglineBn!==undefined?{taglineBn:d.taglineBn}:{}),name:{bn:d.nameBn,en:d.nameEn},address:{bn:d.addressBn,en:d.addressEn},logoUrl:d.logoUrl,social:{facebook:d.facebook,youtube:d.youtube}},$setOnInsert:{key:'main',theme:siteSettings.theme}},{upsert:true,runValidators:true});await audit(admin.id,'site-settings.update','main');for(const l of ['bn','en']){revalidatePath(`/${l}`,'layout');revalidatePath(`/${l}`);revalidatePath(`/${l}/contact`);revalidatePath(`/${l}/admin/site-settings`);}return {status:'ok'};}catch{return {status:'error'}}}
