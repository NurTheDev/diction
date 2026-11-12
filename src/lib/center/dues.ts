import {dhakaCalendar,monthStatus,type FeeChange,type HoldPeriod,type YearMonth} from './month-status';
/** A live calculation, not a ledger snapshot. All valid payment sums and waivers must be supplied. */
export type DueInput={startMonth:YearMonth;feeHistory:FeeChange[];holds:HoldPeriod[];status:'active'|'on_hold'|'removed';payments:Record<string,number>;waivers:Set<string>};
export type DueMonth={year:number;month:number;due:number;status:string};
export const monthKey=(year:number,month:number)=>`${year}-${String(month).padStart(2,'0')}`;
export function calculateStudentDues(s:DueInput,now=new Date(),dueDay=10):{months:DueMonth[];total:number}{
 if(s.status!=='active')return {months:[],total:0};
 const today=dhakaCalendar(now),start=s.startMonth.year*12+s.startMonth.month-1,end=today.year*12+today.month-1;
 if(s.holds.some(h=>h.start.year*12+h.start.month-1<=end&&(!h.end||end<=h.end.year*12+h.end.month-1)))return {months:[],total:0};
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end-start>240)throw Error('DUE_RANGE_UNSUPPORTED');
 const months:DueMonth[]=[];for(let n=start;n<=end;n++){const year=Math.floor(n/12),month=n%12+1,k=monthKey(year,month),result=monthStatus({month:{year,month},startMonth:s.startMonth,feeHistory:s.feeHistory,holds:s.holds,paid:s.payments[k]||0,waived:s.waivers.has(k),dueDay,now});if(result.overdue&&result.due>0)months.push({year,month,due:result.due,status:result.status});}
 const total=months.reduce((a,b)=>a+b.due,0);if(!Number.isSafeInteger(total))throw Error('DUE_TOTAL_UNSAFE');return {months,total};
}
