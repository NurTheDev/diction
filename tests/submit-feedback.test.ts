/**
 * O1 · A write says it is writing, and the answer arrives in the corner.
 *
 * Nothing here needs a browser, and everything here is invisible in a screenshot taken at the wrong
 * moment: the claim is about the shape of every mutating control on the operator's screens. Three things
 * are proved against the source, because a source is the only place all of them can be counted at once —
 *
 * · **A button that writes is disabled while it writes, turns a spinner and changes its own word.** The
 *   centre's screens each grew their own save button, and each one remembered a different half of that
 *   sentence: some were disabled, none said "saving", and a click that appears to do nothing gets clicked
 *   again — which is a second period on the timetable or a second SMS batch, not a harmless repeat. So
 *   there is now one button (`SubmitButton`) and every write named in the brief goes through it. A file
 *   that still holds a raw `<button type="submit" … disabled={pending}>` for one of those hooks fails
 *   here, by name.
 * · **A screen being fetched has a shape.** `loading.tsx` sits above every admin address and paints the
 *   page's own skeleton — a heading, tiles, rows — rather than a white rectangle that reads as a crash.
 * · **A mutation is answered in the top-right corner.** Success says "সংরক্ষণ সম্পন্ন হয়েছে" and failure
 *   says why, in the language being read; the toast is anchored top-right in the stylesheet, out of the
 *   way of the thumb bar and of the table an operator is reading.
 */
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import bn from '../src/messages/bn.json';
import en from '../src/messages/en.json';

const read=(file:string):string=>readFileSync(file,'utf8');

/* Every write the brief names, as the hook it is tested by and the file that holds it. */
const WRITES:[file:string,hook:string,what:string][]=[
  ['src/components/admin/routine-master.tsx','data-period-save','a period of the week'],
  ['src/components/admin/routine-master.tsx','data-save-anyway','a period that clashes, saved anyway'],
  ['src/components/admin/routine-master.tsx','data-day-save','a whole day of the week'],
  ['src/components/admin/routine-daily.tsx','data-daily-save','one date\'s working sheet'],
  ['src/components/admin/routine-daily.tsx','data-save-anyway','a date that clashes, saved anyway'],
  ['src/components/admin/routine-tools.tsx','data-bulk-apply','many periods in one write'],
  ['src/components/admin/routine-tools.tsx','data-replace-run','a teacher replaced everywhere'],
  ['src/components/admin/routine-tools.tsx','data-dayop-run','a day moved or duplicated'],
  ['src/components/admin/center-exam-forms.tsx','data-exam-submit','an exam created or changed'],
  ['src/components/admin/center-exam-forms.tsx','data-publish-submit','results published'],
  ['src/components/admin/center-exam-forms.tsx','data-scale-save','the grading scale'],
  ['src/components/exams/marks-grid.tsx','data-grid-save','a batch of marks'],
  ['src/components/admin/class-management.tsx','data-class-save','a class'],
  ['src/components/admin/class-management.tsx','data-class-batch-save','the batches of a class'],
];

// ── 1. One button, and every write goes through it ────────────────────────────────────────────────
const button=read('src/components/admin/submit-button.tsx');
assert.ok(button.includes('disabled={disabled||pending}'),
  'the shared button is disabled while its own request is in flight');
assert.ok(button.includes('aria-busy={pending||undefined}'),
  'and says so to a screen reader rather than only to the eye');
assert.ok(button.includes('admin-spinner')&&button.includes("common('saving')"),
  'it turns a spinner and changes its own word to the catalog\'s "saving…"');
assert.ok(button.includes('busyLabel??'),
  'a screen may name what it is saving — a period, a class, a batch of marks — instead of one vague word');

for(const [file,hook,what] of WRITES){
  assert.ok(existsSync(file),`${file} exists`);
  const text=read(file);
  /* A hook is a whole attribute: `data-class-batch-save` must not be found inside the paragraph that
     says a batch write is done, which is `data-class-batch-saved`. */
  const at=text.search(new RegExp(`${hook}(?![\\w-])`));
  assert.ok(at>0,`${hook} (${what}) is still on the screen`);
  /* The hook and the button that carries it are one JSX element: look at the tag it sits in. */
  const open=text.lastIndexOf('<',at);
  const tag=text.slice(open,Math.min(text.length,at+240));
  assert.ok(tag.startsWith('<SubmitButton'),
    `${hook} — ${what} — is a SubmitButton, so it is disabled, spinning and saying "saving…" while it writes`);
}

/* And the old shape is gone from those files: a raw submit button gated on `pending` alone, which is a
   button that is disabled but silent. */
for(const file of [...new Set(WRITES.map(([path])=>path))]){
  const text=read(file);
  const raw=text.split('\n').filter(line=>/<button[^>]*type="submit"/.test(line)&&/disabled=\{pending\}/.test(line));
  assert.deepEqual(raw,[],`${file} still holds a raw submit button gated on pending alone: ${raw.join(' | ')}`);
}

/* The SMS dispatch already turned a spinner; what it lacked was a word that says sending rather than
   repeating how many were counted before the click. */
const sms=read('src/components/admin/send-sms-dialog.tsx');
assert.ok(sms.includes("sending?ts('dialog.sending')"),
  'the SMS send button says it is sending while it sends');
assert.ok(sms.includes('sms-spin')&&sms.includes('disabled={!canSend||sending}'),
  'and it is disabled and spinning, as it always was');

// ── 2. A screen being fetched has a shape ────────────────────────────────────────────────────────
const LOADING='src/app/[locale]/admin/loading.tsx';
assert.ok(existsSync(LOADING),'one loading boundary sits above every admin address');
const loading=read(LOADING);
assert.ok(loading.includes('data-admin-loading')&&loading.includes('aria-busy="true"'),
  'it announces that the screen is busy rather than looking finished');
for(const part of ['admin-skeleton-head','admin-skeleton-kpis','admin-skeleton-rows'])
  assert.ok(loading.includes(part),`the skeleton has the ${part} a page of this shape is made of`);
assert.ok(loading.includes("t('loading')")&&loading.includes("t('loadingHelp')"),
  'and it says what is happening, in both of the catalog\'s own sentences');

const css=read('src/app/globals.css');
assert.ok(css.includes('.admin-spinner')&&css.includes('@keyframes admin-spin'),
  'the spinner is drawn and turned by the stylesheet');
assert.ok(/prefers-reduced-motion:reduce\)\{\.admin-spinner\{animation:none/.test(css),
  'and it stops for a reader who asked this machine not to move things');
assert.ok(css.includes('@keyframes admin-skeleton-pulse')&&css.includes('.admin-skeleton span'),
  'the skeleton breathes while the numbers are fetched');

// ── 3. The answer arrives top-right, in the operator's own words ─────────────────────────────────
const toastRule=css.slice(css.indexOf('.admin-toast{'),css.indexOf('.admin-toast{')+900);
assert.ok(/top:24px/.test(toastRule)&&!/bottom:24px/.test(toastRule),
  'the toast is anchored to the top-right corner, not the bottom one');
const narrowRule=toastRule.slice(toastRule.indexOf('@media(max-width:760px)'));
assert.ok(/top:calc\(12px/.test(narrowRule)&&/bottom:auto/.test(narrowRule),
  'and it stays at the top on a phone, clear of the thumb bar');
assert.ok(read('src/components/admin/recycle-toast-host.tsx').includes('RECYCLE_TOAST_EVENT'),
  'the host that paints it lives in the shell, so a write that removes its own row still gets an answer');

type CommonWords={common:{saving:string;saved:string;saveFailed:string}};
const bnCommon=(bn as CommonWords).common;
const enCommon=(en as CommonWords).common;
assert.equal(bnCommon.saving,'সংরক্ষণ করা হচ্ছে…','the busy word is the one the brief asks for');
assert.equal(enCommon.saving,'Saving…','in English too');
assert.equal(bnCommon.saved,'সংরক্ষণ সম্পন্ন হয়েছে','a saved write says so in Bangla');
assert.equal(enCommon.saved,'Changes saved successfully','and in English');
assert.ok(bnCommon.saveFailed.length>8&&enCommon.saveFailed.length>8,
  'a refused write has a sentence of its own, because "failed" alone is not a reason');

/* Every mutating screen raises that answer. The routine screens, the class screen and the exam forms
   raise it on the way back from the write — not in an effect waiting on a state a refresh may have
   unmounted — and the marks grid raises it for a save an operator pressed. */
for(const file of ['src/components/admin/routine-master.tsx','src/components/admin/routine-daily.tsx',
  'src/components/admin/routine-tools.tsx','src/components/admin/class-management.tsx',
  'src/components/admin/center-exam-forms.tsx','src/components/exams/marks-grid.tsx'])
  assert.ok(/showRecycleToast|toastOnWrite|useWriteToast/.test(read(file)),
    `${file} answers its own write in the corner`);

console.log(`Submit feedback: ${WRITES.length} mutating controls across `+
  `${new Set(WRITES.map(([file])=>file)).size} screens all go through one button that is disabled, `+
  `spinning and reading "saving…" while it writes, one skeleton sits above every admin address, and the `+
  `answer to every mutation is raised top-right in both languages — success and the reason for a refusal.`);
