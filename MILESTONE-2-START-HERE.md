# Milestone 2 — fee collection and sheet view

This is a testing handoff, not a production-ready release. The old fee module is unchanged. No real SMS is sent.

## Fresh start
1. Install Node.js 22.13 or newer, extract the complete ZIP, and open a terminal in the extracted `diction` folder.
2. Run `npm ci` and then `npm run test-mode`.
3. Open the local address printed in the terminal, sign in with `demo-admin@example.test` / `DemoOnly-2026!`, and verify the yellow test-mode banner.
4. Test mode creates a local disposable database and ignores your production MongoDB URI. All test data disappears when stopped. First startup may need internet access to download MongoDB. The packaged prebuild is used only when its source fingerprint matches; otherwise test mode typechecks and rebuilds.
5. Under শিক্ষার্থী ও হিসাব, open the workbook import, upload `tests/fixtures/Diction-Demo-Payment-Sheet.xlsx`, map the two classes, review suggested fees, ambiguous cells and red-row decisions, then commit. The workbook is a preview requiring your decisions; test assumptions are not approved financial records.
6. Open নগদ ফি সংগ্রহ, search and select a student, choose a month, enter a cashbook page number and press Enter. On success use রসিদ প্রিন্ট / PDF (choose Save as PDF in the browser print dialog), or পরবর্তী শিক্ষার্থী.
7. Open শিট ভিউ, choose one class and year; inspect cells, download Excel or print. Open a student and its Payment history for the ledger and reasoned edits/voids.

## Verification and limits
`test-results/milestone-2-verification.txt` records automated checks. `screenshots/milestone2/` includes 360px and 1440px test screenshots. Browser automation uses test-only choices and isolated temporary databases, including its normal-mode simulation; it does not validate your actual production database. It compared the visible and exported monthly cells against the imported valid ledger, after the test's review decisions, excluding removed students. This is not a claim that the raw workbook or test choices have been approved by the owner.

Browser PDF generation and print styling were checked automatically, but a physical printer and every printer/page-size combination were not tested. Real Atlas deployment, security, data retention, backup/restore operations, and production readiness remain unverified. Review `PRODUCTION-READINESS-STATUS.md` before entering real data. `pdfjs-dist` has a previously noted dependency advisory requiring review. No exams, SMS, legacy-fee migration or portal linking are included in this milestone.
