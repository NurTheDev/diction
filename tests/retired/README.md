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
