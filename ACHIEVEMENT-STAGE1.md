# Achievement card generator — historical stage 1 design review

**Historical note:** the implementation has since changed. For the current workflow, tests and remaining safety limits, see `ACHIEVEMENT-WORKFLOW.md` and `PRODUCTION-READINESS-STATUS.md`. Statements below that draft saving or publication are entirely absent describe the earlier stage, not the current implementation.

This is an intentionally incomplete first-stage prototype, awaiting the owner's design approval.

## Implemented

- An `Achievement` Mongoose model and a Zod schema with bilingual fields, status, ranks, consent, future media URLs and indexes. Publishing without recorded parent consent fails schema validation and Mongoose document validation. No database writes or publication workflow have been added yet.
- A protected admin design editor at `/bn/admin/achievements` and `/en/admin/achievements`, plus a sample-only `/bn/achievement-preview` page available only in explicitly service-free development mode. The preview uses a silhouette, sample text and `example.com`, not real student data.
- Five browser-rendered templates; square, portrait and wide sizes; Bangla typography; fit-to-space text; browser-local photo input, camera input, crop/zoom/reposition and brightness; visible first-name-only and field visibility controls; PNG download and supported-browser clipboard copy. The browser decodes/re-encodes the photo before use, stripping EXIF from the resulting working image. There is no face detection; text is in a separate area and users must review their crop.
- Browser PNG exports were checked at 1080×1080, 1080×1350 and 1200×630. Mobile file input/crop, metadata stripping and overflow were checked using a synthetic image. Preview versus PNG is visually very close, though exact pixel identity across browsers/fonts has not been established.

## Not implemented yet

- Persistent draft saving/editing, list/search/filter/pagination, duplicate/delete, signed Cloudinary uploads and cleanup, server consent enforcement on write paths, automatic two-image export, public pages, SEO, share count and sharing, and optional Facebook auto-post. All these remain for subsequent work; the current editor clearly says that saving and publishing are unavailable. Do not use real student photos in this design preview.
- The model's document-validation consent guard is not a substitute for explicit consent checks on every future update/publish API. Consent evidence, access controls, retention, deletion, backup/CDN invalidation and Cloudinary privacy must be designed and tested with the actual deployment before processing minors' photos.
- Auto-enhance is currently a simple brightness preset, not an image-analysis algorithm. Background blur and several additional delights are not implemented. Long text is shrunk to fit, which can become small. The template provides separate photo and copy areas but cannot verify a face is in frame.

## AI investigation

No live provider credentials or production configuration are present in this workspace. The service-free preview deliberately disables AI, so no real-provider repair can be verified here. The student request budget has been increased to reduce empty thinking-model responses, upstream quota errors are surfaced as rate-limit errors, and an authenticated, rate-limited admin provider connection test sends a fixed, non-personal question and reports a sanitized error category. A mocked-provider integration test passed, not a live Gemini test. Follow `AI-SETUP.md`; never share API keys in chat. The existing guardian, privacy and data-collection safeguards remain in place.

## Design review round 2

The cards use much larger photo areas, Bangla rank badges and the institution's supplied tagline. Photo and text occupy separate blocks; crop and horizontal/vertical focus controls support landscape and portrait compositions. The form can display a group of names or select one name for an individual card. Individual cards are exported one at a time; bulk ZIP export is not implemented. The 15 template/ratio sample combinations passed browser PNG dimension checks. Long text is shrunk; if it cannot fit at the minimum supported size, the editor blocks export with a message rather than silently exporting clipped text. For long text, the original 84–110 px name and 52–64 px title targets may not be achievable on every layout; they can shrink to 30 px in the export.

Site Settings now has optional official HTTPS website and editable Bangla tagline fields. A saved website URL is displayed on the card. The bundled/service-free environment has no known official URL and does not insert a placeholder. A QR code to the achievement page is deferred until public pages and their real URLs exist. Card logo uses Site Settings. Synthetic-image mobile checks covered group/individual selection, crop, EXIF stripping, overflow and all export dimensions. The production integration test passed with a synthetic website/tagline and mocked provider; one earlier run stopped at an unrelated intermittent editorial-save check, and a subsequent full rerun passed. No live provider, Cloudinary, or real Facebook sharing was tested.

## Private photos for design review

Any real photos provided for round-three testing must remain in git-ignored `test-assets/`, be used locally only, never uploaded to Cloudinary or published, and be deleted from the project when testing is finished. Do not include that folder in archives. Real photos have not yet been supplied for round-three tests.

## Round 3 — celebration layer in progress

The preview now uses inline-SVG medal, laurel/confetti/tape/podium motifs, self-hosted Hind Siliguri/Inter and Atma fonts, Bangla date formatting, layered photo frames and integrated logo tabs. The selected medal corner can be changed; neither crop nor overlay is automatically face-aware. Group names can be displayed on a full-height-photo layout. Exact user-provided test name and a two-line sample caption were used for 15 single-winner and six group illustrative exports, all with expected PNG dimensions. The rasterized preview reuses the same Blob as the download when current, and one aligned desktop Chromium check was pixel-identical after excluding unrelated site chrome; this does not establish cross-browser/device identity.

No new real photos have been received as of this note. The user requested 4–5 real local-only photos, face-crop assessment across every template and ratio, and deletion of those test photos when finished. These checks and final design approval remain pending. Do not use the older uploaded personal photo or résumé as substitutes. Do not include `test-assets/` or generated outputs derived from real photos in source archives or uploads. The round-three wide three-winner layout necessarily shrinks the specified long names (about 42 px in the 1200×630 output versus the requested 84 px minimum); treating this as fully compliant would be inaccurate. The editor blocks export when text cannot fit even at its configured minimum. Keep public pages and Facebook sharing on hold until approval.

## Synthetic-photo test package

At the owner's request, three AI-generated fictional portraits were used as non-published local design fixtures. Browser tests generated 45 single-winner PNGs (3 photos × 5 templates × 3 ratios) and confirmed the expected output dimensions; the 350px overviews were visually inspected. With the original default 50% vertical focus, the square card cut the top of the head in the tall synthetic portrait. The default was changed to 30% and all 45 cases were re-exported; the three synthetic faces appeared within frame in the inspected overviews. This is not face detection, and it does not establish that arbitrary real photographs will fit. The focus and crop controls must be checked each time.

The download package optionally contains these deliberately labeled synthetic fixtures in `SYNTHETIC-TEST-IMAGES/` for local testing, not published content; they are not any user's real photos. `test-assets/` itself and any real user photos remain excluded. Current package checks: typecheck and unit tests passed. The default production build timed out after four minutes while running alongside the dev server; a subsequent `npm run build -- --webpack` succeeded with the dev server stopped. The UX suite passed on a subsequent run without a concurrent build; its earlier attempt timed out while a welcome splash intercepted a click.

## Recovery and production-hardening checkpoint

The workspace restored an older renderer after the last download, while retaining some newer documentation and screenshots. The latest source archive was not available to the agent, and the owner could not upload it. The celebration renderer was reconstructed from the older implementation and screenshots; it is not a byte-for-byte recovery of the earlier Round 3. The new wide group layout deliberately uses about 22% width for the photo and 78% for text; the specified three long sample names render at 84 output pixels in the tested Champion and Trophy cards, at the cost of a much smaller crop. The rebuild has not been verified with real photos and is not a completed production implementation.

Achievement model query updates, replacements and bulk writes now fail closed rather than bypassing document consent validation. This does not constrain direct MongoDB driver writes and is not an authorization/consent workflow. No achievement publishing/write endpoints were added. The generic public-image picker now explicitly warns that uploads become public immediately, including in drafts, and that minors' photos must not be uploaded there. Existing general CMS/gallery/topper content and external media need a full privacy review; the warning is not an enforcement mechanism. A private, access-controlled achievement-media store, recorded/verifiable consent and revocation, protected publication and deletion workflows are still required.
