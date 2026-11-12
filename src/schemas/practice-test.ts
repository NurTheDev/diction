import {z} from 'zod';
const text=(n:number)=>z.string().trim().min(1).max(n);
export const practiceQuestion=z.object({prompt:text(1000),options:z.array(text(250)).length(4),correct:z.number().int().min(0).max(3),explanation:z.string().trim().max(2000)}).strict();
export const practiceTestSchema=z.object({title:text(160),subject:text(80),grade:z.string().trim().max(80),questions:z.array(practiceQuestion).min(1).max(30)}).strict();
export const practiceAnswersSchema=z.object({answers:z.array(z.number().int().min(-1).max(3)).min(1).max(30),save:z.boolean()}).strict();
export type PracticeQuestion=z.infer<typeof practiceQuestion>;
