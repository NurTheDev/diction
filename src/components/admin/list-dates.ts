/**
 * The pattern's own words, outside every client boundary: no component, no hook, no `'use client'`.
 *
 * A Server Component that imports a plain value from a `'use client'` module does not receive that
 * value. Next hands the server graph a client *reference* in its place, and using it fails while React
 * renders the tree the page returned — after every `await` in the page has already resolved, so no
 * `try`/`catch` around the page's data work can see it, no error boundary is reached, and the page's
 * own segment simply never fills: the shell paints and the screen stays empty forever. That is exactly
 * how the Visitors list died, because `listTableClass('visitor')` was called from the leads page inside
 * the branch that runs only when there are rows — an empty list painted, a list with anybody in it did
 * not, and nothing in the page could say why.
 *
 * So the helpers a page may need live here and in `list-class.ts`, and the client modules import these
 * words rather than the other way round. Anything added to a `'use client'` module is a component or a
 * hook; anything a Server Component may call is declared in one of the two files without the directive.
 */
import {formatDigits,formatNumber,type Digits} from '@/lib/admin/format';

export type Language='bn'|'en';

/** The `Intl` locale a screen's dates are read in: Dhaka's own Bangla, or British English. */
const intl=(language:Language)=>language==='bn'?'bn-BD':'en-GB';

export const dateDigits=(digits:Digits,language:Language):Digits=>language==='en'?'en':digits;

/** The month's own name, in the account's language, with the year in the operator's digits. */
export function monthWord(year:number,month:number,digits:Digits,language:Language):string{
  const at=new Date(Date.UTC(year,month-1,1));
  const name=new Intl.DateTimeFormat(intl(language),{month:'long',timeZone:'UTC'}).format(at);
  return `${name} ${formatNumber(year,dateDigits(digits,language))}`;
}

/** Seven weekday headers starting on Sunday, from `Intl` — the same source the month name comes from. */
export function dayHeaders(language:Language):string[]{
  const format=new Intl.DateTimeFormat(intl(language),{weekday:'short',timeZone:'UTC'});
  return Array.from({length:7},(_,index)=>format.format(new Date(Date.UTC(2024,0,7+index))));
}

/** dd/mm/yyyy in the operator's digits, or "15 Nov 2026" on an English screen. Never mm/dd/yyyy. */
export function shortDate(iso:string,digits:Digits,language:Language):string{
  const [year,month,day]=String(iso).split('-').map(Number);
  if(!year||!month||!day)return String(iso);
  if(language==='en'){
    const name=new Intl.DateTimeFormat('en-GB',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,day)));
    return `${formatNumber(day,'en')} ${name} ${formatNumber(year,'en')}`;
  }
  return formatDigits(`${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`,digits);
}

/** "নভেম্বর ২০২৬" / "Nov 2026" — a picked month read back in the operator's own words. */
export function shortMonth(value:string,digits:Digits,language:Language):string{
  const [year,month]=String(value).split('-').map(Number);
  if(!year||!month)return String(value||'');
  if(language==='en'){
    const name=new Intl.DateTimeFormat('en-GB',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,1)));
    return `${name} ${formatNumber(year,'en')}`;
  }
  return monthWord(year,month,digits,language);
}
