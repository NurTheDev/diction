import {z} from 'zod';
const oid=z.string().regex(/^[a-f0-9]{24}$/i);
const integer=z.number().int().min(1).max(100000000);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(`${v}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v});
/* Group 3 · a discount is taka the centre let go on one line of a receipt. The line still settles what
   it settles — `amount` is the fee being paid off, which is why the month reads as paid without the dues
   engine learning a new idea — and the discount is kept beside it so the receipt, the drawer total and
   the day's collection all say what was actually handed over. A discount that swallows the whole line is
   a waiver, and a waiver has its own path with its own reason, so it is refused here. */
const line=z.object({type:z.enum(['monthly','admission','exam_fee','other']),month:z.number().int().min(1).max(12).optional(),amount:integer,discount:z.number().int().min(0).max(100000000).default(0),otherLabel:z.string().trim().max(100)}).strict().superRefine((v,ctx)=>{if((v.type==='monthly')!==Boolean(v.month))ctx.addIssue({code:'custom',message:'month'});if((v.type==='other')!==Boolean(v.otherLabel))ctx.addIssue({code:'custom',message:'other label'});if(v.discount>=v.amount)ctx.addIssue({code:'custom',message:'discount exceeds amount'})});
export const centerCashSchema=z.object({requestId:z.string().uuid(),student:oid,academicYear:z.number().int().min(1900).max(2200),receiptNo:z.string().trim().min(1).max(120),paidOn:date,note:z.string().trim().max(1000),allowSharedReceipt:z.boolean(),sharedReceiptReason:z.string().trim().max(500).default(''),sharedReceiptSeen:z.string().max(10000).default(''),allowExtra:z.boolean().default(false),lines:z.array(line).min(1).max(15)}).strict().superRefine((v,ctx)=>{if(v.allowSharedReceipt&&!v.sharedReceiptReason)ctx.addIssue({code:'custom',message:'shared receipt reason'});if(v.allowExtra&&!v.note)ctx.addIssue({code:'custom',message:'extra payment note'});const slots=v.lines.map(l=>`${l.type}:${l.month||0}:${l.otherLabel.toLowerCase()}`);if(new Set(slots).size!==slots.length)ctx.addIssue({code:'custom',message:'duplicate line'});if(!Number.isSafeInteger(v.lines.reduce((n,l)=>n+l.amount,0)))ctx.addIssue({code:'custom',message:'total'})});
export type CenterCashPlan=z.infer<typeof centerCashSchema>;
