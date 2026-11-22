'use client';
import {useEffect,useState} from 'react';
import {ActionFeedback} from './action-feedback';
import {RECYCLE_TOAST_EVENT,showRecycleToast,type RecycleToast} from './toast-bus';

/* Raised from `./toast-bus`, which holds no vocabulary of its own: a screen that ships one catalog group
   may import the bus without dragging this host's words into its payload, and a portal page that carries
   no host simply hears nothing. Both names stay exported here, because every control that raises a toast
   has always imported them from the host. */
export {showRecycleToast,RECYCLE_TOAST_EVENT};
export type {RecycleToast};

/**
 * The toast lives here, in the admin layout, rather than inside the row that raised it: a successful
 * delete removes that row (and unmounts its component) the moment the list refreshes, which would
 * take the 10-second Undo window with it. Any control can raise a toast, and its action callbacks
 * survive the row they came from.
 */

/**
 * Wrap a form action so its answer is raised the moment the write resolves — as a plain call on the way
 * back, not as an effect waiting for the new state to commit.
 *
 * Some writes remove the very thing that made them: closing a visitor files its row away from the list,
 * deleting one bins it. The refresh that follows unmounts that row, and a `useEffect` keyed on the action
 * state then never runs, so the operator who just closed or deleted something is told nothing at all.
 * Code after an `await` inside the action keeps running whether or not the component is still mounted,
 * which is why the Recycle Bin's Undo has always been raised this way.
 */
export function toastOnWrite<
  State extends {status:string;message?:string}|null,
  Result extends {status:string;message?:string}|null,
>(action:(previous:State,form:FormData)=>Promise<Result>):(previous:State,form:FormData)=>Promise<Result>{
  return async (previous,form)=>{
    const next=await action(previous,form);
    if(next&&next.status==='ok'&&next.message)showRecycleToast({state:{status:'ok'},success:next.message,error:''});
    return next;
  };
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
