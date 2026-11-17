'use client';
/**
 * R9 · Slice 2 · the tools that change many periods at once.
 *
 * Three surfaces, all of them on the master routine because that is where the week lives:
 *
 *   • **Bulk edit.** The operator ticks periods in the grid — the ticks live in the board, beside the
 *     cards they are on — and this panel moves their clock by a number of minutes or writes one room, one
 *     teacher or one subject across all of them, in one write.
 *   • **Replace a teacher.** The sick-leave tool: who is away, who takes over, from which date to which,
 *     and whether the week itself changes or only the working sheets inside the range. It answers with a
 *     read-only preview of every period it would touch and every place the incoming teacher is already
 *     busy, and only then does the button that writes appear.
 *   • **Day operations.** Move a whole day to another weekday, or duplicate one — both offered inside the
 *     day's own editor, next to the shift and the on/off switch it already had.
 *
 * All three follow the rule the single-period drawer set: a clash comes back as a banner naming who and
 * where, nothing is written, and a second button beside the first writes it anyway.
 */
import {useActionState,useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useLocale,useTranslations} from 'next-intl';
import {BanglaDate} from './bangla-date';
import {useClashSentence} from './routine-drawer';
import {showRecycleToast} from './recycle-toast-host';
import {applyReplaceTeacherAction,bulkEditPeriodsAction,duplicateDayAction,moveDayAction,
  previewReplaceTeacherAction,type RoutineActionState} from '@/actions/routine';
import type {ReplaceRow} from '@/lib/routine/bulk';
import {formatDate,formatNumber,type Digits} from '@/lib/admin/format';
import {rangeWord} from '@/lib/routine/time';

const idle:RoutineActionState={status:'idle'};

/** The clock moves this panel offers: five minutes at a time, because that is the routine's own grid. */
const MINUTE_STEPS=[-60,-45,-30,-20,-15,-10,-5,0,5,10,15,20,30,45,60];

export interface BulkPicked{weekday:number;ids:string[]}

export interface RoutineToolsProps{
  classId:string;
  shift:string;
  /** Every class, so the replacement can be centre-wide rather than only this class. */
  classes:{id:string;name:string}[];
  /** Every shift written anywhere, for the same reason. */
  shifts:string[];
  weekdays:string[];
  teachers:{id:string;name:string}[];
  rooms:string[];
  digits:Digits;
  /** Dhaka's today, and the last date the replacement range offers — both decided on the server. */
  today:string;
  until:string;
  picked:BulkPicked;
  onClear:()=>void;
}

/** The warning every tool in this file can answer with, drawn the same way each time. */
function ClashBanner({state,digits}:{state:RoutineActionState;digits:Digits}){
  const t=useTranslations('routine');
  const sentence=useClashSentence();
  if(state.status!=='clash')return null;
  return <div className="routine-warn" role="alert" data-tool-clash>
    <strong>{t('clashes.banner')}</strong>
    <p className="admin-help">{t('clashes.bannerHelp')}</p>
    <ul>{(state.clashes||[]).map((clash,index)=>
      <li key={`${clash.kind}${clash.otherStart}${index}`} data-clash-line={clash.kind}>
        {sentence(clash,digits)}</li>)}</ul>
  </div>;
}

/** A refusal, named — the same three words the rest of the routine uses. */
function Refused({state,hook}:{state:RoutineActionState;hook:string}){
  const t=useTranslations('routine');
  const fields=(state.fields||[]).join(',');
  if(state.status!=='invalid'&&state.status!=='missing'&&state.status!=='error')return null;
  return <p role="alert" className="admin-feedback error" data-tool-refused={hook}>
    {state.status==='invalid'
      ? (fields.includes('change')?t('bulk.changeRequired'):t('period.invalid'))
      : state.status==='missing'?t('common.missing'):t('common.failed')}
  </p>;
}

/** The bulk edit: everything ticked in one day, changed in one write. */
function BulkForm({props,onDone}:{props:RoutineToolsProps;onDone:(message:string)=>void}){
  const t=useTranslations('routine'),router=useRouter();
  const {classId,shift,weekdays,teachers,rooms,digits,picked,onClear}=props;
  const [state,action,pending]=useActionState(bulkEditPeriodsAction,idle);
  const [minutes,setMinutes]=useState('0');
  const [roomOn,setRoomOn]=useState(false),[room,setRoom]=useState('');
  const [teacherOn,setTeacherOn]=useState(false),[teacher,setTeacher]=useState('');
  const [subjectOn,setSubjectOn]=useState(false),[subjectBn,setSubjectBn]=useState(''),[subjectEn,setSubjectEn]=useState('');
  useEffect(()=>{
    if(state.status!=='ok')return;
    /* The sentence outlives this form: a finished bulk edit drops the ticks, and the ticks are what this
       form is rendered for, so the message is handed up to the panel that stays. */
    onDone(state.message||'');
    router.refresh();
    onClear();
  },[state]);
  return <form action={action} className="admin-edit routine-form" data-bulk-form
    onReset={event=>event.preventDefault()}>
    <input type="hidden" name="classId" value={classId}/>
    <input type="hidden" name="shift" value={shift}/>
    <input type="hidden" name="weekday" value={picked.weekday}/>
    {picked.ids.map(id=><input type="hidden" name="periodIds" key={id} value={id}/>)}
    <p className="admin-help" data-bulk-selected>
      {t('bulk.selected',{count:formatNumber(picked.ids.length,digits),day:weekdays[picked.weekday]||''})}
    </p>
    <label>{t('bulk.minutes')}
      <select className="admin-select" name="minutes" data-bulk-minutes value={minutes}
        onChange={event=>setMinutes(event.target.value)}>
        {MINUTE_STEPS.map(step=><option key={step} value={step}>{formatNumber(step,digits)}</option>)}
      </select>
    </label>
    <small className="admin-help">{t('bulk.minutesHelp')}</small>
    <label className="admin-check">
      <input type="checkbox" name="setRoom" data-bulk-set-room checked={roomOn}
        onChange={event=>setRoomOn(event.target.checked)}/>
      {t('bulk.setRoom')}
    </label>
    {roomOn&&<label>{t('bulk.roomLabel')}
      <input className="admin-input" name="room" maxLength={80} list="routine-bulk-rooms" data-bulk-room
        value={room} onChange={event=>setRoom(event.target.value)}/>
      <datalist id="routine-bulk-rooms">{rooms.map(value=><option key={value} value={value}/>)}</datalist>
    </label>}
    <label className="admin-check">
      <input type="checkbox" name="setTeacher" data-bulk-set-teacher checked={teacherOn}
        onChange={event=>setTeacherOn(event.target.checked)}/>
      {t('bulk.setTeacher')}
    </label>
    {teacherOn&&<label>{t('bulk.teacherLabel')}
      <select className="admin-select" name="teacher" data-bulk-teacher value={teacher}
        onChange={event=>setTeacher(event.target.value)}>
        <option value="">{t('period.teacherNone')}</option>
        {teachers.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}
      </select>
    </label>}
    <label className="admin-check">
      <input type="checkbox" name="setSubject" data-bulk-set-subject checked={subjectOn}
        onChange={event=>setSubjectOn(event.target.checked)}/>
      {t('bulk.setSubject')}
    </label>
    {subjectOn&&<>
      <label>{t('bulk.subjectBn')}
        <input className="admin-input" name="subjectBn" maxLength={200} data-bulk-subject-bn
          value={subjectBn} onChange={event=>setSubjectBn(event.target.value)}/>
      </label>
      <label>{t('bulk.subjectEn')}
        <input className="admin-input" name="subjectEn" maxLength={200} data-bulk-subject-en
          value={subjectEn} onChange={event=>setSubjectEn(event.target.value)}/>
      </label>
    </>}
    <ClashBanner state={state} digits={digits}/>
    <Refused state={state} hook="bulk"/>
    <div className="routine-form-actions">
      <button type="submit" className="button button-navy" disabled={pending} data-bulk-apply>
        {t('bulk.apply')}</button>
      {state.status==='clash'&&<button type="submit" name="force" value="on" disabled={pending}
        className="button routine-save-anyway" data-bulk-force>{t('bulk.anyway')}</button>}
      <button type="button" className="admin-mini-button" onClick={onClear} data-bulk-clear>
        {t('bulk.clear')}</button>
    </div>
  </form>;
}

/** One row of the replacement preview, as the operator reads it. */
function ReplaceRowLine({row,weekdays,digits}:{row:ReplaceRow;weekdays:string[];digits:Digits}){
  const t=useTranslations('routine');
  const language=useLocale()==='en'?'en':'bn';
  /* A dated sheet is read as its date; a day of the week happens every week, and says so. */
  const when=row.kind==='daily'
    ? formatDate(new Date(`${row.date}T00:00:00+06:00`),digits,language)
    : t('replace.everyWeek',{day:weekdays[row.weekday]||''});
  return <li data-replace-row={`${row.kind}:${row.date||row.weekday}:${row.start}`}>
    <span data-replace-when>{when}</span>
    <span data-replace-class>{row.className}{row.shift?` · ${row.shift}`:''}</span>
    <span data-replace-time>{rangeWord(row.start,row.end,digits)}</span>
    <span data-replace-subject>{row.subjectBn}</span>
    {row.room&&<span data-replace-room>{t('dispatch.roomWord',{room:row.room})}</span>}
  </li>;
}

/**
 * Replace a teacher across a range of dates.
 *
 * Two forms over one set of fields, and the order is the point: the first asks what would change and
 * answers with the rows and the clashes, and only once that answer is on screen does the second — the one
 * that writes — appear. The fields live in state so the write posts exactly what the preview read.
 */
function ReplaceForm({props}:{props:RoutineToolsProps}){
  const t=useTranslations('routine'),router=useRouter();
  const sentence=useClashSentence();
  const {classes,shifts,weekdays,teachers,digits,today,until}=props;
  const [fields,setFields]=useState({from:'',to:'',fromDate:today,toDate:until,classId:'',shift:'',
    master:false,daily:true});
  const write=(patch:Partial<typeof fields>):void=>setFields(current=>({...current,...patch}));
  const [preview,previewAction,previewPending]=useActionState(previewReplaceTeacherAction,idle);
  const [state,action,pending]=useActionState(applyReplaceTeacherAction,idle);
  const [done,setDone]=useState('');
  useEffect(()=>{
    if(state.status!=='ok')return;
    setDone(state.message||'');
    router.refresh();
  },[state]);
  const rows=preview.rows||[];
  const clashes=state.status==='clash'?state.clashes||[]:preview.clashes||[];
  return <div className="routine-replace" data-replace-tool>
    <form action={previewAction} className="admin-edit routine-form" data-replace-preview
      onReset={event=>event.preventDefault()}>
      <label>{t('replace.from')}
        <select className="admin-select" name="from" data-replace-from value={fields.from}
          onChange={event=>write({from:event.target.value})}>
          <option value="">{t('period.teacherNone')}</option>
          {teachers.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
      </label>
      <label>{t('replace.to')}
        <select className="admin-select" name="to" data-replace-to value={fields.to}
          onChange={event=>write({to:event.target.value})}>
          <option value="">{t('period.teacherNone')}</option>
          {teachers.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
      </label>
      <label>{t('replace.fromDate')}
        <span data-replace-from-date>
          <BanglaDate name="fromDate" value={fields.fromDate} onChange={value=>write({fromDate:value})}/>
        </span>
      </label>
      <label>{t('replace.toDate')}
        <span data-replace-to-date>
          <BanglaDate name="toDate" value={fields.toDate} onChange={value=>write({toDate:value})}/>
        </span>
      </label>
      <label>{t('replace.classLabel')}
        <select className="admin-select" name="classId" data-replace-class value={fields.classId}
          onChange={event=>write({classId:event.target.value})}>
          <option value="">{t('replace.allClasses')}</option>
          {classes.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      </label>
      <label>{t('replace.shiftLabel')}
        <select className="admin-select" name="shift" data-replace-shift value={fields.shift}
          onChange={event=>write({shift:event.target.value})}>
          <option value="">{t('replace.allShifts')}</option>
          {shifts.map(value=><option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label className="admin-check">
        <input type="checkbox" name="master" data-replace-master checked={fields.master}
          onChange={event=>write({master:event.target.checked})}/>
        {t('replace.scopeMaster')}
      </label>
      <label className="admin-check">
        <input type="checkbox" name="daily" data-replace-daily checked={fields.daily}
          onChange={event=>write({daily:event.target.checked})}/>
        {t('replace.scopeDaily')}
      </label>
      <Refused state={preview} hook="replace-preview"/>
      <div className="routine-form-actions">
        <button type="submit" className="button button-navy" disabled={previewPending} data-replace-show>
          {t('replace.preview')}</button>
      </div>
    </form>

    {preview.status==='ok'&&rows.length===0&&
      <p className="admin-help" data-replace-none>{t('replace.noneFound')}</p>}
    {rows.length>0&&<>
      <p className="admin-help" data-replace-count>
        {t('replace.previewTitle',{count:formatNumber(rows.length,digits)})}</p>
      <ul className="routine-replace-rows" data-replace-rows>
        {rows.map(row=><ReplaceRowLine key={`${row.kind}${row.date}${row.classId}${row.start}${row.subjectBn}`}
          row={row} weekdays={weekdays} digits={digits}/>)}
      </ul>
      {clashes.length>0&&<div className="routine-warn" role="alert" data-replace-clashes>
        <strong>{t('clashes.banner')}</strong>
        <p className="admin-help">{t('clashes.bannerHelp')}</p>
        <ul>{clashes.map((clash,index)=><li key={`${clash.kind}${clash.otherStart}${index}`}
          data-clash-line={clash.kind}>{sentence(clash,digits)}</li>)}</ul>
      </div>}
      <form action={action} className="admin-edit routine-form" data-replace-apply
        onReset={event=>event.preventDefault()}>
        <input type="hidden" name="from" value={fields.from}/>
        <input type="hidden" name="to" value={fields.to}/>
        <input type="hidden" name="fromDate" value={fields.fromDate}/>
        <input type="hidden" name="toDate" value={fields.toDate}/>
        <input type="hidden" name="classId" value={fields.classId}/>
        <input type="hidden" name="shift" value={fields.shift}/>
        {fields.master&&<input type="hidden" name="master" value="on"/>}
        {fields.daily&&<input type="hidden" name="daily" value="on"/>}
        <ClashBanner state={state} digits={digits}/>
        <Refused state={state} hook="replace"/>
        {done&&<p className="admin-feedback ok" data-replace-done>{done}</p>}
        <div className="routine-form-actions">
          <button type="submit" className="button button-navy" disabled={pending} data-replace-run>
            {t('replace.apply')}</button>
          {state.status==='clash'&&<button type="submit" name="force" value="on" disabled={pending}
            className="button routine-save-anyway" data-replace-force>{t('replace.anyway')}</button>}
        </div>
      </form>
    </>}
  </div>;
}

/** The two tools that write many periods, in one panel on the master routine. */
export function RoutineTools(props:RoutineToolsProps){
  const t=useTranslations('routine');
  const [done,setDone]=useState('');
  /* A box inside the week's own panel rather than a panel of its own: these tools act on the grid they
     sit above, and the ticks that feed them are on the cards of that grid. */
  return <div className="routine-tools" data-routine-tools>
    <h2 data-bulk-title>{t('bulk.title')}</h2>
    <p className="admin-help" data-bulk-help>{t('bulk.help')}</p>
    {done&&<p className="admin-feedback ok" role="status" data-bulk-done>{done}</p>}
    {props.picked.ids.length===0
      ? <p className="admin-help" data-bulk-none>{t('bulk.none')}</p>
      : <BulkForm props={props} onDone={setDone}/>}
    <details className="admin-fold routine-fold" data-replace-fold>
      <summary data-replace-title>{t('replace.title')}</summary>
      <div className="admin-fold-body">
        <p className="admin-help" data-replace-help>{t('replace.help')}</p>
        <ReplaceForm props={props}/>
      </div>
    </details>
  </div>;
}

/** One day operation: a weekday to land on, and the write. */
function DayOpForm({kind,classId,shift,from,weekdays,digits,onDone}:{
  kind:'move'|'duplicate';classId:string;shift:string;from:number;weekdays:string[];digits:Digits;
  onDone:()=>void;
}){
  const t=useTranslations('routine'),router=useRouter();
  const action=kind==='move'?moveDayAction:duplicateDayAction;
  const [state,run,pending]=useActionState(action,idle);
  const [to,setTo]=useState(weekdays.map((_,index)=>index).filter(index=>index!==from)[0]??0);
  const [done,setDone]=useState('');
  useEffect(()=>{
    if(state.status!=='ok')return;
    setDone(state.message||'');
    /* The day editor closes on a finished move, so the sentence also travels as the toast every other
       write in this app travels as, and stays on screen after the drawer that earned it is gone. */
    showRecycleToast({state:{status:'ok'},success:state.message||'',error:''});
    router.refresh();
    onDone();
  },[state]);
  const hook=kind==='move'?'move':'duplicate';
  return <form action={run} className="admin-edit routine-form" data-dayop-form={hook}
    onReset={event=>event.preventDefault()}>
    <input type="hidden" name="classId" value={classId}/>
    <input type="hidden" name="shift" value={shift}/>
    <input type="hidden" name="from" value={from}/>
    <label>{t('dayOps.toDay')}
      <select className="admin-select" name="to" data-dayop-to={hook} value={to}
        onChange={event=>setTo(Number(event.target.value))}>
        {weekdays.map((word,index)=>index===from?null
          : <option key={word+index} value={index}>{word}</option>)}
      </select>
    </label>
    <small className="admin-help">{t(kind==='move'?'dayOps.moveHelp':'dayOps.duplicateHelp')}</small>
    <ClashBanner state={state} digits={digits}/>
    <Refused state={state} hook={hook}/>
    {done&&<p className="admin-feedback ok" data-dayop-done={hook}>{done}</p>}
    <div className="routine-form-actions">
      <button type="submit" className="button button-navy" disabled={pending} data-dayop-run={hook}>
        {t(kind==='move'?'dayOps.move':'dayOps.duplicate')}</button>
      {state.status==='clash'&&<button type="submit" name="force" value="on" disabled={pending}
        className="button routine-save-anyway" data-dayop-force={hook}>{t('dayOps.anyway')}</button>}
    </div>
  </form>;
}

/** Move this day, or duplicate it: both offered inside the day's own editor. */
export function RoutineDayOps({classId,shift,from,weekdays,digits,onDone}:{
  classId:string;shift:string;from:number;weekdays:string[];digits:Digits;onDone:()=>void;
}){
  const t=useTranslations('routine');
  return <div className="routine-dayops" data-dayops={from}>
    <h3 data-dayop-move-title>{t('dayOps.moveTitle')}</h3>
    <DayOpForm kind="move" classId={classId} shift={shift} from={from} weekdays={weekdays} digits={digits}
      onDone={onDone}/>
    <h3 data-dayop-duplicate-title>{t('dayOps.duplicateTitle')}</h3>
    <DayOpForm kind="duplicate" classId={classId} shift={shift} from={from} weekdays={weekdays}
      digits={digits} onDone={onDone}/>
  </div>;
}

/**
 * A button that hands the page to the printer — the daily notice, or a teacher's own schedule.
 *
 * It marks the body first, and the print stylesheet reads that mark: everything the screen shows goes
 * invisible and the one sheet meant for paper becomes the page. The mark is taken off again when the
 * browser says the print is over, so the screen comes back as it was.
 */
export function PrintButton({label,hook}:{label:string;hook:string}){
  useEffect(()=>{
    if(typeof window==='undefined')return;
    const clear=():void=>{document.body.removeAttribute('data-print')};
    window.addEventListener('afterprint',clear);
    return ()=>window.removeEventListener('afterprint',clear);
  },[]);
  return <button type="button" className="admin-mini-button" data-print={hook}
    onClick={()=>{
      if(typeof document==='undefined')return;
      document.body.setAttribute('data-print',hook);
      window.print();
    }}>{label}</button>;
}
