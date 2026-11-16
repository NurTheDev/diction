/**
 * R6 slice 1 — the collection reports' database half: fetch the day's or the month's valid payments,
 * join the names, and hand the pure mathematics in `collections.ts` rows it can trust. `server-only`
 * because mongoose is; the math it feeds is not, and the math suite proves that split.
 */
import 'server-only';
import {dailyBreakdown,monthlyMatrix,operatorOptions,type DailyBreakdown,type MonthlyMatrix,type PaymentRow} from './collections';
import {joinPaymentRows,paymentsBetween,paymentsOn,dayRange} from './report-rows';

export type DailyReport={breakdown:DailyBreakdown;options:{id:string;name:string}[];rows:PaymentRow[]};

export async function loadDailyReport({date,operatorId,locale}:{date:string;operatorId:string|null;locale:string}):Promise<DailyReport>{
  const rows=await joinPaymentRows(await paymentsOn(date),locale);
  return {breakdown:dailyBreakdown(rows,operatorId),options:operatorOptions(rows),rows};
}

export type MonthlyReport={matrix:MonthlyMatrix;rowCount:number};

export async function loadMonthlyReport({year,month,locale}:{year:number;month:number;locale:string}):Promise<MonthlyReport>{
  const {from,to}=dayRange(year,month);
  const rows=await joinPaymentRows(await paymentsBetween(from,to),locale);
  return {matrix:monthlyMatrix(rows,year,month),rowCount:rows.length};
}
