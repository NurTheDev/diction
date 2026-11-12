# The three stale browser tests — disposition, reasons and verification

Status after R0 (2026-11-12): **two repaired and kept, one retired with a written reason.**
Supersedes the root `STALE-TESTS-REPORT.md` (now a pointer to this file).

| Test | Disposition | Can it run here? |
| --- | --- | --- |
| `tests/center-exams-browser.integration.ts` | **Repaired, kept** — `npm run test:browser:exams` | No — blocked by environment (§4) |
| `tests/workbook-preview-browser.integration.ts` | **Repaired, kept** — `npm run test:browser:workbook-preview` | No — blocked by environment (§4) |
| `tests/retired/center-import-browser.integration.ts.retired` | **Retired** — tests a UI that no longer exists | n/a |

All three originally failed for the same environmental reason: `next start` needs a production build
and the earlier sandbox could not complete one. Once they could run, their *real* staleness showed.

---

## 1. `center-exams-browser.integration.ts` — repaired

What was stale:

1. **Date field.** The test did `form.locator('[name=date]').fill('2026-01-02')`. The exam form
   renders the shared `BanglaDate` widget: a *hidden* `date` input fed by three visible selects
   (day / month / year). Filling a hidden input is impossible.
   → Replaced with the three selects (`দিন`, `মাস`, `বছর`).
2. **Bengali spelling variant.** `বিষয় যোগ করুন` was written with the decomposed য় (U+09DF) while
   the component uses U+09AF + U+09BC. Same letter, different code points, so `getByText` never
   matched. → Normalised the test's Bangla to the source's form.
3. **Heading locator.** `getByText('কেন্দ্রের পরীক্ষা ও ফল')` did not resolve because the text sits in
   an `<h1>` inside a flex container. → `locator('h1').filter({hasText})`.
4. **Harness.** Spawned `next start` on an ephemeral Mongo different from the one the page reads.
   → Runs against an external app (`TEST_ORIGIN` / `TEST_MONGO_URI`) and clears the persistent
   login rate-limit row before authenticating.

Substance unchanged: role scoping (`exam_manager` in, `content_editor` out), the write gate staying
closed when `CENTER_EXAM_WRITE_ENABLED` is not `true`, two subjects, mark entry, A+ ranking and
publication.

**Verified statically on 2026-11-12** (every literal the test touches was located in the source):

| Test expects | Source | Result |
| --- | --- | --- |
| `h1` "কেন্দ্রের পরীক্ষা ও ফল", `form.admin-edit`, `[name=name]`, `[name=classId]` | `center-exams/page.tsx`, `center-exam-forms.tsx:NewCenterExam` | match |
| `getByLabel('দিন'/'মাস'/'বছর')` + hidden `date` | `components/admin/bangla-date.tsx` (`aria-label={bn?'দিন':'Day'}` …, `<input type="hidden" name={name}>`) | match |
| `[name=subject-0]`, `[name=full-0]`, `[name=pass-0]` | template literals `name={`subject-${i}`}` etc. | match |
| "বিষয় যোগ করুন" | same code points as source (U+09AF U+09BC), audited byte-by-byte | match |
| `[name=confirm]`, button "পরীক্ষা তৈরি", disabled unless enabled | `disabled={!enabled||pending||!rid||state.status==='ok'}` | match |
| `.center-exam-markrow`, `getByLabel('নমুনা ছাত্র · SYNTH-EXAM বাংলা')`, "সংরক্ষণ" | `ExamMarkRow` + page passes `name={`${s.name.bn} · ${s.studentId}`}` and `aria-label={`${name} ${s.name}`}` | match |
| "ফল প্রকাশ" form + button, `.admin-heading p` "প্রকাশিত" | `PublishCenterExam`, `center-exams/[id]/page.tsx` | match |
| `content_editor` denied | `requireStaffPermission('exams')`; `getStaffPermission` grants `exams` only to admin/superadmin/`exam_manager` | match |

## 2. `workbook-preview-browser.integration.ts` — repaired

What was stale:

1. **Row count.** Asserted exactly 17 `details.center-preview-row`. The page now renders the preview
   **and** the commit panel, each listing the same 17 students → 34 rows. The 17/17 split is
   intentional, so the assertion now states 34 and says why.
2. **Duplicate names.** `filter({hasText:'Nabila Rahman'})` matched two rows (preview + commit) and
   Playwright strict mode refused to act. → targeted by position (row index 3) after confirming tab
   order.
3. **Test-mode banner.** `getByText(/টেস্ট মোড/)` only renders when `CENTER_DATA_MODE==='test'`, which
   a dev server does not set. → skipped when running externally; still asserted under the real
   test-mode build.
4. **Class 9 suggestion.** Expected `প্রস্তাবিত ক্লাস: ক্লাস ৯ BS`, but the database had only one class
   group. → the test seeds both class groups (ক্লাস ৭, ক্লাস ৯ BS) before the run.
5. **Tab summary.** `getByText('2 ট্যাব · 17 শিক্ষার্থী')` is one `<span>` whose text is split by React
   comment nodes. → `locator('span').filter({hasText:/2 ট্যাব · 17 শিক্ষার্থী/})`.
6. **Harness.** Same `next start` / separate-Mongo problem, plus `process.kill(-app.pid)` with a
   placeholder pid, which killed the test process itself. → both fixed under `TEST_ORIGIN`.

Still asserted: real XLSX auto-preview, 2 tabs / 17 students, raw total ৳226400, class suggestions,
bulk and per-row decisions, `hold` revealing its month + reason fields, draft save→load round-trip,
mismatched-draft rejection, CSV report contents, no page errors, and no horizontal overflow at 360
and 1440 px (screenshots to `screenshots/workbook-preview-wip/`).

**Verified statically on 2026-11-12:** all 16 UI literals it depends on are present in `src/`
(`সব ট্যাব দেখুন`, `কাঁচা মোট`, `প্রস্তাবিত ক্লাস`, `center-preview-row`, `center-bulk`, `লাল সারি`,
`স্থগিত শুরুর মাস (YYYY-MM)`, `সিদ্ধান্তের খসড়া সংরক্ষণ`, `একই ফাইলের খসড়া লোড করুন`,
`একই ওয়ার্কবুকের খসড়া লোড হয়েছে। এটি ইমপোর্ট নয়।`, `প্রস্তাবিত রিপোর্ট CSV ডাউনলোড`, `রসিদ`,
`এই মাসটি বকেয়া দেখাবে`, `টেস্ট মোড`, `input[name=file]`, and the absence of `input[name=sheet]`).
Its data claims also match the fixture-level unit suite that ran green today
(`center-workbook-review.test.ts`: 2 tabs, 17 students, raw ৳226400).

## 3. `center-import-browser.integration.ts` — retired

**Reason: it tests a UI that no longer exists on that route.**

Every assertion drove `CenterImportPreview` (`src/components/admin/center-import-preview.tsx`): its
file input, the manual `sheet` tab field, `select[name=classId]`, the `প্রিভিউ দেখুন` button,
`শিক্ষার্থী জোড়া: 8`, `.center-import-decisions`, the review-draft download/upload and the
`.center-commit` write gate.

Re-verified on 2026-11-12 (not just taken on trust):

- `src/app/[locale]/admin/students/import/page.tsx` renders only `CenterWorkbookReview`,
  `WorkbookHistory` and `CenterImportHistory`.
- `grep -rn "CenterImportPreview" src/ tests/` → **no import anywhere**; the component is orphaned
  code left behind when the single-sheet importer was replaced by the whole-workbook review flow.
- Therefore `input[name=sheet]` and `select[name=classId]` have count 0 on that route, and the test
  cannot pass without being rewritten into a duplicate of §2.

Not a silent retirement — the capabilities it protected are still covered:

| Retired test's claim | Covered by |
| --- | --- |
| Preview a real XLSX, count rows | `workbook-preview-browser` (2 tabs / 17 rows / ৳226400) |
| Per-row decisions incl. reject | `workbook-preview-browser` (bulk + per-row `hold`/`normal`) |
| Draft save → load → mismatch rejection | `workbook-preview-browser` |
| Write gate stays closed until enabled | `workbook-preview-browser` (commit `details` present, import blocked) |
| Role restriction (editor denied) | `center-exams-browser` (+ admin guard in `center-m2-browser`) |
| No DB writes during preview | `center-import-e2e` (counts before/after) |
| Responsive 360/768/1440 | `workbook-preview-browser` (360/1440) |

Kept under `.retired` so `tsc` and the runner ignore it; restore by removing the suffix if the
single-sheet importer ever comes back. **Open decision for the owner:** delete or keep the orphaned
`center-import-preview.tsx` (tracked in `docs/STATUS.md` §6).

## 4. Environment: what blocks these tests in the agent sandbox, and the new fail-fast

Both kept tests need (a) a MongoDB server and (b) a Playwright Chromium. In this sandbox:

- `fastdl.mongodb.org` is refused (`ECONNRESET`) → `mongodb-memory-server` cannot fetch `mongod`.
  No npm package or GitHub repo archive on the allowlist ships a usable modern `mongod`
  (checked: `@mongodb-js/atlas-local-*` is a Docker wrapper, GitHub release assets resolve to the
  blocked `release-assets.githubusercontent.com`).
- `cdn.playwright.dev` is refused → no Chromium. A Chromium obtained from npm additionally needs
  system NSS/NSPR libraries that are not installed and not downloadable here.

So the two tests are **blocked, not broken**. They now call
`tests/helpers/env-preflight.ts` first, which reports exactly what is missing and how to fix it, in
about one second:

```
Error: BLOCKED (environment, not a product bug) — tests/workbook-preview-browser.integration.ts could not start:

   - Playwright Chromium is missing at /home/user/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome.
     Fix: npx playwright install chromium

   - No local mongod binary, and the download host is not reachable from this machine
     (https://fastdl.mongodb.org/ → not reachable (ECONNRESET)). It would need mongod 8.2.6 for linux/x64 …
     Fix with ONE of:
       1. Run on a machine with normal internet access to fastdl.mongodb.org (the usual case).
       2. Reuse an existing mongod: MONGOMS_SYSTEM_BINARY=/path/to/mongod
       3. Attach to an already-running app + database:
          TEST_ORIGIN=http://127.0.0.1:3100 TEST_MONGO_URI='mongodb://127.0.0.1:27017/dictioncoaching?replicaSet=testset'

   No application code ran and no assertion was made.
```

The preflight asserts nothing and changes no behaviour: when the prerequisites exist it returns
immediately and the test runs exactly as before. Mongo URIs are redacted before they reach a log.

## 5. How to run them (owner's machine, normal internet)

```bash
npm ci
npx playwright install chromium          # once
npm test                                 # 31 unit suites, no database needed

# one-command disposable app + database
npm run test-mode                        # then http://localhost:3000/bn/admin

# browser tests, terminal 1: shared database, terminal 2: the app, terminal 3: the test
npm run test:mongo
TEST_ORIGIN=http://127.0.0.1:3100 TEST_MONGO_URI='mongodb://127.0.0.1:27017/dictioncoaching?replicaSet=testset' npm run dev -- -p 3100
TEST_ORIGIN=http://127.0.0.1:3100 TEST_MONGO_URI='mongodb://127.0.0.1:27017/dictioncoaching?replicaSet=testset' npm run test:browser:exams
npm run test:browser:workbook-preview    # starts test-mode itself when TEST_ORIGIN is unset
```
