/**
 * Group 2 · the Overview's Daily Operations tier, read in one pass.
 *
 * The operator's morning question is four numbers: what came in today, who is running and what they
 * owe, who we promised to call, and whether we can still send. Every one of them already has a home —
 * the cash desk totals the day, the year summary totals what is owed, the follow-up board is the same
 * range query the Visitors list and the daily job read, and the provider answers its own balance — so
 * this loader calls those and nothing else: no second definition of "today", no second fee engine, no
 * number that could disagree with the screen an operator opens next.
 *
 * Each read is answered on its own. A dashboard that goes blank because the provider is unreachable
 * tells the operator less than one card that says it could not be counted, so a failure is carried as
 * `error:true` beside the numbers that did arrive, and the card names it.
 */
import 'server-only';
import {CenterStudent} from '@/models/CenterRecords';
import {Lead} from '@/models/Lead';
import {todayCenterCash} from '@/actions/center-daily';
import {loadYearSummary} from '@/lib/reports/year-summary-data';
import {followUpBoard} from '@/lib/leads/leads';
import {autoSmsProblems} from '@/lib/center/sms-auto-problems';
import {createSmsProvider,type SmsBalance} from '@/lib/center/sms-provider';
import {dhakaToday} from '@/lib/admin/today';
import {dhakaCalendar} from '@/lib/center/month-status';

export type OperationsCash={total:number;receipts:number;today:string;error:boolean};
export type OperationsStudents={active:number;held:number;error:boolean};
export type OperationsDues={outstanding:number;students:number;year:number;error:boolean};
export type OperationsLeads={newToday:number;dueToday:number;overdue:number;error:boolean};
export type OperationsSms={balance:SmsBalance;problems:number;error:boolean};

export type DailyOperations={
  cash:OperationsCash;students:OperationsStudents;dues:OperationsDues;
  leads:OperationsLeads;sms:OperationsSms;
};

/** The balance read, which is the one call that leaves the building: never let it throw. */
async function readBalance():Promise<{balance:SmsBalance;error:boolean}>{
  try{return {balance:await createSmsProvider().balance(),error:false}}
  catch{return {balance:{ok:false},error:true}}
}

export async function loadDailyOperations(locale:string,now=new Date()):Promise<DailyOperations>{
  const {start,end}=dhakaToday(now);
  const year=dhakaCalendar(now).year;
  const [cash,active,held,dues,newLeads,board,sms]=await Promise.all([
    /* The cash desk's own total for today, receipts and all — `todayCenterCash` is the screen's read,
       and it refuses a day too big to sum, which is an `error` here rather than a wrong number. */
    todayCenterCash()
      .then(value=>({total:value.total,receipts:value.count,today:value.today,error:false}))
      .catch(()=>({total:0,receipts:0,today:'',error:true})),
    CenterStudent.countDocuments({status:'active'}).catch(()=>null),
    CenterStudent.countDocuments({status:'on_hold'}).catch(()=>null),
    /* What the centre is still owed this year: the year summary's own total, so the dashboard and the
       year report cannot say two different things about the same taka. */
    loadYearSummary(year,locale,now)
      .then(summary=>({outstanding:summary.totals.outstanding,students:summary.totals.students,year,error:false}))
      .catch(()=>({outstanding:0,students:0,year,error:true})),
    /* New visitors are the leads created on today's Dhaka day; the recycle plugin's own scope keeps a
       binned lead out of the count, exactly as it keeps it out of the list. */
    Lead.countDocuments({createdAt:{$gte:start,$lt:end}}).catch(()=>null),
    followUpBoard(now,0).catch(()=>null),
    readBalance().then(async read=>({balance:read.balance,error:read.error,problems:await autoSmsProblems(1).then(found=>found.count).catch(()=>0)})),
  ]);
  return {
    cash,
    students:{active:active??0,held:held??0,error:active===null||held===null},
    dues,
    leads:{
      newToday:newLeads??0,dueToday:board?.today??0,overdue:board?.overdue??0,
      error:newLeads===null||board===null,
    },
    sms:{balance:sms.balance,problems:sms.problems,error:sms.error},
  };
}
