# Screenshot review pack

Built 2026-11-15 from the milestone folders under `screenshots/` by `scripts/make-review-pack.py`. JPEG quality 80, at most 1440 px wide (360 px shots kept at 360 px). Flip through `contact-sheet.jpg` first; the files sort in review order.

| File | Page | Look for |
| --- | --- | --- |
| `01-students-list-en-1440.jpg` | Students list (en, 1440) | English chrome end to end; Bangla only inside owned data (children’s names); English digits. |
| `02-cash-collection-en-1440.jpg` | Cash collection (en, 1440) | The cash desk in English: fee months, receipt number and total labels; no raw catalog keys. |
| `03-sheet-view-en-1440.jpg` | Class sheet view (en, 1440) | The class sheet grid reads cleanly: columns aligned, totals under their columns, no clipping. |
| `04-dues-list-en-1440.jpg` | Due list (en, 1440) | Due list in English: month words, held/advance statuses and the total row; English digits. |
| `05-visitors-list-drawer-en-1440.jpg` | Visitors list + detail drawer (en, 1440) | The Visitors list with the detail drawer open in English; the phone is masked — no full number in the text. |
| `06-sms-centre-en-1440.jpg` | SMS centre (en, 1440) | SMS centre in English: connection card, live balance and the send gate; templates listed. |
| `07-sms-send-dialog-en-1440.jpg` | SMS send dialog (en, 1440) | The send dialog over the list in English: audience count, estimated segments and cost before send. |
| `08-recycle-bin-en-1440.jpg` | Recycle Bin (en, 1440) | Recycle Bin in English: days left beside each row, Restore and Delete-forever where the role allows. |
| `09-import-review-en-1440.jpg` | Payment-sheet import review (en, 1440) | Payment-sheet import review: every row carries a verdict; nothing silently repaired. |
| `10-cash-collection-bn-1440.jpg` | Cash collection (bn, 1440) | The same cash desk in Bangla: whole chrome Bangla, digits in Bangla too. |
| `11-dues-list-bn-1440.jpg` | Due list (bn, 1440) | Due list in Bangla: Bangla month words and statuses; totals in Bangla digits. |
| `12-visitors-list-bn-1440.jpg` | Visitors list (bn, 1440) | Visitors list in Bangla: statuses and follow-up days Bangla; numbers masked everywhere. |
| `13-cash-collection-bn-360.jpg` | Cash collection (bn, 360) | 360 px: nothing overflows horizontally; the save button and bottom bar stay reachable. |
| `14-dues-list-bn-360.jpg` | Due list (bn, 360) | 360 px: the due table scrolls inside its own box, the page itself does not scroll sideways. |
| `15-visitors-quick-add-bn-360.jpg` | Visitors quick-add (bn, 360) | 360 px quick-add: one labelled tap, four fields visible, the rest behind “more”. |
| `16-sms-dialog-bn-360.jpg` | SMS send dialog (bn, 360) | 360 px dialog: fits the width, allowance and cost lines readable, send button reachable. |
| `17-overview-bn-360.jpg` | Overview (bn, 360) | 360 px Overview: counters stack without overflow; no test-mode banner on a production shot. |
| `contact-sheet.jpg` | All of the above as thumbnails | One glance: every page present, labelled, nothing blank. |

Every page was photographed on the disposable test-mode app, so the yellow test-mode banner at the top is expected and is itself the proof that no shot touched real data.

Sources: `screenshots/all/` (the refreshed full set), `screenshots/r3/` (Visitors drawer and SMS dialog, both locales). When a capture here is superseded, delete the old PNG from `screenshots/` in the same commit that refreshes this pack — the folder stays small or it stops being reviewable.
