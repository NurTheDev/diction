'use client';
import {useId,useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {softDeleteItem,restoreBinItem,archiveItem} from '@/actions/recycle';
import {ActionFeedback,type FeedbackAction} from './action-feedback';
import type {ActionState} from '@/actions/admin';
import {canArchiveKind,type RecycleKind} from '@/lib/admin/recycle-kinds';

const idle:ActionState={status:'idle'};
function payload(kind:RecycleKind,id:string):FormData{const data=new FormData();data.set('kind',kind);data.set('id',id);return data}

/**
 * Row-level Delete (R1 §E4). The ConfirmDialog names the item and states the real consequence —
 * 30 days in the Recycle Bin — never "cannot be brought back". Afterwards a 10-second toast offers
 * Undo (restore), and if the engine blocked the delete because other records reference it, the toast
 * shows that message with the counts plus an Archive button, which is the staff floor.
 */
export function DeleteRow({kind,id,name,canDelete=true,canArchive=true,onDone}:{kind:RecycleKind;id:string;name:string;canDelete?:boolean;canArchive?:boolean;onDone?:()=>void}){
  const archivable=canArchive&&canArchiveKind(kind);
  const dialogId=useId(),t=useTranslations('adminWork'),router=useRouter(),[pending,start]=useTransition();
  const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const [phase,setPhase]=useState<{action:'delete'|'restore'|'archive';state:ActionState}|null>(null);
  const call=(action:'delete'|'restore'|'archive',server:(last:ActionState,data:FormData)=>Promise<ActionState>)=>start(async()=>{
    const result=await server(idle,payload(kind,id));
    setPhase({action,state:result});
    if(result.status!=='error'){router.refresh();onDone?.()}
  });
  const actions:FeedbackAction[]=[];
  if(phase?.action==='delete'&&phase.state.status==='ok')actions.push({label:t('undoDelete'),run:()=>call('restore',restoreBinItem)});
  if(phase?.action==='delete'&&phase.state.status==='conflict'&&archivable)actions.push({label:t('archive'),run:()=>call('archive',archiveItem)});
  const success=phase?.action==='restore'?t('restoredBin'):phase?.action==='archive'?t('archived'):t('movedBin');
  return <>
    <button ref={trigger} type="button" className="admin-mini-button admin-danger-text" disabled={!canDelete||pending} onClick={()=>dialog.current?.showModal()}>{t('deleteAction')}</button>
    <dialog ref={dialog} className="admin-confirm" aria-labelledby={dialogId} onClose={()=>trigger.current?.focus()}>
      <h2 id={dialogId}>{t('deleteNamed',{name})}</h2>
      <p>{t('softBody')}</p>
      <div className="admin-confirm-actions">
        <button type="button" className="admin-mini-button" onClick={()=>dialog.current?.close()}>{t('deleteNo')}</button>
        <button type="button" className="button admin-danger" disabled={pending} onClick={()=>{dialog.current?.close();call('delete',softDeleteItem)}}>{t('deleteYes')}</button>
      </div>
    </dialog>
    {phase&&<ActionFeedback state={phase.state} success={success} error={t('deleteFailed')} conflict={phase.state.message} actions={actions}/>}
  </>;
}
