/**
 * R2 · Quiet hours. Pure module, evaluated in Asia/Dhaka. The default window (21:00 → 07:00)
 * crosses midnight, so a naive start<=t<end comparison would be wrong for most of the night; both
 * orders, invalid settings and the "when does the queue flush" arithmetic are pinned here.
 */
import assert from 'node:assert/strict';
import {DEFAULT_QUIET_END,DEFAULT_QUIET_START,inQuietHours,msUntilQuietEnds,parseClock,quietUntilLabel} from '../src/lib/center/sms-quiet';

/** A wall-clock moment in Dhaka, independent of the machine's own timezone. */
const at=(hhmm:string):Date=>new Date(`2026-11-12T${hhmm}:00+06:00`);

function run(){
  assert.deepEqual([DEFAULT_QUIET_START,DEFAULT_QUIET_END],['21:00','07:00'],'the shipped default is 21:00 to 07:00');

  // 1. The midnight-crossing default window.
  for(const [time,expected] of [['20:59',false],['21:00',true],['22:30',true],['23:59',true],['00:00',true],['03:00',true],['06:59',true],['07:00',false],['12:00',false],['18:00',false]] as [string,boolean][]){
    assert.equal(inQuietHours('21:00','07:00',at(time)),expected,`${time} Dhaka in the default window`);
  }

  // 2. A same-day window behaves the other way round.
  assert.equal(inQuietHours('01:00','05:00',at('02:00')),true);
  assert.equal(inQuietHours('01:00','05:00',at('06:00')),false);
  assert.equal(inQuietHours('01:00','05:00',at('23:00')),false,'a same-day window must not swallow the night');

  // 3. Bad or empty settings disable quiet hours rather than blocking every send.
  for(const [start,end] of [['25:00','07:00'],['21:00','99:99'],['abc','07:00'],['','' ],['21:00','7 PM']]){
    assert.equal(inQuietHours(start,end,at('23:00')),false,`invalid ${start}–${end} must not block sending`);
  }
  assert.equal(inQuietHours('21:00','21:00',at('23:00')),false,'an empty window (start equals end) blocks nothing');
  assert.equal(inQuietHours(undefined,undefined,at('23:00')),true,'omitted settings fall back to the documented default');

  // 4. Parsing never guesses a time.
  assert.equal(parseClock('21:00'),1260);
  assert.equal(parseClock('07:05'),425);
  assert.equal(parseClock('7:05'),425);
  assert.equal(parseClock('24:00'),null);
  assert.equal(parseClock('12:60'),null);
  assert.equal(parseClock(''),null);
  assert.equal(parseClock(undefined),null);

  // 5. The queue flush time: from 22:30 the window closes at 07:00, i.e. 8.5 hours later.
  assert.equal(msUntilQuietEnds('21:00','07:00',at('22:30')),8.5*60*60*1000);
  assert.equal(msUntilQuietEnds('21:00','07:00',at('03:00')),4*60*60*1000,'four hours left at 03:00');
  assert.equal(msUntilQuietEnds('21:00','07:00',at('12:00')),0,'nothing to wait for outside the window');
  assert.equal(quietUntilLabel('07:00'),'07:00');
  assert.equal(quietUntilLabel('7:05'),'07:05');
  assert.equal(quietUntilLabel('nonsense'),DEFAULT_QUIET_END,'an unparsable setting still shows a real time');

  console.log('SMS quiet hours: the midnight-crossing 21:00–07:00 default and a same-day window are both evaluated correctly in Dhaka time, invalid or empty settings disable quiet hours instead of blocking sends, and the queue flush time is computed exactly.');
}

run();
