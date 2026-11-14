/**
 * R0.13 in the browser: the two-language sweep over every migrated operator screen.
 *
 * The catalogs and the static gates prove the code asks for words in both languages; this sweep
 * proves the pages answer in the language of their address. For each screen it reads the interface
 * chrome — the top bar, the sidebar, the panel heads, the headings, the pager and the test-mode
 * banner — and holds two rules: on an /en address none of those boxes carries a Bangla character,
 * including Bangla digits, and on a /bn address the sidebar and the heading still read Bangla, so
 * a future commit that hardcodes a sentence, or that lets a stored digit preference bleed into an
 * English proof, fails here instead of in a screenshot someone has to read.
 *
 * User data is not part of the sweep: names, numbers and stored bodies may be Bangla on an English
 * page by design, which is why only the chrome containers are read.
 *
 * Run: start the app first, then TEST_ORIGIN and TEST_MONGO_URI (see STALE-TESTS-REPORT.md).
 */
// @ts-nocheck -- isolated browser test against the disposable database
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {chromium} from 'playwright';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';

/** The interface chrome: boxes that hold painted words, never user data. */
const CHROME=['.admin-top','.admin-nav','.admin-panel-head','.admin-heading','.admin-pagination','.admin-test-banner'];
/** Where Bangla must still be found on a /bn address. */
const BN_ANCHORS=['.admin-nav','.admin-heading'];
const PAGES=['/admin','/admin/students','/admin/students/collect','/admin/students/dues','/admin/students/fees-grid','/admin/students/classes','/admin/students/removed','/admin/center-exams','/admin/leads','/admin/sms','/admin/public-sheets','/admin/practice-tests','/admin/students/legacy-review'];
const BN=/[\u0980-\u09ff]/;

async function run(){
  await preflight({mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,test:'tests/language-sweep-browser.integration.ts — start the app first, then run it with TEST_ORIGIN and TEST_MONGO_URI (see STALE-TESTS-REPORT.md)'});
  const shared=process.env.TEST_ORIGIN?process.env.TEST_MONGO_URI:null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){for(const c of await mongoose.connection.db.listCollections().toArray()){await mongoose.connection.db.collection(c.name).deleteMany({}).catch(()=>{})}}
  await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});
  const pass=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(pass,12);
  const admin=await User.create({name:'Sweep Admin',email:'sweep-admin@example.test',passwordHash:hash,role:'admin',active:true});
  const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3100',browser=await chromium.launch();
  try{
    {let ready=false;for(let i=0;i<60&&!ready;i++){try{const r=await fetch(origin+'/api/auth/csrf');ready=r.ok}catch{}if(!ready)await new Promise(r=>setTimeout(r,1000))}if(!ready)throw Error('dev server not reachable at '+origin)}
    async function session(locale,digits){
      const context=await browser.newContext({viewport:{width:1440,height:900}});
      const csrf=await (await context.request.get(origin+'/api/auth/csrf')).json();
      await context.request.post(origin+'/api/auth/callback/credentials',{timeout:180000,headers:{origin,'content-type':'application/x-www-form-urlencoded'},form:{csrfToken:csrf.csrfToken,identifier:'sweep-admin@example.test',password:pass,callbackUrl:`${origin}/${locale}/admin`}});
      // An English proof reads English all the way down, digits included, exactly as the screenshot pass does.
      await context.addCookies([{name:`diction_digits_${String(admin._id)}`,value:digits,url:origin+'/'}]);
      return context;
    }
    const found=[];
    for(const [locale,digits] of [['en','en'],['bn','bn']]){
      const context=await session(locale,digits),page=await context.newPage();
      for(const path of PAGES){
        await page.goto(origin+'/'+locale+path,{waitUntil:'domcontentloaded',timeout:180000});
        await page.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{});
        for(const selector of CHROME){
          for(const box of await page.locator(selector).all()){
            const text=await box.innerText().catch(()=>'');
            if(locale==='en'&&BN.test(text))found.push(`/${locale}${path} ${selector} carries Bangla: ${text.split('\n').find(l=>BN.test(l))}`);
          }
        }
        // The page's own headline is the second anchor: three screens (cash collection, public
        // sheets, practice tests) paint it without an .admin-heading wrapper, so the headline is
        // what proves the /bn address still reads Bangla — and the /en address reads English.
        const headline=await page.locator('h1').first().innerText().catch(()=>'');
        if(locale==='bn'&&!BN.test(headline))found.push(`/bn${path} h1 lost its Bangla: ${headline.slice(0,60)}`);
        if(locale==='en'&&BN.test(headline))found.push(`/en${path} h1 carries Bangla: ${headline.split('\n').find(l=>BN.test(l))}`);
        if(locale==='bn'){
          const nav=await page.locator(BN_ANCHORS[0]).first().innerText().catch(()=>'');
          if(!BN.test(nav))found.push(`/bn${path} ${BN_ANCHORS[0]} lost its Bangla: ${nav.slice(0,60)}`);
        }
      }
      await context.close();
    }
    assert.deepEqual(found,[],`the two-language sweep found interface text in the wrong language:\n  ${found.join('\n  ')}`);
    console.log(`Language sweep: ${PAGES.length} operator screens read twice, once per address — every English page's top bar, sidebar, panel heads, heading, pager and test-mode banner are free of Bangla letters and Bangla digits, and the Bangla pages still read Bangla in the sidebar and the heading.`);
  }finally{
    await browser.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
}
run().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
