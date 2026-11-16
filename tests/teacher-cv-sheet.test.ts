/**
 * R4 · The teacher CV sheet, read: the labelled fake fixture through the import wizard's dry run.
 *
 * The rules that read a cell are proved in `teacher-cv-rules.test.ts`; this suite proves the promises
 * the wizard makes about a whole sheet, on a fixture where every name is invented and labelled FAKE:
 *
 *   • XLSX and CSV read to the SAME preview — the same rows, the same readings, the same doubts — so the
 *     format the owner saved in cannot change what the bank is told;
 *   • the column nobody named is a question with a select beside it, and the named columns map without
 *     being asked;
 *   • a day-first date, a two-digit year, a year that disagrees with the rest of the sheet (suggested,
 *     never repaired), an empty date offered today with the offer visible, Bangla digits in a number, a
 *     hand-grouped number, two numbers in one cell, a short number flagged and never padded, a salary
 *     written as a word flagged and left empty;
 *   • a row with no name and a second row carrying an earlier row's number are BLOCKED in the preview,
 *     because those are the counts that land — the preview is not a promise the commit is free to break;
 *   • the owner's answers (a column mapped, a suggestion accepted, a row skipped) change exactly the rows
 *     they name, and accepting a suggested date takes every doubt about that reading with it;
 *   • a CV already on file is matched by number and fills ONLY its gaps, writes nothing when there are
 *     none, and a file whose bytes already stand is announced before anybody presses save;
 *   • and no phone number is ever painted: every phone carries a mask.
 *
 * Run: npm run test:teacher:sheet
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {
  emptyCvDecisions,previewCvImport,readCvWorkbook,cvImportRowKey,emptyCvIndex,
  type CvImportColumn,type CvImportPreview,type CvImportRow,
} from '../src/lib/teachers/import-preview';

const fixture=(name:string)=>path.join('tests','fixtures',name);
const csvBuffer=readFileSync(fixture('Teacher-CV-FAKE-SAMPLE.csv'));
const xlsxBuffer=readFileSync(fixture('Teacher-CV-FAKE-SAMPLE.xlsx'));
// ── 9. The fixture, read from XLSX and from CSV, gives one preview ─────────────────────────────────



async function run(){
  const [csvSheets,xlsxSheets]=await Promise.all([
    readCvWorkbook('Teacher-CV-FAKE-SAMPLE.csv',csvBuffer),
    readCvWorkbook('Teacher-CV-FAKE-SAMPLE.xlsx',xlsxBuffer),
  ]);
  const csvPreview=previewCvImport(csvSheets,emptyCvDecisions(),{fileLabel:'Teacher-CV-FAKE-SAMPLE.csv',hash:'fake-hash'});
  const xlsxPreview=previewCvImport(xlsxSheets,emptyCvDecisions(),{fileLabel:'Teacher-CV-FAKE-SAMPLE.xlsx',hash:'fake-hash'});
  // The two shapes differ in three names the reader cannot know: the file label, its hash, and — for a
  // workbook — the sheet the owner called something else. Strip those and compare everything else.
  const strip=(preview:CvImportPreview)=>{
    const copy=JSON.parse(JSON.stringify({...preview,fileLabel:'',hash:'',sheet:''})) as CvImportPreview;
    copy.rows=copy.rows.map((row:CvImportRow)=>({...row,sheet:'',key:''}));
    copy.columns=copy.columns.map((column:CvImportColumn)=>({...column,sheet:'',key:''}));
    return copy;
  };
  assert.deepEqual(strip(csvPreview),strip(xlsxPreview),'XLSX and CSV read to the same rows, the same readings and the same doubts');

  assert.equal(csvPreview.counts.rows,10,'ten synthetic rows');
  assert.equal(csvPreview.counts.blocked,2,'the phone-only row and the second row carrying row 1’s number');
  assert.equal(csvPreview.counts.ready+csvPreview.counts.flagged,8,'eight rows can be written');
  const row=(n:number)=>csvPreview.rows.find(entry=>entry.row===n)!;
  const key=(n:number)=>cvImportRowKey(csvSheets[0].name,n);

  // The unnamed column is a question with a select beside it, never a default.
  const unnamed=csvPreview.columns.find(column=>column.header==='Column 1')!;
  assert.equal(unnamed.field,null,'the column nobody named reads to nothing…');
  assert.equal(unnamed.questionKey,'import.questions.unnamed','…and asks');
  assert.equal(unnamed.unnamed,true);
  assert.equal(csvPreview.columns.filter(column=>column.questionKey).length,1,'one question, for the one unnamed column');
  assert.equal(csvPreview.columns.find(column=>column.header==='Mobile')!.field,'phones','the named columns map without being asked');

  // Row 1: the brief's own messy subject cell, a hand-grouped number, a bare-hour free time.
  const one=row(1);
  assert.equal(one.name,'FAKE Candidate One');
  assert.deepEqual(one.classLevels,['6','7','8','9']);
  assert.deepEqual(one.subjects,['english','math','other']);
  assert.ok(one.unparsed.includes('GS'));
  assert.equal(one.subjectsText,'6, 7, 8 (Math, Eng) 9-GS, Other','the words are kept beside the reading');
  assert.deepEqual(one.phones.map(phone=>phone.normalized),['01711111111'],'a hand-grouped number normalizes');
  assert.deepEqual(one.shifts,['evening']);
  assert.equal(one.expectedSalary,12000);
  assert.equal(one.receivedDate,'2024-11-27','a day-first date');

  // Row 2: two-digit year, no leading zero, a class range, two words no table knows, ALL, 15k.
  const two=row(2);
  assert.equal(two.receivedDate,'2024-11-13','13.11.24 is the thirteenth of November 2024');
  assert.deepEqual(two.phones.map(phone=>phone.normalized),['01798765432'],'a number with no leading zero is still a Bangladeshi mobile');
  assert.deepEqual(two.classLevels,['4','5','6','7']);
  assert.deepEqual(two.subjects,['bangla']);
  assert.deepEqual(two.unparsed.sort(),['BGG','Emg']);
  assert.deepEqual(two.shifts,['morning','evening','any']);
  assert.equal(two.expectedSalary,15000);
  assert.ok(two.tags.includes('Emg'),'an unparsed word becomes a tag suggestion rather than a loss');

  // Row 3: a year that disagrees with the rest of the sheet is a SUGGESTION, never a repair.
  const three=row(3);
  assert.equal(three.receivedDate,'2014-12-15','read as written first');
  assert.equal(three.suggestedDate,'2024-12-15','and offered the sheet’s own year');
  assert.ok(three.flags.some(flag=>flag.messageKey==='flags.dateTypo'&&flag.suggested==='2024-12-15'),'the doubt is on the row');
  assert.ok(three.flags.some(flag=>flag.messageKey==='flags.dateVeryOld'),'and a date eleven years back is doubted on its own, not silently taken');
  assert.equal(three.status,'flagged','a doubtful date is a flag, never a block and never a repair');
  assert.deepEqual(three.classLevels,['10','12'],'SSC and HSC name their classes');
  assert.deepEqual(three.subjects,['math','physics','chemistry','ict'],'in the vocabulary’s order, so two sheets read the same way');
  assert.deepEqual(three.shifts,['evening'],'an explicit PM settles the shift with no inference flag');
  assert.equal(three.flags.some(flag=>flag.messageKey==='flags.shiftFromTime'),false);

  // Row 4: an empty date is offered today, and the offer is visible.
  const four=row(4);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(four.receivedDate),'an empty date falls back to a real day');
  assert.ok(four.flags.some(flag=>flag.messageKey==='flags.dateMissing'&&flag.suggested===four.receivedDate),'and the row says today was used');
  assert.equal(four.flags.some(flag=>flag.messageKey==='flags.dateTypo'),false,'with no year the reader invented, there is no year to doubt');
  assert.deepEqual(four.shifts,['morning','evening','any'],'“Full Time Free” is every shift');

  // Row 5: a phone-only row cannot become a CV, because a CV with no name cannot be called or hired.
  const five=row(5);
  assert.equal(five.name,'');
  assert.equal(five.status,'blocked');
  assert.equal(five.statusKey,'import.status.blocked');
  assert.ok(five.flags.some(flag=>flag.messageKey==='flags.noName'));

  // Row 6: a short number is flagged and never padded; a word instead of a salary is flagged, not zeroed.
  const six=row(6);
  assert.deepEqual(six.phones,[],'a five-digit number is not a phone');
  assert.ok(six.flags.some(flag=>flag.messageKey==='flags.phoneShort'||flag.messageKey==='flags.phoneInvalid'||flag.messageKey==='flags.phoneNotANumber'));
  assert.ok(six.flags.some(flag=>flag.messageKey==='flags.noPhone'));
  assert.equal(six.expectedSalary,null);
  assert.ok(six.flags.some(flag=>flag.messageKey==='flags.salaryUnknown'));
  assert.deepEqual(six.subjects,['accounting','finance']);

  // Row 7: the same number twice in ONE sheet — only the first can be written, and the row says why.
  const seven=row(7);
  assert.equal(seven.status,'blocked');
  assert.ok(seven.flags.some(flag=>flag.messageKey==='flags.duplicateInSheet'),'the second row is blocked in the preview…');
  assert.equal(csvPreview.counts.blocked,2,'…which is why the blocked count is two, not one');

  // Row 8: Bangla digits in the number, a Bangla subject word, a Bangla part of the day.
  const eight=row(8);
  assert.deepEqual(eight.phones.map(phone=>phone.normalized),['01312345678'],'Bangla digits normalize');
  assert.deepEqual(eight.subjects,['bangla']);
  assert.deepEqual(eight.shifts,['morning'],'সকাল is the morning shift');

  // Row 9: two numbers in one cell, an explicit evening window, and the unnamed column's text kept out.
  const nine=row(9);
  assert.deepEqual(nine.phones.map(phone=>phone.normalized),['01911111111','01622222222'],'two numbers in one cell read as two');
  assert.deepEqual(nine.shifts,['evening']);
  assert.equal(nine.email,'','an unnamed column is not read as an email');

  // Row 10: a name and no number is still a CV worth keeping.
  const ten=row(10);
  assert.equal(ten.status!=='blocked',true,'a name-only row is written');
  assert.deepEqual(ten.phones,[]);
  assert.ok(ten.flags.some(flag=>flag.messageKey==='flags.noPhone'));
  assert.deepEqual(ten.subjects,['history'],'a word read twice is one subject');
  assert.deepEqual(ten.unparsed,['World'],'and the word left over is kept, not swallowed');

  // No painted number anywhere in the preview: every phone carries a mask, and the mask hides the middle.
  for(const entry of csvPreview.rows){
    for(const phone of entry.phones)assert.match(phone.masked,/^\d{2}\*{4}\d{2}$|^\*{4}$/,`the mask on row ${entry.row} hides the middle`);
  }

  // ── 10. The owner's answers change exactly the rows they name ──────────────────────────────────
  const decided=previewCvImport(csvSheets,{
    mapping:{[`${csvSheets[0].name}:8`]:'email'},
    accept:{[key(3)]:'accept'},
    skip:{[key(10)]:true},
  },{fileLabel:'Teacher-CV-FAKE-SAMPLE.csv',hash:'fake-hash'});
  const decidedThree=decided.rows.find(entry=>entry.row===3)!;
  assert.equal(decidedThree.receivedDate,'2024-12-15','accepting the suggestion moves that one date');
  assert.equal(decidedThree.flags.some(flag=>flag.messageKey==='flags.dateTypo'),false,'and takes the doubt off the row');
  assert.equal(decidedThree.flags.some(flag=>flag.messageKey==='flags.dateVeryOld'),false,'and the doubt about the old year with it: a settled date is not doubted twice');
  assert.equal(decidedThree.status,'ready','so the row the owner settled is counted as settled');
  assert.equal(decided.counts.ready,csvPreview.counts.ready+1,'and the counts the owner reads move with the answer');
  assert.equal(decided.rows.find(entry=>entry.row===1)!.receivedDate,'2024-11-27','the rows nobody answered are untouched');
  assert.equal(decided.rows.find(entry=>entry.row===10)!.status,'skipped','a skipped row is skipped');
  assert.equal(decided.counts.skipped,1);
  const mappedColumn=decided.columns.find(column=>column.header==='Column 1')!;
  assert.equal(mappedColumn.field,'email','a column the owner named is read as that field');
  assert.equal(decided.rows.find(entry=>entry.row===9)!.email,'extra column text','and its text lands in the field the owner chose');
  const ignored=previewCvImport(csvSheets,{mapping:{[`${csvSheets[0].name}:8`]:'ignore'},accept:{},skip:{}},{fileLabel:'x',hash:'y'});
  assert.equal(ignored.columns.find(column=>column.header==='Column 1')!.questionKey,null,'a column the owner refused stops being a question');

  // ── 11. A CV already on file is matched, and a matched row fills only the gaps ──────────────────
  const index=emptyCvIndex();
  index.byPhone['01798765432']={id:'aaaaaaaaaaaaaaaaaaaaaaaa',candidateId:'CV-2024-0001',name:'FAKE Candidate Two'};
  index.gaps['aaaaaaaaaaaaaaaaaaaaaaaa']={email:true,department:false,university:true,currentInstitute:true,subjectsText:true,availabilityText:true,subjects:false,classLevels:true,expectedSalary:true};
  const matched=previewCvImport(csvSheets,emptyCvDecisions(),{fileLabel:'x',hash:'y',existing:index});
  const matchedRow=matched.rows.find(entry=>entry.row===2)!;
  assert.equal(matchedRow.status,'updated','a CV on file with gaps to fill is an update, not a twin');
  assert.deepEqual(matchedRow.match?.fills,['university','subjectsText','availabilityText','classLevels','expectedSalary'],
    'only the fields the CV on file is missing AND this sheet actually carries — the empty email and the full department fill nothing');
  assert.equal(matchedRow.match?.masked,'01****32','the matched CV is named by mask, never by number');
  assert.ok(matchedRow.flags.some(flag=>flag.messageKey==='flags.duplicate'&&flag.messageParams.candidateId==='CV-2024-0001'),'and the row says which CV it is a twin of, by reference and not by number');
  const fullIndex=emptyCvIndex();
  fullIndex.byPhone['01798765432']={id:'aaaaaaaaaaaaaaaaaaaaaaaa',candidateId:'CV-2024-0001',name:'FAKE Candidate Two'};
  fullIndex.gaps['aaaaaaaaaaaaaaaaaaaaaaaa']={email:false,department:false,university:false,currentInstitute:false,subjectsText:false,availabilityText:false,subjects:false,classLevels:false,expectedSalary:false};
  const nothingToFill=previewCvImport(csvSheets,emptyCvDecisions(),{fileLabel:'x',hash:'y',existing:fullIndex});
  assert.equal(nothingToFill.rows.find(entry=>entry.row===2)!.status,'matched','and a CV with nothing to fill writes nothing at all');
  const seen=emptyCvIndex();
  seen.hashSeen=true;
  assert.equal(previewCvImport(csvSheets,emptyCvDecisions(),{fileLabel:'x',hash:'y',existing:seen}).alreadyImported,true,'a file whose bytes already stand is announced before anybody presses save');

  console.log('The teacher CV sheet, read: XLSX and CSV give the same ten-row preview — two rows blocked because one has no name and one carries an earlier row’s number, eight writable; the column nobody named asks with a select beside it while Date, Mobile, Subject, Free Time, Salary and a Bangla header map unasked; 27/11/2024 and 13.11.24 read day-first, 15.12.14 keeps 2014 and offers 2024 without moving, an empty date is offered today and says so, a hand-grouped number, a number with no leading zero, Bangla digits and two numbers in one cell all normalize, 12345 is flagged and never padded and “negotiate” is flagged and left empty; “6, 7, 8 (Math, Eng) 9-GS, Other” lands as classes 6-9 with maths, English and other and GS kept as a tag, “Class 4 to 7” as four classes with Emg and BGG unparsed, “HSC (ICT) SSC (Phy, Che, Math)” as classes 10 and 12, “Full Time Free” as every shift and “After 3.00PM” as evening with no inference flag; every phone on every row is a mask and no painted number exists; a mapped column, an accepted date and a skipped row change exactly the rows they name — the accepted date taking the year doubt and the old-date doubt with it and the row counting as settled — while the rows nobody answered are untouched; and a CV already on file is matched by number, fills only the gaps the sheet can fill, writes nothing when there are none, and a file whose bytes already stand is announced before save.');
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
