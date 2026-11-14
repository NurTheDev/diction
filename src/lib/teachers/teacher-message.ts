/**
 * One place that renders a `teacherCvs` catalog key into both languages.
 *
 * A refusal is decided in a module that has no request and therefore no locale, so it carries its key
 * and params; whoever answers the operator renders the sentence. The leads vocabulary has the same
 * file for the same reason (`src/lib/leads/lead-message.ts`): no Bangla literal lives in code, and a
 * row written under one locale still explains itself under the other.
 */
import {formatNumber} from '@/lib/admin/format';
import bnMessages from '@/messages/bn.json';
import enMessages from '@/messages/en.json';

const resolveMessage=(catalog:unknown,key:string):string=>key.split('.').reduce((node:unknown,part:string)=>((node||{}) as Record<string,unknown>)?.[part],catalog) as string;
/** Numbers are written in the digits of the language being rendered: Bangla digits in Bangla (A.4). */
function fillMessage(template:string,params:Record<string,string|number>,digits:'bn'|'en'):string{
  return String(template).replace(/\{(\w+)\}/g,(whole,name)=>{
    if(!(name in params))return whole;
    const value=params[name];
    return typeof value==='number'?formatNumber(value,digits):String(value);
  });
}

/** The Bangla and English sentence for one key, with its params filled in. */
export function renderTeacherPair(key:string,params:Record<string,string|number>={}):{messageBn:string;messageEn:string}{
  return {messageBn:fillMessage(resolveMessage(bnMessages.teacherCvs,key),params,'bn'),messageEn:fillMessage(resolveMessage(enMessages.teacherCvs,key),params,'en')};
}
