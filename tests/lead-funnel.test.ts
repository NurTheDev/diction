/**
 * R3.17 · The visitor funnel's rules, with no database in sight.
 *
 * The aggregation itself is proved against the disposable database in `lead-funnel.integration.ts`;
 * what is proved here is everything a screen could get wrong without a query ever running:
 *
 *   • a rate with nobody to divide by is null, not 0% — zero percent is a claim that we tried;
 *   • rounding happens once, to one decimal, and never turns 2/3 into 66.66666666666667;
 *   • an invented breakdown, source, class or date in a URL is ignored rather than trusted, and a
 *     reversed from/to is read as the typo it is;
 *   • every source and every class is printed even at zero, months inside a chosen range are filled
 *     in, and the fill stops at its cap instead of rendering sixty empty rows for a crafted URL;
 *   • the CSV is quoted, carries a byte-order mark so Excel reads Bangla, keeps Latin digits so a
 *     column can still be added up, and neutralizes a cell that begins like a formula.
 */
import assert from 'node:assert/strict';
import {
  FUNNEL_MONTH_FILL_LIMIT,FUNNEL_NO_CLASS,funnelBuckets,funnelFilter,funnelQuery,monthsBetween,percent,ratesOf,
} from '../src/lib/leads/funnel';
import {CSV_BOM,csvCell,funnelCsv,funnelFileName} from '../src/lib/leads/funnel-csv';
import {LEAD_SOURCES} from '../src/lib/leads/vocab';

// ── 1. A rate is a fact about a denominator ───────────────────────────────────────────────────────
assert.equal(percent(1,3),33.3,'2/3 of a percent point is rounded once, down to one decimal');
assert.equal(percent(2,3),66.7,'and up when the next digit asks for it');
assert.equal(percent(3,8),37.5,'an exact rate stays exact');
assert.equal(percent(0,2),0,'nobody converted out of two visitors is a real zero');
assert.equal(percent(1,0),null,'nobody to divide by is null, never 0%');
assert.equal(percent(0,0),null,'and an empty bucket stays empty');
assert.equal(percent(2,1),200,'a rate over 100% is reported, not capped — but see the funnel note');
assert.deepEqual(ratesOf({visitors:8,trial:3,admitted:3,admittedFromTrial:1}),
  {visitorToTrial:37.5,trialToAdmitted:33.3,visitorToAdmitted:37.5},
  'the three rates come from one set of counts, and trial → admitted divides by the leads that did both');
assert.deepEqual(ratesOf({visitors:0,trial:0,admitted:0,admittedFromTrial:0}),
  {visitorToTrial:null,trialToAdmitted:null,visitorToAdmitted:null},'an empty cohort has no rates at all');

// ── 2. A URL is a suggestion, not an instruction ─────────────────────────────────────────────────
assert.deepEqual(funnelQuery({}),{breakdown:'month',from:'',to:'',source:'',classGroup:''},'no params means the month report');
assert.equal(funnelQuery({breakdown:'source'}).breakdown,'source');
assert.equal(funnelQuery({breakdown:'CLASS'}).breakdown,'month','a breakdown that is not one of the three falls back to month');
assert.equal(funnelQuery({source:'tiktok'}).source,'','an invented source is ignored, not queried');
assert.equal(funnelQuery({source:'facebook'}).source,'facebook');
assert.equal(funnelQuery({classGroup:'13'}).classGroup,'','a class outside 1–12 is ignored');
assert.equal(funnelQuery({classGroup:9}).classGroup,'9','a class may arrive as a number');
assert.equal(funnelQuery({classGroup:'0'}).classGroup,'','and there is no class zero');
assert.equal(funnelQuery({from:'05/01/2026'}).from,'','a date that is not a Dhaka day string is dropped');
assert.deepEqual(
  {from:funnelQuery({from:'2026-03-05',to:'2026-01-02'}).from,to:funnelQuery({from:'2026-03-05',to:'2026-01-02'}).to},
  {from:'2026-01-02',to:'2026-03-05'},'a reversed range is swapped: it is a typo, not a request for nothing');
assert.deepEqual(funnelFilter(funnelQuery({from:'2026-01-01',to:'2026-01-31',source:'phone',classGroup:'9'})),
  {date:{$gte:'2026-01-01',$lte:'2026-01-31'},source:'phone',classGroup:9},
  'the cohort filter is the same date field and the same vocabulary the Visitors list uses');
assert.deepEqual(funnelFilter(funnelQuery({})),{},'an unfiltered report filters nothing');

// ── 3. What gets printed ─────────────────────────────────────────────────────────────────────────
assert.deepEqual(funnelBuckets(funnelQuery({breakdown:'source'}),[]),[...LEAD_SOURCES],
  'all five sources are printed in vocabulary order, so a source that stopped working is a visible zero');
const classes=funnelBuckets(funnelQuery({breakdown:'class'}),[]);
assert.equal(classes.length,13,'twelve classes plus the leads whose class was never read');
assert.equal(classes[0],'1');
assert.equal(classes[11],'12');
assert.equal(classes[12],FUNNEL_NO_CLASS);
assert.deepEqual(funnelBuckets(funnelQuery({breakdown:'month'}),['2026-03','2026-01']),['2026-03','2026-01'],
  'with no range, only the months that hold a lead appear, newest first');
assert.deepEqual(monthsBetween('2026-01-15','2026-03-02'),['2026-03','2026-02','2026-01'],
  'a range fills the months it covers, from the newest end');
assert.deepEqual(monthsBetween('2026-02-10','2026-02-20'),['2026-02'],'one month stays one month');
assert.equal(monthsBetween('2026-03-02','2026-01-15').length,0,'a range that cannot be read fills nothing');
const capped=funnelBuckets(funnelQuery({breakdown:'month',from:'1990-01-01',to:'2026-03-01'}),['2026-03']);
assert.ok(capped.length<=FUNNEL_MONTH_FILL_LIMIT,`a crafted range fills at most ${FUNNEL_MONTH_FILL_LIMIT} months, not four hundred`);
assert.deepEqual(funnelBuckets(funnelQuery({breakdown:'month',from:'2026-01-01',to:'2026-02-01'}),['2026-02']),['2026-02','2026-01'],
  'a range a person actually chose fills its empty month, because that zero is the news');

// ── 4. The CSV ───────────────────────────────────────────────────────────────────────────────────
assert.equal(csvCell('জানুয়ারি 2026'),'"জানুয়ারি 2026"','a label is quoted so a comma inside it survives');
assert.equal(csvCell('a,b'),'"a,b"');
assert.equal(csvCell('say "hi"'),'"say ""hi"""','and an embedded quote is doubled');
assert.equal(csvCell(41.7),'41.7','a number goes out bare and in Latin digits, so a spreadsheet can still add the column up');
assert.equal(csvCell(0),'0','and a real zero is a zero, not an empty cell');
assert.equal(csvCell(Number.NaN),'','a number that is not finite goes out empty rather than as NaN');
assert.equal(csvCell(null),'','a rate nobody could divide by is an empty cell, not a dash');
assert.equal(csvCell(undefined),'');
assert.equal(csvCell('=SUM(A1)'),'"\'=SUM(A1)"','a cell that begins like a formula is neutralized');
assert.equal(csvCell('+1234'),'"\'+1234"','as is one that begins with a plus');
assert.equal(csvCell('@mention'),'"\'@mention"','and one that begins with an at sign');
const csv=funnelCsv(['মাস','ভিজিটর'],[['2026-01',3]]);
assert.ok(csv.startsWith(CSV_BOM),'the byte-order mark is what makes Excel read the Bangla label');
assert.equal(csv,`${CSV_BOM}"মাস","ভিজিটর"\r\n"2026-01",3\r\n`,'CRLF between rows and a trailing one, so a last row is never cut');
assert.equal(funnelCsv([],[]),`${CSV_BOM}\r\n`,'even an empty report is a readable file');
assert.equal(funnelFileName('month','2026-01-10'),'diction-funnel-month-2026-01-10.csv','the file name is ASCII and says which report and which day it is');
assert.equal(funnelFileName('by month!','2026-01-10'),'diction-funnel-bymonth-2026-01-10.csv','and a strange breakdown cannot put a strange character in it');

console.log('Funnel rules: a rate with no denominator is null and never 0%, rounding happens once to one decimal, trial → admitted divides by the leads that did both, an invented breakdown/source/class/date is ignored and a reversed range is swapped, all five sources and all thirteen class buckets print at zero, a chosen range fills its empty months up to the cap, and the CSV is BOM-marked, CRLF-separated, quoted, Latin-digit and formula-neutralized.');
