# Verification protocol — `npm run verify`

Agreed with the owner on 2026-11-12. This is how a milestone becomes **verified**, and how the
owner can check a build without reading code.

## The agreement in one paragraph

For every milestone I deliver a complete runnable ZIP (never a patch). The owner runs **one
command**, `npm run verify`, which installs the test browser if missing, starts the isolated
disposable database and the app, runs every unit test and browser test, and takes screenshots at
360 px and 1440 px. It writes `verify-report.md` (one line per requirement: PASS / FAIL / NOT TESTED
and why), saves screenshots to `screenshots/<milestone>/`, and bundles everything into
`verify-output.zip`, which the owner sends back. A milestone is **"code complete, awaiting owner
verification"** until that run comes back all PASS, and **"verified"** only after. Nothing is ever
called "done" on unit tests alone. If something fails, the owner pastes the output; I fix it and
send a complete new ZIP.

## What the command does, in order

| # | Step | Proves | Needs |
| --- | --- | --- | --- |
| 1 | Node version + `node_modules` check | R0.1 | — |
| 2 | Every unit suite, run one file at a time so a single failure is named | R0.7, R0.8 | — (no database) |
| 3 | Playwright Chromium check; installs it if missing and the CDN is reachable | browser steps | internet |
| 4 | Starts `npm run test-mode` as a child: TypeScript check, production build, in-memory MongoDB replica set, demo admin, `next start` | R0.2, R0.3, R0.4, R0.5 | internet (first run downloads mongod) |
| 5 | Signs in as the demo admin over plain HTTP and loads `/bn/admin` | R0.6 | step 4 |
| 6 | Screenshot pass: 13 pages × 360 px and 1440 px, plus a horizontal-overflow measurement | R0.11 | steps 3 and 4 |
| 7 | Browser tests against that same app and database | R0.9, R0.10 | steps 3 and 4 |
| 8 | Writes `verify-report.md`, `screenshots/<milestone>/`, `verify-output.zip`; stops the app | — | — |

Safety: the child runs with `MONGODB_URI` replaced by an invalid host, so even a mistake cannot
reach a real database; test mode uses its own `dictioncoaching_test` database and destroys it on
exit. No SMS, email or Cloudinary call is made.

## Reading the report

- **✅ PASS** — demonstrated on your machine in this run, with the evidence in the same line.
- **❌ FAIL** — ran and did not pass. The line says what failed; `logs/` has the raw output.
- **⚠️ NOT TESTED** — could not run, and the line says exactly why and what would make it run
  (missing browser, blocked download, app not running). NOT TESTED is never a silent skip, and it
  never counts as a pass.
- Overall: **PASS** (everything proven), **INCOMPLETE** (nothing failed, some things unproven),
  **FAIL** (something failed). The exit code is non-zero only for FAIL, so INCOMPLETE does not look
  like a crash.

## Files

| File | Role |
| --- | --- |
| `scripts/verify.ts` | Orchestrator: runs the steps, maps results onto requirements, writes the outputs. |
| `scripts/verify-plan.ts` | The requirement registry — one entry per line of the report. |
| `scripts/verify-report.ts` | Pure report rendering (unit-tested, cannot fail on your machine). |
| `scripts/verify-zip.ts` | Dependency-free ZIP writer for `verify-output.zip` (unit-tested, round-tripped through `yauzl`). |
| `scripts/verify-screens.ts` | Signed-in screenshot pass at 360/1440 px with overflow measurement. |
| `tests/verify-report.test.ts` | Proves the harness itself: no PASS without evidence, one line per requirement, escaping, valid ZIP, every registered requirement points at a real proof. |
| `verify-report.md`, `screenshots/` | Kept in the repository as evidence. |
| `verify-output/`, `verify-output.zip` | Transfer artefacts, git-ignored. |

## Adding requirements for a new milestone (for the next agent)

1. Add entries to `scripts/verify-plan.ts` with a unique id (`R1.1`, `R1.2`, …), the plain English
   requirement, a short Bangla line, and a `proof`:
   - `{kind:'step',ref:'…'}` for a harness step (`install`, `typecheck`, `build`, `database`,
     `serve`, `signin`),
   - `{kind:'unit',ref:'test:center'}` for an npm script of unit suites,
   - `{kind:'browser',ref:'tests/<file>.integration.ts'}` for a test that drives the running app,
   - `{kind:'screens'}` for the screenshot pass.
2. Add the pages the milestone introduces to `screenPlan()` in `scripts/verify-screens.ts`.
3. Write the browser test so it accepts `TEST_ORIGIN` and `TEST_MONGO_URI` (the pattern in
   `tests/center-exams-browser.integration.ts`) and starts with the shared
   `preflight({mongo:true,browser:true,origin:…})` from `tests/helpers/env-preflight.ts`, so a
   missing prerequisite reports one actionable line instead of a stack trace.
4. Run `npm run verify -- --milestone=r1` locally before delivering, then let the owner run it.
5. Update `docs/STATUS.md` — including the "code complete, awaiting owner verification" wording —
   and the milestone's "what I click" list in `docs/R<n>-START-HERE.md`.

A requirement with no test behind it must not be added: the registry is the contract between what
the brief asks for and what is actually proven.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Download failed for url "https://fastdl.mongodb.org/…"` | Network blocks MongoDB's binary CDN (restricted office/school network, proxy, or an agent sandbox) | Normal connection; or install MongoDB and run `MONGOMS_SYSTEM_BINARY=/path/to/mongod npm run verify` |
| `Playwright Chromium is missing at …` | Browser never downloaded | `npx playwright install chromium`; on Linux also `npx playwright install-deps` (needs admin rights) |
| `The application did not answer at http://localhost:3111/api/auth/csrf` | The build or the database step failed earlier — read the `database`/`build` lines above it | Fix the earlier step |
| `EADDRINUSE` | Port busy | `npm run verify -- --port=3200` |
| Build killed, exit 137 | Out of memory | Close other programs; the build needs ~1.5 GB free |
| `error TS…` in the typecheck step | Real type error in the code | Send the report back — that is a FAIL, not an environment problem |
| Report says INCOMPLETE on the owner's machine | Something could not run that should have | Send the zip back; the NOT TESTED lines say what |

## Continuous verification (GitHub Actions)

`.github/workflows/verify.yml` runs the same protocol on **every push to the session branch**
(`arena/c33e6ed1-diction`) and on demand:

1. `npm ci`
2. `npx playwright install --with-deps chromium`
3. `npm run verify`
4. Prints `verify-report.md` into the job log **and** the job summary, then uploads
   `verify-report.md`, `verify-output.zip`, `screenshots/` and `verify-output/logs/` as the
   `verify-output` artifact (uploaded even when the run fails, kept 30 days).

The workflow is read-only (`permissions: contents: read`): it never pushes, never opens a pull
request, never deploys and never runs on `main`. MongoDB and Chromium caches are kept between runs so
a repeat run takes a few minutes instead of ten.

Value: GitHub's runners have normal internet access, so the two downloads this agent sandbox cannot
make (`fastdl.mongodb.org`, Playwright's Chromium) work there. A green run with 11/11 PASS is real
end-to-end evidence, including the 360/1440 screenshots, without the owner running anything.

**Tags:** after the owner approves a milestone, that commit is tagged (for example `r1-verified`) so
the approved version can always be returned to. No tag is created before approval.

## Manual check list ("what I click")

Each milestone ships a `docs/R<n>-START-HERE.md` with the click-through list, in Bangla and English,
sized for about ten minutes by hand. It complements this automated run; it does not replace it.
