/**
 * R0.13 in the browser: the two-language sweep over every mounted operator screen.
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
 * The list of screens is read off the route tree, not written by hand. It used to be a list somebody
 * kept, and the paysheet import screen — mounted, and Bangla-only in both languages — was simply not
 * on it, so nothing noticed that an /en address painted Bangla. A page that exists under
 * `src/app/[locale]/admin` is swept now by construction; the only way out is NOT_A_SCREEN below, which
 * asks for a reason in writing.
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
import {existsSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';

/** The interface chrome: boxes that hold painted words, never user data.
    `.admin-top` is not here — the header is read on its own below, because it now carries the digit and
    language switcher and a picker has to name each language in that language. */
const CHROME=['.admin-nav','.admin-panel-head','.admin-heading','.admin-pagination','.admin-test-banner'];
/** Where Bangla must still be found on a /bn address. */
const BN_ANCHORS=['.admin-nav','.admin-heading'];
/** Every mounted admin screen: a directory under the admin route tree that has a `page.tsx`.
    A segment in brackets is left out, because a screen that needs an id cannot be visited by address
    alone — `/admin/students/[id]` is swept through the list it is reached from. */
function adminRoutes(root=path.join('src','app','[locale]','admin')):string[]{
  const out:string[]=[];
  const walk=(dir:string,segments:string[])=>{
    if(segments.length&&existsSync(path.join(dir,'page.tsx')))out.push('/admin/'+segments.join('/'));
    for(const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
      if(!entry.isDirectory()||entry.name.startsWith('[')||entry.name==='node_modules')continue;
      walk(path.join(dir,entry.name),[...segments,entry.name]);
    }
  };
  if(existsSync(root))walk(root,[]);
  if(existsSync(path.join(root,'page.tsx')))out.push('/admin');
  return out.sort();
}
/** R5 · The teacher portal's own exam screens. They are not under the admin route tree, so the walk
    above never reaches them, and no admin screen covers them: a teacher reads their marks grid in their
    own language and the only way that is proven is to sweep it. A bracketed route is left out for the
    same reason the admin walk leaves one out — it needs an exam id, and the R5 browser suite drives that
    screen with a real one. */
const PORTAL_PAGES=['/teacher/exams'];
/** The portal's chrome: the boxes that hold painted words on a portal screen. The public header and
    footer are deliberately not in it — they belong to the marketing site, they have never been swept, and
    an R5 suite is the wrong place for a public-site sentence to fail. What is swept is the portal's own
    frame: the hero, the card heads, the notice box, the pager and the test-mode banner. */
const PORTAL_CHROME=['.portal-hero','.portal-card-head','.notice-box','.admin-pagination','.admin-test-banner'];
const PAGES=adminRoutes();
/** A mounted screen that cannot be swept, and why. An entry here is a decision, not an oversight. */
const NOT_A_SCREEN=new Map<string,string>([]);
const SWEPT=PAGES.filter(page=>!NOT_A_SCREEN.has(page));
const BN=/[\u0980-\u09ff]/;
/** A catalog key path painted where a word should be: the sign of a client component reading a group its
    route never shipped. Checked on the learner screens, which are new in R5 slice 2 and are rendered by
    components the portal tree has never mounted before. */
const KEY_PATH=/\b(?:exams|admin|nav|common)\.[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+/;
/** The two Results tabs, each with the role that owns it: they are two screens and not one longer URL. */
const LEARNER_PAGES=[['/dashboard/results','student'],['/parent/results','parent']];

async function run(){
  await preflight({mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,test:'tests/language-sweep-browser.integration.ts — start the app first, then run it with TEST_ORIGIN and TEST_MONGO_URI (see STALE-TESTS-REPORT.md)'});
  const shared=process.env.TEST_ORIGIN?process.env.TEST_MONGO_URI:null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){for(const c of await mongoose.connection.db.listCollections().toArray()){await mongoose.connection.db.collection(c.name).deleteMany({}).catch(()=>{})}}
  await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});
  const pass=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(pass,12);
  // A superadmin, so that the screens which refuse an ordinary admin (the audit log, the roles
  // screen) are swept too instead of quietly redirecting to /admin.
  const admin=await User.create({name:'Sweep Admin',email:'sweep-admin@example.test',passwordHash:hash,role:'superadmin',active:true});
  /* R5: a teacher, so the portal's exam screen mounts for a real session instead of redirecting to the
     sign-in page and being swept as an empty one. No class is assigned on purpose — a sweep proves
     language, not data, and a class group in this database would paint its Bangla name into admin screens
     that have always been swept with an empty one. What a class does to a teacher's scope is proven by
     tests/center-exams-browser.integration.ts, which assigns one through the classes screen. */
  const teacher=await User.create({name:'Sweep Teacher',email:'sweep-teacher@example.test',passwordHash:hash,role:'teacher',active:true});
  /* R5 slice 2: a student and a guardian, so the two Results tabs the slice added mount for real sessions
     instead of redirecting to sign-in and being swept as empty pages. Neither account holds a phone number
     and no student record is seeded: a sweep proves language, not data, and a linked child here would need
     a class group and an exam whose Bangla names would paint into admin screens that have always been swept
     with an empty database. What these two pages paint without a linked child is their own chrome and the
     empty state an unlinked account gets — every word of both is the catalog's. */
  const learner=await User.create({name:'Sweep Student',email:'sweep-student@example.test',passwordHash:hash,role:'student',active:true});
  const guardianAccount=await User.create({name:'Sweep Guardian',email:'sweep-guardian@example.test',passwordHash:hash,role:'parent',active:true});
  assert.ok(PAGES.length>=30,`the admin route tree produced ${PAGES.length} screens — the walk is looking in the wrong place`);
  assert.ok(SWEPT.includes('/admin/students/import'),'the paysheet import screen is mounted, so it is swept');
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
    async function teacherSession(locale,digits){
      const context=await browser.newContext({viewport:{width:1440,height:900}});
      const csrf=await (await context.request.get(origin+'/api/auth/csrf')).json();
      await context.request.post(origin+'/api/auth/callback/credentials',{timeout:180000,headers:{origin,'content-type':'application/x-www-form-urlencoded'},form:{csrfToken:csrf.csrfToken,identifier:'sweep-teacher@example.test',password:pass,callbackUrl:`${origin}/${locale}/teacher/exams`}});
      await context.addCookies([{name:`diction_digits_${String(teacher._id)}`,value:digits,url:origin+'/'}]);
      return context;
    }
    const found=[];
    for(const [locale,digits] of [['en','en'],['bn','bn']]){
      const context=await session(locale,digits),page=await context.newPage();
      for(const route of SWEPT){
        await page.goto(origin+'/'+locale+route,{waitUntil:'domcontentloaded',timeout:180000});
        await page.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{});
        for(const selector of CHROME){
          for(const box of await page.locator(selector).all()){
            const text=await box.innerText().catch(()=>'');
            if(locale==='en'&&BN.test(text))found.push(`/${locale}${route} ${selector} carries Bangla: ${text.split('\n').find(l=>BN.test(l))}`);
          }
        }
        /* The header is read as its own box, and narrower than the sweep above: it carries the digit
           setting and the language switcher, and a picker names each language in that language — see the
           allow note in top-header.tsx, and header-nav on the public side. So the switcher is lifted out
           before the English check, and everything left in the header has to follow the address: the
           breadcrumb, the operator's own name, role and menu, and the test-mode label. */
        const headChrome=await page.evaluate(()=>{
          const source=document.querySelector('.admin-main .admin-top')||document.querySelector('.admin-top');
          const clone=source?.cloneNode(true) as HTMLElement|null;
          if(!clone)return '';
          for(const node of clone.querySelectorAll('.admin-digit-setting,.admin-user-dropdown a[href^="/bn"],.admin-user-dropdown a[href^="/en"]'))node.remove();
          return (clone.innerText||clone.textContent||'').trim();
        });
        if(locale==='en'&&BN.test(headChrome))found.push(`/en${route} .admin-top carries Bangla outside its language switcher: ${headChrome.split(' ').filter(part=>BN.test(part)).join(' ')}`);
        if(locale==='bn'&&!BN.test(headChrome))found.push(`/bn${route} .admin-top lost its Bangla: ${headChrome.slice(0,60)}`);
        const navBoxes=await page.locator(BN_ANCHORS[0]).count();
        if(!navBoxes)found.push(`/${locale}${route} painted no ${BN_ANCHORS[0]} — a mounted screen that cannot be swept has to be written into NOT_A_SCREEN with its reason`);
        // The page's own headline is the second anchor: three screens (cash collection, public
        // sheets, practice tests) paint it without an .admin-heading wrapper, so the headline is
        // what proves the /bn address still reads Bangla — and the /en address reads English.
        // A screen with no headline of its own is not a failure — the sidebar already anchors the
        // Bangla side — but where one is painted, both sides are read.
        if(await page.locator('h1').count()){
          const headline=await page.locator('h1').first().innerText().catch(()=>'');
          if(locale==='bn'&&!BN.test(headline))found.push(`/bn${route} h1 lost its Bangla: ${headline.slice(0,60)}`);
          if(locale==='en'&&BN.test(headline))found.push(`/en${route} h1 carries Bangla: ${headline.split('\n').find(l=>BN.test(l))}`);
        }
        if(locale==='bn'&&navBoxes){
          const nav=await page.locator(BN_ANCHORS[0]).first().innerText().catch(()=>'');
          if(!BN.test(nav))found.push(`/bn${route} ${BN_ANCHORS[0]} lost its Bangla: ${nav.slice(0,60)}`);
        }
      }
      await context.close();
    }
    /* R5 · the teacher portal, swept on both addresses with the portal's own chrome. The rules are the
       same two: an /en address paints no Bangla letter and no Bangla digit in the interface, and a /bn
       address still reads Bangla where the portal names itself. */
    for(const [locale,digits] of [['en','en'],['bn','bn']]){
      const context=await teacherSession(locale,digits),page=await context.newPage();
      for(const route of PORTAL_PAGES){
        await page.goto(origin+'/'+locale+route,{waitUntil:'domcontentloaded',timeout:180000});
        await page.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{});
        assert.ok(page.url().includes('teacher/exams'),`the teacher was not let into ${route}; landed on ${page.url()}`);
        for(const selector of PORTAL_CHROME){
          for(const box of await page.locator(selector).all()){
            const text=await box.innerText().catch(()=>'');
            if(locale==='en'&&BN.test(text))found.push(`/${locale}${route} ${selector} carries Bangla: ${text.split('\n').find(l=>BN.test(l))}`);
          }
        }
        const hero=await page.locator('.portal-hero').count();
        if(!hero)found.push(`/${locale}${route} painted no .portal-hero — a mounted screen that cannot be swept has to be written off with its reason`);
        const headline=await page.locator('h1').first().innerText().catch(()=>'');
        if(locale==='bn'&&!BN.test(headline))found.push(`/bn${route} h1 lost its Bangla: ${headline.slice(0,60)}`);
        if(locale==='en'&&BN.test(headline))found.push(`/en${route} h1 carries Bangla: ${headline.split('\n').find(l=>BN.test(l))}`);
        const card=await page.locator('.portal-card-head').first().innerText().catch(()=>'');
        if(locale==='bn'&&!BN.test(card))found.push(`/bn${route} the card head lost its Bangla: ${card.slice(0,60)}`);
      }
      await context.close();
    }
    /* R5 slice 2 · the student's and the guardian's own Results tabs, on both addresses, with the portal's
       own chrome plus the one box that is theirs alone: the empty state an unlinked account is shown. */
    for(const [locale,digits] of [['en','en'],['bn','bn']]){
      for(const [route,role] of LEARNER_PAGES){
        const account=role==='student'?learner:guardianAccount;
        const context=await browser.newContext({viewport:{width:1440,height:900}});
        const csrf=await (await context.request.get(origin+'/api/auth/csrf')).json();
        await context.request.post(origin+'/api/auth/callback/credentials',{timeout:180000,headers:{origin,'content-type':'application/x-www-form-urlencoded'},form:{csrfToken:csrf.csrfToken,identifier:account.email,password:pass,callbackUrl:`${origin}/${locale}${route}`}});
        await context.addCookies([{name:`diction_digits_${String(account._id)}`,value:digits,url:origin+'/'}]);
        const page=await context.newPage();
        await page.goto(origin+'/'+locale+route,{waitUntil:'domcontentloaded',timeout:180000});
        await page.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{});
        assert.ok(page.url().includes(route),`a ${role} was not let into ${route}; landed on ${page.url()}`);
        for(const selector of PORTAL_CHROME){
          for(const box of await page.locator(selector).all()){
            const text=await box.innerText().catch(()=>'');
            if(locale==='en'&&BN.test(text))found.push(`/${locale}${route} ${selector} carries Bangla: ${text.split('\n').find(l=>BN.test(l))}`);
          }
        }
        if(!await page.locator('.portal-hero').count())found.push(`/${locale}${route} painted no .portal-hero — a mounted screen that cannot be swept has to be written off with its reason`);
        /* `PortalHero` spends its h1 on welcoming the account by name — data, and Bangla for a Bangla
           account — so the word that proves the tab's language is the eyebrow above the heading. */
        const headline=await page.locator('.portal-eyebrow').first().innerText().catch(()=>'');
        if(locale==='bn'&&!BN.test(headline))found.push(`/bn${route} the hero eyebrow lost its Bangla: ${headline.slice(0,60)}`);
        if(locale==='en'&&BN.test(headline))found.push(`/en${route} the hero eyebrow carries Bangla: ${headline.split('\n').find(l=>BN.test(l))}`);
        const card=await page.locator('.portal-card-head').first().innerText().catch(()=>'');
        if(locale==='bn'&&!BN.test(card))found.push(`/bn${route} the card head lost its Bangla: ${card.slice(0,60)}`);
        if(locale==='en'&&BN.test(card))found.push(`/en${route} the card head carries Bangla: ${card.split('\n').find(l=>BN.test(l))}`);
        /* The empty state is this screen's own sentence — the one an account with no linked child reads
           instead of a blank table — so it is swept like any other painted word. */
        const empty=await page.locator('[data-portal-results-empty]').first().innerText().catch(()=>'');
        if(!empty)found.push(`/${locale}${route} painted no empty state for an account with no linked student`);
        if(locale==='bn'&&!BN.test(empty))found.push(`/bn${route} the empty state lost its Bangla: ${empty.slice(0,60)}`);
        if(locale==='en'&&BN.test(empty))found.push(`/en${route} the empty state carries Bangla: ${empty.split('\n').find(l=>BN.test(l))}`);
        /* Scoped to what these two screens paint rather than to the whole body: the public header and
           footer belong to the marketing site and have never been swept. */
        const painted=await page.locator('.portal-hero, .portal-area').innerText().catch(()=>'');
        const leaked=painted.match(KEY_PATH);
        if(leaked)found.push(`/${locale}${route} paints a catalog key path instead of a word: ${leaked[0]}`);
        await context.close();
      }
    }
    assert.deepEqual(found,[],`the two-language sweep found interface text in the wrong language:\n  ${found.join('\n  ')}`);
    console.log(`Language sweep: ${SWEPT.length} mounted operator screens out of ${PAGES.length} in the admin route tree, plus ${PORTAL_PAGES.length} teacher-portal exam screen and ${LEARNER_PAGES.length} learner results tab${NOT_A_SCREEN.size?`, minus ${NOT_A_SCREEN.size} written off (${[...NOT_A_SCREEN].map(([page,why])=>`${page}: ${why}`).join('; ')})`:''}, each read twice, once per address — every English page's top bar, sidebar, panel heads, heading, pager and test-mode banner are free of Bangla letters and Bangla digits, and the Bangla pages still read Bangla in the sidebar and the heading.`);
  }finally{
    await browser.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
}
run().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
