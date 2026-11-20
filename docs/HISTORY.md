# Project history

The chronological record of what was built and reviewed, kept for context. These are
checkpoints, not current instructions. For current state read `STATUS.md`; for launch blockers read
`RELEASE-READINESS.md`; for setup read `SETUP.md`; for feature limits read `FEATURES.md`.

## Contents

- [Milestone 1 review — workbook import](#milestone-1-review--workbook-import)
- [Early changelog](#early-changelog)
- [Milestone 2 changelog](#milestone-2-changelog)
- [Milestone 2 start-here — testing handoff](#milestone-2-start-here--testing-handoff)
- [Milestones 3–4 changelog](#milestones-34-changelog)
- [Milestones 3–4 start-here — testing handoff](#milestones-34-start-here--testing-handoff)
- [Step 02 review — navbar, hero and stats](#step-02-review--navbar-hero-and-stats)
- [Step 03 review — homepage features and class pathways](#step-03-review--homepage-features-and-class-pathways)
- [Step 04 review — public page mastheads and About](#step-04-review--public-page-mastheads-and-about)
- [Step 05 review — courses finder and cards](#step-05-review--courses-finder-and-cards)
- [Step 06 review — faculty cards and profile dialog](#step-06-review--faculty-cards-and-profile-dialog)
- [Dashboard polish round 2 review](#dashboard-polish-round-2-review)
- [Approved dashboard patterns](#approved-dashboard-patterns)
- [Admin dashboard redesign status](#admin-dashboard-redesign-status)
- [Center records — stage 1](#center-records--stage-1)
- [Center spreadsheet import — stage 2 checkpoint](#center-spreadsheet-import--stage-2-checkpoint)
- [Center module delivery checkpoint](#center-module-delivery-checkpoint)
- [Center workflow audit](#center-workflow-audit)
- [Achievement card generator — stage 1](#achievement-card-generator--stage-1)
- [R0 changelog](#r0-changelog)
- [R1 changelog](#r1-changelog)
- [R2 changelog](#r2-changelog)
- [R3 changelog](#r3-changelog)
- [Older deployment and operations guide](#older-deployment-and-operations-guide)

---

## Milestone 1 review — workbook import

> Historical record · former `docs/history/MILESTONE-1-REVIEW.md`.

**All test decisions are illustrative only, not approved financial facts.** The demo XLSX is a source fixture. Synthetic test records exist only in temporary, disposable test databases. Tests do not add an invented missing amount to the report.

### Current behavior
- All XLSX tabs are scanned together; choose the class explicitly. Each red-row, marker, receipt and missing-amount decision is reviewable and recorded with the batch. Missing amounts are not inferred: paid `Done` and receipt without amount still require an explicit amount, otherwise choose note/skip.
- Monthly fee/start month and changes are *suggested*, not established facts, from the numeric month cells with a receipt (excluding uncertain/formula and red individual cells). Any change in paid amounts is proposed as a fee change at that month; partial payments or advance payments can make this misleading. Review and edit every suggestion. Rows with no usable monthly evidence need a manually entered fee and start. A per-class bulk fee/start action is available; it replaces existing proposed history for that class.
- Guardian name, guardian phone and admission date are optional for import. A phone number in the sheet is used if valid; missing/invalid phone is shown as missing and is needed before later SMS. Admission date is proposed as the first day of the first paid month; if no usable monthly payment exists it can remain blank. Dates inferred this way are not actual verified dates. Missing-detail count is displayed. Student review and class selection are still required.
- Workbook-internal cross-student receipt collisions retain first/skip later by default; per-cell override can mark both. If a valid receipt already exists in the database, per-cell choices are keep existing (do not add incoming cell), add flagged, or skip. Existing records are never reassigned or modified. Server rechecks the existing payments under receipt locks and requires re-preview if they changed. Existing student identity duplicates still block import; this feature does not merge students.
- Post-import reconciliation separates raw-source imported/excluded/flagged/skipped buckets, ledger total and any explicitly entered amount absent in the workbook. Flagged breakdown assigns each cell once to its first applicable reason in the fixed order shown; all reasons are listed on the individual line. Both raw-source and ledger amounts are displayed because a manually entered amount is not a source amount. Report and CSV remain stored with the batch.
- Batch import is transactional, idempotent for exact replay and has guarded last-batch undo (void rather than physical deletion). Removed students retain imported payments, are hidden from ordinary active lists, and can be restored with a billing gap. Skip and hold have separate tests. Purge date is stored but automatic purge is not implemented. SMS and migration are not included.

### Test evidence and safety
- `test-results/milestone-1-final-verification.txt` contains TEST-ONLY output; the fresh final ZIP cold-start output is supplied separately as `cold-start-proof-final.txt`; the browser tests used disposable MongoDB in both application modes and no production server. Outputs and screenshots contain test decisions, not owner-approved results. `screenshots/workbook-import/` has 360/1440 views.
- Standalone typecheck, baseline unit tests, actual XLSX transaction/replay/undo tests, existing-receipt decision tests and browser tests passed. Test mode runs a standalone TypeScript check first, then builds with a memory-limited webpack configuration and its duplicate in-build typecheck disabled. Outside this explicitly scoped test build, normal configuration is unchanged.
- One-command test mode prints STARTING, runs typecheck, and uses the included prebuilt test app only when its source fingerprint matches. If application files change, it rebuilds with no MongoDB connection configured during that build. It then starts its own in-memory replica set `dictioncoaching_test`, ignores any real `MONGODB_URI`, creates the demo admin only there and erases its database on exit. No SMS is sent. First launch may need to download MongoDB; a rebuild after source changes can take a few minutes. The test build uses `.next`; do not start it alongside a production server in the same folder, and rebuild the production app separately.
- For real production back up first, use a replica-set MongoDB server, review privacy/security/retention and all interpretations, and avoid sharing secrets. Existing duplicate student identities are deliberately not merged. No real production database, Atlas deployment, SMS or legacy migration has been verified here.
- Earlier projects are preserved in `/home/user/previous_projects_complete_backup.tar.xz` (23 ZIPs verified byte-for-byte); this archive is separate from the latest complete project ZIP.

### আমি কী ক্লিক করব
1. Node 22.23.4 ব্যবহার করুন; ZIP extract করে project folder-এ `npm ci`, তারপর `npm run test-mode` চালান। `http://localhost:3000/bn/admin` খুলে demo `demo-admin@example.test` / `DemoOnly-2026!` দিয়ে প্রবেশ করুন। টেস্ট ব্যানার দেখুন।
2. **শিক্ষার্থী → স্প্রেডশিট প্রিভিউ** → `tests/fixtures/Diction-Demo-Payment-Sheet.xlsx` → **সব ট্যাব দেখুন**। প্রতিটি ট্যাবের জন্য ক্লাস নির্বাচন করুন।
3. লাল সারি/ঘর, A, Done, অসম্পূর্ণ ও ভাগাভাগি রসিদের সিদ্ধান্ত বেছে নিন। আগে থেকে থাকা রসিদের প্রতিটি ঘরে তিনটির একটি বেছে নিন; পুরোনো পেমেন্ট বদলাবে না। টাকার পরিমাণ অনুপস্থিত থাকলে প্রকৃত অঙ্ক না জানা পর্যন্ত note/skip বেছে নিন।
4. **শিক্ষার্থীর তথ্য ও ইমপোর্ট**-এ অনুমানকৃত ফি, পরিবর্তনের মাস ও তারিখ যাচাই/সম্পাদনা করুন; চাইলে প্রথম মাস ও ফি লিখে সংশ্লিষ্ট ক্লাসে প্রয়োগ করুন। প্রয়োজন হলে অভিভাবকের বিবরণ যোগ করুন; প্রতিটি শিক্ষার্থীর যাচাই চিহ্ন দিন।
5. **সিদ্ধান্তসহ ইমপোর্ট করুন** → সমীকরণ ও চিহ্নিত কারণের ভাগ দেখুন → **চূড়ান্ত রিপোর্ট CSV ডাউনলোড**। একই সিদ্ধান্ত আবার import করলে duplicate হবে না। Undo-র জন্য সর্বশেষ batch খুলে কারণ দিন; পরিবর্তিত/সংযুক্ত রেকর্ড থাকলে undo বন্ধ হবে। সরানো শিক্ষার্থী ফেরাতে **শিক্ষার্থী → সরানো শিক্ষার্থী**।

Approval is required before Milestone 2 begins.

---

## Early changelog

> Historical record · former `CHANGELOG.txt`.

1. Added editable fee/start suggestions and mid-year fee history from numeric workbook payments.
2. Made guardian details optional, displayed missing counts and added per-class bulk fee/start entry.
3. Added existing-database receipt decisions with transaction-time stale-conflict checks.
4. Added a flagged-reason reconciliation breakdown without invented missing-amount adjustments.
5. Added fingerprint-verified prebuilt test mode and a memory-limited rebuild fallback.

---

## Milestone 2 changelog

> Historical record · former `MILESTONE-2-CHANGELOG.txt`.

1. Added mobile-first daily collection with Bangla digits, grouped month payments and printable receipts.
2. Added configurable due day and shared month-status calculations, including holds and historical fee changes.
3. Added class/year sheet with status colors, totals, print and two-row Excel export.
4. Added student payment history, reasoned edits and voids, audit records and receipt-conflict safeguards.
5. Added isolated demo-data browser tests and 360/1440 screenshots; preserved the legacy fee module.

---

## Milestone 2 start-here — testing handoff

> Historical record · former `MILESTONE-2-START-HERE.md`.

This is a testing handoff, not a production-ready release. The old fee module is unchanged. No real SMS is sent.

### Fresh start
1. Install Node.js 22.13 or newer, extract the complete ZIP, and open a terminal in the extracted `diction` folder.
2. Run `npm ci` and then `npm run test-mode`.
3. Open the local address printed in the terminal, sign in with `demo-admin@example.test` / `DemoOnly-2026!`, and verify the yellow test-mode banner.
4. Test mode creates a local disposable database and ignores your production MongoDB URI. All test data disappears when stopped. First startup may need internet access to download MongoDB. The packaged prebuild is used only when its source fingerprint matches; otherwise test mode typechecks and rebuilds.
5. Under শিক্ষার্থী ও হিসাব, open the workbook import, upload `tests/fixtures/Diction-Demo-Payment-Sheet.xlsx`, map the two classes, review suggested fees, ambiguous cells and red-row decisions, then commit. The workbook is a preview requiring your decisions; test assumptions are not approved financial records.
6. Open নগদ ফি সংগ্রহ, search and select a student, choose a month, enter a cashbook page number and press Enter. On success use রসিদ প্রিন্ট / PDF (choose Save as PDF in the browser print dialog), or পরবর্তী শিক্ষার্থী.
7. Open শিট ভিউ, choose one class and year; inspect cells, download Excel or print. Open a student and its Payment history for the ledger and reasoned edits/voids.

### Verification and limits
`test-results/milestone-2-verification.txt` records automated checks. `screenshots/milestone2/` includes 360px and 1440px test screenshots. Browser automation uses test-only choices and isolated temporary databases, including its normal-mode simulation; it does not validate your actual production database. It compared the visible and exported monthly cells against the imported valid ledger, after the test's review decisions, excluding removed students. This is not a claim that the raw workbook or test choices have been approved by the owner.

Browser PDF generation and print styling were checked automatically, but a physical printer and every printer/page-size combination were not tested. Real Atlas deployment, security, data retention, backup/restore operations, and production readiness remain unverified. Review `RELEASE-READINESS.md` before entering real data. `pdfjs-dist` has a previously noted dependency advisory requiring review. No exams, SMS, legacy-fee migration or portal linking are included in this milestone.

---

## Milestones 3–4 changelog

> Historical record · former `MILESTONE-3-4-CHANGELOG.txt`.

1. Replaced the old fee menu with a live month-end due list (class/month filter, select-all, Excel, print/PDF) and a legacy fee review page.
2. Added reviewed legacy-fee conversion that keeps exact poisha, method and reference, labels missing references “পুরোনো সিস্টেম”, skips voids and deletes nothing.
3. Added one-student/one-guardian-many-siblings portal links with server-side, read-only access limited to linked students.
4. Added one-click ভর্তি সম্পন্ন → student creation with an atomic, replay-safe link back to the admission.
5. Added immutable month-end snapshots: manual “Save month-end list” plus a CRON_SECRET scheduler endpoint for 00:30 Asia/Dhaka automatic capture.

---

## Milestones 3–4 start-here — testing handoff

> Historical record · former `MILESTONE-3-4-START-HERE.md`.

Testing handoff, not a production-ready release. Nothing deletes old records, and no real SMS is sent.

### What changed in the menu

Under শিক্ষার্থী ও হিসাব the old “ফি ও হিসাব” item is gone. It is replaced by **বকেয়া তালিকা** (`/admin/students/dues`) and **পুরোনো ফি যাচাই** (`/admin/students/legacy-review`). Both old fee URLs still exist and simply redirect to the legacy review page. The old fee module, its invoices and its payments are untouched.

### Legacy fees → new ledger (Milestone 3)

1. Open পুরোনো ফি যাচাই. Each old student shows exact-name/phone **suggestions** for a new student; a suggestion is not proof of identity.
2. Where nothing matches, link manually under “পরিচয় মিলিয়ে লিংক করুন”, record how you verified it and tick the confirmation. Linking writes only the identity link.
3. Open the linked student's dry-run (`/admin/students/legacy-review/preview?legacy=…&center=…`). It shows every legacy invoice and payment with exact poisha, method, date, reference and void status, plus a review fingerprint. It writes nothing.
4. To convert, tick the review box and type **রূপান্তর নিশ্চিত**. Conversion copies exact amounts, methods, dates and references into the new ledger, marks payments with no reference as **পুরোনো সিস্টেম**, skips voided lines and keeps every legacy record. Re-running the same request changes nothing.
5. Anything that cannot be reconciled (stale source, unaccounted invoice balance, duplicate reference, receipt already used) is refused with nothing written.

### Portal links (Milestone 3)

On a student profile use **পোর্টাল অ্যাকাউন্ট লিংক** to link an existing login account.

- A student account links exactly one student. A guardian account may link several siblings.
- Linked accounts get a read-only view of that student's payment history, current dues, results, class notices and basic profile, authorised server-side by the linked student IDs.
- Other students, admin data, SMS logs and internal notes are never exposed. Removed students are blocked; held students can still sign in.
- Unlinking keeps an audit record.

### Month-end due list (Milestone 4)

1. Choose a class, month and year on **বকেয়া তালিকা**. The list shows earlier unpaid or partly paid months. If the chosen month is the current month, its pending amount appears separately and is **not** counted as due.
2. Held students and removed students are excluded and reported. The selected list exports to Excel, prints or saves as PDF; the select-all box only helps you follow up rows and writes nothing.
3. **স্থায়ী বকেয়া স্ন্যাপশট** saves an immutable version for that class and month: due students only, with class, months due, amount and who/when.
4. Automatic capture is a separate endpoint, see below. The automatic snapshot is the official one; manual snapshots are extra versions.

### Automatic month-end capture

`GET /api/admin/center/month-end-scheduler` with `Authorization: Bearer <CRON_SECRET>` (a private secret of at least 32 characters). Set `DUE_SNAPSHOT_START_MONTH=YYYY-MM` to the first month that should exist, so a missed period is retried later. 00:30 Asia/Dhaka is 18:30 UTC on the previous calendar day.

- Schedule it every few minutes; a capture more than five minutes after the boundary is stored and marked **late**.
- Late captures use the ledger as it is at capture time, not a historical replay.
- Unauthorised calls get 403; invalid configuration gets 503. The response is JSON `{created,replayed,failed,targets}`.
- Without an external scheduler, automatic snapshots do not happen. Manual snapshots still work.

### Verify it yourself

`npm ci` then `npm run test-mode`; sign in as `demo-admin@example.test` / `DemoOnly-2026!` and confirm the yellow test-mode banner. Test mode uses a disposable local database and ignores any real MongoDB URI.

Automated checks are listed in `test-results/milestone-3-4-verification.txt` and screenshots are in `screenshots/milestone2/` and `screenshots/milestone3-4/`. Browser automation used disposable databases and test-only decisions; it is not a validation of your real data, and it does not approve any inferred fee. Read `RELEASE-READINESS.md` before entering live data.

---

## Step 02 review — navbar, hero and stats

> Historical record · former `STEP02-REVIEW.md`.

This is a design-review increment, not a claim that the complete frontend overhaul is finished.

- Light public navbar, reduced-motion-aware effects, mobile full-screen menu and mobile contact bar were added. Private/dashboard areas remain unanimated.
- The hero class and subject form uses a normal GET request. Courses validates the incoming grade/subject and initializes the existing filters; this is the UI-only exception approved by the user. Routes, database models, authentication and translation files were not changed for this step.
- Floating activity labels are drawn from the existing published facilities/activities. When an item is unavailable, it is omitted rather than fabricated. The grade range is the range the existing forms support. Establishment year was explicitly supplied by the institution. The existing student and teacher counts are not used as an invented social-proof figure.
- No +500 student count, five-star rating or student avatar stack has been displayed: the existing site model has no verified, admin-editable values for those claims and no permissioned student portraits. Adding editable data would require an agreed change to the data model and admin UI.
- The bundled hero image is an **AI-generated illustration**, not an authenticated photo of Diction Coaching. Replace it with a real, appropriately consented image through the existing homepage banner manager when available. Video playback connects to YouTube only after a click; if no suitable video is known, the button links to Demo Classes.
- A pre-existing no-JavaScript streaming fallback could hide the public page indefinitely. The locale-wide loading boundary was replaced by a small public client-side navigation indicator, keeping the page and native GET course finder accessible without JavaScript. Dashboard loading states are unchanged.
- Type checks, unit suites, browser checks (including 360/768/1440, full-screen menu, no-JS navigation, preselected filters, modal, reduced motion and no floating-card/photo overlap) and an isolated production build with a mocked channel passed.
- Performance follow-up: the public UI imports the same subject identifiers from a lightweight shared module rather than the full intake validation module, and the home page sends only the four faculty records it can display to the teacher-card client. No subject values, validation rules, routes, database models or translations changed. The Bangla display font is preloaded for headings and the ribbon to reduce visible font swapping; other Bangla weights are not preloaded.
- Three local Lighthouse 12 mobile performance samples on the latest isolated production build with ephemeral MongoDB and mocked channel were **67, 82 and 79/100** (median **79**). FCP was **2.0, 1.8, 2.0 s**; LCP **5.0, 4.4, 4.5 s**; total blocking time **490, 160, 230 ms**; CLS **0.001, 0.002, 0.002**. The requested **90+ is not met**; variation is substantial, so a comparison with earlier samples does not establish a reliable speedup. This is not a deployed or real-device benchmark. Remaining bottlenecks include initial framework hydration and Bangla headline rendering. Wider changes to i18n delivery or app architecture were not made because they are outside the approved scope.

---

## Step 03 review — homepage features and class pathways

> Historical record · former `STEP03-REVIEW.md`.

This increment restyles the existing homepage benefits and class-range cards. It does not complete the broader visual overhaul.

- Benefit cards use distinct education-icon accents and a compact mobile layout. Class cards emphasize the existing grade ranges and link to the same Courses page as before. Repeated class-summary text was removed from the individual cards; the existing summary remains above them.
- Existing Bangla and English copy, four feature descriptions, class ranges, links and underlying behavior are retained. No routes, business rules, database models or translations were changed for this increment. The feature statements are existing site copy, not newly verified claims.
- Reduced-motion users do not receive card hover movement. Section styles are scoped to the homepage.
- Typecheck and all 17 unit suites passed, as did the existing UX suite. Focused checks passed for 360, 768 and 1440 pixels in Bangla and English, including no horizontal overflow, existing course destinations and a no-JavaScript course link.
- Review images are crops of full-page screenshots at 360px and 1440px, taken with reduced motion; sticky viewport controls appear in the live preview rather than within these section crops.
- Step 02's local mobile Lighthouse median of 79/100 remains below the 90+ target. Performance was not remeasured for this increment, so that earlier result should not be treated as a current score.

---

## Step 04 review — public page mastheads and About

> Historical record · former `STEP04-REVIEW.md`.

This increment refreshes the shared public-page masthead and the About page, not the entire website.

- Twelve existing public pages use the refreshed illustrated masthead, with the same titles, descriptions and breadcrumb destinations. Existing page-hero styling also provides a consistent background for other public page headers.
- The About story and mission, vision and director cards have been restyled using existing Bangla/English content. No routes, business logic, database models, translations or biographical claims were changed.
- The About image is a new AI-generated, visibly stylized illustration of a study desk, **not a photograph of the institution or its staff**. It is decorative and delivered locally, and does not claim to depict actual students or a real classroom.
- The existing 2011 founding statement is shown as a single year marker. No additional timeline milestones or dates have been invented; a fuller timeline needs verified, appropriately editable information.
- Typecheck and all 17 unit suites passed. The general UX suite passed after restarting the local server following a concurrency-related interruption. Focused browser checks covered 12 public page headers in both languages at 360, 768, 900, 1100 and 1440 pixels, checking overflow, text/art separation and breadcrumbs; an About link also passed with JavaScript disabled.
- Review images include an actual 360px viewport. To show whole sections without obstruction, the longer section images are full-page crops captured with sticky navigation and contact controls hidden; those controls remain in the live preview.
- The Step 02 local mobile Lighthouse median of 79/100 was below the requested 90+ target. Performance was not remeasured for this increment, so the earlier result is not a current score.

---

## Step 05 review — courses finder and cards

> Historical record · former `STEP05-REVIEW.md`.

This increment refreshes the existing Courses page filter and card presentation. The broader visual overhaul remains in progress.

- Native class and subject selects retain the same options and filtering behavior, including the approved hero-to-Courses initial selections. Cards have subject icons and responsive layouts; published course schedule and fee details appear only when provided by the existing course data.
- The service-free preview displays the existing general subject guide and its explanatory notice, not verified course availability, fees or schedules. Configured sites continue to display published courses, no-match messaging, or the existing error state as appropriate. No course claims or prices were fabricated.
- No routes, business logic, database models or translation files were changed. Existing contact and admission links are retained. Reduced-motion users do not receive card hover movement.
- Typecheck, all 17 unit suites and the general UX suite passed. Focused service-free checks covered Bangla and English at 360, 768 and 1440 pixels, including filters and URL-initialized no-JavaScript rendering.
- A targeted isolated production build with an ephemeral database and synthetic test-only records passed published/draft visibility, both filters, optional schedule/fee fields, empty results, and no-JavaScript initial filters. This was not the full integration suite or a live database test.
- Review images show an actual 360px viewport and full-page section crops with sticky controls hidden for readability; the controls remain in the live preview. All pictured course cards are explicitly labeled as the general guide.
- The Step 02 local mobile Lighthouse median of 79/100 was below the requested 90+ target. Performance was not remeasured for this increment, so the earlier result is not a current score.

---

## Step 06 review — faculty cards and profile dialog

> Historical record · former `STEP06-REVIEW.md`.

This increment refreshes the existing public teacher grid on the homepage and Teachers page and the existing profile dialog. The broader visual overhaul remains in progress.

- Cards use the existing published faculty data, role, name and qualification. Each opens the existing dialog, which displays the same full qualification and optional biography. No faculty profiles, names, qualifications, biographies or portraits were fabricated by this step.
- The service-free preview uses the project's existing fallback faculty records, which should be checked and updated by the institution before launch. The graduation-cap symbols are decorative placeholders, not portraits. Configured sites continue to use the existing published faculty records and image handling; supplied photographs are displayed without decorative overlays.
- No routes, business logic, database models or translation files were changed. The existing dialog requires JavaScript; the teacher names and card summaries are still rendered in the HTML without it. Hover movement is disabled under reduced motion.
- Typecheck, all 17 unit suites and the general UX suite passed. The UX suite checked every fallback teacher in both languages at 360, 768 and 1440 pixels, including dialog content, centering, Escape, focus placement and focus return.
- A targeted isolated production build with an ephemeral database and synthetic test-only records passed published/draft visibility, optional photos and biographies, dialog focus, responsive layouts and the homepage four-card limit. This was not the full integration suite or a live database test. An initial attempt inserted fixture data after static prerendering and therefore showed the cached fallback; inserting test records before the build resolved the test setup.
- Review images show an actual 360px viewport and actual dialog views. Longer grid images are full-page section crops with sticky controls hidden for readability; the controls remain in the live preview.
- The Step 02 local mobile Lighthouse median of 79/100 was below the requested 90+ target. Performance was not remeasured for this increment, so the earlier result is not a current score.

---

## Dashboard polish round 2 review

> Historical record · former `DASHBOARD-POLISH-ROUND-2.md`.

The Overview was subsequently approved. See the next section for the follow-up module work and its current limitations.

This iteration implements the Overview and shared shell first, as requested. The subsequent redesign of Admissions, Trial Bookings and the four Content Manager pages is **on hold pending approval**. Their comparison images show the shared shell/styles and shared cancellation dialog, not a completed page-specific redesign. DB schemas, routes, authentication and existing booking business actions were not changed.

### What changed
- Heading shows a first-name greeting, Dhaka date and summary from real data. Compact linked KPI cards precede side-by-side recent pending applications and today's booked trials (maximum five each), followed by icon quick tasks and a collapsible onboarding checklist. Checklist ticks are derived from existing site information, teacher photo, published notice and enabled slots; dismiss is local to the browser/user. An Overview detail drawer shows stored application or booking information, contact links and existing actions. Full application details remain available on their existing page.
- On a 360×900 screen the first applicant and trial student's names (and trial time) are visible in the stat cards without scrolling; the full tables require scrolling. On 1440×900 the two tables and example rows are above the fold. Multiple table rows, narrow windows, zoom or larger text can require scrolling. No automated check can guarantee this at every viewport height.
- Current group is opened by default and group choices are locally remembered. Sidebar brand and search remain stationary while the navigation scrolls. Exam links are grouped under one disclosure with descriptions; AI settings is hidden in navigation for everyone except superadmin. Language selection is in the user menu. The header no longer repeats the page title. The new seed name applies only when a seed creates an account; existing accounts are deliberately not overwritten.
- Investigation of **অন্যান্য কনটেন্ট**: the page filters the existing `testimonial` and `topper` editorial kinds, i.e. testimonials and top-student entries. It has been renamed **প্রশংসাপত্র ও কৃতী শিক্ষার্থী** / **Testimonials & top students**; no routes or data were split or changed.
- Hind Siliguri is used for Bangla and Latin; the Bangla digits use Noto Sans Bengali's numerals so ১ and ৬ are more distinguishable. The numeral test is in the comparison PDF and screenshot folder. Sidebar pills cap at ৯৯+ with a solid background. Shared formatters and a per-account, per-browser cookie preference are used on the Overview and sidebar counts. The setting defaults to Bangla, persists across reloads in that browser and does **not** sync across devices.
- Booking cancellation now asks for confirmation in a native accessible dialog, and still uses the existing server action. The screenshot test actually cancelled a synthetic booking against a replica-set database. No confirmation or rescheduling action was invented.

### Password reset
The application already has a reset flow at `/{locale}/forgot-password` (also linked on the login page), a token entry route `/{locale}/reset-password`, and a signed-in password change at `/{locale}/account/security`. Both change-password and forgot-password links are now visible in the user menu. Email reset is **disabled by default**: it requires `PASSWORD_RESET_ENABLED=true`, working auth/database configuration, `RESEND_API_KEY`, a verified `RESEND_FROM_EMAIL`, and the correct HTTPS `NEXTAUTH_URL` / `AUTH_URL`. See `DEPLOYMENT.md` for ownership/security prerequisites. Password reset email delivery was not tested against a real provider, and this change does not enable it in production. Existing reset/auth logic was not changed.

### Remaining constraints / acceptance gaps
- The model has only booked/cancelled booking states and no rescheduling action. A real one-click confirmation, hiding the button after confirmation, and rescheduling require backend/model changes. They have not been represented as working controls.
- User profiles have no existing display-name editing action. Adding a profile editor would change application logic and is not implemented. The current `User.name` is displayed as stored; no separate Bangla-name field exists. New seeded accounts get the requested name; existing accounts are untouched.
- The new number/date/time/class formatters and digit preference are **not yet applied to every existing dashboard module**. Other pages may still contain English AM/PM, mixed digits or raw numbers. Overview drawer fields copied directly from user submissions may include raw dates, phone numbers or identifiers. A comprehensive formatting pass must follow approval.
- The full table is not entirely above the fold on 360px; compact first-record summaries are. Long names and multiple records can change how much fits. Some page-level typography and legacy text remain; no full WCAG/contrast, real-user timing, or all-module responsiveness audit has been completed.
- Admin cancellation and detail views rely on existing authorization; AI navigation hiding does not add a new server authorization rule. There is no new server-side profile, settings or role logic.

### Validation
- Node 22.23.4 typecheck, unit test suite and webpack production build passed. `tests/admin-format.test.ts` checks sample Bengali date/time, both numeral choices and class output.
- A Playwright screenshot test with synthetic MongoDB data checked 360, 768 and 1440 px document overflow, mobile menu/search/Escape, Overview drawer, cancel/return and actual confirmed cancellation, plus digit preference changes and reload persistence. The first cancellation test failed on standalone Mongo because the existing action requires transactions; it passed when the synthetic test was switched to a replica set. The older comprehensive integration suite remains stale and was not rerun.
- Images in `docs/admin-polish-review` and the comparison PDF are generated from synthetic data, not live records. The before build is the previous round's delivered ZIP. Automated checks are not a full accessibility or production sign-off.
- Prior dependency installation reported one high-severity npm audit finding; review before deploying.

---

## Approved dashboard patterns

> Historical record · former `DASHBOARD-PAGES-POLISH.md`.

The previously reviewed Overview was approved. This revision applies the same plain, responsive list/form treatment to Admissions, Trial Bookings and the existing Blog, Notice, Demo Video and Gallery screens. Database models, routes, authentication and mutation/business logic were not changed. The existing filtered admissions CSV export and its 5,000-record limit are retained.

### Delivered
- Admissions: labeled search and status filter, clear action and result count; responsive records with shortened/copyable reference, guardian tap-to-call, localized class/date/status and a detail drawer. The drawer links to the existing full detail page, where staff can update status and notes; save feedback is visible. The drawer is opened with its labeled button rather than by clicking the entire row.
- Trial bookings: the same filter/table/card pattern, localized Dhaka class time, tap-to-call, detail drawer and cancellation confirmation. Cancelled records do not show cancellation actions.
- Blog, notice, video and gallery: type-specific list headings, labeled search and publication filter, result count, localized last-updated date, responsive cards, distinct new/edit headings, centered forms, bilingual keyboard-operable tabs, visible required-field guidance and draft/preview/publish controls. Existing server actions and validation remain the source of truth. The visible error summary and invalid indicators cover key title/video validation; this is not an exhaustive field-level validation audit.
- The browser's per-account digit preference is now also applied to these lists, dates/times, pagination, selected phone numbers, class labels and displayed references. Copying a reference copies its original stored value, not its localized display. Other dashboard modules and free-form user-entered strings are not fully migrated to the preference.
- `docs/admin-pages-polish-review.pdf` provides synthetic before/after screenshots for all ten requested list/form views at 360 and 1440 pixels. Images are full-page captures; some content is below the fold. 768px was tested for document-level overflow but not captured. The previous Overview comparison and numeral test remain in `docs/admin-polish-review.pdf`. Review PDFs and individual review screenshots are supplied separately from the source ZIP to keep the archive compact.

### Restrictions still in place
- There is no confirmed booking state or rescheduling action in the current model and business rules. Consequently, no pretend confirm/reschedule buttons have been added. True one-click confirmation and rescheduling require permission to change the backend/model.
- Email password reset remains the existing, configuration-gated feature at `/forgot-password`, linked in login and the account menu; signed-in password change is at `/account/security`. Enable only with configured auth/database, verified Resend sender and HTTPS canonical origin after the safeguards in `DEPLOYMENT.md` are met. No live email delivery test was performed. Profile display-name editing remains unimplemented because there is no existing action and backend changes were prohibited.
- Scheduled publishing, notice expiry/importance/attachments, video class/subject and metadata auto-fetch, SEO fields, and gallery albums still need backend/model changes. There is no claim of full implementation of these features. Uploaded images become public immediately, including in drafts; the existing server limit is 4 MB. Draft recovery is session-tab-only for new editorial entries; preview is text-only and does not faithfully reproduce the public page. There is no server autosave or media-library picker/crop here.
- Other modules still retain legacy formatting/patterns. Full WCAG review, real-user timed usability tests, all-module responsive testing and the older comprehensive integration suite (which has stale selectors) remain outstanding. Current screenshot tests do not prove behavior at every height, browser, zoom level or screen reader.

### Tests
- TypeScript, unit suite and webpack production build passed under Node 22.23.4. The dedicated formatter test passed.
- `tests/dashboard-pages-polish.integration.ts` used synthetic data and a Mongo replica set. At 360/768/1440 it checked each of the ten page variants for document overflow; it also checked admission search, drawer, status and note saving; booking detail and confirmed cancellation; video/gallery publishing; bilingual tab keyboard controls and validation; and digit preference in the new lists. The synthetic test harness is runtime-checked with Playwright and marked `@ts-nocheck` because of expensive third-party model inference; production sources are included in typecheck.
- `npm run test:staff-blog` passed synthetic staff permissions, blog/notice publication, media/PDF workflows and draft recovery/preview. These tests use no real production services. One high-severity dependency finding was reported at the earlier npm install and should be reviewed before deployment.

---

## Admin dashboard redesign status

> Historical record · former `ADMIN-DASHBOARD-REDESIGN-STATUS.md`.

This revision substantially expands the redesign, but **is not a claim that every requested acceptance criterion is complete**. Database models, authorization rules and existing business actions were not changed as part of this redesign. This is not an accessibility, usability or production sign-off.

### Implemented
- Light, Bangla-first administration shell with searchable, grouped and collapsible role-aware navigation, a remembered group state, active indicator, relevant counts, mobile drawer and bottom shortcuts. Header provides page title, website link, account menu and help.
- Overview has current application, trial, message and batch counts, quick tasks, recent applications, today's booked trials and a dismissible onboarding checklist. Dhaka time determines today's trial slots; cancellation uses the existing action.
- Blog, notice, video and gallery have separate list-first content entry points, filtering and pagination. Faculty, courses, trial slots and website content/FAQ now also start with searchable/filterable lists and separate new/edit views where supported. Existing server authorization remains in force.
- Bilingual editorial tabs, copy from Bangla, editor controls, image drop, draft and publish actions, leave warning and save feedback. A text-only preview shows Bangla content and cover, without rendering user HTML; it is not an exact public-page preview. For **new editorial items only**, the current tab keeps a temporary browser session copy; restoration is optional and successful server save clears it. It is not server autosave, cross-device storage, a guarantee against tab closure, or recovery for editing existing items. Do not enter sensitive data in editorial forms on shared devices. Images become public immediately on upload, even for drafts; the existing 4 MB limit remains.
- Site settings are grouped into keyboard-operable tabs; fields remain mounted so changes are retained across tabs. Faculty, course, site-content and site-settings save feedback uses a shared dismissible toast. An admin loading skeleton and expanded mobile table/card treatment are included. A native confirmation dialog is used for editorial, website content, course, material and media deletion; some other modules retain browser-native confirmations.
- Help is available on every page, with task-specific guidance for several major areas; the remaining pages use generic guidance. New UI copy is in the Bangla and English message catalogs.

### Important remaining gaps
- Not all modules have been rebuilt to the same list/form pattern; bulk operations, exports, filters, feedback, field-level validation, bilingual tabs and required shared controls are not consistent throughout the dashboard. Some legacy hard-coded copy and small text remain; exhaustive compliance with the requested copy, typography, 44px targets, contrast, keyboard and WCAG AA has not been established. A formal accessibility audit and one-/three-minute usability tests remain outstanding.
- The preview is text-only and does not show the English version or exact public rendering; recovery is limited as described above. A media-library picker, cropping, server autosave, custom three-choice unsaved-change dialog and full per-page contextual help are not implemented everywhere.
- Scheduled publishing, notice expiry/importance/attachments, YouTube title/thumbnail fetching, video class/subject and the requested SEO fields are not implemented: they need changes to existing models or business logic, which were explicitly out of scope. The booking model supports booked/cancelled only, not confirmed/completed/no-show. No controls falsely imply otherwise.
- There is no global Bengali-digit preference; new counts use the active locale. Existing uploads remain immediately public and are not malware-scanned.
- `tests/integration.test.ts` includes legacy selectors for pre-redesign faculty, course, slot and settings screens; the older full integration suite was not run against this revision and needs selector updates. Focused synthetic browser tests below do not replace it.

### Verification performed
- TypeScript typecheck, unit suite (`npm test`), and a webpack production build passed using Node 22.23.4.
- `tests/dashboard-modules.integration.ts` passed synthetic faculty, course, site-content/FAQ, slot and multi-tab settings workflows, including delete confirmation and document-level overflow checks at 360, 768 and 1440 px.
- `npm run test:staff-blog` passed synthetic role boundaries, blog/notice publishing, media/PDF behavior, deletion confirmation, new-content tab-local recovery and preview.
- Screenshot browser checks covered Overview, content list and form, Admissions and Settings at 360, 768 and 1440 px, including document-level overflow checks and mobile menu search/Escape. PNG before/after captures at 360 and 1440 are in `docs/admin-redesign-review/` and contain synthetic data. These checks do not prove every nested component or page works at all sizes.
- No real production MongoDB, Cloudinary, email, AI or other external service was exercised; broader role/security review and production checks remain necessary. A previous `npm ci` reported one high-severity dependency finding; investigate before deploying.

---

## Center records — stage 1

> Historical record · former `CENTER-RECORDS-STAGE-1.md`.

### Delivered now
The admin/superadmin student-records area offers class creation, student creation, a paginated/searchable list and a basic profile/editor. Names and phone searches use an authenticated server action rather than query strings. Bengali and English interfaces, phone normalization, integer-taka validation, duplicate warnings with explicit override, optimistic edit-conflict detection, and transactional activity logs are included. New collections are namespaced `Center*` to avoid modifying or colliding with the existing portal and fee collections. Existing portal and fee screens stay available and no old records are deleted or migrated by this release.

A superadmin-only database card estimates storage from MongoDB `dbStats` storage plus indexes against 512 MiB and shows approximate collection counts. The estimate is not an authoritative Atlas billing/quota measurement. The card displays unavailable rather than zero when stats cannot be read. No live Atlas environment has been tested. Mongoose uses a cached connection with a maximum pool of five; transactions require a MongoDB replica set (including Atlas).

The pure month calculator uses Asia/Dhaka, with the current unpaid month `PENDING` through the due day (default 10), `DUE` thereafter, past months overdue and partial months retaining `PARTIAL` with a separate overdue flag. It preserves overpayment, marks hold months as no amount due and treats payments allocated to those months as advances. A helper excludes currently held and removed students from default due lists, without erasing earlier unpaid months. These are calculation foundations only: a fee ledger, hold management, due lists, SMS and results are not operational in this stage.

### Explicitly not yet delivered
Spreadsheet import/undo; fee collection and old-fee conversion; due snapshots; SMS provider; exams and marks UI; hold/resumption controls; removal/purge; student/parent account linking; admissions-to-student creation; and migration/matching of existing records are later work. The schemas are scaffolding, not complete production workflows. The legacy and new student systems remain separate temporarily. Before treating the new student as the single source of truth, implement a reviewed, idempotent migration preview for matches, unmatched entries and possible duplicates, require manual confirmation, retain old data until verified, and convert old fee records into Payment. Do not hide old fee pages before verification. A duplicate warning is advisory; simultaneous identical submissions are not guaranteed unique.

### Verification and running locally
Use Node 22.23.4. Configure environment variables as described in the consolidated README; never commit secrets. `npm ci`, `npm run typecheck`, `npm test`, `npx tsx tests/center-month-status.test.ts`, and `npm run build -- --webpack` are relevant checks. Browser checks use Playwright and an isolated synthetic MongoDB replica set: `TMPDIR=/home/user/.cache/test-temp MONGOMS_DOWNLOAD_IGNORE_MISSING_HEADER=true npx tsx tests/center-students.integration.ts`. A local MongoDB replica set / compatible Atlas cluster is necessary for write transactions. Screenshots contain synthetic data only. This does not constitute production security, data-migration, Atlas, real provider or load verification.

---

## Center spreadsheet import — stage 2 checkpoint

> Historical record · former `CENTER-IMPORT-WIP.md`.

### Status and safety gate
A guarded, reviewed spreadsheet import exists for the supported subset below. **The full project and stage 2 are not complete and this is not production-verified.** Import writes are disabled by default; `CENTER_IMPORT_WRITE_ENABLED=true` is required on the server, after a backup, security review and acceptance testing against the real workbook. Preview and dry-run work without the flag. Only an authenticated active admin or superadmin can use the workflow. The legacy portal and fee systems are not modified, merged, hidden or deleted. No real student data was used in the tests.

At `/bn/admin/students/import` (also available under the English locale), upload an XLSX/CSV, choose the tab and class, inspect two-row-per-student data and possible existing matches, choose rows to import, explicitly fill required guardian name and admission date, and apply a reviewed class default for the starting month and fee with per-student changes. The user must confirm each student's data and fee history. Amounts in payment cells are not treated as proof of a fee schedule. The final read-only dry-run reports counts; a second explicit confirmation authorizes writes. The server re-parses the original file, compares its hash, revalidates the reviewed data and binds the approval to that exact plan and live administrator with a short-lived HMAC. No student or payment is written during preview/dry-run.

Supported cell decisions: complete numeric receipt/amount pairs; empty months; explicitly verified red styling with no special meaning; a marker explicitly confirmed as unpaid; or a marker confirmed paid with a manually verified amount, receipt or reason why no receipt exists, and explanation. Original source cells, decisions and correction explanations are stored as import-batch evidence. Unknown historical payment dates and receivers remain unknown, rather than being fabricated. Same-student receipt reuse is supported; cross-student receipt reuse requires explicit confirmation.

**Not yet supported:** importing a row/marker as a hold, removal, waiver, absence or advance, or resolving formulas automatically. Such rows must be left unselected for now; no meaning is inferred. Do not silently reinterpret them as unpaid. The screenshot-derived synthetic workbook is not the real XLSX. Real-workbook parsing, theme/conditional formatting, class tab layouts, fee histories and privacy/security must be validated with a backup before real use. CSV has no color information; conditional formatting may not be rendered. The operator must compare such colors against the original before approving.

### Batches, replay and undo
Writes are in transactional bulk chunks of at most 20 students. Repeated submission of the exact source/plan returns the previously committed batch rather than duplicating it. If a later chunk fails, the UI reports earlier committed batches and the failure; retry with the same file, selections and values. Active source-row and identity claims plus hashed, persistent student/identity/receipt lock documents reduce races with manual student creation and concurrent import chunks. A decision or student-info draft can be downloaded as JSON and reloaded on the same source; the student-info draft contains personal data and must be stored securely. Match candidates can change and must be reviewed again.

An admin can undo a batch with a reason, including from the recent batch list. Undo checks revisions and detected dependencies, soft-removes batch-created students, voids rather than deletes financial records, retains source evidence and writes an audit log. A previously issued approval cannot recreate an undone batch: obtain a new dry-run approval for any deliberate re-import. There is no permanent deletion in this workflow. Undo is blocked if imported records changed or dependent payment, waiver, result, due snapshot or SMS records exist.

### Outstanding work
- Complete and test hold/removal/waiver/absence/advance interpretations, actual workbook style mapping, real-world safety and accessibility. No real workbook was supplied to this workspace; the attached image was used to create a synthetic test fixture.
- Complete the approved legacy-student and fee migration with idempotent preview, matches/unmatched/possible duplicates, manual confirmation and old fee conversion. Keep existing pages and data until verified; the new student collections are not yet the sole source of truth.
- Finish the remaining cash collection/grid, due lists/snapshots, BulkSMSBD, exams/results, removed-student management, account linking/portal, reports/backups, roles/security/Atlas and polish stages. Consult current official BulkSMSBD documentation before implementing SMS.
- Every future writer of a related student, payment, hold, waiver, result, snapshot, SMS or account link must acquire the relevant shared student/receipt locks and bump revisions in the same transaction. Undo safety is not established for new workflows that do not do so. Do not delete lock documents while operations are active.
- Address the existing high-severity `pdfjs-dist` npm audit advisory and complete an independent security and financial reconciliation review before deployment.

### Verification
Node 22.23.4: `npm run typecheck`, `npm test`, `npx tsx tests/center-month-status.test.ts`, `npx tsx tests/center-import-preview.test.ts`, `npx tsx tests/center-import-compile.test.ts`. Browser and batch integration require synthetic MongoMemoryReplSet and Playwright, e.g. `TMPDIR=/home/user/.cache/test-temp MONGOMS_DOWNLOAD_IGNORE_MISSING_HEADER=true npx tsx tests/center-import-e2e.integration.ts` and similarly `center-import-browser.integration.ts`, `center-import-batch.integration.ts`, `center-students.integration.ts`. Production build: `npm run build -- --webpack`. These tests use synthetic records, not Atlas or the actual XLSX.

### Experimental cash collection checkpoint
A student profile links to a separate cash-entry screen for the new Center ledger. An authorized admin/superadmin may enter a physical receipt number, actual date, monthly allocations and admission/exam/other amounts in whole Taka, review the cash total and explicitly confirm. It uses a transactional cash-batch idempotency key, locks student and receipt, checks cross-student shared receipts and repeated receipt lines, records an actor and audit entry, and supports reasoned batch void without financial deletion. Payments and void history are visible in the limited recent ledger. Its safety feature flag `CENTER_CASH_WRITE_ENABLED` is **false by default**, independent of the import flag. This is an experimental subset, not complete stage 3: a read-only class/year fee grid exists, but an editable spreadsheet-like grid and financial reconciliation remain incomplete; on-hold students' advance collection is deliberately blocked rather than incorrectly clearing historical dues. Future allocation of advances, resumption/hold controls, overdue lists, snapshots, SMS and reports are not operational. Old fee data has not been migrated and old screens remain available. Treat this checkpoint as unsuitable for real production financial processing without further work, a verified backup and independent security/reconciliation review.

Additional synthetic tests: `TMPDIR=/home/user/.cache/test-temp MONGOMS_DOWNLOAD_IGNORE_MISSING_HEADER=true npx tsx tests/center-cash-batch.integration.ts` and `npx tsx tests/center-cash-browser.integration.ts` with the same environment. They cover cash total, same receipt for multiple months, cross-student receipt confirmation, idempotent retries, on-hold refusal, audit, void rather than deletion, authorization and responsive screens.

### Read-only fee grid checkpoint
`/bn/admin/students/fees-grid` shows a paginated class/year matrix from new Center records. It calculates month statuses in Asia/Dhaka, distinguishes current-month pending from overdue, and displays partial payments, hold/waiver advances and overpayments. It is not a due list or monthly snapshot, does not aggregate the old fee system, and does not implement promotion/history views. A synthetic browser test is `TMPDIR=/home/user/.cache/test-temp MONGOMS_DOWNLOAD_IGNORE_MISSING_HEADER=true npx tsx tests/center-fee-grid.integration.ts`. The complete project and staged modules remain unfinished.

#### Match-review guard (checkpoint update)
Dry-run and commit now re-check live Center-class name/guardian-phone candidates and require a `different` review decision for possible matches; explicitly select the same class in the initial preview and the import form. An exact partial retry may ignore its own active source identity. The decision is category-level, not bound to candidate IDs; candidate changes after an explicit decision and legacy-model matching are not adequately resolved. Undo may cause a stale commit to fail at review validation before the engine's `REVIEW_ALREADY_UNDONE` check. Do not treat this as completed migration or full duplicate-resolution support.

---

## Center module delivery checkpoint

> Historical record · former `CENTER-DELIVERY-STATUS.md`.

Despite the requested archive name, this is **not** a finished full-feature release. Do not use the new financial/import/SMS modules for real operations until remaining work, backups, reconciliation, security review and real-workbook acceptance tests are complete. Import and cash write flags are off by default; `CENTER_SMS_WRITE_ENABLED` and `CENTER_LEGACY_LINK_ENABLED` are also off. Never add real secrets to the repository.

### New in this checkpoint
- Admin-only read-only legacy review (`/bn/admin/students/legacy-review`) lists old student accounts, exact-name/phone Center suggestions and invoice/payment counts, flagging fractional taka, non-cash methods and missing references. Matching is approximate and exact-only; a suggestion is not identity confirmation. Legacy financial data is not copied, changed or deleted. An experimental, default-off, manually confirmed one-to-one identity link can be recorded separately with an audit reason. This is not full migration: payment conversion, invoice reconciliation and account/parent portal links remain unimplemented.
- Admin-only live overdue list (`/bn/admin/students/dues`) and authenticated CSV report for a selected current class. Partial fees become overdue after the Dhaka due day; pending/current, held and removed students are excluded. Multiple historical months, fee changes, holds and waivers are considered. It uses only new Center records, not legacy fees; class membership is current rather than historical; bounds fail closed at 1,000 students or a 20-year span. It is not a transactionally consistent immutable snapshot; concurrent writes can change calculations, and reconciliation remains necessary. CSV files contain personal information and must be handled securely.
- A low-level server-only BulkSMSBD adapter and estimated GSM/Unicode segment calculator exist, disabled by default. There is **no** SMS queue, UI, opt-out/quiet-hour enforcement, send workflow or duplicate protection; do not enable the flag. Ambiguous outcomes are not retried and provider acceptance is not proof of delivery. Provider documentation found at https://bulksmsbd.com/bulksms-api-bangladesh.php describes POST to https://bulksmsbd.net/api/smsapi and 202 for submission. Ownership, exact account-specific API behavior, Unicode billing and delivery reports remain to be verified with the actual service before use. No SMS was sent and no real credentials were used.
- Previous experimental import/undo, cash batch and read-only class/year fee grid remain as described in the Center spreadsheet import section below. Cash on hold remains blocked; legacy systems remain intact and independent.

### Still required
Complete safe reviewed, idempotent legacy migration, address historical methods/poisha and receipt ambiguity without data loss, implement snapshots, SMS end-to-end with safeguards and delivery status, exams/results, removed-student retention/restore, full reports/backups, account/parent links, new roles/security and remaining requested workflows. Real workbook marker meanings and styling remain unresolved. Existing high-severity pdfjs-dist security advisory remains. Do not infer completion of any feature from schema definitions alone.

### Tests
Node 22.23.4: production webpack build, `npm test`, `npm run typecheck`, synthetic browser tests `tests/center-dues-legacy-browser.integration.ts`, `center-fee-grid.integration.ts`, `center-cash-browser.integration.ts`, `center-import-e2e.integration.ts`; unit tests `center-dues.test.ts`, `center-due-csv.test.ts` and `center-sms-provider.test.ts` (the latter requires `NODE_OPTIONS=--conditions=react-server`). Mongo integration tests require an isolated replica set and browser binaries. These are synthetic and do not verify production services or the real workbook.

### User-confirmed migration and provider policy
Historical payments must preserve exact amounts in poisha and their original payment methods; do not round, relabel mobile/bank as cash, or invent receipt numbers. New collections remain whole-taka cash only. Identity-link records do not copy payments or claim to satisfy this conversion. Any eventual migration must preserve and reconcile voids, invoices, methods and exact amounts, prevent duplicate live dues, bind a preview to the reviewed source, remain repeat-safe, and leave old portal/fees active until independently verified. The confirmed SMS provider is bulksmsbd.net; actual credentials, account-specific documentation and delivery behaviour have not been tested.

`CENTER_LEGACY_LINK_ENABLED=true` enables only an experimental manual link, with admin authentication, explicit confirmation, reason, uniqueness checks, shared student lock, revision bump and audit. It remains off by default. Identity matches are suggestions, can be incorrect, and the current form supports only displayed exact-match candidates. The one-to-one link cannot yet be unlinked or corrected in the UI; do not enable for real records without a correction workflow, backup and full review. Synthetic tests cover link engine replay/conflicts and enabled/disabled browser forms; no real records were touched.

### Latest: experimental monthly overdue snapshots
Admin overdue list supports creating/viewing a class snapshot behind `CENTER_DUE_SNAPSHOT_WRITE_ENABLED`, disabled by default. It uses a MongoDB snapshot transaction, student locks, a request UUID for repeat submission, actor/audit records and stored student names, IDs, months (with year) and total amounts. It covers new Center records only and excludes currently held/removed students and non-overdue pending amounts. History and payments may still change after capture; the stored calculation does not recalculate. The application rejects normal Mongoose update/delete operations on snapshots, but direct database administrator access can bypass application protections; this is not a write-once storage system. New dependent writers must respect shared locks. Old fees are not included and reconciliation with legacy records is not complete. The safety flag should remain off until independent review, real-workbook validation and a verified backup. A replica-set transaction is required. This update supersedes earlier statements that there is no snapshot feature; other limitations remain.

Synthetic tests `tests/center-due-snapshot.integration.ts` cover request replay/concurrency, actor and class request binding, audit, attempted mutation and values remaining unchanged after subsequent changes. `tests/center-dues-legacy-browser.integration.ts` tests both default-off and explicitly-enabled forms. The production webpack build, baseline tests and typecheck passed. These do not establish production security or financial completeness.

### Latest: experimental Center exams and results
`/bn/admin/center-exams` provides exam-manager/admin access to one-class exams with up to eight subjects, manually reviewed full/pass marks and editable per-exam grade thresholds, single-student keyboard/tab mark entry (`A` for absence), competition ranking with ties and a guarded publish action. Writes require `CENTER_EXAM_WRITE_ENABLED=true` and are off by default. Published records are locked against further mark entry; the current UI has no correction/unpublish workflow. The result list ranks recorded students, not unentered roster members; names come from the current roster rather than a historical identity snapshot. It excludes students not currently marked active from mark entry, supports at most 500 current students/results and fails closed beyond that. No student/parent portal or SMS result delivery, detailed GPA calculation, class promotion history, teacher-scoped permissions, keyboard arrows/paste grid, real-data acceptance testing or multi-class exam UI exists. The suggested grading thresholds must be reviewed for the institution before use. User publication is internal to this admin module, not a public release.

For financial and operational safety, do not enable the new flags on real data until backups, real-workbook acceptance, access control and independent review are complete. Legacy migration, actual payment conversion, the SMS queue/delivery workflow, retention/restore/purge, full reports/backups and portal links remain unimplemented. Existing feature and exam schemas are not proof of completing the full project.

Synthetic tests `center-exam-marks.test.ts`, `center-exam-batch.integration.ts`, and `center-exams-browser.integration.ts` cover grading, invalid marks, absent/tie behavior, exam-manager access, default-off gate, two-subject creation, concurrent/stale marks, audit and publication. Baseline tests and standalone `npm run typecheck` passed. Webpack production build succeeded with TypeScript checking run separately; its in-build TypeScript step was temporarily skipped due to environment memory pressure, then the original Next config was restored. No real exam results or external services were tested.

### Latest: Center exams and results are a normal feature (R5 slice 1)

This section **supersedes** "Latest: experimental Center exams and results" above.

`CENTER_EXAM_WRITE_ENABLED` no longer exists in the code. Exam writes are not behind a flag; what
gates them is authorization — role plus the class groups a teacher is assigned to — decided once in
`src/lib/exams/exam-scope.ts` and read fresh on every request. The flag is still named in
`.env.example` as a line that says it does nothing, so an existing environment file is not silently
wrong.

What now exists beyond the earlier description: an exam covers **several classes** at once; marks are
entered on one keyboard-first grid (Enter down a column, arrows across, `A` for absence) with live
total, percentage, grade, GPA point and position, batched autosave, spreadsheet paste from the focused
cell, and CSV/XLSX upload through a preview that matches rows by student ID, roll or name in either
language and **lists** an unmatched, ambiguous or incomplete row instead of guessing it; positions are
computed **per class** (ties share a position, the next one skips, an absent student holds none);
publishing is reversible through an explicit, logged unpublish; grading scales are savable centre-wide
with GPA points and validated to cover 0–100 exactly once; and a teacher reaches their own exams from
the portal home. A teacher sees only assigned classes, and their exam view is built from a query that
never selects fee history, dues, receipts, cash or guardian numbers — asserted both by serializing the
view a teacher receives and by reading the painted screen.

Publishing can now tell a family the result. The `exam_result` template's default body is the spec's own
sentence, and its four per-student chips — the exam, that child's subject-wise marks, their total against the
exam's full mark, and their position — are filled from the rows publishing wrote, so every message quotes one
child: siblings sharing a guardian number get one message each, because their marks are not one sentence. A
child who was absent, or whom publishing has not ranked, is counted on the batch as incomplete and sent
nothing, rather than texted a total of zero. The send stays behind the `autoResult` toggle, OFF by default,
and a failure lands on the Automatic-SMS problems card instead of failing the publish. The deviation is worth
naming: §R5 of the spec asks for a "Send result SMS now?" prompt at publish time, and what exists is that
toggle honoured by publishing — the decision is made once, in advance, on the SMS page.

Still **not** delivered, and not to be inferred from the schema: the student's result history and
improvement chart, the portal Results tab for a linked student, and any report-card PDF (the rest of R5
slice 2). Names and classes still come from the current roster, not a historical snapshot; the
500-student cap still fails closed; publication remains internal to this admin module and is not a
public release. No real exam results, real workbooks or external services were used — the proofs are
synthetic and labelled নমুনা.

Synthetic tests: `tests/exam-rules.test.ts`, `tests/exam-grid.test.ts` (no database, over a real CSV
and a real XLSX built in the suite) and `tests/exam-result-message.test.ts` (no database: the result SMS
rendered through the shipped template and renderer, and what gets no message at all), `tests/exam-flow.integration.ts` (disposable database: scope,
batched marks with stale and refused rows named, absence, per-class positions, publish/unpublish,
subject and class locks, recomputed grades, two concurrent saves settling as one write, and the
payment-free teacher view) and `tests/center-exams-browser.integration.ts` (driven in the browser at
360 px and 1440 px in both languages, photographed into `screenshots/r5/`). The result send itself is proved
where the send already was: `tests/sms-dialog.integration.ts` seeds a published exam and asserts the exact
sentence each family receives, and `tests/sms-auto-problem.integration.ts` asserts that a retried send still
quotes that child's own numbers and that an exam with nothing to report is not a problem.
`tests/center-exam-batch.integration.ts` is deleted: it asserted the pre-R5 signatures, and its two
claims nothing else made — the concurrent-save race and the student revision counter — moved into
`tests/exam-flow.integration.ts`. `tests/center-exam-marks.test.ts` remains, because
`src/lib/center/exam-marks.ts` is still the engine the new rule layer reads through.

Verified in CI, not only on a workstation: run **43681561293** on commit `0308c16` reports **55 requirements
PASS, 0 FAIL, 0 NOT TESTED**, tagged `r5-verified`, with the photographs in `screenshots/r5/`. Getting there
found seven product defects that no local run could reach — a teacher refused marks for the class the screen
had just shown them, Latin digits inside otherwise Bangla sentences, a class summary that counted marked rows
and called them students, a grading-scale edit that failed on every exam with stored results because a stored
subject id is an ObjectId, a marks grid on the portal that painted catalog key paths because no provider above
it shipped its group, and two screens that scrolled sideways at 360px.

One of those is bigger than R5 and is recorded here so it is not lost: the catalog suite now checks that every
page hands its client components the group they read, and it found two screens that were broken the same way
as the teacher's grid: `/practice-tests/[slug]` and the student's practice history rendered a client component
reading `practicePublic`, which nothing shipped, so both painted key paths instead of sentences in production.
Both are fixed — `practicePublic` is two keys and the first route is public, so it joined `PUBLIC_NAMESPACES`,
the list the root layout now reads from `src/i18n/client-namespaces.ts` rather than holding its own copy.

The same check names **ten routes as debt**, and the debt is narrower than a broken screen: each imports an
admin control that a role gate never mounts — the student and parent fee screens pull in the invoice form and
its student-search picker (`center`) behind `{role==='admin'&&…}`, and the materials and notices screens of all
three portal trees pull in the publish and delete controls (`adminWork`) behind `{isAdmin&&…}`. Nothing paints;
what it costs is an admin control and its catalog group riding in the JavaScript of a student's fee screen.
`tests/i18n-catalog.test.ts` fails if that list grows and fails if a fixed route is left on it. The fix is to
split the portal component from the control only an admin mounts — and **not** to ship the group, which is the
tempting one-line answer and the wrong one: `center` holds the dues vocabulary and may be shipped to an admin
and never into the teacher, student or parent trees.

The result SMS is verified the same way: run **43686815982** on commit `84b7c0a` reports **56 requirements
PASS, 0 FAIL, 0 NOT TESTED**, the new row being **R5.5** — `tests/exam-result-message.test.ts`, which needs no
database and compares the sentence, rendered through the shipped template and the shipped renderer, with the
wording in §R5 of `SPEC.md` byte-for-byte. The first attempt failed three rows, and all three were suite
faults only CI can find: a stored `CenterExamResult` requires `recordedBy`; the result row has **no** `absent`
field, absence being the grade `ABSENT` the engine writes, so selecting one is reading a convention nobody
implemented; and the browser suite counted nine variable chips, a hard-coded claim about a catalog this slice
deliberately grew to thirteen.

Slice 2 is now finished, and the four things it finished are four different kinds of honesty. Publishing asks
first: a dialog with the review box, the result-SMS box and a count computed the way the send counts — the
same candidates, the same sibling rule, the same stored template, the same chip-completeness check — with
nothing written, and `autoResult` demoted to the box's starting state; ticked sends with the setting ignored
because the operator has just consented, unticked publishes and writes no batch, and the screen says which.
The student's profile has a Results tab with the published exams newest first and a trend drawn as SVG: an
exam the child missed is left out of the line and counted as skipped, because an absence is 0 percent and
plotting it would draw a collapse that never happened. The portal has `/dashboard/results` and
`/parent/results`, two routes for two roles, reading only the children on the account's own exact phone
number — a student never its sibling on the same guardian number, a number one digit away nothing, a removed
child nothing — through a reader that selects marks, totals, grades and positions and asks for no fee,
payment, receipt, due or number at all, which is the only way "no payment data in the portal" holds. And the
report card quotes the stored row, carries `common.brand`, leaves the remarks as two ruled lines and a
sentence saying nothing has been written yet — no field stores a teacher's remark and a card that invented
one would forge the part a family reads aloud — and under `@media print` the sidebar, header, tab bar and
toolbar take no space, which is what makes it printable rather than a screenshot of a screen.

One fault only CI could find: the prompt's count was zero for every draft exam, because `resultMessage`
refuses a row with no position and positions are written by publishing — so the prompt said "there is no
result to send" about an exam holding four marked rows, and the send that followed wrote four messages.
The refusal stayed; the ungated reader now ranks a draft per class with `positionOf`, and
`publishCenterExam` ranks with the same pure function instead of its own inline copy, so the count and the
ranks a family is texted come from one rule.

The same cross-check found a fault that had been in the send engine since R2: `sendChunks` grouped rows by
phone and transmitted only the first message of each group. For a merged sibling reminder that is correct —
one sentence, one call, two log rows — but a result send refuses to merge two children whose marks differ,
so the plan held two different bodies for one number, the second never left, and both rows were marked
`sent`. Grouping is now by phone and message. R2.8 had asserted the log rows, and the rows were right while
the wire was not; only a count that had to equal a real send could see it.

Verified: **59 requirements**, the new rows **R5.6** (the trend and the chart's geometry, pure), **R5.7**
(the history, the card's two refusals, portal identity and the prompt's count against the disposable
database, including a real send whose `sentCount` must equal the count the prompt showed) and **R5.8** (all
four screens in the browser, photographed at 360 px and 1440 px in Bangla and English into `screenshots/r5`,
including one report card under print media), with **R5.4** and **R0.13** reworded in the same patch.

---

## Center workflow audit

> Historical record · former `CENTER-WORKFLOW-AUDIT.txt`.

================================================================================
COACHING-CENTRE ADMIN — STUDENT & CLASS WORKFLOW AUDIT
================================================================================
Project : diction (Next.js + MongoDB)
Date    : 2026-11-18
Scope   : /admin/students, /admin/students/[id], /admin/students/classes,
          /admin/students/classes/[id], /admin/classes, and the server actions /
          schemas / models behind those screens
Method  : static code inspection, direct function-level reproduction where possible,
          and the repository's own test suites. No source file was modified.
Result  : 1 critical, 4 high, 7 medium, 6 low findings.

NOTE
  This report is the only file created by the audit. The application code, tests,
  schemas and data were not changed.

--------------------------------------------------------------------------------
SEVERITY KEY
--------------------------------------------------------------------------------
  Critical : wrong money / data loss / a core flow produces a materially wrong result
  High     : a core student or class operation cannot be performed correctly
  Medium   : a real workflow or accounting defect with a workaround
  Low      : confusing behaviour, edge case, hygiene, or test-suite health

--------------------------------------------------------------------------------
EXECUTIVE SUMMARY
--------------------------------------------------------------------------------
The student and class screens are functionally connected to the same MongoDB
models, but they are not one workflow. The two biggest risks are:

  1. A manual "Hold" is only a status flag. It does not write a hold period, so
     lifting the hold re-bills every month the student was held. While the student
     is held, earlier arrears also disappear from the class dues and the all-class
     summary. This is a money bug and is reported as Critical (F-01).

  2. A student cannot be moved to another class, and a student's monthly fee cannot
     be changed after enrollment. Both fields are write-once at creation. The data
     model was built for history (`classHistory`, `feeHistory`), but no action or
     screen writes a change entry (F-02, F-03).

The class screens duplicate each other with different fields: one screen can set a
room and a fee, the other can assign teachers, and neither alone can fully edit a
class (F-04). A class can also be archived while students are still on it, after
which the class disappears from the all-class dues summary and from the enrollment
picker while its students remain active (F-05).

Finally, removals never get a purge date and no purge job reads removed students,
although the product spec and the data model both describe that retention flow
(F-10). The existing test suite passes except for one Bangla month-spelling test
(F-18).

--------------------------------------------------------------------------------
FINDINGS AT A GLANCE
--------------------------------------------------------------------------------
  F-01  Critical  Hold does not record a hold period; unholding back-bills months
  F-02  High      Student cannot be moved to another class
  F-03  High      Student's monthly fee cannot be changed after enrollment
  F-04  High      Two class editors with non-overlapping capabilities
  F-05  High      Class can be archived with active students; dues summary drops it
  F-06  Medium    Archived class hub still offers enrollment; generic false error
  F-07  Medium    Class monthly fee is not applied/prefilled for new students
  F-08  Medium    Shift has two sources of truth; the two editors write different ones
  F-09  Medium    Fragile class uniqueness; archived/binned class blocks reuse
  F-10  Medium    Removed students are never purged; purgeAt is dead
  F-11  Medium    Class hub roll does not refresh after enrollment; form locks
  F-12  Medium    Restore can return a student to an archived/deleted class
  F-13  Low       Restore does not constrain the resume month
  F-14  Low       Removing the last row on the last page leaves an invalid page
  F-15  Low       Invalid class id in search becomes a hard load error
  F-16  Low       Class fee "free" vs "not set" is ambiguous and cannot be cleared
  F-17  Low       Hold/lift has no revision or lock guard
  F-18  Low       Bangla month spelling mismatch breaks test:unit:core
  ------------------------------------------------------------------------------

================================================================================
DETAILED FINDINGS
================================================================================

--------------------------------------------------------------------------------
F-01 (Critical) — HOLD DOES NOT RECORD A HOLD PERIOD; UNHOLDING BACK-BILLS
--------------------------------------------------------------------------------
Where:
  src/actions/center-students.ts:136-145      setStudentHold
  src/lib/center/dues.ts:6-12                 calculateStudentDues
  src/lib/center/month-status.ts:12-19        monthStatus / HELD month rule
  src/lib/center/dues-query.ts:9,39-44        class dues and all-class summary
  src/components/admin/students-row.tsx       row status chip / Hold menu
  src/components/admin/student-profile-actions.tsx:25-36  profile status chip

What happens today:
  setStudentHold() only changes `student.status` to 'on_hold' or 'active' and
  increments `revision`. It never appends anything to `student.holds[]`.
  calculateStudentDues() returns no dues for any student whose status is not
  'active' (line 7), and monthStatus() only treats an individual month as HELD
  when a `holds[]` period covers that month (line 15).

Consequences:
  - While the student is on hold, the class dues query (`liveClassDues`) and the
    all-class summary exclude them completely — including any arrears from before
    the hold. The money is not shown anywhere on those screens.
  - When the hold is lifted, status becomes 'active' and every month from the
    student's start month to today is billed again, because no held period was
    recorded.
  - `holdReason` (shown by the row menu as "Reason for the hold: ...") is never
    collected and is always empty for a hold made from the UI. Only imported/held
    students have a reason.

Reproduction (verified with the repository's own dues engine):
  1. Student: start 2026-01, monthly fee 1000, no payments, due day 10.
  2. Today: 2026-05-18.
  3. Put the student on hold, then lift the hold in May.

  Actual code result:
    - status 'on_hold' ........................ dues = 0
    - status 'active', no hold entry .......... dues = 5000  (Jan-May)
    - status 'active', hold entry Feb-Apr ..... dues = 2000  (Jan + May)

  The third line is the expected outcome if the hold is meant to pause fees.
  The application produces the second line, because the UI hold wrote no period.

Command used:
  npx tsx -e "import {calculateStudentDues} from './src/lib/center/dues'; ..."

Expected:
  A hold pauses the monthly fee for the months it covers, preserves arrears from
  before the hold, and the reason is stored with the period.

Actual:
  The hold pauses nothing persistently; it only hides the student from dues while
  the status is on_hold. Lifting the hold charges for the hold months.

Suggested fix:
  - On hold: append a `holds[]` entry `{start: current month, reason, recordedBy}`
    and change status in the same transaction; ask for the reason in the dialog
    (the row/profile already has a place to display it).
  - On lift: find the open hold (`!end`) and set `end` to the previous month (or
    the current month, per policy), then set status 'active'; never leave an open
    hold behind.
  - Reject a second hold and reject lifting a student who is not on hold.
  - Add a revision or student lock so hold/unhold cannot race a removal (F-17).
  - Provide a data-repair path for students already on_hold without a hold period
    (otherwise the first unhold after deployment will still back-bill).

--------------------------------------------------------------------------------
F-02 (High) — A STUDENT CANNOT BE MOVED TO ANOTHER CLASS
--------------------------------------------------------------------------------
Where:
  src/schemas/center.ts:49                    centerStudentEditSchema omits classGroup
  src/actions/center-students.ts:20-26        updateCenterStudent writes only personal fields
  src/components/admin/center-forms.tsx:12    class <select> is rendered only when !item
  src/app/[locale]/admin/students/[id]/page.tsx:13  edit form receives classes={[]}
  src/models/CenterRecords.ts:29              classHistory exists on the model
  src/actions/center-students.ts:17           classHistory is written only at creation

Reproduction:
  1. Enroll a student in Class 7.
  2. Open the student's Edit screen or the inline row edit.
  3. Look for a class field / transfer action.

Expected:
  A transfer action that changes `classGroup`, appends
  `classHistory[] {classGroup, effectiveFrom}`, keeps old payments attached to the
  old class (`classGroupAtPayment`), and applies dues from the chosen month.

Actual:
  There is no class field on any edit form and the edit schema does not accept
  `classGroup`. `classHistory` is never read anywhere in `src/` or `tests/`.
  The only workaround is a direct database edit, or remove + create a new
  student. Re-creating loses the student id, payment history, exam results,
  SMS history and any portal link.

Suggested fix:
  - Add `classGroup` to the edit schema (with an effective month) and a dedicated
    "Move class" action, guarded by the student's revision and the identity lock
    in the target class.
  - Write `classGroup` and append to `classHistory` in one transaction; update
    the roll/dues class filter and revalidate both class pages.
  - Decide the billing boundary: fees up to the move month belong to the old
    class, fees from the effective month to the new one. Payments already carry
    `classGroupAtPayment`, so the data model can support this.

--------------------------------------------------------------------------------
F-03 (High) — A STUDENT'S MONTHLY FEE CANNOT BE CHANGED AFTER ENROLLMENT
--------------------------------------------------------------------------------
Where:
  src/schemas/center.ts:49                    centerStudentEditSchema omits monthlyFee
  src/actions/center-students.ts:20-26        updateCenterStudent never writes feeHistory
  src/components/admin/center-forms.tsx:12    fee input is rendered only when !item
  src/app/[locale]/admin/students/[id]/page.tsx:13  profile edit form
  src/models/CenterRecords.ts:29              feeHistory[] effective-dated history
  src/actions/center-students.ts:17           feeHistory is written only at creation

Reproduction:
  1. Enroll a student at 1000/month.
  2. The centre raises the fee to 1200 from a chosen month.
  3. Try to change it from the student list, the profile, or the class screen.

Expected:
  Append `feeHistory[] {effectiveFrom: month, amount: 1200}` and bill from that
  month; earlier months keep 1000.

Actual:
  There is no fee field in any edit form and the update action never touches
  `feeHistory`. Every future due stays at the original amount. The class monthly
  fee is not a substitute: it is only a label/fallback on the class hub and is not
  read by the dues engine for an individual student.

Suggested fix:
  - Add a fee-change action with an effective month, append to `feeHistory`,
    validate no duplicate month, sort the history, and show the history on the
    profile.
  - Add a bulk "change fee for this class" action, since a centre normally raises
    fees class-wide.
  - Until then, at minimum surface the gap in the UI (a disabled field with an
    explanation) rather than making the operator believe the fee is editable.

--------------------------------------------------------------------------------
F-04 (High) — TWO CLASS EDITORS WITH NON-OVERLAPPING CAPABILITIES
--------------------------------------------------------------------------------
Where:
  src/components/admin/center-forms.tsx:11    CenterClassForm (legacy create)
  src/schemas/center.ts:7                     centerClassSchema (name/year/shift/level only)
  src/actions/center-students.ts:15           createCenterClass writes only those fields
  src/components/admin/center-class-edit.tsx:8,11  legacy edit fields
  src/actions/center-students.ts:128          legacy update writes only name/shift/active/teachers/fee
  src/components/admin/class-management.tsx:47-49,237-270  O1 create/edit fields
  src/actions/class-admin.ts:139-161          O1 create/update

Capability matrix:
  Field            Legacy create   Legacy edit   O1 create   O1 edit
  ---------------- --------------  ------------  ----------  -------
  name (bn/en)     yes             yes           yes         yes
  academic year    yes             immutable     yes         immutable
  shift (free)     yes             yes           via boxes   via boxes
  shifts[] keys    no              no            yes         yes
  level            yes             no            yes         yes
  room             no              no            yes         yes
  monthly fee      no              yes           yes         yes
  teachers         no              yes           no          no
  active/archive   no              yes           yes         yes

Where the screens are:
  /admin/students?new=1 and /admin/students/classes render the legacy create form.
  /admin/students/classes renders the legacy edit form and the class list.
  /admin/classes renders the O1 board and its own create/edit modal.

Reproduction:
  1. Create "Class 9" from /admin/students/classes. It has no fee and no room.
  2. Open the class hub: "Monthly fee: Not set".
  3. Try to set the room/level/fee from the same list. The legacy edit form has
     no level or room; the O1 board is a different URL.
  4. Create a class from /admin/classes. It has a room/fee/shifts, but no teacher
     assignment; teachers can only be changed on the legacy screen.

Expected:
  One canonical class editor where every stored class fact can be set and
  corrected, regardless of which "Classes" door the operator used.

Actual:
  The class record is only complete if the operator happens to use both screens.
  A typo in a level cannot be fixed from the screen that accepted it. A fee cannot
  be set at creation on the legacy screen (it must be saved, reopened and edited).

Suggested fix:
  - Make /admin/classes the canonical class screen and move teacher assignment
    there; redirect /admin/students/classes (or reduce it to a read-only list)
    so there is one create/edit path.
  - If both screens must stay, extend the legacy schema/form/action to include
    room, shifts and fee at create, and level/room/shifts at edit, keeping the
    same field set and validation on both.
  - Add a shared form component rather than two independent field lists.

--------------------------------------------------------------------------------
F-05 (High) — A CLASS CAN BE ARCHIVED WITH ACTIVE STUDENTS; DUES SUMMARY DROPS IT
--------------------------------------------------------------------------------
Where:
  src/actions/center-students.ts:112-128      legacy update sets active from the form
  src/actions/class-admin.ts:159-161          O1 update sets active from the form
  src/components/admin/center-class-edit.tsx:11  plain active checkbox
  src/components/admin/class-management.tsx:268-270  plain active checkbox
  src/lib/center/dues-query.ts:39             all-class summary reads only active classes
  src/app/[locale]/admin/students/page.tsx:13  enrollment choices read only active classes

Reproduction:
  1. Create a class with 10 active students.
  2. Uncheck "Active" on either class editor and save.
  3. Observe:
       - the class disappears from the new-student class picker;
       - the all-class dues summary no longer includes the class's dues;
       - the class hub is still reachable, still shows the students and their dues;
       - individual student rows still compute dues through liveClassDues.

Expected:
  Archiving a class is a deliberate retirement. It should either be refused while
  students are still on it, or warn with the exact count and preserve the class in
  historical dues/summary views. Students should not remain "active" in a class
  that is hidden from the active roll.

Actual:
  A checkbox silently archives the class. No count, no confirmation, no warning.
  The all-class due summary understates the centre's dues, and the class cannot be
  selected for new enrollment (correct) while its existing students continue as
  active.

Suggested fix:
  - Count non-removed students before saving `active:false`; return a warning/
    confirmation state ("10 students are still on this class").
  - Decide the dues policy: either keep archived classes in the all-class summary
    with an "Archived" badge, or move their students to another class first
    (requires F-02) and then archive.
  - Do not let the class hub offer enrollment while archived (F-06).

--------------------------------------------------------------------------------
F-06 (Medium) — ARCHIVED CLASS HUB STILL OFFERS ENROLLMENT; FALSE GENERIC ERROR
--------------------------------------------------------------------------------
Where:
  src/app/[locale]/admin/students/classes/[id]/page.tsx:40,71,98-104
  src/actions/center-students.ts:16-17
  src/components/admin/center-forms.tsx:12

Reproduction:
  1. Archive a class.
  2. Open its hub. The header correctly says "Archived", but the "Add a student
     to this class" panel is still rendered and expanded.
  3. Fill every field correctly and submit.

Expected:
  The form is hidden or disabled with a sentence such as "This class is archived.
  Activate it or choose another class first."

Actual:
  createCenterStudent() returns {status:'invalid', fields:['classGroup']} because
  the class is not active. The form renders the generic message:
    "Check the required fields and mobile numbers. Make sure the required fields
     and mobile numbers are filled in correctly."
  Every field is valid; the class is the problem. Because the class select is
  pre-chosen and the message is not tied to a visible error, the operator can
  retry forever.

Suggested fix:
  - Render the enrollment panel only when `group.active`; otherwise show the
    archived explanation and an "Activate class" link for admins.
  - Return a specific error code/message for an inactive class and display it
    next to the class field (or as a banner).

--------------------------------------------------------------------------------
F-07 (Medium) — CLASS MONTHLY FEE IS NOT APPLIED OR PREFILLED FOR NEW STUDENTS
--------------------------------------------------------------------------------
Where:
  src/components/admin/center-forms.tsx:9     ClassChoice has no monthlyFee field
  src/components/admin/center-forms.tsx:12    new-student monthlyFee starts ''
  src/actions/center-students.ts:17           fee comes only from the posted field
  src/actions/center-students.ts:113-115      comment says the class fee is "the
                                              number a new student's fee starts from"

Reproduction:
  1. Set a class monthly fee to 1200 on the O1 board / legacy edit.
  2. Open the class hub and expand Add a student.
  3. The monthly fee field is blank and required; nothing shows 1200.
  4. Type 1000 (or forget and type a different number). The student is created at
     1000; the class still says 1200.

Expected:
  Selecting/enrolling in a class prefills the student's monthly fee from the class
  (1200), editable, with the class fee visible beside it. The server can use the
  class fee as a fallback when the field is empty.

Actual:
  The two numbers are unrelated. The class hub quotes a fee the enrollment form
  does not use, so a typo creates a permanent fee difference (and F-03 means it
  cannot be corrected later).

Suggested fix:
  - Add `monthlyFee` to `ClassChoice`, prefill the student form on class selection
    and when the hub preset is used.
  - In `createCenterStudent`, if the field is empty and the class has a fee > 0,
    use it; otherwise require an explicit value.
  - Alternatively, remove the class-fee claim from the copy and make the
    relationship explicit in both directions.

--------------------------------------------------------------------------------
F-08 (Medium) — SHIFT HAS TWO SOURCES OF TRUTH; THE TWO EDITORS WRITE DIFFERENT ONES
--------------------------------------------------------------------------------
Where:
  src/models/CenterRecords.ts:19-20           `shift` (free word) and `shifts[]` (keys)
  src/lib/classes/class-shared.ts:36-41       display prefers shifts[] over shift
  src/actions/class-admin.ts:90-96,139-143,159-161
  src/actions/center-students.ts:128          legacy update writes only `shift`
  src/components/admin/center-class-edit.tsx:8  legacy shift text input
  src/lib/routine/read.ts:175-183             routine reads `shift`, not shifts[]

Reproduction A (legacy class → O1):
  1. Create a class on the legacy screen with shift "Morning".
  2. Open it on /admin/classes, tick "Evening", save.
  3. class-admin's shiftOf() refuses to overwrite a custom shift, so:
       shift  = "Morning"   (routine/timetable still offers Morning)
       shifts = ["evening"]  (O1 card displays Evening)
  4. The card and the routine now disagree about the class's shift.

Reproduction B (O1 class → legacy):
  1. Create a class on O1 with shifts [morning, evening]; shift is the Bangla
     word for morning.
  2. Edit the shift text on /admin/students/classes to "বিকাল".
  3. Only `shift` changes; `shifts` still contains morning/evening.
  4. O1 card still shows Morning/Evening; the routine now uses বিকাল.

Expected:
  One canonical shift representation. Old free-text records are migrated; both
  screens display and edit the same value; the routine derives its shifts from the
  same source.

Actual:
  Two values, and each screen writes only one of them. The O1 edit form does not
  even display the free-text `shift` it refuses to overwrite, so the operator
  cannot see which word the routine will use.

Suggested fix:
  - Normalize to the three keys (morning/day/evening) and derive the Bangla label
    from the catalog; migrate legacy words by matching/asking.
  - If free text must stay, make one field authoritative, show it in both editors,
    and update both fields together (or stop reading the other).
  - Update the routine to read `shifts[]` (or make it clear that `shift` is the
    routine's single shift and `shifts[]` is display-only).

--------------------------------------------------------------------------------
F-09 (Medium) — FRAGILE CLASS UNIQUENESS; ARCHIVED/BINNED CLASS BLOCKS REUSE
--------------------------------------------------------------------------------
Where:
  src/models/CenterRecords.ts:25              unique index {name.bn, academicYear, shift}
  src/schemas/center.ts:7                     shift is free text
  src/actions/class-admin.ts:90-96            writes the Bangla word of the first key
  src/actions/center-students.ts:15           writes the raw text
  src/actions/center-students.ts:128          legacy edit writes raw text

Reproduction A (false uniqueness):
  1. Create Class 9 / 2026 / "Morning" on the legacy screen.
  2. Create Class 9 / 2026 / "morning" (lowercase) or "সকাল".
  3. Both are created: the index is case- and script-sensitive. The centre now
     has two records for what the operator considers one section, splitting the
     roll, dues and reports.

Reproduction B (invisible duplicate):
  1. Delete a class with no students (moves it to the Recycle Bin).
  2. Create the same name/year/shift again.
  3. The insert fails with E11000 and the UI says "duplicate", but the existing
     record is hidden in the bin, so the operator cannot see or resolve it.
  4. Archived classes (active:false) are not hidden by the recycle hook and also
     reserve their name/year/shift forever.

Expected:
  One class per real section. Deleted/archived records should either not block a
  legitimate new class, or the UI should show the conflicting archived/binned
  record and offer restore/rename.

Actual:
  False duplicates are allowed; true duplicate names are blocked by invisible
  records. There is no way to diagnose the latter from the screen.

Suggested fix:
  - Canonicalize `shift` before writing (trim, case-fold, map Bangla words to
    keys) and make the uniqueness rule match the UI's model (keys or a normalized
    section key).
  - Decide whether archived classes reserve names. If they should not, make the
    index partial on live+archived policy and handle conflicts explicitly.
  - Catch E11000 and look up the conflicting record (including bin/archived) to
    tell the operator exactly what exists.

--------------------------------------------------------------------------------
F-10 (Medium) — REMOVED STUDENTS ARE NEVER PURGED; purgeAt IS DEAD
--------------------------------------------------------------------------------
Where:
  src/actions/center-students.ts:146-150      manual removal sets no purgeAt
  src/models/CenterRecords.ts:29-30           removal.purgeAt field + sparse index
  src/models/CenterRecords.ts:107             settings.purgeRetentionDays
  src/lib/center/workbook-batch.ts:8-9        only the workbook importer sets purgeAt
  src/app/api/admin/jobs/daily/route.ts:35-41 daily job calls purgeExpired only
  src/lib/admin/recycle.ts:329-332            purgeExpired scans recycleRegistry
  src/lib/admin/recycle.ts (registry)         no `student` kind
  SPEC.md:329-334                        R6 requires this flow
  STATUS.md:73                           records it as missing

Reproduction:
  1. Remove a student with a leave month and reason.
  2. Inspect the document: `removal` has removedAt/removedBy/reason/leaveDate but
     no purgeAt.
  3. Run the daily job / wait 365 days: nothing purges the student.
  4. The removed page has no "purging soon" section; personal data (name, phone,
     address) stays forever; payments are never anonymized.

Expected (per the product spec):
  A daily job that finds removed students past `purgeAt` (365 days), exports them
  outside MongoDB, deletes personal data, keeps an anonymized payment ledger, shows
  a 30-day notice and a Super Admin early permanent delete.

Actual:
  Not implemented. The only `purgeAt` written is for workbook red-row imports,
  and even that value has no consumer. `purgeRetentionDays` is not exposed in any
  settings UI.

Suggested fix:
  - Implement the R6 flow: set `purgeAt = now + retention` on manual removal;
    add the removed-student purge to the daily job; export first; anonymize/delete
    personal fields; keep the ledger; add the "purging soon" list and the Super
    Admin early delete.
  - If the policy is to retain removed students indefinitely, remove the dead
    field/setting and document that decision. Do not leave a half-wired retention
    promise in the model and docs.

--------------------------------------------------------------------------------
F-11 (Medium) — CLASS-HUB ROLL DOES NOT REFRESH AFTER ENROLLMENT; FORM LOCKS
--------------------------------------------------------------------------------
Where:
  src/components/admin/center-forms.tsx:12           no onChanged/router.refresh after success
  src/app/[locale]/admin/students/classes/[id]/page.tsx:106-107  separate list component
  src/components/admin/center-student-list.tsx:46    useState(initial) seeds once
  src/components/admin/center-student-list.tsx:55-63 list only re-reads via its own search()

Reproduction:
  1. Open a class hub with N students.
  2. Expand "Add a student to this class", fill the form, submit.
  3. The form says "Saved" and shows a View link. The roll below still shows the
     old rows until a full page reload; the enrolled-count KPI may update, which
     makes the stale roll more confusing.
  4. The submit button is now disabled because state.status === 'ok', so a second
     student cannot be added without a reload.

Expected:
  The new row appears in the roll immediately, the count updates, and the form
  resets (or offers "Add another") for the next student.

Actual:
  The list's data is client state seeded once from the server prop; revalidation
  does not re-run its `search()`. The form's action state stays 'ok', disabling
  the button.

Suggested fix:
  - Give `CenterStudentForm` an `onCreated` callback (or a shared refresh
    context) and call the list's `search`/`onChanged` after a successful create.
  - Reset the action state after success, or render the form with a changing key,
    so the next enrollment starts clean.
  - If the form is intentionally one-at-a-time, say so and provide an explicit
    "Add another" button instead of a dead disabled button.

--------------------------------------------------------------------------------
F-12 (Medium) — RESTORE CAN RETURN A STUDENT TO AN ARCHIVED/DELETED CLASS
--------------------------------------------------------------------------------
Where:
  src/actions/center-students.ts:151-155      restore never checks the class
  src/app/[locale]/admin/students/removed/page.tsx:3  restore form
  src/components/admin/center-student-list.tsx         restore menu
  src/lib/admin/recycle.ts:101-110            class delete only counts non-removed students

Reproduction A:
  1. Remove a student.
  2. Archive the student's class.
  3. Restore the student with a later resume month.
  4. Restore succeeds; the student is active in an archived class. The class hub
     still shows them; the enrollment picker no longer offers the class.

Reproduction B:
  1. Remove every student from a class (so the class delete is not blocked by
     non-removed students).
  2. Delete the class and let the Recycle Bin purge it after 30 days.
  3. Restore one of its removed students.
  4. `classGroup` points to a missing document. The profile shows class "—";
     there is no class-transfer UI (F-02) to repair it.

Expected:
  Restore validates that the class exists, is live (not in the bin) and is active.
  If not, it refuses with a specific message, or lets the operator choose a new
  class as part of the restore.

Actual:
  No class validation at all. The student can be restored into a retired or
  nonexistent class.

Suggested fix:
  - Inside the restore transaction, load the class with the recycle hook and
    check `active`.
  - If the class is unavailable, return a specific error and, once F-02 exists,
    offer a destination class.
  - Consider blocking class deletion/purge while removed students still reference
    it, or nulling/reassigning those references.

--------------------------------------------------------------------------------
F-13 (Low) — RESTORE DOES NOT CONSTRAIN THE RESUME MONTH
--------------------------------------------------------------------------------
Where:
  src/actions/center-students.ts:151-155      rejects resume <= leave as generic 'error'
  src/components/admin/students-row.tsx:230-239  restore MonthField has no notBefore
  src/components/admin/center-restore-form.tsx:4 removed-page restore form
  src/components/admin/month-popover.tsx:37-48   MonthField supports notBefore/notAfter

Reproduction:
  1. Remove a student with leave month March 2026.
  2. Open Restore, pick March 2026 (or earlier), enter a reason, submit.
  3. The action returns `{status:'error'}`; the UI says "Restore failed".

Expected:
  The picker disables months up to and including the leave month, and a manual
  attempt explains "The resume month must be after the leave month."

Actual:
  Any month is selectable; the only feedback is a generic failure.

Suggested fix:
  - Pass `notBefore` = the month after `student.leaveMonth` to both restore
    MonthFields (the component already supports it).
  - Return a specific error code/message, and display the leave month beside the
    picker.

--------------------------------------------------------------------------------
F-14 (Low) — REMOVING THE LAST ROW ON THE LAST PAGE LEAVES AN INVALID PAGE
--------------------------------------------------------------------------------
Where:
  src/components/admin/center-student-list.tsx:55-63  onChanged re-reads result.page
  src/components/admin/center-student-list.tsx:78     pages = ceil(total/20)
  src/components/admin/center-student-list.tsx:145-148 pagination display
  src/actions/center-students.ts:51-107               search clamps only to 1..10000

Reproduction:
  1. Have 21 students. Go to page 2 (1 row).
  2. Remove that student.
  3. onChanged calls search(2); the server returns no items, total 20.
  4. The list shows "page 2 of 1" and an empty table; Previous is the only way out.

Expected:
  The list re-reads page 1 (or the new last page) after a write that makes the
  current page empty.

Actual:
  Empty page with an out-of-range page number.

Suggested fix:
  - In `search`, if the returned `items` is empty and the requested page > 1,
    re-read page-1 (or clamp page to `Math.max(1, Math.ceil(total/20))` and return
    the clamped page).
  - Apply the same rule after any write that can reduce the total (remove, filter
    change).

--------------------------------------------------------------------------------
F-15 (Low) — INVALID CLASS ID IN SEARCH BECOMES A HARD LOAD ERROR
--------------------------------------------------------------------------------
Where:
  src/actions/center-students.ts:65            invalid class id -> error:true
  src/components/admin/center-student-list.tsx:110 error branch
  src/actions/center-students.ts:51-107        searchCenterStudents

Reproduction:
  Call searchCenterStudents with `classId:'not-an-id'`, or reach the list with a
  stale/incorrect class id (e.g. a preserved client state or a crafted request).

Expected:
  An empty result with a specific "class not found" message, or ignore the filter.

Actual:
  `{items:[], total:0, page, error:true}`. The list shows the generic "data could
  not be read" state, which blames the server for a bad filter.

Suggested fix:
  - Return an `invalidClass` flag (or treat a non-ObjectId class as no class) and
    show a filter-level explanation; reserve `error:true` for actual read
    failures.

--------------------------------------------------------------------------------
F-16 (Low) — CLASS FEE "FREE" VS "NOT SET" IS AMBIGUOUS AND CANNOT BE CLEARED
--------------------------------------------------------------------------------
Where:
  src/schemas/center.ts:21-34                 comment: 0 = free, blank = not decided
  src/models/CenterRecords.ts:20-22           comment: 0 = not set
  src/actions/center-students.ts:112-120      blank = leave unchanged
  src/actions/class-admin.ts:127,142          blank on create -> 0
  src/components/admin/class-management.tsx:124-125  0 displays "fee not set"
  src/messages/{bn,en}.json:5322,5356         conflicting help strings

Reproduction:
  1. Set a class fee to 1200.
  2. Try to clear it: leaving the box empty keeps 1200 ("leave unchanged").
     Entering 0 stores 0, which the card displays as "Monthly fee not set yet".
  3. There is no display for a genuinely free class and no explicit "clear fee".

Expected:
  A defined semantic: `null`/absent = not decided, 0 = free (or vice versa), a
  clear button, and a display that distinguishes them.

Actual:
  Two comments and two help strings disagree; the UI treats both blank and 0 as
  "not set"; clearing requires knowing to type 0.

Suggested fix:
  - Pick one representation and use it consistently in the schema, model, actions,
    displays and help text.
  - Add an explicit "Clear fee" control that writes the unset sentinel rather than
    asking the operator to type 0.
  - Display free as "৳0 (free)" and unset as "Not decided" if both are supported.

--------------------------------------------------------------------------------
F-17 (Low) — HOLD/LIFT HAS NO REVISION OR LOCK GUARD
--------------------------------------------------------------------------------
Where:
  src/actions/center-students.ts:136-145      setStudentHold loads and saves without a lock
  src/actions/center-students.ts:146-150      removeCenterStudent does use studentLock
  src/actions/center-students.ts:20-26        updateCenterStudent uses revision/updatedAt

Reproduction:
  Two operators act at the same time: one holds/lifts, the other removes (or
  another hold/lift). setStudentHold reads the document, then `save()` writes only
  its modified paths. There is no status/version predicate and no student lock.

Expected:
  A stale write is refused or serialized; a removed student cannot be brought back
  to `on_hold` by a late save.

Actual:
  Last write wins. A late hold save can overwrite `status:'removed'` while leaving
  the removal object in place, producing a record that is neither cleanly removed
  nor cleanly held. A no-op lift on an active student also succeeds and logs.

Suggested fix:
  - Acquire `studentLock(id)` and use an optimistic predicate on `revision` /
    `status` (e.g. `findOneAndUpdate({_id, status:{$ne:'removed'}, revision}, ...)`).
  - Reject hold when already on_hold and lift when not on_hold; return `conflict`
    for a stale revision.

--------------------------------------------------------------------------------
F-18 (Low) — BANGLA MONTH SPELLING MISMATCH BREAKS test:unit:core
--------------------------------------------------------------------------------
Where:
  src/lib/achievement-date.ts:1-8             uses Intl.DateTimeFormat('bn-BD')
  tests/achievement.test.ts:7                 expects '১ জানুয়ারি ২০২৬'
  src/lib/center/sms-source.ts:39             hardcodes 'জানুয়ারি'
  src/messages/bn.json                        shared month table

Reproduction:
  npx tsx -e "import {achievementDateBn} from './src/lib/achievement-date'; \
              console.log(achievementDateBn('2026-01-01'))"
  Actual  : "১ জানুয়ারী ২০২৬"
  Expected: "১ জানুয়ারি ২০২৬" (the test and the rest of the app)

  `npm run test:unit:core` stops at tests/achievement.test.ts because the suites
  are chained with `&&`; every later suite in that script is not run.

Cause:
  This Node/ICU build renders the Bangla long month as "জানুয়ারী" (with ী), while
  the project's own month table and `MONTHS_BN` use "জানুয়ারি" (with ি).

Expected:
  One month vocabulary across the app.

Actual:
  Public achievement pages use the ICU spelling; the center screens/SMS use the
  catalog spelling. The public page and the SMS can show different spellings of
  the same month.

Suggested fix:
  - Format `achievementDateBn` from the shared month table/catalog instead of
    `Intl` (the rest of the app already does this), or
  - If the ICU spelling is preferred, update `MONTHS_BN`, the catalogs and the
    test together. Either way, add a shared test that compares every month.

================================================================================
WHAT WAS CHECKED AND LOOKED CORRECT (to avoid false alarms)
================================================================================
These areas were inspected and did not show the suspected defect:

  - Recycle Bin hiding: addRecycleFields() installs Mongoose pre-query hooks, so
    `CenterClassGroup.find()`, `findById()`, `countDocuments()` and similar live
    reads automatically exclude `deletedAt` rows. The class list/board and class
    hub therefore do not show soft-deleted classes. (Aggregations are also
    filtered by a pipeline stage.)
  - Student edit concurrency: updateCenterStudent compares both `updatedAt` and
    `revision`, uses the student/identity locks, and refuses a stale write.
  - Duplicate student detection inside a class: the transaction re-checks a
    normalized name plus the guardian phone and returns `duplicate`; the pre-check
    is only a fast path.
  - Restore hold math for the removed interval: leave month is the last billable
    month, resume month is billable, and the months strictly between are written
    as a hold period. This part of restore is correct (when the class exists).
  - Class delete is reference-blocked while non-removed students or live exams
    reference the class; that block is intentional and works.
  - `npm run typecheck` passed.
  - `npm run test:center` passed (9 suites).
  - `npm run test:sms` passed (provider, retry, templates, recipients, quiet).

================================================================================
TEST / COMMAND EVIDENCE
================================================================================
  npm run typecheck
    -> passed (no TypeScript errors).

  npm run test:center
    -> passed (9 Center suites).

  npm run test:sms
    -> passed (provider, retry, templates, recipients, quiet hours).

  npm run test:unit:core
    -> fails at tests/achievement.test.ts:7:
         AssertionError: expected '১ জানুয়ারি ২০২৬' but got '১ জানুয়ারী ২০২৬'
       Because the script chains suites with &&, the suites after achievement do
       not run in that command. This is an environment/ICU spelling mismatch, not
       a type or logic crash, but it does block the repository's own core test
       command.

  Focused reproduction of the hold bug (dues engine only, no database):
    npx tsx -e "import {calculateStudentDues} from './src/lib/center/dues'; ..."
    -> active, no hold record : 5000
    -> on_hold                : 0
    -> active, hold Feb-Apr   : 2000

  Focused reproduction of the month spelling:
    npx tsx -e "import {achievementDateBn} from './src/lib/achievement-date'; ..."
    -> "১ জানুয়ারী ২০২৬"

================================================================================
RECOMMENDED IMPLEMENTATION ORDER
================================================================================
  1. F-01  Fix hold periods first. It is the only finding that actively produces
           a wrong amount of money on a normal workflow.
  2. F-02 + F-03  Add class transfer and effective-dated fee changes. These unlock
           a correct F-05 archive policy (move students, then retire a class).
  3. F-04 + F-08 + F-09  Consolidate the class editor and normalize the shift /
           uniqueness model before more class data is created.
  4. F-05 + F-06 + F-07  Make archive safe, hide enrollment for archived classes,
           and connect the class fee to enrollment.
  5. F-10  Implement or explicitly cancel the removed-student retention flow.
  6. F-11..F-17  Workflow polish, validation and concurrency hardening.
  7. F-18  Unblock the core test command (shared month table).

================================================================================
END OF REPORT
================================================================================

---

## Achievement card generator — stage 1

> Historical record · former `ACHIEVEMENT-STAGE1.md`.

**Historical note:** the implementation has since changed. For the current workflow, tests and remaining safety limits, see `FEATURES.md` and `RELEASE-READINESS.md`. Statements below that draft saving or publication are entirely absent describe the earlier stage, not the current implementation.

This is an intentionally incomplete first-stage prototype, awaiting the owner's design approval.

### Implemented

- An `Achievement` Mongoose model and a Zod schema with bilingual fields, status, ranks, consent, future media URLs and indexes. Publishing without recorded parent consent fails schema validation and Mongoose document validation. No database writes or publication workflow have been added yet.
- A protected admin design editor at `/bn/admin/achievements` and `/en/admin/achievements`, plus a sample-only `/bn/achievement-preview` page available only in explicitly service-free development mode. The preview uses a silhouette, sample text and `example.com`, not real student data.
- Five browser-rendered templates; square, portrait and wide sizes; Bangla typography; fit-to-space text; browser-local photo input, camera input, crop/zoom/reposition and brightness; visible first-name-only and field visibility controls; PNG download and supported-browser clipboard copy. The browser decodes/re-encodes the photo before use, stripping EXIF from the resulting working image. There is no face detection; text is in a separate area and users must review their crop.
- Browser PNG exports were checked at 1080×1080, 1080×1350 and 1200×630. Mobile file input/crop, metadata stripping and overflow were checked using a synthetic image. Preview versus PNG is visually very close, though exact pixel identity across browsers/fonts has not been established.

### Not implemented yet

- Persistent draft saving/editing, list/search/filter/pagination, duplicate/delete, signed Cloudinary uploads and cleanup, server consent enforcement on write paths, automatic two-image export, public pages, SEO, share count and sharing, and optional Facebook auto-post. All these remain for subsequent work; the current editor clearly says that saving and publishing are unavailable. Do not use real student photos in this design preview.
- The model's document-validation consent guard is not a substitute for explicit consent checks on every future update/publish API. Consent evidence, access controls, retention, deletion, backup/CDN invalidation and Cloudinary privacy must be designed and tested with the actual deployment before processing minors' photos.
- Auto-enhance is currently a simple brightness preset, not an image-analysis algorithm. Background blur and several additional delights are not implemented. Long text is shrunk to fit, which can become small. The template provides separate photo and copy areas but cannot verify a face is in frame.

### AI investigation

No live provider credentials or production configuration are present in this workspace. The service-free preview deliberately disables AI, so no real-provider repair can be verified here. The student request budget has been increased to reduce empty thinking-model responses, upstream quota errors are surfaced as rate-limit errors, and an authenticated, rate-limited admin provider connection test sends a fixed, non-personal question and reports a sanitized error category. A mocked-provider integration test passed, not a live Gemini test. Follow `SETUP.md`; never share API keys in chat. The existing guardian, privacy and data-collection safeguards remain in place.

### Design review round 2

The cards use much larger photo areas, Bangla rank badges and the institution's supplied tagline. Photo and text occupy separate blocks; crop and horizontal/vertical focus controls support landscape and portrait compositions. The form can display a group of names or select one name for an individual card. Individual cards are exported one at a time; bulk ZIP export is not implemented. The 15 template/ratio sample combinations passed browser PNG dimension checks. Long text is shrunk; if it cannot fit at the minimum supported size, the editor blocks export with a message rather than silently exporting clipped text. For long text, the original 84–110 px name and 52–64 px title targets may not be achievable on every layout; they can shrink to 30 px in the export.

Site Settings now has optional official HTTPS website and editable Bangla tagline fields. A saved website URL is displayed on the card. The bundled/service-free environment has no known official URL and does not insert a placeholder. A QR code to the achievement page is deferred until public pages and their real URLs exist. Card logo uses Site Settings. Synthetic-image mobile checks covered group/individual selection, crop, EXIF stripping, overflow and all export dimensions. The production integration test passed with a synthetic website/tagline and mocked provider; one earlier run stopped at an unrelated intermittent editorial-save check, and a subsequent full rerun passed. No live provider, Cloudinary, or real Facebook sharing was tested.

### Private photos for design review

Any real photos provided for round-three testing must remain in git-ignored `test-assets/`, be used locally only, never uploaded to Cloudinary or published, and be deleted from the project when testing is finished. Do not include that folder in archives. Real photos have not yet been supplied for round-three tests.

### Round 3 — celebration layer in progress

The preview now uses inline-SVG medal, laurel/confetti/tape/podium motifs, self-hosted Hind Siliguri/Inter and Atma fonts, Bangla date formatting, layered photo frames and integrated logo tabs. The selected medal corner can be changed; neither crop nor overlay is automatically face-aware. Group names can be displayed on a full-height-photo layout. Exact user-provided test name and a two-line sample caption were used for 15 single-winner and six group illustrative exports, all with expected PNG dimensions. The rasterized preview reuses the same Blob as the download when current, and one aligned desktop Chromium check was pixel-identical after excluding unrelated site chrome; this does not establish cross-browser/device identity.

No new real photos have been received as of this note. The user requested 4–5 real local-only photos, face-crop assessment across every template and ratio, and deletion of those test photos when finished. These checks and final design approval remain pending. Do not use the older uploaded personal photo or résumé as substitutes. Do not include `test-assets/` or generated outputs derived from real photos in source archives or uploads. The round-three wide three-winner layout necessarily shrinks the specified long names (about 42 px in the 1200×630 output versus the requested 84 px minimum); treating this as fully compliant would be inaccurate. The editor blocks export when text cannot fit even at its configured minimum. Keep public pages and Facebook sharing on hold until approval.

### Synthetic-photo test package

At the owner's request, three AI-generated fictional portraits were used as non-published local design fixtures. Browser tests generated 45 single-winner PNGs (3 photos × 5 templates × 3 ratios) and confirmed the expected output dimensions; the 350px overviews were visually inspected. With the original default 50% vertical focus, the square card cut the top of the head in the tall synthetic portrait. The default was changed to 30% and all 45 cases were re-exported; the three synthetic faces appeared within frame in the inspected overviews. This is not face detection, and it does not establish that arbitrary real photographs will fit. The focus and crop controls must be checked each time.

The download package optionally contains these deliberately labeled synthetic fixtures in `SYNTHETIC-TEST-IMAGES/` for local testing, not published content; they are not any user's real photos. `test-assets/` itself and any real user photos remain excluded. Current package checks: typecheck and unit tests passed. The default production build timed out after four minutes while running alongside the dev server; a subsequent `npm run build -- --webpack` succeeded with the dev server stopped. The UX suite passed on a subsequent run without a concurrent build; its earlier attempt timed out while a welcome splash intercepted a click.

### Recovery and production-hardening checkpoint

The workspace restored an older renderer after the last download, while retaining some newer documentation and screenshots. The latest source archive was not available to the agent, and the owner could not upload it. The celebration renderer was reconstructed from the older implementation and screenshots; it is not a byte-for-byte recovery of the earlier Round 3. The new wide group layout deliberately uses about 22% width for the photo and 78% for text; the specified three long sample names render at 84 output pixels in the tested Champion and Trophy cards, at the cost of a much smaller crop. The rebuild has not been verified with real photos and is not a completed production implementation.

Achievement model query updates, replacements and bulk writes now fail closed rather than bypassing document consent validation. This does not constrain direct MongoDB driver writes and is not an authorization/consent workflow. No achievement publishing/write endpoints were added. The generic public-image picker now explicitly warns that uploads become public immediately, including in drafts, and that minors' photos must not be uploaded there. Existing general CMS/gallery/topper content and external media need a full privacy review; the warning is not an enforcement mechanism. A private, access-controlled achievement-media store, recorded/verifiable consent and revocation, protected publication and deletion workflows are still required.

---

## R0 changelog

> Historical record · former `MILESTONE-R0-CHANGELOG.txt`.

1. Added SPEC.md (the full brief R0-R7 plus all rules), STATUS.md (module-by-module working|partial|missing|blocked with evidence), STALE-TESTS.md and VERIFY.md; the root STATUS.md and STALE-TESTS-REPORT.md of that time were reduced to pointers, and the Milestone-1 narrative was preserved in the history record (now this file).
2. Added the owner's one-command verification harness: `npm run verify` runs every unit suite, installs the test browser if missing, starts the disposable database and app, signs in, takes 360/1440 screenshots of 13 pages, runs the browser tests, and writes verify-report.md (one line per requirement: PASS / FAIL / NOT TESTED and why), screenshots/<milestone>/ and verify-output.zip to send back.
3. Cold start proven from a fresh extract of the delivered ZIP: npm ci, typecheck, 32 unit suites and a full 173-page production build all PASS; `npm run verify` in the agent sandbox reported 5 PASS / 0 FAIL / 6 NOT TESTED because this sandbox cannot download MongoDB or Chromium (test-results/r0-verification.txt).
4. Stale tests resolved with written reasons: center-exams-browser and workbook-preview-browser repaired and kept (every UI literal re-verified against source, including the U+09DF vs U+09AF+U+09BC Bangla trap), center-import-browser retired because it drives an orphaned component no page imports; both kept tests now fail in ~1 s with the exact fix via tests/helpers/env-preflight.ts, and the 9 Center suites plus the new harness test are wired into npm test.
5. Corrected the record (STATUS.md §4): the CRON month-end scheduler, legacy-fee conversion, Center portal linking, "ভর্তি সম্পন্ন creates a student", the due list's month filter/select-all/Excel/print, and two PASS-cited browser tests are documented as delivered but are NOT in the code, and screenshots/ was empty. No product behaviour changed in R0.
6. Added continuous verification: .github/workflows/verify.yml runs `npm ci`, installs Playwright Chromium, runs `npm run verify` on every push to the session branch, prints the report into the job log and summary, commits verify-report.md plus test-results/ci-latest/ (report and the last 400 lines of every step log) back to the branch, and uploads the verify-output artifact. It never opens a pull request, never merges and never runs on main.
7. Security review of the whole history at the owner's request (STATUS.md §10): no secret committed; .env.example holds placeholders only; .gitignore extended for keys, logs, OS/editor noise, .vercel/ and playwright-report/. One open item for the owner: the demo/synthetic fixtures contain student-style names and phone numbers and should be regenerated if any came from the real sheet.
8. Fixed the harness defect that the first CI run exposed and got R0 to a complete pass: test mode now publishes TEST_MONGO_DB and every attached test resolves the database the app actually serves (tests/helpers/env-preflight.ts testDbName(), asserted in tests/center-data-mode.test.ts), so seeded users can sign in; verification enables CENTER_EXAM_WRITE_ENABLED for the disposable database so R0.9 demonstrates create -> marks -> A+ -> rank -> publish. Run 43228385032: 11 PASS, 0 FAIL, 0 NOT TESTED in 132s (test-results/r0-verification.txt [9]).

---

## R1 changelog

> Historical record · former `MILESTONE-R1-CHANGELOG.txt`.

1. Recycle Bin engine (§E1-§E3): twelve schemas (Editorial, Course, LearningMaterial, MediaFile, PortalNotice, FAQContent, FacilityContent, AchievementRecord, PracticeTest, PublicSheet, CenterClassGroup, CenterExam) carry deletedAt/deletedBy/purgeAt with a 30-day window, and a schema-level invariant hides binned rows from find, findOne, countDocuments, distinct, aggregate, bulkWrite, every update and populate; bin/restore/purge opt out explicitly and estimatedDocumentCount stays unfiltered on purpose (R1-COVERAGE.md, R1.1/R1.3).
2. The nine hard deletes became soft deletes with real reference counts (a class with students, an exam with saved results, an image used by content), the exact blocked sentence in the operator's language, an audit row per move, and revalidation of the public routes so a deleted record leaves the website, the blog URLs and the sitemap immediately.
3. The real `staff` role (§E2, owner decision): list access plus archive/hide and restore, never delete, never authoring, and no roles/audit/ai pages; delete stays requireAdmin and Delete forever stays superadmin-only.
4. Recycle Bin UI (§E4): /[locale]/admin/recycle-bin with a type filter, search, days left, Restore and Delete forever behind a typed-name dialog; ConfirmDialogs that name the item and say "moves to the Recycle Bin for 30 days" instead of claiming permanence; a 10-second Undo toast on a layout-level host (so it survives the row it deleted) for single and bulk deletes; bulk select on the blog/notice/video/gallery and course lists; Archive offered automatically when a delete is blocked; every string in bn.json and en.json; no overflow at 360/768/1440.
5. Daily scheduled job (§E5): /api/admin/jobs/daily purges rows whose 30 days are up (Cloudinary assets destroyed first) and trims SMS/activity logs past CenterSettings.logRetentionMonths (default 12), guarded by a CRON_SECRET bearer token with a constant-time compare and a 32-character minimum, scheduled by vercel.json at 0 19 * * * (01:00 Asia/Dhaka) and documented in .env.example.
6. Delete/archive controls (§E6 first wave) for every participating kind, including the two lists that used to ask window.confirm("Permanently delete this sheet?"): lecture sheets, practice tests, achievements, study materials, portal notices, FAQs/facilities, class groups and Center exams.
7a. Second wave of §E6: the nine record types that had no destructive control at all — trial
    slots, trial bookings, admissions, contact messages, hero banners, teacher profiles, portal
    accounts, legacy academic exams and model tests — joined the engine (21 participating schemas),
    with reference blocks where a delete would orphan history (booked trials in a slot, an admission
    already converted to a student, saved results or attempts, and for portal accounts a staff role
    or a legacy student profile, which may only be disabled). The media card raises the same
    layout-level Undo toast as every other delete.
7b. Third wave of §E6, the last two §B rows: social-proof milestones bin inside the settings
    document with the named dialog, the 30-day rule, Undo, a bin with days left and Restore, saves
    that never empty the bin, and a daily-job purge of expired milestones (R1.6); managed roles can
    be disabled as a whole — every guard reads CenterSettings.disabledRoles, so a disabled role keeps
    no admin page until re-enabled, your own role cannot be switched off, and each switch writes an
    audit row (R1.7).
7. Evidence: verify-plan grew R1.1-R1.5; GitHub Actions run 43258474938 reported 16 PASS / 0 FAIL / 0 NOT TESTED in 145s, and the R1.4 browser suite caught two real defects that were then fixed (Delete forever compared the typed name against a read the auto-hide rule empties; the Undo toast was unmounted by the refresh it triggered). Still owed: nine record types outside the engine (trial slots, bookings, admissions, messages, banners, teachers, portal accounts, legacy exams, model tests), an Undo button on the media card, a real Vercel cron run, and the owner's own `npm run verify` output before R1 can be called verified (R1-START-HERE.md).

---

## R2 changelog

> Historical record · former `MILESTONE-R2-CHANGELOG.txt`.

R2 — SMS (BulkSMSBD). Everything below is proven by CI (npm run verify, requirements R2.1-R2.9).

Wave A — the engine (no UI):
1. src/lib/center/sms-provider.ts: BulkSMSBD's current official API implemented exactly — smsapi (single), smsapimany (different messages, serialized as 88<number>,<message>), getBalanceApi (text and JSON), 8801XXXXXXXXX numbering, type=unicode for Bangla and text for ASCII, and all twenty documented response codes mapped to plain Bangla (202 জমা হয়েছে, 1007 ব্যালান্স অপর্যাপ্ত, 1012 মাস্কিং এসএমএস বাংলায় পাঠাতে হয়, 1032 আইপি হোয়াইটলিস্টে নেই, plus a fallback that echoes an unknown code and never claims success). SMS_PROVIDER defaults to mock: nothing is sent, everything is logged. Credentials live only in BULKSMSBD_API_KEY / BULKSMSBD_SENDER_ID, are validated at startup, redacted in every message, and never returned, logged or stored (R2.1).
2. src/lib/center/sms-templates.ts: the six default bodies match the spec byte for byte and stay Bangla on an English screen; CenterSmsTemplate rows override but never delete a default; chips substitute without inventing values, a known chip with no value becomes a skip (missing_value) and an unknown chip blocks the plan instead of sending a hole (R2.2).
3. src/lib/center/sms-recipients.ts: removed students never contacted, smsOptOut respected, held students excluded from fee messages only, one accurate skip reason per student from a closed vocabulary with Bangla and English labels, every accepted phone shape normalized to 01[3-9]xxxxxxxx with dedupe, siblings merged into one message with the summed total (refused when the merged text could be untrue), 500 recipients in five chunks of 100 (R2.3).
4. src/lib/center/sms-quiet.ts: the midnight-crossing 21:00-07:00 default evaluated in Asia/Dhaka, invalid or empty settings disable quiet hours rather than blocking sends, exact flush time (R2.4).
5. src/lib/center/sms-send.ts: the only module that calls a provider and writes log rows — batches of 100 (500 recipients in ~130 ms), insertMany rows carrying their own segments and cost, idempotency via a unique partial index on CenterSmsBatch.requestId (a repeated key returns the first batch and calls the provider no more), 1005 retried once and unknown never auto-retried, explicit retry re-sending only failed rows, quiet-hours queueing with scheduledFor, and monthly totals as stored sums (R2.5).
6. Data layer: CenterSmsBatch, CenterSmsLog (batch and student are optional context, so a test message or a visitor message has neither), CenterSmsTemplate, and the CenterSettings additions (smsUnitCost, quietStart, quietEnd, institutePhone, autoReceipt, autoResult, autoDue, autoDueDay). A latent R1 defect was fixed on the way: audit('system', ...) wrote nothing at all, because actor is a required User reference.

Wave B1 — the SMS centre:
7. /[locale]/admin/sms (admin and super admin only; staff get no nav entry and no form): connection status naming the provider without a credential, live balance, this month's stored cost, the settings form where every auto-send toggle stays OFF unless it is ticked, an invalid institute number refused without changing anything, "Send test SMS to my own number" (read from the operator's own user record, logged with no student and no batch), the editable templates with chips derived from the body and an "edited" badge, batches with an explicit Retry failed, and history with status/template/text filters. Form feedback follows the page language while provider codes stay Bangla (R2.6).

Wave B2 — the dialog, the entry points and the automatic sends:
8. src/lib/center/sms-recipients.ts sums a shared guardian number digit-aware: a Bangla-digit amount
   (which is what a real dues send carries, because formatNumber localizes it) used to parse as NaN,
   so every sibling pair was treated as "ambiguous", grouping was refused, and one guardian got two
   messages instead of one total. The sum is written back in the digits the operator's own values
   used; a genuinely non-numeric amount is still refused rather than guessed.
9. ONE reusable SendSmsDialog (src/components/admin/send-sms-dialog.tsx) with the spec's four steps: recipients summary with a collapsible list, skipped numbers grouped by reason, guardian/student/both, one-message-per-phone for siblings, the 24-hour duplicate warning with "এদের বাদ দিন" and a note when sibling grouping was refused; the template picker or custom text with all nine variable chips (a subject field appears exactly when the body uses {subject}); a live preview of the first three messages with characters, segments, cost and balance plus the low-balance warning and the quiet-hours override; and ONE green send button with progress, a result summary and Retry failed only when something failed.
10. Five entry points wired: the due list's "Send reminder" (DUE only, shown only when the list is non-empty), a student profile, the student list's bulk action (tick rows; a new search clears the selection), the payment success screen's "রসিদ এসএমএস পাঠান" (pre-filled with that receipt), and the SMS page's "নতুন বার্তা" (pick a class). The spec's Visitors and Teacher CVs entry points wait on R3/R4, which own the Lead and TeacherCandidate models; the dialog is source-driven, so they add a source kind in src/lib/center/sms-source.ts and render the same component.
11. One guarded endpoint, POST /api/admin/sms/send, with its logic in src/lib/center/sms-dialog.ts so it is testable without a browser: session guard, same-origin check, bounded JSON, rate limit on send and retry only, validation before anything is read, a read-only preview, 409 for a blocked plan, idempotent sends, skip-those duplicates, and retry that re-sends only failed rows (R2.8).
12. Auto-send, all OFF by default and idempotent through a deterministic UUID-shaped requestId: receipt after a saved payment, result after an exam is published, and due reminders from the daily job only on the operator's chosen day (never to catch up on a missed one). The daily job reports them under its own "sms" key so R1's trim report keeps its exact shape.
13. New job GET /api/admin/jobs/sms-flush (same CRON_SECRET bearer policy) sends queued batches whose time has come; vercel.json schedules it at 5 1 * * * (07:05 Asia/Dhaka), just after the default quiet window closes. The daily job flushes too, so a missed schedule never strands a message. Automatic reminders created at 01:00 Dhaka are therefore delivered at 07:05 rather than in the middle of the night.
14. tests/cron.test.ts now runs under --conditions=react-server, because the daily route imports the SMS auto-send module (server-only). The script names verify uses are unchanged. The same flag now covers test:recycle:db, because tests/recycle-bin.integration.ts imports that daily route too.

15. CenterSmsBatch.createdBy is optional and every batch carries a trigger (manual, auto_receipt,
    auto_due, auto_result). A required creator made all three automatic sends fail validation, and
    because each caller is best-effort — a message that cannot go out must never turn a saved payment
    into an error — the failure was silent: the toggle looked on and nothing was ever sent. The
    trigger is the audit trail an automatic batch has instead of a person.

Follow-up, before the real provider goes on (owner's two requests):

16. An "Automatic SMS problems" card on /[locale]/admin/sms and on the admin Overview, backed by a new
    CenterSmsAutoProblem model and src/lib/center/sms-auto-problems.ts. The rule that keeps a saved
    payment safe — every auto-send caller swallows its error on purpose — also made a failure invisible,
    so "did not go out" is now stored: one open row per natural key (unique partial index on key where
    resolved:false) with the trigger, a plain Bangla sentence for the cause, the receipt or class it was
    for, an attempt count and the context to run it again. A provider code reuses the gateway's own
    Bangla meaning plus (কোড NNNN); credentials are scrubbed before the sentence is written. Not
    problems, never recorded: a toggle that is off, a class with nobody overdue, a send queued for quiet
    hours. The card renders nothing at all when nothing is wrong.
17. retryAutoSmsProblem() (src/lib/center/sms-dialog.ts) plus the guarded, audited retryAutoSmsForm
    action: with a usable batch only its failed rows are re-sent, and a batch that turned out fine or is
    waiting for quiet hours is simply closed; with no batch at all the automatic send runs again under a
    fresh request id, because the old one is spent and idempotency would answer with the failed batch.
    The row is resolved against the admin who clicked, or updated with the new reason, and every retry is
    audited as sms.autoretry. Retrying a closed problem says so and sends nothing.
18. tests/sms-auto-problem.integration.ts (test:sms:problem, requirement R2.9) proves the sequence that
    matters: the payment is recorded first, the provider refuses the receipt message with 1007, the
    automatic send neither throws at its caller nor touches the saved payment, and the failure shows up
    as one open problem naming the receipt and the student. Plus the fold, both retry paths, the refusal
    to retry a closed row, the two non-problems, and that no credential and no stack trace reach the card.
19. SMS-GOLD-LIVE.md: the go-live checklist — environment variables, the BulkSMSBD account steps
    (including why IP whitelisting must be off on a serverless host, or every send answers 1032), sender
    id notes, the one test message to the owner's own number, the order to switch the auto-sends on, what
    202 does and does not mean, how to go back to mock, and the emergency brake.

Owed, stated plainly: Visitors and Teacher CVs as entry points (R3/R4); pending_reminder in the picker (needs the optional current-month PENDING switch); the real provider stays OFF until the owner approves the mock version, then exactly one test message to their own number, with BulkSMSBD IP whitelisting disabled for a serverless host first; a real Vercel cron run for both entries stays a go-live item; and 202 means submitted, never delivered, because the documented API has no delivery-report callback.

---

## R3 changelog

> Historical record · former `MILESTONE-R3-CHANGELOG.txt`.

R3 — Visitor leads. Replaces the owner's "Visitor sheet" spreadsheet.
Proven by CI (npm run verify); requirements R3.1-R3.5 are wave A. Waves B (screens) and C (the import
wizard, reports and CSV export) follow, in that order, as the owner asked.

Wave A — foundations, no UI:

1. src/models/Lead.ts: every field the brief lists — leadId, date, studentName, guardianName, phones[],
   classLabel + classGroup + newSession (+ exam/examYear), school, group, shift, medium, source,
   interestedIn, status, doNotContact, nextFollowUp, assignedTo, the notes timeline, conversion links
   (admission / trialBooking / student), familyKey, importSource + importBatch — plus flags[], so
   anything the app could not read travels with the lead instead of being shown once and forgotten.
   Soft delete comes from addRecycleFields, so a binned lead disappears from every ordinary query.
   nextFollowUp is a YYYY-MM-DD day in Asia/Dhaka rather than a Date: ISO days compare exactly as
   strings, so "today's follow-ups" and "overdue" need no timezone arithmetic at query time.
   studentName is required, because a lead with no name cannot be called and inventing "Unknown" would
   be a guess — the importer will keep such a row in its own preview and ask.
2. nextLeadId() issues V-2026-0007-style ids following the HIGHEST id of the year, not a count, so a
   purged lead cannot hand its number to somebody else; a new year restarts at 0001 and the unique index
   stays the backstop if two admins quick-add at once.
3. src/lib/leads/vocab.ts: the eight statuses, five sources, three shifts, three mediums, four groups
   and four note outcomes, each with Bangla and English words in one file so no screen can drift from
   another. Three standing rules live here rather than in a screen: "Do not contact" is sticky (a status
   AND a boolean; moving the status back does not clear it) with canContact() as the single gate and
   CONTACTABLE_LEAD_FILTER as the same rule in query form, so a bulk send cannot reach a forbidden
   number; a follow-up is a day, with the five quick buttons (today, tomorrow, 3 days, next week =
   seven days, custom) and today/overdue/later/none states; and a number never appears in a URL this app
   builds — leadListQuery() refuses a phone-shaped search term, in Bangla digits too, so it is posted
   instead of landing in browser history and the host's access log, while a name or school stays
   shareable. maskPhone() is what a log gets. familyKeyFromPhones() ties siblings by the smallest shared
   number; archiveSuggestionDay()/suggestsArchive() implement the 18-month rule as a suggestion, never
   an automatic delete.
4. src/lib/leads/lead-date.ts: one rule reads every spelling in the brief — day first, two-digit years
   mean 20xx — across 2/12/2024, 15.12.24, 2-12-24, Bangla digits, stray spaces, ISO and a real xlsx
   cell. What is doubtful is reported, never repaired: an ambiguous day/month pair is named ambiguous, a
   month-first row is read only when it is the only possible reading and reports the exception,
   impossible dates (31/02, 31/11, day 0) and unreadable ones are refused quoting the owner's own text,
   and a four-digit year outside 2000-2100 is not told it was read as 20xx. flagSuspiciousYears() flags
   a year that disagrees with the sheet's majority and SUGGESTS the majority year for the same month and
   day — never applying it, never suggesting into the future, and never flagging when there is no
   majority to appeal to.
5. src/lib/leads/lead-phone.ts: parsePhoneCell() reads a cell that holds a clean number, "0 1934-595247",
   Bangla digits, hand-grouped brackets, a missing leading zero, a +880 country code, two numbers split
   by a comma, a semicolon, a line break, a space or a Bangla label, or ten digits that are short. It
   cleans what can be cleaned and flags the rest — short, invalid, extra digits beside a real number, a
   word instead of a number — keeping the spelling exactly as written beside the normalized number, and
   distinguishing an empty cell from an unreadable one. It also owns the only two hrefs that carry a
   number (tel: and wa.me, both third-party destinations, never a route of this app, never logged) and
   the log mask. Validity is decided by the same normalizePhone() the SMS engine uses.
6. src/lib/leads/lead-class.ts + lead-columns.ts: XI/xi/XII/IX from a fixed table (so IIII is not 4),
   7/৭/নবম/দশম শ্রেণি/Class 9/শ্রেণি ৯/grade 11, and "New 9"/"new 6"/"নতুন ৯"/"9 (New)" with newSession as
   its own flag. SSC 25 becomes class 10, 9 or 11 depending on the year the visitor walked in and keeps
   its exam and year; SSC 14 leaves the class empty with a flag rather than guessing. The raw label is
   always kept and classGroup null means "not derived", never "no class". Column values (group, medium,
   shift, source) map from lookup tables where "Other" and an unknown phrase become null instead of a
   default — substring matching would call "ফেসবুকের মাধ্যমে" a referral — and headers map from a synonym
   table, so an unnamed ("Column 1") or unknown column is handed back as a question for the owner
   instead of being dropped or attached to the nearest field.
7. Recycle Bin: 'lead' joined recycleKinds and recycleRegistry as ভিজিটর লিড / Visitor lead, named by its
   student or by its id when no name was written. It is deliberately NOT archivable (a lead has no
   unpublished state, and the 18-month rule is a suggestion on the list) and IS reference-blocked once
   converted, because deleting a converted lead would lose the link to the admission, student or trial
   booking. tests/recycle-coverage.test.ts now asserts 22 bin schemas and that the registry and the
   schemas are the same 22 types.
8. src/lib/admin/today.ts exports dhakaDay(), the YYYY-MM-DD form of "today in Dhaka" that
   dhakaToday() already computed internally, so the lead rules and the shared helper cannot drift.
9. Suites: tests/lead-vocab.test.ts (R3.1), tests/lead-date.test.ts (R3.2), tests/lead-phone.test.ts
   (R3.3) and tests/lead-class.test.ts (R3.4) are pure and run anywhere; tests/lead-model.integration.ts
   (R3.5) proves the record against the disposable database — what a sheet row keeps, what a quick-add
   leaves unset, nine malformed rows and a repeated leadId refused, id sequencing, the follow-up range
   queries, sticky do-not-contact agreeing with the filter for all eight statuses, sibling lookup by an
   indexed phone, and the full bin cycle (soft delete, invisible, listed, counted, restored, purge-dated
   30 days out, reference-blocked when converted, then purgeable).
10. Docs: R3-COVERAGE.md answers §R3 point by point for wave A, with §6 stating plainly what wave A
    does not do. No operator guide yet — R3-START-HERE.md comes with wave B, because a guide to
    buttons that do not exist would be a lie.

11. CI infrastructure: scripts/test-mode.ts capped the whole-program typecheck AND the build at the same
    --max-old-space-size=768. Wave A pushed the typecheck over it, so the first wave-A run (43379896360)
    came back INCOMPLETE — 14 PASS, 0 FAIL, 18 NOT TESTED — with nothing actually failing: tsc died with
    "FATAL ERROR: Ineffective mark-compacts near heap limit", the test server never started, and every
    requirement needing the app or the disposable database was reported NOT TESTED. The two steps now
    have separate heaps (typecheck 4096, build 2048) and a comment explaining why they must not be
    merged back: a whole-program typecheck grows with the repository, and R3 has two more waves.

12. tests/lead-model.integration.ts, step 7: the family-key assertion was self-contradictory — it created
    the sibling with familyKeyFromPhones() over the SIBLING'S OWN numbers and then asserted it equalled
    the first lead's key. Run 43380395065 caught it (fam:01711000041 vs fam:01712817090), and the catch
    is the useful part: it pinned the rule wave B's src/lib/leads/leads.ts has to implement. A new row
    that shares a number with an existing lead must INHERIT that lead's familyKey from one indexed lookup
    on phones.normalized; recomputing it from the new row alone can split one family in two. The step now
    asserts both halves: the lookup finds the holder, and the freshly computed key would have been wrong.

13. Wave B opened with its rule layer: src/lib/leads/leads.ts, proven by tests/lead-rules.integration.ts
    and registered as R3.6 (registry 33). It is the only module besides the model that queries Lead, so
    screens and server actions have nothing left to invent: createQuickLead / createSheetLead (refusals,
    never repairs), resolveFamilyKey (inherit the key, merge two families one row bridges), leadsWithPhone,
    listLeads (a phone-shaped q is refused at the query layer by the same leadListQuery that refuses to put
    one in a URL), followUpBoard, leadDetail, updateLeadStatus (sticky doNotContact), setContactPermission,
    setLeadFollowUp, addLeadNote, contactableLeads (CONTACTABLE_LEAD_FILTER as its own $and branch, so no
    caller filter can override it, plus excludedDoNotContact and withoutPhone counts), duplicatePhoneGroups
    (masked), importBatchSummary and readSheetValues. A Mongo duplicate-key error quotes the value it
    collided on — for a lead that can be a number — so writeRefusal() logs only the code and the field
    names, and no lead.* audit target is anything but a leadId.

14. Two defects the R3.6 suite caught on its way to green, both worth more than the green line:
    (a) duplicatePhoneGroups() filtered its $group with {rows:{$gte:2}}, which asks whether any ELEMENT
        of the array is >= 2 — the elements are documents, so it never matched and the duplicate-phone
        report would have been silently EMPTY forever. Now $expr with $size, and a comment saying why.
        Nothing else in the product would have noticed: an empty report looks like "no duplicates".
    (b) listLeads() floors the page size at 5 and ceilings it at 100, so ?perPage=1 cannot ask for a
        five-hundred-page list. The suite now pins both ends instead of assuming a page size it asked for.

15. Owner requirement (2026-11-13): CI is strict. The workflow sets VERIFY_STRICT=1, exitCodeFor() in
    scripts/verify-report.ts fails on a single NOT TESTED requirement, and a second workflow step re-reads
    verify-report.md and rejects anything but "**PASS**" with "0 NOT TESTED" — independent of the exit
    code. Evidence steps stay on always(), so a red run still commits the report that explains it. Local
    runs keep the old exit-code behaviour on purpose (--skip-app, or a machine with no MongoDB and no
    browser, still exits 0 with an honest INCOMPLETE report). This is the permanent answer to wave A's
    first run coming back green with 18 requirements never proven.

16. Owner requirement (2026-11-13): staff can search the Visitors list BY NUMBER, and the number never
    travels in a URL, a log or an analytics event. phoneSearchDigits() reads (Bangla digits, +88/0088,
    dashes, brackets, a leading zero present or absent, a fragment down to four digits, refusals that
    count the digits without quoting them); searchLeadsByPhone() matches (one substring query on
    phones.normalized, which is why every spelling works and why a number stored behind a label is found;
    total beside a limited hits array; empty is not an error; a binned lead is not resurrected);
    src/actions/leads.ts::searchLeadsByNumber() is the only door (a guarded server action, i.e. a form
    submission). leadListQuery()'s refusal threshold is now PHONE_SEARCH_MIN_DIGITS, the search's own
    minimum, so a fragment cannot slip into a URL through the name box. Proven by
    tests/lead-phone-search.integration.ts, registered as R3.7 (registry 34), with the reading rules also
    pinned in R3.3's pure suite and the URL refusals re-asserted in context. The suite captures console
    output across every search, checks every audit target is a mask, and scans all of src/ for fourteen
    tracking globals and asserts zero — so there is no analytics event for a number to travel in, and
    adding one later fails this test and asks the question.

17. The first strict run (43399236299) went red on R0.7, and the cause is worth more than the fix:
    VERIFY_STRICT=1 is exported into every child process `npm run verify` starts, so
    tests/verify-report.test.ts — which asserts "NOT TESTED alone must not look like a crash", i.e. the
    LENIENT exit code — failed in CI while passing locally. It now pins both modes explicitly
    (exitCodeFor(summary,false) and (summary,true)), tests isStrict()'s parsing of 1/true/YES/on/0/off/empty
    with process.env saved and restored, and asserts that the strict sentence appears in the report only
    when strict mode is real. Verified locally in both modes before pushing. Rule kept: any suite that
    reads an environment variable must set it, because CI's environment is not the local one.
    R3.7 itself passed on its first run.

18. Wave B2 — the Visitors screens (R3.8, registry 35). A sixth sidebar group ভিজিটর / "Admissions &
    leads" with Visitors and Follow-ups; /admin/leads (list, 20 a page, status chips, filters in a
    collapsed details, masked numbers with Call and WhatsApp, inline status, the five follow-up buttons,
    the last note on the row); /admin/leads/[id] addressed by Mongo id OR by V-2026-0007 through the new
    leadDetailByKey(); quick-add as one tap from the mobile bottom bar (the plus slot becomes "নতুন
    ভিজিটর" and links to ?new=1) with four fields, the other seven behind a "more" toggle, Enter to
    save, and a panel that clears itself for the next visitor; one search box with two destinations — a
    name becomes a shareable ?q=, anything phone-shaped is refused by the same leadListQuery() that
    builds the href and posted to searchLeadsByNumber() instead, and a number pasted into the address
    bar is refused with the whole list rendered; the detail drawer with fields, doubts, the notes
    timeline (writer and outcome) and the family, loading its contents through an action so twenty rows
    do not cost twenty queries; and "আজকের ফলো-আপ" on the Overview with today and overdue as two
    separate numbers and the same row controls.
    The owner's four conditions were treated as requirements: one tap to quick-add, Enter saves, large
    tap targets (every control is an existing 44px admin class), and nothing cluttering the space above
    the list (two closed buttons, the chips, a collapsed filter).
    rowView() in the new src/lib/leads/lead-ui.ts is the only bridge from the rule layer to a component,
    and it strips three things on the way: familyKey (which IS the smallest number of a family with
    "fam:" in front of it), a phone's original (the number as written) and a flag's original (a raw cell
    can hold a second valid number). R3.8 asserts the consequence against the served HTML — strip the
    tel: and wa.me destinations and no fixture number appears anywhere in the document, including the
    flight payload — on the list, the drawer, the search results and the Overview widget.
    No rule moved into the UI: the follow-up buttons send keys and nextFollowUpDay() still computes the
    Dhaka day; status changes still go through updateLeadStatus(), which still owns do-not-contact being
    sticky; lifting the block is its own button and its own action. leads.ts gained exactly two
    functions for these screens (leadDetailByKey, leadStatusCounts) and no page queries Lead.
    src/actions/leads.ts now carries six guarded actions and still exports only async functions, still
    builds no href, reads no query parameter and logs an error name rather than a value. One thing it
    now does that it did not before: searchHitViews() strips a hit's normalized and as-written number
    before the answer crosses to the browser, because the rule layer keeps them (that is the field it
    matched on, and R3.7's own test reads it) while a screen may only ever hold the mask and the two
    destinations. LeadSearchActionState moved to lead-ui.ts with it — the client component imports that
    type, and a 'use server' module may export nothing but async functions.
    Proof: tests/lead-screens-browser.integration.ts drives all five screens as an admin, a staff
    account and a content editor, reads every write back from the database rather than trusting a
    sentence on screen (a revalidated row can unmount before its own feedback is painted), measures
    horizontal overflow at 360px on every screen, checks the audit trail, and writes eleven review
    screenshots into screenshots/r3/ — b2-visitors-list, b2-quick-add (+ b2-quick-add-saved-360),
    b2-detail-drawer, b2-number-search and b2-overview-follow-ups, each at 360 and 1440.
    tests/staff-role.test.ts pins the two new nav keys for all five roles, and scripts/verify-screens.ts
    now photographs /bn/admin/leads, ?new=1 and ?followUp=today for R0.11 as well.
    Operator guide added: R3-START-HERE.md.

19. The search box answers a number attempt instead of word-searching it. leadListQuery() now returns
    numberShaped beside refusedPhone, and the two are different questions: refusedPhone is "may this
    travel in an address bar" (number-ish text at least PHONE_SEARCH_MIN_DIGITS characters long, the
    length at which a number search could find somebody), numberShaped is "did a human type a number
    here" (digits and the punctuation a number is typed with, one digit or ten). The box asks the wider
    question and posts, so typing ১২ or 12 reaches the number rule and comes back with "২ অঙ্ক দিয়ে
    নাম্বার খোঁজা যায় না — অন্তত ৪ অঙ্ক লিখুন।" rather than becoming ?q=12 and rendering an empty
    list.
    Two things this cost four CI runs to find, both written down so the next person does not pay for them
    again.
    (1) "Typed a number" was two regular expressions — one in vocab.ts, one pasted into the component —
    and a browser and a server that each answer that question from their own copy cannot be compared
    from either side. It is now ONE function, isNumberAttempt() in src/lib/leads/lead-phone.ts, asked by
    the search box (through leadListQuery().numberShaped), by the URL builder and by phoneSearchDigits()
    itself. That module imports nothing but normalizePhone and formatNumber, so a client component may
    import it and the browser's answer comes from the definition rather than from a copy. R3.3 pins it
    for twelve inputs, including a paste of forty-one digits, which is answered not_a_number instead of
    being run against the index as a substring query.
    (2) The handler called event.preventDefault() before it had decided anything. React runs an onSubmit
    handler before the one that dispatches a form action, so stopping the submit stopped the action: a
    number search folded the panel away and answered nothing at all. The decision now comes first, and
    only a word search — which navigates anyway — reaches preventDefault(). The compiled client chunk was
    read after each change instead of being assumed correct: it calls the shared function, and the branch
    order in the bundle is the branch order in the source.
    One more thing the shape of that reading had to learn, because R3.7 caught it: a number arrives with
    a word attached. "01712817090 বাবা" — father, written beside the number — is one cell of the owner's
    own sheet, and parsePhoneCell() has always read the number out of it and kept the label as a doubt.
    The first version of isNumberAttempt() answered "not a number" to that cell, so the same text was a
    number on the way in and not a number on the way out. Words are allowed in the shape now, and
    phoneSearchDigits() drops them and matches the digits — which is what R3.7 has asserted all along and
    what an operator who pastes a cell means. Two details of writing that down are worth keeping: a class
    of \p{L} alone does not match Bangla, because বাবা is letter-mark-letter-mark, so \p{M} sits beside
    it; and a "-" between "+" and a property escape is read by V8 as a range and rejects the whole
    expression, so it goes last. R3.3 pins both, with the label case in Bangla digits too, and pins that
    two numbers in one box ("01712817090,01911223344") is a sheet cell and not a search.
    R3.8's two digits kept failing after that, with a diagnostic that said the whole panel had gone: no
    navigation, no answer, nothing to wait for. The cause was not in the box's logic at all — it was the
    suite racing React. A form action disables the submit button while it runs and React resets the form
    (recursivelyResetForms calls form.reset()) in the commit that carries the answer; a Playwright click
    waits for that same button, so a value typed while the PREVIOUS search was still in flight was wiped
    before the click landed, and the click submitted an empty box. An empty box is a word search, and a
    word search with nothing typed builds the URL the address bar already holds — the panel folded away,
    nothing answered, ninety seconds later the suite gave up. The four digits steps passed beside it
    because a screenshot and an overflow measurement ran in between, which is the whole difference
    between them: time.
    Two changes close it. The suite now types through one helper that waits for the button to come back,
    fills, and confirms the box still holds what it is about to submit; and it reads each answer from the
    commit that just landed (rows for a hit, a message and no rows for a refusal) instead of from "a row
    is visible", which the previous search's rows satisfy instantly and so proved nothing — the Bangla
    digits step had been passing on the four digits step's results. The component learned the same lesson
    on the operator's behalf: when the href it would push is the address bar it is standing on, it does
    nothing at all and leaves the box open, so an emptied box can never fold the panel away with no answer
    in it again.
    That run also got further than any before it, and the next step it failed on had never been reached in
    CI at all: §8's content editor. What it waited for was the admin error boundary, which is not what this
    app gives a refused role anywhere else. The Recycle Bin and the Overview both answer a role they will
    not serve with redirect(); the leads pages answered with requireArchiver() throwing, which lands in
    admin/error.tsx and reads "could not load data, check the database connection and permissions" — a
    sentence that sends the owner to the database when the truth is that a teacher is not allowed in. Both
    leads pages now ask getArchiver() and redirect to /{locale}/admin, which for a content editor goes on
    to /admin/content exactly as the Overview already sends them. The ACTIONS keep requireArchiver(), and
    tests/lead-phone-search.integration.ts still pins that they do: an action answers the form that called
    it and has nowhere to send anybody, so it throws and the form says no. §8 waits for the address bar to
    leave the visitor list — a fact about the refusal rather than about one particular screen — and then
    proves the guard ran before a single lead was read: no visitor name, no mask, no whole number, no row,
    no sidebar item and no quick-add form anywhere in the document the refused role lands on. That mattered more than it looks: an empty list at a front desk reads as "no such visitor",
    which is the wrong answer to give about a parent, while the refusal says the truth — that the
    fragment is too short to look anybody up by. Neither threshold moved, and R3.1 now pins both
    answers for 12, ১২, 999, 017-128, V-2026-0001, ধানমন্ডি ৯ and a blank box. The box's own label
    now says what it takes: "নাম, প্রতিষ্ঠান, আইডি বা নাম্বার".
    What the first four CI runs of R3.8 found, all of it in the suite or in what it drove rather than
    in a rule: the drawer's two lists shared one class, so "the timeline" matched the family list too
    (the family list is now .lead-notes.lead-family); a modal drawer left open put its backdrop over
    the next click; a status-chip check ran after the suite had deliberately lifted the very block it
    filtered on, so it is now proven while the block exists and a second chip is proven afterwards;
    two search hits written in the same instant have no order the suite may depend on, so it reads
    both rows instead of "the first"; and every result row carries a drawer, and a closed <dialog> is
    still in the document with its note form inside it, so "the submit button in this panel" was three
    buttons once two hits had rendered — it is now named by the form it sits in. Reading the suite
    against the markup it drives is what caught the last three; only the first one had been reported by
    a run.

20. R3.9 — the visitor SMS entry point (registry 36). Three ways in, one dialog: a row's drawer and the
    lead's own page send to one visitor ({source:'lead',id}), and the Visitors list sends to the rows the
    operator ticked ({source:'leads',ids}), with "everyone on this page" one tap above them. All three
    open on visitor_thanks, and all three render the SendSmsDialog R2 built — unchanged, because the
    dialog is source-driven and a new kind of subject is exactly what a source is for.
    The translation from a lead to an SMS candidate is one pure function, leadCandidates() in
    src/lib/leads/lead-sms.ts, and it is pure on purpose: no model, no query, no server-only import, so
    the rule that decides whether a visitor may be texted can be proved without a database and cannot
    drift between the list, the drawer and a bulk send. A lead becomes a candidate that is always
    'active' — 'removed' and 'on_hold' are a student's FEE states, and inventing one for a visitor would
    let a fee rule reach somebody who was never enrolled — with no holds, no chips, and exactly one
    number: the first one written on the sheet. A second number in the same cell belongs to a sibling or
    a parent, and doubling a thank-you to a family that visited once is a cost nobody asked for; two
    leads sharing one number are folded into a single message by the pipeline's own one-per-phone rule,
    which is the family case handled properly instead of by sending twice.
    "Do not contact" is excluded three times, and each time is a different job. The row offers no
    checkbox at all and shows বাদ instead, so the exclusion is visible in the list rather than only in a
    report afterwards. The bar above the list counts the blocked leads on the page out loud, apart from
    the ones with no number, because a promise made to a person and a gap in the sheet are different
    problems with different fixes and an operator who cannot see the difference cannot fix either. And
    leadsForSms() re-reads canContact() when the plan is built, so a visitor blocked in the minute since
    the page rendered is still not texted — the screen hiding a button is a courtesy, never the gate.
    The exclusion itself is no new code: the mark becomes the pipeline's own smsOptOut switch, so the
    sentence the operator reads is the one R2 already writes ("অপ্ট-আউট / যোগাযোগ করবেন না") rather than
    a lead-specific wording that could drift from it, and the skip list names each visitor beside it.
    The catalog a Visitors screen offers is narrowed by visitorSmsDialogData(): only templates whose
    chips a lead can actually fill — visitor_thanks (the center's own number), custom, notice and
    teacher_opening (a subject the operator types). A due reminder, a receipt, an exam result and the
    pending reminder are not offered, because a visitor has no fee, no month, no amount and no enrolled
    class, and offering one would end in the dialog's own "a value did not render" refusal after the
    operator had picked people, read a preview and pressed send. Not offering it is the rule this file
    already applied to pending_reminder, applied for a different reason: there nothing supplies the chip
    yet, here nothing ever will. For the same reason a visitor send offers no guardian-or-student
    question — there is one number, so there is nothing to choose — and the request forces
    target:'guardian' rather than trusting a radio that is not on screen: 'student' or 'both' against a
    lead would resolve to NOBODY, and a send that quietly covers nobody is worse than a missing radio.
    CenterSmsLog gained a lead reference beside its student one, with its own
    {templateKey,lead,month,createdAt} index. A row carries one subject or the other, never both: a lead
    id in a ref:'CenterStudent' field would populate as null and read as "this message went to nobody"
    in somebody's report, which is the kind of lie that only surfaces months later. recentDuplicateStudents()
    therefore takes the field to read, and the 24-hour repeat warning for a visitor send looks at the
    current month AND the one before it — a thank-you at 23:00 on the last day of a month and another at
    00:30 on the first day of the next are inside the same 24 hours but in two different months, and
    "we already texted this person today" is exactly the sentence an operator needs then. A student send
    still warns on its own month alone, because a due reminder IS a monthly message. The cost of a
    visitor send is still booked to the current Dhaka month even though a visitor has no fee month,
    because that is the month the money was spent in and monthSmsTotals() is where the owner reads it.
    The bulk selection is contactableLeadSelection(), which hands leadListFilter() — the same function
    the list itself filters with, extracted in this change set — the screen's own parameters, so "the
    leads on this screen" means one set of people to the list, to the count on the button and to the
    send. Its cap is the send pipeline's own (SMS_SELECTION_LIMIT = SMS_SOURCE_LIMIT = MAX_IDS = 1000),
    because a selection the pipeline would cut in half would make the button promise a send it cannot
    deliver. Picking is per page, and an id that is no longer on the screen drops out of the send rather
    than riding along invisibly, so the number on the button is the number that goes. An empty selection,
    a selection of invented ids and a malformed single id are refused by the dialog, and the source
    resolver answers EMPTY for an id-less request — an entry point that lost its ids must never become
    "everybody in the book".
    One consequence stated plainly rather than discovered later: the send route has been getAdmin() since
    R2, because a send spends real money, and R3 gives staff the Visitors list. So the picker and the
    drawer's Send SMS are loaded only for Admin and Super Admin, and a staff account sees the list exactly
    as it did before this change set — no bar, no checkboxes, no button that would answer 403. Whether
    the front desk should be allowed to send visitor thank-yous is the owner's decision, and if the answer
    is yes the change is one guard on the lead sources only, not a widening of the route for dues and
    receipts. It is recorded in R3-COVERAGE.md §9 item 4 and §10.
    Proof: registry row R3.9 runs test:lead:sms, which is two suites — tests/lead-sms.test.ts (pure, runs
    anywhere: the translation, exclusion through resolveRecipients with both labels, no fee rule reaching
    a visitor, one message for a shared number and never an ambiguous grouping, the narrowed catalog and
    the fact that every chip in it is a global one, the shipped visitor_thanks body rendering with the
    center's number and no chip left behind, and the three counts adding up to the rows on screen) and
    tests/lead-sms.integration.ts (the disposable database with a counting mock provider, nothing real
    sent: leadsForSms returning blocked and phoneless leads by name and never a binned one, dropping
    invented ids and honouring its cap; the selection answering the same filter as listLeads and refusing
    to be widened by a caller filter or a raw Mongo operator asking for blocked leads; the resolver's
    routing, subject kind and empty answers; a plan whose skipped list names the blocked visitor; a send
    whose log rows carry lead and no student, whose batch counts the skipped, whose audit row holds a
    batch id and no number; the repeat warning reading only the lead rows and catching a message sent two
    hours before a month boundary; the dialog's refusals, its re-read of permission after a visitor is
    blocked, and one requestId meaning one batch so a double-click cannot thank a visitor twice).
    tests/lead-screens-browser.integration.ts §10 drives the screen at 360 px and 1440 px and photographs
    the bar, the open dialog and the step-2 catalog into screenshots/r3/ (b2-visitor-sms-*,
    b2-visitor-sms-dialog-*, b2-visitor-sms-template-*, b2-visitor-sms-drawer-1440,
    b2-visitor-sms-one-1440). It sends nothing: a browser send would write rows the other sections'
    counts do not expect, and the database suite already proves the write end to end.

21. Duplicate phones became a decision the operator makes (R3.10). Quick-add given a number another
    live lead holds now asks instead of writing a second row: the holders are named and masked, with
    no digits and no family key anywhere in the question, and nothing is saved until one of three
    answers is pressed — add as sibling (the new row inherits the holder family key and the save says
    from whom), merge into a named lead (the entry folds in filling only empty fields and moving extra
    numbers and the entry note, writing no row at all), or keep as a separate lead (no family key, so
    two strangers on one number are not one family). A visitor's drawer lists the number-mates outside
    the family and offers tie (both leads stay, one key) and merge (the mate is folded in and binned
    with its notes and numbers, its family re-pointed to the surviving key); a mate that became an
    admission, a trial or a student is refused by name, and a merge that fails behind the binning
    restores its source. Proven by tests/lead-dup.test.ts and tests/lead-dup.integration.ts (registry
    row R3.10, the registry now 37 rows) and by section 11 of the browser suite, which photographs the
    question at 360 px and 1440 px and the drawer's mates block at 1440 px.

22. The front desk may thank a visitor, and sees its queue first (R3.11, R3.12 — the owner's two
    decisions of 2026-11-12). A staff account now gets the Visitors picker and the drawer's Send SMS,
    narrowed to the one thing it was given: the visitor thank-you, to one row or to rows it ticked. No
    custom text (the dialog shows the message instead of a textarea, and the server refuses a request
    that carries the thank-you's key and words of its own, because the pipeline honours any text it is
    handed), no other template, no other source, no retry of somebody else's batch, and no "select
    everyone on this page" — the one tap that would have been a send-to-all. Admin and Super Admin keep
    everything they had. The rule is one pure function, smsSendPolicyRefusal(), read by the send route
    before it builds a plan, so hiding a button stays presentation and the gate stays the server; a role
    that never had the SMS page is refused as a role, before source or template are read. Real sends now
    have a per-user daily ceiling: dailySmsLimitPerUser on the settings row (default 30, 0 turns it off),
    an input beside the unit cost on the SMS settings form, counted off the batches that operator owns on
    the Dhaka day and off messages actually sent, so yesterday and a chunk that failed count as nothing.
    Every preview reports what is left of today above the send button, and a send that would exceed it is
    refused 409 DAILY_LIMIT before the provider is asked — no log row, no batch to retry — with a Bangla
    sentence that carries the number and says tomorrow. A request whose batch already exists is answered
    with that batch rather than with the ceiling, and an automatic send carries no operator so a cron is
    never stopped by anybody's allowance. A staff Overview is now the visitor queue itself: today's
    follow-ups, the count already overdue and the next names, returned before requireAdmin() is ever
    called, with the intake counters, the automatic-SMS problems and the database usage left to admin and
    super admin; one scope function answers per role, and a role it does not know gets no panel at all.
    Proven by tests/sms-staff.test.ts and tests/sms-staff.integration.ts (registry row R3.11), by
    tests/staff-role.test.ts (row R3.12, the registry now 39 rows) and by section 12 of the browser
    suite, which writes the ceiling through the settings form, sends one thank-you as the desk, is
    stopped on the second, and photographs the narrowed dialog and the staff Overview at 360 px and
    1440 px. Section 10's old assertion that a staff account sees no picker at all was replaced rather
    than left to rot: it described a screen the owner has now changed.

23. The three hand-offs a visitor row owes (R3.13 rules and writes, R3.14 in the browser).
    The Visitors drawer now carries a hand-off strip under the row's own facts and above the notes
    timeline, with three buttons: convert to admission, book a trial, and mark not interested — the last
    only with a reason, because a status that closes a promise without saying why is a row nobody can
    work afterwards. Each hand-off writes its intake row and moves the lead in ONE transaction, so a lead
    can never claim an admission that does not exist; the number on the intake row is copied from the
    lead's own record at write time and is never posted by a form, which is also why a hand-off form
    shows the number as a mask in a read-only box — a prefill is served HTML, and served HTML gets the
    list screen's rule: no digits, no family key. Nothing is guessed: a lead with no guardian fills no
    guardian, a class below four offers no grade because the intake schema would refuse it, and a lead
    with no number cannot be handed over either way though it can still be closed with a reason. The
    references are the intake screen's own ADM- and TRI- shapes, so a handed-over row and a public form
    row are indistinguishable in the list, in tracking and in an export, and the three statuses are the
    vocabulary's own admitted, trial_booked and not_interested rather than a fourth invented for the
    occasion. A trial seat is taken with the same guarded increment the public booking uses, so two
    operators cannot sell the last seat twice and a hand-off can never oversell a class the public form is
    also filling; the slot list is asked for when the dialog opens and again when the class or subject
    changes, because a seat is a fact of the moment. Refusals, each with a sentence in both languages and
    each re-checked at write time so a disabled button is a courtesy and never the gate: a hand-off
    already done (ALREADY_CONVERTED, ALREADY_BOOKED), no number (NO_PHONE), a binned lead (BINNED — the
    next move is restore, not a form), consent the server does not simply trust (NO_CONSENT), a class
    that is full (SLOT_FULL) or switched off or already started (SLOT_GONE), and a reason that is empty,
    two characters or over two hundred (NO_REASON, REASON_TOO_SHORT, REASON_TOO_LONG). A reason that is
    real is filed trimmed and collapsed to one line as a note tagged not_interested against the operator
    who wrote it, and every hand-off audits the readable id and no digit.
    Proven by tests/lead-handoff.test.ts (the rules with no database, including 400 references without a
    repeat and a prefill that carries the mask and no eleven digits) and tests/lead-handoff.integration.ts
    (the writes: one admission and one lead in the same breath, a second convert writing no second row, a
    booking that takes its seat and a second one that refuses without taking one, the offered slot list
    excluding the full, the switched off and the past, the empty and two-character reasons changing
    nothing, BINNED for all three, NO_PHONE for both hand-offs but not for the close, NO_CONSENT writing
    nothing, and the drawer's view carrying masks) — registry row R3.13, script test:lead:handoff; and by
    tests/lead-handoff-browser.integration.ts, which drives all three at 360 px and 1440 px as an admin
    and as a staff account, reads every write back from the database, measures overflow, and photographs
    the three dialogs plus the switched-off strip into screenshots/r3 as b3-handoff-admission-{360,1440},
    b3-handoff-trial-{1440,360}, b3-handoff-reason-{1440,360} and b3-handoff-blocked-1440 — registry row
    R3.14. The registry is 41 rows. A duplicate test:sms:staff script line left behind by the previous
    change set was removed rather than left to shadow itself.
    Reading the committed 360 px screenshot of the trial dialog caught one thing no assertion had: the
    grade select's label was painted as its catalogue key, because handoffGrade was never added to the
    two message files. The key is there now in both, and the browser suite asserts that no hand-off
    screen ever paints a "leads." key path again — a screenshot is evidence, so it gets read.

Owed, stated plainly, in the order the owner fixed: the import wizard with dry run
(its merge step can reuse R3.10's planner as it stands), preview, flagged rows, unknown-column mapping,
Bangla comments as the first note, undo and idempotent re-import, then the funnel reports with CSV export.
No real SMS is sent at any point: SMS_PROVIDER stays mock until the owner approves
the mock version after their own hand test.

---

## Older deployment and operations guide

> Superseded by `DEPLOYMENT.md` and `OPERATIONS.md`; kept because it records the security posture and limitations of the earlier build.

> **Deploying to staging?** Start with [`DEPLOYMENT.md`](DEPLOYMENT.md) — the step-by-step
> staging checkpoint (Atlas M0, environment template, Vercel region and cron, BulkSMSBD without IP
> whitelisting, the locale/middleware check and the ten-line phone smoke checklist). This file is the
> broader operations and security posture around it.

> **Status:** This is an in-progress system, not a production-ready release. Do not collect real student or guardian information until the privacy, authorization, security and integration gaps in the README have been addressed and independently reviewed. Phases 2–6 are not complete merely because deployment scaffolding exists.

### 1. Prepare MongoDB Atlas

1. Create a project and cluster that supports transactions (Atlas replica set/cluster). Create a database named `dictioncoaching`.
2. Create a dedicated database user with the **readWrite role limited to `dictioncoaching`**, not a cluster-wide admin role. Allow this user to create the indexes used by the application.
3. Configure Atlas Network Access for your development machine and Vercel outbound traffic. Standard Vercel serverless deployments do not generally have a single fixed egress IP. Arrange static egress if you need an IP allowlist; otherwise assess the security tradeoffs before allowing `0.0.0.0/0`. Use strong, unique credentials and TLS.
4. Copy the SRV connection string into `MONGODB_URI`; URL-encode any special characters in the database username and password. The application explicitly selects the `dictioncoaching` database regardless of the URI path.
5. Back up existing data before using the seed. This revision introduces dedicated `Teacher`, `FAQ`, `Facility`, and `SiteSettings` schemas and unique indexes. If earlier generic collections already contain documents missing their new unique keys, duplicate-key index creation may fail. Back up and migrate those documents deliberately; do not drop collections or overwrite data automatically.

### 2. Configure a local environment

Use Node.js 22.13 or newer (Node 22 or 24 LTS). Copy `.env.example` to `.env.local`, which is ignored by Git. Never paste real values into source code, issue reports or chat.

Core variables required at normal server startup:

- `MONGODB_URI`: Atlas SRV URI, with credentials URL-encoded.
- `NEXTAUTH_SECRET`: a unique random secret of at least 32 characters. Generate with `openssl rand -base64 32`.
- `NEXTAUTH_URL`: exact origin, e.g. `https://your-domain.example` (no path).
- `AUTH_URL`: set to the same origin for Auth.js v5, especially in standalone production; verify that your trusted proxy restricts Host and forwarded headers. A mismatched origin fails startup validation.

Set `DATA_COLLECTION_ENABLED=false` until legal, security and operational review is complete. The server intentionally rejects intake and study writes while disabled. The only unconfigured development bypass is `PREVIEW_WITHOUT_SERVICES=1 npm run dev`; it is disabled in production and should never be set as a production substitute for credentials.

Optional integrations:

- Resend: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (a verified sender) and `ADMIN_NOTIFICATION_EMAIL`. Email is best-effort, not queued or guaranteed. SMS is implemented (R2, BulkSMSBD) and ships behind `SMS_PROVIDER=mock` with `CENTER_SMS_WRITE_ENABLED=false`; see `DEPLOYMENT.md` §5 and `SMS-GOLD-LIVE.md`.
- AI Study Buddy: `AI_API_KEY`, `AI_API_BASE_URL` (HTTPS OpenAI-compatible API base such as a provider's `/v1` endpoint) and `AI_MODEL`. Review the selected provider's policy, minor/guardian consent, moderation, retention, cost controls and terms before enabling. No image upload or moderation system is implemented.
- Cloudinary requires its cloud name, API key and API secret for the media library; verify uploads and deletions before use. Google login and online payment processing remain unimplemented.

### 3. Validate and seed

```sh
npm install
npm run seed:check       # validates bundled content; no credentials or DB writes
npm test                 # validation / deterministic-logic smoke tests
npm run typecheck
# Optional isolated browser/MongoDB replica-set smoke test (downloads browser and MongoDB binaries):
npx playwright install --with-deps chromium
npm run test:integration
```

In `.env.local`, set `SEED_ADMIN_EMAIL` and a strong `SEED_ADMIN_PASSWORD` (at least 12 characters, at most 72 UTF-8 bytes) before running the actual seed. These variables are used only by the seed, so they need not be stored in Vercel after setup. Do not put the password on the command line.

```sh
node --env-file=.env.local --import tsx scripts/seed.ts
```

The seed creates a super-admin if that email does not already exist and inserts missing bilingual faculty, five facilities, eight activities, FAQs and site settings by stable keys. It does not create students, fake outcomes, prices, bookings, phone numbers, notices or testimonials. Re-running inserts missing records but **does not update existing content or reset existing passwords**. If an account with the seed email already exists with a different role or inactive status, it is left unchanged and a warning is printed. Treat a failed or interrupted seed as partial; fix the issue and re-run. Passwords are never printed.

Faculty is read from MongoDB on the homepage and teachers page after seeding. An active admin can create, edit, order and publish/hide bilingual profiles at `/bn/admin/faculty`; these saves revalidate both locale versions of the relevant pages. The faculty editor can use an image URL from the media library, but does not permanently delete profiles. In an unconfigured preview or empty faculty collection the bundled faculty list is shown. If a configured database read fails, an empty state is shown instead of resurrecting unpublished profiles. Seeded facilities and FAQs can be managed at `/bn/admin/site-content`, and the basic name, address, logo and social links at `/bn/admin/site-settings`. The homepage banner is editable at `/bn/admin/hero`; primary/action colors can be configured under site settings; additional banners and other page text remain outside these editors. Public facilities and FAQ lists use published database records in a configured environment; run the seed on a fresh database. Re-running the seed recreates deleted seed items, so hide rather than delete items that must stay hidden. A separate editorial CMS supports articles, notices, videos, gallery items, testimonials and achievements.

### 4. Deploy to Vercel

1. Push the project to a private repository after checking for secrets and personal data (`.env.local` is ignored; `.env.example` contains placeholders only). Import the repository into Vercel as a Next.js project.
2. Configure the core server variables separately for Preview and Production. Use a separate database and auth secret for each environment. Set each environment's `NEXTAUTH_URL` and `AUTH_URL` to its actual public origin; sitemap and Open Graph metadata use this URL.
3. Keep `DATA_COLLECTION_ENABLED=false` for initial review. Do not commit or expose secrets through `NEXT_PUBLIC_*` variables. Deploy using the normal Next.js build command. Production startup validates the core variables and fails with a readable error when they are missing.
4. Verify the public pages in `/bn` and `/en`, language switching, mobile layouts, accessibility, map pin, footer and assets. Seed the intended database from an authorized machine with Atlas access. Log in as the seeded admin and verify the faculty editor and the other implemented admin workflows using synthetic data only.
5. Exercise authentication and role isolation using distinct test accounts. Test admissions and trial capacity, including concurrent booking/cancellation, against Atlas and inspect indexes/transactions. Test notifications and AI with non-sensitive test content. Test the production service worker over HTTPS, including offline behavior and that private data isn't cached. Restore and test a database backup.
6. Only after the missing functionality and reviews are addressed, publish an approved privacy policy, retention/deletion procedures and terms; define support and incident-response ownership; review forms and consent for minors; then explicitly enable data collection. Do not consider the current checkbox or placeholder policies legal approval.

### 5. Ongoing operations

- Restrict and review admin access; enforce strong passwords and add MFA, complete the staff lifecycle, and review/test account recovery before launch. Current admin audit records are best-effort, not tamper-resistant or transactional.
- Maintain Atlas backups and test restores. Keep access logs, secrets, scopes and network rules under review; rotate secrets through the appropriate provider and Vercel settings. A rotated Auth.js secret invalidates existing sessions.
- Add edge/WAF rate limits and trusted proxy configuration. Existing rate limits are database-backed and depend on correct proxy headers; they are not a substitute for production abuse protection.
- Monitor delivery and add a durable retry queue before relying on email. Track AI token usage and provider costs. Public content is not all CMS-managed yet.
- See `README.md` for feature-specific limitations and the tests that have and have not been performed.

### Additional verification for editorial content and model tests

Use `/bn/admin/content` and `/bn/admin/media` to verify published content, image handling and revalidation with synthetic data. The media deletion reference check is not transactionally coupled to every content edit; do not rely on it as a complete lifecycle guarantee. Use `/bn/admin/model-tests` to publish a synthetic test and verify server-side deadlines, answer persistence, double submission, multiple devices, class/role isolation and the mistake notebook using separate student accounts. Do not include real assessment content until those tests and a security review are complete.

### Bangla-first and preview behavior

The unprefixed root always redirects to `/bn`; English remains available through `/en`. After changing database/auth or `DATA_COLLECTION_ENABLED` settings, redeploy so statically generated public pages reflect service availability. The preview’s development-origin allowlist includes `*.e2b.app` to allow interactive controls in the sandbox; it does not configure production CORS or authorize server actions. Do not expose a development server with production data or secrets.

Site settings use bundled defaults if the singleton is absent or cannot be loaded. Verify all new logo and social URLs and the address-derived map pin before launch. Cloudinary deletions and concurrent content changes are not transactionally coupled.

Course administration is at `/bn/admin/courses`. Publish only verified bilingual course, schedule and fee information. No course records or prices are fabricated or seeded; a configured database with no published courses shows an empty list. The course catalog is informational and is not an enrollment or payment system.

### Account recovery and session revocation

Email recovery is disabled until `PASSWORD_RESET_ENABLED=true` and valid Resend credentials and a verified sender are configured. Configure an HTTPS canonical `NEXTAUTH_URL`/`AUTH_URL` before enabling it, and confirm account email ownership through an approved process. Tokens are single-use, hashed at rest and expire after 30 minutes. They are delivered in a URL fragment to avoid inclusion in HTTP request URLs, but remain sensitive in email and browser memory. The UI requires JavaScript. Test actual email delivery, expiry, spam filtering and trusted proxy/edge rate limits in the deployment environment; delivery is not queued or guaranteed, and response timing may permit account enumeration. Do not collect user data until the privacy and security reviews are complete.

Existing sessions issued before the session-version upgrade are invalid for protected data and require a new sign-in. Password change/reset, account editing and activation changes revoke sessions; site middleware may still see a stale JWT but protected server operations check the current DB version. Admins can manage portal accounts, not admin roles. Only super-admins can view the activity log; it is best-effort, incomplete, non-transactional and not tamper-resistant. Secure backups, audit retention and reliable centralized security logs are still required.

### Batches, banner and private materials

Admins can configure the bilingual homepage banner under `/bn/admin/hero`, edit/archive batches under `/bn/admin/batches`, and publish or delete batch PDF materials under `/bn/admin/materials`. Verify image rights and alt text. Batch grade is immutable; use a new batch for another class. Removing a student preserves historic marks and attendance in the database but removes their visibility and private-material access until the student is enrolled again. Teacher entry and material upload permissions recheck active assignment. Enrollment and teacher writes require MongoDB transactions; verify indexes, replica-set support and concurrent operations on the actual Atlas cluster.

Private material uploads are limited to 2 MiB and use MongoDB binary storage. Only active staff can upload; only administrators can publish. Download authorization uses current active account status and batch membership; published files remain downloadable by enrolled students and linked parents in archived batches. The response is a no-store attachment, not a public URL. The PDF signature check is not malware scanning or full PDF validation; implement an appropriate scanning, review, quota, copyright, retention and incident-response policy before using uploads with real users. Ensure platform request-body limits exceed 2 MiB plus multipart overhead, restrict proxy headers and use the canonical HTTPS `NEXTAUTH_URL`, and include these files in encrypted backups and storage-capacity planning. In-flight requests cannot be recalled after authorization. Test access isolation, publication, deletion, uploads, role changes and backup restoration in the deployment environment. No live Atlas service or production load/concurrency test has been performed.

#### Manual fee operations and brand colors

The fee module is an admin-entered ledger, not an online payment gateway or proof of payment. Before enabling it for real students, test on the actual Atlas replica set with synthetic accounts, ensure the invoice/payment idempotency indexes were created, exercise concurrent payments and voids, verify student/parent isolation, and establish financial reconciliation, secure backups, retention rules and a reliable independent audit trail. Amounts are integer poisha, maximum BDT 1,000,000 per entry. No fee data is seeded. Record payments only after independently verifying receipt; correct mistakes by voiding and reissuing. After an uncertain response, check history before retrying: a browser reload generates a new submission key and can permit a duplicate. Admin student selection is capped at the newest 1,000 profiles; linked-parent lists are capped at 50 profiles. There is no automatic charge, refund, receipt or export.

Primary/action colors at `/bn/admin/site-settings` are limited to colors with at least 5:1 white-background contrast; verify actual contrast and all presentation states as part of an independent accessibility audit. Only supported buttons, links and active navigation use these settings; other brand styling is fixed. The standard brand red is too light for this text threshold and falls back to darker `#C51920` on interactive elements.

#### Batch notices and academic history

Private batch notices are separate from public editorial notices. Test draft/publication, hiding, deletion, teacher reassignment/archival, student unenrollment, parent links and cross-student isolation with synthetic accounts on your real deployment before enabling them. Drafts can be edited or deleted only after hiding; publishing can reach all current members of the selected batch, including linked parents. Previously published notices remain visible to enrolled students and linked parents after batch archival; assigned teachers lose access when the batch is archived. An admin can publish a pre-existing draft for an archived batch, so review the audience and archive indicator. Treat notices as group-readable information, not a channel for sensitive individual records. Audit is best-effort, and already viewed or downloaded content cannot be recalled.

Student and parent history pages show paginated attendance and published exam marks only for each student's currently linked batches. Parent accounts are capped at 50 linked profiles. Run access-isolation and load tests against Atlas and validate operational retention/backups before using real student data. Rankings, report cards and grading policies are not implemented.

Privacy contact has been supplied, along with an intention to review student records one year after a student leaves the center and offline guardian-consent approach. These do not establish a complete retention/deletion schedule or verified consent workflow. See `PRIVACY-DRAFT.md`; obtain institutional/legal review and implement operational procedures before enabling data collection. The system does not record departure dates, schedule reviews, automatically delete records, or verify offline guardian consent.

For a Bangla-first walkthrough of connecting an existing Atlas cluster, see `SETUP.md`. Run `npm run atlas:check` locally to perform a redacted, read-only connection and read-permission check; it does not exercise write permissions, indexes or transactions. Run `npm run test:atlas-check` for the isolated probe/redaction test. Never paste credentials or a full URI in chat.

---
