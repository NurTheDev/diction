# Vibrant Scholar — project handoff

The bilingual public frontend includes responsive navigation, homepage, About, Courses, faculty profiles, videos, facilities, editorial content, gallery, notices/results, FAQ, forms, footer and 404/empty states. Existing routes and business behavior remain in place; the user authorized the necessary i18n, settings-model, admin UI and session changes in this completion pass.

## Verified public facts

Administrators can open **Site settings → Verified public facts** to enter a student count, optionally mark it as a verified minimum, enter an average rating and its review count together, and add up to eight bilingual year/title milestones. The publish checkbox controls all of these fields. They start empty and unpublished; nothing new is fabricated. Only the student count and rating appear on the homepage, and milestones appear on About. Validate and substantiate every claim before publishing it; these fields do not independently verify the entered data. Clearing inputs and saving removes values. Existing site identity and theme settings remain separate. Malformed stored facts are hidden. The home page and About use request-time rendering so a newly unpublished claim is not served from the page cache.

## Session introduction

On the first homepage visit in a browser tab session, a brief dialog can be skipped, dismissed with Escape, or automatically closes after 2.6 seconds. Focus moves into the dialog. It uses sessionStorage only to remember the introduction has been shown in that tab, stores no personal data, and is disabled when reduced motion is requested or storage is unavailable. Without JavaScript the introduction never blocks the page.

## Content and assets

- The hero and About/demo artwork are AI-generated **illustrations**, not photographs of the institution. A real, consented photo can be supplied through the existing homepage banner manager. The original `/brand/classroom.png` remains only for backward compatibility with existing CMS references.
- The service-free preview's faculty names and qualifications are pre-existing fallback records, not independently verified. Review and update them. A graduation-cap icon indicates a missing portrait. Course preview cards are labeled as a general subject guide. Configured sites show actual published courses and optional schedule/fee fields.
- Results, testimonials, gallery, blog and FAQ use existing published content or honest empty states. No invented counts, ratings, new milestones or portraits are published by default. The pre-existing 2011 founding statement also needs institutional verification.
- YouTube uses the server-only `YOUTUBE_DATA_API_KEY` for the live paginated channel; the seven bundled items are labeled incomplete samples. Live provider access was not tested.

## Verification

- Typecheck, all 17 unit suites, public UX checks and full isolated production integration passed. The integration run used a temporary MongoDB replica set and mocked external services; it covered authentication, access controls, faculty, admissions, booking, CMS, courses, settings, publishing/unpublishing verified facts, academics, fees, recovery and responsive smoke checks. Social-proof validation covers paired rating fields, limits and bilingual milestones. Focused browser tests checked splash skip, auto-dismiss, focus, repeat visits, reduced motion and no-JavaScript behavior.
- Previous responsive checks covered 16 public routes in both languages at 360, 768 and 1440 pixels, plus 404, filtering and profile dialogs. The final pass ran existing UX and integration responsive smoke checks, but did not repeat that entire earlier sweep. Development mode previously emitted a Next.js performance-measure error on some 404 navigations; the earlier isolated production 404 check passed.
- Three final isolated Lighthouse 12 simulated mobile homepage samples scored **74, 69 and 80** (median **74/100**), below the requested **90+**. FCP **1.9/2.0/2.0 s**, LCP **4.7/4.6/4.3 s**, total blocking time **340/520/240 ms**, CLS **0/0.002/0.002**. These are local simulated measurements, not deployed real-device results. The root client translation payload was reduced, but further profiling of render delay, hydration and JavaScript is needed. A 60 fps guarantee was not established.

## Before launch

- Connect and independently verify production MongoDB Atlas, authentication, media storage, email, Gemini, YouTube, PWA behavior and concurrent load. The live preview intentionally does not connect them and public intake is disabled.
- Verify faculty, founding statement, course and editorial content, ratings and milestones; obtain consent for real student/staff photography.
- Privacy and terms are drafts. Offline consent and the one-year staff review process are not implemented as automatic deletion; complete legal/privacy review before enabling intake. Follow `DEPLOYMENT.md`, `DASHBOARD-LOGIN.md`, `ATLAS-SETUP.md`, `PRIVACY-DRAFT.md` and the other setup documents. No credentials are supplied in this archive.
