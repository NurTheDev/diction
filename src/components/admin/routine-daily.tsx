'use client';
/**
 * R9 · the daily working sheet: one date, pre-filled from the week, editable in every part.
 *
 * The sheet is the everyday paper a coaching centre actually runs on. It opens on Dhaka's today, it can
 * be walked to tomorrow or back to a date that has already passed, and it starts as a copy of the master
 * routine for that weekday — every period marked as the week's own, so the operator can see at a glance
 * which lines are the template and which are this date's.
 *
 * Three rules this component is built around:
 *
 *   • **The master routine is never touched here.** A substitute, a moved room, a changed time is written
 *     to the date alone. The sheet says so in its own help line, because the whole point of the two
 *     screens is that one is permanent and one is not.
 *   • **Nothing is blocked by time or by a dispatch.** A past date is fully editable and carries a small
 *     badge saying it has passed; a sheet that has already been sent is fully editable and carries a
 *     small badge saying it has changed since.
 *   • **A day that says nothing new costs nothing.** The engine stores a sheet only when it differs from
 *     the week, and the answer the operator gets says which happened — "saved" or "saved, and no copy was
 *     needed". That sentence is the storage rule made visible.
 *
 * The day is saved as ONE write, because a day is one decision: the status, the reason, the notes and
 * every period travel together, and the drawers below only edit the draft the form posts.
 */
import {useActionState,useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {RoutineDrawer,TimeField} from './routine-drawer';
import {RoutineHistory} from './routine-history';
import {RowControls} from './row-controls';
import {showRecycleToast} from './recycle-toast-host';
import {resetDailySheetAction,saveDailySheetAction,type RoutineActionState} from '@/actions/routine';
import {formatDate,formatNumber,type Digits} from '@/lib/admin/format';
import {rangeWord,type Language} from '@/lib/routine/time';
import type {DailySheetView,DailyPeriodView,RoutineTeacher} from '@/lib/routine/read';
import type {RoutineClash} from '@/lib/routine/conflicts';

const idle:RoutineActionState={status:'idle'};

/** One line of the draft: a period as the sheet holds it before it is posted. */
interface DraftPeriod{
  id:string;
  masterPeriod:string;
  start:string;
  end:string;
  subjectBn:string;
  subjectEn:string;
  teacher:string;
  room:string;
  jointWith:string;
  order:number;
  note:string;
  source:'master'|'own';
}

const draftOf=(period:DailyPeriodView):DraftPeriod=>({
  id:period.id,masterPeriod:period.masterPeriod,start:period.start,end:period.end,
  subjectBn:period.subjectBn,subjectEn:period.subjectEn,teacher:period.teacherId,room:period.room,
  jointWith:period.jointWith,order:period.order,note:period.note,source:period.source,
});

export interface RoutineDailyProps{
  sheet:DailySheetView;
  teachers:RoutineTeacher[];
  rooms:string[];
  joints:{id:string;label:string}[];
  weekdays:string[];
  digits:Digits;
  language:Language;
  canEdit:boolean;
  canDelete:boolean;
}

/** The drawer that edits one period of this date — and only of this date. */
function DailyPeriodDrawer({target,onClose,onSave,props}:{
  target:{index:number;period:DraftPeriod}|null;
  onClose:()=>void;
  onSave:(period:DraftPeriod,index:number)=>void;
  props:RoutineDailyProps;
}){
  const t=useTranslations('routine');
  const [draft,setDraft]=useState<DraftPeriod|null>(target?.period||null);
  const write=(patch:Partial<DraftPeriod>):void=>setDraft(current=>current?{...current,...patch}:current);
  const isNew=(target?.index??-1)<0;
  return <RoutineDrawer open={!!target} onClose={onClose}
    title={isNew?t('period.newTitle'):t('period.editorTitle')}>
    {draft&&<form className="admin-edit routine-form" data-daily-period-form={isNew?'new':draft.id}
      onSubmit={event=>{event.preventDefault();if(!draft.subjectBn.trim())return;onSave(draft,target?.index??-1)}}>
      <p className="admin-help" data-daily-period-scope>{t('daily.dayOnly')}</p>
      <div className="routine-time-row">
        <label>{t('period.start')}
          <TimeField name="start" value={draft.start} digits={props.digits} onChange={value=>write({start:value})}/>
        </label>
        <label>{t('period.end')}
          <TimeField name="end" value={draft.end} digits={props.digits} onChange={value=>write({end:value})}/>
        </label>
      </div>
      <label>{t('period.subjectBn')} *
        <input className="admin-input" name="subjectBn" required maxLength={200} data-daily-subject-bn
          value={draft.subjectBn} onChange={event=>write({subjectBn:event.target.value})}/>
      </label>
      <label>{t('period.subjectEn')}
        <input className="admin-input" name="subjectEn" maxLength={200} value={draft.subjectEn}
          onChange={event=>write({subjectEn:event.target.value})}/>
      </label>
      <label>{isNew?t('period.teacher'):t('daily.substitute')}
        <select className="admin-select" name="teacher" data-daily-teacher value={draft.teacher}
          onChange={event=>write({teacher:event.target.value})}>
          <option value="">{t('period.teacherNone')}</option>
          {props.teachers.map(teacher=><option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
        </select>
      </label>
      <label>{t('period.room')}
        <input className="admin-input" name="room" maxLength={80} list="routine-rooms-daily" data-daily-room
          value={draft.room} onChange={event=>write({room:event.target.value})}/>
        <datalist id="routine-rooms-daily">
          {props.rooms.map(room=><option key={room} value={room}/>)}
        </datalist>
      </label>
      <label>{t('period.joint')}
        <select className="admin-select" name="jointWith" data-daily-joint value={draft.jointWith}
          onChange={event=>write({jointWith:event.target.value})}>
          <option value="">{t('period.jointNone')}</option>
          {props.joints.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
      <label>{t('period.order')}
        <input className="admin-input" name="order" inputMode="numeric" maxLength={2} data-daily-order
          value={String(draft.order)} onChange={event=>write({order:Number(event.target.value.replace(/\D/g,''))||0})}/>
      </label>
      <label>{t('period.note')}
        <textarea className="admin-textarea" name="note" maxLength={300} data-daily-note value={draft.note}
          onChange={event=>write({note:event.target.value})}/>
      </label>
      <div className="routine-form-actions">
        <button type="submit" className="button button-navy" data-daily-period-save>{t('period.save')}</button>
        <button type="button" className="admin-mini-button" onClick={onClose}>{t('period.cancel')}</button>
      </div>
    </form>}
  </RoutineDrawer>;
}

export function RoutineDailySheet(props:RoutineDailyProps){
  const {sheet,digits,language}=props;
  const t=useTranslations('routine');
  const router=useRouter();
  const [draft,setDraft]=useState<DraftPeriod[]>(()=>sheet.periods.map(draftOf));
  const [status,setStatus]=useState<'normal'|'adjusted'|'holiday'>(sheet.status);
  const [holidayReason,setHolidayReason]=useState(sheet.holidayReason);
  const [notes,setNotes]=useState(sheet.notes);
  const [editor,setEditor]=useState<{index:number;period:DraftPeriod}|null>(null);
  /* Slice 2: the sheet's own memory — the last twenty changes to this date, and the tap that puts one
     of them back. */
  const [historyOpen,setHistoryOpen]=useState(false);
  const [state,action,pending]=useActionState(saveDailySheetAction,idle);
  const [resetState,resetAction]=useActionState(resetDailySheetAction,idle);

  /* The sheet is one write, so the drawers edit a draft and the draft is what the form posts. */
  const starting=JSON.stringify({periods:sheet.periods.map(draftOf),status:sheet.status,
    holidayReason:sheet.holidayReason,notes:sheet.notes});
  const now=JSON.stringify({periods:draft,status,holidayReason,notes});
  const dirty=starting!==now;

  useEffect(()=>{
    if(state.status!=='ok')return;
    showRecycleToast({state:{status:'ok'},success:state.stored?state.message||t('daily.saved'):state.message||t('daily.savedCopy'),error:''});
    router.refresh();
  },[state]);
  useEffect(()=>{
    if(resetState.status!=='ok')return;
    showRecycleToast({state:{status:'ok'},success:resetState.message||t('daily.resetDone'),error:''});
    router.refresh();
  },[resetState]);

  const sentence=(clash:RoutineClash):string=>{
    const params={who:clash.who,otherClass:clash.otherClass,otherSubject:clash.otherSubject,
      time:rangeWord(clash.otherStart,clash.otherEnd,digits)};
    if(clash.kind==='teacher')return t('clashes.teacher',params);
    return t('clashes.room',params);
  };
  const savePeriod=(period:DraftPeriod,index:number):void=>{
    setDraft(current=>index<0?[...current,period]:current.map((entry,position)=>position===index?period:entry));
    setEditor(null);
  };
  const leaveOut=(index:number):void=>{
    setDraft(current=>current.filter((_,position)=>position!==index));
    showRecycleToast({state:{status:'ok'},success:t('period.leftOut'),error:''});
  };
  const addPeriod=():void=>setEditor({index:-1,period:{
    id:'',masterPeriod:'',start:'08:00',end:'09:00',subjectBn:'',subjectEn:'',teacher:'',room:'',
    jointWith:'',order:draft.length,note:'',source:'own'}});

  return <>
    <div className="routine-badges" data-daily-badges>
      <h2 className="routine-day-title" data-daily-day>{props.weekdays[sheet.weekday]}</h2>
      {sheet.passed&&<span className="admin-badge routine-badge-past" data-badge-passed>{t('daily.passed')}</span>}
      {sheet.changedSinceSent&&
        <span className="admin-badge routine-badge-sent" data-badge-changed>{t('daily.changedSinceSent')}</span>}
      {sheet.sent&&sheet.sentAt&&<span className="admin-help" data-daily-sent>
        {t('daily.sentAt',{when:formatDate(new Date(sheet.sentAt),digits,language)})}</span>}
      {sheet.stored
        ? <span className="admin-help" data-daily-stored>{t('daily.stored')}</span>
        : <span className="admin-help" data-daily-not-stored>{t('daily.notStored')}</span>}
      <button type="button" className="admin-mini-button" data-daily-history
        onClick={()=>setHistoryOpen(true)}>{t('history.open')}</button>
    </div>
    {sheet.passed&&<p className="admin-help" data-passed-help>{t('daily.passedHelp')}</p>}
    <p className="admin-help" data-daily-scope>{t('daily.sheetHelp')}</p>

    {/* The reset React 19 runs once an action settles is declined, for the same reason as in the master
        drawers: an answer that keeps the sheet on screen must keep showing what was written. */}
    <form action={action} className="admin-edit routine-daily-form" data-daily-form
      onReset={event=>event.preventDefault()}>
      <input type="hidden" name="classId" value={sheet.classId}/>
      <input type="hidden" name="shift" value={sheet.shift}/>
      <input type="hidden" name="date" value={sheet.date}/>
      {/* The whole day travels as one value: the drawers above edit this draft, not the database. */}
      <input type="hidden" name="periods" data-daily-periods value={JSON.stringify(draft)}/>

      <fieldset className="admin-fieldset routine-status" data-daily-status>
        <legend>{t('daily.statusLabel')}</legend>
        <label className="admin-check">
          <input type="radio" name="status" value="normal" data-status-normal checked={status==='normal'}
            onChange={()=>setStatus('normal')}/>
          {t('daily.statusNormal')}
        </label>
        <label className="admin-check">
          <input type="radio" name="status" value="adjusted" data-status-adjusted checked={status==='adjusted'}
            onChange={()=>setStatus('adjusted')}/>
          {t('daily.statusAdjusted')}
        </label>
        <label className="admin-check">
          <input type="radio" name="status" value="holiday" data-status-holiday checked={status==='holiday'}
            onChange={()=>setStatus('holiday')}/>
          {t('daily.statusHoliday')}
        </label>
      </fieldset>
      {status==='holiday'&&<p className="admin-badge routine-badge-holiday" data-holiday-banner>{t('daily.holidayBanner')}</p>}
      {status==='adjusted'&&<p className="admin-badge routine-badge-adjusted" data-adjusted-banner>{t('daily.adjustedBanner')}</p>}
      <label>{t('daily.holidayReason')}
        <input className="admin-input" name="holidayReason" maxLength={300} data-holiday-reason
          value={holidayReason} onChange={event=>setHolidayReason(event.target.value)}/>
      </label>
      <small className="admin-help">{t('daily.holidayReasonHelp')}</small>
      <label>{t('daily.notes')}
        <textarea className="admin-textarea" name="notes" maxLength={1000} data-daily-notes value={notes}
          onChange={event=>setNotes(event.target.value)}/>
      </label>

      <div className="routine-sheet-periods">
        {draft.length===0
          ? <p className="admin-help" data-daily-empty>{t('daily.noSheet')}</p>
          : <ul className="routine-periods">{draft.map((period,index)=>
            <li className="routine-period" key={period.id||`new-${index}`} data-daily-period={period.id||`new-${index}`}>
              <span className="routine-period-when" data-daily-period-time>
                {rangeWord(period.start,period.end,digits)}</span>
              <span className="routine-period-what">
                <strong data-daily-period-subject>{period.subjectBn}</strong>
                <span data-daily-period-teacher>
                  {props.teachers.find(teacher=>teacher.id===period.teacher)?.name||t('master.noTeacher')}
                </span>
                {period.room&&<span data-daily-period-room>{t('master.roomWord',{room:period.room})}</span>}
                <span className="admin-badge routine-badge-source" data-daily-period-source={period.source}>
                  {period.masterPeriod?t('daily.fromMaster'):t('daily.ownPeriod')}
                </span>
              </span>
              <span className="routine-period-actions">
                {props.canEdit&&<button type="button" className="admin-mini-button"
                  data-daily-period-edit={period.id||`new-${index}`}
                  onClick={()=>setEditor({index,period})}>{t('common.edit')}</button>}
                <details className="admin-more routine-more" data-daily-period-more={period.id||`new-${index}`}>
                  <summary aria-label={t('common.more')}>{t('common.more')}</summary>
                  <div className="admin-more-body">
                    {props.canEdit&&<button type="button" className="admin-mini-button admin-danger-text"
                      data-daily-period-leave={period.id||`new-${index}`}
                      onClick={()=>leaveOut(index)}>{t('daily.leaveOut')}</button>}
                    <small className="admin-help">{t('daily.leaveOutHelp')}</small>
                  </div>
                </details>
              </span>
            </li>)}</ul>}
      </div>

      {state.status==='clash'&&<div className="routine-warn" role="alert" data-clash-warning>
        <strong>{t('clashes.banner')}</strong>
        <p className="admin-help">{t('clashes.bannerHelp')}</p>
        <ul>{(state.clashes||[]).map((clash,index)=>
          <li key={`${clash.kind}${clash.otherStart}${index}`} data-clash-line={clash.kind}>
            {sentence(clash)}</li>)}</ul>
      </div>}
      {(state.status==='invalid'||state.status==='error'||state.status==='missing')&&
        <p role="alert" className="admin-feedback error" data-daily-refused>
          {state.status==='invalid'?t('period.invalid'):state.status==='missing'?t('common.missing'):t('common.failed')}
        </p>}
      {dirty&&<p className="admin-help" role="status" data-daily-dirty>{t('daily.unsaved')}</p>}

      <div className="routine-form-actions">
        {props.canEdit&&<button type="submit" className="button button-navy" disabled={pending} data-daily-save>
          {t('daily.save')}</button>}
        {props.canEdit&&state.status==='clash'&&<button type="submit" name="force" value="on" disabled={pending}
          className="button routine-save-anyway" data-save-anyway>{t('daily.saveAnyway')}</button>}
        {props.canEdit&&<button type="button" className="admin-mini-button" data-daily-add-period onClick={addPeriod}>
          + {t('daily.addPeriod')}</button>}
      </div>
    </form>

    <div className="routine-sheet-foot">
      {props.canEdit&&<form action={resetAction} className="routine-reset" data-daily-reset-form
        onReset={event=>event.preventDefault()}>
        <input type="hidden" name="classId" value={sheet.classId}/>
        <input type="hidden" name="shift" value={sheet.shift}/>
        <input type="hidden" name="date" value={sheet.date}/>
        <button type="submit" className="admin-mini-button" disabled={sheet.stored===false} data-daily-reset>
          {t('daily.reset')}
        </button>
        <small className="admin-help">{t('daily.resetHelp')}</small>
      </form>}
      {sheet.stored&&sheet.docId&&<RowControls kind="dailyRoutine" id={sheet.docId}
        name={`${sheet.className} · ${sheet.date}`} canDelete={props.canDelete} canArchive={false}
        onDone={()=>router.refresh()}/>}
      <p className="admin-help" data-daily-signature>
        {t('daily.periodCount',{count:formatNumber(sheet.periods.length,digits)})}</p>
    </div>

    <div key={editor?`${editor.index}:${editor.period.id||'new'}`:'closed'}>
      <DailyPeriodDrawer target={editor} onClose={()=>setEditor(null)} onSave={savePeriod} props={props}/>
    </div>
    <div key={historyOpen?`history:${sheet.history.length}`:'history:closed'}>
      <RoutineHistory open={historyOpen} onClose={()=>setHistoryOpen(false)} kind="daily"
        docId={sheet.docId||''} entries={sheet.history} weekdays={props.weekdays} digits={digits}
        canEdit={props.canEdit}/>
    </div>
  </>;
}
