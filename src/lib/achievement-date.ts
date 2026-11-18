/**
 * F-18 · the achievement card's own date, spelled the way the catalogs spell a month.
 *
 * The month name used to come from `Intl.DateTimeFormat('bn-BD')`, which is a promise about somebody
 * else's data file: the ICU build the machine happens to carry writes জানুয়ারী where this centre's
 * catalog writes জানুয়ারি, and the difference is invisible until a unit suite runs on a host whose
 * tables were compiled the other way — the sentence on the card and the sentence in the test then
 * disagree about a month, and `npm run test:unit:core` fails on a word nobody edited.
 *
 * So the twelve names are read from `common.months` in `src/messages/bn.json`, the same catalog every
 * screen reads a month from, and the day and the year are converted digit by digit rather than
 * formatted by a locale. The answer is now a function of the input and of the shipped catalog, and of
 * nothing installed on the host.
 */
import {common} from '@/messages/bn.json';
import {formatDigits} from '@/lib/admin/format';

/** January first: the catalog's own order, so the month a `YYYY-MM` names is never guessed. */
const MONTHS_BN=[
  common.months.january,common.months.february,common.months.march,common.months.april,
  common.months.may,common.months.june,common.months.july,common.months.august,
  common.months.september,common.months.october,common.months.november,common.months.december,
] as const;

export function achievementDateBn(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '';
  const month = Number(value.slice(5, 7));
  if (month < 1 || month > 12) return '';
  const day = value.slice(8, 10).replace(/^0(?=\d)/, '');
  return `${formatDigits(day, 'bn')} ${MONTHS_BN[month - 1]} ${formatDigits(value.slice(0, 4), 'bn')}`;
}
