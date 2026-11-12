'use client';
import {useEffect,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {bulkDeleteItems,bulkRestoreItems} from '@/actions/recycle';
import {ActionFeedback} from './action-feedback';
import {formatNumber,type Digits} from '@/lib/admin/format';
import type {ActionState} from '@/actions/admin';
import type {RecycleKind} from '@/lib/admin/recycle-kinds';

const idle:ActionState={status:'idle'};

/**
 * Bulk select + delete (R1 §E4). Rows on the server-rendered list carry
 * `<input type="checkbox" name="ids" data-kind={kind} value={id}>`; this bar counts the selection,
 * deletes it, and offers a 10-second Undo that restores exactly the rows it just binned.
 */
export function BulkDeleteBar({kind,digits='bn',canDelete=true}:{kind:RecycleKind;digits?:Digits;canDelete?:boolean}){
  const t=useTranslations('adminWork'),router=useRouter(),[pending,start]=useTransition();
  const [count,setCount]=useState(0);
  const [phase,setPhase]=useState<{action:'delete'|'restore';state:ActionState;ids:string[]}|null>(null);
  const selected=()=>Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="ids"][data-kind="${kind}"]:checked`)).map(box=>box.value);
  useEffect(()=>{
    const sync=()=>setCount(selected().length);
    sync();
    document.addEventListener('change',sync);
    return ()=>document.removeEventListener('change',sync);
  });
  const run=(action:'delete'|'restore')=>start(async()=>{
    const ids=selected().length?selected():phase?.ids??[];
    if(!ids.length)return;
    const data=new FormData();
    data.set('kind',kind);
    for(const id of ids)data.append('ids',id);
    const result=action==='delete'?await bulkDeleteItems(idle,data):await bulkRestoreItems(idle,data);
    setPhase({action,state:result,ids});
    if(result.status!=='error')router.refresh();
  });
  const state=phase?.state??idle;
  const blocked=state.status==='ok'?state.message:'';
  const success=phase?.action==='restore'?t('restoredBin'):blocked?`${t('movedBin')} ${blocked}`:t('movedBin');
  return <div className="admin-bulk-bar">
    <span className="admin-help">{t('bulkSelected',{count:formatNumber(count,digits)})}</span>
    <button type="button" className="admin-mini-button admin-danger-text" disabled={!canDelete||pending||!count} onClick={()=>run('delete')}>{t('bulkDelete')}</button>
    {phase&&<ActionFeedback state={state} success={success} error={t('deleteFailed')} conflict={state.status==='conflict'?state.message:undefined}
      actions={phase.action==='delete'&&state.status!=='error'?[{label:t('undoDelete'),run:()=>run('restore')}]:[]}/>}
  </div>;
}

/** Header checkbox that selects or clears every row checkbox of one bulk bar. */
export function BulkSelectAll({kind,label}:{kind:RecycleKind;label:string}){
  const boxes=()=>Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="ids"][data-kind="${kind}"]`));
  return <input type="checkbox" className="admin-checkbox" aria-label={label}
    onChange={event=>{for(const box of boxes())box.checked=event.target.checked;document.dispatchEvent(new Event('change'))}}/>;
}
