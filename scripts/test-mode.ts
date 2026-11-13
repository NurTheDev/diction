/** Disposable demo mode only; never reads MONGODB_URI and never contacts a real database. */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {spawn, type ChildProcess} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {sourceFingerprint} from './test-build-fingerprint';
import {User} from '../src/models/User';
import {CenterClassGroup,CenterStudent} from '../src/models/CenterRecords';
import {Editorial} from '../src/models/Editorial';
import {Course} from '../src/models/Course';
import {FAQContent} from '../src/models/PublicContent';

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
  const buildEnv={...process.env,NODE_OPTIONS:'--max-old-space-size=2048',CENTER_DATA_MODE:'test',DICTION_TEST_BUILD:'1',MONGODB_URI:'',NEXTAUTH_SECRET:secret,NEXTAUTH_URL:origin,AUTH_URL:origin,AUTH_TRUST_HOST:'true'};
  // Two heaps, on purpose — do not collapse them back into one. The whole-program typecheck grows with
  // the size of the repository, and at the old shared 768 MB it ran out of memory once R3 wave A landed
  // (run 43379896360: "FATAL ERROR: Ineffective mark-compacts near heap limit", the test server never
  // started, and 18 requirements came back NOT TESTED instead of the suite failing for a real reason).
  // The build keeps a smaller heap: DICTION_TEST_BUILD=1 skips Next's duplicate in-build typecheck, and
  // MongoDB plus a browser start on the same runner afterwards.
  const typecheckEnv={...buildEnv,NODE_OPTIONS:'--max-old-space-size=4096'};
  await runStep('checking TypeScript',[require.resolve('typescript/bin/tsc'),'--noEmit'],typecheckEnv);
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
    const dbName='dictioncoaching_test';
    await mongoose.connect(mongo.getUri(),{dbName});
    if(process.env.CENTER_DATA_MODE!=='test'||mongoose.connection.name!==dbName||!['127.0.0.1','localhost'].includes(mongoose.connection.host))throw Error('Demo admin requires isolated local test database');
    const demoHash=await bcrypt.hash('DemoOnly-2026!',12);
    // R1 needs all three roles on screen: super admin (Delete forever), admin (Delete) and staff
    // (Archive and Restore only). Disposable accounts in a disposable database.
    await User.create([{name:'Demo Admin',email:'demo-admin@example.test',passwordHash:demoHash,role:'admin',active:true},
      {name:'Demo Super Admin',email:'demo-super@example.test',passwordHash:demoHash,role:'superadmin',active:true},
      {name:'Demo Staff',email:'demo-staff@example.test',passwordHash:demoHash,role:'staff',active:true}]);
    const [classSeven,classNine]=await CenterClassGroup.insertMany([{name:{bn:'ক্লাস ৭',en:'Class 7'},academicYear:2026,shift:'All'},{name:{bn:'ক্লাস ৯ BS',en:'Class 9 BS'},academicYear:2026,shift:'All'}]);
    // Two students in Class 7 so the reference-blocked delete has a real count to show.
    await CenterStudent.insertMany([
      {studentId:'DEMO-1',name:{bn:'নমুনা শিক্ষার্থী এক',en:'Demo student one'},classGroup:classSeven._id,guardianPhone:'01711111111',startMonth:{year:2026,month:1},feeHistory:[{effectiveFrom:{year:2026,month:1},amount:1000}]},
      {studentId:'DEMO-2',name:{bn:'নমুনা শিক্ষার্থী দুই',en:'Demo student two'},classGroup:classSeven._id,guardianPhone:'01722222222',startMonth:{year:2026,month:1},feeHistory:[{effectiveFrom:{year:2026,month:1},amount:1000}]},
    ]);
    // Something to delete, restore and purge in every list the Recycle Bin covers.
    await Editorial.insertMany([
      {kind:'blog',slug:'demo-blog-one',title:{bn:'নমুনা ব্লগ এক',en:'Demo blog one'},body:{bn:'এটি একটি নমুনা লেখা।',en:'Sample body.'},published:true},
      {kind:'blog',slug:'demo-blog-two',title:{bn:'নমুনা ব্লগ দুই',en:'Demo blog two'},body:{bn:'আরেকটি নমুনা লেখা।',en:'Another sample.'},published:true},
      {kind:'notice',slug:'demo-notice',title:{bn:'নমুনা নোটিশ',en:'Demo notice'},summary:{bn:'নমুনা ঘোষণা।',en:'Sample notice.'},published:false},
    ]);
    await Course.create({slug:'demo-course',grade:'9',subject:'math',title:{bn:'নমুনা কোর্স',en:'Demo course'},description:{bn:'নমুনা বিবরণ।',en:'Sample description.'},published:true});
    await FAQContent.create({key:'demo-faq',question:{bn:'নমুনা প্রশ্ন?',en:'Sample question?'},answer:{bn:'নমুনা উত্তর।',en:'Sample answer.'},published:true});
    await mongoose.disconnect();
    // Published for `npm run verify`, which attaches tests and the screenshot pass to this run.
    // Local in-memory replica set with no credentials; the real MONGODB_URI is never printed.
    console.log(`TEST_ORIGIN=${origin}`);
    console.log(`TEST_MONGO_URI=${mongo.getUri()}`);
    // The database name the app is serving, so attached tests and the screenshot pass seed and
    // assert against the SAME database the pages read instead of a look-alike empty one.
    console.log(`TEST_MONGO_DB=${dbName}`);
    console.log('\nDISPOSABLE TEST MODE — all data disappears when stopped.');
    console.log(`Open ${origin}/bn/admin`);
    console.log('Demo admin: demo-admin@example.test / DemoOnly-2026!');
    console.log('Demo super admin: demo-super@example.test / DemoOnly-2026!  (Recycle Bin → Delete forever)');
    console.log('Demo staff: demo-staff@example.test / DemoOnly-2026!  (Archive and Restore, never Delete)');
    console.log('Database is an in-memory replica set; real MONGODB_URI is ignored. Ctrl+C to stop.\n');
    const env={...buildEnv,MONGODB_URI:mongo.getUri()};
    child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-H','0.0.0.0','-p',String(port)],{cwd:process.cwd(),env,stdio:'inherit'});
    child.once('error',e=>{console.error(e);void stop(1)});
    child.once('exit',(code,signal)=>{if(!stopping)void stop(code??(signal?1:0))});
  }catch(e){console.error(e);await stop(1)}
}
void main().catch(e=>{console.error(e);process.exitCode=1});
