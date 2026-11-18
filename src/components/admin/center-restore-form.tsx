'use client';
/**
 * The removed list's own restore door.
 *
 * S2 · F-12: a removal is filed against the class the student was on, and that class is not guaranteed to
 * still be running — a term ends, a class is closed, a class is filed in the Recycle Bin. Restoring such a
 * student onto the class they left seats them on a roll nobody opens and bills them on a class the centre
 * has stopped counting, so this door asks which running class they come back to and the write carries the
 * move with it: one restore, one timeline line, the same planner the move door uses.
 *
 * The month and the reason are state rather than fields the browser holds, for the reason every refusable
 * door in this app has one: a refusal re-renders the form, and a form that comes back empty is a refusal
 * that costs the operator everything they typed.
 */
import {useActionState,useState} from 'react';
import {useTranslations} from 'next-intl';
import {restoreCenterStudent,type CenterActionState} from '@/actions/center-students';
import {MonthField} from './month-popover';
import {toastOnWrite} from './recycle-toast-host';
import type {ClassChoice} from './center-forms';
import type {Digits} from '@/lib/admin/format';

const restoreWrite=toastOnWrite<CenterActionState,CenterActionState>(restoreCenterStudent);
const idle:CenterActionState={status:'idle'};

export function CenterRestoreForm({id,digits,language,classActive,classes}:{
  id:string;digits:Digits;language:'bn'|'en';
  /** Whether the class this student was removed from is one the centre is still running. */
  classActive:boolean;
  /** The classes that are running, offered when the one they left is not. */
  classes:ClassChoice[];
}){
  const t=useTranslations('center');
  const [state,action,pending]=useActionState(restoreWrite,idle);
  const [resume,setResume]=useState('');
  const [reason,setReason]=useState('');
  const [picked,setPicked]=useState('');
  const needsClass=!classActive;
  return <form className="admin-edit" action={action} data-restore-form={id}>
    <input type="hidden" name="id" value={id}/>
    <label>{t('restore.resumeLabel')}
      <MonthField name="resume" value="" placeholder={t('row.pickMonth')} clearLabel={t('row.clear')}
        digits={digits} language={language} onChange={setResume}/></label>
    {needsClass&&<label data-restore-class-label>{t('restore.classLabel')}
      <span className="admin-help" data-restore-class-note>{t('restore.classNote')}</span>
      {classes.length===0
        ? <span className="admin-help" data-restore-class-none>{t('restore.classNone')}</span>
        : <select className="admin-select" name="classGroup" data-restore-class required
            value={picked} onChange={event=>setPicked(event.target.value)}>
            <option value="" disabled>{t('classRequired')}</option>
            {classes.map(choice=><option key={choice.id} value={choice.id}
              data-restore-class-option={choice.id}>{choice.name}</option>)}
          </select>}</label>}
    <label>{t('restore.reasonLabel')}
      <input className="admin-input" name="reason" minLength={3} maxLength={500} required
        value={reason} onChange={event=>setReason(event.target.value)}/></label>
    <button className="admin-mini-button" data-restore-submit
      disabled={pending||!resume||(needsClass&&classes.length>0&&!picked)}>{t('restore.submit')}</button>
    {state.status!=='idle'&&<p role={state.status==='ok'?'status':'alert'} data-restore-answer={state.status==='ok'?'yes':'no'}>
      {state.status==='ok'?String(state.message||t('restore.ok'))
        :String(state.message||(state.status==='duplicate'?t('restore.duplicate'):t('restore.failed')))}</p>}
  </form>;
}
