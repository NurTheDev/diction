/**
 * R5 · Exams — reading a mark, a pasted block and a marks sheet.
 *
 * The grid, the paste and the upload are three doors into the same record, so all three are read here
 * by one rule and all three answer in catalog keys rather than sentences: the screen paints the words
 * in the operator's language, and a refusal travels with the reason it was refused for.
 *
 * The rules that matter:
 *
 *   • **A mark is an integer between 0 and the subject's full marks, or it is nothing.** A number above
 *     the full mark is refused rather than clipped, because clipping would write a mark nobody typed
 *     into a result somebody will read. Bangla digits are folded first: a sheet exported from a Bangla
 *     spreadsheet writes ৮০, and the operator who typed it meant 80.
 *   • **`A` means absent, and absent is not a zero.** A cell may hold a number or the absence token, and
 *     a row is complete only when every subject in the exam has one of the two — a hole in a row is not
 *     a mark, so the row is not written until the hole is filled.
 *   • **A pasted block keeps its shape.** Tab-separated (what Excel and Google Sheets put on the
 *     clipboard) or comma-separated, it is read into rows of cells and laid over the grid from the cell
 *     the operator was standing in; a block wider or taller than the grid is cut at the grid's edge and
 *     the screen says how much was cut.
 *   • **A sheet row is matched to one student or refused.** By student id, then by roll, then by name;
 *     two students matching one row is `ambiguous` and the row is listed with both, because guessing
 *     would put somebody's marks on somebody else's result.
 *   • **A column that is not a subject in this exam is left alone**, and listed: the sheet may carry a
 *     phone number or a comment, and reading either as a mark would be a lie about a person.
 */
import {asciiDigits} from '../admin/format';
import {isAbsentToken,STUDENT_COLUMN_HEADERS} from './vocab';
import {parseCsvGrid} from '../leads/import-csv';
import type {SheetGrid} from '../sheets/workbook';

export type CellCode='EMPTY'|'NOT_A_NUMBER'|'NOT_AN_INTEGER'|'OUT_OF_RANGE';

export type CellRead=
  |{ok:true;obtained:number|null;absent:boolean}
  |{ok:false;code:CellCode;messageKey:string;messageParams:Record<string,string|number>};

const CELL_MESSAGE_KEYS:Record<CellCode,string>={
  EMPTY:'grid.errors.empty',NOT_A_NUMBER:'grid.errors.notANumber',
  NOT_AN_INTEGER:'grid.errors.notAnInteger',OUT_OF_RANGE:'grid.errors.outOfRange',
};

const refusedCell=(code:CellCode,params:Record<string,string|number>={}):CellRead=>
  ({ok:false,code,messageKey:CELL_MESSAGE_KEYS[code],messageParams:params});

/**
 * One cell as written → the mark it holds.
 *
 * A cell may arrive as a number (an XLSX cell keeps its type), as text with Bangla digits, as spaces,
 * or with a thousands separator a spreadsheet added for display. A decimal is refused rather than
 * rounded: the record stores integers, and rounding here would change a mark nobody asked to change.
 */
export function readMarkCell(raw:unknown,full:number):CellRead{
  if(typeof raw==='number'){
    if(!Number.isFinite(raw))return refusedCell('NOT_A_NUMBER');
    if(!Number.isInteger(raw))return refusedCell('NOT_AN_INTEGER',{full});
    if(raw<0||raw>full)return refusedCell('OUT_OF_RANGE',{full});
    return {ok:true,obtained:raw,absent:false};
  }
  if(raw instanceof Date)return refusedCell('NOT_A_NUMBER');
  const text=String(raw??'').trim();
  if(!text)return refusedCell('EMPTY');
  if(isAbsentToken(text))return {ok:true,obtained:null,absent:true};
  const folded=asciiDigits(text).replace(/[,\s\u00a0]/g,'');
  // A sign is not a mark, and a decimal is a mark the record cannot hold: the two get different
  // sentences because "write a whole number" is an instruction and "that is not a number" is not.
  if(folded.startsWith('-')||folded.startsWith('+'))return refusedCell('NOT_A_NUMBER');
  if(!/^\d+(\.\d+)?$/.test(folded))return refusedCell('NOT_A_NUMBER');
  const value=Number(folded);
  if(!Number.isSafeInteger(value))return refusedCell('NOT_AN_INTEGER',{full});
  if(value<0||value>full)return refusedCell('OUT_OF_RANGE',{full});
  return {ok:true,obtained:value,absent:false};
}

/** A row of cells is writable only when every subject has a mark or an absence — never a hole. */
export function rowIsComplete(reads:CellRead[]):boolean{
  return reads.length>0&&reads.every(read=>read.ok===true);
}

/** The cells a row is still missing, as the subject ids an operator has to fill before it can save. */
export function missingSubjects(reads:{subject:string;read:CellRead}[]):string[]{
  return reads.filter(entry=>entry.read.ok===false&&entry.read.code==='EMPTY').map(entry=>entry.subject);
}

/**
 * What the clipboard carries when a block is copied out of a spreadsheet.
 *
 * Excel and Google Sheets both put tab-separated text on the clipboard; an operator who copied out of a
 * CSV preview puts commas. Either is read into rows of cell text, untrimmed and untyped, so the same
 * `readMarkCell` decides what each cell means.
 */
export function parsePastedBlock(block:string):string[][]{
  const text=String(block??'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  if(!text.trim())return [];
  if(text.includes('\t')){
    return text.split('\n').filter(line=>line!=='').map(line=>line.split('\t'));
  }
  return parseCsvGrid(text);
}

/** A student the sheet could be matched against, as the roster holds them. */
export interface RosterEntry{id:string;studentId:string;name:string;nameEn:string;roll:string}

/** One sheet row, as the preview reports it. */
export interface MarksSheetRow{
  row:number;sheet:string;status:'ready'|'unmatched'|'ambiguous'|'incomplete'|'invalid';
  statusKey:string;student:RosterEntry|null;matches:RosterEntry[];
  cells:{subject:string;raw:string;read:CellRead}[];
  /** Why a row that matched a student still cannot be written, in catalog keys. */
  refusals:{messageKey:string;messageParams:Record<string,string|number>}[];
}

export interface MarksSheetCounts{rows:number;ready:number;unmatched:number;ambiguous:number;incomplete:number;invalid:number}

export interface MarksSheetPreview{
  fileLabel:string;sheet:string;studentColumn:string|null;
  subjectColumns:{subject:string;header:string}[];unusedHeaders:string[];
  rows:MarksSheetRow[];counts:MarksSheetCounts;
  /** The sheet could not be read at all, and this is why. */
  refusal:{messageKey:string;messageParams:Record<string,string|number>}|null;
}

const normalized=(value:string):string=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
/** A header folded the way sheets write headers: a column called "Student ID", "student_id" and
    "StudentID" is one column, and a subject called "Class Test" is "classtest". */
const foldedHeader=(value:string):string=>normalized(value).replace(/[\s_\-]/g,'');

/** The header names that say whose marks a row holds, folded the way a sheet writes them. */
const STUDENT_HEADERS=new Set(STUDENT_COLUMN_HEADERS.map(foldedHeader));

function headerText(value:unknown):string{
  return String(value??'').trim();
}

/**
 * Which column says who the row is, and which column belongs to which subject.
 *
 * A subject is matched by its own name in either language, folded; a column that matches no subject is
 * reported as unused and never read, because a sheet's phone column is not a mark.
 */
export function mapMarksHeader(header:unknown[],subjects:{id:string;name:string;nameEn?:string}[]):{
  studentColumn:number;subjectColumns:{subject:string;header:string;index:number}[];unused:string[];
}{
  const cells=header.map(headerText);
  let studentColumn=-1;
  const byName=new Map<string,string>();
  for(const subject of subjects){
    if(subject.name)byName.set(foldedHeader(subject.name),subject.id);
    if(subject.nameEn)byName.set(foldedHeader(subject.nameEn),subject.id);
  }
  const subjectColumns:{subject:string;header:string;index:number}[]=[];
  const unused:string[]=[];
  cells.forEach((cell,index)=>{
    const folded=foldedHeader(cell);
    if(!folded)return;
    if(studentColumn<0&&STUDENT_HEADERS.has(folded)){studentColumn=index;return}
    const subject=byName.get(folded);
    if(subject){
      if(!subjectColumns.some(entry=>entry.subject===subject))subjectColumns.push({subject,header:cell,index});
      return;
    }
    unused.push(cell);
  });
  // No student column by name: fall back to the first column, which is where a sheet puts the student
  // when its header is the class's own word for it. A preview that found no column at all says so.
  if(studentColumn<0&&cells.length)studentColumn=0;
  return {studentColumn,subjectColumns,unused};
}

/** One roster row against one sheet cell: student id first, then roll, then either name. */
export function matchRoster(value:string,roster:RosterEntry[]):RosterEntry[]{
  const folded=normalized(value);
  if(!folded)return [];
  const byId=roster.filter(entry=>normalized(entry.studentId)===folded);
  if(byId.length)return byId;
  const byRoll=roster.filter(entry=>entry.roll&&normalized(entry.roll)===folded);
  if(byRoll.length)return byRoll;
  return roster.filter(entry=>normalized(entry.name)===folded||normalized(entry.nameEn)===folded);
}

const ROW_STATUS_KEYS:Record<MarksSheetRow['status'],string>={
  ready:'import.status.ready',unmatched:'import.status.unmatched',ambiguous:'import.status.ambiguous',
  incomplete:'import.status.incomplete',invalid:'import.status.invalid',
};

/**
 * The dry run of a marks upload: every row read, every refusal named, nothing written.
 *
 * The commit runs this same function again with the same file, so what lands is exactly what the
 * preview showed — the rule the visitor and CV imports keep, and the reason a sheet can be uploaded
 * twice without anybody having to trust that the second reading agreed with the first.
 */
export function previewMarksSheet(sheets:SheetGrid[],opts:{
  subjects:{id:string;name:string;nameEn?:string;full:number}[];roster:RosterEntry[];fileLabel:string;
}):MarksSheetPreview{
  const fileLabel=opts.fileLabel||'sheet';
  const empty:MarksSheetPreview={
    fileLabel,sheet:'',studentColumn:null,subjectColumns:[],unusedHeaders:[],rows:[],
    counts:{rows:0,ready:0,unmatched:0,ambiguous:0,incomplete:0,invalid:0},refusal:null,
  };
  const sheet=sheets.find(candidate=>candidate.grid.length>1)||sheets[0];
  if(!sheet||!sheet.grid.length){
    return {...empty,refusal:{messageKey:'import.errors.noRows',messageParams:{}}};
  }
  // The header is read before the rows: a file that is not a marks sheet for this exam at all is better
  // answered with "no column matched a subject" than with "there are no students in it".
  const mapping=mapMarksHeader(sheet.grid[0],opts.subjects);
  if(!mapping.subjectColumns.length){
    return {...empty,sheet:sheet.name,refusal:{messageKey:'import.errors.noSubjectColumn',messageParams:{}}};
  }
  if(sheet.grid.length<2){
    return {...empty,sheet:sheet.name,studentColumn:headerText(sheet.grid[0][mapping.studentColumn]),refusal:{messageKey:'import.errors.noRows',messageParams:{}}};
  }
  const bySubject=new Map(opts.subjects.map(subject=>[subject.id,subject]));
  const rows:MarksSheetRow[]=[];
  sheet.grid.slice(1).forEach((cells,index)=>{
    const rowNumber=index+2;
    const who=headerText(cells[mapping.studentColumn]??'');
    const matches=matchRoster(who,opts.roster);
    const rowCells=mapping.subjectColumns.map(column=>{
      const raw=cells[column.index];
      const subject=bySubject.get(column.subject);
      return {
        subject:column.subject,
        raw:raw instanceof Date?raw.toISOString().slice(0,10):String(raw??'').trim(),
        read:readMarkCell(raw,subject?.full??0),
      };
    });
    const refusals=rowCells.filter(cell=>cell.read.ok===false).map(cell=>({
      messageKey:(cell.read as {messageKey:string}).messageKey,
      messageParams:{...(cell.read as {messageParams:Record<string,string|number>}).messageParams,subject:cell.subject},
    }));
    const incomplete=rowCells.some(cell=>cell.read.ok===false&&(cell.read as {code:string}).code==='EMPTY');
    const invalid=rowCells.some(cell=>cell.read.ok===false&&(cell.read as {code:string}).code!=='EMPTY');
    const status:MarksSheetRow['status']=matches.length===0?'unmatched'
      :matches.length>1?'ambiguous'
      :invalid?'invalid'
      :incomplete?'incomplete'
      :'ready';
    rows.push({
      row:rowNumber,sheet:sheet.name,status,statusKey:ROW_STATUS_KEYS[status],
      student:matches.length===1?matches[0]:null,matches,cells:rowCells,refusals,
    });
  });
  const counts:MarksSheetCounts={rows:rows.length,ready:0,unmatched:0,ambiguous:0,incomplete:0,invalid:0};
  for(const row of rows)counts[row.status]+=1;
  return {
    fileLabel,sheet:sheet.name,
    studentColumn:mapping.studentColumn>=0?headerText(sheet.grid[0][mapping.studentColumn]):null,
    subjectColumns:mapping.subjectColumns.map(column=>({subject:column.subject,header:column.header})),
    unusedHeaders:mapping.unused,rows,counts,refusal:null,
  };
}
