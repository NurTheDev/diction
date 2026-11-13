'use client';

/**
 * The button that opens SendSmsDialog (R2).
 *
 * Every entry point renders this, so all six screens get the identical four-step flow and the same
 * idempotency key handling; only the request differs. A successful send refreshes the caller's own
 * screen, because the dues, list and receipt views all show data an SMS can change (a logged
 * reminder, this month's cost).
 */

import {useCallback,useState} from 'react';
import {useRouter} from 'next/navigation';
import {MessageSquare} from 'lucide-react';
import SendSmsDialog from './send-sms-dialog';
import type {SmsSendRequest} from './send-sms-dialog';

export default function SmsDialogTrigger(props:{
  request:SmsSendRequest;
  templates:{key:string;name:string;body:string;active:boolean;edited:boolean}[];
  institutePhone?:string;
  titleBn:string;
  titleEn:string;
  labelBn:string;
  labelEn:string;
  defaultTemplateKey?:string;
  en?:boolean;
  variant?:'mini'|'navy';
  disabled?:boolean;
  icon?:boolean;
  /** R3.11: the message is shown, not editable — a staff send is the thank-you, word for word. */
  lockedText?:boolean;
}){
  const {request,templates,institutePhone='',titleBn,titleEn,labelBn,labelEn,defaultTemplateKey,en=false,variant='mini',disabled=false,icon=true,lockedText=false}=props;
  const [open,setOpen]=useState(false);
  const router=useRouter();
  const close=useCallback(()=>setOpen(false),[]);
  const sent=useCallback(()=>{router.refresh()},[router]);

  return (
    <>
      <button type="button" className={variant==='navy'?'button button-navy':'admin-mini-button'} onClick={()=>setOpen(true)} disabled={disabled} data-sms-open="">
        {icon&&<MessageSquare aria-hidden="true" size={14} />}
        {en?labelEn:labelBn}
      </button>
      <SendSmsDialog open={open} onClose={close} request={request} templates={templates} institutePhone={institutePhone}
        titleBn={titleBn} titleEn={titleEn} defaultTemplateKey={defaultTemplateKey} en={en} onSent={sent} lockedText={lockedText} />
    </>
  );
}
