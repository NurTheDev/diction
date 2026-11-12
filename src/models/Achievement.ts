import {Schema,model,models,type Model,Types} from 'mongoose';
export interface IAchievement {title:{bn:string;en:string};caption:{bn:string;en:string};studentName:{bn:string;en:string};className:string;batch:string;subject:string;rank:'1st'|'2nd'|'3rd'|'special';prizeType:string;achievementDate:Date;originalPhoto:{url:string;publicId:string};cardImage:string;ogImage:string;template:'champion'|'bright-star'|'polaroid'|'trophy'|'minimal';aspectRatio:'1:1'|'4:5'|'1.91:1';slug:string;status:'draft'|'published';featured:boolean;order:number;consent:{parentConsent:boolean;consentNote:string};firstNameOnly:boolean;shareCount:number;facebookPostId:string;createdBy:Types.ObjectId}
const localized=(max:number)=>({bn:{type:String,trim:true,maxlength:max,default:''},en:{type:String,trim:true,maxlength:max,default:''}});
const schema=new Schema<IAchievement>({title:localized(120),caption:localized(200),studentName:localized(100),className:{type:String,trim:true,maxlength:80},batch:{type:String,trim:true,maxlength:80,default:''},subject:{type:String,trim:true,maxlength:80,default:''},rank:{type:String,enum:['1st','2nd','3rd','special'],default:'special'},prizeType:{type:String,trim:true,maxlength:100,default:''},achievementDate:{type:Date,required:true},originalPhoto:{url:{type:String,default:''},publicId:{type:String,default:''}},cardImage:{type:String,default:''},ogImage:{type:String,default:''},template:{type:String,enum:['champion','bright-star','polaroid','trophy','minimal'],required:true},aspectRatio:{type:String,enum:['1:1','4:5','1.91:1'],required:true},slug:{type:String,required:true,unique:true,lowercase:true,trim:true},status:{type:String,enum:['draft','published'],default:'draft'},featured:{type:Boolean,default:false},order:{type:Number,default:0},consent:{parentConsent:{type:Boolean,default:false},consentNote:{type:String,trim:true,maxlength:500,default:''}},firstNameOnly:{type:Boolean,default:false},shareCount:{type:Number,default:0,min:0},facebookPostId:{type:String,default:''},createdBy:{type:Schema.Types.ObjectId,ref:'User',required:true}},{timestamps:true});
schema.index({status:1,achievementDate:-1});schema.index({achievementDate:-1});
schema.pre('validate',function(){if(this.status==='published'&&!this.consent?.parentConsent)this.invalidate('consent.parentConsent','Parent consent is required to publish');});
// Query updates bypass document validation and could revoke consent on a published
// record. Until a consent-aware write service exists, prohibit these paths.
const blockUnvalidatedWrite=()=>{throw new Error('Achievement query updates are disabled; use a consent-validated document write service.')};
schema.pre('updateOne',blockUnvalidatedWrite);
schema.pre('updateMany',blockUnvalidatedWrite);
schema.pre('findOneAndUpdate',blockUnvalidatedWrite);
schema.pre('replaceOne',blockUnvalidatedWrite);
schema.pre('findOneAndReplace',blockUnvalidatedWrite);
schema.pre('bulkWrite',blockUnvalidatedWrite);
export const Achievement=(models.Achievement as Model<IAchievement>)||model<IAchievement>('Achievement',schema);
