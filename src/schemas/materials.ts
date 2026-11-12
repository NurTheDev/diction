import {z} from 'zod';
import {idSchema} from './admin';
export const MAX_MATERIAL_BYTES=2*1024*1024;
export const materialMetadataSchema=z.object({batch:idSchema,titleBn:z.string().trim().min(2).max(160),titleEn:z.string().trim().min(2).max(160),descriptionBn:z.string().trim().max(500),descriptionEn:z.string().trim().max(500)}).superRefine((v,ctx)=>{if(Boolean(v.descriptionBn)!==Boolean(v.descriptionEn))ctx.addIssue({code:'custom',message:'Descriptions must be provided in both languages'});});
export function isPdf(bytes:Uint8Array){return bytes.length>=5&&bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46&&bytes[4]===0x2d}
