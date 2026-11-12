'use client';
import {useId,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {restoreBinItem,purgeForeverItem} from '@/actions/recycle';
import {showRecycleToast} from './recycle-toast-host';
import type {ActionState} from '@/actions/admin';
import type {RecycleKind} from '@/lib/admin/recycle-kinds';

const idle:ActionState={status:'idle'};

/**
 * Recycle Bin row actions (R1 §E4): Restore for staff and above, Delete forever for Super Admin
 * only, and the forever dialog requires the item's exact name to be typed before it will run. The
 * toast is raised on the layout host because the row disappears as soon as the action succeeds.
 */
export function BinRow({kind,id,name,canRestore=true,canPurge=false}:{kind:RecycleKind;id:string;name:string;canRestore?:boolean;canPurge?:boolean}){
  const dialogId=useId(),t=useTranslations('recycleBin'),router=useRouter();
  const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),typed=useRef<HTMLInputElement>(null);
  const [pending,setPending]=useState(false);
  async function run(action:'restore'|'purge'):Promise<void>{
    setPending(true);
    try{
      const data=new FormData();data.set('kind',kind);data.set('id',id);
      if(action==='purge')data.set('confirmName',typed.current?.value??'');
      const result=await (action==='restore'?restoreBinItem(idle,data):purgeForeverItem(idle,data));
      showRecycleToast({
        state:result,
        success:action==='restore'?t('restored'):t('purged'),
        error:t('failed'),
        conflict:action==='purge'&&result.status==='conflict'?t('nameMismatch'):undefined,
      });
      if(result.status!=='error')router.refresh();
      else if(action==='purge'&&typed.current)typed.current.select();
    }finally{setPending(false)}
  }
  return <div className="admin-bin-actions">
    {canRestore&&<button type="button" className="admin-mini-button" disabled={pending} onClick={()=>void run('restore')}>{t('restore')}</button>}
    {canPurge&&<button ref={trigger} type="button" className="admin-mini-button admin-danger-text" disabled={pending} onClick={()=>{if(typed.current)typed.current.value='';dialog.current?.showModal()}}>{t('forever')}</button>}
    {canPurge&&<dialog ref={dialog} className="admin-confirm" aria-labelledby={dialogId} onClose={()=>trigger.current?.focus()}>
      <h2 id={dialogId}>{t('foreverTitle',{name})}</h2>
      <p>{t('foreverBody')}</p>
      <label><span className="admin-help">{t('foreverHint',{name})}</span>
        <input ref={typed} className="admin-input" name="confirmName" autoComplete="off" aria-label={t('foreverHint',{name})}/>
      </label>
      <div className="admin-confirm-actions">
        <button type="button" className="admin-mini-button" onClick={()=>dialog.current?.close()}>{t('cancel')}</button>
        <button type="button" className="button admin-danger" disabled={pending} onClick={()=>{dialog.current?.close();void run('purge')}}>{t('forever')}</button>
      </div>
    </dialog>}
  </div>;
}
