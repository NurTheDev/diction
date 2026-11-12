import {z} from 'zod';
import {normalizePhone} from '@/lib/center/phone';
const required=z.string().trim().min(1).max(120),optional=z.string().trim().max(500),integer=(min:number,max:number)=>z.preprocess(v=>typeof v==='string'?v.trim().replace(/[০-৯]/g,c=>String('০১২৩৪৫৬৭৮৯'.indexOf(c))):v,z.union([z.string().regex(/^\d+$/).transform(Number),z.number()]).pipe(z.number().int().min(min).max(max))); 
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(`${v}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v});
const phone=z.string().transform((v,ctx)=>{const n=normalizePhone(v);if(!n){ctx.addIssue({code:'custom',message:'phone'});return z.NEVER}return n});
const optPhone=z.string().transform((v,ctx)=>{if(!v.trim())return '';const n=normalizePhone(v);if(!n){ctx.addIssue({code:'custom',message:'phone'});return z.NEVER}return n});
export const centerClassSchema=z.object({nameBn:required,nameEn:z.string().trim().max(120),shift:z.string().trim().max(100),academicYear:integer(1900,2200),level:z.string().trim().max(80)});
export const centerStudentSchema=z.object({nameBn:required,nameEn:z.string().trim().max(120),classGroup:z.string().regex(/^[a-f\d]{24}$/i),roll:z.string().trim().max(40),school:z.string().trim().max(160),guardianName:required,guardianPhone:phone,studentPhone:optPhone,altPhone:optPhone,address:optional,admissionDate:date,startYear:integer(1900,2200),startMonth:integer(1,12),monthlyFee:integer(0,100000000),notes:z.string().trim().max(3000)});

export const centerStudentEditSchema=centerStudentSchema.omit({classGroup:true,startYear:true,startMonth:true,monthlyFee:true});
