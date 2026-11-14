/**
 * The preview's approval token: the import half refuses a file whose preview it did not sign.
 *
 * A refusal is named, not written: `throwImport` hands back a key and its params, and the screen
 * that catches it says the sentence in the reader's language. The Bangla `message` on the error is
 * what a log line and a test assertion see.
 */
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {throwImport} from './import-text';
const sign=(actor:string,fileHash:string,id:string,expires:number)=>createHmac('sha256',process.env.NEXTAUTH_SECRET||'').update(JSON.stringify([actor,fileHash,id,expires])).digest('hex');
export function newWorkbookApproval(actor:string,fileHash:string){if(!process.env.NEXTAUTH_SECRET)throw Error('CONFIG');const id=randomBytes(16).toString('hex'),expires=Date.now()+24*3600*1000;return `${id}.${expires}.${sign(actor,fileHash,id,expires)}`}
export function verifyWorkbookApproval(actor:string,fileHash:string,token:string){const [id,exp,sig,...rest]=token.split('.'),expires=Number(exp);if(rest.length||!process.env.NEXTAUTH_SECRET||!/^[a-f0-9]{32}$/.test(id||'')||!/^[a-f0-9]{64}$/.test(sig||'')||!Number.isSafeInteger(expires)||expires<Date.now()||expires>Date.now()+24*3600*1000)throwImport('approvalExpired');const a=Buffer.from(sig,'hex'),b=Buffer.from(sign(actor,fileHash,id,expires),'hex');if(!timingSafeEqual(a,b))throwImport('approvalInvalid');return id}
