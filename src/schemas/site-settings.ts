import {z} from 'zod';
import {safeImage} from '@/lib/safe-image';
const text=(max:number)=>z.string().trim().min(2).max(max);
export function validSocial(value:string,service:'facebook'|'youtube'){try{const url=new URL(value);const allowed=service==='facebook'?['facebook.com','www.facebook.com']:['youtube.com','www.youtube.com'];return url.protocol==='https:'&&allowed.includes(url.hostname.toLowerCase())&&!url.username&&!url.password&&!url.port&&url.pathname!=='/';}catch{return false}}
export function validWebsite(value:string){if(!value)return true;try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.hostname.includes('.')&&!u.search&&!u.hash&&u.pathname==='/' }catch{return false}}
export const siteSettingsSchema=z.object({website:z.string().trim().max(500).refine(validWebsite).optional(),taglineBn:z.string().trim().min(2).max(120).optional(),nameBn:text(120),nameEn:text(120),addressBn:text(500),addressEn:text(500),logoUrl:z.string().trim().max(1000).refine(v=>Boolean(safeImage(v))),facebook:z.string().trim().max(500).refine(v=>validSocial(v,'facebook')),youtube:z.string().trim().max(500).refine(v=>validSocial(v,'youtube'))});
