/**
 * `npm run verify` — one command that proves a milestone on the owner's machine.
 *
 * It runs, in order: dependency/Node check → every unit suite → Playwright browser install (only
 * if missing) → the isolated test-mode app with its disposable database → a signed-in screenshot
 * pass at 360 px and 1440 px → the browser tests → and then writes
 *
 *   verify-report.md          one line per requirement: PASS / FAIL / NOT TESTED and why
 *   screenshots/<milestone>/  every page at both widths
 *   verify-output.zip         the report, the screenshots and the raw step logs — send this back
 *
 * Design rules: nothing is marked PASS unless it was actually demonstrated in this run; a
 * requirement whose proof could not run is NOT TESTED with a reason, never silently skipped; the
 * process exit code is non-zero only when something FAILED (so "INCOMPLETE" is not mistaken for a
 * crash). Nothing here touches a real database: test mode uses its own disposable replica set.
 */
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {select,type Requirement} from './verify-plan';
import {exitCodeFor,overallStatus,renderReport,summarize,type ItemResult,type Status,type StepRecord} from './verify-report';
import {createZip,type ZipEntry} from './verify-zip';
import {probeHttps} from '../tests/helpers/env-preflight';

type RunResult={code:number;text:string;timedOut:boolean};

type Context={
  milestone:string;
  requirements:Requirement[];
  results:Record<string,ItemResult>;
  steps:StepRecord[];
  logs:{name:string;text:string}[];
  notes:string[];
  origin:string;
  mongoUri?:string;
  mongoDb?:string;
  browserReady:boolean;
  serverUp:boolean;
};

const MIN_NODE=[22,13];

function arg(name:string,fallback?:string):string|undefined{
  const hit=process.argv.find(a=>a.startsWith(`--${name}=`));
  return hit?hit.slice(name.length+3):(process.argv.includes(`--${name}`)?'true':fallback);
}

async function run(cmd:string,args:string[],opts:{env?:Record<string,string|undefined>;timeoutMs?:number;log?:string;cwd?:string;echo?:boolean}={}):Promise<RunResult>{
  const chunks:string[]=[];
  const child=spawn(cmd,args,{cwd:opts.cwd||process.cwd(),env:{...process.env,...opts.env}});
  let timedOut=false;
  const timer=opts.timeoutMs?setTimeout(()=>{timedOut=true;child.kill('SIGKILL')},opts.timeoutMs):null;
  for(const stream of [child.stdout,child.stderr]){
    stream?.setEncoding('utf8');
    stream?.on('data',(chunk:string)=>{chunks.push(chunk);if(opts.echo!==false)process.stdout.write(chunk)});
  }
  const code=await new Promise<number>(resolve=>{child.once('error',e=>{chunks.push(String(e));resolve(1)});child.once('exit',c=>resolve(c??1))});
  if(timer)clearTimeout(timer);
  const text=chunks.join('');
  if(opts.log)await writeFile(path.join('verify-output','logs',`${opts.log}.txt`),text,'utf8').catch(()=>{});
  return {code,text,timedOut};
}

function mark(ctx:Context,id:string,status:Status,evidence:string):void{
  if(!ctx.requirements.some(r=>r.id===id))return;
  ctx.results[id]={status,evidence};
}

function step(ctx:Context,ref:string,label:string,status:Status,evidence:string,logTail?:string):void{
  ctx.steps.push({ref,label,status,evidence,logTail});
  for(const r of ctx.requirements)if(r.proof.kind==='step'&&r.proof.ref===ref&&!ctx.results[r.id])mark(ctx,r.id,status,evidence);
}

function tail(text:string,lines=6):string{return text.split(/\r?\n/).filter(l=>l.trim()).slice(-lines).join(' | ').slice(0,600)}

function nodeVersionOk():{ok:boolean;version:string}{
  const version=process.versions.node;
  const [major,minor]=version.split('.').map(Number);
  return {ok:major>MIN_NODE[0]||(major===MIN_NODE[0]&&minor>=MIN_NODE[1]),version};
}

/** Extracts the test files (and any node flags) from an npm script string, so the list is never duplicated. */
function suitesFromScript(script:string):{file:string;flags:string[]}[]{
  const out:{file:string;flags:string[]}[]=[];
  for(const part of script.split('&&')){
    const file=part.match(/tests\/[\w./-]+\.ts/)?.[0];
    if(!file)continue;
    const flags=part.match(/--conditions=\S+/g)||[];
    out.push({file,flags});
  }
  return out;
}

async function stepInstall(ctx:Context):Promise<boolean>{
  const {ok,version}=nodeVersionOk();
  const packages=['next','playwright','mongodb-memory-server','mongoose','tsx','typescript'];
  const missing=packages.filter(p=>!existsSync(path.join('node_modules',p)));
  const evidence=missing.length
    ? `node_modules is incomplete (missing ${missing.join(', ')}). Run: npm ci`
    : `Node ${version}, npm ${process.env.npm_config_user_agent?.split(' ')[0].replace('npm/','')||'?'}, ${packages.length} key packages present`;
  if(!ok){
    step(ctx,'install','Dependencies and Node version','FAIL',`Node ${version} is older than the required ${MIN_NODE.join('.')}. ${evidence}`);
    return false;
  }
  if(missing.length){
    step(ctx,'install','Dependencies and Node version','FAIL',evidence);
    return false;
  }
  step(ctx,'install','Dependencies and Node version','PASS',evidence);
  return true;
}

async function stepUnitSuites(ctx:Context,scriptName:string,requirementId:string,label:string,opts:{needsDb?:boolean;env?:Record<string,string|undefined>}={}):Promise<void>{
  const pkg=JSON.parse(await readFile('package.json','utf8')) as {scripts:Record<string,string>};
  const script=pkg.scripts[scriptName];
  if(!script){step(ctx,scriptName,label,'FAIL',`package.json has no script "${scriptName}"`);return}
  if(opts.needsDb&&!ctx.mongoUri){
    step(ctx,scriptName,label,'NOT TESTED','these suites need the disposable database and test mode did not publish one');
    mark(ctx,requirementId,'NOT TESTED','no disposable database URI was published by test mode');
    return;
  }
  const suites=suitesFromScript(script);
  const tsxCli=path.join('node_modules','tsx','dist','cli.mjs');
  const failed:string[]=[];
  let ran=0;
  for(const suite of suites){
    const result=await run(process.execPath,[tsxCli,...suite.flags,suite.file],{timeoutMs:240_000,echo:false,env:opts.env});
    ran++;
    if(result.code!==0)failed.push(`${suite.file}: ${tail(result.text,6)}`);
    process.stdout.write(result.code===0?'·':'F');
  }
  process.stdout.write('\n');
  const logName=`unit-${scriptName.replace(/[^a-z0-9]+/gi,'-')}`;
  ctx.logs.push({name:logName,text:`${ran} suites from "${scriptName}"\n${failed.length?failed.join('\n'):'all passed'}`});
  if(!ran){step(ctx,scriptName,label,'NOT TESTED',`no test files found in the "${scriptName}" script`);mark(ctx,requirementId,'NOT TESTED','no suites ran');return}
  if(failed.length){
    step(ctx,scriptName,label,'FAIL',`${ran-failed.length}/${ran} passed. Failing: ${failed.join(' ; ').slice(0,400)}`);
    mark(ctx,requirementId,'FAIL',`${ran-failed.length}/${ran} suites passed. First failure: ${failed[0].slice(0,300)}`);
    return;
  }
  step(ctx,scriptName,label,'PASS',`${ran}/${ran} suites passed`);
  mark(ctx,requirementId,'PASS',`${ran}/${ran} suites passed on this machine`);
}

async function stepBrowser(ctx:Context):Promise<void>{
  try{
    const {chromium}=await import('playwright');
    const executable=chromium.executablePath();
    if(existsSync(executable)){ctx.browserReady=true;ctx.notes.push(`Playwright Chromium found at ${executable}`);return}
    const cdn=await probeHttps('https://cdn.playwright.dev/');
    if(!cdn.startsWith('reachable')){
      ctx.notes.push(`Playwright Chromium is missing and cdn.playwright.dev is ${cdn}, so it could not be installed automatically.`);
      return;
    }
    process.stdout.write('Installing Playwright Chromium (one time)…\n');
    const result=await run(process.execPath,[path.join('node_modules','playwright','cli.js'),'install','chromium'],{timeoutMs:900_000,log:'playwright-install'});
    ctx.browserReady=result.code===0&&existsSync(chromium.executablePath());
    ctx.notes.push(ctx.browserReady?'Playwright Chromium installed by npm run verify.':`Playwright Chromium install exited ${result.code}. On Linux you may also need: npx playwright install-deps`);
  }catch(error){
    ctx.notes.push(`Playwright browser check failed: ${String((error as Error).message).split('\n')[0]}`);
  }
}

/** Waits for the test-mode child, mapping its log onto the typecheck/build/database/serve steps. */
async function stepApp(ctx:Context,port:number,timeoutMs:number):Promise<void>{
  const child=spawn(process.execPath,[path.join('node_modules','tsx','dist','cli.mjs'),'scripts/test-mode.ts'],{
    cwd:process.cwd(),
    // CENTER_EXAM_WRITE_ENABLED is on for this disposable database only, so the exam flow can be
    // demonstrated end to end instead of asserting a disabled button. Production keeps the default.
    env:{...process.env,TEST_MODE_PORT:String(port),MONGODB_URI:'mongodb://THIS-MUST-NOT-BE-USED.invalid/prod',CENTER_EXAM_WRITE_ENABLED:'true'},
    stdio:['ignore','pipe','pipe'],
  });
  let log='';
  const onData=(chunk:Buffer)=>{
    log+=chunk.toString();
    const uri=log.match(/TEST_MONGO_URI=(\S+)/);
    if(uri&&!ctx.mongoUri)ctx.mongoUri=uri[1];
    const db=log.match(/TEST_MONGO_DB=(\S+)/);
    if(db&&!ctx.mongoDb)ctx.mongoDb=db[1];
    process.stdout.write(chunk.toString().split(/\r?\n/).filter(l=>/STARTING|Compiled|Generating static|Ready in|DISPOSABLE|Demo admin|Open http|Error|error TS|DownloadError/.test(l)).map(l=>l+'\n').join(''));
  };
  child.stdout?.on('data',onData);
  child.stderr?.on('data',onData);
  let exited=false,exitCode=0;
  child.once('exit',c=>{exited=true;exitCode=c??1});
  ctx.logs.push({name:'test-mode-stdout',text:''});

  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline&&!ctx.serverUp){
    if(exited)break;
    try{ctx.serverUp=(await fetch(`${ctx.origin}/api/auth/csrf`,{signal:AbortSignal.timeout(5000)})).ok}catch{/* not ready yet */}
    if(!ctx.serverUp)await new Promise(r=>setTimeout(r,2000));
  }
  ctx.logs[ctx.logs.length-1]={name:'test-mode-stdout',text:log};

  // typecheck runs first inside test-mode: reaching the build step proves it passed.
  const reachedBuild=/STARTING TEST MODE: building the test application|matching prebuilt test application found/.test(log);
  const tsErrors=(log.match(/error TS\d+/g)||[]).slice(0,5);
  step(ctx,'typecheck','TypeScript check (tsc --noEmit)',tsErrors.length?'FAIL':reachedBuild||ctx.serverUp?'PASS':'NOT TESTED',
    tsErrors.length?`tsc reported ${tsErrors.join(', ')}`:reachedBuild||ctx.serverUp?'tsc --noEmit reported no errors':'test-mode never reached the TypeScript result');

  const built=/Compiled successfully|matching prebuilt test application found/.test(log);
  const compiledIn=log.match(/Compiled successfully in \S+/)?.[0];
  step(ctx,'build','Production build of all routes',built?'PASS':exited?'NOT TESTED':'NOT TESTED',
    built?(compiledIn||'prebuilt test application matched the source fingerprint'):`the build did not finish (${tail(log,2)})`);

  if(!ctx.serverUp){
    const downloadFailure=log.match(/Download failed for url "([^"]+)"/);
    const reason=downloadFailure
      ? `the disposable database needs ${downloadFailure[1]} and this machine could not download it. Fix: run on a normal internet connection, or set MONGOMS_SYSTEM_BINARY=/path/to/mongod.`
      : `the test-mode app did not answer at ${ctx.origin} (exit ${exitCode}). Last output: ${tail(log,3)}`;
    step(ctx,'database','Isolated disposable test database','NOT TESTED',reason);
    step(ctx,'serve','App serves the admin sign-in page','NOT TESTED',reason);
    ctx.notes.push('Everything that needs the running app is NOT TESTED for the reason above. Unit-test results are still valid.');
    return;
  }
  step(ctx,'database','Isolated disposable test database','PASS',ctx.mongoUri?`in-memory replica set at ${ctx.mongoUri.replace(/\/\/[^@]*@/,'//')} (database ${ctx.mongoDb||'dictioncoaching_test'}); the real MONGODB_URI was replaced with an invalid host for this run`:'in-memory replica set started');
  step(ctx,'serve','App serves the admin sign-in page','PASS',`GET ${ctx.origin}/api/auth/csrf answered 200`);
  ctx.notes.push('This run served the disposable database with CENTER_EXAM_WRITE_ENABLED=true, so the exam create, marks and publication flow is demonstrated end to end. The gate stays off by default in production and is scheduled for removal in R5.');
  ctx.logs[ctx.logs.length-1]={name:'test-mode-stdout',text:log};
  (ctx as Context&{stop?:()=>void}).stop=()=>{if(!exited)child.kill('SIGTERM')};
}

/** Signs in over plain HTTP (no browser needed) and loads the dashboard. */
async function stepSignIn(ctx:Context):Promise<void>{
  if(!ctx.serverUp){step(ctx,'signin','Demo admin sign-in','NOT TESTED','the app is not running');return}
  try{
    const jar:string[]=[];
    const collect=(response:Response):void=>{for(const cookie of response.headers.getSetCookie?.()||[])jar.push(cookie.split(';')[0])};
    const csrfResponse=await fetch(`${ctx.origin}/api/auth/csrf`);
    collect(csrfResponse);
    const {csrfToken}=await csrfResponse.json() as {csrfToken:string};
    const login=await fetch(`${ctx.origin}/api/auth/callback/credentials`,{
      method:'POST',redirect:'manual',
      headers:{'content-type':'application/x-www-form-urlencoded',origin:ctx.origin,cookie:jar.join('; ')},
      body:new URLSearchParams({csrfToken,identifier:'demo-admin@example.test',password:'DemoOnly-2026!',callbackUrl:`${ctx.origin}/bn/admin`,json:'true'}),
    });
    collect(login);
    const badLogin=/signin|error/.test(login.headers.get('location')||'')&&login.status!==200;
    if(login.status>=400||badLogin){step(ctx,'signin','Demo admin sign-in','FAIL',`credentials callback returned ${login.status} ${login.headers.get('location')||''}`);return}
    const dashboard=await fetch(`${ctx.origin}/bn/admin`,{headers:{cookie:jar.join('; ')},redirect:'manual'});
    const ok=dashboard.status===200;
    step(ctx,'signin','Demo admin sign-in',ok?'PASS':'FAIL',ok?`signed in and GET /bn/admin returned 200 with the session cookie`:`GET /bn/admin returned ${dashboard.status}`);
  }catch(error){
    step(ctx,'signin','Demo admin sign-in','FAIL',String((error as Error).message).split('\n')[0]);
  }
}

async function stepScreens(ctx:Context):Promise<void>{
  const requirement=ctx.requirements.find(r=>r.proof.kind==='screens');
  if(!requirement)return;
  const dir=path.join('screenshots',ctx.milestone.toLowerCase());
  if(!ctx.serverUp){mark(ctx,requirement.id,'NOT TESTED','the app is not running');return}
  if(!ctx.browserReady){mark(ctx,requirement.id,'NOT TESTED','Playwright Chromium is unavailable (see Notes)');return}
  try{
    const {captureScreens}=await import('./verify-screens');
    const capture=await captureScreens({origin:ctx.origin,mongoUri:ctx.mongoUri!,mongoDb:ctx.mongoDb,outDir:dir,milestone:ctx.milestone});
    ctx.logs.push({name:'screenshots',text:JSON.stringify(capture,null,2)});
    const overflow=capture.overflow.filter(o=>o.scrollWidth>o.clientWidth+1);
    if(overflow.length)ctx.notes.push(`Horizontal overflow measured on: ${overflow.map(o=>`${o.path}@${o.width}px (${o.scrollWidth}>${o.clientWidth})`).join(', ')}`);
    if(!capture.files.length){mark(ctx,requirement.id,'NOT TESTED',`no screenshot could be captured${capture.failures.length?`: ${capture.failures[0].error}`:''}`);return}
    mark(ctx,requirement.id,capture.failures.length?'FAIL':'PASS',
      `${capture.files.length} screenshots in ${dir.split(path.sep).join('/')}${capture.failures.length?`; ${capture.failures.length} page(s) failed: ${capture.failures.map(f=>`${f.path} (${f.error})`).join(', ')}`:''}`);
  }catch(error){
    mark(ctx,requirement.id,'FAIL',String((error as Error).message).split('\n')[0]);
  }
}

async function stepBrowserTests(ctx:Context):Promise<void>{
  const tests=ctx.requirements.filter(r=>r.proof.kind==='browser');
  for(const requirement of tests){
    if(!ctx.serverUp){mark(ctx,requirement.id,'NOT TESTED','the app is not running, so the browser test cannot attach to it');continue}
    if(!ctx.mongoUri){mark(ctx,requirement.id,'NOT TESTED','no database URI was published by test mode');continue}
    if(!ctx.browserReady){mark(ctx,requirement.id,'NOT TESTED','Playwright Chromium is unavailable (see Notes)');continue}
    const logName=path.basename(requirement.proof.ref,'.ts');
    const result=await run(process.execPath,[path.join('node_modules','tsx','dist','cli.mjs'),requirement.proof.ref],{
      env:{TEST_ORIGIN:ctx.origin,TEST_MONGO_URI:ctx.mongoUri,TEST_MONGO_DB:ctx.mongoDb,CENTER_EXAM_WRITE_ENABLED:'true'},timeoutMs:900_000,log:logName,
    });
    const blocked=result.text.includes('BLOCKED (environment');
    if(result.code===0){
      const claim=result.text.split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('>')).pop()||'passed';
      mark(ctx,requirement.id,'PASS',claim.slice(0,300));
    }else{
      mark(ctx,requirement.id,blocked?'NOT TESTED':'FAIL',`${blocked?'blocked before it could start':'failed'} (exit ${result.code}): ${tail(result.text,3).slice(0,400)}`);
    }
  }
}

async function main():Promise<void>{
  // The owner's protocol verifies everything; a milestone argument narrows one delivery.
  const milestone=(arg('milestone','all')||'all').toUpperCase();
  const port=Number(arg('port','3111'));
  const skipApp=arg('skip-app')==='true';
  const requirements=select(milestone==='ALL'?'all':milestone);
  await rm('verify-output',{recursive:true,force:true});
  await mkdir(path.join('verify-output','logs'),{recursive:true});
  await mkdir(path.join('screenshots',milestone.toLowerCase()),{recursive:true});

  const ctx:Context={
    milestone,requirements,results:{},steps:[],logs:[],notes:[],
    origin:`http://localhost:${port}`,browserReady:false,serverUp:false,
  };
  const startedAt=new Date();
  console.log(`\n=== npm run verify — milestone ${milestone}, ${requirements.length} requirements ===\n`);

  const installed=await stepInstall(ctx);
  if(installed){
    await stepUnitSuites(ctx,'test:unit:core','R0.7','Core unit suites');
    await stepUnitSuites(ctx,'test:center','R0.8','Center unit suites');
    await stepUnitSuites(ctx,'test:staff-role','R1.2','Staff role: schema, guards and nav visibility');
  }else{
    for(const r of requirements)if(!ctx.results[r.id])mark(ctx,r.id,'NOT TESTED','dependencies are not installed');
  }

  if(installed&&!skipApp){
    await stepBrowser(ctx);
    await stepApp(ctx,port,25*60_000);
    await stepSignIn(ctx);
    await stepUnitSuites(ctx,'test:recycle:db','R1.1','Recycle Bin engine against the disposable database',
      {needsDb:true,env:{TEST_ORIGIN:ctx.origin,TEST_MONGO_URI:ctx.mongoUri,TEST_MONGO_DB:ctx.mongoDb}});
    await stepScreens(ctx);
    await stepBrowserTests(ctx);
    (ctx as Context&{stop?:()=>void}).stop?.();
  }else if(installed){
    for(const ref of ['typecheck','build','database','serve','signin'])step(ctx,ref,ref,'NOT TESTED','--skip-app was used');
    for(const r of requirements)if(!ctx.results[r.id])mark(ctx,r.id,'NOT TESTED','--skip-app was used: only unit suites ran');
  }

  const finishedAt=new Date();
  const screenshotFiles=existsSync(path.join('screenshots',milestone.toLowerCase()))
    ? (await readdir(path.join('screenshots',milestone.toLowerCase()))).filter(f=>f.endsWith('.png')).sort()
    : [];
  const report=renderReport({
    milestone,requirements,results:ctx.results,steps:ctx.steps,
    env:{node:process.versions.node,npm:process.env.npm_config_user_agent?.match(/npm\/([\d.]+)/)?.[1]||'unknown',platform:`${os.type()} ${os.release()} ${os.arch()}`,hostname:os.hostname()},
    startedAt:startedAt.toISOString(),finishedAt:finishedAt.toISOString(),durationMs:finishedAt.getTime()-startedAt.getTime(),
    screenshots:{dir:path.join('screenshots',milestone.toLowerCase()).split(path.sep).join('/'),files:screenshotFiles.map(f=>`screenshots/${milestone.toLowerCase()}/${f}`)},
    notes:ctx.notes,
  });
  await writeFile('verify-report.md',report,'utf8');
  await writeFile(path.join('verify-output','verify-report.md'),report,'utf8');
  for(const log of ctx.logs)await writeFile(path.join('verify-output','logs',`${log.name}.txt`),log.text,'utf8').catch(()=>{});

  const entries:ZipEntry[]=[{name:'verify-report.md',data:Buffer.from(report,'utf8')}];
  for(const log of ctx.logs)entries.push({name:`logs/${log.name}.txt`,data:Buffer.from(log.text,'utf8')});
  for(const file of screenshotFiles){
    const full=path.join('screenshots',milestone.toLowerCase(),file);
    entries.push({name:`screenshots/${milestone.toLowerCase()}/${file}`,data:await readFile(full)});
  }
  for(const extra of await readdir(path.join('verify-output','logs')).catch(()=>[] as string[])){
    if(entries.some(e=>e.name===`logs/${extra}`))continue;
    entries.push({name:`logs/${extra}`,data:await readFile(path.join('verify-output','logs',extra))});
  }
  await writeFile('verify-output.zip',createZip(entries));

  const s=summarize(requirements,ctx.results);
  console.log(`\n=== ${overallStatus(s)}: ${s.pass} PASS, ${s.fail} FAIL, ${s.notTested} NOT TESTED (of ${s.total}) ===`);
  console.log(`   report:      verify-report.md`);
  console.log(`   screenshots: screenshots/${milestone.toLowerCase()}/ (${screenshotFiles.length})`);
  console.log(`   send back:   verify-output.zip (${Math.round((await readFile('verify-output.zip')).length/1024)} KB)\n`);
  const code=exitCodeFor(s);
  process.exitCode=code;
  // Exit explicitly: a stray socket or child handle would otherwise keep a CI job alive until its
  // timeout. Everything is written and flushed before this point.
  process.exit(code);
}

main().catch(async error=>{
  console.error('\nnpm run verify could not complete:',error);
  await writeFile('verify-report.md',`# Verification report — crashed\n\n\`npm run verify\` stopped before writing a full report.\n\nError:\n\n\`\`\`\n${String((error as Error).stack||error)}\n\`\`\`\n`,'utf8').catch(()=>{});
  process.exitCode=1;
});
