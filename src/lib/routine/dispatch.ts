/**
 * R9 · Slice 2 · the words that leave the building: dispatch messages for a class and for a teacher.
 *
 * Every morning somebody retypes the day's routine into a WhatsApp group — from memory, from a
 * photograph of a whiteboard, wrongly. These builders write the same message the owner would write,
 * straight from the sheet: one readable block for the class group (date, class, then one line per
 * period with its time, subject, teacher and room), and one personal block per teacher (their own
 * periods across the classes they take that day). Plain text on purpose: it pastes into WhatsApp,
 * into Messenger, into a notice typed on a bulletin-board sheet.
 *
 * The sentences around the data come from the catalogs through the `say` the page hands in, so the
 * same builder writes Bangla on a Bangla screen and English on an English one, and the numbers are
 * in the reader's own digits.
 */
import {formatDate,type Digits} from '@/lib/admin/format';
import {rangeWord,type Language} from './time';

/** A translate function for the `routine` group, as the server hands it out. */
export type RoutineSay=(key:string,params?:Record<string,unknown>)=>string;

export interface DispatchPeriod{
  start:string;
  end:string;
  subjectBn:string;
  subjectEn:string;
  teacherName:string;
  room:string;
}

export interface TeacherDispatchRow{
  start:string;
  end:string;
  className:string;
  room:string;
}

const DHAKA_OFFSET='+06:00';

/** The class group's message: one line per period, in the sheet's own order. */
export function classDispatchText(args:{
  date:string;className:string;shift:string;periods:DispatchPeriod[];
  language:Language;digits:Digits;
},say:RoutineSay):string{
  const lines=[
    `${say('dispatch.classTitle')} — ${args.className}${args.shift?` (${args.shift})`:''}`,
    say('dispatch.dateLine',{date:formatDate(new Date(`${args.date}T00:00:00${DHAKA_OFFSET}`),args.digits,args.language)}),
  ];
  if(args.periods.length===0)lines.push(say('dispatch.noPeriods'));
  for(const period of args.periods){
    const subject=args.language==='en'?(period.subjectEn||period.subjectBn):period.subjectBn;
    lines.push(`${rangeWord(period.start,period.end,args.digits)} · ${subject}`
      +`${period.teacherName?` · ${period.teacherName}`:''}`
      +`${period.room?` · ${say('dispatch.roomWord',{room:period.room})}`:''}`);
  }
  lines.push(say('dispatch.footer'));
  return lines.join('\n');
}

/** One teacher's day: their periods across every class that holds them, earliest first. */
export function teacherDispatchText(args:{
  date:string;teacherName:string;rows:TeacherDispatchRow[];language:Language;digits:Digits;
},say:RoutineSay):string{
  const lines=[
    `${say('dispatch.teacherTitle')} — ${args.teacherName}`,
    say('dispatch.dateLine',{date:formatDate(new Date(`${args.date}T00:00:00${DHAKA_OFFSET}`),args.digits,args.language)}),
  ];
  if(args.rows.length===0)lines.push(say('dispatch.noPeriods'));
  for(const row of args.rows.sort((a,b)=>a.start<b.start?-1:a.start>b.start?1:0)){
    lines.push(`${rangeWord(row.start,row.end,args.digits)} · ${row.className}`
      +`${row.room?` · ${say('dispatch.roomWord',{room:row.room})}`:''}`);
  }
  lines.push(say('dispatch.footer'));
  return lines.join('\n');
}

/** The WhatsApp share address for a body of text — the link the "share" button points at. */
export function whatsappHref(text:string):string{
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** The Messenger share address for the same text: the mobile deep link Messenger reads. */
export function messengerHref(text:string):string{
  return `fb-messenger://share?link=${encodeURIComponent(text)}`;
}
