/**
 * The Recycle Bin engine (R1): soft delete, restore, reference blocking and the 30-day purge.
 *
 * One registry describes every participating record type: how to name a row for dialogs, whether
 * something still references it (so "১৪ জন শিক্ষার্থী এই ক্লাস ব্যবহার করে — মুছে ফেলা যাবে না" is a
 * real count, not a guess), and which Cloudinary assets the purge job must destroy. Actions, the
 * Recycle Bin page and the scheduled job all go through these five functions, so the rules cannot
 * drift between modules.
 *
 * Authorization is NOT decided here: callers must hold requireAdmin() for delete/purge and
 * requireArchiver() for archive-style writes. This file only moves data and writes the audit row.
 */
import type {Model, Types} from 'mongoose';
import {Editorial} from '@/models/Editorial';
import {Course} from '@/models/Course';
import {LearningMaterial} from '@/models/LearningMaterial';
import {MediaFile} from '@/models/MediaFile';
import {PortalNotice} from '@/models/PortalNotice';
import {FAQContent,FacilityContent,SiteSettingsContent} from '@/models/PublicContent';
import {TeacherContent} from '@/models/PublicContent';
import {HeroBanner} from '@/models/HeroBanner';
import {AchievementRecord} from '@/models/AchievementRecord';
import {PracticeTest} from '@/models/PracticeTest';
import {PublicSheet} from '@/models/PublicSheet';
import {CenterClassGroup,CenterExam,CenterExamResult,CenterStudent} from '@/models/CenterRecords';
import {binFilter,liveFilter,purgeAtFor,RECYCLE_RETENTION_DAYS} from '@/models/recycle';
import {audit} from '@/lib/admin/helpers';
import {getCloudinary} from '@/lib/cloudinary';
import {formatNumber} from '@/lib/admin/format';

export type RecycleKind='editorial'|'course'|'material'|'media'|'portalNotice'|'faq'|'facility'|'achievementRecord'|'practiceTest'|'publicSheet'|'classGroup'|'centerExam';

export interface ReferenceCount{count:number;bn:string;en:string}
export interface CloudAsset{publicId:string;resource:'image'|'raw'|'video'}
type AnyDoc=Record<string,any>&{_id:Types.ObjectId};

export interface RecycleKindDef{
  kind:RecycleKind;
  labelBn:string;
  labelEn:string;
  model:()=>Model<any>;
  nameOf:(doc:AnyDoc)=>string;
  references?:(id:string)=>Promise<ReferenceCount[]>;
  assets?:(doc:AnyDoc)=>CloudAsset[];
}

const localized=(doc:AnyDoc,field:string):string=>{
  const value=doc?.[field];
  if(!value)return '';
  if(typeof value==='string')return value;
  return value.bn||value.en||'';
};

export const recycleRegistry:RecycleKindDef[]=[
  {kind:'editorial',labelBn:'ব্লগ/নোটিশ/ভিডিও',labelEn:'Blog / notice / video',model:()=>Editorial,nameOf:d=>localized(d,'title')||d.slug},
  {kind:'course',labelBn:'কোর্স ও প্যাকেজ',labelEn:'Course or package',model:()=>Course,nameOf:d=>localized(d,'title')||d.slug},
  {kind:'material',labelBn:'স্টাডি ম্যাটেরিয়াল',labelEn:'Study material',model:()=>LearningMaterial,nameOf:d=>localized(d,'title')},
  {kind:'media',labelBn:'মিডিয়া লাইব্রেরি',labelEn:'Media library',model:()=>MediaFile,nameOf:d=>String(d.publicId||d.url).split('/').pop()||'media',
   references:async id=>{
     const url=(await MediaFile.findById(id).select('url').lean<AnyDoc>())?.url;
     if(!url)return [];
     const [editorial,teacher,settings,hero]=await Promise.all([
       Editorial.countDocuments({$or:[{imageUrl:url},{extraImages:url}]}),
       TeacherContent.countDocuments({photoUrl:url}),
       SiteSettingsContent.countDocuments({logoUrl:url}),
       HeroBanner.countDocuments({imageUrl:url}),
     ]);
     const total=editorial+teacher+settings+hero;
     return total?[{count:total,bn:'টি জায়গায় ছবিটি এখনো ব্যবহৃত',en:'place(s) still use this image'}]:[];
   },
   assets:d=>d.storage==='mongo'||!d.publicId?[]:[{publicId:String(d.publicId),resource:'image'}]},
  {kind:'portalNotice',labelBn:'পোর্টাল নোটিশ',labelEn:'Portal notice',model:()=>PortalNotice,nameOf:d=>localized(d,'title')},
  {kind:'faq',labelBn:'সচরাচর জিজ্ঞাসা',labelEn:'FAQ',model:()=>FAQContent,nameOf:d=>localized(d,'question')||d.key},
  {kind:'facility',labelBn:'সুবিধা ও বৈশিষ্ট্য',labelEn:'Facility or feature',model:()=>FacilityContent,nameOf:d=>localized(d,'title')||d.key},
  {kind:'achievementRecord',labelBn:'অর্জন',labelEn:'Achievement',model:()=>AchievementRecord,nameOf:d=>d?.card?.name||d.slug},
  {kind:'practiceTest',labelBn:'অনুশীলনী পরীক্ষা',labelEn:'Practice test',model:()=>PracticeTest,nameOf:d=>d.title||d.slug},
  {kind:'publicSheet',labelBn:'লেকচার শিট',labelEn:'Lecture sheet',model:()=>PublicSheet,nameOf:d=>localized(d,'title')||d.slug},
  {kind:'classGroup',labelBn:'ক্লাস গ্রুপ',labelEn:'Class group',model:()=>CenterClassGroup,nameOf:d=>`${localized(d,'name')||'class'} ${d.academicYear||''}`.trim(),
   references:async id=>{
     const [students,exams]=await Promise.all([
       CenterStudent.countDocuments({classGroup:id,status:{$ne:'removed'}}),
       CenterExam.countDocuments({classGroups:id,...liveFilter}),
     ]);
     const refs:ReferenceCount[]=[];
     if(students)refs.push({count:students,bn:'জন শিক্ষার্থী এই ক্লাস ব্যবহার করে',en:'student(s) use this class'});
     if(exams)refs.push({count:exams,bn:'টি পরীক্ষা এই ক্লাস ব্যবহার করে',en:'exam(s) use this class'});
     return refs;
   }},
  {kind:'centerExam',labelBn:'কেন্দ্রের পরীক্ষা',labelEn:'Center exam',model:()=>CenterExam,nameOf:d=>localized(d,'name'),
   references:async id=>{
     const results=await CenterExamResult.countDocuments({exam:id});
     return results?[{count:results,bn:'জন শিক্ষার্থীর ফল এই পরীক্ষায় সংরক্ষিত',en:'saved result(s) belong to this exam'}]:[];
   }},
];

export function kindDef(kind:RecycleKind):RecycleKindDef{
  const def=recycleRegistry.find(entry=>entry.kind===kind);
  if(!def)throw new Error('UNKNOWN_RECYCLE_KIND');
  return def;
}

/** "১৪ জন শিক্ষার্থী এই ক্লাস ব্যবহার করে — মুছে ফেলা যাবে না। আর্কাইভ করুন।" */
export function blockedMessage(refs:ReferenceCount[],bn:boolean):string{
  const parts=refs.map(ref=>`${formatNumber(ref.count,bn?'bn':'en')} ${bn?ref.bn:ref.en}`);
  const joined=parts.join(bn?'; ':'; ');
  return bn?`${joined} — মুছে ফেলা যাবে না। আর্কাইভ করুন।`:`${joined} — cannot be deleted. Archive it instead.`;
}

export type SoftDeleteResult=
  |{status:'ok';purgeAt:Date}
  |{status:'blocked';refs:ReferenceCount[];messageBn:string;messageEn:string}
  |{status:'missing'};

/** Moves a live record into the bin for RECYCLE_RETENTION_DAYS. Refuses, with counts, when referenced. */
export async function softDelete(kind:RecycleKind,id:string,actor:string,now:Date=new Date()):Promise<SoftDeleteResult>{
  const def=kindDef(kind);
  const refs=def.references?await def.references(id):[];
  const blocking=refs.filter(ref=>ref.count>0);
  if(blocking.length)return {status:'blocked',refs:blocking,messageBn:blockedMessage(blocking,true),messageEn:blockedMessage(blocking,false)};
  const purgeAt=purgeAtFor(now);
  const updated=await def.model().updateOne({_id:id,...liveFilter},{$set:{deletedAt:now,deletedBy:actor,purgeAt}});
  if(!updated.matchedCount)return {status:'missing'};
  await audit(actor,`recycle.delete:${kind}`,id);
  return {status:'ok',purgeAt};
}

export type RestoreResult={status:'ok'}|{status:'missing'}|{status:'not-in-bin'};

export async function restoreRecord(kind:RecycleKind,id:string,actor:string):Promise<RestoreResult>{
  const def=kindDef(kind);
  const updated=await def.model().updateOne({_id:id,...binFilter},{$set:{deletedAt:null,deletedBy:null,purgeAt:null}});
  if(!updated.matchedCount){
    const live=await def.model().exists({_id:id,...liveFilter});
    return live?{status:'not-in-bin'}:{status:'missing'};
  }
  await audit(actor,`recycle.restore:${kind}`,id);
  return {status:'ok'};
}

export interface BinEntry{kind:RecycleKind;labelBn:string;labelEn:string;id:string;name:string;deletedAt:Date;purgeAt:Date|null}

export async function binList(kind:RecycleKind|undefined,limit=200):Promise<BinEntry[]>{
  const defs=kind?[kindDef(kind)]:recycleRegistry;
  const perKind=await Promise.all(defs.map(async def=>{
    const docs=await def.model().find(binFilter).sort({purgeAt:1}).limit(limit).lean<AnyDoc[]>();
    return docs.map(doc=>({kind:def.kind,labelBn:def.labelBn,labelEn:def.labelEn,id:String(doc._id),name:def.nameOf(doc),deletedAt:doc.deletedAt,purgeAt:doc.purgeAt??null}));
  }));
  return perKind.flat().sort((a,b)=>(a.purgeAt?.getTime()??0)-(b.purgeAt?.getTime()??0)).slice(0,limit);
}

export async function binCounts():Promise<Record<string,number>>{
  const counts=await Promise.all(recycleRegistry.map(async def=>[def.kind,await def.model().countDocuments(binFilter)] as const));
  return Object.fromEntries(counts);
}

export interface PurgeReport{kind:RecycleKind;purged:number;assetFailures:number}

/**
 * The daily job's worker: everything whose 30 days are up is destroyed for good, Cloudinary assets
 * first. Asset failures are counted, not swallowed silently, so the job can report them.
 */
export async function purgeExpired(now:Date=new Date(),actor?:string):Promise<PurgeReport[]>{
  const reports:PurgeReport[]=[];
  for(const def of recycleRegistry){
    const due=await def.model().find({...binFilter,purgeAt:{$lte:now}}).limit(500).lean<AnyDoc[]>();
    let purged=0,assetFailures=0;
    for(const doc of due){
      const assets=def.assets?def.assets(doc):[];
      for(const asset of assets){
        try{
          const result=await getCloudinary().uploader.destroy(asset.publicId,{resource_type:asset.resource});
          if(result.result!=='ok'&&result.result!=='not found')assetFailures++;
        }catch{assetFailures++}
      }
      await def.model().deleteOne({_id:doc._id},{recycleAny:true} as never);
      // AdminAudit.actor is a required User ref, so the unattended daily job records its totals in
      // its own report/log; a human-triggered purge (Super Admin "delete forever") names the actor.
      if(actor)await audit(actor,`recycle.purge:${def.kind}`,String(doc._id));
      purged++;
    }
    reports.push({kind:def.kind,purged,assetFailures});
  }
  return reports;
}
