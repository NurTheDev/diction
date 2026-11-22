/**
 * F-18 · the achievement card's own date, spelled the way the catalogs spell a month.
 *
 * The month name used to come from `Intl.DateTimeFormat('bn-BD')`, which is a promise about somebody
 * else's data file: the ICU build the machine happens to carry writes জানুয়ারী where this centre's
 * catalog writes জানুয়ারি, and the difference is invisible until a unit suite runs on a host whose
 * tables were compiled the other way — the sentence on the card and the sentence in the test then
 * disagree about a month, and `npm run test:unit:core` fails on a word nobody edited.
 *
 * So the month is a word from the catalog, in the catalog's own order, and the day and the year are
 * converted digit by digit rather than formatted by a locale. The answer is a function of the input and
 * of the shipped words, and of nothing installed on the host.
 *
 * The twelve words arrive as an argument rather than as an import of `src/messages/bn.json`, because
 * this module is reached from a `'use client'` component: importing the catalog here hands all four
 * thousand of its sentences to the browser, and the build answers that with a warning per key — four
 * thousand lines of "Should not import the named export", which is how a build that succeeded stopped
 * saying "Compiled successfully" and the verification report could no longer prove it had built. A
 * screen reads its words from the provider it is already under; so does this one.
 */
import {formatDigits} from '@/lib/admin/format';

/** The twelve month names in calendar order, January first: what `monthNames(t.raw('months'))` gives. */
export type MonthWords=readonly string[];

/**
 * `2026-01-01` reads ১ জানুয়ারি ২০২৬. A day that did not happen — the thirty-first of
 * February, a month outside 1 to 12, anything that is not `YYYY-MM-DD`, a catalog with no word for the
 * month — reads as nothing at all rather than as a plausible date.
 */
export function achievementDateBn(value: string, months: MonthWords): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '';
  const month = Number(value.slice(5, 7));
  if (month < 1 || month > 12) return '';
  const word = months[month - 1];
  if (!word) return '';
  const day = value.slice(8, 10).replace(/^0(?=\d)/, '');
  return `${formatDigits(day, 'bn')} ${word} ${formatDigits(value.slice(0, 4), 'bn')}`;
}
