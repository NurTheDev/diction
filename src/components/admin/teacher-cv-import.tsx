'use client';
/**
 * R4 · The teacher CV import wizard on screen.
 *
 * One form, three server actions: the dry run, the commit with the owner's decisions, and the undo of the
 * newest batch. Between the dry run and the commit the owner answers two kinds of question — what a column
 * nobody named is, and whether a doubtful date takes its suggested year — and both answers travel back as
 * the `decisions` JSON beside the same file, so the commit re-runs the very preview that is on screen and
 * writes exactly those rows.
 *
 * Two things this screen refuses to do, because the brief says so:
 *
 *   • **It never blocks a row on a reading it could not make.** A subject cell the parser could not
 *     settle is printed as a flag with the words kept beside it, and the row is still written. The only
 *     rows that are not written are the ones with no name at all, and the ones this same sheet already
 *     carried — both printed in words, both counted.
 *   • **It never paints a number.** Every phone on the preview is the mask the rule layer computed; the
 *     digits exist in the row only so the commit can match them, exactly as the Visitors wizard does.
 *
 * Nothing here chooses a language: every painted word is a `teacherCvs` catalog key, including each row's
 * stored doubt, which is why the same preview reads Bangla on /bn and English on /en.
 */
import {useRef,useState,useTransition} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from 'next/navigation';
import {commitCvSheet,previewCvSheet,undoCvSheet} from '@/actions/teacher-cv-import';
import {emptyCvImportState,type CvImportDecision,type CvImportRow,type CvImportState} from '@/lib/teachers/import-preview';
import type {CvImportBatchRow} from '@/lib/teachers/import-commit';
import {CV_SHEET_FIELDS,CV_SHEET_FIELD_LABEL_KEYS} from '@/lib/teachers/cv-columns';
import {subjectLabel,shiftLabel,type CvTranslator} from '@/lib/teachers/cv-ui';
import {formatNumber,type Digits} from '@/lib/admin/format';

export function CvImportWizard({history,digits='bn'}:{history:CvImportBatchRow[];digits?:Digits}){
  const t=useTranslations('teacherCvs'),ti=useTranslations('teacherCvs.import');
  const router=useRouter();
  const formRef=useRef<HTMLFormElement>(null);
  const [state,setState]=useState<CvImportState>(emptyCvImportState());
  const [decisions,setDecisions]=useState<CvImportDecision>({mapping:{},accept:{},skip:{}});
  const [undoReason,setUndoReason]=useState('');
  const [pending,start]=useTransition();
  const num=(value:number)=>formatNumber(value,digits);

  const submit=(action:typeof previewCvSheet,extra:(form:FormData)=>void)=>{
    const element=formRef.current;
    if(!element)return;
    const form=new FormData(element);
    extra(form);
    start(async()=>{
      const next=await action(state,form);
      setState(next);
      if(next.result||next.undone)setDecisions(next.decisions);
      router.refresh();
    });
  };
  const setMapping=(key:string,value:string)=>setDecisions(old=>({...old,mapping:{...old.mapping,[key]:value}}));
  const setAccept=(key:string,value:'accept'|'keep')=>setDecisions(old=>({...old,accept:{...old.accept,[key]:value}}));
  const setSkip=(key:string,skipped:boolean)=>setDecisions(old=>{
    const skip={...old.skip};
    if(skipped)skip[key]=true;else delete skip[key];
    return {...old,skip};
  });

  const preview=state.preview;
  // The preview on screen was computed before the owner answered anything, so the dates still waiting on
  // a hand are counted here off the rows. The commit refuses while any of them is undecided and writes
  // only what was accepted, so this button stays off until every doubtful date has an answer.
  const undecided=preview?preview.rows.filter(row=>row.suggestedDate&&row.dateRaw&&!decisions.accept[row.key]).length:0;
  const latest=history.find(batch=>!batch.undoneAt&&batch.canUndo);

  return <section className="admin-panel" data-cv-import="">
    <div className="admin-panel-head"><h2>{ti('title')}</h2></div>
    <div className="admin-panel-body">
      <p>{ti('desc')}</p>
      <p className="admin-help">{ti('fileHint')}</p>
      <form ref={formRef} onSubmit={event=>event.preventDefault()}>
        <label className="cv-field"><span>{ti('fileLabel')}</span>
          <input type="file" name="file" accept=".xlsx,.xlsm,.csv,.txt" data-cv-import-file=""
            onChange={()=>setState(old=>({...old,result:null,undone:null,errorKey:null}))}/>
        </label>
        <div className="cv-form-foot">
          <button type="button" className="admin-mini-button" disabled={pending} data-cv-import-preview=""
            onClick={()=>submit(previewCvSheet,form=>form.set('decisions','{}'))}>{pending?ti('reading'):ti('preview')}</button>
          {preview&&<button type="button" className="button button-navy" disabled={pending||undecided>0} data-cv-import-commit=""
            onClick={()=>submit(commitCvSheet,form=>{form.set('decisions',JSON.stringify(decisions));form.set('hash',preview.hash)})}>
            {pending?ti('committing'):ti('commit')}</button>}
        </div>
        <p className="admin-help">{ti('dryRun')}</p>
      </form>

      {state.errorKey&&<p role="alert" className="admin-feedback error" data-cv-import-error="">{t(state.errorKey,state.errorParams)}</p>}
      {state.result&&<p role="status" className="admin-feedback" data-cv-import-result="">
        {ti('resultLine',{batch:state.result.batch,created:num(state.result.created),updated:num(state.result.updated),
          matched:num(state.result.matched),blocked:num(state.result.blocked),skipped:num(state.result.skipped)})}
      </p>}
      {state.undone&&<p role="status" className="admin-feedback" data-cv-import-undone="">
        {ti('undoneLine',{batch:state.undone.batch,binned:num(state.undone.binned),restored:num(state.undone.restored),kept:num(state.undone.kept)})}
      </p>}

      {preview&&<>
        <p className="admin-help" data-cv-import-counts="">
          {ti('countsLine',{rows:num(preview.counts.rows),ready:num(preview.counts.ready),flagged:num(preview.counts.flagged),
            updated:num(preview.counts.updated),matched:num(preview.counts.matched),blocked:num(preview.counts.blocked),skipped:num(preview.counts.skipped)})}
        </p>
        {preview.alreadyImported&&<p role="status" className="admin-help">{ti('previousBatch')}</p>}
        {undecided>0&&<p className="admin-help">{ti('undecidedLine',{count:num(undecided)})}</p>}
        <p className="admin-help">{ti('idempotent')}</p>

        {preview.columns.some(column=>column.questionKey)&&<div className="cv-subpanel" data-cv-import-questions="">
          <h3>{ti('unmappedHead')}</h3>
          <p className="admin-help">{ti('columnsHint')}</p>
          {preview.columns.filter(column=>column.questionKey).map(column=>(
            <label className="cv-field" key={column.key}>
              <span>{t(column.questionKey as string,column.questionParams)}</span>
              <select className="admin-select" value={decisions.mapping[column.key]||''} data-cv-import-map=""
                onChange={event=>setMapping(column.key,event.target.value)}>
                <option value="">{column.header||'—'}</option>
                <option value="ignore">{ti('mapIgnore')}</option>
                {CV_SHEET_FIELDS.map(field=><option key={field} value={field}>{t(CV_SHEET_FIELD_LABEL_KEYS[field])}</option>)}
              </select>
              {column.samples.length>0&&<small className="admin-help">{column.samples.join(' · ').slice(0,80)}</small>}
            </label>))}
        </div>}

        <div className="cv-subpanel">
          <h3>{ti('columnsTitle')}</h3>
          <ul className="cv-columns">{preview.columns.map(column=>(
            <li key={column.key}>
              <strong>{column.header||ti('mapIgnore')}</strong>{' '}
              <span className="admin-help">{column.field?t(CV_SHEET_FIELD_LABEL_KEYS[column.field]):ti('auto.unused')}</span>
            </li>))}</ul>
        </div>

        <div className="admin-table-wrap"><table className="admin-table admin-responsive-table" data-cv-import-rows="">
          <thead><tr>
            <th>{ti('sheetRow')}</th><th>{ti('name')}</th><th>{ti('date')}</th><th>{ti('phone')}</th>
            <th>{ti('subjectsText')}</th><th>{ti('subjects')}</th><th>{ti('classes')}</th><th>{ti('free')}</th>
            <th>{ti('flags')}</th><th>{ti('skipLabel')}</th>
          </tr></thead>
          <tbody>{preview.rows.map(row=><WizardRow key={row.key} row={row} decisions={decisions} setAccept={setAccept} setSkip={setSkip} digits={digits}/>)}
          </tbody>
        </table></div>
      </>}

      <div className="cv-subpanel">
        <h3>{ti('history')}</h3>
        {!history.length&&<p className="admin-help">{ti('historyEmpty')}</p>}
        {history.map(batch=><p key={batch.batch} data-cv-import-batch="">
          {ti('batchLine',{batch:batch.batch,fileLabel:batch.fileLabel,rows:num(batch.rows),created:num(batch.created),updated:num(batch.updated),actor:batch.actorName})}
          {batch.undoneAt?` — ${ti('batchUndone',{reason:batch.undoReason})}`:''}
        </p>)}
        {latest&&<div className="cv-form-foot">
          <label className="cv-field"><span>{ti('undoReasonLabel')}</span>
            <input className="admin-input" value={undoReason} maxLength={300} data-cv-import-undo-reason=""
              onChange={event=>setUndoReason(event.target.value)}/>
          </label>
          <button type="button" className="admin-mini-button admin-danger-text" disabled={pending} data-cv-import-undo=""
            onClick={()=>submit(undoCvSheet,form=>{form.set('batch',latest.batch);form.set('reason',undoReason)})}>{ti('undo')}</button>
        </div>}
        {latest&&<p className="admin-help">{ti('undoHint')}</p>}
      </div>
    </div>
  </section>;
}

function WizardRow({row,decisions,setAccept,setSkip,digits='bn'}:{
  row:CvImportRow;decisions:CvImportDecision;digits?:Digits;
  setAccept:(key:string,value:'accept'|'keep')=>void;setSkip:(key:string,skipped:boolean)=>void;
}){
  const t=useTranslations('teacherCvs'),ti=useTranslations('teacherCvs.import');
  const choice=decisions.accept[row.key]||'';
  const subject=(key:string):string=>subjectLabel(t as CvTranslator,key);
  const shift=(key:string):string=>shiftLabel(t as CvTranslator,key);
  return <tr data-status={row.status} data-cv-import-row="">
    <td data-label={ti('sheetRow')}>{row.sheet} · {formatNumber(row.row,digits)}</td>
    <td data-label={ti('name')}>{row.name||<span className="admin-help">{t('flags.noName')}</span>}</td>
    <td data-label={ti('date')}>
      {row.dateRaw||'—'}{row.receivedDate?` → ${row.receivedDate}`:''}
      {row.suggestedDate&&row.dateRaw&&<span className="cv-decide">
        <label><input type="radio" name={`accept-${row.key}`} checked={choice==='accept'} onChange={()=>setAccept(row.key,'accept')}/>{ti('decideAccept',{suggested:row.suggestedDate})}</label>
        <label><input type="radio" name={`accept-${row.key}`} checked={choice==='keep'} onChange={()=>setAccept(row.key,'keep')}/>{ti('decideKeep')}</label>
      </span>}
    </td>
    {/* Masks only: the digits are in the row so the commit can match them, never so the screen can print them. */}
    <td data-label={ti('phone')}>{row.phones.length?row.phones.map(phone=><span key={phone.normalized} className="admin-badge">{phone.masked}</span>):<span className="admin-help">{t('noPhone')}</span>}</td>
    <td data-label={ti('subjectsText')}>{row.subjectsText||'—'}</td>
    <td data-label={ti('subjects')}>{row.subjects.length?row.subjects.map(key=>subject(key)).join(' · '):<span className="admin-help">{t('noSubjectRead')}</span>}</td>
    <td data-label={ti('classes')}>{row.classLevels.length?row.classLevels.map(level=>formatNumber(Number(level),digits)).join(' · '):'—'}</td>
    <td data-label={ti('free')}>{row.availabilityText||'—'}{row.shifts.length?` · ${row.shifts.map(key=>shift(key)).join(' · ')}`:''}</td>
    <td data-label={ti('flags')}>
      {t(row.statusKey)}
      {row.match?` — ${row.match.fills.length?ti('fillsNote',{candidateId:row.match.candidateId,fields:row.match.fills.join(', ')}):ti('matchedNote',{candidateId:row.match.candidateId})}`:''}
      {row.flags.length>0&&<ul className="cv-flag-list">{row.flags.map((flag,index)=><li key={index}>{t(flag.messageKey,flag.messageParams)}</li>)}</ul>}
      {row.unparsed.length>0&&<p className="admin-help">{t('flags.unparsedKept')}</p>}
    </td>
    <td data-label={ti('skipLabel')}>
      <input type="checkbox" aria-label={ti('skipLabel')} data-cv-import-skip="" checked={!!decisions.skip[row.key]}
        onChange={event=>setSkip(row.key,event.target.checked)}/>
    </td>
  </tr>;
}
