import {revalidatePath} from 'next/cache';
import {SiteSettingsContent} from '@/models/PublicContent';
import {purgeAtFor} from '@/models/recycle';
import {audit} from './helpers';

/**
 * The social-proof milestones bin (R1 §E6, third wave). Milestones live inside the single
 * SiteSettingsContent document, so they cannot join the document-level Recycle Bin engine; they
 * keep the same promise instead — a named delete, 30 days to restore, then the daily job removes
 * them for good. Views (live list, bin list) are filtered projections of one array, and every
 * write goes through here so the two views never disagree.
 */
export interface ProofMilestone{year:number;title:{bn:string;en:string};deletedAt?:Date;purgeAt?:Date}

export function milestoneName(m:ProofMilestone):string{return `${m.title?.bn||m.title?.en||'milestone'} (${m.year})`}
export const liveMilestones=(list:ProofMilestone[]):ProofMilestone[]=>list.filter(m=>!m.deletedAt);
export const binnedMilestones=(list:ProofMilestone[]):ProofMilestone[]=>list.filter(m=>m.deletedAt);

function revalidateHome():void{
  for(const locale of ['bn','en'])for(const route of ['','/about']){
    try{revalidatePath(`/${locale}${route}`)}catch{/* no request context: nothing cached to refresh */}
  }
}

/** Absolute position in the stored array of the n-th row of a filtered view. */
function absoluteIndex(list:ProofMilestone[],view:number,live:boolean):number{
  let seen=-1;
  for(let i=0;i<list.length;i++){
    if(live?!list[i].deletedAt:!!list[i].deletedAt){seen++;if(seen===view)return i}
  }
  return -1;
}

export async function deleteProofMilestone(view:number,actor:string,now:Date=new Date()):Promise<{status:'ok';name:string}|{status:'missing'}>{
  const doc=await SiteSettingsContent.findOne({key:'main'});
  const list:ProofMilestone[]=doc?.proof?.milestones||[];
  const at=absoluteIndex(list,view,true);
  if(at<0)return {status:'missing'};
  const name=milestoneName(list[at]);
  list[at]={...list[at],deletedAt:now,purgeAt:purgeAtFor(now)};
  if(doc){doc.markModified('proof.milestones');await doc.save()}
  await audit(actor,'proof.milestone.delete',name);
  revalidateHome();
  return {status:'ok',name};
}

export async function restoreProofMilestone(view:number,actor:string):Promise<{status:'ok';name:string}|{status:'missing'}>{
  const doc=await SiteSettingsContent.findOne({key:'main'});
  const list:ProofMilestone[]=doc?.proof?.milestones||[];
  const at=absoluteIndex(list,view,false);
  if(at<0)return {status:'missing'};
  const name=milestoneName(list[at]);
  const {deletedAt,purgeAt,...rest}=list[at] as ProofMilestone&Record<string,unknown>;
  void deletedAt;void purgeAt;
  list[at]=rest as ProofMilestone;
  if(doc){doc.markModified('proof.milestones');await doc.save()}
  await audit(actor,'proof.milestone.restore',name);
  revalidateHome();
  return {status:'ok',name};
}

/** Called by /api/admin/jobs/daily: milestones whose 30 days are up leave the document for good. */
export async function purgeExpiredProofMilestones(now:Date=new Date()):Promise<number>{
  const doc=await SiteSettingsContent.findOne({key:'main'});
  const list:ProofMilestone[]=doc?.proof?.milestones||[];
  const kept=list.filter(m=>!m.deletedAt||!m.purgeAt||m.purgeAt.getTime()>now.getTime());
  if(kept.length===list.length)return 0;
  for(const gone of list.filter(m=>!kept.includes(m)))await audit('system','proof.milestone.purge',milestoneName(gone));
  if(doc&&doc.proof){doc.proof.milestones=kept as never;doc.markModified('proof.milestones');await doc.save()}
  revalidateHome();
  return list.length-kept.length;
}
