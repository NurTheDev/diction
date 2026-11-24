/**
 * Visitor message schedules — the day arithmetic and the words, without a database.
 *
 * The expensive mistakes on this screen are all date mistakes: a day that does not exist, a day that
 * has already passed, a year typed instead of a month. They are cheapest to prove here, before a
 * schedule is allowed to reach the send pipeline.
 */
import assert from 'node:assert/strict';
import bn from '../src/messages/bn.json';
import en from '../src/messages/en.json';
import {
  checkLeadScheduleDay,checkLeadScheduleMessage,leadScheduleClass,leadScheduleDay,leadScheduleInstant,
  LEAD_SCHEDULE_SEND_TIME,LEAD_SCHEDULE_STATUSES,LEAD_SCHEDULE_STATUS_LABEL_KEYS,
} from '../src/lib/leads/lead-schedule';
import {dhakaDay} from '../src/lib/admin/today';

// A fixed “now”: noon in Dhaka on 24 November 2026.
const NOW=new Date('2026-11-24T06:00:00.000Z');
assert.equal(dhakaDay(NOW),'2026-11-24');

// ── 1. A day is a real calendar day ─────────────────────────────────────────────────────────────
assert.equal(leadScheduleDay('2026-11-24'),'2026-11-24');
assert.equal(leadScheduleDay('2028-02-29'),'2028-02-29');
assert.equal(leadScheduleDay('2026-02-31'),null,'31 February is not a day');
assert.equal(leadScheduleDay('2026-13-01'),null,'month 13 is not a month');
assert.equal(leadScheduleDay('24/11/2026'),null,'the form sends ISO, not a local spelling');
assert.equal(leadScheduleDay(''),null);

// ── 2. The day can be scheduled, and means 07:05 Dhaka ──────────────────────────────────────────
const today=checkLeadScheduleDay('2026-11-24',NOW);
assert.equal(today.ok,true);
if(today.ok)assert.equal(today.at.toISOString(),'2026-11-24T01:05:00.000Z');
assert.equal(leadScheduleInstant('2026-12-12').toISOString(),'2026-12-12T01:05:00.000Z');

assert.deepEqual(checkLeadScheduleDay('2026-11-23',NOW),{ok:false,code:'PAST_DAY'});
assert.deepEqual(checkLeadScheduleDay('2026-02-31',NOW),{ok:false,code:'INVALID_DAY'});
assert.deepEqual(checkLeadScheduleDay('2028-03-01',NOW),{ok:false,code:'TOO_FAR'});
assert.equal(checkLeadScheduleDay('2027-11-24',NOW).ok,true,'a year out is the edge, not a typo');

// ── 3. The message half ─────────────────────────────────────────────────────────────────────────
assert.deepEqual(checkLeadScheduleMessage('visitor_thanks',''),{ok:true});
assert.deepEqual(checkLeadScheduleMessage('', ''),{ok:false,code:'INVALID_TEMPLATE'});
assert.deepEqual(checkLeadScheduleMessage('custom','   '),{ok:false,code:'EMPTY_MESSAGE'});
assert.deepEqual(checkLeadScheduleMessage('custom','x'.repeat(601)),{ok:false,code:'TEXT_TOO_LONG'});
assert.deepEqual(checkLeadScheduleMessage('custom','ডিকশন কোচিং'),{ok:true});

// ── 4. Class filter ─────────────────────────────────────────────────────────────────────────────
assert.equal(leadScheduleClass(''),null);
assert.equal(leadScheduleClass('9'),9);
assert.equal(leadScheduleClass('12'),12);
assert.equal(leadScheduleClass('0'),'INVALID');
assert.equal(leadScheduleClass('13'),'INVALID');
assert.equal(leadScheduleClass('nine'),'INVALID');

// ── 5. Every status has words in both catalogs ──────────────────────────────────────────────────
const resolve=(catalog:Record<string,unknown>,key:string):unknown=>
  key.split('.').reduce<unknown>((node,part)=>node&&typeof node==='object'?(node as Record<string,unknown>)[part]:undefined,catalog);
for(const status of LEAD_SCHEDULE_STATUSES){
  const key=`leads.${LEAD_SCHEDULE_STATUS_LABEL_KEYS[status]}`;
  assert.equal(typeof resolve(bn as Record<string,unknown>,key),'string',`${status} has a Bangla label`);
  assert.equal(typeof resolve(en as Record<string,unknown>,key),'string',`${status} has an English label`);
}

console.log(`Visitor schedules: days are real and Asia/Dhaka (${LEAD_SCHEDULE_SEND_TIME}), the past, the impossible and the year-away are refused before a write, an empty or over-long message never reaches the queue, and all ${LEAD_SCHEDULE_STATUSES.length} statuses speak both languages.`);
