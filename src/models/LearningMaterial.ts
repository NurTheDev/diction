import {Schema,model,models,Types,type Model} from 'mongoose';
import {addRecycleFields} from './recycle';
import type {Localized} from './PublicContent';
export interface ILearningMaterial {batch:Types.ObjectId;title:Localized;description:Localized;data:Buffer;bytes:number;createdBy:Types.ObjectId;published:boolean;createdAt:Date;updatedAt:Date}
const schema=new Schema<ILearningMaterial>({batch:{type:Schema.Types.ObjectId,ref:'Batch',required:true,index:true},title:{bn:{type:String,required:true,trim:true,maxlength:160},en:{type:String,required:true,trim:true,maxlength:160}},description:{bn:{type:String,default:'',trim:true,maxlength:500},en:{type:String,default:'',trim:true,maxlength:500}},data:{type:Buffer,required:true,select:false},bytes:{type:Number,required:true,min:1,max:2*1024*1024},createdBy:{type:Schema.Types.ObjectId,ref:'User',required:true},published:{type:Boolean,default:false,index:true}},{timestamps:true});addRecycleFields(schema);
schema.index({batch:1,published:1,createdAt:-1});
export const LearningMaterial=(models.LearningMaterial as Model<ILearningMaterial>)||model<ILearningMaterial>('LearningMaterial',schema);
