import {z} from 'zod';
export const MAX_PUBLIC_SHEET_BYTES=4*1024*1024;
export const publicSheetSchema=z.object({titleBn:z.string().trim().min(2).max(160),titleEn:z.string().trim().max(160),descriptionBn:z.string().trim().max(1000),descriptionEn:z.string().trim().max(1000),className:z.string().trim().max(80),subject:z.string().trim().max(80)}).strict();
export function isPublicPdf(bytes:Uint8Array){return bytes.length>=5&&bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70&&bytes[4]===45}
