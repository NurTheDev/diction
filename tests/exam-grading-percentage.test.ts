/**
 * O1 · A grade is a percentage of the marks on offer, never a count of them.
 *
 * The centre's exams are not all out of a hundred: a class test is out of twenty, a chapter test out of
 * twenty-five, a monthly out of fifty with two components, a model test out of a hundred and fifty
 * across three subjects. A scale that read the marks themselves would call 25 out of 30 a failure —
 * 25 is below 33 — and 8 out of 20 a failure too, when the first is 83.33% and an A+ and the second is
 * exactly 40% and a C. So the engine divides by the full marks before it consults any band, and this
 * suite holds that arithmetic against the owner's own table, for every full mark the centre writes.
 *
 *   percentage = obtained / full × 100
 *
 *   ≥ 80.0  A+  5.0      50.0–59.9  B   3.0
 *   70.0–79.9  A  4.0    40.0–49.9  C   2.0
 *   60.0–69.9  A- 3.5    33.0–39.9  D   1.0
 *                            < 33.0  F   0.0
 *
 * Run: npx tsx tests/exam-grading-percentage.test.ts
 */
import assert from 'node:assert/strict';
import {calculateResult,classSummary,normalizeBands,pointFor,validateRanges} from '../src/lib/exams/grading';
import {DEFAULT_GRADING_RANGES,rangesToBands} from '../src/lib/exams/vocab';

const bands=normalizeBands(rangesToBands(DEFAULT_GRADING_RANGES));

/** One subject out of `full`, scored `obtained`, graded by the centre's own scale. */
const gradeOf=(full:number,obtained:number,pass=0):{percentage:number;grade:string;point:number}=>{
  const result=calculateResult([{id:'s',full,pass}],bands,[{subject:'s',obtained,absent:false}]);
  return {percentage:Math.round(result.percentage*100)/100,grade:result.grade,point:result.point};
};

// ── The scale the owner reads, band by band ──────────────────────────────────────────────────────
assert.deepEqual(DEFAULT_GRADING_RANGES.map(range=>[range.min,range.max,range.grade,range.point]),[
  [80,100,'A+',5],[70,79,'A',4],[60,69,'A-',3.5],[50,59,'B',3],[40,49,'C',2],[33,39,'D',1],[0,32,'F',0],
],'the default scale is the percentage table itself, seven bands, each carrying its GPA point');
assert.equal(validateRanges(DEFAULT_GRADING_RANGES).error,undefined,'and it covers 0 to 100 exactly once');

// ── The three cases the brief names ──────────────────────────────────────────────────────────────
{
  const thirty=gradeOf(30,25);
  assert.equal(thirty.percentage,83.33,'25 out of 30 is 83.33 percent');
  assert.equal(thirty.grade,'A+','so it is an A+, not the F a scale reading marks would give it');
  assert.equal(thirty.point,5,'and it carries the five points an A+ carries');
}
{
  const fifty=gradeOf(50,38);
  assert.equal(fifty.percentage,76,'38 out of 50 is 76 percent');
  assert.equal(fifty.grade,'A','which is an A');
  assert.equal(fifty.point,4,'worth four points');
}
{
  const twenty=gradeOf(20,8);
  assert.equal(twenty.percentage,40,'8 out of 20 is exactly 40 percent');
  assert.equal(twenty.grade,'C','which is a C, at the very floor of the band');
  assert.equal(twenty.point,2,'worth two points');
}

// ── Every full mark the centre writes, on the same percentage ────────────────────────────────────
/* One exam out of a hundred and one out of twenty-five ask the same question of a student who scored
   four fifths of it: the answer has to be the same grade, because the scale is about the share. */
for(const full of [20,25,30,40,50,75,100]){
  const fourFifths=gradeOf(full,Math.round(full*0.8));
  assert.equal(fourFifths.percentage,80,`scoring four fifths of ${full} is 80 percent`);
  assert.equal(fourFifths.grade,'A+','and 80 percent is an A+ whatever the full mark was');
  assert.equal(fourFifths.point,5,'with the points that go with it');
}
assert.equal(gradeOf(25,20).grade,'A+','20 out of 25 is 80 percent, which is already an A+');
assert.equal(gradeOf(40,20).grade,'B','20 out of 40 is 50 percent, which is a B');
assert.equal(gradeOf(40,24).grade,'A-','24 out of 40 is 60 percent, which is an A-');
assert.equal(gradeOf(75,30).grade,'C','30 out of 75 is 40 percent, which is a C at the floor of its band');

// ── The boundaries, where a scale is really tested ───────────────────────────────────────────────
/* A thousand marks makes the tenths of a percent reachable with whole numbers, so each floor of the
   table can be stood on exactly and one step below. */
const boundaries:[number,string,number][]=[
  [800,'A+',5],[799,'A',4],[700,'A',4],[699,'A-',3.5],[600,'A-',3.5],[599,'B',3],
  [500,'B',3],[499,'C',2],[400,'C',2],[399,'D',1],[330,'D',1],[329,'F',0],[0,'F',0],
];
for(const [obtained,grade,point] of boundaries){
  const result=gradeOf(1000,obtained);
  assert.equal(result.grade,grade,`${obtained} out of 1000 is ${result.percentage} percent, which is ${grade}`);
  assert.equal(result.point,point,'and carries that band\'s point');
}

// ── Components: CQ and MCQ add up before the percentage is taken ─────────────────────────────────
{
  const subjects=[{id:'cq',full:30,pass:0},{id:'mcq',full:20,pass:0}];
  const result=calculateResult(subjects,bands,[
    {subject:'cq',obtained:25,absent:false},{subject:'mcq',obtained:18,absent:false},
  ]);
  assert.equal(result.total,43,'25 in the creative part and 18 in the MCQ add up to 43');
  assert.equal(result.fullTotal,50,'out of the fifty the two components offer together');
  assert.equal(Math.round(result.percentage*100)/100,86,'which is 86 percent of them');
  assert.equal(result.grade,'A+','and grades on the share, not on either component alone');
  assert.equal(result.point,pointFor(bands,result.percentage,result.grade),'with the point the band carries');
}

// ── What still outranks the percentage ───────────────────────────────────────────────────────────
{
  const absent=calculateResult([{id:'s',full:30,pass:0}],bands,[{subject:'s',obtained:null,absent:true}]);
  assert.equal(absent.grade,'ABSENT','a student who was not there is absent, not a zero');
  assert.equal(absent.point,0,'and carries no point');
  assert.equal(absent.percentage,0,'their percentage is nothing to grade');
}
{
  /* The subject's own pass mark is a second rule the brief keeps: a child who failed the creative
     part fails the result whatever the total says. Twenty-nine out of thirty is 96.67 percent and an
     A+ on the scale, and still a FAIL because the one subject had a pass mark of twelve. */
  const failed=calculateResult([{id:'s',full:30,pass:12}],bands,[{subject:'s',obtained:11,absent:false}]);
  assert.equal(failed.failed,true,'a mark under the subject\'s own pass mark fails the result');
  assert.equal(failed.grade,'FAIL','and the scale is not consulted for it');
  assert.equal(failed.point,0,'so it carries no point');
  const passed=calculateResult([{id:'s',full:30,pass:12}],bands,[{subject:'s',obtained:12,absent:false}]);
  assert.equal(passed.failed,false,'on the pass mark itself the subject is passed');
  assert.equal(passed.grade,'C','and 12 out of 30 is 40 percent, which the scale reads as a C');
}

// ── A summary of marks out of different full marks ───────────────────────────────────────────────
{
  const subjects=[{id:'s',full:30,pass:0}];
  const summary=classSummary([
    {total:25,grade:'A+',marks:[{subject:'s',obtained:25,absent:false}]},
    {total:12,grade:'D',marks:[{subject:'s',obtained:12,absent:false}]},
    {total:0,grade:'ABSENT',marks:[{subject:'s',obtained:null,absent:true}]},
  ],subjects,3);
  assert.equal(summary.students,3,'the class is three students');
  assert.equal(summary.counted,2,'two of them sat');
  assert.equal(summary.absent,1,'and one was absent');
  assert.equal(summary.average,18.5,'the average is over those who sat, in marks out of thirty');
  assert.equal(summary.passRate,100,'nobody who sat failed');
}

console.log('Percentage grading: the owner\'s seven bands, 25 of 30 an A+, 38 of 50 an A, 8 of 20 a C, every full mark from 20 to 100, every boundary, components added before the share is taken, and absence and a failed subject still outranking it — passed.');
