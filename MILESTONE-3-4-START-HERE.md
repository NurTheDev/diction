# Milestones 3 and 4 — legacy fee review, portal links and the month-end due list

Testing handoff, not a production-ready release. Nothing deletes old records, and no real SMS is sent.

## What changed in the menu

Under শিক্ষার্থী ও হিসাব the old “ফি ও হিসাব” item is gone. It is replaced by **বকেয়া তালিকা** (`/admin/students/dues`) and **পুরোনো ফি যাচাই** (`/admin/students/legacy-review`). Both old fee URLs still exist and simply redirect to the legacy review page. The old fee module, its invoices and its payments are untouched.

## Legacy fees → new ledger (Milestone 3)

1. Open পুরোনো ফি যাচাই. Each old student shows exact-name/phone **suggestions** for a new student; a suggestion is not proof of identity.
2. Where nothing matches, link manually under “পরিচয় মিলিয়ে লিংক করুন”, record how you verified it and tick the confirmation. Linking writes only the identity link.
3. Open the linked student's dry-run (`/admin/students/legacy-review/preview?legacy=…&center=…`). It shows every legacy invoice and payment with exact poisha, method, date, reference and void status, plus a review fingerprint. It writes nothing.
4. To convert, tick the review box and type **রূপান্তর নিশ্চিত**. Conversion copies exact amounts, methods, dates and references into the new ledger, marks payments with no reference as **পুরোনো সিস্টেম**, skips voided lines and keeps every legacy record. Re-running the same request changes nothing.
5. Anything that cannot be reconciled (stale source, unaccounted invoice balance, duplicate reference, receipt already used) is refused with nothing written.

## Portal links (Milestone 3)

On a student profile use **পোর্টাল অ্যাকাউন্ট লিংক** to link an existing login account.

- A student account links exactly one student. A guardian account may link several siblings.
- Linked accounts get a read-only view of that student's payment history, current dues, results, class notices and basic profile, authorised server-side by the linked student IDs.
- Other students, admin data, SMS logs and internal notes are never exposed. Removed students are blocked; held students can still sign in.
- Unlinking keeps an audit record.

## Month-end due list (Milestone 4)

1. Choose a class, month and year on **বকেয়া তালিকা**. The list shows earlier unpaid or partly paid months. If the chosen month is the current month, its pending amount appears separately and is **not** counted as due.
2. Held students and removed students are excluded and reported. The selected list exports to Excel, prints or saves as PDF; the select-all box only helps you follow up rows and writes nothing.
3. **স্থায়ী বকেয়া স্ন্যাপশট** saves an immutable version for that class and month: due students only, with class, months due, amount and who/when.
4. Automatic capture is a separate endpoint, see below. The automatic snapshot is the official one; manual snapshots are extra versions.

## Automatic month-end capture

`GET /api/admin/center/month-end-scheduler` with `Authorization: Bearer <CRON_SECRET>` (a private secret of at least 32 characters). Set `DUE_SNAPSHOT_START_MONTH=YYYY-MM` to the first month that should exist, so a missed period is retried later. 00:30 Asia/Dhaka is 18:30 UTC on the previous calendar day.

- Schedule it every few minutes; a capture more than five minutes after the boundary is stored and marked **late**.
- Late captures use the ledger as it is at capture time, not a historical replay.
- Unauthorised calls get 403; invalid configuration gets 503. The response is JSON `{created,replayed,failed,targets}`.
- Without an external scheduler, automatic snapshots do not happen. Manual snapshots still work.

## Verify it yourself

`npm ci` then `npm run test-mode`; sign in as `demo-admin@example.test` / `DemoOnly-2026!` and confirm the yellow test-mode banner. Test mode uses a disposable local database and ignores any real MongoDB URI.

Automated checks are listed in `test-results/milestone-3-4-verification.txt` and screenshots are in `screenshots/milestone2/` and `screenshots/milestone3-4/`. Browser automation used disposable databases and test-only decisions; it is not a validation of your real data, and it does not approve any inferred fee. Read `PRODUCTION-READINESS-STATUS.md` before entering live data.
