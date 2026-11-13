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
npm run verify          # everything, headless: 35 requirements, screenshots included
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
- **Who can see this:** Admin and Staff. Teachers, content editors and exam managers have no sidebar
  item, no route and no action — the guard runs before anything is read.

---

## 4. What R3 deliberately does not include yet

- **SMS to visitors.** The `visitor_thanks` template has existed since R2, but the lead entry point for
  the send dialog is **R3.9** — the next change set. Nothing is sent anywhere today: `SMS_PROVIDER`
  stays unset/mock and no real message has ever left this repository.
- **The import wizard** (xlsx/csv, dry run, preview, flagged rows, unknown-column questions, Bangla
  comments as the first note, undo, idempotent re-import) — wave C. The reading rules it needs are
  already written and proven (R3.2–R3.4); nothing reads a spreadsheet yet.
- **Duplicate-phone "add as sibling / merge these two"** as a dialog — the detection and the family key
  are live, the two-record decision is wave C's.
- **Convert to admission/student, book a trial, funnel reports, CSV export** — wave C.
