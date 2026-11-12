## Start here: verify this build in one command

Copy and paste these four lines, one at a time. Nothing here touches your real database —
verification runs against a disposable database that is destroyed at the end.

1. Install **Node.js 22.13 or newer** (Node 22 LTS is fine): <https://nodejs.org> — then check with
   `node -v`.
2. In the project folder (the one that contains `package.json`):
   ```bash
   npm ci
   ```
3. Run the verification:
   ```bash
   npm run verify
   ```
   First run takes 5-15 minutes (it builds the app, installs the test browser if missing and
   downloads a disposable MongoDB). Later runs are much faster.
4. Send back **`verify-output.zip`** from the project folder. It contains:
   - `verify-report.md` — one line per requirement: ✅ PASS, ❌ FAIL or ⚠️ NOT TESTED with the reason
   - `screenshots/r0/…` — every key page at **360 px** (mobile) and **1440 px** (desktop)
   - `logs/…` — the raw output of each step

To check only one milestone: `npm run verify -- --milestone=r1`.
To skip the app/database part (unit tests only): `npm run verify -- --skip-app`.

**If a step fails**, look for the message and do this:

| You see | Do this |
| --- | --- |
| `npm ERR! code EUSAGE` / `npm ci` fails | Delete `node_modules` and `package-lock.json` changes, then run `npm ci` again. |
| `Node v18…` or "older than the required 22.13" | Install Node 22 LTS from nodejs.org and open a new terminal. |
| `Download failed for url "https://fastdl.mongodb.org/…"` | Your network/firewall blocks MongoDB's download server. Retry on a normal connection (not a restricted office/school network), or install MongoDB yourself and run `MONGOMS_SYSTEM_BINARY=/path/to/mongod npm run verify`. |
| `Playwright Chromium is missing` / `cdn.playwright.dev` unreachable | Run `npx playwright install chromium` (on Linux also `npx playwright install-deps`, which may need administrator rights). |
| `EADDRINUSE` / port 3111 busy | Use another port: `npm run verify -- --port=3200`. |
| Build killed with exit code 137 | Out of memory. Close other programs and retry; the build needs about 1.5 GB free. |

Full details, what each step does and how requirements are registered: **[`docs/VERIFY.md`](docs/VERIFY.md)**.
Status words used in this project: **"code complete, awaiting owner verification"** until your run
comes back all PASS; **"verified"** only after that. Never "done" on unit tests alone.

## Disposable test mode (5 steps)
1. Install Node.js 22.23.4 and run `npm ci`.
2. Run `npm run test-mode`; it prints STARTING while it typechecks and checks the included prebuilt test app. If application files changed, it rebuilds. The first run may download MongoDB; Linux needs its runtime libraries.
3. Open `http://localhost:3000/bn/admin` and sign in as `demo-admin@example.test` / `DemoOnly-2026!`.
4. Confirm the **টেস্ট মোড** banner; use only fake/demo data. `TEST_MODE_PORT=3001 npm run test-mode` changes the port.
5. Press Ctrl+C to stop. The in-memory replica-set data is destroyed; the real `MONGODB_URI` is ignored.

# Diction Coaching Center — বাংলা-first website — in progress

**Current launch status:** Not production-ready. See `ADMIN-ROLES-AND-CONTENT.md`, `PRODUCTION-READINESS-STATUS.md` and `ACHIEVEMENT-WORKFLOW.md` for the latest feature gates, tests, safety limits and launch blockers. Historical phase notes below may describe earlier snapshots.

A bilingual Next.js App Router foundation for Diction Coaching Center. The public pages are a branded preview; pages and dashboard modules marked “coming soon” are not implemented yet. Do not deploy as a finished production system.

## Run locally

1. Use Node.js 22.13 or newer (Node 22 or 24 LTS recommended). Run `npm install`.
2. Copy `.env.example` to `.env.local` and fill the values. `MONGODB_URI`, `NEXTAUTH_SECRET` (at least 32 characters) and `NEXTAUTH_URL` are required when accessing database-backed functionality. Set `AUTH_URL` to the same public origin as `NEXTAUTH_URL` for Auth.js v5; restrict proxy/host headers to trusted infrastructure. For an explicitly unconfigured local design preview only, run `PREVIEW_WITHOUT_SERVICES=1 npm run dev`; this bypass is disabled in production. Generate a secret with `openssl rand -base64 32`.
3. Run `npm run dev` and visit `http://localhost:3000/bn`. English is at `/en`.
4. To create the initial super-admin, supply `SEED_ADMIN_EMAIL` and a strong `SEED_ADMIN_PASSWORD` of at least 12 characters and at most 72 UTF-8 bytes, then run `node --env-file=.env.local --import tsx scripts/seed.ts`. Existing users are not overwritten. The password is never printed.

## Atlas and Vercel

Create a MongoDB Atlas cluster and a **least-privilege database user with readWrite on the dictioncoaching database only**. Configure Atlas Network Access to permit your Vercel deployment's outbound connections; Vercel deployments generally do not have fixed outbound IP addresses unless you arrange static egress. Assess the risks before using `0.0.0.0/0` and use strong credentials. URL-encode special characters in the database password in the connection URI. The connection helper explicitly selects `dictioncoaching` and caches connections.

In Vercel, import the repository, set the environment variables in project settings for each environment, and deploy. Set `NEXTAUTH_URL` and `AUTH_URL` to the deployment origin and use an independent secret per environment. Cloudinary is optional and Google login is not implemented; Resend and an OpenAI-compatible AI provider are optional integrations that require configuration and testing. Never commit `.env.local`.

## Phase 1 scope and boundaries

- Next.js 16, React, strict TypeScript, Tailwind tokens, bilingual `next-intl` locale routing, local fonts and responsive home preview.
- JWT credentials authentication, bcrypt, seeded super-admin and middleware role checks. Google login is intentionally disabled pending a secure account-linking policy. Login requires MongoDB and configured environment values.
- A cached Mongoose connection and **foundation schemas**, not complete domain schemas. User has typed identity, role, indexes and password hash. Several named models remain bilingual generic extension points and need domain fields, indexes, validation and authorization in their feature phases. Intake, academic, study and selected public content models have dedicated schemas.
- The supplied brand logo and generated PWA icons are installed. Student and classroom images are AI-generated illustrations.
- Missing: self-registration, production-grade login protection, the full CMS, complete student/teacher/parent dashboards, comprehensive data access policies, complete audit logging, comprehensive accessibility and production integration testing, and advanced features. Core environment validation runs at server startup, except in explicit development-only preview mode. Other integration credentials are checked when used. Do not use this foundation for real users until these gaps are completed and independently security-reviewed.

## Phase 2 public website

The bilingual home, about, course guide, faculty, facilities, demo classes, blog, results, notices, gallery, contact, privacy and terms routes are available. Bangla is the default for `/` regardless of browser language; English remains available under `/en`. Public content uses `src/messages/bn.json` and `src/messages/en.json`, and published faculty, editorial content, facilities and FAQs can also come from MongoDB. Site identity and contact details can be edited in the admin workspace. Public pages use static rendering/one-hour revalidation where applicable. In a configured environment, the course page filters published admin-managed courses by class and subject; without services, it shows an explicitly labeled general subject guide. The course list does not guarantee current availability. Faculty biographies use the supplied seed information; portraits are placeholders. The classroom and student images are AI-generated illustrations, not photographs of the institute.

No individual videos, blog posts, testimonials, results, notices, or gallery images were supplied, so the corresponding pages deliberately display empty states until an admin publishes content. Published blog search and filters work against the loaded published list. Policies are placeholders and should be reviewed and approved before collecting personal information. The map is an external Google Maps embed; verify its pin before launch. Phone/WhatsApp details were not supplied.

Still to be done: connect the remaining public content to MongoDB and the admin CMS, complete additional filtering and media workflows, finish animation, independently audit accessibility and performance, and connect content to the CMS. Deployment requires setting `NEXTAUTH_URL` to the public origin for canonical metadata and sitemap.

## Phase 3: admissions, trial bookings and contact

The bilingual forms share Zod validation on client and server. Admission has five steps, a browser-tab session draft (which contains personal data and is removed after successful submission; old local drafts are migrated when possible), a review/consent step and a unique reference. The status lookup requires the reference and guardian phone number. Contact messages and admissions are persisted in MongoDB. Trial slots are filtered by class and subject, displayed in Asia/Dhaka time and checked at submission. A MongoDB transaction combines an atomic capacity increment with booking creation; a partial unique index prevents the same normalized phone number from booking the same active slot twice. These guarantees require a MongoDB replica set or Atlas cluster supporting transactions, and successful index creation.

**Data collection is disabled by default**, including in the preview. Before enabling it, finalize and publish the privacy policy, define retention and access controls, complete the security review, and set `DATA_COLLECTION_ENABLED=true` in the environment. Configure the required database and auth settings first. To attempt emails, set `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (a sender verified with Resend), and `ADMIN_NOTIFICATION_EMAIL`. Emails are best-effort, are not queued or retried, and failures do not roll back a saved submission; SMS is not implemented. Guard the secrets server-side. The initial admin UI supports admission status changes, slot management, booking cancellation and inbox review. Admission status defaults to `pending`. Only authorized operators should access the admin and database.

An authorized admin can create slots in the dashboard. Alternatively, an authorized operator can use this local tool, with a time-zone offset included explicitly:

```sh
node --env-file=.env.local --import tsx scripts/create-slot.ts --grade=8 --subject=math --start=2027-01-01T10:00:00+06:00 --end=2027-01-01T11:00:00+06:00 --capacity=20
```

Supported subject codes: `bangla`, `english`, `math`, `science`, `other`. Use real future dates and institute-approved capacities. The database must allow index creation. Rate limits use a MongoDB fixed window and a hashed proxy IP; correct enforcement depends on trusted proxy headers. Add edge/platform rate limiting and abuse protection before production.

Known gaps: optional student-photo upload, SMS, authenticated booking reschedule/cancellation, the rest of the admin CMS, a durable email queue, end-to-end/transaction concurrency testing against a real replica set, and production security review. A success reference confirms database receipt, not admission approval or email delivery. Run the local schema checks with `node --import tsx tests/intake.test.ts`. No live MongoDB or email credentials were supplied, so persistence, notification delivery and transaction concurrency have not been verified against real services.

## Phase 4: initial admin workspace

- Sign in with the seeded admin account, then visit `/bn/admin` or `/en/admin`. The development-only `/bn/admin-preview` displays the design without real records or working admin controls. It is unavailable in production.
- The protected admin overview shows live counts. Admissions are searchable and filterable, with detail, status and notes, pagination and a CSV export limited to the latest 5,000 matching records; spreadsheet formula characters are escaped.
- Admins can create, enable or disable slots and update capacity (never below booked seats). They can cancel bookings; cancellation releases a seat in the same database transaction. The message inbox supports search, filters, pagination and read/unread updates. All mutations and CSV exports independently verify an active admin/super-admin in MongoDB; middleware alone is not relied on for authorization.
- A basic admin audit record is written after supported mutations/exports, but is best-effort and not transactional; this is not a complete tamper-resistant audit system. JWT middleware role changes may require a new login, while data operations also check the live database role. Login has a database-backed per-IP and per-IP/account limit, contingent on trusted proxy headers; deploy edge-level protection too.
- The admin CMS remains partial: additional banners, full student management, complete exam tools, admin staff/role management, comprehensive audit controls, analytics, SMS/email sending from admin, and many requested CRUD and export functions are not implemented. Slot schedules may be edited only before any booking history exists; capacity and enable/disable controls are separate. The admin workspace uses the light theme; it has not had a complete WCAG audit. No real database is configured in this preview; authentication, live data, transactions, revocation, email, and concurrency still require integration testing on Atlas before any real-user use.

Run validation smoke tests with `node --import tsx tests/intake.test.ts` and `node --import tsx tests/admin.test.ts`. Do not enter real personal data until the privacy, retention, security and operational gaps are addressed.

## Phase 5: initial academic portals

The development-only `/bn/portal-preview` is a data-free design preview. Real portal routes require a signed-in, active account of the appropriate role: `/bn/dashboard` (student), `/bn/teacher`, `/bn/parent`, with equivalent `/en` routes. Each read and write rechecks the user's live database role. Students see only their own linked profile, batches, schedules, recent attendance and published exam results. Parents see only students linked to their account. Teachers can enter attendance for students in their assigned active batches and marks for unpublished exams belonging to those batches. The server verifies the student, batch, teacher assignment, mark range and exam publication state; result entry and exam publication contend on the exam record in a MongoDB transaction to avoid changing published marks.

An authorized admin can use `/bn/admin/academics` to create student, teacher and parent accounts, create bilingual batches, link a student and optional parent to a matching-grade batch, create exams and publish/unpublish results. Accounts are created with an admin-provided password of at least 12 characters, hashed using bcrypt; share credentials securely. Login now routes a user to the correct role portal by default. The minimum workflow is: create portal accounts → create a batch assigned to a teacher → link the student and optional parent to the batch → create an exam → teacher enters attendance and marks → admin publishes the exam. A student's existing grade cannot be changed through this enrollment form; when adding another batch, supply the currently linked parent again or the parent link is cleared.

This is an initial slice, not a complete Phase 5 implementation. Admin staff/role management, batch deletion and grade promotion, comprehensive course enrollment and schedules, additional material formats, student trial management, merit ranking, report cards, full analytics/charts and comprehensive pagination are not yet built. Admin selectors are capped at 1,000 accounts/batches and exam list at 100; teacher views cap batches/students/exams, and the portal overview shows the most recent 20 attendance and result entries; paginated histories are available separately. Parent view supports up to 50 linked profiles. There is no invitation or self-registration flow. Admin audit records remain best-effort.

An isolated replica-set/browser test covers selected role, persistence, index and concurrency behavior, but no live Atlas credentials were supplied; validate them with isolated test accounts and a transaction-capable replica set before collecting real data. Schema smoke tests: `node --import tsx tests/academic.test.ts`.

## Phase 6: initial Study Lab and offline support

A student with a linked profile can visit `/bn/dashboard/study` or `/en/dashboard/study`. `/bn/study-preview` and `/en/study-preview` are data-free development previews; only the local timer is interactive there. Data collection must be enabled explicitly before saved features can write.

- **Daily math challenge:** deterministic arithmetic/linear problems vary by Dhaka calendar day and class band. Correct completion grants 10 XP once per day, with a consecutive-day streak. Completion, XP and streak are committed atomically using a MongoDB transaction and a unique student/day index. This is a basic generator, not a teacher-curated or curriculum-aligned question bank.
- **Study planner:** stores an exam date, up to six comma-separated subjects and a daily time budget; it rotates subjects through the next 14 days or until the exam, whichever is shorter. It is a simple rule-based schedule, not personalized analytics.
- **Focus timer:** a local 5/15/25-minute timer with pause/resume. Completed sessions are self-reported to MongoDB exactly once by session ID when the page remains open. They are not independently verified and do not award XP. A running timer does not survive closing/reloading the page.
- **AI Study Buddy:** discoverable from the public More menu and student dashboard, with a read-only admin configuration checklist. The default provider endpoint is Google Gemini’s OpenAI-compatible API; configure `GEMINI_API_KEY` and `AI_MODEL` privately, and enable both `AI_STUDY_BUDDY_ENABLED=true` and `DATA_COLLECTION_ENABLED=true` **only after** the necessary privacy, guardian-permission, safeguarding, moderation, provider-terms and cost reviews. The authenticated student enters text and explicitly confirms permission; the server sends recent chat (up to eight messages) and the student's grade to the configured provider. The app does not persist chat on its server; the provider’s own retention rules still apply. Responses can be wrong; there is no image upload or comprehensive moderation pipeline. A checkbox does not verify offline guardian permission. The app enforces a rate limit and does not expose the key in the UI. See `AI-SETUP.md`. Real Gemini connectivity, model access, quota and billing have not been verified.
- **PWA:** in production on HTTPS, a service worker caches only the static offline page and icons. Public navigation falls back to the offline page when disconnected; private pages and API responses are never cached by the worker. This is not a full offline app.

Phase 6 remains incomplete: the adaptive assessment, full gamification/badges/leaderboards, richer personalized analytics, a model-verified streak tracker, advanced interactive tools, complete PWA testing, accessibility and Lighthouse audits, and full production security hardening. All external integrations, transaction and multi-user behavior, AI streaming and PWA behavior still require real environment/browser testing. Run `node --import tsx tests/study.test.ts` for schema and deterministic logic smoke tests.

## Phase 7: seed and deployment foundation

The seed validates the supplied data and creates missing records for 7 teachers, 5 facilities, 8 activities, 4 FAQs and site settings, plus the environment-specified super-admin. It never overwrites existing records or resets passwords. Check seed data without a database or credentials with `npm run seed:check`; seed a configured database with `node --env-file=.env.local --import tsx scripts/seed.ts`. See [DEPLOYMENT.md](./DEPLOYMENT.md) for Atlas, Vercel, environment isolation and operational checklists.

The faculty manager at `/bn/admin/faculty` and `/en/admin/faculty` can create and edit bilingual teacher names and qualifications, set display order, and publish/hide profiles. It triggers path revalidation for the homepage and teachers page. Faculty photos can be uploaded directly or selected using an existing approved image address; profile deletion is not implemented. Seeded facilities, FAQs and basic site identity are connected to the public website and their admin editors. Faculty uses bundled fallback data only for an unconfigured preview or empty collection; a configured database read failure produces an empty state rather than exposing hidden profiles.

`npm test` runs all local validation and logic smoke tests. No Atlas, email or AI credentials were available, so **seed idempotence against Atlas, Atlas-specific behavior, transaction concurrency, email, AI streaming and production PWA behavior have not been tested end-to-end**. An isolated replica-set/browser test does cover selected authenticated CRUD and revalidation flows. The remainder of Phases 2–6 remains unfinished.

## Subsequent completion work: editorial CMS, media and model tests

- An authorized admin can create, edit, publish and delete bilingual blog posts, notices, YouTube demo videos, gallery items, testimonials and achievements at `/bn/admin/content`. Blog text uses a TipTap editor; the server sanitizes HTML on write and on read. Published content appears on its public page, with article pages, blog search/categories/tags, demo video category filtering, a gallery lightbox and a simple achievements view. The homepage surfaces the first published post, achievement and testimonial. Saves invalidate public routes and sitemap. Content queries currently cap at 300 published items per type; pagination beyond that cap and scheduled publishing are not implemented. Video links must use a supported YouTube URL.
- `/bn/admin/media` and the faculty, editorial, banner and settings forms support public PNG/JPEG/WebP uploads up to 4 MiB. The server authenticates admins, bounds incoming bytes, decodes and re-encodes to WebP (removing metadata, with a 25-megapixel input limit), and stores images in MongoDB unless all three Cloudinary credentials are configured. Images are public: never upload private documents. Uploads require JavaScript, a working database, and an exact canonical `NEXTAUTH_URL`; existing Cloudinary assets still require Cloudinary credentials to delete. Unused uploads can be removed from Media. Deletion checks known references, but the check is not transactional with content edits. Storage costs, backups, quotas, lifecycle cleanup, malware review and cache invalidation require operational planning. Cloudinary integration has not been tested with a real account.
- `/bn/admin/model-tests` can create and publish simple bilingual four-option MCQ tests, with a time limit and optional per-wrong-answer penalty. A student with a linked profile in the matching class can start one attempt at `/bn/dashboard/model-tests`. Each answer is saved server-side before the deadline; marking and detailed explanations happen on submission, and incorrect answers appear in the student's mistake notebook. The answer key and solutions are not sent to the active test UI. A server-set deadline continues while the page is closed; on reopening an expired active attempt, the last saved answers are submitted. Score finalization uses an optimistic revision check to avoid scoring stale concurrent saves.
- Model tests are an initial implementation: no editing or retakes, adaptive level assessment, question-bank reuse, admin analytics or full examination safeguards. The client must remain online to save answers, and automatic finalization depends on an open/reopened page. An isolated browser test checks server-side late-answer rejection; multi-device timing, concurrency and the actual Atlas deployment still need further testing. Full CMS modules, additional banners, advanced fee tools, self-registration, dashboards, advanced learning features, accessibility audits and production hardening are still incomplete. Do not treat this project as finished or production-ready.

### Tests and remaining integration work

`npm test`, `npm run typecheck` and `npm run seed:check` cover schemas and deterministic logic. The optional `npm run test:integration` builds an isolated temporary copy (skipping the duplicate build-time typecheck, so run `npm run typecheck` separately) and starts an in-memory MongoDB replica set and Chromium with generated test credentials. First run `npx playwright install --with-deps chromium` (OS package installation may require administrator privileges); the MongoDB binary must also be downloadable. It exercises credentials login, role boundaries, unpublished content, XSS sanitization, CMS, site-settings, FAQ/facility and model-test publication and revalidation, banner publishing, batch changes, private-material authorization, password recovery/change, account editing and revocation, audit permissions, media rejection, test start/save/submit/scoring, late-answer rejection, answer-key secrecy and basic 360/768/1440-pixel overflow checks. It does not prove WCAG conformance or comprehensive security. Temporary build and database content are removed on normal completion.

Atlas, Cloudinary, mail and AI credentials were not supplied, so real provider integrations, live uploads/deletions, notifications, load/concurrency behavior and production deployment are still unverified. `npm audit` reported no known vulnerabilities at the last local check; continue auditing dependencies before release.

## Bangla-first navigation and service availability

Bangla is the default on `/`, including for visitors whose browser language or previous locale preference is English. Explicit `/en` routes remain available; the language link preserves the current page, query and fragment when JavaScript is active. The More and mobile menus use native disclosure elements and remain navigable without JavaScript. The preview permits its `*.e2b.app` development origin so client-side controls can hydrate; this is a **development-only** setting. Restrict development-server access and never expose it with production credentials.

If the database/auth configuration or `DATA_COLLECTION_ENABLED=true` is missing, online admission, tracking, booking and contact forms now explain that the service is unavailable and link to the institute's official Facebook page instead of inviting personal information that cannot be submitted. The login page likewise explains when account services are not configured. Configure and redeploy to enable these flows; do not enable data collection until privacy, consent and security reviews are complete. With a configured service, an unavailable trial slot can be retried, and an empty slot list offers a contact link. Client forms use POST and prevent submission before hydration to avoid accidentally putting personal data in a URL.

For the service-free preview, run `PREVIEW_WITHOUT_SERVICES=1 npm run dev` and then `npm run test:ux` in another terminal (requires Playwright Chromium). The test checks menus, locale switching, subject/class selection, teacher dialogs, FAQ, disabled-service notices, and responsive overflow; it does not replace a full accessibility or usability audit.

## Site content and identity CMS

`/bn/admin/site-content` lets active admins create, edit, publish, hide and permanently delete bilingual FAQs, facilities and activities. It invalidates the homepage and facilities pages for both languages. FAQs render as expandable items on the homepage; published facilities and activities appear on the facilities page. In a service-free preview bundled seed content is shown. Once MongoDB is configured, only published database records appear; an empty collection or failed read yields an empty state rather than reviving unpublished information. Run the seed on a new database to populate the supplied initial content. Re-running the seed restores missing seeded records, including deliberately deleted ones, but does not overwrite existing records; hide seeded records instead of deleting them if they must remain hidden after reseeding. Each public list is capped at 200 entries; the admin lists up to 200 FAQs and 200 facilities/activities.

`/bn/admin/site-settings` manages bilingual names and addresses, an uploaded or approved local-brand/Cloudinary logo and validated Facebook/YouTube links. These feed the header, footer, contact page and demo-video channel link; the contact map searches the saved address and must be manually verified. Saves revalidate both locale layouts. The original institution details are used when the singleton is absent or unavailable. The homepage banner is editable separately at `/bn/admin/hero`; primary and action colors can be edited here with contrast validation; additional banners and other page copy are not yet editable. Logo URLs are checked by the media manager on deletion, but concurrent changes can still cause dangling references.

The browser/replica-set integration test covers create, publish, hide and delete for these content types, saving settings, and representative public revalidation with synthetic data. Actual Atlas behavior, full admin permissions and concurrency still require deployment-specific testing.

## Admin-managed courses

At `/bn/admin/courses`, an active admin can create, edit, publish, hide and delete bilingual course descriptions, class and subject, with optional verified schedule and fee text. If supplied, schedule and fee must be entered in both languages. Published courses appear on `/bn/courses` and `/en/courses`, where both class and subject filters operate on the database-backed list. When MongoDB is configured but no courses are published, the page shows an empty state; it does not invent courses, fees, availability or schedules. The unconfigured design preview instead shows a clearly labeled general subject guide. The public list is capped at 300 courses and the admin list is paginated. The module is informational and does not provide course enrollment, payment processing or live capacity management.

## Account recovery, access control and activity log

- `/bn/admin/accounts` allows an active admin to edit the name/email and activate or deactivate student, teacher and parent accounts. It does not alter admin or super-admin accounts or roles. Changes revoke active sessions and outstanding recovery links. Verify a person's identity and ownership of their new address **out of band** before changing it. Accounts are created at `/bn/admin/academics`; no public registration or invitations exist.
- Any signed-in user may change their password at `/bn/account/security` after entering the current password. The change revokes all existing sessions, including the current one. New and seeded passwords require at least 12 characters and a maximum of 72 UTF-8 bytes (bcrypt's limit). Existing accounts created with longer passwords may have bcrypt truncation; have those users change their passwords after verifying identity.
- Email recovery at `/bn/forgot-password` is **disabled by default**. To enable, use an HTTPS `NEXTAUTH_URL`/`AUTH_URL` canonical origin, configure `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL`, verify account email ownership, and set `PASSWORD_RESET_ENABLED=true` before redeploying. The request response does not disclose whether an active account matches. Reset links contain a random 256-bit token in the URL fragment, are valid for 30 minutes, are stored only as a hash, and are consumed once. Using one changes the password and revokes old sessions. JavaScript is required to receive the fragment. Mail is sent best-effort without a queue; delivery is not guaranteed, and actual Resend delivery was not tested. Response timing may still differ for existing versus unknown accounts; add edge protections and independently review enumeration resistance. Do not log or share recovery links; email providers may process link URLs.
- Existing JWTs issued before the session-version update must sign in again. Sensitive server reads and mutations check the current account status, role and version in MongoDB. Middleware alone is not the authorization boundary; it can continue to see stale JWT roles until the session expires. Account edits, activation changes and password changes/reset increment the version so old protected sessions cannot revive.
- `/bn/admin/audit` displays a paginated activity log to super-admins only. Audit writes remain best-effort, incomplete, non-transactional and not tamper-resistant. Establish centralized security monitoring, reliable audit storage, incident procedures, edge rate limiting, MFA and independent security review before real-user use.

## Homepage banner and batch management

An admin can edit and publish the bilingual homepage banner at `/bn/admin/hero`, including headline, description, uploaded or safe local/Cloudinary image and bilingual image description. Unpublishing restores the bundled default; image URLs referenced by a saved banner are checked during media deletion. The reference check is not transactional with content edits. Obtain permission for every image. This edits one homepage banner; complete site-wide theme control and additional banners remain unfinished.

`/bn/admin/batches` lists and edits batches, including names, schedules and assignment to an active teacher. A batch's class is immutable; archiving stops new enrollment, exam creation, material uploads, and teacher entries without deleting existing enrollments or history. Reactivation requires an active assigned teacher. Admins can remove a student from a batch. Existing attendance and results remain in MongoDB, but are hidden from the student/parent views until re-enrollment; access to that batch's materials is also removed. No hard-delete, bulk promotion or transfer workflow is implemented. Batch lists and enrolled students are paginated; teacher-selection options are capped at 1,000.

Enrollment, exam creation, attendance and marks use transactions, and teacher writes lock/recheck the teacher account, batch and student so a concurrent account change, teacher reassignment, archive or enrollment removal is serialized against those writes. The transaction implementation requires an Atlas cluster or replica set; standalone MongoDB is not supported. The isolated browser tests cover standard allowed/denied flows, **not a comprehensive concurrency or load test**. Admin/teacher account lifecycle operations and external deployments still need independent security review.

## Private PDF learning materials

`/bn/admin/materials` and `/bn/teacher/materials` accept bilingual PDF materials for an active batch. An assigned active teacher or admin can upload a draft; only an admin can publish, hide or permanently delete it. Student and parent libraries are at `/bn/dashboard/materials` and `/bn/parent/materials`. Published materials are available only to enrolled active students, their linked active parents, and administrators; teachers may access drafts or published materials only for their assigned **active** batches. Enrolled students and parents retain access to published materials in archived batches until the enrollment or publication is removed. Authorization is checked per download; in-flight requests cannot be retroactively recalled.

Each PDF is limited to 2 MiB, stored as binary in MongoDB (not at a public Cloudinary URL), and served through an authenticated endpoint with `Content-Disposition: attachment`, `nosniff` and `private, no-store`. The server caps incoming request bytes and checks the PDF MIME type and `%PDF-` signature. This is **not** full PDF validation, malware scanning, DRM, or protection against a recipient sharing the downloaded file. Only upload content you have rights to use and have reviewed for safety. No storage quotas, antivirus scanning, file versioning, durable deletion log, or automatic retention schedule are implemented. Do not upload sensitive student information until privacy and security reviews, backups, access control, retention and incident procedures are in place. Protect MongoDB and backups; files consume database storage. The upload requires JavaScript and a same-origin canonical `NEXTAUTH_URL`. Lists are paginated (20 per page); teacher batch options are capped at 1,000 and parent profiles at 50. No materials are fabricated or seeded.

### Manual fee ledger and limited theme controls

Active administrators can create bilingual student-specific fees at `/bn/admin/fees`, record verified partial payments with date, method and optional reference, and void an entry with a reason. Payment voids reverse the recorded balance transactionally; fee records can be voided only when their recorded payment balance is zero. Voided entries remain in history. Active students and linked parents can view their own fee summaries and payment history at `/bn/dashboard/fees` and `/bn/parent/fees`; references and void reasons are admin-only. Teachers cannot access the ledger. Lists and histories are paginated, but the admin student selector is limited to the newest 1,000 student profiles, and parent linkage to 50 profiles.

This is a **manual record, not a payment gateway, receipt, proof of payment, tax invoice or accounting system**. No amounts or transactions are seeded. Verify actual receipt, reconcile against bank/mobile/cash records, maintain backups and establish retention and access policies before use. Fees support BDT only, 0.01–1,000,000 taka, stored as integer poisha. There are no refunds, discounts, partial fee adjustments, automated billing, exports, receipts, fine calculation or fee editing; void and reissue when necessary. Payment dates cannot be in the future in Asia/Dhaka. Form submission keys prevent exact repeated submissions while the key is retained, but concurrent duplicate requests can return a conflict. A reload creates a new key: check the ledger after an uncertain response before resubmitting to avoid duplicates. Transactions and unique indexes require Atlas/replica-set MongoDB. The isolated browser/replica-set tests cover role scoping, replay, competing payments and reversal, but not comprehensive load or real Atlas behavior. Audit is best-effort and not a reliable financial audit trail.

`/bn/admin/site-settings` also permits editing the primary and action colors used on primary/action buttons, text links and active navigation. Colors must be six-digit hex with at least 5:1 contrast against white; the supplied red `#ED1C24` fails this threshold, so the default interactive red is the darker `#C51920`. Decorative colors and other hard-coded styling remain unchanged. This is not a complete theme editor or an independent accessibility audit.

### Private batch notices and academic history

Administrators can create bilingual, plain-text batch notice drafts at `/bn/admin/portal-notices`. The batch is fixed on creation; only drafts can be edited or deleted. Publish to share and hide to withdraw; a published notice must be hidden before editing or deletion. These are separate from public website notices. Students and linked parents see published notices for their currently linked batches; the assigned teacher sees published notices only for currently active assigned batches. Enrolled students and linked parents continue to see published notices for archived batches until enrollment is removed or the notice is hidden. Administrators can still publish an existing draft for an archived batch, so review the archived indicator and audience first. Do not include sensitive individual information in a batch-wide notice. Notices are stored as text and displayed escaped; there are no attachments, scheduled publication, read receipts or push/email notifications. Lists are paginated, active-batch selection is capped at 1,000, and parent profiles at 50. Unique submission keys help prevent exact retry duplicates while retained; after a browser reload, check the list before resubmitting. No private notices are seeded. Audit records are best-effort and do not provide a durable deletion history.

`/bn/dashboard/history` and `/bn/parent/history` provide paginated attendance and published academic-exam result history. Each child's records are independently restricted to that child's currently enrolled batches; removing enrollment hides those records without deleting them. These pages do not calculate rankings, analytics, grades, report cards or unrecorded marks. Unpublished exams are excluded. The parent view is capped at 50 linked profiles. History aggregation and large datasets need load testing, and already-served content cannot be recalled after access changes. These modules require the existing MongoDB/auth configuration and a privacy/security review before use with real students.

`npm run test:portal-layout` runs an additional isolated replica-set/Playwright check for private portal layouts at 360, 768 and 1440 pixels and verifies attendance/result pagination. It builds a temporary production app, needs a MongoDB test binary and does not use production credentials.

### Privacy decisions received (not yet launch approval)

The institution supplied privacy contact `noor.diction@gmail.com` / `01684606304`, an intention to review student records one year after a student leaves the center, and an offline guardian-consent approach. The public privacy placeholder now displays the contact, but the policy remains unfinalized. See `PRIVACY-DRAFT.md` for a bilingual working draft and unresolved details. The application does not record departure dates, schedule reviews, automatically delete student records, define a backup disposal schedule, or verify/store offline guardian-consent evidence. Keep data collection disabled until the institution and appropriate counsel approve the policy, operational procedures and safeguards.

For an existing MongoDB Atlas cluster, see the Bangla-first `ATLAS-SETUP.md`. `npm run atlas:check` reads `MONGODB_URI` privately from `.env.local`, performs a read-only connection/read/topology probe and suppresses raw connection errors. It does not test writes, indexes, transactions or backups; `npm run test:atlas-check` verifies the probe against an isolated replica set and checks error redaction. Never share connection strings or credentials in chat.

### Sign-in and faculty profiles

See `DASHBOARD-LOGIN.md` for Bangla-first instructions to connect a test database, create your own initial admin, and sign in. No default admin credentials exist. A preview without services intentionally cannot sign in; `/bn/admin-preview` is a development-only, data-free design preview. Student, parent and teacher accounts are created separately by an admin.

Teacher profile dialogs display the saved name, role, qualification, optional photo and optional bilingual biography. Admins can add a verified biography in both languages under `/bn/admin/faculty`; older teacher records without a biography still work. No new biographies or portraits are invented.

### Recent usability fixes

The teacher and gallery dialogs are explicitly centered despite the CSS reset; faculty profiles include the existing verified qualification and optional admin-supplied bilingual biography/photo. Teacher dialogs support Escape and focus return. The English Latin font is the bundled local Inter font; Bangla text falls back to Hind Siliguri. Social links navigate in the current tab and the contact/unavailable screens show copyable addresses for restrictive embedded previews. External site availability and embedding policies are controlled by Facebook/YouTube.

The shared site identity header is server-rendered, blog dates are formatted on the server, and model-test timers render a stable placeholder until hydration. An isolated production-browser test covers a deliberately delayed exam hydration. Development hot reload or a browser with stale assets can still temporarily serve mismatched versions; restart the preview with a clean `.next` directory and hard-refresh the browser if this occurs. Do not delete a running production deployment’s build directory.

### Simpler admin workflows

New faculty, articles, courses, facilities and FAQ records receive a server-generated, randomly suffixed identifier; existing identifiers stay unchanged on edits. The trial-slot form uses separate date/time inputs in Bangladesh time, checks past/end/duplicate errors and asks the browser to close the date picker after selection (native behavior varies). Teacher batch assignments use active **login accounts**, not public faculty profiles: create the teacher account under Academics first, then assign it to a batch. Never create an account without the teacher's permission; share credentials securely and have them change their password. Lists have documented 1,000-account limits.

Cloudinary is optional for new uploads: when incomplete or absent, public images are stored in the configured MongoDB database; switching providers does not migrate old images. MongoDB storage and backup capacity can fill up, and browser/CDN caches may retain deleted public files. Image inputs are re-encoded and metadata removed but that is not a full malware scanning system or guarantee against every image decoder flaw. Uploads not associated with saved content remain in Media until an admin removes them.

### Admission and booking setup

The admin sidebar now links to an **Admission & booking setup** checklist with the data-collection switch status and the number of future slots with space. This is not a production-readiness certification. Admission drafts are kept in session storage for the current browser tab and cleared after a successful submission; previous local-storage drafts are migrated on first use where possible. Browser/session recovery can retain tab storage; clear drafts on shared devices. Slot selection shows Bangladesh time and a full end date when the class crosses midnight. A stale full-slot error remains visible even when no alternative slots remain. Admissions and trial bookings were exercised against an isolated test replica set; real Atlas, messaging and real-world concurrency are still unverified.

## Public motion, WhatsApp and channel videos

Public pages use Motion (motion.dev) for short page-entrance transitions, progressively enhanced after hydration. Content remains visible without JavaScript, and the effects are disabled for reduced-motion preferences and on dashboard/portal pages. Public pages also have a small WhatsApp quick-chat link to `https://wa.me/8801684606304` without prefilled personal information. WhatsApp is a third-party service; operators should review privacy and staff-handling procedures.

Demo Classes shows seven selected videos verified on Diction Coaching's public YouTube channel as an explicitly labeled static sample when the live feed is not configured. It is not a complete or automatically updated list. After `YOUTUBE_DATA_API_KEY` and authentication settings are configured, the page retrieves public uploads through YouTube Data API with server-side credentials and paginates; older pages are loaded on demand. Private uploads are filtered. YouTube controls visibility, embed permissions, availability and quotas; verify channel rights and video suitability. The manually curated CMS videos are shown separately. The local sample thumbnails were downloaded from the selected public channel in November 2026 and can become stale; review or remove them if the channel or rights change. Video players only connect to YouTube after the visitor clicks play. No YouTube cookies or external video request are initiated by the player before that click. See `YOUTUBE-SETUP.md` for configuration and limitations. The provider test uses a mock; no real YouTube API key has been tested.

Trial slots with no booking history can be edited. The edit and booking flows serialize via the slot record; slots with any existing or cancelled booking cannot have their original schedule changed. Instead, disable that slot and create a new one, contacting affected families manually. A booking must still match the selected start and end times, so a stale choice is rejected rather than silently reserving a changed time. These safeguards are covered by isolated replica-set/browser tests, not a live Atlas deployment.
# diction
