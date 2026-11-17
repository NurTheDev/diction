'use client';
/**
 * R9 · who teaches what: the teaching assignments beside the week they are written into.
 *
 * An assignment is the standing answer to "who takes গণিত in নবম শ্রেণি, and how many periods a week?" —
 * the list a master routine is built from and a substitute is chosen against. It sits on the routine
 * screen rather than on a settings screen because it is read while the week is being written.
 *
 * The row follows the house policy exactly: a visible Edit button, a ⋯ menu with Archive for staff and
 * Delete for an administrator, and a delete that goes to the Recycle Bin for thirty days with Undo. The
 * only fields nobody can write are the system's own — the id, the timestamps and who created the row.
 */
import {useActionState,useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {RoutineDrawer} from './routine-drawer';
import {RowControls} from './row-controls';
import {saveAssignmentAction,type RoutineActionState} from '@/actions/routine';
import type {AssignmentView,RoutineClass,RoutineTeacher} from '@/lib/routine/read';
import {formatNumber,type Digits} from '@/lib/admin/format';

const idle:RoutineActionState={status:'idle'};

export interface RoutineAssignmentsProps{
  assignments:AssignmentView[];
  teachers:RoutineTeacher[];
  classes:RoutineClass[];
  classId:string;
  digits:Digits;
  canEdit:boolean;
  canDelete:boolean;
}

interface AssignmentDraft{
  id:string;teacherId:string;classId:string;subjectBn:string;subjectEn:string;
  periodsPerWeek:number;active:boolean;note:string;
}

const emptyDraft=(classId:string):AssignmentDraft=>
  ({id:'',teacherId:'',classId,subjectBn:'',subjectEn:'',periodsPerWeek:1,active:true,note:''});

function AssignmentDrawer({target,onClose,props}:{
  target:AssignmentDraft|null;onClose:()=>void;props:RoutineAssignmentsProps;
}){
  const t=useTranslations('routine'),router=useRouter();
  const [draft,setDraft]=useState<AssignmentDraft|null>(target);
  const [state,action,pending]=useActionState(saveAssignmentAction,idle);
  useEffect(()=>{
    if(state.status!=='ok')return;
    onClose();
    router.refresh();
  },[state]);
  const write=(patch:Partial<AssignmentDraft>):void=>
    setDraft(current=>current?{...current,...patch}:current);
  return <RoutineDrawer open={!!target} onClose={onClose}
    title={draft?.id?t('assignment.edit'):t('assignment.add')}>
    {draft&&<form action={action} className="admin-edit routine-form" data-assignment-form={draft.id||'new'}
      onReset={event=>event.preventDefault()}>
      <input type="hidden" name="assignmentId" value={draft.id}/>
      <label>{t('assignment.teacher')} *
        <select className="admin-select" name="teacherId" required data-assignment-teacher value={draft.teacherId}
          onChange={event=>write({teacherId:event.target.value})}>
          <option value="" disabled>{t('assignment.teacher')}</option>
          {props.teachers.map(teacher=><option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
        </select>
      </label>
      {props.teachers.length===0&&<small className="admin-help">{t('assignment.noTeachers')}</small>}
      <label>{t('assignment.subjectBn')} *
        <input className="admin-input" name="subjectBn" required maxLength={200} data-assignment-subject-bn
          value={draft.subjectBn} onChange={event=>write({subjectBn:event.target.value})}/>
      </label>
      <label>{t('assignment.subjectEn')}
        <input className="admin-input" name="subjectEn" maxLength={200} value={draft.subjectEn}
          onChange={event=>write({subjectEn:event.target.value})}/>
      </label>
      <label>{t('assignment.class')} *
        <select className="admin-select" name="classId" required data-assignment-class value={draft.classId}
          onChange={event=>write({classId:event.target.value})}>
          {props.classes.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      </label>
      <label>{t('assignment.periodsPerWeek')} *
        <input className="admin-input" name="periodsPerWeek" required inputMode="numeric" maxLength={2}
          data-assignment-periods value={String(draft.periodsPerWeek)}
          onChange={event=>write({periodsPerWeek:Number(event.target.value.replace(/\D/g,''))||0})}/>
      </label>
      <label>{t('assignment.note')}
        <textarea className="admin-textarea" name="note" maxLength={300} value={draft.note}
          onChange={event=>write({note:event.target.value})}/>
      </label>
      <label className="admin-check">
        <input type="checkbox" name="active" data-assignment-active checked={draft.active}
          onChange={event=>write({active:event.target.checked})}/>
        {t('assignment.active')}
      </label>
      {state.status!=='idle'&&state.status!=='ok'&&
        <p role="alert" className="admin-feedback error" data-assignment-refused>
          {state.status==='duplicate'?t('assignment.duplicate'):state.status==='invalid'?t('assignment.invalid'):t('common.failed')}
        </p>}
      <div className="routine-form-actions">
        <button type="submit" className="button button-navy" disabled={pending} data-assignment-save>
          {t('assignment.save')}
        </button>
        <button type="button" className="admin-mini-button" onClick={onClose}>{t('period.cancel')}</button>
      </div>
    </form>}
  </RoutineDrawer>;
}

export function RoutineAssignments(props:RoutineAssignmentsProps){
  const t=useTranslations('routine');
  const [target,setTarget]=useState<AssignmentDraft|null>(null);
  const draftOf=(assignment:AssignmentView):AssignmentDraft=>({
    id:assignment.id,teacherId:assignment.teacherId,classId:assignment.classId,
    subjectBn:assignment.subjectBn,subjectEn:assignment.subjectEn,
    periodsPerWeek:assignment.periodsPerWeek,active:assignment.active,note:assignment.note,
  });
  return <section className="admin-panel routine-assignments" data-assignments>
    <div className="admin-panel-head">
      <h2>{t('assignment.title')}</h2>
      {props.canEdit&&<button type="button" className="button button-navy" data-assignment-add
        onClick={()=>setTarget(emptyDraft(props.classId))}>+ {t('assignment.add')}</button>}
    </div>
    <div className="admin-panel-body">
      <p className="admin-help">{t('assignment.sub')}</p>
      {props.assignments.length===0
        ? <div className="admin-empty" data-assignment-empty>
          <strong>{t('assignment.empty')}</strong><p>{t('assignment.emptyHelp')}</p></div>
        : <div className="admin-table-wrap"><table className="admin-table admin-responsive-table">
          <thead><tr>
            <th>{t('assignment.headTeacher')}</th><th>{t('assignment.headSubject')}</th>
            <th>{t('assignment.headClass')}</th><th>{t('assignment.headPeriods')}</th>
            <th>{t('assignment.headStatus')}</th><th>{t('common.edit')}</th>
          </tr></thead>
          <tbody>{props.assignments.map(assignment=><tr key={assignment.id} data-assignment-row={assignment.id}>
            <td data-label={t('assignment.headTeacher')} data-assignment-teacher-name>{assignment.teacherName}</td>
            <td data-label={t('assignment.headSubject')} data-assignment-subject>{assignment.subjectBn}</td>
            <td data-label={t('assignment.headClass')}>{assignment.className}</td>
            <td data-label={t('assignment.headPeriods')} data-assignment-count>
              {t('assignment.perWeek',{count:formatNumber(assignment.periodsPerWeek,props.digits)})}</td>
            <td data-label={t('assignment.headStatus')}>
              <span className="admin-badge" data-assignment-active={assignment.active?'yes':'no'}>
                {assignment.active?t('assignment.on'):t('assignment.off')}</span></td>
            <td><div className="admin-bin-actions">
              {props.canEdit&&<span className="admin-row-direct">
                <button type="button" className="admin-mini-button" data-assignment-edit={assignment.id}
                  onClick={()=>setTarget(draftOf(assignment))}>{t('assignment.edit')}</button>
              </span>}
              {/* The row's own controls raise their own toast: Archive for a staff session, Delete for
                  an administrator, and neither needs a second sentence from this table. */}
              <RowControls kind="teachingAssignment" id={assignment.id}
                name={`${assignment.teacherName} · ${assignment.subjectBn}`}
                canDelete={props.canDelete} canArchive/>
            </div></td>
          </tr>)}</tbody>
        </table></div>}
    </div>
    <div key={target?target.id||'new':'closed'}>
      <AssignmentDrawer target={target} onClose={()=>setTarget(null)} props={props}/>
    </div>
  </section>;
}
