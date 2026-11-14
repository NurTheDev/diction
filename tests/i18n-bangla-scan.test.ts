/**
 * A.7 · No Bangla interface text is left in `src/`.
 *
 * Every sentence a page can paint has to come from `src/messages/{bn,en}.json`, because a sentence
 * written into a component is a sentence the English page shows in Bangla. This suite walks `src/`
 * and reports what is left, quoting the Bangla each line carries.
 *
 * Two things are allowed to stay, and both are deliberate:
 *   • a block between `i18n-scan-allow-start` and `i18n-scan-allow-end`, or a single line carrying
 *     `i18n-scan-allow:` — a synonym table that reads
 *     what a spreadsheet or a provider wrote (`বিজ্ঞান` means science), or an SMS body, which is the
 *     message's own content rather than the interface around it;
 *   • a comment, which explains the domain to the next reader and is never painted on a page.
 *
 * Digit tables are not exempt: they are written as code points (`\u09e6`) so a digit, which is data
 * and not a word, needs no marker.
 *
 * Run: npx tsx tests/i18n-bangla-scan.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const BN=/[\u0980-\u09ff]/;

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


const offenders:string[]=[];
const files=sourceFiles('src');
for(const file of files){
  const lines=fs.readFileSync(file,'utf8').split('\n');
  let allowed=false;
  lines.forEach((line,index)=>{
    if(line.includes('i18n-scan-allow-start'))allowed=true;
    if(line.includes('i18n-scan-allow-end'))allowed=false;
    // `-start`/`-end` brackets a block; a bare `i18n-scan-allow:` exempts the one line it sits on.
    if(allowed||!BN.test(line)||line.includes('i18n-scan-allow:'))return;
    const trimmed=line.trim();
    // A comment explains the domain to the next reader; it is never painted on a page.
    if(trimmed.startsWith('*')||trimmed.startsWith('//')||trimmed.startsWith('/*'))return;
    /* This codebase writes one statement per line, so the line itself says nothing: quote the Bangla
       the line carries, which is what has to move. */
    const runs=[...line.matchAll(/[\u0980-\u09ff][^'"`;{}<>]*[\u0980-\u09ff]|[\u0980-\u09ff]+/g)].map(match=>match[0].trim());
    offenders.push(`${file}:${index+1}: ${[...new Set(runs)].slice(0,3).join(' / ').slice(0,90)}`);
  });
}
assert.deepEqual(offenders,[],'no Bangla interface text is left in src/ outside an i18n-scan-allow block');

console.log(`Bangla scan: ${files.length} files walked, nothing left outside the allow blocks.`);
