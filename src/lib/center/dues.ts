import {dhakaCalendar,monthStatus,type FeeChange,type HoldPeriod,type YearMonth} from './month-status';
/** A live calculation, not a ledger snapshot. All valid payment sums and waivers must be supplied. */
export type DueInput={startMonth:YearMonth;feeHistory:FeeChange[];holds:HoldPeriod[];status:'active'|'on_hold'|'removed';payments:Record<string,number>;waivers:Set<string>};
export type DueMonth={year:number;month:number;due:number;status:string};
export const monthKey=(year:number,month:number)=>`${year}-${String(month).padStart(2,'0')}`;
/**
 * What one student owes, month by month, as of `now`.
 *
 * F-01 changed who is counted here. A paused student used to leave this function with nothing: the
 * status was read as "outside the fee run", and a second guard read a pause covering Dhaka's own month
 * the same way. So the moment a student was paused, the months they owed BEFORE the pause disappeared
 * from the class's due list and from the centre's summary — the centre paused a child and, on the same
 * write, forgave what the child already owed. Neither guard survives:
 *
 *  · a paused student is still counted, and the months before the pause are still due;
 *  · a month inside a pause is `HELD`, which carries no due and is never overdue, so the paused months
 *    themselves are billed by nobody — not while the pause is open, and not after it is lifted, because
 *    the range a lift closes keeps every month inside it unbilled for good.
 *
 * Only a student the centre has stopped running (`removed`) leaves with nothing: their months end at
 * the leave date, and what they owed up to it is a ledger's business, not a due list's.
 */
export function calculateStudentDues(s:DueInput,now=new Date(),dueDay=10):{months:DueMonth[];total:number}{
 if(s.status==='removed')return {months:[],total:0};
 /* A pause the record carries no month for. Every pause written before S1 was a flag and nothing else
    — `status:'on_hold'` with an empty `holds` — so there is no month to bill up to and no month to stop
    at. Billing such a student from enrolment would invent a debt for the very months the centre paused,
    which is the mirror image of the bug above and a demand on a family besides, so a record in that
    shape is counted for nothing until somebody gives the pause its month — the first question the hold
    door asks. A pause WITH a month is counted for every month before it, which is the whole of F-01. */
 if(s.status==='on_hold'&&!s.holds.some(hold=>Number.isInteger(hold.start?.year)&&Number.isInteger(hold.start?.month)))return {months:[],total:0};
 const today=dhakaCalendar(now),start=s.startMonth.year*12+s.startMonth.month-1,end=today.year*12+today.month-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end-start>240)throw Error('DUE_RANGE_UNSUPPORTED');
 const months:DueMonth[]=[];for(let n=start;n<=end;n++){const year=Math.floor(n/12),month=n%12+1,k=monthKey(year,month),result=monthStatus({month:{year,month},startMonth:s.startMonth,feeHistory:s.feeHistory,holds:s.holds,paid:s.payments[k]||0,waived:s.waivers.has(k),dueDay,now});if(result.overdue&&result.due>0)months.push({year,month,due:result.due,status:result.status});}
 const total=months.reduce((a,b)=>a+b.due,0);if(!Number.isSafeInteger(total))throw Error('DUE_TOTAL_UNSAFE');return {months,total};
}
