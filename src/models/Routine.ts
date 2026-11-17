/**
 * R9 · the class routine: one weekly template, one working sheet per day, and who teaches what.
 *
 * Three collections, and the split between the first two is the whole idea:
 *
 *   • `MasterRoutine` is the permanent week — one document per class, shift and weekday, holding that
 *     day's period slots. It is what a class's timetable *is*.
 *   • `DailyRoutine` is the everyday working sheet for one date. It starts as a copy of the master
 *     day and carries only what that date needed: a substitute teacher, a room that moved, a holiday
 *     with its reason, a note. **Editing a day never edits the week.**
 *   • `TeachingAssignment` is the standing answer to "who takes this subject in this class, and how
 *     many periods a week?" — the list a new master routine is built from and a substitute is chosen
 *     against.
 *
 * Storage is deliberately light, because the database this runs on is 512 MB and a centre that wrote a
 * daily copy of every class for every day would fill it with rows that say nothing: a day that matches
 * its master routine with zero changes writes NO document at all (`src/lib/routine/day.ts` decides), and
 * the daily job prunes working sheets older than sixty days (`src/lib/routine/retention.ts`). A sheet
 * that has been sent to guardians is never pruned — it is the record of what was sent.
 *
 * Everything here is editable by the owner at will. Nothing is locked: no status freezes a routine, no
 * past date refuses a correction, and a clash between two periods is a warning with a "save anyway"
 * beside it rather than a refusal. The only fields nobody can write are the system's own — `_id`, the
 * timestamps, `createdBy`, and the bin stamps.
 */
import {Schema,model,models} from 'mongoose';
import {addRecycleFields} from './recycle';

/** A name the operator types, in both languages: Bangla is what the centre reads, English is optional. */
const text={bn:{type:String,required:true,trim:true,maxlength:200},en:{type:String,default:'',trim:true,maxlength:200}};
/** `HH:MM` on a 24-hour clock, stored as text: a period is a wall-clock time, not an instant, so no
    timezone can shift it and no `Date` can put it on the wrong day. */
const clock={type:String,required:true,match:/^([01]\d|2[0-3]):[0-5]\d$/};
/** `YYYY-MM-DD` — the working sheet's own date, again text so Dhaka's day is the day that is stored. */
const dayString={type:String,required:true,match:/^\d{4}-\d{2}-\d{2}$/};
const classRef={type:Schema.Types.ObjectId,ref:'CenterClassGroup',required:true};
const userRef={type:Schema.Types.ObjectId,ref:'User',default:null};

/**
 * One period slot, shared by the master week and the daily sheet.
 *
 * The period carries its OWN bin fields, because a period is a subdocument: deleting the 8:00 গণিত
 * period must not bin the class's whole Sunday, and it must still be undoable for thirty days the way
 * every other delete in this app is. `deletedAt` on the period hides it from the grid, `purgeAt` is when
 * the daily job drops it for good, and the toast's Undo clears both. This is the same shape the
 * social-proof milestones use inside their settings document (R1.6): the bin is a rule about a record,
 * and a record can live inside another one.
 *
 * `source` and `masterPeriod` belong to the daily sheet alone: they say whether a period is the
 * master's own (prefilled, untouched) or one this date wrote, and which master period an override
 * stands in for. Both are derived by the engine and neither is a field anybody edits.
 */
const period=new Schema({
  start:clock,
  end:clock,
  subject:text,
  /** Who takes it. Empty is allowed — a period nobody has been assigned yet is a period worth seeing. */
  teacher:userRef,
  room:{type:String,default:'',trim:true,maxlength:80},
  /** Joint session: the `_id` of the period in another class this one runs together with. */
  jointWith:{type:Schema.Types.ObjectId,default:null},
  /** The owner's own ordering inside a day, for two periods that start at the same time. */
  order:{type:Number,default:0,min:0,max:99,validate:Number.isSafeInteger},
  note:{type:String,default:'',trim:true,maxlength:300},
  source:{type:String,enum:['master','own'],default:'own'},
  masterPeriod:{type:Schema.Types.ObjectId,default:null},
  deletedAt:{type:Date,default:null},
  deletedBy:{type:Schema.Types.ObjectId,ref:'User',default:null},
  purgeAt:{type:Date,default:null},
},{_id:true});

/**
 * The label the Recycle Bin and a confirm dialog read: a snapshot of the class's name, and of the
 * teacher's, written by the engine on every save. `nameOf` in the bin registry is synchronous and the
 * bin page has no language to ask for, so a deleted record carries the name it was known by rather than
 * an id nobody can read — the same reason a payment stores its `groupId`. It is a label, not an input:
 * renaming the class refreshes it at the next save.
 */
const label={bn:{type:String,default:''},en:{type:String,default:''}};

const masterSchema=new Schema({
  classGroup:classRef,
  classLabel:{...label,_id:false},
  /** The shift this week belongs to. A class that runs morning and evening has two master weeks. */
  shift:{type:String,required:true,trim:true,maxlength:100},
  /** 0 = Sunday … 6 = Saturday, the week as Bangladesh reads it. */
  weekday:{type:Number,required:true,min:0,max:6,validate:Number.isSafeInteger},
  periods:{type:[period],default:[]},
  /** Archive, the staff floor: a day switched off stays readable and stops being offered as a template. */
  active:{type:Boolean,default:true},
  createdBy:userRef,
},{timestamps:true});
addRecycleFields(masterSchema);
/* One week day per class and shift. The partial filter is what lets a binned day coexist with the new
   day written in its place: `deletedAt` is `null` on every live document and a Date on every binned one. */
masterSchema.index({classGroup:1,shift:1,weekday:1},{unique:true,partialFilterExpression:{deletedAt:{$eq:null}}});
masterSchema.index({classGroup:1,weekday:1});
masterSchema.index({'periods.purgeAt':1});
masterSchema.index({'periods.teacher':1,weekday:1});

const dailySchema=new Schema({
  date:dayString,
  classGroup:classRef,
  classLabel:{...label,_id:false},
  shift:{type:String,required:true,trim:true,maxlength:100},
  /** `normal` runs as the week says, `adjusted` is a day somebody changed, `holiday` is a day off. */
  status:{type:String,enum:['normal','adjusted','holiday'],default:'normal'},
  holidayReason:{type:String,default:'',trim:true,maxlength:300},
  notes:{type:String,default:'',trim:true,maxlength:1000},
  periods:{type:[period],default:[]},
  /* The sent marks. Slice 1 stores them and reads them — the badge that says a sheet has changed since
     it went out — and the dispatch that writes them is a later slice. `sentSignature` is the day's own
     hash at the moment it was sent, which is what makes "changed since" a fact rather than a guess. */
  sentAt:{type:Date,default:null},
  sentBy:userRef,
  sentSignature:{type:String,default:'',match:/^(?:|[a-f0-9]{64})$/},
  createdBy:userRef,
},{timestamps:true});
addRecycleFields(dailySchema);
dailySchema.index({date:1,classGroup:1,shift:1},{unique:true,partialFilterExpression:{deletedAt:{$eq:null}}});
/* The retention prune reads the date alone, oldest first, so it gets its own index. */
dailySchema.index({date:1});
dailySchema.index({'periods.purgeAt':1});

const assignmentSchema=new Schema({
  teacher:{type:Schema.Types.ObjectId,ref:'User',required:true},
  teacherLabel:{type:String,default:''},
  classGroup:classRef,
  classLabel:{...label,_id:false},
  subject:text,
  /** How many periods a week this teacher takes of this subject here — the number a timetable is built to. */
  periodsPerWeek:{type:Number,required:true,min:0,max:60,validate:Number.isSafeInteger},
  active:{type:Boolean,default:true},
  note:{type:String,default:'',trim:true,maxlength:300},
  createdBy:userRef,
},{timestamps:true});
addRecycleFields(assignmentSchema);
assignmentSchema.index({teacher:1,classGroup:1,'subject.bn':1},{unique:true,partialFilterExpression:{deletedAt:{$eq:null}}});
assignmentSchema.index({classGroup:1,active:1});
assignmentSchema.index({teacher:1,active:1});

export const MasterRoutine=models.MasterRoutine||model('MasterRoutine',masterSchema);
export const DailyRoutine=models.DailyRoutine||model('DailyRoutine',dailySchema);
export const TeachingAssignment=models.TeachingAssignment||model('TeachingAssignment',assignmentSchema);
