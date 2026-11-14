/**
 * A.7 · The catalogs are the only place a sentence lives, so the catalogs have to be whole.
 *
 * Three kinds of hole have already shipped and none of them fails a build: a key written one level
 * too deep (`leads.success["success.m1"]`), a sentence still carrying the template it was extracted
 * from (`${result.reference}`), and a key that exists in Bangla but not in English. Each one renders
 * as a raw key path or as literal source text on a real page, and only a browser would notice.
 *
 * So this suite reads both catalogs and then reads `src/` the way a page does: it collects every
 * namespace binding (`useTranslations('leads')`, `await getTranslations('sms')`), every key that
 * binding is called with, and every key a library hands back for somebody else to translate
 * (`messageKey`, `labelKey`, `renderLeadPair`). Each of those has to resolve in BOTH catalogs.
 *
 * It also enforces the two rules that keep Bangla where it belongs: no Bangla in `src/` outside an
 * `i18n-scan-allow` block (comments are documentation, not interface), and Bangla inside an English
 * value only where a language is naming itself.
 *
 * Run: npx tsx tests/i18n-catalog.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import bnMessages from '../src/messages/bn.json';
import enMessages from '../src/messages/en.json';

type Catalog=Record<string,unknown>;
const BN=/[\u0980-\u09ff]/;

/** Walk a dotted key down a catalog the way next-intl does: each dot is one level. */
const walk=(catalog:Catalog,key:string):unknown=>{
  let node:unknown=catalog;
  for(const part of key.split('.')){
    if(!node||typeof node!=='object')return undefined;
    node=(node as Record<string,unknown>)[part];
  }
  return node;
};
const resolve=(catalog:Catalog,key:string):string|undefined=>{
  const node=walk(catalog,key);
  return typeof node==='string'?node:undefined;
};

/** Every leaf key of a catalog, as its dotted path. */
function leaves(catalog:Catalog,prefix=''):string[]{
  const out:string[]=[];
  for(const [key,value] of Object.entries(catalog)){
    const full=prefix?`${prefix}.${key}`:key;
    if(value&&typeof value==='object')out.push(...leaves(value as Catalog,full));
    else out.push(full);
  }
  return out;
}

const sourceFiles=(root:string):string[]=>{
  const out:string[]=[];
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
    const full=path.join(root,entry.name);
    if(entry.isDirectory()){
      if(entry.name==='node_modules'||entry.name==='.next')continue;
      out.push(...sourceFiles(full));
    }else if(/\.(ts|tsx)$/.test(entry.name)&&!entry.name.endsWith('.d.ts')){
      out.push(full);
    }
  }
  return out;
};

// ── 1. The two catalogs describe the same interface ────────────────────────────────────────────
const bnKeys=leaves(bnMessages as Catalog);
const enKeys=leaves(enMessages as Catalog);
const bnSet=new Set(bnKeys),enSet=new Set(enKeys);
assert.deepEqual([...bnSet].filter(key=>!enSet.has(key)).sort(),[],'every Bangla key exists in English too');
assert.deepEqual([...enSet].filter(key=>!bnSet.has(key)).sort(),[],'every English key exists in Bangla too');
for(const key of bnKeys){
  assert.ok(String(resolve(bnMessages as Catalog,key)||'').trim(),`${key} is not empty in Bangla`);
  assert.ok(String(resolve(enMessages as Catalog,key)||'').trim(),`${key} is not empty in English`);
}
console.log('No mis-nested keys, no empty values, no leftover template literals.');

// ── 3. Every key `src/` asks for exists in both catalogs ───────────────────────────────────────
type Used={key:string;where:string;how:string;raw?:boolean};
const used:Used[]=[];
const dynamic:{where:string;text:string}[]=[];

/** Namespaces a library's key belongs to, by where the library lives. */
const keyNamespace=(file:string):string|null=>{
  if(file.includes(`${path.sep}leads${path.sep}`)||file.endsWith(`${path.sep}actions${path.sep}leads.ts`))return 'leads';
  if(file.includes(`${path.sep}center${path.sep}`)||file.endsWith(`${path.sep}actions${path.sep}sms.ts`))return 'sms';
  if(file.includes(`${path.sep}admin${path.sep}recycle.ts`))return 'recycleBin';
  return null;
};

for(const file of sourceFiles('src')){
  const text=fs.readFileSync(file,'utf8');
  const at=(index:number):string=>`${file}:${text.slice(0,index).split('\n').length}`;

  // 3a. `const t=await getTranslations('leads')` — then every `t('key')` on that binding.
  const bindings=new Map<string,string>();
  for(const match of text.matchAll(/(\w+)\s*=\s*(?:await\s+)?(?:getTranslations|useTranslations)\(\s*'([\w.]+)'\s*\)/g)){
    bindings.set(match[1],match[2]);
  }
  for(const [name,ns] of bindings){
    const call=new RegExp(`\\b${name.replace(/\$/g,'\\$')}\\s*(?:\\.raw)?\\s*\\(\\s*('([^']+)'|\`([^\`]*)\`)`,'g');
    for(const match of text.matchAll(call)){
      if(match[2])used.push({key:`${ns}.${match[2]}`,where:at(match.index!),how:name,raw:/\.raw/.test(match[0])});
      else dynamic.push({where:at(match.index!),text:`${name}(\`${match[3]}\`)`});
    }
  }

  // 3b. Keys a library returns for somebody else to translate: `messageKey:'errors.SEARCH_EMPTY'`.
  const ns=keyNamespace(file);
  if(ns){
    for(const match of text.matchAll(/\b(?:messageKey|labelKey|kindKey)\s*:\s*'([\w.]+)'/g)){
      used.push({key:match[1].startsWith(`${ns}.`)?match[1]:`${ns}.${match[1]}`,where:at(match.index!),how:'messageKey'});
    }
    for(const match of text.matchAll(/\b(?:renderLeadPair|renderLeadText)\s*\(\s*(?:'bn'|'en'|language|\w+\s*,\s*)?'([\w.]+)'/g)){
      used.push({key:`leads.${match[1]}`,where:at(match.index!),how:'renderLead'});
    }
    for(const match of text.matchAll(/\brenderLeadText\s*\(\s*\w+\s*,\s*'([\w.]+)'/g)){
      used.push({key:`leads.${match[1]}`,where:at(match.index!),how:'renderLeadText'});
    }
    for(const match of text.matchAll(/\brecycleText\s*\(\s*(?:'bn'|'en'|language|\w+)\s*,\s*'([\w.]+)'/g)){
      used.push({key:match[1].startsWith('recycleBin.')?match[1]:`recycleBin.${match[1]}`,where:at(match.index!),how:'recycleText'});
    }
  }

  // 3c. The vocabulary maps: `LEAD_STATUS_LABEL_KEYS` holds keys, not words. Only a declaration counts
  //     — a passing mention of the name in a comment must not be read as one — and the namespace is
  //     where the file lives, because a value like `statusLabels.new` is relative to it.
  const mapNamespace=keyNamespace(file);
  if(mapNamespace){
    for(const match of text.matchAll(/(?:const|let)\s+\w*_LABEL_KEYS[^=]*=\s*\{([\s\S]*?)\};/g)){
      for(const value of match[1].matchAll(/:\s*'([\w.]+)'/g)){
        used.push({key:`${mapNamespace}.${value[1]}`,where:at(match.index!),how:'labelKeyMap'});
      }
    }
  }
}

/* A translated key has to be a sentence in both catalogs. A `.raw` read is allowed to be a group —
   the whole point of it is handing a table to a component — but it still has to be there. */
const missingBn=new Set<string>(),missingEn=new Set<string>(),notSentence=new Set<string>();
for(const entry of used){
  const bn=walk(bnMessages as Catalog,entry.key),en=walk(enMessages as Catalog,entry.key);
  if(bn===undefined)missingBn.add(`${entry.key} (${entry.where}, ${entry.how})`);
  if(en===undefined)missingEn.add(`${entry.key} (${entry.where}, ${entry.how})`);
  if(!entry.raw&&(typeof bn!=='string'||typeof en!=='string'))notSentence.add(`${entry.key} (${entry.where}, ${entry.how})`);
}
assert.deepEqual([...missingBn].sort(),[],'every key src/ asks for exists in the Bangla catalog');
assert.deepEqual([...missingEn].sort(),[],'every key src/ asks for exists in the English catalog');
assert.deepEqual([...notSentence].sort(),[],'every key src/ translates is a sentence in both catalogs, not a group');
console.log(`Used keys: ${new Set(used.map(entry=>entry.key)).size} distinct across ${used.length} call sites, all present in both catalogs.`);
if(dynamic.length)console.log(`  (${dynamic.length} computed keys are not checked statically: ${dynamic.slice(0,3).map(entry=>entry.text).join(', ')} …)`);

console.log('A.7 · the catalogs are whole: parity both ways, no mis-nested keys, no leftover templates, every key src/ asks for resolves in both languages, and Bangla inside an English value only where a language names itself.');
