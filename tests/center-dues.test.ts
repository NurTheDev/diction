/**
 * The dues engine, as pure arithmetic: Dhaka's own due day, a part-paid month, a month on hold, a price
 * that changed mid-year, a waiver, and the bounds the totals are kept inside.
 *
 * S1 changed two of the answers in this file, and both changes are F-01: a pause used to take the whole
 * student out of the count — a status of `on_hold`, or a pause covering Dhaka's current month, returned
 * nothing at all — so the moment a student was paused the months they owed BEFORE the pause disappeared
 * from the class's due list and from the centre's summary. A pause now stops the meter and nothing else:
 * the months inside it are `HELD` and are billed by nobody, and every month before it is still owed. The
 * one pause that is still counted for nothing is the flag this replaced — a record with no month on it
 * has no month to bill up to, and guessing one would invent a debt for the months the centre paused.
 */
import assert from 'node:assert/strict';
import {calculateStudentDues} from '../src/lib/center/dues';
const base={status:'active' as const,startMonth:{year:2026,month:1},feeHistory:[{effectiveFrom:{year:2026,month:1},amount:1000},{effectiveFrom:{year:2026,month:3},amount:1200}],holds:[{start:{year:2026,month:2},end:{year:2026,month:2}}],payments:{'2026-01':400,'2026-02':1000,'2026-03':300},waivers:new Set<string>()};
const onDueDay=calculateStudentDues(base,new Date('2026-03-10T06:00:00Z'));assert.equal(onDueDay.total,600);assert.deepEqual(onDueDay.months.map(x=>x.month),[1]);
const overdue=calculateStudentDues(base,new Date('2026-03-11T06:00:00Z'));assert.equal(overdue.total,1500);assert.equal(overdue.months[1].status,'DUE');
/* A pause opened over Dhaka's current month stops this month being billed — March is held, February was
   settled at the price it was settled at — and leaves January, which the pause does not reach, owed. */
const pausedNow=calculateStudentDues({...base,holds:[{start:{year:2026,month:3}}]},new Date('2026-03-11T06:00:00Z'));
assert.equal(pausedNow.total,600);assert.deepEqual(pausedNow.months.map(x=>x.month),[1],'a pause stops the meter; it does not forgive the months before it');
/* …and the same student read as `on_hold` owes exactly the same, because what a pause forgives is
   nothing: the two months the pause does not cover are the two months the centre is still owed. */
assert.equal(calculateStudentDues({...base,status:'on_hold'},new Date('2026-03-11T06:00:00Z')).total,1500);
/* A pause written before S1 was a flag and nothing else: `status:'on_hold'` with no months on the
   record. There is no month to bill up to and none to stop at, so such a student is counted for none of
   it rather than being billed for the very months the centre paused — a demand nobody could answer.
   Giving the pause its month, the first question the hold door now asks, is what puts the arrears from
   before it back on the list. */
const flagOnly=calculateStudentDues({...base,status:'on_hold',holds:[]},new Date('2026-03-11T06:00:00Z'));
assert.equal(flagOnly.total,0);assert.deepEqual(flagOnly.months,[],'a pause with no month on the record is counted for nothing, and says so on the row');
assert.equal(calculateStudentDues({...base,status:'removed'},new Date('2026-03-11T06:00:00Z')).total,0,'only a student the centre stopped running leaves the count');
assert.equal(calculateStudentDues({...base,waivers:new Set(['2026-03'])},new Date('2026-03-11T06:00:00Z')).total,600);
assert.throws(()=>calculateStudentDues({...base,startMonth:{year:2000,month:1}},new Date('2026-03-11T06:00:00Z')),/DUE_RANGE_UNSUPPORTED/);
console.log('Due calculations: Dhaka cutoff, partial, a pause that stops the meter without forgiving the arrears before it, a pause with no month counted for nothing, changed fees, waiver and bounded totals passed.');
