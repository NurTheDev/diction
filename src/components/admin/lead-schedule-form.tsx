'use client';
/**
 * The "schedule a message" form on the Visitors schedule screen.
 *
 * The form is a keyboard, not a gate: the server action re-reads the day, the template, the class and
 * every recipient before it writes anything. What this component adds is honesty about what the
 * operator is choosing:
 *
 *   • the count beside a class is the number of visitors that class would actually reach — closed
 *     leads and "do not contact" are already left out, so "Class Nine (42)" is a promise, not a total;
 *   • a template's body is shown, never hidden behind a dropdown, because the sentence that will go
 *     out is the thing being approved;
 *   • the send window is said out loud (07:05 on the chosen day). A date is what the operator picks;
 *     a fake time-of-day picker would promise precision the daily job cannot keep.
 */
import {useActionState,useEffect,useMemo,useRef,useState} from 'react';
import {useTranslations} from 'next-intl';
import {CalendarClock,Send} from 'lucide-react';
import {createLeadScheduleAction,cancelLeadScheduleAction} from '@/actions/lead-schedules';
import {formatClass,formatNumber,type Digits} from '@/lib/admin/format';
import {renderSmsTemplate} from '@/lib/center/sms-templates';
import type {ActionState} from '@/actions/admin';

export interface ScheduleTemplate{key:string;name:string;body:string}
export interface ScheduleClassCount{value:string;count:number}

export function LeadScheduleForm({
  templates,classCounts,today,language,digits,institutePhone,
}:{
  templates:ScheduleTemplate[];classCounts:ScheduleClassCount[];today:string;
  language:'bn'|'en';digits:Digits;institutePhone:string;
}){
  const t=useTranslations('leads');
  const [state,action,pending]=useActionState(createLeadScheduleAction,{status:'idle'} as ActionState);
  const fallback=templates.some(item=>item.key==='visitor_thanks')?'visitor_thanks':templates[0]?.key||'custom';
  const [templateKey,setTemplateKey]=useState(fallback);
  const [classGroup,setClassGroup]=useState('');
  const [text,setText]=useState('');
  const [subject,setSubject]=useState('');
  const formRef=useRef<HTMLFormElement>(null);
  /* A written schedule clears the form. Without this, the same message stays on screen and a second
     click — or a double-click the disabled button did not catch — would write a second schedule with
     its own request id, which is two sends, not one. */
  useEffect(()=>{
    if(state.status!=='ok')return;
    setTemplateKey(fallback);setClassGroup('');setText('');setSubject('');
    formRef.current?.reset();
  },[state,fallback]);
  const chosen=templates.find(item=>item.key===templateKey);
  const custom=templateKey==='custom';
  const rawBody=custom?text:chosen?.body||'';
  /* The preview is the sentence, not the template: the centre's number and the typed subject are
     filled in, so the operator approves what will actually arrive. */
  const preview=renderSmsTemplate(rawBody,{institute_phone:institutePhone,subject});
  const needsSubject=rawBody.includes('{subject}');
  const eligible=useMemo(()=>classCounts.find(item=>item.value===classGroup)?.count||0,[classCounts,classGroup]);
  const selectedClass=classGroup?formatClass(Number(classGroup),digits,language,t('colClass')):t('schedules.everyClass');

  return <form ref={formRef} action={action} className="lead-edit-form lead-schedule-form" data-lead-schedule-form="">
    <div className="lead-edit-grid">
      <label>{t('schedules.name')}
        <input className="admin-input" name="title" maxLength={120} placeholder={t('schedules.namePlaceholder')}/>
      </label>
      <label>{t('schedules.day')}
        <input className="admin-input" type="date" name="day" required min={today} defaultValue={today}/>
        <span className="admin-help">{t('schedules.dayHelp')}</span>
      </label>
      <label>{t('schedules.audience')}
        <select className="admin-select" name="classGroup" value={classGroup} onChange={event=>setClassGroup(event.target.value)}>
          {classCounts.map(item=><option key={item.value||'all'} value={item.value}>
            {item.value?formatClass(Number(item.value),digits,language,t('colClass')):t('schedules.everyClass')}
            {' · '}{formatNumber(item.count,digits)}
          </option>)}
        </select>
        <span className="admin-help" data-schedule-eligible="">{t('schedules.eligible',{count:formatNumber(eligible,digits),class:selectedClass})}</span>
      </label>
      <label>{t('schedules.template')}
        <select className="admin-select" name="templateKey" value={templateKey} onChange={event=>setTemplateKey(event.target.value)}>
          {templates.map(item=><option key={item.key} value={item.key}>{item.name}</option>)}
          <option value="custom">{t('schedules.custom')}</option>
        </select>
      </label>
    </div>

    {custom&&<label>{t('schedules.message')}
      <textarea className="admin-input lead-schedule-text" name="text" required maxLength={600} rows={5}
        value={text} onChange={event=>setText(event.target.value)}
        placeholder={t('schedules.messagePlaceholder')}/>
      <span className="admin-help">{t('schedules.messageHelp')}</span>
    </label>}

    {preview.trim()&&<div className="lead-schedule-preview">
      <span className="admin-help">{t('schedules.preview')}</span>
      <p data-schedule-preview="">{preview}</p>
    </div>}

    {needsSubject&&<label>{t('schedules.subject')}
      <input className="admin-input" name="subject" maxLength={120} required value={subject}
        onChange={event=>setSubject(event.target.value)} placeholder={t('schedules.subjectPlaceholder')}/>
      <span className="admin-help">{t('schedules.subjectHelp')}</span>
    </label>}

    <p className="admin-help lead-schedule-window">
      <CalendarClock size={15} aria-hidden="true"/> {t('schedules.window')}
    </p>

    {state.status==='ok'&&<p className="admin-feedback success" role="status">{state.message}</p>}
    {state.status==='error'&&<p className="admin-feedback error" role="alert">{state.message||t('schedules.errors.didNotGoThrough')}</p>}

    <div className="lead-edit-foot">
      <button type="submit" className="button button-navy" disabled={pending||!eligible} data-schedule-save="">
        <Send size={15} aria-hidden="true"/> {pending?t('schedules.saving'):t('schedules.save')}
      </button>
      {!eligible&&<span className="admin-help">{t('schedules.errors.noRecipients')}</span>}
    </div>
  </form>;
}

/** One row's Cancel button. The confirm is native and says exactly what is being stopped. */
export function LeadScheduleCancel({id}:{id:string}){
  const t=useTranslations('leads');
  const [state,action,pending]=useActionState(cancelLeadScheduleAction,{status:'idle'} as ActionState);
  return <form action={action} onSubmit={event=>{
    if(!window.confirm(t('schedules.cancelConfirm')))event.preventDefault();
  }}>
    <input type="hidden" name="id" value={id}/>
    <button type="submit" className="admin-mini-button" disabled={pending} data-schedule-cancel="">
      {pending?t('schedules.cancelling'):t('schedules.cancel')}
    </button>
    {state.status==='error'&&<span className="admin-help" role="alert">{state.message}</span>}
  </form>;
}
