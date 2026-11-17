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
import {assignmentSchema,bulkEditSchema,dayOpSchema,dispatchSchema,replaceTeacherSchema,
  restoreHistorySchema,dailySheetSchema,routinePeriodSchema} from '@/schemas/routine';
import {
  deleteMasterPeriod,markDailySheetSent,resetDailySheet,restoreMasterPeriod,saveAssignment,saveDailySheet,
  saveMasterDay,saveMasterPeriod,type RoutineOutcome,
} from '@/lib/routine/engine';
import {applyBulkEdit,applyReplaceTeacher,duplicateMasterDay,moveMasterDay,previewReplaceTeacher,
  restoreHistory,type BulkOutcome,type DayOpOutcome,type ReplaceOutcome} from '@/lib/routine/bulk';
import type {ReplaceRow} from '@/lib/routine/bulk';
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
  /** What a replacement preview found: every period it will touch, in the order the days run. */
  rows?:ReplaceRow[];
  /** How many periods a bulk tool wrote, and how many days it walked to write them. */
  touched?:number;
  days?:number;
}

/** What the bulk tools answer: the same four refusals the single-period writer gives, plus a count. */
type ToolOutcome=
  |{status:'ok';touched:number;days?:number;clashes:RoutineClash[]}
  |{status:'invalid';fields:string[]}
  |{status:'clash';clashes:RoutineClash[]}
  |{status:'missing'}
  |{status:'error'};

const text=(form:FormData,name:string):string=>String(form.get(name)??'').trim();
const flagged=(form:FormData,name:string):boolean=>form.get(name)==='on';
const list=(form:FormData,name:string):string[]=>form.getAll(name).map(value=>String(value).trim()).filter(Boolean);

/** A bulk tool's outcome as the state a panel renders, with the operator's own sentence when it wrote. */
function toolState(outcome:ToolOutcome,message?:string):RoutineActionState{
  switch(outcome.status){
    case 'ok':return {status:'ok',message,touched:outcome.touched,days:outcome.days,clashes:outcome.clashes};
    case 'invalid':return {status:'invalid',fields:outcome.fields};
    case 'clash':return {status:'clash',clashes:outcome.clashes};
    case 'missing':return {status:'missing'};
    default:return {status:'error'};
  }
}

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

/* ------------------------------------------------- Slice 2 · the tools that change many periods at once */

/**
 * One bulk edit: the periods ticked in the grid, moved by a number of minutes, or written with one room,
 * one teacher, one subject. A clash comes back as a warning with the periods still untouched, and the
 * same form posted with `force` writes all of them — the rule every other routine write follows.
 */
export async function bulkEditPeriodsAction(_:RoutineActionState,form:FormData):Promise<RoutineActionState>{
  let message='';
  try{
    const admin=await requireAdmin();
    const t=await getTranslations('routine');
    const parsed=bulkEditSchema.safeParse({
      classId:text(form,'classId'),shift:text(form,'shift'),weekday:text(form,'weekday'),
      periodIds:list(form,'periodIds'),minutes:text(form,'minutes')||'0',
      setRoom:flagged(form,'setRoom'),room:text(form,'room'),
      setTeacher:flagged(form,'setTeacher'),teacher:text(form,'teacher'),
      setSubject:flagged(form,'setSubject'),subjectBn:text(form,'subjectBn'),subjectEn:text(form,'subjectEn'),
    });
    if(!parsed.success)return {status:'invalid',fields:parsed.error.issues.map(issue=>String(issue.path[0]))};
    message=t('bulk.applied',{count:parsed.data.periodIds.length});
    const outcome:BulkOutcome=await applyBulkEdit({...parsed.data,force:flagged(form,'force'),actor:admin.id});
    return toolState(outcome,outcome.status==='ok'?message:undefined);
  }catch{return {status:'error'}}
}

/**
 * What "replace teacher X with teacher Y from date A to date B" will touch — read only. The rows and the
 * clashes come back as state so the panel can show every affected period, and the name of every teacher
 * already busy at that minute, before anything is written.
 */
export async function previewReplaceTeacherAction(_:RoutineActionState,form:FormData):Promise<RoutineActionState>{
  try{
    await requireAdmin();
    const parsed=replaceTeacherSchema.safeParse({
      from:text(form,'from'),to:text(form,'to'),
      fromDate:text(form,'fromDate'),toDate:text(form,'toDate'),
      master:flagged(form,'master'),daily:flagged(form,'daily'),
      classId:text(form,'classId'),shift:text(form,'shift'),
    });
    if(!parsed.success)return {status:'invalid',fields:parsed.error.issues.map(issue=>String(issue.path[0]))};
    const preview=await previewReplaceTeacher(parsed.data);
    if(preview.invalid.length)return {status:'invalid',fields:preview.invalid};
    /* No rows is not a refusal and not an error: it is the honest answer that nobody teaches those
       periods, so there is nothing to replace. */
    return {status:'ok',rows:preview.rows,clashes:preview.clashes,touched:preview.rows.length};
  }catch{return {status:'error'}}
}

/** Write the replacement the preview described. */
export async function applyReplaceTeacherAction(_:RoutineActionState,form:FormData):Promise<RoutineActionState>{
  let message='';
  try{
    const admin=await requireAdmin();
    const t=await getTranslations('routine');
    const parsed=replaceTeacherSchema.safeParse({
      from:text(form,'from'),to:text(form,'to'),
      fromDate:text(form,'fromDate'),toDate:text(form,'toDate'),
      master:flagged(form,'master'),daily:flagged(form,'daily'),
      classId:text(form,'classId'),shift:text(form,'shift'),
    });
    if(!parsed.success)return {status:'invalid',fields:parsed.error.issues.map(issue=>String(issue.path[0]))};
    const outcome:ReplaceOutcome=await applyReplaceTeacher({...parsed.data,force:flagged(form,'force'),
      actor:admin.id});
    if(outcome.status==='ok')message=t('replace.applied',{count:outcome.touched,days:outcome.days});
    return toolState(outcome,outcome.status==='ok'?message:undefined);
  }catch{return {status:'error'}}
}

/** Move every period of one weekday to another. */
export async function moveDayAction(_:RoutineActionState,form:FormData):Promise<RoutineActionState>{
  let message='';
  try{
    const admin=await requireAdmin();
    const t=await getTranslations('routine');
    const parsed=dayOpSchema.safeParse({classId:text(form,'classId'),shift:text(form,'shift'),
      from:text(form,'from'),to:text(form,'to')});
    if(!parsed.success)return {status:'invalid',fields:parsed.error.issues.map(issue=>String(issue.path[0]))};
    const outcome:DayOpOutcome=await moveMasterDay({...parsed.data,force:flagged(form,'force'),actor:admin.id});
    if(outcome.status==='ok')message=t('dayOps.moved',{count:outcome.touched});
    return toolState(outcome,outcome.status==='ok'?message:undefined);
  }catch{return {status:'error'}}
}

/** Duplicate a whole day onto another weekday, leaving the day it came from as it was. */
export async function duplicateDayAction(_:RoutineActionState,form:FormData):Promise<RoutineActionState>{
  let message='';
  try{
    const admin=await requireAdmin();
    const t=await getTranslations('routine');
    const parsed=dayOpSchema.safeParse({classId:text(form,'classId'),shift:text(form,'shift'),
      from:text(form,'from'),to:text(form,'to')});
    if(!parsed.success)return {status:'invalid',fields:parsed.error.issues.map(issue=>String(issue.path[0]))};
    const outcome:DayOpOutcome=await duplicateMasterDay({...parsed.data,force:flagged(form,'force'),
      actor:admin.id});
    if(outcome.status==='ok')message=t('dayOps.duplicated',{count:outcome.touched});
    return toolState(outcome,outcome.status==='ok'?message:undefined);
  }catch{return {status:'error'}}
}

/** Put a day back to one of the twenty versions it remembers. */
export async function restoreHistoryAction(_:RoutineActionState,form:FormData):Promise<RoutineActionState>{
  let message='';
  try{
    const admin=await requireAdmin();
    const t=await getTranslations('routine');
    const parsed=restoreHistorySchema.safeParse({kind:text(form,'kind'),id:text(form,'id'),
      entryId:text(form,'entryId')});
    if(!parsed.success)return {status:'invalid',fields:parsed.error.issues.map(issue=>String(issue.path[0]))};
    message=t('history.restored');
    const outcome=await restoreHistory({...parsed.data,force:flagged(form,'force'),actor:admin.id});
    return stateFor(outcome,outcome.status==='ok'?message:undefined);
  }catch{return {status:'error'}}
}

/**
 * This date's sheet went out. The write is the sent marks alone — the time, the person, and the day's own
 * signature — which is what makes "changed since sent" a fact the next edit can be measured against.
 */
export async function markDispatchSentAction(_:RoutineActionState,form:FormData):Promise<RoutineActionState>{
  let message='';
  try{
    const admin=await requireAdmin();
    const t=await getTranslations('routine');
    const parsed=dispatchSchema.safeParse({classId:text(form,'classId'),shift:text(form,'shift'),
      date:text(form,'date')});
    if(!parsed.success)return {status:'invalid',fields:parsed.error.issues.map(issue=>String(issue.path[0]))};
    message=t('dispatch.markedSent');
    const outcome=await markDailySheetSent({...parsed.data,actor:admin.id});
    return stateFor(outcome,outcome.status==='ok'?message:undefined);
  }catch{return {status:'error'}}
}
