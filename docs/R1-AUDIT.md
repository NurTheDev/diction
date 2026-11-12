# R1 audit — delete / archive / restore across every admin list

Step 1 of R1, completed 2026-11-12. **Method:** static evidence only — every server action in
`src/actions/*.ts`, every admin API route in `src/app/api/admin/**`, every model in `src/models`, and
the components/routes that render each control. No database or browser was available in this sandbox,
so nothing here is a runtime claim; each row says where its evidence comes from.

Headline: **9 record types are hard-deleted today** (blog/notice/video/gallery, courses, study
materials, media, portal notices, FAQs and features, achievements, practice tests, lecture sheets),
**13 more have no delete or archive control at all** (class groups, trial slots, trial bookings,
admissions, contact messages, banners, testimonials, teachers, portal accounts, both exam modules,
model tests, roles), **no model has a `deletedAt`/`archivedAt` field**, and **there is no Recycle Bin
and no restore path** anywhere except Center students. R1 is greenfield infrastructure, not a fix-up.
Already correct and to be preserved: Center students keep "Remove" + restore, payments are voided
with a reason and never deleted, and activity logs are write-only.

## A. Destructive controls that exist today

| Control | Where it is rendered | Write | Semantics | Cloudinary | Auth |
| --- | --- | --- | --- | --- | --- |
| `deleteEditorial` | `/admin/content` (blog, notice, video, gallery, other) via `editorial-form.tsx` | `Editorial.deleteOne` | **HARD** | not removed | `requireStaffPermission('content')` |
| `deleteCourse` | `/admin/courses` via `course-form.tsx` | `Course.deleteOne` | **HARD** | — | `requireAdmin` |
| `deleteMaterial` | `/admin/materials` via `material-controls.tsx` | `LearningMaterial.deleteOne` | **HARD** | file left behind | `requireAdmin` |
| `deleteMedia` | `/admin/media` via `media-controls.tsx` | `MediaFile.deleteOne` | **HARD**, but blocks when referenced and destroys the Cloudinary asset | yes (`uploader.destroy`) | `requireAdmin` |
| `deletePortalNotice` | `/admin/portal-notices` via `notice-controls.tsx` | `PortalNotice.deleteOne` | **HARD** | — | `requireAdmin` |
| `deleteSiteContent` | `/admin/site-content` via `site-content-form.tsx` | `FAQContent.deleteOne`, `FacilityContent.deleteOne` | **HARD** | — | `requireAdmin` |
| `DELETE /api/admin/achievement-records/[id]` | `/admin/achievements` | `deleteOne` | **HARD** | — | admin check in route |
| `DELETE /api/admin/practice-tests/[id]` | `/admin/practice-tests` | `findByIdAndDelete` | **HARD** | — | admin check in route |
| `DELETE /api/admin/public-sheets/[id]` | `/admin/public-sheets` (lecture sheets) | `findOneAndDelete` | **HARD** | — | admin check in route |
| `removeEnrollment` | `/admin/batches`, `/admin/batches/[id]` | `Student.updateOne` | soft (status) | — | — |
| `cancelBooking` | `/admin/bookings`, `/admin/slots`, `/admin/messages`, `/admin/admissions/[id]`, … via `forms.tsx` | `TrialBooking.findOneAndUpdate`, `Slot.updateOne` | soft (status) | — | — |
| `toggleSlot` | `/admin/slots`, `/admin/academics` | `Slot.updateOne` | soft (open/closed ≈ archive) | — | — |
| `setBatchActive` | `/admin/batches` | `Batch.updateOne` | soft (active flag ≈ archive) | — | — |
| `setPortalAccountActive` | `/admin/accounts` | `PortalAccount.updateOne` | soft (active flag) | — | — |
| `setMaterialPublished` / `setPortalNoticePublished` / `toggleModelTest` | materials, portal notices, model tests | `updateOne` | soft (publish/unpublish) | — | — |
| `voidFeePayment`, `voidFeeInvoice` | `/admin/fees`, `/admin/fees/[id]` | `FeePayment.findOneAndUpdate`, `FeeInvoice.updateOne` | **void with reason** (correct: never deleted) | — | — |
| `voidCenterCashAction` | `/admin/students/collect` (daily collection) | Center payment void | **void with reason** (correct) | — | admin |
| `reviseCenterPayment` | student payment history | reasoned edit | keeps history (correct) | — | admin |
| `restoreCenterStudent` | `/admin/students/removed` | status back to active with resume month | **restore** (correct) | — | admin |

## B. Record types with **no** destructive control at all (R1 must add one)

Evidence: the record type's action file exports no delete/archive function, and its admin route
renders no destructive control.

| Record type (brief R1.1) | Actions that exist today | Missing for R1 |
| --- | --- | --- |
| Class groups / classrooms (Center) | `createCenterClass`, `updateCenterClass` | delete, archive (`active:false` exists in the schema but no action/UI), restore |
| Courses and packages | `saveCourse`, `deleteCourse` | archive, restore, reference check (batches/enrolments) |
| Trial class slots | `createSlot`, `editSlot`, `toggleSlot`, `updateCapacity` | delete (soft), archive with booking counts, restore |
| Trial bookings | `cancelBooking` | delete (soft, admin only) |
| Admissions | `updateAdmission` (status only) | delete (soft, blocked once converted to a student) |
| Contact messages | `markMessage` | delete (soft), restore |
| Banners (hero) | `saveHero` only | delete, archive, restore |
| FAQs / features | `saveSiteContent`, `deleteSiteContent` | archive, restore (delete is hard today) |
| Testimonials / social proof | `saveSocialProof` only | delete, archive, restore |
| Teachers (faculty) | `saveFaculty` only | delete (soft), archive, restore |
| Study materials | `setMaterialPublished`, `deleteMaterial` | archive, restore, Cloudinary cleanup at purge |
| Lecture sheets (public sheets) | API GET/POST/DELETE | archive, restore (delete is hard today) |
| Portal accounts | `createPortalAccount`, `editPortalAccount`, `setPortalAccountActive` | delete (soft), restore |
| Exams (legacy academic) | `createExam`, `publishExam`, `saveMarks`, `saveAttendance` | delete (soft, blocked once results exist), unpublish |
| Exams (Center) | `createExamAction`, `saveExamMarksAction`, `publishExamAction` | delete (soft, blocked once results exist), unpublish/correction |
| Model tests | `createModelTest`, `toggleModelTest` | delete (soft), restore |
| Practice tests | API GET/POST/DELETE | archive, restore (delete is hard today) |
| Achievements | API GET/POST/PUT/DELETE | archive, restore (delete is hard today) |
| Roles | API GET/POST/PUT | out of scope for the Recycle Bin (access control), but needs a disable path |
| Students (Center) | `create/update/restore`, status `removed` | **already correct** — keep "Remove", never hard delete |
| Payments (Center + legacy) | void with reason | **already correct** — never delete |
| Activity logs (`CenterActivityLog`, `AdminAudit`) | write-only | **must stay non-deletable**; only the 12-month trim in the scheduled job |

## C. Shared UI to reuse (and what must change)

| Piece | Today | R1 change |
| --- | --- | --- |
| Confirm dialog | `components/admin/confirm-submit.tsx` → `<dialog class="admin-confirm">` with `adminWork.deleteTitle` / `deleteBody` | Keep the component, but it must **name the item** ("মুছে ফেলবেন: ক্লাস ৭?"), and the body text is wrong for soft delete: `deleteBody` currently says "মুছে ফেললে আর ফিরিয়ে আনা যাবে না" ("cannot be brought back"). R1 replaces it with a 30-day Recycle Bin message in `bn.json`/`en.json`. |
| Toast | `components/admin/action-feedback.tsx` — announced, auto-dismiss **6.5 s**, no action button | R1 needs a 10-second toast with an **Undo** action. Extend this component (do not fork it) so every module gets Undo at once. |
| Empty states / skeletons | `empty-state` classes in editorial lists, `admin/loading.tsx`, `public-loading.tsx` | Reuse for the Recycle Bin page. |
| Bulk select | exists in the workbook review + due list patterns (`.center-bulk`, select-all in fee grid) | Reuse the pattern for bulk delete. |
| Recycle Bin page | **does not exist** | New route `/admin/recycle-bin` (+ sidebar entry, Super-Admin-only "delete forever"). |
| Scheduled job | **does not exist at all** — no cron route, no `vercel.json` (see `docs/STATUS.md` §4.1) | R1 must create the daily job (30-day purge, Cloudinary cleanup, 12-month log trim) plus `CRON_SECRET` handling, because the Recycle Bin purge depends on it. |
| `staff` role | **does not exist** (roles: `superadmin`, `admin`, `content_editor`, `exam_manager`) | R1 adds `staff` (archive/hide, no delete) in the User model, `permitted()` in `nav-items.ts`, and every guard — owner decision §6.2. |
| Soft-delete fields | **no model has `deletedAt`/`archivedAt`** | Add to each participating model + partial indexes only where the Recycle Bin query needs them. |

## D. Two more findings from this audit

1. **A fourth stale test.** `tests/center-cash-browser.integration.ts` targets
   `/admin/students/<id>/collect`, which is now only a `redirect()` to
   `/admin/students/collect?student=<id>`; waits for `.center-cash-form` and
   "লেনদেন বাতিল করুন", which exist **only** in the orphaned `components/admin/center-cash-form.tsx`;
   and fills `[name=paidOn]`, which is a hidden `BanglaDate` input in the live UI. It cannot pass.
   Retired with the reason in `docs/STALE-TESTS.md` §6; the cash flow itself is live in
   `components/admin/center-daily-collection.tsx` and its server logic stays covered by
   `tests/center-cash-batch.integration.ts` and `tests/center-daily-cash.integration.ts`.
   Browser coverage of the live collection screen is a gap to rewrite in R1/R2.
2. **A second orphaned component.** `components/admin/center-cash-form.tsx` (like
   `center-import-preview.tsx`) is imported by nothing in `src/`. Both are listed as an owner
   decision in `docs/STATUS.md` §6.4.

## E. R1 build order (each step gets `verify-plan` entries before delivery)

1. `deletedAt` / `archivedAt` / `deletedBy` / `purgeAt` fields + a shared `softDelete` / `restore` /
   `purgeExpired` library with reference counting (so "14 students use this class" is real).
2. `staff` role + guard updates; Delete = admin/superadmin, Archive = staff and above.
3. Convert the 9 hard deletes to soft deletes; keep `deleteMedia`'s reference check and move its
   Cloudinary destroy to the purge job.
4. Recycle Bin page (filter by type, restore, "delete forever" for Super Admin) + bulk select/delete
   + Undo toast (10 s) + ConfirmDialog naming the item.
5. Daily scheduled job: 30-day purge with Cloudinary cleanup, 12-month `SmsLog`/`ActivityLog` trim,
   `CRON_SECRET` bearer auth, `vercel.json` cron entry (R7 documents the setup).
6. Tests registered in `scripts/verify-plan.ts` as `R1.n`: delete→undo, delete→restore, blocked when
   referenced (exact message), permission checks (admin/staff/content_editor/exam_manager), purge job
   (fake clock), activity-log entry per action, no student data in URLs or logs.

**Status: audit complete; build-order steps 1-5 delivered, step 6 delivered for the twelve
participating kinds.** On branch `arena/c33e6ed1-diction`:

- **Step 2** — the `staff` role end to end (`R1.2`), and staff now also reach the admin lists through
  `getStaffPermission()` so they can archive; delete stays `requireAdmin`.
- **Step 1** — recycle fields on the twelve participating schemas plus `src/lib/admin/recycle.ts`
  (softDelete / restoreRecord / binList / binCounts / purgeOne / purgeExpired / archiveRecord,
  reference counts, exact blocked sentences in both languages) with a schema-level invariant that
  hides binned rows from find, findOne, count, distinct, aggregate, bulkWrite, every update and
  populate (`R1.1`, `R1.3`; written confirmation in `docs/R1-COVERAGE.md`).
- **Step 3** — the nine hard deletes converted; delete is `requireAdmin` everywhere.
- **Step 4** — Recycle Bin page (`/[locale]/admin/recycle-bin`: type filter, search, days left,
  Restore, Super-Admin-only Delete forever behind a typed name), named ConfirmDialogs that state the
  30-day rule instead of claiming permanence, 10-second Undo for single and bulk deletes, bulk select
  on the blog/notice/video/gallery and course lists, Archive offered when a delete is blocked
  (`R1.4`; click list in `docs/R1-START-HERE.md`).
- **Step 5** — `/api/admin/jobs/daily` with `CRON_SECRET` bearer auth, `vercel.json` cron at 01:00
  Asia/Dhaka, 30-day purge with Cloudinary cleanup and a 12-month log trim (`R1.5`, plus the live
  job proof inside `R1.1`).
- **Step 6, first wave** — controls for every participating kind: study materials, portal notices,
  lecture sheets, practice tests, achievements, FAQs and facilities, class groups, Center exams,
  courses and all editorial kinds. The `window.confirm('Permanently delete…')` dialogs on lecture
  sheets and practice tests are gone.

**Still owed (step 6, second wave):** the nine record types that are not part of the Recycle Bin
engine yet — trial slots, trial bookings, admissions, contact messages, hero banners, teachers
(faculty), portal accounts, legacy academic exams and model tests — plus the media card's Undo button
(it names the file and soft-deletes today, but restores only from the bin).
