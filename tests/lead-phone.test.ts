/**
 * R3.3 · Visitor leads: reading the sheet's phone numbers. Pure module, no database.
 *
 * One cell can hold a clean number, `0 1934-595247`, Bangla digits, two numbers split by a comma, a
 * space or a word, a number with no leading zero, a number with a label after it, or ten digits that
 * are simply short. Separators are cleaned because they carry no information; a missing leading zero is
 * added because that is what the national format means; and everything else is flagged with the text
 * exactly as written kept beside it, because inventing the missing digit of a short number would hand
 * a family's message to a stranger. The suite also pins where a number may appear: in a `tel:` or
 * `wa.me` href the brief asks for, and in a mask — never in a route of this app, a log or an audit row.
 */
import assert from 'node:assert/strict';
import {parsePhoneCell,telHref,whatsappHref,maskedPhones,phoneSearchDigits,phoneSearchMask,isNumberAttempt,PHONE_SEARCH_MIN_DIGITS,PHONE_SEARCH_MAX_DIGITS,PHONE_ATTEMPT_MAX_LENGTH} from '../src/lib/leads/lead-phone';

const read=(raw:unknown)=>parsePhoneCell(raw);
const numbers=(raw:unknown)=>read(raw).phones.map(phone=>phone.normalized);

function run(){
  // ---- 1. The clean cases, and cleaning that loses nothing but separators.
  assert.deepEqual(numbers('01712817090'),['01712817090'],'a number as written');
  assert.deepEqual(read('01712817090').flags,[],'and nothing to report about it');
  assert.deepEqual(numbers('0 1934-595247'),['01934595247'],'a space and a dash are separators inside one number, not two numbers');
  assert.deepEqual(numbers('০১৭১২৮১৭০৯০'),['01712817090'],'Bangla digits are digits');
  assert.deepEqual(numbers('1712817090'),['01712817090'],'a missing leading zero is added, because that is the national format');
  assert.deepEqual(numbers('+8801712817090'),['01712817090'],'a country code is read and dropped');
  assert.deepEqual(numbers('8801712817090'),['01712817090']);
  assert.deepEqual(numbers('(01712) 817-090'),['01712817090'],'brackets and dashes grouped by hand');
  assert.equal(read('০১৭১২৮১৭০৯০').phones[0].original,'০১৭১২৮১৭০৯০','the original spelling is kept beside the normalized number');

  // ---- 2. Two numbers in one cell, however they were separated.
  assert.deepEqual(numbers('01712817090,01911223344'),['01712817090','01911223344'],'a comma');
  assert.deepEqual(numbers('01712817090 01911223344'),['01712817090','01911223344'],'a space between two full numbers');
  assert.deepEqual(numbers('01712817090;01911223344'),['01712817090','01911223344'],'a semicolon');
  assert.deepEqual(numbers('01712817090\n01911223344'),['01712817090','01911223344'],'a line break');
  assert.deepEqual(numbers('01712817090 বাবা 01911223344'),['01712817090','01911223344'],'a word between them, which is a label and not part of either');
  assert.deepEqual(numbers('01712817090, 01712817090'),['01712817090'],'the same number twice is one number');
  assert.equal(read('01712817090 বাবা').phones.length,1,'a label after one number neither breaks it nor becomes a second one');
  assert.deepEqual(read('01712817090 বাবা').flags,[],'and is not worth a warning');

  // ---- 3. A number that is not a number: flagged, original kept, never repaired.
  const short=read('0171281709');
  assert.deepEqual(short.phones,[],'ten digits are not sent to anybody');
  assert.equal(short.flags.length,1);
  assert.equal(short.flags[0].code,'short');
  assert.equal(short.flags[0].original,'0171281709','what was written is what gets shown');
  assert.match(short.flags[0].messageBn,/অনুমান করা হয়নি/,'and the sentence says it was not guessed');
  assert.match(short.flags[0].messageEn,/not guessed/);
  assert.equal(read('01212817090').phones.length,0,'a prefix that does not exist is not a number');
  assert.equal(read('01212817090').flags[0].code,'invalid');
  const extra=read('01712817090123');
  assert.deepEqual(numbers('01712817090123'),['01712817090'],'one real number was read');
  assert.equal(extra.flags[0].code,'extra','and the digits left over are reported, not folded into it');
  assert.match(extra.flags[0].messageEn,/left over/);
  assert.deepEqual(numbers('0171281709001911223344'),['01712817090','01911223344'],'two numbers written with nothing between them still read as two');
  assert.equal(read('না').phones.length,0,'a word instead of a number');
  assert.equal(read('না').flags[0].code,'not_a_number');
  assert.equal(read('না').flags[0].original,'না','kept exactly as written');
  assert.equal(read('না').sawText,true,'something was written, so this is not "no number at all"');
  assert.match(read('না').flags[0].messageBn,/নম্বর নয়/,'and the sentence says it is not a number');

  // ---- 4. Nothing written is different from something unreadable — the sheet has both.
  for(const empty of ['', '   ', null, undefined]){
    const result=read(empty);
    assert.equal(result.sawText,false,`"${String(empty)}" holds no text`);
    assert.deepEqual(result.phones,[]);
    assert.deepEqual(result.flags,[],'and an empty cell is not an error to report');
  }

  // ---- 5. Where a number may appear: the two hrefs the brief asks for, and a mask. Nowhere else.
  assert.equal(telHref('01712817090'),'tel:+881712817090','the call button is a tel: destination');
  assert.equal(whatsappHref('01712817090'),'https://wa.me/881712817090','and the WhatsApp link goes to wa.me');
  assert.ok(!whatsappHref('01712817090').includes('/admin'),'neither is a route of this app');
  assert.ok(!telHref('01712817090').startsWith('/'),'so neither can end up in a server log as a path');
  assert.equal(maskedPhones(['01712817090']),'01712****90','a log line gets a mask');
  assert.equal(maskedPhones(['01712817090','01911223344']),'01712****90, 01911****44','both numbers, both masked');
  assert.equal(maskedPhones([]),'—','and an empty list is a dash, not an empty string');
  assert.ok(!maskedPhones(['01712817090']).includes('01712817090'),'the mask is not the number');

  // ---- Searching BY NUMBER: reading what the operator typed, without ever echoing it back.
  // phoneSearchDigits returns a discriminated union, so each helper narrows before it reads — the trap
  // is `.digits` on a refusal, which is a TS2339 and, at runtime, `undefined` where a test expected a
  // number. Three tiny readers keep the assertions below readable.
  const digitsOf=(typed:string):string=>{const read=phoneSearchDigits(typed);return read.ok===true?read.digits:''};
  const refusalOf=(typed:string):string=>{const read=phoneSearchDigits(typed);return read.ok===false?read.code:''};
  const messageOf=(typed:string):string=>{const read=phoneSearchDigits(typed);return read.ok===false?read.messageBn:''};
  const readOk=(typed:string)=>{const read=phoneSearchDigits(typed);return read.ok===true?read:null};
  assert.deepEqual([digitsOf('01712817090'),digitsOf('1712817090')],['01712817090','1712817090'],'typed digits, with the leading zero or without it');
  assert.equal(digitsOf('০১৭১২৮১৭০৯০'),'01712817090','Bangla digits read as the same number');
  assert.equal(digitsOf('+8801712817090'),'01712817090','a +88 country code is removed');
  assert.equal(digitsOf('0088 01712817090'),'01712817090','and so is 0088, with a space in the way');
  assert.equal(readOk('8801712817090')?.hadCountryCode,true,'the reader reports that it removed one');
  assert.equal(readOk('1712817090')?.hadLeadingZero,false,'and that the zero was missing');
  assert.equal(digitsOf('017-128-17090'),'01712817090','dashes carry no information');
  assert.equal(digitsOf('(017) 128 17090'),'01712817090','nor do brackets and spaces');
  assert.equal(digitsOf('7090'),'7090','a partial number is searched as the fragment it is');
  assert.equal(readOk('7090')?.length,PHONE_SEARCH_MIN_DIGITS,'and four digits is the shortest search allowed');
  assert.equal(digitsOf('1712817'),'1712817','so is a fragment from the middle');
  assert.equal(refusalOf('12'),'too_short','two digits is refused');
  assert.ok(messageOf('12').includes('২ অঙ্ক'),'the refusal counts the digits in Bangla…');
  assert.ok(!messageOf('12').includes('12'),'…and does not quote the digits that were typed');
  assert.equal(refusalOf('   '),'empty','an empty box is refused, not searched');
  assert.equal(refusalOf('0'.repeat(PHONE_SEARCH_MAX_DIGITS+1)),'too_long','and sixteen digits is not a number');
  assert.equal(digitsOf('৭০৯০'),'7090','a Bangla fragment reads the same way');
  assert.equal(phoneSearchMask('7090'),'****','a four-digit fragment is masked to nothing: the last four ARE the number');
  assert.equal(phoneSearchMask('1712817'),'****','and so is anything under eight digits');
  assert.equal(phoneSearchMask('01712817090'),'01****90','a full number is masked at both ends');

  // ---- "Did somebody type a number here?" — ONE reading, asked by the search box, by the URL builder
  // ---- and by the number search itself, so a browser and a server cannot answer it differently.
  assert.equal(isNumberAttempt('12'),true,'two digits are an attempt to type a number…');
  assert.equal(refusalOf('12'),'too_short','…and too short to look anybody up by — two facts, not one');
  assert.equal(isNumberAttempt('১২'),true,'Bangla digits are the same attempt');
  assert.equal(isNumberAttempt('7090'),true,'the last four off a crumpled sheet');
  assert.equal(isNumberAttempt('+8801712817090'),true,'with its country code and its plus');
  assert.equal(isNumberAttempt('(01712) 817-090'),true,'with the brackets and dashes a number is typed with');
  assert.equal(isNumberAttempt('রাহুল'),false,'a name is not one');
  assert.equal(isNumberAttempt('V-2026-0001'),false,'a lead id is not one — it stays a shareable word search');
  assert.equal(isNumberAttempt('ধানমন্ডি ৯'),false,'nor is a school with a class digit in it');
  assert.equal(isNumberAttempt(''),false,'and neither is an empty box');
  assert.equal(isNumberAttempt('  '),false,'nor one holding only spaces');
  // A paste is not a number somebody typed, and it must not reach the index as a substring query.
  const paste='0'.repeat(PHONE_ATTEMPT_MAX_LENGTH+1);
  assert.equal(isNumberAttempt(paste),false,`${PHONE_ATTEMPT_MAX_LENGTH+1} characters of digits is a paste, not a number`);
  assert.equal(isNumberAttempt('0'.repeat(PHONE_ATTEMPT_MAX_LENGTH)),true,'exactly at the limit it is still read as one');
  assert.equal(refusalOf(paste),'not_a_number','and the search says so instead of running it');
  assert.ok(messageOf(paste).includes('নাম্বার নয়'),'in Bangla, and telling the operator what to type instead');
  assert.ok(!messageOf(paste).includes('0'.repeat(6)),'the refusal does not quote the paste back');
  assert.equal(refusalOf('রাহুল'),'not_a_number','a name posted to the number search is answered, not run');
  assert.ok(messageOf('রাহুল').includes('৫'),'counting the characters typed');
  assert.ok(!messageOf('রাহুল').includes('রাহুল'),'and never quoting them');
  assert.ok(!phoneSearchMask('01712817090').includes('01712817090'),'and the mask is never the number');
  assert.equal(phoneSearchMask(''),'****','nothing typed, nothing shown');

  console.log('Visitor sheet phones: a clean number, "0 1934-595247", Bangla digits, brackets, a missing leading zero and a +880 country code all read to one normalized 01XXXXXXXXX with the original spelling kept; a number searched by typed digits, Bangla digits, a partial fragment, dashes, brackets, +88 and 0088, with the leading zero or without it, reads to the digits that are matched, answers "did somebody type a number here" in one place that the search box, the URL builder and the number search all ask — two digits are an attempt and too short to search by, a lead id and a school with a class digit in it are not attempts, and a paste of forty-one digits is answered as not a number instead of being run against the index — refuses two digits in Bangla that counts them without quoting them, and masks anything under eight digits to nothing; two numbers in one cell read as two whether they were split by a comma, a semicolon, a line break, a space or a Bangla label, and the same number twice reads once; ten digits are flagged short and never padded, a nonexistent prefix is invalid, digits left over beside a real number are reported rather than folded in, and a word instead of a number is kept as written — while an empty cell is distinguished from an unreadable one; and a number appears only in the tel: and wa.me destinations the brief requires and in a mask, never in a route of this app, a log line or an audit row.');
}

run();
