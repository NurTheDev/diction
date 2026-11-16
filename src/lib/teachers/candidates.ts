/**
 * R4 · The teacher CV bank's rule layer.
 *
 * The pages query nothing: every row, count, refusal and hire goes through this file, so the list, the
 * drawer, the import wizard and a bulk SMS cannot disagree about what a candidate is. The promises it
 * keeps, and why each lives here rather than in the screen that needed it:
 *
 *   • **A phone number never appears in a URL this app generates, in an audit target or in a log.** The
 *     `tel:` and `wa.me` hrefs on a row are third-party destinations rendered in the operator's own
 *     browser — the one place the brief allows a number — exactly as on the Visitors list. What the
 *     screens and the audit rows print is the mask.
 *   • **Every filter value is checked against the vocabulary twice**: here and again in the page,
 *     because an invented status or a class of 99 must be ignored rather than trusted by whichever
 *     caller forgot to check it.
 *   • **The availability keyword is folded across digit scripts**, so an operator typing `3.00` finds
 *     the sheet's `৩.০০-৬.০০` and vice versa. Mongo narrows first with both spellings; the pure check
 *     in `vocab.ts` confirms each row, and because it is the more permissive of the two it never
 *     removes a row the database returned — so a page and its total cannot disagree.
 *   • **A hire is one transaction that writes three things** — the Teacher profile, the link back on
 *     the candidate and a note naming that profile — or none of them. A hire that made the profile and
 *     then failed to link it would leave two screens telling different stories about one person, and
 *     this bank is the record a hiring decision has to be traceable in.
 *   • **A hire never happens twice.** `hiredAsTeacherId` is the link; a second press answers
 *     ALREADY_HIRED instead of minting a twin profile.
 *   • **CVs older than twelve months are counted, not deleted.** `reviewCount()` is what the banner
 *     reads; the bin stays the only door out.
 */
import type {FilterQuery} from 'mongoose';
import mongoose from 'mongoose';
import {TeacherCandidate,nextCandidateId,type CandidateNoteRow,type CandidatePhoneRow} from '@/models/TeacherCandidate';
import {TeacherContent} from '@/models/PublicContent';
import {User} from '@/models/User';
import {parsePhoneCell,telHref,whatsappHref,phoneSearchMask} from '@/lib/leads/lead-phone';
import {dhakaDay} from '@/lib/admin/today';
import {asciiDigits,formatDigits} from '@/lib/admin/format';
import {regexEscape} from '@/lib/admin/helpers';
import {renderTeacherPair} from './teacher-message';
import {
  TEACHER_CLASS_LEVELS,TEACHER_NOTE_OUTCOMES,TEACHER_RATINGS,TEACHER_SHIFTS,TEACHER_SOURCES,TEACHER_STATUSES,
  TEACHER_SUBJECTS,availabilityMatches,needsReview,teacherListQuery,type TeacherListQuery,
} from './vocab';

/** A live candidate as the screens read it: masks instead of numbers, hrefs for the two diallers. */
export interface CandidateRow{
  id:string;candidateId:string;receivedDate:string;name:string;email:string;
  department:string;university:string;currentInstitute:string;
  subjectsText:string;subjects:string[];classLevels:string[];
  availabilityText:string;shifts:string[];expectedSalary:number|null;
  cvFile:string;photo:string;source:string;rating:string;status:string;
  interviewAt:Date|null;tags:string[];hired:boolean;review:boolean;
  phones:{normalized:string;original:string;masked:string;tel:string;whatsapp:string}[];
  lastNote:{at:Date;text:string;outcome:string}|null;
}

export type Refusal={ok:false;code:string;messageKey:string;messageParams:Record<string,string|number>;messageBn:string;messageEn:string};
function refuse(code:string,messageKey:string,messageParams:Record<string,string|number>={}):Refusal{
  return {ok:false,code,messageKey,messageParams,...renderTeacherPair(messageKey,messageParams)};
}

type Doc=Record<string,any>;
type CandidateUpdate=mongoose.UpdateQuery<Doc>;

function phoneViews(phones:CandidatePhoneRow[]){
  return (phones||[]).map(phone=>({
    normalized:phone.normalized,original:phone.original,masked:phoneSearchMask(phone.normalized),
    tel:telHref(phone.normalized),whatsapp:whatsappHref(phone.normalized),
  }));
}

export function toRow(doc:Doc,now:Date=new Date()):CandidateRow{
  const notes=(doc.notes||[]) as CandidateNoteRow[];
  const last=notes.length?notes[notes.length-1]:null;
  return {
    id:String(doc._id),candidateId:String(doc.candidateId||''),receivedDate:String(doc.receivedDate||''),
    name:String(doc.name||''),email:String(doc.email||''),department:String(doc.department||''),
    university:String(doc.university||''),currentInstitute:String(doc.currentInstitute||''),
    subjectsText:String(doc.subjectsText||''),subjects:[...(doc.subjects||[])],classLevels:[...(doc.classLevels||[])],
    availabilityText:String(doc.availabilityText||''),shifts:[...(doc.shifts||[])],
    expectedSalary:doc.expectedSalary===null||doc.expectedSalary===undefined?null:Number(doc.expectedSalary),
    cvFile:String(doc.cvFile||''),photo:String(doc.photo||''),source:String(doc.source||'walk_in'),
    rating:String(doc.rating||'unrated'),status:String(doc.status||'new'),
    interviewAt:doc.interviewAt?new Date(doc.interviewAt):null,tags:[...(doc.tags||[])],
    hired:!!doc.hiredAsTeacherId,review:needsReview(String(doc.receivedDate||''),String(doc.status||''),now),
    phones:phoneViews(doc.phones||[]),
    lastNote:last?{at:new Date(last.at),text:last.text,outcome:last.outcome}:null,
  };
}

/** One keyword, spelled in both digit scripts, so neither the sheet nor the operator has to convert. */
function availabilityVariants(keyword:string):RegExp[]{
  const needle=String(keyword||'').trim();
  return [...new Set([asciiDigits(needle),formatDigits(needle,'bn')])].map(value=>new RegExp(regexEscape(value),'i'));
}

export interface TeacherListParams{
  q?:string;status?:string;rating?:string;source?:string;shift?:string;subject?:string;classLevel?:string;
  availability?:string;review?:string;from?:string;to?:string;page?:number;perPage?:number;
}

/**
 * The read filter. A value that is not in the vocabulary is dropped (never trusted), and the two date
 * edges are merged into one range so "older than a year" and "before this date" cannot contradict.
 */
export function teacherListFilter(params:TeacherListParams,query?:TeacherListQuery):FilterQuery<Doc>{
  const checked=query||teacherListQuery(params);
  const filter:FilterQuery<Doc>={};
  const range:{from?:string;to?:string}={};
  if(checked.from)range.from=checked.from;
  if(checked.to)range.to=checked.to;
  if(checked.review==='old'){
    const edge=dhakaDay(new Date(Date.now()-365*86400000));
    if(!range.to||edge<range.to)range.to=edge;
  }
  if(range.from||range.to){
    filter.receivedDate={...(range.from?{$gte:range.from}:{}),...(range.to?{$lte:range.to}:{})};
  }
  const text=checked.q;
  if(text){
    const rx=new RegExp(regexEscape(text),'i');
    filter.$or=[{name:rx},{university:rx},{department:rx},{currentInstitute:rx},{candidateId:rx},{tags:rx},{email:rx}];
  }
  if(checked.status)filter.status=checked.status;
  if(checked.rating)filter.rating=checked.rating;
  if(checked.source)filter.source=checked.source;
  if(checked.shift)filter.shifts=checked.shift;
  if(checked.subject)filter.subjects=checked.subject;
  if(checked.classLevel)filter.classLevels=checked.classLevel;
  if(checked.availability){
    const clause={availabilityText:{$in:availabilityVariants(checked.availability)}};
    const clauses=filter.$or as FilterQuery<Doc>[]|undefined;
    // One $or is allowed per query level, so a keyword search plus an availability keyword becomes $and.
    if(clauses){filter.$and=[{$or:clauses},clause];delete filter.$or;}
    else filter.availabilityText=clause.availabilityText;
  }
  return filter;
}

export interface TeacherListResult{rows:CandidateRow[];total:number;page:number;pages:number;perPage:number}

export async function listCandidates(params:TeacherListParams,now:Date=new Date()):Promise<TeacherListResult>{
  const query=teacherListQuery(params);
  const filter=teacherListFilter(params,query);
  const perPage=Math.min(Math.max(Number(params.perPage)||25,5),100);
  const total=await TeacherCandidate.countDocuments(filter);
  const pages=Math.max(1,Math.ceil(total/perPage));
  const page=Math.min(Math.max(Number(params.page)||1,1),pages);
  const docs=await TeacherCandidate.find(filter).sort({receivedDate:-1,createdAt:-1}).skip((page-1)*perPage).limit(perPage).lean<Doc[]>();
  const rows=docs.map(doc=>toRow(doc,now)).filter(row=>availabilityMatches(row.availabilityText,query.availability));
  return {rows,total,page,pages,perPage};
}

/** The status chips: one aggregate over the live rows, in vocabulary order, zeros included. */
export async function candidateStatusCounts():Promise<{status:string;count:number}[]>{
  const rows=await TeacherCandidate.aggregate<{_id:string;n:number}>([{$group:{_id:'$status',n:{$sum:1}}}]);
  const found=new Map(rows.map(row=>[String(row._id),Number(row.n)||0]));
  return TEACHER_STATUSES.map(status=>({status,count:found.get(status)||0}));
}

/** CVs waiting over a year without a hire — a reminder on the list, never an automatic deletion. */
export async function reviewCount(now:Date=new Date()):Promise<number>{
  const edge=dhakaDay(new Date(now.getTime()-365*86400000));
  return TeacherCandidate.countDocuments({receivedDate:{$lte:edge},status:{$ne:'hired'}});
}

export interface QuickCandidateInput{
  name?:string;phones?:(string|null|undefined)[];email?:string;department?:string;university?:string;
  currentInstitute?:string;subjectsText?:string;subjects?:string[];classLevels?:string[];
  availabilityText?:string;shifts?:string[];expectedSalary?:string|number|null;source?:string;tags?:string[];
  receivedDate?:string;cvFile?:string;cvPublicId?:string;photo?:string;photoPublicId?:string;
  importSource?:string|null;importBatch?:string|null;
}

export type CandidateWriteOk={ok:true;id:string;candidateId:string;phoneFlags:{original:string;code:string}[]};
/**
 * The duplicate question. A CV that shares a number or an email with one already on file is NOT an
 * error — the same person may genuinely have applied twice, and only a human can say whether these are
 * one candidate or two — so the write stops and asks, exactly as the Visitors quick-add does. Pressing
 * "save anyway" answers it with `dupChoice:'separate'`, and the second write goes through.
 */
export type CandidateDupQuestion=Refusal&{code:'DUPLICATE';holders:CandidateDupHolder[]};
export type CandidateWriteResult=CandidateWriteOk|CandidateDupQuestion|Refusal;

const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * The quick-add write. A CV with no name cannot be called or hired, so that one field is required;
 * a number that could not be read keeps its flag beside it rather than being dropped, because the
 * sheet is the evidence and the operator is the one who decides what it meant.
 */
export async function createCandidate(input:QuickCandidateInput,actorId:string,now:Date=new Date(),opts:{dupChoice?:'separate'}={}):Promise<CandidateWriteResult>{
  const name=String(input.name||'').trim();
  if(!name)return refuse('NO_NAME','errors.NO_NAME');
  if(name.length>120)return refuse('NAME_TOO_LONG','errors.NAME_TOO_LONG');
  const email=String(input.email||'').trim().toLowerCase();
  if(email&&!EMAIL.test(email))return refuse('BAD_EMAIL','errors.BAD_EMAIL',{email});
  const phones:{normalized:string;original:string}[]=[];
  const phoneFlags:{original:string;code:string}[]=[];
  for(const cell of input.phones||[]){
    if(cell===null||cell===undefined||String(cell).trim()==='')continue;
    const read=parsePhoneCell(cell);
    for(const phone of read.phones)phones.push(phone);
    for(const flag of read.flags)phoneFlags.push({original:flag.original,code:flag.code});
  }
  if(opts.dupChoice!=='separate'){
    const holders=await duplicateCandidates(phones.map(phone=>phone.normalized),email||null);
    if(holders.length){
      const question={...refuse('DUPLICATE','errors.DUPLICATE',{name,candidateId:holders[0].candidateId}),holders};
      return question as CandidateDupQuestion;
    }
  }
  const salaryRaw=input.expectedSalary===null||input.expectedSalary===undefined||input.expectedSalary===''?null:Number(input.expectedSalary);
  const receivedDate=/^\d{4}-\d{2}-\d{2}$/.test(String(input.receivedDate||''))?String(input.receivedDate):dhakaDay(now);
  const doc=await TeacherCandidate.create({
    candidateId:await nextCandidateId(now),receivedDate,name,phones,email,
    department:String(input.department||'').trim().slice(0,120),
    university:String(input.university||'').trim().slice(0,160),
    currentInstitute:String(input.currentInstitute||'').trim().slice(0,160),
    subjectsText:String(input.subjectsText||'').trim().slice(0,400),
    subjects:(input.subjects||[]).filter(subject=>(TEACHER_SUBJECTS as readonly string[]).includes(subject)),
    classLevels:(input.classLevels||[]).filter(level=>(TEACHER_CLASS_LEVELS as readonly string[]).includes(level)),
    availabilityText:String(input.availabilityText||'').trim().slice(0,200),
    shifts:(input.shifts||[]).filter(shift=>(TEACHER_SHIFTS as readonly string[]).includes(shift)),
    expectedSalary:salaryRaw===null||!Number.isFinite(salaryRaw)||salaryRaw<0?null:Math.round(salaryRaw),
    cvFile:String(input.cvFile||'').slice(0,400),cvPublicId:String(input.cvPublicId||'').slice(0,200),
    photo:String(input.photo||'').slice(0,400),photoPublicId:String(input.photoPublicId||'').slice(0,200),
    source:(TEACHER_SOURCES as readonly string[]).includes(String(input.source||''))?String(input.source):'walk_in',
    // Tags are what is left of a subject cell the parser could not settle: keeping them is the difference
    // between "we could not read this word" and losing it.
    tags:[...new Set((input.tags||[]).map(tag=>String(tag).trim()).filter(Boolean))].slice(0,40),
    importSource:input.importSource??null,importBatch:input.importBatch??null,
    createdBy:new mongoose.Types.ObjectId(actorId),
  });
  return {ok:true,id:String(doc._id),candidateId:doc.candidateId,phoneFlags};
}

async function findLive(id:string):Promise<Doc|null>{
  if(!mongoose.isValidObjectId(id))return null;
  return TeacherCandidate.findById(id).lean<Doc|null>();
}

export interface CandidateUpdatePatch{
  status?:string;rating?:string;source?:string;shifts?:string[];subjects?:string[];classLevels?:string[];
  department?:string;university?:string;currentInstitute?:string;subjectsText?:string;availabilityText?:string;
  expectedSalary?:string|number|null;email?:string;tags?:string[];cvFile?:string;cvPublicId?:string;
  photo?:string;photoPublicId?:string;
}

export type CandidateUpdateResult={ok:true;id:string;status:string;rating:string}|Refusal;

/** The drawer's edits: vocabulary values are checked, free text is trimmed and capped, nothing else. */
export async function updateCandidate(id:string,patch:CandidateUpdatePatch,actorId:string):Promise<CandidateUpdateResult>{
  const doc=await findLive(id);
  if(!doc)return refuse('MISSING','errors.MISSING');
  if(!(TEACHER_STATUSES as readonly string[]).includes(String(patch.status??doc.status)))return refuse('BAD_STATUS','errors.BAD_STATUS');
  if(!(TEACHER_RATINGS as readonly string[]).includes(String(patch.rating??doc.rating)))return refuse('BAD_RATING','errors.BAD_RATING');
  if(!(TEACHER_SOURCES as readonly string[]).includes(String(patch.source??doc.source)))return refuse('BAD_SOURCE','errors.BAD_SOURCE');
  const email=patch.email===undefined?String(doc.email||''):String(patch.email).trim().toLowerCase();
  if(email&&!EMAIL.test(email))return refuse('BAD_EMAIL','errors.BAD_EMAIL',{email});
  const set:Doc={status:patch.status??doc.status,rating:patch.rating??doc.rating,source:patch.source??doc.source,email};
  if(patch.shifts!==undefined)set.shifts=patch.shifts.filter(shift=>(TEACHER_SHIFTS as readonly string[]).includes(shift));
  if(patch.subjects!==undefined)set.subjects=patch.subjects.filter(subject=>(TEACHER_SUBJECTS as readonly string[]).includes(subject));
  if(patch.classLevels!==undefined)set.classLevels=patch.classLevels.filter(level=>(TEACHER_CLASS_LEVELS as readonly string[]).includes(level));
  for(const field of ['department','university','currentInstitute','subjectsText','availabilityText'] as const){
    if(patch[field]!==undefined)set[field]=String(patch[field]).trim().slice(0,field==='subjectsText'?400:field==='availabilityText'?200:160);
  }
  if(patch.tags!==undefined)set.tags=patch.tags.map(tag=>String(tag).trim().slice(0,40)).filter(Boolean).slice(0,20);
  if(patch.expectedSalary!==undefined){
    const raw=patch.expectedSalary===null||patch.expectedSalary===''?null:Number(patch.expectedSalary);
    set.expectedSalary=raw===null||!Number.isFinite(raw)||raw<0?null:Math.round(raw);
  }
  for(const field of ['cvFile','cvPublicId','photo','photoPublicId'] as const){
    if(patch[field]!==undefined)set[field]=String(patch[field]).slice(field.endsWith('PublicId')?200:400);
  }
  await TeacherCandidate.updateOne({_id:doc._id},{$set:set} as CandidateUpdate);
  return {ok:true,id:String(doc._id),status:String(set.status),rating:String(set.rating)};
}

export async function addCandidateNote(id:string,text:string,outcome:string,actorId:string,now:Date=new Date()):Promise<{ok:true;noteCount:number}|Refusal>{
  const body=String(text||'').trim();
  if(!body)return refuse('EMPTY_NOTE','errors.EMPTY_NOTE');
  if(body.length>1000)return refuse('NOTE_TOO_LONG','errors.NOTE_TOO_LONG');
  const chosen=(TEACHER_NOTE_OUTCOMES as readonly string[]).includes(outcome)?outcome:'';
  const doc=await findLive(id);
  if(!doc)return refuse('MISSING','errors.MISSING');
  const note={at:now,by:new mongoose.Types.ObjectId(actorId),text:body,outcome:chosen};
  const updated=await TeacherCandidate.updateOne({_id:doc._id},{$push:{notes:note}} as CandidateUpdate);
  if(!updated.matchedCount)return refuse('MISSING','errors.MISSING');
  return {ok:true,noteCount:(doc.notes||[]).length+1};
}

export type InterviewResult={ok:true;interviewAt:Date|null;status:string}|Refusal;

/** Scheduling an interview moves the status with it; clearing the time leaves the status alone. */
export async function scheduleInterview(id:string,iso:string|null,actorId:string):Promise<InterviewResult>{
  const doc=await findLive(id);
  if(!doc)return refuse('MISSING','errors.MISSING');
  if(iso===null||String(iso).trim()===''){
    await TeacherCandidate.updateOne({_id:doc._id},{$set:{interviewAt:null}} as CandidateUpdate);
    return {ok:true,interviewAt:null,status:String(doc.status)};
  }
  const at=new Date(iso);
  if(Number.isNaN(at.getTime()))return refuse('BAD_INTERVIEW_TIME','errors.BAD_INTERVIEW_TIME');
  await TeacherCandidate.updateOne({_id:doc._id},{$set:{interviewAt:at,status:'interview_scheduled'}} as CandidateUpdate);
  return {ok:true,interviewAt:at,status:'interview_scheduled'};
}

export interface CandidateDupHolder{id:string;candidateId:string;name:string;status:string;receivedDate:string;masked:string;match:'phone'|'email'}

/**
 * Duplicate detection by phone OR email. A CV that is already on file is a question for the operator,
 * never an error: the same person may genuinely have applied twice, and only a human can say so.
 */
export async function duplicateCandidates(phones:(string|null|undefined)[],email:string|null|undefined,excludeId?:string):Promise<CandidateDupHolder[]>{
  const normalized:string[]=[];
  for(const cell of phones||[]){
    if(!cell||!String(cell).trim())continue;
    for(const phone of parsePhoneCell(cell).phones)normalized.push(phone.normalized);
  }
  const mail=String(email||'').trim().toLowerCase();
  const or:FilterQuery<Doc>[]=[];
  if(normalized.length)or.push({'phones.normalized':{$in:normalized}});
  if(mail&&EMAIL.test(mail))or.push({email:mail});
  if(!or.length)return [];
  const filter:FilterQuery<Doc>={$or:or};
  if(excludeId&&mongoose.isValidObjectId(excludeId))filter._id={$ne:new mongoose.Types.ObjectId(excludeId)};
  const docs=await TeacherCandidate.find(filter).select('candidateId name status receivedDate phones email').lean<Doc[]>();
  return docs.map(doc=>{
    const byPhone=normalized.some(number=>(doc.phones||[]).some((phone:CandidatePhoneRow)=>phone.normalized===number));
    return {
      id:String(doc._id),candidateId:String(doc.candidateId),name:String(doc.name),status:String(doc.status),
      receivedDate:String(doc.receivedDate),masked:phoneSearchMask(String((doc.phones||[])[0]?.normalized||'')),
      match:byPhone?'phone' as const:'email' as const,
    };
  });
}

export interface CandidateDetail{
  row:CandidateRow;
  notes:{at:Date;text:string;outcome:string;byName:string}[];
  teacher:{id:string;slug:string;name:string;published:boolean}|null;
  duplicates:CandidateDupHolder[];
}

export async function candidateDetail(id:string,now:Date=new Date()):Promise<CandidateDetail|null>{
  const doc=await findLive(id);
  if(!doc)return null;
  const row=toRow(doc,now);
  const noteDocs=(doc.notes||[]) as CandidateNoteRow[];
  const authors=await User.find({_id:{$in:noteDocs.map(note=>String(note.by))}}).select('name').lean<{_id:unknown;name:string}[]>();
  const names=new Map(authors.map(author=>[String(author._id),author.name]));
  const teacher=doc.hiredAsTeacherId
    ? await TeacherContent.findById(doc.hiredAsTeacherId).select('slug name published').lean<{_id:unknown;slug:string;name:{bn:string;en:string};published:boolean}|null>()
    : null;
  return {
    row,
    notes:noteDocs.map(note=>({at:new Date(note.at),text:note.text,outcome:note.outcome,byName:names.get(String(note.by))||'—'})),
    teacher:teacher?{id:String(teacher._id),slug:teacher.slug,name:teacher.name.bn||teacher.name.en,published:teacher.published}:null,
    duplicates:await duplicateCandidates(row.phones.map(phone=>phone.normalized),row.email||null,id),
  };
}

export type HireResult={ok:true;id:string;teacherId:string;slug:string;alreadyHired?:true}|Refusal;

/**
 * The hire. One transaction writes the Teacher profile (unpublished on purpose: a public faculty page
 * is a decision the owner makes with words and a photo, not a side effect of a hiring), the link back
 * on the candidate, and a timeline note naming the profile. The profile carries the candidate's own
 * Bangla name in both languages, because `TeacherContent` requires a name in each and inventing an
 * English spelling would put a word nobody chose on the public site.
 */
export async function hireCandidate(id:string,actorId:string,now:Date=new Date()):Promise<HireResult>{
  const doc=await findLive(id);
  if(!doc)return refuse('MISSING','errors.MISSING');
  if(doc.hiredAsTeacherId)return refuse('ALREADY_HIRED','errors.ALREADY_HIRED');
  const name=String(doc.name||'').trim();
  const qualification=String(doc.university||doc.department||'').trim();
  const slug=`cv-${String(doc.candidateId||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')}`;
  const session=await mongoose.startSession();
  try{
    let teacherId='',written='';
    await session.withTransaction(async()=>{
      const created=await TeacherContent.create([{
        slug,name:{bn:name,en:name},
        qualification:{bn:qualification||name,en:qualification||name},
        bio:{bn:'',en:''},director:false,published:false,order:0,photoUrl:String(doc.photo||''),
      }],{session});
      teacherId=String(created[0]._id);
      written=renderTeacherPair('success.hired',{name,slug:created[0].slug}).messageBn;
      await TeacherCandidate.updateOne({_id:doc._id},{
        $set:{hiredAsTeacherId:created[0]._id,status:'hired'},
        $push:{notes:{at:now,by:new mongoose.Types.ObjectId(actorId),text:written,outcome:'interested'}},
      } as CandidateUpdate,{session});
    });
    return {ok:true,id:String(doc._id),teacherId,slug};
  }finally{
    await session.endSession();
  }
}

export interface CandidateSmsRow{id:string;candidateId:string;name:string;phone:string;hasPhone:boolean}

/** What the SMS picker needs from a selection: ids in, dialable numbers out, masks on screen. */
export async function candidatesForSms(ids:string[],limit=1000):Promise<CandidateSmsRow[]>{
  const live=ids.filter(id=>mongoose.isValidObjectId(id)).slice(0,limit);
  if(!live.length)return [];
  const docs=await TeacherCandidate.find({_id:{$in:live.map(id=>new mongoose.Types.ObjectId(id))}}).select('candidateId name phones').lean<Doc[]>();
  return docs.map(doc=>({
    id:String(doc._id),candidateId:String(doc.candidateId),name:String(doc.name),
    phone:String((doc.phones||[])[0]?.normalized||''),hasPhone:(doc.phones||[]).length>0,
  }));
}
