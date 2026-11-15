'use client';
/**
 * R5 · Exams — the forms that shape an exam and publish it.
 *
 * One form body serves both create and edit, so an exam cannot be created with a field the edit form
 * does not have (the two drifting apart is how a centre ends up with exams it cannot correct). Three
 * details are load-bearing:
 *
 *   • **A request id makes the create replayable.** It is minted in the browser and posted with the
 *     shape; a double submit returns the same exam instead of a second one.
 *   • **The scale is a choice, not a textarea.** The owner picks a saved scale — the centre's one idea of
 *     what an A+ is worth — or types a one-off `min:label:point` list for this exam alone. The bands are
 *     snapshotted onto the exam either way, so a scale edited in December cannot rewrite a March result.
 *   • **Every word is a catalog key.** The type options used to be hardcoded English in a Bangla screen;
 *     they now come from `exams.typeLabels.*` like everything else on the page.
 */
import {useTranslations} from 'next-intl';
import {useActionState,useEffect,useState} from 'react';
import {BanglaDate} from './bangla-date';
import {createExamAction,updateExamAction,publishExamAction,unpublishExamAction,saveGradingScaleAction} from '@/actions/center-exams';
import type {ExamState} from '@/lib/exams/exam-state';
import {DEFAULT_GRADING_RANGES,EXAM_TYPES,MAX_EXAM_SUBJECTS,type GradeRange} from '@/lib/exams/vocab';

const initial:ExamState={status:'idle'};

/** A refusal painted in the reader's language: the action sends a catalog key and its params. */
export function ExamError({state}:{state:ExamState}){
  const t=useTranslations('exams');
  if(state.status!=='error'||!state.messageKey)return null;
  return <p role="alert" className="admin-feedback error" data-exam-error>{t('form.notSavedPrefix')} {t(state.messageKey,state.messageParams||{})}</p>;
}

export interface ClassOption{id:string;name:string}
export interface ScaleOption{id:string;name:string;ranges:GradeRange[];active:boolean}
export interface ExamShapeValue{
  id?:string;name:string;type:string;date:string;scaleName:string;
  classIds:string[];subjects:{name:string;full:number;pass:number}[];bands:{min:number;label:string;point:number}[];
}

/** The scale a saved exam used, as ranges the form can show; an exam with no scale name is the default. */
function rangesOf(bands:{min:number;label:string;point:number}[]):GradeRange[]{
  const sorted=[...bands].sort((a,b)=>b.min-a.min);
  return sorted.map((band,index)=>({min:band.min,max:index===0?100:sorted[index-1].min-1,grade:band.label,point:band.point}));
}

const CUSTOM='custom';

/**
 * The exam's shape: name, type, date, the classes it covers, its subjects and the scale it grades by.
 *
 * `mode` decides which action it posts to and which button it shows; everything else is the same form,
 * because the two must never disagree about what an exam is made of.
 */
export function ExamShapeForm({mode,groups,scales,value}:{mode:'create'|'edit';groups:ClassOption[];scales:ScaleOption[];value:ExamShapeValue}){
  const t=useTranslations('exams');
  const action=mode==='create'?createExamAction:updateExamAction;
  const [state,submit,pending]=useActionState(action,initial);
  const [requestId,setRequestId]=useState('');
  const [subjectCount,setSubjectCount]=useState(Math.max(1,value.subjects.length));
  const savedScale=scales.find(scale=>scale.name===value.scaleName);
  const [scaleChoice,setScaleChoice]=useState(savedScale?savedScale.id:value.bands.length?CUSTOM:'');
  const [classIds,setClassIds]=useState<string[]>(value.classIds);
  useEffect(()=>{if(mode==='create')setRequestId(crypto.randomUUID())},[mode]);
  const typed=scaleChoice===CUSTOM;
  const bandsText=typed
    ? (value.bands.length?value.bands:DEFAULT_GRADING_RANGES.map(range=>({min:range.min,label:range.grade,point:range.point})))
      .map(band=>`${band.min}:${band.label}:${band.point}`).join('\n')
    : '';
  const preview=scales.find(scale=>scale.id===scaleChoice)?.ranges||DEFAULT_GRADING_RANGES;
  const ready=(mode==='edit'||!!requestId)&&classIds.length>0;
  return <form action={submit} className="admin-edit" data-exam-form={mode}>
    {mode==='edit'&&value.id&&<input type="hidden" name="exam" value={value.id}/>}
    {mode==='create'&&<input name="requestId" type="hidden" value={requestId}/>}
    <label>{t('form.nameLabel')}<input className="admin-input" name="name" maxLength={120} required defaultValue={value.name}/></label>
    <fieldset data-exam-classes><legend>{t('form.classLabel')}</legend>
      <p className="admin-help">{t('form.classHelp')}</p>
      {groups.map(group=><label className="admin-check" key={group.id}>
        <input type="checkbox" name="classId" value={group.id} checked={classIds.includes(group.id)}
          onChange={event=>setClassIds(list=>event.target.checked?[...list,group.id]:list.filter(id=>id!==group.id))}/> {group.name}
      </label>)}
      {!groups.length&&<p className="admin-feedback error">{t('form.noClasses')}</p>}
    </fieldset>
    <label>{t('form.dateLabel')}<BanglaDate name="date" required defaultValue={value.date}/></label>
    <label>{t('form.typeLabel')}<select className="admin-select" name="type" defaultValue={value.type||'monthly'}>
      {EXAM_TYPES.map(type=><option value={type} key={type}>{t(`typeLabels.${type}`)}</option>)}
    </select></label>
    <fieldset><legend>{t('form.subjectsLegend')}</legend>
      {Array.from({length:subjectCount},(_,index)=><div className="center-exam-subject" key={index}>
        <label>{t('form.subjectLabel')} {index+1}<input name={`subject-${index}`} className="admin-input" required maxLength={100} defaultValue={value.subjects[index]?.name||''}/></label>
        <label>{t('form.fullLabel')}<input name={`full-${index}`} className="admin-input" inputMode="numeric" required defaultValue={value.subjects[index]?.full??''}/></label>
        <label>{t('form.passLabel')}<input name={`pass-${index}`} className="admin-input" inputMode="numeric" required defaultValue={value.subjects[index]?.pass??''}/></label>
      </div>)}
      <button type="button" className="admin-mini-button" disabled={subjectCount>=MAX_EXAM_SUBJECTS} onClick={()=>setSubjectCount(count=>count+1)}>{t('form.addSubject')}</button>
      {subjectCount>1&&<button type="button" className="admin-mini-button" onClick={()=>setSubjectCount(count=>count-1)}>{t('form.removeLast')}</button>}
      {mode==='edit'&&<p className="admin-help">{t('form.subjectsLockedHelp')}</p>}
    </fieldset>
    <label>{t('form.scaleLabel')}<select className="admin-select" name="scaleId" value={scaleChoice} onChange={event=>setScaleChoice(event.target.value)} data-exam-scale>
      <option value="">{t('form.scaleDefault')}</option>
      {scales.map(scale=><option value={scale.id} key={scale.id}>{scale.name}{scale.active?` · ${t('form.scaleActive')}`:''}</option>)}
      <option value={CUSTOM}>{t('form.scaleCustom')}</option>
    </select></label>
    {!typed&&<div className="admin-table-wrap"><table className="center-scale-preview" data-scale-preview><caption>{t('form.scalePreview')}</caption>
      <thead><tr><th>{t('scale.col.grade')}</th><th>{t('scale.col.from')}</th><th>{t('scale.col.to')}</th><th>{t('scale.col.point')}</th></tr></thead>
      <tbody>{preview.map(range=><tr key={range.grade}><td>{range.grade}</td><td>{range.min}</td><td>{range.max}</td><td>{range.point}</td></tr>)}</tbody>
    </table></div>}
    {typed&&<><label>{t('form.bandsLabel')}<textarea name="bands" className="admin-input" rows={8} required defaultValue={bandsText}/></label>
      <p className="admin-help">{t('form.bandsHelp')}</p>
      <label>{t('form.scaleNameLabel')}<input className="admin-input" name="scaleName" maxLength={80} defaultValue={value.scaleName==='default'?'':value.scaleName}/></label></>}
    <label className="admin-check"><input name="confirm" type="checkbox" value="YES" required/> {t('form.confirmReview')}</label>
    <button className="button button-navy" disabled={!ready||pending||state.status==='ok'} data-exam-submit>
      {mode==='create'?t('form.createButton'):t('form.saveButton')}
    </button>
    {state.status==='ok'&&<p role="status" data-exam-saved>{mode==='create'?t('form.created'):t('form.saved')}</p>}
    <ExamError state={state}/>
  </form>;
}

/** Publish, and the way back: unpublish. Both need the operator to say they have checked the results. */
export function PublishCenterExam({exam,published}:{exam:string;published:boolean}){
  const t=useTranslations('exams');
  const action=published?unpublishExamAction:publishExamAction;
  const [state,submit,pending]=useActionState(action,initial);
  return <form action={submit} data-exam-publish={published?'unpublish':'publish'}>
    <input type="hidden" name="exam" value={exam}/>
    <p>{published?t('publish.unpublishNote'):t('publish.note')}</p>
    <label className="admin-check"><input type="checkbox" name="confirm" value="YES" required/> {published?t('publish.unpublishConfirm'):t('publish.confirmReview')}</label>
    <button className="button button-navy" disabled={pending}>{published?t('publish.unpublishButton'):t('publish.button')}</button>
    {state.status==='ok'&&<p role="status">{published?t('publish.unpublished'):t('publish.published')}</p>}
    <ExamError state={state}/>
  </form>;
}

/**
 * The grading-scale editor: the ranges the centre grades by, with the GPA point each one carries.
 *
 * A scale is saved whole — ranges are posted as one JSON list — because a scale edited range by range is
 * a scale that is broken between the clicks, and an exam created in that moment would snapshot the
 * broken one.
 */
export function GradingScaleForm({scale,scales}:{scale:{id:string;name:string;ranges:GradeRange[];active:boolean}|null;scales:ScaleOption[]}){
  const t=useTranslations('exams');
  const [state,submit,pending]=useActionState(saveGradingScaleAction,initial);
  const [name,setName]=useState(scale?.name||'');
  const [ranges,setRanges]=useState<GradeRange[]>(scale?.ranges?.length?scale.ranges:DEFAULT_GRADING_RANGES);
  const [active,setActive]=useState(scale?.active??false);
  const set=(index:number,patch:Partial<GradeRange>):void=>setRanges(list=>list.map((range,at)=>at===index?{...range,...patch}:range));
  return <form action={submit} className="admin-edit" data-scale-form>
    {scale?.id&&<input type="hidden" name="scale" value={scale.id}/>}
    <input type="hidden" name="ranges" value={JSON.stringify(ranges)}/>
    <input type="hidden" name="active" value={active?'YES':'NO'}/>
    <label>{t('scale.nameLabel')}<input className="admin-input" name="name" maxLength={100} required value={name} onChange={event=>setName(event.target.value)}/></label>
    <div className="admin-table-wrap"><table className="center-scale-editor"><caption>{t('scale.rangesHeading')}</caption>
      <thead><tr><th>{t('scale.col.grade')}</th><th>{t('scale.col.point')}</th><th>{t('scale.col.from')}</th><th>{t('scale.col.to')}</th><th/></tr></thead>
      <tbody>{ranges.map((range,index)=><tr key={`${range.grade}-${index}`}>
        <td><input className="admin-input" value={range.grade} maxLength={30} aria-label={t('scale.col.grade')} onChange={event=>set(index,{grade:event.target.value})}/></td>
        <td><input className="admin-input" inputMode="decimal" value={range.point} aria-label={t('scale.col.point')} onChange={event=>set(index,{point:Number(event.target.value)||0})}/></td>
        <td><input className="admin-input" inputMode="numeric" value={range.min} aria-label={t('scale.col.from')} onChange={event=>set(index,{min:Number(event.target.value)||0})}/></td>
        <td><input className="admin-input" inputMode="numeric" value={range.max} aria-label={t('scale.col.to')} onChange={event=>set(index,{max:Number(event.target.value)||0})}/></td>
        <td>{ranges.length>2&&<button type="button" className="admin-mini-button" data-scale-remove={index} onClick={()=>setRanges(list=>list.filter((_,at)=>at!==index))}>{t('scale.remove')}</button>}</td>
      </tr>)}</tbody>
    </table></div>
    <button type="button" className="admin-mini-button" disabled={ranges.length>=12} data-scale-add onClick={()=>setRanges(list=>[...list,{min:0,max:0,grade:'',point:0}])}>{t('scale.add')}</button>
    <label className="admin-check"><input type="checkbox" checked={active} onChange={event=>setActive(event.target.checked)}/> {t('scale.activeLabel')}</label>
    <p className="admin-help">{t('scale.help')}</p>
    {scales.length>1&&<p className="admin-help">{t('scale.others')}</p>}
    <button className="button button-navy" disabled={pending||!name} data-scale-save>{t('scale.save')}</button>
    {state.status==='ok'&&<p role="status" data-scale-saved>{t('scale.saved')}</p>}
    <ExamError state={state}/>
  </form>;
}
