import {getTranslations} from 'next-intl/server';
import {CLASS_SHIFT_KEYS} from './class-shared';

/**
 * The Bangla words behind the three shift keys, in the order the day happens.
 *
 * A class stores the shifts it runs as canonical keys in `shifts[]`, and derives the one word a routine
 * reads from the first key. The routine stores that word, not the key, so anything offering the class's
 * other shifts has to translate the keys through the same catalog — one mapping, used by the class write
 * and by the routine read, so the two cannot drift apart.
 */
export async function classShiftWords():Promise<string[]>{
  const t=await getTranslations({locale:'bn',namespace:'classAdmin'});
  return CLASS_SHIFT_KEYS.map(key=>String(
    t(key==='morning'?'shiftMorning':key==='day'?'shiftDay':'shiftEvening')||''
  ));
}
