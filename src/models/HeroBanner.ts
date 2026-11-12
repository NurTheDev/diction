import {Schema,model,models,type Model} from 'mongoose';
import type {Localized} from './PublicContent';
export interface IHeroBanner {key:string;title1:Localized;title2:Localized;description:Localized;imageAlt:Localized;imageUrl:string;published:boolean}
const localized={bn:{type:String,required:true,trim:true},en:{type:String,required:true,trim:true}};
const schema=new Schema<IHeroBanner>({key:{type:String,required:true,unique:true},title1:localized,title2:localized,description:localized,imageAlt:localized,imageUrl:{type:String,required:true},published:{type:Boolean,default:false}},{timestamps:true});
export const HeroBanner=(models.HeroBanner as Model<IHeroBanner>)||model<IHeroBanner>('HeroBanner',schema);
