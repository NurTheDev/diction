# Feature guides

How the major optional features behave, what they store, and the limits that matter before
real student data is used. The deployment flags for these features are described in `SETUP.md`; the
launch blockers are in `RELEASE-READINESS.md`.

Consolidated from the former root files `ACHIEVEMENT-WORKFLOW.md`, `ADMIN-ROLES-AND-CONTENT.md`, `CONTENT-AND-LECTURE-SHEETS.md`, `PUBLIC-PRACTICE-AND-AI.md`.

## Contents

- [Achievements](#achievements)
- [Admin roles, staff accounts and blog content](#admin-roles-staff-accounts-and-blog-content)
- [Blog, public lecture sheets and student AI](#blog-public-lecture-sheets-and-student-ai)
- [Public AI, practice tests and PDF preview](#public-ai-practice-tests-and-pdf-preview)

---

## Achievements

This feature is implemented for controlled testing but is **not approved for real student data** until the full deployment, privacy, security and safeguarding reviews in `RELEASE-READINESS.md` are completed. It is disabled unless both `DATA_COLLECTION_ENABLED=true` and `ACHIEVEMENTS_ENABLED=true` are set server-side. Never use a development server with live data.

### What it does

- The authenticated admin editor creates a privately stored draft, or loads and updates an existing draft. It stores a re-encoded JPEG of the selected/cropped photo, a re-encoded PNG of the card, card settings, optional English fields, the processing-consent reference, the recording admin and timestamp in one MongoDB record. No Cloudinary upload is used. Staff must have a valid reason and confirmed permission to process the data; the checkbox is an attestation, not proof. Use only a reference to the separately secured consent record, not sensitive evidence or a phone number.
- Images are decoded and re-encoded server-side with Sharp, limiting dimensions and stripping metadata. Requests are bounded to 4,000,000 bytes, the JPEG input to 2,000,000 bytes and PNG input to 3,000,000 bytes; re-encoded images combined are limited to 3,200,000 bytes. Some larger photographs/cards will need downsizing or a future private object-storage adapter. These limits are below typical serverless body limits but must be checked against the actual host. MongoDB storage quotas, encryption, access control and backups must be reviewed before live use. Drafts are private from anonymous app requests, not from authorized staff, database operators, or backups.
- Only live, active admins with the current session version can list, create, edit, publish, withdraw or delete. State-changing API requests verify canonical origin and host and use a database-backed rate limit. Query/bulk updates are blocked and document updates use full validation and optimistic concurrency; a stale edit is rejected. Direct database writes bypass application protections. The list is limited to the latest 100 records; searching, pagination, duplicate and bulk export remain unimplemented.
- Publication requires a separate explicit guardian/subject attestation, a consent reference of at least five characters, an admin identity and a server timestamp. Publication and withdrawal events are retained with the record (up to 200 events); this is not a comprehensive tamper-resistant audit log. Deletion is allowed only after withdrawal and removes that record and its images/history from the active MongoDB collection. Existing backups, provider logs, previously downloaded copies and external caches may remain; implement and test a retention/deletion process. General admin audit logging remains best-effort.
- `/bn/achievements` and `/en/achievements` list published consented items, and per-card pages support Open Graph metadata and manual Facebook/WhatsApp sharing. Pages and PNG responses read current status at request time and the image response is `no-store`; external sites may cache share previews. There is no automatic Facebook posting, sharing analytics, QR, guaranteed external-cache invalidation, or dedicated wide OG card. Unpublishing prevents subsequent normal app requests from obtaining the card, but cannot recall a response already in flight or copies already made.
- First-name-only masks the public text fields as rendered by the app; a trusted admin can supply arbitrary image pixels to the API, so the server cannot independently verify that the uploaded PNG contains only first names. Staff must inspect the actual card, all pictured people, crop and content before publication. The software cannot verify guardianship or detect faces.

### Testing and operations

`npm run typecheck` and `npm test` check TypeScript and deterministic validation. For the isolated workflow integration test, install browser/system dependencies and build first:

```sh
npx playwright install --with-deps chromium
npm run build -- --webpack
npm run test:achievement-workflow
```

The test starts a temporary MongoDB server and local production server with generated test credentials, uses artificial images and synthetic text, and exercises authentication, origin rejection, draft isolation, editing with stale-version rejection, consent checks, publication, public page/image, withdrawal, deletion and browser admin interaction. It is not an independent security audit or real-Atlas/cloud/production test. The existing generic CMS, gallery and topper content use separate public-media workflows and must be reviewed for consent and minors' privacy; the new feature does not retroactively protect them.

---

## Admin roles, staff accounts and blog content

### Start safely

This source is newer than `diction-public-learning-update.zip`. Back up the existing source, database, and private environment configuration first. Extract the new archive in a separate folder. Use Node 22.13 or newer, run `npm ci`, privately configure the correct `.env.local`, and then run `npm run dev`. Use the exact browser origin in `NEXTAUTH_URL` and `AUTH_URL`; restart after changing environment values. See `SETUP.md`. Do not send passwords, keys, or private student information in chat. No credentials are included in the archive.

### Preset staff roles

Sign in as an **active superadmin**, then open Admin → **Admin roles & permissions**. Only a superadmin may list or manage staff roles. Presets:

- **Super admin:** existing full access, staff roles and audit view. This screen cannot create, disable or change any superadmin, including yourself. This avoids accidentally locking out the highest-privilege account. Initial superadmin provisioning remains the existing local seed procedure in `SETUP.md`; it is not a default password or public registration.
- **Full admin:** existing administrative access including student/financial workflows; cannot manage staff roles or the superadmin-only audit view. Existing `admin` accounts retain their existing access.
- **Content editor:** may create, edit, publish and delete **blog** posts, upload immediately-public images, and manage all public lecture-sheet drafts and their publication/deletion. They cannot see other editorial drafts (such as testimonials), student records, batch-private material, fees, or manage staff accounts through these role-gated routes.
- **Exam manager:** may create/publish existing model tests and manage public practice tests; no student records, fees, blogs, private batch materials or staff role management are granted.

The superadmin creates a staff account with a name, email, initial password and preset. Use a long unique password (at least 12 characters, at most 72 UTF-8 bytes); share it over a secure channel and ask the staff member to change it via Account security. No forced first-login change or emailed invitation is implemented. A superadmin may change a non-superadmin staff member's role or disable/reactivate the account. Each change revokes their existing sessions and reset links; they must sign in again. The staff list currently shows the most recent 200 accounts without pagination. Existing student, teacher and parent accounts cannot be converted into staff through this screen, and staff email addresses must be unique. Staff account deletion, superadmin recovery/transfer, MFA, and independently durable audit logs are not implemented; plan these operationally and do not let the last superadmin credentials be lost. Audit writes are best-effort, not tamper-resistant.

Authorization is checked on the server for the protected pages, actions and API handlers, with active-account/session-version rechecks. Hiding links is not the security boundary. A staff member's permitted scope is organization-wide within the modules listed above, not limited to their own posts or tests. Existing old full admins are not silently downgraded. Grant full-admin access only to trusted staff. An independent security/penetration review, production HTTPS, MFA and operational controls are still necessary before real users or minor data.

### Blog and educational resources

Go to Admin → Content manager and choose **Blog**. Enter a Bangla title. Add Bangla article text **or** at least one supported image, a valid YouTube video, or an already-published public lecture PDF. You may combine these. English title/article and other fields are optional; if omitted, the Bangla version is used as fallback. The editor supports headings, bold/italic, bullet/numbered lists, undo, and HTTP(S) links. Select text before adding a link. Save a draft or select Published to show the post publicly. Content editors may publish directly; there is no approval workflow.

- **Images:** upload a cover and up to three additional JPEG, PNG or WebP images, max 4 MiB each. Images are grouped after the article, not inserted inline. Upload uses the existing public media storage and converts images to WebP. **An uploaded image becomes publicly accessible immediately even when the post is a draft.** Never upload confidential or unconsented student/minor photos. Review rights and guardian permission before any personal image is uploaded. Removing a post or image reference does not automatically remove downloaded/cached copies or the underlying uploaded media.
- **Video:** paste a supported public YouTube URL. The article page offers a click-to-load YouTube-nocookie embed and an external link; it is not an arbitrary video file upload. Playback may send information to YouTube. Invalid or unsupported video URLs are rejected.
- **PDF:** first upload, review and publish a lecture sheet under Admin → Public lecture sheets. Then choose it from the blog's PDF dropdown. Only published sheets are available. Readers can preview/download through the public sheet page. If the sheet is withdrawn, its link is hidden from the blog and its public PDF endpoint stops serving it; previously downloaded/cached copies cannot be recalled. The PDF validator checks size and signature, not malware or full validity. Scan and rights-check trusted files independently.

Other file formats, audio, direct video uploads, arbitrary HTML/JavaScript, editable inline image positioning and scheduling are not implemented. The existing HTML sanitization strips unsupported markup and potentially unsafe links. Blog metadata and sitemap support discovery but do not guarantee search ranking. The design does not yet implement image alt-text editing; generated alt text uses the title and image number, so add meaningful context in the article. For accessibility, review every post.

### Verification and outstanding work

With synthetic data and a temporary local database, `npm run typecheck`, `npm test`, and `npm run build -- --webpack` passed. `npm run test:staff-blog` exercised superadmin-only staff creation, denial for other roles and wrong origins, duplicate handling, restricted role access, private unrelated editorial drafts, role changes/session revocation/deactivation, public image upload, content-editor PDF management, multimedia and video-only blog publication, YouTube click-to-load, withdrawn-PDF link hiding, protection against deleting an extra image in use, and document overflow at 360/390/768 pixels on the content screen. `npm run test:content-sheets` and `npm run test:public-learning` also passed in focused synthetic tests in this pass; the latter uses a local mock AI provider, not real Gemini. These are not a complete audit of every legacy endpoint, a full-site regression or penetration test. The broader launch blockers in `RELEASE-READINESS.md` remain, including protection for minors, consent procedures, privacy, hosting, MFA, secure media handling and live-service verification.

---

## Blog, public lecture sheets and student AI

### First: use the updated source

This version is newer than `diction-production-progress.zip`. Back up your existing local project and database first. Copy or deploy this source using your own private `.env.local`; no credentials are included. Run `npm ci` using Node 22.13 or newer, then `npm run dev`. See `SETUP.md` for local database and admin setup. Set `NEXTAUTH_URL` and `AUTH_URL` to the exact origin used in the browser, such as `http://localhost:3000`, and restart the server after environment changes. Do not paste secrets into chat or screenshots.

### Blog

Admin → Content: choose Blog, enter a Bangla title and either Bangla article text or a supported image, YouTube video, or published lecture-sheet PDF, then save. See the admin-roles section above for the multimedia workflow and role permissions. English and other optional information can be entered by expanding the optional section. If English is left blank, the Bangla title/article is stored as the English fallback. Check Published before saving to make the post appear on the public blog; otherwise it remains hidden. Create a proper English translation if you want distinct English text. The page title and description, canonical path and sitemap aid discovery but cannot guarantee search indexing or rankings. Configure your real HTTPS public origin and verify your domain in Google Search Console after launch. Never put personal or confidential information in public content.

The exact error in the earlier downloaded local installation was not supplied, so it is not proven that missing English fields were its only cause. In an isolated synthetic test the new browser form saved and published a Bangla-only article successfully, with English fallback. If your own install still fails, note the exact on-screen message and server error category, whether you're logged in as an active admin, whether MongoDB is reachable, and whether your canonical origin matches; redact any credentials and student data.

### Public lecture sheets

Admin → Public lecture sheets → provide Bangla title and a PDF of at most 4 MiB → Save draft → Publish. Class, subject, description and English details are optional, but useful for readers and search metadata. A public index is at `/bn/lecture-sheets` and `/en/lecture-sheets`; each published sheet has its own indexable page and an open/download link. No account is required to view published sheets. Withdraw hides the page and PDF immediately from the application; delete removes the record from the live database. Neither action recalls copies that people downloaded or that search engines, browsers, CDN caches or backups retained. These are separate from existing private batch materials.

Only admins can upload and change the sheets. Draft records and their bytes are not exposed by the public routes; an admin-only draft preview and a public-page PDF preview are available; a synthetic simple PDF was rendered in a local browser test; editing is not implemented, so delete and reupload a draft if corrections are needed. The admin list shows the most recent 200 items and the public list/sitemap the most recent 500; search/pagination and editing must be implemented before the library grows beyond these limits. The app stores PDF bytes in MongoDB, so monitor database storage/cost and plan backups, restore, deletion and limits. The upload checks size and the `%PDF-` signature; this is NOT complete PDF validation, malware scanning or sanitization and can be spoofed. Only publish trusted, rights-cleared files that an operator has checked with appropriate security tools. Avoid embedded active content. Do not upload student records, identifying details or confidential content. Review security and rights before real publication.

### Student AI

Student dashboard → AI Study Buddy, or `/bn/dashboard/study#ai-study-buddy`, requires an active student account linked to a student profile. The new public assistant is at `/bn/study-buddy`; see the public-AI section below for its additional flag. Admin status and a safe connection diagnostic are at Admin → AI Study Buddy. The feature intentionally defaults off. `SETUP.md` explains local private key and model configuration, both required flags, restart, student test account, and the prerequisite guardian/privacy/provider/safety review. The broader data-collection flag affects other features too. A configuration checklist is not a live AI test. No live Gemini provider was tested here; never send keys in chat. AI responses may be wrong and students must not enter personal information.

### Verification and limitations

The current source passed `npm run typecheck`, `npm test`, `npm run build -- --webpack`, and the focused public-learning workflow test using synthetic data and a mock AI provider. This section records the test coverage and important production blockers. `npm run test:content-sheets` used an isolated temporary MongoDB, synthetic admin/data and Playwright against the production build: it checked Bangla-only browser blog save/publication and fallback; public-sheet authorization/origin, draft privacy, publish, byte-for-byte response, sitemap, withdrawal and deletion; browser sheet upload/publish/withdraw/delete; and horizontal document overflow on admin overview, content and public-sheet screens at widths 360, 390 and 768. That earlier test checked PDF delivery only; the newer public-learning test rendered a simple synthetic PDF in Chromium. This targeted test is not a full-site responsive, security or end-to-end certification. Existing production blockers, including safeguarding, independent security/privacy review, MFA and live service validation, remain in `RELEASE-READINESS.md`.

---

## Public AI, practice tests and PDF preview

### Before installing

This package is newer than `diction-content-update.zip`. Back up the local project, database, and your private `.env.local` first. Use **Node 22.13 or newer**, extract the new archive, run `npm ci`, then `npm run dev`. Copy configuration privately from your existing environment only after backup; never paste keys into chat or commit `.env.local`. `SETUP.md` covers local MongoDB/auth. The exact browser origin must match both `NEXTAUTH_URL` and `AUTH_URL` (for example `http://localhost:3000`), then restart.

### What your screenshots showed

The original student-only AI link requires a linked student profile. The screenshot says the logged-in account has no linked student profile, so the student Study Lab redirects to the dashboard. The green checklist says configuration values are present, **not** that the real Gemini service has successfully answered. Use Admin → AI Study Buddy → connection test to check the configured provider. Do not include keys, real student information or personal questions in screenshots/logs. The new public assistant is separate and does not require student login or a student profile.

### Public AI assistant

The website's More → AI Study Buddy or `/bn/study-buddy` opens the public chat. It can answer study questions, use published center details and offer an AI-generated practice quiz. Only published courses, published FAQs/facilities and public site settings are supplied as contextual facts; keep these accurate and current. The model is instructed not to invent awards, rankings, testimonials or guaranteed results, and not to claim the center is objectively best. A model can still hallucinate or follow malicious instructions—prompting is not a guarantee. Staff must review its responses and correct source material.

The AI can offer feedback on answers in its current conversation; this is **not a reliable grade or long-term progress record**. AI-generated questions, answers and assessments can be wrong. The separate teacher-authored MCQ tests use the teacher's stored answer key and deterministic scoring instead.

#### Activation after review

Public AI is separately **off by default**. In your private environment, only after guardian/child-safety, privacy/provider terms, moderation, abuse prevention, spending and other data-collection features have been reviewed and approved, configure a working provider as described in `SETUP.md`, and set:

```dotenv
DATA_COLLECTION_ENABLED=true
AI_STUDY_BUDDY_ENABLED=true
PUBLIC_AI_ENABLED=true
```

The first flag also enables other data-collection functionality; it is not AI-only. An existing private `GEMINI_API_KEY`, valid `AI_MODEL`, reachable database, secret and exact canonical origin are required. Restart the server. Admin → AI Study Buddy shows the extra public flag and a provider connection diagnostic. This checklist only detects configuration; test the live provider separately with a non-personal test question. No actual Gemini key or live provider was tested in this project pass.

No login is required for public chat. A confirmation checkbox reminds minors to obtain guardian permission, but it does **not** verify age, guardianship or consent. Do not enter names, phone numbers, passwords or other personal information. The entered questions and up to seven prior messages are sent to the configured AI provider, and provider retention is governed by its terms. The application holds conversation text in browser page memory and does not intentionally persist it to the database, but infrastructure/provider logs are outside this guarantee. The app stores a temporary hashed IP-based rate-limit record; rate limiting depends on trusted proxy configuration and is not sufficient on its own. Add deployment-level WAF/bot protection, quotas, cost limits, monitoring, moderation/incident procedures and review of prompt-injection risks before exposing this publicly, especially to minors. This is not independently security-certified or child-safety-compliant.

### Public practice tests (teacher-authored MCQ)

Admin → **Public practice tests** → enter title, subject, optional class, then type each question, four options, correct option and optional explanation. Save draft; review the entire answer key and publish in the saved list. Published exams appear under More → Practice tests (`/bn/practice-tests`) for anonymous or signed-in visitors. Users see their score, correct answers and explanations after submission. Unanswered questions are marked incorrect. These are informal practice tests, not secure, timed, proctored or high-stakes exams; answer keys can be obtained by submission and repeated attempts are allowed. Grading is only as accurate as the teacher's answer key. Draft question content is not exposed on public endpoints. Existing batch-specific tests and materials remain separate/private.

#### CSV upload and Bangla Unicode

The form also imports a **UTF-8 CSV** file of up to 30 questions and 256 KB. `.xlsx` is not imported directly: in Excel choose **Save As → CSV UTF-8** first. Download the blank template from the admin form, or make your own. The first line must be exactly:

```csv
question,option1,option2,option3,option4,correct,explanation
"২ ও ৩ যোগ করলে কত?",৪,৫,৬,৭,2,"২ ও ৩ যোগ করলে ৫।"
```

The row is a synthetic instructional example, not a published test. `correct` is 1–4. Quote fields containing commas or line breaks and escape a double quote by doubling it. CSV import replaces questions already in the form; review them before saving. Imported content is treated as text, not executable formulas. Up to 30 questions per test. The admin list and public test list currently show up to 200 most recent tests; editing and pagination/search are not yet available, so delete and recreate an incorrect draft. Withdrawing hides future public access, but copied questions/answers cannot be recalled.

#### Results and privacy

Anonymous users receive an immediate result, but it is not saved to an account or tracked across visits. A signed-in student may explicitly check **Save my result**; this requires `DATA_COLLECTION_ENABLED=true` and a linked student profile. Only title, subject, score, total, date and linked profile are stored; the detailed answer selections are not stored. The student can review up to 100 recent saved results at `/bn/dashboard/practice-history` and delete individual results. If the account has no linked student profile, a score is still shown but will not be saved. There is no independent guardian verification, automatic retention expiry, automatic cascade deletion of results with student/test deletion, export, or aggregated progress analytics. Operators must establish and test consent, retention, backup and deletion policies before using real minor data. Logged-in results are private to the owning student route, but security still requires independent review.

### Public lecture-sheet PDF preview

In Admin → Public lecture sheets, upload a PDF draft and open **PDF preview** to see pages before publishing; the draft preview endpoint requires a live admin session. A published lecture-sheet page includes a public page-by-page preview and an open/download button. The preview uses locally hosted Mozilla PDF.js assets; image-only pages may not allow text copy/search and unusual or damaged PDFs may not render. No automatic PDF malware scanner or sanitization is provided. Publish only trusted, rights-cleared files with no private/student data. Keep PDF.js and its bundled worker/assets matched and update them together after security review. Withdrawal cannot recall downloaded or cached copies.

### Verification and outstanding work

On synthetic data, `npm run typecheck`, `npm test`, and `npm run build -- --webpack` passed. `npm run test:public-learning` used an isolated temporary MongoDB, synthetic accounts and a local **mock** HTTPS AI provider: anonymous chat API and guest browser chat, admin draft/publish, private answer keys before submission, deterministic scoring and explanations, anonymous vs opt-in student result, student-owned deletion, admin-only draft PDF bytes, a simple real synthetic PDF rendered in public and admin previews, CSV UI save and mobile document-overflow checks at 360/390/768 were tested. The mock deliberately disables TLS certificate verification **only inside its test process**; never use that setting in production. No real Gemini, production database, live deployment, all-device PDF/browser rendering, full-site regression, security penetration test or production load test has been completed. Production still needs the independent security/privacy/minor-safety reviews and MFA listed in `RELEASE-READINESS.md`.

---

## Where the rest of the feature record lives

- `STATUS.md` — what is actually working, partial, missing or blocked, module by module.
- `HISTORY.md` — earlier feature checkpoints and design reviews, kept for context.
- `G2-OPERATOR-SCREENS.md` — the operator's screens and the ten-step click checklist.
