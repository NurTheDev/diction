# Diction Coaching Center

A Bangla-first website and admin workspace for a coaching center in Dhaka: the public site
(home, courses, teachers, admissions, trial booking, blog), the parent and teacher portals, and an
admin workspace that runs the center's money and messages — student records, monthly fees and cash
collection, receipts, discounts and waivers, dues, BulkSMSBD SMS with quiet hours and spend gates,
admission leads, exams and published results, six financial/audit reports with Excel and print
export, and a Super-Admin-only full-database backup door.

Every operator-facing screen exists in Bangla and English from the same catalog (`src/messages/`),
and every requirement the project claims is registered in `scripts/verify-plan.ts` with a machine
check beside it — `npm run verify` re-proves the whole registry and writes `verify-report.md`.

## Tech stack

- **Next.js 16 (App Router), React 19, TypeScript** — server components read the database directly;
  route handlers serve exports, cron jobs and APIs; no client-side data fetching for admin pages.
- **MongoDB Atlas (M0 replica set) + Mongoose** — transactions for fee collection, imports and
  hand-offs; `CENTER_DATA_MODE=test` switches to a separate disposable database.
- **next-intl** — `bn` (default) and `en` under `/[locale]`; Bangla digits where the operator expects
  them, per account preference.
- **Auth.js v5** — credential sessions with roles: superadmin, admin, staff, teacher, content
  editor, exam manager; middleware routes each role to its own tree.
- **BulkSMSBD** — the SMS gateway behind a server-only adapter that redacts credentials from every
  string it can return or throw.
- **Verification harness** — `tsx` suites (unit, disposable-database, Playwright browser) driven by
  `scripts/verify.ts`; CI publishes `verify-report.md`, `verify-output.zip` and screenshots.

## Run locally

Prerequisites: Node 22+, npm, and a MongoDB URI (a local `mongod` works for the site; the test
suites that need a database start their own disposable server).

```bash
npm ci                          # exact lockfile install
cp .env.example .env.local      # then fill the values marked “Required before the site will start”
npm run seed                    # creates the first Super Admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
npm run dev                     # http://localhost:3000  (binds 0.0.0.0)
```

`npm run seed` inserts only what is missing and never overwrites an existing account or content
record; `npm run seed:check` validates the seed data without touching the database. Without any
MongoDB at hand, `CENTER_DATA_MODE=test` plus the disposable in-memory server is what the suites use.

### Running the tests

```bash
npm test                        # core unit suites (intake, admin, academic, study, seed, …)
npm run test:center             # center-domain unit suites (fees, dues, cashbook, …)
npm run test:sms                # SMS unit suites (provider, templates, recipients, quiet hours, …)
npm run test:i18n               # catalog parity, route coverage, and the zero-hardcoded-Bangla scan
npm run test:report:math        # the R6 report engine: filters, matrices, audit, ledger, year, xlsx
npm run verify                  # the whole registry; VERIFY_STRICT=1 fails on any NOT TESTED row
```

The database and browser suites (`tests/*.integration.ts`) need MongoDB and Playwright Chromium;
locally they start a disposable database where they can, and the full set runs in GitHub Actions on
every push — that run is the project's acceptance gate, and it publishes the report, the evidence
zip and the screenshots under `screenshots/`.

## Architecture overview

- **Routing.** `src/app/[locale]/` holds the public site, the portals (`parent`, `teacher`,
  `dashboard`) and `admin/`. Middleware (`src/proxy.ts`) admits each role only to its own area and
  redirects everybody else home before a route ever runs.
- **Reading and writing.** Server pages call loaders in `src/lib/` that return plain rows; writes go
  through route handlers and server actions guarded by `src/lib/admin/guard.ts`. Feature gates
  (`.env.example`, “Feature gates”) ship OFF and are decisions, not defaults.
- **Domain layer.** `src/lib/center/` owns fees, dues, cash batches, the SMS pipeline (recipients,
  quiet hours, provider adapter, send engine), imports and the database-usage meter;
  `src/lib/reports/` is the pure report engine (daily, monthly matrix, receipt audit, ledger,
  year summary) plus the CSV/XLSX writer; `src/lib/admin/` owns roles, audit, recycle bin, cron
  workers and the backup collector.
- **Models.** `src/models/` — `User`, `CenterRecords` (students, class groups, payments, cash
  batches, waivers, exams, SMS logs/batches, settings, activity log, due snapshots), `Lead*`,
  content models, `AdminAudit`, recycle-bin wrappers.
- **Scheduled jobs.** `vercel.json` schedules `/api/admin/jobs/daily` (01:00 Asia/Dhaka: due
  snapshots, recycle-bin purge, 12-month log trim, proof milestones) and `/api/admin/jobs/sms-flush`
  (07:05 Asia/Dhaka); both demand `CRON_SECRET` as a bearer token and answer 401 without it.
- **Export and print.** One export door per report area answers formula-safe CSV (BOM, CRLF, quoted,
  leading `=` neutralized) and a hand-built `.xlsx`; print stylesheets expose only the whitelisted
  report subtree.
- **i18n.** `src/messages/bn.json` and `en.json` are the only source of operator words; the i18n
  test fails on a catalog gap, a route without both locales, or Bangla hardcoded in source.

## Directory map

| Module | Where | What lives there |
| --- | --- | --- |
| students | `src/app/[locale]/admin/students/`, `src/lib/center/dues.ts` | student records, profiles, the cash desk (`students/collect`) |
| fees | `src/app/[locale]/admin/fees/`, `src/lib/fees.ts`, `src/lib/center/cash-batch.ts` | monthly assessments, payments, receipts, waivers, cash batches |
| sms | `src/app/[locale]/admin/sms/`, `src/lib/center/sms-*.ts` | templates, audiences, quiet hours, provider adapter, send engine, logs |
| leads | `src/app/[locale]/admin/leads/`, `src/lib/leads/` | visitor sheets, lead statuses, follow-ups, do-not-contact |
| teachers | `src/app/[locale]/admin/faculty/`, `teacher-cvs/`, `src/lib/content/` | faculty profiles, CVs, class-group assignments (`src/lib/exams/exam-scope.ts`) |
| exams | `src/app/[locale]/admin/center-exams/`, `src/lib/exams/` | exams, marks, published results, grading scales |
| reports | `src/app/[locale]/admin/reports/`, `src/lib/reports/` | daily, monthly, receipt audit, ledger statement, year summary, export door |
| backup | `src/app/[locale]/admin/backup/`, `src/lib/admin/backup.ts` | Super-Admin-only JSON/Excel full export, reminder, `lastBackupAt` |
| auth | `src/lib/auth.ts`, `src/lib/admin/guard.ts`, `src/proxy.ts` | Auth.js config, role guards, middleware area permits |
| i18n | `src/messages/`, `src/i18n/` | bn/en catalogs, routing, the Bangla-digit and scanner helpers |
| models | `src/models/` | every Mongoose schema, including recycle-bin wrappers |
| jobs | `src/app/api/admin/jobs/`, `src/lib/admin/cron.ts` | the two scheduled jobs and their workers |
| verify | `scripts/verify*.ts`, `tests/`, `scripts/verify-plan.ts` | the registry, the harness, and every suite that proves a row |
| docs | `docs/` | SPEC, STATUS, SETUP, FEATURES, RELEASE-READINESS, HISTORY, DEPLOYMENT, GO-LIVE, OPERATIONS, VERIFY |

## Milestones

| Tag | Delivered |
| --- | --- |
| `r0`–`r4` | public site, portals, admin workspace, leads, exams, SMS layer, reports foundation |
| `r5-verified` | R5: dues engine, cashbook, recycle bin, provider debt, 59/59 registry rows |
| `r6-verified` | R6: report engine + export/print, backup door, usage meter, retention, role matrix, 67/67 |
| `r7-verified` | R7: deployment docs, go-live checklist, operations guide — this milestone |

## Documentation index

- `docs/SPEC.md` — the requirement spec and its change log.
- `docs/STATUS.md` — what works today, module by module, with evidence; read this before touching code.
- `docs/SETUP.md` — local test run, admin login, MongoDB Atlas, Gemini AI and YouTube setup.
- `docs/FEATURES.md` — achievements, staff roles, blog and lecture sheets, public AI and practice tests.
- `docs/RELEASE-READINESS.md` — the launch blockers and the public-site handoff.
- `docs/HISTORY.md` — milestone records, checkpoints and design reviews, kept for context.
- `docs/DEPLOYMENT.md` — staging deployment, Atlas, Vercel, cron, BulkSMSBD, troubleshooting.
- `docs/GO-LIVE.md` — the owner's production launch checklist, step by step.
- `docs/OPERATIONS.md` — monthly backups, storage monitoring, recycle bin, handover.
- `docs/G2-OPERATOR-SCREENS.md` — the operator's screens after the group 2 pass: the dashboard's two tiers, the SMS centre's three cards, the five menu groups, the phone rules, and a ten-step click checklist.
- `docs/VERIFY.md` — how the verification harness reads and writes evidence.
- `docs/PRIVACY-DRAFT.md` — the unapproved privacy-policy working draft.
