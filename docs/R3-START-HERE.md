# R3 — Visitor leads (ভিজিটর): what I click, what should happen, what is not there yet

R3 replaces the visitor spreadsheet. **Wave B2 is the screens**: a sidebar group **ভিজিটর** with
*Visitors* and *Follow-ups*, a list where every number is masked and dialable, quick-add that is one tap
away and saves on Enter, a detail drawer with a notes timeline, one search box that finds a lead by four
digits of a number, and a "today's follow-ups" widget on the Overview.

Written confirmations, requirement by requirement, with the tests that prove them:
[`docs/R3-COVERAGE.md`](R3-COVERAGE.md). Current state of every milestone:
[`docs/STATUS.md`](STATUS.md).

---

## 1. See it in ten minutes

```bash
npm ci
npm run verify          # everything, headless: 41 requirements, screenshots included
```

or by hand, against a disposable database that cannot touch real data:

```bash
npm run test-mode       # builds, seeds demo users, starts the app on http://localhost:3111
```

Sign in as `demo-admin@example.test` / `DemoOnly-2026!` (the test-mode banner stays on screen the whole
time, and the database is `dictioncoaching_test`). Then open **ভিজিটর → ভিজিটর** in the sidebar, or
`/bn/admin/leads` directly.

To run only this wave's browser suite against an already-running app:

```bash
TEST_ORIGIN=http://127.0.0.1:3111 TEST_MONGO_URI='mongodb://127.0.0.1:27017/dictioncoaching_test' \
  npm run test:lead:screens
```

It writes its screenshots into `screenshots/r3/`. To have CI commit them to the branch instead of only
into an artifact, dispatch the workflow with `publish_screenshots` (see
[`docs/VERIFY.md`](VERIFY.md#continuous-verification-github-actions)).

---

## 2. What an operator does, in order

1. **Somebody walks in.** Tap **নতুন ভিজিটর** (desktop, above the list) or the plus in the mobile
   bottom bar (it says **নতুন ভিজিটর** on this screen). Four fields: name, number, class, school. Type
   the class exactly as they said it — `XI`, `৯`, `New 9`, `SSC 25` are all read, and what cannot be
   read is kept as written with a doubt shown on the row, never guessed.
2. **Press Enter.** The lead is saved, the panel tells you the id it wrote (`V-2026-0007`), and it
   empties itself with the cursor back on the name — because the next person is already waiting. Two
   numbers in one box, separated by a comma, are stored as two.
3. **Call them.** Every row shows the number as a mask (`01712****90`) with **কল** and **হোয়াটসঅ্যাপ**
   beside it. Those two links are the only place a full number exists on these screens.
4. **Promise a follow-up.** On the row: **আজ · আগামীকাল · তিন দিন পরে · পরের সপ্তাহে**, or a date of
   your own, or **বাদ দিন** to take a promise away. The day is computed in Dhaka time by the server, so
   what you tap is what the nightly job will look for.
5. **Write down what happened.** **বিস্তারিত** opens the drawer: every field, the doubts, the notes
   timeline with who wrote what and when, and the rest of the family. Add a note and pick an outcome —
   সাড়া নেই / পরে কল করতে হবে / আগ্রহী / আগ্রহী নন.
6. **Change the status** with the dropdown on the row, then **সংরক্ষণ**. Choosing
   **যোগাযোগ করবেন না** also blocks contact, and it stays blocked when the status later moves on —
   lifting it is its own button (**যোগাযোগের অনুমতি ফিরিয়ে দিন**), because it puts a parent back on a
   calling list.
7. **Find somebody by number.** Tap **খুঁজুন** and type the number, or just its last four digits off a
   crumpled sheet — Bangla digits, `+88`, dashes and a missing leading zero all work. Fewer than four
   digits is not a search and the box says so ("অন্তত ৪ অঙ্ক লিখুন") instead of showing an empty list,
   because an empty list reads as *no such visitor* and that is the wrong answer to give a parent's
   name. Type a *name* in the same box and it becomes a link you can send to another admin; type a
   *number* and it never becomes a link at all.
8. **Work today's queue.** On the Overview, "আজকের ফলো-আপ" counts today and the overdue ones
   separately, and its rows carry the same buttons. The sidebar's **ফলো-আপ** item is the same queue as a
   full list, with a badge for how many are waiting.
9. **Thank them by SMS** (Admin only — see §4). Every row that may be texted has a checkbox in the
   **এসএমএস** column; one visitor's drawer has **এসএমএস পাঠান**. Tick the rows you mean, or tick
   **এই পৃষ্ঠার সবাইকে বাছুন**, and the button above the list says how many are in the send
   (**নির্বাচিত ২ জনকে এসএমএস**). It opens the same four-step dialog the fee reminders use, already on
   **ভিজিটর ধন্যবাদ**, with the center's own number in the body and no question about guardian or
   student — a visitor has one number, the first one written on the sheet. Read the preview, then send.
   The line above the list also tells you who is *not* in it: **১ জন বাদ — যোগাযোগ করবেন না** and
   **১ জনের নাম্বার নেই**. Those rows have no checkbox at all; the blocked one says **বাদ** and the one
   with no number says **নাম্বার নেই**, so nothing has to be remembered. Two visitors who share a number
   are one message, not two.

---

## 3. The rules the code enforces (so nobody has to remember them)

- **A number is never printed, never a link, never a log.** Screens get a mask plus `tel:`/`wa.me` —
  and a search answer carries no number either: the server action strips each hit's digits before the
  result crosses to the browser, so a screen cannot print what it was never given. The
  family key (which is a number with `fam:` in front), a phone as written, and a flagged cell's raw text
  are stripped before anything reaches the browser. A search by number is a form post, never a URL; a
  number pasted into the address bar is refused and the unfiltered list is shown instead.
- **Nothing is guessed.** A field nobody filled stays unknown: group and medium `unknown`, class empty,
  status `New`, no follow-up invented. A date that is not a real date (31 February) is refused, not
  rolled into March.
- **A promise is a day, not an instant.** `nextFollowUp` is a `YYYY-MM-DD` in Asia/Dhaka; "next week" is
  seven days, not "the next Monday".
- **Siblings stay together.** A new lead with a number somebody already holds *inherits* that family's
  key instead of starting a second family, and the panel says so when it happens.
- **Archiving is a suggestion.** A lead older than eighteen months can be suggested for archiving;
  nothing is ever deleted on its own, and a lead has no archive path in the Recycle Bin at all.
- **"যোগাযোগ করবেন না" means no SMS either.** The row offers no checkbox, the count above the list
  says how many were left out and why, and the sender checks the mark *again* when it builds the send —
  so a visitor blocked after the dialog was opened is still not texted. One message per number: a second
  number in the same cell is a sibling or a parent, not a second thank-you.
- **A number that is already on the list asks first (R3.10).** Type a number another visitor holds and
  quick-add stops instead of writing a second row: it names who holds the number, masked, and saves
  nothing until you choose — **ভাই-বোন হিসেবে যোগ করুন — একই পরিবার** (the new visitor joins that
  family), **…-এর লিডে মিলিয়ে দিন** (the entry folds into that lead: empty fields fill, an extra
  number and your note move in, no second row is written), or **আলাদা লিড হিসেবে রাখুন** (two strangers
  sharing one number, deliberately not one family). In a visitor's drawer, **এই নাম্বারটি আরও যেসব
  লিডে আছে** lists the mates outside the family with two buttons: **একই পরিবারে যুক্ত করুন** (both
  leads stay, one family) and **এই লিডে মিলিয়ে নিন** (that lead folds into this one and goes to the
  bin with its notes and numbers — the browser asks once to be sure).
- **Who can see this:** Admin and Staff. Teachers, content editors and exam managers have no sidebar
  item, no route and no action — the guard runs before anything is read.

---

## 4. What R3 deliberately does not include yet

- **SMS to visitors is built (R3.9) but has never sent a real message.** `SMS_PROVIDER` stays
  unset/mock, so pressing send writes the log and the cost and delivers nothing until the owner hands
  the real key over. That hand-over is the one step nobody has taken yet, on purpose.
- **What the front desk may send (R3.11, your decision of 2026-11-12).** A staff account gets the
  visitor picker and the drawer's **এসএমএস পাঠান**, and one template: the visitor thank-you, to a row it
  ticked or to several. The bar says so out loud (**স্টাফ শুধু ভিজিটর ধন্যবাদ টেমপ্লেটটি পাঠাতে পারেন।**),
  the dialog shows the message instead of a box to write in, and **এই পৃষ্ঠার সবাইকে বাছুন** is not on a
  staff bar at all. Dues, receipts, classes, your own wording and "retry the failed ones" still answer
  only to Admin and Super Admin.
- **One ceiling, in your settings (R3.11).** SMS → Settings → **একজনের দৈনিক এসএমএস সীমা** (daily SMS
  limit per user, 30 by default, **0** means no limit). The dialog says what is left of today before you
  send, and when it runs out the send stops with **আজকের জন্য আপনার এসএমএস পাঠানোর সীমা (৩০টি) শেষ।
  আগামীকাল আবার চেষ্টা করুন।** — nothing is written and nothing is charged. The count is per person and
  per Dhaka day, and only messages that actually went are counted.
- **A staff Overview is the queue (R3.12).** Signing in as staff opens **আজকের ফলো-আপ** and nothing else:
  today's count, the count already overdue, the next names and the link to the whole queue. The intake
  counters, the checklist and the automatic-SMS problems stay on the admin Overview.
- **The three hand-offs (R3.13, R3.14).** Open a visitor and the drawer now carries **হ্যান্ড-অফ** with
  three buttons: **ভর্তি আবেদন** (convert to admission), **ট্রায়াল বুক** (book a trial) and **আগ্রহী নন**
  (not interested).
  - *ভর্তি আবেদন* opens a form that already holds the name, the guardian, the school and the class the
    lead carries. The number shows as **০১\*\*\*\*৯০** in a box you cannot type into, because it is copied
    from the lead when you save — you never retype it and it is never printed. Fill the date of birth,
    the relation, the subjects, save, and you get the application's own reference (**ADM-2026-…**) back;
    the visitor's status becomes **ভর্তিকৃত** and the button switches off, because it is done.
  - *ট্রায়াল বুক* asks for the class and the subject, then lists only the batches that are switched on,
    still ahead and have a seat left, each with **১ আসন বাকি** beside it. Save and the seat is taken and
    the status becomes **ট্রায়াল বুক**. If the class filled while you were looking, you are told so and
    nothing is written.
  - *আগ্রহী নন* will not close a visitor without a reason — the save button stays off until you write one
    (a tap on **অন্য কোচিংয়ে ভর্তি**, **সময় মিলছে না**, **ফি বেশি** or **এখন প্রয়োজন নেই** fills it for
    you). The reason is filed as a note in the timeline, tagged **আগ্রহী নন**, with your name on it.
- **The import wizard** (xlsx/csv, dry run, preview, flagged rows, unknown-column questions, Bangla
  comments as the first note, undo, idempotent re-import) — wave C. The reading rules it needs are
  already written and proven (R3.2–R3.4); nothing reads a spreadsheet yet.
- **Duplicate-phone "add as sibling / merge these two"** as a dialog — the detection and the family key
  are live, the two-record decision is wave C's.
- **Convert to a student** (a hand-off that makes a Centre student rather than an application) — still
  owed. The **funnel reports and CSV export** the owner put after the import wizard are delivered:
  `/admin/leads/funnel` counts visitors → trial booked → admitted by month, source and class with the
  three conversion rates beside the counts, and the table on screen downloads as a CSV (R3.17 and
  R3.18; `docs/STATUS.md` records the definitions).
