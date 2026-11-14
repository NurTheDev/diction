/**
 * R4 · Teacher CV import — the dry run.
 *
 * The wizard's whole promise is that an upload changes nothing until the owner has read it. This module
 * is the reading: it takes the sheets of a workbook (or the grid of a CSV), maps each header through
 * the synonym table in `cv-columns`, reads every cell through the shared pure readers — the leads'
 * day-first date and Bangladeshi phone readers, and this module's own subject and free-time readers —
 * and answers with one row per sheet row carrying what was read, what is doubted and what is already
 * on file. It holds no database and no language of its own: a doubt is a catalog key plus params, so
 * the same row explains itself in Bangla and in English.
 *
 * The rules that matter, all of them from the brief:
 *
 *   • **A header nobody mapped is a QUESTION, never a default.** The column keeps its own text and the
 *     wizard paints a select; until the owner answers, the column is unread.
 *   • **Nothing is ever blocked on a reading this app could not make.** A subject cell of
 *     `"6, 7, 8 (Math, Eng) 9-GS, Other"` comes back as classes 6, 7, 8, 9 plus maths plus other, with
 *     `GS` kept in `unparsed` and offered as a tag. The only row that cannot be written is one with no
 *     name at all, because the record requires one — and even that is reported in words, not dropped.
 *   • **The sheet's own words are carried through.** `subjectsText` and `availabilityText` on the row
 *     are exactly what the cell said; the readings sit beside them.
 *   • **A CV that is already on file is matched, not duplicated** — by a shared normalized number, or
 *     by the same name on the same day. A matched row fills only the gaps the existing CV has, and when
 *     there is nothing to fill it writes nothing: that is what makes a second upload of the same file
 *     idempotent instead of a bank full of twins.
 *   • **A doubtful date is read, flagged and suggested, never repaired.** `15.12.14` among rows that
 *     all say 2024 comes back with the sheet's own year offered; the owner accepts or keeps, and
 *     nothing moves until a hand says so.
 *
 * `previewCvImport` is called twice per import: once to show the preview, and once inside the commit
 * with the owner's decisions, so what is written is exactly what was shown.
 */
import ExcelJS from 'exceljs';
import {parseCsvGrid} from '@/lib/leads/import-csv';
import {isUnnamedColumnHeader} from '@/lib/leads/lead-columns';
import {parsePhoneCell,phoneSearchMask,type PhoneFlag} from '@/lib/leads/lead-phone';
import {parseSheetDate,flagSuspiciousYears} from '@/lib/leads/lead-date';
import {dhakaDay} from '@/lib/admin/today';
import {CV_SHEET_FIELDS,mapCvHeader,unmappedCvHeaderQuestion,type CvSheetField} from './cv-columns';
import {readAvailability,readSalary,readSubjectsText} from './subjects';
import {TEACHER_SOURCES} from './vocab';

export interface CvSheetGrid{name:string;grid:unknown[][]}

/** What the owner answered between the preview and the commit. Empty on the first look. */
export interface CvImportDecision{
  /** `sheet:index` → a field, or `ignore` for a column the owner chose not to read. */
  mapping:Record<string,string>;
  /** row key → accept the suggested date, or keep what was written. */
  accept:Record<string,'accept'|'keep'>;
  /** row key → do not write this row. */
  skip:Record<string,true>;
}
export const emptyCvDecisions=():CvImportDecision=>({mapping:{},accept:{},skip:{}});

export interface CvRowFlag{field:string;code:string;messageKey:string;messageParams:Record<string,string|number>;suggested:string}
export type CvImportStatus='ready'|'flagged'|'blocked'|'matched'|'updated'|'skipped';

export interface CvImportRow{
  key:string;sheet:string;row:number;
  status:CvImportStatus;statusKey:string;
  name:string;
  phones:{normalized:string;original:string;masked:string}[];
  email:string;department:string;university:string;currentInstitute:string;
  receivedDate:string;dateRaw:string;suggestedDate:string;
  subjectsText:string;subjects:string[];classLevels:string[];unparsed:string[];suggestedTags:string[];
  availabilityText:string;shifts:string[];expectedSalary:number|null;source:string;notes:string;tags:string[];
  match:{id:string;candidateId:string;name:string;masked:string;fills:string[]}|null;
  flags:CvRowFlag[];
}

export interface CvImportColumn{
  key:string;sheet:string;index:number;header:string;
  field:CvSheetField|null;unnamed:boolean;
  questionKey:string|null;questionParams:Record<string,string>;
  samples:string[];
}

export interface CvImportCounts{rows:number;ready:number;flagged:number;updated:number;matched:number;blocked:number;skipped:number}

export interface CvImportPreview{
  fileLabel:string;hash:string;sheet:string;
  columns:CvImportColumn[];rows:CvImportRow[];counts:CvImportCounts;
  /** A batch of these exact bytes already stands, so a commit would write nothing new. */
  alreadyImported:boolean;
}

/** What is already on file, loaded by the caller so this module keeps no database of its own. */
export interface CvExistingIndex{
  /** normalized number → the CV that holds it */
  byPhone:Record<string,{id:string;candidateId:string;name:string}>;
  /** `name|day` → the CV written that day under that name */
  byNameDay:Record<string,{id:string;candidateId:string;name:string}>;
  /** CV id → the fields it already has, so a matched row can be shown filling only the gaps */
  gaps:Record<string,Record<string,boolean>>;
  /** A batch of these exact bytes has already been committed and not undone. */
  hashSeen:boolean;
}
export const emptyCvIndex=():CvExistingIndex=>({byPhone:{},byNameDay:{},gaps:{},hashSeen:false});

export const cvImportRowKey=(sheet:string,row:number)=>`${sheet}:${row}`;
const nameKey=(name:string)=>name.toLowerCase().replace(/\s+/g,' ').trim();

/** Read every sheet's first non-empty row as the header; the rows after it are data. */
function splitSheets(sheets:CvSheetGrid[]):{sheet:string;header:unknown[];data:{row:number;cells:unknown[]}[]}[]{
  return sheets.map(entry=>{
    let headerAt=-1;
    for(let index=0;index<entry.grid.length;index+=1){
      if((entry.grid[index]||[]).some(cell=>String(cell??'').trim()!=='')){headerAt=index;break}
    }
    if(headerAt<0)return {sheet:entry.name,header:[],data:[]};
    const data=[] as {row:number;cells:unknown[]}[];
    for(let index=headerAt+1;index<entry.grid.length;index+=1){
      if((entry.grid[index]||[]).some(cell=>String(cell??'').trim()!==''))data.push({row:index-headerAt,cells:entry.grid[index]||[]});
    }
    return {sheet:entry.name,header:entry.grid[headerAt]||[],data};
  });
}

/** The phone flags' codes, mapped onto this module's own catalog: one namespace, one place to read. */
const PHONE_FLAG_KEYS:Record<PhoneFlag['code'],string>={
  short:'flags.phoneShort',long:'flags.phoneLong',extra:'flags.phoneExtra',not_a_number:'flags.phoneNotANumber',invalid:'flags.phoneInvalid',
};

export function previewCvImport(sheets:CvSheetGrid[],decisions:CvImportDecision,opts:{
  fileLabel?:string;hash?:string;now?:Date;existing?:CvExistingIndex;
}={}):CvImportPreview{
  const now=opts.now||new Date();
  const existing=opts.existing||emptyCvIndex();
  const fileLabel=opts.fileLabel||'';
  const hash=opts.hash||'';
  const split=splitSheets(sheets);

  const columns:CvImportColumn[]=[];
  for(const part of split){
    for(let index=0;index<part.header.length;index+=1){
      const header=String(part.header[index]??'').trim();
      const key=`${part.sheet}:${index}`;
      const chosen=decisions.mapping[key];
      const field=chosen==='ignore'?null
        :chosen&&(CV_SHEET_FIELDS as readonly string[]).includes(chosen)?chosen as CvSheetField
        :mapCvHeader(header);
      const question=field===null&&chosen!=='ignore'?unmappedCvHeaderQuestion(header):null;
      const samples=part.data.slice(0,3).map(item=>String(item.cells[index]??'').trim()).filter(Boolean);
      columns.push({key,sheet:part.sheet,index,header,field,unnamed:isUnnamedColumnHeader(header),
        questionKey:question?question.messageKey:null,questionParams:question?question.messageParams:{},samples});
    }
  }
  const colsOf=(sheet:string)=>columns.filter(column=>column.sheet===sheet);

  const rows:CvImportRow[]=[];
  for(const part of split){
    for(const item of part.data){
      const key=cvImportRowKey(part.sheet,item.row);
      const valueFor=(field:CvSheetField):unknown=>{
        const column=colsOf(part.sheet).find(candidate=>candidate.field===field);
        return column?item.cells[column.index]:undefined;
      };
      const text=(field:CvSheetField)=>String(valueFor(field)??'').trim();
      const flags:CvRowFlag[]=[];
      const addFlag=(flag:{field?:string;code?:string;messageKey:string;messageParams?:Record<string,string|number>;suggested?:string|number})=>{
        if(flags.some(found=>found.code===(flag.code||'')&&found.field===(flag.field||'')&&found.messageKey===flag.messageKey))return;
        flags.push({field:flag.field||'',code:flag.code||'',messageKey:flag.messageKey,messageParams:flag.messageParams||{},
          suggested:flag.suggested===undefined?'':String(flag.suggested)});
      };

      // ── the date: read day-first, offer today when the cell is empty, suggest the sheet's year ──
      const dateRaw=text('receivedDate');
      const dateRead=parseSheetDate(valueFor('receivedDate'),now);
      let receivedDate='',suggestedDate='';
      if(dateRead.ok){
        receivedDate=dateRead.day;
        if(dateRead.ambiguous||dateRead.format==='month-first')addFlag({field:'receivedDate',code:'ambiguous',messageKey:'flags.dateAmbiguous',messageParams:{day:dateRead.day,value:dateRaw}});
        for(const flag of dateRead.flags){
          addFlag({field:'receivedDate',code:flag.code,messageKey:flag.code==='future'?'flags.dateFuture':'flags.dateVeryOld',messageParams:{day:dateRead.day},suggested:flag.suggested});
        }
      }else if(dateRead.reason==='empty'){
        suggestedDate=dhakaDay(now);receivedDate=suggestedDate;
        addFlag({field:'receivedDate',code:'empty',messageKey:'flags.dateMissing',messageParams:{day:suggestedDate},suggested:suggestedDate});
      }else{
        suggestedDate=dhakaDay(now);receivedDate=suggestedDate;
        addFlag({field:'receivedDate',code:dateRead.reason,messageKey:'flags.dateUnreadable',messageParams:{value:dateRaw.slice(0,40),day:suggestedDate},suggested:suggestedDate});
      }

      // ── phones: the shared Bangladeshi reader, masks for the screen ────────────────────────────
      const phoneRead=parsePhoneCell(valueFor('phones'));
      const phones=phoneRead.phones.map(phone=>({...phone,masked:phoneSearchMask(phone.normalized)}));
      for(const flag of phoneRead.flags){
        addFlag({field:'phones',code:flag.code,messageKey:PHONE_FLAG_KEYS[flag.code]||'flags.phoneInvalid',messageParams:flag.messageParams});
      }

      // ── subjects, classes and free time: best effort, original words kept ──────────────────────
      const subjectsText=text('subjectsText');
      const subjectRead=readSubjectsText(subjectsText||valueFor('subjectsText'));
      for(const flag of subjectRead.flags)addFlag({field:'subjectsText',...flag});
      const classColumn=readSubjectsText(text('classLevels'));
      const classLevels=[...new Set([...subjectRead.classLevels,...classColumn.classLevels])].sort((a,b)=>Number(a)-Number(b));
      const availabilityText=text('availabilityText');
      const availability=readAvailability(availabilityText||valueFor('availabilityText'));
      for(const flag of availability.flags)addFlag({field:'availabilityText',...flag});
      const shiftColumn=readAvailability(text('shifts'));
      const shifts=[...new Set([...availability.shifts,...shiftColumn.shifts])];
      const salary=readSalary(valueFor('expectedSalary'));
      for(const flag of salary.flags)addFlag({field:'expectedSalary',...flag});

      const sourceRaw=text('source');
      const source=(TEACHER_SOURCES as readonly string[]).includes(sourceRaw.toLowerCase().replace(/\s+/g,'_'))?sourceRaw.toLowerCase().replace(/\s+/g,'_'):'walk_in';
      if(sourceRaw&&source==='walk_in'&&!/^walk[\s_-]*in$/i.test(sourceRaw)){
        addFlag({field:'source',code:'unmapped',messageKey:'flags.sourceUnread',messageParams:{value:sourceRaw.slice(0,40)}});
      }
      const name=text('name');
      const notes=text('notes');
      const tags=[...new Set([...subjectRead.suggestedTags,...text('tags').split(/[,;|\n]/).map(tag=>tag.trim()).filter(Boolean)])].slice(0,20);
      if(!name)addFlag({field:'name',code:'no_name',messageKey:'flags.noName'});
      if(!phones.length)addFlag({field:'phones',code:'no_phone',messageKey:'flags.noPhone'});

      // ── already on file? matched by a shared number, or by the same name on the same day ────────
      const holder=phones.map(phone=>existing.byPhone[phone.normalized]).find(Boolean)
        ||(name?existing.byNameDay[`${nameKey(name)}|${receivedDate}`]:undefined);
      let match:CvImportRow['match']=null;
      if(holder){
        const gaps=existing.gaps[holder.id]||{};
        const fills=[
          ['email',text('email')],['department',text('department')],['university',text('university')],
          ['currentInstitute',text('currentInstitute')],['subjectsText',subjectsText],['availabilityText',availabilityText],
        ].filter(([,value])=>String(value||'').trim()!=='').map(([field])=>String(field))
          .filter(field=>gaps[field]!==false);
        if(subjectRead.subjects.length&&gaps.subjects!==false)fills.push('subjects');
        if(classLevels.length&&gaps.classLevels!==false)fills.push('classLevels');
        if(salary.expectedSalary!==null&&gaps.expectedSalary!==false)fills.push('expectedSalary');
        match={id:holder.id,candidateId:holder.candidateId,name:holder.name,
          masked:phoneSearchMask(String(phones[0]?.normalized||'')),fills:[...new Set(fills)]};
        addFlag({field:'name',code:'duplicate',messageKey:'flags.duplicate',messageParams:{candidateId:holder.candidateId,name:holder.name}});
      }

      rows.push({
        key,sheet:part.sheet,row:item.row,status:'ready',statusKey:'import.status.ready',
        name,email:text('email').toLowerCase(),department:text('department'),university:text('university'),
        currentInstitute:text('currentInstitute'),receivedDate,dateRaw,suggestedDate,
        subjectsText:subjectRead.subjectsText,subjects:subjectRead.subjects,classLevels,
        unparsed:subjectRead.unparsed,suggestedTags:subjectRead.suggestedTags,
        availabilityText:availability.availabilityText,shifts,expectedSalary:salary.expectedSalary,
        source,notes,tags,phones,match,flags,
      });
    }
  }

  /* A year that disagrees with the rest of the sheet is offered the sheet's own year, never repaired.
     Only dates the owner wrote take part: a row whose cell was empty carries the day this reader put
     there, and questioning our own invention would be a doubt nobody could answer. */
  const suspicious=flagSuspiciousYears(rows.filter(row=>row.dateRaw).map(row=>({id:row.key,day:row.receivedDate||null})),now);
  for(const row of rows){
    const doubt=suspicious[row.key];
    if(doubt&&doubt.suggested&&doubt.suggested!==row.receivedDate){
      row.suggestedDate=doubt.suggested;
      row.flags.push({field:'receivedDate',code:'year_typo',messageKey:'flags.dateTypo',
        messageParams:{value:row.dateRaw||row.receivedDate,suggested:doubt.suggested},suggested:doubt.suggested});
    }
  }

  /* Two rows of ONE sheet sharing a number (or a name on the same day) are the same person written
     twice, or two people sharing a phone: either way only the first can be written, because the second
     would be refused as a duplicate at write time. Deciding that here rather than in the commit is what
     makes the preview true — the counts the owner reads are the counts that land. */
  const seenPhone=new Map<string,string>();
  const seenNameDay=new Map<string,string>();
  const doubled=new Set<string>();
  for(const row of rows){
    const dayKey=row.name?`${nameKey(row.name)}|${row.receivedDate}`:'';
    const firstPhone=row.phones[0]?.normalized||'';
    const twin=(firstPhone&&seenPhone.get(firstPhone))||(dayKey&&seenNameDay.get(dayKey))||'';
    if(twin){
      doubled.add(row.key);
      row.flags.push({field:firstPhone?'phones':'name',code:'sheet_duplicate',messageKey:'flags.duplicateInSheet',
        messageParams:{row:twin,name:row.name},suggested:''});
      continue;
    }
    if(firstPhone)seenPhone.set(firstPhone,String(row.row));
    if(dayKey)seenNameDay.set(dayKey,String(row.row));
  }

  // The owner's per-row answers, then the status that follows from what is left.
  for(const row of rows){
    if(decisions.skip[row.key]){row.status='skipped';row.statusKey='import.status.skipped';continue}
    const accepted=decisions.accept[row.key];
    if(accepted==='accept'&&row.suggestedDate){
      row.receivedDate=row.suggestedDate;
      /* The day the owner accepted is a day the reader does not doubt, so the doubts about the reading
         behind it go with it: a stale "this looks eleven years old" beside an accepted date would keep a
         settled row flagged and make the counts the owner reads untrue. */
      const settled=parseSheetDate(row.suggestedDate,now);
      row.flags=settled.ok&&!settled.ambiguous&&!settled.flags.length
        ?row.flags.filter(flag=>flag.field!=='receivedDate')
        :row.flags.filter(flag=>flag.code!=='year_typo');
    }
    if(accepted==='keep')row.flags=row.flags.filter(flag=>flag.code!=='year_typo');
    if(!row.name||doubled.has(row.key)){row.status='blocked';row.statusKey='import.status.blocked';continue}
    if(row.match){
      row.status=row.match.fills.length?'updated':'matched';
      row.statusKey=row.match.fills.length?'import.status.updated':'import.status.matched';
      continue;
    }
    const blocking=row.flags.some(flag=>flag.code==='no_name');
    row.status=blocking?'blocked':row.flags.length?'flagged':'ready';
    row.statusKey=blocking?'import.status.blocked':row.flags.length?'import.status.flagged':'import.status.ready';
  }

  const counts:CvImportCounts={rows:rows.length,ready:0,flagged:0,updated:0,matched:0,blocked:0,skipped:0};
  for(const row of rows){
    if(row.status==='ready')counts.ready+=1;
    else if(row.status==='flagged')counts.flagged+=1;
    else if(row.status==='updated')counts.updated+=1;
    else if(row.status==='matched')counts.matched+=1;
    else if(row.status==='blocked')counts.blocked+=1;
    else counts.skipped+=1;
  }
  return {fileLabel,hash,sheet:split.map(part=>part.sheet).filter(Boolean).join(', '),columns,rows,counts,alreadyImported:existing.hashSeen};
}

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

/** XLSX or CSV → grids. Anything else is refused with a code the action turns into a sentence. */
export async function readCvWorkbook(fileName:string,buffer:Buffer):Promise<CvSheetGrid[]>{
  const lower=String(fileName||'').toLowerCase();
  if(lower.endsWith('.csv')||lower.endsWith('.txt')){
    const grid=parseCsvGrid(buffer.toString('utf8'));
    if(!grid.length)throw Object.assign(new Error('EMPTY_SHEET'),{code:'EMPTY_SHEET'});
    return [{name:String(fileName).replace(/\.[^.]+$/,'')||'CSV',grid}];
  }
  if(!/\.(xlsx|xlsm)$/.test(lower))throw Object.assign(new Error('NOT_A_WORKBOOK'),{code:'NOT_A_WORKBOOK'});
  const workbook=new ExcelJS.Workbook();
  try{await workbook.xlsx.load(buffer as never)}
  catch{throw Object.assign(new Error('NOT_A_WORKBOOK'),{code:'NOT_A_WORKBOOK'})}
  const sheets:CvSheetGrid[]=[];
  workbook.eachSheet(worksheet=>{
    const grid:unknown[][]=[];
    worksheet.eachRow({includeEmpty:false},row=>{
      const cells:unknown[]=[];
      for(let index=1;index<=row.cellCount;index+=1)cells.push(cellValue(row.getCell(index)));
      grid.push(cells);
    });
    if(grid.length)sheets.push({name:worksheet.name,grid});
  });
  if(!sheets.length)throw Object.assign(new Error('EMPTY_SHEET'),{code:'EMPTY_SHEET'});
  return sheets;
}

/** What the wizard carries between its three posts: the dry run, the owner's answers, the outcome. */
export interface CvImportState{
  preview:CvImportPreview|null;
  decisions:CvImportDecision;
  result:{batch:string;created:number;updated:number;matched:number;blocked:number;skipped:number;flagged:number}|null;
  undone:{batch:string;binned:number;restored:number;kept:number}|null;
  /** A catalog key inside `teacherCvs`, plus its params: the wizard renders the sentence itself. */
  errorKey:string|null;
  errorParams:Record<string,string|number>;
}
export const emptyCvImportState=():CvImportState=>({preview:null,decisions:emptyCvDecisions(),result:null,undone:null,errorKey:null,errorParams:{}});
