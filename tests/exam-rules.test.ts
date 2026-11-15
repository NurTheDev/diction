/**
 * R5 · Exams — the rules that decide what a set of marks means.
 *
 * A result is a document about a child, so these are the assertions that keep the arithmetic honest:
 * the grade a percentage earns, the GPA point that goes with it, the subject that fails on its own,
 * absence never folded into a zero, positions that share a tie and skip the next one, a class summary
 * that says "nothing to average" instead of 0, and a scale that has to cover 0–100 exactly once.
 *
 * Run: npx tsx tests/exam-rules.test.ts
 */
import assert from 'node:assert/strict';
import {
  calculateResult,classSummary,normalizeBands,pointFor,positionOf,validateRanges,type ExamSubject,type MarkEntry,
} from '../src/lib/exams/grading';
import {
  DEFAULT_GRADING_RANGES,EXAM_TYPES,EXAM_TYPE_LABEL_KEYS,EXAM_STATUS_LABEL_KEYS,isAbsentToken,
  rangesToBands,bandsToRanges,ABSENT_TOKENS,
} from '../src/lib/exams/vocab';

const subjects:ExamSubject[]=[{id:'bn',full:100,pass:33},{id:'math',full:50,pass:20}];
const bands=normalizeBands(DEFAULT_GRADING_RANGES.map(range=>({min:range.min,label:range.grade,point:range.point})));

// ── The scale itself ────────────────────────────────────────────────────────────────────────────
assert.equal(bands.length,7,'the standard scale has seven bands');
assert.deepEqual(bands.map(band=>band.label),['A+','A','A-','B','C','D','F'],'sorted from the top down');
assert.equal(bands[0].min,80,'A+ starts at 80%');
assert.equal(bands[bands.length-1].min,0,'a scale has to reach 0 or the lowest percentage has no grade');
assert.deepEqual(rangesToBands(bandsToRanges(bands)),bands,'ranges and bands are the same scale seen twice');
assert.throws(()=>normalizeBands([{min:80,label:'A+',point:5},{min:40,label:'C',point:2}]),/INVALID_GRADING/,'a scale with no 0 band is refused');
assert.deepEqual(normalizeBands([{min:0,label:'F'},{min:80,label:'A+'},{min:40,label:'C'}]).map(band=>band.label),['A+','C','F'],'bands are normalized, not trusted');
assert.equal(normalizeBands([{min:0,label:'F'},{min:80,label:'A+'}])[1].point,0,'a band written before R5 has no point, and gets 0 rather than a guess');

// ── Types and statuses are a closed list, each with a catalog key ───────────────────────────────
assert.deepEqual([...EXAM_TYPES],['monthly','model_test','term','class_test','other'],'the five types the brief names');
for(const type of EXAM_TYPES)assert.ok(EXAM_TYPE_LABEL_KEYS[type].startsWith('typeLabels.'),`${type} has a label key`);
for(const status of ['draft','published'] as const)assert.ok(EXAM_STATUS_LABEL_KEYS[status].startsWith('status.'),`${status} has a label key`);

// ── A mark, graded ──────────────────────────────────────────────────────────────────────────────
const marks=(bn:number|null,math:number|null,absent=false):MarkEntry[]=>[
  {subject:'bn',obtained:absent?null:bn,absent},
  {subject:'math',obtained:absent?null:math,absent},
];
const good=calculateResult(subjects,bands,marks(80,40));
assert.equal(good.total,120,'80 + 40');
assert.equal(good.fullTotal,150,'100 + 50');
assert.equal(good.percentage,80,'120 of 150 is 80%');
assert.equal(good.grade,'A+','80% reaches the A+ band');
assert.equal(good.point,5,'and A+ is worth 5.00');
assert.equal(good.failed,false,'both subjects are over their own pass mark');
assert.deepEqual(good.subjects.map(entry=>entry.passed),[true,true],'each subject passes on its own');

const edge=calculateResult(subjects,bands,marks(79,40));
assert.equal(edge.grade,'A','79.33% is an A, not an A+: the band floor decides');
assert.equal(edge.point,4,'and an A is worth 4.00');

const failedSubject=calculateResult(subjects,bands,marks(95,19));
assert.equal(failedSubject.grade,'FAIL','a subject under its own pass mark fails the result whatever the total says');
assert.equal(failedSubject.point,0,'a failed result earns no point');
assert.equal(failedSubject.failed,true);
assert.deepEqual(failedSubject.subjects.map(entry=>entry.passed),[true,false],'and the subject that failed is named');

const absent=calculateResult(subjects,bands,marks(null,null,true));
assert.equal(absent.grade,'ABSENT','absence is its own answer');
assert.equal(absent.point,0,'absence earns no point');
assert.equal(absent.absent,true);
assert.deepEqual(absent.subjects.map(entry=>[entry.absent,entry.passed]),[[true,false],[true,false]],'an absent subject is not a passed one');

assert.throws(()=>calculateResult(subjects,bands,marks(101,40)),/INVALID_MARKS/,'a mark over the full mark is refused, not clipped');
assert.throws(()=>calculateResult(subjects,bands,[{subject:'bn',obtained:80,absent:false}]),/INVALID_MARKS/,'marks have to mirror the subjects exactly');
assert.equal(pointFor(bands,33,'D'),1,'33% is a D, worth 1.00');
assert.equal(pointFor(bands,32,'F'),0,'32% is an F, worth nothing');
assert.equal(pointFor(bands,100,'ABSENT'),0,'an absent student has no point even at 100%');

// ── Positions: ties share, the next one skips, the absent have none ─────────────────────────────
const rows=[{student:'s1',total:120,grade:'A+'},{student:'s2',total:110,grade:'A'},{student:'s3',total:110,grade:'A'},{student:'s4',total:100,grade:'A-'},{student:'s5',total:0,grade:'ABSENT'}];
const positions=positionOf(rows);
assert.deepEqual([positions.get('s1'),positions.get('s2'),positions.get('s3'),positions.get('s4')],[1,2,2,4],'1st, 2nd, 2nd, 4th');
assert.equal(positions.has('s5'),false,'an absent student is left out of the ranking entirely');
assert.equal(positionOf([]).size,0,'nobody to rank is no positions, not a crash');
assert.equal(positionOf([{student:'only',total:0,grade:'F'}]).get('only'),1,'a single failing student is still 1st of the class');

// ── The class summary ───────────────────────────────────────────────────────────────────────────
const summary=classSummary([
  {total:120,grade:'A+',marks:[{subject:'bn',obtained:80,absent:false},{subject:'math',obtained:40,absent:false}]},
  {total:99,grade:'A-',marks:[{subject:'bn',obtained:60,absent:false},{subject:'math',obtained:39,absent:false}]},
  {total:50,grade:'FAIL',marks:[{subject:'bn',obtained:30,absent:false},{subject:'math',obtained:20,absent:false}]},
  {total:0,grade:'ABSENT',marks:[{subject:'bn',obtained:null,absent:true},{subject:'math',obtained:null,absent:true}]},
],subjects);
assert.equal(summary.students,4,'four students are on the sheet');
assert.equal(summary.counted,3,'three of them sat');
assert.equal(summary.absent,1,'one was not there');
assert.equal(summary.failed,1,'one failed');
assert.equal(summary.passed,2,'two passed');
assert.equal(summary.average,89.7,'the average is over those who sat: (120 + 99 + 50) / 3');
assert.equal(summary.highest,120);
assert.equal(summary.lowest,50,'the absent student is not the lowest scorer');
assert.equal(summary.passRate,66.7,'two of three who sat');
const bangla=summary.subjects.find(entry=>entry.subject==='bn')!;
assert.equal(bangla.average,56.7,'Bangla: (80 + 60 + 30) / 3');
assert.equal(bangla.absent,1,'and one absence, counted but not averaged');
assert.equal(bangla.passed,2,'80 and 60 are over the pass mark of 33, 30 is not');
assert.equal(bangla.failed,1);
assert.equal(bangla.highest,80);
assert.equal(bangla.lowest,30);
const empty=classSummary([],subjects);
assert.deepEqual([empty.average,empty.highest,empty.lowest,empty.passRate],[null,null,null,null],'an empty class says nothing to average, not 0');
assert.equal(empty.students,0);

// ── A scale is checked before it is saved ───────────────────────────────────────────────────────
assert.equal(validateRanges(DEFAULT_GRADING_RANGES).error,undefined,'the standard scale is a scale');
assert.equal(validateRanges(DEFAULT_GRADING_RANGES).ranges[0].grade,'A+','and comes back sorted from the top down');
assert.equal(validateRanges([{min:50,max:100,grade:'A',point:5},{min:40,max:60,grade:'B',point:4},{min:0,max:39,grade:'F',point:0}]).error,'SCALE_OVERLAP','two ranges covering the same percentage');
assert.equal(validateRanges([{min:50,max:100,grade:'A',point:5},{min:0,max:40,grade:'F',point:0}]).error,'SCALE_GAP','a hole between 41 and 49 leaves those marks with no grade');
assert.equal(validateRanges([{min:10,max:100,grade:'A',point:5},{min:5,max:9,grade:'B',point:4}]).error,'SCALE_MISSING_ZERO','a scale that never reaches 0 leaves the lowest marks with no grade');
assert.equal(validateRanges([{min:0,max:99,grade:'A',point:5}]).error,'SCALE_INVALID','a scale needs at least two ranges');
assert.equal(validateRanges([{min:0,max:100,grade:'A',point:5},{min:0,max:100,grade:'A',point:4}]).error,'SCALE_DUPLICATE_GRADE');
assert.equal(validateRanges([{min:0,max:100,grade:'A',point:9},{min:0,max:0,grade:'F',point:0}]).error,'SCALE_INVALID','a point outside 0–5 is not a GPA point');
assert.equal(validateRanges([{min:0,max:90,grade:'A',point:5},{min:0,max:0,grade:'F',point:0}]).error,'SCALE_MISSING_HUNDRED','the top range has to reach 100 or those marks have no grade');
assert.equal(validateRanges('nope' as unknown as unknown[]).error,'SCALE_INVALID','anything that is not a list is refused');

// ── Absence is a word, not a number ─────────────────────────────────────────────────────────────
for(const token of ['a','A',' absent ','ABSENT','abs'])assert.equal(isAbsentToken(token),true,`${token} means absent`);
assert.equal(isAbsentToken('\u0985\u09a8\u09c1\u09aa\u09b8\u09cd\u09a5\u09bf\u09a4'),true,'the Bangla word means absent too');
assert.equal(isAbsentToken('80'),false,'a mark is never read as an absence');
assert.equal(isAbsentToken(''),false,'an empty cell is a hole, not an absence');
assert.ok(ABSENT_TOKENS.length>=4,'the accepted spellings are listed, not scattered');

console.log('Exam rules: bands and points, per-subject failure, absence, tie positions, the class summary and scale validation passed.');
