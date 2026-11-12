import {z} from 'zod';
import {idSchema} from './admin';
import {securePassword} from './recovery';
const grade=z.enum(['4','5','6','7','8','9','10','11','12']);
const title=z.string().trim().min(2).max(120);
export const createBatchSchema=z.object({titleBn:title,titleEn:title,grade,teacher:idSchema,scheduleBn:z.string().trim().max(200),scheduleEn:z.string().trim().max(200)});
export const enrollSchema=z.object({user:idSchema,parent:z.union([z.literal(''),idSchema]),grade,school:z.string().trim().max(160),batch:idSchema});
export const examSchema=z.object({titleBn:title,titleEn:title,batch:idSchema,maxMarks:z.coerce.number().min(1).max(1000)});
export const publishSchema=z.object({id:idSchema,published:z.enum(['true','false'])});
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(`${v}T00:00:00Z`);const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v&&v<=today;});
export const attendanceEntrySchema=z.object({student:idSchema,batch:idSchema,day,status:z.enum(['present','absent','late'])});
export const markEntrySchema=z.object({student:idSchema,exam:idSchema,marks:z.preprocess(v=>typeof v==='string'&&v.trim()===''?undefined:v,z.coerce.number().finite().min(0).max(1000))});

export const portalAccountSchema=z.object({name:z.string().trim().min(2).max(120),email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),password:securePassword,role:z.enum(['student','teacher','parent'])});

export const editBatchSchema=createBatchSchema.omit({grade:true}).extend({id:idSchema});
export const removeEnrollmentSchema=z.object({student:idSchema,batch:idSchema});
