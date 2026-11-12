import mongoose,{Schema,model,models} from 'mongoose';
import {subjectValues} from '@/schemas/intake';
import {addRecycleFields} from './recycle';
// Explicit schemas keep the persisted application data separate from generic CMS scaffolds.
const admissionSchema=new Schema({reference:{type:String,required:true,unique:true},studentName:{type:String,required:true,maxlength:120},dob:{type:String,required:true},gender:{type:String,required:true},guardianName:{type:String,required:true},phone:{type:String,required:true},whatsapp:String,email:String,relation:String,grade:{type:String,required:true,index:true},school:String,medium:String,previousResult:String,courseType:String,subjects:[String],packageName:String,batchPreference:String,consent:{type:Boolean,required:true},status:{type:String,enum:['pending','contacted','approved','enrolled','rejected'],default:'pending',index:true},notes:{type:String,default:''}},{timestamps:true});addRecycleFields(admissionSchema);
const slotSchema=new Schema({grade:{type:String,required:true},subject:{type:String,required:true,enum:subjectValues},startAt:{type:Date,required:true},endAt:{type:Date,required:true},capacity:{type:Number,required:true,min:1},booked:{type:Number,default:0,min:0},enabled:{type:Boolean,default:true}},{timestamps:true});addRecycleFields(slotSchema);
slotSchema.index({grade:1,subject:1,startAt:1},{unique:true});
const trialSchema=new Schema({reference:{type:String,required:true,unique:true},slot:{type:Schema.Types.ObjectId,ref:'Slot',required:true},studentName:{type:String,required:true},phone:{type:String,required:true},email:String,grade:String,subject:String,consent:{type:Boolean,required:true},status:{type:String,enum:['booked','cancelled'],default:'booked'}},{timestamps:true});addRecycleFields(trialSchema);
trialSchema.index({slot:1,phone:1},{unique:true,partialFilterExpression:{status:'booked'}});
const contactSchema=new Schema({reference:{type:String,required:true,unique:true},name:{type:String,required:true},phone:String,email:String,message:{type:String,required:true},consent:{type:Boolean,required:true},read:{type:Boolean,default:false}},{timestamps:true});addRecycleFields(contactSchema);
contactSchema.index({createdAt:-1});
const limitSchema=new Schema({key:{type:String,required:true,unique:true},count:{type:Number,required:true},expiresAt:{type:Date,required:true}},{timestamps:false});
limitSchema.index({expiresAt:1},{expireAfterSeconds:0});
export const Admission=models.Admission||model('Admission',admissionSchema);
export const Slot=models.Slot||model('Slot',slotSchema);
export const TrialBooking=models.TrialBooking||model('TrialBooking',trialSchema);
export const ContactMessage=models.ContactMessage||model('ContactMessage',contactSchema);
export const RateLimit=models.RateLimit||model('RateLimit',limitSchema);
