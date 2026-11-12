# STATUS — Diction Coaching Center

Last updated: **2026-11-12** (R0 — stabilize and document, plus the owner's verification protocol).

**Status vocabulary (agreed with the owner):** *code complete, awaiting owner verification* until the
owner runs `npm run verify` and sends back an all-PASS report; *verified* only after that. Never
"done" on unit tests alone. Protocol: `docs/VERIFY.md`.
Legend: **working** (demonstrated) · **partial** (works with limits) · **missing** (not built) ·
**blocked** (built, but cannot be demonstrated in this environment).

Read `docs/SPEC.md` for requirements. Read this file before changing code: it says what is actually
true today, and what is only claimed by older documents.

---

## 1. Cold start, run today on a clean checkout

Machine: Debian 12, Node **v22.22.3**, npm 10.9.8, 3.9 GB RAM, 2 CPU. Repo at commit `aef9adf`.
Raw log: `test-results/r0-cold-start-20261112.txt`, summary: `test-results/r0-verification.txt`.

| # | Command | Result |
| --- | --- | --- |
| 1 | `npm ci` | **PASS** — clean install from `package-lock.json`. |
| 2 | `npm run typecheck` (`tsc --noEmit`) | **PASS** — 0 errors. |
| 3 | `npm test` | **PASS** — **31** unit suites (22 core + 9 Center). All green, ~15 s, no database needed. |
| 4 | `next build --webpack` (run by `test-mode`) | **PASS** — "✓ Compiled successfully in 50s", "✓ Generating static pages (173/173)". The old "build OOMs in the sandbox" caveat in `STALE-TESTS-REPORT.md` does **not** apply to a 3.9 GB machine. |
| 5 | `npm run test-mode` (whole command) | **BLOCKED at step 5 only** — it builds fine, then must download a MongoDB binary from `fastdl.mongodb.org`, which this sandbox's network allowlist refuses (`ECONNRESET`, 3 retries, exit 1). Nothing before that step failed. |
| 6 | Browser + Mongo integration tests (13 files) | **BLOCKED** — same reason, plus Playwright's Chromium CDN (`cdn.playwright.dev`) is refused. |

**The single command for the owner is now `npm run verify`** — it checks Node and dependencies, runs
every unit suite, installs the test browser if missing, starts the disposable database and the app,
signs in as the demo admin, takes 360 px and 1440 px screenshots of 13 pages, runs the browser tests,
and writes `verify-report.md` + `screenshots/<milestone>/` + `verify-output.zip` (one line per
requirement: PASS / FAIL / NOT TESTED and why). Run in this sandbox on 2026-11-12 it reported
**5 PASS, 0 FAIL, 6 NOT TESTED (INCOMPLETE)** — the six unproven lines are all the ones that need the
MongoDB download or the browser, and each says so.

**On the owner's machine (normal internet) the expected cold start is:**
`npm ci` → `npx playwright install chromium` (once) → `npm run test-mode` → open
`http://localhost:3000/bn/admin` → `demo-admin@example.test` / `DemoOnly-2026!`.
Step 5's first run downloads MongoDB (~90 MB) and may take several minutes.

This is an environment limitation of the agent sandbox, **not** a product defect. It is stated
plainly because it is the one thing R0 could not demonstrate end to end. To make it impossible to
mistake for a product failure, the browser tests now stop in ~1 s with a one-screen actionable
message instead of minutes of retries and a raw stack trace (`tests/helpers/env-preflight.ts`).

## 2. Verified working today (evidence: tests run in this session)

| Area | Evidence |
| --- | --- |
| TypeScript compiles; no type errors | `npm run typecheck` |
| Public site + CMS validation: intake, admin, academic, study, seed, editorial, model test, site content, site settings, course, recovery, hero, materials, fees (integer Taka), theme/contrast, portal notices, YouTube channel, achievements (+ consent guard, unsafe-query fail-closed), canonical origin/HTTPS, public sheets, practice CSV (Unicode) | 22 core unit suites |
| Center/fee logic: data-mode isolation, month status + phone normalization, due calculation (Dhaka cutoff, partial, hold, fee change, waiver, bounds), due CSV (formula escaping, Unicode, quoting), exam grading/absent/tie ranking, import review compiler (unresolved markers, red flags), single-sheet preview parser, whole-workbook review (real XLSX: 2 tabs, 17 students, raw ৳226400 reconciles, collision defaults, hold details), BulkSMSBD adapter (segment estimate, default-off gate, submitted≠delivered, no blind retry) | 9 Center unit suites — **newly wired into `npm test` today**; previously they were only runnable one by one and the SMS one needed a manual `NODE_OPTIONS` |
| Production build of the whole app | step 4 above |

## 3. Module status

"Basis" says what the status rests on: **ran today** = a test ran in this session;
**prior log** = recorded in `test-results/milestone-*.txt` by the previous agent, not re-run here;
**code read** = source inspected, no runnable demonstration.

| Module | Status | Basis / notes |
| --- | --- | --- |
| Test mode (isolated DB, demo admin, one command) | working · **blocked here** | code read + prior log. Cannot start in this sandbox (no MongoDB download). |
| Public website (bn/en, 173 routes) | working | ran today (build + unit suites). Live rendering not re-checked without a DB. |
| Admin auth, roles (`superadmin`, `admin`, `content_editor`, `exam_manager`), audit log | working | ran today (unit) + code read (`src/lib/admin/guard.ts`, `permitted()` in `nav-items.ts`). |
| Class groups, students, profile, active/hold/removed + restore | working | prior log (`milestone-1/2`), code read. `purgeAt` is stored but automatic purge is **missing** (R6). |
| Workbook import wizard (dry run, decisions, reconciliation, CSV, undo, idempotent) | working | prior log + ran today (parser/compiler unit suites). |
| Fee collection (search, 12 tiles, receipt, void with reason, history) | working | prior log + ran today (month-status, cash rules). **Browser coverage gap:** `center-cash-browser` was retired in R0 as a fourth stale test (`docs/STALE-TESTS.md` §6); the live screen is `center-daily-collection.tsx` and its server logic is still covered by `center-cash-batch` / `center-daily-cash`. Rewriting the browser test is owed in R1/R2. |
| Class/year sheet view + Excel export | working | prior log; `students/fees-grid/export/route.ts`. |
| Due list (live) + CSV export | **partial** | code read: class filter + CSV only. The M3-4 changelog also claims month filter, select-all, Excel and print/PDF — **those are not in the code**. |
| Month-end due snapshots — manual button | working | code read + prior log. Gated by `CENTER_DUE_SNAPSHOT_WRITE_ENABLED` (off by default) and a confirm checkbox (which §4 of the SPEC forbids for common tasks — review in R1/R6). |
| Month-end due snapshots — **scheduled endpoint** | **missing** | No `/api/admin/center/month-end-scheduler` route exists; `CRON_SECRET` and `DUE_SNAPSHOT_START_MONTH` appear only in `MILESTONE-3-4-START-HERE.md`, never in `src/`. No `vercel.json` either. |
| Legacy fee **review** (read-only suggestions) | working | code read: `admin/students/legacy-review/page.tsx`. |
| Legacy fee **conversion/migration** | **missing** | No conversion code (searched `poisha`, `convertLegacy`, `LegacyFee`). Only the experimental identity link (`CENTER_LEGACY_LINK_ENABLED`, off by default). |
| Portal linking for Center students/guardians | **missing** | `/parent/*` reads the legacy `Student`/`FeeInvoice`/`FeePayment` models only. No page outside `/admin` reads `CenterStudent` or `CenterPayment`. |
| "ভর্তি সম্পন্ন" creates a student | **missing** | `ভর্তি সম্পন্ন` is only a status **label** (`admin.enrolled`, `forms.statusEnrolled`). `CenterStudent` is created by the student form, the import batch or the workbook batch — never from an admission. |
| Exams (create, subjects, marks, ranking, publish) | partial | ran today (grading/ranking unit) + prior log. Writes gated by `CENTER_EXAM_WRITE_ENABLED` (off). Single class per screen, ≤500 students, no unpublish/correction, no teacher scoping, no SMS/portal/PDF → R5. |
| SMS | partial | A low-level BulkSMSBD adapter + segment estimator exist and are unit-tested, gated off. **No** queue, UI, templates UI, opt-out/quiet-hours, idempotency, logs page or balance → R2. Models `CenterSmsTemplate/Batch/Log` and `CenterSettings` already exist. |
| Visitor leads | **missing** | → R3. |
| Teacher CV bank | **missing** | → R4. |
| Delete / archive / Recycle Bin | **missing** | → R1. Today: `deleteEditorial`, `deleteCourse`, `deleteMaterial`, `deleteMedia`, `deletePortalNotice`, `deleteSiteContent` are **hard deletes** (`deleteOne`) with an audit entry — no soft delete, no restore, no Recycle Bin, no `deletedAt` field anywhere in `src/models` or `src/lib`. `deleteMedia` does block when the asset is referenced and destroys the Cloudinary file, which is the pattern R1 should generalise. |
| Retention/purge, reports, backup, database-usage card | missing / partial | `src/lib/center/database-usage.ts` exists; `admin/audit` exists; the rest → R6. |
| Deployment guide | partial | `DEPLOYMENT.md`, `ATLAS-SETUP.md`, `DASHBOARD-LOGIN.md` exist but describe the missing scheduler as delivered → R7. |

## 4. Documentation says / code does

Found in R0 by reading the code, not the docs. Each line is a correction to an earlier claim; the
older files are left in place as history, and this table is the authority.

1. `MILESTONE-3-4-CHANGELOG.txt` item 5 and `MILESTONE-3-4-START-HERE.md` §35 describe a
   `CRON_SECRET` scheduler endpoint and `DUE_SNAPSHOT_START_MONTH`. **Neither exists in code.**
2. `MILESTONE-3-4-CHANGELOG.txt` item 1 promises a due list with month filter, select-all, Excel and
   print/PDF. **The page has a class filter and a CSV link only.**
3. `MILESTONE-3-4-CHANGELOG.txt` item 2 promises legacy-fee conversion preserving poisha/method/
   reference. **Only review + an experimental identity link exist.**
4. `MILESTONE-3-4-CHANGELOG.txt` item 3 promises portal links with read-only access to linked
   students. **The parent portal still reads legacy fee models only.**
5. `MILESTONE-3-4-CHANGELOG.txt` item 4 promises "ভর্তি সম্পন্ন → student creation". **It is a status
   label only.**
6. `test-results/milestone-3-4-verification.txt` lines 19-20 report PASS for
   `center-legacy-migration-browser` and `center-portal-access-browser`. **Neither test file is in
   the repository**, so those two claims cannot be reproduced. (Consistent with items 3 and 4.)
7. `CENTER-DELIVERY-STATUS.md` says the production build OOMs in a 2 GB sandbox. On 3.9 GB it builds
   in 50 s — see §1 step 4. The memory-limited `--max-old-space-size=768` build config in
   `scripts/test-mode.ts` is still fine, but is no longer a workaround for a real constraint here.
8. Root `STATUS.md` was a Milestone-1 narrative, not a status file. It is preserved at
   `docs/history/MILESTONE-1-REVIEW.md`; this file is the status file from now on.
9. The older docs cite 360/1440 screenshots in `screenshots/workbook-import/` and
   `screenshots/workbook-preview-wip/`. **`screenshots/` is empty — 0 files.** That visual evidence
   was never shipped in this ZIP, so it cannot be re-checked. From R1 onwards every milestone must
   produce its own captures, committed to the repository.

## 5. Feature flags (all off by default)

`CENTER_DATA_MODE` (`test` = disposable DB) · `CENTER_EXAM_WRITE_ENABLED` ·
`CENTER_DUE_SNAPSHOT_WRITE_ENABLED` · `CENTER_LEGACY_LINK_ENABLED` · `CENTER_SMS_WRITE_ENABLED` ·
`ACHIEVEMENTS_ENABLED` · `DATA_COLLECTION_ENABLED` · `PASSWORD_RESET_ENABLED` · `PUBLIC_AI_ENABLED` ·
`PREVIEW_WITHOUT_SERVICES`. Secrets: `MONGODB_URI`, `NEXTAUTH_SECRET`, `CLOUDINARY_*`,
`RESEND_*`, `GEMINI_API_KEY`, `AI_*`, `YOUTUBE_DATA_API_KEY`, `BULKSMSBD_API_KEY`,
`BULKSMSBD_SENDER_ID`. All are listed in `.env.example`; none are committed.

Note against SPEC §4 ("no core feature hidden behind a disabled-by-default switch"): the exam write
gate, the snapshot gate and the SMS gate currently do exactly that. R2 and R5 must turn SMS and
exams into normal features (mock provider first), and the snapshot confirm checkbox should be
revisited in R6.

## 6. Owner decisions

Answered 2026-11-12:

1. **Verification protocol** — one command `npm run verify` that installs the browser if missing,
   starts the isolated database, runs unit + browser tests and takes 360/1440 screenshots; writes
   `verify-report.md` (one line per requirement: PASS / FAIL / NOT TESTED and why), saves
   `screenshots/<milestone>/` and bundles `verify-output.zip` to send back; README carries numbered
   copy-paste steps for a non-technical person; status words as above; a failing run comes back to me
   and I fix it and send a complete new ZIP. **Implemented — see `docs/VERIFY.md`.**
2. **Staff role for R1** — add a real `staff` role (archive/hide, no delete) rather than reusing
   `content_editor`. R1 must add it to the User model, the sidebar `permitted()` map and every
   server-side check.
3. **The five documented-but-missing features** — keep them in their scheduled milestones (R1 builds
   only the scheduler infrastructure its 30-day purge needs; portal linking stays R3/R5; legacy
   conversion R6; admission → student is the admissions row of the R1 audit). Nothing is dropped.

Still open:

4. **Two orphaned components**: `src/components/admin/center-import-preview.tsx` (15.7 KB) and
   `src/components/admin/center-cash-form.tsx` — a whole-tree sweep found these are the only admin
   components nothing imports. — nothing imports it
   since the single-sheet importer was replaced by the workbook review flow. Recommendation: keep it
   for now (harmless, git-tracked) and decide during the R1 audit, which lists every admin screen
   anyway. Say the word and I will delete it.

## 6.1 R1 audit (step 1 of R1) — complete

`docs/R1-AUDIT.md`: every destructive control that exists today (9 hard deletes, 8 soft/void), every
record type with no delete at all (18), the shared UI to reuse (`ConfirmSubmit` dialog, `ActionFeedback`
toast) and what must change in it, plus the R1 build order. Two extra findings: a fourth stale test
(retired) and a second orphaned component.

## 7. Next milestone

**R1 — delete/archive everywhere.** Starting facts already gathered: six legacy content modules
hard-delete today (`deleteEditorial`, `deleteCourse`, `deleteMaterial`, `deleteMedia`,
`deletePortalNotice`, `deleteSiteContent` — all `deleteOne`, no restore); no model has `deletedAt`;
there is no Recycle Bin page; `deleteMedia` already implements reference-blocking plus Cloudinary
destroy and is the pattern to generalise; roles are `superadmin`/`admin`/`content_editor`/
`exam_manager` and R1 adds **`staff`** (archive/hide, no delete) per §6.2. R1 must also create the
scheduled-job infrastructure its 30-day purge needs, since no scheduler exists at all (§4 item 1),
and every R1 requirement gets a line in `scripts/verify-plan.ts` before delivery.

## 8. Verification harness (new in R0)

| Piece | Status | Evidence |
| --- | --- | --- |
| `npm run verify` orchestrator | working · **partially blocked here** | ran end to end in this sandbox: 32 unit suites PASS, build PASS, 6 requirements correctly NOT TESTED with reasons, report + zip written |
| `verify-report.md` rendering | working | ran today; `tests/verify-report.test.ts` proves one line per requirement and no PASS without evidence |
| `verify-output.zip` writer | working | ran today; round-tripped through `yauzl` with intact binary content |
| Requirement registry (`verify-plan.ts`) | working | 11 R0 requirements; the unit test asserts every entry points at a real script or test file |
| Screenshot pass (360/1440) | **blocked here** | needs the browser + the running app; will run on the owner's machine |
| `README.md` steps for a non-technical person | working | new top section "Start here: verify this build in one command" + a failure/fix table |

## 9. সংক্ষেপে (owner summary)

- আজ যা যা পরীক্ষা করা হয়েছে: `npm ci`, টাইপচেক, ৩১টি ইউনিট টেস্ট এবং পূর্ণ প্রোডাকশন বিল্ড — সব পাস।
- এই স্যান্ডবক্স থেকে MongoDB ও ব্রাউজার ডাউনলোড করা যায় না, তাই `npm run test-mode` ও ব্রাউজার টেস্ট এখানে চালানো সম্ভব হয়নি। আপনার কম্পিউটারে (সাধারণ ইন্টারনেট) এগুলো চলবে; এটি প্রোজেক্টের সমস্যা নয়।
- পুরোনো ডকুমেন্টে যা "শেষ" লেখা ছিল, তার কয়েকটি আসলে কোডে নেই: মাস-শেষের স্বয়ংক্রিয় স্ন্যাপশট (cron), পুরোনো ফি রূপান্তর, পোর্টাল লিংক, "ভর্তি সম্পন্ন → শিক্ষার্থী", এবং বকেয়া তালিকার Excel/প্রিন্ট। বিস্তারিত §4-এ।
- তিনটি পুরোনো ব্রাউজার টেস্টের সমাধান হয়েছে: দুটি ঠিক করা, একটি অবসর দেওয়া — কারণসহ `docs/STALE-TESTS.md`-এ।
- নতুন: `npm run verify` — একটিমাত্র কমান্ডে ইউনিট টেস্ট, ব্রাউজার টেস্ট, ৩৬০/১৪৪০ স্ক্রিনশট এবং `verify-report.md` + `verify-output.zip` তৈরি হবে। এই স্যান্ডবক্সে চালিয়ে দেখা গেছে: ৫টি PASS, ০টি FAIL, ৬টি NOT TESTED (কারণসহ)।
- আপনার তিনটি সিদ্ধান্ত নোট করা হয়েছে (§6): ভেরিফিকেশন প্রোটোকল, নতুন `staff` রোল, এবং বাকি ফিচারগুলো নিজ নিজ মাইলস্টোনেই থাকবে।
- পরের ধাপ R1 (ডিলিট/আর্কাইভ/রিসাইকেল বিন) — শুরু করার আগে আপনার অনুমোদন চাই।
