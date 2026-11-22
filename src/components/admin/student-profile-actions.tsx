'use client';
import {useActionState,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {removeCenterStudent,type CenterActionState} from '@/actions/center-students';
import {MonthField} from './month-popover';
import {StatusChipMenu} from './list-pattern';
import {HoldDoor,type DoorKit} from './student-money-doors';
import {toastOnWrite} from './recycle-toast-host';
import type {Digits} from '@/lib/admin/format';

const idle:CenterActionState={status:'idle'};
/* Removing a student files the row away from the page it was on, so the answer travels back with the
   write rather than from an effect that would never run on an unmounted form. */
const removeWrite=toastOnWrite<CenterActionState,CenterActionState>(removeCenterStudent);

/** The badge a status wears: green while the student is running, amber while the fee run skips them. */
const badge=(status:string):string=>status==='active'?'enabled':'pending';

/**
 * The profile's hold door, and the pattern's: the badge IS the switch. One tap opens it, the second
 * asks the question a pause cannot be written without — which month it takes effect from, or which
 * month the student resumes in — and the sheet commits, a toast answers and the page re-reads. It is
 * the same sheet the list row opens, from the same component, so the profile and the list cannot drift
 * apart about what a pause is or about what one is billed by.
 */
export function StudentStatusChip({kit,status,holdFrom}:{kit:DoorKit;status:'active'|'on_hold';
  /** The month the open pause took effect, as `YYYY-MM`: the sheet will not offer a resume inside it. */
  holdFrom:string}){
  const t=useTranslations('center'),router=useRouter(),[door,setDoor]=useState<'hold'|'lift'|null>(null);
  return <><StatusChipMenu<'active'|'on_hold'> kind="student" value={status} options={['active','on_hold']}
    labelOf={option=>t(option==='on_hold'?'onHold':'active')} badgeOf={badge} title={t('status')}
    onPick={option=>setDoor(option==='on_hold'?'hold':'lift')}/>
    {door&&<HoldDoor mode={door} kit={kit} holdFrom={holdFrom}
      onDone={()=>router.refresh()} onClose={()=>setDoor(null)}/>}</>;
}

/** The profile header's Remove door: a leave month and a reason, typed by a person, before anything moves. */
export function StudentRemoveButton({id,digits,language}:{id:string;digits:Digits;language:'bn'|'en'}){
  const t=useTranslations('center'),dialog=useRef<HTMLDialogElement>(null),[state,action,pending]=useActionState(removeWrite,idle),router=useRouter();
  /* Until a month is picked the verb is a dead button: the field that carries it is hidden, and a hidden
     input is barred from constraint validation, so `required` cannot hold the submit back. */
  const [leave,setLeave]=useState('');
  useEffect(()=>{if(state.status==='ok'){dialog.current?.close();router.refresh()}},[state,router]);
  return <><button type="button" className="admin-mini-button" data-student-remove onClick={()=>dialog.current?.showModal()}>{t('remove')}</button>
    <dialog ref={dialog} className="admin-dialog" aria-label={t('remove')}><form action={action}>
      <h2>{t('remove')}</h2>
      {/* No native month box anywhere in the admin: the month is picked from our own calendar surface,
          read back in the operator's digits and language, and carried in a hidden input the action
          already reads. */}
      <label>{t('removeLeave')}<MonthField name="leave" value="" placeholder={t('row.pickMonth')} clearLabel={t('row.clear')}
        digits={digits} language={language} onChange={setLeave}/></label>
      <label>{t('removeReason')}<textarea className="admin-input" name="reason" required minLength={3} maxLength={500} rows={3}/></label>
      <input type="hidden" name="id" value={id}/>
      {/* A destructive verb that answers with silence is a lie: the operator clicked Remove, the dialog
          stayed open, and nothing said why. So every refusal is named — the month or the reason it did
          not accept, the record somebody else changed first, and the write that simply did not land. */}
      {state.status==='invalid'&&<p className="admin-feedback error" role="alert">{t('removeInvalid')}</p>}
      {state.status==='conflict'&&<p className="admin-feedback error" role="alert">{t('conflict')}</p>}
      {state.status==='duplicate'&&<p className="admin-feedback error" role="alert">{t('duplicate')}</p>}
      {state.status==='error'&&<p className="admin-feedback error" role="alert">{t('failure')}</p>}
      <div className="overview-drawer-actions">
        <button type="submit" className="admin-mini-button" data-student-remove-submit disabled={pending||!leave}>{t('remove')}</button>
        <button type="button" className="admin-mini-button" onClick={()=>dialog.current?.close()}>{t('back')}</button>
      </div>
    </form></dialog></>;
}
