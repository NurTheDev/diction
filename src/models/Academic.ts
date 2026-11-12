import {Schema,model,models,Types,type Model} from 'mongoose';
export interface IStudent {user:Types.ObjectId;parent?:Types.ObjectId;grade:string;school:string;batches:Types.ObjectId[];revision?:number;createdAt:Date;updatedAt:Date}
export interface IBatch {titleBn:string;titleEn:string;grade:string;scheduleBn:string;scheduleEn:string;teacher:Types.ObjectId;active:boolean;revision?:number;createdAt:Date;updatedAt:Date}
export interface IExam {titleBn:string;titleEn:string;batch:Types.ObjectId;maxMarks:number;published:boolean;revision:number;createdAt:Date;updatedAt:Date}
export interface IAttendance {student:Types.ObjectId;batch:Types.ObjectId;day:string;status:'present'|'absent'|'late';recordedBy:Types.ObjectId;createdAt:Date;updatedAt:Date}
export interface IResult {student:Types.ObjectId;exam:Types.ObjectId;marks:number;recordedBy:Types.ObjectId;createdAt:Date;updatedAt:Date}
import {addRecycleFields} from './recycle';
const studentSchema=new Schema<IStudent>({user:{type:Schema.Types.ObjectId,ref:'User',required:true,unique:true},parent:{type:Schema.Types.ObjectId,ref:'User',index:true},grade:{type:String,required:true},school:{type:String,default:''},batches:[{type:Schema.Types.ObjectId,ref:'Batch'}],revision:{type:Number,default:0}},{timestamps:true});studentSchema.index({batches:1});
const batchSchema=new Schema<IBatch>({titleBn:{type:String,required:true,maxlength:120},titleEn:{type:String,required:true,maxlength:120},grade:{type:String,required:true},scheduleBn:{type:String,default:'',maxlength:200},scheduleEn:{type:String,default:'',maxlength:200},teacher:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},active:{type:Boolean,default:true},revision:{type:Number,default:0}},{timestamps:true});
const examSchema=new Schema<IExam>({titleBn:{type:String,required:true,maxlength:120},titleEn:{type:String,required:true,maxlength:120},batch:{type:Schema.Types.ObjectId,ref:'Batch',required:true,index:true},maxMarks:{type:Number,required:true,min:1,max:1000},published:{type:Boolean,default:false,index:true},revision:{type:Number,default:0}},{timestamps:true});addRecycleFields(examSchema);
const attendanceSchema=new Schema<IAttendance>({student:{type:Schema.Types.ObjectId,ref:'Student',required:true},batch:{type:Schema.Types.ObjectId,ref:'Batch',required:true},day:{type:String,required:true},status:{type:String,enum:['present','absent','late'],required:true},recordedBy:{type:Schema.Types.ObjectId,ref:'User',required:true}},{timestamps:true});attendanceSchema.index({student:1,batch:1,day:1},{unique:true});
const resultSchema=new Schema<IResult>({student:{type:Schema.Types.ObjectId,ref:'Student',required:true},exam:{type:Schema.Types.ObjectId,ref:'Exam',required:true},marks:{type:Number,required:true,min:0},recordedBy:{type:Schema.Types.ObjectId,ref:'User',required:true}},{timestamps:true});resultSchema.index({student:1,exam:1},{unique:true});
export const Student=(models.Student as Model<IStudent>)||model<IStudent>('Student',studentSchema);
export const Batch=(models.Batch as Model<IBatch>)||model<IBatch>('Batch',batchSchema);
export const Exam=(models.Exam as Model<IExam>)||model<IExam>('Exam',examSchema);
export const Attendance=(models.Attendance as Model<IAttendance>)||model<IAttendance>('Attendance',attendanceSchema);
export const Result=(models.Result as Model<IResult>)||model<IResult>('Result',resultSchema);
