/**
 * S1 · the student's own money and class, as pure rules: a pause, a move and a price.
 *
 * Three findings, three rules, and not one of them needs a database — which is the reason this suite
 * exists separately from the one that drives the doors in a browser. What a change MEANS is settled
 * here, over plain records, so the browser suite is left to prove only that a screen asks the question
 * and that the answer arrives in the record:
 *
 *  F-01 a pause is a range of months. Lifting it closes the range at the month before the one the
 *       student resumes in, the months inside it are never billed — not while it is open and not after
 *       it is closed — and the arrears the student arrived with are still owed the whole time.
 *  F-02 a move writes a line to the class history and moves the roll the student is on.
 *  F-03 a price takes effect from a month, bills each month at the price that month had, and cannot
 *       reach back over a month the centre has already taken money for.
 *  F-18 the achievement card's date is spelled from the catalogs, not from the host's ICU tables.
 *
 * Run: npm run test:s1:money
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  isMonth,monthAt,monthIndexOf,monthWordOf,openHoldOf,priorMonth,readMonthWord,
  feeInMonth,planClassTransfer,planFeeChange,planHold,planLift,settledMonthInRange,
  type ClassStepRow,type FeeStepRow,type HoldRow,
} from '../src/lib/center/student-changes';
import {calculateStudentDues,monthKey,type DueInput} from '../src/lib/center/dues';
import {monthStatus,type YearMonth} from '../src/lib/center/month-status';
import {achievementDateBn} from '../src/lib/achievement-date';
import {monthNames,type MonthTable} from '../src/lib/admin/months';
import bnMessages from '../src/messages/bn.json';

const ym=(year:number,month:number):YearMonth=>({year,month});
/** The eleventh of a month, so a month under test is past its due day and therefore owed. */
const on=(year:number,month:number):Date=>new Date(`${year}-${String(month).padStart(2,'0')}-11T06:00:00Z`);
const settled=(doc:unknown)=>JSON.parse(JSON.stringify(doc)) as never;

/* ── the month a form carries ─────────────────────────────────────────────────────────────────── */
assert.deepEqual(readMonthWord('2026-03'),ym(2026,3),'a YYYY-MM month is read as a month');
assert.deepEqual(readMonthWord(' 2026-12 '),ym(2026,12),'and read with the spaces a form field carries');
assert.deepEqual(readMonthWord('২০২৬-০৩'),ym(2026,3),
  'a screen that counts in Bangla digits is a screen an operator may answer in Bangla digits');
for(const refused of ['','2026-13','2026-00','26-03','2026/03','2026-3','মার্চ ২০২৬',null,undefined,'2026-03-01'])
  assert.equal(readMonthWord(refused),null,`"${String(refused)}" is not a month and is refused rather than guessed`);
assert.equal(monthWordOf(ym(2026,3)),'2026-03','a month is written back the way a picker writes it');
assert.deepEqual(priorMonth(ym(2026,1)),ym(2025,12),'and the month before January is December, not nothing');
assert.deepEqual(monthAt(monthIndexOf(ym(2026,3))),ym(2026,3),'a month survives its own index');
assert.equal(isMonth(ym(2026,13)),false,'a thirteenth month is not a month');

/* ── F-01 · a pause is a range, and the range is what the money reads ──────────────────────────── */
const startMonth=ym(2026,1),fee=1000;
const feeHistory:FeeStepRow[]=[{effectiveFrom:startMonth,amount:fee}];
const duesOf=(input:{status:DueInput['status'];holds:HoldRow[];payments?:Record<string,number>;months?:number[]},
  now:Date):{months:number[];total:number;statuses:Record<number,string>}=>{
  const engine:DueInput={startMonth,feeHistory,holds:input.holds.map(hold=>({start:hold.start,end:hold.end??null})),
    status:input.status,payments:input.payments||{},waivers:new Set<string>()};
  const rows=calculateStudentDues(engine,now);
  return {months:rows.months.map(row=>row.month),total:rows.total,
    statuses:Object.fromEntries((input.months||[]).map(month=>[month,
      monthStatus({month:ym(now.getUTCFullYear(),month),startMonth,feeHistory,
        holds:engine.holds,paid:input.payments?.[monthKey(now.getUTCFullYear(),month)]||0,now}).status]))};
};

// A student who has paid nothing for four months, paused from the third.
const paused=planHold({status:'active',holds:[]},{fromMonth:ym(2026,3),reason:'পরীক্ষার বিরতি',actorId:'actor-1',now:new Date('2026-04-05T00:00:00Z')});
assert.equal(paused.status,'on_hold','a pause changes the status the badge reads');
assert.equal(paused.holds.length,1,'and writes exactly one line to the record');
assert.deepEqual(paused.holds[0].start,ym(2026,3),'the line starts at the month the operator picked');
assert.equal(paused.holds[0].end,undefined,'and stays open, because the student has not come back');
assert.equal(paused.holds[0].reason,'পরীক্ষার বিরতি','the reason the operator typed is on the line');
assert.equal(paused.holds[0].recordedBy,'actor-1','and so is who wrote it');
assert.equal(paused.holds[0].createdAt?.toISOString(),'2026-04-05T00:00:00.000Z','and when');
assert.deepEqual(openHoldOf(paused.holds)?.start,ym(2026,3),'the open line is the one a lift will close');

// The arrears before the pause are still owed while the student is paused — this is the finding.
const whilePaused=duesOf({status:'on_hold',holds:paused.holds,months:[1,2,3,4]},on(2026,4));
assert.deepEqual(whilePaused.months,[1,2],'the two months before the pause are still owed while it runs');
assert.equal(whilePaused.total,2000,'and they are owed in full: a pause stops the meter, it does not forgive it');
assert.equal(whilePaused.statuses[3],'HELD','the month the pause began is held');
assert.equal(whilePaused.statuses[4],'HELD','and so is every month after it, while the pause is open');

// Lifting asks for the month the student resumes, and closes the pause the month before it.
const lifted=planLift({status:'on_hold',holds:paused.holds},{resumeMonth:ym(2026,6),actorId:'actor-2',now:new Date('2026-06-02T00:00:00Z')});
assert.equal(lifted.status,'active','a lift brings the student back');
assert.deepEqual(lifted.holds[0].end,ym(2026,5),'the pause ends the month BEFORE the one the student resumes in');
assert.equal(lifted.holds[0].endedBy,'actor-2','and the record says who lifted it');
assert.equal(lifted.holds[0].closedAt?.toISOString(),'2026-06-02T00:00:00.000Z','and when');
assert.equal(lifted.holds.length,1,'a lift closes the line it found; it does not add another');

// …and the closed range is never billed again. This is "unholding must not back-bill".
const afterLift=duesOf({status:'active',holds:lifted.holds,months:[1,2,3,4,5,6]},on(2026,6));
assert.deepEqual(afterLift.months,[1,2,6],
  'lifting the pause bills nothing that was inside it: what is owed is the two months before the pause and the month the student resumed in');
assert.equal(afterLift.total,3000,
  'the student comes back to the arrears they left, plus the month they resumed in, and not one taka for a month inside the pause');
assert.equal(afterLift.statuses[3],'HELD','March stays held after the lift');
assert.equal(afterLift.statuses[5],'HELD','and so does May, the last month inside the range');
assert.equal(afterLift.statuses[6],'DUE','while June, the month the student resumed in, is a month the centre bills');

// A lift that would close the range backwards is refused in words rather than written.
assert.throws(()=>planLift({status:'on_hold',holds:paused.holds},{resumeMonth:ym(2026,3)}),/RESUME_TOO_EARLY/,
  'a resume month inside the pause is refused: the range would end before it began');
assert.throws(()=>planLift({status:'active',holds:[]},{resumeMonth:ym(2026,6)}),/NOT_HELD/,
  'and a student who is not paused has nothing to lift');
// A student paused by the flag this door replaced comes back with nothing invented around them.
const legacy=planLift({status:'on_hold',holds:[]},{resumeMonth:ym(2026,6)});
assert.equal(legacy.status,'active','a pause that kept no range is still lifted');
assert.equal(legacy.closed,null,'and no range is invented for it, because an invented range would bill nobody\'s months');
/* …and while the record is in that shape the money is counted for nothing. Every pause written before
   S1 was a flag and no months, so billing one from enrolment would invent a debt for the very months
   the centre paused — the mirror image of the finding above, and a demand on a family besides. What
   puts the earlier arrears back on the list is giving the pause its month, which is what a lift and a
   pause through this door always do now. */
const flagOnly=duesOf({status:'on_hold',holds:[],months:[1,2,3,4]},on(2026,4));
assert.deepEqual(flagOnly.months,[],'a pause with no month on the record is billed for none of them');
assert.equal(flagOnly.total,0,'and owes nothing until somebody gives it the month it started');
const givenAMonth=duesOf({status:'on_hold',holds:[{start:ym(2026,3),reason:''}],months:[1,2,3,4]},on(2026,4));
assert.deepEqual(givenAMonth.months,[1,2],'the same student with a month on the pause owes the two months before it');
assert.equal(givenAMonth.total,2000,'which is the whole of F-01: the month is what makes the arrears countable');
assert.throws(()=>planHold({status:'on_hold',holds:[]},{fromMonth:ym(2026,5)}),/ALREADY_HELD/,
  'a second pause on a paused student is refused');
assert.throws(()=>planHold({status:'removed',holds:[]},{fromMonth:ym(2026,5)}),/REMOVED/,
  'and a student the centre stopped running cannot be paused');
// A record left with an open range beside an active status is closed by the next pause rather than
// carried: one open range is the only thing a lift can close.
const stale=planHold({status:'active',holds:[{start:ym(2026,2),reason:''}]},{fromMonth:ym(2026,5),actorId:'actor-3'});
assert.equal(stale.holds.length,2,'the stale range is closed and the new one opened');
assert.deepEqual(stale.holds[0].end,ym(2026,4),'the stale one ends the month before the new pause begins');
assert.deepEqual(openHoldOf(stale.holds)?.start,ym(2026,5),'and one range is left open, which is the one a lift will close');
// A pause written with no reason at all is still a pause: the reason is the operator's, and optional.
assert.equal(planHold({status:'active',holds:[]},{fromMonth:ym(2026,3)}).holds[0].reason,'',
  'a reason nobody typed is stored as no reason rather than as a sentence invented for it');

/* ── F-02 · a move writes a line and moves the roll ───────────────────────────────────────────── */
const moved=planClassTransfer(
  {classGroup:'aaaaaaaaaaaaaaaaaaaaaaaa',startMonth,classHistory:[]},
  {targetClassId:'bbbbbbbbbbbbbbbbbbbbbbbb',targetClassName:{bn:'দশম শ্রেণি',en:'Class Ten'},
    from:{id:'aaaaaaaaaaaaaaaaaaaaaaaa',name:{bn:'নবম শ্রেণি',en:'Class Nine'}},
    effectiveMonth:ym(2026,4),reason:'বিভাগ বদল',actorId:'actor-1',now:new Date('2026-04-02T00:00:00Z')});
assert.equal(moved.classGroup,'bbbbbbbbbbbbbbbbbbbbbbbb','the roll the student is on is the class they moved to');
assert.equal(moved.classHistory.length,2,'and the history holds the class they left beside the one they arrived on');
assert.deepEqual(moved.classHistory[0],{classGroup:'aaaaaaaaaaaaaaaaaaaaaaaa',name:{bn:'নবম শ্রেণি',en:'Class Nine'},
  effectiveFrom:startMonth},'the first move backfills the class they left, from the month they enrolled');
assert.equal(moved.classHistory[1].classGroup,'bbbbbbbbbbbbbbbbbbbbbbbb','the line the move writes names the new class');
assert.deepEqual(moved.classHistory[1].effectiveFrom,ym(2026,4),'from the month the operator picked');
assert.equal(moved.classHistory[1].name?.bn,'দশম শ্রেণি','carrying the name the class wore that day');
assert.equal(moved.classHistory[1].reason,'বিভাগ বদল','the reason the operator typed');
assert.equal(moved.classHistory[1].changedBy,'actor-1','who made the change');
assert.equal(moved.classHistory[1].changedAt?.toISOString(),'2026-04-02T00:00:00.000Z','and when');
// A second move adds one line, and does not backfill a timeline that is already written.
const movedAgain=planClassTransfer(
  {classGroup:'bbbbbbbbbbbbbbbbbbbbbbbb',startMonth,classHistory:moved.classHistory},
  {targetClassId:'cccccccccccccccccccccccc',targetClassName:{bn:'একাদশ শ্রেণি',en:'Class Eleven'},
    from:{id:'bbbbbbbbbbbbbbbbbbbbbbbb',name:{bn:'দশম শ্রেণি',en:'Class Ten'}},effectiveMonth:ym(2026,9)});
assert.equal(movedAgain.classHistory.length,3,'a second move is a second line');
assert.deepEqual(movedAgain.classHistory.map(step=>step.classGroup),
  ['aaaaaaaaaaaaaaaaaaaaaaaa','bbbbbbbbbbbbbbbbbbbbbbbb','cccccccccccccccccccccccc'],
  'and the timeline reads in the order the months happened');
// A move written for a month already past lands where it happened, not at the end of the list.
const backdated=planClassTransfer(
  {classGroup:'aaaaaaaaaaaaaaaaaaaaaaaa',startMonth,classHistory:movedAgain.classHistory},
  {targetClassId:'dddddddddddddddddddddddd',targetClassName:{bn:'শ্রেণি চার',en:'Class Four'},
    from:{id:'aaaaaaaaaaaaaaaaaaaaaaaa',name:{bn:'নবম শ্রেণি',en:'Class Nine'}},effectiveMonth:ym(2026,6)});
assert.deepEqual(backdated.classHistory.map(step=>monthWordOf(step.effectiveFrom)),
  ['2026-01','2026-04','2026-06','2026-09'],
  'a move written for a month already past is sorted into the timeline where it happened');
assert.throws(()=>planClassTransfer({classGroup:'aaaaaaaaaaaaaaaaaaaaaaaa',startMonth,classHistory:[]},
  {targetClassId:'aaaaaaaaaaaaaaaaaaaaaaaa',targetClassName:{bn:'নবম শ্রেণি'},
    from:{id:'aaaaaaaaaaaaaaaaaaaaaaaa',name:{bn:'নবম শ্রেণি'}},effectiveMonth:ym(2026,4)}),/SAME_CLASS/,
  'a move to the class the student is already in is not a move');
assert.throws(()=>planClassTransfer({classGroup:'aaaaaaaaaaaaaaaaaaaaaaaa',startMonth,classHistory:[]},
  {targetClassId:'not-an-id',targetClassName:{bn:'নবম শ্রেণি'},from:{id:'aaaaaaaaaaaaaaaaaaaaaaaa',name:{bn:'নবম শ্রেণি'}},
    effectiveMonth:ym(2026,4)}),/NO_CLASS/,'and a class id nobody can parse is refused');
assert.throws(()=>planClassTransfer({classGroup:'aaaaaaaaaaaaaaaaaaaaaaaa',startMonth,classHistory:[]},
  {targetClassId:'bbbbbbbbbbbbbbbbbbbbbbbb',targetClassName:{bn:'দশম শ্রেণি'},
    from:{id:'aaaaaaaaaaaaaaaaaaaaaaaa',name:{bn:'নবম শ্রেণি'}},effectiveMonth:ym(2025,12)}),/BEFORE_START/,
  'a class cannot be joined before the student enrolled');
// A class that has gone leaves the timeline without a name it cannot print, rather than an empty one.
const nameless=planClassTransfer({classGroup:'aaaaaaaaaaaaaaaaaaaaaaaa',startMonth,classHistory:[]},
  {targetClassId:'bbbbbbbbbbbbbbbbbbbbbbbb',targetClassName:{bn:'দশম শ্রেণি',en:'Class Ten'},
    from:{id:'aaaaaaaaaaaaaaaaaaaaaaaa',name:{bn:''}},effectiveMonth:ym(2026,4)});
assert.equal(nameless.classHistory.length,1,'a leaving class with no name to carry is not backfilled');

/* ── F-03 · a price takes effect from a month ─────────────────────────────────────────────────── */
const paid:Record<string,number>={[monthKey(2026,1)]:1000,[monthKey(2026,2)]:1000,[monthKey(2026,3)]:1000};
const priced=planFeeChange({startMonth,feeHistory},
  {amount:1200,effectiveMonth:ym(2026,4),today:ym(2026,4),payments:paid,reason:'বার্ষিক বৃদ্ধি',
    actorId:'actor-1',now:new Date('2026-04-03T00:00:00Z')});
assert.equal(priced.feeHistory.length,2,'a change of price is a line added, never a line edited');
assert.deepEqual(priced.feeHistory[0],{effectiveFrom:startMonth,amount:1000},
  'the price the earlier months were billed at is untouched');
assert.equal(priced.feeHistory[1].amount,1200,'the new price is the one the line carries');
assert.deepEqual(priced.feeHistory[1].effectiveFrom,ym(2026,4),'from the month the operator picked');
assert.equal(priced.feeHistory[1].reason,'বার্ষিক বৃদ্ধি','with the reason, who and when beside it');
// Each month is billed at the price that month had — the engine's own reading of the same history.
const asFeeChange=priced.feeHistory.map(step=>({effectiveFrom:step.effectiveFrom,amount:step.amount}));
const billedAt=(month:YearMonth,nowPaid:Record<string,number>):number=>
  monthStatus({month,startMonth,feeHistory:asFeeChange,paid:nowPaid[monthKey(month.year,month.month)]||0,now:on(2026,4)}).fee;
assert.equal(billedAt(ym(2026,3),paid),1000,'March is still billed at the old price');
assert.equal(billedAt(ym(2026,4),paid),1200,'and April at the new one');
const afterPrice=calculateStudentDues({startMonth,feeHistory:asFeeChange,holds:[],status:'active',payments:paid,waivers:new Set()},on(2026,4));
assert.deepEqual(afterPrice.months.map(row=>[row.month,row.due]),[[4,1200]],
  'the month the new price took effect is owed at the new price, and the settled months are owed nothing');
// …and a price may not reach back over money the centre has taken.
assert.deepEqual(settledMonthInRange(paid,ym(2026,2),ym(2026,4)),ym(2026,2),
  'the first settled month in the range is the one a refusal names');
assert.equal(settledMonthInRange(paid,ym(2026,4),ym(2026,4)),null,'a month with nothing taken is free to re-price');
assert.throws(()=>planFeeChange({startMonth,feeHistory},
  {amount:1200,effectiveMonth:ym(2026,2),today:ym(2026,4),payments:paid}),/SETTLED_MONTH/,
  'a change of price from a month already settled is refused, so no receipt is reinterpreted');
assert.throws(()=>planFeeChange({startMonth,feeHistory},
  {amount:1200,effectiveMonth:ym(2025,12),today:ym(2026,4),payments:{}}),/BEFORE_START/,
  'and so is a price that starts before the student enrolled');
for(const amount of [-1,1.5,100000001,Number.NaN])
  assert.throws(()=>planFeeChange({startMonth,feeHistory},{amount,effectiveMonth:ym(2026,5),today:ym(2026,4)}),
    /INVALID_FEE/,`${amount} taka is not a price`);
// A price for a month nobody has reached yet leaves this month at the price it has.
const future=planFeeChange({startMonth,feeHistory},{amount:1500,effectiveMonth:ym(2026,6),today:ym(2026,4),payments:paid});
assert.equal(monthStatus({month:ym(2026,4),startMonth,feeHistory:future.feeHistory,paid:0,now:on(2026,4)}).fee,1000,
  'a price written for June does not re-price April');
assert.equal(monthStatus({month:ym(2026,6),startMonth,feeHistory:future.feeHistory,paid:0,now:on(2026,6)}).fee,1500,
  'and June takes the price written for it');
/* …and the screens that QUOTE a price ask the same question, because a quote that reads the last line of
   a history quotes a price the centre has not started billing — the number a phone call would give out,
   with no receipt behind it yet. */
assert.equal(feeInMonth(future.feeHistory,ym(2026,4)),1000,'April is quoted at the price April is on');
assert.equal(feeInMonth(future.feeHistory,ym(2026,5)),1000,'and so is May, the month before the new price arrives');
assert.equal(feeInMonth(future.feeHistory,ym(2026,6)),1500,'while June is quoted at the price written for it');
assert.equal(feeInMonth(priced.feeHistory,ym(2026,4)),1200,'and a price that has arrived is the price quoted');
assert.equal(feeInMonth([{effectiveFrom:ym(2026,6),amount:1500},{effectiveFrom:startMonth,amount:1000}],ym(2026,4)),1000,
  'a history stored out of order is still read by the month each line takes effect from');
assert.equal(feeInMonth([{effectiveFrom:ym(2026,6),amount:1500}],ym(2026,4)),1500,
  'and a record whose only line has not arrived quotes that line, because it is the only price the record has');
assert.equal(feeInMonth([],ym(2026,4)),0,'while a record with no price at all quotes none');
// The record a door hands a planner is the record it saved: nothing is mutated on the way through.
const before:HoldRow[]=[{start:ym(2026,2),reason:'পুরনো'}];
const frozen=settled(before);
planHold({status:'active',holds:before},{fromMonth:ym(2026,5)});
assert.deepEqual(before,frozen,'a planner adds a line; it does not rewrite the lines the record already held');
const historyBefore:ClassStepRow[]=[{classGroup:'aaaaaaaaaaaaaaaaaaaaaaaa',effectiveFrom:startMonth}];
const historyFrozen=settled(historyBefore);
planClassTransfer({classGroup:'aaaaaaaaaaaaaaaaaaaaaaaa',startMonth,classHistory:historyBefore},
  {targetClassId:'bbbbbbbbbbbbbbbbbbbbbbbb',targetClassName:{bn:'দশম শ্রেণি'},
    from:{id:'aaaaaaaaaaaaaaaaaaaaaaaa',name:{bn:'নবম শ্রেণি'}},effectiveMonth:ym(2026,4)});
assert.deepEqual(historyBefore,historyFrozen,'and the same holds for the class timeline');

/* ── the three doors exist, and each one writes what its rule says ─────────────────────────────── */
const actions=readFileSync('src/actions/center-students.ts','utf8');
for(const name of ['setStudentHold','transferStudentClass','updateStudentMonthlyFee'])
  assert.ok(actions.includes(`export async function ${name}(`),
    `${name} is a server action, and an async one: a 'use server' file may export nothing else`);
const door=(name:string):string=>{
  const at=actions.indexOf(`export async function ${name}(`);
  assert.ok(at>=0,`${name} is missing`);
  const next=actions.indexOf('\nexport async function',at+1);
  return actions.slice(at,next<0?actions.length:next);
};
const hold=door('setStudentHold');
assert.ok(hold.includes('planHold(')&&hold.includes('planLift('),'the hold door is the two planners, not a status flag');
assert.ok(hold.includes("student.set('holds'")&&hold.includes("student.set('status'"),'and it writes the range beside the status');
assert.ok(hold.includes('centerStudentHoldSchema.safeParse'),'the month it is handed is parsed, not trusted');
assert.ok(hold.includes(`'student.hold'`)&&hold.includes(`'student.unhold'`),'each direction writes its own audit line');
assert.ok(hold.includes('acquireCenterLocks'),'and the write is taken under the lock the student is written by');
/* A door hands the planner the record's own rows whole. A pause carries the name of whoever wrote it and
   the record requires that name, so the picked-over copy the hold door used to hand over — start, end,
   reason, when — was refused by the very record it was closing: the door answered "not saved" and no
   lift of a stored pause could be written at all. The other two doors carry their stamps for the same
   reason, because a timeline or a price history that forgets who made its earlier lines is a record
   nobody can trust. */
assert.ok(hold.includes('recordedBy:stampOf(entry.recordedBy),endedBy:stampOf(entry.endedBy)'),
  'the hold door reads a stored pause whole: the operator who wrote it, and whoever closed it');
const transfer=door('transferStudentClass');
assert.ok(transfer.includes('planClassTransfer('),'the transfer door is the planner');
assert.ok(transfer.includes('student.classGroup=new mongoose.Types.ObjectId'),'it moves the roll the student is on');
assert.ok(transfer.includes(`student.set('classHistory'`),
  'writes the timeline the profile prints');
assert.ok(transfer.includes('refreshClass(from)')&&transfer.includes('refreshClass(to)'),
  'and re-reads both the class the student left and the one they arrived on');
assert.ok(transfer.includes('active:true'),'a class the centre does not run takes no student');
assert.ok(transfer.includes("'student.transfer'"),'and the move writes its audit line');
const feeDoor=door('updateStudentMonthlyFee');
assert.ok(feeDoor.includes('planFeeChange(')&&feeDoor.includes('settledMonthInRange('),
  'the fee door is the planner and the rule that keeps it out of the past');
assert.ok(feeDoor.includes("student.set('feeHistory'"),'it adds a line to the price history');
assert.ok(feeDoor.includes("type:'monthly',status:'valid'"),'and it reads the money the centre has actually taken');
assert.ok(feeDoor.includes("'student.fee'"),'the change of price writes its audit line');
assert.ok(transfer.includes('changedBy:stampOf(entry.changedBy),changedAt:entry.changedAt'),
  'the move door keeps the stamp on every line the timeline already held');
assert.ok(feeDoor.includes('changedBy:stampOf(entry.changedBy),changedAt:entry.changedAt'),
  'and the price door keeps the stamp on every price already written');
for(const name of ['setStudentHold','transferStudentClass','updateStudentMonthlyFee'])
  assert.ok(door(name).includes('revision+=1'),`${name} moves the revision a concurrent edit is refused by`);

/* ── the dues read counts a paused student's arrears, and the message read does not ────────────── */
const query=readFileSync('src/lib/center/dues-query.ts','utf8');
assert.ok(query.includes("{$in:['active','on_hold']}"),
  'both dues reads take the paused roll as well as the running one, or a pause would hide the arrears');
assert.ok(query.includes('scope.held===false'),
  'and one option reads the running roll only, which is what a fee message is composed from');
const summary=readFileSync('src/lib/center/dues-query.ts','utf8');
assert.ok(summary.includes('feeInMonth(student.feeHistory,today)'),
  'the all-class summary quotes the price a class runs at, not the last price anybody wrote for it');
const hub=readFileSync('src/app/[locale]/admin/students/classes/[id]/page.tsx','utf8');
assert.ok(hub.includes('feeInMonth(student.feeHistory,{year,month})'),
  'and the class hub quotes it the same way, so the two screens cannot give a guardian two numbers');
const engine=readFileSync('src/lib/center/dues.ts','utf8');
assert.ok(engine.includes("if(s.status==='removed')")&&!engine.includes("if(s.status!=='active')"),
  'the engine takes a paused student out of no count: only a student the centre stopped running leaves it');
assert.ok(engine.includes("if(s.status==='on_hold'&&!s.holds.some("),
  'and the one pause it still counts for nothing is the flag this replaced, which has no month to bill up to');
const search=readFileSync('src/actions/center-students.ts','utf8');
assert.ok(search.includes('heldNoMonth')&&search.includes("dues:s.status==='removed'||heldNoMonth"),
  'a row the fee run cannot place reads "not counted" rather than "no dues", because the second reads as settled');
const rowSource=readFileSync('src/components/admin/students-row.tsx','utf8');
assert.ok(rowSource.includes("'row.holdNoMonth'"),
  'and the row says why in its own sentence, with the way out of it: give the pause its month');
const source=readFileSync('src/lib/center/sms-source.ts','utf8');
assert.equal((source.match(/\{held:false\}/g)||[]).length,2,
  'both of the SMS source\'s dues reads ask for the running roll only');

/* F-01 is not finished when the arrears are visible: a number the desk will not take is a number the
   centre never receives. The gate on a month cell is the month's own status — a held month is never
   billed, so it stays closed — and the student's status no longer closes the whole form. */
const desk=readFileSync('src/components/admin/center-daily-collection.tsx','utf8');
assert.ok(desk.includes("disabled={['HELD','WAIVED','NOT_APPLICABLE'].includes(m.status)}"),
  'a month cell on the cash desk is closed by its own status, so every month inside a pause stays closed');
assert.ok(!desk.includes("disabled={busy||student.status==='on_hold'"),
  'and the pause itself no longer deadens Save: the months owed before it are money the centre can still take');
assert.ok(desk.includes("{t('heldNote')}"),'with the sentence that says which months a pause closes');

/* ── F-18 · a month is spelled from the catalogs, not from the host's ICU tables ───────────────── */
const months=(bnMessages.common.months as Record<string,string>);
/* The twelve words the provider hands a screen: the formatter takes them as an argument, because the
   module that formats is reached from a client component and must not import the catalog itself. */
const monthWords=monthNames(months as MonthTable);
const order=['january','february','march','april','may','june','july','august','september','october','november','december'];
for(const [index,key] of order.entries()){
  const date=`2026-${String(index+1).padStart(2,'0')}-14`;
  assert.equal(achievementDateBn(date,monthWords),`১৪ ${months[key]} ২০২৬`,
    `${date} reads the catalog's own spelling of ${key}`);
}
assert.equal(achievementDateBn('2026-01-01',monthWords),'১ জানুয়ারি ২০২৬','a day is read in Bangla digits and without a leading zero');
assert.equal(achievementDateBn('2026-02-31',monthWords),'','a day that did not happen is no date at all');
for(const refused of ['','2026-1-14','14-01-2026','2026-01','not-a-date'])
  assert.equal(achievementDateBn(refused,monthWords),'',`"${refused}" is refused rather than formatted into something plausible`);
const dateSource=readFileSync('src/lib/achievement-date.ts','utf8');
assert.ok(!dateSource.includes('new Intl.DateTimeFormat'),
  'the card\'s date no longer asks a locale what a month is called: ICU writes জানুয়ারী where the catalog writes জানুয়ারি');
assert.ok(!dateSource.includes('@/messages/bn.json'),
  'and it does not import the catalog to get them: this module is reached from a client component, so an '
  +'import here would ship every sentence in bn.json to the browser and answer the build with a warning '
  +'per key \u2014 which is how a build that succeeded stopped saying "Compiled successfully"');
assert.equal(monthWords.length,12,'the twelve names a provider hands over are the twelve the formatter wants');
/* A class timeline line has to be storable for the records the centre already has: both import paths
   write one with no name on it, so the name is optional with an empty default and the doors fill it. */
const model=readFileSync('src/models/CenterRecords.ts','utf8');
assert.ok(model.includes('name:wornName'),'the timeline stores the name a class wore as an optional word');
assert.ok(model.includes("const wornName={bn:{type:String,default:''"),
  'and a line written before this slice — or by an import — is not refused for want of one');
const enrol=readFileSync('src/actions/center-students.ts','utf8');
assert.ok(enrol.includes('classHistory:[{classGroup:p.classGroup,name:{bn:current.name.bn'),
  'and an enrolment writes the first line of the timeline with the name the class wore that day, so the '
  +'line a profile prints never has to guess it');
const cardSource=readFileSync('src/components/achievements/card.tsx','utf8');
assert.ok(cardSource.includes("monthNames(useTranslations('common').raw('months')")
  &&cardSource.includes('achievementDateBn(data.date,months)'),
  'the card asks the provider it is already under for the twelve names and hands them to the formatter');
const published=readFileSync('src/app/[locale]/achievements/[slug]/page.tsx','utf8');
assert.ok(published.includes("getTranslations('common')")&&published.includes('achievementDateBn(item.date,monthWords)'),
  'and the published page reads the same twelve from its own catalog');

console.log('Student money core: a pause is a range that stops the meter without forgiving the arrears before it, '+
  'lifting one back-bills nothing, a move writes the class timeline and moves the roll, a price takes effect from its '+
  'month and never reaches a settled one, the three doors write all of it under a lock with an audit line, and the '+
  'achievement card spells its month from the catalog.');
