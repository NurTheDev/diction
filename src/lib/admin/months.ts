/**
 * The twelve months, in order, read from a catalog group.
 *
 * A month name is a word the reader reads, so it lives in `common.months` and `common.monthsShort`
 * beside every other painted word. What lives here is the part that is not a word: the order, the fact
 * that a month number counts from 1, and the shape of the table a translator hands back. Eight copies
 * of the same Bangla month table used to be scattered across the admin screens, which is how an
 * English page came to show জানু in a column header.
 */
const MONTH_KEYS=['january','february','march','april','may','june','july','august','september','october','november','december'] as const;

/** What `t.raw('months')` gives back: one string per month key. */
export type MonthTable=Record<string,string>;

/** All twelve, in calendar order. A key the catalog does not have reads as itself, never as a hole. */
export function monthNames(table:MonthTable|undefined):string[]{
  return MONTH_KEYS.map(key=>String(table?.[key]||key));
}
