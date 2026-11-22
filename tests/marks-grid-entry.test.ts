/**
 * O1 · The marks grid is a grid you type into, and the class list it types into is in roll order.
 *
 * The brief's rule is that no spreadsheet stands between an operator and a mark: opening an exam shows
 * every child enrolled on it, ready to be typed into, and a CSV or XLSX is a second door rather than the
 * door. Two things can break that without anything looking wrong —
 *
 * · **The roll could be read as text.** Rolls are typed by whoever keeps the register, so one column
 *   holds `7`, `৭`, `০৭`, `7-A` and blanks. Sorted as strings, roll ১০ arrives above roll ২, and a
 *   teacher marking from a numbered paper roll reads the grid against the wrong child. So the ordering
 *   is proved here against exactly those shapes: digits are digits in either script, a roll that starts
 *   with a number sorts by that number, one that does not stays after every number in name order, and
 *   two children who share a roll still arrive in the same order every time.
 * · **The upload could become a step.** A grid that renders nothing until a file is chosen is a screen
 *   that cannot be used at a desk with no laptop, so the shape of the grid is asserted against its own
 *   source: the roll and the row's own status are columns, the enrolled children are painted whether or
 *   not anything was uploaded, and the import lives behind a toggle in the grid's toolbar.
 *
 * The numbers behind a mark — total, percentage, grade — are `tests/exam-grading-percentage.test.ts`;
 * this suite is about the grid being a grid.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareRoster,rollOrder} from '../src/lib/exams/exam-view';

const read=(file:string):string=>readFileSync(file,'utf8');
const GRID='src/components/exams/marks-grid.tsx';
const grid=read(GRID);

// ── 1. A roll is read as a number, in either script ────────────────────────────────────────────────
assert.equal(rollOrder('7'),7,'an ASCII roll is the number it looks like');
assert.equal(rollOrder('৭'),7,'and so is the same roll in Bangla digits');
assert.equal(rollOrder('০৭'),7,'a leading zero is a padding habit, not a different roll');
assert.equal(rollOrder('07'),7,'in either script');
assert.equal(rollOrder('7-A'),7,'a roll with a letter after the number still sorts by its number');
assert.equal(rollOrder(' ১২ '),12,'and a roll typed with spaces round it is still read');
assert.equal(rollOrder('ক'),null,'a roll that is not a number is not pretended to be one');
assert.equal(rollOrder(''),null,'and a roll nobody wrote is not zero');

// ── 2. The order the grid is walked in ─────────────────────────────────────────────────────────────
const roster=[
  {roll:'১০',name:'নমুনা ছাত্র দশ'},
  {roll:'২',name:'নমুনা ছাত্র দুই'},
  {roll:'1',name:'নমুনা ছাত্র এক'},
  {roll:'',name:'নমুনা ছাত্র রোলহীন'},
  {roll:'7-A',name:'নমুনা ছাত্র সাত ক'},
  {roll:'7-B',name:'নমুনা ছাত্র সাত খ'},
];
const ordered=[...roster].sort(compareRoster).map(row=>row.roll||'(none)');
assert.deepEqual(ordered,['1','২','7-A','7-B','১০','(none)'],
  'the class list reads 1, 2, 7-A, 7-B, 10 and then the child with no roll — never ১০ before ২');
assert.equal(rollOrder('৭'),rollOrder('7'),'the same roll in two scripts is the same number, so it is the same place in the list');
assert.ok(compareRoster({roll:'৭',name:'ক'},{roll:'7',name:'খ'})<0,
  'and two children who hold it in different scripts are still ordered by name, not by whose digits are whose');
assert.ok(compareRoster({roll:'ক',name:'অ'},{roll:'ক',name:'আ'})<0,
  'two children whose rolls are both words are ordered by name, so the grid never shuffles');
assert.ok(compareRoster({roll:'',name:'জ'},{roll:'৩',name:'ঝ'})>0,
  'a roll nobody wrote is last rather than first, where a marked paper would run out of rows');

// ── 3. The grid is typed into, with the roll and the row's own state as columns ────────────────────
assert.ok(grid.includes("<th scope=\"col\">{t('col.roll')}</th>"),
  'the grid has a roll column, and it is the first one');
assert.ok(grid.includes('<td data-cell-roll>'),'and paints each child\'s roll in it');
assert.ok(grid.includes('<th scope="col">{t(\'col.student\')}</th>'),
  'the name and id column is still there beside the roll');
assert.ok(grid.includes("<th scope=\"col\">{t('col.status')}</th>")&&grid.includes('data-cell-status='),
  'every row says where it stands — saved, not saved yet, absent, incomplete — because the grid saves itself');
for(const column of ['col.total','col.percentage','col.grade','col.point','col.absent'])
  assert.ok(grid.includes(column),`the grid still shows the ${column.split('.')[1]} column`);
assert.ok(grid.includes('data-cell-grade')&&grid.includes('data-cell-percentage'),
  'the total, the percentage and the grade are painted per row, so they can move as a mark is typed');

// ── 4. A spreadsheet is a second door, never the door ──────────────────────────────────────────────
assert.ok(grid.includes('data-grid-import-toggle')&&grid.includes("<details className=\"center-exam-importfold\""),
  'the file import is folded into the grid\'s own toolbar as a second door');
assert.ok(grid.includes('importDoor?:ReactNode')&&grid.includes('importDoor={!published&&canWrite'),
  'and it is handed to the grid by the panel rather than standing in front of it');
const importAt=grid.indexOf('<MarksImport');
const tableAt=grid.indexOf('<table className="center-exam-grid"');
assert.ok(importAt>0&&tableAt>0,
  'the grid still renders its table and the upload component still exists');
const rowsAt=grid.indexOf('{students.map((student,rowIndex)=>{');
assert.ok(rowsAt>tableAt,'the rows are painted from the enrolled children, inside the table itself');
assert.ok(/data-grid-empty/.test(grid),'a grid with nobody on it says so');
const emptyLines=grid.split('\n').filter(line=>line.includes('data-grid-empty'));
assert.ok(emptyLines.length>0,'the grid has one empty state');
assert.ok(emptyLines.every(line=>/!students\.length|students\.length===0/.test(line)),
  'and it is reached only when the class has no children — never when no file was uploaded');

// ── 5. Typing moves down a column and across a row ────────────────────────────────────────────────
assert.ok(grid.includes('data-gridrow=')&&grid.includes('data-gridcolumn='),
  'each cell knows its row and its column, which is what Enter and Tab move by');
assert.ok(/key==='Enter'/.test(grid)&&/move\(\{row:rowIndex,column:columnIndex\},1,0\)/.test(grid),
  'Enter walks down the same column to the next child');
assert.ok(/Tab follows the browser's own order \(across a row\)/.test(grid),
  'and Tab is left to the browser, which walks it across the same child\'s own components');
assert.ok(/key==='ArrowDown'/.test(grid)&&/key==='ArrowRight'/.test(grid),
  'the arrows move too, so a hand never has to leave the keyboard');
assert.ok(grid.includes('AUTO_SAVE_MS'),'the grid saves itself on a debounce');
assert.ok(grid.includes('data-grid-save')&&grid.includes('SubmitButton'),
  'and the save it offers says it is saving while it saves');

console.log(`Marks grid: the roll column leads a class list ordered 1, 2, 7-A, 7-B, 10 with the child `+
  `who has no roll last — Bangla and ASCII digits read as the same numbers — every enrolled child is `+
  `painted with a per-row status, the total, percentage and grade move as a mark is typed, and the CSV `+
  `or XLSX import is one folded button in the toolbar rather than a step anybody has to take.`);
