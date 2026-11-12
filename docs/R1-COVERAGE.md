# R1 coverage confirmation — the auto-hide rule, in writing

Owner request of 2026-11-12, answered point by point. Everything below is asserted by
`tests/recycle-coverage.test.ts` (Mongo-free, runs in `npm test` and as verify requirement **R1.3**)
and, where a live database is needed, by `tests/recycle-bin.integration.ts` (verify **R1.1**).

## 1. Which operations the rule covers, and which opt out on purpose

Implemented in `src/models/recycle.ts` → `addRecycleFields()`, registered on every participating
schema. The rule: **any operation whose filter does not mention `deletedAt` only touches live
rows.** Mentioning `deletedAt` (bin/restore queries) or passing `{recycleAny:true}` (purge) is the
deliberate opt-out.

| Operation | How it is handled | Opt-out |
| --- | --- | --- |
| `find`, `findOne` | query middleware rewrites the filter | `deletedAt` in filter, or `{recycleAny:true}` |
| `countDocuments` | same middleware | same |
| `distinct` | same middleware (it is query middleware in Mongoose 8) | same |
| `updateOne`, `updateMany` | same middleware — a binned row cannot be edited | same |
| `findOneAndUpdate`, `findOneAndReplace`, `findOneAndDelete` | same middleware | same |
| `deleteOne`, `deleteMany` | same middleware — a binned row cannot be deleted twice | purge passes `{recycleAny:true}` |
| `aggregate` | `pre('aggregate')` unshifts `{$match:{deletedAt:{$not:{$type:'date'}}}}` onto the pipeline | pipeline already mentions `deletedAt`, or `{recycleAny:true}` |
| `bulkWrite` | `pre('bulkWrite')` rewrites the `filter` of every `updateOne/updateMany/deleteOne/deleteMany/replaceOne` operation in place | an operation filter that mentions `deletedAt` |
| `populate` | needs no hook: populate runs a `find` on the referenced model, so the referenced model's own hook hides binned documents (proved live: populating a binned class group returns `[]`, a live one returns the doc) | the referencing query's own opt-out does not leak into populate |
| `estimatedDocumentCount` | **not covered, on purpose** — it cannot carry a filter. Its only caller is the database-usage card (`src/lib/center/database-usage.ts`), where counting stored rows, bin included, is the correct number. Asserted as absent in the coverage test. | always counts stored rows |
| `insertOne/create/insertMany` | irrelevant — new documents get `deletedAt:null` from the schema default | — |

**Proof, per operation.** `tests/recycle-coverage.test.ts` §3 reads the registered middleware off a
participating schema and asserts a pre-hook for `find`, `findOne`, `countDocuments`, `distinct`,
`findOneAndUpdate`, `findOneAndReplace`, `findOneAndDelete`, `updateOne`, `updateMany`, `deleteOne`,
`deleteMany`, `aggregate` and `bulkWrite`, and asserts `estimatedDocumentCount` has none.
`tests/recycle-bin.integration.ts` (R1.1) proves the same rule live against a replica set: a binned
row is invisible to plain `find`/`countDocuments`, immune to an unflagged `updateOne`, visible to
`binList`, and an `aggregate`, a `distinct`, a `bulkWrite` filter and a `populate` over a binned
reference each behave as the table says. `tests/recycle-policy.test.ts` proves the opt-out
contract (`liveFilter`, `binFilter`, `purgeAtFor`, `kindDef`) at the unit level.

Deliberate opt-outs by caller, today:

| Caller | Why it opts out |
| --- | --- |
| `binList`, `binCounts` (Recycle Bin page, R1.1) | filter carries `deletedAt:{$type:'date'}` |
| `restoreRecord` | `updateOne` filter carries `binFilter` |
| `purgeExpired` (daily job, §E5) | `find` carries `binFilter`; its `deleteOne` passes `{recycleAny:true}` |
| Backup/full export (R6, not built yet) | must export binned rows too; will use `{recycleAny:true}` — recorded here so the R6 implementer cannot forget |
| Import undo (`CenterImportBatch`/`CenterWorkbookBatch` undo paths) | those models are **not** participating schemas (see §2), so undo is unaffected by the rule; if a future undo touches a participating type it must opt out explicitly |

## 2. The twenty-one schemas with `deletedAt`, and the types that can never be hidden

Carry `deletedAt/deletedBy/purgeAt` (+ the partial `purgeAt` index): **Editorial, Course,
LearningMaterial, MediaFile, PortalNotice, FAQContent, FacilityContent, AchievementRecord,
PracticeTest, PublicSheet, CenterClassGroup, CenterExam** (first wave) plus **Slot, TrialBooking,
Admission, ContactMessage, HeroBanner, TeacherContent, User, Exam, ModelTest** (§E6 second wave) —
exactly the twenty-one entries of `recycleRegistry`, asserted equal in the coverage test.

Never hidden (no `deletedAt` field exists, so the rule structurally cannot touch them):
**CenterStudent** (keeps its own `status:'removed'` + restore), **CenterPayment** and
**CenterFeeWaiver** (voided with a reason, never deleted), **CenterActivityLog** and **AdminAudit**
(write-only), **CenterSmsLog/CenterSmsBatch**, **CenterDueSnapshot** (immutable),
**CenterImportBatch/CenterWorkbookBatch**, **CenterExamResult**, and the legacy student records
**Student, Result, Attendance, TestAttempt**. Each is asserted `path('deletedAt') === undefined`.

**User moved between the two lists in the second wave, deliberately.** Portal accounts (the
`student`/`parent`/`teacher` logins) needed a real delete-with-restore, and the bin gives exactly
that: a binned account cannot sign in, and restore brings it back within 30 days. Two reference
blocks keep it safe — an account holding a managed staff role can only be disabled, never binned
(`staff role — disable instead of deleting`), and an account a legacy student profile points at is
blocked the same way. Every money, audit and student record above stays outside the engine; the
coverage test asserts both lists.

## 3. Public pages, sitemap, ISR and revalidation

- Every public reader of a participating type goes through `find`/`findOne`
  (`src/lib/content/editorial.ts`, `course.ts`, `practice-tests.ts`, `public-sheets.ts`,
  `site-content.ts`, `achievements.ts`, `hero.ts`, the `/teacher` page and the `/trial-class`
  booking list), so binned rows disappear from public pages, the blog, lecture sheets, practice
  tests, the home hero, the faculty page and the trial-slot list immediately at query time.
- `src/app/sitemap.ts` is `force-dynamic` and builds from those same readers
  (`publicEditorial`, `getPublicSheets`, `practiceList`) — a binned slug leaves the sitemap on the
  next request, and there is no cached sitemap to stale.
- ISR/cache: `softDelete`, `restoreRecord` and `purgeExpired` each call `revalidateKind()`, which
  revalidates both locales of the kind's public routes (`publicPaths` in the registry: blog/notice/
  gallery slugs, `/courses`, `/about`+`/facilities` for FAQ/facility, home for achievements,
  `/practice-tests/<slug>`, `/lecture-sheets/<slug>`), home for the hero banner, `/teacher`, and
  `/trial-class` for slots; the milestone bin revalidates home and `/about`). Kinds with no public
  page (materials, media, portal notices, class groups, center exams, bookings, admissions,
  messages, accounts, legacy exams, model tests) have `publicPaths === undefined`, asserted in the
  coverage test. Outside a request context (unit tests, scripts) `revalidatePath` throws and the
  call is intentionally swallowed — there is no cache to refresh there.
- **Proof, per claim.** `tests/recycle-coverage.test.ts` §4 asserts which kinds declare public
  routes and which deliberately declare none. `tests/recycle-bin-ui.integration.ts` (R1.4) proves the
  operator-visible half in a real browser: a public blog page answers 404 immediately after the
  delete toast (no cache window), and answers 200 again after Undo; the bin page and the public list
  refresh in the same round-trip. `tests/recycle-bin.integration.ts` (R1.1) proves the purge path
  revalidates too, because `purgeExpired` calls the same `revalidateKind()`. The sitemap needs no
  revalidation call: it is `force-dynamic`, so the next request rebuilds it from readers that already
  hide binned rows.

## 4. Reports, totals and exports are not accidentally affected

Three classes of reader, three answers:

1. **Exempt types (payments, students, waivers, logs, snapshots, audit, results, attempts).**
   They carry no `deletedAt` field (§2) *and no auto-hide middleware at all*: `tests/recycle-coverage.test.ts`
   §7 reads the hook map off `CenterPayment`, `CenterStudent`, `AdminAudit` and `CenterSmsLog` and
   asserts there is no `find`/`findOne`/`countDocuments`/`aggregate`/`bulkWrite` pre-hook on any of
   them. A rule with no hook and no field cannot filter a query, so every report, total, ledger and
   export over these types — the daily collection, due snapshots, the SMS log, payment history, the
   audit page — sees every row exactly as before R1.
2. **Participating types.** Exclusion from lists, counts and aggregates *is* the delete semantics an
   operator asked for; nothing "report-shaped" reads them except the storage card, which uses
   `estimatedDocumentCount` and must keep counting stored rows, bin included. That intention is
   asserted live in `tests/recycle-bin.integration.ts` (R1.1): while a row is binned,
   `estimatedDocumentCount()` equals the raw collection count and is strictly greater than the
   filtered `countDocuments()`. The admissions export (`/api/admin/admissions/export`) reads
   `Admission.find`, so a binned admission leaves the export for the same 30 days it leaves the
   list — a deletion, not an accident, and restorable.
3. **The milestone bin (third wave).** Milestones bin inside the single settings document, so two
   extra guarantees are coded and tested: `saveSocialProof` merges the binned rows back on every
   save (a form save can never empty the bin behind the operator's back), and the public reader
   filters binned milestones before parsing (`src/lib/content/settings.ts`). `tests/admin-controls-browser.integration.ts`
   (R1.6) proves delete → bin → Undo → restore in the browser and that the bin shows days left;
   `tests/recycle-bin.integration.ts` (R1.1) proves `purgeExpiredProofMilestones` removes only the
   expired row and keeps the live and the still-restorable ones; `tests/recycle-coverage.test.ts` §7
   asserts the milestone sub-schema carries `deletedAt`/`purgeAt`.

Nothing in R1 changed a money total, a student count or an export column; the only readers that
changed behaviour are the ones whose behaviour *is* the feature.

