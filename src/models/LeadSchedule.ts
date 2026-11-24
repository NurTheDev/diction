/**
 * A visitor message the centre has scheduled for a future day.
 *
 * Why its own collection rather than a `queued` SMS batch written at schedule time:
 *
 *   • **The recipients are decided when the job runs, not when the operator clicks.** A family may say
 *     "do not contact" between Tuesday and Friday, and Friday's message must honour that. Only the ids
 *     are stored here; `resolveSmsSource()` re-reads every lead and the plan pipeline applies the same
 *     opt-out rule the dialog applies, so a schedule can never text somebody who has since said no.
 *   • **A schedule is an intention, not a send that has already been planned.** Cancelling it must be
 *     possible without touching a batch that does not exist yet, and the history has to survive the
 *     cancellation.
 *   • **`scheduledFor` is a Date, but `day` is kept too.** The day is what the operator typed and what
 *     the list prints; the Date is what the job compares. One is never derived from the other at read
 *     time, so a timezone change cannot move a message to another date.
 *
 * There is no soft delete here on purpose: a schedule is not a person's record, and "cancelled" is a
 * state the operator must still be able to read back. Nothing is purged automatically.
 */
import {Schema,model,models} from 'mongoose';
import {LEAD_SCHEDULE_STATUSES} from '@/lib/leads/lead-schedule';

const leadScheduleSchema=new Schema({
  /** What the operator called it — "Class Nine, SSC batch follow-up". Optional. */
  title:{type:String,default:'',trim:true,maxlength:120},
  /** The date as typed, `YYYY-MM-DD` in Asia/Dhaka. The job's Date is built from it with +06:00. */
  day:{type:String,required:true,match:/^\d{4}-\d{2}-\d{2}$/},
  /** The day at the centre's send window (07:05 Dhaka); the queue job compares against this. */
  scheduledFor:{type:Date,required:true},
  /** A catalog key, or `custom` for the text the operator typed. */
  templateKey:{type:String,required:true,maxlength:80},
  /** Only used when `templateKey` is `custom`; a template is read at send time so an edit still applies. */
  text:{type:String,default:'',maxlength:600},
  /** Fills `{subject}` when the message (template or custom) asks for one. */
  subject:{type:String,default:'',maxlength:120},
  /** The audience snapshot. At most LEAD_SCHEDULE_LIMIT ids, checked by the write path. */
  leadIds:{type:[Schema.Types.ObjectId],ref:'Lead',default:[]},
  /** What class the audience was drawn from, for the list. Null means "every class". */
  classGroup:{type:Number,min:1,max:12,default:null},
  /** How many recipients were eligible when the schedule was written (before the final re-check). */
  expectedCount:{type:Number,min:0,default:0},
  status:{type:String,enum:[...LEAD_SCHEDULE_STATUSES],default:'scheduled'},
  /** The batch the send produced, once the job has run. */
  batchId:{type:Schema.Types.ObjectId,ref:'CenterSmsBatch',default:null},
  sentCount:{type:Number,min:0,default:0},
  failedCount:{type:Number,min:0,default:0},
  skippedCount:{type:Number,min:0,default:0},
  /** A short machine word (`EMPTY_MESSAGE`, `NO_RECIPIENTS`) — never an exception, which can quote a number. */
  failure:{type:String,default:'',maxlength:80},
  ranAt:{type:Date,default:null},
  createdBy:{type:Schema.Types.ObjectId,ref:'User',default:null},
},{timestamps:true});

/** The queue job's query: scheduled rows whose time has come. */
leadScheduleSchema.index({status:1,scheduledFor:1});
leadScheduleSchema.index({scheduledFor:-1});

export const LeadSmsSchedule=models.LeadSmsSchedule||model('LeadSmsSchedule',leadScheduleSchema);
