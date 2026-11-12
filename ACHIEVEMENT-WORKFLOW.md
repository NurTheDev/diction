# Achievement workflow — implementation and safety boundaries

This feature is implemented for controlled testing but is **not approved for real student data** until the full deployment, privacy, security and safeguarding reviews in `PRODUCTION-READINESS-STATUS.md` are completed. It is disabled unless both `DATA_COLLECTION_ENABLED=true` and `ACHIEVEMENTS_ENABLED=true` are set server-side. Never use a development server with live data.

## What it does

- The authenticated admin editor creates a privately stored draft, or loads and updates an existing draft. It stores a re-encoded JPEG of the selected/cropped photo, a re-encoded PNG of the card, card settings, optional English fields, the processing-consent reference, the recording admin and timestamp in one MongoDB record. No Cloudinary upload is used. Staff must have a valid reason and confirmed permission to process the data; the checkbox is an attestation, not proof. Use only a reference to the separately secured consent record, not sensitive evidence or a phone number.
- Images are decoded and re-encoded server-side with Sharp, limiting dimensions and stripping metadata. Requests are bounded to 4,000,000 bytes, the JPEG input to 2,000,000 bytes and PNG input to 3,000,000 bytes; re-encoded images combined are limited to 3,200,000 bytes. Some larger photographs/cards will need downsizing or a future private object-storage adapter. These limits are below typical serverless body limits but must be checked against the actual host. MongoDB storage quotas, encryption, access control and backups must be reviewed before live use. Drafts are private from anonymous app requests, not from authorized staff, database operators, or backups.
- Only live, active admins with the current session version can list, create, edit, publish, withdraw or delete. State-changing API requests verify canonical origin and host and use a database-backed rate limit. Query/bulk updates are blocked and document updates use full validation and optimistic concurrency; a stale edit is rejected. Direct database writes bypass application protections. The list is limited to the latest 100 records; searching, pagination, duplicate and bulk export remain unimplemented.
- Publication requires a separate explicit guardian/subject attestation, a consent reference of at least five characters, an admin identity and a server timestamp. Publication and withdrawal events are retained with the record (up to 200 events); this is not a comprehensive tamper-resistant audit log. Deletion is allowed only after withdrawal and removes that record and its images/history from the active MongoDB collection. Existing backups, provider logs, previously downloaded copies and external caches may remain; implement and test a retention/deletion process. General admin audit logging remains best-effort.
- `/bn/achievements` and `/en/achievements` list published consented items, and per-card pages support Open Graph metadata and manual Facebook/WhatsApp sharing. Pages and PNG responses read current status at request time and the image response is `no-store`; external sites may cache share previews. There is no automatic Facebook posting, sharing analytics, QR, guaranteed external-cache invalidation, or dedicated wide OG card. Unpublishing prevents subsequent normal app requests from obtaining the card, but cannot recall a response already in flight or copies already made.
- First-name-only masks the public text fields as rendered by the app; a trusted admin can supply arbitrary image pixels to the API, so the server cannot independently verify that the uploaded PNG contains only first names. Staff must inspect the actual card, all pictured people, crop and content before publication. The software cannot verify guardianship or detect faces.

## Testing and operations

`npm run typecheck` and `npm test` check TypeScript and deterministic validation. For the isolated workflow integration test, install browser/system dependencies and build first:

```sh
npx playwright install --with-deps chromium
npm run build -- --webpack
npm run test:achievement-workflow
```

The test starts a temporary MongoDB server and local production server with generated test credentials, uses artificial images and synthetic text, and exercises authentication, origin rejection, draft isolation, editing with stale-version rejection, consent checks, publication, public page/image, withdrawal, deletion and browser admin interaction. It is not an independent security audit or real-Atlas/cloud/production test. The existing generic CMS, gallery and topper content use separate public-media workflows and must be reviewed for consent and minors' privacy; the new feature does not retroactively protect them.
