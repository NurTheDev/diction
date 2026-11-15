/**
 * R6 slice 1 — the cashbook check's database half: every valid payment that carries a receipt number,
 * in the order the book was written, with the student's name beside it so a flagged row is a row a
 * person can recognise.
 */
import 'server-only';
import {CenterPayment,CenterStudent} from '@/models/CenterRecords';
import {auditReceipts,type ReceiptAudit,type ReceiptRow} from './receipt-audit';

export async function loadReceiptAudit():Promise<ReceiptAudit>{
  const payments=await CenterPayment.find({status:'valid',receiptNo:{$ne:''}})
    .select('receiptNo paidOn student amount createdAt')
    .sort({paidOn:1,createdAt:1,_id:1})
    .lean<{_id:unknown;receiptNo:string;paidOn:string;createdAt:Date;student:unknown;amount:number}[]>();
  const ids=[...new Set(payments.map(p=>String(p.student)))];
  const students=await CenterStudent.find({_id:{$in:ids}}).select('studentId name').lean<{_id:unknown;studentId:string;name:{bn:string;en?:string}}[]>();
  const nameById=new Map(students.map(s=>[String(s._id),s.name.bn]));
  const rows:ReceiptRow[]=payments.map(p=>({
    id:String(p._id),
    receiptNo:p.receiptNo,
    paidOn:p.paidOn||'',
    createdAt:String(p.createdAt||''),
    studentId:String(p.student),
    studentName:nameById.get(String(p.student))||'',
    amount:p.amount,
  }));
  return auditReceipts(rows);
}
