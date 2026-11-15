/**
 * R6 slice 1 — the export engine every report table shares: a formula-safe CSV and a real `.xlsx`.
 *
 * Two formats, one rule: a cell a spreadsheet could mistake for a formula never reaches the file as
 * one. The CSV half quotes every cell and prefixes the formula-like ones with an apostrophe — the
 * same `csvCell` the due-list export has used since R2, kept as the single source of that rule. The
 * Excel half writes every text cell as an *inline string*, which no spreadsheet evaluates, and every
 * number as a number, so the totals column still sums.
 *
 * The `.xlsx` is written here rather than pulled in as a dependency: a workbook is a zip of five small
 * XML parts, and a store-only zip with a correct CRC32 is forty lines. What leaves this module opens
 * in Excel, LibreOffice and Sheets, and the math suite verifies the zip structure byte for byte so
 * "we wrote an Excel file" is a checked claim, not a hopeful one.
 */
import {csvCell} from '@/lib/center/due-csv';

export type SheetCell=string|number;

/** BOM + CRLF + every cell quoted: the due-list export's contract, shared by every report now. */
export function csvOf(header:string[],rows:SheetCell[][]):string{
  return '\uFEFF'+[header.map(csvCell).join(','),...rows.map(row=>row.map(csvCell).join(','))].join('\r\n')+'\r\n';
}

const XML_ESCAPES:Record<string,string>={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'};
const xmlEscape=(value:string)=>value.replace(/[&<>"']/g,c=>XML_ESCAPES[c]);
const columnLetter=(index:number)=>{let n=index+1,label='';while(n>0){const rem=(n-1)%26;label=String.fromCharCode(65+rem)+label;n=Math.floor((n-1)/26)}return label};

function cellXml(ref:string,cell:SheetCell):string{
  if(typeof cell==='number'&&Number.isFinite(cell))return `<c r="${ref}"><v>${cell}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(cell))}</t></is></c>`;
}

function sheetXml(title:string,header:string[],rows:SheetCell[][]):string{
  const lines:[string,SheetCell[]][]=[[title,[]] as [string,SheetCell[]],['',header] as [string,SheetCell[]],...rows.map(row=>['',row] as [string,SheetCell[]])];
  const sheetRows:string[]=[];
  lines.forEach(([first,cells],index)=>{
    const rowNumber=index+1,parts:string[]=[];
    if(first)parts.push(cellXml(`A${rowNumber}`,first));
    cells.forEach((cell,column)=>parts.push(cellXml(`${columnLetter(column+1)}${rowNumber}`,cell)));
    sheetRows.push(`<row r="${rowNumber}">${parts.join('')}</row>`);
  });
  const last=`${columnLetter(Math.max(1,header.length))}${lines.length}`;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    +`<dimension ref="A1:${last}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews>`
    +`<sheetData>${sheetRows.join('')}</sheetData></worksheet>`;
}

const CRC_TABLE=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0}return table})();
export function crc32(bytes:Uint8Array):number{let c=0xffffffff;for(let i=0;i<bytes.length;i++)c=CRC_TABLE[(c^bytes[i])&0xff]^(c>>>8);return (c^0xffffffff)>>>0}

const encoder=new TextEncoder();
/** DOS 2026-01-01 00:00 — a fixed stamp keeps two exports of the same rows byte-identical. */
const DOS_TIME=0,DOS_DATE=((2026-1980)<<9)|(1<<5)|1;

function zip(entries:{name:string;data:Uint8Array}[]):Uint8Array{
  const locals:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0;
  for(const entry of entries){
    const name=encoder.encode(entry.name),crc=crc32(entry.data),size=entry.data.length;
    const local=new Uint8Array(30+name.length+size);
    const lv=new DataView(local.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0,true);lv.setUint16(8,0,true);
    lv.setUint16(10,DOS_TIME,true);lv.setUint16(12,DOS_DATE,true);lv.setUint32(14,crc,true);
    lv.setUint32(18,size,true);lv.setUint32(22,size,true);lv.setUint16(26,name.length,true);lv.setUint16(28,0,true);
    local.set(name,30);local.set(entry.data,30+name.length);
    locals.push(local);
    const cent=new Uint8Array(46+name.length);
    const cv=new DataView(cent.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0,true);cv.setUint16(10,0,true);
    cv.setUint16(12,DOS_TIME,true);cv.setUint16(14,DOS_DATE,true);cv.setUint32(16,crc,true);
    cv.setUint32(20,size,true);cv.setUint32(24,size,true);cv.setUint16(28,name.length,true);
    cv.setUint32(42,offset,true);
    cent.set(name,46);
    central.push(cent);
    offset+=local.length;
  }
  const centralSize=central.reduce((sum,part)=>sum+part.length,0);
  const end=new Uint8Array(22);
  const ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);
  ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
  const out=new Uint8Array(offset+centralSize+22);
  let at=0;
  for(const part of [...locals,...central,end]){out.set(part,at);at+=part.length}
  return out;
}

export type WorkbookSheet={name:string;title:string;header:string[];rows:SheetCell[][]};

/**
 * A workbook of any number of worksheets — what a full backup needs, one sheet per collection.
 * Sheet names are ASCII and unique: Excel refuses a workbook whose sheet names collide or carry
 * characters its own file names cannot.
 */
export function xlsxSheets(sheets:WorkbookSheet[]):Uint8Array{
  const parts:{name:string;data:Uint8Array}[]=[
    {name:'[Content_Types].xml',data:encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      +'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      +'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      +'<Default Extension="xml" ContentType="application/xml"/>'
      +'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      +sheets.map((_,index)=>`<Override PartName="/xl/worksheets/sheet${index+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      +'</Types>')},
    {name:'_rels/.rels',data:encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      +'</Relationships>')},
    {name:'xl/workbook.xml',data:encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      +'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      +`<sheets>${sheets.map((sheet,index)=>`<sheet name="${xmlEscape(sheet.name.slice(0,30)||`Sheet${index+1}`)}" sheetId="${index+1}" r:id="rId${index+1}"/>`).join('')}</sheets></workbook>`)},
    {name:'xl/_rels/workbook.xml.rels',data:encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      +sheets.map((_,index)=>`<Relationship Id="rId${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index+1}.xml"/>`).join('')
      +'</Relationships>')},
    ...sheets.map((sheet,index)=>({name:`xl/worksheets/sheet${index+1}.xml`,data:encoder.encode(sheetXml(sheet.title,sheet.header,sheet.rows))})),
  ];
  return zip(parts);
}

/** One worksheet, titled, header row under the title. Text cells are inline strings: never evaluated. */
export function xlsxOf(title:string,header:string[],rows:SheetCell[][]):Uint8Array{
  const sheet=sheetXml(title,header,rows);
  return zip([
    {name:'[Content_Types].xml',data:encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      +'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      +'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      +'<Default Extension="xml" ContentType="application/xml"/>'
      +'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      +'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      +'</Types>')},
    {name:'_rels/.rels',data:encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      +'</Relationships>')},
    {name:'xl/workbook.xml',data:encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      +'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      +'<sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>')},
    {name:'xl/_rels/workbook.xml.rels',data:encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      +'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      +'</Relationships>')},
    {name:'xl/worksheets/sheet1.xml',data:encoder.encode(sheet)},
  ]);
}

export const XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const CSV_MIME='text/csv; charset=utf-8';
