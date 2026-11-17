/**
 * R9 · the routine's writes, one action per thing an operator does.
 *
 * Three rules this file holds, and holds in one place:
 *
 *   • **The role is checked here, never in the component.** Only an administrator or the owner writes a
 *     routine; a staff session reads the week and the day and may archive a record (the recycle engine's
 *     own floor), and every action below answers `error` to anybody else. The UI hides the controls too,
 *     but hiding a button is presentation — this is the gate.
 *   • **A clash is an answer, not a failure.** `saveMasterPeriod` and `saveDailySheet` come back with
 *     `status:'clash'` and the clashes themselves when the day double-books a teacher or a room, and the
 *     drawer turns that into a banner with a prominent "save anyway". Pressing it re-posts the very same
 *     form with `force=on`, and the write goes through — warnings never block a save.
 *   • **The sentence is fetched before the write.** Everything after a committed write runs on a
 *     database that has already moved, so a throw while fetching a success sentence used to land in the
 *     same `catch` as a refused write and tell the operator their save had failed. A committed write is
 *     `ok`, always.
 */
'use server';
import {getTranslations} from 'next-intl/server';
import {requireAdmin} from '@/lib/admin/guard';
import {assignmentSchema,dailySheetSchema,routinePeriodSchema} from '@/schemas/routine';
import {
  deleteMasterPeriod,resetDailySheet,restoreMasterPeriod,saveAssignment,saveDailySheet,saveMasterDay,
  saveMasterPeriod,type RoutineOutcome,
} from '@/lib/routine/engine';
import type {RoutineClash} from '@/lib/routine/conflicts';

export type RoutineActionStatus='idle'|'ok'|'invalid'|'clash'|'missing'|'duplicate'|'error';

export interface RoutineActionState{
  status:RoutineActionStatus;
  fields?:string[];
  clashes?:RoutineClash[];
  message?:string;
  /** Did the day need a document? A sheet that matches the week writes nothing, and says so. */
  stored?:boolean;
  pruned?:boolean;
}

const text=(form:FormData,name:string):string=>String(form.get(name)??'').trim();
const flagged=(form:FormData,name:string):boolean=>form.get(name)==='on';

/** The outcome the engine gave, as the state a drawer renders — plus the operator's own sentence. */
function stateFor(outcome:RoutineOutcome,message?:string):RoutineActionState{
  switch(outcome.status){
    case 'ok':return {status:'ok',message,stored:outcome.stored,pruned:outcome.pruned,clashes:outcome.clashes};
    case 'invalid':return {status:'invalid',fields:outcome.fields};
    case 'clash':return {status:'clash',clashes:outcome.clashes};
    case 'duplicate':return {status:'duplicate'};
    case 'missing':return {status:'missing'};
    default:return {status:'error'};
  }
}

/** One period of the master week: created, edited, or moved to another day. */
export async function saveMasterPeriodAction(_previous:RoutineActionState,form:FormData):Promise<RoutineActionState>{
  let savedMessage='';
  try{
    const admin=await requireAdmin();
    const t=await getTranslations('routine');
    savedMessage=t('period.saved');
    const classId=text(form,'classId'),shift=text(form,'shift');
    const weekday=Number(String(form.get('weekday')??''));
    const draft=routinePeriodSchema.safeParse({
      id:text(form,'periodId'),masterPeriod:text(form,'masterPeriod'),
      start:text(form,'start'),end:text(form,'end'),
      subjectBn:text(form,'subjectBn'),subjectEn:text(form,'subjectEn'),
      teacher:text(form,'teacher'),room:text(form,'room'),jointWith:text(form,'jointWith'),
      order:text(form,'order')||'0',note:text(form,'note'),
    });
    if(!draft.success)return {status:'invalid',fields:draft.error.issues.map(issue=>String(issue.path[0]))};
    const outcome=await saveMasterPeriod({classId,shift,weekday,draft:draft.data,
      force:flagged(form,'force'),actor:admin.id});
    return stateFor(outcome,outcome.status==='ok'?savedMessage:undefined);
  }catch{return {status:'error'}}
}

/** Delete a period of the week: into that day's own bin for thirty days, with Undo in the toast. */
export async function deleteMasterPeriodAction(_:RoutineActionState,form:FormData):Promise<RoutineActionState>{
  let message='';
  try{
    const admin=await requireAdmin();
    message=(await getTranslations('routine'))('period.deleted');
    const outcome=await deleteMasterPeriod({classId:text(form,'classId'),shift:text(form,'shift'),
      periodId:text(form,'periodId'),actor:admin.id});
    return stateFor(outcome,outcome.status==='ok'?message:undefined);
  }catch{return {status:'error'}}
}

/** Undo that delete — the toast's button, and the day's bin menu. */
export async function restoreMasterPeriodAction(_:RoutineActionState,form:FormData):Promise<RoutineActionState>{
  let message='';
  try{
    const admin=await requireAdmin();
    message=(await getTranslations('routine'))('period.restored');
    const outcome=await restoreMasterPeriod({classId:text(form,'classId'),shift:text(form,'shift'),
      periodId:text(form,'periodId'),actor:admin.id});
    return stateFor(outcome,outcome.status==='ok'?message:undefined);
  }catch{return {status:'error'}}
}

/** Edit a day of the week itself: its shift, and whether it is switched off. */
export async function saveMasterDayAction(_:RoutineActionState,form:FormData):Promise<RoutineActionState>{
  let message='';
  try{
    const admin=await requireAdmin();
    message=(await getTranslations('routine'))('day.saved');
    const shift=text(form,'shift');
    if(!shift)return {status:'invalid',fields:['shift']};
    const outcome=await saveMasterDay({id:text(form,'dayId'),shift,active:flagged(form,'active'),actor:admin.id});
    return stateFor(outcome,outcome.status==='ok'?message:undefined);
  }catch{return {status:'error'}}
}

/**
 * Save one date's working sheet — status, holiday reason, notes and every period, in one write, because
 * the day is one decision. The engine decides whether the day is worth storing at all.
 */
export async function saveDailySheetAction(_previous:RoutineActionState,form:FormData):Promise<RoutineActionState>{
  let savedMessage='',copyMessage='';
  try{
    const admin=await requireAdmin();
    const t=await getTranslations('routine');
    savedMessage=t('daily.saved');
    copyMessage=t('daily.savedCopy');
    let periods:unknown=[];
    try{periods=JSON.parse(String(form.get('periods')||'[]'))}catch{return {status:'invalid',fields:['periods']}}
    const parsed=dailySheetSchema.safeParse({
      classId:text(form,'classId'),shift:text(form,'shift'),date:text(form,'date'),
      status:text(form,'status')||'normal',holidayReason:text(form,'holidayReason'),
      notes:text(form,'notes'),periods,
    });
    if(!parsed.success)return {status:'invalid',fields:parsed.error.issues.map(issue=>String(issue.path[0]))};
    const outcome=await saveDailySheet({...parsed.data,force:flagged(form,'force'),actor:admin.id});
    /* A day that needed no document says so: "nothing to store, the week already says this" is the
       sentence that teaches the operator what the storage rule is, and it is the rule's own proof. */
    const message=outcome.status==='ok'?(outcome.stored?savedMessage:copyMessage):undefined;
    return stateFor(outcome,message);
  }catch{return {status:'error'}}
}

/** Put a date back to the week it came from. */
export async function resetDailySheetAction(_:RoutineActionState,form:FormData):Promise<RoutineActionState>{
  let message='';
  try{
    const admin=await requireAdmin();
    /* The sentence is the one that says what happened, not the label of the button that was pressed. */
    message=(await getTranslations('routine'))('daily.resetDone');
    const outcome=await resetDailySheet({classId:text(form,'classId'),shift:text(form,'shift'),
      date:text(form,'date'),actor:admin.id});
    return stateFor(outcome,outcome.status==='ok'?message:undefined);
  }catch{return {status:'error'}}
}

/** Write one teaching assignment: who takes this subject in this class, and how many periods a week. */
export async function saveAssignmentAction(_:RoutineActionState,form:FormData):Promise<RoutineActionState>{
  let message='';
  try{
    const admin=await requireAdmin();
    message=(await getTranslations('routine'))('assignment.saved');
    const parsed=assignmentSchema.safeParse({
      id:text(form,'assignmentId'),teacherId:text(form,'teacherId'),classId:text(form,'classId'),
      subjectBn:text(form,'subjectBn'),subjectEn:text(form,'subjectEn'),
      periodsPerWeek:text(form,'periodsPerWeek')||'0',active:flagged(form,'active'),note:text(form,'note'),
    });
    if(!parsed.success)return {status:'invalid',fields:parsed.error.issues.map(issue=>String(issue.path[0]))};
    const outcome=await saveAssignment({...parsed.data,actor:admin.id});
    return stateFor(outcome,outcome.status==='ok'?message:undefined);
  }catch{return {status:'error'}}
}
