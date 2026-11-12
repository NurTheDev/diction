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
  {id:'R1.4',milestone:'R1',text:'Recycle Bin UI in the browser: ConfirmDialog names the item and says 30 days, delete + Undo, bulk select + delete + Undo, blocked delete shows the reference counts with a working Archive, delete + restore from the bin (type filter, search, days left), Delete forever needs the typed name and Super Admin, staff can archive/restore but never delete, the second-wave lists (slots, bookings, admissions, messages, faculty, hero, accounts, legacy exams, model tests) carry the same controls with reference-blocked deletes, no overflow at 360/768/1440',bn:'রিসাইকেল বিন ইউআই: নামসহ কনফার্ম ডায়ালগ, ডিলিট + আনডু, বাল্ক ডিলিট, রেফারেন্স থাকলে আটকে যায় ও আর্কাইভ করা যায়, বিন থেকে রিস্টোর, স্টাফ মুছতে পারে না',proof:{kind:'browser',ref:'tests/recycle-bin-ui.integration.ts'}},
  {id:'R1.6',milestone:'R1',text:'Social proof milestones: the ConfirmDialog names the milestone and states the 30-day rule, delete bins it inside the settings document, Undo and bin Restore bring it back with days left shown, saving the form never empties the bin, and the daily job purges milestones whose 30 days are up',bn:'সোশাল প্রুফ মাইলফলক: নামসহ ডায়ালগ ও ৩০ দিনের নিয়ম, ডিলিট বিনে রাখে, আনডু ও বিন রিস্টোর ফেরত আনে, ফর্ম সেভ বিন খালি করে না, ডেইলি জব মেয়াদ শেষে মুছে ফেলে',proof:{kind:'browser',ref:'tests/admin-controls-browser.integration.ts'}},
  {id:'R1.7',milestone:'R1',text:'Managed roles can be disabled as a whole: a disabled role loses every admin page at once (the guards read CenterSettings.disabledRoles), re-enabling restores access, super admins cannot switch off their own role, and every switch writes an audit row',bn:'ম্যানেজড রোল নিষ্ক্রিয় করা যায়: নিষ্ক্রিয় রোল সব অ্যাডমিন পেজ হারায়, আবার সক্রিয় করলে ফেরত পায়, নিজের রোল বন্ধ করা যায় না, প্রতিবার অডিট রো লেখে',proof:{kind:'browser',ref:'tests/admin-controls-browser.integration.ts'}},
  {id:'R1.5',milestone:'R1',text:'Daily scheduled job: CRON_SECRET bearer auth (401 when missing, wrong, short or non-Bearer), vercel.json schedules it once a day, expired rows purged, 12-month log trim and expired social-proof milestones proved live inside R1.1',bn:'দৈনিক শিডিউল জব: CRON_SECRET ছাড়া ৪০১, vercel.json-এ প্রতিদিনের শিডিউল, মেয়াদ শেষ রো মুছে যায় ও ১২ মাসের পুরনো লগ ছাঁটা হয়',proof:{kind:'unit',ref:'test:cron'}},
  {id:'R1.3',milestone:'R1',text:'Auto-hide invariant: every query shape (find, findOne, count, distinct, aggregate, bulkWrite, updates, populate) skips binned rows; payments, students, logs and snapshots can never be hidden; public routes revalidate on delete/restore/purge',bn:'অটো-হাইড নিয়ম: সব কোয়েরি আকৃতি বিন করা রো বাদ দেয়; ফি/শিক্ষার্থী/লগ কখনো লুকায় না; পাবলিক পেজ সঙ্গে সঙ্গে refresh হয়',proof:{kind:'unit',ref:'test:recycle:coverage'}},
  // ── R2 · SMS (BulkSMSBD) ───────────────────────────────────────────────────
  {id:'R2.1',milestone:'R2',text:'SMS provider adapter: BulkSMSBD\u2019s three documented endpoints and parameters are used exactly (smsapi with type=unicode for Bangla and text for ASCII, smsapimany for different messages to different numbers, getBalanceApi for the live balance), every published response code reads as a plain Bangla sentence, and the API key is validated, redacted and never returned, logged or sent to a browser; SMS_PROVIDER=mock is the default so a test run can never send a real message',bn:'এসএমএস প্রোভাইডার: BulkSMSBD-এর তিনটি ডকুমেন্টেড এন্ডপয়েন্ট ও প্যারামিটার হুবহু ব্যবহার হয়, বাংলা বার্তা unicode টাইপে যায়, প্রতিটি রেসপন্স কোড সহজ বাংলায় বোঝানো হয়, এপিআই কী কখনো ফেরত/লগ/ব্রাউজারে যায় না; ডিফল্ট mock',proof:{kind:'unit',ref:'test:sms:provider'}},
  {id:'R2.2',milestone:'R2',text:'SMS templates: the five default bodies match the spec wording byte-for-byte, variable chips substitute without inventing a value, an unknown chip stays visible so a typo is caught, and fee-relatedness plus the three auto-send keys are declared per template',bn:'এসএমএস টেমপ্লেট: পাঁচটি ডিফল্ট বার্তা স্পেকের লেখার সাথে হুবহু মিলে, ভেরিয়েবল চিপ মান বসায় কিন্তু বানিয়ে দেয় না, অজানা চিপ দৃশ্যমান থাকে, ফি-সংশ্লিষ্টতা ও অটো-সেন্ড কী প্রতি টেমপ্লেটে ঘোষিত',proof:{kind:'unit',ref:'test:sms:templates'}},
  {id:'R2.3',milestone:'R2',text:'Recipient rules: removed and opted-out students are never sent to, held students receive non-fee messages only, every accepted phone shape normalizes to 01XXXXXXXXX, each dropped number carries a reason in both languages, and siblings sharing a number can be grouped into one message with a summed total — a merge is refused when the amount or class is ambiguous',bn:'প্রাপক নিয়ম: সরানো ও অপ্ট-আউট শিক্ষার্থীকে কখনো পাঠানো হয় না, হোল্ডে থাকা শিক্ষার্থী কেবল নন-ফি বার্তা পায়, প্রতিটি গ্রহণযোগ্য নম্বর ০১XXXXXXXXX-এ নরমালাইজ হয়, প্রতিটি বাদ পড়া নম্বরের কারণ দুই ভাষায় দেখানো হয়, এক নম্বরের ভাইবোন এক বার্তা পায় (টাকার হিসাব অস্পষ্ট হলে নয়)',proof:{kind:'unit',ref:'test:sms:recipients'}},
  {id:'R2.4',milestone:'R2',text:'Quiet hours: the midnight-crossing 21:00–07:00 default and a same-day window are both evaluated in Dhaka time, invalid or empty settings disable quiet hours instead of blocking every send, and the queue flush time is computed exactly',bn:'কুয়ায়েট আওয়ার্স: ঢাকা সময়ে মধ্যরাত পার হওয়া ২১:০০–০৭:০০ উইন্ডো এবং একই দিনের উইন্ডো দুটোই সঠিকভাবে যাচাই হয়, ভুল বা খালি সেটিংস পাঠানো আটকায় না, কিউ ফ্লাশের সময় নিখুঁত',proof:{kind:'unit',ref:'test:sms:quiet'}},
  {id:'R2.5',milestone:'R2',text:'SMS sending against the disposable database: 500 recipients go out in five batches of at most 100 without timing out, a repeated requestId sends nothing a second time (a double-click or refresh is safe), every outcome is a durable log row carrying its own segments and cost, a 1005 is retried once while a 1007 is not, retry-failed re-sends only the failed rows, quiet hours queue the batch until the flush sends it, this month\u2019s totals are stored sums, and the API key appears in no stored row or returned payload',bn:'পাঠানো (আলাদা টেস্ট ডাটাবেসে): ৫০০ প্রাপক সর্বোচ্চ ১০০ করে পাঁচ ব্যাচে যায় ও টাইমআউট হয় না, একই requestId দুবার পাঠায় না, প্রতিটি ফলাফল সেগমেন্ট ও খরচসহ লগ রো হয়, ১০০৫ একবার রিট্রাই হয় কিন্তু ১০০৭ হয় না, কুয়ায়েট আওয়ার্সে কিউ হয়ে ফ্লাশে পাঠানো হয়, এপিআই কী কোথাও জমা হয় না',proof:{kind:'unit',ref:'test:sms:db'}},
];

export function milestones():string[]{return [...new Set(requirements.map(r=>r.milestone))]}

/** Requirements to report on: one milestone, or everything when milestone is 'all'. */
export function select(milestone:string):Requirement[]{
  return milestone==='all'?requirements:requirements.filter(r=>r.milestone.toLowerCase()===milestone.toLowerCase());
}

export function find(id:string):Requirement|undefined{return requirements.find(r=>r.id===id)}

/** Latest milestone in the registry — the default target for `npm run verify`. */
export function latestMilestone():string{const all=milestones();return all[all.length-1]}
