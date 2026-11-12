# Retired tests

## center-import-browser.integration.ts.retired
Retired 2026-11-07. Reason in full: /home/user/diction/STALE-TESTS-REPORT.md (section 3).

It drove `CenterImportPreview` (sheet field, `প্রিভিউ দেখুন`, `শিক্ষার্থী জোড়া`, review-draft
upload, `.center-commit` gate). That component is no longer imported by any page:
`app/[locale]/admin/students/import/page.tsx` renders `CenterWorkbookReview` only.
Every claim it protected is covered by `workbook-preview-browser.integration.ts`
(now passing) and `center-import-e2e.integration.ts`.

Kept under `.retired` so tsc and the test runner ignore it; restore by removing the suffix
if the single-sheet importer ever comes back.

## center-cash-browser.integration.ts.retired
Retired 2026-11-12 during the R1 audit. Reason in full: /home/user/diction/docs/STALE-TESTS.md (§6).

It drove a route and a component that no longer exist in that form:
- `/admin/students/<id>/collect` is now only a `redirect()` to `/admin/students/collect?student=<id>`
  (`src/app/[locale]/admin/students/[id]/collect/page.tsx` is 4 lines long).
- `.center-cash-form` and "লেনদেন বাতিল করুন" appear only in
  `src/components/admin/center-cash-form.tsx`, which nothing in `src/` imports.
- `[name=paidOn]` is a hidden `BanglaDate` input in the live UI, so `.fill('2026-01-02')` cannot work
  (the same failure mode documented for center-exams-browser in §1).

The cash-collection feature itself is live in `src/components/admin/center-daily-collection.tsx`
(rendered by `/admin/students/collect`) and its server logic stays covered by
`tests/center-cash-batch.integration.ts` and `tests/center-daily-cash.integration.ts`.
Browser coverage of the live collection screen is a gap to rewrite in R1/R2 — tracked in
`docs/STATUS.md` §3 and `docs/R1-AUDIT.md` §D.
