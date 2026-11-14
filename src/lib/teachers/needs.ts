/**
 * R4 · Saved teaching needs — the question, and the CVs that answer it.
 *
 * A need is "class 9 maths, evening" written down once, so the Find-a-teacher screen can answer it
 * again tomorrow without anybody re-typing three filters. Two things are worth saying about how it
 * answers:
 *
 *   • A need with no subject, no class and no shift is refused. An empty filter matches the whole bank,
 *     and a saved "everything" is not a question anybody asked — it is a count that will look like a
 *     shortlist to whoever reads it next month.
 *   • The matches are counted with the same filter the list uses (`teacherListFilter`), so a need that
 *     says it fits nine CVs and a filter set by hand to the same three values cannot disagree.
 *
 * A need is never deleted by anything but a hand, and filling it changes nothing about the CVs.
 */
import mongoose from 'mongoose';
import {TeacherNeed} from '@/models/TeacherNeed';
import {TeacherCandidate} from '@/models/TeacherCandidate';
import {TEACHER_CLASS_LEVELS,TEACHER_SHIFTS,TEACHER_SUBJECTS,teacherListQuery} from './vocab';
import {renderTeacherPair} from './teacher-message';
import {teacherListFilter,toRow,type CandidateRow} from './candidates';

export type Refusal={ok:false;code:string;messageKey:string;messageParams:Record<string,string|number>;messageBn:string;messageEn:string};
const refuse=(code:string,messageKey:string,messageParams:Record<string,string|number>={}):Refusal=>
  ({ok:false,code,messageKey,messageParams,...renderTeacherPair(messageKey,messageParams)});

export interface NeedRow{id:string;subject:string;classLevels:string[];shift:string;note:string;filled:boolean;createdAt:Date;matches:number}

export function needFilter(subject:string,classLevels:string[],shift:string){
  return teacherListFilter({},teacherListQuery({subject,classLevel:classLevels[0]||'',shift}));
}

/**
 * A need whose class list has more than one class cannot be expressed by the single-value list filter,
 * so the count is one $or over its classes — the same fields, the same vocabulary, one query.
 */
function needQuery(subject:string,classLevels:string[],shift:string){
  const base=needFilter(subject,[],shift) as Record<string,unknown>;
  if(classLevels.length<=1)return base;
  const or=classLevels.map(level=>({...base,classLevels:level}));
  return {$or:or};
}

export async function listNeeds(withCounts=true):Promise<NeedRow[]>{
  const docs=await TeacherNeed.find({}).sort({filled:1,createdAt:-1}).lean<Record<string,any>[]>();
  const rows=docs.map(doc=>({
    id:String(doc._id),subject:String(doc.subject||''),classLevels:[...(doc.classLevels||[])],
    shift:String(doc.shift||''),note:String(doc.note||''),filled:!!doc.filled,createdAt:new Date(doc.createdAt),matches:0,
  }));
  if(!withCounts)return rows;
  for(const row of rows){
    row.matches=await TeacherCandidate.countDocuments(needQuery(row.subject,row.classLevels,row.shift) as never);
  }
  return rows;
}

export interface NeedInput{subject?:string;classLevels?:string[];shift?:string;note?:string}
export type NeedSaveResult={ok:true;id:string}|Refusal;

export async function saveNeed(input:NeedInput,actorId:string):Promise<NeedSaveResult>{
  const subject=(TEACHER_SUBJECTS as readonly string[]).includes(String(input.subject||''))?String(input.subject):'';
  const classLevels=(input.classLevels||[]).filter(level=>(TEACHER_CLASS_LEVELS as readonly string[]).includes(level));
  const shift=(TEACHER_SHIFTS as readonly string[]).includes(String(input.shift||''))?String(input.shift):'';
  const note=String(input.note||'').trim().slice(0,300);
  if(!subject&&!classLevels.length&&!shift&&!note)return refuse('NEED_MISSING','errors.NEED_MISSING');
  const doc=await TeacherNeed.create({subject,classLevels,shift,note,filled:false,
    createdBy:mongoose.isValidObjectId(actorId)?new mongoose.Types.ObjectId(actorId):null});
  return {ok:true,id:String(doc._id)};
}

export type NeedUpdateResult={ok:true;id:string;filled:boolean}|Refusal;

export async function setNeedFilled(id:string,filled:boolean):Promise<NeedUpdateResult>{
  if(!mongoose.isValidObjectId(id))return refuse('MISSING','errors.MISSING');
  const updated=await TeacherNeed.updateOne({_id:id},{$set:{filled:!!filled}});
  if(!updated.matchedCount)return refuse('MISSING','errors.MISSING');
  return {ok:true,id,filled:!!filled};
}

export async function removeNeed(id:string):Promise<{ok:true;id:string}|Refusal>{
  if(!mongoose.isValidObjectId(id))return refuse('MISSING','errors.MISSING');
  const removed=await TeacherNeed.deleteOne({_id:id});
  if(!removed.deletedCount)return refuse('MISSING','errors.MISSING');
  return {ok:true,id};
}

/**
 * The CVs a need fits, newest first — full rows, because the screen that opens a need renders the same
 * table it renders for a hand-set filter, with the same masks, the same dial links and the same drawer.
 * A need that returned less than a row would force that screen to invent a second, thinner table, and two
 * tables of the same people is how one of them stops being true.
 */
export async function needMatches(id:string,limit=50,now:Date=new Date()):Promise<CandidateRow[]>{
  if(!mongoose.isValidObjectId(id))return [];
  const need=await TeacherNeed.findById(id).lean<Record<string,any>|null>();
  if(!need)return [];
  const docs=await TeacherCandidate.find(needQuery(String(need.subject||''),[...(need.classLevels||[])],String(need.shift||'')) as never)
    .sort({receivedDate:-1}).limit(Math.min(Math.max(limit,1),200)).lean<Record<string,any>[]>();
  return docs.map(doc=>toRow(doc,now));
}
