import {headers} from 'next/headers';
import {createHmac} from 'node:crypto';
import {RateLimit} from '@/models/Intake';
/** Shared MongoDB fixed window. Proxy headers must be set by a trusted platform. */
export async function checkRateLimit(scope:string,maximum=8){await RateLimit.init();const h=await headers();const ip=h.get('x-real-ip')||h.get('x-forwarded-for')?.split(',').at(-1)?.trim()||'unknown';const window=Math.floor(Date.now()/600000);const key=createHmac('sha256',process.env.NEXTAUTH_SECRET!).update(`${scope}:${ip}:${window}`).digest('hex');const expiresAt=new Date((window+1)*600000+60000);try{const record=await RateLimit.findOneAndUpdate({key},{$inc:{count:1},$setOnInsert:{expiresAt}},{upsert:true,new:true});return record.count<=maximum;}catch(error){if((error as {code?:number}).code===11000){const record=await RateLimit.findOneAndUpdate({key},{$inc:{count:1}},{new:true});return !!record&&record.count<=maximum;}throw error;}}
