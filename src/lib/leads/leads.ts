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
import {isValidObjectId,type FilterQuery} from 'mongoose';
import {Lead,nextLeadId} from '@/models/Lead';
import type {LeadPhoneRow,LeadFlagRow} from '@/models/Lead';
import {User} from '@/models/User';
import {audit,regexEscape} from '@/lib/admin/helpers';
import {dhakaDay} from '@/lib/admin/today';
import {parsePhoneCell,phoneSearchDigits,phoneSearchMask,telHref,whatsappHref} from './lead-phone';
import {normalizeClassLabel} from './lead-class';
import {normalizeGroup,normalizeMedium,normalizeShift,normalizeSource} from './lead-columns';
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
export type Refusal={ok:false;code:string;messageBn:string;messageEn:string};
function refuse(code:string,messageBn:string,messageEn:string):Refusal{return {ok:false,code,messageBn,messageEn}}

export interface LeadWriteOk{
  ok:true;id:string;leadId:string;familyKey:string|null;
  /** The lead that already held one of these numbers, when the key was inherited rather than computed. */
  inheritedFrom:string|null;
  /** How many leads were re-pointed because two families turned out to be one. */
  mergedLeads:number;
  /** The family keys that were abandoned to make that merge, so an import can report it. */
  mergedFrom:string[];
  flags:LeadFlagRow[];
}
export type LeadWriteResult=LeadWriteOk|Refusal;

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
    return refuse('DUPLICATE',`এই তথ্যটি আগেই সংরক্ষিত আছে (${field})।`,`That record already exists (${field}).`);
  }
  console.error('lead write failed',{code:code??null,fields:keys});
  return refuse('WRITE_FAILED','লিডটি সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।','The lead could not be saved. Please try again.');
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

/** Which leads already hold a number — the warning behind "এই নাম্বারটি আগেই আছে". */
export async function leadsWithPhone(phone:string):Promise<{id:string;leadId:string;studentName:string;masked:string}[]>{
  const normalized=String(phone||'').trim();
  if(!/^01[3-9]\d{8}$/.test(normalized))return [];
  const rows=await Lead.find({'phones.normalized':normalized}).select('leadId studentName').lean<{_id:unknown;leadId:string;studentName:string}[]>();
  return rows.map(row=>({id:String(row._id),leadId:row.leadId,studentName:row.studentName,masked:maskPhone(normalized)}));
}

export interface QuickLeadInput{
  studentName:string;guardianName?:string;phone?:string;classLabel?:string;school?:string;
  interestedIn?:string;source?:string;group?:string;shift?:string;medium?:string;status?:string;
  followUp?:FollowUpKey|'clear';customDay?:string;note?:string;
}

/**
 * Quick-add: four fields is a complete lead. Anything the operator did not fill in stays UNKNOWN —
 * group and medium keep their `unknown` value, class stays null and no follow-up is invented — because
 * a guessed class puts the lead in the wrong funnel and a guessed follow-up makes somebody call a
 * parent who was never asked.
 */
export async function createQuickLead(input:QuickLeadInput,actorId:string,now:Date=new Date()):Promise<LeadWriteResult>{
  const studentName=String(input.studentName||'').trim();
  if(!studentName)return refuse('NO_NAME','নাম লিখুন — নাম ছাড়া লিড সংরক্ষণ হয় না।','Write a name — a lead is not saved without one.');
  const phoneText=String(input.phone||'').trim();
  const read=parsePhoneCell(phoneText);
  if(phoneText&&!read.phones.length){
    const flag=read.flags[0];
    return refuse('BAD_PHONE',flag?.messageBn||'নাম্বারটি পড়া যায়নি।','That number could not be read.');
  }
  const followUpKey=input.followUp;
  let nextFollowUp:string|null=null;
  if(followUpKey&&followUpKey!=='clear'){
    nextFollowUp=nextFollowUpDay(followUpKey,now,input.customDay);
    if(!nextFollowUp)return refuse('BAD_FOLLOW_UP','এই তারিখটি আসল নয়, তাই ফলো-আপ বসানো হয়নি।','That is not a real date, so no follow-up was set.');
  }
  const classRead=normalizeClassLabel(input.classLabel||'',now);
  const phones:LeadPhoneRow[]=read.phones.map(row=>({normalized:row.normalized,original:row.original.slice(0,80)}));
  const flags:LeadFlagRow[]=[
    ...classRead.flags.map(flag=>({field:'classLabel',code:flag.code,original:String(input.classLabel||'').slice(0,200),messageBn:flag.messageBn,messageEn:flag.messageEn,suggested:String(flag.suggested??'')})),
    ...read.flags.map(flag=>({field:'phones',code:flag.code,original:flag.original.slice(0,200),messageBn:flag.messageBn,messageEn:flag.messageEn,suggested:''})),
  ];
  const status=(LEAD_STATUSES as readonly string[]).includes(String(input.status||''))?String(input.status) as LeadStatus:'new';
  const source=(LEAD_SOURCES as readonly string[]).includes(String(input.source||''))?String(input.source) as LeadSource:'walk_in';
  const group=(LEAD_GROUPS as readonly string[]).includes(String(input.group||''))?String(input.group) as LeadGroup:'unknown';
  const shift=(LEAD_SHIFTS as readonly string[]).includes(String(input.shift||''))?String(input.shift) as LeadShift:'any';
  const medium=(LEAD_MEDIUMS as readonly string[]).includes(String(input.medium||''))?String(input.medium) as LeadMedium:'unknown';
  const family=await resolveFamilyKey(phones.map(row=>row.normalized));
  const noteText=String(input.note||'').trim();
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
  if(!studentName)return refuse('NO_NAME','নাম ছাড়া সারি আমদানি হয় না — এটি প্রিভিউতে থেকে যাবে।','A row without a name is not imported; it stays in the preview.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date||'')))return refuse('BAD_DATE','তারিখটি পড়া যায়নি, তাই সারিটি লেখা হয়নি।','That date could not be read, so the row was not written.');
  const phones=(input.phones||[]).filter(row=>/^01[3-9]\d{8}$/.test(row.normalized));
  const flags=[...(input.flags||[])];
  // `group`/`medium`/`shift` have an honest "we do not know" value. `source` does not, so an unmapped
  // source becomes `other` AND a flag quoting the sheet — the reader can see it was never recognised,
  // which is the difference between "the sheet did not say" and "the sheet said something we could not
  // read". Both are stored; only the second is a doubt worth showing.
  const unmapped=(field:string,value:unknown,read:unknown,messageBn:string,messageEn:string)=>{
    const text=String(value==null?'':value).trim();
    if(text&&!read)flags.push({field,code:'unmapped',original:text.slice(0,200),messageBn,messageEn,suggested:''});
  };
  const raw=input.raw||{};
  unmapped('group',raw.group,input.group,'গ্রুপটি চেনা যায়নি, তাই "অজানা" রাখা হয়েছে।','That group was not recognised, so it was left unknown.');
  unmapped('medium',raw.medium,input.medium,'মাধ্যমটি চেনা যায়নি, তাই "অজানা" রাখা হয়েছে।','That medium was not recognised, so it was left unknown.');
  unmapped('shift',raw.shift,input.shift,'শিফটটি চেনা যায়নি, তাই "যেকোনো" রাখা হয়েছে।','That shift was not recognised, so it was left as any.');
  unmapped('source',raw.source,input.source,'উৎসটি চেনা যায়নি, তাই "অন্যান্য" রাখা হয়েছে।','That source was not recognised, so it was left as other.');
  const group=input.group||'unknown';const medium=input.medium||'unknown';const shift=input.shift||'any';
  const source=input.source||'other';
  const classRead=input.classLabel?normalizeClassLabel(input.classLabel,now):null;
  if(classRead)for(const flag of classRead.flags)flags.push({field:'classLabel',code:flag.code,original:classRead.classLabel.slice(0,200),messageBn:flag.messageBn,messageEn:flag.messageEn,suggested:String(flag.suggested??'')});
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
  return refuse('ID_BUSY','একই সময়ে আরেকটি লিড সংরক্ষিত হয়েছে। আবার চেষ্টা করুন।','Another lead was saved at the same moment. Please try again.');
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
  code:string;messageBn:string;messageEn:string;
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
  if(read.ok===false)return {status:'refused',hits:[],total:0,masked:'—',code:read.code,messageBn:read.messageBn,messageEn:read.messageEn};
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
    messageBn:hits.length?'':'এই নাম্বারে কোনো লিড পাওয়া যায়নি।',messageEn:hits.length?'':'No lead holds that number.'};
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
 * Names, schools and lead ids stay searchable, because a URL with `?q=রাহুল` in it leaks nothing.
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
export interface LeadDetail{row:LeadRow;notes:LeadNoteView[];family:LeadRow[]}
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
  return {row:toRow(doc,now),notes,family};
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
 * A status change. `doNotContact` is STICKY: choosing "যোগাযোগ করবেন না" sets it, and moving the status
 * back to anything else afterwards does not unset it — an operator un-marking a status must not silently
 * put a parent back on a calling list. Clearing it is its own deliberate action.
 */
export async function updateLeadStatus(id:string,status:string,actorId:string,now:Date=new Date(),note?:string):Promise<LeadUpdateResult>{
  if(!(LEAD_STATUSES as readonly string[]).includes(status))return refuse('BAD_STATUS','এই অবস্থাটি নেই।','That is not one of the statuses.');
  const current=await findLive(id);
  if(!current)return refuse('MISSING','লিডটি খুঁজে পাওয়া যায়নি।','That lead was not found.');
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
  if(!current)return refuse('MISSING','লিডটি খুঁজে পাওয়া যায়নি।','That lead was not found.');
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
  if(!current)return refuse('MISSING','লিডটি খুঁজে পাওয়া যায়নি।','That lead was not found.');
  let nextFollowUp:string|null=null;
  if(key!=='clear'){
    nextFollowUp=nextFollowUpDay(key,now,customDay);
    if(!nextFollowUp)return refuse('BAD_FOLLOW_UP','এই তারিখটি আসল নয়, তাই ফলো-আপ বসানো হয়নি।','That is not a real date, so no follow-up was set.');
  }
  await Lead.updateOne({_id:id},{$set:{nextFollowUp}});
  await audit(actorId,'lead.follow-up',current.leadId);
  return {ok:true,nextFollowUp,state:followUpState(nextFollowUp,now)};
}

/** A note in the drawer's timeline. `outcome` is optional; the note is the record either way. */
export async function addLeadNote(id:string,text:string,outcome:string,actorId:string,now:Date=new Date()):Promise<{ok:true;noteCount:number}|Refusal>{
  const body=String(text||'').trim();
  if(!body)return refuse('NO_NOTE','খালি নোট লেখা যায় না।','An empty note cannot be saved.');
  if(body.length>1000)return refuse('NOTE_TOO_LONG','নোট ১০০০ অক্ষরের বেশি হলে সংরক্ষণ হয় না।','A note is limited to 1000 characters.');
  const current=await Lead.findById(id).select('leadId notes').lean<{leadId:string;notes:unknown[]}>()||null;
  if(!current)return refuse('MISSING','লিডটি খুঁজে পাওয়া যায়নি।','That lead was not found.');
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
 * be able to say "৩ জন বাদ: যোগাযোগ করবেন না" rather than quietly dropping them.
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
 * out", which is what the button on the list says, while this one lets the dialog name them — "রাহুল বাদ,
 * যোগাযোগ করবেন না" and "৩ জন বাদ" are not the same sentence, and only the first tells an operator
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
