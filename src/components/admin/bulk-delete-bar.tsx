'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {bulkDeleteItems,bulkRestoreItems} from '@/actions/recycle';
import {showRecycleToast} from './recycle-toast-host';
import {formatNumber,type Digits} from '@/lib/admin/format';
import type {ActionState} from '@/actions/admin';
import type {RecycleKind} from '@/lib/admin/recycle-kinds';

const idle:ActionState={status:'idle'};

/**
 * Bulk select + delete (R1 §E4). Rows on the server-rendered list carry
 * `<input type="checkbox" name="ids" data-kind={kind} value={id}>`; this bar counts the selection,
 * deletes it, and offers a 10-second Undo that restores exactly the rows it just binned — the ids
 * are captured at submit time, so the Undo still works after the selected rows are gone.
 */
export function BulkDeleteBar({kind,digits='bn',canDelete=true}:{kind:RecycleKind;digits?:Digits;canDelete?:boolean}){
  const t=useTranslations('adminWork'),router=useRouter();
  const [count,setCount]=useState(0),[pending,setPending]=useState(false);
  const selected=()=>Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="ids"][data-kind="${kind}"]:checked`)).map(box=>box.value);
  useEffect(()=>{
    const sync=()=>setCount(selected().length);
    sync();
    document.addEventListener('change',sync);
    return ()=>document.removeEventListener('change',sync);
  });
  async function remove():Promise<void>{
    const ids=selected();
    if(!ids.length)return;
    setPending(true);
    try{
      const data=new FormData();
      data.set('kind',kind);
      for(const id of ids)data.append('ids',id);
      const result=await bulkDeleteItems(idle,data);
      const blocked=result.status==='ok'?result.message:'';
      showRecycleToast({
        state:result,
        success:blocked?`${t('movedBin')} ${blocked}`:t('movedBin'),
        error:t('deleteFailed'),
        conflict:result.status==='conflict'?result.message:undefined,
        actions:result.status==='error'?[]:[{label:t('undoDelete'),run:()=>void restore(ids)}],
      });
      if(result.status!=='error')router.refresh();
    }finally{setPending(false)}
  }
  async function restore(ids:string[]):Promise<void>{
    setPending(true);
    try{
      const data=new FormData();
      data.set('kind',kind);
      for(const id of ids)data.append('ids',id);
      const result=await bulkRestoreItems(idle,data);
      showRecycleToast({state:result,success:t('restoredBin'),error:t('deleteFailed')});
      if(result.status!=='error')router.refresh();
    }finally{setPending(false)}
  }
  return <div className="admin-bulk-bar">
    <span className="admin-help">{t('bulkSelected',{count:formatNumber(count,digits)})}</span>
    <button type="button" className="admin-mini-button admin-danger-text" disabled={!canDelete||pending||!count} onClick={()=>void remove()}>{t('bulkDelete')}</button>
  </div>;
}

/** Header checkbox that selects or clears every row checkbox of one bulk bar. */
export function BulkSelectAll({kind,label}:{kind:RecycleKind;label:string}){
  const boxes=()=>Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="ids"][data-kind="${kind}"]`));
  return <input type="checkbox" className="admin-checkbox" aria-label={label}
    onChange={event=>{for(const box of boxes())box.checked=event.target.checked;document.dispatchEvent(new Event('change'))}}/>;
}
