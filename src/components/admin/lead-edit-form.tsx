'use client';
/**
 * The Edit mode of the visitor drawer: every field the quick-add panel can write, prefilled with
 * what the row holds, one Save and one Cancel. The rule layer validates each field again
 * (`updateLeadBasics`), so this form is a keyboard, never a gate.
 */
import {useActionState,useEffect} from 'react';
import {useTranslations} from 'next-intl';
import {updateLeadBasicsAction} from '@/actions/leads';
import {showRecycleToast} from './recycle-toast-host';
import {
  LEAD_GROUP_OPTIONS,LEAD_MEDIUM_OPTIONS,LEAD_SHIFT_OPTIONS,LEAD_SOURCE_OPTIONS,LEAD_STATUS_OPTIONS,
  groupLabel,idleLeadForm,mediumLabel,shiftLabel,sourceLabel,statusLabel,type LeadRowView,
} from '@/lib/leads/lead-ui';
import {formatClass,type Digits} from '@/lib/admin/format';

export function LeadEditForm({row,fullPhone,language,digits,onDone}:{
  row:LeadRowView;fullPhone:string;language:'bn'|'en';digits:Digits;onDone:()=>void;
}){
  const t=useTranslations('leads');
  const [state,action,pending]=useActionState(updateLeadBasicsAction,idleLeadForm);
  useEffect(()=>{
    if(state.status==='ok'&&state.message){showRecycleToast({state:{status:'ok'},success:state.message,error:''});onDone()}
  },[state,onDone]);
  return <form action={action} className="lead-edit-form" data-lead-edit="">
    <input type="hidden" name="id" value={row.id}/>
    <label>{t('colVisitor')}<input className="admin-input" name="studentName" defaultValue={row.studentName} required maxLength={120}/></label>
    <label>{t('guardian')}<input className="admin-input" name="guardianName" defaultValue={row.guardianName} maxLength={120}/></label>
    <label>{t('row.phone')}<input className="admin-input" name="phone" defaultValue={fullPhone} inputMode="numeric" maxLength={11}/></label>
    <label>{t('colClass')}<input className="admin-input" name="classGroup" defaultValue={row.classGroup??''} inputMode="numeric" minLength={1} maxLength={2}/></label>
    <label>{t('school')}<input className="admin-input" name="school" defaultValue={row.school} maxLength={160}/></label>
    <label>{t('interested')}<input className="admin-input" name="interestedIn" defaultValue={row.interestedIn} maxLength={200}/></label>
    <div className="lead-edit-grid">
      <label>{t('colStatus')}<select className="admin-select" name="status" defaultValue={row.status}>
        {LEAD_STATUS_OPTIONS.map(option=><option key={option} value={option}>{statusLabel(t,option)}</option>)}</select></label>
      <label>{t('group')}<select className="admin-select" name="group" defaultValue={row.group}>
        {LEAD_GROUP_OPTIONS.map(option=><option key={option} value={option}>{groupLabel(t,option)}</option>)}</select></label>
      <label>{t('shift')}<select className="admin-select" name="shift" defaultValue={row.shift}>
        {LEAD_SHIFT_OPTIONS.map(option=><option key={option} value={option}>{shiftLabel(t,option)}</option>)}</select></label>
      <label>{t('medium')}<select className="admin-select" name="medium" defaultValue={row.medium}>
        {LEAD_MEDIUM_OPTIONS.map(option=><option key={option} value={option}>{mediumLabel(t,option)}</option>)}</select></label>
      <label>{t('source')}<select className="admin-select" name="source" defaultValue={row.source}>
        {LEAD_SOURCE_OPTIONS.map(option=><option key={option} value={option}>{sourceLabel(t,option)}</option>)}</select></label>
    </div>
    {state.status==='error'&&<p className="admin-feedback error" role="alert">{state.message}</p>}
    <div className="lead-edit-foot">
      <button type="submit" className="button button-navy" disabled={pending} data-lead-edit-save>{t('row.save')}</button>
      <button type="button" className="admin-mini-button" onClick={onDone} data-lead-edit-cancel>{t('row.cancel')}</button>
    </div>
  </form>;
}
