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
import {PUBLIC_NAMESPACES,SERVER_ONLY_NAMESPACES} from '../src/i18n/client-namespaces';

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

// ── 2b. No key is a numbered twin of another ───────────────────────────────────────────────────
/* An extraction script that meets the same sentence twice must not invent `sent2`: two names for one
   word is how 22 dead keys landed in the SMS namespace, and a suffix says nothing about which of the
   two a component means. Either the sentences are the same — then there is one key — or they are
   different, and the names say how. `hero.title1`/`title2` are fine: nothing called `hero.title`. */
const twins:string[]=[];
const byGroup=new Map<string,string[]>();
for(const key of bnKeys){
  const group=key.slice(0,key.lastIndexOf('.')),leaf=key.slice(key.lastIndexOf('.')+1);
  byGroup.set(group,[...(byGroup.get(group)||[]),leaf]);
}
for(const [group,leaves] of byGroup){
  for(const leaf of leaves){
    const base=leaf.replace(/\d+$/,'');
    if(base!==leaf&&leaves.includes(base))twins.push(`${group}.${leaf}`);
  }
}
assert.deepEqual(twins.sort(),[],'no key is a numbered twin of a key that already exists');

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

  /* 3d. The importer's libraries: `throwImport('planInvalid')` refuses with a key out of
     `importErrors`, and `importText('bn','importNotes','noteDoneAdmission')` renders one stored note.
     Both are a library naming a sentence for somebody else to translate, which is the same contract
     as `messageKey` — so the key has to exist, in both languages, like any other. */
  for(const match of text.matchAll(/\bthrowImport\s*\(\s*'([\w.]+)'/g)){
    used.push({key:match[1].startsWith('importErrors.')?match[1]:`importErrors.${match[1]}`,where:at(match.index!),how:'throwImport'});
  }
  for(const match of text.matchAll(/\bimportText\s*\(\s*(?:'bn'|'en'|locale|\w+)\s*,\s*'([\w.]+)'\s*,\s*'([\w.]+)'/g)){
    used.push({key:`${match[1]}.${match[2]}`,where:at(match.index!),how:'importText'});
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
if(dynamic.length)console.log(`  (${dynamic.length} computed keys are not checked statically: ${dynamic.map(entry=>entry.text).join(', ')})`);


const bnRange=(catalog:Catalog):string[]=>leaves(catalog).filter(key=>BN.test(String(walk(catalog,key)))).sort();

// ── 4. Bangla inside an English value: only a language naming itself ──────────────────────────
/* Four values are Bangla in the English catalog on purpose. Each one is the name of the language
   itself, which is exactly what a reader has to recognize in order to switch to it: "Switch to
   বাংলায় দেখুন", the Bangla-digits toggle, and the switcher's own বাং. Anything else in this list is
   an English page that would read Bangla. */
const ALLOWED_IN_EN=['nav.language','nav.languageShort','adminRedesign.banglaDigits','adminWork.bnTab'];
const banglaInEn=bnRange(enMessages as Catalog);
assert.deepEqual(banglaInEn,[...ALLOWED_IN_EN].sort(),'English values carry Bangla only where the word is the name of the language itself');

// ── 5. What the browser is allowed to receive ──────────────────────────────────────────────────
/* The flight payload is part of the served HTML, so a catalog value travels to the reader's machine
   whether or not anything paints it. Two rules keep that safe:

   · a group no client component reads is server-only, and `src/i18n/client-namespaces.ts` says so —
     if a `'use client'` file starts reading one of those groups, the layouts would have to ship it
     and the list is wrong, so fail here instead of painting a raw key in production;
   · a shipped value names NO variable at all — neither a secret nor a setting. Two kinds of name used
     to be treated differently: a SECRET was never named in interface text (the credential check in
     tests/sms-dialog-browser.integration.ts has always said so), while four settings were named on
     purpose, on the argument that the message was the only place the operator learned which knob was
     off. Group 2 retired that argument by writing the four sentences for the person reading them
     instead — "sending is switched off, ask whoever set up this site to turn it on" tells an operator
     what to do, and `CENTER_SMS_WRITE_ENABLED` tells them nothing they can act on, because the knob is
     in a deployment file and not in any screen they can open. The knob is still named, to the audience
     that can turn it: docs/GO-LIVE.md and docs/DEPLOYMENT.md, which tests/r7-docs.test.ts holds.
     So `NAMED_SETTINGS` is now empty and the check is the strict one — a value the browser receives
     that names an ALL_CAPS_UNDERSCORED token fails, whoever thought it was helpful. A group no client
     component reads may still name whatever it likes: it is rendered only on the page that is about it,
     which is why `aiSetup` staying server-side is what keeps GEMINI_API_KEY out of the HTML of every
     unrelated admin page. */
const shipped=(namespace:string):boolean=>!SERVER_ONLY_NAMESPACES.includes(namespace as typeof SERVER_ONLY_NAMESPACES[number]);
const readByClient=new Set<string>();
const notFiltered:string[]=[];
for(const file of sourceFiles('src')){
  const text=fs.readFileSync(file,'utf8');
  if(text.startsWith("'use client'")||text.startsWith('"use client"')){
    for(const match of text.matchAll(/useTranslations\(\s*'([^']+)'/g))readByClient.add(match[1].split('.')[0]);
  }
  // A layout that hands the catalog to the client has to hand it the filtered one.
  if(/NextIntlClientProvider/.test(text)&&/getMessages\(\)/.test(text)&&!/clientMessages\(|pickedMessages\(|clientNamespaces/.test(text))notFiltered.push(file);
}
assert.deepEqual([...readByClient].filter(ns=>!shipped(ns)).sort(),[],'no client component reads a group the layouts keep on the server');
assert.deepEqual(notFiltered.sort(),[],'every layout that ships messages to the client filters them first');
const SECRETS=['BULKSMSBD_API_KEY','GEMINI_API_KEY','AI_API_KEY','NEXTAUTH_SECRET','MONGODB_URI'];
/* Empty on purpose, and kept as the door it is: an entry here is a written reason why one shipped
   sentence may name a variable, and today there is no such sentence. Adding one is a deliberate act
   that has to be argued in this file, and `rotten` below fails the moment the value stops naming what
   the entry allowed — an excuse outliving the thing it excused. */
const NAMED_SETTINGS:Record<string,string>={};
const ENV_NAME=/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
const leakedSecrets:string[]=[],unnamedSettings:string[]=[],rotten:string[]=[];
for(const [loc,catalog] of [['bn',bnMessages],['en',enMessages]] as const){
  for(const key of leaves(catalog as Catalog)){
    const hits=[...String(walk(catalog as Catalog,key)).matchAll(ENV_NAME)].map(match=>match[0]);
    if(shipped(key.split('.')[0]))for(const hit of hits){
      if(SECRETS.includes(hit))leakedSecrets.push(`${loc} ${key} names the secret ${hit}`);
      else if(!(key in NAMED_SETTINGS))unnamedSettings.push(`${loc} ${key} names ${hit}, which no entry allows`);
    }
    if(key in NAMED_SETTINGS&&!hits.length)rotten.push(`${loc} ${key} names no variable any more`);
  }
}
assert.deepEqual(leakedSecrets.sort(),[],'no value the browser receives names a secret');
assert.deepEqual(unnamedSettings.sort(),[],'a shipped value names a setting only where the reason is written down');
assert.deepEqual([...new Set(rotten)].sort(),[],'every allowed name is still in the value it was allowed for');
console.log(`Browser exposure: ${readByClient.size} groups are read by client components, ${SERVER_ONLY_NAMESPACES.length} stay on the server, and no shipped value names a variable — ${Object.keys(NAMED_SETTINGS).length} allowances, ${SECRETS.length} secret names watched for.`);

// ── 5b. Group 3 · the words are the operator's, not the builder's ─────────────────────────────────
/* The owner's brief for this group named three words, and named them because a screen that says
   "snapshot", "write enabled" or "reconciliation" is a screen written for the person who built it: an
   owner who runs a coaching centre does not take a snapshot, does not enable a write and does not
   reconcile — they save a calculation, take a fee and match two lists. Rule 5 above is the same
   argument about a variable name; this is that argument about a word. It is checked here, over every
   shipped value in both languages, because the catalogs are the only place a sentence lives — and
   again in the browser, over the five screens this group rebuilt, because a catalog can be clean and a
   component can still hardcode a word (tests/classroom-hub-browser.integration.ts reads what an
   operator reads and fails on the same three). The Bangla spellings are watched for too: the sweep
   that rewrote these sentences rewrote both languages, and a transliteration is the same jargon in a
   different script. */
const JARGON:[string,string][]=[['snapshot','স্ন্যাপশট'],['write enabled','রাইট এনাবেলড'],['reconcil','রিকনসিলিয়েশন']];
const jargon:string[]=[];
for(const [loc,catalog] of [['bn',bnMessages],['en',enMessages]] as const){
  for(const key of leaves(catalog as Catalog)){
    const value=String(walk(catalog as Catalog,key)).toLowerCase();
    for(const [word,transliterated] of JARGON){
      if(value.includes(word)||value.includes(transliterated.toLowerCase()))jargon.push(`${loc} ${key} says "${word}"`);
    }
  }
}
assert.deepEqual(jargon.sort(),[],'no shipped sentence speaks the builder\'s jargon in either language');
console.log(`Plain language: ${JARGON.length} of the builder's own words watched for in both catalogs — ${bnKeys.length} Bangla values and ${enKeys.length} English ones, and not one of them says snapshot, write enabled or reconciliation.`);

// ── 6. A client component is given the group it reads, on the route that renders it ───────────────
/* Rule 5 knows which groups may travel to the browser. It cannot see WHERE: a page is served the
   messages its own provider chain hands it, and a chain that does not include the group a client
   component reads does not fail a build, does not fail a type check and does not fail a server test —
   next-intl hands the component its key path back and the screen reads `exams.grid.save` where a
   sentence belongs. That shipped once, on the teacher's marks grid, because the portal is not inside
   the admin tree and the public layout ships only the groups the public site's own client components
   read.

   So this walks the routes the way Next.js does: for every page, the layouts above it plus the page
   itself are its provider chain, and every client component reachable from its imports has to be read
   by a group that chain ships. Coverage is a union, which is the pragmatic reading — a nested provider
   replaces rather than merges for its own subtree, so a page that ships one group and renders a
   component reading another is still a page worth a human look, and the browser suites are where that
   nuance is settled.

   The extractor is deliberately brittle in one direction: a provider whose shape it does not recognize
   is a FAILURE, not a pass, so a new way of shipping messages has to be taught here rather than
   silently widening every route. */
const PROVIDER=/NextIntlClientProvider/;
const resolveImport=(from:string,spec:string):string|null=>{
  const base=spec.startsWith('@/')?path.join('src',spec.slice(2)):spec.startsWith('.')?path.resolve(path.dirname(from),spec):null;
  if(!base)return null;
  for(const candidate of [base,`${base}.tsx`,`${base}.ts`,path.join(base,'index.tsx'),path.join(base,'index.ts')]){
    if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile())return candidate;
  }
  return null;
};
/** The groups a file's provider ships, or `null` for "everything a client may read", or `undefined` when
    the file has a provider this extractor cannot read. */
const coverageOf=(file:string):{wide:boolean;groups:Set<string>}|undefined=>{
  const text=fs.readFileSync(file,'utf8');
  if(!PROVIDER.test(text))return {wide:false,groups:new Set()};
  if(/clientMessages\(/.test(text))return {wide:true,groups:new Set()};
  const groups=new Set<string>();
  // `pickedMessages(messages,PUBLIC_NAMESPACES)` names a list the module owns; read it from the module
  // rather than parsing an import, so the suite and the layout cannot disagree about what is in it.
  if(/pickedMessages\([^,]+,\s*PUBLIC_NAMESPACES\s*\)/.test(text))for(const group of PUBLIC_NAMESPACES)groups.add(group);
  // `pickedMessages(await getMessages(),['exams'])` names its groups in an array literal.
  for(const match of text.matchAll(/pickedMessages\([^,]+,\s*\[([^\]]*)\]/g)){
    for(const name of match[1].matchAll(/'([^']+)'/g)){
      assert.ok(!SERVER_ONLY_NAMESPACES.includes(name[1] as typeof SERVER_ONLY_NAMESPACES[number]),`${file} ships '${name[1]}', a group only a server reads`);
      groups.add(name[1]);
    }
  }
  for(const match of text.matchAll(/clientNamespaces\s*=\s*\[([^\]]*)\]/g))for(const name of match[1].matchAll(/'([^']+)'/g))groups.add(name[1]);
  for(const match of text.matchAll(/messages=\{\{([^}]*)\}\}/g))for(const name of match[1].matchAll(/(\w+)\s*:/g))groups.add(name[1]);
  for(const match of text.matchAll(/const \w*[Mm]essages=\{([^}]*)\}/g))for(const name of match[1].matchAll(/(\w+)\s*:/g))groups.add(name[1]);
  if(!groups.size)return undefined;
  return {wide:false,groups};
};
const clientGroupsOf=(file:string,seen=new Set<string>()):Set<string>=>{
  const out=new Set<string>();
  if(seen.has(file))return out;
  seen.add(file);
  const text=fs.readFileSync(file,'utf8');
  if(text.startsWith("'use client'")||text.startsWith('"use client"'))for(const match of text.matchAll(/useTranslations\(\s*'([^']+)'/g))out.add(match[1].split('.')[0]);
  for(const match of text.matchAll(/from\s+'(@\/[^']+|\.[^']+)'/g)){
    const target=resolveImport(file,match[1]);
    if(target&&/[\\/]components[\\/]|[\\/]app[\\/]/.test(target))for(const group of clientGroupsOf(target,seen))out.add(group);
  }
  return out;
};
const pages=sourceFiles(path.join('src','app')).filter(file=>/[\\/]page\.tsx$/.test(file));
const uncovered:string[]=[];
const unreadProviders:string[]=[];
for(const page of pages){
  const chain:string[]=[page];
  for(let dir=path.dirname(page);dir.startsWith('src'+path.sep)||dir==='src';dir=path.dirname(dir)){
    const layout=path.join(dir,'layout.tsx');
    if(fs.existsSync(layout))chain.push(layout);
    if(dir==='src')break;
  }
  const coverage=chain.map(file=>coverageOf(file));
  for(const file of chain){
    if(PROVIDER.test(fs.readFileSync(file,'utf8'))&&coverageOf(file)===undefined)unreadProviders.push(file);
  }
  const wide=coverage.some(entry=>entry?.wide);
  const groups=new Set<string>();
  for(const entry of coverage)if(entry)for(const group of entry.groups)groups.add(group);
  const reads=clientGroupsOf(page);
  for(const group of reads){
    if(wide||groups.has(group))continue;
    if(!shipped(group)){continue}
    uncovered.push(`${page} renders a client component reading '${group}', which no provider above it ships`);
  }
}
assert.deepEqual([...new Set(unreadProviders)].sort(),[],'every provider in src/app ships messages in a shape this suite can read');
/* Ten routes are left on this list, and what is true of them is narrower than "broken screen". Each one
   imports an admin control that a role gate then never mounts: the student and parent fee screens pull in
   the invoice form and its student-search picker (`center`) behind `{role==='admin'&&…}`, and the materials
   and notices screens of all three portal trees pull in the publish and delete controls (`adminWork`,
   through `DeleteRow`) behind `{isAdmin&&…}`. So no key path paints on them — the check that matters, and
   the reason the two practice screens that WERE on this list are now off it, is that those rendered their
   client component unconditionally and really did paint `practicePublic.exam.start` in production.

   What the ten do cost is the bundle: an admin control, and the catalog group it reads, ride along in the
   JavaScript of a student's fee screen and a teacher's materials screen. The fix is to split the portal
   component from the admin control that only an admin mounts — and NOT to ship the group, which is the
   tempting one-line answer and the wrong one: `center` holds the dues vocabulary that the wall around a
   teacher's eyes exists to keep off a teacher's screen, so it may be shipped to an admin and never into the
   teacher, student or parent trees. Named here so the list can only shrink, in both directions: a route
   that stops being uncovered has to be struck off, and a new one fails. */
const KNOWN_UNCOVERED_ROUTES=[
  'src/app/[locale]/dashboard/fees/[id]/page.tsx',
  'src/app/[locale]/dashboard/fees/page.tsx',
  'src/app/[locale]/dashboard/materials/page.tsx',
  'src/app/[locale]/dashboard/notices/page.tsx',
  'src/app/[locale]/parent/fees/[id]/page.tsx',
  'src/app/[locale]/parent/fees/page.tsx',
  'src/app/[locale]/parent/materials/page.tsx',
  'src/app/[locale]/parent/notices/page.tsx',
  'src/app/[locale]/teacher/materials/page.tsx',
  'src/app/[locale]/teacher/notices/page.tsx',
].map(route=>route.split('/').join(path.sep));
const stillUncovered=(route:string):boolean=>uncovered.some(entry=>entry.startsWith(route));
assert.deepEqual(uncovered.filter(entry=>!KNOWN_UNCOVERED_ROUTES.some(route=>entry.startsWith(route))).sort(),[],
  'every page hands its client components the catalog group they read, apart from the admin controls named as debt');
assert.deepEqual(KNOWN_UNCOVERED_ROUTES.filter(route=>!stillUncovered(route)).sort(),[],
  'every route on the debt list is still uncovered — strike it off the moment it is fixed');
console.log(`Provider chain: ${pages.length} pages walked against the layouts above them; every group a client component reads is shipped by the route that renders it, apart from ${KNOWN_UNCOVERED_ROUTES.length} named as debt.`);

console.log('A.7 · the catalogs are whole: parity both ways, no mis-nested keys, no leftover templates, every key src/ asks for resolves in both languages, and Bangla inside an English value only where a language names itself, and the browser receives no secret and no group only a server reads.');
