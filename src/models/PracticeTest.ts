import {Schema,model,models,Types,type Model} from 'mongoose';
import {addRecycleFields} from './recycle';
import type {PracticeQuestion} from '@/schemas/practice-test';
export interface IPracticeTest{slug:string;title:string;subject:string;grade:string;questions:PracticeQuestion[];published:boolean;createdBy:Types.ObjectId;createdAt:Date}
export interface IPracticeResult{student:Types.ObjectId;test:Types.ObjectId;title:string;subject:string;score:number;total:number;createdAt:Date}
const q=new Schema<PracticeQuestion>({prompt:{type:String,required:true,maxlength:1000},options:{type:[String],required:true,validate:(x:string[])=>x.length===4},correct:{type:Number,required:true,min:0,max:3},explanation:{type:String,default:'',maxlength:2000}},{_id:false});
const testSchema=new Schema<IPracticeTest>({slug:{type:String,unique:true,required:true},title:{type:String,required:true,maxlength:160},subject:{type:String,required:true,maxlength:80},grade:{type:String,default:'',maxlength:80},questions:{type:[q],required:true,select:false},published:{type:Boolean,default:false,index:true},createdBy:{type:Schema.Types.ObjectId,ref:'User',required:true}},{timestamps:true});addRecycleFields(testSchema);
const resultSchema=new Schema<IPracticeResult>({student:{type:Schema.Types.ObjectId,ref:'Student',required:true,index:true},test:{type:Schema.Types.ObjectId,ref:'PracticeTest',required:true},title:{type:String,required:true,maxlength:160},subject:{type:String,required:true,maxlength:80},score:{type:Number,required:true},total:{type:Number,required:true}},{timestamps:true});resultSchema.index({student:1,createdAt:-1});
export const PracticeTest=(models.PracticeTest as Model<IPracticeTest>)||model<IPracticeTest>('PracticeTest',testSchema);
export const PracticeResult=(models.PracticeResult as Model<IPracticeResult>)||model<IPracticeResult>('PracticeResult',resultSchema);
