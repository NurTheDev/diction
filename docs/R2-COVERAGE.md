# R2 coverage confirmation — SMS (BulkSMSBD), in writing

Every sentence of `docs/SPEC.md` §R2, answered point by point with the file that implements it and
the test that proves it. Verify requirements **R2.1 – R2.8**; `npm run verify` reports all 26
requirements (R0 + R1 + R2).

Nothing below is a claim from reading code: each row names a test that runs in CI on every push.

| Suite | Runs as | Needs |
| --- | --- | --- |
| `tests/sms-provider.test.ts` | `test:sms:provider` (R2.1) | nothing but Node |
| `tests/sms-templates.test.ts` | `test:sms:templates` (R2.2) | nothing but Node |
| `tests/sms-recipients.test.ts` | `test:sms:recipients` (R2.3) | nothing but Node |
| `tests/sms-quiet.test.ts` | `test:sms:quiet` (R2.4) | nothing but Node |
| `tests/sms-send.integration.ts` | `test:sms:db` (R2.5) | disposable database |
| `tests/sms-browser.integration.ts` | browser suite (R2.6) | built app + database |
| `tests/sms-dialog-browser.integration.ts` | browser suite (R2.7) | built app + database |
| `tests/sms-dialog.integration.ts` | `test:sms:dialog` (R2.8) | disposable database |

---

## 1. Provider (`src/lib/center/sms-provider.ts`) — R2.1

Read from BulkSMSBD's current official documentation
(`https://bulksmsbd.com/bulksms-api-bangladesh.php`, fetched 2026-11-12) and implemented exactly:

| Spec | Implementation | Proved by |
| --- | --- | --- |
| endpoint | `https://bulksmsbd.net/api/smsapi` (single), `…/api/smsapimany` (many/different messages), `…/api/getBalanceApi` (balance) — asserted as exact strings | R2.1 |
| parameters | `api_key`, `senderid`, `number`, `message`, `type`; POST as `application/x-www-form-urlencoded` with URL-encoded values | R2.1 |
| Unicode for Bangla | `smsNeedsUnicode()` → `type=unicode` for any non-ASCII body, `type=text` otherwise | R2.1 |
| one-to-many | `number` is a comma-separated list of `8801XXXXXXXXX` | R2.1 |
| different messages | `messages` serialized as `88<number>,<message>;88<number>,<message>` | R2.1 |
| number format | `normalizePhone()` accepts `+880`, `880`, `01XXXXXXXXX`, `1XXXXXXXXX`, Bangla digits and whitespace, rejects letters, and returns `01[3-9]\d{8}`; the provider prefixes `88` | R2.1, R2.3 |
| balance | parsed from plain text and from JSON | R2.1 |
| **all** response codes in Bangla | `SMS_CODE_MESSAGES` maps every documented code — 202, 1001, 1002, 1003, 1005, 1006, 1007, 1011, 1012, 1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1031, 1032 — plus a fallback that echoes an unknown code and never claims success. 202 reads *জমা হয়েছে* (submitted), not delivered | R2.1 |
| 1007 / 1012 / 1032 specifically | *ব্যালান্স অপর্যাপ্ত*, *মাস্কিং এসএমএস বাংলায় পাঠাতে হয়*, *আইপি হোয়াইটলিস্টে নেই* | R2.1 |
| `SMS_PROVIDER=mock` default | `smsProviderName()` falls back to `mock`; the mock sends nothing, logs `Sent (mock) to <phone>: …` and answers 202 | R2.1 |
| credentials server-only | `redactSmsSecrets()` masks the key and the sender id; `validateSmsCredentials()` names the missing variable **without echoing its value**; no response, log row or audit row contains either | R2.1, R2.5, R2.6, R2.8 |
| startup validation, `.env.example` | both placeholders are documented in `.env.example` | R2.1 |

**"Verify with the provider" (segments).** BulkSMSBD's documentation does not publish a segment
table; the 70/67 split is the GSM UCS-2 rule for Unicode messages, which is what Bangla requires.
`estimateSms()` implements exactly that and is asserted both ways: a short Bangla body is **1**
segment, 140 Bangla characters are **3** segments (67 each). If the provider's own counter ever
disagrees, `smsUnitCost` and the stored per-row `segments` make the discrepancy visible in the
history rather than silent.

## 2. Templates (`src/lib/center/sms-templates.ts`) — R2.2

The six default bodies are the spec's strings **byte for byte** (`payment_receipt`, `due_reminder`,
`pending_reminder`, `visitor_thanks`, `teacher_opening`, plus `custom` and `notice` for free text),
and message content stays Bangla even on an English screen. `CenterSmsTemplate` rows override
`name`, `body.bn`, `variables` and `active` but never delete a default — `loadSmsTemplates()` reports
`edited:true` for an override. Chips substitute without inventing values; a known chip with no value
is reported as a skip (`missing_value`) rather than rendering a hole; an **unknown** chip stays
visible in the text and blocks the whole plan, because a typo affects every recipient identically.
When a chip no recipient can fill drops everybody — a `notice` with no subject — nothing is left to
send, so the endpoint refuses the send as `NO_RECIPIENTS` (409) and the preview it returns lists every
recipient as `missing_value` with both labels, which is what tells the operator to fill the field.
The variable set is exactly the spec's nine, and `SMS_VARIABLES` is the single source both the
renderer and the dialog's chips read.

`pending_reminder` is the spec's *optional, OFF* template: it stays in the catalog and is editable on
the SMS page, but `smsDialogData()` does not offer it in the picker, because the due list is DUE only
and nothing supplies the upcoming month's `{amount}`/`{due_date}` yet. Recorded as owed (§8).

## 3. Recipients (`src/lib/center/sms-recipients.ts`) — R2.3

| Rule | Behaviour |
| --- | --- |
| removed students | never contacted, and never listed — the dues source does not even load them (`status:'active'`), the class source excludes them (`status:{$ne:'removed'}`) |
| `smsOptOut` / do not contact | skipped with reason `opted_out` |
| held students | skipped for **fee** messages only; a non-fee message reaches them (`isHeldNow()` reads both `status:'on_hold'` and the `holds[]` periods covering the current Dhaka month) |
| missing / invalid numbers | `missing_phone` and `invalid_phone`, **exactly one reason per student** |
| normalization + dedupe | every accepted shape becomes `01[3-9]\d{8}`; identical bodies to one number collapse to `duplicate` |
| siblings | one message per phone with the summed total — the amount is parsed **digit-aware**, so a Bangla-digit value (`৩০০০`) is read and the total is written back in the same digits (`৪৫০০`); **refused** when the merged text could be untrue (differing months, differing classes, or a total that is not a number), and the dialog says so |
| batching | `chunkRecipients(500,100)` → five full chunks of 100 |

The skip vocabulary is closed (`SMS_SKIP_REASONS`) with Bangla and English labels in
`SMS_SKIP_LABELS`, so the dialog can show the operator's language without a second copy of the words.

## 4. Quiet hours (`src/lib/center/sms-quiet.ts`) — R2.4

`start < end ? cur >= start && cur < end : cur >= start || cur < end`, evaluated in Asia/Dhaka, so
the default 21:00–07:00 window crossing midnight works. Invalid or empty settings **disable** quiet
hours rather than blocking sends; `start === end` is an empty window (which is what the tests seed,
because CI runs at any Dhaka hour). `msUntilQuietEnds()` gives the exact flush time, stored on the
batch as `scheduledFor`.

## 5. Sending (`src/lib/center/sms-send.ts`) — R2.5

Batches of at most `SMS_BATCH_SIZE = 100`; **500 recipients go out in five batches in ~130 ms**
against the disposable database. Log rows are written with `insertMany`, one row per
(recipient, student) so a grouped sibling message stays traceable to every child, each carrying its
own `segments` and `cost` — so *this month's cost* is a stored sum, not a guess from today's unit
price. Idempotency is a unique **partial** index on `CenterSmsBatch.requestId`: a repeated key
returns the first batch (`status:'existing'`) and calls the provider no more, and an 11000 race
returns the winner. Only `1005` is auto-retried, exactly once; an `unknown` outcome is never
auto-retried (a timeout may have happened after submission), so the operator's explicit **Retry
failed** is the only other path, and it re-sends only that batch's failed rows. `monthSmsTotals()`
aggregates stored rows.

## 6. The SMS centre (`/[locale]/admin/sms`) — R2.6

Connection status (provider **name** and whether it is configured — never a credential), live
balance, this month's stored cost, the settings form (unit cost, quiet hours, institute phone,
auto-due day, three auto-send toggles that stay OFF unless ticked), *Send test SMS to my own number*
(the phone on your own user record; logged with no student and no batch), the editable templates with
derived chips and an *edited* badge, batches with an explicit **Retry failed**, and history with
status/template/text filters. Admin and super admin only: staff get no nav entry and no form. No
credential appears in the served HTML or in any field, and nothing overflows at 360 or 1440 px.

## 7. ONE reusable `SendSmsDialog` — R2.7 (browser) + R2.8 (contract)

`src/components/admin/send-sms-dialog.tsx` is the only compose surface. It is opened by
`SmsDialogHost` (server: loads the catalog and the institute phone) → `SmsDialogTrigger` (client:
button + dialog), and by the two client screens that already own their state.

| Spec entry point | Where | Request |
| --- | --- | --- |
| due list "Send reminder" | `admin/students/dues` panel head, shown only when the DUE list is non-empty | `{source:'dues',classGroup}` |
| student profile | `admin/students/[id]` heading | `{source:'student',id}` |
| student list bulk action | `CenterStudentList`: tick rows → "নির্বাচিত N জনকে এসএমএস" (a new search clears the selection) | `{source:'students',ids}` |
| payment success screen | `DailyCollection`'s success panel: "রসিদ এসএমএস পাঠান" | `{source:'receipt',receipt:{student,amount,month,receiptNo}}` |
| SMS page | "নতুন বার্তা": pick a class → every current student of it | `{source:'class',classGroup}` |
| Visitors, Teacher CVs | **not wired — R3/R4 own `Lead` and `TeacherCandidate`**; the dialog is source-driven, so those milestones add a source kind in `src/lib/center/sms-source.ts` and render this same component | — |

The four steps, as specified:

1. **Recipients** — a summary (numbers · messages · segments), a collapsible list of the messages
   that would go out, skipped numbers grouped by reason with both labels, the
   guardian / student / both choice, one-message-per-phone for siblings, the 24-hour duplicate
   warning naming the students with "এদের বাদ দিন", and a note when sibling grouping was refused.
2. **Message** — the template picker (with *edited* / *inactive* markers) or custom text, plus all
   nine variable chips; clicking a chip inserts it at the cursor and switches to custom. `{subject}`
   is the one value no source can know, so a subject field appears exactly when the chosen body uses
   it.
3. **Preview** — the first three messages verbatim, characters, messages, segments, estimated cost
   and balance side by side, a low-balance warning when the cost exceeds the balance, and the quiet
   hours notice with the "তবুও এখন পাঠান" override.
4. **Send** — **one** green button (`.sms-send`, the only one in the footer), progress while the
   request is in flight, then a result summary (sent / failed / skipped, or *queued* with the flush
   time, or *counted from the earlier send* when the `requestId` was already used) and **Retry
   failed** when — and only when — something failed.

Everything behind it is one guarded endpoint, `POST /api/admin/sms/send`, whose logic lives in
`src/lib/center/sms-dialog.ts` (`runSmsDialog`) so it is testable without a browser: session guard
(`getAdmin()` → admin/super admin), same-origin check, bounded JSON, rate limit on send and retry
only, request validation before anything is read, and then preview / send / retry. The preview is
read-only (no batch, no row, no provider call); a blocked plan is refused with 409; a send is
idempotent on `requestId`; `skipDuplicates` records why each dropped student was skipped; a retry
re-sends only failed rows and answers `NOTHING_TO_RETRY` when there are none.

**Double-click, proved twice:** in the browser, two clicks on the send button produced **one**
`mode:"send"` request (R2.7); at the contract level, the same `requestId` twice produced one batch,
the same rows and no second provider call, with `status:'existing'` (R2.8).

**"Send receipt SMS" is a button, not a checkbox — deliberately.** The spec calls it a toggle; a
checkbox that sent on save would bypass the preview, the cost check and the single green send button
that the same spec requires. The button opens the dialog pre-filled with that receipt (amount, month,
receipt number), and the *automatic* receipt is the `autoReceipt` settings toggle.

## 8. Auto-send and the scheduled jobs — R2.8

All three toggles ship **OFF** and are only read at send time:

- `autoReceipt` → `autoSendReceipt()` after a payment is saved (`src/actions/center-cash.ts`). Best
  effort: the payment is already saved, so a message that cannot go out never turns a saved receipt
  into an error. A replayed request is skipped.
- `autoResult` → `autoSendClassResults()` after `publishCenterExam()` (`src/actions/center-exams.ts`).
  Not a fee message, so held students are included; opted-out and removed never are.
- `autoDue` → `runAutoDue()` from the daily job, only when today in Asia/Dhaka **is** the operator's
  `autoDueDay` — a missed day never turns into a surprise bulk send on the next run. Every class is
  its own batch, and `skipDuplicates` is on.

Each uses `autoRequestId()`: a deterministic, UUID-shaped key derived from the natural key (receipt +
student, exam + class, class + day), because `CenterSmsBatch.requestId` is what makes an automatic
send idempotent. The daily job runs at 01:00 Asia/Dhaka, **inside** the default quiet window, so an
automatic reminder is queued there and goes out at 07:05 — the new flush job's schedule — instead of
waking a parent at one in the morning.

**New job:** `GET /api/admin/jobs/sms-flush` (bearer `CRON_SECRET`, same policy as the daily job)
calls `flushQueuedSms()`, which sends only batches whose `scheduledFor` has passed. `vercel.json`
schedules it at `5 1 * * *` (07:05 Asia/Dhaka). The daily job also flushes, so a batch is never
stranded if one schedule is missed.

## 9. What is owed, stated plainly

1. **Visitors and Teacher CVs** as dialog entry points — waiting on R3 (`Lead`) and R4
   (`TeacherCandidate`). Nothing in the dialog changes when they arrive.
2. **`pending_reminder` in the picker** — needs the optional "include current-month PENDING" switch
   on the due list, which needs the upcoming month's fee and due date per student.
3. **The real provider is still OFF.** Per the spec it goes on only after you approve the mock
   version, and then exactly one test message to your own number. BulkSMSBD IP whitelisting must be
   disabled for a serverless host first, or every send answers `1032`.
4. **A real Vercel cron run** (both entries) remains a go-live checklist item, as decided for R1.
5. **Delivery reports**: `202` means *submitted*. BulkSMSBD's documented API has no DLR callback, so
   the history never claims delivery.
