# Staging deployment guide (Step 4 checkpoint)

Plain-English instructions for putting this build on a real staging site: a free MongoDB Atlas
cluster, a Vercel project, two scheduled jobs and the Bangladeshi SMS gateway. Read it top to bottom
once; after that, §9 is the ten-line checklist you run from a phone every time you redeploy.

**Nothing in this document deploys anything by itself.** It is the operator's script. Every command
here is run by a person, in the order written, against accounts that person controls.

State of the build being deployed: R0–R3 verified, `npm run verify` reporting
`## Result: **PASS** — 45 PASS, 0 FAIL, 0 NOT TESTED` under `VERIFY_STRICT=1`, tagged
`r1-verified`. The Bangla/English interface vocabulary is single-sourced: a walk of all 451 files in
`src/` finds no Bangla interface line outside a marker that carries its reason in writing.

---

## 0. What you need before you start

| Thing | Why | Time |
| --- | --- | --- |
| A GitHub account with this repository pushed to it | Vercel deploys from the repository | — |
| A Vercel account (Hobby is enough) | Hosting, preview URLs and the two cron jobs | 5 min |
| A MongoDB Atlas account (free tier) | The database; the M0 cluster is free forever | 10 min |
| A BulkSMSBD account with a little balance | Real SMS; keep `SMS_PROVIDER=mock` until §9 passes | 10 min |
| Node.js 22.13 or newer on your own machine | To run the seed script and the verification harness | — |
| A phone with mobile data (not the office Wi-Fi) | The smoke checklist in §9 | — |

Optional: a Cloudinary account (media library uploads), a Resend account (password-reset email), a
Gemini/OpenAI-compatible key (Study Buddy and the public assistant). All three ship **off**.

---

## 1. MongoDB Atlas — free M0 cluster

1. In Atlas, create a project (for example `diction-staging`) and then **Build a Database** →
   **M0 Free**.
2. Choose the cloud region that matches the Vercel function region you will pick in §3:
   **Singapore (`ap-southeast-1`)** if you will use `sin1`, or **Mumbai (`ap-south-1`)** if you will
   use `bom1`. Same continent means the admin pages do not pay 100–200 ms per query.
3. Provider stays AWS or GCP — both are fine on M0. Do not enable Atlas Search or Data Explorer
   add-ons; you do not need them and the free tier does not include them.
4. An M0 cluster is a three-node **replica set**, which is what this app needs: fee collection, the
   visitor import and the hand-offs run inside transactions, and transactions require a replica set.
   You can confirm later with `db.hello()` in Atlas Data Explorer — the answer contains a `setName`.
5. **Database user.** When Atlas asks, choose *Authentication method: Password* and create a
   dedicated user, for example `diction_app`, with a long random password. Under *Built-in Role*
   choose **Custom Role → readWrite** limited to the single database `dictioncoaching`. Do **not**
   give it *Atlas admin*, *readWriteAnyDatabase* or *Backup*. The app only ever writes to its own
   database, and a leaked staging credential should not be able to read anything else.
6. **Network Access.** Add an IP entry for your own machine so you can run the seed (Atlas shows your
   current IP with an *Add My Current IP Address* button). Then add **`0.0.0.0/0`** (*Allow access
   from anywhere*).
   Why the open entry is unavoidable here: Vercel serverless functions leave from a pool of dynamic
   IP addresses, so there is no fixed address to allow. Static egress IPs are a paid Vercel feature;
   on the free tier the choice is `0.0.0.0/0` with a strong, least-privilege credential, or no
   database connection at all. The staging database must therefore never hold real student or
   guardian data (§11).
7. **Connection string.** Click *Connect → Drivers* and copy the SRV string. It looks like
   `mongodb+srv://diction_app:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`.
   Put the database name in the path — `.../dictioncoaching?retryWrites=true&w=majority` — and
   **URL-encode the password** (a `@`, `#`, `/`, `%` or `:` in a password silently breaks the URI;
   `@` becomes `%40`, and so on). This string is the value of `MONGODB_URI`.
   The app selects the `dictioncoaching` database itself, and switches to `dictioncoaching_test`
   when `CENTER_DATA_MODE=test`, so a wrong path in the URI is not fatal — a wrong password is.
8. **Backups.** The M0 tier has no continuous backup. Before any risky operation, take a dump from
   your own machine:
   `mongodump --uri="mongodb+srv://diction_app:<password>@cluster0.xxxxx.mongodb.net/dictioncoaching"`.
   Restore with `mongorestore --uri="…/dictioncoaching" dump/`. Free tier storage is 512 MB, which
   is far more than a staging site of synthetic records needs.

---

## 2. Environment variables

The complete template is **`.env.example`** in the repository root: copy it, fill it in, and never
commit the filled copy (`.env.local` is git-ignored). Every variable is described there in the order
you need it. The short version:

**Required before the site will start**

| Variable | Value | Notes |
| --- | --- | --- |
| `MONGODB_URI` | the SRV string from §1.7 | password URL-encoded |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` | at least 32 characters; rotating it signs everybody out |
| `NEXTAUTH_URL` | `https://<your-project>.vercel.app` | exact public origin, no path, no trailing slash |
| `AUTH_URL` | same value as `NEXTAUTH_URL` | Auth.js v5 reads this one; a mismatch fails startup validation |
| `CRON_SECRET` | `openssl rand -base64 32` | must be **32 characters or more**, or both jobs answer 401 (§4) |
| `CENTER_DATA_MODE` | `production` | `test` switches to the `_test` database and paints a test-mode banner |

**Shipping off on purpose — leave them off on staging**

`DATA_COLLECTION_ENABLED=false`, `SMS_PROVIDER=mock`, `CENTER_SMS_WRITE_ENABLED=false`,
`PASSWORD_RESET_ENABLED=false`, `ACHIEVEMENTS_ENABLED=false`, `PUBLIC_AI_ENABLED=false`,
`AI_STUDY_BUDDY_ENABLED=false`, `CENTER_LEGACY_LINK_ENABLED=false`,
`CENTER_DUE_SNAPSHOT_WRITE_ENABLED=false`, `CENTER_EXAM_WRITE_ENABLED=false`. Each one is a gate that
a person opens deliberately, in writing, after the review named beside it in `.env.example`.

**Only used by the seed, not by the deployed site:** `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`
(12–72 bytes). Set them in your local `.env.local`, run the seed (§7), and do not add them to Vercel.

**Never set on Vercel** (test harness only): `VERIFY_STRICT`, `DICTION_TEST_BUILD`,
`TEST_MODE_PORT`, `INTEGRATION_TEST_ROOT`, `PREVIEW_WITHOUT_SERVICES`, `SMS_MOCK_BALANCE`,
`MONGOMS_DOWNLOAD_IGNORE_MISSING_HEADER`.

Rules that apply to every value: no secret is ever prefixed `NEXT_PUBLIC_`, no secret is committed,
pasted into an issue, or typed into chat. Preview and Production get **different** secrets and
**different** databases — a preview deployment that shares the production database will write to it.

---

## 3. Vercel project

1. **Import** the repository (Vercel → *Add New… → Project*). Framework Preset: **Next.js**
   (auto-detected).
2. **Build settings** — leave the defaults, which for this repository are:
   - Build Command: `npm run build` (that is `next build`);
   - Output Directory: default (`.next`);
   - Install Command: leave empty so Vercel installs from `package-lock.json`;
   - **Node.js Version: 22.x** (Project Settings → General). `package.json` requires `>=22.13.0`.
   `serverActions.bodySizeLimit` is already raised to 3 MB in `next.config.ts`, which is what the
   workbook and visitor-sheet uploads need; nothing to set in the dashboard.
3. **Function Region** — Project Settings → General → *Function Region*: **Singapore (`sin1`)** or
   **Mumbai (`bom1`)**, matching the Atlas region from §1.2. Do not add a `regions` array to
   `vercel.json`; the dashboard setting is what applies to serverless functions here, and
   `vercel.json` in this repository carries the cron schedule only.
4. **Environment variables** — Project Settings → Environment Variables. Paste each value from §2
   for **Production** *and* **Preview** (tick both), marking the five secrets as *Sensitive* so they
   cannot be read back in the dashboard. `NEXTAUTH_URL`/`AUTH_URL` differ per environment: Production
   gets the real domain, Preview gets the preview URL. Adding or changing a variable needs a
   **redeploy** to take effect.
5. **Deployment Protection** — Project Settings → Deployment Protection. For a staging site you want
   to reach with a phone and with cron, turn **Vercel Authentication off for Preview deployments**
   (or protect only the `*.vercel.app` domain you will not use). If it is left on, every request —
   including Vercel's own cron call — is met by a login wall and §4 and §9 will both look broken.
6. Deploy. The first build takes a few minutes. Then read the deployment's *Functions* tab: the two
   API routes `/api/admin/jobs/daily` and `/api/admin/jobs/sms-flush` should appear as serverless
   functions.

---

## 4. Scheduled jobs (Vercel Cron)

`vercel.json` already ships both entries — nothing to configure except the secret:

```json
{
  "crons": [
    { "path": "/api/admin/jobs/daily",     "schedule": "0 19 * * *" },
    { "path": "/api/admin/jobs/sms-flush", "schedule": "5 1 * * *"  }
  ]
}
```

Vercel's schedules are **UTC**. In Dhaka time (UTC+6) that is:

| Job | UTC | Asia/Dhaka | What it does |
| --- | --- | --- | --- |
| `/api/admin/jobs/daily` | 19:00 | **01:00** | Purges Recycle Bin rows whose 30 days are up (Cloudinary assets first), trims SMS and activity logs older than 12 months, sends the automatic due reminder when that toggle is on, and flushes queued SMS |
| `/api/admin/jobs/sms-flush` | 01:05 | **07:05** | Sends the batches that quiet hours queued, once the quiet window has closed |

Both are `force-dynamic` with `maxDuration = 60`, so they are never cached and have room to destroy
media before purging a row.

**Authentication.** Both routes require the header `Authorization: Bearer <CRON_SECRET>` and refuse
with **401** when the secret is missing, shorter than **32 characters**, wrong, or sent with any
other scheme. Vercel adds that header automatically on every cron call **if `CRON_SECRET` is set as
an environment variable** — that is the whole integration; there is nothing else to wire.

**Plan limits.** On the Hobby plan Vercel allows **2 cron jobs, each firing at most once per day**,
and fires them on a best-effort schedule (a job can run up to an hour late). Both entries here are
exactly that: two jobs, once a day each. If you ever add a third job or an hourly schedule, the
project needs the Pro plan.

**Check it by hand** (from any machine, or a phone browser for the first one):

```sh
# 1. No secret: must answer 401 and touch nothing.
curl -i https://<your-project>.vercel.app/api/admin/jobs/daily

# 2. The real secret: must answer 200 with a JSON report.
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://<your-project>.vercel.app/api/admin/jobs/daily
```

A 200 body looks like `{"purged":{…},"trim":{…},"sms":{…}}`. In the Vercel dashboard,
Project → *Settings → Cron Jobs* lists both jobs with their last run; the *Observability /
Runtime Logs* tab shows the request. The app also writes its own row: open `/bn/admin/audit` and look
for the job's activity entries.

---

## 5. BulkSMSBD — the SMS gateway

The SMS layer is finished and settled (R2): three documented endpoints (`smsapi` for one message,
`smsapimany` for different messages to different numbers, `getBalanceApi` for the live balance),
`type=unicode` for Bangla and `text` for ASCII, a two-attempt retry that only ever repeats a request
that provably never reached the provider, quiet hours that queue instead of waking a parent, and a
key that is validated, redacted and never returned to a browser or a log line.

1. Create the account, buy a small balance, and copy the **API key** and the approved **sender id**
   into `BULKSMSBD_API_KEY` and `BULKSMSBD_SENDER_ID`.
2. **Turn IP whitelisting OFF** in the BulkSMSBD dashboard (account/security settings; it may be
   labelled *IP Restriction* or *Whitelist IP*). This is the single most common staging failure:
   Vercel functions leave from dynamic addresses, so a whitelisted-IP account rejects every request
   from the deployed site with an authentication-style response code while the same key works
   perfectly from your laptop. There is nothing to fix in the app — the whitelist is on the
   provider's side.
3. Deploy with `SMS_PROVIDER=mock` and `CENTER_SMS_WRITE_ENABLED=false` first. Mock sends nothing
   and records *Sent (mock)*, so the whole operator flow can be rehearsed for free.
4. Then, on the deployed staging site, open **`/bn/admin/sms`** and read the **Connection** card:
   provider, credentials *configured*, sending gate, and the **live Balance**. That balance is read
   from the deployed function through `getBalanceApi`, so a number appearing there is the proof that
   BulkSMSBD accepts requests from Vercel. If it says *could not be read* with a `10xx` code, the
   whitelist is still on or the key is wrong; the page shows the code, never the key.
5. Only then set `SMS_PROVIDER=bulksmsbd` and `CENTER_SMS_WRITE_ENABLED=true`, redeploy, and send one
   test message **to your own number**. Read the log row: status (`Sent`, `Failed`, `Skipped`,
   `Queued`, `Partial`), segments and cost. Cost is stored on every row, so changing the unit cost
   later never rewrites history — that is why the Cost column and the unit-cost field are separate.
6. Automatic sending stays off: *Auto-send*, *Receipt after a payment*, *After results are
   published* and *Due reminder on the chosen day* are four switches on the SMS settings panel, each
   of which can spend real money. Leave them off until R7.

---

## 6. Middleware and locale routing — the check that cron survives

Next.js 16 calls the middleware file `proxy.ts`. This repository has **`src/proxy.ts` and
deliberately no `src/middleware.ts`**. Its matcher is:

```ts
export const config={matcher:['/','/(bn|en)/:path*','/((?!api|_next|.*\\..*).*)']};
```

Read plainly: the locale redirect applies to `/`, to anything already under `/bn` or `/en`, and to
any path that is **not** `api`, **not** `_next` and **not** a file name (no dot). Therefore:

- `/api/admin/jobs/daily` and `/api/admin/jobs/sms-flush` are **excluded** — cron is never redirected
  to `/bn` and never loses its `Authorization` header.
- Every other `/api/*` route is excluded the same way (webhooks, public assistant, study buddy).
- `/_next/*` assets and any URL with an extension (`.png`, `.webmanifest`, `.xml`, `.txt`) are
  excluded, so the manifest, the sitemap and the service worker are served as themselves.
- Everything else is redirected to a locale: routing is `localePrefix:'always'`,
  `defaultLocale:'bn'`, `localeDetection:false` — a visitor always sees an explicit `/bn` or `/en`
  address, and the site never guesses from a browser header.

Confirm on the deployed site (a phone browser works for all three):

```sh
curl -sI https://<host>/            # 307 → /bn
curl -sI https://<host>/en          # 200, English page
curl -si https://<host>/api/admin/jobs/daily | head -1   # HTTP/2 401 — not a 307, not a login page
curl -sI https://<host>/sitemap.xml # 200, and no binned slug appears inside it
```

---

## 7. First data: seed and sign in

Run the seed from your own machine (it needs Atlas network access for your IP, §1.6):

```sh
cp .env.example .env.local      # then fill MONGODB_URI, NEXTAUTH_SECRET, NEXTAUTH_URL, AUTH_URL
npm install
npm run seed:check              # validates the bundled content; touches no database
# put SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (12–72 bytes) in .env.local, then:
node --env-file=.env.local --import tsx scripts/seed.ts
```

The seed creates the super-admin if that email does not exist, and inserts the missing bilingual
faculty, facilities, activities, FAQs and site settings by stable key. It never creates students,
outcomes, prices, bookings, phone numbers, notices or testimonials, and re-running it never
overwrites an existing account or password. Passwords are never printed.

Then sign in at `https://<host>/bn/login` and change that password immediately from the account
page. Create the roles you will actually use at `/bn/admin/roles` (superadmin, admin, staff,
content_editor, exam_manager) and disable whole roles you do not need at `/bn/admin/roles`.

---

## 8. Checks on the deployed staging site

Work through these once after the first deploy, in a desktop browser:

1. `/` redirects to `/bn`; the language switcher in the top bar reaches `/en` and back.
2. On `/en`, the header, sidebar, panel heads, headings and pager carry no Bangla word and no Bangla
   digit. On `/bn` they do. (This is the same rule the CI sweep proves on 39 mounted operator
   screens, twice each, once per address.)
3. `/bn/admin` loads the Overview; `/bn/admin/roles`, `/bn/admin/audit` and `/bn/admin/ai` are
   reachable as super admin and refused for a `content_editor` or `exam_manager` account.
4. `/bn/admin/recycle-bin` lists nothing on a fresh database; delete a synthetic row somewhere and
   it appears there with days left, restores, and *Delete forever* demands the typed name.
5. `/bn/admin/sms` shows the Connection card and an empty log (§5.4).
6. `/bn/admin/leads/import` opens the visitor import wizard; the labelled fake sample sheet
   (`tests/fixtures/Visitor-Import-FAKE-SAMPLE.xlsx`) previews, flags rows, commits and undoes.
7. `/sitemap.xml` and `/manifest.webmanifest` both return 200; the manifest is the Bangla brand block
   on purpose, in both locales.
8. Both cron URLs answer 401 in the browser and 200 with the bearer secret (§4).
9. The service worker installs over HTTPS and the public pages still work offline, without caching
   any signed-in page.
10. `/bn/admin/audit` shows the sign-in, the seed-time writes and the job runs.

---

## 9. Ten-line phone smoke checklist

Run this from a phone on **mobile data**, not office Wi-Fi, after every deploy. Ten lines, in order;
if a line fails, stop and fix it before the next.

1. Open `https://<host>/` → it lands on `/bn`, the home page paints, and nothing overflows the phone
   width (no sideways scrolling).
2. Tap the language switcher → `/en` shows the same page in English, with no Bangla word or Bangla
   digit in the header, menu or headings.
3. Open `/bn/admin` → you are sent to `/bn/login`; sign in as super admin and the Overview renders
   with its cards stacked, not cut off.
4. `/bn/admin/leads` → open one visitor row, set a follow-up day, see it saved; then use a hand-off
   (admission / trial / not interested) and watch it open prefilled or refuse with a plain sentence.
5. `/bn/admin/leads/import` → upload the labelled fake sample sheet, read the dry-run flags, commit,
   then tap *Undo last batch* and see the rows go.
6. `/bn/admin/students/collect` → take a fake payment on a synthetic student; the paysheet row and
   the due list both change, and the Bangla text is byte-identical to what CI proves.
7. `/bn/admin/sms` → the Connection card reads the **live balance** (proof BulkSMSBD accepts Vercel's
   address); with `SMS_PROVIDER=mock` send one test message to your own number and see *Sent (mock)*.
8. `/bn/admin/recycle-bin` → delete a synthetic row, watch the 10-second Undo toast, tap Undo, then
   delete it again and restore it from the bin.
9. Open `/api/admin/jobs/daily` in the phone browser → `{"error":"unauthorized"}`, with **no**
   redirect to `/bn` and no login page (§6).
10. Visit `/bn/admission`, `/bn/trial-class`, `/bn/blog` and `/bn/achievements` over mobile data →
    all four render, the PWA offers to install, and no private or signed-in data appears anywhere.

---

## 10. Troubleshooting

| Symptom | Usual cause | Fix |
| --- | --- | --- |
| Cron answers 401 even in the dashboard | `CRON_SECRET` shorter than 32 characters, or not set for that environment | Regenerate with `openssl rand -base64 32`, set it for Production *and* Preview, redeploy |
| Cron never appears to run | Vercel Authentication protecting preview deployments, or a third/hourly job on the Hobby plan | §3.5; keep to two daily jobs |
| `MongooseServerSelectionError` on cold start | Atlas Network Access missing `0.0.0.0/0`, or an un-encoded password character | §1.6 and §1.7 |
| Redirect loop on sign-in | `NEXTAUTH_URL`/`AUTH_URL` not equal to the exact public origin | Set both to the deployed origin, no path, no trailing slash |
| Everybody is signed out after a redeploy | `NEXTAUTH_SECRET` changed | Keep one secret per environment and do not rotate it casually |
| SMS returns a `10xx` code from the deployed site but works locally | IP whitelisting is ON at BulkSMSBD | Turn it off (§5.2) |
| Balance reads *could not be read* | Wrong key, no balance, or whitelist | Re-check §5.1–§5.2; the page shows the code, never the key |
| A test-mode banner is visible on staging | `CENTER_DATA_MODE=test` | Set `production` and redeploy |
| Sheet upload rejected | Body larger than the 3 MB server-action limit | Split the sheet; the limit is set in `next.config.ts` |
| A page shows Bangla while on `/en` | A hardcoded string that escaped the catalogs | It cannot come from `src/` today (the scan is a gate); check stored content in the database instead |

---

## 11. What staging must never be used for

Every data-collection, AI, achievement, password-reset and automatic-SMS flag ships **off** and
stays off. Staging holds synthetic records only: no real student names, no real guardian phone
numbers, no real payments. Real data collection is a decision for R7 (final deployment and
handover), after the privacy, retention, consent and cost reviews named in `README.md` and
`PRIVACY-DRAFT.md`. The 365-day purge with an anonymized ledger is R6 work and does not exist yet —
which is the second reason nothing real belongs on this site.

Related documents: `README.md` (what the build is and what is unfinished), the repository-root
`DEPLOYMENT.md` (operations and security posture, older and broader), `ATLAS-SETUP.md` (Bangla Atlas
walkthrough), `docs/VERIFY.md` (the one-command verification harness), `docs/STATUS.md` (what is
proven, requirement by requirement) and `docs/SMS-GOLD-LIVE.md` (the SMS layer's decisions).
