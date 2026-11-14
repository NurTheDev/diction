/**
 * A.6 · The route sweep: what a page reaches for when it wants a word.
 *
 * A page can get its words in three ways, and only one of them survives a second language. Reading a
 * catalog key does. Writing `bn?'তালিকা লোড হয়নি।':'Could not load the staff list.'` also switches, so
 * it does not look broken on either locale — but the sentence now lives in a component, where the
 * catalogs cannot be checked against it, a translator cannot see it, and the next screen that needs it
 * writes it again. Some screens do it through a local helper (`const t=(b,e)=>bn?b:e`, then thirty
 * calls), which is the same habit in a function's clothing, so both shapes are counted.
 *
 * So this suite counts them, and counts the Bangla literals left in the files a route is made of
 * (`page`, `layout`, `error`, `not-found`, `loading`). Both counts are ratchets: the number in this
 * file is what is left today, and it may only go down. A new hardcoded pair fails the suite, and each
 * migration lowers the baseline in the same commit that does it.
 *
 * What is allowed to stay is written down with its reason, because each one is not a word a page
 * paints: a metadata locale code, the name of a language handed to a model as an instruction, the
 * label on a switcher that names the language it switches to, and a class name that this pattern
 * happens to match.
 *
 * Run: npx tsx tests/i18n-routes.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/** What is left today. Lower it in the commit that migrates the next file — never raise it. */
const BASELINE_TERNARIES=313;
const BASELINE_ROUTE_BANGLA=13;

const BN=/[\u0980-\u09ff]/;
/** `bn?'বাংলা':'English'` — a sentence chosen by language, written into the component. */
const TERNARY=/(?:(?:locale|bn|isBn)\s*===\s*'bn'|\bbn\b|\bisBn\b)\s*\?\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'/g;
/* The same habit wearing a helper: a component defines `const t=(b:string,e:string)=>bn?b:e` and then
   calls `t('বাংলা','English')` thirty times. Counting only the ternary would miss those files whole.
   Two string arguments with Bangla in one of them is the shape; a call like `set('allowShared','on')`
   is not a language pair and is filtered by requiring Bangla in either side. */
const HELPER=/\b\w{1,4}\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/g;
/** Values that are not words: a locale tag, a language name given to a model, a class name. */
const NOT_A_WORD=/^(bn|en|bn_BD|en_US|bn-BD|en-GB|Bangla|English|lang-current|)$/;

const ALLOWED=new Map<string,string>([
  ['src/app/[locale]/layout.tsx','og:locale is a metadata code (bn_BD), not a painted word'],
  ['src/app/api/public-assistant/route.ts','the language is named to the model as an instruction, in English'],
  ['src/app/api/study-buddy/route.ts','the language is named to the model as an instruction, in English'],
  ['src/components/admin/top-header.tsx','a switcher names the language it switches to'],
  ['src/components/layout/header-nav.tsx','the ternary picks a class name, not a word'],
  ['src/actions/recovery.ts','the reset email is message content, sent in the reader\u2019s language, like an SMS body'],
]);

const files=(root:string):string[]=>{
  const out:string[]=[];
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
    const full=path.join(root,entry.name);
    if(entry.isDirectory()){
      if(entry.name==='node_modules'||entry.name==='.next')continue;
      out.push(...files(full));
    }else if(/\.(ts|tsx)$/.test(entry.name)&&!entry.name.endsWith('.d.ts')){
      out.push(full);
    }
  }
  return out;
};
const relative=(file:string):string=>file.split(path.sep).join('/');
const isRouteFile=(file:string):boolean=>/(^|\/)(page|layout|error|not-found|loading|template)\.tsx?$/.test(relative(file));

const ternaries:Record<string,number>={};
const routeBangla:Record<string,number>={};
for(const file of files('src')){
  const rel=relative(file);
  const text=fs.readFileSync(file,'utf8');

  const isWord=(match:RegExpMatchArray):boolean=>!NOT_A_WORD.test(match[1])&&!NOT_A_WORD.test(match[2])&&(BN.test(match[1])||BN.test(match[2]));
  const pairs=[...text.matchAll(TERNARY),...text.matchAll(HELPER)].filter(isWord);
  if(pairs.length&&!ALLOWED.has(rel))ternaries[rel]=pairs.length;

  if(isRouteFile(file)){
    // Same rule as the Bangla scan: allow blocks are deliberate, comments are documentation.
    let allowed=false,count=0;
    for(const line of text.split('\n')){
      if(line.includes('i18n-scan-allow-start'))allowed=true;
      if(line.includes('i18n-scan-allow-end'))allowed=false;
      if(allowed||!BN.test(line)||line.includes('i18n-scan-allow:'))continue;
      const trimmed=line.trim();
      if(trimmed.startsWith('*')||trimmed.startsWith('//')||trimmed.startsWith('/*'))continue;
      count++;
    }
    if(count)routeBangla[rel]=count;
  }
}

const ternaryTotal=Object.values(ternaries).reduce((a,b)=>a+b,0);
const routeTotal=Object.values(routeBangla).reduce((a,b)=>a+b,0);
const worst=(counts:Record<string,number>):string[]=>Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,12)
  .map(([file,count])=>`${count} ${file}`);

console.log(`Language ternaries: ${ternaryTotal} in ${Object.keys(ternaries).length} files (baseline ${BASELINE_TERNARIES}).`);
console.log(`  most: ${worst(ternaries).join('; ')}`);
console.log(`  allowed: ${[...ALLOWED.entries()].map(([file,reason])=>`${path.basename(file)} — ${reason}`).join('; ')}`);
console.log(`Bangla in route files: ${routeTotal} lines in ${Object.keys(routeBangla).length} files (baseline ${BASELINE_ROUTE_BANGLA}).`);
console.log(`  most: ${worst(routeBangla).join('; ')}`);

assert.ok(ternaryTotal<=BASELINE_TERNARIES,
  `${ternaryTotal} hardcoded language pairs, above the ${BASELINE_TERNARIES} baseline — take the sentence to the catalogs instead, then lower the baseline:\n  ${worst(ternaries).join('\n  ')}`);
assert.ok(routeTotal<=BASELINE_ROUTE_BANGLA,
  `${routeTotal} Bangla lines in route files, above the ${BASELINE_ROUTE_BANGLA} baseline:\n  ${worst(routeBangla).join('\n  ')}`);

console.log('A.6 · the route sweep holds: no page reached for a new hardcoded pair, and every count moved only down.');
