/**
 * Regenerates the labelled fake fixture for the Visitor import wizard:
 *   tests/fixtures/Visitor-Import-FAKE-SAMPLE.xlsx  (sheet "FAKE visitors")
 *   tests/fixtures/Visitor-Import-FAKE-SAMPLE.csv
 *
 * Every name, school and number in it is invented. The rows are chosen to exercise exactly the doubts
 * the wizard has to show: a day-first date, a two-digit year, a year that disagrees with the sheet, an
 * empty date, a missing name, a missing class, a hand-grouped number, a short number, two numbers in
 * one cell, siblings sharing a number, Bangla vocabulary, and a column nobody named.
 *
 * Run: npx tsx scripts/make-visitor-fixture.ts
 */
import ExcelJS from 'exceljs';
import {writeFileSync} from 'node:fs';
import path from 'node:path';

const HEADERS=['Date','Name','Class','Institute','Number','Group','Shift','Comments','Medium','Column 1'];
const ROWS:(string|number)[][]=[
  ['2/12/2025','FAKE Visitor One','New 9','FAKE Model School','01711-111111','Science','Morning','ভর্তি বিষয়ে জানতে চেয়েছিলেন','Bangla Version',''],
  ['15.12.25','FAKE Visitor Two','XI','FAKE Girls High','0 1934-595247','Arts','Evening','','English Version','extra column text'],
  ['20-11-2014','FAKE Visitor Three','SSC 25','FAKE Collegiate','01812345678','Commerce','','পরে কল করতে বলুন','Bangla Version',''],
  ['','FAKE Visitor Four','7','FAKE Primary School','0171281709','','Morning','','',''],
  ['3/1/2025','','8','FAKE Academy','01611222333','Science','','','',''],
  ['3/1/2025','FAKE Visitor Six','','','01711-111111','','','দুই ভাই একসাথে','',''],
  ['4/1/2025','FAKE Visitor Seven','XII','FAKE College','01911111111, 01622222222','Science','Morning','','English Version',''],
  ['5.1.25','FAKE Visitor Eight','নবম','FAKE Bangla School','01533333333','বিজ্ঞান','','','বাংলা ভার্সন',''],
  ['6/1/2025','FAKE Visitor Nine','HSC 26','FAKE College','','','','','',''],
];

async function main(){
  const workbook=new ExcelJS.Workbook();
  const sheet=workbook.addWorksheet('FAKE visitors');
  sheet.addRow(HEADERS);
  for(const row of ROWS)sheet.addRow(row);
  const out=path.join('tests','fixtures');
  const xlsx=await workbook.xlsx.writeBuffer();
  writeFileSync(path.join(out,'Visitor-Import-FAKE-SAMPLE.xlsx'),Buffer.from(xlsx));
  const quote=(value:unknown)=>{const text=String(value??'');return /[",\n\r]/.test(text)?`"${text.replace(/"/g,'""')}"`:text};
  const csv=[HEADERS,...ROWS].map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
  writeFileSync(path.join(out,'Visitor-Import-FAKE-SAMPLE.csv'),csv,'utf8');
  console.log(`wrote ${path.join(out,'Visitor-Import-FAKE-SAMPLE.xlsx')} and .csv — ${ROWS.length} synthetic rows`);
}
main().catch(error=>{console.error(error);process.exit(1)});
