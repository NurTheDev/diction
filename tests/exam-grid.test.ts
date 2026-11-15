/**
 * R5 · Exams — reading a mark, a pasted block and a marks sheet.
 *
 * Three doors lead into one record: typing, pasting out of Excel, and uploading a sheet. These are the
 * assertions that all three are read by the same rule — Bangla digits folded before they are parsed, a
 * decimal refused rather than rounded, a mark over the full mark refused rather than clipped, `A` read as
 * absence and never as a zero, a pasted block kept in its rows and columns, a sheet row matched to exactly
 * one student or listed rather than guessed, and a column that is not a subject of this exam left alone.
 *
 * The workbook half runs against a real XLSX built in memory with ExcelJS and a real CSV, through the one
 * reader the app has (`lib/sheets/workbook`), so the marks import is proven against the file formats an
 * operator actually saves rather than against a shape invented for the test.
 *
 * Run: npx tsx tests/exam-grid.test.ts
 */
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {readWorkbook} from '../src/lib/sheets/workbook';
import {
  readMarkCell,rowIsComplete,missingSubjects,parsePastedBlock,mapMarksHeader,matchRoster,previewMarksSheet,
  type RosterEntry,
} from '../src/lib/exams/grid';

/** The workbook half is async, so the suite runs inside one function rather than at top level. */
async function run(){
  const subjects=[{id:'bn',name:'বাংলা',nameEn:'Bangla',full:100},{id:'math',name:'গণিত',nameEn:'Mathematics',full:50}];
  const roster:RosterEntry[]=[
    {id:'s1',studentId:'STD-1',name:'রহিম উদ্দিন',nameEn:'Rahim Uddin',roll:'1'},
    {id:'s2',studentId:'STD-2',name:'করিম উদ্দিন',nameEn:'Karim Uddin',roll:'2'},
    {id:'s3',studentId:'STD-3',name:'সালমা আক্তার',nameEn:'Salma Akter',roll:''},
  ];

  // ── One cell ────────────────────────────────────────────────────────────────────────────────────
  assert.deepEqual(readMarkCell('80',100),{ok:true,obtained:80,absent:false},'a plain mark');
  assert.equal(readMarkCell(80,100).ok,true,'an XLSX cell keeps its number');
  assert.deepEqual(readMarkCell('৮০',100),{ok:true,obtained:80,absent:false},'Bangla digits are folded before they are parsed');
  assert.equal((readMarkCell(' ৮০ ',100) as {obtained:number}).obtained,80,'and spaces around them do not matter');
  assert.deepEqual(readMarkCell('A',100),{ok:true,obtained:null,absent:true},'A means absent');
  assert.deepEqual(readMarkCell('absent',100),{ok:true,obtained:null,absent:true},'so does the word');
  assert.deepEqual(readMarkCell('\u0985\u09a8\u09c1\u09aa\u09b8\u09cd\u09a5\u09bf\u09a4',100),{ok:true,obtained:null,absent:true},'and the Bangla word a Bangla sheet writes');
  assert.equal(readMarkCell('',100).ok,false,'an empty cell is not a mark');
  assert.equal((readMarkCell('',100) as {code:string}).code,'EMPTY','it is a hole, and it is named as one');
  assert.equal((readMarkCell('৮০.৫',100) as {code:string}).code,'NOT_AN_INTEGER','a Bangla decimal is a decimal, and earns the same instruction as an English one');
  assert.equal((readMarkCell('80.5',100) as {code:string}).code,'NOT_AN_INTEGER','a decimal is refused rather than rounded');
  assert.equal((readMarkCell('101',100) as {code:string}).code,'OUT_OF_RANGE','a mark over the full mark is refused, not clipped');
  assert.equal((readMarkCell(101,100) as {code:string}).code,'OUT_OF_RANGE','whatever way it arrived');
  assert.equal((readMarkCell('-5',100) as {code:string}).code,'NOT_A_NUMBER','a negative mark is not a mark');
  assert.equal((readMarkCell('abc',100) as {code:string}).code,'NOT_A_NUMBER');
  assert.equal((readMarkCell(new Date('2026-01-02'),100) as {code:string}).code,'NOT_A_NUMBER','a date in a marks column is not a mark');
  assert.equal((readMarkCell('1,200',2000) as {obtained:number}).obtained,1200,'a thousands separator a spreadsheet added for display is read through');
  const refusal=readMarkCell('101',100) as {messageKey:string;messageParams:Record<string,unknown>};
  assert.equal(refusal.messageKey,'grid.errors.outOfRange','a refusal travels as a catalog key');
  assert.equal(refusal.messageParams.full,100,'with the full mark it broke, so the sentence can say it');

  // ── A row is written whole or not at all ────────────────────────────────────────────────────────
  const reads=[{subject:'bn',read:readMarkCell('80',100)},{subject:'math',read:readMarkCell('',50)}];
  assert.equal(rowIsComplete(reads.map(entry=>entry.read)),false,'a hole in a row is not a mark');
  assert.deepEqual(missingSubjects(reads),['math'],'and the subject still to fill is named');
  assert.equal(rowIsComplete([{subject:'bn',read:readMarkCell('A',100)},{subject:'math',read:readMarkCell('40',50)}].map(entry=>entry.read)),true,'absence completes a row');
  assert.equal(rowIsComplete([]),false,'no cells is not a complete row');

  // ── A block from the clipboard keeps its shape ──────────────────────────────────────────────────
  assert.deepEqual(parsePastedBlock('80\t40\n70\t30'),[['80','40'],['70','30']],'tab-separated, as Excel and Google Sheets copy it');
  assert.deepEqual(parsePastedBlock('80,40\r\n70,30'),[['80','40'],['70','30']],'comma-separated with Windows line ends, as a CSV preview copies it');
  assert.deepEqual(parsePastedBlock('"রহিম",80'),[['রহিম','80']],'and a quoted cell stays one cell');
  assert.deepEqual(parsePastedBlock('   '),[],'an empty clipboard pastes nothing');
  assert.deepEqual(parsePastedBlock('80'),[['80']],'a single cell is a block of one');

  // ── Which column is which ───────────────────────────────────────────────────────────────────────
  const mapped=mapMarksHeader(['Student ID','বাংলা','গণিত','মন্তব্য'],subjects);
  assert.equal(mapped.studentColumn,0,'a header that says whose marks these are');
  assert.deepEqual(mapped.subjectColumns.map(column=>column.subject),['bn','math'],'each subject matched by its own name');
  assert.deepEqual(mapped.unused,['মন্তব্য'],'and a column that is not a subject is left alone, and listed');
  assert.equal(mapMarksHeader(['Roll','Bangla','Mathematics'],subjects).studentColumn,0,'the English name of a subject matches too');
  assert.equal(mapMarksHeader(['নাম','বাংলা','গণিত'],subjects).studentColumn,0,'a Bangla student header is recognized');
  assert.equal(mapMarksHeader(['শ্রেণি','বাংলা','গণিত'],subjects).studentColumn,0,'and with no known header the first column is where a sheet puts the student');
  const duplicate=mapMarksHeader(['ID','বাংলা','Bangla','গণিত'],subjects);
  assert.equal(duplicate.subjectColumns.filter(column=>column.subject==='bn').length,1,'a subject named in two columns is read once, not twice');

  // ── Matching a sheet row to a student ───────────────────────────────────────────────────────────
  assert.deepEqual(matchRoster('STD-2',roster).map(entry=>entry.id),['s2'],'by student id');
  assert.deepEqual(matchRoster('std-2',roster).map(entry=>entry.id),['s2'],'whatever its case');
  assert.deepEqual(matchRoster('2',roster).map(entry=>entry.id),['s2'],'by roll');
  assert.deepEqual(matchRoster('করিম উদ্দিন',roster).map(entry=>entry.id),['s2'],'by Bangla name');
  assert.deepEqual(matchRoster('Karim  Uddin',roster).map(entry=>entry.id),['s2'],'by English name, with the spacing a sheet has');
  assert.deepEqual(matchRoster('STD-9',roster),[],'a row that matches nobody matches nobody');
  assert.deepEqual(matchRoster('',roster),[],'and a blank cell is not a wildcard');
  assert.equal(matchRoster('রহিম উদ্দিন',[...roster,{id:'s4',studentId:'STD-4',name:'রহিম উদ্দিন',nameEn:'Rahim Uddin',roll:'9'}]).length,2,'two students with one name is an ambiguity, not a choice');
  assert.equal(matchRoster('Rahim Uddin',[...roster,{id:'s4',studentId:'STD-4',name:'রহিম উদ্দিন',nameEn:'Rahim Uddin',roll:'9'}]).length,2,'in either language');

  // ── The dry run of a CSV upload ─────────────────────────────────────────────────────────────────
  // A roster with two students of one name: the sheet has to be refused for that row rather than allowed
  // to pick one of them, because a mark written onto the wrong child is the mistake nothing else here can
  // undo.
  const twins:RosterEntry[]=[...roster,{id:'s4',studentId:'STD-4',name:'রহিম উদ্দিন',nameEn:'Rahim Uddin',roll:'9'}];
  const csv=[
    'Student ID,বাংলা,গণিত,Phone',
    'STD-1,৮০,৪০,01712345678',
    'STD-2,A,30,',
    'STD-9,70,30,',
    '2,60,25,',
    'রহিম উদ্দিন,70,30,',
    'STD-3,101,25,',
    'STD-1,50,,',
  ].join('\n');
  const csvSheets=await readWorkbook('marks.csv',Buffer.from(csv,'utf8'));
  assert.equal(csvSheets.length,1,'a CSV is one sheet');
  assert.equal(csvSheets[0].name,'marks','named for the file, because a CSV has no sheet names');
  const preview=previewMarksSheet(csvSheets,{subjects,roster:twins,fileLabel:'marks.csv'});
  assert.equal(preview.refusal,null,'the sheet could be read');
  assert.equal(preview.studentColumn,'Student ID','and it says which column named the student');
  assert.deepEqual(preview.subjectColumns.map(column=>column.header),['বাংলা','গণিত']);
  assert.deepEqual(preview.unusedHeaders,['Phone'],'a phone column in a marks sheet is not read as a mark');
  assert.equal(preview.counts.rows,7,'seven student rows');
  assert.equal(preview.counts.ready,3,'STD-1 in Bangla digits, an absent STD-2, and a row found by its roll');
  assert.equal(preview.counts.unmatched,1,'STD-9 is not in this class');
  assert.equal(preview.counts.ambiguous,1,'a name two students share');
  assert.equal(preview.counts.invalid,1,'101 out of 100');
  assert.equal(preview.counts.incomplete,1,'a row with a hole in it');
  const byRow=(row:number)=>preview.rows.find(entry=>entry.row===row)!;
  assert.equal(byRow(2).status,'ready');
  assert.equal(byRow(2).student?.id,'s1');
  assert.deepEqual(byRow(2).cells.map(cell=>cell.raw),['৮০','৪০'],'the preview shows what the sheet said, not what it was folded into');
  assert.equal(byRow(3).status,'ready','absence is a complete row');
  assert.deepEqual((byRow(3).cells[0].read as {absent:boolean}).absent,true,'and it is stored as absence, not as a zero');
  assert.equal(byRow(4).status,'unmatched');
  assert.equal(byRow(4).statusKey,'import.status.unmatched','and its reason is a catalog key');
  assert.equal(byRow(5).status,'ready');
  assert.equal(byRow(5).student?.id,'s2','a row that named a roll found the student who holds it');
  assert.equal(byRow(6).status,'ambiguous');
  assert.equal(byRow(6).matches.length,2,'both students it could be are listed');
  assert.equal(byRow(6).student,null,'and neither is chosen');
  assert.equal(byRow(7).status,'invalid');
  assert.equal(byRow(7).refusals[0].messageKey,'grid.errors.outOfRange');
  assert.equal(byRow(8).status,'incomplete');

  // ── The dry run of a real XLSX upload ───────────────────────────────────────────────────────────
  const workbook=new ExcelJS.Workbook();
  workbook.addWorksheet('খালি');
  const sheet=workbook.addWorksheet('Marks');
  sheet.addRow(['Student ID','Bangla','Mathematics','Comment']);
  sheet.addRow(['STD-1',80,40,'ভালো']);
  sheet.addRow(['STD-2',null,30,'']);
  sheet.addRow(['সালমা আক্তার',70,45,'']);
  sheet.addRow(['STD-9',60,20,'']);
  const buffer=Buffer.from(await workbook.xlsx.writeBuffer());
  const xlsxSheets=await readWorkbook('class-marks.xlsx',buffer);
  assert.equal(xlsxSheets.length,1,'a sheet with nothing written in it is not a sheet to preview');
  assert.equal(xlsxSheets[0].name,'Marks');
  const xlsxPreview=previewMarksSheet(xlsxSheets,{subjects,roster,fileLabel:'class-marks.xlsx'});
  assert.equal(xlsxPreview.refusal,null);
  assert.deepEqual(xlsxPreview.subjectColumns.map(column=>column.subject),['bn','math'],'subjects matched by their English names this time');
  assert.equal(xlsxPreview.counts.rows,4);
  assert.equal(xlsxPreview.counts.ready,2,'the row of numbers, and a row found by a Bangla name');
  assert.equal(xlsxPreview.counts.incomplete,1,'a null cell is a hole');
  assert.equal(xlsxPreview.counts.unmatched,1,'a student id that is not in this class');
  assert.equal(xlsxPreview.rows[2].student?.id,'s3','a real workbook matched a student by her Bangla name');
  assert.equal(xlsxPreview.rows[0].cells[0].raw,'80','a numeric cell reads back as the number it is');

  // ── The refusals a sheet can earn before a row is read ──────────────────────────────────────────
  assert.equal(previewMarksSheet([{name:'S',grid:[['Student ID','ফোন']]}],{subjects,roster,fileLabel:'x.csv'}).refusal?.messageKey,
    'import.errors.noSubjectColumn','a sheet with no subject of this exam in it says so');
  assert.equal(previewMarksSheet([{name:'S',grid:[['Student ID','বাংলা']]}],{subjects,roster,fileLabel:'x.csv'}).refusal?.messageKey,
    'import.errors.noRows','and a sheet with a header and no students says that');
  assert.equal(previewMarksSheet([],{subjects,roster,fileLabel:'x.csv'}).refusal?.messageKey,'import.errors.noRows');
  const capped=previewMarksSheet([{name:'S',grid:[['ID','বাংলা','গণিত'],...Array.from({length:600},(_,index)=>[`STD-${index}`,'80','40'])]}],{subjects,roster,fileLabel:'big.csv'});
  assert.equal(capped.counts.rows,600,'every row is counted');
  assert.equal(capped.rows.length,600,'and read, so the screen can decide what to show');

  // ── The one workbook reader refuses what is not a workbook ──────────────────────────────────────
  await assert.rejects(()=>readWorkbook('notes.pdf',Buffer.from('%PDF-1.4')),(error:Error)=>(error as {code?:string}).code==='NOT_A_WORKBOOK','a PDF is not a sheet');
  await assert.rejects(()=>readWorkbook('empty.csv',Buffer.from('')),(error:Error)=>(error as {code?:string}).code==='EMPTY_SHEET','an empty file is an answer, not a preview');
  const text=await readWorkbook('list.txt',Buffer.from('a,b\n1,2','utf8'));
  assert.deepEqual(text[0].grid,[['a','b'],['1','2']],'.txt is read as comma-separated text');

  console.log('Exam grid: cells, Bangla digits, absence, paste blocks, header mapping, roster matching and CSV plus XLSX previews passed.');

}

run().catch(error=>{console.error(error);process.exit(1)});
