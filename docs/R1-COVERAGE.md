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

Deliberate opt-outs by caller, today:

| Caller | Why it opts out |
| --- | --- |
| `binList`, `binCounts` (Recycle Bin page, R1.1) | filter carries `deletedAt:{$type:'date'}` |
| `restoreRecord` | `updateOne` filter carries `binFilter` |
| `purgeExpired` (daily job, §E5) | `find` carries `binFilter`; its `deleteOne` passes `{recycleAny:true}` |
| Backup/full export (R6, not built yet) | must export binned rows too; will use `{recycleAny:true}` — recorded here so the R6 implementer cannot forget |
| Import undo (`CenterImportBatch`/`CenterWorkbookBatch` undo paths) | those models are **not** participating schemas (see §2), so undo is unaffected by the rule; if a future undo touches a participating type it must opt out explicitly |

## 2. The twelve schemas with `deletedAt`, and the types that can never be hidden

Carry `deletedAt/deletedBy/purgeAt` (+ the partial `purgeAt` index): **Editorial, Course,
LearningMaterial, MediaFile, PortalNotice, FAQContent, FacilityContent, AchievementRecord,
PracticeTest, PublicSheet, CenterClassGroup, CenterExam** — exactly the twelve entries of
`recycleRegistry`, asserted equal in the coverage test.

Never hidden (no `deletedAt` field exists, so the rule structurally cannot touch them):
**CenterStudent** (keeps its own `status:'removed'` + restore), **CenterPayment** and
**CenterFeeWaiver** (voided with a reason, never deleted), **CenterActivityLog** and **AdminAudit**
(write-only), **CenterSmsLog/CenterSmsBatch**, **CenterDueSnapshot** (immutable),
**CenterImportBatch/CenterWorkbookBatch**, **CenterExamResult**, **User**. Each is asserted
`path('deletedAt') === undefined`.

## 3. Public pages, sitemap, ISR and revalidation

- Every public reader of a participating type goes through `find`/`findOne`
  (`src/lib/content/editorial.ts`, `course.ts`, `practice-tests.ts`, `public-sheets.ts`,
  `site-content.ts`, `achievements.ts`), so binned rows disappear from public pages, the blog,
  lecture sheets and practice tests immediately at query time.
- `src/app/sitemap.ts` is `force-dynamic` and builds from those same readers
  (`publicEditorial`, `getPublicSheets`, `practiceList`) — a binned slug leaves the sitemap on the
  next request, and there is no cached sitemap to stale.
- ISR/cache: `softDelete`, `restoreRecord` and `purgeExpired` each call `revalidateKind()`, which
  revalidates both locales of the kind's public routes (`publicPaths` in the registry: blog/notice/
  gallery slugs, `/courses`, `/about`+`/facilities` for FAQ/facility, home for achievements,
  `/practice-tests/<slug>`, `/lecture-sheets/<slug>`). Kinds with no public page (materials, media,
  portal notices, class groups, center exams) have `publicPaths === undefined`, asserted in the
  coverage test. Outside a request context (unit tests, scripts) `revalidatePath` throws and the
  call is intentionally swallowed — there is no cache to refresh there.
- The browser tests for §E4 will add the end-user proof: delete a blog row, assert the public URL
  stops serving it without waiting for ISR expiry.
