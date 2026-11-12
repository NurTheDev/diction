import {z} from 'zod';
export const siteContentKinds=['faq','facility','activity'] as const;
export type SiteContentKind=typeof siteContentKinds[number];
export const siteContentSchema=z.object({kind:z.enum(siteContentKinds),key:z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),titleBn:z.string().trim().min(2).max(300),titleEn:z.string().trim().min(2).max(300),descriptionBn:z.string().trim().max(3000),descriptionEn:z.string().trim().max(3000),order:z.coerce.number().int().min(0).max(10000),published:z.boolean()}).superRefine((v,ctx)=>{if(v.kind!=='activity'&&(!v.descriptionBn||!v.descriptionEn))ctx.addIssue({code:'custom',path:['descriptionBn'],message:'Both language descriptions are required'});});
