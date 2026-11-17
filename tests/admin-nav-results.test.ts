/**
 * O1 · One door to exams and results, and the old addresses forward to it.
 *
 * The menu used to carry two ways to the same numbers: পরীক্ষা ও ফলাফল, which is the exam hub — every
 * exam, its marks grid, its results — and ফলাফল, whose own description was "results and academic
 * information". Two doors to one grade is how a centre ends up with two screens that disagree, and an
 * operator who learned the second one keeps walking through it after the first one changes.
 *
 * So this suite holds the shape of the menu and of the addresses behind it:
 *
 * · the legacy item is gone from the menu entirely — not hidden, not renamed, gone — and the exam hub is
 *   the ONE item under পরীক্ষা that leads to marks and results;
 * · the address the hub is known by (`/admin/exams`) and the address the legacy results screen had
 *   (`/admin/overview/results`) both exist and both forward, so a bookmark, a link in a message thread or
 *   a habit lands on the hub rather than on a wall;
 * · the sidebar folds the exam items by one list rather than by three copies of one array, so a screen
 *   cannot join the exam subject in one place and be left out of another;
 * · and the class and batch screen has its own door, gated exactly like the student screens it sits
 *   beside — a door that closes on the person who taps it is worse than no door.
 *
 * The permission tables themselves are `tests/nav-groups.test.ts`, which is updated in the same commit
 * as any change here; this suite is about the exam doors and the addresses behind them.
 */
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {navGroups,permitted} from '../src/components/admin/nav-items';
import bn from '../src/messages/bn.json';
import en from '../src/messages/en.json';

const read=(file:string):string=>readFileSync(file,'utf8');
const items=navGroups.flatMap(group=>group.items.map(([href,key])=>({group:group.key,href,key:key as string})));
const keys=items.map(item=>item.key);

// ── 1. The legacy results door is gone, and one door is left ──────────────────────────────────────
assert.equal(keys.includes('academics'),false,
  'the legacy "ফলাফল" item is no longer in the menu at all');
const examDoors=items.filter(item=>['centerExams','modelTests','practice','gradingScale'].includes(item.key));
const hub=items.filter(item=>item.key==='centerExams');
assert.equal(hub.length,1,'exactly one menu item leads to the exam hub');
assert.equal(hub[0].href,'/admin/center-exams','and it leads to the screen that holds every exam and its marks');
assert.equal(hub[0].group,'students','inside the students and academics group, beside the roll it grades');
assert.equal(examDoors.every(item=>item.group==='students'),true,
  'every exam screen is in that one group, so a collapsed group never hides half a subject');

const bnItems=(bn as {adminRedesign:{items:Record<string,string>}}).adminRedesign.items;
const enItems=(en as {adminRedesign:{items:Record<string,string>}}).adminRedesign.items;
assert.equal(bnItems.centerExams,'পরীক্ষা ও ফলাফল','the one door is named "পরীক্ষা ও ফলাফল" in Bangla');
assert.equal(enItems.centerExams,'Exams & results','and "Exams & results" in English');
const bnDescriptions=(bn as {adminRedesign:{examDesc:Record<string,string>}}).adminRedesign.examDesc;
assert.equal(bnDescriptions.academics,'ফলাফল ও একাডেমিক তথ্য দেখুন',
  'the description the brief names is the one the legacy item carried — it is the item that went, not the word');

// ── 2. The sidebar folds by one list ──────────────────────────────────────────────────────────────
const sidebar=read('src/components/admin/sidebar.tsx');
assert.ok(sidebar.includes("const EXAM_FOLD=['centerExams','modelTests','practice']"),
  'the exam fold is one list, and the legacy item is not in it');
assert.equal(/'academics'/.test(sidebar),false,
  'no copy of the old array survives in the sidebar to fold an item that is no longer there');
assert.equal((sidebar.match(/EXAM_FOLD\.includes\(key\)/g)||[]).length,4,
  'every place the sidebar paints, opens or filters the fold reads the same list — the items beside it, '
  +'the fold\'s own presence, whether it arrives open, and the items inside it');

// ── 3. The old addresses forward rather than 404 ─────────────────────────────────────────────────
const forwards:[file:string,from:string,to:string][]=[
  ['src/app/[locale]/admin/exams/page.tsx','/admin/exams','/admin/center-exams'],
  ['src/app/[locale]/admin/overview/results/page.tsx','/admin/overview/results','/admin/exams'],
];
for(const [file,from,to] of forwards){
  assert.ok(existsSync(file),`${from} exists as a route`);
  const text=read(file);
  assert.ok(text.includes(`redirect({href:'${to}',locale})`),
    `${from} forwards to ${to}, in the language the reader arrived in`);
  assert.equal(/export const dynamic='force-dynamic'/.test(text),true,
    `${from} is not cached into a stale forward`);
  assert.equal(/getTranslations|useTranslations/.test(text),false,
    `${from} paints no words of its own — it is a door, not a screen`);
}
/* And the hub itself is a real screen rather than another forward, or the chain would have no end. */
const hubPage=read('src/app/[locale]/admin/center-exams/page.tsx');
assert.equal(/redirect\(/.test(hubPage),false,'/admin/center-exams is the screen the forwards land on');

// ── 4. The class and batch screen has its own door, gated like the student screens ────────────────
const classDoor=items.filter(item=>item.key==='classes');
assert.equal(classDoor.length,1,'class and batch management is one menu item');
assert.equal(classDoor[0].href,'/admin/classes','at its own address');
assert.equal(classDoor[0].group,'students','under শিক্ষার্থী ও একাডেমিক, where the roll and the timetable are');
assert.ok(existsSync('src/app/[locale]/admin/classes/page.tsx'),'/admin/classes has a page');
for(const role of ['admin','superadmin'])
  assert.equal(permitted('classes',role),true,`${role} may open the class screen — it writes what a roll hangs from`);
for(const role of ['staff','exam_manager','content_editor','teacher'])
  assert.equal(permitted('classes',role),false,`${role} is not offered a door that would close on them`);
assert.equal(bnItems.classes,'শ্রেণি ও ব্যাচ','and the door is named in Bangla');
assert.equal(enItems.classes,'Classes and batches','and in English');

console.log(`Exam doors: the legacy "ফলাফল" item is gone from the menu, one item — পরীক্ষা ও ফলাফল — leads `+
  `to the exam hub, /admin/exams and /admin/overview/results both forward to it in the reader's own `+
  `language, the sidebar folds the exam items by one list, and the class and batch screen has its own `+
  `gated door at /admin/classes.`);
