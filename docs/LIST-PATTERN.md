# The list pattern: one row, one implementation

Every operator list in the admin is the same shape, and since group 1 it is the same **code**. R8
finished the Visitors list as a reference page; the owner approved it on one condition — the next list
is not a copy of that page but a composition of shared components, so a fix in one place fixes every
page. This is the contract those components make.

* `src/components/admin/list-pattern.tsx` — the row and everything on it.
* `src/components/admin/popover.tsx` — the floating surface, the calendar and the day field.
* `src/components/admin/month-popover.tsx` — the month picker and the month field.
* `src/components/admin/recycle-toast-host.tsx` — the toast, and `toastOnWrite` for a write that files
  its own row away.

Two lists are built from it today: **Visitors** (`/bn/admin/leads`, `visitors-row.tsx`) and
**Students** (`/bn/admin/students`, `students-row.tsx` + `center-student-list.tsx`). The next list
composes the same pieces and adds nothing of its own but its fields, its verbs and its vocabulary.

---

## 1. What a row is

```
[☐] who (name / id · class) | number + Call + WhatsApp | status badge | second chip | note | [Edit] [⋯]
```

One line, at most **five visible controls** including the tick, at most **72 px** tall on a desk width,
and no long action cell. The badge and the second chip **are** controls: one tap opens, the second
commits, a toast answers. Everything else a row can do lives in the labelled **⋯** menu, and a verb that
needs words from the operator (a reason, a month) is a small form inside that menu.

| Rule | Why | Where it is enforced |
|---|---|---|
| ≤72 px per row, ≤5 visible controls | a list is read, not scrolled | `list-pattern.tsx` composition + `.list-*` CSS; asserted per row in the browser suites |
| every target ≥44 px, ≥23 px only for a desk badge that shares its cell with a second badge | a thumb, and a counter operator standing up | `.pop-anchor`, `.list-dial`, `.list-act>.admin-mini-button`; `@media(min-width:761px)` shrinks the badge only |
| no horizontal overflow at 360/768/1024/1440 | the page scrolls, the table never does | `.list-table{table-layout:fixed}` with per-list widths; `noOverflow` in the suites |
| no native `type="date"` / `type="month"` anywhere | the native box reads mm/dd/yyyy in one browser and a spinner in the next, over a date the rules act on | `DatePopover` / `DayField`, `MonthPopover` / `MonthField` |
| one word per verb | two words for one act is two decisions for the operator | both destructive labels come from one catalogue namespace (`adminWork` for the bin, `center.row` for a student) |
| every write answers with a toast, on a surface that outlives the row | the row a write changes is often the row it removes | `useRowToast` for a row that stays, `toastOnWrite(action)` for one that leaves |
| a number is printed only for the roles that dial, and travels only in `tel:` and `wa.me` | a front desk dials; a URL, a log and an audit target are not a front desk | `PhoneCell` + each page's `seesNumbers` gate |

## 2. The pieces

`kind` is the list's own name. It is what makes one list's row addressable in a test without guessing at
another's (`data-visitor-open`, `data-student-edit`), and every class is painted **twice** — the
pattern's and the list's — so a list keeps the CSS it already had:

```ts
cls('student','who')      // "list-who student-who"
listTableClass('student') // "admin-table list-table student-table"
```

| Piece | What it renders | Markers it owns |
|---|---|---|
| `ListRow` | the `<tr>` | `tr[data-{kind}-row]` |
| `Cell` | a `<td>` that wraps something the list owns; `part` is its place in the row, which is what gives it a width on a desk and an `order` in the phone card | `.list-{part} .{kind}-{part}`, `data-label` |
| `WhoCell` | the name on one line (a flag beside it, never a third line) and the identity line under it; a long name truncates and rides whole in its `title` | `.list-name strong`, `.list-sub` |
| `PhoneCell` | the number for the roles that dial, then **Call** and **WhatsApp**; or the catalogue's word for "no number" | `[data-{kind}-phone]`, `[data-{kind}-call]`, `[data-{kind}-wa]`, `.list-dial` |
| `NoteCell` | one truncating line, or a dash rather than a hole | `.list-note-text` |
| `StatusChipMenu` | the badge as the menu: tap the badge, tap the new status. `hideCurrent` keeps the status it has out of its own menu; `extra` is a second badge a row owes (a do-not-contact warning) | `[data-status-badge]`, `[data-status-menu]`, `[data-status-option]` |
| `ChipPopover` + `ListChip` | a second chip that opens something — a menu of verbs, a calendar, a read-out. `value` is what a test reads it by and `tone` is what colours it, and they are not always the same word (a follow-up promised for tomorrow reads `tomorrow` and is coloured `later`) | `[data-{marker}-chip]`, `.list-chip.{tone}` |
| `RowMenu` | the ⋯ and its menu | `.pop-more .pop-anchor`, `[data-more-menu]` |
| `MenuForm` | a real submit inside the menu, for a verb that needs words. It closes when the write **lands**, not on click: closing detaches a form before the browser runs the click's activation behaviour, so a submit that shuts its own menu never submits and the tap looks accepted while nothing is written. It stays open on a refusal, where the operator can correct what they typed | `[data-more-{marker}]` |
| `MenuItem`-shaped buttons | `type="button"`, their own `FormData`, then `close()` — the same reason | `[data-more-{verb}]` |
| `MenuHint` | the sentence at the foot of a menu naming who may use the verb this role may not | `[data-more-admin-only]` |
| `ActCell` | the row's visible controls, then its ⋯, then anything the list owns (a drawer, a dialog) | `[data-{kind}-open]`, `[data-{kind}-edit]` |
| `RowEditForm` | the inline edit a row opens, in its own `<tr>` so the display row keeps its budget | `.list-edit-form`, `[data-{kind}-edit-save]`, `[data-{kind}-edit-cancel]` |
| `BulkBar` + `BulkMenu` | raised only while rows are ticked, and it says how many | `[data-{kind}-bulk-bar]`, `[data-bulk-count]`, `[data-bulk-clear]`, `[data-bulk-{verb}]` |
| `ListFilters` + `FilterToggle` | the filter panel: open on a desk, collapsed on a phone, and its summary says what is on so a collapsed panel is never the only sign a filter is active. A toggle is uncontrolled inside a GET form, or controlled by a list that searches by POST and keeps names out of the address bar | `[data-{kind}-filters]`, `summary`, `.list-filter-toggle` |

### The pickers

| Piece | Reads back as | Markers |
|---|---|---|
| `DatePopover` | our own calendar: month name from `Intl` in the account's language, weekday headers too, Dhaka's today ringed, `‹ ›` for months | `[data-cal-back]`, `[data-cal-month]`, `[data-cal-forward]`, `[data-cal-day="YYYY-MM-DD"]` |
| `DayField` | `dd/mm/yyyy` in Bangla digits, or `17 Nov 2026` in English | `[data-day-field]`, `[data-day-pick]`, `[data-day-clear]` |
| `MonthPopover` | twelve months of one year, `‹ ›` for years, Dhaka's own month ringed, `notBefore`/`notAfter` switch off the months the rules would refuse anyway | `[data-month-back]`, `[data-month-year]`, `[data-month-forward]`, `[data-month-pick="YYYY-MM"]` |
| `MonthField` | the month in the operator's words and digits | `[data-month-field]`, `[data-month-choose]`, `[data-month-clear]` |

Both fields carry their value in a **hidden input** under the name the query or action already reads.
A hidden input is barred from constraint validation, so `required` cannot hold a submit back: the caller
tracks the pick and **disables the verb until one has happened**. A dead button beats an error after a
submit.

Dhaka's day and Dhaka's month come from `dhakaDay()` / `dhakaCalendar()`, never from `new Date()`: the
operator's midnight is six hours ahead of UTC, so a picker built from the machine's clock opens on the
wrong month for six hours at every month's end.

## 3. The CSS

The pattern's rules live in `src/app/globals.css` under `.list-*` and `.pop-*`. A list adds **only** its
own column widths, because the widths are what a list owns:

```css
.list-table{table-layout:fixed}                 /* the pattern: cells own their width, text truncates */
.visitor-table{min-width:1066px}                /* check 44 · who 156 · call 292 · status 130 ·
                                                   follow 116 · note 92 · act 236 */
.student-table{min-width:1016px}                /* check 44 · who 180 · call 292 · status 120 ·
                                                   dues 130 · note 100 · act 150 */
```

Chip tones are the pattern's vocabulary, not each list's private colours: `none`/`clear` grey,
`today`/`paid` blue, `later`/`ok` green, `overdue`/`due` red, `held` amber.

Below 761 px the row becomes a **card** — `.list-table tbody tr` is a grid, every cell is a line with its
`data-label` beside it, and the order is tick · who · status · second chip · number with big **Call** and
**WhatsApp** · note · actions. That is why every cell takes a `label`: on a phone the label is half the
cell.

## 4. What a new list has to decide

1. **`kind`** — one word, singular, ASCII (`visitor`, `student`). It names the markers and the classes.
2. **Its columns** — seven is the budget the reference rows use; a per-list width block in `globals.css`
   is the only CSS it should need.
3. **Its verbs** — which are visible (Edit, and one more at most), which live in the ⋯, and which of
   those need words. One word per act, from one catalogue namespace, and the destructive end is the
   role's own: the verb this role may use, otherwise `MenuHint` naming who may.
4. **Its second chip** — what it reads (`value`, for a test) and how it colours (`tone`, for an
   operator), which are not always the same word.
5. **Its filters** — GET (values in the address bar) or POST (a name or a number never in a URL), and
   which of them *widens* the list to rows that are filed away rather than deleted (show closed, show
   removed).
6. **Which writes remove their own row** — those go through `toastOnWrite`; the rest can answer with
   `useRowToast`. A list whose rows are client state also has to **re-read** after a write, and must
   re-read on a *refusal* too: a conflict means somebody else wrote first, and a form left holding the
   old version numbers would be refused again for as long as the operator typed.

## 5. Proofs

| List | Suite | Registry rows | Screenshots |
|---|---|---|---|
| Visitors | `tests/visitors-reference-browser.integration.ts` (`npm run test:visitors:reference`) | R8.1 | `screenshots/r8/` |
| Students + profile | `tests/students-reference-browser.integration.ts` (`npm run test:students:reference`) | G1.1, G1.2 | `screenshots/g1/` |

`docs/R8-VISITORS-CHECKLIST.md` is the Visitors click checklist;
`docs/G1-STUDENTS-CHECKLIST.md` is the Students one. Both are written to be clicked, in order, by a
person — and every step in them is asserted by the suite beside it.
