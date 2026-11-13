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
| 7 | Browser tests against that same app **and the same database** (`TEST_MONGO_DB`) | R0.9, R0.10 | steps 3 and 4 |
| 8 | Writes `verify-report.md`, `screenshots/<milestone>/`, `verify-output.zip`; stops the app | — | — |

Safety: the child runs with `MONGODB_URI` replaced by an invalid host, so even a mistake cannot
reach a real database; test mode uses its own `dictioncoaching_test` database and destroys it on
exit. No SMS, email or Cloudinary call is made.

Two environment details that matter when reading the report:

- **`TEST_MONGO_DB`.** Test mode prints the database name it is serving, and the harness passes it
  to every attached test and to the screenshot pass. `src/lib/db.ts` derives the name from
  `CENTER_DATA_MODE`, so a test that hard-codes a name seeds a database nobody reads — the app then
  bounces the sign-in and every locator times out. That exact failure cost the first CI run its only
  FAIL; `tests/center-data-mode.test.ts` now asserts the invariant (`docs/STALE-TESTS.md` §7).
- **`CENTER_EXAM_WRITE_ENABLED=true` for this disposable database only.** Verification demonstrates
  the exam flow end to end (create → marks → total/grade → rank → publish) instead of asserting a
  disabled button, which is what the owner's rule asks for: test mode means a separate database, not
  a blocked feature. The gate is untouched in production and is scheduled for removal in R5; the
  report says so in its Notes, and the exams test still asserts the disabled-button behaviour when
  it is run without the gate.

## Reading the report

- **✅ PASS** — demonstrated on your machine in this run, with the evidence in the same line.
- **❌ FAIL** — ran and did not pass. The line says what failed; `logs/` has the raw output.
- **⚠️ NOT TESTED** — could not run, and the line says exactly why and what would make it run
  (missing browser, blocked download, app not running). NOT TESTED is never a silent skip, and it
  never counts as a pass.
- Overall: **PASS** (everything proven), **INCOMPLETE** (nothing failed, some things unproven),
  **FAIL** (something failed).

**Exit codes, and the strict mode that CI uses (owner requirement, 2026-11-13).** On a local run the
exit code is non-zero only for FAIL, so INCOMPLETE does not look like a crash: a person reads the
report, and a machine without MongoDB or a browser still gets an honest INCOMPLETE plus exit 0. In CI
that leniency is a hazard, so the workflow sets `VERIFY_STRICT=1`, and then a single NOT TESTED
requirement fails the job as surely as a FAIL does. `scripts/verify-report.ts` owns the rule
(`isStrict()` / `exitCodeFor()`), the log prints `STRICT: N requirement(s) were NOT TESTED, so this run
fails even though nothing FAILED`, and the report's INCOMPLETE paragraph says the same in writing.

Why: R3 wave A's first run came back **green** with `INCOMPLETE — 14 PASS, 0 FAIL, 18 NOT TESTED`,
because test mode had died before the typecheck, the build and the database. Nothing had complained, so
nothing had failed — and a green check that means "nothing complained" is not a green check that means
"everything was proven". A green GitHub check now means the second thing.

## Files

| File | Role |
| --- | --- |
| `scripts/verify.ts` | Orchestrator: runs the steps, maps results onto requirements, writes the outputs. |
| `scripts/verify-plan.ts` | The requirement registry — one entry per line of the report. |
| `scripts/verify-report.ts` | Pure report rendering (unit-tested, cannot fail on your machine). |
| `scripts/verify-zip.ts` | Dependency-free ZIP writer for `verify-output.zip` (unit-tested, round-tripped through `yauzl`). |
| `scripts/verify-screens.ts` | Signed-in screenshot pass at 360/1440 px with overflow measurement. |
| `tests/verify-report.test.ts` | Proves the harness itself: no PASS without evidence, one line per requirement, escaping, valid ZIP, every registered requirement points at a real proof. |
| `tests/helpers/env-preflight.ts` | Shared prerequisites (`preflight`) and `testDbName()` — the database name attached tests must use. |
| `verify-report.md`, `screenshots/` | Kept in the repository as evidence. |
| `test-results/ci-latest/` | The most recent GitHub Actions run: its report and the last 400 lines of every step log, committed back to the branch so the evidence survives even where artifact download is blocked. |
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
| Report says INCOMPLETE on the owner's machine | Something could not run that should have | Send the zip back; the NOT TESTED lines say what. In CI this is now a red run, not a green one |
| CI red with `0 FAIL` and some NOT TESTED | `VERIFY_STRICT=1`: unproven is not passed | Read the NOT TESTED lines — usually test mode died early; check `logs/test-mode-stdout.txt` |

## Continuous verification (GitHub Actions)

`.github/workflows/verify.yml` runs the same protocol on **every push to the session branch**
(`arena/c33e6ed1-diction`) and on demand:

1. `npm ci`
2. `npx playwright install --with-deps chromium`
3. `npm run verify` with `VERIFY_STRICT=1`
4. **Fails unless the report says PASS** — a second, independent gate that re-reads
   `verify-report.md` and rejects a missing report, a Result line that is not `**PASS**`, or any count
   other than `0 NOT TESTED`. It does not trust the exit code alone, and the evidence steps below run on
   `always()`, so the report explaining a red run is still committed to the branch.
5. Prints `verify-report.md` into the job log **and** the job summary.
6. Commits the evidence back to this branch: `verify-report.md` plus
   `test-results/ci-latest/` (the report and the last 400 lines of each step log). The commit
   carries the skip-ci directive so it does not start another run.
7. Uploads `verify-report.md`, `verify-output.zip`, `screenshots/` and `verify-output/logs/` as the
   `verify-output` artifact (uploaded even when the run fails, kept 30 days).

Step 6 exists because a sandbox or a locked-down network can read a run's *status* but not its
*artifacts*: with the evidence on the branch, `git pull` is enough to see why a run failed.

The workflow has `permissions: contents: write` **only** so it can push that evidence commit to this
one branch. It never opens a pull request, never merges, never deploys and never runs on `main`.
Dispatching it manually with `publish_screenshots` also commits `screenshots/<milestone>/`.
MongoDB and Chromium caches are kept between runs so a repeat run takes a few minutes instead of ten.

Value: GitHub's runners have normal internet access, so the two downloads this agent sandbox cannot
make (`fastdl.mongodb.org`, Playwright's Chromium) work there. A green run with 11/11 PASS is real
end-to-end evidence, including the 360/1440 screenshots, without the owner running anything.

**Tags:** after the owner approves a milestone, that commit is tagged (for example `r1-verified`) so
the approved version can always be returned to. No tag is created before approval.

## Two ways to break every server action at once (recorded so nobody repeats them)

Both cost a CI round in the R1 second wave (runs 43273572460 and 43274692208):

1. **A hand-copied kind list.** `src/actions/recycle.ts` validated the form's `kind` against a
   twelve-kind zod enum while the registry had grown to twenty-one, so all nine new kinds were
   answered `{status:'error'}` and no toast ever appeared. The enum is now `z.enum(recycleKinds)`
   and `tests/recycle-coverage.test.ts` asserts every registered kind parses through it.
2. **A non-function export from a `'use server'` file.** Exporting that schema (to test it) from
   the actions module corrupted the whole server-action bundle at runtime: every action in the app
   500'd, which looked like two unrelated browser-test flakes (R1.4 and R0.9) and re-ran identically.
   Next only allows async functions to be exported from `'use server'` modules; shared values belong
   in a plain module (`src/lib/admin/recycle-kinds.ts` here).

If two browser suites that share no code both time out on their first server action, suspect the
action layer itself before suspecting the tests.

A third trap, from the R1 third wave (runs 43283794682 and 43285236170), costs a round on its own:

3. **Never spread or destructure a Mongoose sub-document.** `proof-bin.ts` rewrote a milestone row
   with `{...row,deletedAt:now}` and `{deletedAt,purgeAt,...rest}=row`. A sub-document's fields are
   not own enumerable properties, so both wrote back an object with no `year` and no `title`, the
   `required` validators rejected the parent document, and the action answered `{status:'error'}` —
   which surfaces as a missing toast and a 60-second `waitFor` timeout, not as a validation error.
   Read with `.lean()` (POJOs) and write the whole array back with `updateOne` + `runValidators:true`.
   Related: a seeded `SiteSettingsContent` needs non-empty `social.youtube`/`social.facebook` —
   `required` on a String rejects `''`. And a `useActionState` effect that reloads must depend on
   the whole state object, not `state.status`, because status stays `'ok'` across two toggles.

## Manual check list ("what I click")

Each milestone ships a `docs/R<n>-START-HERE.md` with the click-through list, in Bangla and English,
sized for about ten minutes by hand. It complements this automated run; it does not replace it.
