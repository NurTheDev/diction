'use client';
import {useEffect,useState} from 'react';
import {useTranslations} from 'next-intl';
import type {ActionState} from '@/actions/admin';
/** Shared action confirmation, announced once and dismissible. */
export function ActionFeedback({state,success,error,conflict}:{state:ActionState;success:string;error:string;conflict?:string}){const w=useTranslations('adminWork'),[visible,setVisible]=useState(false);useEffect(()=>{if(state.status==='idle')return;setVisible(true);const timer=window.setTimeout(()=>setVisible(false),6500);return()=>window.clearTimeout(timer)},[state]);if(state.status==='idle')return null;const ok=state.status==='ok',message=ok?success:state.status==='conflict'&&conflict?conflict:error;return visible?<div className={`admin-feedback admin-toast ${ok?'':'error'}`} role={ok?'status':'alert'}><span>{message}</span><button type="button" onClick={()=>setVisible(false)} aria-label={w('close')}>×</button></div>:null}
