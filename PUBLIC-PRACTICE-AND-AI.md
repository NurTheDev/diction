# Public AI, practice tests and PDF preview

## Before installing

This package is newer than `diction-content-update.zip`. Back up the local project, database, and your private `.env.local` first. Use **Node 22.13 or newer**, extract the new archive, run `npm ci`, then `npm run dev`. Copy configuration privately from your existing environment only after backup; never paste keys into chat or commit `.env.local`. `DASHBOARD-LOGIN.md` and `ATLAS-SETUP.md` cover local MongoDB/auth. The exact browser origin must match both `NEXTAUTH_URL` and `AUTH_URL` (for example `http://localhost:3000`), then restart.

## What your screenshots showed

The original student-only AI link requires a linked student profile. The screenshot says the logged-in account has no linked student profile, so the student Study Lab redirects to the dashboard. The green checklist says configuration values are present, **not** that the real Gemini service has successfully answered. Use Admin → AI Study Buddy → connection test to check the configured provider. Do not include keys, real student information or personal questions in screenshots/logs. The new public assistant is separate and does not require student login or a student profile.

## Public AI assistant

The website's More → AI Study Buddy or `/bn/study-buddy` opens the public chat. It can answer study questions, use published center details and offer an AI-generated practice quiz. Only published courses, published FAQs/facilities and public site settings are supplied as contextual facts; keep these accurate and current. The model is instructed not to invent awards, rankings, testimonials or guaranteed results, and not to claim the center is objectively best. A model can still hallucinate or follow malicious instructions—prompting is not a guarantee. Staff must review its responses and correct source material.

The AI can offer feedback on answers in its current conversation; this is **not a reliable grade or long-term progress record**. AI-generated questions, answers and assessments can be wrong. The separate teacher-authored MCQ tests use the teacher's stored answer key and deterministic scoring instead.

### Activation after review

Public AI is separately **off by default**. In your private environment, only after guardian/child-safety, privacy/provider terms, moderation, abuse prevention, spending and other data-collection features have been reviewed and approved, configure a working provider as described in `AI-SETUP.md`, and set:

```dotenv
DATA_COLLECTION_ENABLED=true
AI_STUDY_BUDDY_ENABLED=true
PUBLIC_AI_ENABLED=true
```

The first flag also enables other data-collection functionality; it is not AI-only. An existing private `GEMINI_API_KEY`, valid `AI_MODEL`, reachable database, secret and exact canonical origin are required. Restart the server. Admin → AI Study Buddy shows the extra public flag and a provider connection diagnostic. This checklist only detects configuration; test the live provider separately with a non-personal test question. No actual Gemini key or live provider was tested in this project pass.

No login is required for public chat. A confirmation checkbox reminds minors to obtain guardian permission, but it does **not** verify age, guardianship or consent. Do not enter names, phone numbers, passwords or other personal information. The entered questions and up to seven prior messages are sent to the configured AI provider, and provider retention is governed by its terms. The application holds conversation text in browser page memory and does not intentionally persist it to the database, but infrastructure/provider logs are outside this guarantee. The app stores a temporary hashed IP-based rate-limit record; rate limiting depends on trusted proxy configuration and is not sufficient on its own. Add deployment-level WAF/bot protection, quotas, cost limits, monitoring, moderation/incident procedures and review of prompt-injection risks before exposing this publicly, especially to minors. This is not independently security-certified or child-safety-compliant.

## Public practice tests (teacher-authored MCQ)

Admin → **Public practice tests** → enter title, subject, optional class, then type each question, four options, correct option and optional explanation. Save draft; review the entire answer key and publish in the saved list. Published exams appear under More → Practice tests (`/bn/practice-tests`) for anonymous or signed-in visitors. Users see their score, correct answers and explanations after submission. Unanswered questions are marked incorrect. These are informal practice tests, not secure, timed, proctored or high-stakes exams; answer keys can be obtained by submission and repeated attempts are allowed. Grading is only as accurate as the teacher's answer key. Draft question content is not exposed on public endpoints. Existing batch-specific tests and materials remain separate/private.

### CSV upload and Bangla Unicode

The form also imports a **UTF-8 CSV** file of up to 30 questions and 256 KB. `.xlsx` is not imported directly: in Excel choose **Save As → CSV UTF-8** first. Download the blank template from the admin form, or make your own. The first line must be exactly:

```csv
question,option1,option2,option3,option4,correct,explanation
"২ ও ৩ যোগ করলে কত?",৪,৫,৬,৭,2,"২ ও ৩ যোগ করলে ৫।"
```

The row is a synthetic instructional example, not a published test. `correct` is 1–4. Quote fields containing commas or line breaks and escape a double quote by doubling it. CSV import replaces questions already in the form; review them before saving. Imported content is treated as text, not executable formulas. Up to 30 questions per test. The admin list and public test list currently show up to 200 most recent tests; editing and pagination/search are not yet available, so delete and recreate an incorrect draft. Withdrawing hides future public access, but copied questions/answers cannot be recalled.

### Results and privacy

Anonymous users receive an immediate result, but it is not saved to an account or tracked across visits. A signed-in student may explicitly check **Save my result**; this requires `DATA_COLLECTION_ENABLED=true` and a linked student profile. Only title, subject, score, total, date and linked profile are stored; the detailed answer selections are not stored. The student can review up to 100 recent saved results at `/bn/dashboard/practice-history` and delete individual results. If the account has no linked student profile, a score is still shown but will not be saved. There is no independent guardian verification, automatic retention expiry, automatic cascade deletion of results with student/test deletion, export, or aggregated progress analytics. Operators must establish and test consent, retention, backup and deletion policies before using real minor data. Logged-in results are private to the owning student route, but security still requires independent review.

## Public lecture-sheet PDF preview

In Admin → Public lecture sheets, upload a PDF draft and open **PDF preview** to see pages before publishing; the draft preview endpoint requires a live admin session. A published lecture-sheet page includes a public page-by-page preview and an open/download button. The preview uses locally hosted Mozilla PDF.js assets; image-only pages may not allow text copy/search and unusual or damaged PDFs may not render. No automatic PDF malware scanner or sanitization is provided. Publish only trusted, rights-cleared files with no private/student data. Keep PDF.js and its bundled worker/assets matched and update them together after security review. Withdrawal cannot recall downloaded or cached copies.

## Verification and outstanding work

On synthetic data, `npm run typecheck`, `npm test`, and `npm run build -- --webpack` passed. `npm run test:public-learning` used an isolated temporary MongoDB, synthetic accounts and a local **mock** HTTPS AI provider: anonymous chat API and guest browser chat, admin draft/publish, private answer keys before submission, deterministic scoring and explanations, anonymous vs opt-in student result, student-owned deletion, admin-only draft PDF bytes, a simple real synthetic PDF rendered in public and admin previews, CSV UI save and mobile document-overflow checks at 360/390/768 were tested. The mock deliberately disables TLS certificate verification **only inside its test process**; never use that setting in production. No real Gemini, production database, live deployment, all-device PDF/browser rendering, full-site regression, security penetration test or production load test has been completed. Production still needs the independent security/privacy/minor-safety reviews and MFA listed in `PRODUCTION-READINESS-STATUS.md`.
