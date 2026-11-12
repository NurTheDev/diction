import {z} from 'zod';
import {idSchema} from './admin';
const text=(max:number)=>z.string().trim().min(1).max(max);
const option=z.object({bn:text(250),en:text(250)});
export const questionSchema=z.object({promptBn:text(1000),promptEn:text(1000),options:z.array(option).length(4),correct:z.number().int().min(0).max(3),solutionBn:text(2000),solutionEn:text(2000)});
export const modelTestSchema=z.object({titleBn:text(160),titleEn:text(160),grade:z.enum(['4','5','6','7','8','9','10','11','12']),minutes:z.coerce.number().int().min(1).max(120),penalty:z.coerce.number().min(0).max(1),questions:z.array(questionSchema).min(1).max(30)});
export const attemptIdSchema=idSchema;
export const answerSaveSchema=z.object({attemptId:idSchema,index:z.number().int().min(0).max(29),answer:z.number().int().min(0).max(3)});
