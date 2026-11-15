/**
 * R6 slice 1 — one student's ledger statement, pure: the chronological walk of what the centre assessed,
 * what it waived, what it held, and what arrived against which receipt — with a running outstanding that
 * ends at the same number the due list shows. The fee engine is `monthStatus` from R1, never a copy: a
 * statement whose balance disagrees with the due list is two lies in one page.
 */
import {monthStatus,dhakaCalendar,type FeeChange,type HoldPeriod,type YearMonth} from '@/lib/center/month-status';

export type LedgerPayment={
  id:string;paidOn:string;createdAt:string;amount:number;receiptNo:string;
  /** `monthly` | `admission` | `exam_fee` | `other`. */
  type:string;otherLabel:string;
  /** The fee month a monthly payment was taken against; extras carry none. */
  monthKey:string|null;note:string;
};

export type LedgerEntry={
  date:string;
  kind:'assessment'|'waiver'|'hold'|'payment'|'extra';
  monthKey:string|null;
  receiptNo:string;typeCode:string;otherLabel:string;reason:string;
  amount:number;
  /** Outstanding fee taka after this entry — the statement's running balance. */
  runningDue:number;
};

export type LedgerSummary={
  assessed:number;waived:number;paidMonthly:number;extras:number;
  outstanding:number;advance:number;
  dueMonths:{monthKey:string;due:number}[];
};

export type LedgerStatement={entries:LedgerEntry[];summary:LedgerSummary};

const monthKeyOf=(year:number,month:number)=>`${year}-${String(month).padStart(2,'0')}`;
const key=(ym:YearMonth)=>ym.year*12+ym.month;

export function ledgerStatement(input:{
  startMonth:YearMonth;feeHistory:FeeChange[];holds:HoldPeriod[];
  waivers:string[];payments:LedgerPayment[];leaveDate?:string|null;
  now?:Date;dueDay?:number;
}):LedgerStatement{
  const now=input.now||new Date();
  const today=dhakaCalendar(now);
  const waived=new Set(input.waivers);
  const heldMonths=new Set<number>();
  for(const hold of input.holds){
    const start=key(hold.start),end=hold.end?key(hold.end):key(today);
    for(let n=start;n<=end;n++)heldMonths.add(n);
  }

  /* Assessments and waivers are dated the first of their month: that is the day the month's fee became
     the student's, and it keeps the walk chronological against payments dated the day they arrived. */
  const dated:{date:string;order:number;entry:Omit<LedgerEntry,'runningDue'>}[]=[];
  const start=key(input.startMonth),endOfNow=key(today);
  const leave=input.leaveDate&&/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(input.leaveDate)
    ?key({year:Number(input.leaveDate.slice(0,4)),month:Number(input.leaveDate.slice(5,7))}):Infinity;
  const feeOf=(target:number)=>{
    const applicable=input.feeHistory
      .filter(f=>key(f.effectiveFrom)<=target)
      .sort((a,b)=>key(b.effectiveFrom)-key(a.effectiveFrom))[0];
    return applicable?applicable.amount:0;
  };
  for(let n=start;n<=Math.min(endOfNow,leave);n++){
    const month=n%12===0?12:n%12,year=Math.floor(n/12),monthKey=monthKeyOf(year,month),first=`${monthKey}-01`;
    if(heldMonths.has(n)){dated.push({date:first,order:2,entry:{date:first,kind:'hold',monthKey,receiptNo:'',typeCode:'',otherLabel:'',reason:'',amount:0}});continue}
    const fee=feeOf(n);
    if(fee>0)dated.push({date:first,order:0,entry:{date:first,kind:'assessment',monthKey,receiptNo:'',typeCode:'',otherLabel:'',reason:'',amount:fee}});
    if(waived.has(monthKey))dated.push({date:first,order:1,entry:{date:first,kind:'waiver',monthKey,receiptNo:'',typeCode:'',otherLabel:'',reason:'',amount:fee}});
  }
  for(const payment of input.payments){
    const monthly=payment.type==='monthly';
    dated.push({
      date:payment.paidOn,order:3,
      entry:{date:payment.paidOn,kind:monthly?'payment':'extra',monthKey:payment.monthKey,receiptNo:payment.receiptNo,
        typeCode:payment.type,otherLabel:payment.otherLabel,reason:payment.note,amount:payment.amount},
    });
  }
  dated.sort((a,b)=>a.date.localeCompare(b.date)||a.order-b.order);

  /* The running balance recomputes the whole book up to the entry's own month, from what the walk has
     seen so far: an advance payment for a month not yet reached waits outside the balance until that
     month's assessment joins it, and a waiver clears its month from the entry that records the waiver —
     not retroactively from the assessment four lines above, because on the day the fee was assessed the
     centre had not yet given it up. */
  const paidByMonth=new Map<string,number>();
  const waivedSoFar=new Set<string>();
  const runningDueAt=(throughMonth:number)=>{
    let due=0;
    for(let n=start;n<=Math.min(throughMonth,leave);n++){
      if(heldMonths.has(n))continue;
      const month=n%12===0?12:n%12,year=Math.floor(n/12),monthKey=monthKeyOf(year,month),fee=feeOf(n);
      if(waivedSoFar.has(monthKey))continue;
      due+=Math.max(0,fee-(paidByMonth.get(monthKey)||0));
    }
    return due;
  };
  const entries:LedgerEntry[]=[];
  for(const item of dated){
    if(item.entry.kind==='payment'&&item.entry.monthKey)
      paidByMonth.set(item.entry.monthKey,(paidByMonth.get(item.entry.monthKey)||0)+item.entry.amount);
    if(item.entry.kind==='waiver'&&item.entry.monthKey)waivedSoFar.add(item.entry.monthKey);
    const through=item.entry.monthKey
      ?Number(item.entry.monthKey.slice(0,4))*12+Number(item.entry.monthKey.slice(5,7))
      :Number(item.date.slice(0,4))*12+Number(item.date.slice(5,7));
    entries.push({...item.entry,runningDue:runningDueAt(through)});
  }

  let assessed=0,waivedTotal=0;
  for(let n=start;n<=Math.min(endOfNow,leave);n++){
    if(heldMonths.has(n))continue;
    const month=n%12===0?12:n%12,year=Math.floor(n/12),monthKey=monthKeyOf(year,month),fee=feeOf(n);
    if(waived.has(monthKey)){waivedTotal+=fee;continue}
    assessed+=fee;
  }
  const paidMonthly=input.payments.filter(p=>p.type==='monthly').reduce((sum,p)=>sum+p.amount,0);
  const extras=input.payments.filter(p=>p.type!=='monthly').reduce((sum,p)=>sum+p.amount,0);
  const dueMonths:{monthKey:string;due:number}[]=[];
  let outstanding=0,advance=0;
  for(let n=start;n<=Math.min(endOfNow,leave);n++){
    const month=n%12===0?12:n%12,year=Math.floor(n/12),monthKey=monthKeyOf(year,month);
    const result=monthStatus({month:{year,month},startMonth:input.startMonth,feeHistory:input.feeHistory,
      holds:input.holds,paid:paidByMonth.get(monthKey)||0,waived:waived.has(monthKey),
      leaveDate:input.leaveDate||null,now,dueDay:input.dueDay});
    if(result.due>0){outstanding+=result.due;dueMonths.push({monthKey,due:result.due})}
    advance+=result.overpayment+result.advance;
  }
  return {
    entries,
    summary:{assessed,waived:waivedTotal,paidMonthly,extras,outstanding,advance,dueMonths},
  };
}
