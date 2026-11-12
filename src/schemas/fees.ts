import {z} from 'zod';
import {idSchema} from './admin';
import {dhakaDay} from '@/lib/study-date';
/** Decimal taka is converted to integer poisha without binary floating-point arithmetic. */
export function parseTaka(value:string){const normalized=value.trim().replace(/[০-৯]/g,c=>String('০১২৩৪৫৬৭৮৯'.indexOf(c)));const match=normalized.match(/^(0|[1-9]\d{0,6})(?:\.(\d{1,2}))?$/);if(!match)return null;const minor=Number(match[1])*100+Number((match[2]||'').padEnd(2,'0'));return minor>=1&&minor<=100000000?minor:null}
const amount=z.string().max(20).transform((value,ctx)=>{const minor=parseTaka(value);if(minor===null){ctx.addIssue({code:'custom',message:'Enter a valid positive amount'});return z.NEVER}return minor});
export function validDay(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'2000-01-01'||value>'2100-12-31')return false;const date=new Date(`${value}T00:00:00Z`);return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value}
const day=z.string().refine(validDay);
const key=z.string().uuid();
export const feeInvoiceSchema=z.object({student:idSchema,titleBn:z.string().trim().min(2).max(160),titleEn:z.string().trim().min(2).max(160),amount,dueDate:day,idempotencyKey:key});
export const feePaymentSchema=z.object({invoice:idSchema,amount,paidDate:day.refine(v=>v<=dhakaDay()),method:z.enum(['cash','bank','mobile','other']),reference:z.string().trim().max(120),idempotencyKey:key});
export const feeVoidSchema=z.object({id:idSchema,reason:z.string().trim().min(5).max(300)});
