/**
 * R3 · The visitor funnel — visitors → trial booked → admitted, broken down by month, source and
 * class, with the conversion rates beside the counts.
 *
 * The spec's line is short ("funnel (visitors, trial, admitted) by month, source and class; CSV
 * export"), so the definitions that make the numbers honest are written down here, where a screen
 * cannot quietly change them:
 *
 *   • **A cohort, not a calendar.** Every row answers "of the visitors who came in this bucket, how
 *     many went on to book a trial and how many were admitted" — the trial and the admission are
 *     counted on the lead that came in that month, whenever they happened. Counting the events
 *     instead would let a December admission flatter January's visitors and would make a rate that
 *     no owner could act on.
 *   • **Evidence, in two forms.** A lead counts as *trial booked* when it carries a `trialBooking`
 *     reference — the intake row the hand-off wrote — or when its status says `trial_booked`, which
 *     is the operator's own word from the inline dropdown. *Admitted* is an `admission` reference, a
 *     `student` reference (a lead converted straight to a Centre student) or the status `admitted`.
 *     Either form is accepted because the owner uses both paths, and refusing one would undercount
 *     the funnel rather than correct it.
 *   • **Trial → admitted divides by the leads that did both.** A direct admission that never booked
 *     a trial is real, and it is counted in *Admitted* and in *Visitor → admitted*; leaving it in
 *     the trial → admitted numerator as well would produce a rate over 100%, which reads as a broken
 *     report rather than as a fact. So that one column is `admittedFromTrial / trial`.
 *   • **A rate with nobody to divide by is null, never 0%.** Zero percent says "we tried and nobody
 *     converted"; an empty bucket says nothing at all, and the screen prints a dash for it.
 *   • **Empty buckets are printed.** All five sources and all twelve classes appear even at zero,
 *     because a source that stopped bringing visitors is the interesting row, and because the CSV
 *     keeps the same shape from one month to the next. Months are the exception: only months that
 *     hold a lead appear, plus every month inside an explicit from/to range the operator chose.
 *   • **Binned leads are not counted.** The query goes through `Lead.aggregate`, which carries the
 *     Recycle Bin pre-hook, so a lead in the bin leaves this report exactly as it leaves the list.
 *
 * Nothing here translates: the buckets come back as keys (`2026-01`, `walk_in`, `7`, `none`) and the
 * page turns them into words and digits, because `src/lib` must stay importable from both runtimes.
 */
import type {FilterQuery} from 'mongoose';
import {Lead} from '@/models/Lead';
import {LEAD_SOURCES} from './vocab';

export const FUNNEL_BREAKDOWNS=['month','source','class'] as const;
export type FunnelBreakdown=typeof FUNNEL_BREAKDOWNS[number];

/** The bucket a lead with no readable class lands in: printed as its own row, never dropped. */
export const FUNNEL_NO_CLASS='none';
/** How many months an explicit from/to range may fill in before the report only lists real ones. */
export const FUNNEL_MONTH_FILL_LIMIT=60;

export interface FunnelParams{
  breakdown?:string;from?:string;to?:string;source?:string;classGroup?:string|number;
}

/** Params after the vocabulary check: what the query used, echoed back for the screen and the CSV. */
export interface FunnelQuery{
  breakdown:FunnelBreakdown;from:string;to:string;source:string;classGroup:string;
}

export interface FunnelCounts{visitors:number;trial:number;admitted:number;admittedFromTrial:number}
/** Percents rounded to one decimal, or null when the denominator is empty. */
export interface FunnelRates{visitorToTrial:number|null;trialToAdmitted:number|null;visitorToAdmitted:number|null}
export interface FunnelRow extends FunnelCounts,FunnelRates{key:string}
export interface FunnelResult{
  query:FunnelQuery;
  rows:FunnelRow[];
  totals:FunnelRow;
  /** True when the month rows include months the range covers but no lead arrived in. */
  monthsFilled:boolean;
  generatedAt:string;
}

const DAY=/^\d{4}-\d{2}-\d{2}$/;

/** One decimal place, or null for "nobody to divide by". Rounding happens once, here. */
export function percent(part:number,whole:number):number|null{
  if(!Number.isFinite(part)||!Number.isFinite(whole)||whole<=0)return null;
  return Math.round((part/whole)*1000)/10;
}

export function ratesOf(counts:FunnelCounts):FunnelRates{
  return {
    visitorToTrial:percent(counts.trial,counts.visitors),
    trialToAdmitted:percent(counts.admittedFromTrial,counts.trial),
    visitorToAdmitted:percent(counts.admitted,counts.visitors),
  };
}

/**
 * The vocabulary check, on its own so the page and the CSV link build the same query: an invented
 * breakdown falls back to `month`, an invented source or class is ignored rather than trusted, and a
 * from/to that is not a Dhaka day string is dropped. A reversed range is swapped, because "from the
 * 10th to the 1st" is a typo with an obvious reading, not a request for an empty report.
 */
export function funnelQuery(params:FunnelParams):FunnelQuery{
  const breakdown=(FUNNEL_BREAKDOWNS as readonly string[]).includes(String(params.breakdown||''))
    ? String(params.breakdown) as FunnelBreakdown
    : 'month';
  const from=DAY.test(String(params.from||''))?String(params.from):'';
  const to=DAY.test(String(params.to||''))?String(params.to):'';
  const source=(LEAD_SOURCES as readonly string[]).includes(String(params.source||''))?String(params.source):'';
  const classNumber=Number(params.classGroup);
  const classGroup=Number.isInteger(classNumber)&&classNumber>=1&&classNumber<=12?String(classNumber):'';
  if(from&&to&&to<from)return {breakdown,from:to,to:from,source,classGroup};
  return {breakdown,from,to,source,classGroup};
}

/** The cohort filter: the same date field and the same vocabulary the Visitors list uses. */
export function funnelFilter(query:FunnelQuery):FilterQuery<unknown>{
  const filter:FilterQuery<unknown>={};
  if(query.from)filter.date={...(filter.date as object||{}),$gte:query.from};
  if(query.to)filter.date={...(filter.date as object||{}),$lte:query.to};
  if(query.source)filter.source=query.source;
  if(query.classGroup)filter.classGroup=Number(query.classGroup);
  return filter;
}

/** Every bucket the report prints, in order, before any lead is counted. */
export function funnelBuckets(query:FunnelQuery,monthsInData:string[]):string[]{
  if(query.breakdown==='source')return [...LEAD_SOURCES];
  if(query.breakdown==='class')return [...Array.from({length:12},(_,index)=>String(index+1)),FUNNEL_NO_CLASS];
  if(query.from&&query.to){
    const filled=monthsBetween(query.from,query.to);
    if(filled.length&&filled.length<=FUNNEL_MONTH_FILL_LIMIT)return filled;
  }
  return monthsInData;
}

/** The `YYYY-MM` months from one Dhaka day to another, newest first, inclusive of both ends. */
export function monthsBetween(from:string,to:string):string[]{
  const first=new Date(`${from.slice(0,7)}-01T00:00:00Z`);
  const last=new Date(`${to.slice(0,7)}-01T00:00:00Z`);
  if(Number.isNaN(first.getTime())||Number.isNaN(last.getTime()))return [];
  const out:string[]=[];
  for(let at=addMonths(last.getTime(),0);at>=first.getTime();at=addMonths(at,-1)){
    out.push(new Date(at).toISOString().slice(0,7));
    if(out.length>=FUNNEL_MONTH_FILL_LIMIT)break;
  }
  return out;
}
function addMonths(time:number,by:number):number{
  const date=new Date(time);
  return Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+by,1);
}

/** A reference the hand-off wrote, as an aggregation boolean: null and missing both mean "no". */
const hasReference=(field:string)=>({$ne:[{$ifNull:[`$${field}`,null]},null]});
/** The operator's own word from the status dropdown, which is evidence too. */
const statusIs=(value:string)=>({$eq:['$status',value]});

const TRIAL_EVIDENCE={$or:[hasReference('trialBooking'),statusIs('trial_booked')]};
const ADMITTED_EVIDENCE={$or:[hasReference('admission'),hasReference('student'),statusIs('admitted')]};

function bucketExpression(breakdown:FunnelBreakdown):Record<string,unknown>{
  if(breakdown==='source')return {$ifNull:['$source','other']};
  if(breakdown==='class')return {$convert:{input:'$classGroup',to:'string',onNull:FUNNEL_NO_CLASS,onError:FUNNEL_NO_CLASS}};
  // `date` is a required `YYYY-MM-DD` day in Dhaka, so the month is its first seven characters —
  // no timezone arithmetic, and no way for a month to drift with the hour the report is opened.
  return {$substrCP:['$date',0,7]};
}

const GROUP_STAGE={$group:{
  _id:'$bucket',
  visitors:{$sum:1},
  trial:{$sum:{$cond:['$isTrial',1,0]}},
  admitted:{$sum:{$cond:['$isAdmitted',1,0]}},
  admittedFromTrial:{$sum:{$cond:[{$and:['$isTrial','$isAdmitted']},1,0]}},
}};

interface GroupRow{_id:string;visitors:number;trial:number;admitted:number;admittedFromTrial:number}

function countsOf(row:Partial<GroupRow>|undefined):FunnelCounts{
  return {
    visitors:Number(row?.visitors)||0,
    trial:Number(row?.trial)||0,
    admitted:Number(row?.admitted)||0,
    admittedFromTrial:Number(row?.admittedFromTrial)||0,
  };
}

/**
 * The report. Two aggregations over one filter: the buckets, and the cohort total. The total is its
 * own query rather than a sum of the rows on purpose — if a bucket expression ever dropped a lead,
 * the two would disagree and the screen would show it instead of hiding it.
 */
export async function leadFunnel(params:FunnelParams,now:Date=new Date()):Promise<FunnelResult>{
  const query=funnelQuery(params);
  const filter=funnelFilter(query);
  const project={$project:{bucket:bucketExpression(query.breakdown),isTrial:TRIAL_EVIDENCE,isAdmitted:ADMITTED_EVIDENCE}};
  const [bucketRows,totalRows]=await Promise.all([
    Lead.aggregate<GroupRow>([{$match:filter},project,GROUP_STAGE,{$sort:{_id:1}}]),
    Lead.aggregate<GroupRow>([{$match:filter},{$group:{
      _id:null,
      visitors:{$sum:1},
      trial:{$sum:{$cond:[TRIAL_EVIDENCE,1,0]}},
      admitted:{$sum:{$cond:[ADMITTED_EVIDENCE,1,0]}},
      admittedFromTrial:{$sum:{$cond:[{$and:[TRIAL_EVIDENCE,ADMITTED_EVIDENCE]},1,0]}},
    }}]),
  ]);
  const found=new Map(bucketRows.map(row=>[String(row._id),row]));
  const monthsInData=bucketRows.map(row=>String(row._id)).sort().reverse();
  const keys=query.breakdown==='month'
    ? funnelBuckets(query,monthsInData)
    : funnelBuckets(query,[]);
  const rows:FunnelRow[]=keys.map(key=>{
    const counts=countsOf(found.get(key));
    return {key,...counts,...ratesOf(counts)};
  });
  // A bucket the report did not plan for — a month outside a chosen range cannot happen, but a class
  // of 13 or a source somebody invented could — is printed rather than silently summed away.
  for(const row of bucketRows){
    const key=String(row._id);
    if(!rows.some(entry=>entry.key===key)){
      const counts=countsOf(row);
      rows.push({key,...counts,...ratesOf(counts)});
    }
  }
  const totals=countsOf(totalRows[0]);
  return {
    query,
    rows,
    totals:{key:'total',...totals,...ratesOf(totals)},
    monthsFilled:query.breakdown==='month'&&rows.length>monthsInData.length,
    generatedAt:now.toISOString(),
  };
}
