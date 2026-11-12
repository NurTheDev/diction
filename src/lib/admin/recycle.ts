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
import {Admission,ContactMessage,Slot,TrialBooking} from '@/models/Intake';
import {User} from '@/models/User';
import {Exam,Result,Student as AcademicStudent} from '@/models/Academic';
import {ModelTest,TestAttempt} from '@/models/ModelTest';
import {managedStaffRoles} from '@/schemas/admin-staff';
import {binFilter,liveFilter,purgeAtFor,RECYCLE_RETENTION_DAYS} from '@/models/recycle';
import {audit} from '@/lib/admin/helpers';
import {getCloudinary} from '@/lib/cloudinary';
import {formatNumber} from '@/lib/admin/format';
import {revalidatePath} from 'next/cache';

export {recycleKinds,archivableKinds,canArchiveKind} from './recycle-kinds';
export type RecycleKind=import('./recycle-kinds').RecycleKind;

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
  /** Public routes that render this kind, so delete/restore/purge can revalidate them. */
  publicPaths?:(doc:AnyDoc)=>string[];
  /** How to archive/hide instead of deleting (the staff floor). Undefined = no archive path. */
  archiveSet?:Record<string,unknown>;
}

const localized=(doc:AnyDoc,field:string):string=>{
  const value=doc?.[field];
  if(!value)return '';
  if(typeof value==='string')return value;
  return value.bn||value.en||'';
};

export const recycleRegistry:RecycleKindDef[]=[
  {kind:'editorial',labelBn:'ব্লগ/নোটিশ/ভিডিও',labelEn:'Blog / notice / video',model:()=>Editorial,nameOf:d=>localized(d,'title')||d.slug,
   publicPaths:d=>{const root=d.kind==='notice'?'/notices':d.kind==='gallery'?'/gallery':'/blog';return d.slug?[root,`${root}/${d.slug}`]:[root]},archiveSet:{published:false}},
  {kind:'course',labelBn:'কোর্স ও প্যাকেজ',labelEn:'Course or package',model:()=>Course,nameOf:d=>localized(d,'title')||d.slug,publicPaths:()=>['/courses'],archiveSet:{published:false}},
  {kind:'material',labelBn:'স্টাডি ম্যাটেরিয়াল',labelEn:'Study material',model:()=>LearningMaterial,nameOf:d=>localized(d,'title'),archiveSet:{published:false}},
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
  {kind:'portalNotice',labelBn:'পোর্টাল নোটিশ',labelEn:'Portal notice',model:()=>PortalNotice,nameOf:d=>localized(d,'title'),archiveSet:{published:false}},
  {kind:'faq',labelBn:'সচরাচর জিজ্ঞাসা',labelEn:'FAQ',model:()=>FAQContent,nameOf:d=>localized(d,'question')||d.key,publicPaths:()=>['','/about'],archiveSet:{published:false}},
  {kind:'facility',labelBn:'সুবিধা ও বৈশিষ্ট্য',labelEn:'Facility or feature',model:()=>FacilityContent,nameOf:d=>localized(d,'title')||d.key,publicPaths:()=>['','/facilities'],archiveSet:{published:false}},
  {kind:'achievementRecord',labelBn:'অর্জন',labelEn:'Achievement',model:()=>AchievementRecord,nameOf:d=>d?.card?.name||d.slug,publicPaths:()=>[''],archiveSet:{status:'draft'}},
  {kind:'practiceTest',labelBn:'অনুশীলনী পরীক্ষা',labelEn:'Practice test',model:()=>PracticeTest,nameOf:d=>d.title||d.slug,
   publicPaths:d=>d.slug?['/practice-tests',`/practice-tests/${d.slug}`]:['/practice-tests'],archiveSet:{published:false}},
  {kind:'publicSheet',labelBn:'লেকচার শিট',labelEn:'Lecture sheet',model:()=>PublicSheet,nameOf:d=>localized(d,'title')||d.slug,
   publicPaths:d=>d.slug?['/lecture-sheets',`/lecture-sheets/${d.slug}`]:['/lecture-sheets'],archiveSet:{published:false}},
  {kind:'classGroup',labelBn:'ক্লাস গ্রুপ',labelEn:'Class group',model:()=>CenterClassGroup,nameOf:d=>`${localized(d,'name')||'class'} ${d.academicYear||''}`.trim(),
   archiveSet:{active:false},
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
  // ── second wave (§E6): the record types that had no destructive control at all ────────────
  {kind:'slot',labelBn:'ট্রায়াল ক্লাস স্লট',labelEn:'Trial class slot',model:()=>Slot,
   nameOf:d=>[d.grade,d.subject,d.startAt?new Date(d.startAt).toISOString().slice(0,10):''].filter(Boolean).join(' · '),
   publicPaths:()=>['/trial-class'],archiveSet:{enabled:false},
   references:async id=>{
     const bookings=await TrialBooking.countDocuments({slot:id,status:'booked'});
     return bookings?[{count:bookings,bn:'টি বুকিং এই স্লটে নির্ধারিত',en:'booking(s) are scheduled in this slot'}]:[];
   }},
  {kind:'trialBooking',labelBn:'ট্রায়াল বুকিং',labelEn:'Trial booking',model:()=>TrialBooking,nameOf:d=>d.studentName||d.reference},
  {kind:'admission',labelBn:'ভর্তি আবেদন',labelEn:'Admission application',model:()=>Admission,nameOf:d=>d.studentName||d.reference,
   references:async id=>{
     const doc=await Admission.findById(id).select('status').lean<AnyDoc>();
     return doc&&doc.status==='enrolled'?[{count:1,bn:'টি ভর্তি ইতোমধ্যে শিক্ষার্থীতে রূপান্তরিত',en:'admission(s) already converted to a student'}]:[];
   }},
  {kind:'contactMessage',labelBn:'যোগাযোগ বার্তা',labelEn:'Contact message',model:()=>ContactMessage,nameOf:d=>d.name||d.reference},
  {kind:'heroBanner',labelBn:'হিরো ব্যানার',labelEn:'Hero banner',model:()=>HeroBanner,nameOf:d=>d.key||'home',
   publicPaths:()=>[''],archiveSet:{published:false}},
  {kind:'teacher',labelBn:'শিক্ষক পরিচিতি',labelEn:'Teacher profile',model:()=>TeacherContent,nameOf:d=>localized(d,'name')||d.slug,
   publicPaths:()=>['/teacher'],archiveSet:{published:false}},
  {kind:'portalAccount',labelBn:'পোর্টাল অ্যাকাউন্ট',labelEn:'Portal account',model:()=>User,nameOf:d=>d.email||d.phone||d.name,
   archiveSet:{active:false},
   references:async id=>{
     const doc=await User.findById(id).select('role').lean<AnyDoc>();
     if(!doc)return [];
     const refs:ReferenceCount[]=[];
     if((managedStaffRoles as readonly string[]).includes(doc.role))refs.push({count:1,bn:'টি অ্যাকাউন্ট স্টাফ ভূমিকায় — নিষ্ক্রিয় করুন, মুছবেন না',en:'account(s) hold a staff role — disable instead of deleting'});
     const profiles=await AcademicStudent.countDocuments({user:id});
     if(profiles)refs.push({count:profiles,bn:'টি শিক্ষার্থী প্রোফাইল এই অ্যাকাউন্ট ব্যবহার করে',en:'student profile(s) use this account'});
     return refs;
   }},
  {kind:'exam',labelBn:'পরীক্ষা (পুরোনো একাডেমিক)',labelEn:'Legacy academic exam',model:()=>Exam,nameOf:d=>d.titleBn||d.titleEn,
   archiveSet:{published:false},
   references:async id=>{
     const results=await Result.countDocuments({exam:id});
     return results?[{count:results,bn:'টি সংরক্ষিত ফল এই পরীক্ষায়',en:'saved result(s) belong to this exam'}]:[];
   }},
  {kind:'modelTest',labelBn:'মডেল টেস্ট',labelEn:'Model test',model:()=>ModelTest,nameOf:d=>d.titleBn||d.titleEn,
   archiveSet:{published:false},
   references:async id=>{
     const attempts=await TestAttempt.countDocuments({test:id});
     return attempts?[{count:attempts,bn:'টি সংরক্ষিত চেষ্টা এই টেস্টে',en:'saved attempt(s) belong to this test'}]:[];
   }},
];

/**
 * Refresh the public routes that render a kind, so a delete, restore or purge is visible on the
 * website immediately instead of at the next ISR expiry. Outside a request context (unit tests,
 * scripts) there is no cache to invalidate and revalidatePath throws — that is expected and safe
 * to ignore, because those callers never served a cached page.
 */
export function revalidateKind(kind:RecycleKind,doc:AnyDoc|null):void{
  const def=kindDef(kind);
  const paths=def.publicPaths?def.publicPaths(doc||({} as AnyDoc)):[];
  for(const locale of ['bn','en'])for(const route of paths){
    try{revalidatePath(`/${locale}${route}`)}catch{/* no request context: nothing cached to refresh */}
  }
}

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
  |{status:'ok';purgeAt:Date;name:string}
  |{status:'blocked';refs:ReferenceCount[];messageBn:string;messageEn:string}
  |{status:'missing'};

/** Moves a live record into the bin for RECYCLE_RETENTION_DAYS. Refuses, with counts, when referenced. */
export async function softDelete(kind:RecycleKind,id:string,actor:string,now:Date=new Date()):Promise<SoftDeleteResult>{
  const def=kindDef(kind);
  const refs=def.references?await def.references(id):[];
  const blocking=refs.filter(ref=>ref.count>0);
  if(blocking.length)return {status:'blocked',refs:blocking,messageBn:blockedMessage(blocking,true),messageEn:blockedMessage(blocking,false)};
  const purgeAt=purgeAtFor(now);
  const doc=await def.model().findById(id).lean<AnyDoc>();
  const updated=await def.model().updateOne({_id:id,...liveFilter},{$set:{deletedAt:now,deletedBy:actor,purgeAt}});
  if(!updated.matchedCount)return {status:'missing'};
  await audit(actor,`recycle.delete:${kind}`,id);
  revalidateKind(kind,doc);
  return {status:'ok',purgeAt,name:def.nameOf(doc||({} as AnyDoc))};
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
  revalidateKind(kind,await def.model().findById(id).lean<AnyDoc>());
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

export type PurgeOneResult={status:'ok';name:string}|{status:'missing'};

/** Super Admin "delete forever": assets destroyed first, then the document, then the audit row. */
export async function purgeOne(kind:RecycleKind,id:string,actor:string):Promise<PurgeOneResult>{
  const def=kindDef(kind);
  const doc=await def.model().findOne({_id:id,...binFilter}).lean<AnyDoc>();
  if(!doc)return {status:'missing'};
  for(const asset of def.assets?def.assets(doc):[]){
    try{
      const result=await getCloudinary().uploader.destroy(asset.publicId,{resource_type:asset.resource});
      if(result.result!=='ok'&&result.result!=='not found')console.error(`Cloudinary destroy failed for ${asset.publicId}`);
    }catch(error){console.error(`Cloudinary destroy unavailable for ${asset.publicId}: ${(error as Error).message}`)}
  }
  revalidateKind(kind,doc);
  await def.model().deleteOne({_id:doc._id},{recycleAny:true} as never);
  await audit(actor,`recycle.purge:${kind}`,id);
  return {status:'ok',name:def.nameOf(doc)};
}

export type ArchiveResult={status:'ok'}|{status:'missing'}|{status:'no-archive'};

/** The staff floor: hide without deleting. Writes the kind's archive fields and revalidates. */
export async function archiveRecord(kind:RecycleKind,id:string,actor:string):Promise<ArchiveResult>{
  const def=kindDef(kind);
  if(!def.archiveSet)return {status:'no-archive'};
  const updated=await def.model().updateOne({_id:id,...liveFilter},{$set:def.archiveSet});
  if(!updated.matchedCount)return {status:'missing'};
  await audit(actor,`recycle.archive:${kind}`,id);
  revalidateKind(kind,await def.model().findById(id).lean<AnyDoc>());
  return {status:'ok'};
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
      revalidateKind(def.kind,doc);
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
