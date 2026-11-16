'use client';
import {useActionState,useEffect,useRef} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {removeCenterStudent,setStudentHold,type CenterActionState} from '@/actions/center-students';

const idle:CenterActionState={status:'idle'};

/** The profile header's Hold door: one tap lifts the student out of the monthly run, one tap back. */
export function StudentHoldButton({id,held}:{id:string;held:boolean}){
  const t=useTranslations('center'),[state,action,pending]=useActionState(setStudentHold,idle),router=useRouter();
  useEffect(()=>{if(state.status==='ok')router.refresh()},[state,router]);
  return <form action={action} className="admin-inline"><input type="hidden" name="id" value={id}/><input type="hidden" name="hold" value={held?'':'1'}/>
    <button type="submit" className="admin-mini-button" data-student-hold disabled={pending}>{held?t('unhold'):t('hold')}</button></form>;
}

/** The profile header's Remove door: a leave month and a reason, typed by a person, before anything moves. */
export function StudentRemoveButton({id}:{id:string}){
  const t=useTranslations('center'),dialog=useRef<HTMLDialogElement>(null),[state,action,pending]=useActionState(removeCenterStudent,idle),router=useRouter();
  useEffect(()=>{if(state.status==='ok'){dialog.current?.close();router.refresh()}},[state,router]);
  return <><button type="button" className="admin-mini-button" data-student-remove onClick={()=>dialog.current?.showModal()}>{t('remove')}</button>
    <dialog ref={dialog} className="admin-dialog" aria-label={t('remove')}><form action={action}>
      <h2>{t('remove')}</h2>
      <label>{t('removeLeave')}<input className="admin-input" type="month" name="leave" required/></label>
      <label>{t('removeReason')}<textarea className="admin-input" name="reason" required minLength={3} maxLength={500} rows={3}/></label>
      <input type="hidden" name="id" value={id}/>
      {state.status==='invalid'&&<p className="admin-feedback error">{t('removeInvalid')}</p>}
      <div className="overview-drawer-actions">
        <button type="submit" className="admin-mini-button" disabled={pending}>{t('remove')}</button>
        <button type="button" className="admin-mini-button" onClick={()=>dialog.current?.close()}>{t('back')}</button>
      </div>
    </form></dialog></>;
}
