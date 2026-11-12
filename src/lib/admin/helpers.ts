import {AdminAudit} from '@/models/AdminAudit';
export async function audit(actor:string,action:string,target:string){try{await AdminAudit.create({actor,action,target});}catch{console.error('Admin audit logging failed');}}
export function regexEscape(s:string){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
export function pageNumber(input:string|undefined){const n=Number(input);return Number.isInteger(n)&&n>0?Math.min(n,10000):1;}
export function formatDate(value:Date|string,locale:string){return new Intl.DateTimeFormat(locale==='bn'?'bn-BD':'en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Dhaka'}).format(new Date(value));}
