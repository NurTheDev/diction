/**
 * R3 · Visitor leads — reading the sheet's class column.
 *
 * The same class is written as `XI`, `xi`, `XII`, `7`, `৭`, `নবম`, `"New 9"`, `"new 6"`, `"SSC 25"`,
 * `"HSC 26"`, `"Class 9"` and `"9 (New)"`. Every one of those is a *reading*, and a reading is only
 * allowed when it is arithmetic or a lookup — never when it is a hunch.
 *
 * So the result always keeps the raw label, and `classGroup` is a number 1–12 or `null`. `null` does
 * not mean "no class"; it means **not derived**, and the flag says why in words the owner can act on.
 * An exam batch (`SSC 25`) becomes a class only when the visit year is known, because "SSC 2025" is
 * class 10 for someone who walked in during 2025 and class 9 for someone who walked in during 2024 —
 * and picking one of those without the year would put a child in the wrong class silently.
 *
 * "New 9" means class 9 in the coming session, so `newSession` is its own flag rather than a guess
 * about which academic year the row belongs to.
 */
import {dhakaCalendar} from '@/lib/center/month-status';

export interface ClassFlag{code:string;messageBn:string;messageEn:string;suggested?:number}

export interface ClassRead{
  /** Exactly what was written. Always kept, because a label nobody could read is still evidence. */
  classLabel:string;
  /** 1–12, or null when it was not derived. Never a guess. */
  classGroup:number|null;
  newSession:boolean;
  exam:'ssc'|'hsc'|null;
  examYear:number|null;
  readBn:string;
  readEn:string;
  flags:ClassFlag[];
}

const ROMAN:Record<string,number>={I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10,XI:11,XII:12};
/** Bangla class words, as a sheet writes them. A lookup, not a guess. */
const BANGLA_WORDS:Record<string,number>={
  ষষ্ঠ:6,সপ্তম:7,অষ্টম:8,নবম:9,দশম:10,একাদশ:11,একাদ্বশ:11,দ্বাদশ:12,
};
const BANGLA_DIGITS=/[০-৯]/g;
/** Words around a class that carry no information: "Class 9", "শ্রেণি ৯", "9 (New)", "std 7". */
const NOISE=/(?:^|\s)(?:class|std|standard|grade|শ্রেণি|ক্লাস)(?:\s|$)|[()·\-–—.:]/gi;

export function normalizeClassLabel(raw:unknown,now:Date=new Date()):ClassRead{
  const classLabel=String(raw==null?'':raw).trim();
  // Parsing reads the ASCII form; what is stored and shown is what was actually written.
  const written=classLabel.replace(BANGLA_DIGITS,c=>String('০১২৩৪৫৬৭৮৯'.indexOf(c)));
  const flags:ClassFlag[]=[];
  const out=(classGroup:number|null,extra:{newSession?:boolean;exam?:'ssc'|'hsc'|null;examYear?:number|null}={}):ClassRead=>{
    const newSession=!!extra.newSession;
    const exam=extra.exam||null;
    const examYear=extra.examYear||null;
    const readBn=classGroup
      ? `${banglaNumber(classGroup)} শ্রেণি${newSession?' (নতুন সেশন)':''}${exam?` · ${exam.toUpperCase()} ${examYear}`:''}`
      : exam?`${exam.toUpperCase()} ${examYear??''} — শ্রেণি নির্ণয় করা যায়নি`:classLabel?'পড়া যায়নি':'লেখা নেই';
    const readEn=classGroup
      ? `Class ${classGroup}${newSession?' (next session)':''}${exam?` · ${exam.toUpperCase()} ${examYear}`:''}`
      : exam?`${exam.toUpperCase()} ${examYear??''} — class not derived`:classLabel?'could not be read':'nothing written';
    return {classLabel,classGroup,newSession,exam,examYear,readBn,readEn,flags};
  };

  if(!classLabel)return out(null);
  const text=written.replace(NOISE,' ').replace(/\s+/g,' ').trim();
  if(!text){
    flags.push({code:'unrecognized',
      messageBn:`"${classLabel}" থেকে শ্রেণি পড়া যায়নি — লেখাটি রাখা হয়েছে, অনুমান করা হয়নি।`,
      messageEn:`"${classLabel}" gave no class — the label was kept and nothing was guessed.`});
    return out(null);
  }

  // "New 9" / "নতুন ৯" / "9 (New)": a class in the coming session.
  const fresh=text.match(/^(?:new|নতুন)\s*(.+)$/i)||text.match(/^(.+?)\s*(?:new|নতুন)$/i);
  if(fresh){
    const inner=normalizeClassLabel(fresh[1].trim(),now);
    if(inner.classGroup){
      if(inner.flags.length)flags.push(...inner.flags);
      return out(inner.classGroup,{newSession:true,exam:inner.exam,examYear:inner.examYear});
    }
  }

  // An exam batch: SSC is the class-10 exam, HSC the class-12 one, so the class follows from the year
  // the visitor walked in — and only from that.
  const exam=text.match(/^(ssc|hsc|এসএসসি|এইচএসসি)\s*(\d{2}|\d{4})$/i);
  if(exam){
    const kind=/^(ssc|এসএসসি)$/i.test(exam[1])?'ssc':'hsc';
    const examYear=exam[2].length===2?2000+Number(exam[2]):Number(exam[2]);
    const visitYear=dhakaCalendar(now).year;
    const anchor=kind==='ssc'?10:12;
    const derived=anchor-(examYear-visitYear);
    if(derived>=1&&derived<=12){
      return out(derived,{exam:kind,examYear});
    }
    flags.push({code:'exam_year_out_of_range',
      messageBn:`${kind.toUpperCase()} ${examYear} সাল থেকে শ্রেণি বের করা যায়নি (${visitYear} সালে যাঁরা এসেছেন তাঁদের জন্য এটি ${anchor-(examYear-visitYear)} হতো) — শ্রেণি খালি রাখা হয়েছে।`,
      messageEn:`${kind.toUpperCase()} ${examYear} does not give a class for a visit in ${visitYear} (it would be ${anchor-(examYear-visitYear)}) — the class was left empty rather than guessed.`});
    return out(null,{exam:kind,examYear});
  }

  // Roman numerals, from a fixed table: IIII is not 4 and will not be read as 4.
  const roman=text.toUpperCase().match(/^[IVX]+$/);
  if(roman&&ROMAN[roman[0]])return out(ROMAN[roman[0]]);

  // Bangla class words.
  const word=Object.keys(BANGLA_WORDS).find(key=>text.includes(key));
  if(word)return out(BANGLA_WORDS[word]);

  // Plain digits.
  const digits=text.match(/^\d{1,2}$/);
  if(digits){
    const value=Number(digits[0]);
    if(value>=1&&value<=12)return out(value);
    flags.push({code:'out_of_range',
      messageBn:`${value} কোনো শ্রেণি নয় (১–১২) — শ্রেণি খালি রাখা হয়েছে।`,
      messageEn:`${value} is not a class (1–12) — the class was left empty.`});
    return out(null);
  }

  // Roman-looking but not a class (IIII, XIII), or text this app has no reading for.
  flags.push({code:'unrecognized',
    messageBn:`"${classLabel}" থেকে শ্রেণি পড়া যায়নি — লেখাটি রাখা হয়েছে, অনুমান করা হয়নি।`,
    messageEn:`"${classLabel}" gave no class — the label was kept and nothing was guessed.`});
  return out(null);
}

function banglaNumber(value:number):string{
  return String(value).replace(/\d/g,c=>'০১২৩৪৫৬৭৮৯'[Number(c)]);
}
