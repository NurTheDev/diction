/** Pure calculation. Payments supplied here must already be the sum of valid lines for this month. */
export type YearMonth={year:number;month:number};
export type MonthStatus='NOT_APPLICABLE'|'HELD'|'WAIVED'|'UPCOMING'|'PAID'|'PARTIAL'|'PENDING'|'DUE';
export type FeeChange={effectiveFrom:YearMonth;amount:number};
export type HoldPeriod={start:YearMonth;end?:YearMonth|null};
export type MonthResult={status:MonthStatus;fee:number;paid:number;due:number;overpayment:number;advance:number;overdue:boolean};
const valid=(ym:YearMonth)=>Number.isInteger(ym.year)&&ym.year>=1900&&ym.year<=2200&&Number.isInteger(ym.month)&&ym.month>=1&&ym.month<=12;
const key=(ym:YearMonth)=>ym.year*12+ym.month;
export function dhakaCalendar(now:Date):YearMonth&{day:number}{if(Number.isNaN(now.getTime()))throw new Error('Invalid date');const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Dhaka',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(now);const get=(type:string)=>Number(parts.find(p=>p.type===type)?.value);return {year:get('year'),month:get('month'),day:get('day')}}
export function monthStatus({month,startMonth,feeHistory,holds=[],paid=0,waived=false,leaveDate,now=new Date(),dueDay=10}:{month:YearMonth;startMonth:YearMonth;feeHistory:FeeChange[];holds?:HoldPeriod[];paid?:number;waived?:boolean;leaveDate?:string|null;now?:Date;dueDay?:number}):MonthResult{
 if(!valid(month)||!valid(startMonth)||!Number.isSafeInteger(paid)||paid<0||!Number.isInteger(dueDay)||dueDay<1||dueDay>31||feeHistory.some(f=>!valid(f.effectiveFrom)||!Number.isSafeInteger(f.amount)||f.amount<0)||holds.some(h=>!valid(h.start)||(h.end&&(!valid(h.end)||key(h.end)<key(h.start)))))throw Error('Invalid month inputs');
 const target=key(month),today=dhakaCalendar(now);if(leaveDate&&!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(leaveDate))throw Error('Invalid leave date');const leave=leaveDate?key({year:Number(leaveDate.slice(0,4)),month:Number(leaveDate.slice(5,7))}):Infinity;
 if(target<key(startMonth)||target>leave)return {status:'NOT_APPLICABLE',fee:0,paid,due:0,overpayment:0,advance:paid,overdue:false};
 const applicable=feeHistory.filter(f=>key(f.effectiveFrom)<=target).sort((a,b)=>key(b.effectiveFrom)-key(a.effectiveFrom))[0];if(!applicable)throw Error('No fee configured for applicable month');const fee=applicable.amount;
 if(holds.some(h=>key(h.start)<=target&&(!h.end||target<=key(h.end))))return {status:'HELD',fee,paid,due:0,overpayment:0,advance:paid,overdue:false};
 if(waived||fee===0)return {status:'WAIVED',fee,paid,due:0,overpayment:0,advance:paid,overdue:false};
 const due=Math.max(0,fee-paid),overpayment=Math.max(0,paid-fee),overdue=due>0&&(target<key(today)||(target===key(today)&&today.day>dueDay)),base={fee,paid,due,overpayment,advance:0,overdue};
 if(paid>=fee)return {status:'PAID',...base};if(overdue)return {status:'DUE',...base};if(paid>0)return {status:'PARTIAL',...base};
 if(target>key(today))return {status:'UPCOMING',...base};return {status:'PENDING',...base};
}
/** On-hold students' earlier dues still exist, but due-list/SMS defaults exclude them. */
export function includeInDefaultDueList(status:'active'|'on_hold'|'removed'){return status==='active'}
