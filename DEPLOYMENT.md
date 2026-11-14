# Deployment and operations guide

> **Deploying to staging?** Start with [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — the step-by-step
> staging checkpoint (Atlas M0, environment template, Vercel region and cron, BulkSMSBD without IP
> whitelisting, the locale/middleware check and the ten-line phone smoke checklist). This file is the
> broader operations and security posture around it.

> **Status:** This is an in-progress system, not a production-ready release. Do not collect real student or guardian information until the privacy, authorization, security and integration gaps in the README have been addressed and independently reviewed. Phases 2–6 are not complete merely because deployment scaffolding exists.

## 1. Prepare MongoDB Atlas

1. Create a project and cluster that supports transactions (Atlas replica set/cluster). Create a database named `dictioncoaching`.
2. Create a dedicated database user with the **readWrite role limited to `dictioncoaching`**, not a cluster-wide admin role. Allow this user to create the indexes used by the application.
3. Configure Atlas Network Access for your development machine and Vercel outbound traffic. Standard Vercel serverless deployments do not generally have a single fixed egress IP. Arrange static egress if you need an IP allowlist; otherwise assess the security tradeoffs before allowing `0.0.0.0/0`. Use strong, unique credentials and TLS.
4. Copy the SRV connection string into `MONGODB_URI`; URL-encode any special characters in the database username and password. The application explicitly selects the `dictioncoaching` database regardless of the URI path.
5. Back up existing data before using the seed. This revision introduces dedicated `Teacher`, `FAQ`, `Facility`, and `SiteSettings` schemas and unique indexes. If earlier generic collections already contain documents missing their new unique keys, duplicate-key index creation may fail. Back up and migrate those documents deliberately; do not drop collections or overwrite data automatically.

## 2. Configure a local environment

Use Node.js 22.13 or newer (Node 22 or 24 LTS). Copy `.env.example` to `.env.local`, which is ignored by Git. Never paste real values into source code, issue reports or chat.

Core variables required at normal server startup:

- `MONGODB_URI`: Atlas SRV URI, with credentials URL-encoded.
- `NEXTAUTH_SECRET`: a unique random secret of at least 32 characters. Generate with `openssl rand -base64 32`.
- `NEXTAUTH_URL`: exact origin, e.g. `https://your-domain.example` (no path).
- `AUTH_URL`: set to the same origin for Auth.js v5, especially in standalone production; verify that your trusted proxy restricts Host and forwarded headers. A mismatched origin fails startup validation.

Set `DATA_COLLECTION_ENABLED=false` until legal, security and operational review is complete. The server intentionally rejects intake and study writes while disabled. The only unconfigured development bypass is `PREVIEW_WITHOUT_SERVICES=1 npm run dev`; it is disabled in production and should never be set as a production substitute for credentials.

Optional integrations:

- Resend: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (a verified sender) and `ADMIN_NOTIFICATION_EMAIL`. Email is best-effort, not queued or guaranteed. SMS is implemented (R2, BulkSMSBD) and ships behind `SMS_PROVIDER=mock` with `CENTER_SMS_WRITE_ENABLED=false`; see `docs/DEPLOYMENT.md` §5 and `docs/SMS-GOLD-LIVE.md`.
- AI Study Buddy: `AI_API_KEY`, `AI_API_BASE_URL` (HTTPS OpenAI-compatible API base such as a provider's `/v1` endpoint) and `AI_MODEL`. Review the selected provider's policy, minor/guardian consent, moderation, retention, cost controls and terms before enabling. No image upload or moderation system is implemented.
- Cloudinary requires its cloud name, API key and API secret for the media library; verify uploads and deletions before use. Google login and online payment processing remain unimplemented.

## 3. Validate and seed

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

## 4. Deploy to Vercel

1. Push the project to a private repository after checking for secrets and personal data (`.env.local` is ignored; `.env.example` contains placeholders only). Import the repository into Vercel as a Next.js project.
2. Configure the core server variables separately for Preview and Production. Use a separate database and auth secret for each environment. Set each environment's `NEXTAUTH_URL` and `AUTH_URL` to its actual public origin; sitemap and Open Graph metadata use this URL.
3. Keep `DATA_COLLECTION_ENABLED=false` for initial review. Do not commit or expose secrets through `NEXT_PUBLIC_*` variables. Deploy using the normal Next.js build command. Production startup validates the core variables and fails with a readable error when they are missing.
4. Verify the public pages in `/bn` and `/en`, language switching, mobile layouts, accessibility, map pin, footer and assets. Seed the intended database from an authorized machine with Atlas access. Log in as the seeded admin and verify the faculty editor and the other implemented admin workflows using synthetic data only.
5. Exercise authentication and role isolation using distinct test accounts. Test admissions and trial capacity, including concurrent booking/cancellation, against Atlas and inspect indexes/transactions. Test notifications and AI with non-sensitive test content. Test the production service worker over HTTPS, including offline behavior and that private data isn't cached. Restore and test a database backup.
6. Only after the missing functionality and reviews are addressed, publish an approved privacy policy, retention/deletion procedures and terms; define support and incident-response ownership; review forms and consent for minors; then explicitly enable data collection. Do not consider the current checkbox or placeholder policies legal approval.

## 5. Ongoing operations

- Restrict and review admin access; enforce strong passwords and add MFA, complete the staff lifecycle, and review/test account recovery before launch. Current admin audit records are best-effort, not tamper-resistant or transactional.
- Maintain Atlas backups and test restores. Keep access logs, secrets, scopes and network rules under review; rotate secrets through the appropriate provider and Vercel settings. A rotated Auth.js secret invalidates existing sessions.
- Add edge/WAF rate limits and trusted proxy configuration. Existing rate limits are database-backed and depend on correct proxy headers; they are not a substitute for production abuse protection.
- Monitor delivery and add a durable retry queue before relying on email. Track AI token usage and provider costs. Public content is not all CMS-managed yet.
- See `README.md` for feature-specific limitations and the tests that have and have not been performed.

## Additional verification for editorial content and model tests

Use `/bn/admin/content` and `/bn/admin/media` to verify published content, image handling and revalidation with synthetic data. The media deletion reference check is not transactionally coupled to every content edit; do not rely on it as a complete lifecycle guarantee. Use `/bn/admin/model-tests` to publish a synthetic test and verify server-side deadlines, answer persistence, double submission, multiple devices, class/role isolation and the mistake notebook using separate student accounts. Do not include real assessment content until those tests and a security review are complete.

## Bangla-first and preview behavior

The unprefixed root always redirects to `/bn`; English remains available through `/en`. After changing database/auth or `DATA_COLLECTION_ENABLED` settings, redeploy so statically generated public pages reflect service availability. The preview’s development-origin allowlist includes `*.e2b.app` to allow interactive controls in the sandbox; it does not configure production CORS or authorize server actions. Do not expose a development server with production data or secrets.

Site settings use bundled defaults if the singleton is absent or cannot be loaded. Verify all new logo and social URLs and the address-derived map pin before launch. Cloudinary deletions and concurrent content changes are not transactionally coupled.

Course administration is at `/bn/admin/courses`. Publish only verified bilingual course, schedule and fee information. No course records or prices are fabricated or seeded; a configured database with no published courses shows an empty list. The course catalog is informational and is not an enrollment or payment system.

## Account recovery and session revocation

Email recovery is disabled until `PASSWORD_RESET_ENABLED=true` and valid Resend credentials and a verified sender are configured. Configure an HTTPS canonical `NEXTAUTH_URL`/`AUTH_URL` before enabling it, and confirm account email ownership through an approved process. Tokens are single-use, hashed at rest and expire after 30 minutes. They are delivered in a URL fragment to avoid inclusion in HTTP request URLs, but remain sensitive in email and browser memory. The UI requires JavaScript. Test actual email delivery, expiry, spam filtering and trusted proxy/edge rate limits in the deployment environment; delivery is not queued or guaranteed, and response timing may permit account enumeration. Do not collect user data until the privacy and security reviews are complete.

Existing sessions issued before the session-version upgrade are invalid for protected data and require a new sign-in. Password change/reset, account editing and activation changes revoke sessions; site middleware may still see a stale JWT but protected server operations check the current DB version. Admins can manage portal accounts, not admin roles. Only super-admins can view the activity log; it is best-effort, incomplete, non-transactional and not tamper-resistant. Secure backups, audit retention and reliable centralized security logs are still required.

## Batches, banner and private materials

Admins can configure the bilingual homepage banner under `/bn/admin/hero`, edit/archive batches under `/bn/admin/batches`, and publish or delete batch PDF materials under `/bn/admin/materials`. Verify image rights and alt text. Batch grade is immutable; use a new batch for another class. Removing a student preserves historic marks and attendance in the database but removes their visibility and private-material access until the student is enrolled again. Teacher entry and material upload permissions recheck active assignment. Enrollment and teacher writes require MongoDB transactions; verify indexes, replica-set support and concurrent operations on the actual Atlas cluster.

Private material uploads are limited to 2 MiB and use MongoDB binary storage. Only active staff can upload; only administrators can publish. Download authorization uses current active account status and batch membership; published files remain downloadable by enrolled students and linked parents in archived batches. The response is a no-store attachment, not a public URL. The PDF signature check is not malware scanning or full PDF validation; implement an appropriate scanning, review, quota, copyright, retention and incident-response policy before using uploads with real users. Ensure platform request-body limits exceed 2 MiB plus multipart overhead, restrict proxy headers and use the canonical HTTPS `NEXTAUTH_URL`, and include these files in encrypted backups and storage-capacity planning. In-flight requests cannot be recalled after authorization. Test access isolation, publication, deletion, uploads, role changes and backup restoration in the deployment environment. No live Atlas service or production load/concurrency test has been performed.

### Manual fee operations and brand colors

The fee module is an admin-entered ledger, not an online payment gateway or proof of payment. Before enabling it for real students, test on the actual Atlas replica set with synthetic accounts, ensure the invoice/payment idempotency indexes were created, exercise concurrent payments and voids, verify student/parent isolation, and establish financial reconciliation, secure backups, retention rules and a reliable independent audit trail. Amounts are integer poisha, maximum BDT 1,000,000 per entry. No fee data is seeded. Record payments only after independently verifying receipt; correct mistakes by voiding and reissuing. After an uncertain response, check history before retrying: a browser reload generates a new submission key and can permit a duplicate. Admin student selection is capped at the newest 1,000 profiles; linked-parent lists are capped at 50 profiles. There is no automatic charge, refund, receipt or export.

Primary/action colors at `/bn/admin/site-settings` are limited to colors with at least 5:1 white-background contrast; verify actual contrast and all presentation states as part of an independent accessibility audit. Only supported buttons, links and active navigation use these settings; other brand styling is fixed. The standard brand red is too light for this text threshold and falls back to darker `#C51920` on interactive elements.

### Batch notices and academic history

Private batch notices are separate from public editorial notices. Test draft/publication, hiding, deletion, teacher reassignment/archival, student unenrollment, parent links and cross-student isolation with synthetic accounts on your real deployment before enabling them. Drafts can be edited or deleted only after hiding; publishing can reach all current members of the selected batch, including linked parents. Previously published notices remain visible to enrolled students and linked parents after batch archival; assigned teachers lose access when the batch is archived. An admin can publish a pre-existing draft for an archived batch, so review the audience and archive indicator. Treat notices as group-readable information, not a channel for sensitive individual records. Audit is best-effort, and already viewed or downloaded content cannot be recalled.

Student and parent history pages show paginated attendance and published exam marks only for each student's currently linked batches. Parent accounts are capped at 50 linked profiles. Run access-isolation and load tests against Atlas and validate operational retention/backups before using real student data. Rankings, report cards and grading policies are not implemented.

Privacy contact has been supplied, along with an intention to review student records one year after a student leaves the center and offline guardian-consent approach. These do not establish a complete retention/deletion schedule or verified consent workflow. See `PRIVACY-DRAFT.md`; obtain institutional/legal review and implement operational procedures before enabling data collection. The system does not record departure dates, schedule reviews, automatically delete records, or verify offline guardian consent.

For a Bangla-first walkthrough of connecting an existing Atlas cluster, see `ATLAS-SETUP.md`. Run `npm run atlas:check` locally to perform a redacted, read-only connection and read-permission check; it does not exercise write permissions, indexes or transactions. Run `npm run test:atlas-check` for the isolated probe/redaction test. Never paste credentials or a full URI in chat.
