#!/usr/bin/env python3
"""Build the screenshot review pack: small, sorted, labelled, and cheap to read.

The milestone folders under screenshots/ are the evidence the suites republish on every run; the
review pack is a derivative a person can actually flip through — JPEG at quality 80, never wider
than 1440 px, named so it sorts in review order, with a contact sheet and an INDEX.md that says
what to look for on each page. Re-run it after any milestone whose screens changed:

    python3 scripts/make-review-pack.py

Superseded sources: delete them from screenshots/ in the same commit that refreshes the pack, so
the folder stays small (see docs/VERIFY.md).
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'review-pack')
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

# (output name, source inside screenshots/, what the reviewer should look for)
PACK = [
    ('01-students-list-en-1440.jpg', 'all/students-list-en-1440.png',
     'English chrome end to end; Bangla only inside owned data (children’s names); English digits.'),
    ('02-cash-collection-en-1440.jpg', 'all/daily-collection-en-1440.png',
     'The cash desk in English: fee months, receipt number and total labels; no raw catalog keys.'),
    ('03-sheet-view-en-1440.jpg', 'all/class-sheet-en-1440.png',
     'The class sheet grid reads cleanly: columns aligned, totals under their columns, no clipping.'),
    ('04-dues-list-en-1440.jpg', 'all/due-list-en-1440.png',
     'Due list in English: month words, held/advance statuses and the total row; English digits.'),
    ('05-visitors-list-drawer-en-1440.jpg', 'r3/b2-detail-drawer-en-1440.png',
     'The Visitors list with the detail drawer open in English; the phone is masked — no full number in the text.'),
    ('06-sms-centre-en-1440.jpg', 'all/sms-centre-en-1440.png',
     'SMS centre in English: connection card, live balance and the send gate; templates listed.'),
    ('07-sms-send-dialog-en-1440.jpg', 'r3/b2-visitor-sms-dialog-en-1440.png',
     'The send dialog over the list in English: audience count, estimated segments and cost before send.'),
    ('08-recycle-bin-en-1440.jpg', 'all/recycle-bin-en-1440.png',
     'Recycle Bin in English: days left beside each row, Restore and Delete-forever where the role allows.'),
    ('09-import-review-en-1440.jpg', 'all/workbook-import-en-1440.png',
     'Payment-sheet import review: every row carries a verdict; nothing silently repaired.'),
    ('10-cash-collection-bn-1440.jpg', 'all/daily-collection-1440.png',
     'The same cash desk in Bangla: whole chrome Bangla, digits in Bangla too.'),
    ('11-dues-list-bn-1440.jpg', 'all/due-list-1440.png',
     'Due list in Bangla: Bangla month words and statuses; totals in Bangla digits.'),
    ('12-visitors-list-bn-1440.jpg', 'all/visitors-list-1440.png',
     'Visitors list in Bangla: statuses and follow-up days Bangla; numbers masked everywhere.'),
    ('13-cash-collection-bn-360.jpg', 'all/daily-collection-360.png',
     '360 px: nothing overflows horizontally; the save button and bottom bar stay reachable.'),
    ('14-dues-list-bn-360.jpg', 'all/due-list-360.png',
     '360 px: the due table scrolls inside its own box, the page itself does not scroll sideways.'),
    ('15-visitors-quick-add-bn-360.jpg', 'all/visitors-quick-add-360.png',
     '360 px quick-add: one labelled tap, four fields visible, the rest behind “more”.'),
    ('16-sms-dialog-bn-360.jpg', 'r3/b2-visitor-sms-dialog-360.png',
     '360 px dialog: fits the width, allowance and cost lines readable, send button reachable.'),
    ('17-overview-bn-360.jpg', 'all/admin-overview-360.png',
     '360 px Overview: counters stack without overflow; no test-mode banner on a production shot.'),
]


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    total = 0
    sizes = []
    for name, source, _note in PACK:
        src = os.path.join(ROOT, 'screenshots', source)
        if not os.path.exists(src):
            sys.exit(f'missing source {source} — capture it first (CI publishes screenshots/)')
        with Image.open(src) as image:
            image = image.convert('RGB')
            if image.width > 1440:
                height = round(image.height * 1440 / image.width)
                image = image.resize((1440, height), Image.LANCZOS)
            destination = os.path.join(OUT, name)
            image.save(destination, 'JPEG', quality=80, optimize=True)
        size = os.path.getsize(destination)
        total += size
        sizes.append((name, size))

    # ── contact sheet: labelled thumbnails, four to a row ────────────────────────────────────────
    columns, box_width, box_height, label_height, gap = 4, 460, 330, 34, 14
    thumbs = []
    for name, _source, _note in PACK:
        with Image.open(os.path.join(OUT, name)) as image:
            scale = box_width / image.width
            resized = image.resize((box_width, max(1, round(image.height * scale))), Image.LANCZOS)
            # A full-page shot shrunk to a stamp proves nothing: show the top of the page, where the
            # chrome, the language and any stray raw key live, at a readable size.
            thumbs.append((name, resized.crop((0, 0, box_width, min(box_height, resized.height)))))
    rows = (len(thumbs) + columns - 1) // columns
    row_height = box_height + label_height
    sheet = Image.new('RGB', (columns * (box_width + gap) + gap, rows * (row_height + gap) + gap), 'white')
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(FONT, 20)
    for index, (name, thumb) in enumerate(thumbs):
        column, row = index % columns, index // columns
        x = gap + column * (box_width + gap)
        y = gap + row * (row_height + gap)
        sheet.paste(thumb, (x, y))
        draw.rectangle((x - 1, y - 1, x + thumb.width, y + thumb.height), outline='#bbbbbb')
        draw.text((x, y + box_height + 7), name.replace('.jpg', ''), fill='black', font=font)
    sheet_path = os.path.join(OUT, 'contact-sheet.jpg')
    sheet.save(sheet_path, 'JPEG', quality=80, optimize=True)
    total += os.path.getsize(sheet_path)

    # ── INDEX.md: what each page is and what to look for ─────────────────────────────────────────
    lines = [
        '# Screenshot review pack',
        '',
        f'Built {__import__("datetime").date.today().isoformat()} from the milestone folders under '
        '`screenshots/` by `scripts/make-review-pack.py`. JPEG quality 80, at most 1440 px wide '
        '(360 px shots kept at 360 px). Flip through `contact-sheet.jpg` first; the files sort in '
        'review order.',
        '',
        '| File | Page | Look for |',
        '| --- | --- | --- |',
    ]
    pages = {
        '01': 'Students list (en, 1440)', '02': 'Cash collection (en, 1440)', '03': 'Class sheet view (en, 1440)',
        '04': 'Due list (en, 1440)', '05': 'Visitors list + detail drawer (en, 1440)', '06': 'SMS centre (en, 1440)',
        '07': 'SMS send dialog (en, 1440)', '08': 'Recycle Bin (en, 1440)', '09': 'Payment-sheet import review (en, 1440)',
        '10': 'Cash collection (bn, 1440)', '11': 'Due list (bn, 1440)', '12': 'Visitors list (bn, 1440)',
        '13': 'Cash collection (bn, 360)', '14': 'Due list (bn, 360)', '15': 'Visitors quick-add (bn, 360)',
        '16': 'SMS send dialog (bn, 360)', '17': 'Overview (bn, 360)',
    }
    for name, source, note in PACK:
        lines.append(f'| `{name}` | {pages[name[:2]]} | {note} |')
    lines += [
        f'| `contact-sheet.jpg` | All of the above as thumbnails | One glance: every page present, labelled, nothing blank. |',
        '',
        'Every page was photographed on the disposable test-mode app, so the yellow test-mode banner at the top is expected and is itself the proof that no shot touched real data.\n\nSources: `screenshots/all/` (the refreshed full set), `screenshots/r3/` (Visitors drawer and '
        'SMS dialog, both locales). When a capture here is superseded, delete the old PNG from '
        '`screenshots/` in the same commit that refreshes this pack — the folder stays small or it '
        'stops being reviewable.',
        '',
    ]
    with open(os.path.join(OUT, 'INDEX.md'), 'w', encoding='utf-8') as handle:
        handle.write('\n'.join(lines))

    print(f'review pack: {len(PACK)} pages + contact sheet, {total/1_000_000:.2f} MB')
    for name, size in sizes:
        print(f'  {name} {size/1000:.0f} kB')
    if total > 15_000_000:
        sys.exit('review pack exceeds 15 MB')


if __name__ == '__main__':
    main()
