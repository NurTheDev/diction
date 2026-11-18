'use client';
/**
 * O1 · Class and batch management — the screen.
 *
 * One card per class, and each card answers the four questions an owner asks before anything else:
 * which shifts this class runs, which room it sits in, how many children are enrolled, and how many
 * batches are going. Under them, three ways in — the class's roll, its timetable, and its own edit —
 * because a card that can only be read is a card that sends the operator somewhere else to do the work.
 *
 * Two rules this file holds that are easy to lose:
 *
 * · **A write is one write, and it says what it is doing.** The save is disabled while its request is in
 *   flight, turns a spinner and changes its own word to "saving…", and the answer arrives as a toast in
 *   the corner: the class's own sentence on success, and on failure the reason — a name that is already
 *   taken, a class somebody else changed first, boxes that were wrong. A refusal that only re-renders a
 *   form is a refusal nobody can explain to the person standing at the desk.
 * · **What was typed survives a refusal.** React resets a form when its action settles, so on a failure
 *   the boxes would come back empty and the operator would type the class again. Every field here is
 *   therefore held in state and painted from it: a refused write keeps the draft that was refused.
 */
import {useActionState,useEffect,useMemo,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {Link} from '@/i18n/navigation';
import {assignClassBatchesAction,saveClassGroupAction,type ClassActionState} from '@/actions/class-admin';
import {showRecycleToast} from './toast-bus';
import {SubmitButton} from './submit-button';
import {formatNumber,type Digits} from '@/lib/admin/format';
import {shiftWordsOf,type BatchOption,type ClassCardView} from '@/lib/classes/class-shared';

const idle:ClassActionState={status:'idle'};

/** The three shifts a class can run, in the order the day happens. */
const SHIFT_KEYS=['morning','day','evening'] as const;

/** What the modal holds while it is open: one draft per field, so a refusal cannot empty it. */
interface ClassDraft{
  id:string;revision:string;nameBn:string;nameEn:string;level:string;room:string;
  shifts:string[];fee:string;year:string;active:boolean;
}

const emptyDraft=(year:number):ClassDraft=>({
  id:'',revision:'',nameBn:'',nameEn:'',level:'',room:'',shifts:[],fee:'',year:String(year),active:true,
});

const draftOf=(card:ClassCardView):ClassDraft=>({
  id:card.id,revision:card.revision,nameBn:card.nameBn,nameEn:card.nameEn,level:card.level,
  room:card.room,shifts:[...card.shifts],
  fee:card.monthlyFee>0?String(card.monthlyFee):'',year:String(card.academicYear),active:card.active,
});

export interface ClassManagementProps{
  cards:ClassCardView[];
  batchOptions:BatchOption[];
  year:number;
  digits:Digits;
  canEdit:boolean;
}

/** The screen: a toolbar with the one way in, then a card per class. */
export function ClassManagement({cards,batchOptions,year,digits,canEdit}:ClassManagementProps){
  const t=useTranslations('classAdmin');
  const [draft,setDraft]=useState<ClassDraft|null>(null);
  const isNew=(draft?.id||'')==='';
  return <section className="admin-panel" data-class-board>
    <div className="admin-panel-head">
      <h2>{t('section')}</h2>
      <span data-class-count>{formatNumber(cards.length,digits)}</span>
    </div>
    <div className="admin-panel-body">
      <p className="admin-help" data-class-cards-help>{t('cardsHelp')}</p>
      <div className="class-toolbar">
        {canEdit&&<button type="button" className="button button-navy" data-class-add onClick={()=>setDraft(emptyDraft(year))}>
          + {t('addClass')}
        </button>}
      </div>
      {cards.length===0
        ? <div className="admin-feedback" data-class-empty>
            <p>{t('empty')}</p><p className="admin-help">{t('emptyHelp')}</p>
          </div>
        : <div className="class-cards" data-class-cards>
            {cards.map(card=><ClassCard key={card.id} card={card} batchOptions={batchOptions} digits={digits}
              canEdit={canEdit} onEdit={()=>setDraft(draftOf(card))}/>)}
          </div>}
    </div>
    {/* One modal, keyed on the class it holds: opening another class starts from that class's own
        facts rather than from the last draft, and a write in flight is never aimed at the wrong id. */}
    <div key={draft?`${draft.id||'new'}:${draft.revision}`:'closed'}>
      {draft&&<ClassModal draft={draft} isNew={isNew} year={year} digits={digits}
        batchOptions={batchOptions} onClose={()=>setDraft(null)}/>}
    </div>
  </section>;
}

/** One class: its name, the four facts, and the three ways in. */
function ClassCard({card,batchOptions,digits,canEdit,onEdit}:{
  card:ClassCardView;batchOptions:BatchOption[];digits:Digits;canEdit:boolean;onEdit:()=>void;
}){
  const t=useTranslations('classAdmin');
  /* A shift key is shown through the catalog; a word the owner typed themselves is shown as it stands,
     because it is theirs — see `shiftWordsOf`. */
  const words=shiftWordsOf(card);
  const room=card.room.trim();
  return <article className="class-card" data-class-card={card.id} data-class-active={card.active?'true':'false'}>
    <div className="class-card-head">
      <h2 data-class-name>{card.name}{card.nameEn&&card.nameEn!==card.nameBn
        ? <small> ({card.nameEn})</small>:null}</h2>
      <span className="admin-badge" data-class-status={card.active?'active':'archived'}>
        {card.active?t('statusActive'):t('statusArchived')}</span>
    </div>
    <div className="class-card-facts">
      <span data-class-level>{card.level.trim()?card.level.trim():t('levelNone')}</span>
      <span data-class-shifts={words.length?'yes':'none'}>
        <b>{t('shifts')}:</b>{' '}
        {words.length
          ? <span className="class-shift-chips">{words.map(word=><span key={word} data-class-shift={word}>
              {shiftWord(word,t)}</span>)}</span>
          : t('noShifts')}
      </span>
      <span data-class-room={room?'yes':'none'}><b>{t('room')}:</b> {room||t('noRoom')}</span>
      <span data-class-students><b>{t('students')}:</b> {t('studentsCount',{count:formatNumber(card.students,digits)})}</span>
      <span data-class-batches><b>{t('batches')}:</b> {card.batches>0
        ? t('batchesCount',{count:formatNumber(card.batches,digits)}):t('noBatches')}</span>
      <span data-class-fee>{card.monthlyFee>0
        ? t('feeWord',{amount:formatNumber(card.monthlyFee,digits)}):t('feeNone')}</span>
      <span data-class-teachers>{card.teachers.length?card.teachers.join(' · '):t('teacherNone')}</span>
      <span data-class-year>{t('yearLabel')}: {formatNumber(card.academicYear,digits)}</span>
    </div>
    <div className="class-card-actions">
      <Link className="admin-mini-button" data-class-students-link={card.id}
        href={`/admin/students/classes/${card.id}`}>{t('viewStudents')}</Link>
      <Link className="admin-mini-button" data-class-routine-link={card.id}
        href={`/admin/routine/master?classId=${card.id}`}>{t('viewRoutine')}</Link>
      {canEdit&&<button type="button" className="admin-mini-button class-card-more"
        data-class-edit={card.id} onClick={onEdit}>{t('edit')} ⋯</button>}
      <details className="admin-more class-card-more" data-class-more={card.id}>
        <summary className="admin-mini-button">{t('more')}</summary>
        <div className="admin-more-body">
          <Link href={`/admin/students/classes/${card.id}`}>{t('viewHub')}</Link>
          <span className="admin-help">{batchOptions.filter(batch=>batch.classId===card.id).length
            ? t('batchesCount',{count:formatNumber(batchOptions.filter(batch=>batch.classId===card.id).length,digits)})
            : t('noBatches')}</span>
        </div>
      </details>
    </div>
  </article>;
}

/** A shift key through the catalog; any other word as its owner wrote it. */
function shiftWord(word:string,t:(key:string)=>string):string{
  const key=word.trim().toLowerCase();
  return key==='morning'?t('shiftMorning'):key==='day'?t('shiftDay'):key==='evening'?t('shiftEvening'):word;
}

/** The add/edit sheet: the class's own facts, and — for a class that exists — the batches it runs. */
function ClassModal({draft,isNew,year,digits,batchOptions,onClose}:{
  draft:ClassDraft;isNew:boolean;year:number;digits:Digits;batchOptions:BatchOption[];onClose:()=>void;
}){
  const t=useTranslations('classAdmin');
  const router=useRouter();
  const dialog=useRef<HTMLDialogElement>(null);
  const [value,setValue]=useState<ClassDraft>(draft);
  const write=(patch:Partial<ClassDraft>):void=>setValue(current=>({...current,...patch}));
  const levels=useMemo(()=>{
    const raw=t.raw('levels');
    return Array.isArray(raw)?raw.map(entry=>String(entry)):[];
  },[t]);

  /* The refusal's own sentence, in the language being read — the toast says why, the form says where. */
  const why=(state:ClassActionState):string=>state.status==='duplicate'?t('duplicate')
    :state.status==='conflict'?t('conflict'):state.status==='invalid'?t('invalid'):t('saveFailed');

  const run=useMemo(()=>async (previous:ClassActionState,form:FormData):Promise<ClassActionState>=>{
    const next=await saveClassGroupAction(previous,form);
    /* Raised on the way back from the write rather than in an effect: the answer is the moment the
       operator is waiting for, and an effect can miss a state that unmounts the sheet. */
    showRecycleToast(next.status==='ok'
      ? {state:{status:'ok'},success:String(next.message||t('saved')),error:''}
      : {state:{status:'error'},success:'',error:why(next)});
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[t,value]);
  const [state,action,pending]=useActionState(run,idle);

  const batches=useMemo(()=>async (previous:ClassActionState,form:FormData):Promise<ClassActionState>=>{
    const next=await assignClassBatchesAction(previous,form);
    showRecycleToast(next.status==='ok'
      ? {state:{status:'ok'},success:String(next.message||t('saved')),error:''}
      : {state:{status:'error'},success:'',error:why(next)});
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[t]);
  const [batchState,batchAction,batchPending]=useActionState(batches,idle);
  /* The batch boxes are held here too, for the same reason: a refused write must not undo the ticks. */
  const [picked,setPicked]=useState<string[]>(()=>batchOptions.filter(batch=>batch.classId===draft.id)
    .map(batch=>batch.id));

  useEffect(()=>{
    const node=dialog.current;
    if(!node)return;
    if(!node.open)node.showModal();
    return ()=>{if(node.open)node.close()};
  },[]);
  /* A write that landed closes the sheet and re-reads the board; a refusal leaves it open with the
     draft still in it, because that draft is what was wrong. */
  useEffect(()=>{
    if(state.status!=='ok')return;
    router.refresh();
    if(dialog.current?.open)dialog.current.close();
    onClose();
  },[state.status,router,onClose]);

  const toggleShift=(key:string):void=>write({
    shifts:value.shifts.includes(key)?value.shifts.filter(entry=>entry!==key):[...value.shifts,key],
  });

  return <dialog ref={dialog} className="class-modal" data-class-modal={isNew?'new':draft.id}
    aria-labelledby="class-modal-title" onReset={event=>event.preventDefault()}>
    <div className="class-modal-head">
      <h2 id="class-modal-title">{isNew?t('newTitle'):t('editTitle')}</h2>
      <button type="button" className="admin-drawer-close" data-class-close onClick={onClose}
        aria-label={t('close')}>×</button>
    </div>
    <form className="class-modal-body" action={action} onReset={event=>event.preventDefault()}
      data-class-form={isNew?'new':draft.id}>
      <input type="hidden" name="id" value={value.id}/>
      <input type="hidden" name="revision" value={value.revision}/>
      <div className="class-form-grid">
        <label>{t('nameLabel')}
          <input className="admin-input" name="nameBn" required maxLength={120} data-class-name-bn
            value={value.nameBn} onChange={event=>write({nameBn:event.target.value})}/>
        </label>
        <label>{t('nameEnLabel')}
          <input className="admin-input" name="nameEn" maxLength={120} data-class-name-en
            value={value.nameEn} onChange={event=>write({nameEn:event.target.value})}/>
        </label>
        <label>{t('levelLabel')}
          <input className="admin-input" name="level" maxLength={80} list="class-levels" data-class-level
            value={value.level} onChange={event=>write({level:event.target.value})}/>
          <datalist id="class-levels">{levels.map(level=><option key={level} value={level}/>)}</datalist>
          <small className="admin-help">{t('levelHelp')}</small>
        </label>
        <label>{t('roomLabel')}
          <input className="admin-input" name="room" maxLength={80} data-class-room
            placeholder="Room-1201" value={value.room} onChange={event=>write({room:event.target.value})}/>
          <small className="admin-help">{t('roomHelp')}</small>
        </label>
        <label>{t('feeLabel')}
          <input className="admin-input" name="monthlyFee" inputMode="numeric" maxLength={9}
            data-class-fee value={value.fee} onChange={event=>write({fee:event.target.value})}/>
          <small className="admin-help">{t('feeHelp')}</small>
        </label>
        {isNew&&<label>{t('yearLabel')}
          <input className="admin-input" name="academicYear" inputMode="numeric" required maxLength={4}
            data-class-year value={value.year} onChange={event=>write({year:event.target.value})}/>
        </label>}
        {!isNew&&<input type="hidden" name="academicYear" value={value.year}/>}
      </div>
      <fieldset className="admin-check-group" data-class-shift-boxes>
        <legend>{t('shiftsLabel')}</legend>
        <small className="admin-help">{t('shiftsHelp')}</small>
        {SHIFT_KEYS.map(key=><label className="admin-check" key={key}>
          <input type="checkbox" name="shifts" value={key} data-class-shift-box={key}
            checked={value.shifts.includes(key)} onChange={()=>toggleShift(key)}/>
          {shiftWord(key,t)}
        </label>)}
      </fieldset>
      {!isNew&&<label className="admin-check"><input type="checkbox" name="active" data-class-active-box
        checked={value.active} onChange={event=>write({active:event.target.checked})}/> {t('activeCheck')}</label>}
      {isNew&&<input type="hidden" name="active" value="on"/>}
      {state.status==='invalid'&&<p className="admin-feedback error" role="alert" data-class-invalid>
        {t('invalid')}{state.fields?.length?` — ${state.fields.join(', ')}`:''}</p>}
      {state.status==='duplicate'&&<p className="admin-feedback error" role="alert" data-class-duplicate>
        {t('duplicate')}</p>}
      {state.status==='conflict'&&<p className="admin-feedback error" role="alert" data-class-conflict>
        {t('conflict')}</p>}
      {state.status==='error'&&<p className="admin-feedback error" role="alert" data-class-error>
        {t('saveFailed')}</p>}
      <div className="routine-form-actions">
        <SubmitButton pending={pending} data-class-save busyLabel={t('saving')} label={t('save')}/>
        <button type="button" className="admin-mini-button" data-class-cancel onClick={onClose}>
          {t('close')}</button>
        {isNew&&<span className="admin-help">{t('desc')}</span>}
        {!isNew&&<span className="admin-help">{t('yearLabel')}: {formatNumber(Number(value.year)||year,digits)}</span>}
      </div>
    </form>

    {/* A class that exists can be given its batches. It is a second write on purpose: the batches are
        the batch screen's own records, and assigning them must not have to re-save the class. */}
    {!isNew&&<form className="class-modal-body" action={batchAction} data-class-batch-form={draft.id}
      onReset={event=>event.preventDefault()}>
      <input type="hidden" name="id" value={draft.id}/>
      <fieldset className="admin-check-group">
        <legend>{t('batchesLabel')}</legend>
        <small className="admin-help" data-class-batch-help>{t('batchesHelp')}</small>
        {batchOptions.length===0&&<p className="admin-help" data-class-batch-none>{t('noBatchOptions')}</p>}
        {batchOptions.map(batch=><label className="admin-check" key={batch.id}>
          <input type="checkbox" name="batchIds" value={batch.id} data-class-batch-box={batch.id}
            checked={picked.includes(batch.id)}
            onChange={()=>setPicked(current=>current.includes(batch.id)
              ? current.filter(entry=>entry!==batch.id):[...current,batch.id])}/>
          {batch.name}{batch.grade?` · ${batch.grade}`:''}
        </label>)}
      </fieldset>
      {batchState.status==='ok'&&<p className="admin-feedback ok" role="status" data-class-batch-saved>
        {batchState.message||t('batchesSaved')}</p>}
      {batchState.status!=='ok'&&batchState.status!=='idle'
        &&<p className="admin-feedback error" role="alert" data-class-batch-error>{why(batchState)}</p>}
      <div className="routine-form-actions">
        <SubmitButton pending={batchPending} disabled={batchOptions.length===0} data-class-batch-save
          busyLabel={t('saving')} label={t('saveBatches')}/>
      </div>
    </form>}
  </dialog>;
}
