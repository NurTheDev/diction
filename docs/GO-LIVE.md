# Go-Live Checklist — production launch, step by step

Written for the owner, not for an engineer. Follow the sections in order on launch day; each one
ends with something you can see on the screen that proves it worked. The deeper engineering version
of every step lives in `docs/DEPLOYMENT.md`; this page only says what to do and what to look for.
Nothing here spends money until section 5 says so.

## a) The database and the first Super Admin

1. In MongoDB Atlas create a project (for example `diction-live`) and **Build a Database → M0
   Free**. Pick the region nearest Dhaka that matches the Vercel region you will choose in step b:
   **Singapore (`ap-southeast-1`)** or **Mumbai (`ap-south-1`)**. The region cannot be changed
   later — choose it once, carefully.
2. Create the database user (for example `diction_app`) with a long random password and the
   *readWrite* role limited to the `dictioncoaching` database only. Under **Network Access** add
   **`0.0.0.0/0`** (*Allow access from anywhere*): Vercel functions leave from changing addresses,
   so there is no fixed IP to whitelist. The safety net is the least-privilege user and the strong
   password, not an IP list.
3. Copy the SRV connection string, put `/dictioncoaching` in the path, and URL-encode the password
   (`@` becomes `%40`). This is `MONGODB_URI`.
4. **Bootstrap the first Super Admin** from your own machine, once: put `MONGODB_URI`,
   `SEED_ADMIN_EMAIL` (the owner's address) and `SEED_ADMIN_PASSWORD` (12–72 characters, generated,
   written nowhere else) into `.env.local`, then run

   ```bash
   npm ci && npm run seed
   ```

   The seed inserts only what is missing and prints how many records it added. Sign in locally once
   to prove the account works, then **delete the two `SEED_` lines** — they are a one-time key and
   must never live in Vercel.

*Proof:* the seed's printed counts, and one successful local sign-in as the owner.

## b) Vercel: import, environment, first deployment

1. In Vercel, **Add New → Project**, import this repository. The framework preset *Next.js* is
   detected automatically; keep the defaults.
2. Under **Settings → Environment Variables → Production**, enter exactly these (Preview gets its
   own database and its own secrets, or stays unused):
   `MONGODB_URI`, `NEXTAUTH_SECRET` (`openssl rand -base64 32`), `NEXTAUTH_URL` and `AUTH_URL` (the
   live origin, no trailing slash), `CRON_SECRET` (another `openssl rand -base64 32`),
   `CENTER_DATA_MODE=production`, `SMS_PROVIDER=mock`, `CENTER_SMS_WRITE_ENABLED=false`, and empty
   values for everything not yet used.
3. Deploy. Open the live site on your phone: the public homepage in Bangla, then `/en` in English,
   and the sign-in page. **No yellow test-mode banner may appear anywhere** — if it does,
   `CENTER_DATA_MODE` is not `production`.

*Proof:* homepage, English homepage and sign-in all load; no banner; signing in as the seeded Super
Admin reaches the Overview.

## c) The scheduled jobs (Vercel Cron)

1. Open **Project → Settings → Crons** (or the *Crons* panel). Both schedules from `vercel.json`
   must appear: `0 19 * * *` for `/api/admin/jobs/daily` (01:00 Asia/Dhaka — due-date snapshots,
   recycle-bin purge, 12-month log trim) and `5 1 * * *` for `/api/admin/jobs/sms-flush` (07:05
   Asia/Dhaka — the queued messages from quiet hours).
2. On the first night, read the daily run's log: it must answer `{"ok":true,…}` with the `purged`,
   `trim` and `proofMilestones` numbers you expect. The next morning read the flush run's
   `{"ok":true,"batches":…}`.
3. A quick manual proof any time: call the job URL with no secret — it must answer 401 and touch
   nothing.

*Proof:* both schedules visible in the panel; one `{"ok":true}` log each; 401 without the secret.

## d) Live SMS: connect and test before anything is automatic

1. In the BulkSMSBD dashboard **turn IP whitelisting OFF** (it may be labelled *IP Restriction*).
   Vercel has no fixed egress IP; with the whitelist on, every deployed request is refused while the
   same key works from your laptop. This is the single most common launch failure.
2. Set `SMS_PROVIDER=bulksmsbd`, keep `CENTER_SMS_WRITE_ENABLED=false`, redeploy. Open
   **`/bn/admin/sms`** and read the **Connection** card: provider, credentials *configured*, and the
   **live balance**. A number there is the gateway accepting Vercel; *could not be read* with a
   `10xx` code means the whitelist is still on or the key is wrong.
3. Set `CENTER_SMS_WRITE_ENABLED=true`, redeploy, and send **one test message to your own phone**.
   Read its log row: status, segments, cost.

*Proof:* balance number on the Connection card; one real SMS on the owner's phone; its log row.

## e) Progressive automatic-SMS rollout, and the emergency brake

Turn the four automatic switches on **one at a time, a week apart**, on the SMS settings panel, and
read the log each morning:

1. **Week 1 — receipt after a payment.** The smallest audience (one parent per payment) and the
   message the center most owes people.
2. **Week 2 — due reminder.** Choose the reminder day deliberately; watch that quiet hours queue
   instead of sending at midnight.
3. **Week 3 — exam result after publishing.** The largest burst; send one result to one class first.

**Emergency brake.** Turning a switch off stops new automatic sends immediately and costs nothing.
The hard brake — stopping *every* SMS including manual ones — is `CENTER_SMS_WRITE_ENABLED=false`
in Vercel plus a redeploy (two minutes); messages already queued wait, they do not vanish, and the
07:05 flush only sends what the gates allow. Decide in writing who may pull the brake: the owner,
and nobody else needs permission to pull it first and ask later.

*Proof:* each week, the log's automatic rows match the payments/reminders/results you expect, and the
balance falls by roughly the stored costs.

## f) Ten-line mobile smoke test (on the live site, from a phone)

1. Homepage loads in Bangla; the hero, notice and course cards read correctly.
2. Switch to English; every label changes and no Bangla remains in the chrome.
3. Sign in as Super Admin; the Overview shows the four counters and no test banner.
4. Open one student's ledger; assessments, payments and the outstanding due add up on screen.
5. Collect a Tk 10 test payment at the cash desk; the receipt number appears.
6. The receipt SMS log row reads *Sent* (or *Queued* inside quiet hours) with segments and cost.
7. Open **Reports → Daily**; the test payment is in today's total; export the CSV and open it.
8. Open **Reports → Receipt audit**; no duplicate or gap flags appear for the test receipts.
9. Delete the test payment into the Recycle Bin; it appears there with days left; restore it.
10. Open **Backup** (Super Admin only), download the JSON, and see the file open with the collections.

Then, on import day: take a **manual backup first** (`docs/OPERATIONS.md` §1), import the real data,
and **rotate any credential that ever appeared in a chat, screenshot or email**. Keep this page and
the `verify-output.zip` of the go-live commit together with the launch records.
