# Release readiness and launch blockers

The current answer to "can this be used with real students yet?" — no, not until the items
below are resolved and independently reviewed. A successful build and local tests do not make the
full site production-ready.

Consolidated from the former root files `PRODUCTION-READINESS-STATUS.md`, `FINAL-HANDOFF.md`.

## Contents

- [Production readiness status](#production-readiness-status)
- [Final handoff — public site](#final-handoff--public-site)

---

## Production readiness status

The owner requested the entire website for production, including students under 18; hosting is undecided. The source includes the website and admin/study workflows described in `README.md`, plus the achievement workflow in `FEATURES.md`. A successful build and local tests do **not** make the full site production-ready.

### Work completed in this pass

- Implemented access-controlled MongoDB achievement drafts and re-encoded images, admin create/edit/withdraw/delete flows, consent attestations and references, optimistic concurrency, public achievement index/detail pages, current-status image access and manual sharing. Both data-collection and achievement feature flags default off. See the workflow document for important limits.
- Kept original achievement query-update guards, introduced equivalent guards on the new record, bounded body/image sizes, origin/auth/rate checks, no-store public image responses, and a public-media warning about minor photos. Consent-history records are stored with the achievement but are not an independent audit system.
- Validated bare canonical HTTP(S) origins, and require HTTPS for non-loopback production origins. Added production same-origin framing protection and a restrictive permissions policy. Host/proxy security still needs deployment-specific testing.
- TypeScript, unit tests, a webpack production build, and an isolated synthetic achievement workflow and browser-admin test passed. A full website integration rerun did not finish its build under this sandbox's resource constraints; a previous version passed a broader isolated integration test, but that is not proof for this revision. No real provider, Atlas, Cloudinary, production HTTPS, email, or Facebook integration was tested in this pass.

- New content update: Bangla-first blog form, explicit public PDF draft/publish/withdraw/delete workflow, student AI entry and admin shortcuts. Isolated synthetic blog/PDF browser and API test passed, including 360/390/768 document-overflow checks on three admin pages. PDF rendering, other dashboard screens and actual local configuration remain unverified. See `FEATURES.md` for size, safety, storage and pagination limitations.

- Public assistant, public practice quizzes and authenticated/public PDF preview are now implemented and focused tests passed with synthetic data and a local mock provider; no real Gemini provider test, production abuse/load/security test or real student data test has been done. Anonymous AI is separately off by default. See `FEATURES.md` for guardian, retention, truthfulness, security and privacy limitations.

- Added superadmin-managed preset staff roles with server-side permission checks and live session revocation, plus multimedia blogs with up to four public images, click-to-load YouTube and a published PDF attachment. Synthetic focused tests and a production build passed. Images become public on upload even for drafts; staff roles and image safety need independent security and privacy review. See `FEATURES.md`.

### Launch blockers and owner/deployment decisions

1. **Minors and legal/privacy:** finalize and approve privacy and terms, collection purposes, age/guardian verification and consent evidence procedures; agree retention, withdrawal/deletion, backups and provider-cache procedures; review all existing public media, gallery, editorial topper and testimonial records for rights and consent. The current checkbox cannot independently verify guardianship or consent. Staff must review each public PNG and all people depicted.
2. **Security and operations:** independent security review and penetration test; privileged-account MFA; deployment WAF/edge rate limits, trusted proxy/host settings, CSP, durable audit/security monitoring, incident response, access reviews, backup/restore and deletion drills, secrets management and retention. Current audit is best-effort, not tamper-resistant. Separate existing workflows need a complete authorization and safeguarding review.
3. **Infrastructure:** choose hosting/domain/region; provision isolated staging and production databases, least-privilege users, HTTPS, backups, private storage or explicitly accepted MongoDB image quotas, and email. Verify production PWA, database transactions/indexes, concurrency and provider integrations. Atlas/Vercel free tiers may not satisfy backup or privacy requirements; check current pricing and provider terms. Do not paste secrets into chat.
4. **Quality:** independently audit accessibility and repeat mobile/performance/load/browser testing in the actual environment. Prior simulated mobile Lighthouse median was 74, below the 90+ target; 60 fps and WCAG compliance have not been established. Real-photo crop tests remain outstanding.
5. **Incomplete functionality:** achievement admin listing is capped at 100, no search/pagination, duplicate or batch exports; no automatic Facebook posting, page QR, share counts or separate wide OG image. Other site feature gaps are documented in `README.md`. Live AI is off unless configured and approved; moderation/safeguarding/provider reviews remain necessary.

Do not enable the collection or achievement flags for real people until these blockers are resolved. No credentials or real test photos belong in the project archive. `SETUP.md`, `DEPLOYMENT.md` and `PRIVACY-DRAFT.md` contain further instructions and limitations.

---

## Final handoff — public site

The bilingual public frontend includes responsive navigation, homepage, About, Courses, faculty profiles, videos, facilities, editorial content, gallery, notices/results, FAQ, forms, footer and 404/empty states. Existing routes and business behavior remain in place; the user authorized the necessary i18n, settings-model, admin UI and session changes in this completion pass.

### Verified public facts

Administrators can open **Site settings → Verified public facts** to enter a student count, optionally mark it as a verified minimum, enter an average rating and its review count together, and add up to eight bilingual year/title milestones. The publish checkbox controls all of these fields. They start empty and unpublished; nothing new is fabricated. Only the student count and rating appear on the homepage, and milestones appear on About. Validate and substantiate every claim before publishing it; these fields do not independently verify the entered data. Clearing inputs and saving removes values. Existing site identity and theme settings remain separate. Malformed stored facts are hidden. The home page and About use request-time rendering so a newly unpublished claim is not served from the page cache.

### Session introduction

On the first homepage visit in a browser tab session, a brief dialog can be skipped, dismissed with Escape, or automatically closes after 2.6 seconds. Focus moves into the dialog. It uses sessionStorage only to remember the introduction has been shown in that tab, stores no personal data, and is disabled when reduced motion is requested or storage is unavailable. Without JavaScript the introduction never blocks the page.

### Content and assets

- The hero and About/demo artwork are AI-generated **illustrations**, not photographs of the institution. A real, consented photo can be supplied through the existing homepage banner manager. The original `/brand/classroom.png` remains only for backward compatibility with existing CMS references.
- The service-free preview's faculty names and qualifications are pre-existing fallback records, not independently verified. Review and update them. A graduation-cap icon indicates a missing portrait. Course preview cards are labeled as a general subject guide. Configured sites show actual published courses and optional schedule/fee fields.
- Results, testimonials, gallery, blog and FAQ use existing published content or honest empty states. No invented counts, ratings, new milestones or portraits are published by default. The pre-existing 2011 founding statement also needs institutional verification.
- YouTube uses the server-only `YOUTUBE_DATA_API_KEY` for the live paginated channel; the seven bundled items are labeled incomplete samples. Live provider access was not tested.

### Verification

- Typecheck, all 17 unit suites, public UX checks and full isolated production integration passed. The integration run used a temporary MongoDB replica set and mocked external services; it covered authentication, access controls, faculty, admissions, booking, CMS, courses, settings, publishing/unpublishing verified facts, academics, fees, recovery and responsive smoke checks. Social-proof validation covers paired rating fields, limits and bilingual milestones. Focused browser tests checked splash skip, auto-dismiss, focus, repeat visits, reduced motion and no-JavaScript behavior.
- Previous responsive checks covered 16 public routes in both languages at 360, 768 and 1440 pixels, plus 404, filtering and profile dialogs. The final pass ran existing UX and integration responsive smoke checks, but did not repeat that entire earlier sweep. Development mode previously emitted a Next.js performance-measure error on some 404 navigations; the earlier isolated production 404 check passed.
- Three final isolated Lighthouse 12 simulated mobile homepage samples scored **74, 69 and 80** (median **74/100**), below the requested **90+**. FCP **1.9/2.0/2.0 s**, LCP **4.7/4.6/4.3 s**, total blocking time **340/520/240 ms**, CLS **0/0.002/0.002**. These are local simulated measurements, not deployed real-device results. The root client translation payload was reduced, but further profiling of render delay, hydration and JavaScript is needed. A 60 fps guarantee was not established.

### Before launch

- Connect and independently verify production MongoDB Atlas, authentication, media storage, email, Gemini, YouTube, PWA behavior and concurrent load. The live preview intentionally does not connect them and public intake is disabled.
- Verify faculty, founding statement, course and editorial content, ratings and milestones; obtain consent for real student/staff photography.
- Privacy and terms are drafts. Offline consent and the one-year staff review process are not implemented as automatic deletion; complete legal/privacy review before enabling intake. Follow `DEPLOYMENT.md`, `SETUP.md`, `PRIVACY-DRAFT.md` and the other setup documents. No credentials are supplied in this archive.

---

## Where the detailed records live

- `STATUS.md` — the evidence-based, module-by-module status; the authority on what works.
- `STALE-TESTS.md` — the disposition and written reason for each stale browser test.
- `VERIFY.md` — how the verification harness reads and writes evidence.
- `SPEC.md` — the requirement spec and its change log.
- `HISTORY.md` — the milestone records this release was built through.
