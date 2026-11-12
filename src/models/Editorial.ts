import {Schema,model,models,type Model} from 'mongoose';
import {addRecycleFields} from './recycle';
import type {Localized} from './PublicContent';
import {editorialKinds,type EditorialKind} from '@/types/editorial';
export type {EditorialKind} from '@/types/editorial';
export interface IEditorial {kind:EditorialKind;slug:string;title:Localized;summary:Localized;body:Localized;category:Localized;tags:string[];imageUrl:string;extraImages:string[];sheetSlug:string;videoUrl:string;published:boolean;order:number;createdAt:Date;updatedAt:Date}
const optionalLocalized={bn:{type:String,default:''},en:{type:String,default:''}};
const schema=new Schema<IEditorial>({kind:{type:String,enum:editorialKinds,required:true},slug:{type:String,required:true,trim:true},title:{bn:{type:String,required:true},en:{type:String,required:true}},summary:optionalLocalized,body:optionalLocalized,category:optionalLocalized,tags:[{type:String,maxlength:40}],imageUrl:{type:String,default:''},extraImages:{type:[String],default:[]},sheetSlug:{type:String,default:''},videoUrl:{type:String,default:''},published:{type:Boolean,default:false,index:true},order:{type:Number,default:0}},{timestamps:true});addRecycleFields(schema);
schema.index({kind:1,slug:1},{unique:true});schema.index({kind:1,published:1,order:1,createdAt:-1});
export const Editorial=(models.Editorial as Model<IEditorial>)||model<IEditorial>('Editorial',schema);
