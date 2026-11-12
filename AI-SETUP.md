# Gemini AI Study Buddy: safe setup

**New public assistant:** See `PUBLIC-PRACTICE-AND-AI.md` for the additional `PUBLIC_AI_ENABLED` flag, anonymous use, privacy and cost safeguards, and mock-only verification. This document primarily describes the original authenticated student assistant.

The public introduction is at `/bn/study-buddy` and `/en/study-buddy` (also in the **More** menu). A real student uses **Student dashboard → AI Study Buddy** or `/bn/dashboard/study#ai-study-buddy`. The student account must be active and have a linked student profile. Admins can inspect non-secret configuration status at **Admin → AI Study Buddy** (`/bn/admin/ai`). The current service-free preview shows the design only; it is not a live AI chat.

## Before enabling

The application is used by school-age students. Before enabling, an authorized operator must review the current Google Gemini API terms, applicable age/guardian requirements, data processing and retention terms, parental permission, moderation and child-safety procedures, privacy notices, regional and legal requirements, quotas and billing. Obtain any required consent outside the app and maintain appropriate records. The checkbox is a user confirmation, **not verification** that a guardian actually consented. Do not enter personal or confidential information into chat. AI can make mistakes; students should verify important answers with a teacher. No comprehensive moderation, conversation review, guardian-consent verification, or image upload is implemented.

## Private configuration

1. Follow `DASHBOARD-LOGIN.md` and `ATLAS-SETUP.md` to configure an isolated **test** database, authentication and a student account/profile. Do not place real student data in the test environment.
2. In your own `.env.local` (or your hosting platform's private environment settings), add a Gemini API key and a model your Google project can access. Do **not** paste the key in chat, commit it, put it in browser code, or add a `NEXT_PUBLIC_` prefix:

   ```dotenv
   GEMINI_API_KEY=your-private-gemini-key
   AI_MODEL=gemini-3.8-flash
   ```

   The model shown is an example from Google's compatibility documentation. Verify that it is available for your project and region; models, quotas and prices can change. The default server endpoint is `https://generativelanguage.googleapis.com/v1beta/openai`; `AI_API_BASE_URL` is optional and should be overridden only for a trusted OpenAI-compatible service. An existing `AI_API_KEY` is accepted as a fallback if `GEMINI_API_KEY` is absent.
3. After the reviews above, and only in the appropriate environment, explicitly set **both** flags:

   ```dotenv
   DATA_COLLECTION_ENABLED=true
   AI_STUDY_BUDDY_ENABLED=true
   ```

   `DATA_COLLECTION_ENABLED` also enables admission, booking and other data-collecting features; it is not an AI-only switch and does not gate every authenticated mutation. Do not turn it on in production until all associated data-collection features have been reviewed. Leaving either flag false disables AI. This extra AI flag is required even if an older installation already had API settings.
4. Restart or redeploy the app so server environment changes take effect. Check **Admin → AI Study Buddy**; its checklist reports configuration presence, **not a live provider test or proof of safety**. Sign in as an enrolled test student, confirm permission and ask a synthetic, non-personal educational question. Check the provider's usage/quota panel. Never use `PREVIEW_WITHOUT_SERVICES=1` for this test.

The server sends the student’s grade, the current question and up to seven recent conversation messages to the configured provider; it does not send the student’s name or email deliberately. Whatever a user types is sent, so avoid personal information. Conversation history is kept in the browser page's memory and can be cleared; the app does not persist it on the server. Provider-side retention is governed by provider terms. The response is streamed, text-only, and may be incorrect or interrupted. Requests are subject to a shared database-backed rate limit and provider limits; quotas and spending controls must also be configured with Google. The API key stays server-side. A local mock-provider integration test is included; no real Gemini key has been supplied or tested.

If the UI says unavailable, check both flags, the server-side key, the model ID/project access, network access, quota/billing and the canonical `NEXTAUTH_URL`/`AUTH_URL`. Do not include secrets or student questions in troubleshooting screenshots or logs. Official reference: <https://ai.google.dev/gemini-api/docs/openai>.

## Connection diagnostic

After the required configuration and safety review, an admin can use **Admin → AI Study Buddy → Run connection test**. It sends one fixed, non-personal question from the server to the configured provider and reports whether the provider returned text or a safe category of error (key/permission, quota, model/request, provider, or network). It does not expose the key or the provider's response body, and is limited to three tests per admin per ten-minute window. The test can consume provider quota; an apparent success does not prove student eligibility, data-handling compliance, or streaming behavior. The student chat itself now allows a larger output token budget to reduce empty answers from thinking models and propagates upstream quota/rate failures to the UI. Actual cost, availability, quotas and model behavior depend on the provider and project.

The development preview still does not have a real provider connection or authentication. A live test requires the private configuration described above; never share the API key. If the feature is still unavailable, record the exact on-screen message, whether it happens in the service-free preview or a deployed site, and whether the admin diagnostic succeeds.
