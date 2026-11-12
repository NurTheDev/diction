'use client';
import {useEffect,useState} from 'react';
import {ActionFeedback,type FeedbackAction} from './action-feedback';
import type {ActionState} from '@/actions/admin';

export type RecycleToast={id:number;state:ActionState;success:string;error:string;conflict?:string;actions?:FeedbackAction[]};
export const RECYCLE_TOAST_EVENT='recycle:toast';
let sequence=0;

/**
 * The toast lives here, in the admin layout, rather than inside the row that raised it: a successful
 * delete removes that row (and unmounts its component) the moment the list refreshes, which would
 * take the 10-second Undo window with it. Any control can raise a toast, and its action callbacks
 * survive the row they came from.
 */
export function showRecycleToast(toast:Omit<RecycleToast,'id'>):void{
  if(typeof document==='undefined')return;
  sequence+=1;
  document.dispatchEvent(new CustomEvent<RecycleToast>(RECYCLE_TOAST_EVENT,{detail:{...toast,id:sequence}}));
}

export function RecycleToastHost(){
  const [toast,setToast]=useState<RecycleToast|null>(null);
  useEffect(()=>{
    const handler=(event:Event)=>setToast((event as CustomEvent<RecycleToast>).detail);
    document.addEventListener(RECYCLE_TOAST_EVENT,handler);
    return ()=>document.removeEventListener(RECYCLE_TOAST_EVENT,handler);
  },[]);
  return toast?<ActionFeedback key={toast.id} state={toast.state} success={toast.success} error={toast.error} conflict={toast.conflict} actions={toast.actions}/>:null;
}
