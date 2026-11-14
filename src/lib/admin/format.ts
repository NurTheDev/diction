export type Digits='bn'|'en';
/* The Bangla digit table below is a script-conversion map, not a sentence: it is the one place outside
   the message files where Bangla characters may appear in src/ (see the i18n scan test's allow-list). */
const BN_DIGITS='০১২৩৪৫৬৭৮৯'; // i18n-scan-allow: the script-conversion table itself; writing it as escapes would only hide what it is
const BN_DIGIT_RANGE=new RegExp(`[${BN_DIGITS[0]}-${BN_DIGITS[9]}]`,'g');
const loc=(digits:Digits)=>digits==='bn'?'bn-BD':'en-GB';
export function formatNumber(value:number,digits:Digits='bn'){return new Intl.NumberFormat(loc(digits),{useGrouping:false}).format(value)}
/** Bangla-digit text to ASCII digits — a script conversion, used wherever a typed number must be parsed. */
export function asciiDigits(value:string){return value.replace(BN_DIGIT_RANGE,c=>String(BN_DIGITS.indexOf(c)))}
export function formatDate(value:Date|string,digits:Digits='bn',language:'bn'|'en'='bn'){const parts=new Intl.DateTimeFormat(language==='bn'?'bn-BD':'en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Dhaka'}).formatToParts(new Date(value));const part=(name:string)=>parts.find(p=>p.type===name)?.value||'';const numeric=(value:string)=>formatNumber(Number(asciiDigits(value)),digits);return `${numeric(part('day'))} ${part('month')} ${numeric(part('year'))}`}
export type DayPeriodKey='morning'|'noon'|'afternoon'|'evening'|'night';
/** Which day-period word a Dhaka hour takes; the words themselves live in the message files. */
export function dayPeriodKey(hour:number):DayPeriodKey{return hour<12?'morning':hour<16?'noon':hour<18?'afternoon':hour<20?'evening':'night'}
export function formatTime(value:Date|string,digits:Digits='bn',language:'bn'|'en'='bn',periodWord:(key:DayPeriodKey)=>string=k=>k){const dt=new Date(value);const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',hour:'numeric',minute:'2-digit',hourCycle:'h23'}).formatToParts(dt);const h=Number(parts.find(p=>p.type==='hour')?.value),m=Number(parts.find(p=>p.type==='minute')?.value);const hour=formatNumber(h%12||12,digits),minute=formatNumber(m,digits).padStart(2,BN_DIGITS[0]);return language==='bn'?`${periodWord(dayPeriodKey(h))} ${hour}:${minute}`:`${formatNumber(h,digits).padStart(2,BN_DIGITS[0])}:${minute}`}
/** The class word is the caller's translated label, so each locale reads its own word for class. */
export function formatClass(value:string|number,digits:Digits,language:'bn'|'en',classWord:string){const n=String(value).trim()?Number(value):NaN;return `${classWord} ${Number.isFinite(n)?formatNumber(n,digits):value}`}
/** Format digit strings without converting an identifier/phone into a number (preserves leading zeros). */
export function formatDigits(value:string,digits:Digits='bn'){return digits==='bn'?value.replace(/[0-9]/g,c=>BN_DIGITS[Number(c)]):asciiDigits(value)}
