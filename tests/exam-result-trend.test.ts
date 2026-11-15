/**
 * R5 slice 2 · The improvement trend, and the coordinates the chart draws it at.
 *
 * A trend is the one number on a result screen that can be read two ways, so both halves are proved here
 * with no database and no browser: which exams are in the series and what the step between the last two of
 * them is, and where each of those points lands on the sheet. A chart that draws a rise where the register
 * holds a fall is worse than no chart, and neither half of that sentence is visible in a screenshot.
 *
 * Run: npx tsx tests/exam-result-trend.test.ts
 */
import assert from 'node:assert/strict';
import {chartOf,trendOf,type TrendExam} from '../src/lib/exams/result-trend';

const exam=(id:string,date:string,percentage:number,position:number|null,over:Partial<TrendExam>={}):TrendExam=>
  ({id,name:`পরীক্ষা ${id}`,date,percentage,position,grade:'A',absent:false,...over});

// ── 1. Oldest first, whatever order the rows were read in ─────────────────────────────────────────
const shuffled=trendOf([exam('c','2026-04-01',82,1),exam('a','2026-02-01',70,3),exam('b','2026-03-01',75,2)]);
assert.deepEqual(shuffled.points.map(point=>point.id),['a','b','c'],'the series runs oldest to newest, not in the order it was fetched');
assert.equal(shuffled.change,7,'and the step is the last minus the one before it');
assert.equal(shuffled.direction,'up');

// ── 2. Both directions, and no change at all ──────────────────────────────────────────────────────
assert.equal(trendOf([exam('a','2026-02-01',90,1),exam('b','2026-03-01',60,2)]).direction,'down','a fall is a fall');
assert.equal(trendOf([exam('a','2026-02-01',80,1),exam('b','2026-03-01',80,1)]).direction,'same','and holding steady says so rather than rounding into a rise');
assert.equal(trendOf([exam('a','2026-02-01',80,1),exam('b','2026-03-01',80,1)]).change,0);
const three=trendOf([exam('a','2026-01-01',50,5),exam('b','2026-02-01',90,1),exam('c','2026-03-01',60,3)]);
assert.equal(three.change,-30,'the step is between the LAST two, so a good month in the middle does not hide a bad one after it');
assert.equal(three.direction,'down');
assert.deepEqual(three.best,{percentage:90,name:'পরীক্ষা b'},'and the best of the series is still named, because a trend is not only its last step');

// ── 3. One point is no trend, and none is no trend ────────────────────────────────────────────────
assert.equal(trendOf([exam('a','2026-02-01',70,3)]).direction,'none','one exam has nothing to be compared with');
assert.equal(trendOf([exam('a','2026-02-01',70,3)]).change,null);
assert.equal(trendOf([]).points.length,0);
assert.equal(trendOf([]).best,null);

// ── 4. Absence is not a score ─────────────────────────────────────────────────────────────────────
/* The case the chart exists to get right: a child who missed the middle exam has 0 percent on that row.
   Plotting it would draw a collapse and then a recovery that never happened, so the row is out of the
   line — and the count of what was left out is reported, not swallowed. */
const withAbsent=trendOf([
  exam('a','2026-02-01',70,3),
  exam('b','2026-03-01',0,null,{absent:true}),
  exam('c','2026-04-01',74,2),
]);
assert.deepEqual(withAbsent.points.map(point=>point.id),['a','c'],'the absent exam is left out of the line');
assert.equal(withAbsent.skippedAbsent,1,'and it is counted, so the screen can say one was left out');
assert.equal(withAbsent.change,4,'so the step is between two exams the child actually sat');
assert.equal(withAbsent.direction,'up');
assert.equal(trendOf([exam('a','2026-02-01',0,null,{absent:true}),exam('b','2026-03-01',0,null,{absent:true})]).points.length,0,
  'a child who sat nothing has no trend, not a flat one');

// ── 5. A date that cannot be read sorts last rather than first ────────────────────────────────────
const undated=trendOf([exam('a','',70,3),exam('b','2026-03-01',80,1)]);
assert.deepEqual(undated.points.map(point=>point.id),['b','a'],'an exam with no readable date does not jump to the front of a child’s history');

// ── 6. The geometry: the whole scale, evenly spaced, and clamped ──────────────────────────────────
const size={width:680,height:210,pad:34};
/* `chartOf` rounds every coordinate to two places, because an SVG path full of 119.19999999999999 is a
   path nobody can read in a diff. The test rounds the same way rather than loosening the assertion. */
const r=(value:number):number=>Math.round(value*100)/100;
const chart=chartOf(trendOf([exam('a','2026-02-01',40,3),exam('b','2026-03-01',80,1),exam('c','2026-04-01',100,1)]).points,size);
assert.deepEqual(chart.axis,{min:0,max:100},
  'the vertical axis is the whole 0–100 scale, never the data’s own neighbourhood — squeezing it would make two points apart look like a collapse');
assert.equal(chart.dots.length,3);
assert.equal(chart.dots[0].x,size.pad,'the first point sits on the left padding');
assert.equal(chart.dots[2].x,size.width-size.pad,'and the last on the right');
assert.equal(chart.dots[1].x,r((size.pad+(size.width-size.pad))/2),'with the middle one evenly between them: the exams are a sequence, not a timeline');
const floor=size.height-size.pad;
assert.equal(chart.dots[0].y,r(floor-(40/100)*(floor-size.pad)),'40 percent is 40 percent of the way up from the floor');
assert.equal(chart.dots[2].y,size.pad,'and 100 percent is on the ceiling');
assert.ok(chart.line.startsWith('M')&&chart.line.includes('L'),'the line is one path through the points, in order');
assert.equal(chartOf(trendOf([exam('a','2026-02-01',75,1)]).points,size).dots[0].x,
  r(size.pad+(size.width-size.pad*2)/2),'a single point is centred, because a dot pinned to the axis reads as a starting value nobody measured');
const clamped=chartOf([{id:'x',name:'x',date:'2026-02-01',percentage:140,position:1,grade:'A+'},{id:'y',name:'y',date:'2026-03-01',percentage:-5,position:2,grade:'F'}],size);
assert.equal(clamped.dots[0].y,size.pad,'a percentage over 100 is drawn on the ceiling rather than off the sheet');
assert.equal(clamped.dots[1].y,floor,'and one under 0 on the floor');

console.log('Result trend: the series runs oldest to newest with the step between the last two exams, a fall and a flat line say what they are, an absent exam is left out of the line and counted rather than drawn as a collapse, an unreadable date sorts last, and the chart maps the whole 0–100 scale onto evenly spaced points with a single point centred and an out-of-range one clamped to the edge.');
