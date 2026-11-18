'use client';
/**
 * S1 · the three doors that change a student over time: a pause, a move to another class, a price.
 *
 * All three are the same shape, and the shape is the point — a month, an optional reason, one write,
 * one toast, and the page or the list re-read. None of them is a field on the inline edit: the edit
 * changes what a student IS (a name, a number, a school), and these three change what is true of them
 * FROM A MONTH, which is a line added to a history rather than a value overwritten. So each one is its
 * own sheet with its own month in it, and the month is picked, never typed — the pattern has no native
 * month box anywhere, and a month here decides which months the fee run skips, which class a month
 * belongs to and what a month costs.
 *
 * The sheet is mounted by whoever opened it and closes itself when the write lands, the way the class
 * door does: a refusal leaves it open with what the operator typed still in it and the reason printed
 * inside it, because a sheet that shuts on a refusal shuts on the only place the refusal was written.
 * The toast is raised by `toastOnWrite` on the way back from the action rather than by an effect, since
 * a row that has just been moved to another class can leave the list before an effect would run.
 */
import {useActionState,useEffect,useRef,useState,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {
  setStudentHold,transferStudentClass,updateStudentMonthlyFee,type CenterActionState,
} from '@/actions/center-students';
import {MonthField} from './month-popover';
import {toastOnWrite} from './recycle-toast-host';
import {attr} from './list-class';
import type {ClassChoice} from './center-forms';
import {formatNumber,type Digits} from '@/lib/admin/format';

const idle:CenterActionState={status:'idle'};
const holdWrite=toastOnWrite<CenterActionState,CenterActionState>(setStudentHold);
const transferWrite=toastOnWrite<CenterActionState,CenterActionState>(transferStudentClass);
const feeWrite=toastOnWrite<CenterActionState,CenterActionState>(updateStudentMonthlyFee);

export type Language='bn'|'en';
/** What every one of these sheets needs to know: whose record, in whose digits and words. */
export type DoorKit={id:string;digits:Digits;language:Language};

/** The month after a `YYYY-MM` month: a resume month is never the month the pause began. */
function nextMonthWord(value:string):string{
  const match=/^(\d{4})-(\d{2})$/.exec(String(value).trim());
  if(!match)return '';
  const index=Number(match[1])*12+Number(match[2]);
  return `${Math.floor(index/12)}-${String((index%12)+1).padStart(2,'0')}`;
}

/**
 * The sheet itself. `marker` is the name its controls are read by — `data-hold-dialog`,
 * `data-transfer-submit`, `data-fee-feedback` — and it opens on mount, because the parent mounts it
 * when the operator asks for it and unmounts it when the sheet reports itself closed.
 */
function Door({marker,title,action,state,pending,disabled,submitLabel,children,onDone,onClose}:{
  marker:string;title:string;action:(form:FormData)=>void;state:CenterActionState;pending:boolean;
  disabled:boolean;submitLabel:string;children:ReactNode;onDone:()=>void;onClose:()=>void;
}){
  const t=useTranslations('center'),dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal()},[]);
  /* A committed write re-reads the page or the list first and closes the sheet second: the operator
     sees the sheet go and the numbers behind it already changed. */
  useEffect(()=>{
    if(state.status!=='ok')return;
    onDone();
    if(dialog.current?.open)dialog.current.close();
  },[state,onDone]);
  return <dialog ref={dialog} className="admin-dialog" aria-label={title} {...attr(`data-${marker}-dialog`)}
    onClose={onClose}>
    <form action={action} {...attr(`data-${marker}-form`)}>
      <h2>{title}</h2>
      {children}
      {/* Every refusal is named, and the action's own sentence wins: it is the one that can say which
          month was already settled, or that the class picked is the class the student is already in. */}
      {state.status!=='idle'&&state.status!=='ok'
        &&<p className="admin-feedback error" role="alert" {...attr(`data-${marker}-feedback`)}>
          {state.message||t('failure')}</p>}
      <div className="overview-drawer-actions">
        <button type="submit" className="admin-mini-button" {...attr(`data-${marker}-submit`)}
          disabled={pending||disabled}>{submitLabel}</button>
        <button type="button" className="admin-mini-button" {...attr(`data-${marker}-close`)}
          onClick={()=>dialog.current?.close()}>{t('back')}</button>
      </div>
    </form></dialog>;
}

/**
 * F-01 · the pause and its lifting, in one sheet with two questions.
 *
 * Pausing asks for the month the pause takes effect — the first month the centre does not bill — and,
 * if the operator wants to leave a reason, a reason. Lifting asks for the month the student resumes,
 * and closes the pause at the month before it, so the resume month is a month the centre bills and the
 * paused months are never billed again. The picker will not offer a resume month inside the pause.
 */
export function HoldDoor({mode,kit,holdFrom,onDone,onClose}:{
  mode:'hold'|'lift';kit:DoorKit;/** The month the open pause began, as `YYYY-MM`. */holdFrom:string;
  onDone:()=>void;onClose:()=>void;
}){
  const t=useTranslations('center'),[state,action,pending]=useActionState(holdWrite,idle);
  const [month,setMonth]=useState('');
  const hold=mode==='hold';
  return <Door marker="hold" state={state} action={action} pending={pending} disabled={!month} onDone={onDone} onClose={onClose}
    title={hold?t('holdDoor.title'):t('holdDoor.liftTitle')} submitLabel={hold?t('holdDoor.submit'):t('holdDoor.liftSubmit')}>
    <input type="hidden" name="id" value={kit.id}/>
    <input type="hidden" name="hold" value={hold?'1':''}/>
    <p className="admin-help">{hold?t('holdDoor.help'):t('holdDoor.liftHelp')}</p>
    <label>{hold?t('holdDoor.month'):t('holdDoor.resumeMonth')}
      <MonthField name={hold?'fromMonth':'resume'} value="" placeholder={t('row.pickMonth')} clearLabel={t('row.clear')}
        notBefore={hold?undefined:nextMonthWord(holdFrom)||undefined} digits={kit.digits} language={kit.language}
        onChange={setMonth}/></label>
    <label>{t('holdDoor.reason')}
      <textarea className="admin-input" name="reason" rows={2} maxLength={500}
        placeholder={t('holdDoor.reasonHint')}/></label>
  </Door>;
}

/**
 * F-02 · the move to another class.
 *
 * The list is the classes the centre runs, minus the one the student is already in: a move to the class
 * a student is sitting in is not a move, and offering it is offering a write that can only be refused.
 * The month is the month the move takes effect, and the reason is the operator's own.
 */
export function TransferDoor({kit,classes,currentClassId,onDone,onClose}:{
  kit:DoorKit;classes:ClassChoice[];currentClassId:string;onDone:()=>void;onClose:()=>void;
}){
  const t=useTranslations('center'),[state,action,pending]=useActionState(transferWrite,idle);
  const [month,setMonth]=useState(''),[picked,setPicked]=useState('');
  const options=classes.filter(choice=>choice.id!==currentClassId);
  return <Door marker="transfer" state={state} action={action} pending={pending} disabled={!month||!picked}
    onDone={onDone} onClose={onClose} title={t('transferDoor.title')} submitLabel={t('transferDoor.submit')}>
    <input type="hidden" name="id" value={kit.id}/>
    <p className="admin-help">{t('transferDoor.help')}</p>
    <label>{t('transferDoor.class')}
      <select className="admin-select" name="classGroup" {...attr('data-transfer-class')} required
        value={picked} onChange={event=>setPicked(event.target.value)}>
        <option value="">{t('transferDoor.choose')}</option>
        {options.map(choice=><option key={choice.id} value={choice.id}>
          {choice.name}{choice.shift?` · ${choice.shift}`:''} · {formatNumber(choice.year,kit.digits)}</option>)}
      </select></label>
    {!options.length&&<p className="admin-help" {...attr('data-transfer-none')}>{t('transferDoor.none')}</p>}
    <label>{t('transferDoor.month')}
      <MonthField name="month" value="" placeholder={t('row.pickMonth')} clearLabel={t('row.clear')}
        digits={kit.digits} language={kit.language} onChange={setMonth}/></label>
    <label>{t('transferDoor.reason')}
      <input className="admin-input" name="reason" maxLength={500} placeholder={t('transferDoor.reasonHint')}/></label>
  </Door>;
}

/**
 * F-03 · the change of price.
 *
 * The taka, the month it takes effect from, and why. The months before that month keep the price they
 * were billed at, and a month the centre has already taken money for cannot be re-priced at all: that
 * refusal arrives with the month named in it, because "a month is settled" is not an answer an operator
 * can act on without knowing which one.
 */
export function FeeDoor({kit,fee,currency,onDone,onClose}:{
  kit:DoorKit;/** The price the student is on now, or null when the record does not say. */fee:number|null;
  currency:string;onDone:()=>void;onClose:()=>void;
}){
  const t=useTranslations('center'),[state,action,pending]=useActionState(feeWrite,idle);
  const [month,setMonth]=useState(''),[amount,setAmount]=useState(fee==null?'':String(fee));
  return <Door marker="fee" state={state} action={action} pending={pending} disabled={!month||!amount.trim()}
    onDone={onDone} onClose={onClose} title={t('feeDoor.title')} submitLabel={t('feeDoor.submit')}>
    <input type="hidden" name="id" value={kit.id}/>
    <p className="admin-help">{t('feeDoor.help')}</p>
    <p className="admin-help" {...attr('data-fee-now')}>{t('feeDoor.current',{
      amount:fee==null?t('feeDoor.unknown'):`${formatNumber(fee,kit.digits)} ${currency}`})}</p>
    <label>{t('feeDoor.amount')}
      <input className="admin-input" name="fee" {...attr('data-fee-amount')} required inputMode="numeric"
        value={amount} onChange={event=>setAmount(event.target.value)}/></label>
    <label>{t('feeDoor.month')}
      <MonthField name="month" value="" placeholder={t('row.pickMonth')} clearLabel={t('row.clear')}
        digits={kit.digits} language={kit.language} onChange={setMonth}/></label>
    <label>{t('feeDoor.reason')}
      <input className="admin-input" name="reason" maxLength={500} placeholder={t('feeDoor.reasonHint')}/></label>
  </Door>;
}

/**
 * The profile header's two doors: a button and the sheet it opens. The list row opens the same three
 * sheets from its ⋯ menu, so a move or a price is written the same way from either place and the two
 * cannot drift apart about what one asks for.
 */
export function StudentTransferButton({kit,classes,currentClassId}:{
  kit:DoorKit;classes:ClassChoice[];currentClassId:string;
}){
  const t=useTranslations('center'),router=useRouter(),[open,setOpen]=useState(false);
  return <>{<button type="button" className="admin-mini-button" {...attr('data-profile-transfer')}
      onClick={()=>setOpen(true)}>{t('transferDoor.button')}</button>}
    {open&&<TransferDoor kit={kit} classes={classes} currentClassId={currentClassId}
      onDone={()=>router.refresh()} onClose={()=>setOpen(false)}/>}</>;
}

export function StudentFeeButton({kit,fee,currency}:{kit:DoorKit;fee:number|null;currency:string}){
  const t=useTranslations('center'),router=useRouter(),[open,setOpen]=useState(false);
  return <>{<button type="button" className="admin-mini-button" {...attr('data-profile-fee')}
      onClick={()=>setOpen(true)}>{t('feeDoor.button')}</button>}
    {open&&<FeeDoor kit={kit} fee={fee} currency={currency}
      onDone={()=>router.refresh()} onClose={()=>setOpen(false)}/>}</>;
}
