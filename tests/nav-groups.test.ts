/**
 * G2 · The menu is the day's work first, and grouping moved nobody's permission.
 *
 * The admin menu was reorganised around what a centre manager actually does — money in, people called,
 * people admitted at the top; the website and the room's own settings at the bottom. Two things could
 * break while doing that, and neither is visible in a screenshot:
 *
 * · **A permission could move.** Who may see a screen lives in `permitted()`, and it is easy to "tidy"
 *   an item into a group whose neighbours are gated differently and never notice that a staff account
 *   just gained the cash desk or lost the visitor list. So every role's visible set is held against a
 *   frozen table here — the same table the authorization rules produced before the regrouping.
 * · **A screen could be orphaned.** A collapsed group hides its items from the sidebar's own text, and
 *   the funnel report is proved to sit beside the visitor list it counts (R3.18); a role with only two
 *   screens must find them in ONE group, or the group that opens on arrival shows half a menu.
 *
 * Also checked, because the sidebar paints them straight from the catalogues: every group and every item
 * has a word in both languages, and every destination is a route that exists — a menu item that 404s is
 * a door that opens onto a wall.
 */
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {navGroups,permitted} from '../src/components/admin/nav-items';
import bn from '../src/messages/bn.json';
import en from '../src/messages/en.json';

const items=navGroups.flatMap(group=>group.items.map(([href,key])=>({group:group.key,href,key:key as string})));
const keys=items.map(item=>item.key);

// ── 1. Five groups, in the order the day happens ───────────────────────────────────────────────────
assert.deepEqual(navGroups.map(group=>group.key),['daily','students','communication','reports','settings'],
  'the menu is five groups, and the day\'s work is the first of them');

const daily=items.filter(item=>item.group==='daily').map(item=>item.key);
for(const [key,why] of [['overview','the morning starts here'],['centerDailyCash','a fee is taken'],
  ['leads','the visitors are called'],['followUps','the promises due today are kept']] as const)
  assert.ok(daily.includes(key),`${key} is daily work — ${why}`);
assert.ok(daily.indexOf('overview')<daily.indexOf('centerDailyCash'),'the Overview leads the daily group');

// ── 2. One item, one place, one real destination ───────────────────────────────────────────────────
assert.equal(new Set(keys).size,keys.length,'no screen appears in the menu twice');
assert.equal(keys.length,51,`the menu still carries all 51 screens (found ${keys.length})`);
for(const {href,key} of items){
  const path=href.split('?')[0];
  const file=join('src','app','[locale]',...path.split('/').filter(Boolean),'page.tsx');
  assert.ok(existsSync(file),`${key} points at ${path}, which has no page (${file})`);
}

// ── 3. Screens that belong together are in one group ───────────────────────────────────────────────
const groupOf=(key:string):string|undefined=>items.find(item=>item.key===key)?.group;
for(const key of ['leads','followUps','leadsFunnel','importLeads'])
  assert.equal(groupOf(key),'daily',`${key} sits with the visitor list — a collapsed group hides its items`);
for(const key of ['academics','centerExams','modelTests','practice'])
  assert.equal(groupOf(key),'students',`${key} folds into the exams section of one group`);
/* R9: the timetable is a students screen, and the week and its day are never separated. */
for(const key of ['routineMaster','routineDaily'])
  assert.equal(groupOf(key),'students',`${key} sits with the batches and slots it is written for`);
assert.equal(groupOf('routineMaster'),groupOf('routineDaily'),
  'the week and the day that runs it stay in one group');
/* A role with a narrow menu must find all of it in the group that opens on arrival. */
assert.equal(groupOf('blog'),groupOf('sheets'),'a content editor\'s two screens share one group');
assert.equal(groupOf('centerExams'),groupOf('practice'),'an exam manager\'s screens share one group');

// ── 4. Who may see what, frozen ────────────────────────────────────────────────────────────────────
/* Derived from the authorization rules as they stood before the regrouping, and not to be edited
   without changing `permitted()` on purpose: the student screens, the CV bank and the grading scale are
   the administrator's and the owner's; the roles, audit, AI and backup doors are the owner's alone; SMS
   is not a staff spend; a content editor writes the blog and the public sheet; an exam manager runs
   exams; and a role the admin gate does not know sees no door at all. */
const ALL=keys;
const without=(...drop:string[]):string[]=>ALL.filter(key=>!drop.includes(key));
const expected:Record<string,string[]>={
  superadmin:ALL,
  admin:without('roles','audit','ai','backup'),
  staff:without('centerStudents','centerDailyCash','centerSheetView','centerDues','teacherCvs','gradingScale',
    'roles','audit','ai','backup','sms'),
  content_editor:['blog','sheets'],
  exam_manager:['centerExams','modelTests','practice'],
  teacher:[],
};
for(const [role,visible] of Object.entries(expected)){
  assert.deepEqual(ALL.filter(key=>permitted(key,role)).sort(),[...visible].sort(),
    `${role}'s menu changed — grouping is presentation, permission is not`);
}
/* And the gate holds the other way round: nothing a role may not see is offered to it anywhere. */
for(const {group,key} of items){
  assert.ok(group&&key,'every menu item carries a group and a key');
  assert.equal(permitted(key,'teacher'),false,'a role outside the admin gate is offered nothing');
}

// ── 5. Every word the sidebar paints exists, in both languages ─────────────────────────────────────
const missing:Record<string,string[]>={bn:[],en:[]};
for(const group of navGroups){
  for(const [catalogue,language] of [[bn,'bn'],[en,'en']] as const){
    const words=(catalogue as {adminRedesign:{groups:Record<string,string>;items:Record<string,string>}}).adminRedesign;
    if(!words.groups[group.key])missing[language].push(`groups.${group.key}`);
    for(const [,key] of group.items)if(!words.items[key])missing[language].push(`items.${key}`);
  }
}
assert.deepEqual(missing,{bn:[],en:[]},'every group and item label resolves in both catalogues');
for(const [language,catalogue] of [['bn',bn],['en',en]] as const){
  const groups=(catalogue as {adminRedesign:{groups:Record<string,string>}}).adminRedesign.groups;
  assert.deepEqual(Object.keys(groups).sort(),[...navGroups.map(group=>group.key)].sort(),
    `${language} carries exactly the five group labels the menu paints — no orphan word, no missing one`);
}
assert.equal(readFileSync('src/components/admin/nav-items.ts','utf8').includes('export function permitted'),true,
  'the permission gate is still the one place a menu item is allowed or refused');

console.log(`Admin menu: five operator groups (daily, students, communication, reports, settings), `+
  `${keys.length} screens each in one place and pointing at a real route, both catalogues complete, `+
  `and every role's visible set unchanged by the regrouping.`);
