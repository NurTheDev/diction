/**
 * A.7 · The client boundary: what a Server Component may reach for.
 *
 * `'use client'` is not a hint, it is a border. On the server side of it, Next does not hand a page the
 * module it imported — it hands the page a *client reference* standing in for every export of that
 * module. Rendering a reference as a component is the whole point of the border and works. Calling a
 * reference as a function is not: it fails while React renders the tree the page returned, after every
 * `await` in the page has already resolved — so no `try`/`catch` around the page's data work catches it,
 * no error boundary is reached, and the page's own segment simply never fills. The shell paints, the
 * screen stays empty, and nothing in the app says why.
 *
 * That is not a theory in this repository: `listTableClass('visitor')` was called from the leads page,
 * inside the branch that runs only when the list has rows, and the Visitors screen — and every suite
 * behind it — went blank for eleven verification runs. So the helpers a page may call were moved out of
 * the client modules into `list-class.ts` and `list-dates.ts`, and this suite keeps them there: any
 * plain value (a name that does not start with a capital, so not a component) imported by a server
 * module from a `'use client'` module fails the build here, naming the file, the symbol and the module.
 *
 * Type-only imports are exempt: `import type` is erased before there is a bundle to be on either side
 * of, and so is a `type` qualifier inside a value import list.
 */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,dirname,normalize,sep} from 'node:path';

const ROOT='src';
const SOURCE=/\.(ts|tsx)$/;
const SKIP=new Set(['node_modules','.next']);

function walk(dir:string,found:string[]=[]):string[]{
  for(const entry of readdirSync(dir)){
    if(SKIP.has(entry))continue;
    const path=join(dir,entry);
    if(statSync(path).isDirectory())walk(path,found);
    else if(SOURCE.test(entry))found.push(path);
  }
  return found;
}

/**
 * A module is on the client side of the border only if the directive is its FIRST statement — not prose
 * in a doc comment, which is how a sentence about `'use client'` ends up in these files. Both shapes the
 * codebase uses count: the directive alone on its line, and the directive sharing a line with the imports
 * that follow it (`'use client';import …`), which is what the dense one-line modules do.
 */
function isClientModule(text:string):boolean{
  /* Skip shebangs, blank lines and comments — line comments, and block comments, which may be multi-line. */
  let at=0;
  for(;;){
    while(at<text.length&&/\s/.test(text[at]))at+=1;
    if(text.startsWith('//',at)){const end=text.indexOf('\n',at);at=end<0?text.length:end+1;continue}
    if(text.startsWith('/*',at)){const end=text.indexOf('*/',at+2);at=end<0?text.length:end+2;continue}
    break;
  }
  return text.startsWith("'use client'",at)||text.startsWith('"use client"',at);
}

/** Where a specifier points, if it points inside `src/` at all. */
function resolve(specifier:string,importer:string):string|null{
  const base=specifier.startsWith('@/')?join(ROOT,specifier.slice(2))
    :specifier.startsWith('.')?normalize(join(dirname(importer),specifier))
    :null;
  if(!base)return null;
  for(const candidate of [base,`${base}.ts`,`${base}.tsx`,join(base,'index.ts'),join(base,'index.tsx')]){
    if(statSync(candidate,{throwIfNoEntry:false})?.isFile())return candidate.split(sep).join('/');
  }
  return null;
}

const files=walk(ROOT).map(path=>path.split(sep).join('/'));
const text=new Map(files.map(path=>[path,readFileSync(path,'utf8')]));
const client=new Set(files.filter(path=>isClientModule(text.get(path)!)));
assert.ok(client.size>20,`the sweep found ${client.size} client modules — the directive detection is broken`);

const VALUE_IMPORT=/import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*'([^']+)'/g;
const TYPE_ONLY=/^import\s+type\s/;
const offenders:{file:string;symbol:string;module:string}[]=[];

for(const file of files){
  if(client.has(file))continue;                       // a client module may import anything
  const source=text.get(file)!;
  for(const line of source.split('\n')){
    if(!line.includes('from ')||TYPE_ONLY.test(line.trim()))continue;
    VALUE_IMPORT.lastIndex=0;
    for(const match of line.matchAll(VALUE_IMPORT)){
      const [,defaultName,named,specifier]=match;
      const target=resolve(specifier,file);
      if(!target||!client.has(target))continue;
      const names=[...(defaultName?[defaultName]:[]),...(named?named.split(','):[])];
      for(const raw of names){
        const symbol=raw.trim().split(' as ').pop()!.replace(/^type\s+/,'').trim();
        /* A capital first letter is a component, which is what the border is for; a lowercase one is a
           plain value the server would receive as a reference and could not call. */
        if(symbol&&!/^[A-Z]/.test(symbol))offenders.push({file,symbol,module:target});
      }
    }
  }
}

assert.deepEqual(offenders,[],
  `a server module imports a plain value across the client boundary — React would render a client\n`+
  `reference instead of the value, and the page's segment would never fill:\n`+
  offenders.map(o=>`  ${o.file} imports '${o.symbol}' from ${o.module} ('use client')`).join('\n')+
  `\nMove the helper into a module without the directive, the way list-class.ts and list-dates.ts do.`);

/* The two server-safe homes themselves: they must stay free of the directive, or the helpers a page
   calls would be references again and the sweep above would pass while the screens went blank. */
for(const shared of ['src/components/admin/list-class.ts','src/components/admin/list-dates.ts']){
  assert.ok(!client.has(shared),`${shared} must not carry 'use client' — a page calls its helpers`);
  assert.ok(/export (const|function) /.test(readFileSync(shared,'utf8')),`${shared} exports nothing`);
}
for(const [shared,symbols] of [
  ['src/components/admin/list-class.ts',['attr','listTableClass']],
  ['src/components/admin/list-dates.ts',['monthWord','dayHeaders','shortDate','shortMonth']],
] as const){
  const source=readFileSync(shared,'utf8');
  for(const symbol of symbols){
    assert.ok(source.includes(`export const ${symbol}`)||source.includes(`export function ${symbol}`),
      `${symbol} is no longer exported by ${shared} — a page may need it and cannot import it from a client module`);
  }
}

console.log(`Client-boundary sweep passed: ${files.length} modules read, ${client.size} of them 'use client', `+
  `no server module reaches a plain value across the border.`);
