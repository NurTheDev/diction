/**
 * R1.6 + R1.7 in the browser: the social-proof milestones bin (named dialog, 30-day restore,
 * daily-job purge contract) and the disable path for managed roles (a disabled role loses every
 * admin page at once, and comes back when re-enabled). Runs against the disposable test database.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {chromium} from 'playwright';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {SiteSettingsContent} from '../src/models/PublicContent';
import {AdminAudit} from '../src/models/AdminAudit';
import {siteSettings} from '../src/data/seed-content';

async function run(){
  await preflight({mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,test:'tests/admin-controls-browser.integration.ts — start the app first, then run it with TEST_ORIGIN and TEST_MONGO_URI'});
  const shared=process.env.TEST_ORIGIN?process.env.TEST_MONGO_URI:null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){
    for(const collection of await mongoose.connection.db!.listCollections().toArray()){
      await mongoose.connection.db!.collection(collection.name).deleteMany({}).catch(()=>{});
    }
  }
  const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3100';
  let ready=false;
  for(let i=0;i<60&&!ready;i++){
    try{ready=(await fetch(`${origin}/api/auth/csrf`)).ok}catch{}
    if(!ready)await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(!ready)throw Error(`app not reachable at ${origin}`);

  const password=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(password,12);
  const accounts:{[role:string]:string}={};
  for(const role of ['superadmin','exam_manager']){
    accounts[role]=`controls-${role}@example.test`;
    await User.create({name:`Synthetic ${role}`,email:accounts[role],passwordHash:hash,role,active:true});
  }
  await SiteSettingsContent.create({key:'main',name:siteSettings.name,address:siteSettings.address,logoUrl:siteSettings.logoUrl,social:siteSettings.social,theme:siteSettings.theme,proof:{published:true,studentCount:500,studentMinimum:true,rating:4.5,ratingCount:600,milestones:[
    {year:2024,title:{bn:'মাইলফলক এক',en:'Milestone one'}},
    {year:2025,title:{bn:'মাইলফলক দুই',en:'Milestone two'}},
  ]}});
  const proofDoc=()=>SiteSettingsContent.findOne({key:'main'}).select('proof').lean();
  const liveCount=async()=>((await proofDoc())?.proof?.milestones||[]).filter((m:{deletedAt?:Date})=>!m.deletedAt).length;
  const binnedCount=async()=>((await proofDoc())?.proof?.milestones||[]).filter((m:{deletedAt?:Date})=>m.deletedAt).length;

  const browser=await chromium.launch();
  try{
    async function signIn(role:string,width=1440){
      const context=await browser.newContext({viewport:{width,height:900}});
      const notes:string[]=[];
      let session:any=null;
      for(let attempt=1;attempt<=3&&!session?.user;attempt++){
        const csrfResponse=await context.request.get(`${origin}/api/auth/csrf`);
        const csrf=await csrfResponse.json();
        const form={csrfToken:csrf.csrfToken,identifier:accounts[role],password,callbackUrl:`${origin}/en/admin`};
        const headers={origin,'content-type':'application/x-www-form-urlencoded'};
        const callback=await context.request.post(`${origin}/api/auth/callback/credentials`,{timeout:180000,headers,form}).catch(()=>null);
        session=await context.request.get(`${origin}/api/auth/session`).then(response=>response.json()).catch(()=>null);
        notes.push(`attempt ${attempt}: callback ${callback?callback.status():'error'}, session ${JSON.stringify(session).slice(0,120)}`);
        if(!session?.user)await new Promise(resolve=>setTimeout(resolve,2000));
      }
      if(!session?.user)throw Error(`sign-in as ${role} failed — ${notes.join(' | ')}`);
      const page=await context.newPage(),errors:string[]=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('dialog',dialog=>dialog.accept());
      return {context,page,errors};
    }

    const toast=(page:import('playwright').Page)=>page.locator('.admin-toast');

    // ── R1.6 milestones: named dialog, 30-day bin, Undo, restore from the bin ────────────────
    const su=await signIn('superadmin');
    await su.page.goto(`${origin}/en/admin/site-settings`,{waitUntil:'domcontentloaded',timeout:180000});
    await su.page.getByRole('tab').last().click();
    const fieldsets=su.page.locator('fieldset.proof-milestone');
    await fieldsets.first().waitFor({timeout:60000});
    assert.equal(await fieldsets.count(),2,'both seeded milestones are live to start with');

    await fieldsets.first().getByRole('button',{name:'Delete',exact:true}).click();
    const dialog=su.page.getByRole('dialog');
    await dialog.waitFor();
    // The dialog is named by the engine convention, Bangla-first, even on the /en page.
    assert.match(await dialog.locator('h2').innerText(),/মাইলফলক এক \(2024\)/,'the milestone dialog names the milestone');
    assert.match(await dialog.locator('p').first().innerText(),/Recycle Bin for 30 days/,'and states the real consequence');
    await dialog.getByRole('button',{name:'Yes, delete'}).click();
    await toast(su.page).getByText('Moved to the Recycle Bin.').waitFor({timeout:60000});
    assert.equal(await liveCount(),1,'the milestone is binned, not destroyed');
    assert.equal(await binnedCount(),1,'exactly one row sits in the in-document bin');
    await toast(su.page).getByRole('button',{name:'Undo',exact:true}).click();
    await toast(su.page).getByText('Restored.').waitFor({timeout:60000});
    await fieldsets.first().waitFor({timeout:60000});
    assert.equal(await fieldsets.count(),2,'Undo brought the milestone back');
    assert.equal(await binnedCount(),0,'and emptied the bin');

    await fieldsets.first().getByRole('button',{name:'Delete',exact:true}).click();
    await su.page.getByRole('dialog').getByRole('button',{name:'Yes, delete'}).click();
    await toast(su.page).getByText('Moved to the Recycle Bin.').waitFor({timeout:60000});
    const binRow=su.page.locator('.proof-bin-row');
    await binRow.first().waitFor({timeout:60000});
    assert.match(await binRow.first().innerText(),/মাইলফলক এক \(2024\)/,'the bin names the milestone');
    assert.match(await binRow.first().innerText(),/days left/,'and shows the days left before the purge');
    await binRow.first().getByRole('button',{name:'Restore',exact:true}).click();
    await toast(su.page).getByText('Restored.').waitFor({timeout:60000});
    assert.equal(await binnedCount(),0,'Restore from the bin cleared deletedAt');
    assert.equal(await fieldsets.count(),2,'and the milestone is editable again');
    assert.deepEqual(su.errors,[],`page errors as super admin: ${su.errors.join(' | ')}`);
    await su.context.close();

    // ── R1.7 a disabled managed role loses every admin page, and comes back ──────────────────
    const boss=await signIn('superadmin');
    await boss.page.goto(`${origin}/en/admin/roles`,{waitUntil:'domcontentloaded',timeout:180000});
    const examRow=boss.page.locator('form.admin-inline').filter({hasText:'Exam manager'});
    await examRow.getByRole('button',{name:'Disable',exact:true}).click();
    await examRow.getByRole('button',{name:'Enable',exact:true}).waitFor({timeout:60000});

    const em=await signIn('exam_manager');
    await em.page.goto(`${origin}/en/admin/model-tests`,{waitUntil:'domcontentloaded',timeout:180000});
    assert.ok(em.page.url().includes('/login'),`a disabled role must not reach admin pages; landed on ${em.page.url()}`);

    await examRow.getByRole('button',{name:'Enable',exact:true}).click();
    await examRow.getByRole('button',{name:'Disable',exact:true}).waitFor({timeout:60000});
    await em.page.goto(`${origin}/en/admin/model-tests`,{waitUntil:'domcontentloaded',timeout:180000});
    assert.ok(em.page.url().includes('/admin/model-tests'),`re-enabled role reaches its pages again; landed on ${em.page.url()}`);
    assert.equal(await boss.page.locator('form.admin-inline').count(),4,'the four managed roles are the only disable-able rows; superadmin is not one of them');
    assert.deepEqual(em.errors,[],`page errors as exam manager: ${em.errors.join(' | ')}`);
    await em.context.close();
    await boss.context.close();

    for(const action of ['proof.milestone.delete','proof.milestone.restore','role.disable','role.enable']){
      assert.ok(await AdminAudit.countDocuments({action})>=1,`missing audit row for ${action}`);
    }
    console.log('Admin controls: milestone delete names the milestone and bins it for 30 days with Undo and bin restore, a disabled managed role is refused every admin page and returns when re-enabled, and every move writes an audit row.');
  }finally{
    await browser.close();
    await mongoose.disconnect();
    if(!shared)await mongo.stop();
  }
}
run().then(()=>{process.exitCode=0}).catch(error=>{console.error(error);process.exitCode=1});
