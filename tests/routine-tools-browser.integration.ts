/**
 * R9 · Slice 2 in the browser: the tools that write many periods at once, the day that remembers, the day
 * that goes out on WhatsApp, the teacher who reads their own week, and the sheet of paper for the board.
 *
 * Five claims, one seeded centre — two classes on one shift, two teachers who take periods in both, a
 * working sheet for today and one for tomorrow, and the weekdays chosen at runtime so the day the suite
 * runs on is always the day it writes about:
 *
 *  1. **Bulk edit and replacement.** Periods are ticked on the cards of one day and their clock moves by
 *     ten minutes in one write; one room is written across every period of the day; a teacher is written
 *     across a tick and lands on a minute another class already holds them, which answers with a banner
 *     naming that class and writes nothing until "apply anyway" is pressed. "Replace teacher X with Y"
 *     lists every period it would touch — in the week and in the dated sheets inside the range — names
 *     every place Y is already busy, and only then offers the button that writes. A whole day is moved to
 *     another weekday and duplicated onto a third. Every one of those is read back from the database, not
 *     from the message on the screen.
 *  2. **Twenty changes, and a way back.** Every write above left an entry in the day itself: who, when on
 *     Dhaka's clock, one sentence from the catalog. The history drawer lists them newest first, a day
 *     stuffed with twenty-five entries keeps twenty after its next write, an entry a hundred days old is
 *     dropped by the retention job, and "restore this version" puts the day's content back — proven on the
 *     week and on the working sheet — without touching which class, which weekday or which date it is.
 *  3. **The day goes out.** The dispatch panel writes the class group's message and one message per
 *     teacher out of the sheet and the catalogs, offers a copy that lands on the clipboard byte for byte,
 *     a `wa.me` address and a Messenger address that carry the same text, records the send with the
 *     signature that makes "changed since sent" a fact, and after a later edit says so and offers the new
 *     message again — in Bangla with Bangla digits and, on the English address, in English with ASCII
 *     digits.
 *  4. **A teacher reads their own week.** /teacher/routine shows the signed-in teacher's periods for Dhaka's
 *     today and the six days after it and nothing else, read through the same split the routine is written with:
 *     a date whose sheet substituted somebody else does not show the week's teacher, and a portal that
 *     holds no fee, due or receipt vocabulary keeps holding none.
 *  5. **Paper.** The daily page carries a print-only notice with every class's day on it, and the print
 *     stylesheet — read the way the print button reads it — keeps that sheet and drops the screen around
 *     it. All of it is photographed at 360 px and 1440 px into screenshots/r9, in both languages, with
 *     nothing overflowing at 360, 768 or 1440.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import type {Browser,Locator,Page} from 'playwright';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {CenterClassGroup} from '../src/models/CenterRecords';
import {DailyRoutine,MasterRoutine} from '../src/models/Routine';
import {dhakaDay} from '../src/lib/admin/today';
import {dayHeaders} from '../src/components/admin/list-dates';
import {formatDate} from '../src/lib/admin/format';
import {shiftDate,weekdayOf} from '../src/lib/routine/time';
import {routineRetention} from '../src/lib/routine/retention';
import {HISTORY_CAP,HISTORY_RETENTION_DAYS} from '../src/lib/routine/history';
import bn from '../src/messages/bn.json';
import en from '../src/messages/en.json';

const SHOTS=path.join('screenshots','r9');
const bnDigits=(value:number):string=>String(value).replace(/[0-9]/g,digit=>'০১২৩৪৫৬৭৮৯'[Number(digit)]);
const hasBanglaLetters=(text:string):boolean=>/[\u0980-\u09ff]/.test(text.replace(/[০-৯]/g,''));
/** A raw catalog key printed instead of its value — the mistake a missing word makes on a live screen. */
const RAW_KEY=/\broutine\.[a-zA-Z]+\.[a-zA-Z]+/;
/* `\d` in a JS pattern is ASCII only, and every clock and date on a Bangla screen is painted in Bangla
   digits — so "there is a digit here" has to be asked in both sets or it fails on a screen that is right. */
const ANY_DIGIT=/[\d\u09e6-\u09ef]/;

const CLASS_A='র৯ নবম শ্রেণি',CLASS_A_EN='Routine Nine';
const CLASS_B='র৯ দশম শ্রেণি',CLASS_B_EN='Routine Ten';
const SHIFT='প্রভাতী';
const TEACHER_ONE='র৯ শিক্ষক ক',TEACHER_TWO='র৯ শিক্ষক খ';
const ROOM_ONE='কক্ষ ১',ROOM_TWO='কক্ষ ২',ROOM_THREE='কক্ষ ৩',ROOM_FIVE='কক্ষ ৫',ROOM_NINE='কক্ষ ৯',
  ROOM_SEVEN='কক্ষ ৭';
/* A room nobody else in the centre holds, so the edit after the send is an edit and not a clash: the
   sheet's own save warns about a room another class is in at the same minute, and a warning here would
   leave the sheet unwritten and the badge unlit. */
const ROOM_EIGHT='কক্ষ ৮';
const SUBJECT_MATH='গণিত',SUBJECT_BANGLA='বাংলা',SUBJECT_CHEM='রসায়ন',SUBJECT_PHYSICS='পদার্থ',
  SUBJECT_ENGLISH='ইংরেজি';
/** The labels the suite reads off the catalogs rather than retyping. */
const R=bn.routine,RE=en.routine;

type PeriodDoc={_id:mongoose.Types.ObjectId;start:string;end:string;subject:{bn:string;en?:string};
  teacher?:mongoose.Types.ObjectId|null;room?:string;order?:number;note?:string;source?:string;
  masterPeriod?:mongoose.Types.ObjectId|null;deletedAt?:Date|null};
type HistoryDoc={_id:mongoose.Types.ObjectId;at:Date;by?:mongoose.Types.ObjectId|null;byName:string;
  code:string;params:Record<string,string|number>;
  snapshot:{shift:string;active:boolean;status:string;holidayReason:string;notes:string;
    periods:{start:string;end:string;subjectBn:string;subjectEn:string;teacher:string;room:string;
      jointWith:string;order:number;note:string;source:string;masterPeriod:string}[]}};
type MasterDoc={_id:mongoose.Types.ObjectId;classGroup:mongoose.Types.ObjectId;weekday:number;shift:string;
  active?:boolean;periods:PeriodDoc[];history:HistoryDoc[];deletedAt?:Date|null};
type SheetDoc={_id:mongoose.Types.ObjectId;classGroup:mongoose.Types.ObjectId;date:string;shift:string;
  status?:string;
  notes?:string;holidayReason?:string;periods:PeriodDoc[];history:HistoryDoc[];sentAt?:Date|null;
  sentBy?:mongoose.Types.ObjectId|null;sentSignature?:string};

async function run(){
  await preflight({
    mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',
    originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,
    test:'tests/routine-tools-browser.integration.ts — start the app first, then run it with TEST_ORIGIN and TEST_MONGO_URI (see docs/STALE-TESTS.md)',
  });
  const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3100';
  const shared=process.env.TEST_ORIGIN?process.env.TEST_MONGO_URI:null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){
    /* The suite owns the database it is given: every count below is exact because nothing else is in it. */
    const db=mongoose.connection.db;
    if(!db)throw Error('mongoose connected without a database');
    for(const collection of await db.listCollections().toArray()){
      await db.collection(collection.name).deleteMany({}).catch(()=>{});
    }
  }
  await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});
  {let ready=false;
   for(let attempt=0;attempt<60&&!ready;attempt++)
   {try{ready=(await fetch(`${origin}/api/auth/csrf`)).ok}catch{/* not up yet */}
    if(!ready)await new Promise(resolve=>setTimeout(resolve,1000))}
   if(!ready)throw Error(`the app did not answer at ${origin}`)}
  await mkdir(SHOTS,{recursive:true});

  // ── a centre with two classes, two teachers, a week and two working sheets ────────────────────────
  const password=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(password,12);
  const BOSS='r9s-owner@example.test',TEACH='r9s-teacher-one@example.test',OTHER='r9s-teacher-two@example.test';
  await User.create({name:'র৯ মালিক',email:BOSS,passwordHash:hash,role:'admin',active:true});
  const owner=await User.findOne({email:BOSS}).lean<{_id:mongoose.Types.ObjectId}>();
  if(!owner)throw Error('the account this suite signs in with was not written');
  const ownerId=String(owner._id);
  const teacherOne=await User.create({name:TEACHER_ONE,email:TEACH,passwordHash:hash,role:'teacher',
    active:true});
  const teacherTwo=await User.create({name:TEACHER_TWO,email:OTHER,passwordHash:hash,role:'teacher',
    active:true});
  const groupA=await CenterClassGroup.create({name:{bn:CLASS_A,en:CLASS_A_EN},academicYear:2026,shift:SHIFT,
    active:true,monthlyFee:600});
  const groupB=await CenterClassGroup.create({name:{bn:CLASS_B,en:CLASS_B_EN},academicYear:2026,shift:SHIFT,
    active:true,monthlyFee:500});
  const classA=String(groupA._id),classB=String(groupB._id);
  const labelA={bn:CLASS_A,en:CLASS_A_EN},labelB={bn:CLASS_B,en:CLASS_B_EN};

  /* The suite writes about the day it runs on, so the day it runs on has to have something written. The
     days the tools move and duplicate are the two after it, so no day operation lands on a dated sheet.
     The periods run to fifty minutes rather than to the hour: a bulk shift of ten minutes then moves them
     into empty air, which is what an ordinary bulk edit is, and the clash this suite asks for is the one
     it deliberately walks into. */
  const today=dhakaDay(new Date()),tomorrow=shiftDate(today,1);
  const W0=weekdayOf(today),W1=(W0+1)%7,W2=(W0+2)%7,W3=(W0+3)%7;
  const weekdays=dayHeaders('bn');
  const period=(start:string,end:string,subjectBn:string,subjectEn:string,
    teacher:mongoose.Types.ObjectId,room:string,order:number):Record<string,unknown>=>
    ({start,end,subject:{bn:subjectBn,en:subjectEn},teacher,room,order,note:'',source:'own'});

  /* Today: three periods, the first and the third এই suite's own teacher. Class B holds the other teacher
     at the same minutes on the same weekday, which is what a bulk write is about to walk into. */
  const dayA0=await MasterRoutine.create({classGroup:classA,classLabel:labelA,shift:SHIFT,weekday:W0,
    active:true,createdBy:ownerId,periods:[
      period('08:00','08:50',SUBJECT_MATH,'Mathematics',teacherOne._id,ROOM_ONE,1),
      period('09:00','09:50',SUBJECT_BANGLA,'Bangla',teacherTwo._id,ROOM_TWO,2),
      period('10:00','10:50',SUBJECT_CHEM,'Chemistry',teacherOne._id,ROOM_THREE,3),
    ]});
  const dayA1=await MasterRoutine.create({classGroup:classA,classLabel:labelA,shift:SHIFT,weekday:W1,
    active:true,createdBy:ownerId,periods:[
      period('11:00','12:00',SUBJECT_PHYSICS,'Physics',teacherTwo._id,ROOM_TWO,1),
      period('12:00','13:00',SUBJECT_ENGLISH,'English',teacherOne._id,'',2),
    ]});
  await MasterRoutine.create({classGroup:classB,classLabel:labelB,shift:SHIFT,weekday:W0,active:true,
    createdBy:ownerId,periods:[
      period('08:00','08:50',SUBJECT_BANGLA,'Bangla',teacherTwo._id,ROOM_FIVE,1),
      period('10:00','10:50',SUBJECT_MATH,'Mathematics',teacherTwo._id,ROOM_FIVE,2),
    ]});
  const idsOf=(doc:unknown):string[]=>(doc as MasterDoc).periods.map(entry=>String(entry._id));
  const [P1,,P3]=idsOf(dayA0);

  /* Today's sheet is stored — the dispatch records a send against a document, and a sheet that says
     nothing the week does not has no document to record it on. Tomorrow's substitutes the other teacher
     into the week's first period, which is what the portal and the replacement both read. */
  const sheetPeriods=(day:MasterDoc):Record<string,unknown>[]=>day.periods.map(entry=>({
    start:entry.start,end:entry.end,subject:{bn:entry.subject.bn,en:entry.subject.en||''},
    teacher:entry.teacher,room:entry.room,order:entry.order,note:'',source:'master',
    masterPeriod:entry._id}));
  await DailyRoutine.create({date:today,classGroup:classA,classLabel:labelA,shift:SHIFT,status:'adjusted',
    holidayReason:'',notes:'আজকের নোট',createdBy:ownerId,
    periods:sheetPeriods(dayA0 as unknown as MasterDoc)});
  const dayA1doc=dayA1 as unknown as MasterDoc;
  await DailyRoutine.create({date:tomorrow,classGroup:classA,classLabel:labelA,shift:SHIFT,
    status:'adjusted',holidayReason:'',notes:'',createdBy:ownerId,periods:[
      {start:'11:00',end:'12:00',subject:{bn:SUBJECT_PHYSICS,en:'Physics'},teacher:teacherOne._id,
        room:ROOM_TWO,order:1,note:'',source:'master',masterPeriod:dayA1doc.periods[0]._id},
      {start:'12:00',end:'13:00',subject:{bn:SUBJECT_ENGLISH,en:'English'},teacher:teacherTwo._id,
        room:'',order:2,note:'',source:'master',masterPeriod:dayA1doc.periods[1]._id},
    ]});

  const masterUrl=(locale:'bn'|'en',classId:string=classA):string=>
    `/${locale}/admin/routine/master?classId=${classId}&shift=${encodeURIComponent(SHIFT)}`;
  const dailyUrl=(locale:'bn'|'en',date:string=today,classId:string=classA):string=>
    `/${locale}/admin/routine/daily?date=${date}&classId=${classId}&shift=${encodeURIComponent(SHIFT)}`;
  const dayOf=(weekday:number,classId:string=classA):Promise<MasterDoc|null>=>
    MasterRoutine.findOne({classGroup:classId,weekday,shift:SHIFT}).lean<MasterDoc|null>();
  const sheetOf=(date:string,classId:string=classA):Promise<SheetDoc|null>=>
    DailyRoutine.findOne({date,classGroup:classId,shift:SHIFT}).lean<SheetDoc|null>();
  const liveOf=(doc:{periods:PeriodDoc[]}|null):PeriodDoc[]=>
    (doc?.periods||[]).filter(entry=>!entry.deletedAt);
  const roomsOf=(doc:{periods:PeriodDoc[]}|null):string[]=>liveOf(doc).map(entry=>entry.room||'');
  const teachersOf=(doc:{periods:PeriodDoc[]}|null):string[]=>
    liveOf(doc).map(entry=>String(entry.teacher||''));
  /** The periods of one weekday this teacher takes, read the way the portal reads them: a date whose sheet
      speaks for its class silences the week for that class, and a row says which of the two it came from. */
  const rowsFor=async(date:string,teacherId:string):Promise<string[]>=>{
    const sheets=await DailyRoutine.find({date}).lean<SheetDoc[]>();
    const held=new Set(sheets.map(sheet=>`${String(sheet.classGroup)}~${sheet.shift}`));
    const masters=await MasterRoutine.find({weekday:weekdayOf(date)}).lean<MasterDoc[]>();
    const out:string[]=[];
    const take=(periods:PeriodDoc[],classId:string,from:'sheet'|'week'):void=>{
      for(const entry of periods){
        if(entry.deletedAt||String(entry.teacher||'')!==teacherId)continue;
        out.push(`${entry.start}|${classId}|${from}`);
      }
    };
    for(const doc of masters){
      const classId=String(doc.classGroup);
      if(doc.active===false||held.has(`${classId}~${doc.shift}`))continue;
      take(doc.periods,classId,'week');
    }
    for(const sheet of sheets)take(sheet.periods,String(sheet.classGroup),'sheet');
    return out.sort();
  };

  // ── the browser ───────────────────────────────────────────────────────────────────────────────────
  const browser:Browser=await chromium.launch();
  const shot=(page:Page,name:string):Promise<Buffer>=>
    page.screenshot({path:path.join(SHOTS,`${name}.png`),fullPage:true});
  /* "This screen overflows" is half a diagnosis, so the check names what escapes. */
  const noOverflow=async(page:Page,name:string):Promise<void>=>{
    for(const width of [360,768,1440]){
      await page.setViewportSize({width,height:900});
      const measured=await page.evaluate(()=>{
        const client=document.documentElement.clientWidth;
        const wide:string[]=[];
        for(const element of document.querySelectorAll('body *')){
          const box=element.getBoundingClientRect();
          if(box.right<=client+1)continue;
          let insideScroller=false;
          for(let node=element.parentElement;node;node=node.parentElement){
            if(getComputedStyle(node).overflowX!=='visible'){insideScroller=true;break}
          }
          if(insideScroller)continue;
          let label=element.tagName.toLowerCase();
          const classes=(element.getAttribute('class')||'').trim();
          if(classes)label+='.'+classes.split(/\s+/).join('.');
          wide.push(`${label} right=${Math.round(box.right)}`);
          if(wide.length>=6)break;
        }
        return {scroll:document.documentElement.scrollWidth,client,wide};
      });
      assert.ok(measured.scroll<=measured.client+1,
        `${name} overflows horizontally at ${width}px (${measured.scroll} > ${measured.client})`
        +(measured.wide.length?`\n  escaping the viewport: ${measured.wide.join(' | ')}`:''));
    }
    await page.setViewportSize({width:1440,height:900});
  };
  const wire=new WeakMap<Page,{posted:string[];errors:string[]}>();
  let current:Page|null=null;
  /** Everything a stuck tool can be asked about, in one paragraph — a wait that says only "timed out"
      sends the next reader back to guess which of four things happened. */
  const pageState=async(page:Page):Promise<string>=>{
    const seen=wire.get(page);
    const counts=await Promise.all([
      page.locator('[data-tool-clash]').count(),
      page.locator('[data-tool-refused]').count(),
      page.locator('[data-bulk-done]').count(),
      page.locator('[data-replace-rows]').count(),
      page.locator('[data-history-list]').count(),
      page.locator('.admin-toast').count(),
    ]).catch(()=>[0,0,0,0,0,0]);
    const refused=(await page.locator('[data-tool-refused]').first().innerText().catch(()=>''))
      .replace(/\s+/g,' ').slice(0,160);
    return `url=${page.url()} clash=${counts[0]} refused=${counts[1]} bulkDone=${counts[2]}`
      +` replaceRows=${counts[3]} historyList=${counts[4]} toast=${counts[5]} refused says="${refused}"`
      +`\n  the server answered: ${(seen?.posted||['nothing captured']).join(' | ')}`
      +`\n  the page threw: ${(seen?.errors||[]).join(' | ')||'nothing'}`;
  };
  const until=async(what:string,check:()=>Promise<boolean>,timeoutMs=90000,
    extra?:()=>Promise<string>):Promise<void>=>{
    const deadline=Date.now()+timeoutMs;
    for(;;){
      if(await check().catch(()=>false))return;
      if(Date.now()>deadline){
        const read=extra||(current?()=>pageState(current as Page):undefined);
        const said=read?await read().catch(error=>`the state could not be read: ${String(error)}`):'';
        throw Error(`timed out waiting for ${what}${said?`\n  ${said}`:''}`);
      }
      await new Promise(resolve=>setTimeout(resolve,500));
    }
  };
  /** What a bulk write answered. The panel keeps the sentence an earlier write earned, so the wait is on
      the sentence THIS write earns — which names its own count — and not on the marker being there. */
  const bulkAnswer=async(page:Page,expected:string):Promise<'done'|'clash'|'refused'>=>{
    await until(`the bulk write to answer "${expected}"`,async()=>{
      if(await page.locator('[data-tool-clash]').count()>0)return true;
      if(await page.locator('[data-tool-refused]').count()>0)return true;
      const done=page.locator('[data-bulk-done]');
      return await done.count()>0&&(await done.innerText()).trim()===expected;
    });
    if(await page.locator('[data-tool-clash]').count()>0)return 'clash';
    if(await page.locator('[data-tool-refused]').count()>0)return 'refused';
    return 'done';
  };
  /** Wait for the first of several answers a tool can give, so a refusal is reported as one and not as a
      timeout on the success it never reached. */
  const settle=async(page:Page,what:string,selectors:string[]):Promise<string>=>{
    await until(what,async()=>{
      for(const selector of selectors){
        if(await page.locator(selector).count()>0)return true;
      }
      return false;
    });
    for(const selector of selectors){
      if(await page.locator(selector).count()>0)return selector;
    }
    throw Error(`${what} answered with none of ${selectors.join(', ')}`);
  };

  try{
    const signIn=async(email:string,width=1440,height=900,digits:'bn'|'en'='bn',clipboard=false)=>{
      const context=await browser.newContext({viewport:{width,height}});
      if(clipboard)await context.grantPermissions(['clipboard-read','clipboard-write'],{origin})
        .catch(()=>{});
      const notes:string[]=[];
      let session:{user?:{id?:string}}|null=null;
      for(let attempt=1;attempt<=3&&!session?.user;attempt++){
        await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});
        const csrf=await (await context.request.get(`${origin}/api/auth/csrf`)).json() as {csrfToken:string};
        const callback=await context.request.post(`${origin}/api/auth/callback/credentials`,{
          timeout:180000,maxRedirects:0,headers:{origin,'content-type':'application/x-www-form-urlencoded'},
          form:{csrfToken:csrf.csrfToken,identifier:email,password,callbackUrl:`${origin}/bn/teacher`},
        }).catch(()=>null);
        session=await context.request.get(`${origin}/api/auth/session`)
          .then(response=>response.json() as Promise<{user?:{id?:string}}>).catch(()=>null);
        notes.push(`attempt ${attempt}: callback ${callback?callback.status():'error'}`);
        if(!session?.user)await new Promise(resolve=>setTimeout(resolve,2000));
      }
      if(!session?.user)throw Error(`sign-in failed for ${email} — ${notes.join(' | ')}`);
      await context.addCookies([{name:`diction_digits_${session.user.id||ownerId}`,value:digits,
        url:`${origin}/`}]);
      const page=await context.newPage(),errors:string[]=[],posted:string[]=[];
      page.on('pageerror',error=>errors.push(`${page.url()}: ${error.message}`));
      page.on('dialog',dialog=>void dialog.accept());
      page.on('response',response=>{
        if(response.request().method()!=='POST')return;
        void response.text().then(text=>{
          const hit=text.match(/"status":"[a-z]+"/g);
          posted.push(`${response.status()} ${hit?[...new Set(hit)].join(' '):text.replace(/\s+/g,' ').slice(0,80)}`);
          if(posted.length>6)posted.shift();
        }).catch(()=>{});
      });
      page.setDefaultTimeout(60000);
      wire.set(page,{posted,errors});
      current=page;
      return {context,page,errors};
    };
    const goto=async(page:Page,url:string,waitFor:string):Promise<void>=>{
      let attempt=0;
      for(;;){
        try{
          await page.goto(`${origin}${url}`,{waitUntil:'domcontentloaded',timeout:180000});
          break;
        }catch(navigation){
          attempt+=1;
          if(attempt>2||!String(navigation).includes('ERR_ABORTED'))throw navigation;
          await page.waitForLoadState('load',{timeout:60000}).catch(()=>{});
        }
      }
      await page.locator(waitFor).first().waitFor({state:'visible',timeout:90000});
    };
    const drawer=(page:Page):Locator=>page.locator('[data-routine-drawer="open"]');

    const boss=await signIn(BOSS,1440,900,'bn',true);
    const page=boss.page;

    // ══ 1. Many periods at once ════════════════════════════════════════════════════════════════════
    await goto(page,masterUrl('bn'),'[data-routine-week]');
    assert.equal((await page.locator('[data-bulk-title]').innerText()).trim(),R.bulk.title,
      'the week carries a panel for the tools that write many periods at once');
    assert.equal((await page.locator('[data-bulk-help]').innerText()).trim(),R.bulk.help);
    assert.equal((await page.locator('[data-bulk-none]').innerText()).trim(),R.bulk.none,
      'and says so plainly while nothing is ticked');
    assert.equal(await page.locator(`[data-routine-day="${W0}"] [data-bulk-select]`).count(),3,
      'every period card of the day carries a tick of its own');

    /* Two of the three periods move ten minutes later, in one write; the third is left alone. */
    await page.locator(`[data-bulk-select="${P1}"]`).check();
    await page.locator(`[data-bulk-select="${P3}"]`).check();
    await until('the panel to count the two ticks',async()=>
      await page.locator('[data-bulk-form]').count()===1);
    assert.ok((await page.locator('[data-bulk-selected]').innerText()).includes(bnDigits(2)),
      'the panel says how many periods it is about to change, in the operator\u2019s own digits');
    await page.locator('[data-bulk-minutes]').selectOption('10');
    await shot(page,'r9-tools-bn-1440');
    await page.locator('[data-bulk-apply]').click();
    assert.equal(await bulkAnswer(page,R.bulk.applied.replace('{count}',bnDigits(2))),'done',
      'a shift of ten minutes into an empty part of the day writes without a warning, and the panel says '
      +'how many periods it wrote');
    await until('the two periods to move in the database',async()=>{
      const doc=await dayOf(W0);
      return liveOf(doc).map(entry=>`${entry.start}-${entry.end}`).sort()
        .join(',')===['08:10-09:00','09:00-09:50','10:10-11:00'].sort().join(',');
    });
    {const doc=await dayOf(W0);
     assert.deepEqual(liveOf(doc).map(entry=>entry.start).sort(),['08:10','09:00','10:10'],
       'the ticked periods moved and the unticked one did not');
     const history=doc?.history||[];
     assert.equal(history.length,1,'one bulk write leaves the day one entry, not one per period');
     assert.equal(history[0].code,'bulkShift');
     assert.equal(history[0].params.count,2,'and the entry says how many periods it moved');
     assert.equal(history[0].params.minutes,10,'and by how far');
     assert.equal(history[0].byName,'র৯ মালিক','and who made it');
     assert.ok(history[0].at,'and when')}
    await until('the ticks to be dropped once the write is in',async()=>
      await page.locator('[data-bulk-none]').count()===1,90000,()=>pageState(page));
    assert.equal(await page.locator('[data-bulk-none]').count(),1,
      'the ticks are dropped once the write is in, so the same tool cannot be fired twice by accident');

    /* One room written across the whole day. */
    await page.locator(`[data-bulk-all="${W0}"]`).click();
    await until('the day\u2019s own button to tick every period of it',async()=>
      (await page.locator('[data-bulk-selected]').innerText()).includes(bnDigits(3)));
    await page.locator('[data-bulk-set-room]').check();
    await page.locator('[data-bulk-room]').fill(ROOM_NINE);
    await page.locator('[data-bulk-apply]').click();
    assert.equal(await bulkAnswer(page,R.bulk.applied.replace('{count}',bnDigits(3))),'done',
      'one room across a whole day is one write, and the panel counts the three periods it wrote');
    await until('every period of the day to hold the new room',async()=>
      roomsOf(await dayOf(W0)).every(room=>room===ROOM_NINE));
    assert.deepEqual(roomsOf(await dayOf(W0)),[ROOM_NINE,ROOM_NINE,ROOM_NINE],
      'one room, written across everything ticked, in one write');
    assert.equal((await dayOf(W0))?.history.length,2,'and the day remembers that too');

    /* A teacher written across a tick, onto a minute another class already holds them: warned, not
       written, then written by the button beside the warning. */
    await page.locator(`[data-bulk-select="${P1}"]`).check();
    await until('one period to be ticked again',async()=>await page.locator('[data-bulk-form]').count()===1);
    await page.locator('[data-bulk-set-teacher]').check();
    await page.locator('[data-bulk-teacher]').selectOption(String(teacherTwo._id));
    await page.locator('[data-bulk-apply]').click();
    assert.equal(await bulkAnswer(page,R.bulk.applied.replace('{count}',bnDigits(1))),'clash',
      'a bulk write that double-books a teacher answers with the warning, not with the write');
    assert.equal(await page.locator('[data-tool-clash] [data-clash-line="teacher"]').count(),1,
      'and the warning is about the teacher, named once');
    assert.ok((await page.locator('[data-tool-clash]').innerText()).includes(CLASS_B),
      'the warning names the other class the teacher is already in');
    assert.equal(teachersOf(await dayOf(W0))[0],String(teacherOne._id),
      'nothing was written while the warning stood');
    await shot(page,'r9-bulk-clash-bn-1440');
    await page.locator('[data-bulk-force]').click();
    await until('the forced bulk write to be in',async()=>
      teachersOf(await dayOf(W0))[0]===String(teacherTwo._id));
    assert.equal(teachersOf(await dayOf(W0))[0],String(teacherTwo._id),
      'and "apply anyway" writes it — a clash warns, it never blocks');

    // ══ 2. A whole day, moved and duplicated ══════════════════════════════════════════════════════
    await page.locator(`[data-day-edit="${W1}"]`).click();
    await drawer(page).waitFor({state:'visible'});
    assert.equal((await drawer(page).locator('[data-dayop-move-title]').innerText()).trim(),
      R.dayOps.moveTitle,'the day\u2019s own editor offers to move the whole day');
    assert.equal((await drawer(page).locator('[data-dayop-duplicate-title]').innerText()).trim(),
      R.dayOps.duplicateTitle,'and to duplicate it');
    await drawer(page).locator('[data-dayop-to="move"]').selectOption(String(W2));
    await drawer(page).locator('[data-dayop-run="move"]').click();
    await until('the day to move in the database',async()=>
      !!(await dayOf(W2))&&!(await dayOf(W1)));
    assert.equal(liveOf(await dayOf(W2)).length,2,'both periods went with the day');
    assert.equal((await dayOf(W2))?.history[0].code,'dayMove','and the day remembers the move');
    assert.equal((await dayOf(W2))?.history[0].params.to,W2,'naming the weekday it went to');
    assert.equal((await dayOf(W2))?.weekday,W2);
    await until('the week on screen to show the day where it landed',async()=>
      await page.locator(`[data-routine-day="${W2}"] [data-period-card]`).count()===2
      &&await page.locator(`[data-routine-day="${W1}"] [data-period-card]`).count()===0);

    /* The same day, duplicated onto a third weekday: the copies are periods of their own, and the day
       they came from is untouched. */
    await page.locator(`[data-day-edit="${W2}"]`).click();
    await drawer(page).waitFor({state:'visible'});
    await drawer(page).locator('[data-dayop-to="duplicate"]').selectOption(String(W3));
    await drawer(page).locator('[data-dayop-run="duplicate"]').click();
    await until('the duplicated day to exist in the database',async()=>
      liveOf(await dayOf(W3)).length===2);
    {const copy=await dayOf(W3),source=await dayOf(W2);
     assert.equal(liveOf(copy).length,2,'the day it copied onto holds both periods');
     assert.equal(liveOf(source).length,2,'and the day it copied from is exactly as it was');
     assert.equal(String(liveOf(copy)[0]._id)===String(liveOf(source)[0]._id),false,
       'a copy is a period of its own, not the same period in two places');
     assert.equal((copy?.history||[]).at(-1)?.code,'dayDuplicate','the copy remembers where it came from');
     assert.equal((copy?.history||[]).at(-1)?.params.from,W2)}
    await drawer(page).locator('[data-drawer-close]').click().catch(()=>{});
    await until('the day editor to close',async()=>await drawer(page).count()===0);
    await shot(page,'r9-dayops-bn-1440');

    // ══ 3. Twenty changes, and a way back ═════════════════════════════════════════════════════════
    /* Stuff the moved day with more entries than it is allowed to keep — each carrying the day as it
       stood before the room was written across it — then write once more: the cap is applied on the write,
       so the day comes out holding exactly twenty, and the version under the cap is still restorable. */
    const restoredSnapshot={shift:SHIFT,active:true,status:'normal',holidayReason:'',notes:'',periods:[
      {start:'11:00',end:'12:00',subjectBn:SUBJECT_PHYSICS,subjectEn:'Physics',
        teacher:String(teacherTwo._id),room:ROOM_TWO,jointWith:'',order:1,note:'',source:'own',
        masterPeriod:''},
      {start:'12:00',end:'13:00',subjectBn:SUBJECT_ENGLISH,subjectEn:'English',
        teacher:String(teacherOne._id),room:'',jointWith:'',order:2,note:'',source:'own',
        masterPeriod:''},
    ]};
    const stuffed=Array.from({length:HISTORY_CAP+5},(_,index)=>({
      _id:new mongoose.Types.ObjectId(),
      at:new Date(Date.now()-(index+1)*3600000),by:new mongoose.Types.ObjectId(ownerId),
      byName:'র৯ মালিক',code:'bulkFields',params:{count:1},snapshot:restoredSnapshot}));
    await MasterRoutine.updateOne({_id:(await dayOf(W2))?._id},{$set:{history:stuffed}});
    await page.locator(`[data-bulk-all="${W2}"]`).click();
    await until('the duplicated day\u2019s periods to be ticked',async()=>
      await page.locator('[data-bulk-form]').count()===1);
    await page.locator('[data-bulk-set-room]').check();
    await page.locator('[data-bulk-room]').fill(ROOM_SEVEN);
    await page.locator('[data-bulk-apply]').click();
    assert.equal(await bulkAnswer(page,R.bulk.applied.replace('{count}',bnDigits(2))),'done',
      'a write that meets a full memory still writes');
    await until('the day to keep only twenty entries',async()=>
      (await dayOf(W2))?.history.length===HISTORY_CAP);
    assert.equal((await dayOf(W2))?.history.length,HISTORY_CAP,
      `a day remembers ${HISTORY_CAP} changes and no more, however often it is written`);
    assert.deepEqual(roomsOf(await dayOf(W2)),[ROOM_SEVEN,ROOM_SEVEN],
      'and the write that met the cap still wrote');

    /* The history drawer: newest first, each entry with a wall clock, a sentence, a name and a way back. */
    await page.locator(`[data-history-open="${W2}"]`).click();
    await drawer(page).waitFor({state:'visible'});
    await until('the drawer to list the day\u2019s memory',async()=>
      await drawer(page).locator('[data-history-entry]').count()===HISTORY_CAP);
    assert.equal((await drawer(page).locator('[data-history-help]').innerText()).trim(),R.history.help);
    assert.equal((await drawer(page).locator('[data-history-count]').innerText()).trim(),
      R.history.count.replace('{count}',bnDigits(HISTORY_CAP)),'and counts what it holds');
    const entries=await drawer(page).locator('[data-history-entry]').all();
    const firstLine=(await entries[0].locator('[data-history-line]').innerText()).trim();
    assert.equal(firstLine,R.history.code.bulkFields.replace('{count}',bnDigits(2)),
      'the newest entry is the write just made, as a sentence from the catalog');
    const firstWhen=(await entries[0].locator('[data-history-when]').innerText()).trim();
    assert.ok(ANY_DIGIT.test(firstWhen)&&firstWhen.length>8,
      `an entry says when it happened on Dhaka's clock (${firstWhen})`);
    assert.equal((await entries[0].locator('[data-history-by]').innerText()).trim(),'র৯ মালিক',
      'and who made it');
    assert.equal(await drawer(page).locator('[data-history-restore]').count(),HISTORY_CAP,
      'every version the day remembers can be put back');
    assert.equal(RAW_KEY.test(await drawer(page).innerText()),false,
      'no entry prints a raw catalog key instead of its sentence');
    await shot(page,'r9-history-bn-1440');
    await page.setViewportSize({width:360,height:900});
    await noOverflow(page,'the history drawer on a phone');
    await shot(page,'r9-history-bn-360');
    await page.setViewportSize({width:1440,height:900});

    /* Restore the version the day held before the room was written across it. */
    const remembered=(await dayOf(W2))?.history||[];
    const restoreId=String(remembered[1]?._id);
    assert.equal(remembered[1]?.code,'bulkFields',
      'the entry under the newest is one of the stuffed ones, whose snapshot is the day before the room');
    await drawer(page).locator(`[data-history-restore="${restoreId}"]`).click();
    await until('the drawer to say the day went back',async()=>
      await drawer(page).locator(`[data-history-done="${restoreId}"]`).count()===1);
    assert.equal((await drawer(page).locator(`[data-history-done="${restoreId}"]`).innerText()).trim(),
      R.history.restored);
    await until('the database to agree the day went back',async()=>
      roomsOf(await dayOf(W2)).join(',')===`${ROOM_TWO},`);
    {const doc=await dayOf(W2);
     assert.deepEqual(roomsOf(doc),[ROOM_TWO,''],
       'the day holds the rooms the restored version held, not the ones written after it');
     assert.deepEqual(teachersOf(doc),[String(teacherTwo._id),String(teacherOne._id)],
       'and the teachers that went with them');
     assert.equal((doc?.history||[]).at(-1)?.code,'restored',
       'a restore is itself a change, so the day remembers it too');
     assert.equal((doc?.history||[]).length,HISTORY_CAP,'and still remembers only twenty');
     assert.equal(doc?.weekday,W2,'which class, which weekday and which date are never restored')}
    /* The grid behind the drawer is looking at the day it got back. A restore that changed only the
       database would leave an operator staring at the version they just undid. */
    const roomWord=R.master.roomWord.replace('{room}',ROOM_TWO);
    await until('the week to be looking at the restored day',async()=>
      (await page.locator(`[data-routine-day="${W2}"] [data-period-room]`).allInnerTexts())
        .some(text=>text.trim()===roomWord),90000,()=>pageState(page));
    assert.deepEqual((await page.locator(`[data-routine-day="${W2}"] [data-period-room]`).allInnerTexts())
      .map(text=>text.trim()),[roomWord],
      'the week grid shows the restored room on its own, without anybody asking it again');
    await drawer(page).locator('[data-drawer-close]').click();
    await until('the history drawer to close',async()=>await drawer(page).count()===0);

    /* An entry a hundred days old is dropped by the same daily job that prunes the sheets. */
    const aged=new Date(Date.now()-(HISTORY_RETENTION_DAYS+10)*86400000);
    await MasterRoutine.updateOne({_id:(await dayOf(W3))?._id},{$push:{history:{
      _id:new mongoose.Types.ObjectId(),at:aged,by:new mongoose.Types.ObjectId(ownerId),
      byName:'র৯ মালিক',code:'bulkFields',params:{count:1},snapshot:restoredSnapshot}} as never});
    const agedCount=((await dayOf(W3))?.history||[]).length;
    const report=await routineRetention(new Date(),12);
    const afterCount=((await dayOf(W3))?.history||[]).length;
    assert.equal(afterCount,agedCount-1,
      `the retention job drops a history entry older than ${HISTORY_RETENTION_DAYS} days`);
    assert.ok(report.history>=1,`and reports the ${bnDigits(report.history)} entries it dropped`);
    assert.ok(((await dayOf(W3))?.history||[]).every(entry=>new Date(entry.at).getTime()>aged.getTime()),
      'the entries inside the window are still there');

    // ══ 4. The day goes out ═══════════════════════════════════════════════════════════════════════
    /* Two notes through the sheet's own save, so the sheet has a memory to restore from as well. */
    await goto(page,dailyUrl('bn'),'[data-daily-form]');
    await page.locator('[data-daily-notes]').fill('টেস্ট নোট এক');
    await page.locator('[data-daily-save]').click();
    await until('the first note to be stored',async()=>(await sheetOf(today))?.notes==='টেস্ট নোট এক');
    await page.locator('[data-daily-notes]').fill('টেস্ট নোট দুই');
    await page.locator('[data-daily-save]').click();
    await until('the second note to be stored',async()=>(await sheetOf(today))?.notes==='টেস্ট নোট দুই');
    await page.locator('[data-daily-history]').click();
    await drawer(page).waitFor({state:'visible'});
    await until('the sheet to list its own memory',async()=>
      await drawer(page).locator('[data-history-entry]').count()===2);
    assert.equal((await drawer(page).locator('[data-history-entry]').first()
      .locator('[data-history-line]').innerText()).trim(),
    R.history.code.dailySave.replace('{count}',bnDigits(3)),
    'a sheet remembers its own saves, with the number of periods the save carried');
    /* The oldest entry is the first save, and a snapshot is the day as it stood once that save was in —
       so restoring it puts the first note back. */
    const sheetHistory=await sheetOf(today);
    const sheetRestore=String((sheetHistory?.history||[])[0]?._id);
    await drawer(page).locator(`[data-history-restore="${sheetRestore}"]`).click();
    await until('the sheet to go back to the first note',async()=>
      (await sheetOf(today))?.notes==='টেস্ট নোট এক');
    assert.equal((await sheetOf(today))?.notes,'টেস্ট নোট এক',
      'and the database agrees: the sheet holds the first note again');
    assert.equal(liveOf(await sheetOf(today)).length,3,'with the same three periods it held then');
    assert.equal(((await sheetOf(today))?.history||[]).at(-1)?.code,'restored',
      'and the sheet remembers the restore');
    assert.equal(((await sheetOf(today))?.history||[]).length,3,
      'a restore is one more entry, not a shorter memory');
    /* And the sheet on screen is the sheet that went back: the form posts the operator's own draft, so a
       draft left holding the note they undid is a screen that contradicts the day. */
    await until('the sheet on screen to hold the note that went back',async()=>
      await page.locator('[data-daily-notes]').inputValue()==='টেস্ট নোট এক',90000,()=>pageState(page));
    assert.equal(await page.locator('[data-daily-notes]').inputValue(),'টেস্ট নোট এক',
      'the notes the operator reads are the restored ones, without anybody asking the page again');
    await drawer(page).locator('[data-drawer-close]').click();
    await until('the sheet\u2019s history drawer to close',async()=>await drawer(page).count()===0);

    /* The dispatch panel: one message for the class group, one per teacher, and the two addresses that
       carry them. */
    await goto(page,dailyUrl('bn'),'[data-routine-dispatch]');
    /* `textContent`, not `innerText`: the message is one text node inside a <pre>, and innerText answers
       with what the browser laid out, so a line that wrapped at 360px would come back with a break in it
       that the message does not have. */
    const classText=await page.locator('[data-dispatch-class-text]').textContent()||'';
    const sheetNow=await sheetOf(today);
    assert.equal((await page.locator('[data-dispatch-title]').innerText()).trim(),R.dispatch.title);
    assert.equal((await page.locator('[data-dispatch-help]').innerText()).trim(),R.dispatch.help);
    assert.ok(classText.startsWith(R.dispatch.classTitle),
      'the class message opens with the catalog\u2019s own title');
    assert.ok(classText.includes(CLASS_A),'and names the class');
    assert.ok(classText.includes(formatDate(new Date(`${today}T00:00:00+06:00`),'bn','bn')),
      `and the date as the operator reads it (${classText.split('\n')[1]||''})`);
    for(const entry of liveOf(sheetNow)){
      assert.ok(classText.includes(entry.subject.bn),
        `the message carries every period of the sheet, ${entry.subject.bn} among them`);
      if(entry.room)assert.ok(classText.includes(entry.room),`and the room it runs in, ${entry.room}`);
    }
    for(const name of [TEACHER_ONE,TEACHER_TWO]){
      assert.ok(classText.includes(name),`and the teachers who take them, ${name} among them`);
    }
    assert.ok(classText.endsWith(R.dispatch.footer),'and closes with the catalog\u2019s own footer');
    assert.equal(classText.split('\n').length,liveOf(sheetNow).length+3,
      'a title, a date, one line per period and a footer — nothing else');

    /* Every teacher who takes a period today gets their own message, holding only their own periods. */
    assert.equal(await page.locator('[data-dispatch-teacher]').count(),2,
      'one message per teacher who takes a period today');
    assert.equal((await page.locator('[data-dispatch-teacher-count]').innerText()).trim(),
      R.dispatch.teacherCount.replace('{count}',bnDigits(2)),'and the panel counts them');
    const teacherBlock=page.locator(`[data-dispatch-teacher="${String(teacherOne._id)}"]`);
    const teacherText=await teacherBlock.locator('[data-dispatch-teacher-text]').textContent()||'';
    const ownRooms=liveOf(sheetNow).filter(entry=>String(entry.teacher)===String(teacherOne._id))
      .map(entry=>entry.room||'');
    const otherRooms=liveOf(sheetNow).filter(entry=>String(entry.teacher)!==String(teacherOne._id))
      .map(entry=>entry.room||'');
    assert.equal((await teacherBlock.locator('[data-dispatch-teacher-name]').innerText()).trim(),
      TEACHER_ONE,'the block is named for the teacher it is written to');
    assert.ok(teacherText.startsWith(R.dispatch.teacherTitle),'their message opens with its own title');
    assert.ok(teacherText.includes(TEACHER_ONE),'and names them');
    assert.ok(teacherText.includes(CLASS_A),'with the class each period belongs to');
    for(const room of ownRooms){
      assert.ok(teacherText.includes(room),`and the room of their own period, ${room}`);
    }
    for(const room of otherRooms){
      assert.equal(teacherText.includes(room),false,
        `a teacher's own message carries no room of somebody else's period (${room})`);
    }
    const teacherLink=await teacherBlock.locator('[data-dispatch-teacher-whatsapp]').getAttribute('href');
    assert.equal(decodeURIComponent(String(teacherLink).slice('https://wa.me/?text='.length)),teacherText,
      'and a WhatsApp address of its own carrying exactly that message');

    const whatsapp=await page.locator('[data-dispatch-whatsapp]').getAttribute('href');
    assert.ok(whatsapp?.startsWith('https://wa.me/?text='),
      `the class WhatsApp address is a wa.me share address (${whatsapp})`);
    assert.equal(decodeURIComponent(String(whatsapp).slice('https://wa.me/?text='.length)),classText,
      'and it carries exactly the message on screen');
    const messenger=await page.locator('[data-dispatch-messenger]').getAttribute('href');
    assert.ok(messenger?.startsWith('fb-messenger://share?link='),
      `the Messenger address is the deep link Messenger reads (${messenger})`);
    assert.equal(decodeURIComponent(String(messenger).slice('fb-messenger://share?link='.length)),classText,
      'and it carries the same message');
    assert.equal((await page.locator('[data-dispatch-copy]').innerText()).trim(),R.dispatch.copyWhatsapp,
      'the copy button says what it is for');

    /* Copy: the clipboard holds the message, byte for byte, and the button says so. */
    await page.bringToFront();
    await page.locator('[data-dispatch-copy]').click();
    await until('the clipboard to hold the class message',async()=>
      (await page.evaluate(()=>navigator.clipboard.readText()).catch(()=>''))===classText);
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),classText,
      'the copy button puts the message on the clipboard, exactly as it reads on screen');
    assert.equal((await page.locator('[data-dispatch-copied="class"]').innerText()).trim(),
      R.dispatch.copied,'and says so — a copy that failed says failed instead');
    assert.equal(await page.locator('[data-dispatch-copy-failed="class"]').count(),0);
    await shot(page,'r9-dispatch-bn-1440');
    await page.setViewportSize({width:360,height:900});
    await noOverflow(page,'the daily sheet with the dispatch panel');
    await shot(page,'r9-dispatch-bn-360');
    await page.setViewportSize({width:1440,height:900});

    /* Sent, then changed: the badge is a fact about the signature, and the new message is offered again. */
    assert.equal((await page.locator('[data-dispatch-not-sent]').innerText()).trim(),R.dispatch.notSent);
    await page.locator('[data-dispatch-mark]').click();
    await until('the send to be recorded',async()=>!!(await sheetOf(today))?.sentAt);
    {const sent=await sheetOf(today);
     assert.ok(sent?.sentAt,'the sheet carries the time it went out');
     assert.equal(String(sent?.sentBy),ownerId,'and who sent it');
     assert.match(String(sent?.sentSignature),/^[a-f0-9]{64}$/,
       'and the day\u2019s own signature, whole — a truncated digest is a badge that never lights')}
    await until('the panel to say it was sent',async()=>
      await page.locator('[data-dispatch-sent]').count()===1);
    assert.ok((await page.locator('[data-dispatch-sent]').innerText()).includes('র৯ মালিক'),
      'and names the person who sent it');

    /* A period's room changes after the send, through the sheet's own drawer — to a room no other class
       holds at that minute, so the save writes rather than warns. */
    const sentSheet=await sheetOf(today);
    const sheetPeriodId=String(liveOf(sentSheet)[2]?._id);
    await page.locator(`[data-daily-period-edit="${sheetPeriodId}"]`).click();
    await drawer(page).waitFor({state:'visible'});
    await drawer(page).locator('[data-daily-room]').fill(ROOM_EIGHT);
    await drawer(page).locator('[data-daily-period-save]').click();
    await until('the period drawer to close',async()=>await drawer(page).count()===0);
    await page.locator('[data-daily-save]').click();
    await until('the sheet to say it changed since it was sent',async()=>
      await page.locator('[data-badge-changed]').count()===1
      &&await page.locator('[data-dispatch-changed]').count()===1);
    assert.equal((await page.locator('[data-dispatch-changed]').innerText()).trim(),R.dispatch.changed,
      'an edit after the send says so beside the message, in the catalog\u2019s own words');
    const changedText=await page.locator('[data-dispatch-class-text]').textContent()||'';
    assert.ok(changedText.includes(ROOM_EIGHT),'and the message on screen is the new one');
    assert.equal(changedText===classText,false,'which is not the message that was sent');
    assert.ok((await sheetOf(today))?.sentAt,'while the record of the send stays where it was');
    await page.locator('[data-dispatch-copy]').click();
    await until('the clipboard to hold the changed message',async()=>
      (await page.evaluate(()=>navigator.clipboard.readText()).catch(()=>''))===changedText);
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),changedText,
      'the new message can be copied again, and the clipboard now holds it rather than the one that went out');
    assert.equal((await page.locator('[data-dispatch-copied="class"]').innerText()).trim(),R.dispatch.copied);

    /* The paper sheet: today's routine for every class, hidden on screen and alone on the page in print. */
    assert.equal((await page.locator('[data-print="notice"]').innerText()).trim(),R.dispatch.print,
      'the panel carries a print button with the catalog\u2019s own words');
    assert.equal((await page.locator('[data-dispatch-print-help]').innerText()).trim(),R.dispatch.printHelp);
    assert.equal(await page.locator('[data-print-notice] [data-notice-class]').count(),2,
      'the notice holds both classes\u2019 day');
    assert.equal(await page.locator(`[data-notice-class="${classA}"] [data-notice-period]`).count(),3,
      'and every period of the class it is looking at');
    assert.ok((await page.locator('[data-notice-date]').innerText()).trim().length>4,'the notice is dated');
    assert.ok((await page.locator('[data-notice-title]').innerText()).includes(R.dispatch.printTitle),
      'and titled from the catalog');
    assert.equal(await page.locator('[data-print-notice]').isVisible(),false,
      'the notice is not painted on the screen — it is paper');
    /* Read the stylesheet the way the print button reads it: the mark on the body, and print media. */
    await page.evaluate(()=>{document.body.setAttribute('data-print','notice')});
    await page.emulateMedia({media:'print'});
    await until('the print stylesheet to keep the notice',async()=>
      await page.locator('[data-print-notice]').isVisible());
    assert.equal(await page.locator('[data-print-notice]').isVisible(),true,'in print the notice is the page');
    assert.equal(await page.locator('[data-daily-sheet-panel]').isVisible(),false,
      'and the screen around it is not');
    assert.equal(await page.locator('[data-routine-dispatch]').isVisible(),false,'nor the panel that sent it');
    await shot(page,'r9-print-notice-bn-1440');
    await page.emulateMedia({media:'screen'});
    await page.evaluate(()=>{document.body.removeAttribute('data-print')});
    assert.equal(await page.locator('[data-daily-sheet-panel]').isVisible(),true,
      'and the screen comes back when the print is over');
    assert.equal(RAW_KEY.test(await page.locator('body').innerText()),false,
      'no raw catalog key is printed on the daily screen');
    await noOverflow(page,'the daily sheet');

    // ══ 5. A teacher reads their own week ═════════════════════════════════════════════════════════
    const teach=await signIn(TEACH);
    await goto(teach.page,'/bn/teacher','[data-teacher-routine-entry]');
    assert.equal((await teach.page.locator('[data-teacher-routine-entry] strong').innerText()).trim(),
      R.portal.entryTitle,'the portal the teacher already opens carries the way into their routine');
    await teach.page.locator('[data-teacher-routine-open]').click();
    await teach.page.locator('[data-teacher-schedule]').waitFor({state:'visible',timeout:90000});
    assert.ok(teach.page.url().includes('/bn/teacher/routine'),
      'and it goes to the routine, not to an address to remember');
    /* Which seven days the portal shows is read off the portal rather than computed here. Dhaka's date
       rolls over at six in the evening UTC, and a suite that runs for a quarter of an hour can straddle
       it; the claim is "today and the six days after it" on the clock the server reads, which is the only
       clock a teacher's morning is planned by. */
    const dates=await teach.page.locator('[data-teacher-day]').evaluateAll(nodes=>
      nodes.map(node=>String(node.getAttribute('data-teacher-day')||'')));
    assert.equal(dates.length,7,'today and the six days after it');
    const portalToday=dates[0];
    assert.equal(await teach.page.locator('[data-teacher-day-today="yes"]').count(),1,
      'one of them is named as today');
    assert.equal(await teach.page.locator('[data-teacher-day-today="yes"]')
      .getAttribute('data-teacher-day'),portalToday,'and it is the first of them');
    assert.deepEqual(dates,Array.from({length:7},(_,index)=>shiftDate(portalToday,index)),
      'the seven are seven consecutive Dhaka dates, in order, with no gap and no repeat');
    /* What the schedule says is read out of the database, not out of an expectation written here: the
       tools above moved periods, and the portal must be reading what is now true. */
    let total=0;
    for(const date of dates){
      const expected=await rowsFor(date,String(teacherOne._id));
      total+=expected.length;
      const painted=await teach.page.locator(`[data-teacher-day="${date}"] [data-teacher-row]`)
        .evaluateAll(nodes=>nodes.map(node=>{
          const value=String(node.getAttribute('data-teacher-row')||'');
          const split=value.indexOf(':');
          return `${value.slice(split+1)}|${value.slice(0,split)}`
            +`|${node.querySelector('[data-teacher-row-daily]')?'sheet':'week'}`;
        }).sort());
      assert.deepEqual(painted,expected,
        `${date}: this teacher's day is exactly the periods the database says are theirs, each marked as `
        +'the week\u2019s or the day sheet\u2019s');
      assert.equal(await teach.page.locator(`[data-teacher-day="${date}"] [data-teacher-row-daily]`).count(),
        expected.filter(row=>row.endsWith('|sheet')).length,
        `${date}: a row that comes from the day's sheet says so, and only such a row does`);
    }
    assert.equal((await teach.page.locator('[data-teacher-routine-total]').innerText()).trim(),
      bnDigits(total),'and the card counts the whole seven days in the reader\u2019s own digits');
    assert.ok((await teach.page.locator('[data-teacher-routine-scope]').innerText()).includes(R.portal.sub),
      'the portal says whose schedule this is');
    {const firstRows=await rowsFor(portalToday,String(teacherOne._id));
     assert.ok(firstRows.length>=1&&firstRows.every(row=>row.endsWith('|sheet')),
       `the portal's own today is a date this centre wrote a sheet for, and every row on it says so `
       +`(${firstRows.join(' | ')})`);
     assert.ok(dates.includes(tomorrow),
       'and the date the seed handed a period to somebody else is inside the seven');
     const substituted=await teach.page.locator(`[data-teacher-day="${tomorrow}"] [data-teacher-row-subject]`)
       .allInnerTexts();
     assert.ok(substituted.includes(SUBJECT_PHYSICS),
       'that date shows the substitution the day\u2019s sheet made');
     assert.equal(substituted.includes(SUBJECT_ENGLISH),false,
       'and not the week\u2019s own period, which the sheet handed to somebody else')}
    assert.equal(hasBanglaLetters(await teach.page.locator('[data-teacher-routine-back]').innerText()),true,
      'and the way back reads in Bangla on a Bangla address');
    const bodyText=await teach.page.locator('[data-teacher-schedule]').innerText();
    for(const word of ['ফি','বকেয়া','টাকা','পেমেন্ট','রশিদ']){
      assert.equal(bodyText.includes(word),false,
        `a teacher's routine carries no fee vocabulary (${word})`);
    }
    assert.equal(RAW_KEY.test(await teach.page.locator('body').innerText()),false,
      'no raw catalog key on the portal either');
    /* The portal's own print sheet: the same mark, the same stylesheet, the seven days on paper. */
    await teach.page.evaluate(()=>{document.body.setAttribute('data-print','notice')});
    await teach.page.emulateMedia({media:'print'});
    await until('the print stylesheet to keep the teacher\u2019s schedule',async()=>
      await teach.page.locator('[data-teacher-schedule]').isVisible());
    assert.equal(await teach.page.locator('[data-teacher-routine-scope]').isVisible(),false,
      'and drops the portal around it');
    await shot(teach.page,'r9-teacher-print-bn-1440');
    await teach.page.emulateMedia({media:'screen'});
    await teach.page.evaluate(()=>{document.body.removeAttribute('data-print')});
    await noOverflow(teach.page,'the teacher\u2019s routine');
    await shot(teach.page,'r9-teacher-portal-bn-1440');
    await teach.page.setViewportSize({width:360,height:900});
    await noOverflow(teach.page,'the teacher\u2019s routine on a phone');
    await shot(teach.page,'r9-teacher-portal-bn-360');
    await teach.page.setViewportSize({width:1440,height:900});
    assert.deepEqual(teach.errors,[],
      `no client-side error on the teacher's screens (${teach.errors.join(' | ')})`);
    await teach.context.close();

    /* The same screen in English, as a teacher who asked for ASCII digits: the portal's own words and the
       subjects' English names. The digits follow the operator's own choice and not the address, so this is
       a second session rather than a second look at the first. */
    const teachEn=await signIn(TEACH,1440,900,'en');
    await goto(teachEn.page,'/en/teacher/routine','[data-teacher-schedule]');
    const englishPortal=await teachEn.page.locator('[data-teacher-routine-scope],[data-teacher-day-heading],'
      +'[data-teacher-day-count],[data-teacher-row-daily],[data-teacher-row-subject],'
      +'[data-teacher-routine-total],[data-teacher-routine-back]').allInnerTexts();
    assert.equal(hasBanglaLetters(englishPortal.join(' ')),false,
      `the portal's own words carry no Bangla on an English address (${englishPortal.join(' | ').slice(0,220)})`);
    assert.equal((await teachEn.page.locator('[data-teacher-routine-total]').innerText()).trim(),
      String(total),'and the count is in ASCII digits for a teacher who asked for them');
    const englishDates=await teachEn.page.locator('[data-teacher-day]').evaluateAll(nodes=>
      nodes.map(node=>String(node.getAttribute('data-teacher-day')||'')));
    assert.equal(englishDates.length,7,'the same seven days, whichever address reads them');
    assert.deepEqual(englishDates,Array.from({length:7},(_,index)=>shiftDate(englishDates[0],index)),
      'seven consecutive dates on an English address too');
    assert.ok(englishDates.includes(tomorrow),'and the date the seed substituted into is one of them');
    assert.ok((await teachEn.page.locator(`[data-teacher-day="${tomorrow}"] [data-teacher-row-subject]`)
      .allInnerTexts()).includes('Physics'),'with the subject\u2019s English name');
    assert.equal((await teachEn.page.locator('[data-teacher-routine-back]').innerText()).trim(),
      RE.portal.back,'and the way back reads as English');
    assert.equal(RAW_KEY.test(await teachEn.page.locator('body').innerText()),false,
      'no raw catalog key on the English portal');
    await noOverflow(teachEn.page,'the English teacher routine');
    await shot(teachEn.page,'r9-teacher-portal-en-1440');
    assert.deepEqual(teachEn.errors,[],
      `no client-side error on the English portal (${teachEn.errors.join(' | ')})`);
    await teachEn.context.close();

    // ══ 6. Replace a teacher, from one date to another ════════════════════════════════════════════
    await goto(page,masterUrl('bn'),'[data-routine-week]');
    const countTeacher=(id:mongoose.Types.ObjectId):Promise<number>=>
      MasterRoutine.countDocuments({'periods.teacher':id,deletedAt:null});
    const before=await countTeacher(teacherOne._id);
    assert.ok(before>=3,`the teacher who is about to be away holds periods in the week (${before})`);
    await page.locator('[data-replace-fold] summary').click();
    await page.locator('[data-replace-from]').selectOption(String(teacherOne._id));
    await page.locator('[data-replace-to]').selectOption(String(teacherTwo._id));
    await page.locator('[data-replace-master]').check();
    assert.equal(await page.locator('[data-replace-daily]').isChecked(),true,
      'the working sheets inside the range are in scope by default');
    /* The range the panel opens with is Dhaka's today to a fortnight on, which holds tomorrow's sheet.
       "Today" is read off the panel and not off this file's own clock: a suite that runs for a quarter of
       an hour can straddle midnight in Dhaka, and the range that matters is the one the tool will use. */
    const rangeFrom=await page.locator('[data-replace-preview] input[name="fromDate"]').inputValue();
    const rangeTo=await page.locator('[data-replace-preview] input[name="toDate"]').inputValue();
    assert.ok(rangeFrom===today||rangeFrom===shiftDate(today,1),
      `the panel opens on Dhaka's today, whichever side of midnight this suite is running on (${rangeFrom})`);
    assert.equal(rangeTo,shiftDate(rangeFrom,13),'and runs a fortnight on from there');
    await page.locator('[data-replace-show]').click();
    assert.equal(await settle(page,'the replacement preview',
      ['[data-replace-rows]','[data-replace-none]','[data-tool-refused="replace-preview"]']),
    '[data-replace-rows]','the preview lists what it would change');
    const painted=await page.locator('[data-replace-row]').count();
    const masterRows=await page.locator('[data-replace-row^="master:"]').count();
    const dailyRows=await page.locator('[data-replace-row^="daily:"]').count();
    /* Counted out of the database the same way the tool counts: every live period of the week that holds
       the teacher who is away, and every one of the dated sheets inside the range. */
    const wantedMasters=await MasterRoutine.find({'periods.teacher':teacherOne._id,deletedAt:null})
      .lean<MasterDoc[]>();
    const expectedMaster=wantedMasters.reduce((sum,doc)=>sum+liveOf(doc)
      .filter(entry=>String(entry.teacher)===String(teacherOne._id)).length,0);
    const wantedSheets=await DailyRoutine.find({date:{$gte:rangeFrom,$lte:rangeTo},
      'periods.teacher':teacherOne._id}).lean<SheetDoc[]>();
    const expectedDaily=wantedSheets.reduce((sum,doc)=>sum+liveOf(doc)
      .filter(entry=>String(entry.teacher)===String(teacherOne._id)).length,0);
    assert.equal(masterRows,expectedMaster,
      `the week's own periods are in the list (${masterRows} of them)`);
    assert.equal(dailyRows,expectedDaily,'and so are the dated sheets inside the range, and only they');
    assert.equal(painted,masterRows+dailyRows);
    assert.ok(masterRows>=3&&dailyRows>=1,
      `the list covers both halves of the routine (${masterRows} week, ${dailyRows} dated)`);
    assert.ok((await page.locator('[data-replace-count]').innerText()).includes(bnDigits(painted)),
      'the preview counts what it found, in the operator\u2019s own digits');
    const rowText=await page.locator('[data-replace-row]').first().innerText();
    assert.ok(rowText.includes(CLASS_A)||rowText.includes(CLASS_B),'each row names the class it belongs to');
    assert.ok(ANY_DIGIT.test(rowText),'and a time');
    assert.equal(await page.locator('[data-replace-apply]').count(),1,
      'and only once the list is on screen does the button that writes appear');
    assert.ok(await page.locator('[data-replace-clashes]').count()>=1,
      'the incoming teacher is already busy at one of those minutes, and the preview says so');
    assert.ok((await page.locator('[data-replace-clashes]').innerText()).includes(TEACHER_TWO),
      'naming who');
    await shot(page,'r9-replace-preview-bn-1440');
    await page.locator('[data-replace-run]').click();
    assert.equal(await settle(page,'the replacement',
      ['[data-replace-apply] [data-tool-clash]','[data-replace-done]','[data-replace-apply] [data-tool-refused]']),
    '[data-replace-apply] [data-tool-clash]',
    'the write stops at the same warning the preview gave, with nothing written');
    assert.equal(await countTeacher(teacherOne._id),before,'nothing was written while the warning stood');
    await page.locator('[data-replace-force]').click();
    await until('the replacement to be written',async()=>await countTeacher(teacherOne._id)===0);
    assert.equal(await countTeacher(teacherOne._id),0,
      'every period of the week that held the teacher who is away now holds the one who took over');
    assert.equal(await DailyRoutine.countDocuments({'periods.teacher':teacherOne._id}),0,
      'and no dated sheet holds them either');
    {const sheet=await sheetOf(tomorrow);
     assert.deepEqual(teachersOf(sheet),[String(teacherTwo._id),String(teacherTwo._id)],
       'the dated sheet inside the range was rewritten period by period');
     assert.ok((sheet?.history||[]).some(entry=>entry.code==='replaceTeacher'),
       'the sheet remembers the replacement');
     assert.ok((sheet?.history||[]).some(entry=>entry.code==='replaceTeacher'
       &&entry.params.from===TEACHER_ONE&&entry.params.to===TEACHER_TWO),
       'naming both teachers in the entry itself');
     const week=await dayOf(W0);
     assert.ok((week?.history||[]).some(entry=>entry.code==='replaceTeacher'),
       'and so does the week')}
    assert.ok((await page.locator('[data-replace-done]').innerText()).trim().length>4,
      'the panel says what the write did');

    /* The English address: the same tools, the same day, English words and ASCII digits. */
    const english=await signIn(BOSS,1440,900,'en',true);
    await goto(english.page,masterUrl('en'),'[data-routine-week]');
    assert.equal((await english.page.locator('[data-bulk-title]').innerText()).trim(),RE.bulk.title);
    assert.equal((await english.page.locator('[data-bulk-none]').innerText()).trim(),RE.bulk.none);
    await english.page.locator('[data-replace-fold] summary').click();
    assert.equal((await english.page.locator('[data-replace-title]').innerText()).trim(),RE.replace.title,
      'the replacement tool reads as English too');
    await english.page.locator(`[data-bulk-all="${W0}"]`).click();
    await until('the English panel to count its ticks',async()=>
      await english.page.locator('[data-bulk-form]').count()===1);
    assert.ok((await english.page.locator('[data-bulk-selected]').innerText()).includes('3'),
      'and counts them in ASCII digits for an operator who asked for them');
    assert.equal((await english.page.locator('[data-bulk-apply]').innerText()).trim(),RE.bulk.apply);
    const englishChrome=await english.page.locator('[data-bulk-title],[data-bulk-help],'
      +'[data-bulk-selected],[data-bulk-apply],[data-bulk-clear],[data-replace-title],'
      +'[data-replace-help],[data-history-open]').allInnerTexts();
    assert.equal(hasBanglaLetters(englishChrome.join(' ')),false,
      `the tools' own words carry no Bangla on an English address (${englishChrome.join(' | ').slice(0,220)})`);
    assert.equal(RAW_KEY.test(await english.page.locator('body').innerText()),false,
      'no raw catalog key on the English screen');
    await noOverflow(english.page,'the English master week with its tools');
    await shot(english.page,'r9-tools-en-1440');
    await english.page.setViewportSize({width:360,height:900});
    await noOverflow(english.page,'the English master week on a phone');
    await shot(english.page,'r9-tools-en-360');
    await english.page.setViewportSize({width:1440,height:900});

    await goto(english.page,dailyUrl('en'),'[data-routine-dispatch]');
    const englishText=await english.page.locator('[data-dispatch-class-text]').textContent()||'';
    assert.ok(englishText.startsWith(RE.dispatch.classTitle),
      'the message an English screen writes is an English message');
    assert.ok(englishText.includes(formatDate(new Date(`${today}T00:00:00+06:00`),'en','en')),
      'with the date as an English screen reads it');
    assert.ok(englishText.endsWith(RE.dispatch.footer),'and the catalog\u2019s own footer');
    assert.equal(hasBanglaLetters(englishText.split('\n')[1]||''),false,
      'and no Bangla in the sentence around the centre\u2019s own data');
    assert.ok(englishText.includes('Physics')||englishText.includes('Mathematics'),
      'with the subjects\u2019 English names');
    assert.equal((await english.page.locator('[data-dispatch-copy]').innerText()).trim(),RE.dispatch.copyWhatsapp);
    assert.equal((await english.page.locator('[data-dispatch-mark]').innerText()).trim(),RE.dispatch.markSent);
    assert.ok((await english.page.locator('[data-dispatch-sent]').innerText()).includes('sent by'),
      'the send is named in English, with the person who made it');
    assert.equal((await english.page.locator('[data-dispatch-changed]').innerText()).trim(),RE.dispatch.changed);
    assert.equal((await english.page.locator('[data-print="notice"]').innerText()).trim(),RE.dispatch.print);
    assert.equal((await english.page.locator('[data-notice-title]').innerText()).trim(),RE.dispatch.printTitle,
      'and the paper sheet is titled in English too');
    await noOverflow(english.page,'the English daily sheet with its dispatch');
    await shot(english.page,'r9-dispatch-en-1440');
    await english.page.setViewportSize({width:360,height:900});
    await shot(english.page,'r9-dispatch-en-360');
    await english.page.setViewportSize({width:1440,height:900});
    assert.equal(RAW_KEY.test(await english.page.locator('body').innerText()),false,
      'no raw catalog key on the English daily screen either');
    assert.deepEqual(english.errors,[],
      `no client-side error on the English screens (${english.errors.join(' | ')})`);
    await english.context.close();

    /* The phone-width tools panel, photographed with a tick on it. */
    await page.setViewportSize({width:360,height:900});
    await goto(page,masterUrl('bn'),'[data-routine-week]');
    await page.locator(`[data-bulk-all="${W0}"]`).click();
    await until('the phone panel to count its ticks',async()=>
      await page.locator('[data-bulk-form]').count()===1);
    await noOverflow(page,'the master week with its tools on a phone');
    await shot(page,'r9-tools-bn-360');
    await page.setViewportSize({width:1440,height:900});

    assert.deepEqual(boss.errors,[],
      `no client-side error anywhere in the routine tools (${boss.errors.join(' | ')})`);
    await boss.context.close();

    console.log(`R9 Slice 2 in the browser, photographed at 360 px and 1440 px into screenshots/r9: `
      +`${bnDigits(2)} of ${CLASS_A}'s ${bnDigits(3)} periods on ${weekdays[W0]} moved ten minutes later in one write and the third stayed put, `
      +`${ROOM_NINE} was written across the whole day, and ${TEACHER_TWO} written onto a minute ${CLASS_B} already held them answered with a banner naming that class and wrote nothing until "apply anyway" wrote it; `
      +`${weekdays[W1]}'s two periods moved to ${weekdays[W2]} as one day and were duplicated onto ${weekdays[W3]} as periods of their own; `
      +`a day stuffed with ${bnDigits(HISTORY_CAP+5)} entries kept ${bnDigits(HISTORY_CAP)} after its next write, `
      +`the drawer read them newest first with র৯ মালিক and Dhaka's clock against each, "restore this version" put ${ROOM_TWO} back on the week and the first note back on the sheet and left each remembering the restore, `
      +`and the retention job dropped ${bnDigits(report.history)} entry older than ${HISTORY_RETENTION_DAYS} days; `
      +`today's sheet wrote ${bnDigits(2)} WhatsApp messages — one for the class group naming every period, teacher and room, one for each teacher holding only their own — carried byte for byte onto the clipboard and into wa.me and fb-messenger addresses, `
      +`recorded its send with a ${bnDigits(64)}-character signature, and after a room changed said "changed since sent" beside the new message and copied it again; `
      +`${TEACHER_ONE} read their own seven days at /bn/teacher/routine — ${bnDigits(total)} periods, each marked as the week's or the day sheet's, tomorrow showing the substitution the sheet made and not the week's own period — with no fee vocabulary anywhere in it, and the same seven days on paper; `
      +`replacing ${TEACHER_ONE} with ${TEACHER_TWO} from ${today} listed ${bnDigits(painted)} periods — ${bnDigits(masterRows)} of the week and ${bnDigits(dailyRows)} dated — named the minutes the incoming teacher was already busy, wrote nothing until forced, and then rewrote both halves; `
      +`and the print-only notice held ${bnDigits(2)} classes' day, alone on the page under the print stylesheet — in Bangla and in English, with no raw key printed and nothing overflowing at 360, 768 or 1440 px.`);
  }finally{
    await browser.close();
    await mongoose.disconnect();
    if(!shared)await mongo.stop();
  }
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
