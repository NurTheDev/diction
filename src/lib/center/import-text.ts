/**
 * The server-side half of `./import-message`: it renders a named message out of the catalogs.
 *
 * Only server code may import this, because it pulls both message files in — `workbook-compile`,
 * `workbook-batch` and the two workbook actions, none of which a `'use client'` file reaches. The
 * pattern is the one `lib/center/sms-dialog.ts` and `lib/admin/recycle.ts` already use: a library
 * that has to speak without next-intl reads the catalog itself.
 *
 * Substitution is plain `{name}` replacement. That is deliberate: the messages here carry no plurals
 * and no selects, and the rendered Bangla has to be byte-identical to the sentence the importer
 * threw before it was named, because tests assert on it.
 */
import bnMessages from '@/messages/bn.json';
import enMessages from '@/messages/en.json';
import {monthNames} from '@/lib/admin/months';
import {ImportMessageError,type MessageParams} from './import-message';

const TABLES:Record<string,unknown>={bn:bnMessages,en:enMessages};

function walk(table:unknown,path:string[]):string|undefined{
  let node:unknown=table;
  for(const part of path){
    if(!node||typeof node!=='object')return undefined;
    node=(node as Record<string,unknown>)[part];
  }
  return typeof node==='string'?node:undefined;
}

/** Fill `{name}` holes. A param that is missing leaves the hole visible rather than printing blank. */
function fill(text:string,params:MessageParams|undefined):string {
  return text.replace(/\{(\w+)\}/g,(whole,name)=>(params&&name in params?String(params[name]):whole));
}

/** Render one named message. `group` is the catalog group, `key` the path inside it. */
export function importText(locale:string,group:string,key:string,params?:MessageParams):string {
  const table=TABLES[locale]||TABLES.bn;
  return fill(walk(table,[group,...key.split('.')])??key,params);
}

/** Refuse, in Bangla, carrying the key so the screen can say it again in the reader's language. */
export function throwImport(key:string,params?:MessageParams):never {
  throw new ImportMessageError(key,params,importText('bn','importErrors',key,params));
}

/** What an action hands back when a library refused: the key to translate, and the Bangla it was thrown with. */
export function importErrorState(e:unknown,fallbackKey?:string):{error?:string;errorKey?:string;errorParams?:MessageParams} {
  if(e instanceof ImportMessageError)return {error:e.message,errorKey:e.key,errorParams:e.params};
  const message=e instanceof Error?e.message:String(e??'');
  return message?{error:message}:fallbackKey?{errorKey:fallbackKey}:{error:message};
}

/** The admission column plus the twelve months, in one language, in sheet order. */
export function importMonths(locale:string,admissionKey:string):string[] {
  const table=TABLES[locale]||TABLES.bn,admission=walk(table,admissionKey.split('.')),months=walk(table,['common','months']);
  return [admission??'',...monthNames(months&&typeof months==='object'?months as Record<string,string>:undefined)];
}
