# Group 2 · The operator's screens: what changed, and the rules a future edit must not break

Group 2 was a layout and wording pass, and its brief was one sentence: **make the admin read like the
day, not like the code.** Three screens changed shape — the dashboard, the SMS centre and the menu —
plus the way a form behaves on a phone. Nothing underneath them moved: no model, no API route, no
recalculation and no authorization rule. The four numbers on the dashboard come from the reads those
screens already answer with, so the dashboard cannot disagree with the screen an operator opens next.

Every claim below is asserted by `tests/dashboard-ops-browser.integration.ts` (registry rows **G2.1**
to **G2.4**) at 360 px and 1440 px in Bangla and in English, photographed into `screenshots/g2/`, with
the menu's contract held in code by `tests/nav-groups.test.ts` (**G2.5**) and the wording by
`npm run test:g2:copy` (**G2.6**). `/admin` and `/admin/sms` in both languages are also in the
screenshot pass, so `screenshots/all/` carries the honest first look at both widths.

## 1. `/admin` is two tiers

| Tier | What is in it | Why it is there |
|---|---|---|
| **Today's operations** (first) | Four cards — cash taken today with its receipt count · the year's outstanding total with the running and held counts · the calls due today, with new visitors and the late promises named separately · the SMS credit with the count of stuck sends. Under them, four verbs: **Collect a fee · New visitor · Class routine · Send an SMS** | These are the four questions a centre is run on and the four things a manager does before lunch. Each card is a link to the screen that works it, so a number is never a dead end |
| Intake | The four counters and the two panels the dashboard has always had (pending admissions, today's bookings, unread messages, active batches) | Real work, but it is the public site's inbox rather than the counter's |
| **Centre & public site** (last, folded) | Banner, blog, notice, testimonials and toppers, the lecture sheets, video, achievements, media — and the site-readiness checklist that used to stand alone | Work a manager does once a week. Folded, not hidden: the summary names the tier and says what is inside it, and one tap opens it |

The visitor queue sits between the first tier and the intake panels, where R3 put it: the owner asked
to see it first thing, and the operations card above it is its count.

**The staff desk did not move.** R3.12 gave the front desk the visitor queue and nothing else, so a
staff session still gets that one panel — no operations tier, no toolbar, no site tier, no intake
counters, no welcome heading. A redesign does not get to widen a role.

### The colours are the state

| Tone | Meaning | Example |
|---|---|---|
| green | the day is going fine | money has come in today |
| amber | a number that wants a second look | nothing collected yet · money owed · a balance that could not be read |
| red | act on this | a promise whose day has passed · a send that did not go out |
| grey | the read failed | the card says **গোনা যায়নি / Not counted** instead of showing a zero |

A tone is painted as the card's left edge **and** its tint, never as text colour alone, so it survives
a greyscale printout and a colour-blind eye. And a read that failed says so in words: a zero that is
really an outage is the one number an operator acts on wrongly.

## 2. `/admin/sms` is three cards

| Card | Holds | Does not hold |
|---|---|---|
| **Quick send & balance** | The credit tile (the same number the dashboard pill shows — one read, one answer), this month's six totals, the class-message trigger, the settings form, the test message to the operator's own number, the template bodies | No retry, no stuck-send panel, no connection detail |
| **History & delivery logs** | The status, template and search filters, and the log rows with their recipient, delivery status and cost | Nothing is composed here |
| **Provider & connection diagnostic** | The stuck automatic sends with their count and their sentence, the connection (provider, credentials, sending gate, balance), the half-failed batch's retry | No everyday tool |

They are **cards, not hidden tabs**. Everything stays painted, because the credential and connection
proofs (`tests/sms-browser.integration.ts`) read these headings and definitions straight off the
served page — and a panel that only exists after a click is a panel both a test and an operator with a
broken send can miss. The page's one definition list is the diagnostic one, so the first `dd` anybody
reads aloud to a support line names the provider.

## 3. The menu is five operator groups

**দৈনন্দিন কাজ / Daily operations** · **শিক্ষার্থী ও একাডেমিক / Students & academics** ·
**যোগাযোগ / Communication** · **রিপোর্ট ও হিসাব / Reports & accounts** · **সেটিংস / Settings**

Grouping is presentation; permission is not. `permitted()` in `src/components/admin/nav-items.ts` is
byte-for-byte what it was, and `tests/nav-groups.test.ts` holds all six roles' visible sets against a
frozen table, so tidying the menu cannot widen or narrow a door. Three rules the grouping obeys:

- screens that belong together stay in one group, because a collapsed group hides its items from the
  sidebar's own text — the visitor list, its queue, its import and its funnel are all in the first
  group, and the four exam screens fold into one `details` inside the second;
- a role with a narrow menu must find all of it in the group that opens on arrival, which is why a
  content editor's two screens and an exam manager's three each share one group;
- every item has a word in `bn.json` **and** `en.json`, and no group label is left behind orphaned.

## 4. On a phone, the word goes above its control

Two patterns used to put a label beside its field: the cash desk's search and the dues list's class
filter. At 360 px the field's own intrinsic width — twenty characters for the search, the longest
class name for the filter — pushed the panel past the viewport, so the screen scrolled sideways and the
word landed on top of the control. Both now stack (word above, field filling the row), which is what
every other admin form already did at ≤760 px. The shared list pattern's own `.list-filter` was left
alone: it already stacks, and R8.1/G1.2 hold **one** implementation of it, not two.

The fixed bottom bar covers nothing: `.admin-content` reserves `calc(100px + env(safe-area-inset-bottom))`
at ≤760 px, and the suite scrolls to the very bottom of the cash desk (with a student chosen, so the
month grid and its Save button are on the page), the dues list, the SMS centre and the dashboard, and
fails if any button, link, field, table or summary has a pixel under the bar.

## 5. Interface text names no variable

Four sentences used to name the knob that was off — `CENTER_SMS_WRITE_ENABLED`, `NEXTAUTH_URL`,
`PUBLIC_AI_ENABLED`, `CENTER_IMPORT_WRITE_ENABLED`. An operator cannot turn any of them: they live in a
deployment file, not in a screen. So each now says what is off and who can turn it on ("Sending is
switched off — ask whoever set up this site to turn SMS sending on"), the four allowances in
`tests/i18n-catalog.test.ts` are gone, and the check is the strict one: **any** value the browser
receives that names an `ALL_CAPS_UNDERSCORED` token fails. The knobs are still named, to the audience
that can turn them — `docs/GO-LIVE.md`, `docs/DEPLOYMENT.md` and `docs/SMS-GOLD-LIVE.md`, which
`tests/r7-docs.test.ts` holds against the code.

## 6. The owner's click checklist

Sign in as the demo admin. Open each screen at 1440 px and again in a 360 px-wide window (DevTools →
device toolbar), in `/bn` and in `/en`.

| # | Step | Where | What must happen |
|---|---|---|---|
| 1 | **Read the morning** | `/bn/admin` | The welcome line, then the four cards, then the four verbs, then the intake panels, then the folded site tier — in that order, top to bottom |
| 2 | **Check the colours** | The four cards | Cash is green once a fee is taken today and amber before it; outstanding is amber while anything is owed; the follow-up card is red when a promise is late, and the late count is its own number beside the new visitors, not folded into a total; the credit card is red while a send is stuck |
| 3 | **Read a failed read** | Turn off the provider or the database read | The card says **গোনা যায়নি / Not counted** in grey, and the rest of the dashboard still renders — one failed read never blanks the page |
| 4 | **Use a verb** | **ফি জমা নিন** | The cash desk. Each of the four verbs goes to the screen that does the work, and each is a thumb-sized target on a phone |
| 5 | **Open the fold** | **সেন্টার ও ওয়েবসাইট** | One tap opens the banner, blog, notice, testimonials, sheets, video, achievements and media doors with the readiness checklist under them. Closed, none of them is on screen |
| 6 | **Search on a phone** | `/bn/admin/students/collect` at 360 px | The search word is above its field and the field fills the row; the page does not scroll sideways; choose a student and the Save button is never under the bottom bar |
| 7 | **Filter on a phone** | `/bn/admin/students/dues` at 360 px | Same for the class filter, and the last row of the list clears the bottom bar |
| 8 | **Read the SMS cards** | `/bn/admin/sms` | Three named cards: send and balance, history, connection. The retry and the stuck sends are in the third and nowhere else, and the balance tile agrees with the dashboard's pill |
| 9 | **Open the drawer** | 360 px → মেনু | Five groups in the day's order, every door at least 44 px, the cash desk and the funnel in the first group beside the visitor list |
| 10 | **Sign in as staff** | `/bn/admin` | The visitor queue and nothing else — no cards, no verbs, no fold, no counters. The drawer lists only groups holding a door staff may open: no cash desk, no SMS |
