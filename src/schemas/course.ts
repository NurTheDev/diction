import {z} from 'zod';
import {subjectValues} from './intake';
const required=z.string().trim().min(2).max(300),optional=z.string().trim().max(500);
export const courseSchema=z.object({slug:z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),grade:z.enum(['4','5','6','7','8','9','10','11','12']),subject:z.enum(subjectValues),titleBn:required,titleEn:required,descriptionBn:required,descriptionEn:required,scheduleBn:optional,scheduleEn:optional,feeBn:optional,feeEn:optional,order:z.coerce.number().int().min(0).max(10000),published:z.boolean()}).superRefine((v,ctx)=>{for(const [bn,en] of [[v.scheduleBn,v.scheduleEn],[v.feeBn,v.feeEn]])if(Boolean(bn)!==Boolean(en))ctx.addIssue({code:'custom',message:'Both language versions are required when supplied'});});
