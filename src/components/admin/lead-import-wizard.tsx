'use client';
/**
 * R3 · The Visitor import wizard on screen.
 *
 * One form, three server actions: the dry run, the commit with the owner's decisions, and the undo of
 * the latest batch. Between the dry run and the commit the owner answers two kinds of question — what
 * an unnamed column is, and whether a doubtful date takes its suggested fix — and both answers travel
 * back as the `decisions` JSON beside the same file, so the commit re-runs the very preview that is on
 * screen and writes exactly those rows.
 *
 * Nothing here chooses a language: every painted word is a `leads` catalog key, including the stored
 * doubt on each row (`flag.messageKey`), which is why the same preview reads Bangla on /bn and English
 * on /en. Numbers appear only as masks — `maskedPhones` — because R3.8 proved the Visitors screens keep
 * digits out of painted text, and an import preview is a Visitors screen.
 */
import {useRef,useState,useTransition} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from 'next/navigation';
import {commitVisitorImport,previewVisitorImport,undoVisitorImport} from '@/actions/lead-import';
import {emptyLeadImportState,type LeadImportDecision,type LeadImportRow,type LeadImportState} from '@/lib/leads/import-preview';
import type {LeadImportBatchRow} from '@/lib/leads/import-commit';
import {LEAD_SHEET_FIELDS,LEAD_SHEET_FIELD_LABEL_KEYS} from '@/lib/leads/lead-columns';
import {maskedPhones} from '@/lib/leads/lead-phone';

export function LeadImportWizard({history}:{history:LeadImportBatchRow[]}){
  const t=useTranslations('leads'),ti=useTranslations('leads.import');
  const router=useRouter();
  const formRef=useRef<HTMLFormElement>(null);
  const [state,setState]=useState<LeadImportState>(emptyLeadImportState());
  const [decisions,setDecisions]=useState<LeadImportDecision>({mapping:{},accept:{},skip:{}});
  const [undoReason,setUndoReason]=useState('');
  const [pending,start]=useTransition();

  const submit=(action:typeof previewVisitorImport,extra:(form:FormData)=>void)=>{
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
  const setSkip=(key:string,skipped:boolean)=>setDecisions(old=>{const skip={...old.skip};if(skipped)skip[key]=true;else delete skip[key];return {...old,skip}});

  const preview=state.preview;
  // The preview on screen was computed before the owner answered anything, so the decisions still
  // open are counted here, off the rows and the answers beside them; the commit re-checks server-side.
  const undecided=preview?preview.rows.filter(row=>row.dateSuggested&&!decisions.accept[row.key]).length:0;
  const latest=history.find(batch=>!batch.undoneAt);

  return <section className="admin-panel">
    <div className="admin-panel-head"><h2>{ti('title')}</h2></div>
    <div className="admin-panel-body">
      <p>{ti('desc')}</p>
      <p className="admin-help">{ti('fileHint')}</p>
      <form ref={formRef} onSubmit={event=>event.preventDefault()}>
        <label className="admin-field"><span>{ti('fileLabel')}</span>
          <input type="file" name="file" accept=".xlsx,.xlsm,.csv,.txt" onChange={()=>setState(old=>({...old,result:null,undone:null,errorKey:null}))}/>
        </label>
        <div className="admin-row">
          <button type="button" className="admin-btn" disabled={pending} onClick={()=>submit(previewVisitorImport,form=>form.set('decisions','{}'))}>{pending?ti('reading'):ti('previewButton')}</button>
          {preview&&<button type="button" className="admin-btn primary" disabled={pending||!!undecided} onClick={()=>submit(commitVisitorImport,form=>{form.set('decisions',JSON.stringify(decisions));form.set('hash',preview.hash)})}>{pending?ti('committing'):ti('commitButton')}</button>}
        </div>
      </form>

      {state.errorKey&&<p role="alert" className="admin-feedback error">{t(state.errorKey,state.errorParams)}</p>}
      {state.result&&<p role="status" className="admin-feedback ok">{ti('resultHead')} — {ti('resultLine',{batch:state.result.batch,created:String(state.result.created),matched:String(state.result.matched),skipped:String(state.result.skipped),blocked:String(state.result.blocked),siblings:String(state.result.siblings)})}</p>}
      {state.undone&&<p role="status" className="admin-feedback ok">{ti('undoneLine',{batch:state.undone.batch,removed:String(state.undone.removed)})}</p>}

      {preview&&<>
        <p className="admin-help">{ti('countsLine',{total:String(preview.counts.total),ready:String(preview.counts.ready),decide:String(preview.counts.decide),blocked:String(preview.counts.blocked),matched:String(preview.counts.matched),skipped:String(preview.counts.skipped),siblings:String(preview.counts.siblings)})}</p>
        {preview.previousBatch&&<p role="status" className="admin-help">{ti('previousBatch',{batch:preview.previousBatch})}</p>}
        {preview.columns.some(col=>col.questionKey)&&<div className="admin-subpanel">
          <h3>{ti('unmappedHead')}</h3>
          <p className="admin-help">{ti('unmappedHelp')}</p>
          {preview.columns.filter(col=>col.questionKey).map(col=>
            <label className="admin-field" key={col.key}><span>{t(col.questionKey as string,col.questionParams)}</span>
              <select value={decisions.mapping[col.key]||''} onChange={event=>setMapping(col.key,event.target.value)}>
                <option value="">{col.header||'—'}</option>
                <option value="ignore">{ti('mapIgnore')}</option>
                {LEAD_SHEET_FIELDS.map(field=><option key={field} value={field}>{t(LEAD_SHEET_FIELD_LABEL_KEYS[field])}</option>)}
              </select>
            </label>)}
        </div>}
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>{ti('colRow')}</th><th>{ti('colName')}</th><th>{ti('colDate')}</th><th>{ti('colContact')}</th><th>{ti('colClass')}</th><th>{ti('colStatus')}</th><th>{ti('colSkip')}</th></tr></thead>
          <tbody>{preview.rows.map(row=><WizardRow key={row.key} row={row} decisions={decisions} setAccept={setAccept} setSkip={setSkip}/>)}
          </tbody>
        </table></div>
      </>}

      <div className="admin-subpanel">
        <h3>{ti('historyHead')}</h3>
        {!history.length&&<p className="admin-help">{ti('noBatches')}</p>}
        {history.map(batch=><div key={batch.batch}>
          <p>{ti('batchLine',{batch:batch.batch,fileLabel:batch.fileLabel,rows:String(batch.rows),created:String(batch.created),actor:batch.actorName})}{batch.undoneAt?` — ${ti('batchUndone',{reason:batch.undoReason})}`:''}</p>
        </div>)}
        {latest&&<div className="admin-row">
          <label className="admin-field"><span>{ti('undoReasonLabel')}</span>
            <input value={undoReason} onChange={event=>setUndoReason(event.target.value)} maxLength={300}/>
          </label>
          <button type="button" className="admin-btn danger" disabled={pending} onClick={()=>submit(undoVisitorImport,form=>{form.set('batch',latest.batch);form.set('reason',undoReason)})}>{ti('undoButton')}</button>
        </div>}
        {latest&&<p className="admin-help">{ti('undoNote')}</p>}
      </div>
    </div>
  </section>;
}

function WizardRow({row,decisions,setAccept,setSkip}:{
  row:LeadImportRow;decisions:LeadImportDecision;
  setAccept:(key:string,value:'accept'|'keep')=>void;setSkip:(key:string,skipped:boolean)=>void;
}){
  const ti=useTranslations('leads.import'),t=useTranslations('leads');
  const choice=decisions.accept[row.key]||'';
  return <tr data-status={row.status}>
    <td>{row.sheet} · {row.row}</td>
    <td>{row.name||'—'}</td>
    <td>{row.dateRaw||'—'}{row.dateDay?` → ${row.dateDay}`:''}
      {row.dateSuggested&&<span className="admin-field-inline">
        <label><input type="radio" name={`accept-${row.key}`} checked={choice==='accept'} onChange={()=>setAccept(row.key,'accept')}/>{ti('decideAccept',{suggested:row.dateSuggested})}</label>
        <label><input type="radio" name={`accept-${row.key}`} checked={choice==='keep'} onChange={()=>setAccept(row.key,'keep')}/>{ti('decideKeep')}</label>
      </span>}
    </td>
    <td>{maskedPhones(row.phones.map(phone=>phone.normalized))||'—'}</td>
    <td>{row.classLabel||'—'}{row.classGroup?` · ${row.classGroup}`:''}{row.newSession?' *':''}</td>
    <td>{t(row.statusKey,row.statusParams)}
      {row.matchedLabel?` — ${ti('matchedNote',{lead:row.matchedLabel})}`:''}
      {row.flags.length>0&&<ul className="admin-flag-list">{row.flags.map((flag,index)=><li key={index}>{t(flag.messageKey,flag.messageParams)}</li>)}</ul>}
    </td>
    <td><input type="checkbox" aria-label={ti('skipLabel')} checked={!!decisions.skip[row.key]} onChange={event=>setSkip(row.key,event.target.checked)}/></td>
  </tr>;
}
