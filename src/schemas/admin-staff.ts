import {z} from 'zod';
import {emailSchema,securePassword} from '@/schemas/recovery';
export const managedStaffRoles=['admin','content_editor','exam_manager'] as const;
export const createStaffSchema=z.object({name:z.string().trim().min(2).max(120),email:emailSchema,password:securePassword,role:z.enum(managedStaffRoles)}).strict();
export const updateStaffSchema=z.object({role:z.enum(managedStaffRoles),active:z.boolean()}).strict();
