import {z} from 'zod';
export const loginSchema=z.object({identifier:z.string().trim().min(3).max(254),password:z.string().min(8).max(128)});
export const roles=['superadmin','admin','content_editor','exam_manager','teacher','student','parent'] as const;
