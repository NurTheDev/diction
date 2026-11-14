/**
 * R3 wave B — the database side of the visitor-lead rules.
 *
 * Everything in `vocab.ts`, `lead-phone.ts`, `lead-date.ts`, `lead-class.ts` and `lead-columns.ts` is a
 * decision that can be made about one row on its own, and those modules stay pure so a client component
 * can share the vocabulary. This module holds the decisions that need the database:
 *
 *  - who ALREADY holds this number, and therefore which `familyKey` a new row inherits (recomputing it
 *    from the new row's own numbers can return a different smallest number and split one family in two);
 *  - what a search is allowed to match — a phone-shaped `q` is refused here exactly as `leadListQuery`
 *    refuses to put one in a URL, so the two halves of that rule cannot drift apart;
 *  - which leads a bulk SMS may reach, and how many were left out because they are do-not-contact;
 *  - whether an import batch has been seen before, so re-uploading one file cannot write it twice.
 *
 * Screens and server actions call these functions; they do not query `Lead` themselves.
 *
 * Two privacy rules this file never breaks: no normalized number is ever put in an audit target, an
 * error message, or a `console` line, and the duplicate-phone report hands out MASKED numbers only —
 * an aggregate result is the kind of thing that ends up pasted into a log.
 */
import {getTranslations} from 'next-intl/server';
import mongoose,{isValidObjectId,type FilterQuery} from 'mongoose';
import {Lead,nextLeadId} from '@/models/Lead';
import type {LeadPhoneRow,LeadFlagRow} from '@/models/Lead';
import {User} from '@/models/User';
import {audit,regexEscape} from '@/lib/admin/helpers';
import {dhakaDay} from '@/lib/admin/today';
import {parsePhoneCell,phoneSearchDigits,phoneSearchMask,telHref,whatsappHref} from './lead-phone';
import {normalizeClassLabel} from './lead-class';
import {normalizeGroup,normalizeMedium,normalizeShift,normalizeSource} from './lead-columns';
import {
  keyForSeparate,planLeadMerge,tieFamilyKeys,
  type LeadDupDoc,type LeadDupNote,type LeadMergePlan,
} from './lead-dup';
import {restoreRecord,softDelete} from '@/lib/admin/recycle';
import {Admission,Slot,TrialBooking} from '@/models/Intake';
import {
  HANDOFF_GRADES,HANDOFF_STATUS,handoffBlock,handoffReference,notInterestedReason,
  type HandoffRefusal,
} from './lead-handoff';
import {
  CONTACTABLE_LEAD_FILTER,LEAD_STATUSES,LEAD_SOURCES,LEAD_GROUPS,LEAD_SHIFTS,LEAD_MEDIUMS,
  familyKeyFromPhones,followUpState,leadListQuery,maskPhone,nextFollowUpDay,statusToFlags,
  type FollowUpKey,type LeadGroup,type LeadMedium,type LeadShift,type LeadSource,type LeadStatus,
} from './vocab';

/** What a screen renders. `id` is the Mongo id; `leadId` is the human one (`V-2026-0001`). */
export interface LeadRow{
  id:string;leadId:string;date:string;studentName:string;guardianName:string;
  phones:LeadPhoneRow[];classLabel:string;classGroup:number|null;school:string;
  group:LeadGroup;shift:LeadShift;medium:LeadMedium;source:LeadSource;interestedIn:string;
  status:LeadStatus;doNotContact:boolean;contactable:boolean;nextFollowUp:string|null;
  followUp:'none'|'today'|'overdue'|'later';familyKey:string|null;flags:LeadFlagRow[];
  noteCount:number;lastNote:LeadLastNote;converted:boolean;createdAt:Date;
}
/** The row carries its newest note so the list can show it without a second query per row. */
export type LeadLastNote={at:Date;text:string;outcome:string}|null;

interface LeadDoc{
  _id:unknown;leadId:string;date:string;studentName:string;guardianName:string;phones:LeadPhoneRow[];
  classLabel:string;classGroup:number|null;school:string;group:LeadGroup;shift:LeadShift;
  medium:LeadMedium;source:LeadSource;interestedIn:string;status:LeadStatus;doNotContact:boolean;
  nextFollowUp:string|null;familyKey:string|null;flags:LeadFlagRow[];
  notes:{at:Date;text:string;outcome:string;by:unknown}[];
  admission:unknown;trialBooking:unknown;student:unknown;createdAt:Date;
}

/** Every refusal this module can return. Nothing throws for an operator's input. */
export type Refusal={ok:false;code:string;messageKey:string;messageParams:Record<string,string|number>;messageText?:string};
function refuse(code:string,messageKey:string,messageParams:Record<string,string|number>={}):Refusal{return {ok:false,code,messageKey,messageParams,...renderLeadPair(messageKey,messageParams)}}
/* Stored flag rows keep both languages side by side so a lead written under one locale still explains
   itself under the other; the sentences themselves live in the catalogs. */
import {renderLeadPair} from './lead-message';
import bnMessages from '@/messages/bn.json';
import enMessages from '@/messages/en.json';
const resolveMessage=(catalog:unknown,key:string):string=>key.split('.').reduce((node:unknown,part:string)=>(node as Record<string,unknown>)?.[part],catalog) as string;
const fillMessage=(template:string,params:Record<string,string|number>):string=>template.replace(/\{(\w+)\}/g,(_,name)=>String(params[name]??'' ));
export const renderMessagePair=renderLeadPair;

export interface LeadWriteOk{
  ok:true;id:string;leadId:string;familyKey:string|null;
  /** The lead that already held one of these numbers, when the key was inherited rather than computed. */
  inheritedFrom:string|null;
  /** How many leads were re-pointed because two families turned out to be one. */
  mergedLeads:number;
  /** The family keys that were abandoned to make that merge, so an import can report it. */
  mergedFrom:string[];
  flags:LeadFlagRow[];
  /** Set when a duplicate was answered with "merge": the write landed on an EXISTING lead, no row was created. */
  mergedInto?:boolean;
  /** The readable id of the lead that was folded into this one and binned, when two rows became one. */
  sourceLeadId?:string;
  /** Notes and phones that moved in, counted so a screen can say what the merge carried. */
  movedNotes?:number;movedPhones?:number;
}
/**
 * A holder of a number, as a screen may see it (R3.10): the name, both ids, the status, the day and the
 * MASK. Never the digits and never the family key — the key IS a number with a prefix on it.
 */
export interface LeadDupHolder{id:string;leadId:string;studentName:string;status:LeadStatus;date:string;masked:string}

/**
 * Quick-add's question instead of a write: this number is already on the list, here is who holds it, and
 * nothing was saved until the operator answers with `sibling`, `merge` or `separate`.
 */
export interface LeadDupAsk{ok:false;code:'DUPLICATE_PHONE';holders:LeadDupHolder[];messageKey:string;messageParams:Record<string,string|number>}
export type LeadWriteResult=LeadWriteOk|Refusal|LeadDupAsk;

function lastNoteOf(doc:LeadDoc):LeadLastNote{
  const notes=(doc.notes||[]).slice().sort((a,b)=>(b.at?.getTime()||0)-(a.at?.getTime()||0));
  return notes.length?{at:notes[0].at,text:notes[0].text,outcome:notes[0].outcome||''}:null;
}

export function toRow(doc:LeadDoc,now:Date=new Date()):LeadRow{
  return {
    id:String(doc._id),leadId:doc.leadId,date:doc.date,studentName:doc.studentName,
    guardianName:doc.guardianName||'',phones:doc.phones||[],classLabel:doc.classLabel||'',
    classGroup:doc.classGroup??null,school:doc.school||'',group:doc.group,shift:doc.shift,
    medium:doc.medium,source:doc.source,interestedIn:doc.interestedIn||'',status:doc.status,
    doNotContact:!!doc.doNotContact,contactable:canContactRow(doc),nextFollowUp:doc.nextFollowUp||null,
    followUp:followUpState(doc.nextFollowUp,now),familyKey:doc.familyKey||null,flags:doc.flags||[],
    noteCount:(doc.notes||[]).length,lastNote:lastNoteOf(doc),converted:!!(doc.admission||doc.trialBooking||doc.student),
    createdAt:doc.createdAt,
  };
}
function canContactRow(doc:{status?:string|null;doNotContact?:boolean|null}):boolean{
  return !(doc.doNotContact===true||doc.status==='do_not_contact');
}

/**
 * A Mongo duplicate-key error quotes the value it collided on, and for a lead that value can be a phone
 * number. So the raw error is never logged and never shown: only the code and the field names are.
 */
function writeRefusal(error:unknown):Refusal{
  const code=(error as {code?:number})?.code;
  const keys=Object.keys((error as {keyPattern?:Record<string,unknown>})?.keyPattern||{});
  if(code===11000){
    const field=keys.join(',')||'value';
    return refuse('DUPLICATE','errors.DUPLICATE',{field:field});
  }
  console.error('lead write failed',{code:code??null,fields:keys});
  return refuse('WRITE_FAILED','errors.WRITE_FAILED');
}

/**
 * The family key is INHERITED, never recomputed. One indexed lookup on `phones.normalized` finds every
 * lead already holding one of these numbers; the smallest existing key wins and the new row joins it.
 * When the numbers turn out to bridge two different families, the smaller key is adopted and the other
 * leads are re-pointed, so a family cannot be split by the order two rows happened to be typed in.
 */
export interface FamilyResolution{familyKey:string|null;inheritedFrom:string|null;mergedFrom:string[];mergedLeads:number}
export async function resolveFamilyKey(phones:(string|null|undefined)[]):Promise<FamilyResolution>{
  const usable=[...new Set(phones.map(phone=>String(phone||'').trim()).filter(phone=>/^01[3-9]\d{8}$/.test(phone)))];
  if(!usable.length)return {familyKey:null,inheritedFrom:null,mergedFrom:[],mergedLeads:0};
  const holders=await Lead.find({'phones.normalized':{$in:usable}}).select('leadId familyKey')
    .lean<{leadId:string;familyKey:string|null}[]>();
  const keys=[...new Set(holders.map(holder=>holder.familyKey).filter((key):key is string=>!!key))].sort();
  const familyKey=keys[0]||familyKeyFromPhones(usable);
  const mergedFrom=keys.slice(1);
  let mergedLeads=0;
  for(const old of mergedFrom){
    const updated=await Lead.updateMany({familyKey:old},{$set:{familyKey}});
    mergedLeads+=updated.modifiedCount||0;
  }
  const inheritedFrom=holders.find(holder=>holder.familyKey===familyKey)?.leadId||null;
  return {familyKey,inheritedFrom,mergedFrom,mergedLeads};
}

/** Which leads already hold a number — the warning behind "this number is already here". */
export async function leadsWithPhone(phone:string):Promise<{id:string;leadId:string;studentName:string;masked:string}[]>{
  const normalized=String(phone||'').trim();
  if(!/^01[3-9]\d{8}$/.test(normalized))return [];
  const rows=await Lead.find({'phones.normalized':normalized}).select('leadId studentName').lean<{_id:unknown;leadId:string;studentName:string}[]>();
  return rows.map(row=>({id:String(row._id),leadId:row.leadId,studentName:row.studentName,masked:maskPhone(normalized)}));
}

/**
 * Who already holds these numbers (R3.10) — the warning behind quick-add and the "shares a number with"
 * block in the drawer. Live rows only, newest writing last, and the number comes back as a MASK: this
 * answer is rendered straight into a screen. `excludeFamilyKey` filters out the leads the drawer already
 * lists as family, so the block shows only the mates the family list does not.
 */
export async function duplicateHolders(phones:(string|null|undefined)[],options:{excludeId?:string;excludeFamilyKey?:string|null}={}):Promise<LeadDupHolder[]>{
  const norms=[...new Set(phones.map(phone=>String(phone||'').trim()).filter(phone=>/^01[3-9]\d{8}$/.test(phone)))];
  if(!norms.length)return [];
  const query:FilterQuery<unknown>={'phones.normalized':{$in:norms},deletedAt:null};
  if(options.excludeId)query._id={$ne:options.excludeId};
  const rows=await Lead.find(query).select('leadId studentName status date phones familyKey').sort({date:1,leadId:1}).limit(25)
    .lean<{_id:unknown;leadId:string;studentName:string;status:LeadStatus;date:string;familyKey:string|null;phones:{normalized:string}[]}[]>();
  return rows
    .filter(row=>options.excludeFamilyKey===undefined||row.familyKey!==options.excludeFamilyKey)
    .map(row=>{
      const matched=norms.find(norm=>(row.phones||[]).some(phone=>phone.normalized===norm))||norms[0];
      return {id:String(row._id),leadId:row.leadId,studentName:row.studentName,status:row.status,date:row.date,masked:maskPhone(matched)};
    });
}

interface LeadFullDoc{
  _id:unknown;leadId:string;studentName:string;guardianName:string;school:string;classLabel:string;
  classGroup:number|null;newSession:boolean;exam:'ssc'|'hsc'|null;examYear:number|null;interestedIn:string;
  phones:{normalized:string;original:string}[];notes:{at:Date;text:string;outcome:string;by:unknown}[];
  flags:LeadFlagRow[];familyKey:string|null;admission:unknown;trialBooking:unknown;student:unknown;deletedAt:Date|null;
}
function toDupDoc(doc:LeadFullDoc):LeadDupDoc{
  return {
    id:String(doc._id),leadId:doc.leadId,studentName:doc.studentName,guardianName:doc.guardianName||'',
    school:doc.school||'',classLabel:doc.classLabel||'',classGroup:doc.classGroup??null,newSession:!!doc.newSession,
    exam:doc.exam??null,examYear:doc.examYear??null,interestedIn:doc.interestedIn||'',
    phones:(doc.phones||[]).map(phone=>({normalized:String(phone.normalized||''),original:String(phone.original||'')})),
    notes:(doc.notes||[]).map(note=>({at:note.at instanceof Date?note.at:new Date(note.at),text:String(note.text||''),outcome:String(note.outcome||''),by:String(note.by||'')})),
    flags:(doc.flags||[]).map(flag=>({field:String(flag.field||''),code:String(flag.code||''),original:String(flag.original||''),messageBn:String(flag.messageBn||''),messageEn:String(flag.messageEn||''),suggested:String(flag.suggested||'')})),
    familyKey:doc.familyKey?String(doc.familyKey):null,
    converted:!!(doc.admission||doc.trialBooking||doc.student),binned:!!doc.deletedAt,
  };
}
async function findFull(id:string):Promise<LeadDupDoc|null>{
  if(!id||!isValidObjectId(id))return null;
  const doc=await Lead.findById(id).lean<LeadFullDoc|null>();
  return doc?toDupDoc(doc):null;
}

/** The write half of a merge, shared by both entry points. Fills, moves, re-points, audits — in that order. */
async function applyPlan(target:LeadDupDoc,plan:LeadMergePlan,mergeNote:LeadDupNote,actorId:string):Promise<number>{
  const push:FilterQuery<unknown>={notes:{$each:[...plan.notesToMove,mergeNote]}};
  if(plan.phonesToAdd.length)push.phones={$each:plan.phonesToAdd};
  if(plan.flagsToAdd.length)push.flags={$each:plan.flagsToAdd};
  await Lead.updateOne({_id:target.id},{$set:{...plan.fieldPatch,familyKey:plan.familyKey},$push:push},{runValidators:true});
  if(!plan.repointFrom)return 0;
  const repointed=await Lead.updateMany({familyKey:plan.repointFrom},{$set:{familyKey:plan.repointTo}});
  return repointed.modifiedCount||0;
}

/** Quick-add's "merge into that lead": the source is the FORM, not a row, so nothing is binned. */
async function mergeQuickAddInto(targetId:string,source:LeadDupDoc,actorId:string,now:Date):Promise<LeadWriteResult>{
  const target=await findFull(targetId);
  if(!target)return refuse('MISSING','errors.MISSING');
  const plan=planLeadMerge(target,source);
  if(plan.ok===false)return plan;
  try{
    await applyPlan(target,plan,{at:now,text:`quick-add merge: ${source.studentName}`.slice(0,1000),outcome:'',by:actorId},actorId);
  }catch(error){return writeRefusal(error)}
  await audit(actorId,'lead.merge',target.leadId);
  return {ok:true,id:target.id,leadId:target.leadId,familyKey:plan.familyKey,inheritedFrom:null,mergedLeads:0,mergedFrom:[],
    flags:target.flags as LeadFlagRow[],mergedInto:true,movedNotes:plan.movedNotes+1,movedPhones:plan.movedPhones};
}

/**
 * Two existing leads become one (R3.10): the SOURCE is folded into the TARGET and binned, carrying its
 * phones, its notes with their writers and its flags; empty fields on the target fill from the source
 * and nothing else is overwritten. The source goes through the Recycle Bin's own door (`softDelete`),
 * so a lead an admission or a student now depends on is refused HERE with the conversion named, before
 * the bin would refuse it with a reference count. If the write behind the binning fails, the source is
 * restored, so a merge cannot half-happen.
 */
export async function mergeLeads(targetId:string,sourceId:string,actorId:string,now:Date=new Date()):Promise<LeadWriteResult>{
  const [target,source]=await Promise.all([findFull(targetId),findFull(sourceId)]);
  if(!target||!source)return refuse('MISSING','errors.MISSING');
  const plan=planLeadMerge(target,source);
  if(plan.ok===false)return plan;
  const binned=await softDelete('lead',source.id,actorId,now);
  if(binned.status==='blocked')return {...refuse('MERGE_BLOCKED','recycleBin.blocked',{}),messageText:binned.message};
  if(binned.status==='missing')return refuse('MISSING','errors.MISSING');
  let repointed=0;
  try{
    repointed=await applyPlan(target,plan,{at:now,text:`merge ${source.leadId} ${source.studentName}`.slice(0,1000),outcome:'',by:actorId},actorId);
  }catch(error){
    await restoreRecord('lead',source.id,actorId);
    return writeRefusal(error);
  }
  return {ok:true,id:target.id,leadId:target.leadId,familyKey:plan.familyKey,inheritedFrom:null,mergedLeads:repointed,
    mergedFrom:plan.repointFrom?[plan.repointFrom]:[],flags:target.flags as LeadFlagRow[],mergedInto:true,
    sourceLeadId:source.leadId,movedNotes:plan.movedNotes+1,movedPhones:plan.movedPhones};
}

/**
 * "Add as sibling" for two leads that STAY two leads: both wear one family key from now on. The smaller
 * of their two keys wins and the other is re-pointed everywhere it is worn — the same rule
 * `resolveFamilyKey()` applies when two families turn out to be one, so tying and inheriting agree.
 */
export async function tieLeadFamily(id:string,otherId:string,actorId:string):Promise<{ok:true;familyKey:string|null;repointed:number}|Refusal>{
  const [self,other]=await Promise.all([findFull(id),findFull(otherId)]);
  if(!self||!other||self.binned||other.binned)return refuse('MISSING','errors.MISSING');
  if(self.id===other.id)return refuse('SAME_LEAD','errors.SAME_LEAD');
  const tie=tieFamilyKeys(self,other);
  await Lead.updateMany({_id:{$in:[self.id,other.id]}},{$set:{familyKey:tie.familyKey}});
  let repointed=0;
  if(tie.repointFrom){
    const rep=await Lead.updateMany({familyKey:tie.repointFrom},{$set:{familyKey:tie.repointTo}});
    repointed=rep.modifiedCount||0;
  }
  await audit(actorId,'lead.family',self.leadId);
  return {ok:true,familyKey:tie.familyKey,repointed};
}

export interface QuickLeadInput{
  studentName:string;guardianName?:string;phone?:string;classLabel?:string;school?:string;
  interestedIn?:string;source?:string;group?:string;shift?:string;medium?:string;status?:string;
  followUp?:FollowUpKey|'clear';customDay?:string;note?:string;
  /** R3.10: the operator's answer to "this number is already here". Absent means ASK, never guess. */
  dupChoice?:'sibling'|'merge'|'separate';dupTarget?:string;
}

/**
 * Quick-add: four fields is a complete lead. Anything the operator did not fill in stays UNKNOWN —
 * group and medium keep their `unknown` value, class stays null and no follow-up is invented — because
 * a guessed class puts the lead in the wrong funnel and a guessed follow-up makes somebody call a
 * parent who was never asked.
 */
export async function createQuickLead(input:QuickLeadInput,actorId:string,now:Date=new Date()):Promise<LeadWriteResult>{
  const studentName=String(input.studentName||'').trim();
  if(!studentName)return refuse('NO_NAME','errors.NO_NAME');
  const phoneText=String(input.phone||'').trim();
  const read=parsePhoneCell(phoneText);
  if(phoneText&&!read.phones.length){
    const flag=read.flags[0];
    return refuse('BAD_PHONE',flag?flag.messageKey:'errors.BAD_PHONE',flag?.messageParams||{});
  }
  const followUpKey=input.followUp;
  let nextFollowUp:string|null=null;
  if(followUpKey&&followUpKey!=='clear'){
    nextFollowUp=nextFollowUpDay(followUpKey,now,input.customDay);
    if(!nextFollowUp)return refuse('BAD_FOLLOW_UP','errors.BAD_FOLLOW_UP');
  }
  const classRead=normalizeClassLabel(input.classLabel||'',now);
  const phones:LeadPhoneRow[]=read.phones.map(row=>({normalized:row.normalized,original:row.original.slice(0,80)}));
  const flags:LeadFlagRow[]=[
    ...classRead.flags.map(flag=>({field:'classLabel',code:flag.code,original:String(input.classLabel||'').slice(0,200),...renderMessagePair(flag.messageKey,flag.messageParams),suggested:String(flag.suggested??'')})),
    ...read.flags.map(flag=>({field:'phones',code:flag.code,original:flag.original.slice(0,200),...renderMessagePair(flag.messageKey,flag.messageParams),suggested:''})),
  ];
  const status=(LEAD_STATUSES as readonly string[]).includes(String(input.status||''))?String(input.status) as LeadStatus:'new';
  const source=(LEAD_SOURCES as readonly string[]).includes(String(input.source||''))?String(input.source) as LeadSource:'walk_in';
  const group=(LEAD_GROUPS as readonly string[]).includes(String(input.group||''))?String(input.group) as LeadGroup:'unknown';
  const shift=(LEAD_SHIFTS as readonly string[]).includes(String(input.shift||''))?String(input.shift) as LeadShift:'any';
  const medium=(LEAD_MEDIUMS as readonly string[]).includes(String(input.medium||''))?String(input.medium) as LeadMedium:'unknown';
  const noteText=String(input.note||'').trim();
  const norms=phones.map(row=>row.normalized);
  const holders=norms.length?await duplicateHolders(norms):[];
  // The spec's duplicate rule: WARN and SHOW before anything is written. No choice, no second lead.
  if(holders.length&&!input.dupChoice){
    return {ok:false,code:'DUPLICATE_PHONE',holders,
      messageKey:'errors.DUPLICATE_PHONE',messageParams:{}};
  }
  if(holders.length&&input.dupChoice==='merge'){
    const asked=String(input.dupTarget||'').trim();
    const target=holders.find(holder=>holder.id===asked||holder.leadId===asked)||(holders.length===1?holders[0]:undefined);
    if(!target)return refuse('BAD_DUP_TARGET','errors.BAD_DUP_TARGET');
    return mergeQuickAddInto(target.id,{
      id:'',leadId:'',studentName,guardianName:String(input.guardianName||'').trim().slice(0,120),
      school:String(input.school||'').trim().slice(0,160),classLabel:classRead.classLabel,classGroup:classRead.classGroup,
      newSession:classRead.newSession,exam:classRead.exam??null,examYear:classRead.examYear??null,
      interestedIn:String(input.interestedIn||'').trim().slice(0,200),phones,flags,
      notes:noteText?[{at:now,text:noteText,outcome:'',by:actorId}]:[],familyKey:null,converted:false,binned:false,
    },actorId,now);
  }
  // "Separate" is the operator saying two unrelated people share one number: the one moment a new row's
  // key is computed from its own numbers although the number is held elsewhere. "Sibling" (and a silent
  // save with no duplicate at all) inherits through `resolveFamilyKey`, as it always has.
  const family=holders.length&&input.dupChoice==='separate'
    ?{familyKey:keyForSeparate(norms),inheritedFrom:null,mergedFrom:[],mergedLeads:0}
    :await resolveFamilyKey(norms);
  const doc={
    date:dhakaDay(now),studentName,guardianName:String(input.guardianName||'').trim().slice(0,120),
    phones,classLabel:classRead.classLabel,classGroup:classRead.classGroup,newSession:classRead.newSession,
    exam:classRead.exam,examYear:classRead.examYear,school:String(input.school||'').trim().slice(0,160),
    group,shift,medium,source,interestedIn:String(input.interestedIn||'').trim().slice(0,200),
    status,...statusToFlags(status,{}),nextFollowUp,familyKey:family.familyKey,flags,
    notes:noteText?[{at:now,by:actorId,text:noteText.slice(0,1000),outcome:''}]:[],
    importSource:'quick-add',createdBy:actorId,
  };
  return finishCreate(doc,family,flags,actorId,now);
}

export interface SheetLeadInput{
  date:string;studentName:string;guardianName?:string;phones?:LeadPhoneRow[];classLabel?:string;
  classGroup?:number|null;newSession?:boolean;exam?:'ssc'|'hsc'|null;examYear?:number|null;school?:string;
  group?:LeadGroup|null;shift?:LeadShift|null;medium?:LeadMedium|null;source?:LeadSource|null;
  interestedIn?:string;status?:LeadStatus|null;nextFollowUp?:string|null;notes?:string;flags?:LeadFlagRow[];
  importSource?:string;importBatch?:string;
  /** What the sheet actually said in the four vocabulary columns, so an unmapped cell can quote it. */
  raw?:{group?:unknown;medium?:unknown;shift?:unknown;source?:unknown};
}

/**
 * The importer's write, kept separate from quick-add because its rules differ: the values arrive
 * ALREADY READ by the pure modules, an unmapped cell becomes `unknown`/`other` plus a flag quoting what
 * the sheet said (never a silent default), the Bangla comment becomes the first note, and the batch id
 * makes a second upload of the same file detectable instead of quietly doubling the list.
 */
export async function createSheetLead(input:SheetLeadInput,actorId:string,now:Date=new Date()):Promise<LeadWriteResult>{
  const studentName=String(input.studentName||'').trim();
  if(!studentName)return refuse('NO_NAME','errors.NO_NAME_ROW');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date||'')))return refuse('BAD_DATE','errors.BAD_DATE');
  const phones=(input.phones||[]).filter(row=>/^01[3-9]\d{8}$/.test(row.normalized));
  const flags=[...(input.flags||[])];
  // `group`/`medium`/`shift` have an honest "we do not know" value. `source` does not, so an unmapped
  // source becomes `other` AND a flag quoting the sheet — the reader can see it was never recognised,
  // which is the difference between "the sheet did not say" and "the sheet said something we could not
  // read". Both are stored; only the second is a doubt worth showing.
  const unmapped=(field:string,value:unknown,read:unknown,messageKey:string)=>{
    const text=String(value==null?'':value).trim();
    if(text&&!read)flags.push({field,code:'unmapped',original:text.slice(0,200),...renderMessagePair(messageKey),suggested:''});
  };
  const raw=input.raw||{};
  unmapped('group',raw.group,input.group,'errors.UNMAPPED_GROUP');
  unmapped('medium',raw.medium,input.medium,'errors.UNMAPPED_MEDIUM');
  unmapped('shift',raw.shift,input.shift,'errors.UNMAPPED_SHIFT');
  unmapped('source',raw.source,input.source,'errors.UNMAPPED_SOURCE');
  const group=input.group||'unknown';const medium=input.medium||'unknown';const shift=input.shift||'any';
  const source=input.source||'other';
  const classRead=input.classLabel?normalizeClassLabel(input.classLabel,now):null;
  if(classRead)for(const flag of classRead.flags)flags.push({field:'classLabel',code:flag.code,original:classRead.classLabel.slice(0,200),...renderMessagePair(flag.messageKey,flag.messageParams),suggested:String(flag.suggested??'')});
  const family=await resolveFamilyKey(phones.map(row=>row.normalized));
  const status=(LEAD_STATUSES as readonly string[]).includes(String(input.status||''))?String(input.status) as LeadStatus:'new';
  const noteText=String(input.notes||'').trim();
  const doc={
    date:String(input.date),studentName,guardianName:String(input.guardianName||'').trim().slice(0,120),
    phones,classLabel:classRead?classRead.classLabel:'',
    classGroup:input.classGroup===undefined?(classRead?classRead.classGroup:null):input.classGroup,
    newSession:input.newSession??(classRead?classRead.newSession:false),
    exam:input.exam===undefined?(classRead?classRead.exam:null):input.exam,
    examYear:input.examYear===undefined?(classRead?classRead.examYear:null):input.examYear,
    school:String(input.school||'').trim().slice(0,160),group,shift,medium,source,
    interestedIn:String(input.interestedIn||'').trim().slice(0,200),status,...statusToFlags(status,{}),
    nextFollowUp:/^\d{4}-\d{2}-\d{2}$/.test(String(input.nextFollowUp||''))?String(input.nextFollowUp):null,
    familyKey:family.familyKey,flags,
    notes:noteText?[{at:now,by:actorId,text:noteText.slice(0,1000),outcome:''}]:[],
    importSource:String(input.importSource||'').slice(0,200)||null,importBatch:String(input.importBatch||'').slice(0,64)||null,
    createdBy:actorId,
  };
  return finishCreate(doc,family,flags,actorId,now);
}

async function finishCreate(doc:Record<string,unknown>,family:FamilyResolution,flags:LeadFlagRow[],actorId:string,now:Date):Promise<LeadWriteResult>{
  // A lead id is handed out by reading the highest existing one, so two operators saving at the same
  // moment can be given the same id. The unique index is the real guard; this retries once behind it.
  for(let attempt=0;attempt<2;attempt++){
    const leadId=attempt===0?String(doc.leadId||await nextLeadId(now)):await nextLeadId(now);
    try{
      const created=await Lead.create({...doc,leadId});
      await audit(actorId,'lead.create',leadId);
      return {ok:true,id:String(created._id),leadId,familyKey:family.familyKey,inheritedFrom:family.inheritedFrom,mergedLeads:family.mergedLeads,mergedFrom:family.mergedFrom,flags};
    }catch(error){
      const keys=Object.keys((error as {keyPattern?:Record<string,unknown>})?.keyPattern||{});
      if((error as {code?:number})?.code===11000&&keys.includes('leadId')&&attempt===0)continue;
      return writeRefusal(error);
    }
  }
  return refuse('ID_BUSY','errors.ID_BUSY');
}

export interface LeadSearchHit{
  id:string;leadId:string;studentName:string;guardianName:string;classLabel:string;classGroup:number|null;
  school:string;status:LeadStatus;doNotContact:boolean;contactable:boolean;nextFollowUp:string|null;
  followUp:'none'|'today'|'overdue'|'later';date:string;
  phones:{normalized:string;original:string;tel:string;whatsapp:string;masked:string}[];
}
// The shape a server action returns to the search form is `LeadSearchActionState` in `lead-ui.ts`: the
// component that renders the results imports it, and it must not do that from a 'use server' file. It
// also carries views rather than these hits, so a normalized number never leaves the server.

export interface LeadPhoneSearchResult{
  /** `found` = rows came back, `empty` = the search ran and matched nothing, `refused` = it never ran. */
  status:'found'|'empty'|'refused';
  hits:LeadSearchHit[];
  total:number;
  /** What the UI may echo back: a mask, never the digits that were typed. */
  masked:string;
  code:string;messageKey:string;messageParams:Record<string,string|number>;
}

/**
 * Search the Visitors list BY NUMBER — the staff requirement, and the only path a number takes into a
 * query. It is reached through a server action (a form submission), never through a URL: `listLeads`
 * still refuses a phone-shaped `q`, so the two halves cannot drift.
 *
 * Matching is a substring match on the NORMALIZED number, which is why every way of typing it works:
 * with or without the leading zero, with or without `+88`, in Bangla digits, with dashes and spaces, and
 * partial — the last four off a crumpled sheet. A substring match cannot use the index the way an exact
 * match can; that is accepted on purpose, because a coaching centre's visitor list is thousands of rows,
 * not millions, and "find this parent" is worth more than the last millisecond.
 *
 * The audit row records that a search happened, with the MASK as its target: looking a parent up by
 * number is worth accounting for, and the digits are not.
 */
export async function searchLeadsByPhone(raw:unknown,now:Date=new Date(),limit=25,actorId?:string):Promise<LeadPhoneSearchResult>{
  const read=phoneSearchDigits(raw);
  if(read.ok===false)return {status:'refused',hits:[],total:0,masked:'—',code:read.code,messageKey:read.messageKey,messageParams:read.messageParams};
  const filter={'phones.normalized':{$regex:new RegExp(regexEscape(read.digits))}};
  const [docs,total]=await Promise.all([
    Lead.find(filter).sort({date:-1,createdAt:-1}).limit(limit).lean<LeadDoc[]>(),
    Lead.countDocuments(filter),
  ]);
  if(actorId)await audit(actorId,'lead.phone-search',phoneSearchMask(read.digits));
  const hits:LeadSearchHit[]=docs.map(doc=>({
    id:String(doc._id),leadId:doc.leadId,studentName:doc.studentName,guardianName:doc.guardianName||'',
    classLabel:doc.classLabel||'',classGroup:doc.classGroup??null,school:doc.school||'',status:doc.status,
    doNotContact:!!doc.doNotContact,contactable:canContactRow(doc),nextFollowUp:doc.nextFollowUp||null,
    followUp:followUpState(doc.nextFollowUp,now),date:doc.date,
    phones:(doc.phones||[]).map(phone=>({normalized:phone.normalized,original:phone.original,tel:telHref(phone.normalized),whatsapp:whatsappHref(phone.normalized),masked:maskPhone(phone.normalized)})),
  }));
  return {status:hits.length?'found':'empty',hits,total,masked:phoneSearchMask(read.digits),code:'',
    messageKey:hits.length?'':'errors.SEARCH_EMPTY',messageParams:{}};
}

export interface LeadListParams{
  q?:string;status?:string;classGroup?:string;group?:string;shift?:string;medium?:string;source?:string;
  followUp?:'today'|'overdue'|'none';familyKey?:string;from?:string;to?:string;page?:number;perPage?:number;
}
export interface LeadListResult{rows:LeadRow[];total:number;page:number;pages:number;perPage:number;refusedPhone:boolean}
/**
 * The filter behind the list, on its own so that "everybody on this screen" means the same set of leads
 * to the list, to the counts and to a bulk SMS: the Visitors screen hands this to `contactableLeads()`
 * and the send therefore covers exactly the leads the operator is looking at, filters included. Every
 * value is checked against the vocabulary here as well as on the page, because an invented status must
 * be ignored rather than trusted by whichever caller forgot to check it.
 */
export function leadListFilter(params:LeadListParams,now:Date=new Date()):FilterQuery<unknown>{
  const filter:FilterQuery<unknown>={};
  const refusedPhone=leadListQuery({q:params.q}).refusedPhone;
  const text=String(params.q||'').trim();
  if(text&&!refusedPhone){
    const rx=new RegExp(regexEscape(text),'i');
    filter.$or=[{studentName:rx},{guardianName:rx},{school:rx},{interestedIn:rx},{leadId:rx}];
  }
  if((LEAD_STATUSES as readonly string[]).includes(String(params.status||'')))filter.status=params.status;
  if((LEAD_GROUPS as readonly string[]).includes(String(params.group||'')))filter.group=params.group;
  if((LEAD_SHIFTS as readonly string[]).includes(String(params.shift||'')))filter.shift=params.shift;
  if((LEAD_MEDIUMS as readonly string[]).includes(String(params.medium||'')))filter.medium=params.medium;
  if((LEAD_SOURCES as readonly string[]).includes(String(params.source||'')))filter.source=params.source;
  const classGroup=Number(params.classGroup);
  if(Number.isInteger(classGroup)&&classGroup>=1&&classGroup<=12)filter.classGroup=classGroup;
  if(params.familyKey)filter.familyKey=String(params.familyKey);
  const today=dhakaDay(now);
  if(params.followUp==='today')filter.nextFollowUp=today;
  else if(params.followUp==='overdue')filter.nextFollowUp={$ne:null,$lt:today};
  else if(params.followUp==='none')filter.nextFollowUp=null;
  if(params.from&&/^\d{4}-\d{2}-\d{2}$/.test(params.from))filter.date={...(filter.date as object||{}),$gte:params.from};
  if(params.to&&/^\d{4}-\d{2}-\d{2}$/.test(params.to))filter.date={...(filter.date as object||{}),$lte:params.to};
  return filter;
}

/**
 * The list. `q` goes through `leadListQuery` first — the same function that refuses to put a number in a
 * URL — so a phone-shaped search is dropped here too and reported, instead of matching leads by number.
 * Names, schools and lead ids stay searchable, because a URL with a Bangla name in it leaks nothing.
 */
export async function listLeads(params:LeadListParams,now:Date=new Date()):Promise<LeadListResult>{
  const filter=leadListFilter(params,now);
  const refusedPhone=leadListQuery({q:params.q}).refusedPhone;
  const perPage=Math.min(Math.max(Number(params.perPage)||25,5),100);
  const total=await Lead.countDocuments(filter);
  const pages=Math.max(1,Math.ceil(total/perPage));
  const page=Math.min(Math.max(Number(params.page)||1,1),pages);
  const sort:Record<string,1|-1>=params.followUp?{nextFollowUp:1,date:-1}:{date:-1,createdAt:-1};
  const docs=await Lead.find(filter).sort(sort).skip((page-1)*perPage).limit(perPage).lean<LeadDoc[]>();
  return {rows:docs.map(doc=>toRow(doc,now)),total,page,pages,perPage,refusedPhone};
}

export interface FollowUpBoard{today:number;overdue:number;rows:LeadRow[]}
/**
 * "Today's follow-ups" for the Overview, with the overdue count beside it. Overdue is its own number and
 * not folded into today's: a lead nobody called three days ago is a different problem from one due now.
 */
export async function followUpBoard(now:Date=new Date(),limit=6):Promise<FollowUpBoard>{
  const today=dhakaDay(now);
  const [todays,overdue]=await Promise.all([
    Lead.countDocuments({nextFollowUp:today}),
    Lead.countDocuments({nextFollowUp:{$ne:null,$lt:today}}),
  ]);
  const docs=await Lead.find({nextFollowUp:{$ne:null,$lte:today}}).sort({nextFollowUp:1,date:-1}).limit(limit).lean<LeadDoc[]>();
  return {today:todays,overdue,rows:docs.map(doc=>toRow(doc,now))};
}

/** The drawer: one lead, its notes newest-first with the writer's name, and the rest of its family. */
export interface LeadNoteView{at:Date;text:string;outcome:string;byName:string}
export interface LeadDetail{
  row:LeadRow;notes:LeadNoteView[];family:LeadRow[];dupMates:LeadDupHolder[];
  /**
   * R3.13 · Which intake rows this lead already points at. Deliberately beside the row and not inside
   * it: a Mongo id is neither a mask nor a label, and no list screen has any use for one.
   */
  handoffSource:{admission:string|null;trialBooking:string|null};
}
export async function leadDetail(id:string,now:Date=new Date()):Promise<LeadDetail|null>{
  const doc=await Lead.findById(id).lean<LeadDoc>();
  if(!doc)return null;
  const writerIds=[...new Set((doc.notes||[]).map(note=>String(note.by)).filter(Boolean))];
  const writers=writerIds.length?await User.find({_id:{$in:writerIds}}).select('name email').lean<{_id:unknown;name?:string;email?:string}[]>():[];
  const nameOf=(value:unknown)=>{const found=writers.find(writer=>String(writer._id)===String(value));return found?.name||found?.email||''};
  const notes=(doc.notes||[]).map(note=>({at:note.at,text:note.text,outcome:note.outcome||'',byName:nameOf(note.by)}))
    .sort((a,b)=>b.at.getTime()-a.at.getTime());
  const family=doc.familyKey
    ?(await Lead.find({familyKey:doc.familyKey,_id:{$ne:doc._id}}).sort({date:-1}).limit(20).lean<LeadDoc[]>()).map(row=>toRow(row,now))
    :[];
  // Number-mates outside the family (R3.10): the drawer's "shares a number with" block. Same-family
  // leads are already listed above it, so they are excluded here and never shown twice.
  const dupMates=await duplicateHolders((doc.phones||[]).map(phone=>phone.normalized),{excludeId:String(doc._id),excludeFamilyKey:doc.familyKey});
  // R3.13 · The two pointers that decide whether a hand-off is still open. They ride beside the row
  // rather than inside it, so no list screen has to carry an id it does not print.
  return {row:toRow(doc,now),notes,family,dupMates,
    handoffSource:{admission:doc.admission?String(doc.admission):null,trialBooking:doc.trialBooking?String(doc.trialBooking):null}};
}

/**
 * The drawer and a deep link address a lead by whichever id the operator is holding: the Mongo id a row
 * carries, or the readable one (`V-2026-0007`) a printed sheet or an audit row quotes. Both resolve
 * here, so `leadPath()` and a row link cannot disagree — and neither one is a number.
 */
export async function leadDetailByKey(key:string,now:Date=new Date()):Promise<LeadDetail|null>{
  const value=String(key||'').trim();
  if(!value)return null;
  if(/^[0-9a-fA-F]{24}$/.test(value))return leadDetail(value,now);
  const doc=await Lead.findOne({leadId:value}).select('_id').lean<{_id:unknown}>();
  return doc?leadDetail(String(doc._id),now):null;
}

/**
 * The status chips on the list: one aggregate over the live rows, in vocabulary order, so a chip can
 * never claim a count the rows underneath it disagree with. Statuses nobody has used yet still show,
 * with zero — an empty funnel stage is information, not a missing chip.
 */
export async function leadStatusCounts():Promise<{status:LeadStatus;count:number}[]>{
  const rows=await Lead.aggregate<{_id:LeadStatus;n:number}>([{$group:{_id:'$status',n:{$sum:1}}}]);
  const found=new Map(rows.map(row=>[String(row._id),Number(row.n)||0]));
  return LEAD_STATUSES.map(status=>({status,count:found.get(status)||0}));
}

export type LeadUpdateResult={ok:true;id:string;status:LeadStatus;doNotContact:boolean;nextFollowUp:string|null}|Refusal;

async function findLive(id:string):Promise<LeadDoc|null>{
  if(!id)return null;
  return Lead.findById(id).select('leadId status doNotContact nextFollowUp familyKey').lean<LeadDoc>()||null;
}

/**
 * A status change. `doNotContact` is STICKY: choosing "do not contact" sets it, and moving the status
 * back to anything else afterwards does not unset it — an operator un-marking a status must not silently
 * put a parent back on a calling list. Clearing it is its own deliberate action.
 */
export async function updateLeadStatus(id:string,status:string,actorId:string,now:Date=new Date(),note?:string):Promise<LeadUpdateResult>{
  if(!(LEAD_STATUSES as readonly string[]).includes(status))return refuse('BAD_STATUS','errors.BAD_STATUS');
  const current=await findLive(id);
  if(!current)return refuse('MISSING','errors.MISSING');
  const flags=statusToFlags(status as LeadStatus,{doNotContact:current.doNotContact});
  const text=String(note||'').trim();
  const update:FilterQuery<unknown>={$set:{status,doNotContact:flags.doNotContact}};
  if(text)update.$push={notes:{at:now,by:actorId,text:text.slice(0,1000),outcome:''}};
  await Lead.updateOne({_id:id},update,{runValidators:true});
  await audit(actorId,'lead.status',current.leadId);
  return {ok:true,id,status:status as LeadStatus,doNotContact:flags.doNotContact,nextFollowUp:current.nextFollowUp||null};
}

/** Deliberately un-marking "do not contact" — separate from a status change, so it cannot happen by accident. */
export async function setContactPermission(id:string,allowed:boolean,actorId:string):Promise<{ok:true;doNotContact:boolean}|Refusal>{
  const current=await findLive(id);
  if(!current)return refuse('MISSING','errors.MISSING');
  await Lead.updateOne({_id:id},{$set:{doNotContact:!allowed,...(allowed&&current.status==='do_not_contact'?{status:'called' as LeadStatus}:{})}});
  await audit(actorId,allowed?'lead.contact.allowed':'lead.contact.blocked',current.leadId);
  return {ok:true,doNotContact:!allowed};
}

/**
 * A follow-up, set from one of the five buttons or cleared. The day is computed by `nextFollowUpDay`, so
 * "next week" is seven days, a custom day must already be a real `YYYY-MM-DD`, and 31 February is refused
 * rather than rolled into March.
 */
export async function setLeadFollowUp(id:string,key:FollowUpKey|'clear',actorId:string,now:Date=new Date(),customDay?:string):Promise<{ok:true;nextFollowUp:string|null;state:'none'|'today'|'overdue'|'later'}|Refusal>{
  const current=await findLive(id);
  if(!current)return refuse('MISSING','errors.MISSING');
  let nextFollowUp:string|null=null;
  if(key!=='clear'){
    nextFollowUp=nextFollowUpDay(key,now,customDay);
    if(!nextFollowUp)return refuse('BAD_FOLLOW_UP','errors.BAD_FOLLOW_UP');
  }
  await Lead.updateOne({_id:id},{$set:{nextFollowUp}});
  await audit(actorId,'lead.follow-up',current.leadId);
  return {ok:true,nextFollowUp,state:followUpState(nextFollowUp,now)};
}

/** A note in the drawer's timeline. `outcome` is optional; the note is the record either way. */
export async function addLeadNote(id:string,text:string,outcome:string,actorId:string,now:Date=new Date()):Promise<{ok:true;noteCount:number}|Refusal>{
  const body=String(text||'').trim();
  if(!body)return refuse('NO_NOTE','errors.NO_NOTE');
  if(body.length>1000)return refuse('NOTE_TOO_LONG','errors.NOTE_TOO_LONG');
  const current=await Lead.findById(id).select('leadId notes').lean<{leadId:string;notes:unknown[]}>()||null;
  if(!current)return refuse('MISSING','errors.MISSING');
  await Lead.updateOne({_id:id},{$push:{notes:{at:now,by:actorId,text:body,outcome:outcome||''}}},{runValidators:true});
  await audit(actorId,'lead.note',current.leadId);
  return {ok:true,noteCount:(current.notes||[]).length+1};
}

export interface LeadSmsRecipient{
  /** The Mongo id, because it is what the send dialog's source resolver and the SMS log row carry. */
  id:string;
  leadId:string;studentName:string;classGroup:number|null;status:LeadStatus;nextFollowUp:string|null;phone:string;masked:string;
}
export interface LeadSmsSelection{
  recipients:LeadSmsRecipient[];excludedDoNotContact:number;withoutPhone:number;
  /**
   * How many leads answered the same filter, contactable or not — what the screen was showing. Only
   * `contactableLeadSelection()` fills it, because only it was given a filter to count against.
   */
  matched?:number;
}

/**
 * One bulk visitor send is capped here, not at the size of the book: a screen filtered down to 200 leads
 * sends 200, and a screen with no filter at all sends at most this many, newest first, with the button
 * saying how many are in the send. A cap an operator cannot see would be a send that quietly stopped
 * early; the count beside the button is how they see it. It equals the send pipeline's own cap
 * (`SMS_SOURCE_LIMIT`, and the dialog's `MAX_IDS`), because a selection the pipeline would cut in half
 * would make the button promise a send it cannot deliver.
 */
export const SMS_SELECTION_LIMIT=1000;

/**
 * The selection behind a bulk visitor send (R3.9): the SAME filter the screen used to draw its list, so
 * "the leads on this screen" means one set of people to the list, to the count on the button and to the
 * dialog — and never to a wider set than the operator can see. Every lead marked do-not-contact inside
 * that filter is counted and reported as excluded here; it is not handed to the sender and it is not
 * counted as a recipient.
 */
export async function contactableLeadSelection(params:LeadListParams={},now:Date=new Date()):Promise<LeadSmsSelection>{
  const filter=leadListFilter(params,now);
  const [matched,selection]=await Promise.all([
    Lead.countDocuments(filter),
    contactableLeads(filter,SMS_SELECTION_LIMIT),
  ]);
  return {...selection,matched};
}

/**
 * Bulk-SMS recipients. `CONTACTABLE_LEAD_FILTER` is applied as its own `$and` branch so no caller-supplied
 * filter can override it, and the number left out is returned as well as the list — the send dialog has to
 * be able to say "3 left out: do not contact" rather than quietly dropping them.
 */
export async function contactableLeads(extra:FilterQuery<unknown>={},limit=5000):Promise<LeadSmsSelection>{
  const guarded={$and:[{...CONTACTABLE_LEAD_FILTER},extra]} as FilterQuery<unknown>;
  const [docs,total,reachable]=await Promise.all([
    Lead.find(guarded).sort({date:-1,createdAt:-1}).limit(limit).lean<LeadDoc[]>(),
    Lead.countDocuments(extra),
    Lead.countDocuments(guarded),
  ]);
  const recipients:LeadSmsRecipient[]=[];let withoutPhone=0;
  for(const doc of docs){
    const phone=doc.phones?.[0]?.normalized;
    if(!phone){withoutPhone++;continue}
    recipients.push({id:String(doc._id),leadId:doc.leadId,studentName:doc.studentName,classGroup:doc.classGroup??null,status:doc.status,nextFollowUp:doc.nextFollowUp||null,phone,masked:maskPhone(phone)});
  }
  return {recipients,excludedDoNotContact:Math.max(0,total-reachable),withoutPhone};
}

export interface LeadSmsRow{id:string;leadId:string;studentName:string;phone:string;contactable:boolean;status:LeadStatus}

/**
 * The leads an SMS entry point is pointing at, row by row, as the send pipeline reads them: which number
 * each would be reached on and whether it may be contacted at all.
 *
 * Blocked and phoneless leads are RETURNED rather than dropped, and that is the whole point of this
 * function sitting beside `contactableLeads()`: that one answers "how many are in, how many were left
 * out", which is what the button on the list says, while this one lets the dialog name them — "Rahul left,
 * do not contact" and "3 left out" are not the same sentence, and only the first tells an operator
 * where a visitor went. The rule is `canContact()`, re-read here, at the moment the plan is built, so a
 * visitor blocked after the dialog was opened is still not texted.
 *
 * Ids are checked before they reach a query, and the list is capped: a send is bounded by the dialog that
 * asked for it, never by the size of the book.
 */
export async function leadsForSms(ids:string[],limit=1000):Promise<LeadSmsRow[]>{
  const valid=[...new Set(ids.filter(id=>isValidObjectId(id)))].slice(0,Math.min(limit,1000));
  if(!valid.length)return [];
  const docs=await Lead.find({_id:{$in:valid}}).select('leadId studentName phones status doNotContact').lean<LeadDoc[]>();
  return docs.map(doc=>({
    id:String(doc._id),leadId:doc.leadId,studentName:doc.studentName,status:doc.status,
    // The FIRST normalized number. A second number in the same cell belongs to a sibling or a parent,
    // and doubling a thank-you message to a family that visited once is a cost nobody asked for; two
    // leads that share one number are folded into a single message by the pipeline's own one-per-phone
    // rule, which is the family case handled properly rather than by sending twice.
    phone:doc.phones?.[0]?.normalized||'',
    contactable:canContactRow(doc),
  }));
}

/** One row per number that sits on more than one lead — masked, because a report gets copied into logs. */
export interface DuplicatePhoneGroup{masked:string;count:number;rows:{id:string;leadId:string;studentName:string}[]}
export async function duplicatePhoneGroups(minCount=2):Promise<DuplicatePhoneGroup[]>{
  const groups=await Lead.aggregate<{_id:string;rows:{id:unknown;leadId:string;studentName:string}[]}>([
    {$unwind:'$phones'},
    {$group:{_id:'$phones.normalized',rows:{$push:{id:'$_id',leadId:'$leadId',studentName:'$studentName'}}}},
    // `$size` behind `$expr`: `{rows:{$gte:2}}` would ask whether any ELEMENT of the array is >= 2,
    // and the elements are documents, so the group would never match and every duplicate would vanish.
    {$match:{$expr:{$gte:[{$size:'$rows'},Math.max(2,minCount)]}}},
    {$sort:{_id:1}},
  ]);
  return groups.map(group=>({masked:maskPhone(group._id),count:group.rows.length,rows:group.rows.map(row=>({id:String(row.id),leadId:row.leadId,studentName:row.studentName}))}));
}

/** Has this file been imported before? The wizard asks instead of writing a second copy. */
export interface ImportBatchSummary{batch:string;count:number;firstAt:Date|null;lastAt:Date|null;source:string}
export async function importBatchSummary(batch:string):Promise<ImportBatchSummary|null>{
  const key=String(batch||'').trim();
  if(!key)return null;
  const rows=await Lead.find({importBatch:key}).select('createdAt importSource').sort({createdAt:1}).lean<{createdAt:Date;importSource:string|null}[]>();
  if(!rows.length)return null;
  return {batch:key,count:rows.length,firstAt:rows[0].createdAt||null,lastAt:rows[rows.length-1].createdAt||null,source:rows[0].importSource||''};
}

/** Convenience for the sheet reader: normalise the four vocabulary columns in one call. */
export function readSheetValues(cells:{group?:unknown;medium?:unknown;shift?:unknown;source?:unknown}):{
  group:LeadGroup|null;medium:LeadMedium|null;shift:LeadShift|null;source:LeadSource|null;
}{
  return {group:normalizeGroup(cells.group),medium:normalizeMedium(cells.medium),shift:normalizeShift(cells.shift),source:normalizeSource(cells.source)};
}

/**
 * R3.13 · The three hand-offs. Each one is a single transaction: the intake row and the lead that
 * points at it are written together or not at all, because a lead marked "admitted" with no admission
 * behind it is a promise the intake screen cannot open, and an admission with no lead behind it has
 * lost the history of every call that earned it. The phone is copied from the lead's own record here —
 * the form that asked for this never held digits, only a mask.
 */
export interface HandoffAdmissionInput{
  studentName:string;guardianName:string;grade:string;school:string;dob:string;gender:string;relation:string;
  medium:string;previousResult:string;courseType:string;subjects:string[];packageName:string;
  consent:boolean;email?:string;
}
export type HandoffWriteOk={ok:true;id:string;leadId:string;reference:string};

async function handoffLead(id:string){
  if(!id||!mongoose.isValidObjectId(id))return null;
  // `recycleAny` on purpose: a binned lead must be refused AS binned, not vanish into "not found",
  // because the operator's next move is the Recycle Bin, not a second click.
  return Lead.findById(id).select('leadId status phones admission trialBooking deletedAt').setOptions({recycleAny:true})
    .lean<{leadId:string;status:string;phones:{normalized:string;original:string}[];admission:unknown;trialBooking:unknown;deletedAt:Date|null}|null>();
}

export async function convertLeadToAdmission(leadId:string,input:HandoffAdmissionInput,actorId:string,now:Date=new Date()):Promise<HandoffWriteOk|Refusal|HandoffRefusal>{
  if(!input.consent)return refuse('NO_CONSENT','errors.NO_CONSENT');
  const lead=await handoffLead(leadId);
  if(!lead)return refuse('MISSING','errors.MISSING');
  if(lead.deletedAt)return refuse('BINNED','errors.BINNED_ADMISSION');
  const block=handoffBlock({admission:lead.admission?String(lead.admission):null,trialBooking:lead.trialBooking?String(lead.trialBooking):null,phones:lead.phones||[]},'admission');
  if(block)return block;
  const reference=handoffReference('ADM',now);
  const phone=(lead.phones||[])[0]?.normalized||'';
  const session=await mongoose.startSession();
  try{
    let admissionId='';
    await session.withTransaction(async()=>{
      const row=await Admission.create([{
        reference,studentName:input.studentName,guardianName:input.guardianName,grade:input.grade,school:input.school,
        dob:input.dob,gender:input.gender,relation:input.relation,medium:input.medium,previousResult:input.previousResult,
        courseType:input.courseType,subjects:input.subjects,packageName:input.packageName,consent:true,
        phone,whatsapp:'',email:String(input.email||''),status:'pending',notes:'',
      }],{session});
      admissionId=String(row[0]._id);
      await Lead.updateOne({_id:leadId},{
        $set:{admission:row[0]._id,status:HANDOFF_STATUS.admission,convertedAt:now},
        $push:{notes:{at:now,by:actorId,text:(await getTranslations('leads'))('noteTemplates.admissionOpened',{reference}),outcome:'interested'}},
      },{runValidators:true,session});
    });
    await audit(actorId,'lead.admission',lead.leadId);
    return {ok:true,id:admissionId,leadId:lead.leadId,reference};
  }catch(error){return writeRefusal(error)}finally{await session.endSession()}
}

export interface HandoffTrialInput{
  slotId:string;slotStartAt:string;slotEndAt:string;grade:string;subject:string;consent:boolean;email?:string;
  studentName:string;
}
export async function bookLeadTrial(leadId:string,input:HandoffTrialInput,actorId:string,now:Date=new Date()):Promise<HandoffWriteOk|Refusal|HandoffRefusal>{
  if(!input.consent)return refuse('NO_CONSENT','errors.NO_CONSENT_TRIAL');
  const lead=await handoffLead(leadId);
  if(!lead)return refuse('MISSING','errors.MISSING');
  if(lead.deletedAt)return refuse('BINNED','errors.BINNED_TRIAL');
  const block=handoffBlock({admission:lead.admission?String(lead.admission):null,trialBooking:lead.trialBooking?String(lead.trialBooking):null,phones:lead.phones||[]},'trial');
  if(block)return block;
  const slot=await Slot.findById(input.slotId).select('enabled startAt endAt booked capacity grade subject').lean<{enabled:boolean;startAt:Date;endAt:Date;booked:number;capacity:number;grade:string;subject:string}|null>();
  if(!slot||slot.enabled===false||new Date(slot.startAt).getTime()<=now.getTime())
    return refuse('SLOT_GONE','errors.SLOT_GONE');
  if((slot.booked||0)>=(slot.capacity||0))
    return refuse('SLOT_FULL','errors.SLOT_FULL');
  const reference=handoffReference('TRI',now);
  const phone=(lead.phones||[])[0]?.normalized||'';
  const session=await mongoose.startSession();
  try{
    let bookingId='';
    await session.withTransaction(async()=>{
      // The seat is taken with the same guarded increment the public booking uses, so a hand-off can
      // never oversell a class the public form is also filling.
      const taken=await Slot.findOneAndUpdate(
        {_id:input.slotId,enabled:true,startAt:{$gt:now},$expr:{$lt:['$booked','$capacity']}},
        {$inc:{booked:1}},{new:true,session});
      if(!taken)throw Object.assign(new Error('SLOT_FULL'),{code:'SLOT_FULL'});
      const row=await TrialBooking.create([{
        reference,slot:input.slotId,studentName:input.studentName,phone,grade:input.grade,subject:input.subject,
        email:String(input.email||''),consent:true,status:'booked',
      }],{session});
      bookingId=String(row[0]._id);
      await Lead.updateOne({_id:leadId},{
        $set:{trialBooking:row[0]._id,status:HANDOFF_STATUS.trial},
        $push:{notes:{at:now,by:actorId,text:(await getTranslations('leads'))('noteTemplates.trialBooked',{reference}),outcome:'interested'}},
      },{runValidators:true,session});
    });
    await audit(actorId,'lead.trial',lead.leadId);
    return {ok:true,id:bookingId,leadId:lead.leadId,reference};
  }catch(error){
    if((error as {message?:string}).message==='SLOT_FULL')
      return refuse('SLOT_FULL','errors.SLOT_FULL');
    return writeRefusal(error);
  }finally{await session.endSession()}
}

export async function markLeadNotInterested(leadId:string,rawReason:unknown,actorId:string,now:Date=new Date()):Promise<{ok:true;leadId:string;noteCount:number}|Refusal|HandoffRefusal>{
  const reason=notInterestedReason(rawReason);
  if(!reason.ok)return reason;
  const lead=await handoffLead(leadId);
  if(!lead)return refuse('MISSING','errors.MISSING');
  if(lead.deletedAt)return refuse('BINNED','errors.BINNED_STATUS');
  const updated=await Lead.findByIdAndUpdate(leadId,{
    $set:{status:HANDOFF_STATUS.notInterested},
    $push:{notes:{at:now,by:actorId,text:reason.reason,outcome:'not_interested'}},
  },{new:true,runValidators:true}).select('notes leadId').lean<{notes:unknown[];leadId:string}|null>();
  if(!updated)return refuse('MISSING','errors.MISSING');
  await audit(actorId,'lead.not_interested',updated.leadId);
  return {ok:true,leadId:updated.leadId,noteCount:(updated.notes||[]).length};
}

/**
 * The trial slots a hand-off may offer. Filtered by the same seat test the rule layer applies to a
 * booking, and graded by the lead's own class when the operator has not chosen otherwise — the list is
 * what the dialog shows, so a slot that is full or already past never reaches the screen as an option.
 */
export async function trialSlotsForLead(grade:string,subject:string,now:Date=new Date(),limit=40):Promise<{id:string;startAt:string;endAt:string;grade:string;subject:string;seatsLeft:number}[]>{
  const filter:Record<string,unknown>={enabled:true,startAt:{$gt:now},$expr:{$lt:['$booked','$capacity']}};
  if(grade&&HANDOFF_GRADES.includes(grade as typeof HANDOFF_GRADES[number]))filter.grade=grade;
  if(subject)filter.subject=subject;
  const rows=await Slot.find(filter).sort({startAt:1}).limit(limit)
    .select('startAt endAt grade subject booked capacity')
    .lean<{_id:unknown;startAt:Date;endAt:Date;grade:string;subject:string;booked:number;capacity:number}[]>();
  return rows.map(row=>({
    id:String(row._id),startAt:new Date(row.startAt).toISOString(),endAt:new Date(row.endAt).toISOString(),
    grade:String(row.grade||''),subject:String(row.subject||''),
    seatsLeft:Math.max(0,(Number(row.capacity)||0)-(Number(row.booked)||0)),
  }));
}
