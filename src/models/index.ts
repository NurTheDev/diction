/** Phase-one schema foundations. Domain-specific validation and workflows belong in their feature phases. */
import mongoose,{Schema,models,model} from 'mongoose';
const localized = {bn:{type:String,default:''},en:{type:String,default:''}};
const base = {title:localized,description:localized, published:{type:Boolean,default:false},order:{type:Number,default:0}};
const names=['Course','Subject','Question','Fee','Payment','BlogPost','Category','Notice','Banner','Media','Testimonial','Topper','Gallery','ActivityLog','Badge','XP','Streak'] as const;
export const contentModels=Object.fromEntries(names.map(name=>{const schema=new Schema({...base, data:{type:Schema.Types.Mixed,default:{}}},{timestamps:true});schema.index({published:1,order:1});return [name,models[name]||model(name,schema)];})) as Record<typeof names[number],mongoose.Model<unknown>>;
export {User} from './User';

export {Admission,Slot,TrialBooking,ContactMessage} from './Intake';
export {Lead} from './Lead';
export {Student,Batch,Exam,Attendance,Result} from './Academic';
export {TeacherContent,FacilityContent,FAQContent,SiteSettingsContent} from './PublicContent';
