/**
 * R9 · a weekday of a class's week can be its weekly day off or its weekly exam day — against a
 * disposable database.
 *
 * The brief: each class and shift picks its own, any of it can be changed again at any time, and nothing
 * the owner already wrote is lost by changing it. So this proves, with the real engine and the real
 * readers rather than a mock:
 *
 *   · the type is written on an EMPTY weekday too (the day is created as a label), and read back;
 *   · changing it leaves the periods exactly where they were, and changing it back restores the day;
 *   · a weekly day off holds nobody — its kept periods stop counting as a teacher or a room (the clash
 *     check) and stop appearing on a teacher's schedule — while every other weekday is unaffected;
 *   · a date that follows the week reads as a holiday with nothing running, a weekly exam day keeps its
 *     periods and its badge, and a date's OWN sheet still has the last word over the week;
 *   · the printed notice and the group message say the right thing for each;
 *   · a day written before the field existed reads as a teaching day, and bad input is refused.
 *
 * Synthetic records only, in an in-memory database of their own.
 *
 * Run: npm run test:r9:daytype
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import assert from 'node:assert/strict';
import {preflight} from './helpers/env-preflight';
import {CenterClassGroup} from '../src/models/CenterRecords';
import {MasterRoutine} from '../src/models/Routine';
import {User} from '../src/models/User';
import {saveDailySheet,saveMasterPeriod,setMasterDayType} from '../src/lib/routine/engine';
import {duplicateMasterDay} from '../src/lib/routine/bulk';
import {centreSlots,centreWeek,dailySheet,masterWeek,printNotice,teacherSchedule} from '../src/lib/routine/read';
import {classDispatchText} from '../src/lib/routine/dispatch';

const FRIDAY=5,SATURDAY=6;
const FRIDAY_DATE='2026-11-20',SATURDAY_DATE='2026-11-21';
const SHIFT='সকাল';

const period=(teacher:string)=>({id:'',masterPeriod:'',start:'09:00',end:'09:50',subjectBn:'গণিত',subjectEn:'Maths',
  teacher,room:'R1',jointWith:'',order:0,note:''});

async function run(){
  await preflight({mongo:true,test:'tests/routine-day-type.integration.ts — needs a MongoDB'});
  const mongo=await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:'routine_day_type_test'});
  try{
    const actor=String((await User.create({name:'DT actor',passwordHash:'x',role:'admin',email:`dt-${Date.now()}@example.test`}))._id);
    await MasterRoutine.init();
    const group=await CenterClassGroup.create({name:{bn:'অষ্টম শ্রেণি',en:'Class Eight'},academicYear:2026,
      shift:SHIFT,shifts:['morning'],active:true,monthlyFee:1000});
    const classId=String(group._id);
    const type=(weekday:number,dayType:'class'|'off'|'exam')=>setMasterDayType({classId,shift:SHIFT,weekday,dayType,actor});
    const day=async(weekday:number)=>(await masterWeek(classId,SHIFT,'bn')).find(entry=>entry.weekday===weekday)!;
    const history=async(weekday:number)=>
      ((await MasterRoutine.findOne({classGroup:classId,shift:SHIFT,weekday}).lean<{history?:unknown[]}|null>())?.history||[]).length;

    /* A Friday with one period, taught by the actor. */
    assert.equal((await saveMasterPeriod({classId,shift:SHIFT,weekday:FRIDAY,draft:period(actor),force:true,actor})).status,'ok');
    assert.equal((await day(FRIDAY)).dayType,'class','a day written without a type is a teaching day');
    assert.equal((await centreSlots(FRIDAY)).length,1);
    assert.equal((await dailySheet(classId,SHIFT,FRIDAY_DATE,'bn'))!.status,'normal');

    /* ── weekly day off ─────────────────────────────────────────────────────────────────────────── */
    assert.equal((await type(FRIDAY,'off')).status,'ok');
    const off=await day(FRIDAY);
    assert.equal(off.dayType,'off');
    assert.equal(off.periods.length,1,'marking a day off keeps what was written on it');
    assert.equal((await centreSlots(FRIDAY)).length,0,'a weekly day off holds no teacher and no room');
    assert.equal((await centreWeek()).length,0,'and the whole-week list leaves it out too');
    const offSheet=(await dailySheet(classId,SHIFT,FRIDAY_DATE,'bn'))!;
    assert.deepEqual([offSheet.status,offSheet.dayType,offSheet.periods.length,offSheet.stored],['holiday','off',0,false],
      'a date that follows the week is a holiday with nothing running');
    const offNotice=(await printNotice(FRIDAY_DATE,'bn'))!.classes.find(entry=>entry.classId===classId)!;
    assert.deepEqual([offNotice.status,offNotice.dayType,offNotice.periods.length],['holiday','off',0]);
    const schedule=(await teacherSchedule(actor,'bn',new Date('2026-11-20T06:00:00Z')))!;
    assert.equal(schedule.today.weekday,FRIDAY);
    assert.equal(schedule.today.rows.length,0,'a teacher is not given a period on their class\'s day off');

    /* Nothing new can be written onto a day off — not one period, and not a whole day duplicated onto it. */
    assert.equal((await saveMasterPeriod({classId,shift:SHIFT,weekday:FRIDAY,draft:period(actor),force:true,actor})).status,
      'invalid','a weekly day off refuses a new period');
    assert.equal((await saveMasterPeriod({classId,shift:SHIFT,weekday:0,draft:period(actor),force:true,actor})).status,'ok');
    assert.equal((await duplicateMasterDay({classId,shift:SHIFT,from:0,to:FRIDAY,force:true,actor})).status,
      'invalid','a weekly day off refuses a whole day duplicated onto it');
    /* A date that simply follows the week off carries no classes unless it is adjusted into a make-up day. */
    assert.equal((await saveDailySheet({classId,shift:SHIFT,date:FRIDAY_DATE,status:'normal',holidayReason:'',
      notes:'',examSubjectBn:'',examSubjectEn:'',examMode:'both',periods:[period(actor)],actor})).status,'invalid',
      'a weekly day off refuses classes posted past the screen');

    /* A date's own sheet still has the last word: a make-up class on a day off is possible. */
    assert.equal((await saveDailySheet({classId,shift:SHIFT,date:FRIDAY_DATE,status:'adjusted',holidayReason:'',
      notes:'make-up',examSubjectBn:'',examSubjectEn:'',examMode:'both',periods:[period(actor)],actor})).status,'ok');
    const madeUp=(await dailySheet(classId,SHIFT,FRIDAY_DATE,'bn'))!;
    assert.deepEqual([madeUp.stored,madeUp.status,madeUp.periods.length],[true,'adjusted',1],
      'a stored sheet speaks for its date whatever the week says');

    /* ── back to a teaching day: nothing was lost ───────────────────────────────────────────────── */
    assert.equal((await type(FRIDAY,'class')).status,'ok');
    assert.equal((await day(FRIDAY)).periods.length,1);
    assert.equal((await centreSlots(FRIDAY)).length,1,'the periods count again the moment the day is taught again');

    /* ── weekly exam day, on a weekday nobody had written ───────────────────────────────────────── */
    assert.equal((await day(SATURDAY)).id,null,'Saturday has no document yet');
    assert.equal((await type(SATURDAY,'exam')).status,'ok');
    const exam=await day(SATURDAY);
    assert.deepEqual([exam.dayType,exam.periods.length,exam.id!==null],['exam',0,true],'an empty weekday can carry a type');
    const examSheet=(await dailySheet(classId,SHIFT,SATURDAY_DATE,'bn'))!;
    assert.deepEqual([examSheet.dayType,examSheet.status],['exam','normal'],'an exam day is still a day that runs');
    const examNotice=(await printNotice(SATURDAY_DATE,'bn'))!.classes.find(entry=>entry.classId===classId)!;
    assert.equal(examNotice.dayType,'exam');

    /* ── the words that leave the building ──────────────────────────────────────────────────────── */
    const say=(key:string,params?:Record<string,string|number>)=>params?.reason?`${key}:${params.reason}`:key;
    const base={date:SATURDAY_DATE,className:'C',shift:SHIFT,periods:[],language:'en' as const,digits:'en' as const};
    assert.ok(classDispatchText({...base,exam:true},say).includes('dispatch.examDay'),'the group message names an exam day');
    assert.ok(classDispatchText({...base,holiday:'Weekly day off'},say).includes('dispatch.holiday:Weekly day off')
      &&!classDispatchText({...base,holiday:'Weekly day off'},say).includes('dispatch.noPeriods'),
      'a day off says so instead of "no periods"');
    assert.ok(classDispatchText(base,say).includes('dispatch.noPeriods'),'an ordinary empty day is unchanged');

    /* ── the exam's own choices, written on the date ───────────────────────────────────────────── */
    assert.equal((await saveDailySheet({classId,shift:SHIFT,date:SATURDAY_DATE,status:'normal',holidayReason:'',
      notes:'',examSubjectBn:'বিজ্ঞান',examSubjectEn:'Science',examMode:'exam',periods:[],actor})).status,'ok');
    const examOnlySheet=(await dailySheet(classId,SHIFT,SATURDAY_DATE,'bn'))!;
    assert.deepEqual([examOnlySheet.examSubjectBn,examOnlySheet.examSubjectEn,examOnlySheet.examMode,
      examOnlySheet.periods.length],['বিজ্ঞান','Science','exam',0],
      'an exam-only date stores which exam runs, and no classes');
    assert.equal((await saveDailySheet({classId,shift:SHIFT,date:SATURDAY_DATE,status:'normal',holidayReason:'',
      notes:'',examSubjectBn:'বিজ্ঞান',examSubjectEn:'Science',examMode:'both',periods:[period(actor)],actor})).status,'ok');
    const examBothSheet=(await dailySheet(classId,SHIFT,SATURDAY_DATE,'bn'))!;
    assert.deepEqual([examBothSheet.examMode,examBothSheet.periods.length],['both',1],
      'the same date can run the exam and its classes together');

    /* ── re-saving the same type writes nothing, and a day from before the field reads as taught ── */
    const before=await history(SATURDAY);
    assert.equal((await type(SATURDAY,'exam')).status,'ok');
    assert.equal(await history(SATURDAY),before,'choosing what is already chosen leaves no line in the history');
    await MasterRoutine.collection.updateOne({classGroup:group._id,shift:SHIFT,weekday:FRIDAY},{$unset:{dayType:1}});
    assert.equal((await day(FRIDAY)).dayType,'class','a day written before the field existed is a teaching day');
    assert.equal((await centreSlots(FRIDAY)).length,1,'and it still counts in the clash check');

    /* ── refusals ───────────────────────────────────────────────────────────────────────────────── */
    assert.equal((await setMasterDayType({classId,shift:SHIFT,weekday:FRIDAY,dayType:'bogus' as never,actor})).status,'invalid');
    assert.equal((await type(9,'off')).status,'invalid');
    assert.equal((await setMasterDayType({classId:'nope',shift:SHIFT,weekday:FRIDAY,dayType:'off',actor})).status,'invalid');
    assert.equal((await setMasterDayType({classId,shift:'  ',weekday:FRIDAY,dayType:'off',actor})).status,'invalid');
    assert.equal((await day(FRIDAY)).dayType,'class','a refused write changes nothing');

    console.log('Routine day type: written on empty and full days, reversible, periods kept, off days hold nobody, '
      +'a date\'s own sheet still wins, notice and message say the right thing, old days read as taught, bad input refused.');
  }finally{
    await mongoose.disconnect();
    await mongo.stop();
  }
}

run().catch(error=>{console.error(error);process.exit(1)});
