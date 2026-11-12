import {z} from 'zod';
import {dhakaDay,addDays} from '@/lib/study-date';
export const answerSchema=z.object({answer:z.preprocess(v=>typeof v==='string'&&v.trim()===''?undefined:v,z.coerce.number().int().min(-100000).max(100000))});
export const plannerSchema=z.object({examDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const date=new Date(`${v}T00:00:00Z`);return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===v&&v>dhakaDay()&&v<=addDays(dhakaDay(),365);}),subjects:z.string().trim().min(2).max(300).transform(v=>v.split(',').map(s=>s.trim()).filter(Boolean)).refine(s=>s.length>=1&&s.length<=6&&s.every(x=>x.length<=50)),minutes:z.coerce.number().int().min(10).max(240)});
export const focusSchema=z.object({sessionId:z.string().uuid(),minutes:z.union([z.literal(5),z.literal(15),z.literal(25)])});
export const chatSchema=z.object({messages:z.array(z.object({role:z.enum(['user','assistant']),content:z.string().trim().min(1).max(1800)})).min(1).max(8),locale:z.enum(['bn','en']),consent:z.literal(true)}).refine(v=>v.messages.at(-1)?.role==='user');
