'use server';
import {revalidatePath} from 'next/cache';
import {requireAdmin} from '@/lib/admin/guard';
import {audit} from '@/lib/admin/helpers';
import {SiteSettingsContent} from '@/models/PublicContent';
import {siteSettings} from '@/data/seed-content';
import {socialProofSchema} from '@/schemas/social-proof';
import type {ActionState} from './admin';

export async function saveSocialProof(_:ActionState,form:FormData):Promise<ActionState>{
  try{
    const admin=await requireAdmin();
    const numeric=(name:string)=>{const raw=form.get(name);return typeof raw==='string'&&raw.trim()!==''?Number(raw):null};
    const raw=form.get('milestones');
    if(typeof raw!=='string'||raw.length>10000)return {status:'error'};
    const proof=socialProofSchema.safeParse({published:form.get('published')==='on',studentCount:numeric('studentCount'),studentMinimum:form.get('studentMinimum')==='on',rating:numeric('rating'),ratingCount:numeric('ratingCount'),milestones:JSON.parse(raw)});
    if(!proof.success)return {status:'error'};
    await SiteSettingsContent.init();
    await SiteSettingsContent.updateOne({key:'main'},{$set:{proof:proof.data},$setOnInsert:{key:'main',name:siteSettings.name,address:siteSettings.address,logoUrl:siteSettings.logoUrl,social:siteSettings.social,theme:siteSettings.theme}},{upsert:true,runValidators:true});
    await audit(admin.id,'site-proof.update','main');
    for(const locale of ['bn','en']){revalidatePath(`/${locale}`,'layout');revalidatePath(`/${locale}`);revalidatePath(`/${locale}/about`);revalidatePath(`/${locale}/admin/site-settings`)}
    return {status:'ok'};
  }catch{return {status:'error'}}
}
