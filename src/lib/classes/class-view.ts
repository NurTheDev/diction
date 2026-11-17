/**
 * O1 · Class and batch management — the read side.
 *
 * The centre's classes were a list of names with an edit form folded into each row, and the four facts
 * an owner actually asks about a class — which shifts it runs, which room it sits in, how many children
 * are on it, how many batches are running — were either on another screen or nowhere at all. Counting
 * them meant opening the student list per class and reading a badge.
 *
 * So one pass reads the whole board: every class, its own facts, and the two counts beside them, each
 * count fetched in ONE aggregation over all the classes rather than one query per card. A screen that
 * costs a query per row is a screen that gets slower every term, and this one is read on the way to
 * everything else.
 *
 * What this module never reads: fees, payments, dues. A class card says how many children are enrolled;
 * what they owe is the cash desk's business and belongs to `lib/center/dues-query`.
 */
import mongoose from 'mongoose';
import {CenterClassGroup,CenterStudent} from '../../models/CenterRecords';
import {Batch} from '../../models/Academic';
import {User} from '../../models/User';

/** One class as its card shows it. */
export interface ClassCardView{
  id:string;
  /** Both names, because a card shows the Bangla one and an edit form has to fill in both. */
  nameBn:string;nameEn:string;
  /** The name in the language being read, falling back to Bangla — a class without an English name
      still has a name. */
  name:string;
  level:string;
  /** The class's own shift word as the routine knows it, and the shifts this screen's boxes wrote. */
  shift:string;shifts:string[];
  room:string;
  academicYear:number;
  active:boolean;
  monthlyFee:number;
  /** Children enrolled on this class right now — `active`, not held, not removed. */
  students:number;
  /** Batches assigned to this class that are still running. */
  batches:number;
  teachers:string[];
  /** The class's own `updatedAt`, which is what an edit posts back so a stale write is refused. */
  revision:string;
}

/** A batch an operator may assign to a class. */
export interface BatchOption{id:string;name:string;grade:string;classId:string}

export interface ClassBoardView{
  cards:ClassCardView[];
  batchOptions:BatchOption[];
  /** Every class the centre holds, live ones first — the cards are all of them, in that order. */
  total:number;
}

interface GroupDoc{
  _id:mongoose.Types.ObjectId;name:{bn:string;en?:string};level?:string;shift?:string;shifts?:string[];
  room?:string;academicYear:number;active?:boolean;monthlyFee?:number;teachers?:mongoose.Types.ObjectId[];
  updatedAt:Date;
}
interface CountRow{_id:mongoose.Types.ObjectId;n:number}
interface BatchDoc{_id:mongoose.Types.ObjectId;titleBn:string;titleEn:string;grade:string;
  classGroup?:mongoose.Types.ObjectId|null;active?:boolean}
interface TeacherDoc{_id:mongoose.Types.ObjectId;name:string}

const localName=(name:{bn:string;en?:string},language:string):string=>
  (language==='en'?name.en||name.bn:name.bn)||name.bn;

/**
 * The class board, in one read.
 *
 * Live classes come first and in the order the centre reads them — session, then name — because an
 * archived class is a fact about last year rather than a card to work from. Both counts are grouped in
 * the database and matched by id here, so a centre with forty classes costs four queries rather than
 * eighty-one.
 */
export async function classBoard(language:string):Promise<ClassBoardView>{
  const groups=await CenterClassGroup.find()
    .select('name level shift shifts room academicYear active monthlyFee teachers updatedAt')
    .sort({active:-1,academicYear:-1,'name.bn':1,_id:1}).limit(400).lean<GroupDoc[]>();
  const ids=groups.map(group=>group._id);
  const [studentRows,batchRows,batches,teacherRows]=await Promise.all([
    CenterStudent.aggregate([
      {$match:{classGroup:{$in:ids},status:'active',deletedAt:null}},
      {$group:{_id:'$classGroup',n:{$sum:1}}},
    ]) as Promise<CountRow[]>,
    Batch.aggregate([
      {$match:{classGroup:{$in:ids},active:true,deletedAt:null}},
      {$group:{_id:'$classGroup',n:{$sum:1}}},
    ]) as Promise<CountRow[]>,
    /* Every running batch, so one card can be given the batches that belong to it without a second
       screen. A batch with no class is offered too: assigning it is the whole point of the box. */
    Batch.find({active:true}).select('titleBn titleEn grade classGroup')
      .sort({titleBn:1,_id:1}).limit(300).lean<BatchDoc[]>(),
    User.find({role:'teacher',active:true}).select('name').sort({name:1,_id:1}).limit(300).lean<TeacherDoc[]>(),
  ]);
  const studentCount=new Map(studentRows.map(row=>[String(row._id),row.n]));
  const batchCount=new Map(batchRows.map(row=>[String(row._id),row.n]));
  const teacherName=new Map(teacherRows.map(row=>[String(row._id),row.name]));
  const cards:ClassCardView[]=groups.map(group=>{
    const id=String(group._id);
    return {
      id,nameBn:group.name.bn,nameEn:group.name.en||'',name:localName(group.name,language),
      level:String(group.level||''),shift:String(group.shift||''),
      shifts:(group.shifts||[]).map(value=>String(value)).filter(Boolean),
      room:String(group.room||''),academicYear:Number(group.academicYear)||0,
      active:group.active!==false,monthlyFee:Number(group.monthlyFee)||0,
      students:studentCount.get(id)??0,batches:batchCount.get(id)??0,
      teachers:(group.teachers||[]).map(value=>teacherName.get(String(value))||'').filter(Boolean),
      revision:group.updatedAt instanceof Date?group.updatedAt.toISOString():'',
    };
  });
  const batchOptions:BatchOption[]=batches.map(batch=>({
    id:String(batch._id),
    name:(language==='en'?batch.titleEn||batch.titleBn:batch.titleBn)||batch.titleBn,
    grade:String(batch.grade||''),classId:batch.classGroup?String(batch.classGroup):'',
  }));
  return {cards,batchOptions,total:cards.length};
}

/** The shift keys this screen's own checkboxes write. A word already on the class is left as it is. */
export const CLASS_SHIFT_KEYS=['morning','day','evening'] as const;
export type ClassShiftKey=typeof CLASS_SHIFT_KEYS[number];

/** True when a stored shift is one of the three keys, so the card may translate it. */
export function isShiftKey(value:string):value is ClassShiftKey{
  return (CLASS_SHIFT_KEYS as readonly string[]).includes(String(value||'').trim().toLowerCase());
}

/**
 * What a class's card says its shifts are.
 *
 * A class written before this screen holds one free word in `shift` — the owner's own, sometimes in
 * Bangla — and that word is shown exactly as it stands. A class written here holds keys, and each key
 * is shown through the catalog in the language being read. Both arrive in one list, so a card never
 * says "no shift" about a class that has one.
 */
export function shiftWordsOf(card:{shifts:string[];shift:string}):string[]{
  const keys=card.shifts.map(value=>String(value).trim()).filter(Boolean);
  if(keys.length)return [...new Set(keys)];
  const word=String(card.shift||'').trim();
  return word?[word]:[];
}
