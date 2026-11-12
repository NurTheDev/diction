import {Schema,model,models,Types,type Model} from 'mongoose';
interface IProgress {student:Types.ObjectId;xp:number;mathStreak:number;lastMathDay:string;focusSessions:number}
interface ICompletion {student:Types.ObjectId;day:string;grade:string}
interface IPlanner {student:Types.ObjectId;examDate:string;subjects:string[];minutes:number}
interface IFocus {student:Types.ObjectId;sessionId:string;minutes:number;day:string}
const progressSchema=new Schema<IProgress>({student:{type:Schema.Types.ObjectId,ref:'Student',required:true,unique:true},xp:{type:Number,default:0,min:0},mathStreak:{type:Number,default:0,min:0},lastMathDay:{type:String,default:''},focusSessions:{type:Number,default:0,min:0}},{timestamps:true});
const completionSchema=new Schema<ICompletion>({student:{type:Schema.Types.ObjectId,ref:'Student',required:true},day:{type:String,required:true},grade:{type:String,required:true}},{timestamps:true});completionSchema.index({student:1,day:1},{unique:true});
const plannerSchema=new Schema<IPlanner>({student:{type:Schema.Types.ObjectId,ref:'Student',required:true,unique:true},examDate:{type:String,required:true},subjects:[{type:String,maxlength:50}],minutes:{type:Number,required:true,min:10,max:240}},{timestamps:true});
const focusSchema=new Schema<IFocus>({student:{type:Schema.Types.ObjectId,ref:'Student',required:true},sessionId:{type:String,required:true},minutes:{type:Number,required:true},day:{type:String,required:true}},{timestamps:true});focusSchema.index({student:1,sessionId:1},{unique:true});
export const StudyProgress=(models.StudyProgress as Model<IProgress>)||model<IProgress>('StudyProgress',progressSchema);
export const DailyCompletion=(models.DailyCompletion as Model<ICompletion>)||model<ICompletion>('DailyCompletion',completionSchema);
export const StudyPlanner=(models.StudyPlanner as Model<IPlanner>)||model<IPlanner>('StudyPlanner',plannerSchema);
export const FocusSession=(models.FocusSession as Model<IFocus>)||model<IFocus>('FocusSession',focusSchema);
