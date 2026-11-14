/**
 * Signed-in screenshot pass for `npm run verify`: every listed page at 360 px (mobile) and
 * 1440 px (desktop), plus a horizontal-overflow measurement, saved to screenshots/<milestone>/.
 *
 * Runs against an already-started app (test mode) and its disposable database. It creates no
 * records of its own except the demo admin, and only when that admin is missing.
 */
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

export type ScreenTarget={path:string;label:string;waitFor?:string};

/** Baseline pages for R0. Later milestones append their own pages here. */
export function screenPlan(_milestone:string):ScreenTarget[]{
  return [
    {path:'/bn',label:'public-home-bn'},
    {path:'/en',label:'public-home-en'},
    {path:'/bn/login',label:'sign-in'},
    {path:'/bn/admin',label:'admin-overview'},
    {path:'/bn/admin/students',label:'students-list'},
    {path:'/bn/admin/students/collect',label:'daily-collection'},
    {path:'/bn/admin/students/fees-grid',label:'class-sheet'},
    {path:'/bn/admin/students/dues',label:'due-list'},
    {path:'/bn/admin/students/import',label:'workbook-import'},
    {path:'/bn/admin/students/removed',label:'removed-students'},
    {path:'/bn/admin/center-exams',label:'center-exams'},
    {path:'/bn/admin/admissions',label:'admissions'},
    // R3 wave B: the Visitors list, the same list with quick-add already open (`?new=1` is what the
    // mobile bottom bar's plus links to), and the follow-up queue the sidebar's second item opens.
    {path:'/bn/admin/leads',label:'visitors-list'},
    {path:'/bn/admin/leads?new=1',label:'visitors-quick-add'},
    {path:'/bn/admin/leads?followUp=today',label:'visitors-follow-ups'},
    {path:'/bn/admin/content?kind=blog',label:'blog'},
    {path:'/bn/admin/recycle-bin',label:'recycle-bin'},
    {path:'/en/admin/recycle-bin',label:'recycle-bin-en'},
    /* The screens the owner reads day to day, in English: the point of the migration is that these
       read as English because the catalogs say so, not because a component picked a language. */
    {path:'/en/admin/students',label:'students-list-en'},
    {path:'/en/admin/students/collect',label:'daily-collection-en'},
    {path:'/en/admin/students/dues',label:'due-list-en'},
    {path:'/en/admin/leads',label:'visitors-list-en'},
    {path:'/en/admin/sms',label:'sms-centre-en'},
    {path:'/en/admin/students/fees-grid',label:'class-sheet-en'},
    // The exam screens and the two student screens migrated with them, in English.
    {path:'/en/admin/center-exams',label:'center-exams-en'},
    {path:'/en/admin/students/classes',label:'classes-en'},
    {path:'/en/admin/students/legacy-review',label:'legacy-review-en'},
    {path:'/en/admin/public-sheets',label:'public-sheets-en'},
    {path:'/en/admin/practice-tests',label:'practice-tests-en'},
    {path:'/en/admin/students/removed',label:'removed-students-en'},
    /* The paysheet import screen in English: it was Bangla-only in both languages until the
       workbook cluster moved into the catalogs, and no proof ever showed the English side. */
    {path:'/en/admin/students/import',label:'workbook-import-en'},
    /* The Visitor import wizard with nothing uploaded yet, in both languages: the sweep proves its
       chrome, these prove the empty state an operator first meets, at both widths. */
    {path:'/bn/admin/leads/import',label:'visitor-import-bn'},
    {path:'/en/admin/leads/import',label:'visitor-import-en'},
    // R3 wave C: the funnel report beside the list it counts, in both languages. The screens pass
    // runs before the browser suites, so what it photographs is the honest empty report.
    {path:'/bn/admin/leads/funnel',label:'leads-funnel-bn'},
    {path:'/en/admin/leads/funnel',label:'leads-funnel-en'},
  ];
}

export type CaptureResult={
  files:string[];
  failures:{path:string;error:string}[];
  overflow:{path:string;width:number;clientWidth:number;scrollWidth:number}[];
};

const slug=(target:ScreenTarget):string=>target.label||target.path.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'');

export async function captureScreens(opts:{origin:string;mongoUri:string;mongoDb?:string;outDir:string;milestone?:string;widths?:number[];timeoutMs?:number}):Promise<CaptureResult>{
  const widths=opts.widths||[360,1440];
  const timeout=opts.timeoutMs??90_000;
  const result:CaptureResult={files:[],failures:[],overflow:[]};
  await mkdir(opts.outDir,{recursive:true});

  const mongoose=(await import('mongoose')).default;
  const openedHere=mongoose.connection.readyState!==1;
  // The app's own database name: seeding or looking up the demo admin anywhere else is invisible
  // to the pages being photographed.
  const {testDbName}=await import('../tests/helpers/env-preflight');
  if(openedHere)await mongoose.connect(opts.mongoUri,{dbName:opts.mongoDb||testDbName()});
  const connection=mongoose.connection;
  // A previous browser test may have cleared the rate-limit or user collections.
  await connection.collection('ratelimits').deleteMany({}).catch(()=>{});
  const {User}=await import('../src/models/User');
  if(!await User.exists({email:'demo-admin@example.test'})){
    const bcrypt=(await import('bcryptjs')).default;
    await User.create({name:'Demo Admin',email:'demo-admin@example.test',passwordHash:await bcrypt.hash('DemoOnly-2026!',12),role:'admin',active:true});
  }

  // The digit preference is a per-account cookie the operator sets in the header, and it defaults to
  // Bangla digits. An English proof has to read as English all the way down, so every /en capture
  // asks for English digits and every /bn capture keeps the Bangla ones the account defaults to.
  const demoAdmin=await User.findOne({email:'demo-admin@example.test'}).lean();
  const digitCookie=(locale:'bn'|'en')=>({name:`diction_digits_${String(demoAdmin?._id||'')}`,value:locale,path:'/',domain:new URL(opts.origin).hostname});

  const {chromium}=await import('playwright');
  const browser=await chromium.launch();
  try{
    const context=await browser.newContext({viewport:{width:1440,height:900}});
    const csrf=await (await context.request.get(`${opts.origin}/api/auth/csrf`)).json();
    await context.request.post(`${opts.origin}/api/auth/callback/credentials`,{
      maxRedirects:0,timeout,
      headers:{origin:opts.origin,'content-type':'application/x-www-form-urlencoded'},
      form:{csrfToken:csrf.csrfToken,identifier:'demo-admin@example.test',password:'DemoOnly-2026!',callbackUrl:`${opts.origin}/bn/admin`},
    }).catch(()=>{/* a 302 with maxRedirects:0 surfaces as an error in some versions */});

    const page=await context.newPage();
    for(const target of screenPlan(opts.milestone||'')){
      try{
        const proofLocale=target.path.startsWith('/en')?'en':'bn';
        if(demoAdmin)await context.addCookies([digitCookie(proofLocale)]);
        await page.goto(opts.origin+target.path,{waitUntil:'domcontentloaded',timeout});
        if(target.waitFor)await page.locator(target.waitFor).first().waitFor({timeout:20_000});
        else await page.waitForLoadState('networkidle',{timeout:15_000}).catch(()=>{});
        for(const width of widths){
          await page.setViewportSize({width,height:900});
          await page.waitForTimeout(400);
          const metrics=await page.evaluate(()=>({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));
          result.overflow.push({path:target.path,width,...metrics});
          const file=path.join(opts.outDir,`${slug(target)}-${width}.png`);
          await page.screenshot({path:file,fullPage:true});
          result.files.push(path.relative(process.cwd(),file).split(path.sep).join('/'));
        }
      }catch(error){
        result.failures.push({path:target.path,error:String((error as Error).message).split('\n')[0]});
      }
    }
    await context.close();
  }finally{
    await browser.close();
    if(openedHere&&mongoose.connection.readyState!==0)await mongoose.disconnect().catch(()=>{});
  }
  return result;
}
