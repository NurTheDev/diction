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
import {formatNumber,type Digits} from './format';
import bnMessages from '@/messages/bn.json';
import enMessages from '@/messages/en.json';
import {Editorial} from '@/models/Editorial';
import {Lead} from '@/models/Lead';
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
import {TeacherCandidate} from '@/models/TeacherCandidate';
import {managedStaffRoles} from '@/schemas/admin-staff';
import {binFilter,liveFilter,purgeAtFor,RECYCLE_RETENTION_DAYS} from '@/models/recycle';
import {audit} from '@/lib/admin/helpers';
import {getCloudinary} from '@/lib/cloudinary';
import {revalidatePath} from 'next/cache';

export {recycleKinds,archivableKinds,canArchiveKind} from './recycle-kinds';
export type RecycleKind=import('./recycle-kinds').RecycleKind;

export interface ReferenceCount{count:number;messageKey:string}
export interface CloudAsset{publicId:string;resource:'image'|'raw'|'video'}
type AnyDoc=Record<string,any>&{_id:Types.ObjectId};

export interface RecycleKindDef{
  kind:RecycleKind;
  /** The kind's name as a catalog key inside `recycleBin` (`kindNames.lead`): the bin page paints it in
      the reader's language and the registry never stores a sentence of its own. */
  labelKey:string;
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
  {kind:'editorial',labelKey:'kindNames.editorial',model:()=>Editorial,nameOf:d=>localized(d,'title')||d.slug,
   publicPaths:d=>{const root=d.kind==='notice'?'/notices':d.kind==='gallery'?'/gallery':'/blog';return d.slug?[root,`${root}/${d.slug}`]:[root]},archiveSet:{published:false}},
  {kind:'course',labelKey:'kindNames.course',model:()=>Course,nameOf:d=>localized(d,'title')||d.slug,publicPaths:()=>['/courses'],archiveSet:{published:false}},
  {kind:'material',labelKey:'kindNames.material',model:()=>LearningMaterial,nameOf:d=>localized(d,'title'),archiveSet:{published:false}},
  {kind:'media',labelKey:'kindNames.media',model:()=>MediaFile,nameOf:d=>String(d.publicId||d.url).split('/').pop()||'media',
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
     return total?[{count:total,messageKey:'recycleBin.kinds.imageInUse'}]:[];
   },
   assets:d=>d.storage==='mongo'||!d.publicId?[]:[{publicId:String(d.publicId),resource:'image'}]},
  {kind:'portalNotice',labelKey:'kindNames.portalNotice',model:()=>PortalNotice,nameOf:d=>localized(d,'title'),archiveSet:{published:false}},
  {kind:'faq',labelKey:'kindNames.faq',model:()=>FAQContent,nameOf:d=>localized(d,'question')||d.key,publicPaths:()=>['','/about'],archiveSet:{published:false}},
  {kind:'facility',labelKey:'kindNames.facility',model:()=>FacilityContent,nameOf:d=>localized(d,'title')||d.key,publicPaths:()=>['','/facilities'],archiveSet:{published:false}},
  {kind:'achievementRecord',labelKey:'kindNames.achievementRecord',model:()=>AchievementRecord,nameOf:d=>d?.card?.name||d.slug,publicPaths:()=>[''],archiveSet:{status:'draft'}},
  {kind:'practiceTest',labelKey:'kindNames.practiceTest',model:()=>PracticeTest,nameOf:d=>d.title||d.slug,
   publicPaths:d=>d.slug?['/practice-tests',`/practice-tests/${d.slug}`]:['/practice-tests'],archiveSet:{published:false}},
  {kind:'publicSheet',labelKey:'kindNames.publicSheet',model:()=>PublicSheet,nameOf:d=>localized(d,'title')||d.slug,
   publicPaths:d=>d.slug?['/lecture-sheets',`/lecture-sheets/${d.slug}`]:['/lecture-sheets'],archiveSet:{published:false}},
  {kind:'classGroup',labelKey:'kindNames.classGroup',model:()=>CenterClassGroup,nameOf:d=>`${localized(d,'name')||'class'} ${d.academicYear||''}`.trim(),
   archiveSet:{active:false},
   references:async id=>{
     const [students,exams]=await Promise.all([
       CenterStudent.countDocuments({classGroup:id,status:{$ne:'removed'}}),
       CenterExam.countDocuments({classGroups:id,...liveFilter}),
     ]);
     const refs:ReferenceCount[]=[];
     if(students)refs.push({count:students,messageKey:'recycleBin.kinds.classStudents'});
     if(exams)refs.push({count:exams,messageKey:'recycleBin.kinds.classExams'});
     return refs;
   }},
  {kind:'centerExam',labelKey:'kindNames.centerExam',model:()=>CenterExam,nameOf:d=>localized(d,'name'),
   references:async id=>{
     const results=await CenterExamResult.countDocuments({exam:id});
     return results?[{count:results,messageKey:'recycleBin.kinds.examResults'}]:[];
   }},
  // ── second wave (§E6): the record types that had no destructive control at all ────────────
  {kind:'slot',labelKey:'kindNames.slot',model:()=>Slot,
   nameOf:d=>[d.grade,d.subject,d.startAt?new Date(d.startAt).toISOString().slice(0,10):''].filter(Boolean).join(' · '),
   publicPaths:()=>['/trial-class'],archiveSet:{enabled:false},
   references:async id=>{
     const bookings=await TrialBooking.countDocuments({slot:id,status:'booked'});
     return bookings?[{count:bookings,messageKey:'recycleBin.kinds.slotBookings'}]:[];
   }},
  {kind:'trialBooking',labelKey:'kindNames.trialBooking',model:()=>TrialBooking,nameOf:d=>d.studentName||d.reference},
  {kind:'admission',labelKey:'kindNames.admission',model:()=>Admission,nameOf:d=>d.studentName||d.reference,
   references:async id=>{
     const doc=await Admission.findById(id).select('status').lean<AnyDoc>();
     return doc&&doc.status==='enrolled'?[{count:1,messageKey:'recycleBin.kinds.admissionConverted'}]:[];
   }},
  {kind:'contactMessage',labelKey:'kindNames.contactMessage',model:()=>ContactMessage,nameOf:d=>d.name||d.reference},
  {kind:'heroBanner',labelKey:'kindNames.heroBanner',model:()=>HeroBanner,nameOf:d=>d.key||'home',
   publicPaths:()=>[''],archiveSet:{published:false}},
  {kind:'teacher',labelKey:'kindNames.teacher',model:()=>TeacherContent,nameOf:d=>localized(d,'name')||d.slug,
   publicPaths:()=>['/teacher'],archiveSet:{published:false}},
  {kind:'portalAccount',labelKey:'kindNames.portalAccount',model:()=>User,nameOf:d=>d.email||d.phone||d.name,
   archiveSet:{active:false},
   references:async id=>{
     const doc=await User.findById(id).select('role').lean<AnyDoc>();
     if(!doc)return [];
     const refs:ReferenceCount[]=[];
     if((managedStaffRoles as readonly string[]).includes(doc.role))refs.push({count:1,messageKey:'recycleBin.kinds.accountStaffRole'});
     const profiles=await AcademicStudent.countDocuments({user:id});
     if(profiles)refs.push({count:profiles,messageKey:'recycleBin.kinds.accountStudentProfiles'});
     return refs;
   }},
  {kind:'exam',labelKey:'kindNames.exam',model:()=>Exam,nameOf:d=>d.titleBn||d.titleEn,
   archiveSet:{published:false},
   references:async id=>{
     const results=await Result.countDocuments({exam:id});
     return results?[{count:results,messageKey:'recycleBin.kinds.legacyExamResults'}]:[];
   }},
  {kind:'modelTest',labelKey:'kindNames.modelTest',model:()=>ModelTest,nameOf:d=>d.titleBn||d.titleEn,
   archiveSet:{published:false},
   references:async id=>{
     const attempts=await TestAttempt.countDocuments({test:id});
     return attempts?[{count:attempts,messageKey:'recycleBin.kinds.modelTestAttempts'}]:[];
   }},
  // ── R3: visitor leads. Archiving is deliberately NOT offered here — a lead has no "unpublished"
  // state, and the brief's 18-month rule is a suggestion on the list, not a field write.
  {kind:'lead',labelKey:'kindNames.lead',model:()=>Lead,nameOf:d=>d.studentName||d.leadId,
   references:async id=>{
     const doc=await Lead.findById(id).select('admission trialBooking student').lean<AnyDoc>();
     if(!doc)return [];
     return doc.admission||doc.student||doc.trialBooking
       ? [{count:1,messageKey:'recycleBin.kinds.leadConverted'}]
       : [];
   }},
  /* R4 · A CV is a private record with no public route to revalidate and no archive state, so this
     entry carries only a name, the reference block (a CV that already made a Teacher profile is a
     hiring record, and binning it would leave the profile claiming an origin the bin is hiding) and
     the Cloudinary assets the purge job has to destroy: the CV file is a `raw` upload, the photo an
     image, and neither is stored as bytes in Mongo. */
  {kind:'teacherCandidate',labelKey:'kindNames.teacherCandidate',model:()=>TeacherCandidate,nameOf:d=>d.name||d.candidateId,
   references:async id=>{
     const doc=await TeacherCandidate.findById(id).select('hiredAsTeacherId').lean<AnyDoc>();
     return doc?.hiredAsTeacherId?[{count:1,messageKey:'recycleBin.kinds.teacherCandidateHired'}]:[];
   },
   assets:d=>[
     ...(d.cvPublicId?[{publicId:String(d.cvPublicId),resource:'raw' as const}]:[]),
     ...(d.photoPublicId?[{publicId:String(d.photoPublicId),resource:'image' as const}]:[]),
   ]},
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

/** One recycleBin sentence in either language, straight from the catalogs. */
function recycleText(language:'bn'|'en',key:string,params:Record<string,unknown>={}):string{
  const catalog=(language==='bn'?bnMessages.recycleBin:enMessages.recycleBin) as unknown as Record<string,string>;
  const template=String(key.split('.').reduce<unknown>((node,part)=>((node||{}) as Record<string,unknown>)[part],catalog)??key);
  return template.replace(/\{(\w+)\}/g,(whole,name)=>(name in params?String(params[name]):whole));
}

/** The blocked-delete sentence, in one language, with the counts in that language's digits. */
export function blockedMessage(refs:ReferenceCount[],language:'bn'|'en'='bn'):string{
  const digits:Digits=language==='bn'?'bn':'en';
  const parts=refs.map(ref=>`${formatNumber(ref.count,digits)} ${recycleText(language,ref.messageKey.replace('recycleBin.',''))}`).join('; ');
  return recycleText(language,'blocked',{parts});
}

/** Both languages at once: a caller that stores or forwards the refusal keeps the pair. */
export function blockedMessagePair(refs:ReferenceCount[]):{messageBn:string;messageEn:string}{
  return {messageBn:blockedMessage(refs,'bn'),messageEn:blockedMessage(refs,'en')};
}

export type SoftDeleteResult=
  |{status:'ok';purgeAt:Date;name:string}
  |{status:'blocked';refs:ReferenceCount[];message:string;messageBn:string;messageEn:string}
  |{status:'missing'};

/** Moves a live record into the bin for RECYCLE_RETENTION_DAYS. Refuses, with counts, when referenced. */
export async function softDelete(kind:RecycleKind,id:string,actor:string,now:Date=new Date(),language:'bn'|'en'='bn'):Promise<SoftDeleteResult>{
  const def=kindDef(kind);
  const refs=def.references?await def.references(id):[];
  const blocking=refs.filter(ref=>ref.count>0);
  if(blocking.length)return {status:'blocked',refs:blocking,message:blockedMessage(blocking,language),...blockedMessagePair(blocking)};
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

export interface BinEntry{kind:RecycleKind;labelKey:string;id:string;name:string;deletedAt:Date;purgeAt:Date|null}

export async function binList(kind:RecycleKind|undefined,limit=200):Promise<BinEntry[]>{
  const defs=kind?[kindDef(kind)]:recycleRegistry;
  const perKind=await Promise.all(defs.map(async def=>{
    const docs=await def.model().find(binFilter).sort({purgeAt:1}).limit(limit).lean<AnyDoc[]>();
    return docs.map(doc=>({kind:def.kind,labelKey:def.labelKey,id:String(doc._id),name:def.nameOf(doc),deletedAt:doc.deletedAt,purgeAt:doc.purgeAt??null}));
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
