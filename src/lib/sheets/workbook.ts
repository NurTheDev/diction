/**
 * R5 · One workbook reader for the whole app.
 *
 * Three imports now arrive as a spreadsheet: the owner's visitor list (R3), a teacher CV sheet (R4)
 * and a marks sheet (R5). All three need the same first step — turn a file into rows of cells, exactly
 * as written — and all three need the same refusals, so the step lives here once.
 *
 * Two rules this reader keeps, because every caller depends on them:
 *
 *   • **Nothing is typed and nothing is trimmed.** A cell comes back as the workbook held it: a number
 *     stays a number, a date stays a `Date`, text stays text. Deciding what a cell MEANS is the job of
 *     the reader that owns that column (`lead-date`, `lead-phone`, `subjects`, `marks-grid`), and those
 *     readers need the cell as written — a date folded to a string here would be a guess made in the
 *     wrong place, with no reason recorded.
 *   • **A file that is not a sheet is refused with a code, never half-read.** `.csv` and `.txt` are
 *     parsed as comma-separated text (the parser in `leads/import-csv` survives quotes, embedded
 *     commas and newlines, CRLF, a byte-order mark and Bangla in UTF-8); `.xlsx` and `.xlsm` are read
 *     through ExcelJS; anything else throws with a `code` the action turns into a sentence in both
 *     languages. An empty file throws too, because "nothing to import" is an answer the operator has
 *     to be told rather than shown as an empty preview.
 */
import ExcelJS from 'exceljs';
import {parseCsvGrid} from '@/lib/leads/import-csv';

/** One sheet's worth of cells, row-major, exactly as written. */
export interface SheetGrid{name:string;grid:unknown[][]}

/** ExcelJS wraps a formula, a rich-text run and a hyperlink in objects; the cell's own value is inside. */
function cellValue(cell:ExcelJS.Cell):unknown{
  const value=cell.value;
  if(value&&typeof value==='object'){
    if(value instanceof Date)return value;
    const record=value as {result?:unknown;text?:string;richText?:{text:string}[];hyperlink?:string};
    if(record.richText)return record.richText.map(part=>part.text).join('');
    if('result' in record&&record.result!==undefined)return record.result;
    if(record.text!==undefined)return record.text;
    if(record.hyperlink)return record.hyperlink;
    return '';
  }
  return value;
}

const refused=(code:string)=>Object.assign(new Error(code),{code});

/**
 * A file name plus its bytes → the sheets that have a written cell.
 *
 * A CSV has no sheet names, so it is given the file's own name without its extension: the preview that
 * prints "which sheet this row came from" then says something the operator recognizes.
 */
export async function readWorkbook(fileName:string,buffer:Buffer):Promise<SheetGrid[]>{
  const lower=String(fileName||'').toLowerCase();
  if(lower.endsWith('.csv')||lower.endsWith('.txt')){
    const grid=parseCsvGrid(buffer.toString('utf8'));
    if(!grid.length)throw refused('EMPTY_SHEET');
    return [{name:String(fileName).replace(/\.[^.]+$/,'')||'CSV',grid}];
  }
  if(!/\.(xlsx|xlsm)$/.test(lower))throw refused('NOT_A_WORKBOOK');
  const workbook=new ExcelJS.Workbook();
  try{await workbook.xlsx.load(buffer as never)}
  catch{throw refused('NOT_A_WORKBOOK')}
  const sheets:SheetGrid[]=[];
  workbook.eachSheet(worksheet=>{
    const grid:unknown[][]=[];
    worksheet.eachRow({includeEmpty:false},row=>{
      const cells:unknown[]=[];
      for(let index=1;index<=row.cellCount;index+=1)cells.push(cellValue(row.getCell(index)));
      grid.push(cells);
    });
    if(grid.length)sheets.push({name:worksheet.name,grid});
  });
  if(!sheets.length)throw refused('EMPTY_SHEET');
  return sheets;
}
