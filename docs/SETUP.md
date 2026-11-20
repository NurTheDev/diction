# Setup, login and service configuration

Everything needed to run this build on your own machine: the quick test run, the admin
login, MongoDB Atlas, and the optional Gemini and YouTube services. This is a testing build, not a
production-ready release — read `RELEASE-READINESS.md` before entering real people's data.

Consolidated from the former root files `TEST-ME-FIRST.md`, `DASHBOARD-LOGIN.md`, `ATLAS-SETUP.md`, `AI-SETUP.md`, `YOUTUBE-SETUP.md`.

## Contents

- [Test this build first](#test-this-build-first)
- [Admin dashboard login](#admin-dashboard-login)
- [MongoDB Atlas connection](#mongodb-atlas-connection)
- [Gemini AI Study Buddy](#english-summary)
- [YouTube channel feed](#gemini-ai-study-buddy)

---

## Test this build first

For staff permissions and multimedia publishing, see `FEATURES.md`.

This is a testing build, **not a production-ready release**. Before using real student information, resolve the blockers in `RELEASE-READINESS.md` and `FEATURES.md`.

Use Node.js 22.13 or newer. Extract the ZIP and run in the folder containing `package.json`:

```sh
npm ci
PREVIEW_WITHOUT_SERVICES=1 npm run dev
```

On Windows PowerShell, use `$env:PREVIEW_WITHOUT_SERVICES='1'; npm run dev` for the second line. Open `http://localhost:3000/bn` for the website, and `http://localhost:3000/bn/achievement-preview` for the card-design preview. The local preview does not connect to real services or allow saving/publishing. Illustrations and sample names are not actual students or achievements.

The protected admin and achievement workflow require a configured database and environment. See `FEATURES.md` and `DEPLOYMENT.md`. The feature and collection flags default off. Do not enter credentials in chat or commit `.env.local`. The general public-media uploader makes assets public immediately, even for draft forms; never use it for private documents or minor photos.

### Checks

Run `npm run typecheck` and `npm test`. To test the achievement workflow with an isolated test database and browser, follow `FEATURES.md`. A webpack production build and that focused synthetic integration test passed in the development environment. The entire-site integration rerun did not complete under sandbox resource limits. Live services, production deployment and security are not verified.

---

## Admin dashboard login

**এই workspace-এর বর্তমান প্রিভিউ ডাটাবেসের সঙ্গে সংযুক্ত নয়।** এখানে কোনো default admin email বা password নেই। নিরাপত্তার জন্য ডেমো password বা সবার জন্য খোলা admin access তৈরি করা হয়নি। `/bn/login`-এ যে সেবা বন্ধের বার্তা দেখায়, সেটি এই অপরিবর্তিত service-free preview-এর প্রত্যাশিত অবস্থা। `/bn/admin-preview` শুধু নকশার প্রিভিউ; লগ ইন বা বাস্তব CMS নয়।

### নিজস্ব test environment-এ অ্যাডমিন চালু করুন

1. ডাউনলোড করা ZIP খুলে এই গাইডের “Admin dashboard login” ও “MongoDB Atlas connection” অংশ অনুসরণ করুন। Node.js 22.13 বা নতুন সংস্করণ ব্যবহার করুন এবং **আলাদা test Atlas cluster** নিন। বাস্তব তথ্য ব্যবহারের আগে `DEPLOYMENT.md` পড়ুন।
2. Project folder-এ `npm ci` চালান। `.env.example` থেকে `.env.local` তৈরি করুন। আপনার নিজের কম্পিউটারে নিরাপদভাবে এই মানগুলো বসান:
   - `MONGODB_URI`: Atlas connection string; অ্যাপ `dictioncoaching` database ব্যবহার করে।
   - `NEXTAUTH_SECRET`: অন্তত ৩২ অক্ষরের ইউনিক secret।
   - `NEXTAUTH_URL` ও `AUTH_URL`: একই origin, local ব্যবহারে `http://localhost:3000`।
   - `SEED_ADMIN_EMAIL`: আপনি নিজের জন্য যে admin email বেছে নেবেন।
   - `SEED_ADMIN_PASSWORD`: আপনার বেছে নেওয়া শক্তিশালী password; অন্তত ১২ অক্ষর এবং সর্বোচ্চ ৭২ UTF-8 bytes।
   - `DATA_COLLECTION_ENABLED=false` রাখুন যতক্ষণ না প্রয়োজনীয় গোপনীয়তা ও নিরাপত্তা পর্যালোচনা সম্পন্ন হচ্ছে। এই flag সব admin mutation বন্ধ করে না।
3. `npm run atlas:check` চালিয়ে read-only connection পরীক্ষা করুন। এই পরীক্ষা write বা transaction যাচাই করে না।
4. ব্যাকআপ নিন, সঠিক **test cluster** নিশ্চিত করুন; এরপর initial seed চালান। এই ধাপে ডাটাবেসে লেখা হয়:

```bash
node --env-file=.env.local --import tsx scripts/seed.ts
npm run dev
```

5. Browser-এ `http://localhost:3000/bn/login` খুলুন। `.env.local`-এর `SEED_ADMIN_EMAIL` এবং `SEED_ADMIN_PASSWORD` দিয়ে লগ ইন করুন। সফল লগ ইন আপনাকে `/bn/admin`-এ পাঠাবে। এটি কেবল প্রথমবার account তৈরি হওয়ার ক্ষেত্রে প্রযোজ্য; একই email-এর account আগে থেকে থাকলে seed password বদলায় না।
6. শিক্ষক, শিক্ষার্থী ও অভিভাবকের জন্য admin workspace-এ আলাদা account তৈরি করতে হবে; সেই account-গুলো নিজ নিজ portal-এ যায়। আসল ব্যবহারকারীদের credential নিরাপদ মাধ্যমে দিন।

`PREVIEW_WITHOUT_SERVICES=1` ব্যবহার করে চালানো server-এ লগ ইন চালু হবে না, এমনকি `.env.local` তৈরি করলেও; সেটি বাদ দিয়ে server পুনরায় চালু করুন। Deployment-এ Vercel environment variables-এ secrets ব্যক্তিগতভাবে দিন এবং উভয় URL নিজের HTTPS origin-এ সেট করুন। Connection string বা password চ্যাটে দেবেন না।

### ভর্তি ফর্ম কেন বন্ধ?

Admission, trial booking এবং contact collection চালু করতে বৈধ server configuration ও `DATA_COLLECTION_ENABLED=true` লাগে। **এখনই এটি চালু করবেন না**: privacy/terms, offline guardian-consent verification, retention procedures, নিরাপত্তা ও বাস্তব integration পর্যালোচনা এখনো অসম্পূর্ণ। পরীক্ষার জন্য পৃথক database ও কাল্পনিক তথ্য ব্যবহার করুন। এই setting বাস্তব লগ ইন চালুর জন্য আবশ্যক নয়।

---

### English summary

The current preview has no connected database and no default admin password. To sign in, privately configure a separate test Atlas cluster and the core environment variables in `.env.local`; set your own `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`; run the seed command above; start the server **without** `PREVIEW_WITHOUT_SERVICES=1`; and visit `/bn/login`. Existing account passwords are never reset by re-running the seed. Do not share credentials in chat. Admissions remain disabled until the privacy, consent, retention, security and deployment requirements are reviewed. See the login and Atlas sections above, `PRIVACY-DRAFT.md` and `DEPLOYMENT.md`.

### ড্যাশবোর্ড ব্যবহার

- **Trial slots:** Admin → Trial slots-এ শ্রেণি, বিষয় ও আসন দিন। শুরুর তারিখ, শুরুর সময়, শেষের তারিখ ও শেষের সময় বাংলাদেশ সময়ে দিন; শুরু ভবিষ্যতে এবং শেষ তার পরে হতে হবে। একই শ্রেণি ও বিষয়ের একই সময়ে দ্বিতীয় স্লট হবে না। ক্যালেন্ডার বন্ধ হওয়া আপনার ব্রাউজারের নিয়ন্ত্রণে।
- **Teacher ও batch:** Academics-এর account ফর্মে শিক্ষক নির্বাচন করে সম্মতিপ্রাপ্ত শিক্ষকের নাম, ইমেইল ও অন্তত ১২ অক্ষরের পাসওয়ার্ড দিয়ে অ্যাকাউন্ট তৈরি করুন। তারপর নিচে batch ফর্মে সেই অ্যাকাউন্ট নির্বাচন করুন। ওয়েবসাইটের faculty পরিচিতি এবং শিক্ষক লগইন অ্যাকাউন্ট আলাদা। পাসওয়ার্ড নিরাপদ উপায়ে দিন ও পরিবর্তন করতে বলুন।
- **ছবি:** faculty, লেখা/গ্যালারি, homepage banner ও settings-এ সরাসরি ছবি নির্বাচন করুন। আপলোড শেষ হলে ফর্মে Save চাপুন। ছবি সর্বোচ্চ ৪ MiB PNG/JPG/WebP এবং সর্বসাধারণ দেখতে পাবে; ব্যক্তিগত ডকুমেন্ট আপলোড করবেন না। ব্যবহৃত নয় এমন আপলোড Media থেকে মুছুন। Cloudinary না থাকলে ছবির ডাটা MongoDB-তে থাকবে, তাই storage ও backup পর্যবেক্ষণ করুন।
- নতুন কনটেন্টের slug/key নিজে দেওয়ার দরকার নেই; পুরোনো লিংক অপরিবর্তিত থাকে।
- Admission/trial booking পরীক্ষা করতে আলাদা test database-এ সেটিংস দিয়ে কাল্পনিক তথ্য ব্যবহার করুন। বাস্তব ব্যবহার শুরুর আগে উপরে বর্ণিত privacy, consent ও security কাজ শেষ করুন। সঠিক ক্লাস ও বিষয়ের ভবিষ্যৎ স্লট তৈরি না করলে booking তালিকা ফাঁকা থাকবে।

### AI Study Buddy ও অনলাইন ভর্তি

- Admin sidebar-এ **AI Study Buddy** থেকে Gemini সেটআপের অবস্থা দেখুন; key সেখানে দেখানো বা সংরক্ষণ করা হয় না। নিরাপদে নিজের server environment-এ key দিন; এই গাইডের “Gemini AI Study Buddy” অংশ অনুসরণ করুন।
- ব্যবহারকারী ও অভিভাবকের অনুমতি, গোপনীয়তা, AI নিরাপত্তা এবং Google-এর শর্ত, খরচ ও quota পর্যালোচনা শেষ না হওয়া পর্যন্ত ফিচার চালু করবেন না। অ্যাপের চেকবক্স অফলাইন অনুমতি যাচাই করে না।
- শিক্ষার্থী লগ ইন করে dashboard → **AI Study Buddy** ব্যবহার করবে। পাবলিক ওয়েবসাইটে More → **AI Study Buddy** থেকেও পরিচিতি ও লগ ইন লিংক আছে। এখানে শুধু লেখা যায়; ব্যক্তিগত তথ্য লিখবেন না।
- Admin sidebar-এ **Admission & booking setup**-এ সেবার পরিবেশগত অবস্থা ও আসনযুক্ত ভবিষ্যৎ স্লটের সংখ্যা দেখায়। সঠিক শ্রেণি ও বিষয়ের স্লট তৈরি করুন। এটি নিরাপত্তা পর্যালোচনার বিকল্প নয়।

---

## MongoDB Atlas connection

এই প্রকল্প এখনো production-ready নয়। প্রথমে একটি **পৃথক test Atlas cluster/project** ব্যবহার করুন এবং শুধু পরীক্ষামূলক তথ্য দিন। প্রকৃত শিক্ষার্থী বা অভিভাবকের তথ্য সংগ্রহের আগে গোপনীয়তা, অভিভাবকের সম্মতি, নিরাপত্তা, ব্যাকআপ এবং বাস্তব ডিপ্লয়মেন্ট পর্যালোচনা সম্পন্ন করতে হবে। `PRIVACY-DRAFT.md` ও `DEPLOYMENT.md` দেখুন।

### ১. তথ্য ব্যক্তিগত রাখুন

- ডাটাবেসের পাসওয়ার্ড, পূর্ণ MongoDB URI, API key বা `.env.local`-এর বিষয়বস্তু চ্যাট, ইমেইল, স্ক্রিনশট, Git বা লগে দেবেন না।
- Atlas-এর **Database Access** থেকে আলাদা database user তৈরি করুন। তাকে কেবল `dictioncoaching` ডাটাবেসে `readWrite` দিন; Atlas project owner বা cluster-wide admin ব্যবহার করবেন না। Atlas account-এর লগইন পাসওয়ার্ড এবং database user-এর পাসওয়ার্ড এক নয়।
- **Network Access**-এ আপনার কম্পিউটার এবং ডিপ্লয়মেন্টের অনুমোদিত নেটওয়ার্ক যোগ করুন। সাধারণ Vercel serverless-এর জন্য একটি স্থায়ী outbound IP সাধারণত থাকে না; স্থায়ী egress বা যথাযথভাবে পর্যালোচিত বিকল্প নির্ধারণ করুন। `0.0.0.0/0` অনুমতি ঝুঁকি বাড়ায়—অবাধে চালু করবেন না। TLS ও শক্তিশালী, অনন্য credentials ব্যবহার করুন।
- অ্যাপ সবসময় `dictioncoaching` ডাটাবেস ব্যবহার করে। আলাদা test এবং production cluster/project ব্যবহার করুন; শুধু URI-তে অন্য নাম লিখে এই অ্যাপের database নাম বদলানো যায় না।

### ২. নিজের কম্পিউটারে কনফিগার করুন

Node.js 22.13+ ইনস্টল করে ডাউনলোড করা project folder-এ যান। `.env.example` কপি করে `.env.local` তৈরি করুন। ফাইলটি Git-এ উপেক্ষিত; তবুও পাঠানোর বা আপলোড করার আগে যাচাই করুন।

```bash
npm ci
cp .env.example .env.local
```

আপনার নিজের নিরাপদ text editor-এ `.env.local` খুলে Atlas থেকে পাওয়া সংযোগের তথ্য `MONGODB_URI`-তে বসান। নমুনাটি শুধু কাঠামো—এখানে নিজের গোপন তথ্য বসিয়ে কাউকে পাঠাবেন না:

```dotenv
MONGODB_URI=mongodb+srv://<database-user>:<database-password>@<cluster-host>/dictioncoaching?retryWrites=true&w=majority
```

Username/password-এ URI বিশেষ অক্ষর থাকলে সেগুলো locally percent-encode করুন (যেমন `@` → `%40`, `/` → `%2F`)। পাসওয়ার্ড shell command-এ লিখবেন না; shell history-তে থেকে যেতে পারে। প্রকৃত string কোথাও প্রকাশ করবেন না।

শুধু connection probe-এর জন্য `MONGODB_URI` যথেষ্ট। অ্যাপ চালাতে `NEXTAUTH_SECRET` অন্তত ৩২ অক্ষরের অনন্য গোপন মান এবং একই origin-এর `NEXTAUTH_URL` ও `AUTH_URL` প্রয়োজন। নিজের কম্পিউটারে `openssl rand -base64 32` দিয়ে secret তৈরি করে ব্যক্তিগতভাবে `.env.local`-এ রাখুন; কাউকে পাঠাবেন না। Local URL সাধারণত `http://localhost:3000`; deployment-এ দুটিতেই প্রকৃত HTTPS origin দিন। `DATA_COLLECTION_ENABLED=false` রাখুন। এই flag ভর্তি, trial, যোগাযোগ ও কিছু study-writing বন্ধ রাখে; এটি সব authenticated admin/portal mutation বন্ধ করে না।

### ৩. লেখা ছাড়া সংযোগ পরীক্ষা

```bash
npm run atlas:check
```

সফল হলে `Connection: OK`, `Database: dictioncoaching` এবং `Read permission: OK` দেখাবে। এই পরীক্ষা কোনো নথি লিখে না, URI/credential/raw error প্রকাশ করে না। এটি write permission, index তৈরি, transaction, ব্যাকআপ বা production নিরাপত্তা যাচাই করে না। ব্যর্থ হলে URI-এর গঠন, password encoding, database user, Network Access ও cluster সচল আছে কি না নিজের কম্পিউটারে যাচাই করুন। চাইলে শুধু **ব্যক্তিগত তথ্যবিহীন ফলাফল** জানাতে পারেন; কোনো URI, host, username, password বা error log পাঠাবেন না।

### ৪. পরবর্তী ধাপ

`npm run seed:check` কোনো DB write করে না। আসল seed ও authenticated workflow পরীক্ষা **write করে**: প্রথমে ব্যাকআপ নিন, পৃথক test cluster নিশ্চিত করুন এবং `DEPLOYMENT.md`-এর seed নির্দেশনা অনুসরণ করুন। এটি admin ও bundled public content তৈরি করতে পারে; আগে থেকে থাকা ডেটার সঙ্গে index সংঘর্ষ হতে পারে। পরীক্ষা শেষ না হওয়া পর্যন্ত production ও প্রকৃত ব্যক্তিগত তথ্য ব্যবহার করবেন না।

Vercel-এ ব্যবহার করতে Project Settings → Environment Variables-এ উপরের secret-গুলো ব্যক্তিগতভাবে দিন, Preview ও Production-এর জন্য পৃথক cluster/secret ব্যবহার করুন, এবং origin অনুযায়ী `NEXTAUTH_URL` ও `AUTH_URL` মিলিয়ে দিন। পরিবেশ পরিবর্তনের পর প্রয়োজনমতো redeploy করুন। বাস্তব Atlas, Vercel, email, Cloudinary ও AI সেবা এই workspace থেকে যাচাই করা হয়নি।

---

## English summary

Use a separate test Atlas project, a database user restricted to `readWrite` on `dictioncoaching`, TLS and carefully reviewed network access. Never share credentials or the full URI in chat. Copy `.env.example` to `.env.local`, set `MONGODB_URI` privately, then run `npm run atlas:check`. The probe performs a connection and read check only and redacts raw errors; it does not test writes, indexes, transactions or backups. Keep data collection disabled and avoid real personal data until the policy, consent, security and deployment reviews are complete. The application always selects `dictioncoaching`, so use separate clusters/projects for test and production. See `DEPLOYMENT.md` before any seed or write test.

---

## Gemini AI Study Buddy

**New public assistant:** See `FEATURES.md` for the additional `PUBLIC_AI_ENABLED` flag, anonymous use, privacy and cost safeguards, and mock-only verification. This document primarily describes the original authenticated student assistant.

The public introduction is at `/bn/study-buddy` and `/en/study-buddy` (also in the **More** menu). A real student uses **Student dashboard → AI Study Buddy** or `/bn/dashboard/study#ai-study-buddy`. The student account must be active and have a linked student profile. Admins can inspect non-secret configuration status at **Admin → AI Study Buddy** (`/bn/admin/ai`). The current service-free preview shows the design only; it is not a live AI chat.

### Before enabling

The application is used by school-age students. Before enabling, an authorized operator must review the current Google Gemini API terms, applicable age/guardian requirements, data processing and retention terms, parental permission, moderation and child-safety procedures, privacy notices, regional and legal requirements, quotas and billing. Obtain any required consent outside the app and maintain appropriate records. The checkbox is a user confirmation, **not verification** that a guardian actually consented. Do not enter personal or confidential information into chat. AI can make mistakes; students should verify important answers with a teacher. No comprehensive moderation, conversation review, guardian-consent verification, or image upload is implemented.

### Private configuration

1. Follow the admin-login and Atlas sections above to configure an isolated **test** database, authentication and a student account/profile. Do not place real student data in the test environment.
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

### Connection diagnostic

After the required configuration and safety review, an admin can use **Admin → AI Study Buddy → Run connection test**. It sends one fixed, non-personal question from the server to the configured provider and reports whether the provider returned text or a safe category of error (key/permission, quota, model/request, provider, or network). It does not expose the key or the provider's response body, and is limited to three tests per admin per ten-minute window. The test can consume provider quota; an apparent success does not prove student eligibility, data-handling compliance, or streaming behavior. The student chat itself now allows a larger output token budget to reduce empty answers from thinking models and propagates upstream quota/rate failures to the UI. Actual cost, availability, quotas and model behavior depend on the provider and project.

The development preview still does not have a real provider connection or authentication. A live test requires the private configuration described above; never share the API key. If the feature is still unavailable, record the exact on-screen message, whether it happens in the service-free preview or a deployed site, and whether the admin diagnostic succeeds.

---

## YouTube channel feed

The Demo Classes page shows video previews from the institution's channel (`https://www.youtube.com/@DictionCoaching`). With no API configuration it shows a clearly labeled **selection**, not all videos, plus a link to the full channel. The seven sample videos and their locally stored thumbnails were verified from the public channel in November 2026; review them regularly for availability, accuracy and permission. Visitors press play before a YouTube iframe is loaded. Privacy-enhanced `youtube-nocookie.com` is used, but Google/YouTube still receives the request when the visitor plays; review and update your privacy notice.

### Show public uploads automatically

1. Create or select your own Google Cloud project, enable **YouTube Data API v3**, and create an API key. This is a separate API from Gemini; a Gemini key does not automatically grant access. Restrict the key to YouTube Data API v3 and appropriate server restrictions supported by your hosting arrangement. Set quota and budget alerts. See <https://developers.google.com/youtube/v3/getting-started>.
2. Add the key privately to `.env.local` or the server's private environment settings:

   ```dotenv
   YOUTUBE_DATA_API_KEY=your-private-youtube-data-api-key
   ```

   Never paste the key in chat, commit it, or use `NEXT_PUBLIC_`. The key is sent by the server as an API header, not embedded in browser code. An existing `NEXTAUTH_SECRET` (at least 32 characters) is required to sign pagination cursors. Database/auth setup is needed to change the channel in the admin dashboard. Restart or redeploy after setting variables.
3. Under Admin → Site Settings, set the YouTube channel to a canonical channel handle such as `https://www.youtube.com/@DictionCoaching` or a canonical `/channel/UC...` URL. Save the settings. Other URL shapes are not used to construct the feed. In an unconfigured/development preview the bundled channel is used.
4. Open the public Demo Classes page and check the first page and **Load more videos**. The server resolves the channel's uploads playlist, retrieves public uploads in pages, and filters out entries that the API marks private. YouTube may omit or restrict some videos, Shorts, live streams or embeds; unavailable or non-embeddable videos are controlled by YouTube. Cached data may be up to 30–60 minutes old, and viewers can always visit the channel directly. A failed request shows the selected sample (for the verified default channel) or a channel link; it is not silently labeled as the complete live list.

Requests use signed, channel-specific pagination cursors and server-side caching, but a public endpoint still needs platform-level rate limiting and quota monitoring before production. The integration has been tested against a local mock, not a real API key or channel account. A public-link request and playing an embed use third-party services. Verify content, rights, privacy/consent and local legal requirements before deployment. Manually published demo videos in Admin → Content are still displayed separately under Selected lessons.

---

## Related guides

- `DEPLOYMENT.md` — the step-by-step staging deployment checkpoint.
- `GO-LIVE.md` — the owner's production launch checklist.
- `OPERATIONS.md` — monthly backups, storage monitoring, recycle bin and handover.
- `RELEASE-READINESS.md` — the blockers that must be resolved before real use.
- `PRIVACY-DRAFT.md` — the unapproved privacy-policy draft.
