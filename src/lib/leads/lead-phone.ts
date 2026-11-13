/**
 * R3 · Visitor leads — reading the sheet's phone numbers.
 *
 * One cell of the Visitor sheet can hold `01712817090`, `0 1934-595247`, `০১৭১২৮১৭০৯০`, two numbers
 * separated by a comma, a space or a word, a number without its leading zero, a number with a label
 * after it (`01712817090 বাবা`), or ten digits that are simply short. All of them are read here, in one
 * place, and the rule for every doubtful case is the same: **clean it, never repair it.** Separators
 * carry no information so they go; a missing leading zero is added, because that is what the national
 * format means and not a guess; and anything still not a valid `01XXXXXXXXX` is flagged with the text
 * exactly as it was written kept beside it — because inventing the missing digit of a ten-digit number
 * would hand a family's message to a stranger.
 *
 * The two destinations that must carry a number — `tel:` and `wa.me`, on every row — are built here
 * and nowhere else, so no screen can invent a variant. They are third-party hrefs in the operator's own
 * browser: never a route of this app, never a query parameter, never written to a log or an audit row.
 */
import {normalizePhone} from '@/lib/center/phone';
import {formatNumber} from '@/lib/admin/format';

export interface PhoneRead{normalized:string;original:string}
export interface PhoneFlag{original:string;code:'short'|'long'|'extra'|'not_a_number'|'invalid';messageBn:string;messageEn:string}
export interface PhoneCellResult{phones:PhoneRead[];flags:PhoneFlag[];sawText:boolean}

const BANGLA_DIGITS=/[০-৯]/g;
/** Explicit separators between two numbers. A space is NOT one: `0 1934-595247` is a single number. */
const CELL_SEPARATORS=/[,;।\n\r\t]+/;
/** A national mobile number, with or without its leading zero, with or without the 88 country code. */
const numberPattern=()=>/(?:\+?88)?0?1[3-9]\d{8}/g;

export function parsePhoneCell(raw:unknown):PhoneCellResult{
  const written=String(raw==null?'':raw);
  const sawText=!!written.trim();
  const phones:PhoneRead[]=[];
  const flags:PhoneFlag[]=[];
  if(!sawText)return {phones,flags,sawText};

  // Split the RAW cell, so a flag can quote what was actually written — Bangla digits and all — while
  // the parsing works on the same text with Bangla digits converted.
  const rawPieces=written.split(CELL_SEPARATORS);
  const asciiPieces=written.replace(BANGLA_DIGITS,c=>String('০১২৩৪৫৬৭৮৯'.indexOf(c))).split(CELL_SEPARATORS);
  for(const [index,asciiPiece] of asciiPieces.entries()){
    const trimmed=asciiPiece.trim();
    if(!trimmed)continue;
    const original=(rawPieces[index]||asciiPiece).trim();
    // Only digit runs are read, so a label inside the cell ("বাবা", "mother", "২য় নম্বর") neither
    // breaks the number nor becomes part of it.
    const runs=trimmed.match(/\d+/g)||[];
    const digits=runs.join('');
    if(!digits){
      flags.push({original,code:'not_a_number',
        messageBn:`"${trimmed}" নম্বর নয় — লেখাটি যেমন আছে তেমনি রাখা হয়েছে।`,
        messageEn:`"${trimmed}" is not a number — the text was kept exactly as written.`});
      continue;
    }
    let consumed=0;
    for(const hit of digits.matchAll(numberPattern())){
      const normalized=normalizePhone(hit[0]);
      consumed+=hit[0].length;
      if(!normalized){
        flags.push({original,code:'invalid',
          messageBn:`"${trimmed}" সঠিক নম্বর নয়।`,messageEn:`"${trimmed}" is not a valid number.`});
        continue;
      }
      if(!phones.some(phone=>phone.normalized===normalized))phones.push({normalized,original});
    }
    const leftover=digits.length-consumed;
    if(leftover>0){
      // Found a real number but digits remain: reported, not folded into the number.
      const code=consumed>0?'extra':leftover<=10?'short':leftover>=12?'long':'invalid';
      flags.push({original,code,
        messageBn:code==='short'
          ? `"${trimmed}" ছোট (${leftover} অঙ্ক) — অনুমান করা হয়নি, যেমন লেখা আছে তেমনি রাখা হয়েছে।`
          : code==='extra'
            ? `"${trimmed}" থেকে একটি নম্বর পড়া গেছে, কিন্তু অতিরিক্ত ${leftover} অঙ্ক ছিল — সেটি যোগ করা হয়নি।`
            : `"${trimmed}" থেকে একটি সঠিক নম্বর পড়া যায়নি।`,
        messageEn:code==='short'
          ? `"${trimmed}" is short (${leftover} digits) — not guessed; kept exactly as written.`
          : code==='extra'
            ? `"${trimmed}" gave one number, but ${leftover} digit(s) were left over — they were not folded into it.`
            : `"${trimmed}" could not be read as a valid number.`});
    }
  }
  return {phones,flags,sawText};
}

/** `tel:` and `wa.me` — the only hrefs in R3 that carry a number. See the note at the top. */
export function telHref(normalized:string):string{
  return `tel:+88${normalized.replace(/^0/,'')}`;
}
export function whatsappHref(normalized:string):string{
  return `https://wa.me/88${normalized.replace(/^0/,'')}`;
}

/**
 * Searching the Visitors list BY NUMBER is a staff requirement, and it is allowed — but the number may
 * only travel in a form submission or a server action. It is never a URL parameter (`leadListQuery`
 * refuses to build one), never a log line and never an analytics event, because a URL is copied,
 * cached, referred and pasted into a chat, and a parent's number in one of those is a leak nobody meant
 * to make. This function is the reading half of that rule; `searchLeadsByPhone()` is the matching half.
 *
 * What it accepts, because that is how a number arrives at a coaching centre: typed digits, Bangla
 * digits, spaces, dashes, brackets, a leading `+`, the `88`/`0088` country code, a leading zero or none,
 * and a PARTIAL number — the last four digits off a crumpled sheet are enough to find the lead.
 */
export const PHONE_SEARCH_MIN_DIGITS=4;
export const PHONE_SEARCH_MAX_DIGITS=15;

export type PhoneSearchRead=
  |{ok:true;digits:string;length:number;hadCountryCode:boolean;hadLeadingZero:boolean}
  |{ok:false;code:'empty'|'too_short'|'too_long';messageBn:string;messageEn:string};

export function phoneSearchDigits(raw:unknown):PhoneSearchRead{
  const written=String(raw==null?'':raw);
  if(!written.trim())return {ok:false,code:'empty',messageBn:'নাম্বার লিখুন।',messageEn:'Type a number.'};
  // Bangla digits are digits: ০১৭১২৮১৭০৯০ has to search as well as 01712817090.
  const ascii=written.replace(BANGLA_DIGITS,c=>String('০১২৩৪৫৬৭৮৯'.indexOf(c)));
  let digits=ascii.replace(/\D/g,'');
  let hadCountryCode=false;
  if(/^0088/.test(digits)){digits=digits.slice(4);hadCountryCode=true}
  // `88` is only a country code when what follows it is long enough to be a national number: a Bangladeshi
  // mobile never starts with 88, so a 12-or-13 digit run that does is +88 and not somebody's number.
  else if(/^88/.test(digits)&&digits.length>=12){digits=digits.slice(2);hadCountryCode=true}
  const hadLeadingZero=/^0/.test(digits);
  // A refusal quotes how MANY digits were typed, never which — the message ends up on a screen, in an
  // error boundary and, if anybody is careless, in a screenshot shared outside the admin.
  // Bangla digits in the Bangla sentence: `Number('৪')` is NaN the other way round, and a message that
  // mixes 4 into Bangla prose reads like a placeholder somebody forgot to fill in.
  if(digits.length<PHONE_SEARCH_MIN_DIGITS)return {ok:false,code:'too_short',messageBn:`${formatNumber(digits.length,'bn')} অঙ্ক দিয়ে নাম্বার খোঁজা যায় না — অন্তত ${formatNumber(PHONE_SEARCH_MIN_DIGITS,'bn')} অঙ্ক লিখুন।`,messageEn:`${digits.length} digit(s) is not enough to search — type at least ${PHONE_SEARCH_MIN_DIGITS}.`};
  if(digits.length>PHONE_SEARCH_MAX_DIGITS)return {ok:false,code:'too_long',messageBn:`${formatNumber(digits.length,'bn')} অঙ্ক কোনো নাম্বার নয় — ${formatNumber(PHONE_SEARCH_MAX_DIGITS,'bn')} অঙ্কের বেশি হলে খোঁজা হয় না।`,messageEn:`${digits.length} digits is not a number — nothing is searched above ${PHONE_SEARCH_MAX_DIGITS}.`};
  return {ok:true,digits,length:digits.length,hadCountryCode,hadLeadingZero};
}

/**
 * What a search may echo back, log or audit. Below eight digits nothing is shown at all: the last four
 * of a mobile number are the identifying part, so a "mask" of them would be the number.
 */
export function phoneSearchMask(digits:string):string{
  const value=String(digits||'').replace(/\D/g,'');
  if(value.length<8)return '****';
  return `${value.slice(0,2)}****${value.slice(-2)}`;
}

/** What a log line or an audit row gets: never a number, and not enough of one to dial. */
export function maskedPhones(phones:(string|null|undefined)[]):string{
  return phones.filter(Boolean).map(phone=>`${String(phone).slice(0,5)}****${String(phone).slice(-2)}`).join(', ')||'—';
}
