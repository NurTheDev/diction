import {z} from 'zod';
const text=(min:number,max:number)=>z.string().trim().min(min).max(max);
const phone=z.string().trim().regex(/^(?:\+?8801|01)[3-9]\d{8}$/);
const optionalPhone=z.union([z.literal(''),phone]);
const optionalEmail=z.union([z.literal(''),z.string().trim().email().max(254)]);
import {subjectValues} from '@/lib/subjects';
export {subjectValues};
export const admissionSchema=z.object({studentName:text(2,120),dob:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(`${v}T00:00:00Z`);return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===v && d.getTime()<=Date.now();}),gender:z.enum(['female','male','other','prefer-not']),guardianName:text(2,120),phone,whatsapp:optionalPhone,email:optionalEmail,relation:text(2,60),grade:z.enum(['4','5','6','7','8','9','10','11','12']),school:text(2,160),medium:z.enum(['bangla','english','english-version']),previousResult:z.string().trim().max(200),courseType:z.enum(['individual','package']),subjects:z.array(z.enum(subjectValues)).max(5),packageName:z.string().trim().max(150),batchPreference:z.string().trim().max(200),consent:z.boolean().refine(Boolean)}).superRefine((v,ctx)=>{if(v.courseType==='individual'&&v.subjects.length===0)ctx.addIssue({code:z.ZodIssueCode.custom,path:['subjects'],message:'Choose a subject'});if(v.courseType==='package'&&v.packageName.length<2)ctx.addIssue({code:z.ZodIssueCode.custom,path:['packageName'],message:'Enter package preference'});});
export type AdmissionInput=z.infer<typeof admissionSchema>;
export const bookingSchema=z.object({grade:z.enum(['4','5','6','7','8','9','10','11','12']),subject:z.enum(subjectValues),slotId:z.string().regex(/^[a-f\d]{24}$/i),slotStartAt:z.string().datetime(),slotEndAt:z.string().datetime(),studentName:text(2,120),phone,email:optionalEmail,consent:z.boolean().refine(Boolean)});
export type BookingInput=z.infer<typeof bookingSchema>;
export const contactSchema=z.object({name:text(2,120),phone:optionalPhone,email:optionalEmail,message:text(10,2000),consent:z.boolean().refine(Boolean)}).refine(v=>v.phone!==''||v.email!=='',{path:['email'],message:'Provide an email or phone'});
export type ContactInput=z.infer<typeof contactSchema>;
export const slotQuerySchema=z.object({grade:z.enum(['4','5','6','7','8','9','10','11','12']),subject:z.enum(subjectValues)});

export const trackingSchema=z.object({reference:z.string().trim().regex(/^ADM-\d{4}-[A-F\d]{12}$/i),phone});
export type TrackingInput=z.infer<typeof trackingSchema>;
