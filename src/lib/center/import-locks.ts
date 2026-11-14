import {createHash} from 'node:crypto';
import type {ClientSession} from 'mongoose';
import {CenterImportLock} from '@/models/CenterRecords';
const hash=(x:string)=>createHash('sha256').update(x).digest('hex');
export const normalizeIdentityName=(name:string)=>name.normalize('NFKC').trim().toLocaleLowerCase('en');
export const identityLock=(classId:string,name:string,phone:string)=>`i:${hash(JSON.stringify([classId.toLowerCase(),normalizeIdentityName(name),phone]))}`;
export const studentLock=(id:string)=>`s:${id.toLowerCase()}`;
export const normalizedReceipt=(x:string)=>x.normalize('NFKC').replace(/[\u09e6-\u09ef]/g,c=>String(c.charCodeAt(0)-0x09e6)).trim().toLocaleLowerCase('en');
export const receiptLock=(receipt:string)=>`r:${hash(normalizedReceipt(receipt))}`;
/** Write deterministic mutex documents in lexical order, so independent Mongo transactions conflict safely.
 * Call before reading protected business state. Never delete lock documents while writers are active. */
export async function acquireCenterLocks(keys:string[],session:ClientSession){const sorted=[...new Set(keys)].sort();if(!sorted.length)return;await CenterImportLock.bulkWrite(sorted.map(_id=>({updateOne:{filter:{_id},update:{$inc:{revision:1}},upsert:true}})),{session,ordered:true})}
