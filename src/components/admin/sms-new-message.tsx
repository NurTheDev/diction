'use client';

/**
 * "New message" on the SMS page (R2).
 *
 * The other entry points already know their recipients — a class's overdue list, one profile, a
 * selection, a receipt. The SMS page does not, so it asks which class first and then opens the very
 * same dialog. A whole-class notice goes out with the same preview, the same cost check and the same
 * single send button as every other screen.
 */

import {useTranslations} from 'next-intl';
import {useCallback,useState} from 'react';
import {useRouter} from 'next/navigation';
import {MessageSquare} from 'lucide-react';
import SendSmsDialog from './send-sms-dialog';
import type {SmsTemplateOption} from './send-sms-dialog';

export default function SmsNewMessage({classes,templates,institutePhone,en}:{
  classes:{id:string;name:string}[];
  templates:SmsTemplateOption[];
  institutePhone:string;
  en:boolean;
}){const ts=useTranslations('sms');
  const [classGroup,setClassGroup]=useState(classes[0]?.id||'');
  const [open,setOpen]=useState(false);
  const router=useRouter();
  const close=useCallback(()=>setOpen(false),[]);
  const sent=useCallback(()=>{router.refresh()},[router]);

  if(!classes.length){
    return <p className="admin-empty">{ts('newMessage.needClass')}</p>;
  }

  return (
    <>
      <div className="admin-inline">
        <label className="admin-check" htmlFor="sms-new-class">
          <span>{ts('newMessage.class')}</span>
          <select id="sms-new-class" className="admin-select" name="smsClass" value={classGroup} onChange={event=>setClassGroup(event.target.value)}>
            {classes.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <button type="button" className="button button-navy" onClick={()=>setOpen(true)} disabled={!classGroup} data-sms-open="">
          <MessageSquare aria-hidden="true" size={15} />
          {ts('newMessage.title')}
        </button>
      </div>
      <p className="admin-help">
        {ts('newMessage.audienceNote')}
      </p>
      <SendSmsDialog open={open} onClose={close} request={{source:'class',classGroup}} templates={templates}
        institutePhone={institutePhone} title={ts('titles.newMessage')} defaultTemplateKey="notice" en={en} onSent={sent} />
    </>
  );
}
