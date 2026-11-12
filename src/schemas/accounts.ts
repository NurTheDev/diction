import {z} from 'zod';
import {idSchema} from './admin';
import {emailSchema} from './recovery';
export const editPortalAccountSchema=z.object({id:idSchema,name:z.string().trim().min(2).max(120),email:emailSchema});
