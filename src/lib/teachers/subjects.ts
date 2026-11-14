/**
 * R4 · Teacher CVs — reading the sheet's own words.
 *
 * The owner's teacher sheet writes subjects and free time the way a person writes them in a hurry:
 * `"6, 7, 8 (Math, Eng) 9-GS, Other"`, `"Class 4 to 7 (Bangla, Emg, BGG)"`, `"HSC (ICT) SSC (Phy, Che,
 * Math)"`, `"3.00-6.00"`, `"ALL"`, `"After 3.00PM"`, `"Full Time Free"`. Three rules decide what this
 * file does with them, and all three come from the brief:
 *
 *   1. **The words are kept.** `subjectsText` and `availabilityText` store exactly what was written;
 *      the reading sits beside them, never instead of them. A reading this app got wrong can then be
 *      corrected by a person who can still see the evidence.
 *   2. **A reading is a lookup or an arithmetic, never a hunch** — the same line `lead-class.ts` draws.
 *      `Math` is a table entry, `SSC` is class 10 by curriculum, `4 to 7` is four numbers by
 *      arithmetic. `Emg` and `BGG` are not in the table, so they are not read: they come back as
 *      `unparsed` and as suggested tags, and the row is flagged rather than blocked.
 *   3. **Nothing here can refuse a row.** Every function returns a reading; the flags say what was
 *      uncertain. A CV whose subject cell this parser cannot settle is still a CV worth calling.
 *
 * One convention is stated out loud because it is a policy and not a certainty: on a teaching sheet a
 * bare hour of 1–7 is an afternoon hour and 8–12 a morning one (nobody is free at 3 a.m.), so
 * `"3.00-6.00"` reads as evening. That reading is flagged `shift_from_time` so the operator sees it was
 * inferred, and an explicit `AM`/`PM`/`সকাল`/`বিকাল` always wins over it.
 */
import {asciiDigits} from '../admin/format';
import {TEACHER_CLASS_LEVELS,TEACHER_SUBJECTS,TEACHER_SHIFTS,type TeacherShift,type TeacherSubject} from './vocab';

export interface TeacherParseFlag{code:string;messageKey:string;messageParams:Record<string,string|number>}
const flag=(code:string,key:string,messageParams:Record<string,string|number>={}):TeacherParseFlag=>({code,messageKey:`flags.${key}`,messageParams});

/** Subject synonyms. A lookup table: what is not here is not read, and is reported instead. */
/* i18n-scan-allow-start: words a sheet may contain, read as input synonyms rather than painted as sentences. */
const SUBJECT_WORDS:Record<string,TeacherSubject>={
  bangla:'bangla',বাংলা:'bangla',bn:'bangla',
  english:'english',eng:'english',ইংরেজি:'english',
  math:'math',maths:'math',mathematics:'math',গণিত:'math',
  physics:'physics',phy:'physics',পদার্থ:'physics',পদার্থবিজ্ঞান:'physics',
  chemistry:'chemistry',chem:'chemistry',che:'chemistry',রসায়ন:'chemistry',
  biology:'biology',bio:'biology',জীববিজ্ঞান:'biology',
  ict:'ict',computer:'ict',কম্পিউটার:'ict',আইসিটি:'ict',
  accounting:'accounting',account:'accounting',acc:'accounting',হিসাববিজ্ঞান:'accounting',হিসাব:'accounting',
  finance:'finance',fin:'finance',ফিন্যান্স:'finance',
  civics:'civics',citizenship:'civics',পৌরনীতি:'civics',
  history:'history',ইতিহাস:'history',
  geography:'geography',ভূগোল:'geography',
  religion:'religion',islam:'religion',ধর্ম:'religion',ইসলাম:'religion',
  other:'other',অন্যান্য:'other',
};
/** Bangla class words, as a sheet writes them. */
const CLASS_WORDS:Record<string,number>={ষষ্ঠ:6,সপ্তম:7,অষ্টম:8,নবম:9,দশম:10,একাদশ:11,একাদ্বশ:11,দ্বাদশ:12};
/** Words that carry no subject and no class of their own, so they are neither read nor reported. */
const NOISE=new Set(['class','classes','std','standard','grade','subject','subjects','to','and','shreni','ক্লাস','শ্রেণি','বিষয়','থেকে','হতে','until','upto','up']);
/* i18n-scan-allow-end */

const ROMAN:Record<string,number>={I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10,XI:11,XII:12};
/** SSC is the class-10 exam and HSC the class-12 one — curriculum arithmetic, not a guess. */
const STAGES:Record<string,number>={ssc:10,hsc:12,jsc:8,jdc:8};

export interface SubjectRead{
  /** Exactly what was written. Always kept: a reading nobody can check is not worth having. */
  subjectsText:string;
  /** Vocabulary subjects, in vocabulary order, duplicates folded. */
  subjects:string[];
  /** Specific class numbers as strings, expanded from ranges, in ascending order. */
  classLevels:string[];
  /** Words no lookup settled. Kept, offered as tags, never blocking. */
  unparsed:string[];
  suggestedTags:string[];
  flags:TeacherParseFlag[];
}

/** Split one cell into tokens, keeping the parentheses' contents as tokens of their own. */
function tokenize(text:string):string[]{
  return asciiDigits(text)
    .replace(/[(){}\[\]]/g,' ')
    .split(/[,;|/\n]+|\s+|\s*[-–—]\s*/)
    .map(token=>token.trim())
    .filter(Boolean);
}

export function readSubjectsText(raw:unknown):SubjectRead{
  const subjectsText=String(raw==null?'':raw).trim();
  const read:SubjectRead={subjectsText,subjects:[],classLevels:[],unparsed:[],suggestedTags:[],flags:[]};
  if(!subjectsText)return read;

  const folded=asciiDigits(subjectsText);
  const classes=new Set<number>();
  const subjects=new Set<TeacherSubject>();
  const unparsed:string[]=[];

  // Ranges first, so "4 to 7" becomes four numbers instead of two stray ones: arithmetic, not a hunch.
  const rangeText=folded.replace(/\b(\d{1,2})\s*(?:-|–|to|until)\s*(\d{1,2})\b/gi,(whole,from,to)=>{
    const start=Number(from),end=Number(to);
    if(start>=1&&end<=12&&start<=end){
      for(let value=start;value<=end;value+=1)classes.add(value);
      return ' ';
    }
    return whole;
  });

  for(const token of tokenize(rangeText)){
    const word=token.toLowerCase();
    if(!word||NOISE.has(word))continue;
    // A Bangla class word is a lookup into a fixed table.
    const banglaClass=Object.keys(CLASS_WORDS).find(key=>token.includes(key));
    if(banglaClass){classes.add(CLASS_WORDS[banglaClass]);continue}
    // SSC / HSC name an exam, and an exam names a class.
    if(STAGES[word]){classes.add(STAGES[word]);continue}
    if(ROMAN[word.toUpperCase()]&&/^[ivx]+$/i.test(word)){classes.add(ROMAN[word.toUpperCase()]);continue}
    const digits=token.match(/^(\d{1,2})$/);
    if(digits){
      const value=Number(digits[1]);
      if(value>=1&&value<=12)classes.add(value);
      else unparsed.push(token);
      continue;
    }
    // A Bangla subject word may be glued to other letters ("গণিতশিক্ষা"), so this is a contains-lookup.
    const banglaSubject=Object.keys(SUBJECT_WORDS).find(key=>/[\u0980-\u09ff]/.test(key)&&token.includes(key));
    if(banglaSubject){subjects.add(SUBJECT_WORDS[banglaSubject]);continue}
    const plain=word.replace(/[^a-z]/g,'');
    if(plain&&SUBJECT_WORDS[plain]){subjects.add(SUBJECT_WORDS[plain]);continue}
    if(/^\d+$/.test(word)){unparsed.push(token);continue}
    unparsed.push(token);
  }

  read.classLevels=[...classes].sort((a,b)=>a-b).map(value=>String(value)).filter(level=>(TEACHER_CLASS_LEVELS as readonly string[]).includes(level));
  read.subjects=TEACHER_SUBJECTS.filter(subject=>subjects.has(subject));
  read.unparsed=[...new Set(unparsed)];
  read.suggestedTags=read.unparsed.slice(0,8);
  if(read.unparsed.length)read.flags.push(flag('subject_unparsed','subjectUnparsed',{words:read.unparsed.slice(0,6).join(', ')}));
  if(!read.subjects.length&&read.subjectsText)read.flags.push(flag('no_subject','noSubjectRead'));
  return read;
}

export interface AvailabilityRead{availabilityText:string;shifts:string[];flags:TeacherParseFlag[]}

/* One hour as a sheet writes it, with the part of the day when the sheet bothers to say it. */
const HOUR_TOKEN=/\d{1,2}(?:[.:]\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|\u09b8\u0995\u09be\u09b2|\u09b8\u09a8\u09cd\u09a7\u09cd\u09af\u09be|\u09a6\u09c1\u09aa\u09c1\u09b0|\u09ac\u09bf\u0995\u09be\u09b2|\u09b0\u09be\u09a4|\u09ad\u09cb\u09b0)?/gi;
const AFTERNOON_WORDS=/pm|p\.m\.|\u09b8\u09a8\u09cd\u09a7\u09cd\u09af\u09be|\u09ac\u09bf\u0995\u09be\u09b2|\u09a6\u09c1\u09aa\u09c1\u09b0|\u09b0\u09be\u09a4|evening|afternoon|night/i;
const MORNING_WORDS=/am|a\.m\.|\u09b8\u0995\u09be\u09b2|\u09ad\u09cb\u09b0|morning/i;
const ALL_DAY=/\b(all|any|full\s*time|every\s*day|always|\u09b8\u09ac\s*\u09b8\u09ae\u09df|\u09aa\u09c2\u09b0\u09cd\u09a3\s*\u09b8\u09ae\u09df|\u09af\u09c7\u0995\u09cb\u09a8\u09cb)\b/i;

/**
 * One hour on a 12-hour sheet. An explicit AM/PM (in either language) settles it; without one, 8–11 is
 * a morning hour and 1–7 an afternoon hour, which is the convention stated in this file's docblock and
 * reported back as `inferred` so the operator can see it was a policy and not a certainty.
 */
function hourOf(text:string):{hour:number;inferred:boolean}|null{
  const match=text.match(/(\d{1,2})(?:[.:](\d{2}))?/);
  if(!match)return null;
  const value=Number(match[1]);
  if(value<1||value>23)return null;
  if(AFTERNOON_WORDS.test(text))return {hour:value<12?value+12:value,inferred:false};
  if(MORNING_WORDS.test(text))return {hour:value===12?0:value,inferred:false};
  if(value>=8&&value<=11)return {hour:value,inferred:true};
  return {hour:value<8?value+12:value,inferred:true};
}

export function readAvailability(raw:unknown):AvailabilityRead{
  const availabilityText=String(raw==null?'':raw).trim();
  const read:AvailabilityRead={availabilityText,shifts:[],flags:[]};
  if(!availabilityText)return read;
  if(ALL_DAY.test(availabilityText)){
    // "ALL" is every shift, so all three are stored: a filter for morning has to find this person too.
    read.shifts=[...TEACHER_SHIFTS];
    return read;
  }
  const found=new Set<TeacherShift>();
  let inferred=false;
  for(const piece of availabilityText.split(/[,;|\n]|\band\b/i)){
    for(const token of [...piece.matchAll(HOUR_TOKEN)].map(match=>match[0])){
      const at=hourOf(token);
      if(!at)continue;
      inferred=inferred||at.inferred;
      found.add(at.hour>=12?'evening':'morning');
    }
    if(MORNING_WORDS.test(piece)&&!/\d/.test(piece))found.add('morning');
    if(AFTERNOON_WORDS.test(piece)&&!/\d/.test(piece))found.add('evening');
  }
  read.shifts=TEACHER_SHIFTS.filter(shift=>found.has(shift));
  if(inferred&&read.shifts.length)read.flags.push(flag('shift_from_time','shiftFromTime',{shifts:read.shifts.join(', ')}));
  return read;
}

export interface SalaryRead{expectedSalary:number|null;flags:TeacherParseFlag[]}

/** A salary in taka: "12000", "12,000", "12k", "\u09f312000" all read; anything else stays null and is flagged. */
export function readSalary(raw:unknown):SalaryRead{
  const text=String(raw==null?'':raw).trim();
  if(!text)return {expectedSalary:null,flags:[]};
  const folded=asciiDigits(text).toLowerCase().replace(/[,;\s]/g,'').replace(/^(?:\u09f3|tk|taka|bdt)/,'').replace(/(?:\u09f3|tk|taka|bdt)$/,'');
  const thousand=folded.match(/^(\d+(?:\.\d+)?)k$/);
  const plain=folded.match(/^(\d+)(?:\.0+)?$/);
  const value=thousand?Math.round(Number(thousand[1])*1000):plain?Number(plain[1]):null;
  if(value===null||!Number.isFinite(value)||value<0)return {expectedSalary:null,flags:[flag('salary_unread','salaryUnknown',{value:text.slice(0,40)})]};
  return {expectedSalary:Math.round(value),flags:[]};
}
