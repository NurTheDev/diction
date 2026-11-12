import mongoose,{Schema,model,models} from 'mongoose';
import {roles} from '@/schemas/auth';
export interface IUser {name:string;email?:string;phone?:string;passwordHash:string;role:typeof roles[number];active:boolean;sessionVersion?:number;authMutationRevision?:number;resetTokenHash?:string;resetExpiresAt?:Date;}
import {addRecycleFields} from './recycle';
const userSchema=new Schema<IUser>({name:{type:String,required:true,trim:true,maxlength:120},email:{type:String,trim:true,lowercase:true},phone:{type:String,trim:true},passwordHash:{type:String,required:true,select:false},role:{type:String,enum:roles,default:'student'},active:{type:Boolean,default:true},sessionVersion:{type:Number,default:0,min:0},authMutationRevision:{type:Number,default:0,min:0},resetTokenHash:{type:String,select:false},resetExpiresAt:{type:Date,select:false}},{timestamps:true});addRecycleFields(userSchema);
userSchema.index({email:1},{unique:true,partialFilterExpression:{email:{$type:'string'}}});
userSchema.index({resetTokenHash:1},{sparse:true});
userSchema.index({phone:1},{unique:true,partialFilterExpression:{phone:{$type:'string'}}});
export const User=(models.User as mongoose.Model<IUser>)||model<IUser>('User',userSchema);
