import {z} from 'zod';
export const emailSchema=z.string().trim().email().max(254).transform(v=>v.toLowerCase());
// bcrypt only uses the first 72 bytes, not 72 Unicode characters.
export const securePassword=z.string().min(12).max(72).refine(v=>new TextEncoder().encode(v).length<=72,'Password must fit within 72 UTF-8 bytes');
export const requestResetSchema=z.object({email:emailSchema,locale:z.enum(['bn','en'])});
export const completeResetSchema=z.object({token:z.string().regex(/^[a-f0-9]{64}$/),password:securePassword,confirm:z.string()}).refine(v=>v.password===v.confirm,{path:['confirm'],message:'Passwords must match'});
export const changePasswordSchema=z.object({current:z.string().min(8).max(128),password:securePassword,confirm:z.string()}).refine(v=>v.password===v.confirm,{path:['confirm'],message:'Passwords must match'});
