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
| 4 | `next build --webpack` (run by `test-mode`) | **PASS** — "✓ Compiled successfully in 50s", "✓ Generating static pages (173/173)". The old "build OOMs in the sandbox" caveat in `HISTORY.md` does **not** apply to a 3.9 GB machine. |
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
| Month-end due snapshots — **scheduled endpoint** | **missing** | No `/api/admin/center/month-end-scheduler` route exists; `CRON_SECRET` and `DUE_SNAPSHOT_START_MONTH` appear only in `HISTORY.md`, never in `src/`. No `vercel.json` either. |
| Legacy fee **review** (read-only suggestions) | working | code read: `admin/students/legacy-review/page.tsx`. |
| Legacy fee **conversion/migration** | **missing** | No conversion code (searched `poisha`, `convertLegacy`, `LegacyFee`). Only the experimental identity link (`CENTER_LEGACY_LINK_ENABLED`, off by default). |
| Portal linking for Center students/guardians | **partial (R5 slice 2)** | There is still no stored link: `/dashboard/results` and `/parent/results` match the signed-in account's own `User.phone` against a `CenterStudent`'s `studentPhone`, `guardianPhone` or `altPhone`, exactly and never as a pattern, and read only published exam results (§19). Fees are still the legacy `Student`/`FeeInvoice`/`FeePayment` models, and no page outside `/admin` reads `CenterPayment`. |
| "ভর্তি সম্পন্ন" creates a student | **missing** | `ভর্তি সম্পন্ন` is only a status **label** (`admin.enrolled`, `forms.statusEnrolled`). `CenterStudent` is created by the student form, the import batch or the workbook batch — never from an admission. |
| Exams (create, subjects, marks, ranking, publish) | **working (R5 slice 1 + slice 2's result SMS)** | ran today (`tests/exam-rules.test.ts`, `tests/exam-grid.test.ts`, `tests/exam-result-message.test.ts`, `tests/staff-role.test.ts`, catalog) + the browser flow and the database flow are CI-proven (§17): one exam over several classes, a keyboard-first marks grid with autosave, Excel paste, CSV/XLSX import with a preview, absence, per-class positions with ties, publish **and unpublish**, saved grading scales with GPA points, teacher scoping by assigned class, and a teacher screen with no payment data in it. The write gate is **retired** — exam writes are a normal feature (§17). Slice 2's result SMS now sends the spec's own sentence with each child's own marks, total and position, and sends nothing at all to a family whose child was absent (§18). Slice 2 is **finished** (§19): publishing asks first, with a count computed the way the send counts; the student profile has a Results tab with the published exams and an SVG improvement trend that leaves an absence out of the line; the portal has `/dashboard/results` and `/parent/results`; and the report card is printable under `@media print`. |
| SMS | partial | A low-level BulkSMSBD adapter + segment estimator exist and are unit-tested, gated off. **No** queue, UI, templates UI, opt-out/quiet-hours, idempotency, logs page or balance → R2. Models `CenterSmsTemplate/Batch/Log` and `CenterSettings` already exist. |
| Visitor leads | **missing** | → R3. |
| Teacher CV bank | **missing** | → R4. |
| Delete / archive / Recycle Bin | **partial (R1 in progress)** | Engine landed and CI-verified: `deletedAt/deletedBy/purgeAt` on twelve schemas, `src/lib/admin/recycle.ts` (soft delete with 30-day purge date, restore, real reference counts, purge), a schema-level invariant that hides binned rows from every ordinary read/write, and the nine former hard deletes converted to binning (`requireAdmin`). `staff` role added (archive/hide, never delete). Owed in R1: Recycle Bin page, ConfirmDialog naming the item, 10 s Undo toast, bulk select, the daily purge job, and delete/archive controls for the remaining no-control types (`docs/R1-AUDIT.md` status line). |
| Retention/purge, reports, backup, database-usage card | missing / partial | `src/lib/center/database-usage.ts` exists; `admin/audit` exists; the rest → R6. |
| Deployment guide | partial | `DEPLOYMENT.md` and `SETUP.md` exist; older wording that described the missing scheduler as delivered is kept in `HISTORY.md` → R7. |

## 4. Documentation says / code does

Found in R0 by reading the code, not the docs. Each line is a correction to an earlier claim; the
older files are left in place as history, and this table is the authority.

1. `HISTORY.md` (Milestones 3–4 changelog) item 5 and the Milestones 3–4 start-here §35 describe a
   `CRON_SECRET` scheduler endpoint and `DUE_SNAPSHOT_START_MONTH`. **Neither exists in code.**
2. `HISTORY.md` (Milestones 3–4 changelog) item 1 promises a due list with month filter, select-all,
   Excel and print/PDF. **The page has a class filter and a CSV link only.**
3. `HISTORY.md` (Milestones 3–4 changelog) item 2 promises legacy-fee conversion preserving
   poisha/method/reference. **Only review + an experimental identity link exist.**
4. `HISTORY.md` (Milestones 3–4 changelog) item 3 promises portal links with read-only access to
   linked students. **The parent portal still reads legacy fee models only.**
5. `HISTORY.md` (Milestones 3–4 changelog) item 4 promises "ভর্তি সম্পন্ন → student creation". **It is
   a status label only.**
6. `test-results/milestone-3-4-verification.txt` lines 19-20 report PASS for
   `center-legacy-migration-browser` and `center-portal-access-browser`. **Neither test file is in
   the repository**, so those two claims cannot be reproduced. (Consistent with items 3 and 4.)
7. `HISTORY.md` (Center module delivery checkpoint) says the production build OOMs in a 2 GB sandbox. On 3.9 GB it builds
   in 50 s — see §1 step 4. `scripts/test-mode.ts` used to cap **both** the typecheck and the build at
   `--max-old-space-size=768`; that was fine until the repository outgrew it (see §14), and the two
   steps now have separate heaps.
8. The old root `STATUS.md` was a Milestone-1 narrative, not a status file. It is preserved in
   `HISTORY.md`; this file is the status file from now on.
9. The older docs cite 360/1440 screenshots in `screenshots/workbook-import/` and
   `screenshots/workbook-preview-wip/`. **`screenshots/` is empty — 0 files.** That visual evidence
   was never shipped in this ZIP, so it cannot be re-checked. From R1 onwards every milestone must
   produce its own captures, committed to the repository.

## 5. Feature flags (all off by default)

`CENTER_DATA_MODE` (`test` = disposable DB) ·
`CENTER_DUE_SNAPSHOT_WRITE_ENABLED` · `CENTER_LEGACY_LINK_ENABLED` · `CENTER_SMS_WRITE_ENABLED` ·
`ACHIEVEMENTS_ENABLED` · `DATA_COLLECTION_ENABLED` · `PASSWORD_RESET_ENABLED` · `PUBLIC_AI_ENABLED` ·
`PREVIEW_WITHOUT_SERVICES`. Secrets: `MONGODB_URI`, `NEXTAUTH_SECRET`, `CLOUDINARY_*`,
`RESEND_*`, `GEMINI_API_KEY`, `AI_*`, `YOUTUBE_DATA_API_KEY`, `BULKSMSBD_API_KEY`,
`BULKSMSBD_SENDER_ID`. All are listed in `.env.example`; none are committed.

Note against SPEC §4 ("no core feature hidden behind a disabled-by-default switch"): the exam write
gate, the snapshot gate and the SMS gate did exactly that. R2 made SMS a normal feature (mock
provider first), **R5 retired the exam write gate**, and the snapshot confirm checkbox is R6 work.

`CENTER_EXAM_WRITE_ENABLED` no longer exists in the code. Exams are written in normal mode and
authorization is by role and by the class groups a teacher is assigned to
(`src/lib/exams/exam-scope.ts`), so `npm run verify` demonstrates the same flow the owner gets:
create → marks → grade, point and position → publish. The name survives in `.env.example` only as a
note for anybody holding an old `.env`.

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

**Second wave of §E6 (commit `d014f67`):** the nine record types that had no destructive control
at all — trial slots, trial bookings, admissions, contact messages, hero banners, teacher profiles,
portal accounts, legacy academic exams and model tests — joined the engine, so 21 schemas now carry
the bin fields and 15 money/audit/student types are asserted never-hidden. Reference blocks refuse
the deletes that would orphan history (booked trials, converted admissions, saved results or
attempts, staff-role or student-linked accounts), and the media card raises the same layout-level
Undo toast as every other delete. `R1.4` grew the matching browser flows.

**Owed, stated plainly:**

1. Testimonials / social proof still have no delete or archive control, and managed roles still
   need a disable path (`docs/R1-AUDIT.md` §B).
2. The daily job has not run on a real Vercel deployment. Owner decision 2026-11-12: that first
   real run is a **go-live checklist item in R7** (`docs/SPEC.md` → R7 → go-live checklist), not an
   R1 gate.
3. Two orphaned components (`center-import-preview.tsx`, `center-cash-form.tsx`) still await an
   owner ruling, and R0 is still untagged pending the owner's `verify-output.zip`.

**Two real defects the R1.4 browser test caught** (both fixed, both recorded in
`test-results/r1-verification.txt`): `purgeForeverItem` compared the typed name against a read the
auto-hide rule empties, so Delete forever could never succeed; and the Undo toast lived inside the
row it deleted, so the post-delete refresh unmounted the 10-second window. The toast now lives in a
layout-level host (`RecycleToastHost`).

## 13. R2 — SMS (BulkSMSBD) (code complete, real provider still OFF)

Owner instruction of 2026-11-12: **"start r2 now"**. R2 was built in three waves, each proven in CI
before the next one started; `docs/R2-START-HERE.md` is the operator guide and
`docs/R2-COVERAGE.md` answers §R2 sentence by sentence, and `docs/SMS-GOLD-LIVE.md` is the go-live
checklist for switching the real provider on.

**What exists:** the provider contract (BulkSMSBD's documented endpoints, Unicode for Bangla, every
response code in Bangla, credentials server-only and redacted, `SMS_PROVIDER=mock` by default so
nothing is sent); the six template bodies byte for byte with editable overrides; the recipient rules
(removed and opted-out never contacted, held students excluded from fee messages only, siblings
merged into one message with the summed total, phones normalized and deduped, one accurate skip
reason per student); quiet hours in Asia/Dhaka with queueing and a flush; the send engine (batches of
100, `insertMany` log rows carrying their own segments and cost, `requestId` idempotency, 1005-only
auto-retry, explicit retry of failed rows); `/[locale]/admin/sms` (connection, balance, this month's
stored cost, settings with auto-send OFF by default, test message to your own number, templates,
batches, filtered history); **one** reusable `SendSmsDialog` with the spec's four steps, opened from
the due list, a student profile, the student list's bulk action, the payment success screen and the
SMS page; and the three auto-sends wired behind their toggles, plus a new 07:05 Asia/Dhaka flush job.

**Requirements:** R2.1–R2.9 in `scripts/verify-plan.ts` (27 in total). Green runs: 43296844437
(wave A, 23 PASS), 43303024575 (wave B1, 24 PASS), 43362581393 (wave B2, 26 PASS — all 26
requirements then in the registry) and **43374490721 (the follow-up, 27 PASS — all 27 requirements,
0 FAIL, 0 NOT TESTED)**, whose evidence is in `test-results/ci-latest/` at `4fe49db`.

**R2 follow-up (the owner's two requests, before the real provider goes on):** an *Automatic SMS
problems* card on the SMS page and the Overview, and `docs/SMS-GOLD-LIVE.md`. The card exists because
the rule that keeps a saved payment safe also made a failure invisible — all three callers swallow the
error on purpose, so a send that did not go out was a console line nobody reads while the toggle looked
on. `CenterSmsAutoProblem` now stores one open row per natural key with the trigger, a plain Bangla
sentence for the cause (the gateway's own meaning for its code, credentials scrubbed), the receipt or
class it was for, the attempt count and the context needed to run again; the card shows the count, the
last failure and a Retry button, and renders nothing at all when nothing is wrong. Retry re-sends only a
refused batch's failed rows, or runs the whole automatic send again under a fresh request id when no
batch was ever created, then resolves the row against the admin who clicked and audits it
(`sms.autoretry`). A toggle that is off, a class with nobody overdue and a message queued for quiet
hours are not problems and are never recorded. Requirement **R2.9**
(`tests/sms-auto-problem.integration.ts`, `test:sms:problem`) proves it against the disposable database,
including that the payment is saved first and stays saved. Its evidence: run **43374490721** on commit
`3dca7ef`, all PASS, with the suite's own claim line in
`test-results/ci-latest/logs/unit-test-sms-problem.txt`.

**Two real defects wave B2's own suites caught, both now fixed:** a shared guardian number was never
merged, because sibling totals are localized (`৩০০০`) and the sum was parsed with `Number()`, which
made every sibling pair look ambiguous and sent one guardian two messages instead of one honest total;
and every automatic send failed `CenterSmsBatch` validation, because `createdBy` was required and a job
is not a user — silently, since all three callers are best-effort. Batches now carry a `trigger`
(`manual` / `auto_receipt` / `auto_due` / `auto_result`) and `createdBy` is optional.

**Owed, stated plainly:**

1. **The real provider is OFF.** Per §R2 it goes on only after the owner approves the mock version,
   and then exactly one test message to their own number. BulkSMSBD IP whitelisting must be disabled
   for a serverless host first, or every send answers `1032`.
2. **Visitors and Teacher CVs are not dialog entry points yet** — R3 (`Lead`) and R4
   (`TeacherCandidate`) own those screens. The dialog is source-driven: they add a source kind in
   `src/lib/center/sms-source.ts` and render the same component.
3. **`pending_reminder`** stays in the catalog and editable, but is not in the picker until the
   optional "include current-month PENDING" switch exists on the due list.
4. **Delivery reports:** `202` is reported as *submitted*, never as delivered — the documented API
   has no DLR callback.
5. Both cron entries still need a **real Vercel run**, which remains a go-live checklist item (R7).

---

## 14. R3 — Visitor leads: wave A foundations + the wave-B rule layer (no screens yet)

Started after the owner accepted R2 and asked for R3 in this order: **wave A foundations, wave B
screens, wave C the import wizard**, all inside R3. Wave A is the parts that carry no UI, so every rule
is provable on its own before a screen is built on top of it.

**What exists:** `src/models/Lead.ts` (every field the brief lists, plus stored `flags[]`, a sticky
`doNotContact`, a day-string `nextFollowUp`, sibling `familyKey`, conversion links and
`importSource`/`importBatch` for the wizard); four pure modules under `src/lib/leads/` — `vocab.ts`
(the vocabulary and the three standing rules), `lead-date.ts` (day-first dates, refusals, suspicious
years), `lead-phone.ts` (two numbers in a cell, short numbers flagged, the `tel:`/`wa.me` hrefs and the
log mask), `lead-class.ts` + `lead-columns.ts` (Roman/Bangla/"New 9"/SSC-HSC classes, and the column
value and header lookups); and `lead` registered in the Recycle Bin (22 bin schemas now), named **ভিজিটর
লিড / Visitor lead**, deliberately not archivable, and reference-blocked once converted.

**The three standing rules, because they shape every wave that follows:**

1. *"Do not contact" is sticky* — a status **and** a boolean, and moving the status back does not clear
   it. `canContact()` is the one gate; `CONTACTABLE_LEAD_FILTER` is the same rule as a query, so a bulk
   SMS cannot drift from it.
2. *A number is never in a URL this app builds, an audit target or a log line.* A phone-shaped search —
   in Bangla digits too — is refused as a URL parameter and posted instead; the only hrefs carrying a
   number are the `tel:` and `wa.me` destinations the brief requires, built in one place, third-party,
   never logged. Logs get `maskPhone()`.
3. *A follow-up is a day, not an instant* — `YYYY-MM-DD` in Asia/Dhaka, so "today's follow-ups" and the
   overdue count are one range query with no timezone arithmetic.

And the rule behind all the parsing: **never guess.** A doubtful date, a short number or an unreadable
class is flagged with the text exactly as written kept beside it; a suspicious year gets a *suggested*
fix that nothing applies by itself.

**Wave B opened with its rule layer,** `src/lib/leads/leads.ts` (R3.6, `tests/lead-rules.integration.ts`)
— the decisions a screen cannot make on its own, and after it the only module besides the model that
queries `Lead`. It writes a lead from a quick-add or from a cleaned sheet row (refusals, never repairs);
INHERITS the family key from the lead that already holds a number and merges two families one row turns
out to bridge; refuses a phone-shaped search at the query layer using the very function that refuses to
put one in a URL; answers "today's follow-ups" plus the overdue count and the drawer's payload in one
call each; keeps `doNotContact` sticky and un-overridable in a bulk-SMS selection while reporting how many
leads that selection excluded; keeps numbers out of every error message, duplicate report and audit
target; and counts an `importBatch` so one file cannot be imported twice. Detail in
`docs/R3-COVERAGE.md` §6.

**Requirements:** R3.1–R3.6 in `scripts/verify-plan.ts` (33 in total across R0–R3). Suites:
`test:lead:vocab`, `test:lead:date`, `test:lead:phone`, `test:lead:class` (pure), `test:lead:db` and
`test:lead:rules` (disposable database). Coverage written point by point in `docs/R3-COVERAGE.md`,
including §7, which states what is still not done. **Wave A is CI-proven at 32/32** (run 43381282853,
evidence `4e6473c`) and **R3.6 at 33/33** (run 43385394912 on `494dbbd`, evidence `49c01de`) — the
report reads `PASS — 33 PASS, 0 FAIL, 0 NOT TESTED`, with `unit-test-lead-rules.txt` exit 0 in
`test-results/ci-latest/logs/`.

**Three defects the two suites caught between them, worth keeping** — all three would have shipped
silently, and none was found by reading code:

**One defect R3.5 caught in itself:** its first green-capable run failed on the family key
(`fam:01711000041` where `fam:01712817090` was expected) because the suite created a sibling with
`familyKeyFromPhones()` over the SIBLING'S OWN numbers and then asserted it matched the first lead's. The
assertion was wrong and the catch was the useful part: it pinned the rule `leads.ts` now implements —
inherit the key from an indexed lookup, never recompute it, or one family splits in two by typing order.

**R3.6 caught an empty report that looked like good news.** `duplicatePhoneGroups()` filtered its
`$group` with `{rows:{$gte:2}}`, which on an array field asks whether any ELEMENT is `>= 2` — the
elements are documents, so the match never succeeded and the "siblings sharing a number" report came
back empty. An empty duplicate report is indistinguishable from "no duplicates", so no screen, no
operator and no other test would ever have complained. It is `$expr` with `$size` now, with a comment
saying why the shorter form is wrong.

**And a CI-infrastructure trap that costs a run every time it is hit:** the DB suites start with
`// @ts-nocheck`, which hides SYNTAX from `tsc` as well as types. The first R3.6 run failed with an
esbuild `TransformError` — four `await`s sitting inside `.some(row => …)` callbacks — and `npm run
verify` reported it as a requirement failure with no assertion to read. After touching a `@ts-nocheck`
file, parse it before pushing: `./node_modules/.bin/esbuild tests/<file> --loader:.ts=ts
--outfile=/dev/null`. Every file in `tests/` passes that gate now.

**One CI infrastructure fix this wave forced:** the first wave-A run (43379896360) came back
**INCOMPLETE — 14 PASS, 0 FAIL, 18 NOT TESTED**, and nothing had failed. `scripts/test-mode.ts` capped
the whole-program typecheck and the build at the same `--max-old-space-size=768`; the typecheck ran out
of memory (`FATAL ERROR: Ineffective mark-compacts near heap limit`), the test server never started, and
every requirement that needs the app or the disposable database was reported NOT TESTED. The typecheck
now gets 4096 MB and the build 2048 MB, with a comment saying why they must not be collapsed back into
one — a whole-program `tsc` grows with the repository, and R3 has two more waves to add.

**Not started, by design:** the sidebar group **ভিজিটর**, quick-add, the list with its filters and
inline status, the detail drawer, the Overview "Today's follow-ups" widget, the number-search box that
posts (the action and the rule layer exist; the screen does not), duplicate detection with
sibling/merge, the lead entry point for `SendSmsDialog`, the import wizard, the funnel reports and CSV
export, and `docs/R3-START-HERE.md`. Those are the rest of wave B and wave C.

## 15. Two owner requirements added on 2026-11-13, before wave B's screens

**1. CI is strict: a green check now means every requirement was proven.** `npm run verify` used to exit
non-zero only when something FAILED, so an INCOMPLETE report — nothing failed, some things never ran —
produced a green GitHub check. That is not a hypothetical: it is exactly what wave A's first run did
(14 PASS, 0 FAIL, 18 NOT TESTED). The workflow now sets `VERIFY_STRICT=1`, `exitCodeFor()` in
`scripts/verify-report.ts` fails on a single NOT TESTED requirement, and a second step re-reads
`verify-report.md` and rejects anything but a `**PASS**` Result line with `0 NOT TESTED` — independent
of the exit code, with the evidence steps still on `always()` so a red run commits the report that
explains it. Local runs keep the old behaviour deliberately (`--skip-app`, or a machine with no MongoDB
and no browser, still exits 0 with an honest INCOMPLETE report), because a person reads the report and
CI reads the exit code. Documented in `docs/VERIFY.md`.

**2. Staff can search the Visitors list by number — and the number never travels in a URL, a log or an
analytics event.** Implemented as `phoneSearchDigits()` (reading) in `src/lib/leads/lead-phone.ts`,
`searchLeadsByPhone()` (matching) in `src/lib/leads/leads.ts` and `searchLeadsByNumber()` (the door, a
guarded server action) in `src/actions/leads.ts`; proven by `tests/lead-phone-search.integration.ts` as
**R3.7** (registry 34) with the reading rules also pinned inside R3.3's pure suite.

Every spelling finds the same lead: typed digits, no leading zero, Bangla digits, `+88`, `0088`, dashes,
spaces, brackets, a four-digit fragment, a fragment from the middle, either number of a lead holding two,
and a number stored behind a label (`বাবা ০১৭১২৮১৭০৯০`). Under four digits is refused in Bangla that
counts the digits without quoting them.

The privacy half is asserted, not promised: console output is captured across every search and holds no
fixture number in ASCII or Bangla; every audit target is a mask (`****` below eight digits, because the
last four of a mobile number ARE the number); the GET path stays shut — `leadListQuery()` builds nothing
and `listLeads()` applies nothing for a digit run of `PHONE_SEARCH_MIN_DIGITS` or more, the two
thresholds tied to one constant so they cannot drift, while names, schools and `V-2026-0001` stay
shareable; the only hrefs carrying a number are the `tel:` and `wa.me` destinations the brief requires;
the action exports only async functions, builds no href, reads no query parameter and logs an error
*name* rather than a value; and the suite scans all of `src/` for fourteen tracking globals and asserts
zero matches, so if analytics is ever added the test fails and asks whether it can see this search.

A search IS audited (`lead.phone-search`, mask as the target): looking a parent up by number is worth
accounting for, and the digits are not the account.

## 16. R3 wave B2 — the Visitors screens (R3.8), code complete and awaiting the owner's layout review

The rule layer now has a face. Six files render it and one browser suite proves it:

- `src/app/[locale]/admin/leads/page.tsx` — the list: date, visitor (guardian, id, up to two doubts),
  class as read plus school, the number **as a mask** with Call and WhatsApp, status, follow-up day,
  last note, and the row's controls. Twenty a page, status chips, filters in a collapsed `<details>`.
- `src/app/[locale]/admin/leads/[id]/page.tsx` — one lead inline, addressed by Mongo id **or** by
  `V-2026-0007` (`leadDetailByKey()`), so a link from an audit row or a printed sheet works.
- `src/components/admin/leads-ui.tsx` — quick-add, the search box, the row controls and the drawer.
- `src/components/admin/lead-follow-ups.tsx` — "আজকের ফলো-আপ" on the Overview: today's count and the
  overdue count as two numbers, the six nearest leads, and the same row controls.
- `src/lib/leads/lead-ui.ts` — the only bridge from the rule layer to a component: labels, badge
  colours, the form-state shape, and `rowView()`, which takes three things out on the way (see below).
- `src/actions/leads.ts` — six guarded actions: quick-add, status, follow-up, note, lift the contact
  block, load a drawer's contents. Plus the search from R3.7. Still exports only async functions.
- `nav-items.ts` gained a sixth group (**ভিজিটর** / "Admissions & leads") with Visitors and Follow-ups,
  and on a Visitors screen the mobile bottom bar's plus becomes "নতুন ভিজিটর" → `?new=1`.

**The owner's four conditions, met:** one tap to quick-add (the bottom bar's plus on any `/admin/leads`
screen, 56 px tall, bottom bar still exactly four targets); Enter saves (no textarea anywhere in
quick-add, so the browser's own submit is the shortcut) and the panel clears itself for the next
visitor; every control is an existing 44 px admin class; above the list there are two closed buttons,
the chips and a collapsed filter — nothing else.

**What a screen may not carry.** `rowView()` strips `familyKey` (it IS the smallest number of a family
with `fam:` in front), a phone's `original` (the number as written) and a flag's `original` (a raw cell
can hold a second valid number). The browser gets the mask and the `tel:`/`wa.me` destinations the brief
requires. R3.8 asserts it against the served HTML: strip those two hrefs and no fixture number appears
anywhere in the document — not in text, not in an attribute, not in the flight payload.

**No rule moved into the UI.** The five follow-up buttons send a key, never a date; `nextFollowUpDay()`
still computes the Dhaka day, so the screens and the daily cron job cannot disagree. Status changes go
through `updateLeadStatus()`, which still owns "do not contact" being sticky; lifting the block is its
own button and its own action. `leads.ts` gained exactly two functions for these screens
(`leadDetailByKey`, `leadStatusCounts`) and pages still never query `Lead`.

**One search box, two destinations.** A name, school or id becomes a shareable `?q=`; anything
number-shaped is refused by the same `leadListQuery()` that builds the href and is posted to
`searchLeadsByNumber()` instead. A number pasted straight into the address bar is refused by the page
and the whole list is rendered with an explanation, rather than being quietly searched. The box asks the
wider question — "did a human type a number?" rather than "may this travel in a URL?" — so two digits get
the number rule's own answer ("at least four digits") instead of a word search that comes back empty and
reads as *no such visitor*. The reading of "typed a number" is one
function — `isNumberAttempt()` in `src/lib/leads/lead-phone.ts`, importable from a client component —
asked by the box, by the URL builder and by the number search itself; R3-COVERAGE rule 2 records why it
is not written twice. Both thresholds are asserted in R3.1 and neither moved.

**Proof:** `tests/lead-screens-browser.integration.ts` (**R3.8**, registry 35) drives all five screens
as an admin, a staff account and a content editor, reads every write back from the database, measures
horizontal overflow at 360 px on each screen, and writes the eleven review screenshots into
`screenshots/r3/`. `tests/staff-role.test.ts` pins the two new nav keys for all five roles.
`scripts/verify-screens.ts` also photographs `/bn/admin/leads`, `?new=1` and `?followUp=today` for
R0.11. Operator guide: `docs/R3-START-HERE.md`.

**Since this wave, stated plainly:** the visitor SMS entry point (R3.9) and the duplicate-phone
"add as sibling / merge" decision (R3.10) both landed with their own registry rows and screenshots in
`screenshots/r3/`, and the owner's two decisions of 2026-11-12 landed as **R3.11** (a staff account may
send the visitor thank-you to a row or a selection, through the same dialog, with no custom text and no
send-to-all, under a per-user daily ceiling written into SMS settings) and **R3.12** (a staff Overview is
the follow-up panel — today's count and the overdue count — and none of the owner's other widgets). Both
are described in `docs/R3-COVERAGE.md` §12 and photographed in `screenshots/r3/`.

**Since that, the first of the three owed items landed (R3.13, R3.14):** the Visitors drawer now carries
the three hand-offs — **convert to admission**, **book a trial** and **mark not interested**, the last
only with a reason, because a status that closes a promise without saying why is a row nobody can work
afterwards. Each writes its intake row and moves the lead in one transaction, takes the number off the
lead's own record rather than off a form, mints the intake screen's own `ADM-`/`TRI-` reference, lands on
a status the vocabulary already had, and takes a trial seat with the same guarded increment the public
booking uses; a hand-off already done, a lead with no number, a binned lead, a missing consent, a full or
past class and an empty reason each refuse with a sentence in both languages, and the prefills a form is
allowed to carry are masks — no digits, no family key. Described in `docs/R3-COVERAGE.md` §13 and
photographed at 360 px and 1440 px in `screenshots/r3/` (`b3-handoff-*`). **Still owed, in the owner's
order:** the import wizard, then the funnel reports and CSV export.

---

## R1 leftovers closed, and the language scan at zero (step 3, 2026-11-14)

**Testimonials / social proof.** A testimonial is an ordinary `editorial` kind, so the list on
`/admin/content` already carried the full Recycle Bin contract — `RowControls kind="editorial"`
(soft delete and archive by role), the bin's restore and 30-day purge, and the 10-second undo toast,
which lives in `RecycleToastHost` in the admin layout precisely so the window survives the row it
undoes (`src/components/admin/recycle-toast-host.tsx`, window in `action-feedback.tsx`). What was
missing was the proof: `tests/recycle-bin.integration.ts` §8 now bins a published testimonial, shows
it leave the public list at query time and return on restore, and §9 proves the two account reference
blocks — a managed staff role and a legacy student profile each make an account **disable-only**
(`archiveSet:{active:false}`), the bin refusing with `recycleBin.kinds.accountStaffRole` /
`...accountStudentProfiles` in both languages and writing nothing, while an account with neither
bins and restores normally.

**Written confirmations, with their proofs.** The soft-delete auto-hide is a schema-hook rule, and
`tests/recycle-coverage.test.ts` §3 reads the registered hooks off the schema and asserts the whole
list: `find`, `findOne`, `countDocuments` (counts), `distinct`, `findOneAndUpdate`,
`findOneAndReplace`, `findOneAndDelete`, `updateOne`, `updateMany` (bulk updates), `deleteOne`,
`deleteMany`, `aggregate` (aggregations) and `bulkWrite`. `populate` needs no hook of its own — it
runs a `find` on the referenced model, so the referenced model's hook hides binned documents; that is
proved against a live database in `tests/recycle-bin.integration.ts` §7. The one deliberate exception
is `estimatedDocumentCount`, which cannot carry a filter and whose only caller is the storage card,
where counting stored rows (bin included) is the correct number; the same suite asserts the exception
stays exactly that wide. Delete, restore and purge each call `revalidateKind`
(`src/lib/admin/recycle.ts`, on `softDelete`, `restoreRecord`, the single purge and the daily job),
which walks the kind's `publicPaths` through `revalidatePath` for both locales — ISR pages refresh on
the next request — and `tests/recycle-coverage.test.ts` §4 asserts every public kind has those paths
and every private kind has none. `src/app/sitemap.ts` is `force-dynamic` and builds from the same
public readers, so a binned slug leaves the sitemap on the next request; there is no cached sitemap
to go stale.

**The language scan is at zero, and it is a gate now.** `tests/i18n-bangla-scan.test.ts` — the third
suite of `npm run test:i18n`, so R0.12 proves it — walked 451 files and found
**0 lines** of Bangla interface text outside allow blocks (was 22 in 16 files). Forty-five sentences
moved into the catalogs in both languages — a new `payHistory` group, `center.print` and
`center.restore.*`, `achievement.sampleCard.*`, `recovery.mailSubject`/`recovery.mailBody` (the reset
email now renders from the catalog in the locale it was asked for), `daily.dayRange`, and
`leads.handoff.*` plus `leads.handoffReasons.*` for the not-interested chips — every Bangla value
taken verbatim from the line it left. Six lines stay under markers written for them, each naming its
reason — the exam band parser's Bangla digit folding, the header switcher naming
the language it switches to, the podium glyphs inside aria-hidden artwork, the digit-conversion
table, and the two stored-default taglines a new document starts with — beside the allowances that
were already in place (SMS bodies, sheet-synonym tables, the channel's own titles, the PWA manifest's
brand block, whose end marker moved onto the line it closes). No SMS template body was touched, and
the language-ternary
allowance `tests/i18n-routes.test.ts` carried for `src/actions/recovery.ts` is gone with it: the only
ternary left there picks a catalog locale (`bn`/`en`), which the gate already treats as a code rather
than a painted word. The gate counts stand at 0 hardcoded language pairs and 0 Bangla lines in route
files, with 2458 distinct keys used at 3313 call sites, all present in both catalogs.

---

## Staging deployment checkpoint written down (step 4, 2026-11-14)

`docs/DEPLOYMENT.md` is the operator's script for putting this build on a real staging site: a free
Atlas M0 cluster in Singapore or Mumbai with a `readWrite`-on-`dictioncoaching`-only user and
`0.0.0.0/0` network access (Vercel has no fixed egress IP), the complete environment template with
every value described in `.env.example`, the Vercel project settings including function-region
alignment with Atlas and turning preview-deployment protection off so cron and a phone can reach the
site, the two `vercel.json` jobs at 01:00 and 07:05 Asia/Dhaka with `CRON_SECRET` (32 characters
minimum) in the bearer header Vercel adds by itself, why IP whitelisting must be **off** at
BulkSMSBD, and a ten-line smoke checklist to run from a phone after every deploy. **Nothing was
deployed**: this is documentation, and the flags that could spend money or publish a child's data all
still ship off.

Two of its claims are code, so they are checked rather than trusted. `tests/deployment-doc.test.ts`
(now the 28th suite of `test:unit:core`, and therefore R0.7's proof) asserts that `src/proxy.ts` —
the Next 16 name for middleware, with no `middleware.ts` beside it — matches only `/`, the locale
prefixes and paths that are not `api`, not `_next` and not a file name, so a cron call is never
redirected to `/bn` and never loses its `Authorization` header; that `vercel.json` ships exactly the
two daily jobs the guide names, at the schedules it prints; that §9 of the guide is ten lines long,
because a checklist nobody finishes is not a checklist; and that every secret variable in
`.env.example` is empty. `README.md` and the repository-root `DEPLOYMENT.md` point at the new guide,
and the root file no longer claims SMS is unimplemented — it shipped in R2, behind `mock`.

---

## The visitor funnel and its CSV (R3 wave C, 2026-11-14)

`/admin/leads/funnel` answers the question the owner asks at the end of a month: of the people who
walked in, how many booked a trial, and how many of those joined. It sits in the sidebar's
*Admissions & leads* group beside the Visitors list and the import wizard, and it is readable at
360 px because that is where it gets read.

**The definitions, written where a screen cannot quietly change them** (`src/lib/leads/funnel.ts`):

- **A cohort, not a calendar.** Each row follows the visitors who arrived in that month, source or
  class; the trial and the admission are counted on that lead whenever they happened. Counting the
  events instead would let a February admission flatter January and produce a rate nobody could act
  on.
- **Evidence in two forms.** *Trial booked* is a `trialBooking` reference — the intake row the
  hand-off wrote — or the status `trial_booked`, the operator's own word from the inline dropdown.
  *Admitted* is an `admission` reference, a `student` reference or the status `admitted`. Both paths
  are real, and refusing one would undercount rather than correct.
- **Trial → admitted divides by the leads that did both.** A direct admission that never booked a
  trial is counted in *Admitted* and in *Visitor → admitted*; leaving it in this numerator too would
  print a rate over 100%, which reads as a broken report rather than as a fact.
- **A rate with nobody to divide by is null and prints as a dash, never 0%.** Zero percent claims we
  tried; an empty bucket claims nothing.
- **Empty buckets print.** All five sources and all thirteen class buckets (twelve plus *no class
  read*) appear even at zero — a source that stopped bringing visitors is the interesting row, and
  the CSV keeps one shape month to month. Months are the exception: only months holding a lead
  appear, plus every month inside a from/to range the operator chose, up to a 60-month cap.
- **Binned leads are not counted**, because the query goes through `Lead.aggregate` and carries the
  Recycle Bin hook — the report and the Visitors list cannot disagree.
- **Two aggregations, one filter.** The buckets and the cohort total are separate queries on purpose:
  if a bucket expression ever dropped a lead the two would disagree, and the suites assert they do
  not, in all three breakdowns.

**Digits and words.** Every label comes from `leads.funnel.*` in both catalogs from the first line
(28 new keys, plus the sidebar's `adminRedesign.items.leadsFunnel`); months and classes are rendered
by the shared `formatMonth` (new, beside `formatDate` and `formatClass`) and `formatNumber`, so a
Bangla screen reads `জানুয়ারি ২০২৬` and `৬৬.৭%` while an English screen reads `January 2026` and
`66.7%`, with the digits following the operator's own preference exactly as the other 28 admin
screens do.

**The CSV is the table on screen.** A client component builds it from the rows the page already
rendered — one source of truth, no second query, no new route to authorize. It is byte-order-marked
so Excel reads the Bangla labels, CRLF-separated, every label quoted, a cell that begins like a
formula neutralized with a leading apostrophe (the same defence the admissions export uses), and the
numbers go out **bare and in Latin digits**: a spreadsheet is data, and Excel cannot add up `৪১.৭`.
The file is named for its breakdown and its Dhaka day.

**Proofs.** `tests/lead-funnel.test.ts` (no database) pins the rounding, the null denominators, the
vocabulary checks on a URL, the reversed-range swap, the bucket lists, the month fill and its cap,
and the CSV's exact bytes. `tests/lead-funnel.integration.ts` (R3.17, disposable database) counts
eight synthetic FAKE leads across three months, five sources and four class readings — visitors 8,
trials 3, admitted 3, rates 37.5% / 33.3% / 37.5% — proves both kinds of evidence, the direct
admission that does not inflate the trial rate, the ninth lead invisible once binned, every empty
bucket printed, a chosen range filling December, the buckets adding up to the cohort in all three
breakdowns, no phone number anywhere in the report, and an empty database reading as a report rather
than an error. `tests/lead-funnel-browser.integration.ts` (R3.18) drives the screen in both
languages, switches the breakdown, downloads the CSV twice and asserts its name, its BOM, its
headers and the absence of a single Bangla digit, checks that nothing overflows at 360 px, and
photographs 360 px and 1440 px in Bangla and English into `screenshots/r3/leads-funnel-*`.

---

## 17. R5 slice 1 — exams and results (verified: 55/55, run 43681561293, tag `r5-verified`)

**The gate is gone.** `CENTER_EXAM_WRITE_ENABLED` was the flag that kept the experimental exam code from
writing in production. R5 retires it: the feature is the feature, and what replaces the flag is
authorization — `src/lib/exams/exam-scope.ts` decides, once, what each role may do and which classes it
may touch, and every exam screen and action asks that module instead of reasoning about roles itself.
The flag is kept in `.env.example` as a line that says it does nothing, so an operator's existing
environment file is not silently wrong.

**One workbook reader.** `src/lib/sheets/workbook.ts` reads `.xlsx`, `.xls`, `.csv` and `.txt` into the
same `SheetGrid[]`. The teacher-CV importer and the marks importer now share it, which is why a sheet
with an empty worksheet, a Bangla header or a comma inside a quoted cell behaves the same in both.

**The rules are pure and tested without a database.** `src/lib/exams/grading.ts` (bands, points,
percentage → grade, pass/fail, positions with ties, the class summary), `src/lib/exams/grid.ts` (reading
one mark, a pasted block, a whole sheet, and matching a sheet row to a student) and
`src/lib/exams/vocab.ts` (exam types, the standard scale, absence words, the student-column spellings).
Two decisions worth naming: a mark over the full mark is **refused, not clipped**, and the sentence says
which full mark it broke; and a class summary with nobody to average says **nothing** rather than `0`,
because `0%` pass rate and `no results` are different facts.

**Scope is read fresh, never remembered.** A teacher's scope is the `teachers` list on
`CenterClassGroup`, read on every request — moving a teacher onto or off a class changes what they may
mark on the next page load, with no session to invalidate. That list had nowhere to be written before
R5: the classes screen (`/admin/students/classes`) now carries it, one tick per live teacher account,
and the row names who takes the class so the owner can read the assignment without opening anything. An
id that is not an active `teacher` account is refused rather than stored, because an assignment is an
authorization and a dead entry that looks live is worse than none.

**The wall around a teacher's eyes.** The teacher's exam screens are built from a scope-filtered view
(`src/lib/exams/exam-view.ts`) that never selects fee history, dues, receipts or guardian numbers, and
`tests/exam-flow.integration.ts` asserts it by serializing the whole view a teacher gets and searching
it for `fee`, `payment`, `receipt`, `cash`, `due`, `amount` and `guardianPhone`. The browser suite
asserts the same thing the way an owner would notice it: no such word on the screen and no link into the
admin.

**Sessions stay out of the rule layer.** `src/lib/exams/exam-actor.ts` holds the half that reads the
session; `exam-scope.ts` holds the pure predicates. A plain test runner cannot import `next/navigation`,
so a module that reached for the session could not be loaded by a suite that only wanted the rules — and
a rule that cannot be tested without a browser is a rule nobody will test.

**Proofs.** `tests/exam-rules.test.ts` (R5.1) and `tests/exam-grid.test.ts` (R5.2) run with no database,
over a real CSV and a real XLSX built inside the suite. `tests/exam-flow.integration.ts` (R5.3) runs the
whole flow against the disposable database, including two concurrent saves of one row settling as exactly
one write. `tests/center-exams-browser.integration.ts` (R0.9 and R5.4) drives thirteen steps in the
browser and photographs them at 360 px and 1440 px into `screenshots/r5/`, in both languages;
`tests/language-sweep-browser.integration.ts` now sweeps `/teacher/exams` too, because a portal screen is
not in the admin route tree and nothing else would have caught a hardcoded sentence there. The old
`tests/center-exam-batch.integration.ts` is deleted: it asserted the pre-R5 signatures, and its two
claims that nothing else made — the concurrent-save race and the revision counter — moved into R5.3.

**Two scope questions, not one.** `scopeCovers(scope,classGroups)` asks whether an actor reaches *every*
class of an exam, and it is the right question for the acts that speak for the whole exam at once:
publishing, reshaping, choosing the scale. `scopeClasses(scope,classGroups)` asks which of those classes
the actor may touch, and it is the right question for marks, because a teacher who takes Nine A marks Nine
A inside an exam that also covers Nine B. R5 shipped with the write asking the wider question, so the grid
a teacher was shown — already narrowed by the view — refused to save behind their back. Both now live in
`exam-scope.ts` side by side, and `exam-view.ts` reads its `visibleClasses` through `scopeClasses` so the
screen and the write cannot drift apart again. The actor's slice travels into the engine as
`allowedClasses` and narrows the roster *inside the write transaction*, because a check made outside a
transaction is a check against a database that may have moved by the time the mark lands. A refused row
answers `STUDENT_UNAVAILABLE` — the same sentence the engine gives for a student who is not in the exam at
all, so a forged row learns nothing about whose class is whose.

**Digits are a promise that reaches the numbers inside sentences.** next-intl leaves an ICU number
argument exactly as it was passed, whatever the locale, so `t('grid.errors.outOfRange',{full:100})` painted
`100` in the middle of an otherwise Bangla refusal on a `/bn` address — the words were Bangla and the number
was not, which is the same breach a hardcoded sentence would be and considerably harder to see. Every
numeric parameter now goes through `inDigits(digits)` in `src/lib/admin/format.ts`, and every count, total
and date through `formatNumber`/`formatDate`: cell refusals, the grid's status lines, the upload's counts
and row numbers, the subject labels in the exam form, the exam dates, the result and scale counts, and the
teacher's "your N classes" note.

**"Students" is the class, not the marks.** `classSummary` answered its `students` field with the number of
rows it was handed, and a row only reaches the summary once every subject of it is marked — so a class of
five with one child not yet marked read "মোট শিক্ষার্থী ৪" under a label that promises the class. Both
callers know the size of the class they are summarizing and both pass it now; the difference between that
number and `counted` is the honest "still to mark".

**A stored mark's subject is an ObjectId.** `calculateExam` compares ids as lowercase hex, and `applyMarks`
normalizes on the way in — but the recompute inside `updateCenterExam` read the stored marks raw, so every
row looked like a mark for a subject the exam did not have and tightening the scale of an exam anyone had
sat failed with `INVALID_MARKS`, transaction and all. The recompute is the only reason that path exists, so
this was the one edit guaranteed to be attempted and guaranteed to fail. It reads through `String` now.

**A client component is only as translated as the provider above it.** The marks grid reads `exams` with
`useTranslations`, and the portal is not inside the admin tree: the public layout ships only the groups the
public site's own client components read, so on a teacher's screen the grid was handed nothing and painted
its key paths — `exams.grid.save` where a sentence belongs. That fails no build, no type check and no server
test; only a browser notices. The teacher's exam page now ships the one group its grid reads, through
`pickedMessages` in `src/i18n/client-namespaces.ts` — the tightest filter there is, next to `clientMessages`,
which subtracts what no client can read and is the right answer inside the admin tree where the shell reads
dozens of groups. `exams` alone, and not the whole client catalog, because the groups a teacher is not given
include the dues vocabulary that wall is built to keep off that screen.

**And the check that should have existed with it.** `tests/i18n-catalog.test.ts` now walks every page against
the layouts above it, follows its imports to the client components it renders, and fails when a group they
read is shipped by no provider in that chain. It found the teacher's grid and eleven more routes, none of them
R5's, and following the imports split those eleven into two very different facts.

Two were broken the same way the teacher's grid was: `/practice-tests/[slug]` and the student's practice
history both render a client component that reads `practicePublic`, unconditionally, and no provider shipped
it — so both painted `practicePublic.exam.start` where a sentence belongs. `practicePublic` is two keys and
the first of those routes needs no session at all, so it joined `PUBLIC_NAMESPACES`, the list the root layout
now reads from `src/i18n/client-namespaces.ts` instead of holding its own copy of.

The other ten are not broken screens and the suite says so in those words: each one imports an admin control
that a role gate then never mounts — the student and parent fee screens pull in the invoice form and its
student-search picker (`center`) behind `{role==='admin'&&…}`, and the materials and notices screens of all
three portal trees pull in the publish and delete controls (`adminWork`, through `DeleteRow`) behind
`{isAdmin&&…}`. Nothing paints. What it costs is the bundle: an admin control and the catalog group it reads
ride along in the JavaScript of a student's fee screen. Those ten are named as debt inside the suite, in both
directions — a route that stops being uncovered has to be struck off, and a new one fails — and the fix is to
split the portal component from the control only an admin mounts. It is **not** to ship the group, which is
the tempting one-line answer and the wrong one: `center` holds the dues vocabulary that the wall around a
teacher's eyes exists to keep off a teacher's screen.

**Two responsive faults, both the same CSS fact.** A grid item's automatic minimum size is its content's own
minimum, so the marks table — deliberately `min-width:max-content` so eight columns of Bangla headings stay
readable, inside a wrapper that scrolls — held `.center-exam-gridwrap` open at 408px and scrolled the *page*
sideways at 360px instead of the table; and the import panel took its width from a file input, a form control
with an intrinsic size of its own, which put the label, the help line and the preview button at right=393 on
a 360px screen. `min-width:0` on the items hands the shrinking back to the elements that can scroll, which is
the house fix (`.private-notice`, `.practice-question` and `.editorial-section` carry it for the same reason);
`max-width` cannot do it, because a maximum does not lower a minimum. The overflow check now names the
elements that escape the viewport, skipping anything inside a wrapper that scrolls, because "this screen
overflows by 48px" is a CSS question and a screenshot does not answer it.

**Verified.** Run 43681561293 on commit `0308c16`: 55 requirements PASS, 0 FAIL, 0 NOT TESTED, tag
`r5-verified`, photographs in `screenshots/r5/`. Seven product defects and six suite defects were found on
the way there and only in CI, because five of the seven need a browser or a database and the other two need
both: the scope wall above, digits inside translated sentences, the summary that counted marks and called
them students, the scale recompute, the missing provider, and the two layout faults.

## 18. R5 slice 2 — the result SMS (verified: 56/56, run 43686815982)

**What was missing was not the send.** `exam_result` has existed since R2 with the right purpose,
`feeRelated:false` — so a held family still learns a result, a decision `sms-recipients.ts` makes from the
template's own flag — and `autoSendKey:'autoResult'`; and since R5 slice 1 `publishExamAction` has called
`autoSendClassResults` once per class of the exam, best-effort inside a `try`, so a send that fails never
turns a published exam back into a draft. What it would have sent was the R2 body: the result is published,
log in to the portal for details, contact `{institute_phone}`. True, and useless to the person it was for.
§R5 of `docs/SPEC.md` fixes the sentence a family reads on result day, and that sentence names the child's
marks, their total and their position — three numbers for which no chip existed, so the spec's wording could
not be shipped until the chips did and something filled them.

**Four new chips, all per student.** `SMS_VARIABLES` gains `exam`, `marks`, `total` and `rank`, and the
default body is now the spec's sentence byte-for-byte with `variables` naming all five. "Per student" is the
part that decides the design: a result message quoting the class's numbers would be worse than no message, so
the values travel on the candidate rather than as class-wide `globalValues`, through
`SmsCandidateStudent.values`, which `resolveRecipients` already merges under `student_name`. One consequence
falls out for free and is now asserted: two siblings on one guardian number get **one message each**, because
`mergeValues` refuses to merge a chip whose value differs between them — their marks are not one sentence.

**`src/lib/exams/result-message.ts` builds the four strings, purely.** Given the exam name, the exam's own
subject list and one result row's marks, total, full total and position, it returns the values or `null`.
Three of its rules are why it is a module rather than a line in the sender: a subject the child did not sit
reads as a dash and not as a zero, because a zero claims they sat and scored nothing, while a genuine zero
stays a zero; subjects are listed in the exam's own order however the marks were stored, and a mark for a
subject this exam does not have is left out; and nothing re-ranks — a tie reads as the position publishing
wrote, since a message that disagreed with the result table would be a second and worse bug. Numbers go
through `formatNumber(value,'bn')`, the same helper every screen uses, so an SMS and a result table cannot
disagree about a total.

**A child with nothing to report is sent nothing.** `resultMessage` returns `null` for an absent row, for a
row whose every subject is absent, for a row publishing has not ranked, for an exam with no name or no
subjects, and for a row with no stored total. `resultMessagesForExam` — in `exam-view.ts`, beside the other
reads of stored results — leaves those rows out, the candidate keeps no values, and `buildSmsPlan` skips them
as `missing_value`: counted on the batch, with the reason the operator reads there. The alternative was
texting the family of a child who never sat that the child's total was 0 out of 150. A class with no results
of its own — a draft exam, or one class of a multi-class exam — answers `no results` and raises no problem
card, because nothing is broken and `publishCenterExam` already refuses an exam with no results anywhere.

**Proofs.** `tests/exam-result-message.test.ts` (new, pure, `npm run test:exam:result` and part of
`test:exams`) renders the values through the shipped template and the shipped renderer and compares what comes
out with the spec's wording byte-for-byte, then checks the coverage fact that actually protects an operator:
every chip of the shipped body except `student_name` — which `resolveRecipients` fills — is a key of these
values, and no value is invented. It is asserted against the template rather than a list, so a wording change
in the catalog fails here instead of in front of a family. The two database suites that already drove this
send now seed a real published exam: the dialog contract asserts the exact sentence five families receive,
including the sibling pair on one number, that the absent child is on the batch as a `missing_value` skip and
not as a message, and that a result message carries no chip and no word about money; the problems suite
asserts that a retried send still quotes that one child's own marks and position, and that a draft exam is
not a problem. Registered as **R5.5**, so the registry holds 56 requirements; R2.2's "five default bodies" is
corrected to six, and R2.8 and R2.9 each gained a clause in both languages for what their suites now prove.

**One deviation from the spec, recorded rather than papered over.** §R5 says publishing *prompts* "Send
result SMS now?". It does not. R2 built this as a settings toggle — `autoResult`, OFF by default, on the SMS
page — which publishing honours, and R5 kept that shape, so the operator's decision is made once in advance
and a publish does not stop to ask. The failure mode that decision creates is exactly why
`CenterSmsAutoProblem` exists: an automatic send nobody watched has to store its own failure, and it does,
naming the exam and the class. **Still owed in slice 2** — and delivered in §19: the student's result history
and improvement chart, the portal Results tab for a linked student, and the on-demand report card.

**Verified, and what the first attempt taught.** Run 43686815982 on commit `84b7c0a`: 56 requirements PASS,
0 FAIL, 0 NOT TESTED, the new row being **R5.5**. The first run of this slice, on `c138ec0`, failed R2.7,
R2.8 and R2.9 — three suite faults, not product faults, and all three of a kind no local run can reach
because two need a database and one needs a browser:

* A stored `CenterExamResult` **requires** `recordedBy`, because `ref()` in `CenterRecords.ts` sets
  `required:true` on every reference. Both database suites died seeding the published exam the result send
  now reads.
* The result row has **no** `absent` field — only its per-subject marks do — and absence is recognised by the
  grade `ABSENT` that the engine writes, which is how `examDetailView` already read it. The new reader had
  selected a field that does not exist and the seeded row had set one that mongoose quietly dropped, so a
  reader can now take absence from the grade and from nothing else: one convention for reading a stored
  result, not two.
* The dialog offers one chip per `SMS_VARIABLES` entry and that list grew from nine to thirteen, so a
  hard-coded `9` in the browser suite was a claim about a catalog this slice had deliberately changed. It
  now reads the length of the list the dialog itself renders, and names the four result chips separately —
  a count alone would also pass if they were swapped for four nobody asked for.


## 19. R5 slice 2, finished — the prompt, the history, the portal tab and the report card (verified: 59/59)

§18 shipped the sentence a family reads on result day and left the three screens around it owed. This
section closes them, and the four things it closes are four different kinds of honesty.

**The publish prompt is a question, not a toggle.** `publishExamAction` has called `autoSendClassResults`
since slice 1, gated on `CenterSettings.autoResult`, which meant the decision was made once, centre-wide,
months before the exam — and a publish did not stop to ask. `PublishCenterExam` is now a native `<dialog>`
holding the review box, the result-SMS box and a count, and `autoResult` only says how that box *starts*.
Ticked, the action sends with `ignoreToggle:true`, because the person holding the mouse has just consented
to this exam's messages, which is a stronger authority than a setting somebody left on; unticked, it
publishes and writes no batch. Either way the screen says which happened (`publish.smsSent` /
`publish.smsSkipped`), and either way publishing itself succeeds — a send stays best-effort.

The count comes from `resultSmsAudience(examId)`, which counts **the way the send counts**: the same
candidates from `resolveSmsSource`, the same per-student values, the same recipient rules including the
sibling rule that refuses to merge two children on one number, the same effective template body with an
operator's stored edit honoured, and the same chip-completeness check that makes the plan skip a family
with nothing to quote. The only difference is that nothing is written, and the publication gate is lifted
because at prompt time the exam is still a draft. `tests/exam-results.integration.ts` runs the real send
afterwards and asserts the batch's `sentCount` equals the number the prompt showed: a prompt that says
four and a send that writes two has told the operator a lie with their own software. Whether a send is
*possible* is asked of `createSmsProvider()` and not of the environment flag, because the mock provider
never consults it — a test-mode prompt that said "cannot send" would be wrong in the one place its numbers
are checked.

The first CI run of this slice found the one way that count could be honest-looking and still be zero.
`resultMessage` refuses a row with no position, because a message that quoted a rank nobody earned would be
a lie — and **positions are written by publishing**, so every row of a draft exam has none. The prompt asks
before publishing, so it counted nothing to send for an exam holding two hundred marked rows, and the send
that followed it wrote four messages. The fix is not to relax the refusal: the ungated reader now ranks a
draft's rows per class with `positionOf`, the pure rule R5.1 proves, and `publishCenterExam` was changed to
rank with the same function instead of its own inline copy of the rule — one ranking, used by the publish
and by the count that promises what the publish will send. A stored position always wins; nothing re-ranks a
published row.

The same cross-check then found a fault in the R2 send engine, and it is worth stating plainly because it
was invisible for four milestones. `sendChunks` grouped its rows **by phone** and transmitted the first
message of each group, which is right for a merged sibling reminder — one sentence covering both children,
one call, two log rows — and wrong for a result send, where `resolveRecipients` refuses to merge two
children whose marks differ and the plan holds two items with two different bodies for one number. The
second child's message never left, and both rows were marked `sent`, so the batch reported a transmission
that did not happen and a guardian read about one of her two children. Grouping is now by phone **and**
message: the merged case still takes one call, and two different sentences to one number take two. R2.8
already claimed "two siblings on one number get one each, because their marks are not the same sentence" —
it was asserting the log rows, and the rows were right while the wire was not.

**The history and its trend.** `studentResultHistory(studentId,locale)` returns the published exams newest
first, each with the exam's own subjects, marks, full and pass marks, total, percentage, grade and the
position publishing wrote. Only `status:'published'`: a draft is the operator's working paper, with marks
that may still move and positions publishing has not finished ranking, and that is one condition in one
query rather than a filter applied in three screens. The class printed is the **result row's** class, so a
promoted child's old report belongs to the class they sat it in, while the profile header names the class
they are in now.

`trendOf` sorts oldest first whatever order the rows were read in, takes the step between the *last* two
exams — a good month in the middle cannot hide a bad one after it — and leaves an exam the child was
absent from out of the line while counting it as skipped. That last rule is the one the chart exists to
get right: an absent row is 0 percent, and plotting it would draw a collapse and a recovery that never
happened. `chartOf` maps the whole 0–100 scale into the padded box rather than squeezing the axis to fit
the data, spaces the exams evenly because they are a sequence and not a timeline, centres a single point
and clamps an out-of-range percentage to the edge. Both are pure and proved in
`tests/exam-result-trend.test.ts` (**R5.6**), which needs no database and no browser.

**The portal tab reads only what it may.** There is no stored link between a portal account and a centre
student, so the identity evidence is the phone number: it is what the result SMS is sent to and what the
operator typed for that child. `portalResultStudents({id,role})` reads the number **from the account
itself**, by id — a route that could hand it somebody else's phone could hand it somebody else's child —
and matches it exactly: a student account against its own `studentPhone`, a guardian account against
`guardianPhone` or `altPhone`. Not a pattern, not a tail: a number one digit away is another family. A
removed student is left out, a teacher or admin session gets nothing, an account with no number gets the
empty state. `/dashboard/results` and `/parent/results` are two routes because they are two roles, and a
student session at the guardian's address is sent to sign in.

The isolation is structural rather than a filter applied late, and the reader is the wall: it selects
marks, totals, grades and positions and asks for no fee, payment, receipt, due or guardian number at all,
so there is no field that could reach a student's browser. `tests/exam-results.integration.ts` (**R5.7**)
serializes what the portal receives and walks its **keys** as well as its text for a money word in either
language and for a phone number; `tests/exam-results-browser.integration.ts` (**R5.8**) asserts the same
thing about the painted screen — no sibling's name, no other child's, no fee from the child's own record,
no `/admin/` address anywhere on the page, no catalog key path where a word belongs.

**The report card is printable because print is written down.** `ReportCard` quotes the stored row through
`studentReportCard`, so a card and the exam's own result table cannot disagree about a total. The
institute's name is `common.brand`, the same one the public site prints, because a card with a name nobody
maintains goes out wrong the day the centre is renamed. The remarks block is a **placeholder on purpose**:
no schema field holds a teacher's remark, and a card that printed an invented sentence under a heading
would be forging the one part a family reads aloud — so the heading, two ruled lines and a sentence saying
nothing has been written yet are what ships, and the space is there for a hand. `@media print` in
`globals.css` hides the sidebar, the header, the tab bar, the toolbar and the print button by measurement,
not by shrinking them, and the browser suite asserts each of those takes no space while the card is still
the page — that is what makes it a report card rather than a screenshot of one. Two refusals are told
apart: `NOT_PUBLISHED` is the centre still working, `NO_RESULT` is this child never having been in that
exam, and a screen that said the first for both would send a parent to ask about a result that cannot
exist.

**Screens and languages.** The new suite photographs the results tab, the report card (including one under
print media), the student's tab, the guardian's tab and the portal report card at 360 px and 1440 px into
`screenshots/r5`, in Bangla and in English, and asserts on the English addresses that every label these
screens own is English with English digits and English month names on the chart — while the exam keeps the
Bangla name it was given, because an exam is stored with one name and inventing an English one would be
inventing data. `PublishCenterExam`'s prompt is photographed by the exam suite. The two-language sweep
(**R0.13**, reworded in the same patch) now also reads `/dashboard/results` and `/parent/results` on both
addresses with a student and a guardian session, sweeping the portal chrome, the headline, the card head
and the empty state — with no student record seeded, because a sweep proves language and a class group
here would paint its Bangla name into admin screens that have always been swept with an empty database.
Both new portal components are **server** components, and `PrintButton` is a client island whose label is
a prop: the portal tree's client catalog is `PUBLIC_NAMESPACES`, and a client component reading `exams`
there would paint a key path instead of a word.

**Registry: 59 requirements.** New rows **R5.6** (trend and chart geometry, `test:exam:trend`), **R5.7**
(history, card, portal identity and the prompt's count against the disposable database,
`test:exam:results`) and **R5.8** (the screens, `tests/exam-results-browser.integration.ts`); **R5.4** and
**R0.13** reworded in the same patch, because a registry line may claim only what its suite proves.

## 20. R6 slice 1 — the money reports, the cashbook check, the statement and the export engine

Five screens under `/admin/reports` — a hub, the daily collection, the monthly collection, the cashbook
check and the year summary — plus one student's ledger statement at
`/admin/reports/statement/[studentId]`, all gated by `requireArchiver` (super admin, admin, staff: the
accountant at the desk; never a teacher, which slice 2's role tests will hold to the wall).

The mathematics is pure and lives in `src/lib/reports/`: `collections.ts` (a day split by the operator
who took each receipt, a month in a class-by-day matrix whose row totals, column totals and head totals
meet at one grand total), `receipt-audit.ts` (every receipt number written twice, every gap in the
numeric sequence bounded by the two receipts around it), `ledger.ts` (assessments, waivers, holds and
payments in date order with a running due that ends at the outstanding sum `monthStatus` shows — the R1
fee engine, never a copy) and `year-summary.ts` (expected, collected, outstanding, pending, waived per
class). The database halves are `server-only` loaders beside them; `tests/report-math.test.ts` proves
the pure half without a database, registry row R6.1.

The export engine (`src/lib/reports/export.ts`) is one door for every table: `?kind=…&format=csv|xlsx`.
The CSV reuses R2's `csvCell` — every cell quoted, formula-like ones prefixed — and the `.xlsx` is
written here rather than imported: a store-only zip of the five workbook parts with a correct CRC32 and
inline-string text cells no spreadsheet will evaluate. The math suite unzips it and recomputes every
CRC. Printing follows the house convention the daily receipt and the class sheet set: everything hidden
by visibility, `.report-print` whitelisted back — the rule the R5 report card was caught breaking.

Both catalogs carry a `reports` group from the first commit of the slice; the sidebar carries a
`reports` nav group; screenshots land in `screenshots/r6/`; registry rows R6.1–R6.5 point at the math
suite and `tests/reports-browser.integration.ts`.

## 21. R6 slice 2 — backup, usage, retention and the role wall

The backup door is the narrowest in the building: `/admin/backup` and its export route answer a
`superadmin` session and redirect everybody else, staff included — a file that holds every child's
record and every taka the centre took is not an accountant's carry-out. The JSON export carries all
fifteen centre collections with `passwordHash` projected away; the Excel export is one worksheet per
collection through the same store-only zip the report engine owns. A successful export writes
`lastBackupAt` on the settings row and one `backup.export` line in the activity log, and the Overview
reminder — Super Admin only — counts its month from that stamp: it stands while no backup exists or
the last one is older than thirty days, and stands down the moment an export succeeds.

The database usage card and the twelve-month log trim arrived in earlier milestones and are re-proven
here rather than assumed: `tests/backup-roles-browser.integration.ts` reads the card on the Super
Admin's Overview against its 512 MB ceiling, calls the daily job straight against its route handler
with a bearer secret and watches a thirteen-month-old SmsLog and ActivityLog row disappear while last
week's stay. The role matrix is asserted in the same suite: Super Admin reads backup, reports and the
cash desk; staff read the reports and are refused the cash desk and the backup; a teacher is refused
all three and never lands in the admin tree at all. Registry rows R6.6–R6.8.

## 22. R7 — deployment papers, go-live and handover

The last milestone ships no feature: it ships the papers that let a non-engineer run the center.
The root README was rewritten from a milestone log into a working manual — overview, stack, local
setup (`npm ci`, env, seed, the suite list), architecture overview and a directory map naming all
ten modules. `docs/DEPLOYMENT.md` gained the three production facts an owner cannot guess: the
connection pool the code actually opens (`maxPoolSize: 5`, band 5–10, `src/lib/db.ts`), the masking
rules around the BulkSMSBD key (read in one file, redacted from every string it returns or throws),
and the segment arithmetic that prices Bangla (GSM-7 160/153, Unicode 70/67).

`docs/GO-LIVE.md` is the owner's launch day: Atlas and the one-time Super Admin bootstrap
(`npm run seed`), the Vercel environment and the no-banner check, both cron schedules, the live
balance and the single test SMS to the owner's own phone, the progressive automatic-SMS rollout
(receipt → due reminder → exam result, a week apart) with the emergency brake taught after it, and
a ten-line phone smoke test. `docs/OPERATIONS.md` is the rhythm after launch: the monthly backup
and its two offline copies, the 512 MB watch at 70% and 90% with the paid-cluster path, and the
Recycle Bin's three verbs — hold thirty days, restore inside the window, purge deliberately.

Every promise on paper is asserted against paper and code together in `tests/r7-docs.test.ts`
(registry row R7.1): the README's setup and map, the environment template's completeness against
every variable the source reads, the deployment facts, the go-live order — rollout before brake,
receipt before due before results — and the operations rhythms. Docs are requirements; requirements
get proofs.

## 23. S1 + S2 — the Student & Class Workflow Audit (complete, CI-verified)

Two milestones close one audit. It read the centre's own screens rather than its schemas and came back
with numbered findings about the two records the desk works on all day — a student's money over time
(S1) and a class (S2). The audit numbered no F-17, so the findings are F-01 to F-16 and F-18, and every
one of them is now a rule with a proof behind it: rows `S1.1`–`S1.6` and `S2.1`–`S2.4` in
`scripts/verify-plan.ts`, each pointing at a suite that runs in CI.

**S1 · a student's money over time.** F-01: a pause is a range of months, not a flag — the months before
it stay owed, every month inside it is billed by nobody, and lifting one closes the range at the month
*before* the resume, so the resume month is billed and the paused months are never billed again; a pause
the record has no month for (every pause written before this slice) counts for nothing instead of being
invented from enrolment. F-02: a move writes one line to `classHistory` carrying the name the class wore
that day, backfills the class the student left from enrolment on the first move only, sorts a backdated
move into the place it happened, and refuses a move to the class the student is already in or to a month
before enrolment. F-03: a price is a line added and never a line edited — each month bills at the price
that month had, a price written for a month nobody has reached is quoted by no screen until it arrives,
and a month the centre has already taken money for cannot be re-priced at all. F-18: an achievement
card's date is spelled from `bn.json` and the operator's own digit setting, so a Bangla certificate never
depends on the host's ICU tables, and a day that is not a day is refused rather than rolled into the next
month. The three doors are async server actions in `src/actions/center-students.ts` with their planners
pure beside them in `src/lib/center/student-changes.ts`: each parses the month it is handed rather than
trusting it, writes under the student's own lock, moves the revision a concurrent edit is refused by,
re-reads both classes a move touches and writes its own audit line.

**S2 · the class workflow.** F-04: one editor (`ClassEditorForm` in
`src/components/admin/class-management.tsx`) holds every field a class has and all three surfaces render
it — the board's sheet, the list's fold (`center-class-edit.tsx`) and the create box
(`center-forms.tsx`) — posting to one action (`saveClassGroupAction`, `src/actions/class-admin.ts`), so
no screen can save half a class. F-05: a class with children on it is not closed; the count is read
inside the transaction, a student who has left does not hold a class open while a paused one does, and
the refusal is the brief's own two sentences with the count in the operator's digits. F-06: a closed
class is a record, not a door — it says it is closed, names what is still readable there, and puts the
enrolment form on the other side of that sentence. F-07: an enrolment takes its fee from the class it
stands in and says where the number came from. F-08: the shifts a class runs are canonical keys and the
one word a routine reads is derived from the first of them in the order the day happens, so no two
screens can disagree about one class. F-09: the unique-name rule is a partial index binding only classes
both live and running, so an archived class or one filed in the Recycle Bin gives its name back — and
because a database written before the rule still enforces the wider one under the very same index name,
the nightly `syncIndexes()` is part of the proof rather than a comment about it. F-10: a removal is filed
with the date it stops being kept (`removal.purgeAt`), the window is the centre's own setting
(`purgeRetentionDays`, schema default 365, falling back to `STUDENT_PURGE_RETENTION_DAYS` of 30 when no
setting can be read), the purge drops what the window has closed on in pages, names whoever removed the
student in an audit row, and leaves the payments alone — a cashbook that loses a line when a child leaves
is one nobody can audit. F-11: a list held in client state adopts the server's re-read after a write
without moving the operator off the page they walked to. F-12: a restore whose class has been closed or
filed away asks which running class the student comes back to and carries the move in the same write,
with the timeline line and the audit row that follow. F-13: the month a restore offers starts the month
*after* the one the student left — `monthAfterWord` in `src/lib/center/student-changes.ts`, read by both
restore doors and by the lift door beside them — because the picker's `notBefore` names the first month
that *is* allowed while `restoreCenterStudent` refuses the leave month itself (`INVALID_RESUME`), and a
picker that offers a month the door refuses costs the operator the reason they typed with it; the
browser proof walks the picker to the year the student left in and reads the leave month as a dead
button and the month after it as a live one, and the helper reads the month out of a removal whether the
door filed it as a month or an import filed it as a date. F-14: the
pager and the read count a page by the same number, and a page that has emptied under the operator's feet
is stepped back from rather than shown. F-15: a wrong class address lists every class instead of
dead-ending. F-16: a fee distinguishes a class the centre runs for free from one nobody has priced
(`feeFree` beside `monthlyFee`), and clearing a price is an act the operator performs — the form posts
the fee it opened with — rather than something a half-filled submit does on its way past.

**The two doors the audit left behind, deleted.** F-04 made `createCenterClass` and `updateCenterClass`
in `src/actions/center-students.ts` unreachable: they wrote halves of a class — no level, no room, shifts
as free words, a fee with one meaning. They stayed exported, and stayed in step with the real action for
as long as they existed, which is the work itself: every guard written twice, every refusal worded twice,
and an archive guard that one door had and the other did not was a guard nobody had. They are gone now,
with `centerClassSchema` in `src/schemas/center.ts` that only the create door parsed and the `languageOf`
helper that only the deleted archive refusal needed; `docs/R1-AUDIT.md` still names them, as the R1 map it
is. A class is written by one action, and `tests/class-workflow-core.test.ts` pins the absence so the
doors cannot come back quietly.

**Proof.** The rules are `tests/student-money-core.test.ts` and `tests/class-workflow-core.test.ts`
(`test:s1:money`, `test:s2:core`), the records `tests/student-money-db.integration.ts` and
`tests/class-workflow-db.integration.ts`, the screens `tests/student-money-browser.integration.ts`,
`tests/students-reference-browser.integration.ts` and `tests/class-workflow-browser.integration.ts`
(photographs in `screenshots/s1` and `screenshots/s2`), the words `test:s1:copy` and `test:s2:copy`, and
the date `tests/achievement.test.ts`. S1 closed on run
[44289817070](https://github.com/NurTheDev/diction/actions/runs/44289817070), tag `s1-verified`; S2
closed on run [44310354466](https://github.com/NurTheDev/diction/actions/runs/44310354466) with **115
PASS, 0 FAIL, 0 NOT TESTED of 115 requirements**, tag `s2-verified`. The deletion of the two legacy class
doors and the F-13 polish above went through the same harness again on this branch and closed at **115
PASS, 0 FAIL, 0 NOT TESTED of 115 requirements** on run
[44327804671](https://github.com/NurTheDev/diction/actions/runs/44327804671) at commit `d10928f`, whose
report is `test-results/ci-latest/verify-report.md` and which is the commit the tag `s2-final-verified`
points at.
