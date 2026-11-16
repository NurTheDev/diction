# Group 1 · The Students list and profile: the owner's fifteen-step checklist

The Students list (`/bn/admin/students`) is the first list built **from** the shared pattern in
`docs/LIST-PATTERN.md`, not beside it. Click these fifteen steps in order; each one says what should
happen and what to look at. Every step is also asserted by
`tests/students-reference-browser.integration.ts` (registry rows **G1.1** and **G1.2**), and every
screen it mentions is photographed into `screenshots/g1/` at 360, 768 and 1440 px with its menus open.

Sign in as the demo admin unless a step says otherwise. The seeded sample data is eight students across
two classes: four months of dues on one, a single month on another, one paid up, one **held** with a
reason, one **long Bangla name**, one with no guardian number, and one **removed**.

| # | Step | Where to click | What must happen |
|---|------|----------------|------------------|
| 1 | **Read the list** | Sidebar → শিক্ষার্থী | Seven rows — the removed student is filed away, not deleted. Each row is one line, ≤72 px, with **four** visible controls plus the tick: name over id · class, the number with **কল** and **হোয়াটসঅ্যাপ**, the status badge, the dues chip, one line of note, then **সম্পাদনা** and **⋯**. The long Bangla name truncates inside its cell — hover it and the whole name is there — and the row is no taller or wider than the rest |
| 2 | **Filter by class** | **ফিল্টার** → ক্লাস → one class → **খুঁজুন** | The list narrows to that class and the panel's own summary says which filter is on, so a collapsed panel is never the only sign the list is not the whole list |
| 3 | **Filter by status** | **ফিল্টার** → অবস্থা → স্থগিত → **খুঁজুন** | One row: the held student, wearing the amber badge. The search itself is a POST — a name, a guardian's number or a student id never reaches the address bar, the browser history or a log |
| 4 | **Show the removed** | **ফিল্টার** → tick **সরানো শিক্ষার্থী দেখান** → **খুঁজুন** | Eight rows. The removed one wears the সরানো badge, its second line says which month it left for, it has **no Edit** and **no tick** — there is nothing to edit and nobody to message until it is restored — and its ⋯ offers **ফেরান** instead of **সরান** |
| 5 | **Edit a student** | A row's **সম্পাদনা** — always visible, never inside a menu | The row opens its own inline form underneath, with every field prefilled including the admission day (carried by the calendar picker, not typed into a browser box). Change the note and the school, press **সংরক্ষণ**: a toast says "পরিবর্তন সংরক্ষণ হয়েছে।", the form closes itself and the row reads the new note back without a reload. **বাতিল** closes it without writing |
| 6 | **Two operators, one student** | Open the same row's **সম্পাদনা**, let somebody else save that student first (or bump the record), then press **সংরক্ষণ** | The form refuses in the catalogue's own words — "অন্য কেউ এই তথ্য বদলেছেন…" — and changes nothing. It then picks up the record as it now stands **keeping what you typed**, so the second save lands instead of being refused for as long as you type |
| 7 | **Hold a student** | Tap the **status badge** itself, then tap স্থগিত | Two taps, no dropdown and no Save button. A toast says "হোল্ড দেওয়া হয়েছে।", the badge turns amber, the row re-reads, and the dues chip becomes **গণনা নেই** — a held student is outside the fee run, so a number there would be a lie |
| 8 | **Lift the hold** | Tap the badge, then সক্রিয় | "হোল্ড তোলা হয়েছে।", the badge goes green and the dues come back. The badge keeps the status it already has out of its own menu, so a menu is never two identical choices |
| 9 | **Read the dues** | Tap the **dues chip** | The months behind the total, one line each — month name, year and amount in your own digits — because a total with no months behind it is an argument with a guardian rather than an answer. A paid-up student reads **বকেয়া নেই** and says "কোনো বকেয়া নেই।" |
| 10 | **Open the ⋯** | A row's **⋯** (আরও) | Everything the row can do that is not one of its four controls, labelled: **প্রোফাইল দেখুন**, **এসএমএস পাঠান**, **পেমেন্ট নিন**, **হোল্ড**/হোল্ড তুলুন, and at the destructive end **সরান**. A held row also reads its reason out loud here ("হোল্ডের কারণ: …"), and a removed row reads when and why it left |
| 11 | **Remove a student** | **⋯** → **সরান** | A small form inside the menu: **কোন মাস থেকে ছেড়েছে** and **কারণ**. The **সরান** button is *dead* until a month is picked — a hidden field cannot be `required`, so a dead button stands where an error after a submit would. The month comes from our own picker (twelve months, `‹ ›` for the years, Dhaka's month ringed) and reads back in your digits. Submit and a toast says "শিক্ষার্থী সরানো হয়েছে।" — on the page, not on the row, because the row is the thing that just left. The audit line carries the month and the reason you typed |
| 12 | **Restore one** | Tick **সরানো শিক্ষার্থী দেখান** → the row's **⋯** → **ফেরান** → pick the month the fee starts again → a reason → **ফেরান** | "ফেরানো হয়েছে।" and the student is back in the list the centre works from. The resume month must be after the leave month, and the picker is the same one — the removed list (`শিক্ষার্থী → সরানো শিক্ষার্থী`) restores through it too |
| 13 | **Message several** | Tick two rows | The tick column has no heading; ticking raises a bulk bar that counts the ticks ("২ জন নির্বাচিত") and offers **নির্বাচিত ২ জনকে এসএমএস** — the same dialog every screen sends from, aimed at exactly that selection. **নির্বাচন বাতিল** takes the bar away. A new search clears the ticks, so a page of ticks can never be sent to a list nobody is looking at |
| 14 | **Use the profile** | **⋯** → **প্রোফাইল দেখুন** | The header keeps four labelled doors — **তথ্য সম্পাদনা**, **সরান** (admin only, and its dialog picks its month the same way), **এসএমএস**, **নগদ ফি** — and the panel's badge is the hold switch, from the same component the row uses. The standalone হোল্ড button that duplicated it is gone, so the profile and the list cannot drift apart about what a hold is |
| 15 | **Hand it to somebody else** | Sign in as the staff account, then as a content editor, and ask for `/bn/admin/students` | Both are sent back to the Overview — **not** an error screen blaming the database, which is what a thrown guard renders — and neither reaches a row, a name or a **সরান** verb. The sidebar offers them no শিক্ষার্থী door either: every screen behind it (the list, the cash desk, the fee grid, the dues) refuses them, and a door that closes on the person who taps it is worse than no door. A **Super Admin** may remove too, and the audit line names them rather than the administrator |

## What to look at while you click

* **Four controls and a tick, one line:** tick · name over id · class · number with **কল** and
  **হোয়াটসঅ্যাপ** · status badge · dues chip · note · **সম্পাদনা** **⋯**. The old long action cell is
  gone, and the badge and the chip do the work a dropdown plus a Save button used to do.
* **At 360 px the row is a card:** name, id · class, badge, dues, big **কল** and **হোয়াটসঅ্যাপ**, note,
  then **সম্পাদনা** and **⋯** — every one of them a thumb target, and nothing scrolls sideways at 360,
  768, 1024 or 1440.
* **No native date or month box** on the list, the profile or the removed list. A day comes from
  `DatePopover` and a month from `MonthPopover`, both reading back in the operator's digits and
  language, both anchored on Dhaka's own today rather than the machine's.
* **The number is printed** because every role that can open this list dials from it — and it is printed
  and nothing more: no URL, no link but `tel:` and `wa.me`, no audit target.
* **Removed is not deleted.** A removed student keeps their record, their history and their reason, sits
  behind a tick on the list and on the removed list of their own, and comes back through **ফেরান** with
  the month the fee starts again.
* **One implementation.** The Visitors list is painted by the same components: its table still carries
  `list-table` beside `visitor-table`, its cells `list-who` beside `visitor-who`, its filters
  `list-filters`. A fix to the row, the pickers, the bulk bar or the toast lands on both pages at once.
