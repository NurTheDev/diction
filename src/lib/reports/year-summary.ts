/**
 * R6 slice 1 — the executive year summary, pure: one row per class group with what the year expected,
 * what actually arrived, what is still owed, what is waiting for its due day, and what the centre gave
 * up — every column a sum of `monthStatus` results, the same engine the due list and the statement
 * read, so the three screens can never disagree about a taka.
 */
import {monthStatus,dhakaCalendar,type FeeChange,type HoldPeriod,type YearMonth} from '@/lib/center/month-status';

export type YearStudentInput={
  classLabel:string;
  startMonth:YearMonth;feeHistory:FeeChange[];holds:HoldPeriod[];
  waivers:string[];
  /** Monthly taka taken per fee month (`YYYY-MM`), however early or late it arrived. */
  paymentsByMonth:Record<string,number>;
  /** Admission, exam-fee and other collections inside the year: real money, not fee months. */
  extraPaid:number;
  leaveDate?:string|null;
};

export type YearClassRow={
  classLabel:string;students:number;
  expected:number;collected:number;outstanding:number;pending:number;waived:number;extras:number;
};
export type YearSummary={classes:YearClassRow[];totals:Omit<YearClassRow,'classLabel'>};

const monthKeyOf=(year:number,month:number)=>`${year}-${String(month).padStart(2,'0')}`;

export function yearSummary(students:YearStudentInput[],year:number,now=new Date(),dueDay=10):YearSummary{
  const today=dhakaCalendar(now);
  const rows=new Map<string,YearClassRow>();
  const totals={students:0,expected:0,collected:0,outstanding:0,pending:0,waived:0,extras:0};
  for(const student of students){
    const row=rows.get(student.classLabel)||{classLabel:student.classLabel,students:0,expected:0,collected:0,outstanding:0,pending:0,waived:0,extras:0};
    row.students+=1;
    const waived=new Set(student.waivers);
    for(let month=1;month<=12;month++){
      /* The year's future months are UPCOMING by definition: they are not expected yet, and money taken
         against them is an advance that still counts as collected, because it is in the bank. */
      if(year>today.year||(year===today.year&&month>today.month))continue;
      const monthKey=monthKeyOf(year,month);
      const result=monthStatus({month:{year,month},startMonth:student.startMonth,feeHistory:student.feeHistory,
        holds:student.holds,paid:student.paymentsByMonth[monthKey]||0,waived:waived.has(monthKey),
        leaveDate:student.leaveDate||null,now,dueDay});
      if(result.status==='NOT_APPLICABLE'||result.status==='HELD')continue;
      row.expected+=result.fee;
      if(result.status==='WAIVED')row.waived+=result.fee;
      row.outstanding+=result.due;
      if(result.status==='PENDING')row.pending+=result.due;
    }
    /* Collected is every monthly taka the year's buckets hold — including advances for months not yet
       reached — plus the non-fee collections taken inside the year. */
    for(let month=1;month<=12;month++)row.collected+=student.paymentsByMonth[monthKeyOf(year,month)]||0;
    row.extras+=student.extraPaid;
    row.collected+=student.extraPaid;
    rows.set(student.classLabel,row);
  }
  const classes=[...rows.values()].sort((a,b)=>a.classLabel.localeCompare(b.classLabel,'bn'));
  for(const row of classes){
    totals.students+=row.students;totals.expected+=row.expected;totals.collected+=row.collected;
    totals.outstanding+=row.outstanding;totals.pending+=row.pending;totals.waived+=row.waived;totals.extras+=row.extras;
  }
  return {classes,totals};
}
