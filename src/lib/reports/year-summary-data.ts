/**
 * R6 slice 1 — the year summary's database half: every student who held a seat in the year, their fee
 * engine inputs, and the year's money bucketed the way the fee engine buckets it — monthly taka per fee
 * month, everything else per the day it arrived.
 */
import 'server-only';
import {CenterClassGroup,CenterFeeWaiver,CenterPayment,CenterStudent} from '@/models/CenterRecords';
import {yearSummary,type YearSummary} from './year-summary';
import {classLabelOf} from './report-rows';

export async function loadYearSummary(year:number,locale:string,now=new Date()):Promise<YearSummary>{
  const [students,groups,payments,waivers]=await Promise.all([
    CenterStudent.find({})
      .select('classGroup startMonth feeHistory holds removal')
      .lean<{_id:unknown;classGroup:unknown;startMonth:{year:number;month:number};
        feeHistory:{effectiveFrom:{year:number;month:number};amount:number}[];
        holds:{start:{year:number;month:number};end?:{year:number;month:number}|null}[];
        removal?:{leaveDate?:string}|null}[]>(),
    CenterClassGroup.find({}).select('name shift').lean<{_id:unknown;name:{bn:string;en?:string};shift?:string}[]>(),
    CenterPayment.find({status:'valid'})
      .select('student type academicYear month amount paidOn')
      .lean<{_id:unknown;student:unknown;type:string;academicYear:number;month?:number|null;amount:number;paidOn?:string}[]>(),
    CenterFeeWaiver.find({status:'valid',year}).select('student month').lean<{_id:unknown;student:unknown;month:number}[]>(),
  ]);
  const groupById=new Map(groups.map(g=>[String(g._id),g]));
  const paymentsByStudent=new Map<string,{months:Record<string,number>;extras:number}>();
  for(const payment of payments){
    const bucket=paymentsByStudent.get(String(payment.student))||{months:{},extras:0};
    if(payment.type==='monthly'&&payment.month){
      const monthKey=`${payment.academicYear}-${String(payment.month).padStart(2,'0')}`;
      bucket.months[monthKey]=(bucket.months[monthKey]||0)+payment.amount;
    }else if((payment.paidOn||'').startsWith(`${year}-`)){
      bucket.extras+=payment.amount;
    }
    paymentsByStudent.set(String(payment.student),bucket);
  }
  const waiversByStudent=new Map<string,string[]>();
  for(const waiver of waivers){
    const list=waiversByStudent.get(String(waiver.student))||[];
    list.push(`${year}-${String(waiver.month).padStart(2,'0')}`);
    waiversByStudent.set(String(waiver.student),list);
  }
  return yearSummary(students.map(student=>{
    const group=groupById.get(String(student.classGroup));
    return {
      classLabel:classLabelOf(group?.name,group?.shift,locale),
      startMonth:student.startMonth,
      feeHistory:student.feeHistory,
      holds:(student.holds||[]).map(h=>({start:h.start,end:h.end||null})),
      waivers:waiversByStudent.get(String(student._id))||[],
      paymentsByMonth:paymentsByStudent.get(String(student._id))?.months||{},
      extraPaid:paymentsByStudent.get(String(student._id))?.extras||0,
      leaveDate:student.removal?.leaveDate||null,
    };
  }),year,now);
}
