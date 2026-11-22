/**
 * O1 · the routine's own arithmetic: a period's length, the chain that adds the next one, and the two
 * clocks a time is read on.
 *
 * The centre's paper schedule is three fifty-minute periods back to back — 09:20 to 10:10, 10:10 to
 * 11:00, 11:00 to 11:50 in the morning shift, 12:00 to 12:50, 12:50 to 13:40, 13:40 to 14:30 in the
 * day shift, 15:30 to 16:20, 16:20 to 17:10, 17:10 to 18:00 in the evening — and every one of those
 * numbers is asserted below as the arithmetic that produces it, not as a table somebody typed twice.
 *
 * What has to stay true:
 *   · a length is offered in chips and the end follows the start, so writing 09:20 with fifty minutes
 *     on the chip writes 10:10 without anybody doing the sum in their head;
 *   · the minutes are offered in five-minute steps, because a class starts at 09:20 and not at 09:00;
 *   · the next period of a day starts when the day's last one ends and is numbered one past the day's
 *     highest number, whichever order the periods were written in;
 *   · nothing wraps past midnight into an end that reads before its own start;
 *   · a time can be read on a twelve-hour clock and on a twenty-four hour one, and both readings are
 *     numbers folded into the screen's digits rather than Bangla written into a component.
 *
 * Run: npx tsx tests/routine-period-time.test.ts
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_PERIOD_MINUTES,MINUTE_STEP,MINUTE_STEPS,PERIOD_DURATIONS,clock12Word,clockMinutes,clockOfMinutes,
  durationMinutes,endAfter,hour12Of,nextPeriodSeed,presetFor,
} from '../src/lib/routine/time';

// ── The chips: what a period may be offered in ───────────────────────────────────────────────────
assert.deepEqual([...PERIOD_DURATIONS],[50,45,40,60],'the chips are fifty, forty-five, forty and sixty minutes, fifty first');
assert.equal(DEFAULT_PERIOD_MINUTES,50,'fifty minutes is the chip already pressed on a new period');
assert.ok(PERIOD_DURATIONS.every(minutes=>minutes%MINUTE_STEP===0),'every offered length lands on a five-minute step');
assert.deepEqual([...MINUTE_STEPS],[0,5,10,15,20,25,30,35,40,45,50,55],'the minutes are all twelve five-minute steps');
assert.equal(MINUTE_STEP,5,'and the step the picker offers is the step the chain counts in');

// ── The paper schedule, produced rather than typed ───────────────────────────────────────────────
const shifts:Record<string,string>={
  morning:'09:20',day:'12:00',evening:'15:30',
};
for(const [shift,first] of Object.entries(shifts)){
  let start=first;
  for(const index of [1,2,3]){
    const end=endAfter(start,DEFAULT_PERIOD_MINUTES);
    assert.equal(durationMinutes(start,end),50,`${shift} shift period ${index} runs fifty minutes`);
    assert.equal(presetFor(start,end),50,'and the fifty-minute chip is the one that says so');
    start=end;
  }
}
assert.equal(endAfter('09:20',50),'10:10','09:20 and fifty minutes is 10:10');
assert.equal(endAfter('10:10',50),'11:00','10:10 and fifty minutes is 11:00');
assert.equal(endAfter('11:00',50),'11:50','11:00 and fifty minutes is 11:50');
assert.equal(endAfter('12:50',50),'13:40','the day shift reads 12:50 to 01:40 on a twelve-hour clock');
assert.equal(endAfter('17:10',50),'18:00','and the evening shift ends at six');

// ── The other chips, and a length no chip names ─────────────────────────────────────────────────
assert.equal(endAfter('09:20',45),'10:05','forty-five minutes from 09:20 is 10:05');
assert.equal(endAfter('09:20',40),'10:00','forty minutes from 09:20 is 10:00');
assert.equal(endAfter('09:20',60),'10:20','and sixty minutes from 09:20 is 10:20');
assert.equal(presetFor('09:20','10:05'),45,'a period of forty-five minutes presses that chip');
assert.equal(presetFor('09:20','10:00'),40,'a period of forty minutes presses that one');
assert.equal(presetFor('09:20','10:20'),60,'and so does the hour');
assert.equal(presetFor('09:20','10:15'),null,'a period of fifty-five minutes is nobody\'s preset: the custom chip is on');
assert.equal(presetFor('09:20','09:20'),null,'a period with no length at all presses no chip');
assert.equal(endAfter('09:20',0),'10:10','a length that is not a length falls back to the default rather than writing the start as the end');
assert.equal(endAfter('not a time',50),'not a time','and a start that is not a clock is handed back untouched');

// ── A day ends at midnight, and a period does not run past it ────────────────────────────────────
assert.equal(endAfter('23:30',50),'23:55','a period that would run past midnight ends on the last step of the day');
assert.ok(clockMinutes(endAfter('23:30',50))>clockMinutes('23:30'),'so its end is still after its start');
assert.equal(clockOfMinutes(clockMinutes('23:55')),'23:55','the last step of the day is a time the record can hold');

// ── The chain: what "+ the next period" prefills ─────────────────────────────────────────────────
const morning=[
  {start:'09:20',end:'10:10',order:1},
  {start:'10:10',end:'11:00',order:2},
];
assert.deepEqual(nextPeriodSeed(morning),{start:'11:00',end:'11:50',order:3},
  'the third period of the morning starts when the second ends, runs fifty minutes and is numbered three');
assert.deepEqual(nextPeriodSeed([morning[0]]),{start:'10:10',end:'11:00',order:2},
  'the second starts at the first one\'s end and is numbered two');
assert.deepEqual(nextPeriodSeed([]),{start:'08:00',end:'08:50',order:1},
  'a day with nothing on it starts at the drawer\'s own default and is numbered one');
assert.deepEqual(nextPeriodSeed([],50,'09:20'),{start:'09:20',end:'10:10',order:1},
  'and a screen that knows the shift\'s first period starts the day there instead');
assert.deepEqual(nextPeriodSeed(morning,45),{start:'11:00',end:'11:45',order:3},
  'the chain follows whichever chip is pressed');

/* The day's own end, not the row the operator wrote last: a period added out of order still chains
   from the end of the day, and a sequence written by hand still counts. */
const unordered=[
  {start:'11:00',end:'11:50',order:3},
  {start:'09:20',end:'10:10',order:1},
  {start:'10:10',end:'11:00',order:7},
];
assert.deepEqual(nextPeriodSeed(unordered),{start:'11:50',end:'12:40',order:8},
  'the chain reads the latest end of the day and numbers the next period one past the highest');
assert.deepEqual(nextPeriodSeed([{start:'09:20',end:'not a time',order:1}],50,'09:20'),
  {start:'09:20',end:'10:10',order:2},
  'an end that is not a clock is left out of the chain rather than poisoning it, and the order still counts');

// ── Two clocks for one time ─────────────────────────────────────────────────────────────────────
assert.equal(hour12Of(0),12,'midnight reads twelve on a twelve-hour clock');
assert.equal(hour12Of(12),12,'and so does noon');
assert.equal(hour12Of(9),9,'nine in the morning reads nine');
assert.equal(hour12Of(15),3,'three in the afternoon reads three');
assert.equal(hour12Of(23),11,'eleven at night reads eleven');
assert.equal(clock12Word('09:20','en'),'9:20','a time on the twelve-hour clock drops the leading zero');
assert.equal(clock12Word('13:40','en'),'1:40','and reads the afternoon hour as its own');
assert.equal(clock12Word('00:05','en'),'12:05','midnight keeps its minutes');
assert.equal(clock12Word('15:30','bn'),'৩:৩০',
  'the same reading folded into Bangla digits, so no component has to hold a Bangla string to offer both clocks');
assert.equal(clock12Word('09:20','bn'),'৯:২০','০৯:২০ on the twenty-four hour clock is ৯:২০ on the twelve-hour one');
assert.equal(clock12Word('a typo','en'),'a typo','and a time that is not a clock is handed back as it came');

console.log('Routine period time: the fifty-minute chain, the chips, the five-minute steps, the midnight clamp and both clocks passed.');
