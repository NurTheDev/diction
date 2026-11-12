/**
 * Requirement registry behind `npm run verify`.
 *
 * One entry = one line in verify-report.md, marked PASS / FAIL / NOT TESTED with a reason.
 * Nothing is ever marked PASS on unit tests alone when the requirement says a browser or the
 * running app proves it — see the owner's verification protocol in docs/VERIFY.md.
 *
 * Add entries here as each milestone is built; the runner maps real results onto them.
 */
export type ProofKind='step'|'unit'|'browser'|'screens';

export type Requirement={
  /** Stable id, e.g. R1.4 — used in the report and in docs/STATUS.md. */
  id:string;
  /** Milestone the requirement belongs to, e.g. 'R1'. */
  milestone:string;
  /** What must be true, in plain English. */
  text:string;
  /** The same, in short Bangla. */
  bn:string;
  /** What decides the result. `ref` is a step name, an npm script, or a test file. */
  proof:{kind:ProofKind;ref:string};
};

/** Step names the orchestrator produces evidence for. */
export const STEP_REFS=['install','typecheck','build','database','serve','signin'] as const;

export const requirements:Requirement[]=[
  // ── R0 · stabilize and document ──────────────────────────────────────────────
  {id:'R0.1',milestone:'R0',text:'Dependencies install from the lock file (npm ci) and Node is >= 22.13',bn:'লক ফাইল থেকে প্যাকেজ ইনস্টল হয় এবং Node ২২.১৩+',proof:{kind:'step',ref:'install'}},
  {id:'R0.2',milestone:'R0',text:'TypeScript compiles with no errors (tsc --noEmit)',bn:'টাইপচেক-এ কোনো এরর নেই',proof:{kind:'step',ref:'typecheck'}},
  {id:'R0.3',milestone:'R0',text:'Production build of every route succeeds',bn:'সব রুটের প্রোডাকশন বিল্ড সফল',proof:{kind:'step',ref:'build'}},
  {id:'R0.4',milestone:'R0',text:'Isolated disposable test database starts and the real MONGODB_URI is ignored',bn:'আলাদা টেস্ট ডাটাবেস চালু হয়; আসল MONGODB_URI ব্যবহৃত হয় না',proof:{kind:'step',ref:'database'}},
  {id:'R0.5',milestone:'R0',text:'The test-mode app serves the admin sign-in page over HTTP',bn:'টেস্ট অ্যাপ অ্যাডমিন লগইন পেজ দেখায়',proof:{kind:'step',ref:'serve'}},
  {id:'R0.6',milestone:'R0',text:'The demo admin can sign in and reach the dashboard',bn:'ডেমো অ্যাডমিন লগইন করে ড্যাশবোর্ডে ঢুকতে পারে',proof:{kind:'step',ref:'signin'}},
  {id:'R0.7',milestone:'R0',text:'Every core unit suite passes (site, CMS, roles, fees, theme, privacy guards, verify harness)',bn:'সব মূল ইউনিট টেস্ট পাস',proof:{kind:'unit',ref:'test:unit:core'}},
  {id:'R0.8',milestone:'R0',text:'Every Center unit suite passes (month status, dues, import, exams, SMS adapter)',bn:'সব সেন্টার ইউনিট টেস্ট পাস',proof:{kind:'unit',ref:'test:center'}},
  {id:'R0.9',milestone:'R0',text:'Exams: role scope, default-off write gate, two subjects, marks, A+ ranking and publication',bn:'পরীক্ষা: রোল, রাইট গেট, নম্বর, গ্রেড ও প্রকাশ',proof:{kind:'browser',ref:'tests/center-exams-browser.integration.ts'}},
  {id:'R0.10',milestone:'R0',text:'Workbook import: real XLSX preview (2 tabs / 17 students / ৳226400), decisions, draft save+load, CSV, no overflow at 360 and 1440',bn:'ওয়ার্কবুক ইমপোর্ট প্রিভিউ, সিদ্ধান্ত, খসড়া, CSV ও ৩৬০/১৪৪০ লেআউট',proof:{kind:'browser',ref:'tests/workbook-preview-browser.integration.ts'}},
  {id:'R0.11',milestone:'R0',text:'Screenshots captured at 360 px and 1440 px for the key public and admin pages',bn:'৩৬০ ও ১৪৪০ পিক্সেলে প্রধান পেজের স্ক্রিনশট',proof:{kind:'screens',ref:'screenshots'}},
];

export function milestones():string[]{return [...new Set(requirements.map(r=>r.milestone))]}

/** Requirements to report on: one milestone, or everything when milestone is 'all'. */
export function select(milestone:string):Requirement[]{
  return milestone==='all'?requirements:requirements.filter(r=>r.milestone.toLowerCase()===milestone.toLowerCase());
}

export function find(id:string):Requirement|undefined{return requirements.find(r=>r.id===id)}

/** Latest milestone in the registry — the default target for `npm run verify`. */
export function latestMilestone():string{const all=milestones();return all[all.length-1]}
