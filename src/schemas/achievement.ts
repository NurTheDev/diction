import {z} from 'zod';
const text=(max:number)=>z.string().trim().max(max);
const locale=(max:number)=>z.object({bn:text(max),en:text(max)});
export const achievementSchema=z.object({
 title:locale(120),caption:locale(200),studentName:locale(100),className:text(80),batch:text(80),subject:text(80),
 rank:z.enum(['1st','2nd','3rd','special']),prizeType:text(100),achievementDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>{const d=new Date(s+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s}),
 originalPhoto:z.object({url:z.string().url(),publicId:text(250)}),cardImage:z.string().url(),ogImage:z.string().url(),template:z.enum(['champion','bright-star','polaroid','trophy','minimal']),aspectRatio:z.enum(['1:1','4:5','1.91:1']),
 slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),status:z.enum(['draft','published']),featured:z.boolean(),order:z.number().int().min(0).max(10000),consent:z.object({parentConsent:z.boolean(),consentNote:text(500)}),firstNameOnly:z.boolean(),shareCount:z.number().int().min(0),facebookPostId:text(200),
}).superRefine((v,ctx)=>{if(v.status==='published'&&!v.consent.parentConsent)ctx.addIssue({code:'custom',path:['consent','parentConsent'],message:'Parent consent is required before publishing.'});if(!v.title.bn||!v.studentName.bn||!v.className)ctx.addIssue({code:'custom',path:['title','bn'],message:'Bangla title, student name and class are required.'})});
export type AchievementInput=z.infer<typeof achievementSchema>;
