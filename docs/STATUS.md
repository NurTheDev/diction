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
requirement: PASS / FAIL / NOT TESTED and why).

Run **in this sandbox** on 2026-11-12 it reported **5 PASS, 0 FAIL, 6 NOT TESTED (INCOMPLETE)** — the
six unproven lines are all the ones that need the MongoDB download or the browser, and each says so.
The same command run **on GitHub Actions** (`.github/workflows/verify.yml`, which runs on every push
to this branch) reported **11 PASS, 0 FAIL, 0 NOT TESTED — PASS** in 132 s on 2026-11-12, with the
isolated replica set, the demo-admin sign-in, both browser flows and 26 screenshots at 360/1440 px
all demonstrated. That is the first complete end-to-end proof of R0; see §11.

**On the owner's machine (normal internet) the expected cold start is:**
`npm ci` → `npx playwright install chromium` (once) → `npm run test-mode` → open
`http://localhost:3000/bn/admin` → `demo-admin@example.test` / `DemoOnly-2026!`.
Step 5's first run downloads MongoDB (~90 MB) and may take several minutes.

This is an environment limitation of the agent sandbox, **not** a product defect: the same steps run
green on GitHub's runners (§11). To make it impossible to mistake for a product failure, the browser
tests now stop in ~1 s with a one-screen actionable message instead of minutes of retries and a raw
stack trace (`tests/helpers/env-preflight.ts`).

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
| Admin auth, roles (`superadmin`, `admin`, `staff`, `content_editor`, `exam_manager`), audit log | working | ran today (unit, incl. `tests/staff-role.test.ts`) + code read (`src/lib/admin/guard.ts`, `permitted()` in `nav-items.ts`). `staff` archives/hides but never deletes; delete is `requireAdmin` server-side. |
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
| Exams (create, subjects, marks, ranking, publish) | partial | ran today (grading/ranking unit) + **browser flow proven on GitHub Actions** (§11): create with two subjects → marks 80+40 → total 120/150 → A+ → rank → publish, plus role scope and 360/768/1440 layout. Writes gated by `CENTER_EXAM_WRITE_ENABLED` (off in production; `npm run verify` turns it on for the disposable database). Single class per screen, ≤500 students, no unpublish/correction, no teacher scoping, no SMS/portal/PDF → R5. |
| SMS | partial | A low-level BulkSMSBD adapter + segment estimator exist and are unit-tested, gated off. **No** queue, UI, templates UI, opt-out/quiet-hours, idempotency, logs page or balance → R2. Models `CenterSmsTemplate/Batch/Log` and `CenterSettings` already exist. |
| Visitor leads | **missing** | → R3. |
| Teacher CV bank | **missing** | → R4. |
| Delete / archive / Recycle Bin | **partial (R1 in progress)** | Engine landed and CI-verified: `deletedAt/deletedBy/purgeAt` on twelve schemas, `src/lib/admin/recycle.ts` (soft delete with 30-day purge date, restore, real reference counts, purge), a schema-level invariant that hides binned rows from every ordinary read/write, and the nine former hard deletes converted to binning (`requireAdmin`). `staff` role added (archive/hide, never delete). Owed in R1: Recycle Bin page, ConfirmDialog naming the item, 10 s Undo toast, bulk select, the daily purge job, and delete/archive controls for the remaining no-control types (`docs/R1-AUDIT.md` status line). |
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

`npm run verify` sets `CENTER_EXAM_WRITE_ENABLED=true` for the disposable test database only, so
verification demonstrates the exam flow instead of asserting a disabled button. No production
default was changed.

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

**R2** (see §12 for what R1 delivered and what it still owes). The R1 brief was:

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
| `npm run verify` orchestrator | working | ran end to end in this sandbox (32 unit suites PASS, build PASS, 6 requirements correctly NOT TESTED with reasons) **and complete on GitHub Actions: 11 PASS / 0 FAIL / 0 NOT TESTED** (§11) |
| `verify-report.md` rendering | working | ran today; `tests/verify-report.test.ts` proves one line per requirement and no PASS without evidence |
| `verify-output.zip` writer | working | ran today; round-tripped through `yauzl` with intact binary content |
| Requirement registry (`verify-plan.ts`) | working | 11 R0 requirements; the unit test asserts every entry points at a real script or test file |
| Screenshot pass (360/1440) | working | **blocked in this sandbox, proven on GitHub Actions**: 26 screenshots (13 pages × 360/1440) with no horizontal overflow — see §11 |
| `testDbName()` — attached tests use the app's database | working | new after the first CI run; asserted in `tests/center-data-mode.test.ts`, explained in `docs/STALE-TESTS.md` §7 |
| `README.md` steps for a non-technical person | working | new top section "Start here: verify this build in one command" + a failure/fix table |

## 9. সংক্ষেপে (owner summary)

- আজ যা যা পরীক্ষা করা হয়েছে: `npm ci`, টাইপচেক, ৩১টি ইউনিট টেস্ট এবং পূর্ণ প্রোডাকশন বিল্ড — সব পাস।
- এই স্যান্ডবক্স থেকে MongoDB ও ব্রাউজার ডাউনলোড করা যায় না, তাই `npm run test-mode` ও ব্রাউজার টেস্ট এখানে চালানো সম্ভব হয়নি। আপনার কম্পিউটারে (সাধারণ ইন্টারনেট) এগুলো চলবে; এটি প্রোজেক্টের সমস্যা নয়।
- পুরোনো ডকুমেন্টে যা "শেষ" লেখা ছিল, তার কয়েকটি আসলে কোডে নেই: মাস-শেষের স্বয়ংক্রিয় স্ন্যাপশট (cron), পুরোনো ফি রূপান্তর, পোর্টাল লিংক, "ভর্তি সম্পন্ন → শিক্ষার্থী", এবং বকেয়া তালিকার Excel/প্রিন্ট। বিস্তারিত §4-এ।
- তিনটি পুরোনো ব্রাউজার টেস্টের সমাধান হয়েছে: দুটি ঠিক করা, একটি অবসর দেওয়া — কারণসহ `docs/STALE-TESTS.md`-এ।
- নতুন: `npm run verify` — একটিমাত্র কমান্ডে ইউনিট টেস্ট, ব্রাউজার টেস্ট, ৩৬০/১৪৪০ স্ক্রিনশট এবং `verify-report.md` + `verify-output.zip` তৈরি হবে। এই স্যান্ডবক্সে: ৫টি PASS, ৬টি NOT TESTED (কারণসহ)। GitHub Actions-এ প্রতি পুশে একই কমান্ড চলে এবং শেষ রানে **১১টি-ই PASS** হয়েছে — আলাদা টেস্ট ডাটাবেস, লগইন, দুটি ব্রাউজার ফ্লো ও ২৬টি স্ক্রিনশট সহ (§11)।
- আপনার তিনটি সিদ্ধান্ত নোট করা হয়েছে (§6): ভেরিফিকেশন প্রোটোকল, নতুন `staff` রোল, এবং বাকি ফিচারগুলো নিজ নিজ মাইলস্টোনেই থাকবে।
- পরের ধাপ R1 (ডিলিট/আর্কাইভ/রিসাইকেল বিন) — শুরু করার আগে আপনার অনুমোদন চাই।

## 10. Security review of the repository (2026-11-12, owner request)

Scope: all 5 commits in history (`git rev-list --all`), every tracked blob, plus `.gitignore`.

**No secret was found.** Detail:

| Check | Result |
| --- | --- |
| Tracked `.env`-like files | Only `.env.example`. Its values are placeholders: `mongodb+srv://<db_username>:<db_password>@<cluster-host>/…`, and every API key line is empty. |
| Connection strings with credentials in history | One hit: `tests/atlas-check.integration.test.ts` uses the literal `SECRET_NEVER_PRINT_123` to prove the Atlas probe never prints credentials or URIs. A test fixture, not a secret. |
| Cloud provider / SaaS key shapes (`AKIA…`, `sk-…`, `ghp_…`, `github_pat_…`, `xox…`, `AIza…`, `re_…`, `cloudinary://`) | No hits. |
| Private keys (`BEGIN … PRIVATE KEY`), `*.pem`, `*.key` | No hits; now also git-ignored defensively. |
| Admin seeding | `scripts/seed.ts` reads `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from the environment and has no default password. |
| Hardcoded logins in source | Only the disposable test-mode demo admin (`demo-admin@example.test` / `DemoOnly-2026!`), created **after** test mode asserts the database is a local, isolated `dictioncoaching_test` instance, and printed only to that console. It never exists in a production database. |
| `.gitignore` | Already covered `node_modules`, `.next`, `.env*` (keeping `.env.example`), `*.tsbuildinfo`, `test-assets/`, `verify-output/`, `verify-output.zip`. Added: OS/editor noise, `*.pem`/`*.key`/`*.p12`/`.env*.local`, `*.log`, `.vercel/`, `playwright-report/`. |

**One thing to confirm with the owner (not a secret, but personal-data hygiene):** the committed
fixtures `tests/fixtures/Diction-Demo-Payment-Sheet.xlsx`, `synthetic-class-7.xlsx` and the demo CSVs
contain student-style names (for example "Rafi Ahmed", "Tasnim Akter") and phone numbers
(`01812345678`, `01912345678`). They are labelled demo/synthetic and the older docs state the data is
illustrative. If any of it came from the real sheet, say so and I will regenerate the fixtures with
obviously fake data — real student data must not live in a Git repository.

**No credential was ever asked for, echoed or stored in chat or code during this work.**

## 11. Continuous verification — the first full run on GitHub Actions (2026-11-12)

`.github/workflows/verify.yml` runs the owner's protocol on every push to this branch. GitHub's
runners can download what this sandbox cannot (MongoDB, Chromium), so run `43223729105` was the first
time R0 was verified **end to end** rather than partially.

First result (run `43223729105`): **10 PASS, 1 FAIL** of 11 requirements, 159 s.
After the fix below (run `43228385032`, commit `3660d5b`): **11 PASS, 0 FAIL, 0 NOT TESTED — PASS**,
132 s, Node 22.23.4. R0 is now demonstrated end to end on a real machine with a real browser.

Proven for the first time by that run:

| Requirement | Evidence from the runner |
| --- | --- |
| R0.4 isolated database | in-memory replica set at `mongodb://127.0.0.1:46629/?replicaSet=testset`, database `dictioncoaching_test`, with the real `MONGODB_URI` replaced by an invalid host |
| R0.5 app serves sign-in | `GET /api/auth/csrf` → 200 |
| R0.6 demo admin sign-in | signed in, `GET /bn/admin` → 200 with the session cookie |
| R0.10 workbook import browser flow | 2 tabs / 17 rows, raw ৳226400, class suggestions, bulk and per-row choices, draft save/load, CSV, 360/1440 layout |
| R0.11 screenshots | 26 images in `screenshots/r0` (13 pages × 360 px and 1440 px) |

The one FAIL, R0.9 (exams browser test):

```
locator.waitFor: Timeout 30000ms exceeded.
  - waiting for locator('h1').filter({ hasText: 'কেন্দ্রের পরীক্ষা ও ফল' }) to be visible
```

**Cause:** the test seeded its `exam_manager` user into `dictioncoaching` while the app serves
`dictioncoaching_test`, so the sign-in was rejected and the page redirected to `/bn/login`. A wrong
database name presents as a broken selector. Full analysis and the fix: `docs/STALE-TESTS.md` §7.

**Fix (commits `c812e59`, `a9c1684`):** test mode publishes `TEST_MONGO_DB`; `tests/helpers/env-preflight.ts` gained
`testDbName()`, used by both browser tests and the screenshot pass; the invariant is asserted in
`tests/center-data-mode.test.ts`; the exams test now fails immediately with the landing URL instead
of timing out; and verification enables the exam write gate for the disposable database so R0.9
demonstrates create → marks → total/grade → rank → publish rather than a disabled button.

The green run's R0.9 evidence line, verbatim: "exam_manager signed in, created an exam with two
subjects in Bangla digits, saved marks 80+40, total 120/150 graded A+, published, content_editor
redirected, no horizontal overflow at 360/768/1440 and no page errors — against the disposable test
database."

**Where the evidence lives:** the workflow commits `verify-report.md` and
`test-results/ci-latest/` (the report plus the last 400 lines of every step log) back to this
branch, because artifact and log download is blocked from this sandbox. `git pull` is enough to read
why a run failed.

## 12. R1 — delete, archive, restore, Recycle Bin (code complete, awaiting owner verification)

**Status:** all six build-order steps of `docs/R1-AUDIT.md` §E are delivered for the twelve
participating record types, and GitHub Actions run
[43258474938](https://github.com/NurTheDev/diction/actions/runs/43258474938) reported
**`PASS — 16 PASS, 0 FAIL, 0 NOT TESTED (of 16 requirements)`** in 145 s on Node 22.23.4
(2026-11-12). Nothing here counts as verified until the owner runs `npm run verify` and sends
`verify-output.zip` — see `docs/R1-START-HERE.md` for the click list.

| Piece | Status | Evidence |
| --- | --- | --- |
| Recycle fields on 12 schemas (`deletedAt/deletedBy/purgeAt`, partial `purgeAt` index) | working | R1.1, R1.3 |
| Auto-hide invariant: find, findOne, count, distinct, aggregate, bulkWrite, every update, populate | working | R1.3 (hook registration) + R1.1 (live aggregate/distinct/bulkWrite/populate) |
| Deliberate opt-outs: bin list, restore, purge, `{recycleAny:true}`; `estimatedDocumentCount` unfiltered | documented | `docs/R1-COVERAGE.md` §1 |
| Payments, students, logs, snapshots, SMS records, users can never be hidden | working | R1.3 (no `deletedAt` path exists on 12 such schemas) |
| Blocked delete with real reference counts, in the operator's language | working | R1.1 + R1.4 (`2 student(s) use this class`) |
| 30-day bin, restore, purge after retention, Cloudinary destroyed first | working | R1.1 |
| Recycle Bin page: type filter, search, days left, Restore, Delete forever (Super Admin, typed name) | working | R1.4 |
| ConfirmDialog names the item and says 30 days; 10-second Undo for single and bulk deletes | working | R1.4 |
| Bulk select + delete on the blog/notice/video/gallery and course lists | working | R1.4 |
| Archive floor for staff, offered automatically when a delete is blocked | working | R1.4 |
| `staff` role: list access + archive, never delete, never authoring, no roles/audit/ai | working | R1.2, R1.4 |
| Public pages, blog URLs and the sitemap stop serving a binned record immediately; revalidation on delete/restore/purge | working | R1.3 (route map) + R1.4 (public 404 then 200 after Undo) |
| Daily job `/api/admin/jobs/daily`: purge + 12-month log trim, `CRON_SECRET` bearer auth, `vercel.json` | working | R1.5 (contract) + R1.1 (live run) |
| Delete/archive controls for every participating kind (§E6 first wave) | working | R1.4 (sheets + content + classes) |
| Audit row per delete, restore, archive and purge | working | R1.1, R1.4 |

**Owed, stated plainly:**

1. Nine record types are still outside the engine and have no delete control: trial slots, trial
   bookings, admissions, contact messages, hero banners, teachers (faculty), portal accounts,
   legacy academic exams and model tests (§E6 second wave).
2. The media library card soft-deletes and names the file, but has no Undo button — restore is from
   the Recycle Bin page.
3. The daily job has not run on a real Vercel deployment; that needs the owner's project and a
   `CRON_SECRET` of at least 32 characters.
4. Two orphaned components (`center-import-preview.tsx`, `center-cash-form.tsx`) still await an
   owner ruling, and R0 is still untagged pending the owner's `verify-output.zip`.

**Two real defects the R1.4 browser test caught** (both fixed, both recorded in
`test-results/r1-verification.txt`): `purgeForeverItem` compared the typed name against a read the
auto-hide rule empties, so Delete forever could never succeed; and the Undo toast lived inside the
row it deleted, so the post-delete refresh unmounted the 10-second window. The toast now lives in a
layout-level host (`RecycleToastHost`).
