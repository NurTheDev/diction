/**
 * R5 slice 2 · What a result SMS says.
 *
 * The sentence is fixed by the spec and it is read by a family on the day a result is published, so it is
 * proved here with no provider, no database, no session and no send: the values `resultMessage` builds,
 * rendered through the shipped template and the shipped renderer, have to come out as the wording in
 * `docs/SPEC.md` — in Bangla digits, with no chip left standing in the sentence.
 *
 * The refusals matter as much as the rendering. A result message cannot be un-sent, so a student with
 * nothing to report gets no values at all and `buildSmsPlan` skips them as `missing_value`, counted in the
 * batch summary; that is what keeps an absent child from being texted "মোট ০/১৫০" as though they had failed.
 *
 * Run: npx tsx tests/exam-result-message.test.ts
 */
import assert from 'node:assert/strict';
import {resultMessage,type ResultMessageSubject} from '../src/lib/exams/result-message';
import {defaultTemplate,hasUnknownChip,renderSmsTemplate,templateVariablesOf} from '../src/lib/center/sms-templates';

const subjects:ResultMessageSubject[]=[{id:'bn',name:'বাংলা'},{id:'math',name:'গণিত'}];
const body=defaultTemplate('exam_result')!.body;
const exam='মাসিক পরীক্ষা';

// ── 1. The sentence the spec fixes, rendered the way a send renders it ──────────────────────────────
const first=resultMessage({
  examName:exam,subjects,
  marks:[{subject:'bn',obtained:90,absent:false},{subject:'math',obtained:45,absent:false}],
  total:135,fullTotal:150,position:1,
});
assert.deepEqual(first,{exam:'মাসিক পরীক্ষা',marks:'বাংলা ৯০, গণিত ৪৫',total:'১৩৫/১৫০',rank:'১'},
  'the four chips are the exam, the subject-wise marks, the total against its full mark, and the position');
const message=renderSmsTemplate(body,{student_name:'নমুনা ছাত্র ক',...first!});
assert.equal(message,'ডিকশন কোচিং: নমুনা ছাত্র ক এর মাসিক পরীক্ষা ফলাফল: বাংলা ৯০, গণিত ৪৫। মোট ১৩৫/১৫০, অবস্থান ১।',
  'and rendered through the shipped template it is byte-for-byte the sentence in the spec');
assert.equal(/\{\w+\}/.test(message),false,'no chip is left standing in what a family reads');
assert.equal(hasUnknownChip(message),false);

/* The plan blocks the whole send on an unrendered chip, so the guarantee that matters is a coverage one:
   every chip of the shipped body except the recipient's own name — which `resolveRecipients` fills — has to
   be a key of these values. Asserted against the template rather than a list, so a wording change in the
   catalog fails here instead of in front of an operator. */
assert.deepEqual(templateVariablesOf(body).filter(chip=>chip!=='student_name').sort(),Object.keys(first!).sort(),
  'the values cover exactly the chips the sentence needs, and invent none');

// ── 2. Digits are Bangla, because the sentence is ───────────────────────────────────────────────────
assert.equal(resultMessage({examName:exam,subjects,marks:[{subject:'bn',obtained:100,absent:false},{subject:'math',obtained:25,absent:false}],total:125,fullTotal:150,position:10})!.rank,'১০',
  'a position of ten reads as ১০, not 10');
assert.equal(resultMessage({examName:exam,subjects,marks:[{subject:'bn',obtained:0,absent:false},{subject:'math',obtained:0,absent:false}],total:0,fullTotal:150,position:12})!.marks,'বাংলা ০, গণিত ০',
  'and a genuine zero is a zero — it is absence that is refused, not a low mark');

// ── 3. A subject the child did not sit is a dash, not a zero ────────────────────────────────────────
const partial=resultMessage({
  examName:exam,subjects,
  marks:[{subject:'bn',obtained:80,absent:false},{subject:'math',obtained:null,absent:true}],
  total:80,fullTotal:150,position:2,
});
assert.equal(partial!.marks,'বাংলা ৮০, গণিত —','one absent subject still leaves a message worth sending');
assert.equal(partial!.total,'৮০/১৫০','and the total is the one the engine stored, not a recomputed guess');

// ── 4. What gets no message at all ──────────────────────────────────────────────────────────────────
const absentMarks=[{subject:'bn',obtained:null,absent:true},{subject:'math',obtained:null,absent:true}];
assert.equal(resultMessage({examName:exam,subjects,marks:absentMarks,total:0,fullTotal:150,absent:true}),null,
  'an absent child is not texted a result');
assert.equal(resultMessage({examName:exam,subjects,marks:absentMarks,total:0,fullTotal:150,position:3}),null,
  'and a row whose every subject is absent is not texted one either, absent flag or no');
assert.equal(resultMessage({examName:exam,subjects,marks:[{subject:'bn',obtained:90,absent:false}],total:90,fullTotal:150,position:null}),null,
  'a row publishing has not ranked gets nothing: a rank chip with no position behind it is a hole');
assert.equal(resultMessage({examName:exam,subjects,marks:[{subject:'bn',obtained:90,absent:false}],total:90,fullTotal:150}),null,
  'and neither does one with no position at all');
assert.equal(resultMessage({examName:'  ',subjects,marks:[{subject:'bn',obtained:90,absent:false}],total:90,fullTotal:150,position:1}),null,
  'an exam with no name has no sentence to be in');
assert.equal(resultMessage({examName:exam,subjects:[],marks:[{subject:'bn',obtained:90,absent:false}],total:90,fullTotal:150,position:1}),null,
  'and an exam with no subjects has no marks to list');
assert.equal(resultMessage({examName:exam,subjects,marks:[{subject:'bn',obtained:90,absent:false}],total:null,fullTotal:150,position:1}),null,
  'a row with no stored total is not reported as 0');

// ── 5. The sentence lists the exam's subjects, in the exam's order ──────────────────────────────────
const shuffled=resultMessage({
  examName:exam,subjects,
  marks:[{subject:'math',obtained:45,absent:false},{subject:'bn',obtained:90,absent:false},{subject:'extra',obtained:50,absent:false}],
  total:135,fullTotal:150,position:1,
});
assert.equal(shuffled!.marks,'বাংলা ৯০, গণিত ৪৫',
  'the order is the exam’s own, however the marks were stored, and a mark for a subject this exam does not have is left out');

// ── 6. A tie reads as the position publishing wrote ─────────────────────────────────────────────────
/* Two children sharing first place are both first: this module prints the position the engine wrote and
   never re-ranks, because a message that disagreed with the result table would be a second, worse bug. */
const tied=(position:number)=>resultMessage({examName:exam,subjects,marks:[{subject:'bn',obtained:90,absent:false},{subject:'math',obtained:45,absent:false}],total:135,fullTotal:150,position})!.rank;
assert.deepEqual([tied(1),tied(1),tied(3)],['১','১','৩'],'a tie shares its position and the next one skips');

console.log('Result SMS: the spec sentence renders byte-for-byte in Bangla digits with no chip left in it, the values cover exactly the chips the template asks for, an absent subject is a dash rather than a zero, an absent or unranked child is sent nothing at all, subjects are listed in the exam’s own order, and a tie reads as the position publishing wrote.');
