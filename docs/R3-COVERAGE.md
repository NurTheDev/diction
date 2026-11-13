# R3 coverage confirmation — Visitor leads, in writing

Every sentence of `docs/SPEC.md` §R3, answered point by point with the file that implements it and the
test that proves it. Verify requirements **R3.1 – R3.6** are implemented (wave A foundations, plus the
wave-B rule layer); `npm run verify` reports all 34 requirements (R0 + R1 + R2 + R3).

Proven, not claimed: wave A at **32 PASS / 0 FAIL / 0 NOT TESTED** (run 43381282853, evidence
`4e6473c`) and R3.6 at **33 PASS / 0 FAIL / 0 NOT TESTED** (run 43385394912 on `494dbbd`, evidence
`49c01de`), with `unit-test-lead-rules.txt` exit 0 in `test-results/ci-latest/logs/`.

Nothing below is a claim from reading code: each row names a suite that runs in CI on every push.

| Suite | Runs as | Needs |
| --- | --- | --- |
| `tests/lead-vocab.test.ts` | `test:lead:vocab` (R3.1) | nothing but Node |
| `tests/lead-date.test.ts` | `test:lead:date` (R3.2) | nothing but Node |
| `tests/lead-phone.test.ts` | `test:lead:phone` (R3.3) | nothing but Node |
| `tests/lead-class.test.ts` | `test:lead:class` (R3.4) | nothing but Node |
| `tests/lead-model.integration.ts` | `test:lead:db` (R3.5) | disposable database |
| `tests/lead-rules.integration.ts` | `test:lead:rules` (R3.6) | disposable database |
| `tests/lead-phone-search.integration.ts` | `test:lead:search` (R3.7) | disposable database + reads `src/` |
| `tests/recycle-coverage.test.ts` | `test:recycle:coverage` (R1) | nothing but Node — now counts 22 bin schemas, `lead` among them |

**Wave order, as agreed:** A foundations (§1–§5), B screens (sidebar group **ভিজিটর**, quick-add, list,
detail drawer, Overview widget, SMS entry point), C the import wizard and reports. Wave B opened with
its rule layer (§6, R3.6) — the decisions a screen cannot make on its own — so the screens that follow
have nothing left to invent. Waves B and C add R3.7 onward and their own sections here; nothing in this
document is written against a screen that does not exist yet.

---

## 1. Vocabulary and the three standing rules (`src/lib/leads/vocab.ts`) — R3.1

The brief's lists, as one vocabulary both the server and the screens read:

| List | Values |
| --- | --- |
| Status | `new`, `called`, `interested`, `trial_booked`, `admitted`, `not_interested`, `no_answer`, `do_not_contact` |
| Source | `walk_in`, `phone`, `facebook`, `referral`, `other` |
| Shift | `morning`, `evening`, `any` |
| Medium | `bangla`, `english_version`, `unknown` |
| Group | `science`, `arts`, `commerce`, `unknown` |
| Note outcome | `no_answer`, `call_back_later`, `interested`, `not_interested` (or none) |

Every value has Bangla and English words in the same file, so no screen can drift from another, and the
suite asserts there are no duplicates and no Bangla label written in Latin letters.

**Rule 1 — "Do not contact" is sticky.** It is both a status and its own boolean. `statusToFlags()` sets
the boolean when the status is set, and moving the status back does **not** clear it; only an explicit
un-mark does. `canContact()` is the single gate every sending path asks, and `CONTACTABLE_LEAD_FILTER`
is the same rule as a query, so a bulk send to a hand-picked selection filters at the database and
cannot drift from the predicate a single send uses. R3.5 asserts the two agree for all eight statuses.

**Rule 2 — a number is never in a URL, an audit target or a log line.** A lead is addressed by its id
(`leadPath`). `leadListQuery()` builds the list's URL filters and *refuses* a search term that looks
like a number — in Bangla digits too — returning `refusedPhone:true` so the caller posts the search
instead of putting it in the query string, where it would land in browser history and the host's access
log. A name or a school stays a URL parameter, because that is what makes a filtered list shareable
between two admins. `maskPhone()` / `maskedPhones()` are what a log line gets.

The two hrefs that must carry a number — the `tel:` call button and the `wa.me` link the brief asks for
on every row — are built in `src/lib/leads/lead-phone.ts` and nowhere else. They are third-party
destinations in the operator's own browser: never a route of this app, never a query parameter, never
logged, never audited. That is the reading under which requirement 2 ("a call button and a WhatsApp
link on every row") and requirement 4 ("numbers never appear in URLs or logs") are both satisfied, and
it is stated here rather than left implicit.

**Rule 3 — a follow-up is a day, not an instant.** It is stored and compared as `YYYY-MM-DD` in
Asia/Dhaka, so ISO day strings compare exactly and "today" and "overdue" need no timezone arithmetic at
query time. `nextFollowUpDay()` implements the five buttons; `followUpState()` answers
`today | overdue | later | none`, where `none` is its own state rather than an overdue one. Pinned in the
suite: next week is seven days (not "the next Monday", which would hide a lead), 31 February is refused
rather than rolled into March, the year rolls by calendar, and 23:59 versus 00:01 land on the right day.

Also here: `familyKeyFromPhones()` — the smallest shared number, so siblings tie deterministically
whichever order their numbers were written in — and `archiveSuggestionDay()` / `suggestsArchive()`, the
18-month rule, which is a **suggestion** and never an automatic delete.

**The family key is inherited, never recomputed** (proven in §5, and the rule `src/lib/leads/leads.ts`
must call in wave B): a new row that shares a number with an existing lead takes **that lead's**
`familyKey`, because `familyKeyFromPhones()` over the new row's own numbers can return a *different* key
and silently split one family into two. The DB suite asserts both halves — that one indexed lookup on
`phones.normalized` finds the holder, and that the freshly computed key would have been the wrong one.

## 2. Dates (`src/lib/leads/lead-date.ts`) — R3.2

One rule reads every spelling in the brief: **day first**, two-digit years mean 20xx. `2/12/2024` is 2
December; `15.12.24`, `2-12-24`, Bangla digits, stray spaces, ISO and a real xlsx cell (UTC midnight,
still that day in Dhaka) all read.

What is doubtful is reported, never repaired:

| Case | Result |
| --- | --- |
| both parts could be a month (`2/12/2024`) | read day-first **and** `ambiguous:true`, so the preview can say "read as 2 December" |
| the first part cannot be a month but the second can (`12/25/2024`) | read month-first, `format:'month-first'`, reported as the exception it is |
| `31/02/2024`, `31/11/2024`, day 0, day 32 | refused as `impossible`, quoting the owner's own text |
| `abc`, `15/12`, `2024`, empty | refused as `unparseable` / `empty` |
| a four-digit year outside 2000–2100 | refused, and **not** told it was read as 20xx |
| a date after today, or more than five years old | flagged on the row, value kept |

`flagSuspiciousYears()` is the sheet-level rule: a year that disagrees with the sheet's own majority
(`2014` among rows that all say `2024`) is flagged with the majority year **suggested** for the same
month and day. It changes nothing. No suggestion is offered when it would land in the future or is not a
real date, though the doubt is still named; and a tie has no majority to appeal to, so nothing is
flagged rather than a winner picked.

## 3. Phone numbers (`src/lib/leads/lead-phone.ts`) — R3.3

`parsePhoneCell()` returns `{phones:[{normalized,original}],flags,sawText}`. The original spelling is
always kept beside the normalized number, because a flag has to be able to quote what was written.

| Written | Read |
| --- | --- |
| `01712817090`, `০১৭১২৮১৭০৯০`, `(01712) 817-090` | one number, `01712817090` |
| `0 1934-595247` | one number, `01934595247` — a space inside a number is a separator, not a second number |
| `1712817090` | `01712817090` — the leading zero is the national format, not a guess |
| `+8801712817090`, `8801712817090` | `01712817090` |
| `01712817090,01911223344` (also `;`, a line break, a space, or a Bangla word between them) | two numbers |
| `01712817090 বাবা` | one number; the label is neither part of it nor a second number |
| `01712817090, 01712817090` | one number |
| `0171281709` (ten digits) | **no number**, flagged `short`, never padded |
| `01212817090` | no number, flagged `invalid` — that prefix does not exist |
| `01712817090123` | one number, plus a flag `extra` for the digits left over — reported, not folded in |
| `না` | no number, flagged `not_a_number`, text kept, `sawText:true` |
| `''`, `null` | `sawText:false` — "nothing written" is not the same as "something unreadable" |

The same `normalizePhone()` the SMS engine uses is the authority on what a valid number is; this module
only adds what a handwritten cell needs (splitting, cleaning, flagging, keeping the original).

## 4. The class column and the other columns (`lead-class.ts`, `lead-columns.ts`) — R3.4

`normalizeClassLabel()` returns the raw `classLabel`, a `classGroup` of 1–12 **or null**, `newSession`,
`exam`/`examYear`, a preview sentence in both languages, and flags. `null` does not mean "no class"; it
means **not derived**, and the flag says why.

| Written | Read |
| --- | --- |
| `XI`, `xi`, `XII`, `IX` | 11, 11, 12, 9 — from a fixed table, so `IIII` is not 4 |
| `7`, `৭`, `নবম`, `দশম শ্রেণি`, `Class 9`, `শ্রেণি ৯`, `grade 11` | 7, 7, 9, 10, 9, 9, 11 |
| `New 9`, `new 6`, `নতুন ৯`, `9 (New)` | the class, with `newSession:true` — its own flag, not a guess about the year |
| `SSC 25` | class 10 for a 2025 visitor, 9 for 2024, 11 for 2026 — arithmetic on the visit year, with `exam`/`examYear` kept |
| `HSC 26` | class 12 (or 11 a year earlier) |
| `SSC 14` | **no class**, flagged `exam_year_out_of_range`, exam and year still kept |
| `IIII`, `XIII`, `13`, `১৩`, `Column 1`, `-`, `N/A`, `class` | no class, label kept exactly as written, flagged in both languages |

The value and header mappers in `lead-columns.ts` are lookup tables, and an unmapped cell becomes `null`
— never a default, because a defaulted medium is a wrong textbook. `normalizeSource('অজানা')` and
`normalizeGroup('Other')` are `null` for the same reason, and a phrase with no exact reading
(`পরিচিত কারো মাধ্যমে`) is not filed as a referral: substring matching would call
`ফেসবুকের মাধ্যমে` ("through Facebook") a referral.

`mapSheetHeader()` knows the sheet's own columns (Date, Name, Class, Institute, Number, Group, Shift,
Medium, Comments, plus follow-up, status and interested-in, in Bangla or English) and returns `null` for
anything else — which in wave C becomes a question to the owner rather than a silent drop.
`isUnnamedColumnHeader()` recognizes the shape a spreadsheet gives a column nobody named (`Column 1`,
`col 2`), and `unmappedHeaderQuestion()` asks two different questions: "this column has no name — what
does it hold?" and "this column was not recognized — which field does it belong to?"

## 5. The record (`src/models/Lead.ts`) — R3.5

Every field the brief lists: `leadId`, `date`, `studentName`, `guardianName`, `phones[]`, `classLabel`
+ `classGroup` + `newSession` (+ `exam`/`examYear`), `school`, `group`, `shift`, `medium`, `source`,
`interestedIn`, `status`, `nextFollowUp`, `assignedTo`, the notes timeline, the links to a converted
admission / trial booking / student, `familyKey`, `importSource` (+ `importBatch` for idempotent
re-import) and soft delete through `addRecycleFields`.

Three decisions worth stating, because each looks like an omission otherwise:

1. **`flags[]` is stored**, not shown once and forgotten: a doubt imported in November is still honest
   about itself in March. Nothing is repaired silently.
2. **`studentName` is required.** A lead with no name cannot be called, and inventing "Unknown" would be
   a guess — so the importer keeps such a row in its own preview and asks for the name before a Lead is
   written. The raw sheet row is never lost; it just is not a lead yet.
3. **`nextFollowUp` is a day string**, per rule 3 above, indexed with `{status:1,nextFollowUp:1}` and
   `{nextFollowUp:1}`; `{'phones.normalized':1}` makes duplicate detection a lookup rather than a scan.

`nextLeadId()` issues `V-2026-0007`-style ids following the **highest** id of the year (not a count), so
a purged lead cannot hand its number to somebody else, and a new year restarts at `0001`. The unique
index stays the backstop if two admins quick-add at the same moment.

**Recycle Bin:** `lead` is registered in `recycleKinds` and in `recycleRegistry` as **ভিজিটর লিড /
Visitor lead**, named by its student (or by its id when no name was written). It is deliberately **not**
archivable: a lead has no unpublished state, and the 18-month rule is a suggestion on the list, not a
field write. A lead that has already been converted — an admission, a student or a trial booking linked
— is **reference-blocked**, because deleting it would lose that link; unlinking it makes it binnable
again. `tests/recycle-coverage.test.ts` now asserts 22 bin schemas and that the registry and the schemas
are the same 22 types.

## 6. The rule layer (`src/lib/leads/leads.ts`) — R3.6

The five pure modules decide what ONE row means. This module decides what the collection around that row
means, and it is the only place outside the model that queries `Lead` — screens and server actions call
it. Proven by `tests/lead-rules.integration.ts` against the disposable database.

**Writing a lead.** `createQuickLead()` takes what the operator typed and nothing more: a name is
required; a number is read by `parsePhoneCell`, so Bangla digits normalize while the spelling as typed is
kept beside it, two numbers in one box are both kept, and an unreadable one is refused with the reader's
own Bangla sentence rather than dropped. A class label goes through `normalizeClassLabel`, which means
`পঞ্চম শ্রেণি` — a word the reader does not hold — is stored as written with `classGroup:null` and an
`unrecognized` flag, not bent into a number. Group, medium and shift keep their honest "we do not know"
values, no follow-up is invented, and a `custom` follow-up of 31 February is refused. Every refusal
returns `{ok:false,code,messageBn,messageEn}`; nothing throws at an operator and nothing is written.
`createSheetLead()` is the importer's write and differs in one deliberate way: an unmapped vocabulary
cell becomes `unknown`/`other` **plus** a flag quoting the sheet (`code:'unmapped'`), because "the sheet
said something we could not read" must never be stored as "the sheet said nothing". The Bangla comment
becomes the first note, attributed to whoever ran the import.

**The family key is inherited.** `resolveFamilyKey()` does one indexed lookup on `phones.normalized` for
every number on the new row, takes the smallest EXISTING key, and — when one row turns out to bridge two
families — adopts the smaller key and re-points the leads holding the other, returning `mergedFrom` and
`mergedLeads` so an import can report the merge. Recomputing the key from the new row alone would have
chosen its own smallest number and split one family in two; R3.5 step 7 pinned that, and this module is
the fix. A lead with no readable number gets `familyKey:null` and none is invented.

**Reading the list.** `listLeads()` puts `q` through `leadListQuery()` first — the same function that
refuses to build a URL containing a number — so a phone-shaped search is dropped at the query layer too,
in ASCII digits and in Bangla digits, and reported as `refusedPhone` for the UI to say out loud. Names,
guardians, schools, interests and lead ids stay searchable, because `?q=রাহুল` leaks nothing. Status,
group, shift, medium, source and class filters are checked against the vocabulary and ignored when they
are not in it, so a typo in a URL cannot widen or narrow a list by accident. `followUp=today|overdue|none`
is one comparison against a Dhaka day string.

**The board.** `followUpBoard()` returns today's count, the overdue count and the rows sorted oldest
promise first, each already labelled `overdue`/`today` by `followUpState` so no component does date
arithmetic. `leadDetail()` returns the row, its notes newest-first with the writer's NAME resolved from
`User`, and the rest of its family — the drawer's whole payload in one call.

**Do not contact, at the database.** `updateLeadStatus()` runs the status through `statusToFlags`, so
`doNotContact` is sticky: moving the status back to `called` does not clear it. Lifting it is
`setContactPermission()`, its own audited action, which also moves a `do_not_contact` status off itself so
a row cannot say both. `contactableLeads()` applies `CONTACTABLE_LEAD_FILTER` as its own `$and` branch, so
no caller-supplied filter can override it — a bulk send asking for `{doNotContact:true}` gets an empty
list — and it returns `excludedDoNotContact` and `withoutPhone` beside the recipients, because a send
dialog that quietly drops three parents is worse than one that says so.

**Numbers stay out of logs.** A Mongo duplicate-key error quotes the value it collided on, and for a lead
that can be a phone number, so `writeRefusal()` logs only the error code and the field names and shows the
operator a sentence without a value in it. `duplicatePhoneGroups()` returns MASKED numbers with the lead
ids and names beside them. Every audit row this module writes targets a `leadId`. The suite asserts all
three, including that no `lead.*` audit target matches `01[3-9]\d{8}`.

**Idempotency and ids.** `importBatchSummary()` counts a batch and names the file it came from, so the
wizard can ask "this file was already imported — 40 leads — import again?" instead of doubling the list.
`nextLeadId()` hands out ids by reading the highest existing one, so two operators saving at once can be
given the same id: the unique index is the real guard, and the write retries once behind it.

## 7. Searching by number, and where a number may travel — R3.7

**The requirement, in the owner's words:** staff can still search leads by phone number from the
Visitors list — typed digits, partial numbers, Bangla digits, with or without the leading zero — and the
number must travel by form submission or server action, never in a URL, a log or an analytics event.
Both halves are implemented and both are tested; neither is a promise.

**How a number is read** (`phoneSearchDigits()` in `lead-phone.ts`, unit-proven inside R3.3's suite):
Bangla digits are converted, every non-digit is dropped, a leading `0088` or `88` is recognised as a
country code and removed — but only when what follows is long enough to be a national number, because a
Bangladeshi mobile never starts with 88 — and the leading zero is kept or absent indifferently. What
comes out is the digit run that gets matched, plus `hadCountryCode` and `hadLeadingZero` so a UI can say
what it understood. Under four digits is refused, over fifteen is refused, and a refusal quotes **how
many** digits were typed in Bangla numerals, never which.

**How it matches** (`searchLeadsByPhone()` in `leads.ts`): one substring match on `phones.normalized`,
which is why every spelling works — `01712817090`, `1712817090`, `০১৭১২৮১৭০৯০`, `+8801712817090`,
`0088 017…`, `017-128-17090`, `(017) 128 17090`, `৮৮ ০১৭১২৮১৭০৯০`, the last four `7090`, a middle
fragment `1712817`, and either number of a lead that holds two. Matching on the normalized field is also
why a number stored behind a label (`বাবা ০১৭১২৮১৭০৯০`) is found. A substring match cannot use the
index an exact match would: accepted deliberately, because a centre's visitor list is thousands of rows
and "find this parent" is worth more than the last millisecond. The result reports `total` beside a
limited `hits` array, so "two shown" is never mistaken for "two exist". A number nobody holds answers
`empty` with a Bangla sentence; a binned lead is not resurrected by a search and is findable again the
moment it is restored.

**How it travels.** The only door is `searchLeadsByNumber()` in `src/actions/leads.ts` — a server
action, i.e. a form submission, guarded by `requireArchiver()` (Admin and Staff; Teachers excluded). The
GET path stays shut and the two thresholds are tied to one constant so they cannot drift:
`leadListQuery()` refuses to build a URL containing a digit run of `PHONE_SEARCH_MIN_DIGITS` or more
(`?q=01712817090` becomes `/bn/admin/leads`, in Bangla digits too, and so does `?q=7090`), and
`listLeads()` refuses to apply one. A name, a school or a lead id is still a legitimate URL parameter —
that is what makes a filtered list shareable — and `V-2026-0001` is not a number.

**What is proven about leaks**, in `tests/lead-phone-search.integration.ts`:

- `console.log/error/warn/info` are captured across every search and read back: no fixture number
  appears, in ASCII or in Bangla digits, with or without its leading zero.
- Every `lead.phone-search` audit target is a mask (`****`, or `01****90` for eight digits or more);
  nothing with a four-digit run is audited anywhere under `lead.*`. A search *is* audited, because
  looking a parent up by number is worth accounting for — the digits simply are not the account.
- `phoneSearchMask()` shows nothing at all under eight digits, because the last four of a mobile number
  are the identifying part and a "mask" of them would be the number.
- In the returned payload the only fields carrying a full number are `tel:` and `wa.me` — the two
  destinations the brief requires, built in one place, third-party, never a route of this app — and
  `leadPath()` for every hit carries no digits.
- Structurally: `src/actions/leads.ts` exports **only** async functions (one value export corrupts every
  server action in the app), calls its guard before anything else, builds no href and reads no query
  parameter, and its single `console.error` passes an error *name* — never the error text, because a
  driver error can quote the value it choked on and here that value is a parent's number.
- And there is no analytics to leak into: the suite scans every `.ts/.tsx/.js/.jsx` file under `src/` for
  fourteen tracking globals (`gtag(`, `googletagmanager`, `dataLayer`, `fbq(`, `plausible.io`,
  `mixpanel`, `amplitude`, `posthog`, `segment.io`, `clarity.ms`, `hotjar`, …) and asserts **zero**
  matches. Today that is trivially true; the point is that if anybody ever adds analytics, this test
  fails and asks "can it see the leads search?" instead of letting the question go unasked.

## 8. What is still not done, stated plainly

1. **There is still no screen.** No sidebar group, no quick-add, no list, no drawer, no Overview widget —
   §6 is the layer they will call, and nothing in it renders anything. The rest of wave B owns the
   screens, and `docs/R3-START-HERE.md` (the operator guide) comes with them, because a guide to buttons
   that do not exist would be a lie.
2. **No import wizard.** `lead-columns.ts` holds the header and value rules the wizard will use, and
   `importSource`/`importBatch`/`flags[]` are already in the schema for it, but nothing reads an xlsx
   yet. Wave C.
3. **No reports and no CSV export.** Wave C.
4. **No SMS entry point for leads.** The `visitor_thanks` template exists since R2 and the dialog is
   source-driven, so wave B adds a `lead`/`leads` source kind in `src/lib/center/sms-source.ts` and
   renders the same `SendSmsDialog` — with `CONTACTABLE_LEAD_FILTER` deciding who is in the list.
   Nothing is sent while `SMS_PROVIDER=mock`, and the real provider stays off.
5. **Permissions** (Admin and Staff, Teachers excluded) are enforced by the guards wave B's routes and
   actions use; there is no route to guard yet.
