/**
 * R6 slice 1 — the joins every report loader shares: payment rows are stored as ids, and a report a
 * person reads carries names. One bulk fetch per collection, never one per row.
 */
import 'server-only';
import {CenterClassGroup,CenterPayment,CenterStudent} from '@/models/CenterRecords';
import {User} from '@/models/User';
import type {PaymentRow} from './collections';

export type LeanPayment={
  _id:unknown;student:unknown;classGroupAtPayment:unknown;type:string;otherLabel?:string;
  academicYear:number;month?:number|null;amount:number;discount?:number;receiptNo?:string;paidOn?:string;
  receivedBy?:unknown;note?:string;createdAt:Date;
};

export function classLabelOf(name:{bn:string;en?:string}|undefined,shift:string|undefined,locale:string):string{
  const base=name?(locale==='en'&&name.en?name.en:name.bn):'';
  return shift?`${base} ${shift}`.trim():base;
}

export async function joinPaymentRows(payments:LeanPayment[],locale:string):Promise<PaymentRow[]>{
  const studentIds=[...new Set(payments.map(p=>String(p.student)))];
  const classIds=[...new Set(payments.map(p=>String(p.classGroupAtPayment)))];
  const userIds=[...new Set(payments.map(p=>(p.receivedBy?String(p.receivedBy):'')))].filter(Boolean);
  const [students,groups,users]=await Promise.all([
    CenterStudent.find({_id:{$in:studentIds}}).select('studentId name').lean<{_id:unknown;studentId:string;name:{bn:string;en?:string}}[]>(),
    CenterClassGroup.find({_id:{$in:classIds}}).select('name shift').lean<{_id:unknown;name:{bn:string;en?:string};shift?:string}[]>(),
    userIds.length?User.find({_id:{$in:userIds}}).select('name').lean<{_id:unknown;name:string}[]>():Promise.resolve([] as {_id:unknown;name:string}[]),
  ]);
  const studentById=new Map(students.map(s=>[String(s._id),s]));
  const groupById=new Map(groups.map(g=>[String(g._id),g]));
  const userById=new Map(users.map(u=>[String(u._id),u]));
  return payments.map(p=>{
    const student=studentById.get(String(p.student));
    const group=groupById.get(String(p.classGroupAtPayment));
    const operator=p.receivedBy?userById.get(String(p.receivedBy)):undefined;
    return {
      id:String(p._id),
      studentId:student?student.studentId:'',
      studentName:student?(locale==='en'&&student.name.en?student.name.en:student.name.bn):'',
      classLabel:classLabelOf(group?.name,group?.shift,locale),
      type:p.type,
      otherLabel:p.otherLabel||'',
      monthKey:p.type==='monthly'&&p.month?`${p.academicYear}-${String(p.month).padStart(2,'0')}`:null,
      /* Group 3: a collection report counts what came in, so a line's discount comes off it. The
         student's own ledger keeps the fee whole — that is the record of what the month cost. */
      amount:p.amount-(p.discount||0),
      receiptNo:p.receiptNo||'',
      paidOn:p.paidOn||'',
      operatorId:p.receivedBy?String(p.receivedBy):'',
      operatorName:operator?.name||'',
      note:p.note||'',
    };
  }).sort((a,b)=>a.paidOn.localeCompare(b.paidOn)||a.id.localeCompare(b.id));
}

export const dayRange=(year:number,month:number)=>{
  const from=`${year}-${String(month).padStart(2,'0')}-01`;
  const last=new Date(Date.UTC(year,month,0)).getUTCDate();
  return {from,to:`${year}-${String(month).padStart(2,'0')}-${String(last).padStart(2,'0')}`};
};

export async function paymentsOn(date:string):Promise<LeanPayment[]>{
  return CenterPayment.find({paidOn:date,status:'valid'})
    .sort({createdAt:1,_id:1})
    .lean<LeanPayment[]>();
}

export async function paymentsBetween(from:string,to:string):Promise<LeanPayment[]>{
  return CenterPayment.find({status:'valid',paidOn:{$gte:from,$lte:to}})
    .sort({createdAt:1,_id:1})
    .lean<LeanPayment[]>();
}
