/**
 * R3 · Visitor leads — the record that replaces the owner's "Visitor sheet".
 *
 * Three decisions in this schema come straight from the brief and are worth stating, because each one
 * looks like an omission otherwise:
 *
 *   • **`phones[]` keeps the original spelling next to the normalized number.** A cell can hold two
 *     numbers, a number with a label, or ten digits that are short; `src/lib/leads/lead-phone.ts`
 *     cleans what can be cleaned and flags the rest, and the flag has to be able to quote what was
 *     actually written. Normalizing in place would throw that away.
 *   • **`flags[]` is stored, not shown once and forgotten.** Anything the app could not read — a short
 *     number, a class of `Column 1`, a suspicious year — travels with the lead, so a row imported in
 *     November is still honest about its doubts in March. Nothing here is ever repaired silently.
 *   • **`studentName` is required.** A lead with no name cannot be called, and inventing "Unknown"
 *     would be a guess; the importer keeps such a row in its own preview and asks the owner to fill the
 *     name in before a Lead is written. The raw sheet row is never lost — it just is not a lead yet.
 *
 * `nextFollowUp` is a `YYYY-MM-DD` day in Asia/Dhaka rather than a Date: ISO days compare exactly as
 * strings, so "today's follow-ups" and "overdue" need no timezone arithmetic at query time and cannot
 * drift with the hour the daily job runs.
 *
 * Soft delete comes from `addRecycleFields`, so a binned lead disappears from every list, cannot be
 * edited and cannot be deleted twice — and is purged by the scheduled job after 30 days, like every
 * other record type in the bin.
 */
import mongoose,{Schema,model,models} from 'mongoose';
import {addRecycleFields} from './recycle';
import {LEAD_STATUSES,LEAD_SOURCES,LEAD_SHIFTS,LEAD_MEDIUMS,LEAD_GROUPS,LEAD_NOTE_OUTCOMES} from '@/lib/leads/vocab';

/** One number as it was written, and as this app will dial it. Both are kept; see the note above. */
const leadPhoneSchema=new Schema({
  normalized:{type:String,required:true,match:/^01[3-9]\d{8}$/},
  original:{type:String,required:true,maxlength:80},
},{_id:false});

/** A note in the timeline. `by` is a real user: a note nobody wrote is not evidence of a call. */
const leadNoteSchema=new Schema({
  at:{type:Date,default:Date.now},
  by:{type:Schema.Types.ObjectId,ref:'User',required:true},
  text:{type:String,required:true,maxlength:1000,trim:true},
  outcome:{type:String,enum:[...LEAD_NOTE_OUTCOMES,''],default:''},
},{_id:false});

/** Something the app could not read, kept with the row instead of being guessed away. */
const leadFlagSchema=new Schema({
  field:{type:String,default:'',maxlength:40},
  code:{type:String,required:true,maxlength:40},
  original:{type:String,default:'',maxlength:200},
  messageBn:{type:String,default:'',maxlength:300},
  messageEn:{type:String,default:'',maxlength:300},
  suggested:{type:String,default:'',maxlength:40},
},{_id:false});

const leadSchema=new Schema({
  leadId:{type:String,required:true,unique:true,trim:true,maxlength:24},
  /** The day the visitor came, in Dhaka, as YYYY-MM-DD. Defaults to today at write time. */
  date:{type:String,required:true,match:/^\d{4}-\d{2}-\d{2}$/},
  studentName:{type:String,required:true,trim:true,maxlength:120},
  guardianName:{type:String,default:'',trim:true,maxlength:120},
  phones:{type:[leadPhoneSchema],default:[]},
  classLabel:{type:String,default:'',maxlength:80},
  classGroup:{type:Number,min:1,max:12,default:null},
  newSession:{type:Boolean,default:false},
  exam:{type:String,enum:['ssc','hsc',null],default:null},
  examYear:{type:Number,min:2000,max:2100,default:null},
  school:{type:String,default:'',trim:true,maxlength:160},
  group:{type:String,enum:[...LEAD_GROUPS],default:'unknown'},
  shift:{type:String,enum:[...LEAD_SHIFTS],default:'any'},
  medium:{type:String,enum:[...LEAD_MEDIUMS],default:'unknown'},
  source:{type:String,enum:[...LEAD_SOURCES],default:'walk_in'},
  interestedIn:{type:String,default:'',trim:true,maxlength:200},
  status:{type:String,enum:[...LEAD_STATUSES],default:'new'},
  /**
   * Sticky on purpose: setting the status to "Do not contact" sets this, and moving the status back
   * does NOT clear it. Only an explicit un-mark does. `canContact()` in `src/lib/leads/vocab.ts` is the
   * one gate every sending path asks, including a bulk SMS to a hand-picked selection.
   */
  doNotContact:{type:Boolean,default:false},
  /** YYYY-MM-DD in Dhaka, or null for "no follow-up" — which is its own state, not an overdue one. */
  nextFollowUp:{type:String,default:null,match:/^\d{4}-\d{2}-\d{2}$/},
  assignedTo:{type:Schema.Types.ObjectId,ref:'User',default:null},
  notes:{type:[leadNoteSchema],default:[]},
  flags:{type:[leadFlagSchema],default:[]},
  /** Siblings: the smallest number two leads share. Assigned by inheriting an existing key on save. */
  familyKey:{type:String,default:null,maxlength:40},
  // What this lead became. Optional and separate, so a converted lead still shows its own history and
  // the Recycle Bin can refuse to delete something an admission or a student now depends on.
  admission:{type:Schema.Types.ObjectId,ref:'Admission',default:null},
  trialBooking:{type:Schema.Types.ObjectId,ref:'TrialBooking',default:null},
  student:{type:Schema.Types.ObjectId,ref:'CenterStudent',default:null},
  convertedAt:{type:Date,default:null},
  /** Where an imported row came from: the file name, and the batch that made it idempotent. */
  importSource:{type:String,default:null,maxlength:200},
  importBatch:{type:String,default:null,maxlength:64},
  createdBy:{type:Schema.Types.ObjectId,ref:'User',default:null},
},{timestamps:true});
addRecycleFields(leadSchema);

leadSchema.index({date:-1});
leadSchema.index({status:1,nextFollowUp:1});
// Today's follow-ups and the overdue count are one range query over an ISO day string.
leadSchema.index({nextFollowUp:1});
// Duplicate detection: "this number is already on a lead" is an indexed lookup, not a scan.
leadSchema.index({'phones.normalized':1});
leadSchema.index({familyKey:1});
leadSchema.index({importBatch:1});
leadSchema.index({createdAt:-1});

export const Lead=models.Lead||model('Lead',leadSchema);

export interface LeadPhoneRow{normalized:string;original:string}
export interface LeadNoteRow{at:Date;by:unknown;text:string;outcome:string}
export interface LeadFlagRow{field:string;code:string;original:string;messageBn:string;messageEn:string;suggested:string}

/**
 * A readable id (`V-2026-0007`) is assigned by the write path; the schema only requires uniqueness.
 * The sequence follows the highest id of the year rather than a count, so a purged lead cannot hand its
 * number to somebody else — and the unique index stays the backstop if two admins quick-add at once.
 */
export async function nextLeadId(now:Date=new Date()):Promise<string>{
  const year=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric'}).format(now);
  const last=await Lead.findOne({leadId:new RegExp(`^V-${year}-`)}).sort({leadId:-1}).select('leadId').lean<{leadId?:string}>().setOptions({recycleAny:true} as never);
  const sequence=Number(String(last?.leadId||'').slice(-4))||0;
  return `V-${year}-${String(sequence+1).padStart(4,'0')}`;
}
