'use client';
/**
 * R9 · the master routine builder: the week, and the two drawers that write it.
 *
 * What the brief asked for, and where it lives:
 *
 *   • **A visible "+ Add Period" on every day and a visible Edit on every period.** Not in a menu, not
 *     behind a row tap: the button is on the card. The ⋯ menu beside it holds the things done rarely —
 *     delete, restore from the day's bin, the day's own shift — and the menu is an addition to the
 *     visible button, never a replacement for it.
 *   • **A clash warns and never blocks.** A teacher written into two rooms at the same minute, or a room
 *     written into two classes, comes back as `clash`: the drawer stays open with a banner naming the
 *     person, the class and the time, and a prominent "Save anyway" beside the ordinary Save. Pressing
 *     it re-posts the same form with `force` and the period is written. The week that already clashes
 *     says so at the top of the page before anybody opens an editor.
 *   • **Nothing is locked.** Any field of any period can be changed, including which day it belongs to —
 *     moving a period is the day picker in its own editor.
 */
import {useActionState,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {RoutineDrawer,TimeField} from './routine-drawer';
import {RowControls} from './row-controls';
import {showRecycleToast} from './recycle-toast-host';
import {saveMasterDayAction,saveMasterPeriodAction,deleteMasterPeriodAction,restoreMasterPeriodAction,
  type RoutineActionState} from '@/actions/routine';
import {dayTotals,type RoutineClash} from '@/lib/routine/conflicts';
import type {MasterDayView,PeriodView,RoutineTeacher} from '@/lib/routine/read';
import {formatNumber,type Digits} from '@/lib/admin/format';
import {rangeWord} from '@/lib/routine/time';

const idle:RoutineActionState={status:'idle'};

export interface JointOptions{weekday:number;options:{id:string;label:string}[]}

export interface RoutineMasterProps{
  classId:string;
  className:string;
  shift:string;
  days:MasterDayView[];
  /** The seven weekday names, in the screen's own language, starting on Sunday. */
  weekdays:string[];
  teachers:RoutineTeacher[];
  rooms:string[];
  joints:JointOptions[];
  clashes:RoutineClash[];
  digits:Digits;
  canEdit:boolean;
  canDelete:boolean;
}

/** One clash as the operator reads it: who, where, and the time it landed on. */
function useClashSentence(){
  const t=useTranslations('routine');
  return (clash:RoutineClash,digits:Digits):string=>{
    const params={who:clash.who,otherClass:clash.otherClass,otherSubject:clash.otherSubject,
      time:rangeWord(clash.otherStart,clash.otherEnd,digits)};
    if(clash.kind==='teacher')return t('clashes.teacher',params);
    return t('clashes.room',params);
  };
}

/** Deleting one period: into that day's own bin for thirty days, with Undo in the toast. */
function PeriodDeleteControl({classId,shift,periodId,name,onDone}:{
  classId:string;shift:string;periodId:string;name:string;onDone?:()=>void;
}){
  const t=useTranslations('routine'),router=useRouter();
  const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const [pending,setPending]=useState(false);
  const payload=():FormData=>{
    const data=new FormData();
    data.set('classId',classId);data.set('shift',shift);data.set('periodId',periodId);
    return data;
  };
  const restore=async():Promise<void>=>{
    const result=await restoreMasterPeriodAction(idle,payload());
    showRecycleToast({state:{status:result.status==='ok'?'ok':'error'},
      success:t('period.restored'),error:t('common.failed')});
    router.refresh();
  };
  const remove=async():Promise<void>=>{
    setPending(true);
    try{
      const result=await deleteMasterPeriodAction(idle,payload());
      showRecycleToast({
        state:{status:result.status==='ok'?'ok':'error'},
        success:t('period.deleted'),
        error:result.status==='missing'?t('common.missing'):t('common.failed'),
        /* The same ten-second Undo window every other delete in this app has. */
        actions:result.status==='ok'?[{label:t('common.undo'),run:()=>void restore()}]:[],
      });
      if(result.status==='ok'){
        dialog.current?.close();
        onDone?.();
        router.refresh();
      }
    }finally{setPending(false)}
  };
  return <>
    <button ref={trigger} type="button" className="admin-mini-button admin-danger-text" disabled={pending}
      data-period-delete={periodId} onClick={()=>dialog.current?.showModal()}>{t('period.delete')}</button>
    <dialog ref={dialog} className="admin-confirm" onClose={()=>trigger.current?.focus()}>
      <h2>{t('period.deleteNamed',{name})}</h2>
      <p>{t('period.deleteBody')}</p>
      <div className="admin-confirm-actions">
        <button type="button" className="admin-mini-button" onClick={()=>dialog.current?.close()}>{t('period.cancel')}</button>
        <button type="button" className="button admin-danger" disabled={pending} data-period-delete-yes={periodId}
          onClick={()=>void remove()}>{t('period.delete')}</button>
      </div>
    </dialog>
  </>;
}

/** The period editor: every field of a period, and the day it belongs to. */
function MasterPeriodDrawer({target,onClose,props}:{
  target:{weekday:number;period:PeriodView|null}|null;onClose:()=>void;props:RoutineMasterProps;
}){
  const t=useTranslations('routine');
  const router=useRouter();
  const sentence=useClashSentence();
  const [state,action,pending]=useActionState(saveMasterPeriodAction,idle);
  const period=target?.period||null;
  const weekday=target?.weekday??0;
  useEffect(()=>{
    if(state.status!=='ok')return;
    onClose();
    router.refresh();
  },[state]);
  const joints=(props.joints.find(entry=>entry.weekday===weekday)?.options)||[];
  const start=period?.start||'08:00',end=period?.end||'09:00';
  /* Every field lives in state, the way the daily sheet's own drawer and the assignment drawer hold
     theirs: React 19 hands a finished form action back to the form's defaults, and a save that answers
     as a warning must hand the operator the period they typed rather than an empty form, or the
     "Save anyway" standing beside the warning would post the emptiness. The board re-keys this drawer
     per target, so the state starts as the period being edited and then holds what is typed into it. */
  const [draft,setDraft]=useState({weekday:String(weekday),start,end,subjectBn:period?.subjectBn||'',
    subjectEn:period?.subjectEn||'',teacher:period?.teacherId||'',room:period?.room||'',
    jointWith:period?.jointWith||'',order:String(period?.order??0),note:period?.note||''});
  const write=(patch:Partial<typeof draft>):void=>setDraft(current=>({...current,...patch}));
  const name=period?t('period.summary',{time:rangeWord(period.start,period.end,props.digits),
    subject:period.subjectBn}):t('period.newTitle');
  return <RoutineDrawer open={!!target} onClose={onClose} title={period?t('period.editorTitle'):t('period.newTitle')}>
    {/* React 19 resets a form once its action settles: the selects fall back to their first option and
        the "Save anyway" beside a warning would post a weekday the operator never chose. The draft lives
        in state here, so the reset has nothing to hand back — declining it keeps every control showing
        exactly what the operator wrote. */}
    <form action={action} className="admin-edit routine-form" data-period-form={period?.id||'new'}
      onReset={event=>event.preventDefault()}>
      <input type="hidden" name="classId" value={props.classId}/>
      <input type="hidden" name="shift" value={props.shift}/>
      <input type="hidden" name="periodId" value={period?.id||''}/>
      <input type="hidden" name="masterPeriod" value=""/>
      <label>{t('period.day')}
        <select className="admin-select" name="weekday" data-period-weekday value={draft.weekday}
          onChange={event=>write({weekday:event.target.value})}>
          {props.weekdays.map((word,index)=><option key={word+index} value={index}>{word}</option>)}
        </select>
      </label>
      <small className="admin-help">{t('period.moveHelp')}</small>
      <div className="routine-time-row">
        <label>{t('period.start')}
          <TimeField name="start" value={draft.start} digits={props.digits}
            onChange={value=>write({start:value})}/>
        </label>
        <label>{t('period.end')}
          <TimeField name="end" value={draft.end} digits={props.digits}
            onChange={value=>write({end:value})}/>
        </label>
      </div>
      <small className="admin-help">{t('period.timeHelp')}</small>
      <label>{t('period.subjectBn')} *
        <input className="admin-input" name="subjectBn" required maxLength={200} data-period-subject-bn
          value={draft.subjectBn} onChange={event=>write({subjectBn:event.target.value})}/>
      </label>
      <label>{t('period.subjectEn')}
        <input className="admin-input" name="subjectEn" maxLength={200} value={draft.subjectEn}
          onChange={event=>write({subjectEn:event.target.value})}/>
      </label>
      <label>{t('period.teacher')}
        <select className="admin-select" name="teacher" data-period-teacher value={draft.teacher}
          onChange={event=>write({teacher:event.target.value})}>
          <option value="">{t('period.teacherNone')}</option>
          {props.teachers.map(teacher=><option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
        </select>
      </label>
      <label>{t('period.room')}
        <input className="admin-input" name="room" maxLength={80} list="routine-rooms" data-period-room
          value={draft.room} onChange={event=>write({room:event.target.value})}/>
        <datalist id="routine-rooms">
          {props.rooms.map(room=><option key={room} value={room}/>)}
        </datalist>
      </label>
      <label>{t('period.joint')}
        <select className="admin-select" name="jointWith" data-period-joint value={draft.jointWith}
          onChange={event=>write({jointWith:event.target.value})}>
          <option value="">{t('period.jointNone')}</option>
          {joints.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
      <small className="admin-help">{t('period.jointHelp')}</small>
      <label>{t('period.order')}
        <input className="admin-input" name="order" inputMode="numeric" maxLength={2} data-period-order
          value={draft.order} onChange={event=>write({order:event.target.value})}/>
      </label>
      <small className="admin-help">{t('period.orderHelp')}</small>
      <label>{t('period.note')}
        <textarea className="admin-textarea" name="note" maxLength={300} value={draft.note}
          onChange={event=>write({note:event.target.value})}/>
      </label>

      {/* The clash is an answer, not a refusal: the banner names what landed where, and the button beside
          the ordinary Save writes it anyway. */}
      {state.status==='clash'&&<div className="routine-warn" role="alert" data-clash-warning>
        <strong>{t('clashes.banner')}</strong>
        <p className="admin-help">{t('clashes.bannerHelp')}</p>
        <ul>{(state.clashes||[]).map((clash,index)=>
          <li key={`${clash.kind}${clash.otherStart}${index}`} data-clash-line={clash.kind}>
            {sentence(clash,props.digits)}</li>)}</ul>
      </div>}
      {(state.status==='invalid'||state.status==='missing'||state.status==='error'||state.status==='duplicate')&&
        <p role="alert" className="admin-feedback error" data-period-refused>
          {state.status==='invalid'?t('period.invalid'):state.status==='missing'?t('common.missing')
            :state.status==='duplicate'?t('common.duplicate'):t('common.failed')}
        </p>}

      <div className="routine-form-actions">
        <button type="submit" className="button button-navy" disabled={pending} data-period-save>
          {t('period.save')}
        </button>
        {state.status==='clash'&&<button type="submit" name="force" value="on" disabled={pending}
          className="button routine-save-anyway" data-save-anyway>{t('period.saveAnyway')}</button>}
        <button type="button" className="admin-mini-button" onClick={onClose} data-period-cancel>
          {t('period.cancel')}
        </button>
      </div>
    </form>

    {/* The danger zone: soft delete, thirty days, Undo — the same policy every other record follows. */}
    {period&&<div className="routine-danger" data-period-danger>
      <h3>{t('period.dangerZone')}</h3>
      <PeriodDeleteControl classId={props.classId} shift={props.shift} periodId={period.id} name={name}
        onDone={onClose}/>
    </div>}
  </RoutineDrawer>;
}

/** A day of the week itself: which shift it belongs to, and whether it is switched off. */
function MasterDayDrawer({day,onClose,props}:{
  day:MasterDayView|null;onClose:()=>void;props:RoutineMasterProps;
}){
  const t=useTranslations('routine'),router=useRouter();
  const [state,action,pending]=useActionState(saveMasterDayAction,idle);
  /* Held in state for the same reason as the period drawer above: an answer that keeps the drawer open
     must not blank the shift the operator typed into it. */
  const [shiftValue,setShiftValue]=useState(day?.shift||props.shift);
  const [active,setActive]=useState(day?.active!==false);
  useEffect(()=>{
    if(state.status!=='ok')return;
    onClose();
    router.refresh();
  },[state]);
  return <RoutineDrawer open={!!day} onClose={onClose} title={t('day.editorTitle')}>
    <form action={action} className="admin-edit routine-form" data-day-form={day?.weekday??''}
      onReset={event=>event.preventDefault()}>
      <input type="hidden" name="dayId" value={day?.id||''}/>
      <label>{t('day.shift')}
        <input className="admin-input" name="shift" data-day-shift value={shiftValue}
          onChange={event=>setShiftValue(event.target.value)} maxLength={100} list="routine-shifts"
          required/>
        <datalist id="routine-shifts">
          {[...new Set([...props.days.map(entry=>entry.shift),props.shift].filter(Boolean))]
            .map(shift=><option key={shift} value={shift}/>)}
        </datalist>
      </label>
      <small className="admin-help">{t('day.shiftHelp')}</small>
      <label className="admin-check">
        <input type="checkbox" name="active" data-day-active checked={active}
          onChange={event=>setActive(event.target.checked)}/>
        {t('day.active')}
      </label>
      <small className="admin-help">{t('day.activeHelp')}</small>
      {state.status!=='ok'&&state.status!=='idle'&&
        <p role="alert" className="admin-feedback error" data-day-refused>{t('common.failed')}</p>}
      <div className="routine-form-actions">
        <button type="submit" className="button button-navy" disabled={pending} data-day-save>{t('day.save')}</button>
        <button type="button" className="admin-mini-button" onClick={onClose}>{t('period.cancel')}</button>
      </div>
    </form>
  </RoutineDrawer>;
}

export function RoutineMasterBoard(props:RoutineMasterProps){
  const t=useTranslations('routine'),router=useRouter();
  const sentence=useClashSentence();
  const [periodTarget,setPeriodTarget]=useState<{weekday:number;period:PeriodView|null}|null>(null);
  const [dayTarget,setDayTarget]=useState<MasterDayView|null>(null);
  const subjectOf=(period:PeriodView):string=>period.subjectBn;
  const nameOf=(period:PeriodView):string=>
    t('period.summary',{time:rangeWord(period.start,period.end,props.digits),subject:subjectOf(period)});
  return <>
    {props.clashes.length>0&&<div className="routine-warn" role="status" data-clash-banner>
      <strong>{t('clashes.weekBanner',{count:formatNumber(props.clashes.length,props.digits)})}</strong>
      <p className="admin-help">{t('clashes.bannerHelp')}</p>
      <ul>{props.clashes.map((clash,index)=>
        <li key={`${clash.kind}${clash.weekday}${clash.start}${index}`} data-clash-line={clash.kind}>
          {props.weekdays[clash.weekday]} · {sentence(clash,props.digits)}</li>)}</ul>
    </div>}

    <div className="routine-week" data-routine-week>
      {props.days.map(day=>{
        const totals=dayTotals(day.periods.map(period=>({weekday:day.weekday,start:period.start,
          end:period.end,teacher:period.teacherId,room:period.room})));
        return <section className="routine-day" key={day.weekday} data-routine-day={day.weekday}>
          <div className="routine-day-head">
            <h2 data-routine-weekday={day.weekday}>{props.weekdays[day.weekday]}</h2>
            <p className="admin-help" data-routine-day-count>
              {t('master.periodCount',{count:formatNumber(day.periods.length,props.digits)})}
              {totals.minutes>0?` · ${t('master.minutes',{minutes:formatNumber(totals.minutes,props.digits)})}`:''}
            </p>
            {!day.active&&<p className="admin-badge routine-day-off" data-day-off>{t('master.dayOff')}</p>}
            <div className="routine-day-actions">
              {props.canEdit&&day.id&&
                <button type="button" className="admin-mini-button" data-day-edit={day.weekday}
                  onClick={()=>setDayTarget(day)}>{t('common.edit')}</button>}
              {day.id&&<RowControls kind="masterRoutine" id={day.id}
                name={`${props.className} · ${props.weekdays[day.weekday]}`}
                canDelete={props.canDelete} canArchive onDone={()=>router.refresh()}/>}
            </div>
          </div>

          {day.periods.length===0
            ? <p className="admin-help" data-routine-empty-day>{t('master.noPeriods')}</p>
            : <ul className="routine-periods">
              {day.periods.map(period=><li className="routine-period" key={period.id} data-period-card={period.id}>
                <span className="routine-period-when" data-period-time>{rangeWord(period.start,period.end,props.digits)}</span>
                <span className="routine-period-what">
                  <strong data-period-subject>{subjectOf(period)}</strong>
                  <span data-period-teacher>{period.teacherName||t('master.noTeacher')}</span>
                  {period.room&&<span data-period-room>{t('master.roomWord',{room:period.room})}</span>}
                  {period.jointWith&&<span className="admin-badge" data-period-joint>{t('master.joint')}</span>}
                  {period.note&&<span className="admin-help" data-period-note>{period.note}</span>}
                </span>
                <span className="routine-period-actions">
                  {props.canEdit&&<button type="button" className="admin-mini-button" data-period-edit={period.id}
                    onClick={()=>setPeriodTarget({weekday:day.weekday,period})}>{t('common.edit')}</button>}
                  <details className="admin-more routine-more" data-period-more={period.id}>
                    <summary aria-label={t('common.more')}>{t('common.more')}</summary>
                    <div className="admin-more-body">
                      {props.canEdit&&<PeriodDeleteControl classId={props.classId} shift={props.shift}
                        periodId={period.id} name={nameOf(period)}/>}
                      {period.jointWith&&<span className="admin-help">{t('master.joint')}</span>}
                    </div>
                  </details>
                </span>
              </li>)}
            </ul>}

          {day.binned>0&&<p className="admin-help" data-binned-count>
            {t('master.binned',{count:formatNumber(day.binned,props.digits)})}</p>}

          {props.canEdit&&<button type="button" className="button button-navy routine-add" data-add-period={day.weekday}
            onClick={()=>setPeriodTarget({weekday:day.weekday,period:null})}>+ {t('master.addPeriod')}</button>}
        </section>;
      })}
    </div>

    {/* The drawers live outside every card: a `<dialog>` inside a `<details>` in a scrolling column is a
        dialog that opens clipped, and a nested form is a form that does not submit. */}
    <div key={periodTarget?`${periodTarget.weekday}:${periodTarget.period?.id||'new'}`:'closed'}>
      <MasterPeriodDrawer target={periodTarget} onClose={()=>setPeriodTarget(null)} props={props}/>
    </div>
    <div key={dayTarget?`day:${dayTarget.weekday}`:'day:closed'}>
      <MasterDayDrawer day={dayTarget} onClose={()=>setDayTarget(null)} props={props}/>
    </div>
  </>;
}
