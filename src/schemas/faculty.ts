import {z} from 'zod';
import {idSchema} from './admin';
import {safeImage} from '@/lib/safe-image';
const text=(max:number)=>z.string().trim().min(2).max(max);
const facultyBase=z.object({slug:z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),nameBn:text(120),nameEn:text(120),qualificationBn:text(1000),qualificationEn:text(1000),bioBn:z.string().trim().max(3000).default(''),bioEn:z.string().trim().max(3000).default(''),order:z.coerce.number().int().min(0).max(10000),photoUrl:z.string().trim().max(1000).refine(v=>!v||Boolean(safeImage(v))).default(''),director:z.boolean(),published:z.boolean()});
const pairedBiography=(v:{bioBn:string;bioEn:string},ctx:z.RefinementCtx)=>{if(Boolean(v.bioBn)!==Boolean(v.bioEn))ctx.addIssue({code:'custom',message:'Provide biographies in both languages',path:['bioEn']})};
export const facultySchema=facultyBase.superRefine(pairedBiography);
export const facultyUpdateSchema=facultyBase.extend({id:idSchema}).superRefine(pairedBiography);
