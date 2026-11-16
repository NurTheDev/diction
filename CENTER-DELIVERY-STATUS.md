# Center module update — incomplete checkpoint

Despite the requested archive name, this is **not** a finished full-feature release. Do not use the new financial/import/SMS modules for real operations until remaining work, backups, reconciliation, security review and real-workbook acceptance tests are complete. Import and cash write flags are off by default; `CENTER_SMS_WRITE_ENABLED` and `CENTER_LEGACY_LINK_ENABLED` are also off. Never add real secrets to the repository.

## New in this checkpoint
- Admin-only read-only legacy review (`/bn/admin/students/legacy-review`) lists old student accounts, exact-name/phone Center suggestions and invoice/payment counts, flagging fractional taka, non-cash methods and missing references. Matching is approximate and exact-only; a suggestion is not identity confirmation. Legacy financial data is not copied, changed or deleted. An experimental, default-off, manually confirmed one-to-one identity link can be recorded separately with an audit reason. This is not full migration: payment conversion, invoice reconciliation and account/parent portal links remain unimplemented.
- Admin-only live overdue list (`/bn/admin/students/dues`) and authenticated CSV report for a selected current class. Partial fees become overdue after the Dhaka due day; pending/current, held and removed students are excluded. Multiple historical months, fee changes, holds and waivers are considered. It uses only new Center records, not legacy fees; class membership is current rather than historical; bounds fail closed at 1,000 students or a 20-year span. It is not a transactionally consistent immutable snapshot; concurrent writes can change calculations, and reconciliation remains necessary. CSV files contain personal information and must be handled securely.
- A low-level server-only BulkSMSBD adapter and estimated GSM/Unicode segment calculator exist, disabled by default. There is **no** SMS queue, UI, opt-out/quiet-hour enforcement, send workflow or duplicate protection; do not enable the flag. Ambiguous outcomes are not retried and provider acceptance is not proof of delivery. Provider documentation found at https://bulksmsbd.com/bulksms-api-bangladesh.php describes POST to https://bulksmsbd.net/api/smsapi and 202 for submission. Ownership, exact account-specific API behavior, Unicode billing and delivery reports remain to be verified with the actual service before use. No SMS was sent and no real credentials were used.
- Previous experimental import/undo, cash batch and read-only class/year fee grid remain as described in CENTER-IMPORT-WIP.md. Cash on hold remains blocked; legacy systems remain intact and independent.

## Still required
Complete safe reviewed, idempotent legacy migration, address historical methods/poisha and receipt ambiguity without data loss, implement snapshots, SMS end-to-end with safeguards and delivery status, exams/results, removed-student retention/restore, full reports/backups, account/parent links, new roles/security and remaining requested workflows. Real workbook marker meanings and styling remain unresolved. Existing high-severity pdfjs-dist security advisory remains. Do not infer completion of any feature from schema definitions alone.

## Tests
Node 22.23.4: production webpack build, `npm test`, `npm run typecheck`, synthetic browser tests `tests/center-dues-legacy-browser.integration.ts`, `center-fee-grid.integration.ts`, `center-cash-browser.integration.ts`, `center-import-e2e.integration.ts`; unit tests `center-dues.test.ts`, `center-due-csv.test.ts` and `center-sms-provider.test.ts` (the latter requires `NODE_OPTIONS=--conditions=react-server`). Mongo integration tests require an isolated replica set and browser binaries. These are synthetic and do not verify production services or the real workbook.

## User-confirmed migration and provider policy
Historical payments must preserve exact amounts in poisha and their original payment methods; do not round, relabel mobile/bank as cash, or invent receipt numbers. New collections remain whole-taka cash only. Identity-link records do not copy payments or claim to satisfy this conversion. Any eventual migration must preserve and reconcile voids, invoices, methods and exact amounts, prevent duplicate live dues, bind a preview to the reviewed source, remain repeat-safe, and leave old portal/fees active until independently verified. The confirmed SMS provider is bulksmsbd.net; actual credentials, account-specific documentation and delivery behaviour have not been tested.

`CENTER_LEGACY_LINK_ENABLED=true` enables only an experimental manual link, with admin authentication, explicit confirmation, reason, uniqueness checks, shared student lock, revision bump and audit. It remains off by default. Identity matches are suggestions, can be incorrect, and the current form supports only displayed exact-match candidates. The one-to-one link cannot yet be unlinked or corrected in the UI; do not enable for real records without a correction workflow, backup and full review. Synthetic tests cover link engine replay/conflicts and enabled/disabled browser forms; no real records were touched.

## Latest: experimental monthly overdue snapshots
Admin overdue list supports creating/viewing a class snapshot behind `CENTER_DUE_SNAPSHOT_WRITE_ENABLED`, disabled by default. It uses a MongoDB snapshot transaction, student locks, a request UUID for repeat submission, actor/audit records and stored student names, IDs, months (with year) and total amounts. It covers new Center records only and excludes currently held/removed students and non-overdue pending amounts. History and payments may still change after capture; the stored calculation does not recalculate. The application rejects normal Mongoose update/delete operations on snapshots, but direct database administrator access can bypass application protections; this is not a write-once storage system. New dependent writers must respect shared locks. Old fees are not included and reconciliation with legacy records is not complete. The safety flag should remain off until independent review, real-workbook validation and a verified backup. A replica-set transaction is required. This update supersedes earlier statements that there is no snapshot feature; other limitations remain.

Synthetic tests `tests/center-due-snapshot.integration.ts` cover request replay/concurrency, actor and class request binding, audit, attempted mutation and values remaining unchanged after subsequent changes. `tests/center-dues-legacy-browser.integration.ts` tests both default-off and explicitly-enabled forms. The production webpack build, baseline tests and typecheck passed. These do not establish production security or financial completeness.

## Latest: experimental Center exams and results
`/bn/admin/center-exams` provides exam-manager/admin access to one-class exams with up to eight subjects, manually reviewed full/pass marks and editable per-exam grade thresholds, single-student keyboard/tab mark entry (`A` for absence), competition ranking with ties and a guarded publish action. Writes require `CENTER_EXAM_WRITE_ENABLED=true` and are off by default. Published records are locked against further mark entry; the current UI has no correction/unpublish workflow. The result list ranks recorded students, not unentered roster members; names come from the current roster rather than a historical identity snapshot. It excludes students not currently marked active from mark entry, supports at most 500 current students/results and fails closed beyond that. No student/parent portal or SMS result delivery, detailed GPA calculation, class promotion history, teacher-scoped permissions, keyboard arrows/paste grid, real-data acceptance testing or multi-class exam UI exists. The suggested grading thresholds must be reviewed for the institution before use. User publication is internal to this admin module, not a public release.

For financial and operational safety, do not enable the new flags on real data until backups, real-workbook acceptance, access control and independent review are complete. Legacy migration, actual payment conversion, the SMS queue/delivery workflow, retention/restore/purge, full reports/backups and portal links remain unimplemented. Existing feature and exam schemas are not proof of completing the full project.

Synthetic tests `center-exam-marks.test.ts`, `center-exam-batch.integration.ts`, and `center-exams-browser.integration.ts` cover grading, invalid marks, absent/tie behavior, exam-manager access, default-off gate, two-subject creation, concurrent/stale marks, audit and publication. Baseline tests and standalone `npm run typecheck` passed. Webpack production build succeeded with TypeScript checking run separately; its in-build TypeScript step was temporarily skipped due to environment memory pressure, then the original Next config was restored. No real exam results or external services were tested.

## Latest: Center exams and results are a normal feature (R5 slice 1)

This section **supersedes** "Latest: experimental Center exams and results" above.

`CENTER_EXAM_WRITE_ENABLED` no longer exists in the code. Exam writes are not behind a flag; what
gates them is authorization — role plus the class groups a teacher is assigned to — decided once in
`src/lib/exams/exam-scope.ts` and read fresh on every request. The flag is still named in
`.env.example` as a line that says it does nothing, so an existing environment file is not silently
wrong.

What now exists beyond the earlier description: an exam covers **several classes** at once; marks are
entered on one keyboard-first grid (Enter down a column, arrows across, `A` for absence) with live
total, percentage, grade, GPA point and position, batched autosave, spreadsheet paste from the focused
cell, and CSV/XLSX upload through a preview that matches rows by student ID, roll or name in either
language and **lists** an unmatched, ambiguous or incomplete row instead of guessing it; positions are
computed **per class** (ties share a position, the next one skips, an absent student holds none);
publishing is reversible through an explicit, logged unpublish; grading scales are savable centre-wide
with GPA points and validated to cover 0–100 exactly once; and a teacher reaches their own exams from
the portal home. A teacher sees only assigned classes, and their exam view is built from a query that
never selects fee history, dues, receipts, cash or guardian numbers — asserted both by serializing the
view a teacher receives and by reading the painted screen.

Publishing can now tell a family the result. The `exam_result` template's default body is the spec's own
sentence, and its four per-student chips — the exam, that child's subject-wise marks, their total against the
exam's full mark, and their position — are filled from the rows publishing wrote, so every message quotes one
child: siblings sharing a guardian number get one message each, because their marks are not one sentence. A
child who was absent, or whom publishing has not ranked, is counted on the batch as incomplete and sent
nothing, rather than texted a total of zero. The send stays behind the `autoResult` toggle, OFF by default,
and a failure lands on the Automatic-SMS problems card instead of failing the publish. The deviation is worth
naming: §R5 of the spec asks for a "Send result SMS now?" prompt at publish time, and what exists is that
toggle honoured by publishing — the decision is made once, in advance, on the SMS page.

Still **not** delivered, and not to be inferred from the schema: the student's result history and
improvement chart, the portal Results tab for a linked student, and any report-card PDF (the rest of R5
slice 2). Names and classes still come from the current roster, not a historical snapshot; the
500-student cap still fails closed; publication remains internal to this admin module and is not a
public release. No real exam results, real workbooks or external services were used — the proofs are
synthetic and labelled নমুনা.

Synthetic tests: `tests/exam-rules.test.ts`, `tests/exam-grid.test.ts` (no database, over a real CSV
and a real XLSX built in the suite) and `tests/exam-result-message.test.ts` (no database: the result SMS
rendered through the shipped template and renderer, and what gets no message at all), `tests/exam-flow.integration.ts` (disposable database: scope,
batched marks with stale and refused rows named, absence, per-class positions, publish/unpublish,
subject and class locks, recomputed grades, two concurrent saves settling as one write, and the
payment-free teacher view) and `tests/center-exams-browser.integration.ts` (driven in the browser at
360 px and 1440 px in both languages, photographed into `screenshots/r5/`). The result send itself is proved
where the send already was: `tests/sms-dialog.integration.ts` seeds a published exam and asserts the exact
sentence each family receives, and `tests/sms-auto-problem.integration.ts` asserts that a retried send still
quotes that child's own numbers and that an exam with nothing to report is not a problem.
`tests/center-exam-batch.integration.ts` is deleted: it asserted the pre-R5 signatures, and its two
claims nothing else made — the concurrent-save race and the student revision counter — moved into
`tests/exam-flow.integration.ts`. `tests/center-exam-marks.test.ts` remains, because
`src/lib/center/exam-marks.ts` is still the engine the new rule layer reads through.

Verified in CI, not only on a workstation: run **43681561293** on commit `0308c16` reports **55 requirements
PASS, 0 FAIL, 0 NOT TESTED**, tagged `r5-verified`, with the photographs in `screenshots/r5/`. Getting there
found seven product defects that no local run could reach — a teacher refused marks for the class the screen
had just shown them, Latin digits inside otherwise Bangla sentences, a class summary that counted marked rows
and called them students, a grading-scale edit that failed on every exam with stored results because a stored
subject id is an ObjectId, a marks grid on the portal that painted catalog key paths because no provider above
it shipped its group, and two screens that scrolled sideways at 360px.

One of those is bigger than R5 and is recorded here so it is not lost: the catalog suite now checks that every
page hands its client components the group they read, and it found two screens that were broken the same way
as the teacher's grid: `/practice-tests/[slug]` and the student's practice history rendered a client component
reading `practicePublic`, which nothing shipped, so both painted key paths instead of sentences in production.
Both are fixed — `practicePublic` is two keys and the first route is public, so it joined `PUBLIC_NAMESPACES`,
the list the root layout now reads from `src/i18n/client-namespaces.ts` rather than holding its own copy.

The same check names **ten routes as debt**, and the debt is narrower than a broken screen: each imports an
admin control that a role gate never mounts — the student and parent fee screens pull in the invoice form and
its student-search picker (`center`) behind `{role==='admin'&&…}`, and the materials and notices screens of all
three portal trees pull in the publish and delete controls (`adminWork`) behind `{isAdmin&&…}`. Nothing paints;
what it costs is an admin control and its catalog group riding in the JavaScript of a student's fee screen.
`tests/i18n-catalog.test.ts` fails if that list grows and fails if a fixed route is left on it. The fix is to
split the portal component from the control only an admin mounts — and **not** to ship the group, which is the
tempting one-line answer and the wrong one: `center` holds the dues vocabulary and may be shipped to an admin
and never into the teacher, student or parent trees.

The result SMS is verified the same way: run **43686815982** on commit `84b7c0a` reports **56 requirements
PASS, 0 FAIL, 0 NOT TESTED**, the new row being **R5.5** — `tests/exam-result-message.test.ts`, which needs no
database and compares the sentence, rendered through the shipped template and the shipped renderer, with the
wording in §R5 of `docs/SPEC.md` byte-for-byte. The first attempt failed three rows, and all three were suite
faults only CI can find: a stored `CenterExamResult` requires `recordedBy`; the result row has **no** `absent`
field, absence being the grade `ABSENT` the engine writes, so selecting one is reading a convention nobody
implemented; and the browser suite counted nine variable chips, a hard-coded claim about a catalog this slice
deliberately grew to thirteen.

Slice 2 is now finished, and the four things it finished are four different kinds of honesty. Publishing asks
first: a dialog with the review box, the result-SMS box and a count computed the way the send counts — the
same candidates, the same sibling rule, the same stored template, the same chip-completeness check — with
nothing written, and `autoResult` demoted to the box's starting state; ticked sends with the setting ignored
because the operator has just consented, unticked publishes and writes no batch, and the screen says which.
The student's profile has a Results tab with the published exams newest first and a trend drawn as SVG: an
exam the child missed is left out of the line and counted as skipped, because an absence is 0 percent and
plotting it would draw a collapse that never happened. The portal has `/dashboard/results` and
`/parent/results`, two routes for two roles, reading only the children on the account's own exact phone
number — a student never its sibling on the same guardian number, a number one digit away nothing, a removed
child nothing — through a reader that selects marks, totals, grades and positions and asks for no fee,
payment, receipt, due or number at all, which is the only way "no payment data in the portal" holds. And the
report card quotes the stored row, carries `common.brand`, leaves the remarks as two ruled lines and a
sentence saying nothing has been written yet — no field stores a teacher's remark and a card that invented
one would forge the part a family reads aloud — and under `@media print` the sidebar, header, tab bar and
toolbar take no space, which is what makes it printable rather than a screenshot of a screen.

One fault only CI could find: the prompt's count was zero for every draft exam, because `resultMessage`
refuses a row with no position and positions are written by publishing — so the prompt said "there is no
result to send" about an exam holding four marked rows, and the send that followed wrote four messages.
The refusal stayed; the ungated reader now ranks a draft per class with `positionOf`, and
`publishCenterExam` ranks with the same pure function instead of its own inline copy, so the count and the
ranks a family is texted come from one rule.

The same cross-check found a fault that had been in the send engine since R2: `sendChunks` grouped rows by
phone and transmitted only the first message of each group. For a merged sibling reminder that is correct —
one sentence, one call, two log rows — but a result send refuses to merge two children whose marks differ,
so the plan held two different bodies for one number, the second never left, and both rows were marked
`sent`. Grouping is now by phone and message. R2.8 had asserted the log rows, and the rows were right while
the wire was not; only a count that had to equal a real send could see it.

Verified: **59 requirements**, the new rows **R5.6** (the trend and the chart's geometry, pure), **R5.7**
(the history, the card's two refusals, portal identity and the prompt's count against the disposable
database, including a real send whose `sentCount` must equal the count the prompt showed) and **R5.8** (all
four screens in the browser, photographed at 360 px and 1440 px in Bangla and English into `screenshots/r5`,
including one report card under print media), with **R5.4** and **R0.13** reworded in the same patch.
