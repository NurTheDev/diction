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
  {id:'R0.9',milestone:'R0',text:'Exams: role scope (exam_manager in, content_editor redirected), two subjects with Bangla digits, marks, total, A+ grade, rank and publication against the disposable database',bn:'পরীক্ষা: রোল, দুই বিষয়, নম্বর, মোট, গ্রেড, অবস্থান ও প্রকাশ (আলাদা টেস্ট ডাটাবেসে)',proof:{kind:'browser',ref:'tests/center-exams-browser.integration.ts'}},
  {id:'R0.10',milestone:'R0',text:'Workbook import: real XLSX preview (2 tabs / 17 students / ৳226400), decisions, draft save+load, CSV, no overflow at 360 and 1440',bn:'ওয়ার্কবুক ইমপোর্ট প্রিভিউ, সিদ্ধান্ত, খসড়া, CSV ও ৩৬০/১৪৪০ লেআউট',proof:{kind:'browser',ref:'tests/workbook-preview-browser.integration.ts'}},
  {id:'R0.11',milestone:'R0',text:'Screenshots captured at 360 px and 1440 px for the key public and admin pages',bn:'৩৬০ ও ১৪৪০ পিক্সেলে প্রধান পেজের স্ক্রিনশট',proof:{kind:'screens',ref:'screenshots'}},
  // ── R1 · delete, archive, restore, Recycle Bin ─────────────────────────────
  {id:'R1.1',milestone:'R1',text:'Recycle Bin engine: soft delete with a 30-day purge date, restore, delete blocked with real reference counts, and purge only after retention',bn:'রিসাইকেল বিন: ৩০ দিনে মুছে যাওয়া, ফেরত, রেফারেন্স থাকলে আটকে যাওয়া ও মেয়াদ শেষে পার্জ',proof:{kind:'unit',ref:'test:recycle:db'}},
  {id:'R1.2',milestone:'R1',text:'Staff role exists: creatable by super admin, sees admin lists, can archive but never delete, cannot open roles/audit/ai',bn:'স্টাফ রোল: আর্কাইভ করতে পারে, মুছে ফেলতে পারে না, রোল/অডিট/এআই দেখতে পারে না',proof:{kind:'unit',ref:'test:staff-role'}},
  {id:'R1.4',milestone:'R1',text:'Recycle Bin UI in the browser: ConfirmDialog names the item and says 30 days, delete + Undo, bulk select + delete + Undo, blocked delete shows the reference counts with a working Archive, delete + restore from the bin (type filter, search, days left), Delete forever needs the typed name and Super Admin, staff can archive/restore but never delete, no overflow at 360/768/1440',bn:'রিসাইকেল বিন ইউআই: নামসহ কনফার্ম ডায়ালগ, ডিলিট + আনডু, বাল্ক ডিলিট, রেফারেন্স থাকলে আটকে যায় ও আর্কাইভ করা যায়, বিন থেকে রিস্টোর, স্টাফ মুছতে পারে না',proof:{kind:'browser',ref:'tests/recycle-bin-ui.integration.ts'}},
  {id:'R1.5',milestone:'R1',text:'Daily scheduled job: CRON_SECRET bearer auth (401 when missing, wrong, short or non-Bearer), vercel.json schedules it once a day, expired rows purged and 12-month log trim proved live inside R1.1',bn:'দৈনিক শিডিউল জব: CRON_SECRET ছাড়া ৪০১, vercel.json-এ প্রতিদিনের শিডিউল, মেয়াদ শেষ রো মুছে যায় ও ১২ মাসের পুরনো লগ ছাঁটা হয়',proof:{kind:'unit',ref:'test:cron'}},
  {id:'R1.3',milestone:'R1',text:'Auto-hide invariant: every query shape (find, findOne, count, distinct, aggregate, bulkWrite, updates, populate) skips binned rows; payments, students, logs and snapshots can never be hidden; public routes revalidate on delete/restore/purge',bn:'অটো-হাইড নিয়ম: সব কোয়েরি আকৃতি বিন করা রো বাদ দেয়; ফি/শিক্ষার্থী/লগ কখনো লুকায় না; পাবলিক পেজ সঙ্গে সঙ্গে refresh হয়',proof:{kind:'unit',ref:'test:recycle:coverage'}},
];

export function milestones():string[]{return [...new Set(requirements.map(r=>r.milestone))]}

/** Requirements to report on: one milestone, or everything when milestone is 'all'. */
export function select(milestone:string):Requirement[]{
  return milestone==='all'?requirements:requirements.filter(r=>r.milestone.toLowerCase()===milestone.toLowerCase());
}

export function find(id:string):Requirement|undefined{return requirements.find(r=>r.id===id)}

/** Latest milestone in the registry — the default target for `npm run verify`. */
export function latestMilestone():string{const all=milestones();return all[all.length-1]}
