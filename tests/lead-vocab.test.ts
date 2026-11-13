/**
 * R3.1 · Visitor leads: the vocabulary and the three standing rules. Pure module, no database.
 *
 * Pinned here because a screen can be rebuilt and these must not move with it: every status has its
 * Bangla and English words; "Do not contact" is sticky and is the one gate every sending path asks;
 * a follow-up is a DAY in Asia/Dhaka so "today" and "overdue" mean the same at 00:01 and at 23:59;
 * a phone number never appears in a URL this app generates or in a log line; and a family key ties
 * siblings by the number they share, deterministically.
 */
import assert from 'node:assert/strict';
import {dhakaDay} from '../src/lib/admin/today';
import {
  LEAD_STATUSES,LEAD_STATUS_LABELS,LEAD_SOURCES,LEAD_SOURCE_LABELS,LEAD_SHIFTS,LEAD_SHIFT_LABELS,
  LEAD_MEDIUMS,LEAD_MEDIUM_LABELS,LEAD_GROUPS,LEAD_GROUP_LABELS,LEAD_NOTE_OUTCOMES,LEAD_NOTE_OUTCOME_LABELS,
  FOLLOW_UP_OPTIONS,canContact,statusToFlags,nextFollowUpDay,followUpState,followUpWindows,
  maskPhone,leadPath,leadListQuery,familyKeyFromPhones,archiveSuggestionDay,suggestsArchive,
} from '../src/lib/leads/vocab';

/** A wall-clock moment in Dhaka, independent of the machine's own timezone. */
const at=(day:string,hhmm='10:00'):Date=>new Date(`${day}T${hhmm}:00+06:00`);

function run(){
  // ---- 1. The brief's eight statuses, each with words an operator reads.
  assert.deepEqual([...LEAD_STATUSES],['new','called','interested','trial_booked','admitted','not_interested','no_answer','do_not_contact'],'the brief\'s eight statuses, and no ninth');
  for(const [values,labels] of [
    [LEAD_STATUSES,LEAD_STATUS_LABELS],[LEAD_SOURCES,LEAD_SOURCE_LABELS],[LEAD_SHIFTS,LEAD_SHIFT_LABELS],
    [LEAD_MEDIUMS,LEAD_MEDIUM_LABELS],[LEAD_GROUPS,LEAD_GROUP_LABELS],[LEAD_NOTE_OUTCOMES,LEAD_NOTE_OUTCOME_LABELS],
  ] as const){
    for(const value of values){
      const label=(labels as Record<string,{bn:string;en:string}>)[value];
      assert.ok(label&&label.bn&&label.en,`${value} has both a Bangla and an English label`);
      assert.ok(!/[A-Za-z]/.test(label.bn),`${value}’s Bangla label is Bangla`);
    }
    assert.equal(new Set(values).size,values.length,`${values[0]}… has no duplicate value`);
  }
  assert.deepEqual([...LEAD_SOURCES],['walk_in','phone','facebook','referral','other'],'the five sources from the brief');
  assert.deepEqual([...LEAD_MEDIUMS],['bangla','english_version','unknown'],'"Bangla Version / English Version" plus unknown, which stays unknown');
  assert.deepEqual([...LEAD_GROUPS],['science','arts','commerce','unknown'],'Science / Arts / Commerce plus unknown');

  // ---- 2. "Do not contact" is sticky: a status change does not silently make a lead contactable.
  assert.equal(canContact({status:'new'}),true,'a new lead can be contacted');
  assert.equal(canContact({status:'do_not_contact'}),false,'the status alone stops it');
  assert.equal(canContact({status:'called',doNotContact:true}),false,'and so does the flag, even after the status moved on');
  assert.deepEqual(statusToFlags('do_not_contact',{}),{doNotContact:true},'marking the status sets the flag');
  assert.deepEqual(statusToFlags('called',{doNotContact:true}),{doNotContact:true},'moving the status back does not clear it');
  assert.deepEqual(statusToFlags('called',{doNotContact:false}),{doNotContact:false},'and an unmarked lead stays unmarked');
  assert.deepEqual(statusToFlags('admitted',{doNotContact:null}),{doNotContact:false},'a null flag reads as unmarked');

  // ---- 3. A follow-up is a day in Dhaka, computed from the brief's five buttons.
  const now=at('2026-11-12','10:00');
  assert.deepEqual(FOLLOW_UP_OPTIONS.map(option=>option.key),['today','tomorrow','three_days','next_week','custom'],'the row buttons are today, tomorrow, 3 days, next week and custom');
  assert.equal(nextFollowUpDay('today',now),'2026-11-12');
  assert.equal(nextFollowUpDay('tomorrow',now),'2026-11-13');
  assert.equal(nextFollowUpDay('three_days',now),'2026-11-15');
  assert.equal(nextFollowUpDay('next_week',now),'2026-11-19','next week means seven days, not "the next Monday" — a wrong guess would hide a lead');
  assert.equal(nextFollowUpDay('custom',now,'2026-12-01'),'2026-12-01');
  assert.equal(nextFollowUpDay('custom',now,'2026-02-31'),null,'31 February is refused rather than rolled into March');
  assert.equal(nextFollowUpDay('custom',now,'12/12/2026'),null,'and a custom day must already be YYYY-MM-DD');
  assert.equal(nextFollowUpDay('custom',now),null,'custom with no day chosen is nothing, not today');
  assert.equal(nextFollowUpDay('three_days',at('2026-12-30','23:30')),'2027-01-02','the year rolls over by calendar, not by arithmetic on a day number');
  assert.equal(nextFollowUpDay('today',at('2026-11-12','23:59')),'2026-11-12','late in the Dhaka evening it is still today');
  assert.equal(nextFollowUpDay('today',at('2026-11-13','00:01')),'2026-11-13','and just after midnight it is already the next day');
  assert.equal(nextFollowUpDay('today',at('2026-11-12','18:00')),dhakaDay(at('2026-11-12','18:00')),'the same day the shared Dhaka helper reports');

  // ---- 4. Today, overdue, later — the two numbers the Overview shows.
  assert.equal(followUpState('2026-11-12',now),'today');
  assert.equal(followUpState('2026-11-11',now),'overdue','yesterday is overdue, not today');
  assert.equal(followUpState('2026-10-01',now),'overdue','and so is one nobody moved for a month');
  assert.equal(followUpState('2026-11-13',now),'later');
  assert.equal(followUpState(null,now),'none','no follow-up is its own state, not "overdue"');
  assert.equal(followUpState('12/11/2026',now),'none','and a day that is not YYYY-MM-DD is not compared at all');
  const windows=followUpWindows(now);
  assert.equal(windows.today,'2026-11-12');
  assert.equal(windows.range.end.getTime()-windows.range.start.getTime(),86400000,'the range is one Dhaka day, midnight to midnight');
  assert.equal(dhakaDay(windows.range.start),'2026-11-12','starting at Dhaka midnight, whatever zone the server is in');

  // ---- 5. A number is never in a URL, an audit target or a log line.
  const phone='01712817090';
  assert.equal(maskPhone(phone),'01712****90','a log line gets a mask');
  assert.ok(!maskPhone(phone).includes('8170'),'that cannot be dialled or reversed');
  assert.equal(maskPhone('017'),'—','and a fragment is not padded out');
  assert.equal(maskPhone('017123'),'01****','a short one keeps less');
  assert.equal(leadPath('507f1f77bcf86cd799439011','bn'),'/bn/admin/leads/507f1f77bcf86cd799439011','a lead is addressed by id');
  assert.equal(leadPath('507f1f77bcf86cd799439011','en'),'/en/admin/leads/507f1f77bcf86cd799439011');
  assert.ok(!leadPath('507f1f77bcf86cd799439011').includes(phone));
  const typedNumber=leadListQuery({locale:'bn',q:phone});
  assert.equal(typedNumber.refusedPhone,true,'a search that looks like a number is refused as a URL parameter');
  assert.ok(!typedNumber.href.includes(phone),'so it cannot reach browser history or the host’s access log');
  assert.ok(!/\d{7,}/.test(typedNumber.href),'and no long digit run survives in the query either');
  assert.equal(typedNumber.href,'/bn/admin/leads','the list is still rendered, the search just posts instead');
  const typedBangla=leadListQuery({q:'০১৭১২৮১৭০৯০'});
  assert.equal(typedBangla.refusedPhone,true,'Bangla digits are recognized as a number too');
  // A PARTIAL number is refused too, and the threshold is the number search's own minimum: a fragment
  // short enough to slip into a URL would be long enough for the posted search to find somebody.
  assert.equal(leadListQuery({q:'7090'}).refusedPhone,true,'the last four digits are a number search, so they post instead');
  assert.equal(leadListQuery({q:'৭০৯০'}).refusedPhone,true,'in Bangla digits as well');
  assert.equal(leadListQuery({q:'017-128'}).refusedPhone,true,'and with the dashes a number is typed with');
  assert.equal(leadListQuery({q:'999'}).refusedPhone,false,'three digits is below the search minimum, so it stays an ordinary word search');
  assert.equal(leadListQuery({q:'V-2026-0001'}).refusedPhone,false,'a lead id is not a number — it stays shareable');
  assert.equal(leadListQuery({q:'ধানমন্ডি ৯'}).refusedPhone,false,'nor is a school with a class digit in it');
  const typedName=leadListQuery({locale:'en',q:'রাহুল',status:'new',followUp:'overdue',page:3});
  assert.equal(typedName.refusedPhone,false,'a name is a legitimate URL parameter — that is what makes a filtered list shareable');
  assert.equal(typedName.href,'/en/admin/leads?q=%E0%A6%B0%E0%A6%BE%E0%A6%B9%E0%A7%81%E0%A6%B2&status=new&followUp=overdue&page=3');
  assert.equal(leadListQuery({q:'Diction Coaching'}).href,'/bn/admin/leads?q=Diction+Coaching','a school name passes through');
  assert.ok(!leadListQuery({page:1}).href.includes('page'),'page 1 is the default and adds nothing to the URL');
  assert.ok(!leadListQuery({q:'  '}).href.includes('q'),'a blank search is not a parameter');

  // ---- 6. Siblings share a number, and the key that ties them is deterministic.
  assert.equal(familyKeyFromPhones([phone,'01911223344']),'fam:01712817090','the smallest shared number, so the order of input cannot matter');
  assert.equal(familyKeyFromPhones(['01911223344',phone]),'fam:01712817090');
  assert.equal(familyKeyFromPhones(['01712817090','01712817090']),'fam:01712817090','a repeated number is one family');
  assert.equal(familyKeyFromPhones(['0171281709']),null,'a short number is not a key — nothing is invented from it');
  assert.equal(familyKeyFromPhones([]),null,'and a lead with no number has no family key');
  assert.equal(familyKeyFromPhones(['না']),null);

  // ---- 7. Archiving is a suggestion after 18 months, never an automatic delete.
  assert.equal(archiveSuggestionDay('2024-11-12'),'2026-05-12');
  assert.equal(archiveSuggestionDay('2024-09-30'),'2026-03-30','month overflow is the calendar’s job, not 540 days');
  assert.equal(archiveSuggestionDay('nope'),null,'and a day that is not a day gets no suggestion');
  assert.equal(suggestsArchive('2024-01-01',now),true,'a lead from two years ago is offered to the operator');
  assert.equal(suggestsArchive('2026-10-01',now),false,'a recent one is not');
  assert.equal(suggestsArchive('',now),false,'and neither is a lead with no date');

  console.log('Visitor lead vocabulary: the brief’s eight statuses, five sources, three shifts, three mediums, four groups and four note outcomes each carry Bangla and English words with no duplicates; "Do not contact" is sticky — the status alone stops contact, the flag survives a status change and canContact() is the single gate; the five follow-up buttons compute a day in Asia/Dhaka (next week is seven days, 31 February is refused, the year rolls by calendar, and 23:59 versus 00:01 land on the right day) with today/overdue/later/none states and a midnight-to-midnight range; a number never appears in a URL this app builds — a phone-shaped search is refused as a parameter while a name or school stays shareable — and logs get a mask; a family key is the smallest shared number so siblings tie deterministically and a short number invents nothing; and archiving is suggested at 18 months by calendar, never applied.');
}

run();
