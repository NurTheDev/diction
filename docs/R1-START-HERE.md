# R1 — what I click (delete, archive, restore, Recycle Bin)

R1 changes real behaviour: nothing is hard-deleted any more. Every delete on the twelve content and
Center record types moves the record to a **Recycle Bin for 30 days**, and a daily job removes it
after that. Staff can archive and restore but never delete. Super Admin can delete forever, and only
after typing the item's name.

Written confirmations you asked for, with the tests that prove them: [`docs/R1-COVERAGE.md`](R1-COVERAGE.md).

---

## 1. The one command

```bash
npm ci
npm run verify
```

Expect, at the end:

```
=== PASS: 16 PASS, 0 FAIL, 0 NOT TESTED (of 16 requirements) ===
```

The five R1 lines are:

| id | what it proves | how |
| --- | --- | --- |
| R1.1 | the engine: 30-day bin, restore, blocked delete with real counts, purge only after retention, every query shape hides binned rows, and the daily job | `tests/recycle-bin.integration.ts` against the disposable database |
| R1.2 | the `staff` role: sees admin lists, can archive, never deletes, cannot open roles/audit/ai | `tests/staff-role.test.ts` |
| R1.3 | the auto-hide rule covers find/findOne/count/distinct/aggregate/bulkWrite/updates/populate, and payments, students, logs and snapshots can never be hidden | `tests/recycle-coverage.test.ts` |
| R1.4 | the UI in a real browser: named dialog, Undo, bulk delete, blocked delete + Archive, bin filter/search/days left, Delete forever with the typed name, staff and content_editor permissions, 360/768/1440 px | `tests/recycle-bin-ui.integration.ts` |
| R1.5 | the daily job: `CRON_SECRET` bearer auth, `vercel.json` schedule, 12-month log trim | `tests/cron.test.ts` |

`npm run verify -- --milestone=r1` runs only R1 (plus the shared install/typecheck/build steps).

---

## 2. Click it yourself (10 minutes, disposable data)

```bash
npm run test-mode
```

Wait for `Open http://localhost:3000/bn/admin`. Test mode now seeds three accounts and a few rows so
every flow is clickable. **All of it disappears when you press Ctrl+C.**

| account | password | what it may do |
| --- | --- | --- |
| `demo-super@example.test` | `DemoOnly-2026!` | everything, including **Delete forever** |
| `demo-admin@example.test` | `DemoOnly-2026!` | delete, archive, restore — no Delete forever |
| `demo-staff@example.test` | `DemoOnly-2026!` | archive and restore only — **no Delete anywhere** |

### A. Delete one item, then Undo — বাংলা ও English

1. Sign in as **demo-admin** → **কনটেন্ট** → **ব্লগ** (`/bn/admin/content?kind=blog`).
2. On the row **নমুনা ব্লগ এক** click **মুছুন** / **Delete**.
   - The dialog must say the item's name and: *"এটি ৩০ দিনের জন্য রিসাইকেল বিনে যাবে। তার আগে
     রিসাইকেল বিন থেকে ফেরত আনা যাবে।"* / *"This moves to the Recycle Bin for 30 days. You can
     restore it from there until then."*
   - It must **never** say the item cannot be brought back.
3. Click **হ্যাঁ, মুছে ফেলুন** / **Yes, delete**. The row disappears and a toast appears bottom-right:
   **রিসাইকেল বিনে রাখা হয়েছে।** / **Moved to the Recycle Bin.** with a **ফিরিয়ে আনুন / Undo** button.
4. Within 10 seconds click **Undo** → the toast says **ফেরত আনা হয়েছে। / Restored.** and the row is back.
5. Delete it again, then open `/bn/blog/demo-blog-one` in a second tab: the public page must be gone
   (404) immediately — no waiting for a cache. Restore it from the bin and the page is back.

### B. Bulk select and delete

1. On the same blog list (test mode seeds two blog rows), tick the header checkbox → the bar above
   the table reads **২টি নির্বাচিত / 2 selected**.
2. Untick it, then tick one row only → the bar reads **১টি নির্বাচিত / 1 selected**.
3. Click **নির্বাচিতগুলো মুছুন / Delete selected** → both rows go, one toast with **Undo**.
4. Click **Undo** → both rows come back.
5. The same bar exists on **কোর্স** (`/bn/admin/courses`).

### C. A delete that is blocked, and the Archive way out

1. Sign in as **demo-admin** → **শিক্ষার্থী** → **ক্লাস পরিচালনা** (`/bn/admin/students/classes`).
2. On **ক্লাস ৭** (two demo students use it) click **মুছুন / Delete** → **হ্যাঁ, মুছে ফেলুন / Yes, delete**.
3. The toast must show the real count, in your language:
   - বাংলা: **২ জন শিক্ষার্থী এই ক্লাস ব্যবহার করে — মুছে ফেলা যাবে না। আর্কাইভ করুন।**
   - English: **2 student(s) use this class — cannot be deleted. Archive it instead.**
   and it must offer an **আর্কাইভ করুন / Archive** button.
4. Click **Archive** → the toast says **আর্কাইভ করা হয়েছে। / Archived.** The class is still in the
   database and still in the list, only inactive. Nothing was binned.

### D. The Recycle Bin page

1. Sign in as **demo-super** → **সেটিংস** group → **রিসাইকেল বিন** (`/bn/admin/recycle-bin`).
2. Delete one blog post first (step A) so the bin is not empty.
3. Check: the **ধরন / Type** filter lists all twenty-one kinds; **খুঁজুন / Search** finds a row by name;
   each row shows **মুছে ফেলা হয়েছে** (the date) and **৩০ দিন বাকি / 30 days left**.
4. Click **ফেরত আনুন / Restore** → the row leaves the bin and the record is live again.
5. Delete another row, then click **চিরতরে মুছুন / Delete forever**:
   - Type a **wrong** name → **নাম মেলেনি, তাই কিছু মুছে ফেলা হয়নি। / The name did not match, so
     nothing was deleted.** and the row is still in the bin.
   - Type the **exact** name shown in the dialog → **চিরতরে মুছে ফেলা হয়েছে। / Deleted forever.** and
     the row is gone from storage.
6. Sign in as **demo-staff** and open the same page: **Restore** is there, **Delete forever** is not.
7. Sign in as **demo-admin**: **Delete forever** is not there either.

### E. Staff can archive but never delete

1. Sign in as **demo-staff** → **কনটেন্ট** → **ব্লগ**. There must be **no Delete button** on any row
   and **no bulk bar**, but every row has **আর্কাইভ করুন / Archive**.
2. Click **Archive** on a published post → it becomes a draft (hidden from the website) and stays in
   the list. Open `/bn/blog/<slug>` — the post is no longer public.
3. Still as staff, open **শিক্ষার্থী → ক্লাস পরিচালনা**: Archive is there, Delete is not, and the
   create/edit forms are not rendered.
4. Try `/bn/admin/roles`, `/bn/admin/audit`, `/bn/admin/ai` → you are sent back to `/bn/admin`.
5. Sign in as a **content_editor** (create one at `/admin/roles` as demo-super): on the blog list
   there is neither Delete nor Archive, and `/bn/admin/recycle-bin` is refused.

### F. Where the same controls now exist (§E6)

Delete + archive/restore controls were added to every kind the bin knows: blog / notice / video /
gallery / other content, courses, study materials, portal notices, media, FAQs and facilities,
achievements, practice tests, lecture sheets, class groups and Center exams. Two lists that used to
ask `window.confirm('Permanently delete this sheet?')` — **lecture sheets** (`/bn/admin/public-sheets`)
and **practice tests** (`/bn/admin/practice-tests`) — now use the same named dialog, the same
10-second Undo, and reload their list afterwards. Check one of them:

1. `/bn/admin/public-sheets` → a row → **মুছুন / Delete** → the dialog names the sheet → **Yes, delete**
   → the card disappears → **Undo** → the card is back without a page reload.

Center exams (`/bn/admin/center-exams`) show a Delete column for admin and above; an exam with saved
results cannot be deleted and says how many results it has. exam_manager sees no Delete column.

**Second wave — the same controls on nine more lists.** Trial slots (`/bn/admin/slots`), trial
bookings (`/bn/admin/bookings`), admissions (`/bn/admin/admissions`), contact messages
(`/bn/admin/messages`), the home hero banner (`/bn/admin/hero`), teacher profiles
(`/bn/admin/faculty`), portal accounts (`/bn/admin/accounts`), legacy academic exams
(`/bn/admin/academics`) and model tests (`/bn/admin/model-tests`) now carry the same named dialog,
the same 10-second Undo, the same Archive floor and the same bin. Try the slot list: delete the
demo slot, Undo it, then book a trial into it (`/bn/admin/bookings` shows bookings; or create one
from the public `/bn/trial-class` form) and delete again — the toast must refuse with the real
count, *"1 booking(s) are scheduled in this slot — cannot be deleted. Archive it instead."*, and
Archive closes the slot instead. Admissions refuse once converted to a student; legacy exams and
model tests refuse once results or attempts exist. Portal accounts refuse for two reasons of their
own: an account holding a staff role may only be disabled, and an account a legacy student profile
points at stays until the profile moves. On all nine lists staff see Archive (where the kind has
an archive path) and never Delete.

### G. The daily job (§E5)

The job lives at `/api/admin/jobs/daily` and is scheduled by `vercel.json` once a day
(`0 19 * * *` UTC = **01:00 Asia/Dhaka**). It purges bin rows whose 30 days are up (destroying their
Cloudinary images first) and trims SMS/activity logs older than `logRetentionMonths` (default 12).

```bash
# 1. Add a secret to .env.local (at least 32 characters) and restart test mode:
openssl rand -base64 32

# 2. Without the secret it must refuse — 401, and nothing is touched:
curl -i http://localhost:3000/api/admin/jobs/daily

# 3. With the secret it runs and reports what it did:
curl -i -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/admin/jobs/daily
#    → {"ok":true,"purged":0,"assetFailures":0,"trim":{"smsLog":0,"activityLog":0}}
```

On Vercel: set `CRON_SECRET` in the project's environment variables, and Vercel Crons sends it
automatically as `Authorization: Bearer …`. Hobby plans run crons once a day, which matches this
schedule. With no secret, or a secret shorter than 32 characters, the job refuses to run at all.

---

## 3. What R1 does **not** cover yet (stated plainly)

- **Testimonials / social proof still have no delete or archive control** — `saveSocialProof`
  only. They are the last list from `docs/R1-AUDIT.md` §B without controls.
- **Roles need a disable path.** They are access control, deliberately outside the Recycle Bin, but
  today a managed role can only be edited, not switched off in one place.
- **Portal accounts are the one auth type inside the bin**, deliberately: a binned account cannot
  sign in and restores within 30 days, but staff-role accounts and accounts a legacy student
  profile points at are reference-blocked and can only be disabled.
- **Payments, students, logs, snapshots and SMS records are never deletable**, by design: payments
  are voided with a reason, students keep their own `removed` status with restore, and the logs are
  append-only (the daily job only trims them after 12 months).
- **Nothing here is verified until you run it.** Say the word only after your own
  `=== PASS: 16 PASS … ===` output; then R1 gets tagged like R0.
