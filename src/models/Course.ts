import {Schema,model,models,type Model} from 'mongoose';
import {addRecycleFields} from './recycle';
import type {Localized} from './PublicContent';
import {subjectValues} from '@/schemas/intake';
export interface ICourse {slug:string;grade:string;subject:typeof subjectValues[number];title:Localized;description:Localized;schedule:Localized;fee:Localized;published:boolean;order:number}
const required={bn:{type:String,trim:true,required:true,maxlength:300},en:{type:String,trim:true,required:true,maxlength:300}};
const optional={bn:{type:String,trim:true,default:'',maxlength:500},en:{type:String,trim:true,default:'',maxlength:500}};
const schema=new Schema<ICourse>({slug:{type:String,required:true,unique:true,maxlength:80},grade:{type:String,required:true,enum:['4','5','6','7','8','9','10','11','12']},subject:{type:String,required:true,enum:subjectValues},title:required,description:required,schedule:optional,fee:optional,published:{type:Boolean,default:false},order:{type:Number,default:0}},{timestamps:true});schema.index({published:1,grade:1,subject:1,order:1});addRecycleFields(schema);
export const Course=(models.Course as Model<ICourse>)||model<ICourse>('Course',schema);
