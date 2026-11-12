import {z} from 'zod';
import {safeImage} from '@/lib/safe-image';
const text=(max:number)=>z.string().trim().min(2).max(max);
export const heroSchema=z.object({title1Bn:text(120),title1En:text(120),title2Bn:text(120),title2En:text(120),descriptionBn:text(500),descriptionEn:text(500),imageAltBn:text(150),imageAltEn:text(150),imageUrl:z.string().trim().max(1000).refine(v=>Boolean(safeImage(v))),published:z.boolean()});
