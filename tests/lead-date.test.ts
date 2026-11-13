/**
 * R3.2 · Visitor leads: reading the sheet's dates. Pure module, no database.
 *
 * The Visitor sheet is handwritten, so a date arrives as `2/12/2024`, `15.12.24`, `2-12-24`, in Bangla
 * digits, or as a real Date from an xlsx cell. One rule reads all of them — day first, two-digit years
 * mean 20xx — and every doubtful case is reported rather than repaired: an ambiguous day/month pair is
 * named as ambiguous, an impossible date is refused, and a year that disagrees with the rest of the
 * sheet is flagged with a *suggested* fix that nothing applies by itself.
 */
import assert from 'node:assert/strict';
import {parseSheetDate,flagSuspiciousYears} from '../src/lib/leads/lead-date';

const now=new Date('2026-11-12T10:00:00+06:00');
const day=(raw:unknown,at:Date=now)=>{const result=parseSheetDate(raw,at);assert.equal(result.ok,true,`"${String(raw)}" is read`);return result};

function run(){
  // ---- 1. The brief's own messy spellings, all read day-first.
  assert.equal(day('2/12/2024').day,'2024-12-02','day first: 2 December, not 12 February');
  assert.equal(day('2/12/2024').ambiguous,true,'and because both parts could be a month, the reading is reported as ambiguous, not quietly chosen');
  assert.equal(day('15.12.24').day,'2024-12-15','a dot separator and a two-digit year');
  assert.equal(day('15.12.24').ambiguous,false,'15 cannot be a month, so nothing is ambiguous');
  assert.equal(day('2-12-24').day,'2024-12-02','a dash separator');
  assert.equal(day('15/12/2024').day,'2024-12-15');
  assert.equal(day('২/১২/২০২৪').day,'2024-12-02','Bangla digits read as digits');
  assert.equal(day(' 2 / 12 / 2024 ').day,'2024-12-02','stray spaces are separators, not information');
  assert.equal(day('2024-12-02').day,'2024-12-02','an ISO cell has no ambiguity to resolve');
  assert.equal(day('2024-12-02').format,'iso');
  assert.equal(day('2024-12-02T18:30:00').day,'2024-12-02','and a timestamped one keeps its day');
  assert.equal(day(new Date('2024-12-02T00:00:00Z')).day,'2024-12-02','an xlsx cell arrives as a real date at UTC midnight and is still that day in Dhaka');
  assert.equal(day(new Date('2024-12-02T00:00:00Z')).format,'cell');
  assert.equal(day('1/1/24').day,'2024-01-01','a two-digit year means 20xx');
  assert.equal(day('1/1/99').day,'2099-01-01','by rule, even when the result is absurd — which the future flag then names');
  assert.ok(day('1/1/99').flags.some(flag=>flag.code==='future'),'an absurd year is flagged at the row, not silently accepted');

  // ---- 2. A month written first is read only when it is the only possible reading, and says so.
  const swapped=day('12/25/2024');
  assert.equal(swapped.day,'2024-12-25','25 cannot be a month, so this row was written month-first');
  assert.equal(swapped.format,'month-first');
  assert.equal(swapped.ambiguous,true,'and the exception is reported rather than absorbed');

  // ---- 3. Impossible and unreadable dates are refused, never rolled into a real one.
  for(const [raw,reason] of [['31/02/2024','impossible'],['31/11/2024','impossible'],['0/12/2024','impossible'],['32/12/2024','impossible']] as const){
    const result=parseSheetDate(raw,now);
    assert.equal(result.ok,false,`"${raw}" is refused`);
    assert.equal(result.reason,reason);
    assert.equal(result.raw,raw,'with the text the owner actually wrote');
    if(result.ok===false)assert.ok(result.messageBn&&result.messageEn,'and a sentence in both languages');
  }
  const impossible=parseSheetDate('31/02/2024',now);
  assert.equal(impossible.ok,false);
  assert.match(impossible.messageBn,/ক্যালেন্ডারে এই দিন নেই/,'the refusal says the calendar has no such day');
  for(const raw of ['abc','15/12','2024','','   ',null,undefined,'১৫/১২']){
    const result=parseSheetDate(raw,now);
    assert.equal(result.ok,false,`"${String(raw)}" is not a date`);
    assert.equal(result.reason,String(raw||'').trim()?'unparseable':'empty');
  }
  const oldYear=parseSheetDate('1/1/1999',now);
  assert.equal(oldYear.ok,false,'a four-digit year outside 2000–2100 is refused');
  assert.match(oldYear.messageEn,/outside the range/,'and is not told it was read as 20xx, which would be a lie');

  // ---- 4. Row-level doubt is named: the future, and a date far older than any live lead.
  assert.ok(day('2026-11-20').flags.some(flag=>flag.code==='future'),'a date after today is flagged');
  assert.equal(day('2026-11-12').flags.length,0,'today is not in the future');
  assert.ok(day('2019-01-05').flags.some(flag=>flag.code==='very_old'),'a date more than five years old is flagged');
  assert.equal(day('2024-12-02').flags.length,0,'and an ordinary recent visit has nothing to report');

  // ---- 5. A year that disagrees with the sheet is flagged with a suggestion — and nothing is changed.
  const rows=[
    {id:'a',day:'2024-12-02'},{id:'b',day:'2024-12-03'},{id:'c',day:'2024-11-28'},
    {id:'d',day:'2024-12-05'},{id:'e',day:'2014-12-04'},
  ];
  const flagged=flagSuspiciousYears(rows,now);
  assert.deepEqual(Object.keys(flagged),['e'],'one row disagrees with the other four');
  assert.equal(flagged.e.code,'year_out_of_range');
  assert.equal(flagged.e.suggested,'2024-12-04','the suggestion is the sheet’s own year with the same month and day');
  assert.match(flagged.e.messageBn,/মেলে না/,'and the sentence says the year does not match the rest of the sheet');
  assert.equal(rows[4].day,'2014-12-04','the row itself was not touched — a suggestion is not a fix');
  assert.deepEqual(flagSuspiciousYears([{id:'a',day:'2024-12-02'},{id:'b',day:'2014-12-02'}],now),{},'a tie has no majority to appeal to, so nothing is flagged rather than a winner picked');
  assert.deepEqual(flagSuspiciousYears([{id:'a',day:null},{id:'b',day:'2024-12-02'}],now),{},'an unreadable date is not a suspicious year');
  assert.deepEqual(flagSuspiciousYears([],now),{},'and an empty sheet has nothing to say');
  const futureSuggestion=flagSuspiciousYears([
    {id:'a',day:'2026-01-05'},{id:'b',day:'2026-01-06'},{id:'c',day:'2026-01-07'},
    {id:'d',day:'2026-01-08'},{id:'e',day:'2025-12-30'},
  ],now);
  assert.equal(futureSuggestion.e.suggested,undefined,'a suggestion that would land in the future is not offered');
  assert.equal(futureSuggestion.e.code,'year_out_of_range','though the doubt itself is still named');

  console.log('Visitor sheet dates: the brief’s own spellings (2/12/2024, 15.12.24, 2-12-24, Bangla digits, ISO, a real xlsx cell) are all read day-first with two-digit years as 20xx, an ambiguous day/month pair is named as ambiguous rather than quietly chosen, and a month-first row is read only when it is the only possible reading and reports the exception; impossible dates (31/02, 31/11, day 0) and unreadable ones are refused with the owner’s own text and a sentence in both languages, and a four-digit year outside 2000–2100 is not told it was read as 20xx; a future or five-year-old date is flagged on its row; and a year that disagrees with the rest of the sheet is flagged with the sheet’s own year suggested — never applied, never suggested into the future, and never flagged when there is no majority.');
}

run();
