/**
 * R3 · The funnel's CSV.
 *
 * Two decisions, both written down because a spreadsheet outlives the screen that made it:
 *
 *   • **Numbers go out in Latin digits, whatever the operator's digit preference is.** A CSV is data
 *     for a machine as much as for a person: Excel sorts `৪১.৭` as text and cannot add it up. The
 *     labels stay in the operator's language — a Bangla month name or a Bangla class word — because
 *     those are words, not numbers.
 *   • **A cell is quoted, and a cell that could be read as a formula is neutralized.** A class name
 *     or a source typed by somebody else can begin with `=`, `+`, `-` or `@`; the leading apostrophe
 *     is the same defence the admissions export uses, so a report cannot become a way to run
 *     something in somebody's Excel.
 *
 * This file is pure and imports nothing: the client component that offers the download and the tests
 * that pin the format both read the same builder.
 */

/** What one cell may hold: a label, a count, a rate, or nothing at all. */
export type FunnelCsvCell=string|number|null|undefined;

/** The byte-order mark that makes Excel read the file as UTF-8, so Bangla labels survive. */
export const CSV_BOM='\uFEFF';

export function csvCell(value:FunnelCsvCell):string{
  if(value===null||value===undefined)return '';
  /* A number goes out bare and in Latin digits: quoted, a spreadsheet treats it as text and the
     column no longer adds up. A number that is not finite goes out empty rather than as `NaN`,
     because a report should never print a word nobody entered. */
  if(typeof value==='number')return Number.isFinite(value)?String(value):'';
  let text=String(value);
  if(/^[\t\r\n]|^[\s]*[=+\-@]/.test(text))text=`'${text}`;
  return `"${text.replace(/"/g,'""')}"`;
}

/** Header row plus data rows, CRLF between them, BOM in front: what Excel and Sheets both expect. */
export function funnelCsv(columns:string[],rows:FunnelCsvCell[][]):string{
  const lines=[columns.map(csvCell).join(','),...rows.map(row=>row.map(csvCell).join(','))];
  return `${CSV_BOM}${lines.join('\r\n')}\r\n`;
}

/** An ASCII file name: the breakdown it holds and the Dhaka day it was made, so two reports differ. */
export function funnelFileName(breakdown:string,day:string,label='funnel'):string{
  const safe=(value:string)=>value.replace(/[^a-z0-9-]/gi,'').slice(0,40)||'report';
  return `diction-${safe(label)}-${safe(breakdown)}-${safe(day)}.csv`;
}
