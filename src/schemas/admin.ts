import {z} from 'zod';
import {subjectValues} from './intake';
export const statuses=['pending','contacted','approved','enrolled','rejected'] as const;
export const idSchema=z.string().regex(/^[a-f\d]{24}$/i);
export const updateAdmissionSchema=z.object({id:idSchema,status:z.enum(statuses),notes:z.string().trim().max(3000)});
export const createSlotSchema=z.object({grade:z.enum(['4','5','6','7','8','9','10','11','12']),subject:z.enum(subjectValues),start:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),end:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),capacity:z.coerce.number().int().min(1).max(1000)}).superRefine((v,ctx)=>{const start=new Date(`${v.start}:00+06:00`),end=new Date(`${v.end}:00+06:00`);const roundTrip=(date:Date,value:string)=>!Number.isNaN(date.getTime())&&new Date(date.getTime()+6*60*60*1000).toISOString().slice(0,16)===value;if(!roundTrip(start,v.start)||!roundTrip(end,v.end)||start<=new Date()||end<=start)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Invalid time range',path:['start']});});
export const capacitySchema=z.object({id:idSchema,capacity:z.coerce.number().int().min(1).max(1000)});
export const toggleSchema=z.object({id:idSchema,enabled:z.enum(['true','false'])});
