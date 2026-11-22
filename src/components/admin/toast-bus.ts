'use client';
/**
 * The corner message's own bus: how a control raises a toast, and how the shell hears it.
 *
 * This lives apart from the host that paints the toast on purpose, and the reason is a wall rather than
 * a tidiness habit. The marks grid is rendered on two screens: the owner's exam page inside the admin
 * shell, and a teacher's own exam page in the portal — which ships the `exams` catalog alone, so that a
 * teacher's screen carries no admin copy, not even in the bytes behind the visible ones. A grid that
 * imported the host would drag the host's own vocabulary (`adminWork`) onto that teacher's page, and the
 * provider-chain rule in `tests/i18n-catalog.test.ts` would fail the page for a group it never paints.
 *
 * So raising a toast is a plain DOM event with no words in it, and painting one — with the catalog the
 * shell already carries — stays in `recycle-toast-host.tsx`. A screen with no host simply hears nothing:
 * the grid's own status line says the same sentence, which is why the teacher's page needs no host.
 */
import type {ActionState} from '@/actions/admin';

export type FeedbackAction={label:string;run:()=>void};

export interface RecycleToast{
  id:number;
  state:ActionState;
  success:string;
  error:string;
  conflict?:string;
  actions?:FeedbackAction[];
}

export const RECYCLE_TOAST_EVENT='recycle:toast';

let sequence=0;

/** Raise a toast. Safe from a server render (where there is no document) and from a page with no host. */
export function showRecycleToast(toast:Omit<RecycleToast,'id'>):void{
  if(typeof document==='undefined')return;
  sequence+=1;
  document.dispatchEvent(new CustomEvent<RecycleToast>(RECYCLE_TOAST_EVENT,{detail:{...toast,id:sequence}}));
}
