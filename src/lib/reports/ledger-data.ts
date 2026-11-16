/**
 * R6 slice 1 — one student's statement, assembled: the stored facts (fee history, holds, waivers,
 * payments, leave date) go into the pure walk in `ledger.ts`, and the class label and readable id come
 * back out beside it. A removed student's statement still renders — the ledger outlives the seat.
 */
import 'server-only';
import {CenterClassGroup,CenterFeeWaiver,CenterPayment,CenterSettings,CenterStudent} from '@/models/CenterRecords';
import {ledgerStatement,type LedgerStatement} from './ledger';
import {classLabelOf} from './report-rows';

export type StatementStudent={
  id:string;studentId:string;name:string;roll:string;classLabel:string;
  status:'active'|'on_hold'|'removed';
};
export type StudentStatementView={student:StatementStudent;statement:LedgerStatement;waiverReasons:Record<string,string>};

export async function loadStudentStatement(studentId:string,locale:string,now=new Date()):Promise<StudentStatementView|null>{
  const student=await CenterStudent.findById(studentId)
    .select('studentId name roll classGroup status startMonth feeHistory holds removal')
    .lean<{_id:unknown;studentId:string;name:{bn:string;en?:string};roll:string;classGroup:unknown;
      status:'active'|'on_hold'|'removed';startMonth:{year:number;month:number};
      feeHistory:{effectiveFrom:{year:number;month:number};amount:number}[];
      holds:{start:{year:number;month:number};end?:{year:number;month:number}|null}[];
      removal?:{leaveDate?:string}|null}|null>();
  if(!student)return null;
  const [group,payments,waivers,settings]=await Promise.all([
    CenterClassGroup.findById(student.classGroup).select('name shift').lean<{name:{bn:string;en?:string};shift?:string}|null>(),
    CenterPayment.find({student:studentId,status:'valid'})
      .select('type academicYear month amount receiptNo paidOn otherLabel note createdAt')
      .sort({paidOn:1,createdAt:1,_id:1})
      .lean<{_id:unknown;type:string;academicYear:number;month?:number|null;amount:number;receiptNo?:string;paidOn?:string;otherLabel?:string;note?:string;createdAt:Date}[]>(),
    CenterFeeWaiver.find({student:studentId,status:'valid'}).select('year month reason').lean<{year:number;month:number;reason:string}[]>(),
    CenterSettings.findOne({key:'main'}).select('dueDay').lean<{dueDay:number}|null>(),
  ]);
  const statement=ledgerStatement({
    startMonth:student.startMonth,
    feeHistory:student.feeHistory,
    holds:(student.holds||[]).map(h=>({start:h.start,end:h.end||null})),
    waivers:waivers.map(w=>`${w.year}-${String(w.month).padStart(2,'0')}`),
    payments:payments.map(p=>({
      id:String(p._id),
      paidOn:p.paidOn||'',
      createdAt:String(p.createdAt||''),
      amount:p.amount,
      receiptNo:p.receiptNo||'',
      type:p.type,
      otherLabel:p.otherLabel||'',
      monthKey:p.type==='monthly'&&p.month?`${p.academicYear}-${String(p.month).padStart(2,'0')}`:null,
      note:p.note||'',
    })),
    leaveDate:student.removal?.leaveDate||null,
    now,
    dueDay:settings?.dueDay??10,
  });
  const waiverReasons:Record<string,string>={};
  for(const waiver of waivers)waiverReasons[`${waiver.year}-${String(waiver.month).padStart(2,'0')}`]=waiver.reason;
  return {
    waiverReasons,
    student:{
      id:String(student._id),
      studentId:student.studentId,
      name:locale==='en'&&student.name.en?student.name.en:student.name.bn,
      roll:student.roll,
      classLabel:classLabelOf(group?.name,group?.shift,locale),
      status:student.status,
    },
    statement,
  };
}
