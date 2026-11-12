import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
// A build is reusable only while all application/build inputs match the
// fingerprint generated at packaging or immediately after a test-mode build.
export async function sourceFingerprint(){
  const roots=['src','public','package.json','package-lock.json','next.config.ts','tsconfig.json','postcss.config.mjs','next-env.d.ts'];
  const files:string[]=[];
  async function walk(p:string){const st=await import('node:fs/promises').then(x=>x.lstat(p));if(st.isSymbolicLink())throw Error(`Unexpected symlink: ${p}`);if(st.isDirectory()){for(const name of (await readdir(p)).sort())await walk(path.join(p,name))}else if(st.isFile())files.push(p)}
  for(const p of roots)await walk(p);
  const h=createHash('sha256');for(const p of files.sort()){const bytes=await readFile(p);h.update(`${p.replaceAll(path.sep,'/')}\0${bytes.length}\0`);h.update(bytes)}return h.digest('hex');
}
