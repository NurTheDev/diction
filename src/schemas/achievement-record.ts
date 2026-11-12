import {z} from 'zod';
const text=(max:number)=>z.string().trim().max(max);
export const cardStateSchema=z.object({
 name:text(300).min(1),className:text(80).min(1),title:text(120).min(1),caption:text(200),
 date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>{const d=new Date(`${s}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s}),
 rank:z.enum(['1st','2nd','3rd','special']),template:z.enum(['champion','bright-star','polaroid','trophy','minimal']),aspect:z.enum(['1:1','4:5','1.91:1']),
 focusX:z.number().min(0).max(100),focusY:z.number().min(0).max(100),brightness:z.number().min(70).max(130),
 medalSide:z.enum(['left','right']),showLogo:z.boolean(),showClass:z.boolean(),showDate:z.boolean(),firstNameOnly:z.boolean(),
});
export const additionalSchema=z.object({name:text(100),title:text(120),caption:text(200),batch:text(80),subject:text(80),prize:text(80)}).strict();
export const saveAchievementRecordSchema=z.object({card:cardStateSchema,additional:additionalSchema,photo:z.string().max(3_000_000),png:z.string().max(4_000_000),processingConfirmed:z.literal(true),processingReference:z.string().trim().min(5).max(200)}).strict();
export const consentSchema=z.object({guardianConfirmed:z.literal(true),allSubjectsConfirmed:z.literal(true),evidenceReference:z.string().trim().min(5).max(200)}).strict();
export type StoredCard=z.infer<typeof cardStateSchema>;
export type AdditionalCard=z.infer<typeof additionalSchema>;
