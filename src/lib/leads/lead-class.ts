/**
 * R3 · Visitor leads — reading the sheet's class column.
 *
 * The same class is written as `XI`, `xi`, `XII`, `7`, a Bangla digit, a Bangla class word, `"New 9"`, `"new 6"`, `"SSC 25"`,
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
import {asciiDigits} from '../admin/format';
import {dhakaCalendar} from '@/lib/center/month-status';

export interface ClassFlag{code:string;messageKey:string;messageParams:Record<string,string|number>;suggested?:number}

export interface ClassRead{
  /** Exactly what was written. Always kept, because a label nobody could read is still evidence. */
  classLabel:string;
  /** 1–12, or null when it was not derived. Never a guess. */
  classGroup:number|null;
  newSession:boolean;
  exam:'ssc'|'hsc'|null;
  examYear:number|null;
  readKey:string;
  readParams:Record<string,string|number>;
  flags:ClassFlag[];
}

const ROMAN:Record<string,number>={I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10,XI:11,XII:12};
/** Bangla class words, as a sheet writes them. A lookup, not a guess. */
/* i18n-scan-allow-start: input synonyms typed on the owner's sheet, not sentences this app paints. */
const BANGLA_WORDS:Record<string,number>={ // i18n-scan-allow: input synonyms typed on the owner's sheet, not sentences this app paints
  ষষ্ঠ:6,সপ্তম:7,অষ্টম:8,নবম:9,দশম:10,একাদশ:11,একাদ্বশ:11,দ্বাদশ:12,
};
/* i18n-scan-allow-end */
/** Words around a class that carry no information: "Class 9", a Bangla class word plus 9, "9 (New)", "std 7". */
const NOISE=/(?:^|\s)(?:class|std|standard|grade|\u09b6\u09cd\u09b0\u09c7\u09a3\u09bf|\u0995\u09cd\u09b2\u09be\u09b8)(?:\s|$)|[()·\-–—.:]/gi; // i18n-scan-allow: Bangla noise words as escapes, a parse rule not a sentence

export function normalizeClassLabel(raw:unknown,now:Date=new Date()):ClassRead{
  const classLabel=String(raw==null?'':raw).trim();
  // Parsing reads the ASCII form; what is stored and shown is what was actually written.
  const written=asciiDigits(classLabel);
  const flags:ClassFlag[]=[];
  const out=(classGroup:number|null,extra:{newSession?:boolean;exam?:'ssc'|'hsc'|null;examYear?:number|null}={}):ClassRead=>{
    const newSession=!!extra.newSession;
    const exam=extra.exam||null;
    const examYear=extra.examYear||null;
    const readKey=classGroup?'classRead.group':exam?'classRead.examNoClass':classLabel?'classRead.unread':'classRead.empty';
    const readParams:Record<string,string|number>=classGroup
      ? {class:classGroup,session:newSession?1:0,exam:exam?` · ${exam.toUpperCase()} ${examYear??''}`:''}
      : exam?{exam:exam.toUpperCase(),year:examYear??''}:{};
    return {classLabel,classGroup,newSession,exam,examYear,readKey,readParams,flags};
  };

  if(!classLabel)return out(null);
  const text=written.replace(NOISE,' ').replace(/\s+/g,' ').trim();
  if(!text){
    flags.push({code:'unrecognized',
      messageKey:'classFlags.unrecognized',messageParams:{value:classLabel}});
    return out(null);
  }

  // "New 9" / the Bangla word for new plus 9 / "9 (New)": a class in the coming session.
  const fresh=text.match(/^(?:new|\u09a8\u09a4\u09c1\u09a8)\s*(.+)$/i)||text.match(/^(.+?)\s*(?:new|\u09a8\u09a4\u09c1\u09a8)$/i); // i18n-scan-allow: the Bangla word for new as escapes, a parse rule
  if(fresh){
    const inner=normalizeClassLabel(fresh[1].trim(),now);
    if(inner.classGroup){
      if(inner.flags.length)flags.push(...inner.flags);
      return out(inner.classGroup,{newSession:true,exam:inner.exam,examYear:inner.examYear});
    }
  }

  // An exam batch: SSC is the class-10 exam, HSC the class-12 one, so the class follows from the year
  // the visitor walked in — and only from that.
  const exam=text.match(/^(ssc|hsc|\u098f\u09b8\u098f\u09b8\u09b8\u09bf|\u098f\u0987\u099a\u098f\u09b8\u09b8\u09bf)\s*(\d{2}|\d{4})$/i); // i18n-scan-allow: Bangla exam words as escapes, a parse rule
  if(exam){
    const kind=/^(ssc|\u098f\u09b8\u098f\u09b8\u09b8\u09bf)$/i.test(exam[1])?'ssc':'hsc';
    const examYear=exam[2].length===2?2000+Number(exam[2]):Number(exam[2]);
    const visitYear=dhakaCalendar(now).year;
    const anchor=kind==='ssc'?10:12;
    const derived=anchor-(examYear-visitYear);
    if(derived>=1&&derived<=12){
      return out(derived,{exam:kind,examYear});
    }
    flags.push({code:'exam_year_out_of_range',
      messageKey:'classFlags.examYear',messageParams:{kind:kind.toUpperCase(),year:examYear,visit:visitYear,would:anchor-(examYear-visitYear)}});
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
      messageKey:'classFlags.outOfRange',messageParams:{value,min:1,max:12}});
    return out(null);
  }

  // Roman-looking but not a class (IIII, XIII), or text this app has no reading for.
  flags.push({code:'unrecognized',
    messageKey:'classFlags.unrecognized',messageParams:{value:classLabel}});
  return out(null);
}

