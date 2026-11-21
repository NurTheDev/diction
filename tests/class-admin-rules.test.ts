/**
 * O1 · A class is a place, a set of hours, a roll and its batches — and writing one is one decision.
 *
 * The class screen grew out of a list of names with an edit fold in each row. What the owner asks about
 * a class is four things — which shifts it runs, which room it sits in, how many children are on it, how
 * many batches are going — and none of them were on the list. This suite holds the rules behind the
 * screen that now answers them, in the three layers a rule can live in:
 *
 * · **the record** — a class holds a room and a list of shifts, and a batch holds the class it runs in;
 *   every one of those fields is optional with an empty default, so a class or a batch written before
 *   this screen keeps saying exactly what it always said;
 * · **the shape of a write** — the three shifts are read off a checkbox group (which `Object.fromEntries`
 *   would have collapsed to the last one ticked), a fee box left empty means "not decided" rather than
 *   "free", and a room is a label short enough to fit on a period card;
 * · **the write itself** — an edit is refused when somebody else changed the class first, the academic
 *   year is written once and never moved (a fee history is read against the year it was taken in), and
 *   assigning batches is total for the class being edited, so one batch can never sit on two cards.
 */
import assert from 'node:assert/strict';
import {existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {CenterClassGroup} from '../src/models/CenterRecords';
import {Batch} from '../src/models/Academic';
import {classGroupSchema,shiftsOf} from '../src/schemas/center';
import {CLASS_SHIFT_KEYS,isShiftKey,routineShiftWords,shiftWordsOf} from '../src/lib/classes/class-shared';

const read=(file:string):string=>readFileSync(file,'utf8');
const walk=(dir:string,out:string[]=[]):string[]=>{
  for(const entry of readdirSync(dir)){
    const next=`${dir}/${entry}`;
    if(statSync(next).isDirectory())walk(next,out);else if(/\.(ts|tsx)$/.test(entry))out.push(next);
  }
  return out;
};

// ── 1. The record holds what a card shows ────────────────────────────────────────────────────────
const group=CenterClassGroup.schema;
assert.ok(group.path('room'),'a class holds a room of its own');
assert.equal((group.path('room') as {options:{default?:string}}).options.default,'',
  'and a class written before it has an empty one rather than no field at all');
const shifts=group.path('shifts') as unknown as {options:{type?:unknown[]}};
assert.ok(group.path('shifts'),'a class holds the shifts it runs, as a list');
assert.ok(Array.isArray(shifts.options.type),'because a class can run more than one');
assert.ok(group.path('shift'),'the shift a routine is written for is still the field the routine reads');
assert.ok(group.path('monthlyFee')&&group.path('level'),
  'the month a class costs and the level it teaches are still its own fields');

const batch=Batch.schema;
assert.ok(batch.path('classGroup'),'a batch holds the class it runs inside');
assert.equal((batch.path('classGroup') as {options:{ref?:string}}).options.ref,'CenterClassGroup',
  'and it points at the centre\'s own class list, not at a grade word');

// ── 2. The three shifts, read off a checkbox group ───────────────────────────────────────────────
assert.deepEqual([...CLASS_SHIFT_KEYS],['morning','day','evening'],
  'the shifts a card offers are the three the centre runs, in the order the day happens');
const form=new FormData();
form.append('shifts','evening');
form.append('shifts','morning');
form.append('shifts','morning');
form.append('shifts','নাই-এমন-শিফট');
assert.deepEqual(shiftsOf(form),['morning','evening'],
  'every box that was ticked is read — not just the last one — each once, in the day\'s own order, '
  +'and a word that is not one of the three is dropped rather than stored');
assert.deepEqual(shiftsOf(new FormData()),[],'a class with no box ticked runs no shift of its own');
const all=new FormData();
for(const key of CLASS_SHIFT_KEYS)all.append('shifts',key);
assert.deepEqual(shiftsOf(all),['morning','day','evening'],'and all three may be ticked at once');
assert.equal(isShiftKey('Morning'),true,'a key is recognised whatever case it arrives in');
assert.equal(isShiftKey('সকাল'),false,'a word the owner typed themselves is not a key');

/* A card shows the keys through the catalog and the owner's own word as it stands, so a class written
   before this screen never reads "no shift" on its own card. */
assert.deepEqual(shiftWordsOf({shifts:['morning','evening'],shift:''}),['morning','evening'],
  'a class written here shows the shifts its boxes wrote');
assert.deepEqual(shiftWordsOf({shifts:[],shift:'সকাল'}),['সকাল'],
  'and a class written before it shows the word it has always had');
assert.deepEqual(shiftWordsOf({shifts:[],shift:''}),[],'a class with neither says nothing, and the card says so');
const shiftLabels=['সকাল','দুপুর','সন্ধ্যা'];
assert.deepEqual(routineShiftWords({shifts:['morning','day'],shift:'সকাল'},shiftLabels),['সকাল','দুপুর'],
  'a class that runs two shifts offers both to the routine, in the class\'s own order');
assert.deepEqual(routineShiftWords({shifts:['day'],shift:'দুপুর'},shiftLabels),['দুপুর'],
  'a class that runs only the day shift offers the day word, not the morning one');
assert.deepEqual(routineShiftWords({shifts:[],shift:'প্রভাতী'},shiftLabels),['প্রভাতী'],
  'and a class written before the boxes still offers the one word it has always had');

// ── 3. The shape of a write ──────────────────────────────────────────────────────────────────────
const base={nameBn:'নমুনা সপ্তম শ্রেণি',nameEn:'Sample Class Seven',level:'সপ্তম শ্রেণি',
  room:'Room-1201',academicYear:'2026'};
const ok=classGroupSchema.safeParse({...base,monthlyFee:''});
assert.equal(ok.success,true,'a class with everything but a fee is a valid class');
assert.equal(ok.success&&(ok.data.monthlyFee===null||ok.data.monthlyFee===undefined),true,
  'and an empty fee box is "not decided yet", never zero — zero would mean free');
const fee=classGroupSchema.safeParse({...base,monthlyFee:'১২০০'});
assert.equal(fee.success,true,'a fee typed in Bangla digits is read');
assert.equal(fee.success&&fee.data.monthlyFee,1200,'as the number it says');
assert.equal(classGroupSchema.safeParse({...base,monthlyFee:'1500'}).success,true,
  'and so is one typed in ASCII digits');
assert.equal(classGroupSchema.safeParse({...base,monthlyFee:'বেতন'}).success,false,
  'a fee that is not a number is refused rather than stored as nothing');
assert.equal(classGroupSchema.safeParse({...base,nameBn:''}).success,false,'a class must have a Bangla name');
assert.equal(classGroupSchema.safeParse({...base,room:'R'.repeat(81)}).success,false,
  'and a room is a label, not a paragraph — it has to fit on a period card');
assert.equal(classGroupSchema.safeParse({...base,academicYear:'২০২৬'}).success,true,
  'the session is read in the digits it was typed in');

// ── 4. The write itself ──────────────────────────────────────────────────────────────────────────
const ACTION='src/actions/class-admin.ts';
const SHIFT_WORDS='src/lib/classes/shift-words.ts';
assert.ok(existsSync(ACTION),'the class screen has its own write side');
const action=read(ACTION);
assert.ok(action.includes("requireAdmin()")&&action.includes("admin.role!=='admin'"),
  'a class is written by an administrator, and the action refuses anybody else rather than trusting the menu');
assert.ok(/current\.updatedAt\.toISOString\(\)!==revision/.test(action),
  'an edit is refused when the class moved while the form was open — a stale write is a conflict, not an overwrite');
assert.ok(/Number\(value\.academicYear\)!==Number\(current\.academicYear\)/.test(action),
  'the academic year is written once and never moved, because a fee history is read against the year it was taken in');
assert.ok(action.includes('code===11000')&&action.includes("'duplicate'"),
  'a second class with a name the centre already has is answered as a duplicate, which is a sentence the operator can act on');
const shiftWords=read(SHIFT_WORDS);
assert.ok(shiftWords.includes("getTranslations({locale:'bn',namespace:'classAdmin'})")
  &&action.includes('classShiftWords()'),
  'the shift a routine will read is fetched from the catalog rather than written as a literal in the action');
assert.ok(action.includes('class.batches')&&action.includes('class.create')&&action.includes('class.update'),
  'every write leaves an activity row naming what happened');
assert.ok(/Batch\.updateMany\(\{_id:\{\$in:picked\}\}/.test(action)
  &&/Batch\.updateMany\(\{classGroup:group\._id,_id:\{\$nin:picked\}\}/.test(action),
  'assigning batches is total for the class being edited: the ticked ones are given it and the unticked ones are let go');
assert.ok(action.includes('revalidatePath')&&action.includes('/admin/routine/master'),
  'and a class that changes re-reads the screens that hang from it — the roll, the timetable, the batches');

// ── 5. The screen ────────────────────────────────────────────────────────────────────────────────
const PAGE='src/app/[locale]/admin/classes/page.tsx';
const VIEW='src/components/admin/class-management.tsx';
const LIB='src/lib/classes/class-view.ts';
for(const file of [PAGE,VIEW,LIB])assert.ok(existsSync(file),`${file} exists`);
const page=read(PAGE);
assert.ok(page.includes('classBoard(')&&page.includes('<ClassManagement'),
  'the page reads the whole board in one pass and hands it to one component');
assert.ok(page.includes("export const dynamic='force-dynamic'"),
  'and it is read live, because a count that is cached is a count that is wrong');
const lib=read(LIB);
assert.ok(/CenterStudent\.aggregate/.test(lib)&&/Batch\.aggregate/.test(lib),
  'both counts are grouped in the database rather than queried once per card');
assert.ok(/status:'active'/.test(lib),'the roll a card counts is the children actually enrolled');

const view=read(VIEW);
for(const hook of ['data-class-add','data-class-card','data-class-name','data-class-shifts','data-class-room',
  'data-class-students','data-class-batches','data-class-edit','data-class-students-link','data-class-routine-link',
  'data-class-form','data-class-name-bn','data-class-name-en','data-class-level','data-class-room','data-class-fee',
  'data-class-shift-box','data-class-batch-box','data-class-save'])
  assert.ok(view.includes(hook),`the screen carries ${hook}`);
assert.ok(view.includes('/admin/students/classes/${card.id}')&&view.includes('/admin/routine/master?classId=${card.id}'),
  'a card leads to the class roll and to the class timetable, one tap each');
assert.ok(/t\('studentsCount',\{count:/.test(view)&&/t\('batchesCount',\{count:/.test(view),
  'and it says how many children and how many batches in the operator\'s own words, in their own digits');
assert.ok(/useState<ClassDraft>/.test(view)&&/value=\{value\.nameBn\}/.test(view),
  'what was typed is held in state, so a refused write cannot empty the form the operator has to fill again');
assert.ok(view.includes('showRecycleToast'),
  'and the answer to the write — saved, duplicate, somebody changed it first — is raised in the corner');

// ── 6. What the browser bundle is allowed to hold ────────────────────────────────────────────────
/**
 * A client component may only import modules that hold nothing but words, shapes and arithmetic.
 *
 * The class screen broke this once, and the way it broke is the reason this rule is a test rather than
 * a note: the board's read lives in `class-view.ts`, which registers Mongoose models when it is
 * imported. One helper taken from it by the screen dragged the whole module into the browser bundle,
 * where a model has nothing to register against. The server rendered the board perfectly, the browser
 * received it, and hydration died on a sentence about a model that does not exist — so the operator was
 * told the data could not be read on a screen whose data had been read, and the only trace was a
 * client-side error nobody was looking at. Type checking passes, the build passes, and the screen works
 * until it is opened in a browser.
 *
 * So: walk every module a client component of this delivery imports, and stop only where the bundle
 * genuinely stops — a server action, which the browser holds a reference to rather than the code of, a
 * module marked `server-only`, a type-only import, or a package outside `src/`. Anything else that
 * touches Mongoose or a model is a screen that will arrive blank.
 */
const SHARED='src/lib/classes/class-shared.ts';
assert.ok(existsSync(SHARED),`${SHARED} exists`);
const shared=read(SHARED);
assert.ok(!/from\s+'mongoose'|models\//.test(shared),
  'the words and shapes the screen and its action share hold no database, so either may import them');

const CLIENT_FILES=['src/components/admin/class-management.tsx','src/components/admin/submit-button.tsx',
  'src/components/admin/toast-bus.ts','src/components/exams/marks-grid.tsx',
  'src/components/admin/send-sms-dialog.tsx','src/components/admin/routine-drawer.tsx',
  'src/components/admin/routine-master.tsx','src/components/admin/routine-daily.tsx',
  'src/components/admin/routine-tools.tsx','src/components/admin/center-exam-forms.tsx',
  'src/components/admin/sidebar.tsx'];
const IMPORT=/^\s*import\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm;
const resolveFrom=(from:string,spec:string):string|null=>{
  if(!spec.startsWith('.')&&!spec.startsWith('@/'))return null;      // a package: not this repo's rule
  const base=spec.startsWith('@/')?`src/${spec.slice(2)}`
    :`${from.split('/').slice(0,-1).join('/')}/${spec}`;
  const normal=base.replace(/\/\.\//g,'/');
  for(const candidate of [`${normal}.ts`,`${normal}.tsx`,`${normal}/index.ts`,`${normal}/index.tsx`])
    if(existsSync(candidate))return candidate;
  return existsSync(normal)?normal:null;
};
for(const entry of CLIENT_FILES){
  assert.ok(existsSync(entry),`${entry} exists`);
  const seen=new Set<string>(),offenders:string[]=[];
  const queue=[entry];
  while(queue.length&&seen.size<600){
    const file=queue.shift()!;
    if(seen.has(file))continue;
    seen.add(file);
    const text=read(file);
    if(file!==entry&&(/^\s*['"]use server['"]/m.test(text)||/^\s*import\s+['"]server-only['"]/m.test(text)
      ||/^\s*['"]server-only['"]/m.test(text)))continue;   // the bundle stops here
    /* Every import that is not `import type`, which the bundle never holds: a shape taken from a model
       file costs nothing in a browser, and calling it an offence would teach the next reader to ignore
       this rule the first time it cries. */
    const runtime=[...text.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm)]
      .map(match=>match[1]);
    if(runtime.some(spec=>spec==='mongoose'||spec.includes('/models/')||spec.startsWith('@/models/')))
      offenders.push(file);
    for(const match of text.matchAll(IMPORT)){
      const next=resolveFrom(file,match[1]);
      if(next&&!seen.has(next))queue.push(next);
    }
  }
  assert.deepEqual(offenders,[],
    `${entry} is a client component, and everything it imports lands in the browser bundle: `
    +`${offenders.join(', ')} hold a database`);
}

// ── 7. A "use server" file may only export async functions ───────────────────────────────────────
/**
 * The write side of the class board died in verification twice before this rule existed, and it died
 * before its own first line: a `'use server'` module that exports anything but an async function is
 * refused by the server at the moment the action is loaded — "A use server file can only export async
 * functions, found object" — so every call to any action in that file answers 500, the sheet hears
 * nothing, the route falls into its boundary, and the typecheck, the build and the server render all
 * stay green, because none of them loads the module the way an action call does. One dead re-export of
 * a plain object cost three runs; the rule below reads every `'use server'` file in `src/` and refuses
 * any export that is not an async function or a type.
 */
for(const file of walk('src')){
  const text=read(file);
  if(!/^\s*['"]use server['"]/.test(text))continue;
  const offenders=[...text.matchAll(/^export\s+(?!async function|type|interface)(.+)$/gm)]
    .map(match=>match[1].trim().slice(0,60));
  assert.deepEqual(offenders,[],
    `${file} is a "use server" module: the server loads it only when an action is called, and it `
    +`refuses to load a module that exports anything but async functions — ${offenders.join(', ')}`);
}

console.log(`Class and batch management: a class holds its own room, its shifts and its month, a batch `+
  `holds the class it runs in, the three shift boxes are all counted and a word that is not one of them `+
  `is dropped, an empty fee is "not decided" rather than free, an edit is refused when the class moved, `+
  `the session year never moves, assigning batches is total for one class, and the screen carries both `+
  `counts and the three ways in. The words and shapes the screen shares with its own server action hold `+
  `no database, and nothing a client component of this delivery imports — through every module between `+
  `— registers a model in the browser.`);
