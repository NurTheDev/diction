import {model,models,Schema,type Types} from 'mongoose';
import {TEACHER_CLASS_LEVELS,TEACHER_SHIFTS,TEACHER_SUBJECTS} from '@/lib/teachers/vocab';

/**
 * R4 · A saved teaching need — "class 9 maths, evening batch" — kept beside the CV bank.
 *
 * It is a question the centre is asking, not a record about a person, which is why it carries none of
 * the CV's weight: no recycle fields, no purge date, no reference blocking. Deleting a need deletes a
 * filter, and the same filter is two clicks from being saved again; putting a query in the bin for 30
 * days would only make the bin a list of questions nobody asked any more. The candidates a need
 * matched are unchanged by anything that happens to the need.
 *
 * `filled` is the one state it keeps, because a need that has been met is the record of a hiring that
 * started here, and the Find-a-teacher screen counts open needs rather than showing a growing pile.
 */
export interface ITeacherNeed{
  subject:string;
  classLevels:string[];
  shift:string;
  note:string;
  filled:boolean;
  createdBy:Types.ObjectId|null;
  createdAt:Date;
  updatedAt:Date;
}

const teacherNeedSchema=new Schema<ITeacherNeed>({
  subject:{type:String,enum:[...TEACHER_SUBJECTS,''],default:''},
  classLevels:{type:[{type:String,enum:TEACHER_CLASS_LEVELS}],default:[]},
  shift:{type:String,enum:[...TEACHER_SHIFTS,''],default:''},
  note:{type:String,default:'',trim:true,maxlength:300},
  filled:{type:Boolean,default:false},
  createdBy:{type:Schema.Types.ObjectId,ref:'User',default:null},
},{timestamps:true});

teacherNeedSchema.index({filled:1,createdAt:-1});

export const TeacherNeed=models.TeacherNeed||model<ITeacherNeed>('TeacherNeed',teacherNeedSchema);
