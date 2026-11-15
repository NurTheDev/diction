/**
 * R6 slice 1 — the collection reports' mathematics, pure: given payment rows, a day breaks down by the
 * operator who took the money and a month lands in a class-by-day matrix. The database loaders live in
 * `collections-data.ts`; nothing here knows mongoose, so the math suite runs without a database.
 */
export type PaymentRow={
  id:string;studentId:string;studentName:string;classLabel:string;
  /** `monthly` | `admission` | `exam_fee` | `other` — the stored code; the screen reads a word. */
  type:string;otherLabel:string;monthKey:string|null;amount:number;receiptNo:string;
  paidOn:string;operatorId:string;operatorName:string;note:string;
};

export type DailyBreakdown={
  rows:PaymentRow[];
  operators:{id:string;name:string;count:number;total:number}[];
  count:number;total:number;
};

/** The operator filter narrows the row list *and* the per-operator totals, so the two always agree. */
export function dailyBreakdown(rows:PaymentRow[],operatorId:string|null):DailyBreakdown{
  const list=operatorId?rows.filter(row=>row.operatorId===operatorId):rows;
  const byOperator=new Map<string,{id:string;name:string;count:number;total:number}>();
  for(const row of list){
    const entry=byOperator.get(row.operatorId)||{id:row.operatorId,name:row.operatorName,count:0,total:0};
    entry.count+=1;entry.total+=row.amount;
    byOperator.set(row.operatorId,entry);
  }
  return {
    rows:list,
    operators:[...byOperator.values()].sort((a,b)=>a.name.localeCompare(b.name,'bn')),
    count:list.length,
    total:list.reduce((sum,row)=>sum+row.amount,0),
  };
}

/** Who took money that day — the filter's options, from the unfiltered rows, so narrowing never hides
    the way back to everybody. */
export function operatorOptions(rows:PaymentRow[]):{id:string;name:string}[]{
  return [...new Map(rows.map(row=>[row.operatorId,{id:row.operatorId,name:row.operatorName}])).values()]
    .filter(option=>option.id)
    .sort((a,b)=>a.name.localeCompare(b.name,'bn'));
}

export type MonthlyMatrix={
  year:number;month:number;daysInMonth:number;
  classLabels:string[];
  /** cells[classIndex][day-1] — the taka taken from that class on that day. */
  cells:number[][];
  dayTotals:number[];classTotals:number[];grand:number;
  typeTotals:{type:string;total:number}[];
};

const daysIn=(year:number,month:number)=>new Date(Date.UTC(year,month,0)).getUTCDate();

/**
 * Grouped by class group *and* by day of the month at once: rows are classes, columns are days, and the
 * row totals, column totals and grand total are three sums of the same cells — a matrix whose margins
 * disagree with each other is a matrix that miscounted.
 */
export function monthlyMatrix(rows:PaymentRow[],year:number,month:number):MonthlyMatrix{
  const prefix=`${year}-${String(month).padStart(2,'0')}`;
  const size=daysIn(year,month);
  const inMonth=rows.filter(row=>row.paidOn.startsWith(prefix));
  const classLabels=[...new Set(inMonth.map(row=>row.classLabel))].sort((a,b)=>a.localeCompare(b,'bn'));
  const cells=classLabels.map(()=>new Array<number>(size).fill(0));
  const dayTotals=new Array<number>(size).fill(0);
  const typeSums=new Map<string,number>();
  for(const row of inMonth){
    const day=Number(row.paidOn.slice(8,10));
    if(!Number.isInteger(day)||day<1||day>size)continue;
    const classIndex=classLabels.indexOf(row.classLabel);
    cells[classIndex][day-1]+=row.amount;
    dayTotals[day-1]+=row.amount;
    typeSums.set(row.type,(typeSums.get(row.type)||0)+row.amount);
  }
  const classTotals=cells.map(row=>row.reduce((sum,cell)=>sum+cell,0));
  return {
    year,month,daysInMonth:size,classLabels,cells,dayTotals,classTotals,
    grand:dayTotals.reduce((sum,cell)=>sum+cell,0),
    typeTotals:[...typeSums.entries()].map(([type,total])=>({type,total})).sort((a,b)=>a.type.localeCompare(b.type)),
  };
}
