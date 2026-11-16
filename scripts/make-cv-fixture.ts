/**
 * R4 · Regenerates the labelled fake fixture for the teacher CV import wizard:
 *   tests/fixtures/Teacher-CV-FAKE-SAMPLE.xlsx  (sheet "FAKE teacher CVs")
 *   tests/fixtures/Teacher-CV-FAKE-SAMPLE.csv
 *
 * Every name, university, number and address in it is invented, and the word FAKE is written into each
 * name so a row that escapes into a real database is still recognisable as a test row. The rows are
 * chosen to exercise exactly the doubts the wizard has to show, one per line:
 *
 *   1. a day-first date, a hand-grouped number, the brief's own messy subject cell and a bare-hour
 *      free time;  2. a two-digit year, a number with no leading zero, a class RANGE, two subject words
 *   no table knows, "ALL" and a `15k` salary;  3. a year that disagrees with the rest of the sheet, and
 *   SSC/HSC standing in for classes;  4. an empty date;  5. a phone-only row, which cannot be written
 *   because a CV with no name cannot be called;  6. a short number and a salary that is a word;  7. a
 *   second row carrying row 1's number — the same sheet asking whether these are one person or two;
 *   8. Bangla digits, a Bangla subject word, a Bangla part of the day and a Bangla comment;  9. two
 *   numbers in one cell, an explicit PM window, and a column nobody named;  10. a name-only row.
 *
 * The last column is the sheet's own Comment: the brief's notes ("did not come on the 4th",
 * "Low Quality (Che)", "NR", "payment is low") in the owner's words, which the commit files as each
 * CV's FIRST timeline note — word for word, Bangla included.
 *
 * Run: npx tsx scripts/make-cv-fixture.ts
 */
import ExcelJS from 'exceljs';
import {writeFileSync} from 'node:fs';
import path from 'node:path';

const HEADERS=['Date','Name','Mobile','Department','University','Subject','Free Time','Salary','Column 1','Comment'];
const ROWS:(string|number)[][]=[
  ['27/11/2024','FAKE Candidate One','01711-111111','Mathematics','FAKE University','6, 7, 8 (Math, Eng) 9-GS, Other','3.00-6.00','12000','','did not come on the 4th'],
  // A number with no leading zero — and NOT the same number as the next row once normalized, which would
  // turn this fixture into two in-sheet twins instead of one.
  ['13.11.24','FAKE Candidate Two','1798765432','English','FAKE College','Class 4 to 7 (Bangla, Emg, BGG)','ALL','15k','','Low Quality (Che)'],
  ['15.12.14','FAKE Candidate Three','01812345678','Physics','FAKE Engineering University','HSC (ICT) SSC (Phy, Che, Math)','After 3.00PM','20000','','NR'],
  ['','FAKE Candidate Four','01612345678','Chemistry','FAKE Degree College','Chemistry','Full Time Free','','',''],
  ['28/11/2024','','01512345678','','','Math','3.00-6.00','8000','','only a number was left'],
  ['29/11/2024','FAKE Candidate Six','12345','Accounting','FAKE Commerce College','Accounting, Finance','ALL','negotiate','','payment is low'],
  ['30/11/2024','FAKE Candidate Seven','01711-111111','Biology','FAKE University','Biology','ALL','14000','',''],
  // A Bangla comment, kept word for word: the sheet's own note becomes the CV's first timeline note.
  ['1/12/2024','FAKE Candidate Eight','০১৩১২৩৪৫৬৭৮','Bangla','FAKE College for Women','বাংলা','সকাল','10000','','চতুর্থ তারিখে আসেননি'],
  ['2/12/2024','FAKE Candidate Nine','01911111111, 01622222222','ICT','FAKE Science University','ICT, Computer','5.00-9.00PM','25000','extra column text',''],
  ['3/12/2024','FAKE Candidate Ten','','History','FAKE University','History, World History','ALL','','','NR'],
];

async function main(){
  const workbook=new ExcelJS.Workbook();
  const sheet=workbook.addWorksheet('FAKE teacher CVs');
  sheet.addRow(HEADERS);
  for(const row of ROWS)sheet.addRow(row);
  const out=path.join('tests','fixtures');
  const xlsx=await workbook.xlsx.writeBuffer();
  writeFileSync(path.join(out,'Teacher-CV-FAKE-SAMPLE.xlsx'),Buffer.from(xlsx));
  const quote=(value:unknown)=>{const text=String(value??'');return /[",\n\r]/.test(text)?`"${text.replace(/"/g,'""')}"`:text};
  const csv=[HEADERS,...ROWS].map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
  writeFileSync(path.join(out,'Teacher-CV-FAKE-SAMPLE.csv'),csv,'utf8');
  console.log(`wrote ${path.join(out,'Teacher-CV-FAKE-SAMPLE.xlsx')} and .csv — ${ROWS.length} synthetic rows`);
}
main().catch(error=>{console.error(error);process.exit(1)});
