/**
 * R9 · edit anything: the week, the day that runs from it, the warnings that never block a save, and the
 * deletes that come back.
 *
 * Six claims in one suite, because they are one idea and they share one seeded centre — two classes on
 * one shift, two teachers, and every weekday chosen at runtime, so that the day the suite runs on is
 * always the day it writes about and the day it walks back to is always a day the week holds a single
 * period on, whatever day of the week CI happens to run:
 *
 *  1. **The week is built in the open.** Seven day cards, each with a visible "+ Add period" and every
 *     period with a visible Edit — not one hidden in a collapsed menu — and an editor that changes the
 *     time through two selects folding into one HH:MM value, the subject in both languages, the teacher,
 *     the room, the order, the note and the day the period belongs to. Changing the day moves it. A day
 *     can be switched off and moved into another shift, taking its periods with it.
 *  2. **A clash warns and never blocks.** The same teacher in two classes at the same minute comes back
 *     with the drawer still open, a banner naming the person, the other class, the other subject and the
 *     time, and a "Save anyway" that writes it. The week then carries the clash and says so.
 *  3. **The day is its own paper.** The sheet opens on Dhaka's today filled from the week, takes a
 *     substitute, a holiday and its reason, a note and a left-out period, and never touches the master —
 *     which is read back from the database, not from the screen. A date that has passed is edited, not
 *     refused. A sheet that has been sent stays editable and is badged as changed.
 *  4. **A day that says nothing new costs nothing.** Saving the week's own day writes no document, one
 *     changed line writes exactly one, a reset removes it again, a sent sheet survives its reset, and the
 *     retention job prunes what a 512 MB database cannot hold while leaving the days inside its window
 *     alone.
 *  5. **Anything can be edited and a delete comes back.** An assignment is written through its drawer,
 *     refused as a duplicate the second time, deleted behind one question into the Recycle Bin under a
 *     named kind and restored from it; a period is deleted into its day's own bin and brought back by the
 *     toast's Undo; a staff session sees the same rows with no write button and an Archive instead.
 *  6. **The four screens are photographed in both languages** at 360 px and 1440 px into screenshots/r9,
 *     with nothing overflowing at 360, 768 or 1440, the drawer a full-screen touch sheet at 360 px with
 *     inputs a thumb can hit, and every word from the catalogs on both addresses.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import type {Browser,Locator,Page} from 'playwright';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {CenterClassGroup} from '../src/models/CenterRecords';
import {DailyRoutine,MasterRoutine,TeachingAssignment} from '../src/models/Routine';
import {dhakaDay} from '../src/lib/admin/today';
import {dayHeaders} from '../src/components/admin/list-dates';
import {dailySheet,shapeOf} from '../src/lib/routine/read';
import {sheetSignature} from '../src/lib/routine/day';
import {shiftDate,weekdayOf} from '../src/lib/routine/time';
import {routineRetention} from '../src/lib/routine/retention';
import bn from '../src/messages/bn.json';
import en from '../src/messages/en.json';

const SHOTS=path.join('screenshots','r9');
const bnDigits=(value:number):string=>String(value).replace(/[0-9]/g,digit=>'০১২৩৪৫৬৭৮৯'[Number(digit)]);
const hasBanglaLetters=(text:string):boolean=>/[\u0980-\u09ff]/.test(text.replace(/[০-৯]/g,''));
/** A raw catalog key printed instead of its value — the mistake a missing word makes on a live screen. */
const RAW_KEY=/\broutine\.[a-zA-Z]+\.[a-zA-Z]+/;

const CLASS_A='র৯ নবম শ্রেণি',CLASS_A_EN='Routine Nine';
const CLASS_B='র৯ দশম শ্রেণি',CLASS_B_EN='Routine Ten';
const SHIFT='প্রভাতী',EVENING='সন্ধ্যা';
const TEACHER_ONE='র৯ শিক্ষক ক',TEACHER_TWO='র৯ শিক্ষক খ';
const ROOM_ONE='কক্ষ ১',ROOM_TWO='কক্ষ ২',ROOM_THREE='কক্ষ ৩',ROOM_FOUR='কক্ষ ৪';
const SUBJECT_MATH='গণিত',SUBJECT_BANGLA='বাংলা',SUBJECT_CHEM='রসায়ন',SUBJECT_PHYSICS='পদার্থ';
/** The labels the suite reads off the catalogs rather than retyping. */
const R=bn.routine,W=bn.adminWork,BIN=bn.recycleBin;
const RE=en.routine;

type PeriodDoc={_id:mongoose.Types.ObjectId;start:string;end:string;subject:{bn:string;en?:string};
  teacher?:mongoose.Types.ObjectId|null;room?:string;order?:number;note?:string;deletedAt?:Date|null;
  purgeAt?:Date|null};
type MasterDoc={_id:mongoose.Types.ObjectId;shift:string;weekday:number;active?:boolean;periods:PeriodDoc[];
  deletedAt?:Date|null};
type SheetDoc={_id:mongoose.Types.ObjectId;date:string;status?:string;holidayReason?:string;notes?:string;
  periods:PeriodDoc[];sentAt?:Date|null};

async function run(){
  await preflight({
    mongo:true,browser:true,origin:process.env.TEST_ORIGIN||'http://127.0.0.1:3100',
    originTimeoutMs:process.env.TEST_ORIGIN?60000:8000,
    test:'tests/routine-edit-anything-browser.integration.ts — start the app first, then run it with TEST_ORIGIN and TEST_MONGO_URI (see docs/STALE-TESTS.md)',
  });
  const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3100';
  const shared=process.env.TEST_ORIGIN?process.env.TEST_MONGO_URI:null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){
    /* The suite owns the database it is given: everything in it after this wipe is its own seed, which is
       what makes the document counts below exact rather than approximate. */
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

  // ── a centre with two classes, two teachers and two accounts ─────────────────────────────────────
  const password=randomBytes(20).toString('base64url'),hash=await bcrypt.hash(password,12);
  const BOSS='r9-owner@example.test',DESK='r9-desk@example.test';
  await User.create({name:'র৯ মালিক',email:BOSS,passwordHash:hash,role:'admin',active:true});
  await User.create({name:'র৯ ডেস্ক',email:DESK,passwordHash:hash,role:'staff',active:true});
  const owner=await User.findOne({email:BOSS}).lean<{_id:mongoose.Types.ObjectId}>();
  if(!owner)throw Error('the account this suite signs in with was not written');
  const ownerId=String(owner._id);
  const teacherOne=await User.create({name:TEACHER_ONE,email:'r9-teacher-one@example.test',passwordHash:hash,
    role:'teacher',active:true});
  const teacherTwo=await User.create({name:TEACHER_TWO,email:'r9-teacher-two@example.test',passwordHash:hash,
    role:'teacher',active:true});
  const groupA=await CenterClassGroup.create({name:{bn:CLASS_A,en:CLASS_A_EN},academicYear:2026,shift:SHIFT,
    active:true,monthlyFee:600});
  const groupB=await CenterClassGroup.create({name:{bn:CLASS_B,en:CLASS_B_EN},academicYear:2026,shift:SHIFT,
    active:true,monthlyFee:500});
  const classA=String(groupA._id),classB=String(groupB._id);

  /* The suite writes about the day it runs on, so the day it runs on has to have something written. The
     clash is parked three weekdays away from today, so the sheet's own save never meets it by accident. */
  const today=dhakaDay(new Date());
  const todayWeekday=weekdayOf(today);
  /* The clash is parked three weekdays away from today, so the sheet's own save never meets it; the
     retention test's throwaway day is parked away from both. */
  const clashWeekday=(todayWeekday+3)%7;
  const pruneWeekday=[3,4,5,6].find(day=>day!==todayWeekday&&day!==clashWeekday)??2;
  /* The week is built on two weekdays of its own, and neither can be a day this suite writes about for
     another reason — the day it runs on, the clash day, or the retention job's throwaway day — or a
     period added for one of those would land on the same card and every count below would be one out.
     Sunday and Monday are the natural pair; on a Sunday or a Monday the pair moves along the week. */
  const taken=[todayWeekday,clashWeekday,pruneWeekday];
  const firstDay=[0,1,2,3,4,5,6].find(day=>!taken.includes(day))??0;
  const secondDay=[0,1,2,3,4,5,6].find(day=>!taken.includes(day)&&day!==firstDay)??1;
  /* The date the suite walks back to has to have passed, and it has to be a date the week holds exactly
     one period on: what it proves is a period left out of one date while the week keeps it. So it is the
     most recent date before today whose weekday is the first day the week was built on — a day that is
     neither the day the suite runs on, nor the clash day, nor the retention job's throwaway day. A suite
     that hardcoded the day before today passed only on the weekdays where that day happened to hold one. */
  const passedDate=shiftDate(today,-(((todayWeekday-firstDay)+7)%7||7));
  const weekdays=dayHeaders('bn');
  const masterUrl=(classId:string,shift:string=SHIFT):string=>
    `/bn/admin/routine/master?classId=${classId}${shift?`&shift=${encodeURIComponent(shift)}`:''}`;
  const dailyUrl=(date:string,classId:string=classA,shift:string=SHIFT):string=>
    `/bn/admin/routine/daily?date=${date}&classId=${classId}${shift?`&shift=${encodeURIComponent(shift)}`:''}`;
  const sheetCount=(date:string,classId:string=classA):Promise<number>=>
    DailyRoutine.countDocuments({date,classGroup:classId,shift:SHIFT});
  const masterDay=(classId:string,weekday:number,shift:string=SHIFT):Promise<MasterDoc|null>=>
    MasterRoutine.findOne({classGroup:classId,weekday,shift}).lean<MasterDoc|null>();

  // ── the browser ──────────────────────────────────────────────────────────────────────────────────
  const browser:Browser=await chromium.launch();
  const shot=(page:Page,name:string)=>page.screenshot({path:path.join(SHOTS,`${name}.png`),fullPage:true});
  /* "This screen overflows" is half a diagnosis: at 360px the answer is always a card row or a control,
     and which one is a CSS question a screenshot cannot settle — so the check names what escapes. */
  const noOverflow=async(page:Page,name:string)=>{
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
  /**
   * Wait for something the screen paints. `extra` is read once, when the wait gives up, because a log
   * that says only "timed out" sends the next reader back to guess which of three things happened.
   */
  /* The page a wait times out on is usually the one signed in last, so a wait that is not given its own
     state reader still leaves behind what the screen, the toast and the wire were saying. */
  let current:Page|null=null;
  const pageState=async(page:Page):Promise<string>=>{
    const open=page.locator('[data-routine-drawer="open"]'),seen=wire.get(page);
    const counts=await Promise.all([
      page.locator('[data-clash-warning]').count(),
      page.locator('[data-period-refused]').count(),
      page.locator('[data-daily-refused]').count(),
      page.locator('[data-assignment-refused]').count(),
      page.locator('[data-badge-changed]').count(),
    ]).catch(()=>[0,0,0,0,0]);
    const refusedText=(await page.locator('[data-daily-refused],[data-period-refused],'
      +'[data-assignment-refused]').first().innerText().catch(()=>'')).replace(/\s+/g,' ').slice(0,160);
    let traced='no trace file';
    try{
      traced=readFileSync('test-results/ci-latest/logs/routine-trace.txt','utf8').trim().split('\n')
        .slice(-6).join(' | ');
    }catch{/* the trace is a bonus, never a requirement */}
    return `url=${page.url()} open drawers=${await open.count().catch(()=>-1)}`
      +` warning=${counts[0]} periodRefused=${counts[1]} dailyRefused=${counts[2]}`
      +` assignmentRefused=${counts[3]} badgeChanged=${counts[4]} refused says="${refusedText}"`
      +` toast="${(await page.locator('.admin-toast').first().innerText().catch(()=>'')).replace(/\s+/g,' ').slice(0,140)}"`
      +`\n  the server answered: ${(seen?.posted||['nothing captured']).join(' | ')}`
      +`\n  the page threw: ${(seen?.errors||[]).join(' | ')||'nothing'}`
      +`\n  the write path traced: ${traced}`;
  };
  const until=async(what:string,check:()=>Promise<boolean>,timeoutMs=90000,extra?:()=>Promise<string>)=>{
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

  /* What each page saw on the wire: the answer a server action gave, read out of its own flight
     payload, which is the one place that says whether a write came back refused, warned or saved. */
  const wire=new WeakMap<Page,{posted:string[];errors:string[]}>();

  try{
    const signIn=async(email:string,width=1440,height=900,digits:'bn'|'en'='bn')=>{
      const context=await browser.newContext({viewport:{width,height}});
      const notes:string[]=[];
      let session:{user?:{id?:string}}|null=null;
      for(let attempt=1;attempt<=3&&!session?.user;attempt++){
        await mongoose.connection.collection('ratelimits').deleteMany({}).catch(()=>{});
        const csrf=await (await context.request.get(`${origin}/api/auth/csrf`)).json() as {csrfToken:string};
        const callback=await context.request.post(`${origin}/api/auth/callback/credentials`,{
          timeout:180000,maxRedirects:0,headers:{origin,'content-type':'application/x-www-form-urlencoded'},
          form:{csrfToken:csrf.csrfToken,identifier:email,password,callbackUrl:`${origin}/bn/admin`},
        }).catch(()=>null);
        session=await context.request.get(`${origin}/api/auth/session`)
          .then(response=>response.json() as Promise<{user?:{id?:string}}>).catch(()=>null);
        notes.push(`attempt ${attempt}: callback ${callback?callback.status():'error'}`);
        if(!session?.user)await new Promise(resolve=>setTimeout(resolve,2000));
      }
      if(!session?.user)throw Error(`sign-in failed for ${email} — ${notes.join(' | ')}`);
      await context.addCookies([{name:`diction_digits_${session.user.id||ownerId}`,value:digits,url:`${origin}/`}]);
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
    const goto=async(page:Page,url:string,waitFor:string)=>{
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
    /** Two selects and one hidden HH:MM: the time is picked, never typed into a native clock box. */
    const fillTime=async(scope:Locator,name:string,value:string)=>{
      await scope.locator(`[data-time-hour="${name}"]`).selectOption(String(Number(value.slice(0,2))));
      await scope.locator(`[data-time-minute="${name}"]`).selectOption(String(Number(value.slice(3))));
      assert.equal(await scope.locator(`input[name="${name}"]`).inputValue(),value,
        `the two selects fold into one ${name} value`);
    };
    type PeriodFields={start:string;end:string;subjectBn:string;subjectEn?:string;teacher?:string;
      room?:string;order?:string;note?:string;weekday?:number};
    const fillPeriod=async(page:Page,fields:PeriodFields)=>{
      const box=drawer(page);
      await box.waitFor({state:'visible',timeout:60000});
      await fillTime(box,'start',fields.start);
      await fillTime(box,'end',fields.end);
      await box.locator('[data-period-subject-bn]').fill(fields.subjectBn);
      if(fields.subjectEn)await box.locator('input[name="subjectEn"]').fill(fields.subjectEn);
      if(fields.teacher)await box.locator('[data-period-teacher]').selectOption(fields.teacher);
      if(fields.room)await box.locator('[data-period-room]').fill(fields.room);
      if(fields.order)await box.locator('[data-period-order]').fill(fields.order);
      if(fields.note)await box.locator('textarea[name="note"]').fill(fields.note);
      if(fields.weekday!==undefined)await box.locator('[data-period-weekday]').selectOption(String(fields.weekday));
      return box;
    };
    const addPeriod=async(page:Page,weekday:number,fields:PeriodFields)=>{
      await page.locator(`[data-add-period="${weekday}"]`).click();
      const box=await fillPeriod(page,fields);
      await box.locator('[data-period-save]').click();
      await until('the period drawer closes',async()=>await drawer(page).count()===0,90000,
        ()=>drawerState(page));
    };
    const toastText=(page:Page):Promise<string>=>page.locator('.admin-toast').first().innerText()
      .catch(()=> '');
    /**
     * Everything a stuck drawer can be asked about, in one paragraph: whether the warning is still
     * standing (the save came back as a clash again), whether the screen read as refused (the write
     * failed), what the server answered on the wire, and what the page threw while it was happening.
     */
    const drawerState=async(page:Page):Promise<string>=>{
      const open=drawer(page),seen=wire.get(page);
      const [warning,refused,anyway,said]=(await Promise.all([
        page.locator('[data-clash-warning]').count(),
        page.locator('[data-period-refused]').count(),
        page.locator('[data-save-anyway]').count(),
        open.first().innerText().catch(()=>''),
      ])) as [number,number,number,string];
      return `open drawers=${await open.count()} warning=${warning} refused=${refused} anyway=${anyway}`
        +` toast="${(await toastText(page)).replace(/\s+/g,' ').slice(0,120)}" url=${page.url()}`
        +`\n  the drawer says: ${said.replace(/\s+/g,' ').slice(0,240)}`
        +`\n  the server answered: ${(seen?.posted||['no POST was captured']).join(' | ')}`
        +`\n  the page threw: ${(seen?.errors||[]).join(' | ')||'nothing'}`;
    };
    /** The row's own destructive pair: outright on a desk, behind the ⋯ on a phone. */
    const rowButton=async(row:Locator,name:string)=>{
      const direct=row.locator('.admin-row-direct').getByRole('button',{name,exact:true});
      if(await direct.count()>0&&await direct.first().isVisible()){await direct.first().click();return}
      await row.locator('details.admin-more-row>summary').click();
      await row.locator('.admin-more-body').getByRole('button',{name,exact:true}).first().click();
    };

    const boss=await signIn(BOSS);
    const page=boss.page;

    // ══ 1. The week is built in the open ═══════════════════════════════════════════════════════════
    await goto(page,masterUrl(classA),'[data-routine-week]');
    assert.equal(await page.locator('section[data-routine-day]').count(),7,
      'the week is seven day cards, whatever has been written on them');
    assert.equal(await page.locator('[data-add-period]').count(),7,
      'every day carries a visible "+ Add period" — not one hidden in a menu');
    assert.deepEqual(await page.locator('section[data-routine-day] [data-routine-weekday]').allInnerTexts()
      .then(names=>names.map(name=>name.trim())),weekdays,
      'the seven days are named from the catalog, Sunday first');
    assert.equal((await page.locator(`[data-routine-day="${firstDay}"] [data-routine-empty-day]`)
      .innerText()).trim(),R.master.noPeriods,
      'an empty day says it is empty rather than looking broken');
    await shot(page,'r9-master-empty-bn-1440');

    /* A period written through the drawer, with a time picked from two selects. */
    await addPeriod(page,firstDay,{start:'08:00',end:'09:00',subjectBn:SUBJECT_MATH,subjectEn:'Mathematics',
      teacher:String(teacherOne._id),room:ROOM_ONE,order:'1',note:'প্রথম বেন্ড'});
    await until(`${weekdays[firstDay]} holds one period`,async()=>
      await page.locator(`[data-routine-day="${firstDay}"] [data-period-card]`).count()===1);
    const firstCard=page.locator(`[data-routine-day="${firstDay}"] [data-period-card]`).first();
    assert.equal((await firstCard.locator('[data-period-subject]').innerText()).trim(),SUBJECT_MATH);
    assert.equal((await firstCard.locator('[data-period-teacher]').innerText()).trim(),TEACHER_ONE);
    assert.ok((await firstCard.locator('[data-period-room]').innerText()).includes(ROOM_ONE));
    assert.ok((await firstCard.locator('[data-period-time]').innerText()).includes('০৮:০০'),
      'the card reads the time in the operator\'s own digits');
    assert.equal(await firstCard.locator('[data-period-edit]').count(),1,
      'every period card carries a visible Edit button of its own');
    assert.equal(await page.locator(`[data-routine-day="${firstDay}"] [data-period-more]`).count(),1,
      'and a ⋯ menu beside it, holding the things done rarely');

    /* A second period, then moved to another weekday from inside its own editor. */
    await addPeriod(page,firstDay,{start:'09:00',end:'10:00',subjectBn:SUBJECT_BANGLA,subjectEn:'Bangla',
      teacher:String(teacherTwo._id)});
    await until(`${weekdays[firstDay]} holds two periods`,async()=>
      await page.locator(`[data-routine-day="${firstDay}"] [data-period-card]`).count()===2);
    const movedId=await page.locator(`[data-routine-day="${firstDay}"] [data-period-card]`).nth(1)
      .getAttribute('data-period-card');
    assert.ok(movedId,'the moved period has an id of its own');
    await page.locator(`[data-period-edit="${movedId}"]`).click();
    const moveBox=await fillPeriod(page,{start:'09:00',end:'10:00',subjectBn:SUBJECT_BANGLA,
      weekday:secondDay});
    await moveBox.locator('[data-period-save]').click();
    await until(`the period has left ${weekdays[firstDay]}`,async()=>
      await page.locator(`[data-routine-day="${firstDay}"] [data-period-card]`).count()===1
      &&await page.locator(`[data-routine-day="${secondDay}"] [data-period-card]`).count()===1);
    {const movedTo=await masterDay(classA,secondDay);
     assert.ok(movedTo&&movedTo.periods.length===1,'the day it moved to holds it in the database');
     assert.equal(movedTo?.periods[0].subject.bn,SUBJECT_BANGLA,'and holds its own copy of the subject');
     const movedFrom=await masterDay(classA,firstDay);
     assert.equal(movedFrom?.periods.filter(period=>!period.deletedAt).length,1,
       'the day it left no longer holds it')}

    /* Today's own period, so the working sheet has something to be filled from whatever day CI runs on. */
    await addPeriod(page,todayWeekday,{start:'10:00',end:'11:00',subjectBn:SUBJECT_CHEM,subjectEn:'Chemistry',
      teacher:String(teacherOne._id),room:ROOM_TWO});
    /* And the period class B will double-book a teacher against, three weekdays away from today. */
    await addPeriod(page,clashWeekday,{start:'12:00',end:'13:00',subjectBn:SUBJECT_PHYSICS,
      subjectEn:'Physics',teacher:String(teacherOne._id),room:ROOM_THREE});

    /* The day itself: switched off, then moved into another shift with its period inside it. */
    await page.locator(`[data-day-edit="${clashWeekday}"]`).click();
    const dayBox=drawer(page);
    await dayBox.waitFor({state:'visible'});
    await dayBox.locator('[data-day-active]').uncheck();
    await dayBox.locator('[data-day-save]').click();
    await until('the day says it is switched off',async()=>
      await page.locator(`[data-routine-day="${clashWeekday}"] [data-day-off]`).count()===1);
    assert.equal((await masterDay(classA,clashWeekday))?.active,false,'and the database agrees');
    await page.locator(`[data-day-edit="${clashWeekday}"]`).click();
    await dayBox.locator('[data-day-active]').check();
    await dayBox.locator('[data-day-shift]').fill(EVENING);
    await dayBox.locator('[data-day-save]').click();
    await until('the day has left this shift',async()=>
      await page.locator(`[data-routine-day="${clashWeekday}"] [data-period-card]`).count()===0);
    assert.equal(await page.locator('[data-period-refused]').count(),0,'a day move is never refused');
    {const moved=await MasterRoutine.findOne({classGroup:classA,weekday:clashWeekday,shift:EVENING})
       .lean<MasterDoc|null>();
     assert.ok(moved&&moved.periods.length===1,'the whole day moved into the new shift, periods with it');
     assert.equal(await MasterRoutine.countDocuments({classGroup:classA,weekday:clashWeekday,shift:SHIFT}),0,
       'and one class, shift and weekday is still exactly one live day')}
    await goto(page,masterUrl(classA,EVENING),'[data-routine-week]');
    assert.equal(await page.locator(`[data-routine-day="${clashWeekday}"] [data-period-card]`).count(),1,
      'the shift picker opens the week the day moved into');
    /* Put it back, because the clash below is proved on the shift both classes share. */
    await page.locator(`[data-day-edit="${clashWeekday}"]`).click();
    await drawer(page).locator('[data-day-shift]').fill(SHIFT);
    await drawer(page).locator('[data-day-save]').click();
    /* The write is waited for before the address is asked again: navigating away from a save still in
       flight is a navigation that can beat the write, and then the reload proves nothing. */
    await until('the day drawer closes',async()=>await drawer(page).count()===0,45000,()=>drawerState(page));
    await goto(page,masterUrl(classA),'[data-routine-week]');
    await until('the day is back on its own shift',async()=>
      await page.locator(`[data-routine-day="${clashWeekday}"] [data-period-card]`).count()===1);

    // ══ 2. A clash warns and never blocks ══════════════════════════════════════════════════════════
    await goto(page,masterUrl(classB),'[data-routine-week]');
    await page.locator(`[data-add-period="${clashWeekday}"]`).click();
    /* A different room, so the warning is one line about one teacher rather than two lines about the
       same pair: the point is that a double booking warns, not that it warns twice. */
    const clashBox=await fillPeriod(page,{start:'12:00',end:'13:00',subjectBn:SUBJECT_PHYSICS,
      subjectEn:'Physics',teacher:String(teacherOne._id),room:ROOM_FOUR});
    await clashBox.locator('[data-period-save]').click();
    /* The save answers `clash` rather than `ok`, so the drawer stays open with the warning in it. */
    await clashBox.locator('[data-clash-warning]').waitFor({state:'visible',timeout:60000});
    const clashLine=await clashBox.locator('[data-clash-line="teacher"]').first().innerText();
    assert.ok(clashLine.includes(TEACHER_ONE),`the warning names the teacher double-booked (${clashLine})`);
    assert.ok(clashLine.includes(CLASS_A),`and the class they were double-booked out of (${clashLine})`);
    assert.ok(clashLine.includes(SUBJECT_PHYSICS),`and the subject that is already running (${clashLine})`);
    assert.equal(await clashBox.locator('[data-period-refused]').count(),0,
      'a clash is a warning, so nothing reads as refused');
    assert.equal(await MasterRoutine.countDocuments({classGroup:classB,weekday:clashWeekday,shift:SHIFT}),0,
      'and an unforced save writes nothing');
    await shot(page,'r9-period-clash-bn-1440');
    await clashBox.locator('[data-save-anyway]').click();
    /* A click that lands while the warning is being re-rendered is a click that posted nothing, so the
       button is pressed once more before the wait is called a failure. A force the server ignored would
       fail both times, and that is the thing this step is actually about. */
    await new Promise(resolve=>setTimeout(resolve,8000));
    if((await masterDay(classB,clashWeekday))?.periods.filter(period=>!period.deletedAt).length!==1
      &&await page.locator('[data-save-anyway]').count()>0){
      await page.locator('[data-save-anyway]').click();
    }
    /* The write is the claim, so the database is asked first and the drawer second: a save that answers
       as a clash again leaves the warning standing, one that failed reads as refused, and one that
       worked closes the drawer — and the log now says which of the three it was. */
    const classBDay=async():Promise<string>=>JSON.stringify(await masterDay(classB,clashWeekday)
      .then(day=>day?.periods.map(period=>({start:period.start,subject:period.subject.bn,
        deleted:!!period.deletedAt}))));
    await until('class B holds the period it was warned about',async()=>{
      const day=await masterDay(classB,clashWeekday);
      return (day?.periods.filter(period=>!period.deletedAt).length??0)===1;
    },90000,async()=>`${await drawerState(page)}\n  class B's day holds: ${await classBDay()}`);
    await until('the drawer closes once the warned period is written',async()=>
      await drawer(page).count()===0,45000,()=>drawerState(page));
    await until('the week shows the period it was warned about',async()=>
      await page.locator(`[data-routine-day="${clashWeekday}"] [data-period-card]`).count()===1,45000,
      async()=>`${await drawerState(page)}\n  class B's day holds: ${await classBDay()}`);
    {const day=await masterDay(classB,clashWeekday);
     assert.equal(day?.periods.length,1,'the warned period is written, because a warning never blocks');
     assert.equal(day?.periods[0].teacher?.toString(),String(teacherOne._id),'with the same teacher in it')}
    await until('the week says it carries a clash',async()=>await page.locator('[data-clash-banner]').count()===1);
    assert.ok((await page.locator('[data-clash-banner]').innerText()).includes(bnDigits(1)),
      'and counts it in the operator\'s own digits');
    await goto(page,masterUrl(classA),'[data-routine-week]');
    assert.equal(await page.locator('[data-clash-banner]').count(),1,
      'the class the teacher was double-booked OUT OF sees the same clash');

    // ══ 3. The day is its own paper ════════════════════════════════════════════════════════════════
    await goto(page,dailyUrl(today),'[data-daily-form]');
    assert.equal((await page.locator('[data-daily-day]').innerText()).trim(),weekdays[todayWeekday],
      'the sheet opens on Dhaka\'s today and names its weekday');
    assert.equal((await page.locator('[data-daily-form] input[name="date"]').inputValue()),today,
      'and holds today\'s date');
    assert.equal(await page.locator('[data-badge-passed]').count(),0,'today has not passed');
    assert.equal(await page.locator('[data-daily-not-stored]').count(),1,
      'a sheet nobody has changed says that no copy of it is stored');
    assert.equal(await sheetCount(today),0,'and the database agrees: the week is not copied for free');
    assert.equal(await page.locator('input[type="date"],input[type="time"]').count(),0,
      'the date is picked through our own day-month-year selects, never a native box');
    const sheetPeriods=page.locator('[data-daily-period]');
    const masterToday=(await masterDay(classA,todayWeekday))?.periods.filter(period=>!period.deletedAt)||[];
    assert.equal(await sheetPeriods.count(),masterToday.length,
      'the sheet arrives filled from the master routine for that weekday');
    assert.equal(await page.locator('[data-daily-period-source="master"]').count(),masterToday.length,
      'and every one of them is badged as the week\'s own');
    assert.equal((await sheetPeriods.first().locator('[data-daily-period-subject]').innerText()).trim(),
      SUBJECT_CHEM,'today\'s period is the one written for today');
    await shot(page,'r9-daily-bn-1440');

    /* Saving the week's own day must not write a document: that is the storage rule, on screen. */
    await page.locator('[data-daily-save]').click();
    await until('the sheet reports that nothing was stored',async()=>
      (await toastText(page)).includes(R.daily.savedCopy));
    assert.equal(await sheetCount(today),0,'an unchanged day costs no document at all');

    /* A substitute for that date only. */
    const chemId=String(masterToday.find(period=>period.subject.bn===SUBJECT_CHEM)?._id||'');
    assert.ok(chemId,'today\'s chemistry period has an id the sheet can address');
    await page.locator(`[data-daily-period-edit="${chemId}"]`).click();
    const dailyBox=drawer(page);
    await dailyBox.waitFor({state:'visible'});
    assert.equal((await dailyBox.locator('[data-daily-period-scope]').innerText()).trim(),R.daily.dayOnly,
      'the drawer says the change is for this day alone');
    await dailyBox.locator('[data-daily-teacher]').selectOption(String(teacherTwo._id));
    await dailyBox.locator('[data-daily-room]').fill(ROOM_THREE);
    await dailyBox.locator('[data-daily-period-save]').click();
    await until('the drawer closes',async()=>await drawer(page).count()===0,90000,()=>drawerState(page));
    await until('the sheet says it has changes',async()=>await page.locator('[data-daily-dirty]').count()===1);
    await page.locator('[data-daily-save]').click();
    await until('the sheet reports that the day is stored',async()=>
      (await toastText(page)).includes(R.daily.saved));
    await until('the sheet says it is stored',async()=>await page.locator('[data-daily-stored]').count()===1);
    assert.equal(await sheetCount(today),1,'one changed line writes exactly one document');
    {const stored=await DailyRoutine.findOne({date:today,classGroup:classA,shift:SHIFT}).lean<SheetDoc|null>();
     assert.equal(stored?.periods[0].teacher?.toString(),String(teacherTwo._id),
       'the substitute is written on the date');
     assert.equal(stored?.periods[0].room,ROOM_THREE,'and so is the room for that date');
     const week=await masterDay(classA,todayWeekday);
     assert.equal(week?.periods[0].teacher?.toString(),String(teacherOne._id),
       'the master routine still names the teacher it always named');
     assert.equal(week?.periods[0].room,ROOM_TWO,'and still names its own room')}

    /* A date that has passed: badged, and fully editable. */
    await goto(page,dailyUrl(passedDate),'[data-daily-form]');
    assert.equal((await page.locator('[data-badge-passed]').innerText()).trim(),R.daily.passed,
      'a past date carries a small badge saying it has passed');
    assert.equal((await page.locator('[data-passed-help]').innerText()).trim(),R.daily.passedHelp,
      'and a line saying a past day can still be fixed');
    await page.locator('[data-status-holiday]').check();
    await page.locator('[data-holiday-reason]').fill('বার্ষিক ক্রীড়া প্রতিযোগিতা');
    await page.locator('[data-daily-notes]').fill('অফিস খোলা ছিল, ক্লাস বন্ধ');
    await page.locator('[data-daily-save]').click();
    await until('the past day is stored',async()=>await sheetCount(passedDate)===1);
    assert.equal(await page.locator('[data-daily-refused]').count(),0,'nothing about the past was refused');
    {const stored=await DailyRoutine.findOne({date:passedDate,classGroup:classA,shift:SHIFT}).lean<SheetDoc|null>();
     assert.equal(stored?.status,'holiday','the past day is a holiday in the database');
     assert.equal(stored?.holidayReason,'বার্ষিক ক্রীড়া প্রতিযোগিতা','with the reason written down')}
    await goto(page,dailyUrl(passedDate),'[data-daily-form]');
    assert.equal(await page.locator('[data-holiday-banner]').count(),1,'and the sheet says so when reopened');
    assert.equal((await page.locator('[data-holiday-reason]').inputValue()),'বার্ষিক ক্রীড়া প্রতিযোগিতা');
    assert.equal((await page.locator('[data-daily-notes]').inputValue()),'অফিস খোলা ছিল, ক্লাস বন্ধ');

    /* A period left out of one date stays in the week. The id comes from the row itself: once a sheet
       is stored, its periods carry the ids the save wrote for them, not the week's. */
    const leftOut=await page.locator('[data-daily-period]').first().getAttribute('data-daily-period')||'';
    assert.ok(leftOut&&!leftOut.startsWith('new-'),
      `the stored holiday sheet lists the week's period under an id of its own (${leftOut})`);
    {
      await page.locator(`[data-daily-period-more="${leftOut}"] summary`).click();
      await page.locator(`[data-daily-period-leave="${leftOut}"]`).click();
      await until('the period has left the day',async()=>
        await page.locator(`[data-daily-period="${leftOut}"]`).count()===0);
      await page.locator('[data-daily-save]').click();
      await until('the day without that period is stored',async()=>
        (await toastText(page)).includes(R.daily.saved));
      const week=await masterDay(classA,weekdayOf(passedDate));
      assert.equal(week?.periods.filter(period=>!period.deletedAt).length,1,
        'the period left out of the date is still in the week');
    }
    /* Back to the master routine: the day's document goes away again. */
    await page.locator('[data-daily-reset]').click();
    await until('the reset is reported',async()=>(await toastText(page)).includes(R.daily.resetDone));
    await until('the day is no longer stored',async()=>await page.locator('[data-daily-not-stored]').count()===1);
    assert.equal(await sheetCount(passedDate),0,'a day put back to the week costs no document again');

    /* A sheet that has been sent stays editable, and says when it has changed since. */
    await goto(page,dailyUrl(today),'[data-daily-form]');
    {const view=await dailySheet(classA,SHIFT,today,'bn');
     assert.ok(view&&view.docId,'today\'s sheet is stored, so it can be marked as sent');
     await DailyRoutine.updateOne({_id:view?.docId},{$set:{sentAt:new Date(),sentBy:owner._id,
       sentSignature:sheetSignature({status:view?.status||'normal',notes:view?.notes||'',
         holidayReason:view?.holidayReason||'',periods:view?.periods.map(shapeOf)||[]})}})}
    await goto(page,dailyUrl(today),'[data-daily-form]');
    assert.ok((await page.locator('[data-daily-sent]').innerText()).length>0,'the sheet says when it was sent');
    assert.equal(await page.locator('[data-badge-changed]').count(),0,
      'and nothing has changed since it was sent');
    await page.locator('[data-daily-notes]').fill('পাঠানোর পরে নোট যোগ হয়েছে');
    await page.locator('[data-daily-save]').click();
    await until('the changed sheet is stored',async()=>(await toastText(page)).includes(R.daily.saved));
    await until('the sheet is badged as changed since it was sent',async()=>
      await page.locator('[data-badge-changed]').count()===1);
    assert.equal((await page.locator('[data-badge-changed]').innerText()).trim(),R.daily.changedSinceSent);
    /* A sent sheet is the record of what went out, so a reset rewrites it rather than removing it. */
    await page.locator('[data-daily-reset]').click();
    await until('the reset is reported',async()=>(await toastText(page)).includes(R.daily.resetDone));
    assert.equal(await sheetCount(today),1,'a sheet that was sent survives its own reset');
    {const stored=await DailyRoutine.findOne({date:today,classGroup:classA,shift:SHIFT}).lean<SheetDoc|null>();
     assert.equal(stored?.status,'normal','put back to the week\'s own status');
     assert.equal(stored?.notes,'','and to no notes of its own');
     assert.ok(stored?.sentAt instanceof Date,'while the record of the send stays')}

    // ══ 4. What a 512 MB database cannot hold, the daily job prunes ════════════════════════════════
    const oldUnsent=shiftDate(today,-70),oldSent=shiftDate(today,-400);
    await DailyRoutine.create({date:oldUnsent,classGroup:groupA._id,shift:SHIFT,classLabel:{bn:CLASS_A,en:CLASS_A_EN},
      status:'normal',notes:'পুরনো অমূলক শিট',periods:[]});
    await DailyRoutine.create({date:oldSent,classGroup:groupA._id,shift:SHIFT,classLabel:{bn:CLASS_A,en:CLASS_A_EN},
      status:'normal',notes:'পুরনো পাঠানো শিট',periods:[],sentAt:new Date(),sentBy:owner._id});
    /* A throwaway day of its own, on a weekday nothing else in this suite writes about, holding one
       period whose thirty days are already up — the suite cannot bin a period the week still needs. */
    await MasterRoutine.create({classGroup:groupB._id,shift:SHIFT,weekday:pruneWeekday,active:true,
      classLabel:{bn:CLASS_B,en:CLASS_B_EN},createdBy:owner._id,
      periods:[{start:'16:00',end:'17:00',subject:{bn:'পুরনো পিরিয়ড',en:''},teacher:null,room:'',
        order:0,note:'',deletedAt:new Date(Date.now()-31*86400000),deletedBy:owner._id,
        purgeAt:new Date(Date.now()-86400000)}]});
    const report=await routineRetention(new Date(),12);
    assert.equal(report.dailySheets,1,'the working sheet older than sixty days was pruned');
    assert.equal(report.sentSheets,1,'the sent sheet older than the log window was pruned with it');
    assert.equal(report.periods,1,'and the binned period whose thirty days were up went for good');
    assert.equal(await DailyRoutine.countDocuments({date:oldUnsent}),0);
    assert.equal(await DailyRoutine.countDocuments({date:oldSent}),0);
    assert.equal(await sheetCount(passedDate)+await sheetCount(today),1,
      'the passed day and today are inside the window, so the job leaves them alone');
    {const day=await MasterRoutine.findOne({classGroup:classB,weekday:pruneWeekday,shift:SHIFT,
       deletedAt:null}).lean<MasterDoc|null>();
     assert.equal(day?.periods.length,0,'the pruned period is out of the week for good');
     const week=await masterDay(classA,firstDay);
     assert.equal(week?.periods.filter(period=>!period.deletedAt).length,1,
       'and the week the operator is reading kept every period it had')}

    // ══ 5. Anything can be edited, and a delete comes back ═════════════════════════════════════════
    await goto(page,masterUrl(classA),'[data-assignments]');
    assert.ok((await page.locator('[data-assignment-empty]').innerText()).includes(R.assignment.empty),
      'the assignment table starts empty and says so');
    await page.locator('[data-assignment-add]').click();
    const assignmentBox=drawer(page);
    await assignmentBox.waitFor({state:'visible'});
    await assignmentBox.locator('[data-assignment-teacher]').selectOption(String(teacherOne._id));
    await assignmentBox.locator('[data-assignment-subject-bn]').fill(SUBJECT_MATH);
    await assignmentBox.locator('input[name="subjectEn"]').fill('Mathematics');
    await assignmentBox.locator('[data-assignment-class]').selectOption(classA);
    await assignmentBox.locator('[data-assignment-periods]').fill('4');
    await assignmentBox.locator('textarea[name="note"]').fill('সপ্তাহে চারটি ক্লাস');
    await assignmentBox.locator('[data-assignment-save]').click();
    await until('the assignment is in the table',async()=>await page.locator('[data-assignment-row]').count()===1);
    {const row=await TeachingAssignment.findOne({classGroup:classA}).lean<{teacherLabel:string;
       subject:{bn:string;en:string};periodsPerWeek:number;active:boolean;note:string}|null>();
     assert.equal(row?.subject.bn,SUBJECT_MATH,'every field the drawer holds is written');
     assert.equal(row?.subject.en,'Mathematics');
     assert.equal(row?.periodsPerWeek,4);
     assert.equal(row?.note,'সপ্তাহে চারটি ক্লাস');
     assert.equal(row?.active,true);
     assert.equal(row?.teacherLabel,TEACHER_ONE,'and the label the Recycle Bin will name it by is written too')}
    assert.equal((await page.locator('[data-assignment-count]').innerText()).trim(),
      R.assignment.perWeek.replace('{count}',bnDigits(4)),'the row counts the week in the operator\'s digits');

    /* The same teacher, subject and class again: a duplicate is refused rather than written twice. */
    await page.locator('[data-assignment-add]').click();
    await assignmentBox.locator('[data-assignment-teacher]').selectOption(String(teacherOne._id));
    await assignmentBox.locator('[data-assignment-subject-bn]').fill(SUBJECT_MATH);
    await assignmentBox.locator('[data-assignment-class]').selectOption(classA);
    await assignmentBox.locator('[data-assignment-periods]').fill('2');
    await assignmentBox.locator('[data-assignment-save]').click();
    await until('the duplicate is refused',async()=>
      await assignmentBox.locator('[data-assignment-refused]').count()===1);
    assert.equal((await assignmentBox.locator('[data-assignment-refused]').innerText()).trim(),
      R.assignment.duplicate);
    assert.equal(await TeachingAssignment.countDocuments({classGroup:classA}),1,
      'and nothing was written twice');
    await assignmentBox.locator(`button:has-text("${R.period.cancel}")`).click();

    /* Editing the assignment: the row's visible Edit, and a field that changes. */
    const assignmentRow=page.locator('[data-assignment-row]').first();
    const assignmentId=await assignmentRow.getAttribute('data-assignment-row')||'';
    await assignmentRow.locator(`[data-assignment-edit="${assignmentId}"]`).click();
    await assignmentBox.waitFor({state:'visible'});
    await assignmentBox.locator('[data-assignment-periods]').fill('5');
    await assignmentBox.locator('[data-assignment-active]').uncheck();
    await assignmentBox.locator('[data-assignment-save]').click();
    await until('the edited assignment is in the table',async()=>
      (await page.locator('[data-assignment-count]').innerText()).includes(bnDigits(5)));
    {const row=await TeachingAssignment.findById(assignmentId).lean<{periodsPerWeek:number;active:boolean}|null>();
     assert.equal(row?.periodsPerWeek,5,'the change is in the database');
     assert.equal(row?.active,false,'and so is the switch')}

    /* A period deleted behind one question, into its day's own bin, and back by the toast's Undo. */
    await goto(page,masterUrl(classA),'[data-routine-week]');
    const victim=await page.locator(`[data-routine-day="${firstDay}"] [data-period-card]`).first()
      .getAttribute('data-period-card')||'';
    assert.ok(victim,`${weekdays[firstDay]} has a period to delete`);
    await page.locator(`[data-period-more="${victim}"] summary`).click();
    await page.locator(`[data-period-delete="${victim}"]`).click();
    /* Scoped to the menu that opened it: every period card and every day card carries a dialog of its
       own, and an unscoped one resolves to all of them at once. */
    const confirm=page.locator(`[data-period-more="${victim}"] dialog.admin-confirm`);
    await confirm.waitFor({state:'visible'});
    assert.ok((await confirm.innerText()).includes(R.period.deleteBody),
      'the question says where the period goes and for how long');
    await confirm.locator(`[data-period-delete-yes="${victim}"]`).click();
    await until('the period is out of the week',async()=>
      await page.locator(`[data-period-card="${victim}"]`).count()===0);
    assert.ok((await toastText(page)).includes(R.period.deleted),'and the toast says it is in the bin');
    {const day=await masterDay(classA,firstDay);
     const binned=day?.periods.find(period=>String(period._id)===victim);
     assert.ok(binned?.deletedAt,'the period is soft-deleted inside its own day');
     assert.ok(binned?.purgeAt&&binned.purgeAt.getTime()>Date.now(),'with thirty days before the purge')}
    await until('the day counts the period in its bin',async()=>
      await page.locator(`[data-routine-day="${firstDay}"] [data-binned-count]`).count()===1);
    await page.locator('.admin-toast').getByRole('button',{name:R.common.undo,exact:true}).click();
    await until('the period is back in the week',async()=>
      await page.locator(`[data-period-card="${victim}"]`).count()===1);
    {const day=await masterDay(classA,firstDay);
     const restored=day?.periods.find(period=>String(period._id)===victim);
     assert.ok(restored&&!restored.deletedAt,'Undo brought the very same period back, not a copy')}

    /* The day's own record, deleted to the Recycle Bin and restored from it. */
    const dayId=String((await masterDay(classA,secondDay))?._id);
    const dayCard=page.locator(`[data-routine-day="${secondDay}"]`);
    await rowButton(dayCard,W.deleteAction);
    const dayConfirm=dayCard.locator('.admin-row-direct dialog.admin-confirm');
    await dayConfirm.waitFor({state:'visible'});
    await dayConfirm.locator(`button:has-text("${W.deleteYes}")`).click();
    await until('the day is in the bin',async()=>
      await MasterRoutine.countDocuments({_id:dayId,deletedAt:{$ne:null}})===1);
    await goto(page,'/bn/admin/recycle-bin?kind=masterRoutine','table.admin-table');
    const binRow=page.locator('tbody tr').filter({hasText:CLASS_A}).first();
    await binRow.waitFor({state:'visible'});
    assert.ok((await binRow.innerText()).includes(BIN.kindNames.masterRoutine),
      'the bin names the kind of record it is holding');
    await binRow.getByRole('button',{name:BIN.restore,exact:true}).first().click();
    await until('the day is restored',async()=>
      await MasterRoutine.countDocuments({_id:dayId,deletedAt:null})===1);
    await goto(page,masterUrl(classA),'[data-routine-week]');
    assert.equal(await page.locator(`[data-routine-day="${secondDay}"] [data-period-card]`).count(),1,
      'and the restored day is back in the week with its period');

    /* A staff session: the same rows, no write button, and Archive where Delete was. The assignment is
       switched back on first, so the archive below is the thing that turns it off. */
    await TeachingAssignment.updateOne({_id:assignmentId},{$set:{active:true}});
    const desk=await signIn(DESK);
    await goto(desk.page,masterUrl(classA),'[data-routine-week]');
    assert.equal(await desk.page.locator('[data-add-period]').count(),0,
      'a staff session is offered no way to write the week');
    assert.equal(await desk.page.locator('[data-period-edit]').count(),0,'and no Edit on its periods');
    assert.equal(await desk.page.locator('[data-assignment-add]').count(),0,'nor on its assignments');
    assert.equal(await desk.page.getByRole('button',{name:W.deleteAction,exact:true}).count(),0,
      'and no Delete: deleting a routine is an administrator\'s');
    const deskRow=desk.page.locator('[data-assignment-row]').first();
    await deskRow.waitFor({state:'visible'});
    await rowButton(deskRow,W.archive);
    await until('the assignment is archived',async()=>
      await TeachingAssignment.countDocuments({classGroup:classA,active:false})===1);
    assert.ok((await toastText(desk.page)).includes(W.archived),'and the staff session is told so');
    await desk.context.close();

    // ══ 6. Photographed in both languages, at both widths, with nothing overflowing ════════════════
    await goto(page,masterUrl(classA),'[data-routine-week]');
    await noOverflow(page,'the master week');
    await shot(page,'r9-master-bn-1440');
    await page.setViewportSize({width:360,height:900});
    await shot(page,'r9-master-bn-360');
    /* The same drawer at 360px: a full-screen touch sheet, with inputs a thumb can hit. */
    const smallId=await page.locator(`[data-routine-day="${firstDay}"] [data-period-card]`).first()
      .getAttribute('data-period-card')||'';
    await page.locator(`[data-period-edit="${smallId}"]`).click();
    const smallBox=drawer(page);
    await smallBox.waitFor({state:'visible'});
    const sheet=await smallBox.evaluate(node=>{
      const box=node.getBoundingClientRect();
      const tall:number[]=[];
      for(const element of node.querySelectorAll('input,select,textarea')){
        if(element.getAttribute('type')==='hidden')continue;
        tall.push(Math.round(element.getBoundingClientRect().height));
      }
      return {width:Math.round(box.width),height:Math.round(box.height),
        viewport:document.documentElement.clientWidth,tall};
    });
    assert.ok(sheet.width>=sheet.viewport-1,
      `at 360px the drawer is a full-screen sheet (${sheet.width}px of ${sheet.viewport}px)`);
    assert.ok(sheet.tall.length>0&&Math.min(...sheet.tall)>=48,
      `and every input in it is at least 48px tall (${sheet.tall.join(', ')})`);
    assert.equal(await smallBox.locator('input[type="time"],input[type="date"]').count(),0,
      'no native time or date box anywhere in the drawer');
    await shot(page,'r9-period-drawer-bn-360');
    await page.setViewportSize({width:1440,height:900});
    await shot(page,'r9-period-drawer-bn-1440');
    await smallBox.locator('[data-period-cancel]').click();
    await goto(page,dailyUrl(today),'[data-daily-form]');
    await noOverflow(page,'the daily working sheet');
    await shot(page,'r9-daily-bn-1440');
    await page.setViewportSize({width:360,height:900});
    await shot(page,'r9-daily-bn-360');
    await page.setViewportSize({width:1440,height:900});
    for(const [url,waitFor] of [[masterUrl(classA),'[data-routine-week]'],
      [dailyUrl(today),'[data-daily-form]']] as const){
      /* Each address is opened before it is read: a body read without the walk only re-reads whatever
         page the suite happened to be standing on. */
      await goto(page,url,waitFor);
      const text=await page.locator('body').innerText();
      assert.equal(RAW_KEY.test(text),false,`no raw catalog key is printed on ${url}`);
    }

    /* The English address: the same two screens, the same data, English words and English digits. */
    const english=await signIn(BOSS,1440,900,'en');
    await goto(english.page,`/en/admin/routine/master?classId=${classA}`,'[data-routine-week]');
    assert.equal((await english.page.locator(`[data-routine-weekday="${firstDay}"]`).innerText()).trim(),
      dayHeaders('en')[firstDay],'the weekday comes from the English catalog');
    assert.equal((await english.page.locator('[data-master-heading]').innerText()).trim(),RE.master.title);
    assert.equal((await english.page.locator('[data-kpi-periods]').innerText()).trim(),
      RE.master.periodCount.replace('{count}','4'),
      'and the week counts its four periods in ASCII digits for an operator who asked for them');
    const englishCard=english.page.locator(`[data-routine-day="${firstDay}"] [data-period-card]`).first();
    assert.equal((await englishCard.locator('[data-period-edit]').innerText()).trim(),RE.common.edit,
      'the visible Edit button reads as English');
    /* The screens' own words, and not the centre's data: a class, a teacher or a subject named in Bangla
       is a name, not interface text, and the English address keeps it. */
    const chrome=await english.page.locator('[data-master-heading],[data-master-sub],[data-master-week-help],'
      +'[data-routine-weekday],[data-period-edit],[data-add-period],[data-day-edit],[data-assignment-add],'
      +'[data-daily-save],[data-daily-add-period]').allInnerTexts();
    assert.equal(hasBanglaLetters(chrome.join(' ')),false,
      `the screens' own words carry no Bangla on an English address (${chrome.join(' | ').slice(0,200)})`);
    assert.equal(RAW_KEY.test(await english.page.locator('body').innerText()),false,
      'no raw catalog key is printed on the English screen either');
    await noOverflow(english.page,'the English master week');
    await shot(english.page,'r9-master-en-1440');
    await english.page.setViewportSize({width:360,height:900});
    await shot(english.page,'r9-master-en-360');
    await english.page.setViewportSize({width:1440,height:900});
    await goto(english.page,`/en/admin/routine/daily?date=${today}&classId=${classA}`,'[data-daily-form]');
    assert.equal((await english.page.locator('[data-daily-day]').innerText()).trim(),
      dayHeaders('en')[todayWeekday],'the sheet names the weekday in English');
    assert.equal((await english.page.locator('[data-daily-save]').innerText()).trim(),RE.daily.save);
    assert.ok((await english.page.locator('[data-daily-stored]').innerText()).includes(RE.daily.stored),
      'and says in English that the day is stored');
    await noOverflow(english.page,'the English daily sheet');
    await shot(english.page,'r9-daily-en-1440');
    await english.page.setViewportSize({width:360,height:900});
    await shot(english.page,'r9-daily-en-360');
    await english.page.setViewportSize({width:1440,height:900});
    assert.deepEqual(english.errors,[],`no client-side error on the English screens (${english.errors.join(' | ')})`);
    await english.context.close();

    assert.deepEqual(boss.errors,[],`no client-side error anywhere in the routine screens (${boss.errors.join(' | ')})`);
    await boss.context.close();

    console.log(`R9 in the browser, photographed at 360 px and 1440 px into screenshots/r9: ${CLASS_A}'s week was built one period at a time — ${SUBJECT_MATH} at ০৮:০০ on ${weekdays[firstDay]} with a visible Edit on the card and a ⋯ beside it, ${SUBJECT_BANGLA} moved out of ${weekdays[firstDay]} and into ${weekdays[secondDay]} from inside its own editor, ${SUBJECT_CHEM} written on ${weekdays[todayWeekday]} so the day the suite runs on has a day to run — and ${weekdays[clashWeekday]} was switched off, moved into ${EVENING} with its period inside it and moved back, one live day per class, shift and weekday all the way; ${TEACHER_ONE} double-booked into ${CLASS_B} at ১২:০০ answered with the drawer still open, a banner naming ${TEACHER_ONE}, ${CLASS_A} and ${SUBJECT_PHYSICS}, nothing written until Save anyway wrote it, and both classes then counting ${bnDigits(1)} clash in the week; the sheet for ${today} arrived filled from the week and badged as the week's own, saved unchanged at the cost of ${bnDigits(0)} documents, took ${TEACHER_TWO} and ${ROOM_THREE} for that date alone while the master still named ${TEACHER_ONE} and ${ROOM_TWO}, and ${passedDate} — badged as passed — became a holiday with its reason, lost a period the week kept, and went back to the week at the cost of its document, while today's sent sheet kept its record through a reset and badged itself changed; the retention job pruned ${bnDigits(report.dailySheets)} working sheet, ${bnDigits(report.sentSheets)} sent sheet and ${bnDigits(report.periods)} binned period and left the days inside its window alone; an assignment was written, refused as a duplicate, edited to ${bnDigits(5)} periods a week, deleted behind one question, restored from the Recycle Bin under ${BIN.kindNames.masterRoutine}, and archived by a staff session that was offered no write button at all — in Bangla and in English, with no raw key printed and nothing overflowing at 360, 768 or 1440 px.`);
  }finally{
    await browser.close();
    await mongoose.disconnect();
    if(!shared)await mongo.stop();
  }
}

run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
