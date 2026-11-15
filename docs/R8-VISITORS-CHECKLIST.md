# R8 · The Visitors page: the owner's ten-click checklist

The Visitors list (`/bn/admin/leads`) is the reference implementation of the new list row. Click these
ten steps in order; each one says what should happen and what to look at. Every step is also asserted
by `tests/visitors-reference-browser.integration.ts` (registry row **R8.1**), and every screen it
mentions is photographed into `screenshots/r8/`.

Sign in as the demo admin unless a step says otherwise.

| # | Step | Where to click | What must happen |
|---|------|----------------|------------------|
| 1 | **Add a visitor** | The bottom bar's "নতুন ভিজিটর" on a phone, or the same button above the list on a desktop; fill name, number, class, school; press Enter | The panel reports the id it wrote (`V-2026-0001`), clears itself for the next visitor, and the new row appears at the top of the list |
| 2 | **Edit a visitor** | A row's **Edit** (সম্পাদনা) — it is always visible, never inside a menu | The drawer opens in edit mode with every field prefilled, including the full number; change the school, press **Save**; a toast says "সংরক্ষিত হয়েছে" and the row reads the new school back. **Cancel** closes it without writing |
| 3 | **Change a status** | Tap the **status badge** itself, then tap the new status | Two taps, no dropdown and no Save button. A toast says "অবস্থা বদলেছে।" and the badge changes colour and word |
| 4 | **Set a follow-up** | Tap the **follow-up chip** ("আজ", "আগামীকাল", "২ দিন বাকি", "ফলো-আপ নেই"), then tap আজ / আগামীকাল / ৩ দিন পরে / পরের সপ্তাহ / **তারিখ বাছুন** / **মুছুন** | Two taps and a toast. "তারিখ বাছুন" opens our own calendar — month name in Bangla, today ringed, `‹ ›` to move months — and the chip then reads `dd/mm/yyyy` in Bangla digits (`১৭/১১/২০২৬`), or `17 Nov 2026` on the English page. There is no browser date box anywhere on this page |
| 5 | **Send an SMS to one visitor** | A row's **⋯** → "এসএমএস পাঠান" | The one send dialog every screen uses, already on the visitor thank-you template, aimed at that visitor's first number. Nothing is sent until you walk it to the last step |
| 6 | **Send an SMS to several** | Tick two or more rows, then the bulk bar's "ধন্যবাদ এসএমএস" | The tick column has no heading; ticking a row raises a bulk bar that counts the ticks and offers thank-you SMS, **স্ট্যাটাস বদলান**, **ফলো-আপ বসান** and (for an admin) **মুছুন**. A visitor who said "do not contact", and one with no number, cannot be ticked — their cell says why |
| 7 | **Close a visitor as Staff** | Sign in as the staff account; a row's **⋯** | Staff get **Send SMS**, **Book trial**, **Convert to admission** and **Mark not interested** — the last one is the desk's way to close a row. A visitor has no "archive" state in this system (see the note below), so the menu says out loud that moving a visitor to the Recycle Bin is an Admin action instead of showing a button that would fail |
| 8 | **Delete a visitor as Admin** | Sign in as admin; a row's **⋯** → **মুছুন** | A confirmation names the visitor and says "এটি ৩০ দিনের জন্য রিসাইকেল বিনে যাবে…". Confirm and the row leaves the list |
| 9 | **Undo the delete** | The toast that appears bottom-right, within 10 seconds → **ফিরিয়ে আনুন** | The visitor is back in the list exactly as it was. The toast stays for the full 10 seconds because it carries an Undo |
| 10 | **Restore from the Recycle Bin** | Sidebar → Recycle Bin (রিসাইকেল বিন) → the visitor's row → Restore | The visitor returns to the list. The bin keeps it for 30 days and then the purge job removes it; "Delete forever" is Super Admin only and asks you to type the name |

## What to look at while you click

* **One line per visitor, at most five controls:** tick · name (bold) over class · school · V-id ·
  number with **Call** and **WhatsApp** · status badge · follow-up chip · last note (one line) ·
  **Open** **Edit** **⋯**. Rows are 72 px or shorter; the old long action cell is gone.
* **The number is printed** for a signed-in Admin, Super Admin or Staff, because they call visitors.
  It is printed and nothing more: it is in no address bar, in no link except `tel:` and `wa.me`, and
  in no audit row. The drawer, the search results, the funnel and the Overview still show the mask.
* **Filters are open on a desktop** (they collapse themselves on a phone), and both date filters pick
  from the calendar popover.
* **On a phone (360 px)** each row is a card: name, class, badge, chip, big Call and WhatsApp, then
  Open, Edit, ⋯ — and nothing scrolls sideways.

## One decision this page needs from you

A visitor has no **archive** state in the Recycle Bin registry (`recycleKinds` gives the `lead` kind a
bin path and no `archiveSet`, the way a private record with nothing to unpublish has none), so Archive
for Staff would have been a button that answers "failed". Two ways forward, your call:

1. **Leave it as it is** — Staff close a visitor with "Mark not interested"; only Admin and Super Admin
   can move one to the Recycle Bin. This is what the page does today.
2. **Give visitors an archive state** — a new `archivedAt` field, hidden from the list, restorable from
   the Recycle Bin. That is a small new feature touching the Lead model, the list filter and the bin
   page, and you asked for no new features until this page is approved.

Kinds that already have an archive path (blog, notices, classes, slots, teachers, portal accounts,
exams, model tests…) will show **Archive** to Staff in the same ⋯ menu when this pattern is copied to
them — the menu renders whichever destructive verb the kind really has.
