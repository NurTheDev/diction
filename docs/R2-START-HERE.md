# R2 — SMS (BulkSMSBD): what I click, what it costs, what is proven

R2 adds real messaging: a **Send reminder** button on the overdue list, an **এসএমএস** button on a
student profile, a **bulk SMS** action on the student list, a **রসিদ এসএমএস পাঠান** button on the
payment success screen, a **নতুন বার্তা** control on the SMS page, and one settings page that shows
the connection, the live balance, this month's stored cost, quiet hours and the three auto-send
toggles (all OFF until you switch one on).

Every one of those buttons opens the **same dialog** — one component, four steps — because a message
that costs money must always be previewed before it is sent.

Written confirmations, requirement by requirement, with the tests that prove them:
[`docs/R2-COVERAGE.md`](R2-COVERAGE.md).

---

## 1. The one command

```bash
npm ci
npm run verify
```

Expect, at the end:

```
=== PASS: 27 PASS, 0 FAIL, 0 NOT TESTED (of 27 requirements) ===
```

The nine R2 lines are:

| id | what it proves | how |
| --- | --- | --- |
| R2.1 | the provider contract: BulkSMSBD's three documented endpoints exactly, `type=unicode` for Bangla and `text` for ASCII, the many-to-many `88<number>,<message>` format, balance from text or JSON, **all** response codes in plain Bangla, and a key that is validated, redacted and never returned, logged or sent to the browser | `tests/sms-provider.test.ts` |
| R2.2 | the six default templates match the spec's Bangla bodies byte for byte, chips substitute without inventing values, an unknown chip stays visible | `tests/sms-templates.test.ts` |
| R2.3 | recipients: removed and opted-out never sent, held excluded from fee messages only, reasons for missing/invalid numbers, every accepted phone shape normalized to `01XXXXXXXXX`, siblings merged into one message with the summed total, 500 recipients in five chunks of 100 | `tests/sms-recipients.test.ts` |
| R2.4 | quiet hours: the midnight-crossing 21:00–07:00 default evaluated in Dhaka time, invalid/empty settings disable it, and the flush time is exact | `tests/sms-quiet.test.ts` |
| R2.5 | sending against the disposable database: 500 recipients in five batches without timeout, a repeated `requestId` sends nothing twice, every outcome is a durable row with its own segments and cost, 1005 retried once and 1007 not, retry-failed re-sends only failed rows, quiet hours queue until the flush, this month's totals are stored sums | `tests/sms-send.integration.ts` |
| R2.6 | the SMS centre in the browser: connection, balance, this month's cost, the settings form (auto-send stays OFF unless ticked), an invalid institute number refused, a test message to your own number only, a stored template edit, history filters, an explicit retry, no credential in the HTML, nothing overflowing at 360/1440, staff get nothing | `tests/sms-browser.integration.ts` |
| R2.7 | **the dialog itself**, in the browser, opened from all five screens R2 can reach: the four steps, skipped numbers with reasons, guardian/student/both, one-message-per-phone, all nine variable chips, the preview with characters/segments/cost/balance, one green send button that made a single request for two clicks, counts matching the stored rows | `tests/sms-dialog-browser.integration.ts` |
| R2.8 | the dialog's server contract: one guarded endpoint for preview/send/retry, a read-only preview, refused plans (empty body, unrendered chip), one `requestId` = one batch, "skip those" for the 24-hour duplicate rule, retry only for failed rows, quiet-hours queueing and the flush, the three auto-send toggles OFF by default and idempotent when on, malformed requests refused before anything is read | `tests/sms-dialog.integration.ts` |
| R2.9 | automatic-SMS problems: a refused receipt message leaves the saved payment untouched and shows up as one open problem in plain Bangla; repeats fold into one row that counts attempts; Retry re-sends only the failed rows, or runs the whole send again under a fresh request id when no batch exists; a class nobody is in and a queued reminder are not problems | `test:sms:problem` |

---

## 2. Turning the real provider on (do not do this before you have read section 4)

The full switch-on checklist — the BulkSMSBD account steps including IP whitelisting, the sender id
notes, the one test message to your own number, what `202` does and does not mean, and how to go back to
`mock` — is [`docs/SMS-GOLD-LIVE.md`](SMS-GOLD-LIVE.md). What follows is the short version.

`SMS_PROVIDER` defaults to `mock`. In mock mode **nothing is sent**: every message is logged, shown
as sent, and costs nothing. That is how R2 was built and proven.

To go live, set three environment variables — nothing else changes in the code:

```bash
SMS_PROVIDER=bulksmsbd
BULKSMSBD_API_KEY=<your key>
BULKSMSBD_SENDER_ID=<your approved sender id>
```

Placeholders are in `.env.example`. Both credentials are server-only: they are validated at startup,
never logged, never stored in a database row, and never sent to the browser (R2.1, R2.6, R2.8).
BulkSMSBD whitelists IP addresses, so a serverless host needs the whitelisting disabled in your
BulkSMSBD panel — otherwise every send answers `1032` ("আইপি হোয়াইটলিস্টে নেই"), which the SMS page
shows you in Bangla rather than pretending the message went out.

## 3. What an operator does, in order

1. **`/admin/sms` → Settings**: unit cost per SMS, quiet hours (default 21:00–07:00), institute
   phone (used by `{institute_phone}` in the templates), and the day of the month for automatic due
   reminders. Save.
2. **Templates**: the six default bodies are the spec's Bangla strings. Edit one and it is stored as
   an override marked *edited*; the shipped default is never deleted, and the chips are re-derived
   from your text.
3. **Test message**: sends one message to *your own* number (the phone on your user record) and logs
   it with no student and no batch. This is the safe way to see the real provider work.
4. **Send for real**: due list → *স্মারক পাঠান*, or a profile → *এসএমএস*, or tick students on the
   list, or the payment success screen → *রসিদ এসএমএস পাঠান*, or the SMS page → *নতুন বার্তা*.
   Four steps: who, what, preview, send. The green button is the only way to send, and it is
   disabled until the preview says the message is complete.
5. **Afterwards**: *ইতিহাস* filters by status/template/text; *ব্যাজ* offers **Retry failed** for a
   batch that has failures, and only re-sends those rows.

## 4. The rules the code enforces (so you do not have to remember them)

- A **removed** student is never contacted by any path, and never appears in a recipient list.
- `smsOptOut` (per student) means *do not contact*: skipped, with the reason recorded.
- A student **on hold** still receives messages that are not about fees; fee messages skip them.
- **Siblings** sharing a number get one message with the summed total — unless summing would make the
  text untrue, in which case the dialog says so and sends separately.
- **Quiet hours**: a send inside the window is stored as `queued` with the exact flush time; the
  flush job sends it when the window closes. "তবুও এখন পাঠান" is your explicit override.
- **Nothing is sent twice**: one `requestId` is one batch (unique index), so a double-click, a
  refreshed tab or a re-run daily job cannot double-send.
- **24-hour duplicate warning**: if the same template reached the same student for the same month in
  the last 24 hours, the dialog names them and offers "এদের বাদ দিন".
- A message with an **empty body** or an **unfilled chip** is refused (409) instead of going out with
  a hole in it.
- **Auto-send**: all three toggles ship OFF. When you switch one on: a receipt message after a saved
  payment, a result message when an exam is published, and due reminders on your chosen day from the
  daily job. Each is idempotent — the same receipt, exam or day can never produce a second message.

## 5. What R2 deliberately does not include

- **Visitors and Teacher CVs are not wired to the dialog yet.** The spec lists them as entry points,
  but their screens and models (`Lead`, `TeacherCandidate`) are R3 and R4 deliverables. The dialog is
  source-driven, so those milestones add a source kind in `src/lib/center/sms-source.ts` and render
  the same component; nothing in the dialog changes.
- **`pending_reminder`** (the spec's optional current-month PENDING reminder) is in the catalog and
  editable on the SMS page, but it is not offered in the dialog picker: the due list is DUE only, so
  nothing supplies the upcoming month's amount and due date yet. Shipping it as a template that could
  only skip everybody would be worse than saying so.
- **Delivery reports (DLR callbacks)** are not part of BulkSMSBD's documented send API, so a `202`
  is reported as *জমা হয়েছে* (submitted), never as *delivered*.
- **The real provider is still OFF.** Per the spec, it goes on only after you approve the mock
  version, and then exactly one test message to your own number.
