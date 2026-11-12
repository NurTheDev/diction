'use server';
import {revalidatePath} from 'next/cache';
import {requireAdmin} from '@/lib/admin/guard';
import {audit} from '@/lib/admin/helpers';
import {SiteSettingsContent} from '@/models/PublicContent';
import {siteSettings} from '@/data/seed-content';
import {themeSchema} from '@/schemas/theme';
import type {ActionState} from './admin';
export async function saveTheme(_:ActionState,form:FormData):Promise<ActionState>{try{const admin=await requireAdmin();const v=themeSchema.safeParse(Object.fromEntries(form.entries()));if(!v.success)return {status:'error'};await SiteSettingsContent.init();await SiteSettingsContent.updateOne({key:'main'},{$set:{'theme.primary':v.data.primary,'theme.action':v.data.action},$setOnInsert:{key:'main',name:siteSettings.name,address:siteSettings.address,logoUrl:siteSettings.logoUrl,social:siteSettings.social,'theme.success':siteSettings.theme.success,'theme.info':siteSettings.theme.info}},{upsert:true,runValidators:true});await audit(admin.id,'site-theme.update','main');for(const l of ['bn','en']){revalidatePath(`/${l}`,'layout');revalidatePath(`/${l}`);revalidatePath(`/${l}/contact`);revalidatePath(`/${l}/admin/site-settings`)}return {status:'ok'};}catch{return {status:'error'}}}
