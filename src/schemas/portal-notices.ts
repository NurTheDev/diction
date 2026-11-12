import {z} from 'zod';
import {idSchema} from './admin';
const content=z.object({titleBn:z.string().trim().min(2).max(160),titleEn:z.string().trim().min(2).max(160),bodyBn:z.string().trim().min(2).max(3000),bodyEn:z.string().trim().min(2).max(3000)});
export const createPortalNoticeSchema=content.extend({batch:idSchema,idempotencyKey:z.string().uuid()});
export const editPortalNoticeSchema=content.extend({id:idSchema});
