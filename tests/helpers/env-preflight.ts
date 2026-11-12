/**
 * Shared prerequisite checks for tests that need a local MongoDB, a browser, or a running app.
 *
 * Why this exists: when a prerequisite is missing, the raw failure is a long stack trace from
 * mongodb-memory-server or Playwright, usually only after minutes of retries and waiting.
 * These checks run first and stop with one actionable message. A BLOCKED result means the test
 * never reached application code — it is an environment limitation, not a product defect.
 *
 * Nothing here changes what a test asserts; it only decides whether the test can start.
 */
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

/** Redacts any user:password in a Mongo URI so credentials never reach a log file. */
export function safeUri(uri:string):string{
  return uri.replace(/\/\/([^/@]*)@/,(_match,credentials:string)=>`//${credentials.includes(':')?'<user>:<password>':'<user>'}@`);
}

/**
 * HTTPS reachability probe. A raw TCP connect is not enough: a filtering proxy can accept the
 * socket and then drop the TLS handshake, which looks "open" but cannot serve a file. Any HTTP
 * status (even 403/404) proves the host is really reachable; only a thrown error means blocked.
 */
export async function probeHttps(url:string,timeoutMs=8000):Promise<string>{
  try{
    const response=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(timeoutMs),redirect:'follow'});
    return `reachable (HTTP ${response.status})`;
  }catch(error){
    const e=error as Error&{cause?:{code?:string}};
    return `not reachable (${e.cause?.code||e.name||e.message.split('\n')[0]})`;
  }
}

/** Path to a mongod that is already on this machine, or null when one would have to be downloaded. */
export async function findLocalMongod():Promise<string|null>{
  try{
    const {DryMongoBinary}=await import('mongodb-memory-server-core');
    const options=await DryMongoBinary.generateOptions({});
    return (await DryMongoBinary.locateBinary(options))||null;
  }catch{return null}
}

/** The archive mongodb-memory-server would download here (best effort, performs no download). */
async function plannedDownload():Promise<string>{
  try{
    const {DryMongoBinary}=await import('mongodb-memory-server-core');
    const options=await DryMongoBinary.generateOptions({});
    return `mongod ${options.version} for ${options.platform}/${options.arch} from https://fastdl.mongodb.org (MONGOMS_DOWNLOAD_HOST)`;
  }catch{return 'a mongod archive from https://fastdl.mongodb.org'}
}

export type PreflightOptions={
  /** Needs a MongoDB server: an in-memory replica set, or TEST_MONGO_URI when one is given. */
  mongo?:boolean;
  /** Needs a Playwright Chromium browser. */
  browser?:boolean;
  /** App base URL to reach. With TEST_ORIGIN the test attaches to an already-running app. */
  origin?:string;
  /** How long to wait for an external app to answer. */
  originTimeoutMs?:number;
  /** Label used in the message, e.g. the test file name. */
  test?:string;
};

export type PreflightResult={external:boolean;mongoUri?:string;browserPath:string|null};

/** Throws an Error starting with "BLOCKED" when a prerequisite is unavailable. */
export async function preflight(opts:PreflightOptions={}):Promise<PreflightResult>{
  const external=!!(opts.origin&&process.env.TEST_MONGO_URI);
  const problems:string[]=[];

  if(opts.browser){
    let browserPath='';
    try{browserPath=chromium.executablePath()}catch(error){
      problems.push(`Playwright Chromium is not installed (${String((error as Error).message).split('\n')[0]}).\n     Fix: npx playwright install chromium`);
    }
    // executablePath() only computes the location; the browser itself may still be missing.
    if(browserPath&&!existsSync(browserPath))problems.push(`Playwright Chromium is missing at ${browserPath}.\n     Fix: npx playwright install chromium`);
  }

  if(opts.mongo){
    if(external){
      const uri=process.env.TEST_MONGO_URI!;
      try{
        const {default:mongoose}=await import('mongoose');
        await mongoose.createConnection(uri,{dbName:'dictioncoaching',serverSelectionTimeoutMS:6000}).asPromise();
      }catch(error){
        problems.push(`TEST_MONGO_URI was given but that server did not answer: ${safeUri(uri)}\n     Detail: ${String((error as Error).message).split('\n')[0]}\n     Fix: start it (npm run test:mongo), or unset TEST_MONGO_URI to use an in-memory replica set.`);
      }
    }else if(!await findLocalMongod()){
      const state=await probeHttps('https://fastdl.mongodb.org/');
      if(!state.startsWith('reachable'))problems.push(`No local mongod binary, and the download host is not reachable from this machine\n     (https://fastdl.mongodb.org/ → ${state}). It would need ${await plannedDownload()}.\n     Fix with ONE of:\n       1. Run on a machine with normal internet access to fastdl.mongodb.org (the usual case).\n       2. Reuse an existing mongod: MONGOMS_SYSTEM_BINARY=/path/to/mongod\n       3. Attach to an already-running app + database:\n          TEST_ORIGIN=http://127.0.0.1:3100 TEST_MONGO_URI='mongodb://127.0.0.1:27017/dictioncoaching?replicaSet=testset'`);
    }
  }

  if(opts.origin){
    const deadline=Date.now()+(opts.originTimeoutMs??60_000);
    let answered=false;
    while(Date.now()<deadline&&!answered){
      try{answered=(await fetch(`${opts.origin}/api/auth/csrf`,{signal:AbortSignal.timeout(5000)})).ok}catch{/* not up yet */}
      if(!answered)await new Promise(r=>setTimeout(r,1000));
    }
    if(!answered)problems.push(`The application did not answer at ${opts.origin}/api/auth/csrf.\n     Fix: start it first in another terminal (npm run test-mode, or npm run dev).`);
  }

  if(problems.length)throw new Error(`BLOCKED (environment, not a product bug) — ${opts.test||'this test'} could not start:\n\n   - ${problems.join('\n\n   - ')}\n\n   No application code ran and no assertion was made.\n`);
  let browserPath:string|null=null;
  if(opts.browser){try{browserPath=chromium.executablePath()}catch{browserPath=null}}
  return {external,mongoUri:external?process.env.TEST_MONGO_URI:undefined,browserPath};
}
