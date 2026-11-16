// @ts-nocheck -- R3.15: the visitor import wizard's dry run, with no database.
/**
 * R3.15 · The Visitor import dry run, against the labelled fake fixture and nothing else.
 *
 * The fixture (`tests/fixtures/Visitor-Import-FAKE-SAMPLE.xlsx`, sheet "FAKE visitors", and its CSV
 * twin) is nine invented rows chosen to carry one of each doubt the wizard must show: a day-first
 * date, a two-digit year, a year that disagrees with the sheet, an empty date, a missing name, a
 * missing class, a hand-grouped number, a short number, two numbers in one cell, two rows sharing one
 * number, Bangla vocabulary, and a column nobody named. This suite proves the reading of them:
 *
 *   • the CSV reader survives quotes, doubled quotes, commas inside quotes and CRLF;
 *   • the workbook reader keeps every written sheet and refuses a file that is neither;
 *   • the preview maps the headers it knows, ASKS about `Column 1` instead of guessing, and counts
 *     ready / decide / blocked / matched / skipped / siblings;
 *   • a doubtful date waits for a hand: the sheet's own year is offered as a suggestion, an empty date
 *     offers today, and neither moves until the decision arrives;
 *   • siblings sharing a number are flagged together and never blocked;
 *   • a row whose number is already on file is matched, so the same file twice writes once.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {parseCsvGrid} from '../src/lib/leads/import-csv';
import {
  previewLeadImport,readLeadWorkbook,flagPair,emptyLeadDecisions,
} from '../src/lib/leads/import-preview';

const FIXTURE=path.join('tests','fixtures','Visitor-Import-FAKE-SAMPLE');
const NOW=new Date(Date.UTC(2026,0,10,6,0,0)); // Dhaka sees 2026-01-10
const TODAY='2026-01-10';

async function main(){
  // ── the CSV reader ─────────────────────────────────────────────────────────────────────────────
  assert.deepEqual(parseCsvGrid('a,"b, c","d""e"\r\n1,2,3\n'),[['a','b, c','d"e'],['1','2','3']]);
  assert.deepEqual(parseCsvGrid('﻿Name\n"FAKE, One"\n'),[['Name'],['FAKE, One']]);
  assert.deepEqual(parseCsvGrid('a,b\n\n\n'),[['a','b']]);

  // ── the workbook reader, and its refusal ───────────────────────────────────────────────────────
  const xlsx=await readLeadWorkbook('Visitor-Import-FAKE-SAMPLE.xlsx',readFileSync(`${FIXTURE}.xlsx`));
  assert.equal(xlsx.length,1);
  assert.equal(xlsx[0].name,'FAKE visitors');
  assert.equal(xlsx[0].grid.length,10); // header plus nine invented rows
  const csv=await readLeadWorkbook('Visitor-Import-FAKE-SAMPLE.csv',readFileSync(`${FIXTURE}.csv`));
  assert.deepEqual(csv[0].grid,xlsx[0].grid.map(row=>row.map(cell=>String(cell??''))));
  await assert.rejects(()=>readLeadWorkbook('picture.png',Buffer.from('nope')),/NOT_A_WORKBOOK/);
  await assert.rejects(()=>readLeadWorkbook('empty.xlsx',Buffer.alloc(0)),/NOT_A_WORKBOOK/);

  // ── the first look: every doubt named, nothing written ─────────────────────────────────────────
  const decisions=emptyLeadDecisions();
  const first=previewLeadImport(xlsx,decisions,{fileLabel:'Visitor-Import-FAKE-SAMPLE.xlsx',now:NOW});
  assert.deepEqual(first.counts,{total:9,ready:6,decide:2,blocked:1,matched:0,skipped:0,siblings:2});
  const column=first.columns.find(col=>col.header==='Column 1');
  assert.equal(column?.questionKey,'sheetQuestions.unnamed');
  assert.equal(first.columns.filter(col=>col.field).length,9);
  const rowOf=(row:number)=>first.rows.find(item=>item.row===row)!;
  // day-first, two-digit years, and the sheet's own vocabulary, all read without a guess
  assert.equal(rowOf(1).dateDay,'2025-12-02');
  assert.equal(rowOf(2).dateDay,'2025-12-15');
  assert.equal(rowOf(8).group,'science');
  assert.equal(rowOf(8).medium,'bangla');
  assert.equal(rowOf(1).classGroup,9);
  assert.equal(rowOf(1).newSession,true);
  assert.equal(rowOf(3).exam,'ssc'); // "SSC 25" is an exam batch: class 10 minus the years since
  assert.equal(rowOf(3).classGroup,11);
  // the year that disagrees with the sheet is flagged with the sheet's year as a suggestion
  assert.equal(rowOf(3).dateDay,'2014-11-20');
  assert.equal(rowOf(3).dateSuggested,'2025-11-20');
  assert.equal(rowOf(3).status,'decide');
  // an empty date offers today, and waits
  assert.equal(rowOf(4).dateSuggested,TODAY);
  assert.equal(rowOf(4).status,'decide');
  assert.ok(rowOf(4).flags.some(flag=>flag.code==='short'));
  // a nameless row cannot become a lead, and says so
  assert.equal(rowOf(5).status,'blocked');
  assert.ok(rowOf(5).flags.some(flag=>flag.messageKey==='import.flags.missingName'));
  // siblings: one number on two rows, flagged together, neither blocked
  assert.equal(rowOf(1).siblingKey,rowOf(1).key);
  assert.equal(rowOf(6).siblingKey,rowOf(1).key);
  assert.equal(rowOf(6).status,'ready');
  assert.ok(rowOf(6).flags.some(flag=>flag.messageKey==='import.flags.siblingInFile'));
  // two numbers in one cell are two numbers
  assert.equal(rowOf(7).phones.length,2);
  // the Bangla comment survives as the row's note, for the commit to make it the first note
  assert.equal(rowOf(1).notes,'ভর্তি বিষয়ে জানতে চেয়েছিলেন');
  // a stored doubt carries both languages
  const siblingFlag=rowOf(6).flags.find(flag=>flag.messageKey==='import.flags.siblingInFile')!;
  const pair=flagPair(siblingFlag);
  assert.match(pair.messageBn,/ভাইবোন|family/);
  assert.match(pair.messageEn,/familyKey/);

  // ── the owner answers: map the unnamed column, accept both dates, skip one row ─────────────────
  const answered={
    mapping:{[column!.key]:'interestedIn'},
    accept:{[rowOf(3).key]:'accept' as const,[rowOf(4).key]:'accept' as const},
    skip:{[rowOf(9).key]:true},
  };
  const second=previewLeadImport(xlsx,answered,{fileLabel:'Visitor-Import-FAKE-SAMPLE.xlsx',now:NOW});
  assert.deepEqual(second.counts,{total:9,ready:7,decide:0,blocked:1,matched:0,skipped:1,siblings:2});
  assert.equal(second.rows.find(item=>item.row===3)!.dateDay,'2025-11-20');
  assert.equal(second.rows.find(item=>item.row===4)!.dateDay,TODAY);
  // keeping an empty date means no date, and a lead without a date is not written
  const kept=previewLeadImport(xlsx,{...answered,accept:{...answered.accept,[rowOf(4).key]:'keep' as const}},
    {fileLabel:'Visitor-Import-FAKE-SAMPLE.xlsx',now:NOW});
  assert.equal(kept.rows.find(item=>item.row===4)!.status,'blocked');
  assert.ok(kept.rows.find(item=>item.row===4)!.flags.some(flag=>flag.messageKey==='import.flags.dateDeclined'));

  // ── a number already on file is matched, not doubled ───────────────────────────────────────────
  const matched=previewLeadImport(xlsx,answered,{
    fileLabel:'Visitor-Import-FAKE-SAMPLE.xlsx',now:NOW,
    existing:{phones:{'01711111111':'V-2025-0001 · FAKE Visitor One'},names:{}},
  });
  assert.equal(matched.rows.find(item=>item.row===1)!.status,'matched');
  assert.equal(matched.rows.find(item=>item.row===6)!.status,'matched'); // the sibling's number too
  assert.equal(matched.counts.matched,2);

  // ── the CSV twin reads to the very same preview ────────────────────────────────────────────────
  const fromCsv=previewLeadImport(csv,decisions,{fileLabel:'Visitor-Import-FAKE-SAMPLE.csv',now:NOW});
  assert.deepEqual(fromCsv.counts,first.counts);
  assert.equal(fromCsv.rows.find(item=>item.row===3)!.dateSuggested,'2025-11-20');

  console.log('Visitor import dry run: 9 synthetic rows read from XLSX and CSV alike — 6 ready, 2 awaiting a date decision, 1 blocked for want of a name, 2 sibling rows flagged together, the unnamed column asked about and the sheet\u2019s own year offered as a suggestion. Nothing written.');
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
