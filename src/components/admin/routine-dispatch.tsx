'use client';
/**
 * R9 · Slice 2 · the day going out: one message for the class group, one per teacher, and the record that
 * it was sent.
 *
 * The messages themselves are written on the server, out of the sheet and out of the catalogs, so the text
 * here is already the text somebody will paste into WhatsApp — in the screen's own language and the
 * operator's own digits. This component's job is the three things a browser is for: put the text on the
 * clipboard, hand it to WhatsApp or Messenger, and write the sent marks so the sheet can say afterwards
 * whether it has changed since.
 *
 * Copying is honest: the button says "copied" only when a copy actually happened, through the async
 * clipboard or, where that is refused, through a selected textarea and the old command. Where neither
 * works the message stays on screen, selectable, and the button says the copy failed rather than lying.
 */
import {useActionState,useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {PrintButton} from './routine-tools';
import {showRecycleToast} from './recycle-toast-host';
import {markDispatchSentAction,type RoutineActionState} from '@/actions/routine';
import {formatDate,formatNumber,type Digits} from '@/lib/admin/format';
import type {Language} from '@/lib/routine/time';

const idle:RoutineActionState={status:'idle'};

/** One teacher's own message, with the two addresses that carry it. */
export interface DispatchTeacher{
  id:string;
  name:string;
  text:string;
  whatsapp:string;
  messenger:string;
}

export interface RoutineDispatchProps{
  classId:string;
  shift:string;
  date:string;
  className:string;
  /** The class group's message, and the two addresses that carry it. */
  classText:string;
  whatsapp:string;
  messenger:string;
  teachers:DispatchTeacher[];
  sent:boolean;
  sentAt:string|null;
  sentByName:string;
  /** The sheet has been edited since it went out, so the message below is not the one that was sent. */
  changedSinceSent:boolean;
  digits:Digits;
  language:Language;
  canEdit:boolean;
}

/** Put text on the clipboard, by whichever route this browser allows, and say which happened. */
async function copyText(text:string):Promise<boolean>{
  if(typeof navigator!=='undefined'&&navigator.clipboard?.writeText){
    try{
      await navigator.clipboard.writeText(text);
      return true;
    }catch{/* refused — the old route is next */}
  }
  try{
    const area=document.createElement('textarea');
    area.value=text;
    area.setAttribute('readonly','');
    area.style.position='fixed';
    area.style.top='0';
    area.style.opacity='0';
    document.body.appendChild(area);
    area.select();
    const done=document.execCommand('copy');
    document.body.removeChild(area);
    return done;
  }catch{
    return false;
  }
}

export function RoutineDispatch(props:RoutineDispatchProps){
  const t=useTranslations('routine'),router=useRouter();
  const {digits,language}=props;
  const [copied,setCopied]=useState('');
  const [refused,setRefused]=useState('');
  const [state,action,pending]=useActionState(markDispatchSentAction,idle);
  useEffect(()=>{
    if(state.status!=='ok')return;
    showRecycleToast({state:{status:'ok'},success:state.message||t('dispatch.markedSent'),error:''});
    router.refresh();
  },[state]);
  useEffect(()=>{
    if(state.status==='idle'||state.status==='ok')return;
    showRecycleToast({state:{status:'error'},success:'',error:t('common.failed')});
  },[state]);
  const copy=async(which:string,text:string):Promise<void>=>{
    const done=await copyText(text);
    setCopied(done?which:'');
    setRefused(done?'':which);
  };
  return <section className="admin-panel routine-dispatch" data-routine-dispatch>
    <div className="admin-panel-head">
      <h2 data-dispatch-title>{t('dispatch.title')}</h2>
      <PrintButton label={t('dispatch.print')} hook="notice"/>
    </div>
    <div className="admin-panel-body">
      <p className="admin-help" data-dispatch-help>{t('dispatch.help')}</p>
      <p className="admin-help" data-dispatch-print-help>{t('dispatch.printHelp')}</p>

      {props.sent&&props.sentAt
        ? <p className="admin-help" data-dispatch-sent>
          {t('dispatch.sentLine',{when:formatDate(new Date(props.sentAt),digits,language),
            name:props.sentByName||''})}</p>
        : <p className="admin-help" data-dispatch-not-sent>{t('dispatch.notSent')}</p>}
      {props.changedSinceSent&&<p className="admin-badge routine-badge-sent" role="status"
        data-dispatch-changed>{t('dispatch.changed')}</p>}

      <div className="dispatch-message" data-dispatch-class>
        <h3 data-dispatch-class-title>{t('dispatch.classTitle')} · {props.className}</h3>
        <pre className="dispatch-text" data-dispatch-class-text>{props.classText}</pre>
        <div className="routine-form-actions">
          <button type="button" className="button button-navy" data-dispatch-copy
            onClick={()=>void copy('class',props.classText)}>{t('dispatch.copyWhatsapp')}</button>
          <a className="admin-mini-button" data-dispatch-whatsapp href={props.whatsapp} target="_blank"
            rel="noreferrer">{t('dispatch.whatsapp')}</a>
          <a className="admin-mini-button" data-dispatch-messenger href={props.messenger}
            rel="noreferrer">{t('dispatch.messenger')}</a>
        </div>
        {copied==='class'&&<p className="admin-feedback ok" data-dispatch-copied="class">
          {t('dispatch.copied')}</p>}
        {refused==='class'&&<p className="admin-feedback error" data-dispatch-copy-failed="class">
          {t('common.failed')}</p>}
      </div>

      <div className="dispatch-teachers" data-dispatch-teachers>
        <h3 data-dispatch-teachers-title>{t('dispatch.teachers')}</h3>
        <p className="admin-help" data-dispatch-teacher-count>
          {t('dispatch.teacherCount',{count:formatNumber(props.teachers.length,digits)})}</p>
        {props.teachers.length===0
          ? <p className="admin-help" data-dispatch-no-teachers>{t('dispatch.noPeriods')}</p>
          : <ul className="dispatch-list">{props.teachers.map(person=><li className="dispatch-message"
            key={person.id} data-dispatch-teacher={person.id}>
            <strong data-dispatch-teacher-name>{person.name}</strong>
            <pre className="dispatch-text" data-dispatch-teacher-text>{person.text}</pre>
            <div className="routine-form-actions">
              <button type="button" className="admin-mini-button" data-dispatch-teacher-copy={person.id}
                onClick={()=>void copy(person.id,person.text)}>{t('dispatch.copy')}</button>
              <a className="admin-mini-button" data-dispatch-teacher-whatsapp={person.id}
                href={person.whatsapp} target="_blank" rel="noreferrer">{t('dispatch.whatsapp')}</a>
              <a className="admin-mini-button" data-dispatch-teacher-messenger={person.id}
                href={person.messenger} rel="noreferrer">{t('dispatch.messenger')}</a>
            </div>
            {copied===person.id&&<p className="admin-feedback ok" data-dispatch-copied={person.id}>
              {t('dispatch.copied')}</p>}
            {refused===person.id&&<p className="admin-feedback error"
              data-dispatch-copy-failed={person.id}>{t('common.failed')}</p>}
          </li>)}</ul>}
      </div>

      {props.canEdit&&<form action={action} className="admin-edit routine-form" data-dispatch-sent-form
        onReset={event=>event.preventDefault()}>
        <input type="hidden" name="classId" value={props.classId}/>
        <input type="hidden" name="shift" value={props.shift}/>
        <input type="hidden" name="date" value={props.date}/>
        <div className="routine-form-actions">
          <button type="submit" className="button button-navy" disabled={pending} data-dispatch-mark>
            {t('dispatch.markSent')}</button>
        </div>
      </form>}
    </div>
  </section>;
}
