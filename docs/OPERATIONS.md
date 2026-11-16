# Operations & Handover Guide

The monthly and yearly rhythms of running the center's data: backups and their offline archive,
watching the free-tier storage ceiling, and the Recycle Bin's three verbs — hold, restore, purge.
If you are handing the site to another person, this page plus `docs/GO-LIVE.md` is the handover.

## 1. Monthly backup export and offline archive

The Overview shows the Super Admin a reminder banner when no full backup exists or the last one is
older than thirty days; a successful export writes its own date (`lastBackupAt`) and the banner
stands down by itself. Once a month, and always before a data import or a risky edit:

1. Sign in as Super Admin and open **ব্যাকআপ / Backup** (`/[locale]/admin/backup`). Staff and
   teachers cannot see or reach this page — the file holds every child's record and every taka.
2. Download **both** formats: the JSON (all fifteen center collections, complete and machine-
   readable, password hashes excluded) and the Excel workbook (one worksheet per collection, for
   reading and auditing by a human).
3. Check the files before trusting them: the JSON opens in any editor and lists the collections;
   the workbook opens with one sheet per collection and the student count you expect.
4. Archive offline under the name the export gives you (`diction-backup-YYYY-MM-DD`): two copies on
   two different shelves — an encrypted external drive and a second offline place. A backup that
   lives only in the same cloud as the database is not a backup.
5. Write the date and the file sizes in the center's operations log. The banner on the Overview is
   the monthly calendar; the log is the proof it was honored.

A `mongodump` from a trusted machine (`docs/DEPLOYMENT.md` §1) is the deeper copy: it captures
indexes and every collection, not only the fifteen the center owns. Take it quarterly.

## 2. Storage: watching the 512 MB free-tier ceiling

The Overview's **ডাটাবেস ব্যবহার / database usage** card reads the live storage against the M0
ceiling of **512 MB**, with the record counts that explain it. It warns in the catalog's own words
at **70% (about 358 MB)** and **90% (about 461 MB)**; if the read fails it says *unavailable* rather
than inventing a zero.

- What grows: students, payments and cash batches, exams, and the two logs (SMS log, activity log).
  The daily job trims both logs at **twelve months**, so log growth is bounded by design. Photos and
  PDFs live on Cloudinary, not in the database — media never counts against the 512 MB.
- At the 70% word: take a backup this week, and check the counts on the card for a surprise (an
  import that ran twice, a batch that sent twice).
- At the 90% word: take a backup today and plan the upgrade. The path is Atlas → *Upgrade*: a paid
  cluster (M2 and up) is the same connection string shape and needs **no code change** — only a new
  `MONGODB_URI` in Vercel and a redeploy. Export a full backup before the move and read one report
  after it.
- Atlas's own *Metrics → Storage* chart is the second opinion; the card is the first.

## 3. Recycle Bin: hold, restore, purge

Deleted center records are not destroyed — they move to the bin (`/[locale]/admin/recycle-bin`)
with a countdown.

- **Hold.** Every binned record keeps for **30 days** (`RECYCLE_RETENTION_DAYS`), showing the days
  left beside it. Deleting a record that other records reference is refused with counts, so a class
  group with students, or a student with payments, cannot be binned by accident.
- **Restore.** Staff and above can restore any row inside the window from the bin page: filter by
  kind, search, and *Restore* puts the record back exactly as it was, references intact.
- **Purge.** Two ways, both deliberate: the daily job (01:00 Asia/Dhaka) destroys everything whose
  30 days are up, including its Cloudinary assets; and *Delete forever* on the page is Super Admin
  only, behind a typed-name confirmation. There is no undo after either — which is why the monthly
  backup in §1 comes first.
- Handover note: the bin is the center's grace period. Teach a new operator to look there *before*
  answering "the record disappeared", and to never purge to make space — storage is §2's job.

## 4. Handover pack

When the site changes hands, hand over this list and nothing secret:

- This page, `docs/GO-LIVE.md`, `docs/DEPLOYMENT.md`, and the latest `verify-report.md`.
- Where each secret lives (Vercel environment, BulkSMSBD dashboard, Atlas) and the rotation rule:
  any credential that appeared in a chat, screenshot or email is rotated the same day.
- The cron table: `/api/admin/jobs/daily` at 01:00 and `/api/admin/jobs/sms-flush` at 07:05
  (Asia/Dhaka), both bearer-protected by `CRON_SECRET`; a run without the secret answers 401.
- The feature gates and their owners (`.env.example`), the SMS automatic switches and who may pull
  the emergency brake, and the date and place of the last two offline backups.
