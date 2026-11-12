import {z} from 'zod';

const localized=z.object({bn:z.string().trim().min(2).max(160),en:z.string().trim().min(2).max(160)});
export const socialProofSchema=z.object({
  published:z.boolean(),
  studentCount:z.number().int().min(1).max(10000000).nullable(),
  studentMinimum:z.boolean(),
  rating:z.number().min(0.1).max(5).multipleOf(0.1).nullable(),
  ratingCount:z.number().int().min(1).max(10000000).nullable(),
  milestones:z.array(z.object({year:z.number().int().min(1900).max(new Date().getFullYear()),title:localized})).max(8)
}).superRefine((data,ctx)=>{
  if((data.rating===null)!==(data.ratingCount===null))ctx.addIssue({code:'custom',path:['ratingCount'],message:'Rating and review count must both be provided.'});
  if(data.studentMinimum&&data.studentCount===null)ctx.addIssue({code:'custom',path:['studentCount'],message:'A minimum requires a student count.'});
});
export type SocialProof=z.infer<typeof socialProofSchema>;
export const emptySocialProof:SocialProof={published:false,studentCount:null,studentMinimum:false,rating:null,ratingCount:null,milestones:[]};
