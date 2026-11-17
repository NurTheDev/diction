import {z} from 'zod';
import {normalizePhone} from '@/lib/center/phone';
const required=z.string().trim().min(1).max(120),optional=z.string().trim().max(500),integer=(min:number,max:number)=>z.preprocess(v=>typeof v==='string'?v.trim().replace(/[\u09e6-\u09ef]/g,c=>String(c.charCodeAt(0)-0x09e6)):v,z.union([z.string().regex(/^\d+$/).transform(Number),z.number()]).pipe(z.number().int().min(min).max(max))); 
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(`${v}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v});
const phone=z.string().transform((v,ctx)=>{const n=normalizePhone(v);if(!n){ctx.addIssue({code:'custom',message:'phone'});return z.NEVER}return n});
const optPhone=z.string().transform((v,ctx)=>{if(!v.trim())return '';const n=normalizePhone(v);if(!n){ctx.addIssue({code:'custom',message:'phone'});return z.NEVER}return n});
export const centerClassSchema=z.object({nameBn:required,nameEn:z.string().trim().max(120),shift:z.string().trim().max(100),academicYear:integer(1900,2200),level:z.string().trim().max(80)});

/**
 * O1 · one class as the class-and-batch screen writes it.
 *
 * The same shape serves a new class and a change to one, because what an operator fills in is the same
 * either way; `id` decides which, and an id nobody can parse is refused rather than quietly creating a
 * second class with the same name. Two rules the shape holds that a form cannot:
 *
 * · **A room is a label, not a booking.** `Room-1201` is what the centre writes on its own sheet, and
 *   the only thing asked of it is that it is short enough to fit on a period card.
 * · **A shift is one of three keys, or nothing.** The card translates them; a word typed anywhere else
 *   stays the class's own `shift` string and is left alone here.
 *
 * `monthlyFee` is optional on purpose and `null` when the box is empty: zero means "free" and an empty
 * box means "not decided yet", and a screen that turned one into the other would start billing a class
 * nobody priced.
 */
export const classGroupSchema=z.object({
  id:z.string().trim().max(40).optional(),
  nameBn:required,nameEn:z.string().trim().max(120),
  level:z.string().trim().max(80),
  room:z.string().trim().max(80),
  academicYear:integer(1900,2200),
  monthlyFee:z.preprocess(v=>{const text=typeof v==='string'?v.trim().replace(/[\u09e6-\u09ef]/g,c=>String(c.charCodeAt(0)-0x09e6)):v;
    return text===''||text===null||text===undefined?null:text},
    z.union([z.null(),z.string().regex(/^\d+$/).transform(Number),z.number()])
      .pipe(z.number().int().min(0).max(100000000).nullable()).optional()),
});

/** The three shifts a class card offers, as the keys they are stored by. */
export const CLASS_SHIFTS=['morning','day','evening'] as const;

/** Read the shift boxes off a form. `Object.fromEntries` keeps only the last of a repeated name, so a
    checkbox group is read with `getAll` — one value per box that was ticked. */
export function shiftsOf(form:FormData):string[]{
  const picked=[...new Set(form.getAll('shifts').map(value=>String(value).trim().toLowerCase()))]
    .filter(value=>(CLASS_SHIFTS as readonly string[]).includes(value));
  return CLASS_SHIFTS.filter(value=>picked.includes(value));
}
export const centerStudentSchema=z.object({nameBn:required,nameEn:z.string().trim().max(120),classGroup:z.string().regex(/^[a-f\d]{24}$/i),roll:z.string().trim().max(40),school:z.string().trim().max(160),guardianName:required,guardianPhone:phone,studentPhone:optPhone,altPhone:optPhone,address:optional,admissionDate:date,startYear:integer(1900,2200),startMonth:integer(1,12),monthlyFee:integer(0,100000000),notes:z.string().trim().max(3000)});

export const centerStudentEditSchema=centerStudentSchema.omit({classGroup:true,startYear:true,startMonth:true,monthlyFee:true});
