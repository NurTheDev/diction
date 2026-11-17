import mongoose from 'mongoose';
import {CenterClassGroup,CenterStudent,CenterPayment,CenterFeeWaiver,CenterSettings} from '@/models/CenterRecords';
import {calculateStudentDues,monthKey,type DueInput,type DueMonth} from './dues';
type Student={_id:mongoose.Types.ObjectId;name:{bn:string;en:string};studentId:string;guardianPhone:string;startMonth:DueInput['startMonth'];feeHistory:DueInput['feeHistory'];holds:DueInput['holds'];status:'active'};
type Pay={_id:{student:mongoose.Types.ObjectId;year:number;month:number};amount:number};
type Waiver={student:mongoose.Types.ObjectId;year:number;month:number};
export type DueRow={student:Student;months:DueMonth[];total:number};
/** Fail closed on bounds or invalid records instead of returning misleading partial totals. */
export async function liveClassDues(classId:string,now=new Date(),session?:mongoose.ClientSession):Promise<{rows:DueRow[];total:number;asOf:Date}>{if(!mongoose.isValidObjectId(classId))throw Error('INVALID_CLASS');const id=new mongoose.Types.ObjectId(classId);const students=await CenterStudent.find({classGroup:id,status:'active'}).select('name studentId guardianPhone startMonth feeHistory holds status').sort({'name.bn':1,_id:1}).limit(1001).session(session||null).lean<Student[]>();const settings=await CenterSettings.findOne({key:'main'}).select('dueDay').session(session||null).lean<{dueDay:number}>();if(students.length>1000)throw Error('TOO_MANY_STUDENTS');const ids=students.map(s=>s._id);const payments=await CenterPayment.aggregate<Pay>([{$match:{student:{$in:ids},type:'monthly',status:'valid'}},{$group:{_id:{student:'$student',year:'$academicYear',month:'$month'},amount:{$sum:'$amount'}}}]).session(session||null);const waivers=await CenterFeeWaiver.find({student:{$in:ids},status:{$ne:'void'}}).select('student year month').session(session||null).lean<Waiver[]>();const paid=new Map<string,Record<string,number>>(),waived=new Map<string,Set<string>>();for(const p of payments){const key=String(p._id.student),map=paid.get(key)||{};map[monthKey(p._id.year,p._id.month)]=p.amount;paid.set(key,map)}for(const w of waivers){const key=String(w.student),set=waived.get(key)||new Set<string>();set.add(monthKey(w.year,w.month));waived.set(key,set)}const rows=students.map(student=>({student,...calculateStudentDues({...student,payments:paid.get(String(student._id))||{},waivers:waived.get(String(student._id))||new Set()},now,settings?.dueDay??10)})).filter(x=>x.total>0);const total=rows.reduce((s,r)=>s+r.total,0);if(!Number.isSafeInteger(total))throw Error('DUE_TOTAL_UNSAFE');return {rows,total,asOf:now}}

/** One line per class on the All-Class Due Summary: who is on the roll, who owes, and what they owe. */
export type ClassDueSummaryRow={
  classId:string;name:{bn:string;en?:string};shift:string;academicYear:number;
  active:number;owing:number;total:number;
  /** The fee this class runs at: the class's own amount when it has one, otherwise the amount most of
      its students are on — a class with no fee anywhere reads 0 and the screen says it does not know. */
  monthlyFee:number;
  /** True when at least one student could not be read by the dues engine, so the total is short, not wrong. */
  partial:boolean;
};

/**
 * Every active class, owed and owing, in one pass (group 3 · the Dues screen's summary).
 *
 * The per-class `liveClassDues` above is the right read for one class, and the summary is the same
 * arithmetic over all of them: asking it once per class would be three queries per class on a page
 * whose whole job is to be opened. So the roll, the payments and the waivers are each read once for
 * the whole centre, and every student is run through the same `calculateStudentDues` the single-class
 * read runs — one engine, one answer, whichever screen asks.
 *
 * A student the engine cannot read (a start month too far back, a fee history it cannot bound) costs
 * their class the `partial` flag rather than a total that quietly omits them: the number on screen is
 * what could be counted, and the row says so.
 */
export async function liveClassDueSummary(now=new Date(),session?:mongoose.ClientSession):Promise<{rows:ClassDueSummaryRow[];total:number;asOf:Date}>{
  type Group={_id:mongoose.Types.ObjectId;name:{bn:string;en?:string};academicYear:number;shift?:string;monthlyFee?:number};
  type Roll={_id:mongoose.Types.ObjectId;classGroup:mongoose.Types.ObjectId;startMonth:DueInput['startMonth'];
    feeHistory:DueInput['feeHistory'];holds:DueInput['holds'];status:'active'};
  const groups=await CenterClassGroup.find({active:true}).select('name academicYear shift monthlyFee order')
    .sort({academicYear:-1,order:1,'name.bn':1,_id:1}).limit(200).session(session||null).lean<Group[]>();
  if(!groups.length)return {rows:[],total:0,asOf:now};
  const ids=groups.map(group=>group._id);
  const students=await CenterStudent.find({classGroup:{$in:ids},status:'active'})
    .select('classGroup startMonth feeHistory holds status')
    .sort({classGroup:1,'name.bn':1,_id:1}).limit(5001).session(session||null).lean<Roll[]>();
  if(students.length>5000)throw Error('TOO_MANY_STUDENTS');
  const settings=await CenterSettings.findOne({key:'main'}).select('dueDay').session(session||null).lean<{dueDay?:number}>();
  const dueDay=settings?.dueDay??10;
  const studentIds=students.map(student=>student._id);
  const payments=studentIds.length?await CenterPayment.aggregate<Pay>([
    {$match:{student:{$in:studentIds},type:'monthly',status:'valid'}},
    {$group:{_id:{student:'$student',year:'$academicYear',month:'$month'},amount:{$sum:'$amount'}}},
  ]).session(session||null):[];
  const waivers=studentIds.length?await CenterFeeWaiver.find({student:{$in:studentIds},status:{$ne:'void'}})
    .select('student year month').session(session||null).lean<Waiver[]>():[];
  const paid=new Map<string,Record<string,number>>(),waived=new Map<string,Set<string>>();
  for(const payment of payments){const key=String(payment._id.student),map=paid.get(key)||{};map[monthKey(payment._id.year,payment._id.month)]=payment.amount;paid.set(key,map)}
  for(const waiver of waivers){const key=String(waiver.student),set=waived.get(key)||new Set<string>();set.add(monthKey(waiver.year,waiver.month));waived.set(key,set)}
  type Bucket={active:number;owing:number;total:number;partial:boolean;fees:Map<number,number>};
  const buckets=new Map<string,Bucket>();
  for(const group of groups)buckets.set(String(group._id),{active:0,owing:0,total:0,partial:false,fees:new Map()});
  for(const student of students){
    const bucket=buckets.get(String(student.classGroup));
    if(!bucket)continue;
    bucket.active+=1;
    const current=student.feeHistory.length?student.feeHistory[student.feeHistory.length-1].amount:0;
    if(current>0)bucket.fees.set(current,(bucket.fees.get(current)||0)+1);
    try{
      const {total}=calculateStudentDues({...student,payments:paid.get(String(student._id))||{},waivers:waived.get(String(student._id))||new Set()},now,dueDay);
      if(total>0){bucket.owing+=1;bucket.total+=total}
    }catch{bucket.partial=true}
  }
  const rows=groups.map(group=>{
    const bucket=buckets.get(String(group._id))!;
    /* The fee the class runs at: its own amount first, and otherwise the amount most of its students
       are on — the number a phone call about this class would quote. */
    let monthlyFee=Number(group.monthlyFee)||0,counted=0;
    for(const [amount,count] of bucket.fees)if(count>counted||(!monthlyFee&&count===counted)){monthlyFee=amount;counted=count}
    if(!Number.isSafeInteger(bucket.total))throw Error('DUE_TOTAL_UNSAFE');
    return {classId:String(group._id),name:group.name,shift:group.shift||'',academicYear:group.academicYear,
      active:bucket.active,owing:bucket.owing,total:bucket.total,monthlyFee,partial:bucket.partial};
  });
  const total=rows.reduce((sum,row)=>sum+row.total,0);
  if(!Number.isSafeInteger(total))throw Error('DUE_TOTAL_UNSAFE');
  return {rows,total,asOf:now};
}
