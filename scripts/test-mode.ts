/** Disposable demo mode only; never reads MONGODB_URI and never contacts a real database. */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {spawn, type ChildProcess} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {sourceFingerprint} from './test-build-fingerprint';
import {User} from '../src/models/User';
import {CenterClassGroup} from '../src/models/CenterRecords';

async function runStep(label:string,args:string[],env:NodeJS.ProcessEnv){
  console.log(`\nSTARTING TEST MODE: ${label} — first startup may take several minutes. Please wait.`);
  const code=await new Promise<number>((resolve,reject)=>{const p=spawn(process.execPath,args,{cwd:process.cwd(),env,stdio:'inherit'});const interrupt=()=>p.kill('SIGTERM');process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);const cleanup=()=>{process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt)};p.once('error',e=>{cleanup();reject(e)});p.once('exit',(c,signal)=>{cleanup();resolve(c??(signal?1:0))})});
  if(code!==0)throw Error(`${label} failed (${code}); test server was not started`);
}
async function main(){
  const port=Number(process.env.TEST_MODE_PORT||'3000');
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid TEST_MODE_PORT');
  process.env.CENTER_DATA_MODE='test';
  process.env.MONGOMS_DOWNLOAD_IGNORE_MISSING_HEADER='true';
  const origin=`http://localhost:${port}`;
  const secret=randomBytes(32).toString('base64');
  // Use the matching packaged test build when available; otherwise build before starting MongoDB or the browser.
  // The special build configuration skips Next's duplicate in-build check ONLY;
  // the standalone typecheck immediately below must pass before the build starts.
  const buildEnv={...process.env,NODE_OPTIONS:'--max-old-space-size=768',CENTER_DATA_MODE:'test',DICTION_TEST_BUILD:'1',MONGODB_URI:'',NEXTAUTH_SECRET:secret,NEXTAUTH_URL:origin,AUTH_URL:origin,AUTH_TRUST_HOST:'true'};
  await runStep('checking TypeScript',[require.resolve('typescript/bin/tsc'),'--noEmit'],buildEnv);
  const fingerprint=await sourceFingerprint();let prebuilt=false;
  try{prebuilt=(await readFile('.next/diction-test-source.sha256','utf8')).trim()===fingerprint;await readFile('.next/BUILD_ID');await readFile('.next/required-server-files.json')}catch{prebuilt=false}
  if(prebuilt)console.log('STARTING TEST MODE: matching prebuilt test application found; no first-page compilation needed.');
  else{await runStep('building the test application',[require.resolve('next/dist/bin/next'),'build','--webpack'],buildEnv);await writeFile('.next/diction-test-source.sha256',await sourceFingerprint())}
  console.log('Starting disposable test database… first startup may download MongoDB.');
  const mongo=await MongoMemoryReplSet.create({replSet:{count:1}});
  let child:ChildProcess|undefined,stopping=false;
  const stop=async(code=0)=>{if(stopping)return;stopping=true;if(child&&!child.killed)child.kill('SIGTERM');await mongoose.disconnect();await mongo.stop();process.exit(code)};
  process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
  try{
    await mongoose.connect(mongo.getUri(),{dbName:'dictioncoaching_test'});
    if(process.env.CENTER_DATA_MODE!=='test'||mongoose.connection.name!=='dictioncoaching_test'||!['127.0.0.1','localhost'].includes(mongoose.connection.host))throw Error('Demo admin requires isolated local test database');
    await User.create({name:'Demo Admin',email:'demo-admin@example.test',passwordHash:await bcrypt.hash('DemoOnly-2026!',12),role:'admin',active:true});
    await CenterClassGroup.insertMany([{name:{bn:'ক্লাস ৭',en:'Class 7'},academicYear:2026,shift:'All'},{name:{bn:'ক্লাস ৯ BS',en:'Class 9 BS'},academicYear:2026,shift:'All'}]);
    await mongoose.disconnect();
    // Published for `npm run verify`, which attaches tests and the screenshot pass to this run.
    // Local in-memory replica set with no credentials; the real MONGODB_URI is never printed.
    console.log(`TEST_ORIGIN=${origin}`);
    console.log(`TEST_MONGO_URI=${mongo.getUri()}`);
    console.log('\nDISPOSABLE TEST MODE — all data disappears when stopped.');
    console.log(`Open ${origin}/bn/admin`);
    console.log('Demo admin: demo-admin@example.test / DemoOnly-2026!');
    console.log('Database is an in-memory replica set; real MONGODB_URI is ignored. Ctrl+C to stop.\n');
    const env={...buildEnv,MONGODB_URI:mongo.getUri()};
    child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-H','0.0.0.0','-p',String(port)],{cwd:process.cwd(),env,stdio:'inherit'});
    child.once('error',e=>{console.error(e);void stop(1)});
    child.once('exit',(code,signal)=>{if(!stopping)void stop(code??(signal?1:0))});
  }catch(e){console.error(e);await stop(1)}
}
void main().catch(e=>{console.error(e);process.exitCode=1});
