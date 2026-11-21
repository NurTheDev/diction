/**
 * R9 · what the routine forms accept.
 *
 * Every box on the master builder, the daily sheet and the assignment drawer is checked here, in one
 * place, before anything is written: a time is `HH:MM` on a 24-hour clock, a date is a real
 * `YYYY-MM-DD`, a weekday is 0–6, an id is an ObjectId or empty, and a period ends after it starts.
 * Bangla digits are folded to ASCII first, because an operator who reads `০৮:৩০` types `০৮:৩০`.
 *
 * Nothing here decides *permission* and nothing here refuses a clash — a clash is a warning with a
 * "save anyway" beside it (`src/lib/routine/conflicts.ts`), and the role check lives in the action.
 */
import {z} from 'zod';
import {asciiDigits} from '@/lib/admin/format';

/** Fold Bangla digits, squeeze spaces, and accept an empty box as "nothing chosen". */
const fold=(value:unknown):string=>asciiDigits(String(value??'').trim());

const id=z.string().transform(fold).pipe(z.string().regex(/^[a-f0-9]{24}$/i));
const maybeId=z.string().transform(fold).pipe(
  z.union([z.literal(''),z.string().regex(/^[a-f0-9]{24}$/i)]).transform(value=>value||''));
const clock=z.string().transform(fold).pipe(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/));
const dayText=z.string().transform(fold).pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
  const at=new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(at.getTime())&&at.toISOString().slice(0,10)===value;
}));
const name=z.string().trim().min(1).max(200);
const optionalText=(max:number)=>z.string().trim().max(max).default('');
const integer=(min:number,max:number)=>z.union([
  z.string().transform(fold).pipe(z.string().regex(/^\d+$/).transform(Number)),
  z.number(),
]).pipe(z.number().int().min(min).max(max));

export const weekdaySchema=integer(0,6);

/** One period as a drawer posts it. `id` is present when an existing period is being edited. */
export const routinePeriodSchema=z.object({
  id:maybeId,
  masterPeriod:maybeId,
  start:clock,
  end:clock,
  subjectBn:name,
  subjectEn:optionalText(200),
  teacher:maybeId,
  room:optionalText(80),
  jointWith:maybeId,
  order:integer(0,99).default(0),
  note:optionalText(300),
}).refine(period=>{
  const [startHour,startMinute]=period.start.split(':').map(Number);
  const [endHour,endMinute]=period.end.split(':').map(Number);
  return startHour*60+startMinute<endHour*60+endMinute;
},{path:['end']});

export type RoutinePeriodInput=z.infer<typeof routinePeriodSchema>;

/** A day of the master week: which class, which shift, which weekday. */
export const masterDaySchema=z.object({
  classId:id,
  shift:z.string().trim().min(1).max(100),
  weekday:weekdaySchema,
  active:z.boolean().default(true),
});

export type MasterDayInput=z.infer<typeof masterDaySchema>;

/** Which kind of day a weekday of the week is: taught, the weekly day off, or the weekly exam day. */
export const masterDayTypeSchema=z.object({
  classId:id,
  shift:z.string().trim().min(1).max(100),
  weekday:weekdaySchema,
  dayType:z.enum(['class','off','exam']),
});

/** A period as the daily sheet posts it: the same shape, and the engine decides what is worth storing. */
export const dailySheetSchema=z.object({
  classId:id,
  shift:z.string().trim().min(1).max(100),
  date:dayText,
  status:z.enum(['normal','adjusted','holiday']),
  holidayReason:optionalText(300),
  notes:optionalText(1000),
  periods:z.array(routinePeriodSchema).max(40),
}).refine(sheet=>sheet.status!=='holiday'||!!sheet.holidayReason.trim(),{path:['holidayReason']});

export type DailySheetInput=z.infer<typeof dailySheetSchema>;

/** Who teaches what, where, how often. */
export const assignmentSchema=z.object({
  id:maybeId,
  teacherId:id,
  classId:id,
  subjectBn:name,
  subjectEn:optionalText(200),
  periodsPerWeek:integer(0,60),
  active:z.boolean().default(true),
  note:optionalText(300),
});

export type AssignmentInput=z.infer<typeof assignmentSchema>;

/* --------------------------------------------------------- Slice 2 · the tools that write many periods */

/** An integer that may be negative: a clock moved ten minutes *earlier* is a shift of −10. */
const signedInteger=(min:number,max:number)=>z.union([
  z.string().transform(fold).pipe(z.string().regex(/^-?\d+$/).transform(Number)),
  z.number(),
]).pipe(z.number().int().min(min).max(max));

/**
 * One bulk edit: the periods ticked in the grid, and what happens to all of them at once.
 *
 * The three `set` flags are what makes "leave this field alone" different from "write an empty value
 * into it" — a room cleared on purpose is a checkbox and an empty box, and a room nobody asked about is
 * no checkbox at all.
 */
export const bulkEditSchema=z.object({
  classId:id,
  shift:z.string().trim().min(1).max(100),
  weekday:weekdaySchema,
  periodIds:z.array(maybeId).max(80).transform(values=>values.filter(Boolean)),
  minutes:signedInteger(-240,240).default(0),
  setRoom:z.boolean().default(false),
  room:optionalText(80),
  setTeacher:z.boolean().default(false),
  teacher:maybeId,
  setSubject:z.boolean().default(false),
  subjectBn:optionalText(200),
  subjectEn:optionalText(200),
}).refine(input=>input.periodIds.length>0,{path:['periodIds']});

export type BulkEditFormInput=z.infer<typeof bulkEditSchema>;

/**
 * "Replace teacher X with teacher Y from date A to date B." The range gates the working sheets; the week
 * itself is rewritten only when `master` is asked for, because a teacher away for a fortnight comes back.
 */
export const replaceTeacherSchema=z.object({
  from:id,
  to:id,
  fromDate:dayText,
  toDate:dayText,
  master:z.boolean().default(false),
  daily:z.boolean().default(true),
  /** Empty means every class, and an empty shift means every shift: a centre-wide replacement. */
  classId:maybeId,
  shift:z.string().trim().max(100).default(''),
}).refine(input=>input.from.toLowerCase()!==input.to.toLowerCase(),{path:['to']})
  .refine(input=>input.toDate>=input.fromDate,{path:['toDate']})
  .refine(input=>input.master||input.daily,{path:['scope']});

export type ReplaceTeacherFormInput=z.infer<typeof replaceTeacherSchema>;

/** A whole day, moved to another weekday or duplicated onto one. */
export const dayOpSchema=z.object({
  classId:id,
  shift:z.string().trim().min(1).max(100),
  from:weekdaySchema,
  to:weekdaySchema,
}).refine(input=>input.from!==input.to,{path:['to']});

export type DayOpFormInput=z.infer<typeof dayOpSchema>;

/** One "restore this version" tap: which day, and which of the versions it remembers. */
export const restoreHistorySchema=z.object({
  kind:z.enum(['master','daily']),
  id:id,
  entryId:z.string().transform(fold).pipe(z.string().regex(/^[a-f0-9]{24}$/i)),
});

export type RestoreHistoryFormInput=z.infer<typeof restoreHistorySchema>;

/** The dispatch panel's own write: this date's sheet went out. */
export const dispatchSchema=z.object({
  classId:id,
  shift:z.string().trim().min(1).max(100),
  date:dayText,
});

export type DispatchFormInput=z.infer<typeof dispatchSchema>;
