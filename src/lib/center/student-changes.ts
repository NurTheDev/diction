/**
 * S1 · the three changes a student's money and class go through, as pure functions over the record.
 *
 * A pause, a move to another class and a change of price are the three writes the centre makes to a
 * student that are about *time* rather than about identity: each one says "from this month, this is
 * true", and each one is a line added to a history rather than an edit of the line before it. That is
 * the whole reason this module exists and is pure — no database, no session, no Next — so the rules can
 * be read and proved without a machine to run them on:
 *
 *  · **F-01 a pause has months.** A hold is not a status flag, it is a range: the first month the fee
 *    run skipped and, once the student is back, the last one it skipped. Lifting a hold closes the
 *    range at the month BEFORE the one the student resumes in, so the resume month is billed and the
 *    paused months are never billed again — not when the hold is lifted, not ever. What the student
 *    owed BEFORE the pause is untouched: a pause stops the meter, it does not forgive the arrears.
 *  · **F-02 a move has months.** The class a student sits in is `classGroup`, and the classes they sat
 *    in before it are `classHistory` — one line per move, naming the class, the month it became theirs,
 *    the name the class wore that day and who made the change. A history that has to join to another
 *    collection to read itself is a history nobody prints, so the name is carried on the line.
 *  · **F-03 a price has months.** `feeHistory` is the price a month is billed at, and the dues engine
 *    already reads it that way: each month takes the newest line whose `effectiveFrom` has arrived. So
 *    a change of price is one more line, and the months already settled keep the price they were
 *    settled at — a change that would reach back over money the centre has taken is refused, and the
 *    refusal names the month that stopped it.
 *
 * The server actions in `src/actions/center-students.ts` are the door: they parse a form, load the
 * record inside a transaction, hand it to a planner here, save what the planner returned and write the
 * audit line. Everything that could be wrong about the *shape* of the change is decided here.
 */
import {asciiDigits} from '@/lib/admin/format';
import type {HoldPeriod,YearMonth} from './month-status';

export type ClassName={bn:string;en?:string};
/** One pause, as the record holds it. `end` empty means the student is still paused. */
export type HoldRow={start:YearMonth;end?:YearMonth|null;reason?:string;recordedBy?:string;endedBy?:string;createdAt?:Date;closedAt?:Date};
/** One class a student has sat in, from a month. */
export type ClassStepRow={classGroup:string;name?:ClassName;effectiveFrom:YearMonth;reason?:string;changedBy?:string;changedAt?:Date};
/** One price, from a month. */
export type FeeStepRow={effectiveFrom:YearMonth;amount:number;reason?:string;changedBy?:string;changedAt?:Date};

const HEX24=/^[a-f\d]{24}$/i;
export const isMonth=(value:unknown):value is YearMonth=>{
  const month=value as YearMonth|null;
  return !!month&&Number.isInteger(month.year)&&month.year>=1900&&month.year<=2200
    &&Number.isInteger(month.month)&&month.month>=1&&month.month<=12;
};
/** Months as one number, so a range is a comparison: the same key `month-status.ts` uses. */
export const monthIndexOf=(month:YearMonth):number=>month.year*12+month.month-1;
export const monthAt=(index:number):YearMonth=>({year:Math.floor(index/12),month:(index%12)+1});
export const monthWordOf=(month:YearMonth):string=>`${month.year}-${String(month.month).padStart(2,'0')}`;
export const priorMonth=(month:YearMonth):YearMonth=>monthAt(monthIndexOf(month)-1);
/**
 * A `YYYY-MM` month as a form carries it. The digits are folded from Bangla first, because an operator
 * whose screen counts in Bangla digits types what they read, and a picker is not the only way a month
 * arrives here.
 */
export function readMonthWord(value:unknown):YearMonth|null{
  const text=asciiDigits(String(value??'').trim());
  const match=/^(\d{4})-(\d{2})$/.exec(text);
  if(!match)return null;
  const month={year:Number(match[1]),month:Number(match[2])};
  return isMonth(month)?month:null;
}
/** The pause the record is inside: the last line with no end, which is the one a lift closes. */
export function openHoldOf(holds:readonly HoldRow[]):HoldRow|undefined{
  for(let index=holds.length-1;index>=0;index--)if(!holds[index].end)return holds[index];
  return undefined;
}
/** The pauses in the shape the dues engine reads them. */
export function holdPeriods(holds:readonly HoldRow[]):HoldPeriod[]{
  return holds.map(hold=>({start:hold.start,end:hold.end??null}));
}
const trimmed=(value:unknown):string=>String(value??'').trim().slice(0,500);
const step=(reason:unknown,actorId:string|undefined,now:Date)=>({
  reason:trimmed(reason),...(actorId?{changedBy:actorId}:{}),changedAt:now,
});

/* ── F-01 · the pause ─────────────────────────────────────────────────────────────────────────── */

/**
 * Pause a student from a month: one open line added to `holds`, and the status that follows it.
 *
 * The month may be Dhaka's own or a month already past — a centre that notices in June that a student
 * stopped coming in April writes April, and the two months in between stop being billed. What it may
 * not be is a second open pause: a student is either paused or not, and a record with two open ranges
 * would be a record nobody can read back.
 */
export function planHold(student:{status:string;holds:readonly HoldRow[]},
  input:{fromMonth:YearMonth;reason?:string;actorId?:string;now?:Date}):{status:'on_hold';holds:HoldRow[];hold:HoldRow}{
  if(student.status==='removed')throw Error('REMOVED');
  if(student.status==='on_hold')throw Error('ALREADY_HELD');
  if(!isMonth(input.fromMonth))throw Error('INVALID_MONTH');
  const now=input.now??new Date();
  const holds=[...student.holds];
  /* A row paused by an older write that never closed its range is closed here rather than left open
     beside the new one: the record keeps one open pause, which is the only thing a lift can close. */
  const stale=openHoldOf(holds);
  if(stale&&isMonth(stale.start)){
    const last=Math.max(monthIndexOf(stale.start),monthIndexOf(input.fromMonth)-1);
    holds[holds.indexOf(stale)]={...stale,end:monthAt(last),endedBy:input.actorId,closedAt:now};
  }
  const hold:HoldRow={start:{...input.fromMonth},end:undefined,reason:trimmed(input.reason),
    ...(input.actorId?{recordedBy:input.actorId}:{}),createdAt:now};
  return {status:'on_hold',holds:[...holds,hold],hold};
}

/**
 * Bring a paused student back: the open range is closed at the month BEFORE the resume month, so the
 * month they resume in is a month the centre bills, and every month inside the range stays unbilled
 * for good. Nothing here re-prices a paused month and nothing here forgives an earlier one — the
 * arrears the student arrived with are exactly the arrears they come back to.
 *
 * A student paused by a write that kept no range (the flag this door replaced) simply becomes active:
 * there is nothing to close, and inventing a range would bill months nobody paused.
 */
export function planLift(student:{status:string;holds:readonly HoldRow[]},
  input:{resumeMonth:YearMonth;actorId?:string;now?:Date}):{status:'active';holds:HoldRow[];closed:HoldRow|null}{
  if(student.status==='removed')throw Error('REMOVED');
  if(!isMonth(input.resumeMonth))throw Error('INVALID_MONTH');
  const open=openHoldOf(student.holds);
  if(student.status!=='on_hold'&&!open)throw Error('NOT_HELD');
  const now=input.now??new Date(),holds=[...student.holds];
  let closed:HoldRow|null=null;
  if(open){
    /* The resume month is the first billed one, so the pause ends the month before it — and a resume
       month that is not after the pause's own start would close the range backwards, which the dues
       engine refuses to read. That is a refusal here, in words, rather than a throw over there. */
    if(monthIndexOf(input.resumeMonth)<=monthIndexOf(open.start))throw Error('RESUME_TOO_EARLY');
    const end=priorMonth(input.resumeMonth);
    closed={...open,end,endedBy:input.actorId,closedAt:now};
    holds[holds.indexOf(open)]=closed;
  }
  return {status:'active',holds,closed};
}

/* ── F-02 · the move ──────────────────────────────────────────────────────────────────────────── */

/**
 * Move a student to another class from a month.
 *
 * The line added names the class they move TO, from the month the move takes effect — read with
 * `classGroup`, the history is the timeline of the classes this student has sat in and the months each
 * one was theirs. The first move backfills the class they are leaving, from the month they enrolled,
 * so the timeline starts at the beginning rather than at the first change anybody happened to make.
 */
export function planClassTransfer(student:{classGroup:string;startMonth:YearMonth;classHistory:readonly ClassStepRow[]},
  input:{targetClassId:string;targetClassName:ClassName;from:{id:string;name:ClassName};effectiveMonth:YearMonth;
    reason?:string;actorId?:string;now?:Date}):{classGroup:string;classHistory:ClassStepRow[];step:ClassStepRow}{
  if(!HEX24.test(input.targetClassId))throw Error('NO_CLASS');
  if(!isMonth(input.effectiveMonth))throw Error('INVALID_MONTH');
  if(input.targetClassId===student.classGroup)throw Error('SAME_CLASS');
  if(monthIndexOf(input.effectiveMonth)<monthIndexOf(student.startMonth))throw Error('BEFORE_START');
  const now=input.now??new Date();
  const history=[...student.classHistory];
  /* The backfill needs the name the class wore, because a line that cannot name itself is a line nobody
     can print: a class that has gone leaves the student's first months to `startMonth` alone. */
  if(!history.length&&HEX24.test(input.from.id)&&input.from.name.bn)
    history.push({classGroup:input.from.id,name:{bn:input.from.name.bn,en:input.from.name.en||''},
      effectiveFrom:{...student.startMonth}});
  const target:ClassStepRow={classGroup:input.targetClassId,
    name:{bn:input.targetClassName.bn,en:input.targetClassName.en||''},
    effectiveFrom:{...input.effectiveMonth},...step(input.reason,input.actorId,now)};
  /* Sorted, not merely appended: a move written for a month already past belongs where it happened. */
  const classHistory=[...history,target].sort((a,b)=>monthIndexOf(a.effectiveFrom)-monthIndexOf(b.effectiveFrom));
  return {classGroup:input.targetClassId,classHistory,step:target};
}

/* ── F-03 · the price ─────────────────────────────────────────────────────────────────────────── */

/**
 * The price a student is on in a given month: the newest line whose `effectiveFrom` has arrived, and
 * the oldest line when none has.
 *
 * The dues engine has always billed this way, but the screens that QUOTE a price did not: they read the
 * last line of the history, which is right while a history holds one line and wrong the day somebody
 * writes a price for a month nobody has reached — such a quote reads a price the centre has not started
 * billing. F-03 made writing that line an ordinary thing to do, so the rule is named here and asked by
 * every screen that says what a month costs: the class hub and the all-class summary.
 */
export function feeInMonth(feeHistory:readonly {effectiveFrom:YearMonth;amount:number}[],month:YearMonth):number{
  const lines=[...feeHistory].sort((a,b)=>monthIndexOf(a.effectiveFrom)-monthIndexOf(b.effectiveFrom));
  if(!lines.length)return 0;
  const target=monthIndexOf(month);
  const arrived=lines.filter(line=>monthIndexOf(line.effectiveFrom)<=target);
  return Number((arrived.length?arrived[arrived.length-1]:lines[0]).amount)||0;
}

/**
 * The first month from `from` to `to` that already has money on it, or null.
 *
 * This is the rule that keeps a change of price out of the past: a month the centre has taken money
 * for was settled at the price it was settled at, and a receipt is not something a later form gets to
 * reinterpret. The month is returned rather than a boolean so the refusal can name it.
 */
export function settledMonthInRange(payments:Record<string,number>,from:YearMonth,to:YearMonth):YearMonth|null{
  if(!isMonth(from)||!isMonth(to))return null;
  for(let index=monthIndexOf(from);index<=monthIndexOf(to);index++){
    const month=monthAt(index);
    if((payments[monthWordOf(month)]||0)>0)return month;
  }
  return null;
}

/**
 * Change the price from a month: one line added to `feeHistory`, which is what the dues engine already
 * bills by — every month takes the newest line whose `effectiveFrom` has arrived, so the months before
 * it keep the old price and the months from it on take the new one. No month is edited, and no month
 * that has been settled is reached: that refusal is `settledMonthInRange`'s, and the action asks it
 * first so the sentence it answers with can name the month.
 */
export function planFeeChange(student:{startMonth:YearMonth;feeHistory:readonly FeeStepRow[]},
  input:{amount:number;effectiveMonth:YearMonth;today:YearMonth;payments?:Record<string,number>;
    reason?:string;actorId?:string;now?:Date}):{feeHistory:FeeStepRow[];step:FeeStepRow}{
  if(!Number.isSafeInteger(input.amount)||input.amount<0||input.amount>100000000)throw Error('INVALID_FEE');
  if(!isMonth(input.effectiveMonth))throw Error('INVALID_MONTH');
  if(monthIndexOf(input.effectiveMonth)<monthIndexOf(student.startMonth))throw Error('BEFORE_START');
  /* The months already settled are the ones a new price may not reach back into, and the range it may
     not reach back over runs from the month the price takes effect to Dhaka's own month. */
  const settled=settledMonthInRange(input.payments||{},input.effectiveMonth,input.today);
  if(settled)throw Error('SETTLED_MONTH');
  const at=input.now??new Date();
  const target:FeeStepRow={effectiveFrom:{...input.effectiveMonth},amount:input.amount,
    ...step(input.reason,input.actorId,at)};
  const feeHistory=[...student.feeHistory,target]
    .sort((a,b)=>monthIndexOf(a.effectiveFrom)-monthIndexOf(b.effectiveFrom));
  return {feeHistory,step:target};
}
