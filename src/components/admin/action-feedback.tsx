'use client';
import {useEffect,useState} from 'react';
import {useTranslations} from 'next-intl';
import type {ActionState} from '@/actions/admin';

export type FeedbackAction={label:string;run:()=>void};

/**
 * Shared action confirmation, announced once and dismissible. With no actions it stays 6.5 seconds;
 * with actions (Undo after a delete, Archive after a blocked delete) it stays 10 seconds so the
 * operator has the full undo window the owner asked for.
 */
export function ActionFeedback({state,success,error,conflict,actions}:{state:ActionState;success:string;error:string;conflict?:string;actions?:FeedbackAction[]}){
  const w=useTranslations('adminWork'),[visible,setVisible]=useState(false);
  const windowMs=actions?.length?10000:6500;
  useEffect(()=>{if(state.status==='idle')return;setVisible(true);const timer=window.setTimeout(()=>setVisible(false),windowMs);return()=>window.clearTimeout(timer)},[state,windowMs]);
  if(state.status==='idle')return null;
  const ok=state.status==='ok',message=ok?success:state.status==='conflict'&&conflict?conflict:error;
  return visible?<div className={`admin-feedback admin-toast ${ok?'':'error'}`} role={ok?'status':'alert'}><span>{message}</span>{actions?.map(action=><button key={action.label} type="button" className="admin-mini-button" onClick={()=>{setVisible(false);action.run()}}>{action.label}</button>)}<button type="button" onClick={()=>setVisible(false)} aria-label={w('close')}>×</button></div>:null}
