/**
 * R3 · Visitor import — the dry run.
 *
 * The wizard's whole promise is that an upload changes nothing until the owner has read it. This
 * module is the reading: it takes the sheets of a workbook (or the grid of a CSV), maps each header
 * through the synonym table in `lead-columns`, reads every cell through the pure readers
 * (`lead-date`, `lead-phone`, `lead-class`), and answers with one row per sheet row carrying what was
 * read, what is doubted, and what still needs a decision. It holds no database and no language of its
 * own: a doubt is a catalog key plus params, exactly like the rest of the lead layer, so the same row
 * explains itself in Bangla and in English.
 *
 * The rules that matter:
 *
 *   • A header nobody mapped is a QUESTION, never a default. The row keeps the column's text and the
 *     wizard paints `sheetQuestions.*` with a select; until the owner answers, the column is unread.
 *   • A date the sheet's own year contradicts is read as written and flagged with a SUGGESTION;
 *     nothing moves until the owner accepts or keeps it. An empty date offers today, because that is
 *     what quick-add does — but only as an offer.
 *   • A row with no name cannot become a lead (the record requires one) and is blocked, in words.
 *   • Two rows sharing a number are SIBLINGS: flagged together, never blocked, and at write time they
 *     inherit one `familyKey` through `resolveFamilyKey`.
 *   • A row whose number (or name and day) is already on a lead is MATCHED and will not be written
 *     again — that is the idempotent re-import, proved here against a caller-supplied index and in
 *     `import-commit` against the real collection.
 *
 * `previewLeadImport` is called twice per import: once to show the preview, and once inside the commit
 * with the owner's decisions, so what is written is exactly what was shown.
 */
import ExcelJS from 'exceljs';
import {parseSheetDate,flagSuspiciousYears,type DateFlag} from './lead-date';
import {parsePhoneCell,type PhoneFlag,type PhoneRead} from './lead-phone';
import {normalizeClassLabel,type ClassFlag} from './lead-class';
import {
  LEAD_SHEET_FIELDS,mapSheetHeader,isUnnamedColumnHeader,unmappedHeaderQuestion,
  normalizeGroup,normalizeMedium,normalizeShift,normalizeSource,
  type LeadSheetField,
} from './lead-columns';
import {renderLeadPair} from './lead-message';
import {parseCsvGrid} from './import-csv';

export interface LeadSheetGrid{name:string;grid:unknown[][]}

/** What the owner answered between the preview and the commit. Empty on the first look. */
export interface LeadImportDecision{
  /** `sheet:index` → a field, or `ignore` for a column the owner chose not to read. */
  mapping:Record<string,string>;
  /** row key → accept the suggested date, or keep what was written. */
  accept:Record<string,'accept'|'keep'>;
  /** row key → do not write this row. */
  skip:Record<string,true>;
}
export const emptyLeadDecisions=():LeadImportDecision=>({mapping:{},accept:{},skip:{}});

export interface RowFlagView{field:string;code:string;messageKey:string;messageParams:Record<string,string|number>;suggested:string}
export type LeadImportStatus='ready'|'decide'|'blocked'|'matched'|'skipped';

export interface LeadImportRow{
  key:string;sheet:string;row:number;
  status:LeadImportStatus;
  statusKey:string;
  statusParams:Record<string,string|number>;
  name:string;guardian:string;school:string;
  dateRaw:string;dateDay:string|null;dateSuggested:string|null;dateDecision:'accept'|'keep'|null;
  phones:PhoneRead[];
  classLabel:string;classGroup:number|null;newSession:boolean;exam:'ssc'|'hsc'|null;examYear:number|null;
  group:string|null;groupRaw:string;shift:string|null;shiftRaw:string;medium:string|null;mediumRaw:string;source:string|null;sourceRaw:string;
  interestedIn:string;statusFromSheet:string;nextFollowUp:string;
  notes:string;
  siblingKey:string|null;
  matchedLabel:string|null;
  flags:RowFlagView[];
}

export interface LeadImportColumn{
  key:string;sheet:string;index:number;header:string;
  field:LeadSheetField|null;unnamed:boolean;
  questionKey:string|null;questionParams:Record<string,string>;
}

export interface LeadImportPreview{
  fileLabel:string;hash:string;
  sheets:string[];columns:LeadImportColumn[];rows:LeadImportRow[];
  counts:{total:number;ready:number;decide:number;blocked:number;matched:number;skipped:number;siblings:number};
  /** The same file hash was committed before, so this upload is a re-import: every row should match. */
  previousBatch:string|null;
}

export interface LeadImportState{
  preview:LeadImportPreview|null;
  decisions:LeadImportDecision;
  result:{batch:string;created:number;matched:number;skipped:number;blocked:number;siblings:number}|null;
  undone:{batch:string;removed:number}|null;
  errorKey:string|null;errorParams:Record<string,string|number>;
}
export const emptyLeadImportState=():LeadImportState=>({preview:null,decisions:emptyLeadDecisions(),result:null,undone:null,errorKey:null,errorParams:{}});

/** How a name is compared across the file and the collection: case and spacing are not identity. */
export const leadNameKey=(name:string)=>name.toLowerCase().replace(/\s+/g,' ').trim();
export const leadImportRowKey=(sheet:string,row:number)=>`${sheet}:${row}`;

/** Read every sheet's first non-empty row as the header; the rows after it are data. */
function splitSheets(sheets:LeadSheetGrid[]):{sheet:string;header:unknown[];data:{row:number;cells:unknown[]}[]}[]{
  return sheets.map(s=>{
    let headerAt=-1;
    for(let i=0;i<s.grid.length;i++){if((s.grid[i]||[]).some(cell=>String(cell??'').trim()!=='')){headerAt=i;break}}
    if(headerAt<0)return {sheet:s.name,header:[],data:[]};
    const data=[] as {row:number;cells:unknown[]}[];
    for(let i=headerAt+1;i<s.grid.length;i++){if((s.grid[i]||[]).some(cell=>String(cell??'').trim()!==''))data.push({row:i-headerAt,cells:s.grid[i]||[]})}
    return {sheet:s.name,header:s.grid[headerAt]||[],data};
  });
}

export function previewLeadImport(sheets:LeadSheetGrid[],decisions:LeadImportDecision,opts:{
  fileLabel?:string;hash?:string;now?:Date;previousBatch?:string|null;
  existing?:{phones:Record<string,string>;names:Record<string,string>};
}={}):LeadImportPreview{
  const now=opts.now||new Date();
  const existing=opts.existing||{phones:{},names:{}};
  const split=splitSheets(sheets);
  const columns:LeadImportColumn[]=[];
  for(const part of split){
    for(let index=0;index<part.header.length;index++){
      const header=String(part.header[index]??'').trim();
      const key=`${part.sheet}:${index}`;
      const chosen=decisions.mapping[key];
      const field=chosen==='ignore'?null:chosen&&(LEAD_SHEET_FIELDS as readonly string[]).includes(chosen)?chosen as LeadSheetField:mapSheetHeader(header);
      const unnamed=isUnnamedColumnHeader(header);
      const asked=field===null&&chosen!=='ignore';
      const question=asked?unmappedHeaderQuestion(header):null;
      columns.push({key,sheet:part.sheet,index,header,field,unnamed,questionKey:question?question.messageKey:null,questionParams:question?question.messageParams:{}});
    }
  }
  const colsOf=(sheet:string)=>columns.filter(c=>c.sheet===sheet);

  const rows:LeadImportRow[]=[];
  for(const part of split){
    for(const item of part.data){
      const key=leadImportRowKey(part.sheet,item.row);
      const valueFor=(field:LeadSheetField):unknown=>{
        const col=colsOf(part.sheet).find(c=>c.field===field);
        return col?item.cells[col.index]:undefined;
      };
      const text=(field:LeadSheetField)=>String(valueFor(field)??'').trim();
      const flags:RowFlagView[]=[];
      const addFlag=(flag:{field?:string;code?:string;messageKey:string;messageParams?:Record<string,string|number>;suggested?:string|number})=>
        flags.push({field:flag.field||'',code:flag.code||'',messageKey:flag.messageKey,messageParams:flag.messageParams||{},suggested:flag.suggested===undefined?'':String(flag.suggested)});

      // ── the date: read day-first, then the sheet-wide year doubt on top ────────────────────────
      const dateRaw=text('date');
      const read=parseSheetDate(valueFor('date'),now);
      let dateDay:string|null=null,dateSuggested:string|null=null;
      if(read.ok){dateDay=read.day;for(const flag of read.flags)addFlag({field:'date',...flag})}
      else if(read.reason==='empty'){dateSuggested=dhakaToday(now);addFlag({field:'date',code:'empty',messageKey:read.messageKey,messageParams:read.messageParams,suggested:dateSuggested})}
      else addFlag({field:'date',code:read.reason,messageKey:read.messageKey,messageParams:read.messageParams});

      // ── phones, class, and the four vocabulary columns ────────────────────────────────────────
      const phoneRead=parsePhoneCell(valueFor('phones'));
      for(const flag of phoneRead.flags)addFlag({field:'phones',code:flag.code,messageKey:flag.messageKey,messageParams:flag.messageParams});
      const classRead=normalizeClassLabel(valueFor('classLabel'),now);
      const classFlags:ClassFlag[]=classRead.flags;
      for(const flag of classFlags)addFlag({field:'classLabel',code:flag.code,messageKey:flag.messageKey,messageParams:flag.messageParams,suggested:flag.suggested});
      const rawGroup=valueFor('group'),rawShift=valueFor('shift'),rawMedium=valueFor('medium'),rawSource=valueFor('source');
      const group=normalizeGroup(rawGroup),shift=normalizeShift(rawShift),medium=normalizeMedium(rawMedium),source=normalizeSource(rawSource);
      for(const [field,rawValue,readValue,messageKey] of [
        ['group',rawGroup,group,'errors.UNMAPPED_GROUP'],['medium',rawMedium,medium,'errors.UNMAPPED_MEDIUM'],
        ['shift',rawShift,shift,'errors.UNMAPPED_SHIFT'],['source',rawSource,source,'errors.UNMAPPED_SOURCE'],
      ] as [string,unknown,unknown,string][]){
        const written=String(rawValue??'').trim();
        if(written&&!readValue)addFlag({field,code:'unmapped',messageKey,messageParams:{value:written.slice(0,80)}});
      }

      const name=text('studentName');
      const notes=text('notes');
      rows.push({
        key,sheet:part.sheet,row:item.row,status:'ready',statusKey:'import.status.ready',statusParams:{},
        name,guardian:text('guardianName'),school:text('school'),
        dateRaw,dateDay,dateSuggested,dateDecision:null,
        phones:phoneRead.phones,
        classLabel:classRead.classLabel,classGroup:classRead.classGroup,newSession:classRead.newSession,exam:classRead.exam,examYear:classRead.examYear,
        group,groupRaw:String(rawGroup??'').trim(),shift,shiftRaw:String(rawShift??'').trim(),medium,mediumRaw:String(rawMedium??'').trim(),source,sourceRaw:String(rawSource??'').trim(),
        interestedIn:text('interestedIn'),statusFromSheet:text('status'),nextFollowUp:text('nextFollowUp'),
        notes,siblingKey:null,matchedLabel:null,flags,
      });
    }
  }

  // ── the sheet-wide year doubt, named row by row with its suggested fix ─────────────────────────
  const yearFlags=flagSuspiciousYears(rows.map(r=>({id:r.key,day:r.dateDay})),now);
  for(const row of rows){
    const flag=yearFlags[row.key] as (DateFlag|undefined);
    if(!flag)continue;
    row.flags.push({field:'date',code:flag.code,messageKey:flag.messageKey,messageParams:flag.messageParams,suggested:flag.suggested||''});
    if(flag.suggested){row.dateSuggested=flag.suggested}
  }

  // ── siblings: rows of one file that share a number are family, never a block ───────────────────
  const byPhone=new Map<string,string>();
  for(const row of rows){
    for(const phone of row.phones){
      const first=byPhone.get(phone.normalized);
      if(first){row.siblingKey=first;const owner=rows.find(r=>r.key===first);if(owner&&!owner.siblingKey)owner.siblingKey=first}
      else byPhone.set(phone.normalized,row.key);
    }
  }
  for(const row of rows){
    if(!row.siblingKey)continue;
    const mate=row.siblingKey===row.key?rows.find(r=>r.siblingKey===row.key&&r.key!==row.key):rows.find(r=>r.key===row.siblingKey);
    row.flags.push({field:'phones',code:'sibling',messageKey:'import.flags.siblingInFile',messageParams:{other:mate?`${mate.sheet} ${mate.row}`:''},suggested:''});
  }

  // ── what still blocks, what still needs a hand, what is already on file ────────────────────────
  for(const row of rows){
    if(decisions.skip[row.key]){row.status='skipped';row.statusKey='import.status.skipped';continue}
    if(!row.name){row.status='blocked';row.statusKey='import.status.blocked';row.flags.push({field:'studentName',code:'no_name',messageKey:'import.flags.missingName',messageParams:{},suggested:''});continue}
    if(row.dateSuggested){
      const choice=decisions.accept[row.key]||null;
      row.dateDecision=choice;
      if(!choice){row.status='decide';row.statusKey='import.status.decide';continue}
      if(choice==='accept')row.dateDay=row.dateSuggested;
      else if(!row.dateDay){row.status='blocked';row.statusKey='import.status.blocked';row.flags.push({field:'date',code:'declined',messageKey:'import.flags.dateDeclined',messageParams:{},suggested:''});continue}
    }
    if(!row.dateDay&&!row.dateSuggested){row.status='blocked';row.statusKey='import.status.blocked';continue}
    if(!row.classLabel)row.flags.push({field:'classLabel',code:'missing',messageKey:'import.flags.missingClass',messageParams:{},suggested:''});
    if(!row.phones.length)row.flags.push({field:'phones',code:'no_phone',messageKey:'import.flags.noPhone',messageParams:{},suggested:''});
    const matched=row.phones.map(p=>existing.phones[p.normalized]).find(Boolean)||
      (row.dateDay?existing.names[`${leadNameKey(row.name)}|${row.dateDay}`]:undefined)||undefined;
    if(matched){row.status='matched';row.statusKey='import.status.matched';row.matchedLabel=matched;row.statusParams={lead:matched}}
  }

  const counts={total:rows.length,ready:0,decide:0,blocked:0,matched:0,skipped:0,siblings:0};
  for(const row of rows){
    counts[row.status==='ready'?'ready':row.status==='decide'?'decide':row.status==='blocked'?'blocked':row.status==='matched'?'matched':'skipped']++;
    if(row.siblingKey)counts.siblings++;
  }
  return {fileLabel:opts.fileLabel||'',hash:opts.hash||'',sheets:split.map(s=>s.sheet),columns,rows,counts,previousBatch:opts.previousBatch||null};
}

function dhakaToday(now:Date):string{
  const shifted=new Date(now.getTime()+6*3600*1000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth()+1).padStart(2,'0')}-${String(shifted.getUTCDate()).padStart(2,'0')}`;
}

/** One cell as a reader wants it: a real date stays a date, a formula yields its result. */
function cellValue(cell:ExcelJS.Cell):unknown{
  const value=cell.value;
  if(value&&typeof value==='object'){
    if(value instanceof Date)return value;
    const record=value as {result?:unknown;text?:string;richText?:{text:string}[];hyperlink?:string};
    if(record.richText)return record.richText.map(part=>part.text).join('');
    if('result' in record&&record.result!==undefined)return record.result instanceof Date?record.result:record.result;
    if(record.text!==undefined)return record.text;
    if(record.hyperlink)return record.hyperlink;
    return '';
  }
  return value;
}

/**
 * The upload itself: an `.xlsx` workbook keeps every sheet that has a written cell, a `.csv` export
 * becomes one sheet named after the file. Anything else is refused by key, never by exception text.
 */
export async function readLeadWorkbook(fileName:string,buffer:Buffer):Promise<LeadSheetGrid[]>{
  const lower=fileName.toLowerCase();
  if(lower.endsWith('.csv')||lower.endsWith('.txt')){
    return [{name:fileName.replace(/\.[^.]+$/,'')||'CSV',grid:parseCsvGrid(buffer.toString('utf8'))}];
  }
  if(!/\.(xlsx|xlsm)$/.test(lower))throw Object.assign(new Error('NOT_A_WORKBOOK'),{code:'NOT_A_WORKBOOK'});
  const workbook=new ExcelJS.Workbook();
  try{await workbook.xlsx.load(buffer as never)}
  catch{throw Object.assign(new Error('NOT_A_WORKBOOK'),{code:'NOT_A_WORKBOOK'})}
  const sheets:LeadSheetGrid[]=[];
  workbook.eachSheet(ws=>{
    const grid:unknown[][]=[];
    ws.eachRow({includeEmpty:false},row=>{
      const cells:unknown[]=[];
      for(let c=1;c<=row.cellCount;c++)cells.push(cellValue(row.getCell(c)));
      grid.push(cells);
    });
    if(grid.length)sheets.push({name:ws.name,grid});
  });
  if(!sheets.length)throw Object.assign(new Error('EMPTY_WORKBOOK'),{code:'EMPTY_WORKBOOK'});
  return sheets;
}

/** The two sentences a stored flag carries, for the commit that writes the doubt into the lead. */
export function flagPair(flag:RowFlagView):{messageBn:string;messageEn:string}{
  return renderLeadPair(flag.messageKey,flag.messageParams);
}
