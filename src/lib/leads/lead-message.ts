/**
 * One place that renders a `leads` catalog key into both languages.
 *
 * A refusal is decided in a pure module that has no request and therefore no locale, so it carries its
 * key and params; whoever answers the operator renders the sentence. Stored rows (flags, duplicate
 * reports) keep the pair, because a lead written under one locale must still explain itself under the
 * other. Both callers import this instead of the catalogs, so no Bangla literal lives in code.
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

/** One sentence in one language — for text that is STORED (a note) rather than answered. */
export function renderLeadText(language:'bn'|'en',key:string,params:Record<string,string|number>={}):string{
  return renderLeadPair(key,params)[language==='bn'?'messageBn':'messageEn'];
}

/** The Bangla and English sentence for one key, with its params filled in. */
export function renderLeadPair(key:string,params:Record<string,string|number>={}):{messageBn:string;messageEn:string}{
  return {messageBn:fillMessage(resolveMessage(bnMessages.leads,key),params,'bn'),messageEn:fillMessage(resolveMessage(enMessages.leads,key),params,'en')};
}
