/**
 * One place that renders a `leads` catalog key into both languages.
 *
 * A refusal is decided in a pure module that has no request and therefore no locale, so it carries its
 * key and params; whoever answers the operator renders the sentence. Stored rows (flags, duplicate
 * reports) keep the pair, because a lead written under one locale must still explain itself under the
 * other. Both callers import this instead of the catalogs, so no Bangla literal lives in code.
 */
import bnMessages from '@/messages/bn.json';
import enMessages from '@/messages/en.json';

const resolveMessage=(catalog:unknown,key:string):string=>key.split('.').reduce((node:unknown,part:string)=>((node||{}) as Record<string,unknown>)?.[part],catalog) as string;
const fillMessage=(template:string,params:Record<string,string|number>):string=>String(template).replace(/\{(\w+)\}/g,(whole,name)=>(name in params?String(params[name]):whole));

/** The Bangla and English sentence for one key, with its params filled in. */
export function renderLeadPair(key:string,params:Record<string,string|number>={}):{messageBn:string;messageEn:string}{
  return {messageBn:fillMessage(resolveMessage(bnMessages.leads,key),params),messageEn:fillMessage(resolveMessage(enMessages.leads,key),params)};
}
