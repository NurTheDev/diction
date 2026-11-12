'use server';
import {revalidatePath} from 'next/cache';
import {requireAdmin,requireArchiver} from '@/lib/admin/guard';
import {deleteProofMilestone,restoreProofMilestone,binnedMilestones} from '@/lib/admin/proof-bin';
import {z} from 'zod';
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
    // The form only ever edits live milestones; binned rows stay in the document until the daily
    // job purges them, otherwise every save would empty the bin behind the operator's back.
    const stored=await SiteSettingsContent.findOne({key:'main'}).select('proof').lean();
    const binned=binnedMilestones(stored?.proof?.milestones||[]);
    const merged={...proof.data,milestones:[...proof.data.milestones,...binned]};
    await SiteSettingsContent.init();
    await SiteSettingsContent.updateOne({key:'main'},{$set:{proof:merged},$setOnInsert:{key:'main',name:siteSettings.name,address:siteSettings.address,logoUrl:siteSettings.logoUrl,social:siteSettings.social,theme:siteSettings.theme}},{upsert:true,runValidators:true});
    await audit(admin.id,'site-proof.update','main');
    for(const locale of ['bn','en']){revalidatePath(`/${locale}`,'layout');revalidatePath(`/${locale}`);revalidatePath(`/${locale}/about`);revalidatePath(`/${locale}/admin/site-settings`)}
    return {status:'ok'};
  }catch{return {status:'error'}}
}

const viewIndex=z.coerce.number().int().min(0).max(99);

/** Milestone delete: 30 days in the in-document bin, Undo from the toast, restore from the bin. */
export async function deleteProofMilestoneItem(_:ActionState,form:FormData):Promise<ActionState>{
  try{
    const admin=await requireAdmin();
    const index=viewIndex.safeParse(form.get('index'));
    if(!index.success)return {status:'error'};
    const outcome=await deleteProofMilestone(index.data,admin.id);
    if(outcome.status==='missing')return {status:'error'};
    return {status:'ok',message:outcome.name};
  }catch{return {status:'error'}}
}

/** Restore is the staff floor, like every other restore in R1. */
export async function restoreProofMilestoneItem(_:ActionState,form:FormData):Promise<ActionState>{
  try{
    const archiver=await requireArchiver();
    const index=viewIndex.safeParse(form.get('index'));
    if(!index.success)return {status:'error'};
    const outcome=await restoreProofMilestone(index.data,archiver.id);
    if(outcome.status==='missing')return {status:'error'};
    return {status:'ok',message:outcome.name};
  }catch{return {status:'error'}}
}
