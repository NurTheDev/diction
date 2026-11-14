/**
 * R3.4 · Visitor leads: reading the sheet's class column, and mapping its other columns.
 *
 * The same class is written as `XI`, `xi`, `XII`, `7`, `৭`, `নবম`, `"New 9"`, `"new 6"`, `"SSC 25"`,
 * `"Class 9"` and `"9 (New)"`. Each is a lookup or an arithmetic step, never a hunch: the raw label is
 * always kept, `classGroup` is a number 1–12 or null, and null means **not derived** — with a flag that
 * says so in the owner's words. An exam batch becomes a class only when the visit year is known, and a
 * column value or header this app has no reading for is handed back as a question instead of being
 * attached to the nearest field.
 */
import assert from 'node:assert/strict';
import {normalizeClassLabel} from '../src/lib/leads/lead-class';
import {
  normalizeGroup,normalizeMedium,normalizeShift,normalizeSource,mapSheetHeader,isUnnamedColumnHeader,
  unmappedHeaderQuestion,LEAD_SHEET_FIELDS,LEAD_SHEET_FIELD_LABELS,
} from '../src/lib/leads/lead-columns';

const at=(day:string)=>new Date(`${day}T10:00:00+06:00`);
const read=(raw:unknown,now:Date=at('2026-11-12'))=>normalizeClassLabel(raw,now);

function run(){
  // ---- 1. The brief's own spellings, every one of them read.
  assert.equal(read('XI').classGroup,11,'a Roman numeral');
  assert.equal(read('xi').classGroup,11,'in either case');
  assert.equal(read('XII').classGroup,12);
  assert.equal(read('IX').classGroup,9);
  assert.equal(read('7').classGroup,7,'a plain digit');
  assert.equal(read('৭').classGroup,7,'a Bangla digit');
  assert.equal(read('নবম').classGroup,9,'a Bangla class word');
  assert.equal(read('দশম শ্রেণি').classGroup,10,'with the word for class around it');
  assert.equal(read('New 9').classGroup,9,'"New 9" is class 9');
  assert.equal(read('New 9').newSession,true,'in the coming session, and that is its own flag rather than a guess about the year');
  assert.equal(read('new 6').classGroup,6,'in lower case');
  assert.equal(read('new 6').newSession,true);
  assert.equal(read('নতুন ৯').classGroup,9,'the same in Bangla');
  assert.equal(read('নতুন ৯').newSession,true);
  assert.equal(read('9 (New)').classGroup,9,'and written the other way round');
  assert.equal(read('9 (New)').newSession,true);
  assert.equal(read('Class 9').classGroup,9,'"Class 9" carries no information in the word class');
  assert.equal(read('শ্রেণি ৯').classGroup,9);
  assert.equal(read('grade 11').classGroup,11);
  assert.equal(read('XI').classLabel,'XI','and the label as written is always kept beside the reading');
  assert.equal(read('New 9').readKey,'classRead.group','the preview carries the catalog key of the reading');
  assert.equal(read('New 9').readParams.session,1,'and marks the coming session as a parameter, for either language to word');

  // ---- 2. An exam batch is arithmetic on the visit year — and only that.
  assert.equal(read('SSC 25',at('2025-06-01')).classGroup,10,'SSC is the class-10 exam, so a 2025 visitor sitting SSC 25 is in class 10');
  assert.equal(read('SSC 25',at('2024-06-01')).classGroup,9,'and the same batch a year earlier is class 9');
  assert.equal(read('SSC 25',at('2026-11-12')).classGroup,11,'or class 11 for someone who walked in the year after');
  assert.equal(read('ssc 2025',at('2025-06-01')).classGroup,10,'a four-digit year reads the same');
  assert.equal(read('SSC 25',at('2025-06-01')).exam,'ssc','with the exam and its year kept');
  assert.equal(read('SSC 25',at('2025-06-01')).examYear,2025);
  assert.equal(read('HSC 26',at('2026-06-01')).classGroup,12,'HSC is the class-12 exam');
  assert.equal(read('HSC 26',at('2025-06-01')).classGroup,11);
  assert.equal(read('এসএসসি ২৫',at('2025-06-01')).classGroup,10,'and the batch is written in Bangla too');
  const outOfRange=read('SSC 14',at('2026-11-12'));
  assert.equal(outOfRange.classGroup,null,'a batch year that gives no class 1–12 leaves the class empty');
  assert.equal(outOfRange.exam,'ssc','though the exam and year are still kept, because they were written');
  assert.equal(outOfRange.examYear,2014);
  assert.equal(outOfRange.flags[0].code,'exam_year_out_of_range');
  assert.equal(outOfRange.flags[0].messageKey,'classFlags.examYear','and the flag carries the catalog key of the not-derived sentence');

  // ---- 3. What cannot be read is reported, never repaired and never dropped.
  for(const raw of ['IIII','XIII','13','0','Column 1','Science','-','N/A','class','abc','১৩']){
    const result=read(raw);
    assert.equal(result.classGroup,null,`"${raw}" derives no class`);
    assert.equal(result.classLabel,String(raw),'the label is kept exactly as written');
    assert.equal(result.flags.length,1,`"${raw}" is reported once`);
    assert.ok(result.flags[0].messageKey,'the flag carries a catalog key');
    assert.ok(result.flags[0].messageKey.startsWith('classFlags.'),'in the classFlags namespace, where both languages live');
  }
  assert.equal(read('IIII').flags[0].code,'unrecognized','IIII is not 4, because a Roman numeral is a table and not a pattern');
  assert.equal(read('13').flags[0].code,'out_of_range','13 is not a class');
  assert.equal(read('১৩').flags[0].code,'out_of_range','nor is ১৩');
  assert.equal(read('').classLabel,'','an empty cell keeps nothing');
  assert.equal(read('').flags.length,0,'and is not an error to report');
  assert.equal(read(null).classGroup,null,'a missing cell derives no class');
  assert.equal(read('').readKey,'classRead.empty','the preview says nothing was written, by catalog key');
  assert.equal(read('New').classGroup,null,'"New" with no class after it is not a class');

  // ---- 4. Column values map from a table, and an unmapped cell becomes a question, not a default.
  assert.equal(normalizeGroup('বিজ্ঞান'),'science');
  assert.equal(normalizeGroup('Sci'),'science');
  assert.equal(normalizeGroup('business'),'commerce');
  assert.equal(normalizeGroup('Other'),null,'"Other" is not a group — nothing is defaulted');
  assert.equal(normalizeMedium('Bangla Version'),'bangla');
  assert.equal(normalizeMedium('বাংলা ভার্সন'),'bangla');
  assert.equal(normalizeMedium('ইংলিশ ভার্সন'),'english_version');
  assert.equal(normalizeMedium('EV'),'english_version');
  assert.equal(normalizeMedium(''),null,'an empty cell is not a medium');
  assert.equal(normalizeShift('সন্ধ্যা'),'evening');
  assert.equal(normalizeShift('Morning'),'morning');
  assert.equal(normalizeShift('যেকোনো'),'any');
  assert.equal(normalizeSource('ফেসবুক'),'facebook');
  assert.equal(normalizeSource('কল'),'phone');
  assert.equal(normalizeSource('পরিচয়'),'referral');
  // Substring matching would be a guess: "ফেসবুকের মাধ্যমে" is Facebook, not a referral, so a phrase
  // with no exact reading is handed back to the importer to ask about.
  assert.equal(normalizeSource('পরিচিত কারো মাধ্যমে'),null,'a phrase with no exact reading is not filed as a referral');
  assert.equal(normalizeSource('অজানা'),null,'and an unknown source is flagged by the importer, not filed as "other"');

  // ---- 5. Headers: the sheet's own columns are known, anything else is the owner's to name.
  const expected:Record<string,string>={
    Date:'date','তারিখ':'date',Name:'studentName','শিক্ষার্থীর নাম':'studentName',Class:'classLabel',
    'শ্রেণি':'classLabel',Institute:'school','স্কুল':'school',Number:'phones','নম্বর':'phones',
    Group:'group',Shift:'shift',Medium:'medium',মাধ্যম:'medium',Comments:'notes','মন্তব্য':'notes',
    'Follow Up':'nextFollowUp',Status:'status','Interested In':'interestedIn',
  };
  for(const [header,field] of Object.entries(expected))assert.equal(mapSheetHeader(header),field,`"${header}" is the sheet's ${field}`);
  assert.equal(mapSheetHeader('Column 1'),null,'a column nobody named is not attached to the nearest field');
  assert.equal(mapSheetHeader('Column 2'),null);
  assert.equal(mapSheetHeader(''),null,'and neither is a blank header');
  assert.equal(mapSheetHeader('Some Weird Header'),null,'nor an unknown one');
  assert.equal(isUnnamedColumnHeader('Column 1'),true,'the shape a spreadsheet gives an unnamed column is recognized as such');
  assert.equal(isUnnamedColumnHeader('col 2'),true);
  assert.equal(isUnnamedColumnHeader('Number'),false,'a real header is not "unnamed"');
  assert.match(unmappedHeaderQuestion('Column 1').messageBn,/কোনো নাম নেই/,'and gets its own question: this column has no name');
  assert.match(unmappedHeaderQuestion('Column 1').messageEn,/has no name/);
  assert.match(unmappedHeaderQuestion('Some Weird Header').messageBn,/চেনা যায়নি/,'while an unknown name is asked about directly');
  assert.match(unmappedHeaderQuestion('Some Weird Header').messageEn,/not recognized/);
  for(const field of LEAD_SHEET_FIELDS){
    assert.ok(LEAD_SHEET_FIELD_LABELS[field].bn&&LEAD_SHEET_FIELD_LABELS[field].en,`${field} has a question in both languages`);
  }

  console.log('Visitor sheet class column: XI/xi/XII/IX, 7, ৭, নবম, দশম শ্রেণি, "New 9", "new 6", নতুন ৯, "9 (New)", "Class 9", শ্রেণি ৯ and grade 11 are each read by lookup or arithmetic with the raw label kept and "new" carried as its own session flag; SSC 25 becomes class 10, 9 or 11 depending on the year the visitor walked in and keeps its exam and year, while SSC 14 leaves the class empty with a flag rather than guessing; IIII, XIII, 13, ১৩, "Column 1", "-" and "N/A" derive no class, keep the label exactly as written and report why in both languages; group, medium, shift and source values map from a table where "Other" and "অজানা" become null instead of a default; and the sheet’s own headers map to fields while an unnamed or unknown column is handed back as a question — "this column has no name" for Column 1, "which field does it belong to" for anything else.');
}

run();
