/**
 * S2 · the class workflow, as rules with no database and no browser behind them.
 *
 * Slice 2 is the audit's findings about a CLASS rather than about a student's money: how one is written,
 * what its shifts mean, when it may be closed, what its fee says, and what happens to the children on it.
 * What each of those rules MEANS is settled here, over plain values and over the source that carries them,
 * so the database suite is left to prove the record agrees and the browser suite is left to prove the
 * screens ask:
 *
 *  F-04 one editor writes a class whole — both names, the level, the shifts, the room, the fee, the
 *       teachers and whether it is running — and the two screens that used to write halves of one record
 *       both render it.
 *  F-05 a class with children on it is not closed: the count is read first and the refusal names it.
 *  F-08 the shifts a class runs are canonical keys and the shift word a routine reads is derived from
 *       the first of them, so no two screens can disagree about one class.
 *  F-09 the name rule binds only the classes that are live and running, so an archived or binned class
 *       gives its name back.
 *  F-10 a removal is filed with the date it stops being kept, and the window is the centre's own.
 *  F-16 a fee distinguishes a class that costs nothing from a class nobody has priced, and clearing one
 *       is an act rather than an accident.
 *
 * Run: npm run test:s2:core
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  CLASS_SHIFT_KEYS,feeStateOf,feeUnset,isShiftKey,shiftKeyOfWord,shiftWordsOf,
} from '../src/lib/classes/class-shared';
import {STUDENT_PURGE_RETENTION_DAYS,retentionDaysOf,studentPurgeAt} from '../src/lib/center/student-purge';
import {monthAfterWord,nextMonth} from '../src/lib/center/student-changes';
import bnMessages from '../src/messages/bn.json';
import enMessages from '../src/messages/en.json';

const read=(file:string):string=>readFileSync(file,'utf8');
const DAY=86400000;

/* ── 1. F-16 · one number, two meanings, and a clearing that is an act ────────────────────────────── */
assert.deepEqual(feeStateOf(1200,false),{fee:'1200',free:false},
  'a class with a price opens its editor with that price in the box and the free tick off');
assert.deepEqual(feeStateOf(0,false),{fee:'',free:false},
  'a class nobody has priced opens with an empty box, which is what "not decided yet" looks like');
assert.deepEqual(feeStateOf(0,true),{fee:'',free:true},
  'and a class the centre runs for free opens with the same empty box and the tick that says why');
assert.deepEqual(feeStateOf(1200,true),{fee:'1200',free:false},
  'a number beats the tick: a class cannot be priced and free at once, and the price is the fact');
assert.equal(feeUnset(0,false),true,'an unpriced class is the one a screen must not quote a fee for');
assert.equal(feeUnset(0,true),false,'a free class is not unpriced — it is priced at nothing');
assert.equal(feeUnset(1200,false),false,'and a priced class is neither');

/* ── 2. F-08 · the shifts are keys, and the word is derived ───────────────────────────────────────── */
const LABELS=['সকাল','দুপুর','সন্ধ্যা'];
assert.deepEqual([...CLASS_SHIFT_KEYS],['morning','day','evening'],'the day has three shifts, in its own order');
assert.equal(shiftKeyOfWord('সকাল',LABELS),'morning',
  'a class written before the boxes held its shift as a word, and a word that IS one of the three labels '
  +'is the same fact the box would have written — so the first save stores the key beside it');
assert.equal(shiftKeyOfWord('সন্ধ্যা',LABELS),'evening','whichever of the three it was');
assert.equal(shiftKeyOfWord('প্রভাতী',LABELS),undefined,
  "and a word the owner typed themselves is none of them: it stays exactly as it stands, because a class "
  +'that says প্রভাতী is not a morning class and nothing here may decide that it is');
assert.equal(shiftKeyOfWord('  ',LABELS),undefined,'an empty word is no shift at all');
assert.equal(shiftKeyOfWord('Morning',LABELS),undefined,
  'the labels are the catalog\u2019s own Bangla words, so an English word is not one of them either');
assert.equal(isShiftKey('morning'),true,'a key is still recognised as a key');
assert.deepEqual(shiftWordsOf({shifts:['morning','evening'],shift:''}),['morning','evening'],
  'a card reads the keys it holds');
assert.deepEqual(shiftWordsOf({shifts:[],shift:'প্রভাতী'}),['প্রভাতী'],
  'and a card reads the owner\u2019s own word for a class that has no keys yet');

/* ── 3. F-10 · the window a removal is kept for ───────────────────────────────────────────────────── */
const now=new Date('2026-11-12T00:00:00Z');
assert.equal(STUDENT_PURGE_RETENTION_DAYS,30,'thirty days is the window a centre gets when it has chosen none');
assert.equal(studentPurgeAt(now).getTime(),now.getTime()+30*DAY,
  'a removal with no setting behind it is kept for thirty days and then dropped');
assert.equal(studentPurgeAt(now,{purgeRetentionDays:45}).getTime(),now.getTime()+45*DAY,
  'and the window is the centre\u2019s own setting, not this file\u2019s opinion');
assert.equal(studentPurgeAt(now,{purgeRetentionDays:365}).getTime(),now.getTime()+365*DAY,
  'a centre that keeps its records for a year keeps these for a year');
for(const bad of [{purgeRetentionDays:0},{purgeRetentionDays:-4},{purgeRetentionDays:1.5},
  {purgeRetentionDays:Number.NaN},{purgeRetentionDays:1e9},{},null,undefined]){
  assert.equal(retentionDaysOf(bad),30,
    `a window that is not a whole number of days, is not positive, or is absurd falls back to thirty (${JSON.stringify(bad)})`);
}

/* ── 4. F-05 · the refusal, word for word, in both languages ──────────────────────────────────────── */
/* The catalogs are imported with their literal types (an array lives under `levels`), so the group is
   read through a widened cast: every key this suite asserts on holds a sentence. */
const bnClass=(bnMessages as unknown as {classAdmin:Record<string,string>}).classAdmin;
const enClass=(enMessages as unknown as {classAdmin:Record<string,string>}).classAdmin;
assert.equal(bnClass.archiveRefused,
  'এই শ্রেণিতে এখনও {count} জন শিক্ষার্থী সক্রিয় রয়েছে। তাদের অন্য শ্রেণিতে স্থানান্তর করুন।',
  'the Bangla refusal is the sentence the brief asks for, with the count in it');
assert.equal(enClass.archiveRefused,
  'This class still has {count} active students. Transfer them to another class before archiving.',
  'and so is the English one');
assert.ok(bnClass.archiveRefusedHelp.length>20&&enClass.archiveRefusedHelp.length>20,
  'and both carry the way out beside the refusal, because "you may not" alone is a dead end');

const ACTION='src/actions/class-admin.ts';
const action=read(ACTION);
assert.ok(action.includes("t('archiveRefused',{count:formatNumber(running,language)})"),
  'the refusal is composed from the catalog with the count in the operator\u2019s own digits');
assert.ok(/countDocuments\(\{classGroup:current\._id,status:\{\$ne:'removed'\}\}\)/.test(action),
  'the count is the children still on the class — a student who has left does not hold it open');
assert.ok(action.includes("throw new Error(`ARCHIVE_REFUSED:${running}`)")
  &&action.includes("status:'refused'"),
  'and it is refused inside the transaction, as its own answer rather than as a generic failure, so the '
  +'screen can print the number and the way out');
assert.ok(/if\(!active&&current\.active!==false\)/.test(action),
  'only a class that is being closed is counted: a class already closed has nothing to refuse');
const doors=read('src/actions/center-students.ts');
/* The older class doors were kept in step with this one for as long as they existed, and keeping two
   doors in step is the work itself: every guard had to be written twice and every refusal worded twice.
   S2 deleted them instead — see section 11 — so the sentence a closed class is refused with now has one
   place to live and one action to be proved against. */
assert.ok(!/export async function (?:createCenterClass|updateCenterClass)/.test(doors)
  &&!doors.includes('ARCHIVE_REFUSED'),
  'and no second class door is left to keep in step with it: a class is written by one action, so the '
  +'refusal that protects a roll has one home rather than two that can drift');

/* ── 5. F-04 · one editor, and the fields it owns ─────────────────────────────────────────────────── */
const EDITOR='src/components/admin/class-management.tsx';
const editor=read(EDITOR);
assert.ok(editor.includes('export function ClassEditorForm'),
  'the class editor is one exported form, so a screen renders it rather than re-writing it');
for(const field of ['name="nameBn"','name="nameEn"','name="level"','name="room"','name="monthlyFee"',
  'name="shifts"','name="teacherIds"','name="active"','name="feeFree"','name="feeWas"','name="revision"',
  'name="academicYear"']){
  assert.ok(editor.includes(field),`the one editor carries ${field} — every field the record has`);
}
assert.ok(editor.includes('data-teacher-check={option.id}')&&editor.includes('data-teacher-option={option.id}'),
  'and it offers the teachers by the hooks the exam suite has always driven them by');
assert.ok(editor.includes('data-class-archive-refused'),
  'the refusal is printed in its own place on the sheet, with the count in it');
for(const surface of ['src/components/admin/center-class-edit.tsx','src/components/admin/center-forms.tsx']){
  const text=read(surface);
  assert.ok(text.includes('ClassEditorForm'),
    `${surface} renders the one editor rather than a form of its own (F-04)`);
  assert.ok(!/updateCenterClass|createCenterClass/.test(text),
    'and posts to the one action rather than to the door that wrote half a class');
}
/* The exam suite has always driven the teacher assignment through this marker: it opens the row by its
   summary, ticks a teacher inside `[data-class-edit="<id>"]` and clicks the first button in it, which is
   the save. A rewrite that moves the marker, or puts it inside the editor instead of around it, breaks a
   suite that has nothing to do with the class workflow — so the fold keeps it as the editor's ancestor. */
assert.ok(read('src/components/admin/center-class-edit.tsx').includes('data-class-edit={item.id}'),
  'the fold keeps the marker the teacher assignment is driven by, around the one editor');
assert.ok(/teacherIds=\[\.\.\.new Set\(form\.getAll\('teacherIds'\)/.test(action)
  &&action.includes("role:'teacher',active:true"),
  'the teachers travel with the class, and an assignment is still an authorization: only a live teacher '
  +'account is ever stored');
assert.ok(action.includes('teachers=teacherIds.map(entry=>new mongoose.Types.ObjectId(entry))')
  &&/room:value\.room,active,teachers/.test(action),
  'and one write stores all of it, so no half of a class is left for another screen to remember');

/* ── 6. F-08/F-09 · what the write and the index say ──────────────────────────────────────────────── */
assert.ok(action.includes('function shiftOf(words:string[],shifts:string[],current:string):string'),
  'the shift word is derived, not remembered');
assert.ok(/if\(shifts\.length\)\{[\s\S]{0,200}?words\[at\]/.test(action),
  'a ticked box decides it: the word is the first key\u2019s own Bangla label');
assert.ok(action.includes('return words.includes(word)?\'\':word;'),
  'an unticked label is dropped, while a word that is none of the three is kept as its owner wrote it');
assert.ok(/shiftKeyOfWord\(String\(current\.shift\|\|''\),words\)/.test(action),
  'and the first save of a class written before the boxes gives it the canonical key its word means');
const shiftWords=read('src/lib/classes/shift-words.ts');
assert.ok(shiftWords.includes("getTranslations({locale:'bn',namespace:'classAdmin'})")
  &&action.includes('classShiftWords()'),
  'the labels are read from the catalog: no Bangla literal lives in the action');
const model=read('src/models/CenterRecords.ts');
assert.ok(model.includes("groupSchema.index({'name.bn':1,academicYear:1,shift:1},"
  +'{unique:true,partialFilterExpression:{deletedAt:null,active:true}})'),
  'the name rule binds only the classes that are live and running, so an archived or binned class gives '
  +'its name back (F-09)');
assert.ok(model.includes('feeFree:{type:Boolean,default:false}'),
  'and a class holds the sentence behind a zero: free, rather than not decided yet');
const cron=read('src/lib/admin/cron.ts');
assert.ok(cron.includes('CenterClassGroup.syncIndexes()'),
  'an index is not a schema, so the nightly job brings an existing database in line with the rule the '
  +'code now declares — without it the wider index would stay in force and the fix would be true only '
  +'in the source');
const route=read('src/app/api/admin/jobs/daily/route.ts');
assert.ok(route.includes('purgeRemovedStudents()')&&route.includes('syncClassIndexes()'),
  'and the daily job runs both');
assert.ok(route.includes('removed student(s) past their retention window were purged'),
  'saying out loud how many records it dropped, because a nightly job that deletes quietly is a job '
  +'whose work cannot be checked in the morning');

/* ── 7. F-10 · the removal files its own end, and the job honours it ──────────────────────────────── */
assert.ok(doors.includes('studentPurgeAt(new Date(),await removalWindow())'),
  'a removal is filed with the date it stops being kept, read from the centre\u2019s own setting');
assert.ok(/removal=\{removedAt:new Date\(\),removedBy:new mongoose\.Types\.ObjectId\(admin\.id\),reason,leaveDate:leave,purgeAt\}/.test(doors),
  'and the date is stored on the removal itself, where the index the schema already declares can find it');
const purge=read('src/lib/center/student-purge.ts');
assert.ok(purge.includes("{status:'removed','removal.purgeAt':{$type:'date',$lte:now}}"),
  'only a removal that carries a date of its own is ever dropped: a student removed before this slice '
  +'has no window anybody agreed to');
assert.ok(purge.includes("action:'student.purge'"),
  'and each one leaves an activity row naming the administrator who removed them, because `actor` is '
  +'required and an unattended deletion nobody can answer for is a deletion nobody can audit');
assert.ok(purge.includes('CenterStudent.deleteOne')&&!purge.includes('CenterPayment.deleteMany'),
  'the money outlives the student: a cashbook that loses a line when a child leaves is a cashbook '
  +'nobody can audit');

/* ── 8. F-06/F-15 · the class page answers for a closed class and for a wrong address ─────────────── */
const hub=read('src/app/[locale]/admin/students/classes/[id]/page.tsx');
assert.ok(!hub.includes('notFound()'),
  'a class page no longer answers a wrong address with a dead end');
assert.ok(hub.includes('data-class-unknown')&&hub.includes("t('hub.unknownNote')"),
  'it says which class it could not find (F-15)');
assert.ok(/searchCenterStudents\(\{q:'',classId:'',status:'',page:1\}\)/.test(hub),
  'and lists every class instead, which is the list the operator was reaching for');
assert.ok(hub.includes('{group.active')&&hub.includes('data-class-archived')
  &&hub.includes("t('hub.archivedNote')"),
  'a closed class says it is closed, and the enrolment form is on the other side of that sentence (F-06)');
assert.ok(hub.includes('data-class-archived-open')&&hub.includes('data-class-archived-records'),
  'with the two ways out: open the class again, or read the history it already has');
assert.ok(/if\(!fee&&!group\.feeFree\)/.test(hub),
  'and a class the centre runs for free quotes no price of its own and borrows none from its roll');

/* ── 9. F-07/F-11/F-12/F-14 · the screens the workflow runs through ───────────────────────────────── */
const forms=read('src/components/admin/center-forms.tsx');
assert.ok(forms.includes('const pickClass=(id:string):void=>')
  &&forms.includes('monthlyFee:feeOf(id)||current.monthlyFee'),
  'picking a class on an enrolment fills the fee that class advertises (F-07)');
assert.ok(forms.includes('const [priced,setPriced]=useState(!presetClassId)'),
  'and a form standing inside a class opens with that class\u2019s price already in the box');
assert.ok(forms.includes('data-enroll-fee')&&forms.includes("t('feeFromClass')"),
  'saying where the number came from, so an operator knows it is a quote they may change');
assert.ok(forms.includes('monthlyFee:number;feeFree:boolean'),
  'the class list an enrolment picks from carries the price and the two meanings of a zero');
const list=read('src/components/admin/center-student-list.tsx');
assert.ok(list.includes('const PER_PAGE=20;')&&list.includes('Math.ceil(next.total/PER_PAGE)'),
  'the pager and the read count a page by the same number (F-14)');
assert.ok(/if\(!next\.items\.length&&next\.total>0&&target>lastPage\)\{target=lastPage;continue\}/.test(list),
  'and a page that has emptied under the operator\u2019s feet is stepped back from rather than shown');
assert.ok(list.includes('const touched=useRef(false)')&&list.includes('if(!touched.current){setResult(initial);return}'),
  'a list held in client state adopts the server\u2019s re-read after a write, so a roster refreshes '
  +'without anybody reloading the page (F-11)');
assert.ok(list.includes('search(result.page);'),
  'unless the operator has driven it somewhere else, in which case their own filters are re-read');
const row=read('src/components/admin/students-row.tsx');
assert.ok(row.includes('const needsClass=student.status===\'removed\'&&!student.classActive;')
  &&row.includes('data-restore-class'),
  'restoring a student whose class is closed or gone asks which running class they come back to (F-12)');
assert.ok(row.includes('disabled={restorePending||!resumeMonth||(needsClass&&!restoreClass)}'),
  'and will not write until one has been picked');
assert.ok(row.includes('value={restoreReason}'),
  'the reason is state, so a refusal leaves the sheet holding what the operator typed');
const restoreForm=read('src/components/admin/center-restore-form.tsx');
assert.ok(restoreForm.includes('data-restore-class')&&restoreForm.includes('name="classGroup"'),
  'the removed list\u2019s own restore door asks the same question, because it is the same student');
assert.ok(doors.includes('let target=targetId,targetName={bn:\'\',en:\'\'};')
  &&doors.includes("if(!found)throw Error('NO_CLASS')")
  &&/planClassTransfer\(/.test(doors),
  'and the restore carries the move with it, written by the same planner the move door uses');
assert.ok(/classActive:!!group&&group\.active!==false/.test(doors),
  'the row knows whether its class is running before the sheet opens, rather than finding out on the write');
assert.ok(/async function classScopeOf\(classId:string\):Promise<string>/.test(doors)
  &&doors.includes('return await CenterClassGroup.exists({_id:id})?id:\'\';'),
  'a search that cannot name its class is not scoped at all, rather than answered with a failure (F-15)');

/* ── 10. what the browser bundle is allowed to hold ───────────────────────────────────────────────── */
/* The one editor is rendered from three screens now, and a client component may only import modules that
   hold nothing but words, shapes and arithmetic: a module that registers a Mongoose model at import has
   nothing to register against in a browser, and the screen dies at hydration with a sentence about a
   model that does not exist. */
const seen=new Set<string>();
/** A module path as the bundler resolves it: `.tsx`, `.ts`, or a folder's own index. */
const resolve=(file:string):string=>{
  for(const candidate of [file,`${file}.tsx`,`${file}.ts`,`${file}/index.tsx`,`${file}/index.ts`]){
    try{read(candidate);return candidate}catch{/* the next candidate */}
  }
  return '';
};
const walk=(file:string):void=>{
  const full=file.endsWith('.tsx')||file.endsWith('.ts')?file:resolve(file);
  if(!full||seen.has(full))return;
  seen.add(full);
  const text=read(full);
  /* The bundle stops at a server action: the browser holds a reference to it, not its code. */
  if(text.startsWith("'use server'"))return;
  assert.ok(!/from\s+'mongoose'|models\//.test(text),
    `${full} is reachable from a client component and must not register a model in the browser`);
  for(const match of text.matchAll(/import\s+(type\s+)?[\s\S]*?from\s*'(@\/[^']+|\.{1,2}\/[^']+)'/g)){
    /* A type-only import is erased from the bundle, so it drags nothing with it. */
    if(match[1])continue;
    const target=match[2];
    const base=full.split('/').slice(0,-1).join('/');
    walk(target.startsWith('@/')?`src/${target.slice(2)}`:`${base}/${target}`.replace('/./','/'));
  }
};
walk('src/components/admin/center-class-edit.tsx');
walk('src/components/admin/center-restore-form.tsx');
assert.ok(seen.has('src/components/admin/class-management.tsx'),
  'the walk reached the one editor from the row that renders it');

/* ── 11. F-13 · the month a restore may offer, and the two doors that were deleted ─────────────── */
/* A resume month is never the month the student left in: `restoreCenterStudent` refuses it, and a picker
   that offers a month the door refuses costs the operator the reason they typed beside it. The picker's
   `notBefore` names the first month that IS allowed, so what the rule hands it is the month after. */
const LEAVE='2026-03';
assert.equal(monthAfterWord(LEAVE),'2026-04',
  'the month a restore offers starts the month after the one the student left, so the leave month itself '
  +'is a dead button rather than a refusal after a submit (F-13)');
assert.equal(monthAfterWord('2026-12'),'2027-01','and a year ends by opening the next one');
assert.equal(monthAfterWord('2026-03-15'),'2026-04',
  'a removal filed by an import carries a whole date rather than a month, and the bound reads the month '
  +'out of it: a constraint that only fits one of the two shapes a removal has is a constraint that '
  +'quietly does nothing for the other');
assert.equal(monthAfterWord('\u09e8\u09e6\u09e8\u09ec-\u09e6\u09e9'),'2026-04',
  'a month read off a screen that counts in Bangla digits is the same month');
assert.equal(monthAfterWord(''),'',
  'with no month filed there is nothing to constrain by, and an empty bound constrains nothing');
assert.equal(monthAfterWord('not a month'),'',
  'and a word that is not a month is answered with no bound rather than with a guess');
assert.deepEqual(nextMonth({year:2026,month:12}),{year:2027,month:1},
  'the arithmetic behind it is the mirror of the one a pause already used');
const popover=read('src/components/admin/month-popover.tsx');
assert.ok(popover.includes('if(notBefore&&value<monthNumber(notBefore))return true;'),
  'the picker switches off the months BEFORE the bound and leaves the bound itself live, which is why '
  +'the rule hands it the month after the one it refuses');
assert.ok(row.includes('notBefore={monthAfterWord(student.leaveMonth)||undefined}'),
  'the row\u2019s restore sheet offers the month after the leave month it already read for its badge');
assert.ok(restoreForm.includes('notBefore={monthAfterWord(leaveMonth)||undefined}')
  &&restoreForm.includes('leaveMonth:string;'),
  'and the removed list\u2019s own door is given the same month rather than reading the removal again');
const removedPage=read('src/app/[locale]/admin/students/removed/page.tsx');
assert.ok(removedPage.includes("leaveMonth={String(x.removal?.leaveDate||'').slice(0,7)}"),
  'handed over by the page that read the removal, as the `YYYY-MM` month the picker wants');
assert.ok(doors.includes("if(resumeN<=leaveN)throw Error('INVALID_RESUME')"),
  'the door behind it refuses the same months the picker has already switched off, so the two cannot '
  +'disagree about what a restore may say');
const moneyDoors=read('src/components/admin/student-money-doors.tsx');
assert.ok(moneyDoors.includes('notBefore={hold?undefined:monthAfterWord(holdFrom)||undefined}')
  &&!moneyDoors.includes('function nextMonthWord'),
  'the lift door reads the same helper it used to keep a private copy of, because one rule held in two '
  +'files is a rule that drifts the first time one of them is edited');
/* The two doors S2 · F-04 left behind. They wrote halves of a class — no level, no room, no fee
   meanings, shifts as free words — and every screen had already moved to the one editor, so what
   remained was an exported write that no screen reached and no test drove: a door left open in a wall
   everybody walks past is a door somebody will eventually walk through. */
assert.ok(!doors.includes('centerClassSchema'),
  'the shape only those two doors parsed is gone with them');
assert.ok(!read('src/schemas/center.ts').includes('centerClassSchema'),
  'and gone from the schemas too, so nothing is left that only a deleted door could read');
assert.ok(!doors.includes('const languageOf='),
  'with the refusal that needed the operator\u2019s own language deleted, the helper that fetched it goes '
  +'as well: an unused import in a server action is a module loaded for nothing on every write');

console.log('Class workflow core: a fee says which of two things it is and clears only on purpose, a shift '
  +'word is derived from the keys a class runs, a removal is filed with the date it stops being kept and the '
  +'window is the centre\u2019s own, a class with children on it is refused in the brief\u2019s own two sentences, '
  +'one editor owns every field a class has and all three surfaces render it, the name rule binds only the '
  +'classes that are live, a closed class says so instead of offering enrolment, a wrong address lists '
  +'every class instead of dead-ending, a restore offers only the months the door would take, and the two '
  +'doors that used to write half a class are gone.');
