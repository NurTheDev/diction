# SPEC — Diction Coaching Center

**This file is the project brief and the single source of truth for what must be built.**
Keep it up to date. If a decision changes a requirement below, edit the requirement here and add a
line to [Spec change log](#spec-change-log) — do not let the docs and the code disagree silently.

Companion documents:

| File | Purpose |
| --- | --- |
| `docs/STATUS.md` | What actually works today, with evidence. Read this before touching code. |
| `docs/STALE-TESTS.md` | Disposition and written reason for the three stale browser tests. |
| `docs/history/` | Older per-milestone records, kept for context. |
| `README.md`, `DEPLOYMENT.md`, `ATLAS-SETUP.md` | Setup and hosting guides (to be consolidated in R7). |

---

## 1. Role and handoff

You are taking over an in-progress project from a previous AI agent that can no longer continue.
You are a senior full-stack engineer. The project is **Diction Coaching Center** (Dhaka,
Bangladesh, Est. 2011): a bilingual (Bangla primary, English secondary) Next.js website with an
admin dashboard on MongoDB. The owner is non-technical, so everything must be simple, tested, and
delivered as a complete runnable project. The project ZIP and its docs (`docs/STATUS.md`,
`MILESTONE-*-CHANGELOG.txt`, `test-results/`, `screenshots/`) are the source of truth.
**Do not rewrite working code; extend it.**

## 2. Stack

Next.js App Router + TypeScript, MongoDB Atlas free cluster (512 MB, 100 ops/sec) with Mongoose,
Tailwind, Zod, next-intl, Auth.js, Cloudinary for files and images, Playwright for browser tests,
Vercel free hosting.

## 3. Already done (Milestones 1 to 4, by the previous agent)

> Status of each item is verified in `docs/STATUS.md`. Several of these claims are **not** backed
> by code in the delivered ZIP — see `docs/STATUS.md` § "Documentation says / code does".

- **Test mode**: isolated disposable database, one command (`npm ci`, then `npm run test-mode`),
  demo admin login. Production mode writes normally.
- **Students and classes**: admin-managed ClassGroups, student list and profile, status
  active / on hold / removed (soft delete, restorable).
- **Spreadsheet import wizard**: dry-run preview, decision table for markers, reconciliation
  report, CSV, undo, idempotent re-import.
- **Fee collection**: student search, 12 month tiles, auto amounts, cashbook receipt number,
  one-click save, void with reason, sheet view, payment history tab.
- **Shared month-status function** (paid, partial, due, current month, upcoming, waived, held).
- **Due list** with Excel/print, immutable month-end snapshots (manual button plus a scheduler
  endpoint that needs `CRON_SECRET` and `DUE_SNAPSHOT_START_MONTH`).
- **Legacy fee review/conversion** (dry run, guarded), **portal linking** (read-only
  student/guardian access to linked students only), **"admission completed"** creates a student.

Known issues: three stale browser tests (`center-import-browser`, `center-exams-browser`,
`workbook-preview-browser`) — resolved in `docs/STALE-TESTS.md`; an experimental exams module
exists but exam writes are disabled by default.

## 4. Rules that apply to all work

- Money is **integer Taka**. All date/month logic is **Asia/Dhaka**.
- UI text lives in `bn.json` and `en.json` (Bangla primary). Use the shared Bangla digit/date
  formatters. Plain, short Bangla messages. **Light theme only.**
- Mobile first (360 px) and desktop (1440 px). Reuse the existing list/form patterns,
  ConfirmDialog, toasts, empty states and skeletons.
- **Speed**: the common task must take the fewest clicks. No mandatory confirmation checkboxes.
  No core feature hidden behind a disabled-by-default switch; test mode is a separate database,
  not a blocked button.
- Financial records are **never hard-deleted** (void with reason). Every create, edit, delete,
  restore, void and SMS send writes an activity log entry.
- Server-side authorization on **every** action; Zod validation on client and server; no
  student/lead/candidate data in URLs or logs.
- Database rules: only text and numbers in MongoDB (files and images go to Cloudinary); one cached
  connection with a small pool (5 to 10); batched writes (`bulkWrite`/`insertMany`) for imports and
  logs; indexes only where queries need them; paginate lists; trim `SmsLog` and `ActivityLog` older
  than 12 months in the scheduled job.
- Secrets only in env vars. Never ask for or store production credentials in chat or code. Use mock
  providers first; **never send a real SMS without the owner's approval**.

## 5. How to work

- **One milestone at a time.** A milestone is done only when: it works in normal mode, automated
  end-to-end tests pass, you show screenshots at 360 px and 1440 px with the test output, and a cold
  start from a freshly extracted ZIP (`npm ci`, `npm run test-mode`) works.
- Keep `docs/STATUS.md` accurate (working | partial | missing | blocked). Do not call anything done
  unless demonstrated.
- Deliver a complete, runnable ZIP (never a patch), a 5-line changelog, and a "what I click" list.
  Say plainly what you could not test. **Then stop and wait for approval before the next milestone.**
- Order: **R0, R1, R2, R3, R4, R5, R6, R7.**

### 5.1 Verification protocol (added by the owner on 2026-11-12)

1. Provide ONE command, `npm run verify`, that does everything on the owner's machine: starts the
   isolated test database, installs the Playwright browser if missing, runs the unit tests and the
   browser tests, and takes screenshots at 360 px and 1440 px.
2. It writes `verify-report.md` with one line per requirement (PASS / FAIL / NOT TESTED and why),
   saves screenshots to `screenshots/<milestone>/`, and bundles both into `verify-output.zip` that
   the owner can send back.
3. The README has numbered copy-paste steps for a non-technical person (Node version, `npm ci`,
   `npm run verify`, where the report is, what to do if a step fails, with the likely error messages).
4. Milestone status words: **"code complete, awaiting owner verification"** until the owner sends
   passing output; **"verified"** only after that. **Never "done" on unit tests alone.**
5. Every milestone also ships the short "what I click" list so each feature can be checked by hand in
   about ten minutes.
6. If a test fails on the owner's machine, they paste the output; fix it and send a complete new ZIP.

Implementation: `scripts/verify*.ts`, requirement registry in `scripts/verify-plan.ts`, details in
`docs/VERIFY.md`. Every new requirement gets a registry entry **before** delivery.

---

## R0. Stabilize and document (first)

1. Read the repo and docs, run the cold start, and list what works.
2. Fix or retire the three stale tests, with a written reason for each.
3. Create `docs/SPEC.md` containing this whole brief (kept up to date) and `docs/STATUS.md`, so any
   future agent can continue the project.
4. Report in 15 lines or fewer, then continue to R1.

## R1. Delete / archive everywhere

The site currently has no delete buttons (see `docs/STATUS.md` for the exact present state: six
legacy content modules hard-delete today, with no Recycle Bin and no restore).

1. **Audit every admin list**: class groups/classrooms, batches, courses and packages, trial class
   slots, trial bookings, admissions, contact messages, notices, batch notices, blog, demo videos,
   gallery, banners, FAQs and features, testimonials, achievements, teachers, study materials,
   lecture sheets, media library, portal accounts, exams. Produce a table of which actions (create,
   edit, delete, archive, restore) exist, then fix every gap.
2. **Policy**:
   - Simple content and records (blog, notices, videos, gallery, banners, FAQs, testimonials,
     achievements, materials, contact messages, teachers): Delete = soft delete to a **Recycle Bin**,
     restorable for 30 days, then purged by the scheduled job (Cloudinary assets removed at purge).
   - Records referenced by others (class groups, batches, courses, packages, trial slots, exams): if
     referenced, **block deletion** with a clear message listing counts ("14 students use this
     class") and offer **Archive** (hidden from new entries, kept in history). If unreferenced,
     delete (soft).
   - Trial bookings: **Cancel** (status) and **Delete** (soft, admin only). A slot with bookings can
     be archived, or its bookings must be cancelled/moved first.
   - Admissions: soft delete (admin only); blocked if converted to a student.
   - Students keep **Remove**; payments are voided, never deleted; activity logs cannot be deleted.
   - Permissions: Delete is for Admin and Super Admin; Staff can Archive/Hide.
3. **UI**: a row-action Delete that names the item in a ConfirmDialog; bulk select and delete; a
   toast with "Undo" for 10 seconds; a global **Recycle Bin** page (filter by type, restore,
   "delete forever" for Super Admin only).
4. **Tests**: delete then undo; delete then restore; blocked when referenced with the right message;
   permission checks; the 30-day purge job.

## R2. SMS (BulkSMSBD)

**Provider**: `SmsProvider` interface with `SMS_PROVIDER=mock` (default in test mode: nothing sent,
messages logged and shown as "Sent (mock)") and `bulksmsbd`. For `bulksmsbd`, read BulkSMSBD's
CURRENT official API docs and implement exactly what they say (endpoint, parameters, Unicode for
Bangla, one-message-to-many and different-messages options, balance endpoint, number format
`8801XXXXXXXXX`, all response codes mapped to plain Bangla messages, including 202 submitted,
1007 insufficient balance, 1012 masking SMS must be Bengali, 1032 IP not whitelisted).
Credentials only in `BULKSMSBD_API_KEY` and `BULKSMSBD_SENDER_ID` (server only, never logged or sent
to the browser; validate at startup; add placeholders to `.env.example`).

**Settings page**: connection status, live balance, unit cost, quiet hours (default 21:00 to 07:00),
auto-send toggles (all OFF by default), institute phone, "Send test SMS to my own number".

**ONE reusable `SendSmsDialog`**, opened from the due list, student profile/list bulk action,
payment success screen, Visitors, Teacher CVs and the SMS page:

1. Recipients summary with a collapsible list; skipped numbers shown with reasons (invalid, opted
   out, do not contact, removed student, missing phone). Choose guardian / student / both. Option:
   one message per phone for siblings.
2. Template picker or custom text with variable chips (`{student_name}`, `{class}`, `{month}`,
   `{due_amount}`, `{receipt_no}`, `{amount}`, `{due_date}`, `{institute_phone}`, `{subject}`).
3. Live preview of the first 3 messages, characters, SMS segments (Unicode: 70 for one SMS, 67 per
   segment when split; verify with the provider), estimated cost versus balance, low-balance warning.
4. **ONE green send button.** Then live progress, a result summary, and "Retry failed".

**Sending**: batches of about 100 with a queue and retries; `SmsLog` via `insertMany`; idempotency so
a double-click or refresh never sends twice; warn when the same template/student/month was sent in
the last 24 hours (offer "skip those"); respect `smsOptOut` and quiet hours; never send to removed
students; held students only for non-fee messages; normalize phones and dedupe.

**Default templates** (message content stays Bangla; editable):

- `payment_receipt`: "ডিকশন কোচিং: {student_name} এর {month} মাসের {amount} টাকা পেয়েছি। রসিদ নং {receipt_no}। ধন্যবাদ।"
- `due_reminder`: "ডিকশন কোচিং: প্রিয় অভিভাবক, {student_name} এর {month} মাসের {due_amount} টাকা বকেয়া আছে। অনুগ্রহ করে দ্রুত পরিশোধ করুন। যোগাযোগ: {institute_phone}"
- `pending_reminder` (optional, OFF): "ডিকশন কোচিং: {student_name} এর {month} মাসের {amount} টাকা আগামী {due_date} তারিখের মধ্যে দিলে ভালো হয়। ধন্যবাদ।"
- `visitor_thanks`: "ডিকশন কোচিং-এ আসার জন্য ধন্যবাদ। ভর্তি সংক্রান্ত তথ্যের জন্য যোগাযোগ করুন: {institute_phone}"
- `teacher_opening`: "ডিকশন কোচিং: আমাদের {subject} বিষয়ে শিক্ষক প্রয়োজন। আগ্রহী হলে যোগাযোগ করুন: {institute_phone}"
- `custom`/`notice`: free text.

**Integrations**: due list "Send reminder" (DUE only; current-month PENDING excluded unless switched
on); payment screen "Send receipt SMS" toggle; optional auto-send (receipt after payment; due
reminder on a chosen day via the daily scheduled job); SMS page with history, filters, retry, balance
and this month's cost; per-student opt-out.

**Tests (mock)**: a 500-recipient send in batches without timeout; double-click sends once;
invalid/missing phones skipped with reasons; sibling grouping; quiet-hours queueing; segment/cost
estimates for short and long Bangla texts; the API key never appears in browser responses or logs.

**Real provider only after the owner approves the mock version**, and then exactly ONE test message
to their own number.

## R3. Visitor leads

Replaces the owner's "Visitor sheet" spreadsheet.

**Context**: people visit or call to ask about admission; the owner writes their name and phone in a
sheet to call later. Sheet columns: Date, Name, Class, Institute (school), Number, Group
(Science/Arts/Commerce), Shift, Comments, Medium (Bangla Version / English Version). Real data is
messy: mixed date formats (`2/12/2024`, `15.12.24`), class as `XI` / `xi` / `XII` / `7` / `"New 9"` /
`"new 6"` / `"SSC 25"`, phones like `0171281709`, `0 1934-595247` or two numbers in one cell or
missing the leading 0, missing names or classes, siblings sharing one phone, Bangla comments.

**Sidebar**: new group "Admissions & Leads" (Bangla label **ভিজিটর**) with Visitors and Follow-ups;
Overview gets a "Today's follow-ups" widget.

**Model `Lead`**: `leadId`, `date` (default today), `studentName`, `guardianName` (optional),
`phones[]` (normalized `01XXXXXXXXX`, original text kept), `classLabel` (raw) + `classGroup`
(normalized, optional) + `newSession` flag ("New 9" means class 9 next session), `school`, `group`,
`shift` (Morning/Evening/Any), `medium` (Bangla/English Version/unknown), `source`
(Walk-in/Phone/Facebook/Referral/Other), `interestedIn`, `status` (New | Called | Interested | Trial
booked | Admitted | Not interested | No answer | Do not contact), `nextFollowUp`, `assignedTo`, notes
timeline `[{at, by, text, outcome}]`, links to the converted admission/student/trial booking,
`familyKey` (siblings), `deletedAt` (soft delete), `importSource`.

**UX**:

- **Quick-add** (always one tap away, also in the mobile bottom bar): name, phone, class, school;
  everything else optional; date auto-today; Enter saves; "Save and add another".
- **List**: search (name/phone/school); filters (status, class, group, shift, medium, date range,
  follow-up today/overdue/none); status count chips; each row has a call button (`tel:`), a WhatsApp
  link, an inline status dropdown, quick next-follow-up buttons (Today/Tomorrow/3 days/Next
  week/custom) and the last note.
- **Detail drawer**: all fields, notes timeline (add a note with an outcome: no answer / call back
  later / interested / not interested), history.
- **Duplicate phone detection**: warn and show existing leads; allow "add as sibling" (`familyKey`)
  or merge.
- **Actions**: Send SMS (`SendSmsDialog`; `visitor_thanks` template; bulk SMS to selected; "Do not
  contact" excluded), Book trial class (prefilled), Convert to admission/student in one click
  (prefilled, links back, status Admitted), Mark not interested with a reason.
- **Import wizard** (xlsx/csv) with the same dry-run, preview, flagged rows, undo and idempotent
  re-import as the fee import. Normalization: day-first dates (`dd/mm/yyyy`, `dd.mm.yy`; two-digit
  years mean 20xx; flag suspicious years such as 2014 among 2024 rows with a suggested fix); phone
  cleanup (strip spaces and dashes, add the leading 0, split two numbers in one cell, flag invalid
  short numbers); class normalizer (Roman numerals, "New N", SSC/HSC year batches); map Group and
  Medium columns; unknown extra columns ("Column 1", "Column 2") ask the owner for a mapping; Bangla
  comments become the first note; siblings with the same phone are flagged, not blocked; **never
  guess**.
- **Reports**: funnel (visitors, trial, admitted) by month, source and class; CSV export.
- **Permissions**: Admin and Staff; Teachers have no access.
- **Privacy**: store only what is needed; respect "Do not contact"; suggest (never auto-delete)
  archiving leads older than 18 months.

## R4. Teacher CV bank

Replaces the owner's "CV listing" spreadsheet.

**Context**: the center receives many teacher CVs and keeps their details to contact them when a
class needs a teacher. Sheet columns: Date, Name, Department, Versity (university), Subject (free
text of subjects and classes, for example `"6, 7, 8 (Math, Eng) 9-GS, Other"`,
`"Class 4 to 7 (Bangla, Emg, BGG)"`, `"HSC (ICT) SSC (Phy, Che, Math)"`), Institute (Running)
(current institution), Free time (`"3.00-6.00"`, `"ALL"`, `"After 3.00PM"`, `"Full Time Free"`),
Shifting (Morning/Evening/All), Number, Comment (Bangla/English notes such as "did not come on the
4th", "Low Quality (Che)", "NR", "payment is low"). Messy: dates like `27/11/2024`, `13.11.24` and
the typo `15.12.14`, phones without the leading 0, one invalid short number, name-only or phone-only
rows.

**Sidebar**: "Teacher CVs" (Bangla label **শিক্ষক সিভি**) in the same group.

**Model `TeacherCandidate`**: `candidateId`, `receivedDate`, `name`, `phones[]`, `email`,
`department`, `university`, `currentInstitute`, `subjectsText` (original), `subjects[]` (tags from a
configurable subject list), `classLevels[]` (for example 4-8, 9-10, 11-12, or specific classes),
`availabilityText` (original), `shifts[]`, `expectedSalary` (optional), `cvFile` (Cloudinary URL;
PDF or image up to 5 MB; EXIF stripped; never stored in MongoDB), `photo` (optional), `source`
(Walk-in/Email/Facebook/Referral/Other), `rating` (Unrated | Poor | OK | Good | Excellent), `status`
(New | Contacted | Interview scheduled | Interviewed | Shortlisted | Waiting list | Hired | Not
suitable | No response), `interviewAt`, notes timeline, `tags`, `hiredAsTeacherId`, `deletedAt`,
`importSource`.

**UX**:

- **Quick-add**: name, phone, subjects, class levels, university; optional CV upload; Enter saves.
- **"Find a teacher" screen**: filter by subject, class level, shift, department/university, status,
  rating and an availability keyword; results with call, WhatsApp and SMS buttons; saved "teaching
  needs" (for example "Chemistry, classes 9-10, evening") listing matching candidates; "Contact
  selected" opens the `SendSmsDialog` with the `teacher_opening` template.
- **Candidate drawer**: details, CV preview/download, notes timeline, interview scheduling, status
  and rating changes.
- **Duplicate detection** by phone or email.
- **"Hire"** creates a Teacher profile in the existing Teachers module (prefilled with name,
  qualification, subjects), links back, status Hired.
- **Import wizard** from the sheet with the same normalization utilities. Subject parsing is
  best-effort: keep the original text, suggest tags and class levels the owner can edit, and never
  block on text it cannot parse.
- **Permissions**: Super Admin and Admin only (CVs are sensitive); never exposed publicly. Soft
  delete with the Recycle Bin; a reminder (not automatic deletion) to review CVs older than 12 months.
- **Optional, only if the owner asks later**: a public "Teach with us" form feeding this bank (spam
  protection, CV upload, consent line).

**Shared utilities for R3, R4 and the student import**: phone normalizer, day-first date parser,
class normalizer. Tests use clearly labelled fake fixtures that reproduce every messy case listed
above.

## R5. Exams and results

Reuse and finish the experimental exams code. **Enable exam writes in normal mode.**

- **Exam**: name, type (monthly | model test | term | class test | other), date, class groups,
  subjects with full and pass marks, status draft/published.
- **Marks grid**: students by subjects, keyboard-first (Tab/Enter moves right/down), absent toggle,
  validation against full marks, autosave in batches, paste from Excel, CSV/XLSX import by student ID
  or name.
- Auto compute total, percentage, grade (configurable `GradingScale`), pass/fail and class position
  with ties; class summary (average, highest, lowest, pass rate, subject averages).
- Publishing prompts "Send result SMS now?" with an `exam_result` template
  ("ডিকশন কোচিং: {student_name} এর {exam} ফলাফল: {marks}। মোট {total}, অবস্থান {rank}।").
- Student profile gets result history and an improvement chart; the portal Results tab shows the
  linked student's results. Optional report card PDF generated on demand.
- Teachers can enter marks only for their assigned class groups and cannot see payment data.

## R6. Retention, reports, backup, roles

- Verify what exists, then complete: **"Removed students"** page (restore with resume month,
  "purging soon" section); daily scheduled job that purges students past `purgeAt` (365 days) after
  storing an export outside MongoDB, deletes personal data and keeps an anonymized payment ledger;
  30-day notice; Super Admin early permanent delete by typing the name.
- **Reports**: daily collection, monthly collection by class and by day, cashbook check (duplicate
  and missing receipt numbers), student statement PDF, year summary; all with Excel and print/PDF.
- **Backup**: full export (Excel/JSON) for Super Admin with a monthly reminder on Overview;
  "Database usage" card (size versus 512 MB, warnings at 70% and 90%).
- **Roles**: Super Admin, Accountant/Staff, Teacher with server-side checks; complete the activity log.

## R7. Deployment and handover

README and deployment guide: Atlas free cluster in the region closest to Dhaka (cannot be changed
later), least-privilege DB user, env vars (`.env.example`), Vercel region, `CRON_SECRET` and
scheduled jobs (snapshots, purge, recycle bin, log trimming), BulkSMSBD setup (IP whitelisting must
be disabled because serverless hosting has no fixed IP; sender ID), backups, upgrade path to a paid
Atlas plan, and a go-live checklist: real data import day, a manual backup first, rotate any exposed
credentials, one real test SMS to the owner's own number.

### Go-live checklist (owner-maintained from R1 onward)

1. Set `CRON_SECRET` (≥32 chars) in the Vercel project environment; confirm `vercel.json`'s
   `0 19 * * *` schedule appears in the Vercel Crons panel.
2. **First real scheduled-job run:** after the first 01:00 Asia/Dhaka cron, read the run log and
   confirm `{"ok":true,...}` with the expected `purged` / `trim` / `proofMilestones` numbers.
   (Proven against the disposable database and by its auth contract in R1 — runs 43277249842 and
   43278522383 — but a real deployment run is a go-live item, not an R1 gate, owner decision
   2026-11-12.)
3. Manual backup before the real data import day; rotate any credential that ever appeared in a
   chat or screenshot; one real test SMS to the owner's own number.
4. Run `npm run verify` on the go-live commit and keep the `verify-output.zip` with the release.

---

## Spec change log

| Date | Change |
| --- | --- |
| 2026-11-12 | Spec captured verbatim from the owner's brief (R0 item 3). R0 findings recorded in `docs/STATUS.md`; no requirement was weakened or removed. |
| 2026-11-12 | Owner added §5.1 verification protocol (`npm run verify`, report, screenshots, `verify-output.zip`, status vocabulary). Owner decisions recorded in `docs/STATUS.md` §6: add a real `staff` role in R1; keep the five documented-but-missing features in their scheduled milestones. |
