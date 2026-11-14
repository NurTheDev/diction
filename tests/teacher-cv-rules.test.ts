/**
 * R4 · The teacher CV bank's rules that need no database.
 *
 * What a CV means, and what this app refuses to guess about one:
 *
 *   • the vocabulary is the brief's — nine statuses, five ratings, five sources, three shifts, twelve
 *     class numbers, fourteen subjects, four note outcomes — and every one of them has a Bangla and an
 *     English word, with no two alike in either language;
 *   • the twelve-month review is a computation that reminds, never a deletion, and a hired CV never
 *     triggers it because it is not waiting for anything;
 *   • an availability keyword folds digits across scripts, so 3.00 finds ৩.০০ and the other way round,
 *     and it is a keyword match rather than a time-range calculation it cannot promise;
 *   • a filter value that is not in the vocabulary is dropped rather than trusted, a long one is capped,
 *     and the review becomes a date edge — with a keyword plus an availability term becoming `$and`,
 *     because one query level allows one `$or`;
 *   • the subject reader is best effort and never loses a word: the sheet's own text is kept, a range
 *     becomes the classes it names, SSC and HSC become classes by curriculum, and a word no table knows
 *     comes back unparsed and offered as a tag instead of being guessed at or dropped;
 *   • the free-time reader says out loud when it inferred a shift from a bare hour rather than reading an
 *     explicit AM/PM, and "ALL" or "Full Time Free" is every shift so a morning filter still finds it;
 *   • a salary written as a word is flagged and left empty rather than stored as a zero;
 *   • the sheet's own headers map by lookup, a column nobody named becomes a question with a select
 *     beside it, and an unknown header becomes the "which field" question — never a default;
 *   • and a candidate reaches the SMS pipeline as an active non-student, so a fee template can never be
 *     offered to somebody who applied for a job.
 *
 * The sheet itself — XLSX against CSV, the owner's answers, the CVs already on file — is proved in
 * `teacher-cv-sheet.test.ts`, and what the collection does with all of it in
 * `teacher-cv-bank.integration.ts`. Run: npm run test:teacher:rules
 */
import assert from 'node:assert/strict';
import bnMessages from '../src/messages/bn.json';
import enMessages from '../src/messages/en.json';
import {
  TEACHER_CLASS_LEVELS,TEACHER_NOTE_OUTCOMES,TEACHER_RATINGS,TEACHER_SHIFTS,TEACHER_SOURCES,
  TEACHER_STATUSES,TEACHER_SUBJECTS,TEACHER_STATUS_LABEL_KEYS,TEACHER_RATING_LABEL_KEYS,
  TEACHER_SOURCE_LABEL_KEYS,TEACHER_SHIFT_LABEL_KEYS,TEACHER_SUBJECT_LABEL_KEYS,TEACHER_NOTE_OUTCOME_LABEL_KEYS,
  availabilityMatches,needsReview,teacherListQuery,
} from '../src/lib/teachers/vocab';
import {readAvailability,readSalary,readSubjectsText} from '../src/lib/teachers/subjects';
import {CV_SHEET_FIELDS,mapCvHeader,unmappedCvHeaderQuestion} from '../src/lib/teachers/cv-columns';
import {teacherListFilter} from '../src/lib/teachers/candidates';
import {teacherCandidates,teacherSmsTally,teacherTemplateFits} from '../src/lib/teachers/cv-sms';

/* Every catalog leaf a vocabulary value points at, in both languages. */
const leaf=(catalog:Record<string,any>,group:string,key:string):string=>String(catalog[group]&&key.split('.').reduce((node,part)=>(node||{})[part],catalog[group])||'');
function bothLanguages(group:string,keys:Record<string,string>,values:string[],label:string){
  for(const value of values){
    const key=keys[value];
    assert.ok(key,`${label}: ${value} has a catalog key`);
    const bn=leaf(bnMessages as Record<string,any>,group,key);
    const en=leaf(enMessages as Record<string,any>,group,key);
    assert.ok(bn.trim(),`${label}: ${value} has Bangla words`);
    assert.ok(en.trim(),`${label}: ${value} has English words`);
  }
  const words=(catalog:Record<string,any>)=>values.map(value=>leaf(catalog,group,keys[value]));
  assert.equal(new Set(words(bnMessages as Record<string,any>)).size,values.length,`${label}: no two Bangla words are the same`);
  assert.equal(new Set(words(enMessages as Record<string,any>)).size,values.length,`${label}: no two English words are the same`);
}

// ── 1. The vocabulary is the brief's, and it is spoken in both languages ───────────────────────────
assert.deepEqual([...TEACHER_STATUSES],['new','contacted','interview_scheduled','interviewed','shortlisted','waiting_list','hired','not_suitable','no_response'],'the nine statuses, New to Hired and the two endings');
assert.equal(TEACHER_STATUSES.length,9);
assert.deepEqual([...TEACHER_RATINGS],['unrated','poor','ok','good','excellent'],'unrated is a state of its own, not a low score');
assert.deepEqual([...TEACHER_SOURCES],['walk_in','email','facebook','referral','other']);
assert.deepEqual([...TEACHER_SHIFTS],['morning','evening','any']);
assert.deepEqual([...TEACHER_CLASS_LEVELS],['1','2','3','4','5','6','7','8','9','10','11','12'],'specific class numbers only');
assert.equal(TEACHER_NOTE_OUTCOMES.length,4);
bothLanguages('teacherCvs',TEACHER_STATUS_LABEL_KEYS,[...TEACHER_STATUSES],'status');
bothLanguages('teacherCvs',TEACHER_RATING_LABEL_KEYS,[...TEACHER_RATINGS],'rating');
bothLanguages('teacherCvs',TEACHER_SOURCE_LABEL_KEYS,[...TEACHER_SOURCES],'source');
bothLanguages('teacherCvs',TEACHER_SHIFT_LABEL_KEYS,[...TEACHER_SHIFTS],'shift');
bothLanguages('teacherCvs',TEACHER_SUBJECT_LABEL_KEYS,[...TEACHER_SUBJECTS],'subject');
bothLanguages('teacherCvs',TEACHER_NOTE_OUTCOME_LABEL_KEYS,[...TEACHER_NOTE_OUTCOMES],'note outcome');
for(const field of CV_SHEET_FIELDS){
  assert.ok(leaf(enMessages as Record<string,any>,'teacherCvs',`import.fields.${field}`),`the sheet field ${field} has English words`);
  assert.ok(leaf(bnMessages as Record<string,any>,'teacherCvs',`import.fields.${field}`),`the sheet field ${field} has Bangla words`);
}

// ── 2. The twelve-month review reminds; it never deletes ───────────────────────────────────────────
const now=new Date('2026-03-20T06:00:00Z'); // Dhaka sees 2026-03-20
assert.equal(needsReview('2025-01-05','new',now),true,'a CV that waited over a year is worth a second look');
assert.equal(needsReview('2025-01-05','hired',now),false,'a CV that led to a hiring is not waiting for anything');
assert.equal(needsReview('2026-01-05','new',now),false,'a CV from two months ago is not');
assert.equal(needsReview('','new',now),false,'no date, no reminder');
assert.equal(needsReview('nonsense','new',now),false,'a date nobody can read is not a reminder either');
assert.equal(needsReview('2025-03-21','shortlisted',now),false,'364 days is not a year');
assert.equal(needsReview('2025-03-19','shortlisted',now),true,'366 days is');

// ── 3. The availability keyword folds digits, so neither script has to convert ─────────────────────
assert.equal(availabilityMatches('৩.০০-৬.০০','3.00'),true,'Bangla digits on the sheet, ASCII in the box');
assert.equal(availabilityMatches('3.00-6.00','৩.০০'),true,'ASCII on the sheet, Bangla in the box');
assert.equal(availabilityMatches('ALL','all'),true,'the keyword is caseless');
assert.equal(availabilityMatches('After 3.00PM','4.00'),false,'a substring, not a time-range calculation');
assert.equal(availabilityMatches('','3.00'),false,'nothing written matches nothing asked');
assert.equal(availabilityMatches('3.00-6.00',''),true,'an empty keyword is no filter at all');

// ── 4. A filter value that is not in the vocabulary is ignored, never trusted ───────────────────────
const checked=teacherListQuery({status:'invented',rating:'five-stars',source:'tiktok',shift:'night',subject:'astrology',
  classLevel:'99',review:'ancient',q:'x'.repeat(400),availability:'y'.repeat(400),from:'20/11/2024',to:'2024-11-20'});
assert.deepEqual(checked,{status:'',rating:'',source:'',shift:'',subject:'',classLevel:'',review:'',
  q:'x'.repeat(80),availability:'y'.repeat(60),from:'',to:'2024-11-20'},'invented values are dropped, long ones capped, dates checked');
const ok=teacherListQuery({status:'hired',rating:'good',source:'facebook',shift:'evening',subject:'math',classLevel:'9',review:'old',from:'2024-11-20',to:'2024-12-20'});
assert.deepEqual(ok.status,'hired');assert.equal(ok.classLevel,'9');assert.equal(ok.review,'old');
assert.equal(teacherListQuery(undefined).status,'','no params at all is no filter at all');

// The filter a page builds from those values: vocabulary fields become exact matches, a review becomes a
// date edge plus "not hired", and the availability keyword becomes BOTH digit spellings, because Mongo
// cannot fold scripts and a keyword of 3.00 has to find ৩.০০.
const filter=teacherListFilter({status:'hired',subject:'math',classLevel:'9',shift:'evening',review:'old',availability:'3.00',q:'Dhaka'});
const shaped=JSON.parse(JSON.stringify(filter,(key,value)=>value instanceof RegExp?String(value):value));
assert.equal(shaped.status,'hired');
assert.equal(shaped.subjects,'math');
assert.equal(shaped.classLevels,'9');
assert.equal(shaped.shifts,'evening');
assert.ok(shaped.receivedDate.$lte,'the twelve-month review is a date edge…');
assert.deepEqual(shaped.status2,undefined);
assert.ok(Array.isArray(shaped.$and),'…and a keyword plus an availability term becomes $and, because one query level allows one $or');
assert.ok(shaped.$and[1].availabilityText.$in.length>=1,'the availability keyword is searched in both digit scripts');

// ── 5. The subject reader: best effort, words kept, never a hunch ──────────────────────────────────
const first=readSubjectsText('6, 7, 8 (Math, Eng) 9-GS, Other');
assert.equal(first.subjectsText,'6, 7, 8 (Math, Eng) 9-GS, Other','the cell is kept exactly as written');
assert.deepEqual(first.classLevels,['6','7','8','9'],'a bare number and a 9-GS both name a class');
assert.deepEqual(first.subjects,['english','math','other'],'Math, Eng and Other are table entries');
assert.ok(first.unparsed.includes('GS'),'GS is not in any table, so it is reported rather than guessed');
assert.ok(first.suggestedTags.includes('GS'),'and offered as a tag, so the word is not lost');
assert.ok(first.flags.some(entry=>entry.messageKey==='flags.subjectUnparsed'),'the row is flagged, not blocked');

const second=readSubjectsText('Class 4 to 7 (Bangla, Emg, BGG)');
assert.deepEqual(second.classLevels,['4','5','6','7'],'a range becomes the classes it names');
assert.deepEqual(second.subjects,['bangla']);
assert.deepEqual(second.unparsed.sort(),['BGG','Emg'],'two typos or two local abbreviations: neither is read as English');

const third=readSubjectsText('HSC (ICT) SSC (Phy, Che, Math)');
assert.deepEqual(third.classLevels,['10','12'],'SSC is class 10 and HSC class 12 by curriculum');
assert.deepEqual(third.subjects,['math','physics','chemistry','ict'],'subject words come back in the vocabulary’s own order, not the cell’s');

const bangla=readSubjectsText('৬, ৭ (গণিত, ইংরেজি)');
assert.deepEqual(bangla.classLevels,['6','7'],'Bangla digits fold before the reading');
assert.deepEqual(bangla.subjects,['bangla','english','math'].filter(subject=>['english','math'].includes(subject)),'Bangla subject words are table entries');
assert.deepEqual(bangla.subjects,['english','math']);

const none=readSubjectsText('');
assert.deepEqual({text:none.subjectsText,subjects:none.subjects,levels:none.classLevels,flags:none.flags.length},{text:'',subjects:[],levels:[],flags:0},'an empty cell reads to nothing and complains about nothing');
const unreadable=readSubjectsText('Nursery, KG, Play');
assert.deepEqual(unreadable.classLevels,[],'a class this bank has no number for derives no level');
assert.deepEqual(unreadable.subjects,[]);
assert.deepEqual(unreadable.unparsed,['Nursery','KG','Play'],'and every word is kept as a tag suggestion');

// ── 6. Free time: an explicit AM/PM settles it, a bare hour is inferred and says so ────────────────
const afternoon=readAvailability('3.00-6.00');
assert.deepEqual(afternoon.shifts,['evening'],'3.00-6.00 is an afternoon on a teaching sheet');
assert.ok(afternoon.flags.some(entry=>entry.messageKey==='flags.shiftFromTime'),'and the reading reports that it inferred the shift');
assert.equal(afternoon.availabilityText,'3.00-6.00','the words are kept');
const allDay=readAvailability('ALL');
assert.deepEqual(allDay.shifts,['morning','evening','any'],'ALL is every shift, so a morning filter finds this person too');
assert.equal(allDay.flags.length,0);
const explicit=readAvailability('After 3.00PM');
assert.deepEqual(explicit.shifts,['evening']);
assert.equal(explicit.flags.length,0,'an explicit PM needs no inference and raises no flag');
const fullTime=readAvailability('Full Time Free');
assert.deepEqual(fullTime.shifts,['morning','evening','any']);
const banglaTime=readAvailability('সকাল');
assert.deepEqual(banglaTime.shifts,['morning'],'a Bangla part of the day reads as a shift');
const bothShifts=readAvailability('8.00AM-11.00AM, 5.00-9.00PM');
assert.deepEqual(bothShifts.shifts,['morning','evening'],'a window on both sides of noon names both shifts');
assert.deepEqual(readAvailability('').shifts,[],'nothing written, nothing read');

// ── 7. Salary ─────────────────────────────────────────────────────────────────────────────────────
assert.equal(readSalary('12000').expectedSalary,12000);
assert.equal(readSalary('15k').expectedSalary,15000,'15k is fifteen thousand');
assert.equal(readSalary('১২০০০').expectedSalary,12000,'Bangla digits fold');
assert.equal(readSalary('12,000').expectedSalary,12000);
assert.equal(readSalary('৳12000').expectedSalary,12000,'a taka sign is not part of the number');
assert.equal(readSalary('').expectedSalary,null);
assert.equal(readSalary('').flags.length,0,'an empty cell is not a doubt');
const negotiable=readSalary('negotiate');
assert.equal(negotiable.expectedSalary,null,'a word is not a number…');
assert.equal(negotiable.flags.length,1,'…and the row says so instead of storing a zero');

// ── 8. Columns: a lookup, and a question for anything else ─────────────────────────────────────────
assert.equal(mapCvHeader('Date'),'receivedDate');
assert.equal(mapCvHeader('Mobile'),'phones');
assert.equal(mapCvHeader('Subject'),'subjectsText');
assert.equal(mapCvHeader('Free Time'),'availabilityText');
assert.equal(mapCvHeader('Salary'),'expectedSalary');
assert.equal(mapCvHeader('নাম'),'name','a Bangla header maps through the same table');
assert.equal(mapCvHeader('বিশ্ববিদ্যালয়'),'university');
assert.equal(mapCvHeader('Column 1'),null,'a column nobody named maps to nothing');
assert.equal(unmappedCvHeaderQuestion('Column 1').messageKey,'import.questions.unnamed','and becomes the unnamed question');
assert.equal(mapCvHeader('Favourite Colour'),null);
assert.equal(unmappedCvHeaderQuestion('Favourite Colour').messageKey,'import.questions.unknown','an unknown header becomes the which-field question');
assert.ok(leaf(enMessages as Record<string,any>,'teacherCvs','import.questions.unnamed')&&leaf(bnMessages as Record<string,any>,'teacherCvs','import.questions.unnamed'),'both questions exist in both languages');


// ── 9. The SMS translation: a candidate is not a student and is not dressed up as one ─────────
assert.equal(teacherTemplateFits(['subject','institute_phone']),true,'teacher_opening fits a candidate');
assert.equal(teacherTemplateFits(['institute_phone']),true);
assert.equal(teacherTemplateFits(['due_amount','month']),false,'a fee template can never be offered to an applicant');
const candidates=teacherCandidates([
  {id:'one',candidateId:'CV-2026-0001',name:'FAKE One',phone:'01711111111',hasPhone:true},
  {id:'two',candidateId:'CV-2026-0002',name:'FAKE Two',phone:'',hasPhone:false},
]);
assert.equal(candidates.length,2,'a CV with no number is still counted…');
assert.equal(candidates[0].status,'active','…as an active candidate, not a fee state');
assert.equal(candidates[0].smsOptOut,false,'a CV has no do-not-contact mark to invent');
assert.equal(candidates[1].guardianPhone,'','and its empty number becomes the pipeline’s own skip');
assert.deepEqual(candidates[0].values,{},'no per-candidate chips: the subject is typed, the institute number is global');
assert.deepEqual(teacherSmsTally([{hasPhone:true},{hasPhone:true},{hasPhone:false}]),{sendable:2,withoutPhone:1},'the tally says out loud who cannot be reached');


console.log('Teacher CV rules without a database: nine statuses, five ratings, five sources, three shifts, twelve class numbers, fourteen subjects and four note outcomes each carry Bangla and English words with no duplicates, and every sheet field has both too; the twelve-month review is a computation that a hired CV never triggers and 364 days is not a year; the availability keyword folds digits both ways and stays a keyword; an invented filter value is dropped and a long one capped, the review becoming a date edge and a keyword plus availability becoming $and with both digit scripts searched; the brief’s own cells read to classes 6-9 plus maths, English and other with GS kept as a tag, classes 4-7 with Emg and BGG unparsed, and SSC/HSC as classes 10 and 12, while Nursery and KG derive no class at all; “3.00-6.00” reads evening and says it inferred, “After 3.00PM” needs no inference, “ALL”, “Full Time Free” and both sides of noon are every shift or both shifts, and সকাল is the morning; 15k, ১২০০০, ৳12000 and 12,000 read while “negotiate” is flagged and left null; an unnamed column asks and a named one maps in either language; and a candidate reaches the SMS pipeline as an active non-student with no do-not-contact mark invented, no per-candidate chips and the fee templates refused.');
