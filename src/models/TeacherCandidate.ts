/**
 * R4 · Teacher candidates — the bank that replaces the owner's "CV listing" spreadsheet.
 *
 * Three decisions are written down here because each looks like an omission otherwise:
 *
 *   • **`subjectsText` is the truth and `subjects[]` is a reading of it.** The sheet says
 *     `"6, 7, 8 (Math, Eng) 9-GS, Other"` and the owner needs to search by subject tomorrow, so the
 *     original text is stored untouched beside the tags the parser suggested and a hand confirmed.
 *     A tag nobody confirmed is a guess; deleting the text it came from would make the guess
 *     uncheckable. `classLevels[]` is the same reading for classes, as specific class numbers, so a
 *     filter for class 9 finds `"9-GS"` and `"Class 9 to 12"` alike.
 *   • **The CV file lives in Cloudinary and only its URL and public id live here.** A CV is the most
 *     sensitive document this app holds: it is somebody's passport number, address and referee list.
 *     The upload route re-encodes images to strip EXIF, refuses anything over 5 MB, and stores no
 *     bytes in MongoDB; the public id is kept only so the Recycle Bin's purge can destroy the asset
 *     when the row's 30 days are up.
 *   • **`receivedDate` is a `YYYY-MM-DD` day in Asia/Dhaka**, exactly like a lead's `date`: ISO days
 *     compare as strings, so "CVs older than twelve months" is one range query that cannot drift
 *     with the hour the daily job runs. The twelve-month review is a reminder on the list, never an
 *     automatic deletion — a CV is deleted by a person, through the bin, or not at all.
 *
 * Soft delete comes from `addRecycleFields`, with the 10-second undo the Recycle Bin gives every
 * list, and the bin's purge after 30 days.
 */
import mongoose,{Schema,model,models} from 'mongoose';
import {addRecycleFields} from './recycle';
import {
  TEACHER_CLASS_LEVELS,TEACHER_RATINGS,TEACHER_SHIFTS,TEACHER_SOURCES,TEACHER_STATUSES,TEACHER_SUBJECTS,
} from '@/lib/teachers/vocab';

/** One number as it was written, and as this app will dial it — the same pair a lead keeps. */
const candidatePhoneSchema=new Schema({
  normalized:{type:String,required:true,match:/^01[3-9]\d{8}$/},
  original:{type:String,required:true,maxlength:80},
},{_id:false});

/** A note in the timeline. `by` is a real user: a note nobody wrote is not evidence of a call. */
const candidateNoteSchema=new Schema({
  at:{type:Date,default:Date.now},
  by:{type:Schema.Types.ObjectId,ref:'User',required:true},
  text:{type:String,required:true,maxlength:1000,trim:true},
  outcome:{type:String,enum:['no_response','call_back_later','interested','not_suitable',''],default:''},
},{_id:false});

const candidateSchema=new Schema({
  candidateId:{type:String,required:true,unique:true,trim:true,maxlength:24},
  /** The day the CV arrived, in Dhaka, as YYYY-MM-DD. Defaults to today at write time. */
  receivedDate:{type:String,required:true,match:/^\d{4}-\d{2}-\d{2}$/},
  name:{type:String,required:true,trim:true,maxlength:120},
  phones:{type:[candidatePhoneSchema],default:[]},
  email:{type:String,default:'',trim:true,maxlength:160,lowercase:true},
  department:{type:String,default:'',trim:true,maxlength:120},
  university:{type:String,default:'',trim:true,maxlength:160},
  currentInstitute:{type:String,default:'',trim:true,maxlength:160},
  /** The sheet's own words, untouched: the reading beside it is a suggestion, never a replacement. */
  subjectsText:{type:String,default:'',trim:true,maxlength:400},
  subjects:{type:[String],enum:[...TEACHER_SUBJECTS],default:[]},
  classLevels:{type:[String],enum:[...TEACHER_CLASS_LEVELS],default:[]},
  availabilityText:{type:String,default:'',trim:true,maxlength:200},
  shifts:{type:[String],enum:[...TEACHER_SHIFTS],default:[]},
  expectedSalary:{type:Number,default:null,min:0,max:10000000},
  /** Cloudinary's own URL and id: the file is never in MongoDB, and the id is what purge destroys. */
  cvFile:{type:String,default:'',maxlength:400},
  cvPublicId:{type:String,default:'',maxlength:200},
  photo:{type:String,default:'',maxlength:400},
  photoPublicId:{type:String,default:'',maxlength:200},
  source:{type:String,enum:[...TEACHER_SOURCES],default:'walk_in'},
  rating:{type:String,enum:[...TEACHER_RATINGS],default:'unrated'},
  status:{type:String,enum:[...TEACHER_STATUSES],default:'new'},
  /** When the interview is booked, as an instant: an interview is a meeting, not a day. */
  interviewAt:{type:Date,default:null},
  notes:{type:[candidateNoteSchema],default:[]},
  tags:{type:[String],default:[],maxlength:40},
  /** The Teacher profile a hire created; the link back, so a hire can never happen twice. */
  hiredAsTeacherId:{type:Schema.Types.ObjectId,ref:'Teacher',default:null},
  importSource:{type:String,default:null,maxlength:200},
  importBatch:{type:String,default:null,maxlength:64},
  createdBy:{type:Schema.Types.ObjectId,ref:'User',default:null},
},{timestamps:true});
addRecycleFields(candidateSchema);

candidateSchema.index({receivedDate:-1});
candidateSchema.index({status:1,receivedDate:-1});
candidateSchema.index({'phones.normalized':1});
candidateSchema.index({email:1});
candidateSchema.index({subjects:1});
candidateSchema.index({classLevels:1});
candidateSchema.index({hiredAsTeacherId:1});
candidateSchema.index({importBatch:1});

export const TeacherCandidate=models.TeacherCandidate||model('TeacherCandidate',candidateSchema);

export interface CandidatePhoneRow{normalized:string;original:string}
export interface CandidateNoteRow{at:Date;by:unknown;text:string;outcome:string}

/**
 * A readable id (`CV-2026-0004`) is assigned by the write path; the schema only requires uniqueness.
 * The sequence follows the highest id of the year rather than a count, so a purged candidate cannot
 * hand its number to somebody else — and the unique index stays the backstop if two admins add at once.
 */
export async function nextCandidateId(now:Date=new Date()):Promise<string>{
  const year=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric'}).format(now);
  const last=await TeacherCandidate.findOne({candidateId:new RegExp(`^CV-${year}-`)}).sort({candidateId:-1}).select('candidateId').lean<{candidateId?:string}>().setOptions({recycleAny:true} as never);
  const sequence=Number(String(last?.candidateId||'').slice(-4))||0;
  return `CV-${year}-${String(sequence+1).padStart(4,'0')}`;
}
