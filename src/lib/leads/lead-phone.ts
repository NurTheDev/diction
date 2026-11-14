/**
 * R3 · Visitor leads — reading the sheet's phone numbers.
 *
 * One cell of the Visitor sheet can hold `01712817090`, `0 1934-595247`, the same number in Bangla digits, two numbers
 * separated by a comma, a space or a word, a number without its leading zero, a number with a label
 * after it (a number followed by a Bangla word for father), or ten digits that are simply short. All of them are read here, in one
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
import {asciiDigits} from '../admin/format';
import {renderLeadPair} from './lead-message';
import {normalizePhone} from '@/lib/center/phone';
import {formatNumber} from '@/lib/admin/format';

export interface PhoneRead{normalized:string;original:string}
export interface PhoneFlag{original:string;code:'short'|'long'|'extra'|'not_a_number'|'invalid';messageKey:string;messageParams:Record<string,string|number>}
export interface PhoneCellResult{phones:PhoneRead[];flags:PhoneFlag[];sawText:boolean}

/** Explicit separators between two numbers. A space is NOT one: `0 1934-595247` is a single number. */
const CELL_SEPARATORS=/[,;\u0964\n\r\t]+/; // i18n-scan-allow: the Bangla full stop is punctuation the sheet is written with
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
  const asciiPieces=asciiDigits(written).split(CELL_SEPARATORS);
  for(const [index,asciiPiece] of asciiPieces.entries()){
    const trimmed=asciiPiece.trim();
    if(!trimmed)continue;
    const original=(rawPieces[index]||asciiPiece).trim();
    // Only digit runs are read, so a label inside the cell (a Bangla word for father, "mother", an
    // breaks the number nor becomes part of it.
    const runs=trimmed.match(/\d+/g)||[];
    const digits=runs.join('');
    if(!digits){
      flags.push({original,code:'not_a_number',
        messageKey:'phoneFlags.not_a_number',messageParams:{value:trimmed},...renderLeadPair('phoneFlags.not_a_number',{value:trimmed})});
      continue;
    }
    let consumed=0;
    for(const hit of digits.matchAll(numberPattern())){
      const normalized=normalizePhone(hit[0]);
      consumed+=hit[0].length;
      if(!normalized){
        flags.push({original,code:'invalid',
          messageKey:'phoneFlags.invalid',messageParams:{value:trimmed},...renderLeadPair('phoneFlags.invalid',{value:trimmed})});
        continue;
      }
      if(!phones.some(phone=>phone.normalized===normalized))phones.push({normalized,original});
    }
    const leftover=digits.length-consumed;
    if(leftover>0){
      // Found a real number but digits remain: reported, not folded into the number.
      const code=consumed>0?'extra':leftover<=10?'short':leftover>=12?'long':'invalid';
      flags.push({original,code,
        messageKey:code==='short'?'phoneFlags.short':code==='extra'?'phoneFlags.extra':'phoneFlags.unreadable',
        messageParams:{value:trimmed,count:leftover}});
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
 *
 * What it refuses, in three distinct answers, because they are three different situations at the desk:
 * nothing typed (`empty`), text that is not a number at all (`not_a_number` — a name or a paste), and a
 * number too short or too long to look anybody up by (`too_short`, `too_long`). Each one says how many
 * digits or characters were typed and never which.
 */
export const PHONE_SEARCH_MIN_DIGITS=4;
export const PHONE_SEARCH_MAX_DIGITS=15;

export type PhoneSearchRead=
  |{ok:true;digits:string;length:number;hadCountryCode:boolean;hadLeadingZero:boolean}
  |{ok:false;code:'empty'|'not_a_number'|'too_short'|'too_long';messageKey:string;messageParams:Record<string,string|number>;messageBn:string;messageEn:string};

/**
 * Is this text an attempt to type a NUMBER, rather than a name, a school or a lead id?
 *
 * One reading of that question, used by every path that has to decide it: the search box (which posts a
 * number attempt to an action instead of putting it in a URL), `leadListQuery()` (which refuses to build
 * an href for one) and `phoneSearchDigits()` below (which then counts the digits in it). Two readings of
 * the same question is how a browser and a server disagree about what an operator meant, and this file is
 * deliberately importable from a client component — it pulls in nothing but `normalizePhone` and
 * `formatNumber`, both plain string functions — so the browser's answer comes from here and not from a
 * copy of a regular expression pasted into a component.
 *
 * The test is a SHAPE, and the shape is what makes it precise:
 *
 * - it starts with a digit — ASCII or Bangla — or with the `+` or `(` a number is written with;
 * - after that it holds digits, spaces, the punctuation a number is grouped with (dash, brackets, plus,
 *   dot) and WORDS. A word is allowed because a number arrives with one attached: a number plus a Bangla word is
 *   one cell of the owner's own sheet, "father" written beside the number, and an operator who pastes
 *   that into the search box means the number in it. A label does not turn a number into a word search;
 *   `phoneSearchDigits()` drops it and matches the digits, exactly as `parsePhoneCell()` always has.
 *
 * So `V-2026-0001` is NOT one — it starts with a letter, and it is a lead id an operator may legitimately
 * search and share — and neither is a Bangla school name with a class digit in it or `Diction
 * Coaching`. `12` IS one: a number attempt that is simply too short to look anybody up by, which is a
 * different fact about it and gets a different answer.
 */
export function isNumberAttempt(raw:unknown):boolean{
  // Bangla digits are digits: a number written in Bangla digits has to be read the same way as its ASCII form.
  const ascii=asciiDigits(String(raw==null?'':raw).trim());
  if(!ascii||ascii.length>PHONE_ATTEMPT_MAX_LENGTH)return false;
  return NUMBER_SHAPE.test(ascii)&&/[\d]/.test(ascii);
}

// A number starts with a digit — ASCII or Bangla — or with the `+` or `(` it is written with. After
// that it is digits, the punctuation a number is grouped with, and words: a number arrives with a word
// attached (number plus Bangla word is one cell of the owner's own sheet), and an operator who pastes that
// into the search box means the number in it, not a word search. `parsePhoneCell()` has always read
// that cell the same way; this is the same reading of the same text at the other end of the app.
// `\p{M}` is in that class beside `\p{L}` because Bangla — like Devanagari, Tamil and most of the
// scripts this app is written in — builds a word out of letters AND combining vowel signs, so a Bangla word is
// U+09AC U+09BE U+09AC U+09BE, letter-mark-letter-mark. A class of letters alone matches none of it, so
// the label rule silently failed on the very language it was written for, and a labelled number was
// refused as "not a number". The `-` sits last for a duller reason: between `+` and `\p{L}` V8 reads it
// as a range from `+` to a property escape and rejects the whole expression.
const NUMBER_SHAPE=/^(?:[0-9+(]|[\u09e6-\u09ef])[0-9\s().\p{L}\p{M}+-]*$/u; // i18n-scan-allow: Bangla digit range as escapes, a shape test not a sentence

/**
 * Above this many characters it is a paste, not a number somebody typed: an SMS body, an id list, a
 * paragraph from a sheet. Still refused a URL — that rule is about digits, and it needs no length — but
 * answered as "that is not a number" rather than searched, so a paste cannot reach the index as a
 * substring query and cannot come back as a page full of near misses.
 */
export const PHONE_ATTEMPT_MAX_LENGTH=40;


export function phoneSearchDigits(raw:unknown):PhoneSearchRead{
  const written=String(raw==null?'':raw);
  if(!written.trim())return {ok:false,code:'empty',messageKey:'phoneSearch.empty',messageParams:{},...renderLeadPair('phoneSearch.empty',{})};
  if(!isNumberAttempt(written))return {ok:false,code:'not_a_number',messageKey:'phoneSearch.not_a_number',messageParams:{count:written.trim().replace(/\s+/g,' ').length},...renderLeadPair('phoneSearch.not_a_number',{count:written.trim().replace(/\s+/g,' ').length})};
  const ascii=asciiDigits(written);
  let digits=ascii.replace(/\D/g,'');
  let hadCountryCode=false;
  if(/^0088/.test(digits)){digits=digits.slice(4);hadCountryCode=true}
  // `88` is only a country code when what follows it is long enough to be a national number: a Bangladeshi
  // mobile never starts with 88, so a 12-or-13 digit run that does is +88 and not somebody's number.
  else if(/^88/.test(digits)&&digits.length>=12){digits=digits.slice(2);hadCountryCode=true}
  const hadLeadingZero=/^0/.test(digits);
  // A refusal quotes how MANY digits were typed, never which — the message ends up on a screen, in an
  // error boundary and, if anybody is careless, in a screenshot shared outside the admin.
  // Bangla digits in the Bangla sentence: Number() of a Bangla digit is NaN the other way round, and a message that
  // mixes 4 into Bangla prose reads like a placeholder somebody forgot to fill in.
  if(digits.length<PHONE_SEARCH_MIN_DIGITS)return {ok:false,code:'too_short',messageKey:'phoneSearch.too_short',messageParams:{count:digits.length,min:PHONE_SEARCH_MIN_DIGITS},...renderLeadPair('phoneSearch.too_short',{count:digits.length,min:PHONE_SEARCH_MIN_DIGITS})};
  if(digits.length>PHONE_SEARCH_MAX_DIGITS)return {ok:false,code:'too_long',messageKey:'phoneSearch.too_long',messageParams:{count:digits.length,max:PHONE_SEARCH_MAX_DIGITS},...renderLeadPair('phoneSearch.too_long',{count:digits.length,max:PHONE_SEARCH_MAX_DIGITS})};
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
