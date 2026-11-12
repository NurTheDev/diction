'use client';
import {useId,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {softDeleteItem,restoreBinItem,archiveItem} from '@/actions/recycle';
import {showRecycleToast} from './recycle-toast-host';
import type {FeedbackAction} from './action-feedback';
import type {ActionState} from '@/actions/admin';
import {canArchiveKind,type RecycleKind} from '@/lib/admin/recycle-kinds';

const idle:ActionState={status:'idle'};
function payload(kind:RecycleKind,id:string):FormData{const data=new FormData();data.set('kind',kind);data.set('id',id);return data}

/**
 * Row-level Delete (R1 §E4). The dialog names the item and states the real consequence — 30 days in
 * the Recycle Bin — never "cannot be brought back". Afterwards a 10-second toast offers Undo, and if
 * the engine blocked the delete because other records reference it, the toast shows that message
 * with the counts plus an Archive button, which is the staff floor. The toast is raised on the
 * layout-level host, so it survives the row disappearing.
 */
export function DeleteRow({kind,id,name,canDelete=true,canArchive=true,onDone}:{kind:RecycleKind;id:string;name:string;canDelete?:boolean;canArchive?:boolean;onDone?:()=>void}){
  const dialogId=useId(),t=useTranslations('adminWork'),router=useRouter();
  const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const [pending,setPending]=useState(false);
  const archivable=canArchive&&canArchiveKind(kind);
  const finish=()=>{router.refresh();onDone?.()};
  async function run(work:()=>Promise<ActionState>,success:string,conflict?:string,actions?:FeedbackAction[]):Promise<void>{
    setPending(true);
    try{
      const result=await work();
      showRecycleToast({state:result,success,error:t('deleteFailed'),conflict:conflict??result.message,actions:actions??[]});
      if(result.status!=='error')finish();
    }finally{setPending(false)}
  }
  const restore=()=>run(()=>restoreBinItem(idle,payload(kind,id)),t('restoredBin'));
  const archive=()=>run(()=>archiveItem(idle,payload(kind,id)),t('archived'));
  const remove=async():Promise<void>=>{
    setPending(true);
    try{
      const result=await softDeleteItem(idle,payload(kind,id));
      const actions:FeedbackAction[]=result.status==='ok'
        ? [{label:t('undoDelete'),run:()=>void restore()}]
        : result.status==='conflict'&&archivable?[{label:t('archive'),run:()=>void archive()}]:[];
      showRecycleToast({state:result,success:t('movedBin'),error:t('deleteFailed'),conflict:result.message,actions});
      if(result.status!=='error')finish();
    }finally{setPending(false)}
  };
  return <>
    <button ref={trigger} type="button" className="admin-mini-button admin-danger-text" disabled={!canDelete||pending} onClick={()=>dialog.current?.showModal()}>{t('deleteAction')}</button>
    <dialog ref={dialog} className="admin-confirm" aria-labelledby={dialogId} onClose={()=>trigger.current?.focus()}>
      <h2 id={dialogId}>{t('deleteNamed',{name})}</h2>
      <p>{t('softBody')}</p>
      <div className="admin-confirm-actions">
        <button type="button" className="admin-mini-button" onClick={()=>dialog.current?.close()}>{t('deleteNo')}</button>
        <button type="button" className="button admin-danger" disabled={pending} onClick={()=>{dialog.current?.close();void remove()}}>{t('deleteYes')}</button>
      </div>
    </dialog>
  </>;
}
