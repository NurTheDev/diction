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
import {CLASS_SHIFT_KEYS,feeStateOf,feeUnset,isShiftKey,shiftKeyOfWord,shiftWordsOf,
  type BatchOption,type ClassBoardView,type ClassCardView,type ClassFeeState,type ClassShiftKey,
  type TeacherOption} from './class-shared';

/* The words and shapes this board is built from live in `class-shared.ts`, which holds no database and
   may therefore be imported by the screen that paints it. They are handed on here so a server caller
   has one module to read from — and so nothing on the client ever has a reason to reach into this one,
   where a Mongoose model is registered at import and has nothing to register against in a browser. */
export {CLASS_SHIFT_KEYS,isShiftKey,shiftWordsOf,feeStateOf,feeUnset,shiftKeyOfWord};
export type {BatchOption,ClassBoardView,ClassCardView,ClassFeeState,ClassShiftKey,TeacherOption};

interface GroupDoc{
  _id:mongoose.Types.ObjectId;name:{bn:string;en?:string};level?:string;shift?:string;shifts?:string[];
  room?:string;academicYear:number;active?:boolean;monthlyFee?:number;feeFree?:boolean;teachers?:mongoose.Types.ObjectId[];
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
    .select('name level shift shifts room academicYear active monthlyFee feeFree teachers updatedAt')
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
      active:group.active!==false,monthlyFee:Number(group.monthlyFee)||0,feeFree:group.feeFree===true,
      students:studentCount.get(id)??0,batches:batchCount.get(id)??0,
      teachers:(group.teachers||[]).map(value=>teacherName.get(String(value))||'').filter(Boolean),
      /* F-04 · the teachers the boxes have to open with, already ticked: names are what a card reads
         and ids are what a write posts back, and a form that guesses one from the other assigns the
         wrong teacher the moment two of them share a name. */
      teacherIds:(group.teachers||[]).map(value=>String(value)),
      revision:group.updatedAt instanceof Date?group.updatedAt.toISOString():'',
    };
  });
  const batchOptions:BatchOption[]=batches.map(batch=>({
    id:String(batch._id),
    name:(language==='en'?batch.titleEn||batch.titleBn:batch.titleBn)||batch.titleBn,
    grade:String(batch.grade||''),classId:batch.classGroup?String(batch.classGroup):'',
  }));
  /* The teachers a class may be given, read in the same pass as the names already on the cards. */
  const teacherOptions:TeacherOption[]=teacherRows.map(row=>({id:String(row._id),name:row.name}));
  return {cards,batchOptions,teacherOptions,total:cards.length};
}
