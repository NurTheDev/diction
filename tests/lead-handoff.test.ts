/**
 * R3.13 · The three hand-offs, as rules with no database in them.
 *
 * A visitor row can be sent on to an admission, booked into a trial, or closed as "not interested" —
 * and the third one is only allowed to close with a reason, because a status that ends a promise
 * without saying why is a row nobody can work afterwards. All three answers are readable here: what a
 * form is allowed to prefill, what stops a hand-off before it writes, which seat is still bookable,
 * and the shape of the reference a hand-off mints. The privacy half is the point of the module and is
 * asserted as such — a prefill is built from a lead that holds a real number, and the answer must carry
 * the mask and never the digits, because a prefill is served HTML.
 */
import assert from 'node:assert/strict';
import {
  HANDOFF_GRADES,HANDOFF_STATUS,NOT_INTERESTED_REASON_MAX,NOT_INTERESTED_REASON_MIN,
  admissionPrefill,bookableSlot,handoffBlock,handoffGrade,handoffReference,notInterestedReason,
  trialPrefill,type HandoffLead,
} from '../src/lib/leads/lead-handoff';
import {LEAD_STATUSES,maskPhone} from '../src/lib/leads/vocab';

const PHONE='01712817090';
const lead=(over:Partial<HandoffLead>={}):HandoffLead=>({
  id:'64b0000000000000000000a1',leadId:'V-2026-0007',studentName:'রহিম উদ্দিন',guardianName:'করিম উদ্দিন',
  school:'ঢাকা কলেজ',classGroup:9,phones:[{normalized:PHONE,original:PHONE}],
  admission:null,trialBooking:null,...over,
});

function run(){
  // 1. The three hand-offs land on statuses the vocabulary already carries. No fourth status is
  //    invented here, and no screen can drift into one: the words come from this table.
  assert.deepEqual([...HANDOFF_GRADES],['4','5','6','7','8','9','10','11','12'],'the admission range is the intake schema\'s own');
  for(const status of Object.values(HANDOFF_STATUS))
    assert.ok(LEAD_STATUSES.includes(status),`${status} is a status the vocabulary already has`);
  assert.equal(new Set(Object.values(HANDOFF_STATUS)).size,3,'three hand-offs, three distinct statuses');

  // 2. A prefill copies what the lead holds and MASKS the number. This is the privacy proof: the same
  //    lead that the write path reads a real number from hands the browser a mask and nothing else.
  const prefill=admissionPrefill(lead());
  assert.equal(prefill.studentName,'রহিম উদ্দিন');
  assert.equal(prefill.guardianName,'করিম উদ্দিন');
  assert.equal(prefill.school,'ঢাকা কলেজ');
  assert.equal(prefill.grade,'9','the lead\'s own class is offered, not a default');
  assert.equal(prefill.phoneMask,maskPhone(PHONE));
  assert.equal(prefill.hasPhone,true);
  const served=JSON.stringify({admission:prefill,trial:trialPrefill(lead())});
  assert.ok(!served.includes(PHONE),'no prefill carries the number it was built from');
  assert.ok(!/\d{11}/.test(served),'and no eleven digits of any kind');
  assert.ok(!/familyKey/i.test(served),'a family key is never part of a hand-off form');
  assert.ok(served.includes(maskPhone(PHONE)),'the mask is there, so the operator can see a number exists');

  // 3. A lead that holds nothing fills nothing: an empty prefill is honest, a guessed one is not.
  const empty=admissionPrefill(lead({guardianName:'',school:'',classGroup:null,phones:[]}));
  assert.equal(empty.guardianName,'');
  assert.equal(empty.school,'');
  assert.equal(empty.grade,'');
  assert.equal(empty.hasPhone,false);
  assert.equal(empty.phoneMask,'','no mask is invented for a lead with no number');

  // 4. The class the admission form accepts starts at 4, so a lead in class 3 offers no grade at all
  //    rather than a grade the intake schema would reject.
  assert.equal(handoffGrade(4),'4');
  assert.equal(handoffGrade(12),'12');
  assert.equal(handoffGrade(3),'','below the admission range');
  assert.equal(handoffGrade(13),'','above it');
  assert.equal(handoffGrade(null),'');

  // 5. What stops a hand-off before it writes — read off the lead alone, so a button can be switched
  //    off with its reason instead of letting an operator fill a form in and discover it afterwards.
  const converted=handoffBlock(lead({admission:'64b0000000000000000000b1'}),'admission');
  assert.equal(converted?.code,'ALREADY_CONVERTED');
  assert.ok(converted!.messageBn.includes('ভর্তি')&&converted!.messageEn.toLowerCase().includes('admission'));
  assert.equal(handoffBlock(lead({admission:'64b0000000000000000000b1'}),'trial'),null,'an admission does not close the trial');
  const booked=handoffBlock(lead({trialBooking:'64b0000000000000000000b2'}),'trial');
  assert.equal(booked?.code,'ALREADY_BOOKED');
  assert.ok(booked!.messageBn.includes('ট্রায়াল')&&booked!.messageEn.toLowerCase().includes('trial'));
  assert.equal(handoffBlock(lead({phones:[]}),'admission')?.code,'NO_PHONE');
  assert.equal(handoffBlock(lead({phones:[]}),'trial')?.code,'NO_PHONE','neither hand-off can be opened without a number to reach');
  assert.equal(handoffBlock(lead(),'admission'),null);
  assert.equal(handoffBlock(lead(),'trial'),null);

  // 6. "Not interested" needs a reason: empty, whitespace, and too short are three refusals, and a
  //    reason that is long enough is filed trimmed and with its inner whitespace collapsed.
  assert.equal(notInterestedReason('')?.ok===false&&(notInterestedReason('') as {code:string}).code,'NO_REASON');
  assert.equal((notInterestedReason('   ') as {code:string}).code,'NO_REASON','whitespace is not a reason');
  assert.equal((notInterestedReason('না') as {code:string}).code,'REASON_TOO_SHORT');
  assert.equal(notInterestedReason('ন'.repeat(NOT_INTERESTED_REASON_MIN)).ok,true,'the minimum is reachable');
  assert.equal((notInterestedReason('ক'.repeat(NOT_INTERESTED_REASON_MAX+1)) as {code:string}).code,'REASON_TOO_LONG');
  const reason=notInterestedReason('  অন্য   কোচিংয়ে\nভর্তি  ');
  assert.equal(reason.ok,true);
  assert.equal((reason as {reason:string}).reason,'অন্য কোচিংয়ে ভর্তি','trimmed and collapsed, so the timeline reads as one line');
  const noReason=notInterestedReason('');
  assert.ok(noReason.ok===false);
  assert.ok((noReason as {messageBn:string}).messageBn.includes('কারণ'),'the Bangla sentence says a reason is what is missing');
  assert.ok((noReason as {messageEn:string}).messageEn.toLowerCase().includes('reason'));

  // 7. Which seat is still bookable: switched on, still in the future, and with a seat left.
  const now=new Date('2026-11-12T04:00:00.000Z');
  const open={enabled:true,startAt:new Date('2026-11-13T04:00:00.000Z'),booked:2,capacity:5};
  assert.equal(bookableSlot(open,now),true);
  assert.equal(bookableSlot({...open,enabled:false},now),false,'a class the centre switched off');
  assert.equal(bookableSlot({...open,startAt:new Date('2026-11-12T03:59:59.000Z')},now),false,'a class that already started');
  assert.equal(bookableSlot({...open,booked:5},now),false,'a full class');
  assert.equal(bookableSlot({...open,booked:4,capacity:5},now),true,'the last seat is still a seat');
  assert.equal(bookableSlot({...open,capacity:0},now),false,'a class with no capacity at all');
  assert.equal(bookableSlot({...open,startAt:'not a date'},now),false,'a slot with no readable time cannot be offered');

  // 8. The reference a hand-off mints is the intake screen's own shape, so a handed-over row and a
  //    public form row are indistinguishable in the list, in tracking and in an export.
  const seen=new Set<string>();
  for(let index=0;index<200;index+=1){
    const admission=handoffReference('ADM',now);
    const trial=handoffReference('TRI',now);
    assert.match(admission,/^ADM-2026-[A-F\d]{12}$/);
    assert.match(trial,/^TRI-2026-[A-F\d]{12}$/);
    assert.equal(seen.has(admission),false,'a hand-off never mints a reference twice');
    seen.add(admission);seen.add(trial);
  }
  assert.equal(seen.size,400);
  assert.match(handoffReference('ADM',new Date('2027-01-02T00:00:00.000Z')),/^ADM-2027-/,'the year follows the day it was made');

  console.log('Lead hand-offs: the three hand-offs land on admitted, trial_booked and not_interested — statuses the vocabulary already carries, never a fourth invented here; a prefill copies the name, the guardian, the school and the class a lead holds and hands the browser the number as a mask, so no prefill carries eleven digits or a family key, and a lead that holds nothing fills nothing rather than being guessed at; a class below four offers no grade because the intake schema would refuse it; an admission already open, a trial already booked and a lead with no number each stop their own hand-off with a sentence in both languages before a form is filled in; "not interested" refuses an empty reason, whitespace and two characters, files a real one trimmed and collapsed to a single line, and refuses one over 200; a seat is bookable only when the class is switched on, still in the future and not full, with the last seat still a seat and an unreadable time never offered; and a hand-off mints an ADM- or TRI- reference in the intake screen\'s own shape, 400 of them without one repeat.');
}

run();
