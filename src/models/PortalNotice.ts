import {Schema,model,models,Types,type Model} from 'mongoose';
import type {Localized} from './PublicContent';
/** Private batch notices are distinct from public editorial notices. */
export interface IPortalNotice {batch:Types.ObjectId;title:Localized;body:Localized;published:boolean;createdBy:Types.ObjectId;idempotencyKey:string;createdAt:Date;updatedAt:Date}
const schema=new Schema<IPortalNotice>({batch:{type:Schema.Types.ObjectId,ref:'Batch',required:true,index:true},title:{bn:{type:String,required:true,trim:true,maxlength:160},en:{type:String,required:true,trim:true,maxlength:160}},body:{bn:{type:String,required:true,trim:true,maxlength:3000},en:{type:String,required:true,trim:true,maxlength:3000}},published:{type:Boolean,required:true,default:false},createdBy:{type:Schema.Types.ObjectId,ref:'User',required:true},idempotencyKey:{type:String,required:true,unique:true}},{timestamps:true});
schema.index({batch:1,published:1,createdAt:-1,_id:-1});
export const PortalNotice=(models.PortalNotice as Model<IPortalNotice>)||model<IPortalNotice>('PortalNotice',schema);
