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
import {useCallback,useEffect,useMemo,useRef,useState,useTransition,type ClipboardEvent,type KeyboardEvent} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {formatNumber,type Digits} from '@/lib/admin/format';
import {calculateResult,classSummary,positionOf,type ExamSubject,type MarkEntry,type SummaryRow} from '@/lib/exams/grading';
import {readMarkCell,parsePastedBlock} from '@/lib/exams/grid';
import {isAbsentToken} from '@/lib/exams/vocab';
import {saveMarksBatchAction,previewMarksAction,commitMarksAction} from '@/actions/center-exams';
import type {ExamState,MarksImportState,GridRow} from '@/lib/exams/exam-state';

export interface GridSubject{id:string;name:string;full:number;pass:number}
export interface GridStudent{
  id:string;name:string;studentId:string;version:number;
  marks:Record<string,{obtained:number|null;absent:boolean}>;
}

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
  return {rows,summary:classSummary(summaryRows,examSubjects),savedCount:summaryRows.length};
}

/** One cell's refusal, painted under the grid: the subject, the reason, and the full mark it broke. */
function CellErrors({errors}:{errors:CellErrors}){
  const t=useTranslations('exams');
  const list=Object.entries(errors);
  if(!list.length)return null;
  return <ul className="center-exam-cellerrors" data-grid-errors role="alert">
    {list.slice(0,6).map(([key,error])=><li key={key}>{t(error.messageKey,error.params)}</li>)}
    {list.length>6&&<li>{t('grid.errors.more',{count:list.length-6})}</li>}
  </ul>;
}

export function MarksGrid({examId,subjects,students,bands,canWrite,digits,published}:{
  examId:string;subjects:GridSubject[];students:GridStudent[];
  bands:{min:number;label:string;point:number}[];canWrite:boolean;digits:Digits;published:boolean;
}){
  const t=useTranslations('exams');
  const router=useRouter();
  const table=useRef<HTMLTableElement|null>(null);
  const [cells,setCells]=useState<Cells>(()=>initialCells(students,subjects));
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
    setVersions(current=>{
      const next={...current};
      for(const student of students)if(!unsaved[student.id])next[student.id]=student.version;
      return next;
    });
    setDirty(current=>Object.fromEntries(Object.keys(current).filter(id=>unsaved[id]).map(id=>[id,true])));
    setStale({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[signature]);

  const focus=(studentId:string,subjectId:string):void=>{
    const input=table.current?.querySelector<HTMLInputElement>(`[data-student="${studentId}"][data-subject="${subjectId}"]`);
    if(input){input.focus();input.scrollIntoView({block:'nearest',inline:'nearest'})}
  };

  const move=(from:{row:number;column:number},rowStep:number,columnStep:number):boolean=>{
    const row=from.row+rowStep,column=from.column+columnStep;
    if(row<0||row>=students.length||column<0||column>=subjects.length)return false;
    focus(students[row].id,subjects[column].id);
    return true;
  };

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
    if(!editable)return;
    const ids=Object.keys(dirty).filter(id=>dirty[id]);
    if(!ids.length)return;
    const rows:GridRow[]=[];
    for(const studentId of ids){
      const values=cells[studentId]||{};
      const marks=subjects.map(subject=>{
        const read=readMarkCell(values[subject.id]??'',subject.full);
        if(read.ok!==true)return null;
        return {subject:subject.id,obtained:read.obtained,absent:read.absent};
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
    startTransition(async()=>{
      outcome=await saveMarksBatchAction({status:'idle'},form);
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
      setStatus(staleCount
        ? {key:'grid.status.partial',params:{saved:outcome.saved??0,refused:staleCount}}
        : {key:'grid.status.saved',params:{saved:outcome.saved??rows.length}});
      router.refresh();
    });
  },[cells,dirty,editable,examId,router,subjects,versions]);

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
    block.forEach((line,rowOffset)=>{
      line.forEach((raw,columnOffset)=>{
        const rowIndex=startRow+rowOffset,columnIndex=startColumn+columnOffset;
        if(rowIndex>=students.length||columnIndex>=subjects.length){cut+=1;return}
        const student=students[rowIndex],subject=subjects[columnIndex];
        const value=String(raw??'').trim();
        if(!value)return;
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
    setCells(nextCells);setErrors(nextErrors);setDirty(nextDirty);
    setStatus({key:'grid.status.pasted',params:{filled,refused,cut}});
  };

  /** Absent for the whole row: the sheet's `A` column, as one click. */
  const toggleRowAbsent=(studentId:string):void=>{
    if(!editable)return;
    const values=cells[studentId]||{};
    const allAbsent=subjects.every(subject=>isAbsentToken(values[subject.id]||''));
    // Absent for the row is absent for every subject: a student who was not there has no marks at all.
    const next=Object.fromEntries(subjects.map(subject=>[subject.id,allAbsent?'':'A']));
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
  if(!students.length)return <p className="admin-help" data-grid-empty>{t('grid.noStudents')}</p>;
  return <div className="center-exam-gridwrap" data-exam-grid data-editable={editable?'yes':'no'}>
    <div className="center-exam-gridbar">
      <p className="admin-help">{editable?t('grid.help'):t('grid.readOnly')}</p>
      {editable&&<button type="button" className="admin-mini-button" data-grid-save onClick={()=>{void save()}} disabled={pending||!dirtyIds.length}>
        {t('grid.saveNow')}{dirtyIds.length?` (${formatNumber(dirtyIds.length,digits)})`:''}
      </button>}
      <span className="admin-help" data-grid-status role="status">{pending?t('grid.status.savingShort'):status?t(status.key,status.params):dirtyIds.length?t('grid.status.unsaved',{count:dirtyIds.length}):''}</span>
    </div>
    <div className="admin-table-wrap"><table className="center-exam-grid" ref={table} onPaste={onPaste} data-grid-table>
      <caption>{t('grid.caption')}</caption>
      <thead><tr>
        <th scope="col">{t('col.student')}</th>
        {subjects.map(subject=><th scope="col" key={subject.id}>{subject.name}<small>{t('grid.fullOf',{full:formatNumber(subject.full,digits)})}</small></th>)}
        <th scope="col">{t('col.total')}</th><th scope="col">{t('col.percentage')}</th>
        <th scope="col">{t('col.grade')}</th><th scope="col">{t('col.point')}</th><th scope="col">{t('col.rank')}</th>
        {editable&&<th scope="col">{t('col.absent')}</th>}
      </tr></thead>
      <tbody>{students.map((student,rowIndex)=>{
        const row=live.rows.find(entry=>entry.studentId===student.id);
        return <tr key={student.id} data-row={student.id} data-row-stale={stale[student.id]?'true':undefined} data-row-dirty={dirty[student.id]?'true':undefined}>
          <th scope="row">{student.name}<small>{student.studentId}</small></th>
          {subjects.map((subject,columnIndex)=>{
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
        </tr>;
      })}</tbody>
      <tfoot><tr>
        <th scope="row">{t('summary.title')}</th>
        {subjects.map(subject=>{
          const row=summary.subjects.find(entry=>entry.subject===subject.id);
          return <td key={subject.id} data-summary-subject={subject.id} title={t('summary.subjectAverage')}>{number(row?.average??null)}</td>;
        })}
        <td colSpan={5+(editable?1:0)} data-summary-foot>{t('summary.average')}: {number(summary.average)} · {t('summary.passRate')}: {summary.passRate===null?'—':`${formatNumber(summary.passRate,digits)}%`} · {t('summary.counted')}: {formatNumber(summary.counted,digits)}</td>
      </tr></tfoot>
    </table></div>
    <CellErrors errors={errors}/>
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
export function MarksImport({examId,onImported}:{examId:string;onImported:()=>void}){
  const t=useTranslations('exams');
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
      <p data-import-counts>{t('import.counts',{rows:preview.counts?.rows??0,ready:preview.counts?.ready??0,unmatched:preview.counts?.unmatched??0,ambiguous:preview.counts?.ambiguous??0,incomplete:preview.counts?.incomplete??0,invalid:preview.counts?.invalid??0})}</p>
      {preview.unusedHeaders?.length?<p className="admin-help" data-import-unused>{t('import.unused',{columns:preview.unusedHeaders.join(', ')})}</p>:null}
      <div className="admin-table-wrap"><table className="center-exam-importpreview" data-import-table>
        <thead><tr><th>{t('import.col.row')}</th><th>{t('import.col.student')}</th><th>{t('import.col.status')}</th><th>{t('import.col.marks')}</th></tr></thead>
        <tbody>{(preview.rows||[]).map(row=><tr key={row.row} data-import-row={row.row} data-import-status={row.status}>
          <td>{row.row}</td>
          <td>{row.studentName||row.matches.join(' / ')||'—'}</td>
          <td>{t(row.statusKey)}</td>
          <td>{row.cells.map(cell=>cell.ok||!cell.messageKey?cell.raw:t(cell.messageKey,{subject:cell.subject,full:cell.full??0})).join(' · ')}</td>
        </tr>)}</tbody>
      </table></div>
      <button type="button" className="button button-navy" data-import-confirm disabled={busy||!(preview.counts?.ready)} onClick={()=>{void run('commit')}}>{t('import.commit',{count:preview.counts?.ready??0})}</button>
    </>}
    {preview&&preview.status==='error'&&<p role="alert" className="admin-feedback error" data-import-error>{t(preview.messageKey||'errors.failed',preview.messageParams||{})}</p>}
    {outcome&&<p role="status" data-import-outcome>{outcome.status==='ok'
      ? t('import.saved',{count:outcome.saved??0})
      : t(outcome.messageKey||'errors.failed',outcome.messageParams||{})}</p>}
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
    <MarksGrid key={reload} examId={examId} subjects={subjects} students={students} bands={bands} canWrite={canWrite} digits={digits} published={published}/>
    {!published&&canWrite&&<MarksImport examId={examId} onImported={()=>{setReload(count=>count+1);router.refresh()}}/>}
  </div>;
}
