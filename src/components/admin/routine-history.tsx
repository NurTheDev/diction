'use client';
/**
 * R9 · Slice 2 · what a day remembers, and the tap that puts it back.
 *
 * One drawer, shared by a day of the master week and by a date's working sheet, because both keep the
 * same thing: the last twenty changes, newest first, each with the person who made it, the wall clock in
 * Asia/Dhaka, and one sentence composed from a catalog code — so the same entry reads in Bangla on a
 * Bangla screen and in English on an English one, in the reader's own digits.
 *
 * "Restore this version" is a write like any other here: it follows the rule that nothing is locked and
 * a clash only warns, so a version that would double-book a teacher comes back with the banner naming
 * who and where, and a button beside it that restores anyway.
 */
import {useActionState,useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {useLocale,useTranslations} from 'next-intl';
import {RoutineDrawer,useClashSentence} from './routine-drawer';
import {restoreHistoryAction,type RoutineActionState} from '@/actions/routine';
import type {HistoryView} from '@/lib/routine/history';
import {clockWord,rangeWord} from '@/lib/routine/time';
import {asciiDigits,formatDate,formatNumber,type Digits} from '@/lib/admin/format';

const idle:RoutineActionState={status:'idle'};

/** The codes this screen knows a sentence for. Anything else falls back to "a change was written". */
const CODES=new Set(['periodSave','periodMove','periodDelete','periodRestore','daySave','dayMove',
  'dayDuplicate','dailySave','dailyReset','bulkShift','bulkFields','replaceTeacher','restored']);

/** One entry's wall clock, read in Asia/Dhaka and written in the reader's own digits. */
export function historyWhen(iso:string,digits:Digits,language:'bn'|'en'):string{
  const at=new Date(iso);
  if(Number.isNaN(at.getTime()))return '';
  const time=new Intl.DateTimeFormat(language==='bn'?'bn-BD':'en-GB',
    {hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Dhaka'}).format(at);
  return `${formatDate(at,digits,language)} · ${clockWord(asciiDigits(time),digits)}`;
}

/**
 * One entry as a sentence. The parameters are the day's own data — a time, a count, a shift, the two
 * teachers a replacement named — and the sentence around them is the catalog's.
 */
export function useHistorySentence(){
  const t=useTranslations('routine');
  return (view:HistoryView,digits:Digits,weekdays:string[]):string=>{
    const code=CODES.has(view.code)?view.code:'unknown';
    const params:Record<string,string|number>={};
    for(const [key,value] of Object.entries(view.params)){
      params[key]=typeof value==='number'?formatNumber(value,digits):String(value);
    }
    /* A period's own line is its time and its subject, composed here so the digits are the reader's. */
    if(params.start&&params.end){
      params.detail=`${rangeWord(String(params.start),String(params.end),digits)}`
        +(params.subject?` ${params.subject}`:'');
    }
    /* A day operation carries a weekday number; a replacement carries two people's names. Only the
       weekday is a word the screen owns. */
    if(code==='dayMove'&&weekdays[Number(view.params.to)])params.to=weekdays[Number(view.params.to)];
    if(code==='dayDuplicate'&&weekdays[Number(view.params.from)])params.from=weekdays[Number(view.params.from)];
    return t(`history.code.${code}`,params);
  };
}

/** One "restore this version" tap, with the warning it may answer with and the button that writes anyway. */
function RestoreControl({kind,docId,entry,digits,onDone}:{
  kind:'master'|'daily';docId:string;entry:HistoryView;digits:Digits;onDone?:()=>void;
}){
  const t=useTranslations('routine'),router=useRouter();
  const sentence=useClashSentence();
  const locale=useLocale()==='en'?'en':'bn';
  const [state,action,pending]=useActionState(restoreHistoryAction,idle);
  useEffect(()=>{
    if(state.status!=='ok')return;
    router.refresh();
    onDone?.();
  },[state]);
  return <form action={action} className="routine-history-restore" data-history-form={entry.id}
    onReset={event=>event.preventDefault()}>
    <input type="hidden" name="kind" value={kind}/>
    <input type="hidden" name="id" value={docId}/>
    <input type="hidden" name="entryId" value={entry.id}/>
    {state.status==='clash'&&<div className="routine-warn" role="alert" data-history-clash={entry.id}>
      <strong>{t('clashes.banner')}</strong>
      <p className="admin-help">{t('clashes.bannerHelp')}</p>
      <ul>{(state.clashes||[]).map((clash,index)=>
        <li key={`${clash.kind}${clash.otherStart}${index}`} data-clash-line={clash.kind}>
          {sentence(clash,digits)}</li>)}</ul>
    </div>}
    <div className="routine-form-actions">
      <button type="submit" className="admin-mini-button" disabled={pending}
        data-history-restore={entry.id}>{t('history.restore')}</button>
      {state.status==='clash'&&<button type="submit" name="force" value="on" disabled={pending}
        className="button routine-save-anyway" data-history-force={entry.id}>{t('history.anyway')}</button>}
    </div>
    {state.status==='ok'&&<p className="admin-feedback ok" data-history-done={entry.id}>
      {t('history.restored')}</p>}
    {(state.status==='invalid'||state.status==='missing'||state.status==='error')&&
      <p role="alert" className="admin-feedback error" data-history-refused={entry.id}>
        {state.status==='missing'?t('common.missing'):t('common.failed')}</p>}
  </form>;
}

export interface RoutineHistoryProps{
  open:boolean;
  onClose:()=>void;
  kind:'master'|'daily';
  /** The day's own document id — empty until the day has been written, and then there is no history. */
  docId:string;
  entries:HistoryView[];
  /** The seven weekday names, in the screen's own language, starting on Sunday. */
  weekdays:string[];
  digits:Digits;
  canEdit:boolean;
}

/** The day's memory, as a drawer: newest first, and a restore beside every version. */
export function RoutineHistory({open,onClose,kind,docId,entries,weekdays,digits,canEdit}:RoutineHistoryProps){
  const t=useTranslations('routine');
  const sentence=useHistorySentence();
  const language=useLocale()==='en'?'en':'bn';
  return <RoutineDrawer open={open} onClose={onClose} title={t('history.title')}>
    <p className="admin-help" data-history-help>{t('history.help')}</p>
    {entries.length===0
      ? <p className="admin-help" data-history-empty>{t('history.empty')}</p>
      : <>
        <p className="admin-help" data-history-count>
          {t('history.count',{count:formatNumber(entries.length,digits)})}</p>
        <ol className="routine-history" data-history-list>
          {entries.map(entry=><li className="routine-history-entry" key={entry.id} data-history-entry={entry.id}>
            <span className="routine-history-when" data-history-when>
              {historyWhen(entry.at,digits,language)}</span>
            <span className="routine-history-line" data-history-line>{sentence(entry,digits,weekdays)}</span>
            {entry.byName&&<span className="admin-help" data-history-by>{entry.byName}</span>}
            {canEdit&&docId&&<RestoreControl kind={kind} docId={docId} entry={entry} digits={digits}/>}
          </li>)}
        </ol>
      </>}
  </RoutineDrawer>;
}
