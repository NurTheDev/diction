'use client';
/**
 * R5 · Exams — the marks grid.
 *
 * A class of marks is typed, not clicked: a teacher with 60 students and 8 subjects is 480 numbers, and
 * every one of them is a trip to the mouse if the grid does not behave like the spreadsheet the numbers
 * came from. So this grid is keyboard-first, and the rules it keeps are the ones that make that safe:
 *
 *   • **Tab and Enter both move on.** Tab follows the browser's own order (across a row), Enter goes down
 *     a column, and the arrow keys move one cell in any direction — a teacher who never touches the mouse
 *     never loses their place, and the cell they are standing in is always the one that scrolls into view.
 *   • **`A` means absent.** Typing the letter (or the Bangla word) in a cell marks that subject absent for
 *     that student; a whole-row toggle does it for every subject at once. Absence is stored as absence, so
 *     it is never averaged into the class as a zero.
 *   • **A mark is validated the moment it is typed, against that subject's full marks.** 90 in a subject
 *     out of 80 is refused in the cell, with the reason and the full mark in the sentence — not clipped,
 *     because clipping would write a number nobody typed into a result somebody reads.
 *   • **Autosave is batched and debounced.** Edits collect for a moment and then travel in ONE request,
 *     so typing a whole class is one round trip rather than 480. A row that another person has since
 *     changed comes back stale and is named: the grid will not overwrite a mark it did not read.
 *   • **A block pasted from Excel lands where the teacher is standing.** Tab-separated or comma-separated,
 *     it is laid over the grid from the focused cell and cut at the grid's edge, and the screen says how
 *     many cells were filled and how many were refused.
 *   • **Totals, grades and positions update as the teacher types**, from the same engine the server uses
 *     (`lib/exams/grading`), so the number on screen while marking is the number that will be stored.
 */
import {useCallback,useEffect,useMemo,useRef,useState,useTransition,
  type ClipboardEvent,type KeyboardEvent,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {formatNumber,inDigits,type Digits} from '@/lib/admin/format';
import {calculateResult,classSummary,positionOf,type ExamSubject,type MarkEntry,type SummaryRow} from '@/lib/exams/grading';
import {readMarkCell,parsePastedBlock} from '@/lib/exams/grid';
import {isAbsentToken} from '@/lib/exams/vocab';
import {saveMarksBatchAction,previewMarksAction,commitMarksAction} from '@/actions/center-exams';
import {SubmitButton} from '@/components/admin/submit-button';
/* The bus, not the host: this grid is also rendered on a teacher's own exam page, which ships the
   `exams` catalog alone and carries no host — see `admin/toast-bus.ts`. */
import {showRecycleToast} from '@/components/admin/toast-bus';
import type {ExamState,MarksImportState,GridRow} from '@/lib/exams/exam-state';

export interface GridSubject{id:string;name:string;full:number;pass:number;parts:{name:string;marks:number}[]}
export interface GridStudent{
  id:string;name:string;studentId:string;
  /** The roll the class knows the child by. It is the first column of the grid and the order it is in:
      a teacher marking from a paper roll reads down a column of numbers, not a column of names. */
  roll:string;
  version:number;
  marks:Record<string,{obtained:number|null;absent:boolean;parts?:{name:string;obtained:number|null}[]}>;
}
/** One typed component score, as text: blank is untouched, digits are a mark. Keyed student::subject, then slot. */
type PartCells=Record<string,Record<string,Record<number,string>>>;
/** A column of the grid: a subject's component when it has them, otherwise the subject itself. */
interface GridColumn{subject:string;part:number|null}

/** A cell's text, as typed: `''` is untouched, `A` is absent, digits are a mark. */
type Cells=Record<string,Record<string,string>>;
type CellErrors=Record<string,{messageKey:string;params:Record<string,string|number>}>;

const cellKey=(student:string,subject:string):string=>`${student}::${subject}`;
const textOf=(student:GridStudent,subject:string):string=>{
  const mark=student.marks[subject];
  if(!mark)return '';
  return mark.absent?'A':String(mark.obtained??'');
};
const initialCells=(students:GridStudent[],subjects:GridSubject[]):Cells=>
  Object.fromEntries(students.map(student=>[student.id,Object.fromEntries(subjects.map(subject=>[subject.id,textOf(student,subject.id)]))]));
/* Stored component scores come back as the grid typed them: a number, or blank for a component nobody
   scored. The subject cell they add up to is derived, never stored twice. */
const initialPartCells=(students:GridStudent[],subjects:GridSubject[]):PartCells=>
  Object.fromEntries(students.map(student=>[student.id,Object.fromEntries(subjects.filter(subject=>subject.parts.length)
    .map(subject=>[cellKey(student.id,subject.id),Object.fromEntries((student.marks[subject.id]?.parts||[])
      .map((part,slot)=>[slot,part.obtained===null||part.obtained===undefined?'':String(part.obtained)]))]))]));
const columnsOf=(subjects:GridSubject[]):GridColumn[]=>
  subjects.flatMap((subject):GridColumn[]=>subject.parts.length?subject.parts.map((_,part)=>({subject:subject.id,part})):[{subject:subject.id,part:null}]);
/** Whatever keyboard typed it: Bangla digits count as digits, so a total can add up either way. */
const digitsOf=(text:string):number=>Number(String(text).replace(/[\u09e6-\u09ef]/g,c=>String(c.charCodeAt(0)-0x09e6)).trim());
const partText=(parts:PartCells,studentId:string,subjectId:string,slot:number):string=>parts[studentId]?.[cellKey(studentId,subjectId)]?.[slot]??'';

const AUTO_SAVE_MS=900;

export interface GridLive{
  rows:{studentId:string;name:string;total:number|null;percentage:number|null;grade:string;point:number;position:number|null;absent:boolean;failed:boolean;complete:boolean}[];
  summary:ReturnType<typeof classSummary>;
  savedCount:number;
}

/**
 * The grid as it stands right now: what each row scores, whether it is complete, and the class summary.
 *
 * A row with an unreadable or empty cell scores nothing and is not in the summary — a half-typed row is
 * not a result, and showing a total for one would be a number the teacher did not enter.
 */
export function liveGrid(students:GridStudent[],subjects:GridSubject[],bands:{min:number;label:string;point:number}[],cells:Cells):GridLive{
  const examSubjects:ExamSubject[]=subjects.map(subject=>({id:subject.id,full:subject.full,pass:subject.pass}));
  const rows:GridLive['rows']=[];
  const summaryRows:SummaryRow[]=[];
  for(const student of students){
    const values=cells[student.id]||{};
    const reads=subjects.map(subject=>({subject:subject.id,read:readMarkCell(values[subject.id],subject.full)}));
    const complete=reads.every(entry=>entry.read.ok===true);
    if(!complete){
      rows.push({studentId:student.id,name:student.name,total:null,percentage:null,grade:'',point:0,position:null,absent:false,failed:false,complete:false});
      continue;
    }
    const marks:MarkEntry[]=reads.map(entry=>{
      const read=entry.read as {ok:true;obtained:number|null;absent:boolean};
      return {subject:entry.subject,obtained:read.obtained,absent:read.absent};
    });
    try{
      const calculated=calculateResult(examSubjects,bands,marks);
      rows.push({
        studentId:student.id,name:student.name,total:calculated.total,percentage:calculated.percentage,
        grade:calculated.grade,point:calculated.point,position:null,absent:calculated.absent,
        failed:calculated.failed,complete:true,
      });
      summaryRows.push({total:calculated.total,grade:calculated.grade,marks});
    }catch{
      rows.push({studentId:student.id,name:student.name,total:null,percentage:null,grade:'',point:0,position:null,absent:false,failed:false,complete:false});
    }
  }
  // Position is a class fact: ties share it, the next one skips, and an absent student has none.
  const positions=positionOf(rows.filter(row=>row.complete&&!row.absent).map(row=>({student:row.studentId,total:row.total??0,grade:row.grade})));
  for(const row of rows)row.position=row.absent?null:positions.get(row.studentId)??null;
  // The grid knows every student on it, marked or not, so the summary is about all of them.
  return {rows,summary:classSummary(summaryRows,examSubjects,students.length),savedCount:summaryRows.length};
}

/** One cell's refusal, painted under the grid: the subject, the reason, and the full mark it broke. */
function CellErrors({errors,digits}:{errors:CellErrors;digits:Digits}){
  const t=useTranslations('exams');
  // A refusal sentence names a number — the full mark it broke — and next-intl would paint it in Latin
  // digits on a Bangla screen, so every numeric parameter goes through the operator's own digits.
  const localize=inDigits(digits);
  const list=Object.entries(errors);
  if(!list.length)return null;
  return <ul className="center-exam-cellerrors" data-grid-errors role="alert">
    {list.slice(0,6).map(([key,error])=><li key={key}>{t(error.messageKey,localize(error.params))}</li>)}
    {list.length>6&&<li>{t('grid.errors.more',{count:formatNumber(list.length-6,digits)})}</li>}
  </ul>;
}

export function MarksGrid({examId,subjects,students,bands,canWrite,digits,published,importDoor}:{
  examId:string;subjects:GridSubject[];students:GridStudent[];
  bands:{min:number;label:string;point:number}[];canWrite:boolean;digits:Digits;published:boolean;
  /** The upload door, handed in by the panel so the grid can offer it where the grid's own tools are —
      one fold in the bar above the table, never a step anybody has to take. */
  importDoor?:ReactNode;
}){
  const t=useTranslations('exams');
  const router=useRouter();
  const table=useRef<HTMLTableElement|null>(null);
  /* Whether the save about to happen is one an operator asked for by pressing the button. The grid also
     saves itself as a burst of typing settles, and its own status line says so; a corner message for
     every one of those would cover the grid the operator is reading. So the toast is raised for the
     write somebody is waiting on, and the autosave keeps its line.

     The toast lands in the admin shell, which carries the host that paints it. A teacher's own exam page
     ships the `exams` catalog alone — no admin copy, not even in the bytes behind the visible ones — so
     there is no host there and the grid's own status line is the answer, which is the same sentence. */
  const asked=useRef(false);
  /** One save at a time: a second request with the same row versions is refused as stale, and the operator is told nothing was saved. */
  const inFlight=useRef(false);
  const [cells,setCells]=useState<Cells>(()=>initialCells(students,subjects));
  const [partCells,setPartCells]=useState<PartCells>(()=>initialPartCells(students,subjects));
  const columns=useMemo(()=>columnsOf(subjects),[subjects]);
  const [errors,setErrors]=useState<CellErrors>({});
  const [dirty,setDirty]=useState<Record<string,boolean>>({});
  const [versions,setVersions]= useState<Record<string,number>>(()=>Object.fromEntries(students.map(student=>[student.id,student.version])));
  const [stale,setStale]=useState<Record<string,boolean>>({});
  const [status,setStatus]=useState<{key:string;params:Record<string,string|number>}|null>(null);
  const [pending,startTransition]=useTransition();
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  // A mirror of the dirty rows, so the prop-sync below can protect edits that have not been saved yet
  // without depending on state that a refresh would otherwise overwrite.
  const dirtyRef=useRef<Record<string,boolean>>({});
  const editable=canWrite&&!published;
  const live=useMemo(()=>liveGrid(students,subjects,bands,cells),[students,subjects,bands,cells]);
  const dirtyIds=useMemo(()=>Object.keys(dirty).filter(id=>dirty[id]),[dirty]);

  // Stored values arriving as new props (a publish, an import, another teacher's save) are taken as the
  // truth — except for rows this grid has not saved yet, which keep what the teacher typed. Losing an
  // unsaved mark to a refresh is losing work; showing a mark that was never stored is showing a lie.
  const signature=students.map(student=>`${student.id}:${student.version}`).join('|');
  useEffect(()=>{dirtyRef.current=dirty},[dirty]);
  useEffect(()=>{
    const unsaved=dirtyRef.current;
    setCells(current=>{
      const next=initialCells(students,subjects);
      for(const studentId of Object.keys(next))if(unsaved[studentId]&&current[studentId])next[studentId]=current[studentId];
      return next;
    });
    setPartCells(current=>{
      const next=initialPartCells(students,subjects);
      for(const studentId of Object.keys(next))if(unsaved[studentId]&&current[studentId])next[studentId]=current[studentId];
      return next;
    });
    setVersions(current=>{
      const next={...current};
      for(const student of students)if(!unsaved[student.id])next[student.id]=student.version;
      return next;
    });
    setDirty(current=>Object.fromEntries(Object.keys(current).filter(id=>unsaved[id]).map(id=>[id,true])));
    setStale({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[signature]);

  const focus=(studentId:string,subjectId:string,part:number|null=null):void=>{
    const selector=part===null
      ?`[data-student="${studentId}"][data-subject="${subjectId}"]:not([data-part])`
      :`[data-student="${studentId}"][data-subject="${subjectId}"][data-part="${part}"]`;
    const input=table.current?.querySelector<HTMLInputElement>(selector);
    if(input){input.focus();input.scrollIntoView({block:'nearest',inline:'nearest'})}
  };

  const move=(from:{row:number;column:number},rowStep:number,columnStep:number):boolean=>{
    const row=from.row+rowStep,column=from.column+columnStep;
    if(row<0||row>=students.length||column<0||column>=columns.length)return false;
    const target=columns[column];
    focus(students[row].id,target.subject,target.part);
    return true;
  };

  /**
   * A component score, typed: checked against the component's own ceiling, then folded into the subject's
   * cell as the sum of its parts — so the engine downstream learns no new shape and the row total moves
   * the moment a number lands.
   */
  const setPartValue=useCallback((studentId:string,subjectId:string,slot:number,value:string)=>{
    const subject=subjects.find(entry=>entry.id===subjectId);
    if(!subject)return;
    const part=subject.parts[slot];
    const text=value.trim(),key=cellKey(studentId,subjectId),cellErrorKey=`${key}::${slot}`;
    const asNumber=digitsOf(text);
    const bad=text!==''&&!Number.isFinite(asNumber);
    const tooHigh=!bad&&text!==''&&asNumber>part.marks;
    const nextPartCells:PartCells={...partCells,[studentId]:{...(partCells[studentId]||{}),[key]:{...(partCells[studentId]?.[key]||{}),[slot]:text}}};
    setPartCells(nextPartCells);
    setErrors(current=>{
      const next={...current},student=students.find(entry=>entry.id===studentId)?.name||'';
      if(bad)next[cellErrorKey]={messageKey:'grid.errors.notANumber',params:{student,subject:`${subject.name} · ${part.name}`}};
      else if(tooHigh)next[cellErrorKey]={messageKey:'grid.errors.partTooHigh',params:{max:part.marks,part:part.name,student}};
      else delete next[cellErrorKey];
      return next;
    });
    if(bad||tooHigh)return;
    const slots=subject.parts.map((_,index)=>index===slot?text:partText(nextPartCells,studentId,subjectId,index));
    const absent=isAbsentToken((cells[studentId]||{})[subjectId]||'');
    const every=slots.every(entry=>entry.trim()!=='');
    const sum=slots.reduce((total,entry)=>total+digitsOf(entry),0);
    const nextCell=slots.every(entry=>entry.trim()==='')?(absent?'A':''):every?String(sum):(absent?'A':'');
    setCells(current=>({...current,[studentId]:{...(current[studentId]||{}),[subjectId]:nextCell}}));
    if(every){
      setDirty(current=>({...current,[studentId]:true}));
      setStale(current=>({...current,[studentId]:false}));
    }
  },[cells,partCells,subjects,students]);

  const setValue=useCallback((studentId:string,subjectId:string,value:string)=>{
    const subject=subjects.find(entry=>entry.id===subjectId);
    if(!subject)return;
    const text=value.trim()===''?'':value;
    const read=readMarkCell(text,subject.full);
    setCells(current=>({...current,[studentId]:{...(current[studentId]||{}),[subjectId]:text}}));
    setErrors(current=>{
      const next={...current},key=cellKey(studentId,subjectId);
      if(read.ok===true)delete next[key];
      else next[key]={messageKey:read.messageKey,params:{...read.messageParams,subject:subject.name,student:students.find(entry=>entry.id===studentId)?.name||''}};
      return next;
    });
    if(read.ok===true){
      setDirty(current=>({...current,[studentId]:true}));
      setStale(current=>({...current,[studentId]:false}));
    }
  },[subjects,students]);

  const save=useCallback(async()=>{
    if(!editable||inFlight.current)return;
    const ids=Object.keys(dirty).filter(id=>dirty[id]);
    if(!ids.length)return;
    const rows:GridRow[]=[];
    for(const studentId of ids){
      const values=cells[studentId]||{};
      const marks=subjects.map(subject=>{
        const read=readMarkCell(values[subject.id]??'',subject.full);
        if(read.ok!==true)return null;
        /* The component scores travel with the mark they add up to, so a stored result can show how it
           was built. Blank stays blank: an unscored component is not a zero. */
        const parts=subject.parts.length?subject.parts.map((part,slot)=>{
          const raw=partText(partCells,studentId,subject.id,slot).trim(),asNumber=digitsOf(raw);
          return {name:part.name,obtained:raw!==''&&Number.isFinite(asNumber)?Math.round(asNumber):null};
        }):undefined;
        return {subject:subject.id,obtained:read.obtained,absent:read.absent,...(parts?{parts}:{})};
      });
      // A row is written whole or not at all: a hole in a row is not a mark.
      if(marks.some(mark=>mark===null))continue;
      rows.push({studentId,version:versions[studentId]??-1,marks:marks as MarkEntry[]});
    }
    if(!rows.length){setStatus({key:'grid.status.nothingToSave',params:{}});return}
    setStatus({key:'grid.status.saving',params:{count:rows.length}});
    const form=new FormData();
    form.set('exam',examId);
    form.set('rows',JSON.stringify(rows));
    let outcome:ExamState={status:'idle'};
    inFlight.current=true;
    startTransition(async()=>{
      try{outcome=await saveMarksBatchAction({status:'idle'},form)}finally{inFlight.current=false}
      const savedIds=rows.filter(row=>!(outcome.refusals||[]).some(refusal=>refusal.studentId===row.studentId)).map(row=>row.studentId);
      setVersions(current=>{
        const next={...current};
        for(const id of savedIds)next[id]=(next[id]??0)+1;
        return next;
      });
      setDirty(current=>{
        const next={...current};
        for(const id of savedIds)delete next[id];
        return next;
      });
      setStale(current=>{
        const next={...current};
        for(const refusal of outcome.refusals||[])if(refusal.reason==='STALE_RESULT')next[refusal.studentId]=true;
        return next;
      });
      const staleCount=(outcome.refusals||[]).length;
      const key=staleCount?'grid.status.partial':'grid.status.saved';
      const params:Record<string,string|number>=staleCount
        ? {saved:outcome.saved??0,refused:staleCount}:{saved:outcome.saved??rows.length};
      setStatus({key,params});
      const sentence=t(key,inDigits(digits)(params));
      if(asked.current){
        asked.current=false;
        showRecycleToast(staleCount
          ? {state:{status:'error'},success:'',error:sentence}
          : {state:{status:'ok'},success:sentence,error:''});
      }
      router.refresh();
    });
  },[cells,partCells,digits,dirty,editable,examId,router,subjects,t,versions]);

  // Debounced autosave: one request for a burst of typing, and never while a save is in flight.
  useEffect(()=>{
    if(!editable||!dirtyIds.length)return;
    if(timer.current)clearTimeout(timer.current);
    timer.current=setTimeout(()=>{void save()},AUTO_SAVE_MS);
    return ()=>{if(timer.current)clearTimeout(timer.current)};
  },[dirtyIds,editable,save]);

  const onKeyDown=(event:KeyboardEvent<HTMLInputElement>,rowIndex:number,columnIndex:number):void=>{
    if(!editable)return;
    const key=event.key;
    if(key==='Enter'){event.preventDefault();if(!move({row:rowIndex,column:columnIndex},1,0)&&rowIndex===students.length-1)setStatus({key:'grid.status.lastRow',params:{}})}
    else if(key==='ArrowDown'){event.preventDefault();move({row:rowIndex,column:columnIndex},1,0)}
    else if(key==='ArrowUp'){event.preventDefault();move({row:rowIndex,column:columnIndex},-1,0)}
    else if(key==='ArrowRight'&&(event.currentTarget.selectionStart??0)===(event.currentTarget.value.length)){event.preventDefault();move({row:rowIndex,column:columnIndex},0,1)}
    else if(key==='ArrowLeft'&&(event.currentTarget.selectionStart??0)===0){event.preventDefault();move({row:rowIndex,column:columnIndex},0,-1)}
  };

  /**
   * A block from the clipboard, laid over the grid from the cell the teacher is standing in.
   *
   * Excel and Google Sheets both copy tab-separated text; a CSV preview copies commas. Either is read
   * into rows of cells and each cell is validated by the same rule a typed cell is, so a paste can never
   * write a mark that typing would have refused.
   */
  const onPaste=(event:ClipboardEvent<HTMLTableElement>):void=>{
    if(!editable)return;
    const target=event.target as HTMLElement;
    const startRow=Number(target.getAttribute('data-gridrow')??-1),startColumn=Number(target.getAttribute('data-gridcolumn')??-1);
    if(startRow<0||startColumn<0)return;
    const block=parsePastedBlock(event.clipboardData.getData('text'));
    if(!block.length)return;
    event.preventDefault();
    let filled=0,cut=0,refused=0;
    const nextCells:Cells={...cells},nextErrors:CellErrors={...errors},nextDirty={...dirty};
    const nextPartCells:PartCells=JSON.parse(JSON.stringify(partCells)) as PartCells;
    block.forEach((line,rowOffset)=>{
      line.forEach((raw,columnOffset)=>{
        const rowIndex=startRow+rowOffset,columnIndex=startColumn+columnOffset;
        if(rowIndex>=students.length||columnIndex>=columns.length){cut+=1;return}
        const student=students[rowIndex],column=columns[columnIndex],subject=subjects.find(entry=>entry.id===column.subject);
        if(!subject){cut+=1;return}
        const value=String(raw??'').trim();
        if(!value)return;
        if(column.part!==null){
          const part=subject.parts[column.part],key=cellKey(student.id,subject.id),errorKey=`${key}::${column.part}`;
          const row={...(nextPartCells[student.id]||{}),[key]:{...(nextPartCells[student.id]?.[key]||{}),[column.part]:value}};
          nextPartCells[student.id]=row;
          const asNumber=digitsOf(value);
          if(!Number.isFinite(asNumber)||asNumber>part.marks){
            refused+=1;
            nextErrors[errorKey]={messageKey:'grid.errors.partTooHigh',params:{max:part.marks,part:part.name,student:student.name}};
            return;
          }
          filled+=1;nextDirty[student.id]=true;delete nextErrors[errorKey];
          const slots=subject.parts.map((_,slot)=>slot===column.part?value:(row[key]?.[slot]??''));
          if(slots.every(entry=>entry.trim()!=='')){
            nextCells[student.id]={...(nextCells[student.id]||{}),[subject.id]:String(slots.reduce((total,entry)=>total+digitsOf(entry),0))};
          }
          return;
        }
        const read=readMarkCell(value,subject.full);
        nextCells[student.id]={...(nextCells[student.id]||{}),[subject.id]:isAbsentToken(value)?'A':value};
        if(read.ok===true){
          filled+=1;nextDirty[student.id]=true;delete nextErrors[cellKey(student.id,subject.id)];
        }else{
          refused+=1;
          nextErrors[cellKey(student.id,subject.id)]={messageKey:read.messageKey,params:{...read.messageParams,subject:subject.name,student:student.name}};
        }
      });
    });
    setCells(nextCells);setErrors(nextErrors);setDirty(nextDirty);setPartCells(nextPartCells);
    setStatus({key:'grid.status.pasted',params:{filled,refused,cut}});
  };

  /** Absent for the whole row: the sheet's `A` column, as one click. */
  const toggleRowAbsent=(studentId:string):void=>{
    if(!editable)return;
    const values=cells[studentId]||{};
    const allAbsent=subjects.every(subject=>isAbsentToken(values[subject.id]||''));
    // Absent for the row is absent for every subject: a student who was not there has no marks at all.
    const next=Object.fromEntries(subjects.map(subject=>{
      if(!allAbsent)return [subject.id,'A'];
      // Coming back from absent, a subject with components re-adds itself from what was already typed.
      if(!subject.parts.length)return [subject.id,''];
      const slots=subject.parts.map((_,slot)=>partText(partCells,studentId,subject.id,slot).trim());
      return [subject.id,slots.every(entry=>entry!=='')?String(slots.reduce((total,entry)=>total+digitsOf(entry),0)):''];
    }));
    void values;
    setCells(current=>({...current,[studentId]:next}));
    setErrors(current=>{
      const copy={...current};
      for(const subject of subjects)delete copy[cellKey(studentId,subject.id)];
      return copy;
    });
    setDirty(current=>({...current,[studentId]:true}));
    setStatus({key:allAbsent?'grid.status.present':'grid.status.absent',params:{student:students.find(entry=>entry.id===studentId)?.name||''}});
  };

  const summary=live.summary;
  const number=(value:number|null):string=>value===null?'—':formatNumber(Math.round(value*10)/10,digits);
  /**
   * One row's state, in the order an operator would ask about it: a row somebody else has changed
   * outranks everything (this grid will not overwrite it), absence outranks the marks, a row this
   * browser has not sent yet says so, a complete row says it is saved, and a row with something typed
   * but a hole in it says it is incomplete rather than looking finished.
   */
  const rowStatus=(student:GridStudent,row?:GridLive['rows'][number]):{value:string;key:string}=>{
    if(stale[student.id])return {value:'stale',key:'grid.rowStale'};
    if(row?.absent)return {value:'absent',key:'grid.rowAbsent'};
    if(dirty[student.id])return {value:'unsaved',key:'grid.rowUnsaved'};
    if(row?.complete)return {value:'saved',key:'grid.rowSaved'};
    const typed=subjects.some(subject=>String((cells[student.id]||{})[subject.id]||'').trim()!=='');
    return typed?{value:'incomplete',key:'grid.rowIncomplete'}:{value:'empty',key:'grid.rowEmpty'};
  };
  if(!students.length)return <p className="admin-help" data-grid-empty>{t('grid.noStudents')}</p>;
  return <div className="center-exam-gridwrap" data-exam-grid data-editable={editable?'yes':'no'}>
    <div className="center-exam-gridbar">
      <p className="admin-help">{editable?t('grid.help'):t('grid.readOnly')}</p>
      {/* A save in flight is a disabled button with a spinner and the word "saving" on it: the grid
          autosaves as well, and an operator who cannot see the write is an operator who clicks again. */}
      {editable&&<SubmitButton type="button" className="admin-mini-button" data-grid-save
        onClick={()=>{asked.current=true;void save()}} disabled={!dirtyIds.length} pending={pending}
        busyLabel={t('grid.saving')}
        label={<>{t('grid.saveNow')}{dirtyIds.length?` (${formatNumber(dirtyIds.length,digits)})`:''}</>}/>}
      <span className="admin-help" data-grid-status role="status">{pending?t('grid.status.savingShort'):status?t(status.key,inDigits(digits)(status.params)):dirtyIds.length?t('grid.status.unsaved',{count:formatNumber(dirtyIds.length,digits)}):''}</span>
      {/* A spreadsheet is a second door, not the door: it stays folded until an operator opens it, and
          the grid above is complete and writable without it. */}
      {importDoor&&<details className="center-exam-importfold" data-import-fold>
        <summary className="admin-mini-button" data-grid-import-toggle>{t('grid.importToggle')}</summary>
        <div className="center-exam-importfold-body">
          <p className="admin-help" data-grid-import-help>{t('grid.importToggleHelp')}</p>
          {importDoor}
        </div>
      </details>}
    </div>
    <div className="admin-table-wrap"><table className="center-exam-grid" ref={table} onPaste={onPaste} data-grid-table>
      <caption>{t('grid.caption')}</caption>
      <thead><tr>
        <th scope="col">{t('col.roll')}</th>
        <th scope="col">{t('col.student')}</th>
        {columns.map(column=>{
          const subject=subjects.find(entry=>entry.id===column.subject);
          if(!subject)return null;
          const part=column.part===null?null:subject.parts[column.part];
          /* A subject with components gets a column per component, each named after the subject and the
             part, each with its own ceiling — the creator's split, visible where the marks are typed. */
          return <th scope="col" key={`${subject.id}:${column.part}`}>
            {part?`${subject.name} · ${part.name}`:subject.name}
            <small>{t('grid.fullOf',{full:formatNumber(part?part.marks:subject.full,digits)})}</small>
          </th>;
        })}
        <th scope="col">{t('col.total')}</th><th scope="col">{t('col.percentage')}</th>
        <th scope="col">{t('col.grade')}</th><th scope="col">{t('col.point')}</th><th scope="col">{t('col.rank')}</th>
        {editable&&<th scope="col">{t('col.absent')}</th>}
        <th scope="col">{t('col.status')}</th>
      </tr></thead>
      <tbody>{students.map((student,rowIndex)=>{
        const row=live.rows.find(entry=>entry.studentId===student.id);
        return <tr key={student.id} data-row={student.id} data-row-stale={stale[student.id]?'true':undefined} data-row-dirty={dirty[student.id]?'true':undefined}>
          <td data-cell-roll>{student.roll||'—'}</td>
          <th scope="row">{student.name}<small>{student.studentId}</small></th>
          {columns.map((column,columnIndex)=>{
            const subject=subjects.find(entry=>entry.id===column.subject);
            if(!subject)return null;
            if(column.part!==null){
              const part=subject.parts[column.part],key=cellKey(student.id,subject.id),slot=column.part;
              const error=errors[`${key}::${slot}`],value=partText(partCells,student.id,subject.id,slot);
              const absent=isAbsentToken((cells[student.id]||{})[subject.id]||'');
              return <td key={`${key}:${slot}`} data-cell={`${key}:${slot}`} data-cell-part={slot}>
                <input className="admin-input center-exam-cell" data-student={student.id} data-subject={subject.id} data-part={slot}
                  data-gridrow={rowIndex} data-gridcolumn={columnIndex} data-absent={absent?'true':undefined}
                  type="text" inputMode="numeric" autoComplete="off" readOnly={!editable}
                  value={value} maxLength={6} placeholder={t('grid.placeholder')}
                  aria-label={t('grid.partCellLabel',{student:student.name,subject:subject.name,part:part.name})}
                  aria-invalid={error?'true':undefined}
                  onChange={event=>setPartValue(student.id,subject.id,slot,event.target.value)}
                  onKeyDown={event=>onKeyDown(event,rowIndex,columnIndex)}/>
              </td>;
            }
            const key=cellKey(student.id,subject.id),error=errors[key],value=(cells[student.id]||{})[subject.id]??'';
            return <td key={subject.id} data-cell={key}>
              <input className="admin-input center-exam-cell" data-student={student.id} data-subject={subject.id}
                data-gridrow={rowIndex} data-gridcolumn={columnIndex} data-absent={isAbsentToken(value)?'true':undefined}
                type="text" inputMode="numeric" autoComplete="off" readOnly={!editable}
                value={value} maxLength={6} placeholder={t('grid.placeholder')}
                aria-label={t('grid.cellLabel',{student:student.name,subject:subject.name})}
                aria-invalid={error?'true':undefined}
                onChange={event=>setValue(student.id,subject.id,event.target.value)}
                onKeyDown={event=>onKeyDown(event,rowIndex,columnIndex)}/>
            </td>;
          })}
          <td data-cell-total>{row?.total===null||row?.total===undefined?'—':formatNumber(row.total,digits)}</td>
          <td data-cell-percentage>{number(row?.percentage??null)}</td>
          <td data-cell-grade>{!row?.grade?'—':row.grade==='ABSENT'?t('grades.absent'):row.grade==='FAIL'?t('grades.fail'):row.grade}</td>
          <td data-cell-point>{row?.point?formatNumber(row.point,digits):'—'}</td>
          <td data-cell-position>{row?.position?formatNumber(row.position,digits):'—'}</td>
          {editable&&<td><button type="button" className="admin-mini-button" data-absent-row={student.id} aria-pressed={subjects.every(subject=>isAbsentToken((cells[student.id]||{})[subject.id]||''))} onClick={()=>toggleRowAbsent(student.id)}>{t('grid.absentToggle')}</button></td>}
          {/* Where this row stands, said in one word: the grid autosaves, so "not saved yet" and "saved"
              are facts an operator has to be able to read without watching the bar above the table. */}
          <td data-cell-status={rowStatus(student,row).value}>{t(rowStatus(student,row).key)}</td>
        </tr>;
      })}</tbody>
      <tfoot><tr>
        <th scope="row" colSpan={2}>{t('summary.title')}</th>
        {/* One average per SUBJECT, not per column: a subject split into components gets one cell that
            spans its own columns, so the footer lines up with a body that has a column per component.
            A footer counted in subjects under a body counted in columns is a summary printed under the
            wrong child's marks — the one mistake a marks grid must not make. */}
        {columns.map(column=>{
          if(column.part!==null&&column.part>0)return null;
          const subject=subjects.find(entry=>entry.id===column.subject);
          if(!subject)return null;
          const row=summary.subjects.find(entry=>entry.subject===subject.id);
          return <td key={`${subject.id}:${column.part}`} colSpan={column.part===null?1:Math.max(1,subject.parts.length)}
            data-summary-subject={subject.id} title={t('summary.subjectAverage')}>{number(row?.average??null)}</td>;
        })}
        <td colSpan={6+(editable?1:0)} data-summary-foot>{t('summary.average')}: {number(summary.average)} · {t('summary.passRate')}: {summary.passRate===null?'—':`${formatNumber(summary.passRate,digits)}%`} · {t('summary.counted')}: {formatNumber(summary.counted,digits)}</td>
      </tr></tfoot>
    </table></div>
    <CellErrors errors={errors} digits={digits}/>
    <dl className="center-exam-summary" data-exam-summary>
      <div><dt>{t('summary.students')}</dt><dd data-summary-students>{formatNumber(summary.students,digits)}</dd></div>
      <div><dt>{t('summary.counted')}</dt><dd data-summary-counted>{formatNumber(summary.counted,digits)}</dd></div>
      <div><dt>{t('summary.absent')}</dt><dd data-summary-absent>{formatNumber(summary.absent,digits)}</dd></div>
      <div><dt>{t('summary.passed')}</dt><dd data-summary-passed>{formatNumber(summary.passed,digits)}</dd></div>
      <div><dt>{t('summary.failed')}</dt><dd data-summary-failed>{formatNumber(summary.failed,digits)}</dd></div>
      <div><dt>{t('summary.average')}</dt><dd data-summary-average>{number(summary.average)}</dd></div>
      <div><dt>{t('summary.highest')}</dt><dd data-summary-highest>{number(summary.highest)}</dd></div>
      <div><dt>{t('summary.lowest')}</dt><dd data-summary-lowest>{number(summary.lowest)}</dd></div>
      <div><dt>{t('summary.passRate')}</dt><dd data-summary-passrate>{summary.passRate===null?'—':`${formatNumber(summary.passRate,digits)}%`}</dd></div>
    </dl>
  </div>;
}

/**
 * The upload door: preview a CSV or XLSX against the class roster, then commit exactly what was shown.
 *
 * The same file is posted twice and its hash is compared, so what the teacher reviewed is what lands —
 * and a row the sheet could not match to ONE student is listed as ambiguous rather than guessed at,
 * because a mark written onto the wrong child is the one mistake this screen must never make.
 */
export function MarksImport({examId,onImported,digits}:{examId:string;onImported:()=>void;digits:Digits}){
  const t=useTranslations('exams');
  const localize=inDigits(digits);
  const router=useRouter();
  const [file,setFile]=useState<File|null>(null);
  const [preview,setPreview]=useState<MarksImportState|null>(null);
  const [busy,setBusy]=useState(false);
  const [outcome,setOutcome]=useState<MarksImportState|null>(null);
  const run=async(mode:'preview'|'commit'):Promise<void>=>{
    if(!file)return;
    setBusy(true);
    const form=new FormData();
    form.set('exam',examId);
    form.set('file',file);
    if(mode==='commit'&&preview?.hash)form.set('hash',preview.hash);
    const action=mode==='preview'?previewMarksAction:commitMarksAction;
    const state=await action({status:'idle'},form);
    if(mode==='preview')setPreview(state);
    else{
      setOutcome(state);
      if(state.status==='ok'){setPreview(null);setFile(null);router.refresh();onImported()}
    }
    setBusy(false);
  };
  return <div className="center-exam-import" data-marks-import>
    <label>{t('import.label')}<input type="file" accept=".csv,.txt,.xlsx,.xlsm" data-import-file
      onChange={event=>{setFile(event.target.files?.[0]||null);setPreview(null);setOutcome(null)}}/></label>
    <p className="admin-help">{t('import.help')}</p>
    <button type="button" className="admin-mini-button" data-import-preview disabled={!file||busy} onClick={()=>{void run('preview')}}>{t('import.preview')}</button>
    {preview&&preview.status==='ok'&&<>
      <p data-import-counts>{t('import.counts',localize({rows:preview.counts?.rows??0,ready:preview.counts?.ready??0,unmatched:preview.counts?.unmatched??0,ambiguous:preview.counts?.ambiguous??0,incomplete:preview.counts?.incomplete??0,invalid:preview.counts?.invalid??0}))}</p>
      {preview.unusedHeaders?.length?<p className="admin-help" data-import-unused>{t('import.unused',{columns:preview.unusedHeaders.join(', ')})}</p>:null}
      <div className="admin-table-wrap"><table className="center-exam-importpreview" data-import-table>
        <thead><tr><th>{t('import.col.row')}</th><th>{t('import.col.student')}</th><th>{t('import.col.status')}</th><th>{t('import.col.marks')}</th></tr></thead>
        <tbody>{(preview.rows||[]).map(row=><tr key={row.row} data-import-row={row.row} data-import-status={row.status}>
          <td>{formatNumber(row.row,digits)}</td>
          <td>{row.studentName||row.matches.join(' / ')||'—'}</td>
          <td>{t(row.statusKey)}</td>
          <td>{row.cells.map(cell=>cell.ok||!cell.messageKey?cell.raw:t(cell.messageKey,localize({subject:cell.subject,full:cell.full??0}))).join(' · ')}</td>
        </tr>)}</tbody>
      </table></div>
      <button type="button" className="button button-navy" data-import-confirm disabled={busy||!(preview.counts?.ready)} onClick={()=>{void run('commit')}}>{t('import.commit',{count:formatNumber(preview.counts?.ready??0,digits)})}</button>
    </>}
    {preview&&preview.status==='error'&&<p role="alert" className="admin-feedback error" data-import-error>{t(preview.messageKey||'errors.failed',localize(preview.messageParams||{}))}</p>}
    {outcome&&<p role="status" data-import-outcome>{outcome.status==='ok'
      ? t('import.saved',{count:formatNumber(outcome.saved??0,digits)})
      : t(outcome.messageKey||'errors.failed',localize(outcome.messageParams||{}))}</p>}
  </div>;
}

/** The grid plus its upload door, wired to re-read the class after an import lands. */
export function ExamMarksPanel({examId,subjects,students,bands,canWrite,digits,published}:{
  examId:string;subjects:GridSubject[];students:GridStudent[];
  bands:{min:number;label:string;point:number}[];canWrite:boolean;digits:Digits;published:boolean;
}){
  const router=useRouter();
  const [reload,setReload]=useState(0);
  return <div className="center-exam-panel">
    <MarksGrid key={reload} examId={examId} subjects={subjects} students={students} bands={bands}
      canWrite={canWrite} digits={digits} published={published}
      importDoor={!published&&canWrite
        ? <MarksImport examId={examId} digits={digits} onImported={()=>{setReload(count=>count+1);router.refresh()}}/>
        : null}/>
  </div>;
}
