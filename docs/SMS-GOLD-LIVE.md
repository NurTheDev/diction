# SMS go-live — switching on the real BulkSMSBD gateway, safely

Written for the owner, to be followed in order, on the day the real provider is switched on.

**Nothing in this document has happened yet.** The provider is still `mock`: the app builds every
message, prices it, stores the rows and writes the history, but no HTTP call leaves the server and no
phone ever rings. It stays that way until you say otherwise — that is the standing rule, and it is the
reason `docs/R2-COVERAGE.md` §9 lists "the real provider" as owed rather than done.

Two gates have to be open before a single real message can go out, and they are independent:

| Gate | Where | What it does |
| --- | --- | --- |
| `SMS_PROVIDER=bulksmsbd` | environment | picks the real gateway instead of the mock |
| `CENTER_SMS_WRITE_ENABLED=true` | environment | allows the real HTTP call at all; while it is `false`, every send throws `SMS_DISABLED` before the network is touched |

Reading the balance is **not** gated — with credentials set, the Connection panel shows the live
balance even while sending is closed. That is deliberate: you can check the account is real and funded
before you allow anything to be sent.

---

## 1. Before you touch a variable

- [ ] `npm run verify` is green at the tip of the branch (see `docs/STATUS.md` §13 for the run id).
- [ ] You have done your own hand test **on mock** and approved it: opened the dialog from the overdue
      list, a student profile, the bulk selection, the payment success screen and the SMS page, and
      read the preview before sending each time.
- [ ] You know how much you are willing to spend. The SMS page shows the unit cost you set, the
      segments per message and this month's stored cost. Bangla text is sent as unicode, so a message
      is **67 characters per segment**, not 160 — a three-line Bangla reminder is 3 segments and costs
      three times one.
- [ ] Quiet hours are set to what you actually want (SMS page → settings). Inside the window a send is
      stored as `queued` with a `scheduledFor` time and goes out later; nothing is lost, but nothing
      arrives at 2 a.m. either.
- [ ] The three auto-send toggles are still **off**. Switch them on one at a time, later, in §7.

---

## 2. Environment variables

Set these in Vercel → Project → Settings → Environment Variables, for **Production** (and Preview if
you want to test there). Every one of them is server-only: the API key and the sender id are never
logged, never stored in a database row, never returned to the browser, and `redactSmsSecrets()` scrubs
them out of any error text before an operator can read it.

| Variable | Go-live value | Notes |
| --- | --- | --- |
| `SMS_PROVIDER` | `bulksmsbd` | `mock` = nothing is sent. This is the switch. |
| `CENTER_SMS_WRITE_ENABLED` | `true` | The second gate. `false` = every real send refuses with `SMS_DISABLED`. |
| `BULKSMSBD_API_KEY` | your key | From the BulkSMSBD dashboard. Treat it like a password. |
| `BULKSMSBD_SENDER_ID` | your approved sender id | Must match the account **exactly**, including case and spaces. |
| `CRON_SECRET` | already set | `openssl rand -base64 32`, at least 32 characters; the scheduled jobs refuse without it. |
| `SMS_MOCK_BALANCE` | leave unset | Only read by the mock provider (default `9999`). Irrelevant once you are live. |

After changing them, **redeploy** (Vercel only applies environment changes to a new deployment) and
then read the SMS page's Connection panel: প্রদানকারী should say `bulksmsbd`, ক্রেডেনশিয়াল should say
`সেট করা আছে`, পাঠানোর গেট should say `CENTER_SMS_WRITE_ENABLED=true`, and ব্যালেন্স should show a
number instead of `পড়া যায়নি`. If credentials are missing the panel names exactly which variable is
absent — it never shows a value.

---

## 3. The BulkSMSBD account, step by step

1. Register or sign in at `bulksmsbd.net`.
2. Buy a package. Note whether it is **masking** (a named sender id) or **non-masking** (a plain
   number) — the two behave differently, see §4.
3. Copy the **API key** from the dashboard into `BULKSMSBD_API_KEY`.
4. Confirm your **sender id** is approved and active on the account, and copy it character for
   character into `BULKSMSBD_SENDER_ID`.
5. **Turn IP whitelisting OFF** (dashboard → API/security settings; if you cannot find it, ask their
   support to remove the whitelist on your API key).

   This is the step that silently breaks everything on a serverless host. The app runs on Vercel, whose
   outbound IP addresses change between deployments and between regions, so an IP whitelist can never
   be kept current. With whitelisting on, every send is answered with code **`1032` — এই আইপি
   হোয়াইটলিস্টে নেই** ("this IP is not whitelisted"), and the app will faithfully report `1032` for
   every message. If you would rather keep the whitelist, you must add every Vercel egress IP and
   re-add them after each infrastructure change; for a coaching centre that is the worse trade.
6. Check the account is **verified** — an unverified account answers `1031`.
7. Send one test message from their own dashboard, to your own number, so you know the account works
   before you blame the app.

The codes you are most likely to meet, in the gateway's own Bangla (the app shows these verbatim):

| Code | Meaning | First thing to check |
| --- | --- | --- |
| `202` | জমা হয়েছে — accepted for sending | Nothing. See §8 for what it does **not** mean. |
| `1001` | নম্বরটি সঠিক নয় | The number in the student record. |
| `1002` | সেন্ডার আইডি সঠিক নয় বা বন্ধ আছে | `BULKSMSBD_SENDER_ID` against the dashboard. |
| `1007` | ব্যালেন্স অপর্যাপ্ত | Top up. This is the one that will happen eventually. |
| `1012` | মাস্কিং এসএমএস অবশ্যই বাংলায় হতে হবে | A masking id with an English-only body. |
| `1013`/`1015` | গেটওয়ে পাওয়া যায়নি / সক্রিয় গেটওয়ে নেই | The sender id is not attached to your key. |
| `1031` | অ্যাকাউন্ট যাচাই হয়নি | Verify the account. |
| `1032` | এই আইপি হোয়াইটলিস্টে নেই | §3 step 5. |

All twenty codes the gateway documents are in `src/lib/center/sms-provider.ts` (`SMS_CODE_MESSAGES`),
each already in Bangla, so the app never paraphrases the provider.

---

## 4. Sender ID notes

- The id in the environment must be **identical** to the one on the account. A trailing space or a
  different case answers `1002` or `1013`; there is no fuzzy matching, on purpose.
- A **masking** id shows your centre's name instead of a number, and the gateway requires the body to
  be Bangla (`1012` otherwise). Every template in this app is Bangla-first, so this is normally a
  non-issue — but the free-form **নতুন বার্তা** and **custom** paths let an operator type English, and
  that would be refused by the gateway, not by the app.
- A **non-masking** package sends from a plain number; guardians cannot tell it is you from the sender
  line, which is why every template starts with `ডিকশন কোচিং:`.
- Changing the sender id later is an environment change plus a redeploy. No code, no database row and
  no template mentions it.
- The id is never rendered in the admin UI. The panel says `সেট করা আছে` / `অনুপস্থিত` and nothing more.

---

## 5. The one-message test — to your own number only

Exactly one message, to your own number, from the SMS page's **পরীক্ষামূলক এসএমএস** (Test message)
panel. That path cannot reach a student: it takes a single number, sends one message with the fixed
body `ডিকশন কোচিং: এসএমএস সংযোগ পরীক্ষা। যোগাযোগ: {institute_phone}`, stores it with
`templateKey:'test'` and audits it against you (`sms.test`).

- [ ] The **নিজের নম্বর** field is prefilled with the number on your own admin profile. Check it is
      yours, and that it is in the form `01XXXXXXXXX` (11 digits, starting `013`–`019`). A wrong number
      is refused before anything is sent: `নম্বরটি সঠিক নয় (০১XXXXXXXXX)`.
- [ ] Press **পরীক্ষা পাঠান**.
- [ ] A good answer is `পরীক্ষামূলক এসএমএস জমা হয়েছে` — "submitted", not "delivered" (§8).
- [ ] Your phone receives one message, from your sender id, in Bangla, with the institute number
      filled in.
- [ ] The History table on the same page shows one new row with `test`, your number, 1 segment and its
      cost.
- [ ] The live balance on the Connection panel went down by exactly one message.

If it fails, the message you get is the gateway's own Bangla sentence for its code — look it up in the
table in §3. Do not press the button again and again: each press is one paid message.

---

## 6. The order to switch on (do not skip steps)

1. **Credentials + gate, provider still mock.** Set the two `BULKSMSBD_*` variables and
   `CENTER_SMS_WRITE_ENABLED=true`, leave `SMS_PROVIDER=mock`, redeploy. The Connection panel should
   show provider `mock` with the badge `কিছু পাঠানো হয় না`, credentials `সেট করা আছে`, and a **real**
   balance (the balance call is not gated). This proves the account without spending a message on the
   app's path.
2. **Provider live.** Set `SMS_PROVIDER=bulksmsbd`, redeploy, and do §5 — one message, your number.
3. **Quiet hours first, auto-sends second.** Set the quiet window before any toggle, so the first
   automatic send cannot go out at a bad hour.
4. **One toggle at a time**, each watched for a full day before the next:
   - `autoReceipt` — a receipt message after a payment is recorded. Lowest risk, highest value.
   - `autoResult` — a result message when an exam is published.
   - `autoDue` — overdue reminders, and only on the day of the month you set in `autoDueDay`. It acts
     on at most 200 active class groups, one class at a time, and never catches up on a missed day.
5. **Watch the new "স্বয়ংক্রিয় এসএমএস সমস্যা" (Automatic SMS problems) card** on the SMS page and on
   the Overview. Empty means nothing is wrong — the card renders nothing at all when there is nothing
   to report. When something is wrong it shows how many, the last failure in plain Bangla with the
   gateway's code, which receipt or class it was for, and a **Retry** button. See §9.

The two scheduled jobs, in Vercel time (UTC) and Dhaka time:

| Path | `vercel.json` | Dhaka | What it does |
| --- | --- | --- | --- |
| `/api/admin/jobs/daily` | `0 19 * * *` | 01:00 | Recycle Bin purge, log trim, `autoDue` if today is the day, then the queued-message flush |
| `/api/admin/jobs/sms-flush` | `5 1 * * *` | 07:05 | Sends up to 50 batches whose quiet window has ended |

Both need `CRON_SECRET`. Until R7, a **real** Vercel cron firing in production is still owed and
untested (`docs/R2-COVERAGE.md` §9) — the jobs themselves are proven by CI when called directly.

---

## 7. Auto-send and money: the rule that never changes

The three automatic sends are **best effort**. A payment is saved first, and the message is attempted
afterwards; if the message cannot go out, the payment stays saved, the operator sees no error, and the
failure is recorded as a problem to look at instead. Same for a published exam result. That rule is
why a failure used to be invisible, and it is why the problems card exists.

So after go-live, a red card is not "the payment broke". It is "the payment is fine and the SMS did not
go out" — and the card says exactly that, in Bangla, in so many words.

---

## 8. What `202` means, and what it does not

`202` is the gateway's answer for **জমা হয়েছে (প্রেরণ নিশ্চিত নয়)** — "submitted, delivery not
confirmed". Concretely:

- It **does** mean: the request was accepted, the account and sender id were usable, the balance was
  there, and the message is now the gateway's responsibility.
- It does **not** mean: the phone received it, that it was readable, that it was read, or that the
  number belongs to the guardian you meant.
- A switched-off phone, a number that was recycled, or a handset out of coverage all still answer
  `202`.
- **There is no delivery-receipt (DLR) callback wired into this app**, and the gateway is not asked
  again later. The app therefore can never learn delivery: the stored facts are `sent` (= submitted),
  `failed`, `skipped` (with a reason from a closed vocabulary) and `queued`. This is listed as owed in
  `docs/R2-COVERAGE.md` §9 and it is a real limit, not an oversight to be discovered later.
- Practical consequence: never tell a guardian "we sent it and it was delivered". Say "the reminder was
  submitted to the operator's SMS gateway at this time". If a payment dispute ever rests on an SMS, the
  evidence is the stored batch, its rows, the code and the timestamp — not a delivery confirmation.
- A code other than `202` (`1xxx`) means the gateway refused it, and the app stores the code and its
  Bangla meaning on the row. Only `1005` (their internal error) is retried once automatically; an
  `unknown` answer is never retried by itself, because retrying something that may already have gone
  out is how a guardian gets the same message twice.

---

## 9. Reading the "Automatic SMS problems" card

- It appears at the top of the SMS page and on the admin Overview, and **only** when at least one
  automatic send is open and unresolved. A healthy centre never sees it.
- Each row says which automatic send it was (স্বয়ংক্রিয় পেমেন্ট রসিদ / বকেয়া স্মারক / পরীক্ষার
  ফলাফল), what it was for (a receipt number and student, or a class), why it failed in one Bangla
  sentence, when it was last tried, and how many times.
- **রিট্রাই** re-sends only what is missing: if a batch exists, only its failed rows go out again; if no
  batch was ever created (the balance call itself failed, for example), the whole automatic send runs
  again under a fresh request id, because the old one is spent and idempotency would otherwise answer
  with the failed batch. Either way the row is closed against your user id and the retry is audited
  (`sms.autoretry`), since on the real provider it spends money.
- Retrying a problem that is already closed says so and sends nothing.
- These are **not** problems, and will never appear on the card: a toggle that is off, a class with
  nobody overdue, and a message queued for quiet hours. Those are the system working.
- The card never shows a credential and never shows a stack trace: an error containing your API key is
  scrubbed to `***` before the sentence is written.

---

## 10. Going back to mock, and stopping everything

**Back to mock** — one variable, no code change:

```diff
- SMS_PROVIDER=bulksmsbd
+ SMS_PROVIDER=mock
```

Redeploy. From then on: no HTTP call leaves the app; every send is logged on the server as
`Sent (mock) to <number>: <first 80 characters>`; the balance shown is `SMS_MOCK_BALANCE` (default
`9999`); batches, log rows, segments, cost and history are all still written exactly as before, so the
admin screens keep working and your history is not lost. Credentials may stay set — the mock provider
never reads them. This is also the state to be in for any future CI run or hand test.

**Stop everything immediately** — the emergency brake:

```diff
- CENTER_SMS_WRITE_ENABLED=true
+ CENTER_SMS_WRITE_ENABLED=false
```

Every real send now refuses with `SMS_DISABLED` before touching the network, including the test
message. Note the consequence: if an auto-send toggle is still on, each refused automatic send is
recorded as a problem, so the card will fill up with `পাঠানোর গেট বন্ধ — CENTER_SMS_WRITE_ENABLED=true
নয়।` That is the card doing its job — it is telling you the truth about messages that did not go out.
Turn the three toggles off as well if you want silence rather than a list.

Nothing is deleted by either change, and no payment or result is touched.

---

## 11. The two minutes a day, after go-live

1. SMS page → is the **Automatic SMS problems** card absent? If it is there, read the sentence and press
   **রিট্রাই** once. If the same problem comes back with a code, look the code up in §3 and fix the
   account, not the app.
2. Connection panel → provider `bulksmsbd`, credentials configured, gate open, balance sane.
3. **এই মাসে** → messages and stored cost against what you expected.
4. History → the last rows are the messages you believe were sent, with 1–3 segments each and a code of
   `202`.
5. If a guardian says "I got three of the same message", check the batch's `requestId` and the 24-hour
   duplicate warning before changing anything: one `requestId` cannot send twice, and a repeated
   template for the same student and month inside 24 hours is flagged in the dialog before you send.

---

## 12. Still owed, in writing

| Item | Status |
| --- | --- |
| The real provider itself | Off until you approve the mock version after your hand test — then exactly one message, to your own number (§5). |
| Delivery receipts (DLR) | Not wired. `202` is always "submitted" (§8). |
| A real Vercel cron firing in production | R7 go-live item; the job bodies are proven by CI, the scheduler is not. |
| Visitors and Teacher CV entry points | R3 / R4 — the templates exist (`visitor_thanks`, `teacher_opening`), the screens do not. |
| `pending_reminder` in the template picker | Deliberately excluded; the template is stored and off. |

Tags `r0-verified`, `r1-verified` and `r2-verified` are created only when you ask for them, after your
hand test.
