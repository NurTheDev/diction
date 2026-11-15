'use client';
/**
 * The reference list's two floating surfaces: a small popover anchored to whatever opened it, and a
 * calendar that is NOT the browser's date box.
 *
 * The native `type="date"` input paints mm/dd/yyyy in some locales and a spinner in others, so a
 * follow-up promised for a Dhaka day can be read back as a different day than the one that was picked.
 * The calendar here is ours: it names its months and its weekday headers through `Intl` in the
 * account's language — no hardcoded Bangla anywhere in src/ — reads a picked day back as dd/mm/yyyy in
 * the operator's digits or as "15 Nov 2026", and closes on Escape or a click outside.
 */
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {formatDigits,formatNumber,type Digits} from '@/lib/admin/format';

type Language='bn'|'en';
const intl=(language:Language)=>language==='bn'?'bn-BD':'en-GB';

export function useOutsideClose(onClose:()=>void){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const down=(event:MouseEvent)=>{if(ref.current&&!ref.current.contains(event.target as Node))onClose()};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()};
    document.addEventListener('mousedown',down);document.addEventListener('keydown',key);
    return ()=>{document.removeEventListener('mousedown',down);document.removeEventListener('keydown',key)};
  },[onClose]);
  return ref;
}

/** A labelled anchor button and the surface it opens. One tap in, one tap (or Escape) out. */
export function Popover({label,className='',bodyClass='',children,title}:{label:ReactNode;className?:string;bodyClass?:string;children:ReactNode|((close:()=>void)=>ReactNode);title?:string}){
  const [open,setOpen]=useState(false);
  const ref=useOutsideClose(()=>setOpen(false));
  return <div className={`pop ${className}`} ref={ref}>
    <button type="button" className="pop-anchor" aria-expanded={open} aria-label={title} onClick={()=>setOpen(value=>!value)}>{label}</button>
    {open&&<div className={`pop-body ${bodyClass}`}>{typeof children==='function'?children(()=>setOpen(false)):children}</div>}
  </div>;
}

/** The month's own name, in the account's language, with the year in the operator's digits. */
export function monthWord(year:number,month:number,digits:Digits,language:Language):string{
  const at=new Date(Date.UTC(year,month-1,1));
  return `${new Intl.DateTimeFormat(intl(language),{month:'long',timeZone:'UTC'}).format(at)} ${formatNumber(year,digits)}`;
}

/** Seven weekday headers starting on Sunday, from `Intl` — the same source the month name comes from. */
export function dayHeaders(language:Language):string[]{
  const format=new Intl.DateTimeFormat(intl(language),{weekday:'short',timeZone:'UTC'});
  return Array.from({length:7},(_,index)=>format.format(new Date(Date.UTC(2024,0,7+index))));
}

/** dd/mm/yyyy in the operator's digits, or "15 Nov 2026" on an English screen. Never mm/dd/yyyy. */
export function shortDate(iso:string,digits:Digits,language:Language):string{
  const [year,month,day]=String(iso).split('-').map(Number);
  if(!year||!month||!day)return String(iso);
  if(language==='en'){
    const name=new Intl.DateTimeFormat('en-GB',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,day)));
    return `${formatNumber(day,'en')} ${name} ${formatNumber(year,'en')}`;
  }
  return formatDigits(`${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`,digits);
}

/** The calendar popover: month grid, today ringed, `‹ ›` for the months, one tap picks a day. */
export function DatePopover({onPick,digits,language,label}:{onPick:(iso:string)=>void;digits:Digits;language:Language;label:ReactNode}){
  const now=new Date();
  const [cursor,setCursor]=useState({year:now.getFullYear(),month:now.getMonth()+1});
  const first=new Date(Date.UTC(cursor.year,cursor.month-1,1)).getUTCDay();
  const length=new Date(Date.UTC(cursor.year,cursor.month,0)).getUTCDate();
  const iso=(day:number)=>`${cursor.year}-${String(cursor.month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const back=()=>setCursor(c=>c.month===1?{year:c.year-1,month:12}:{year:c.year,month:c.month-1});
  const forward=()=>setCursor(c=>c.month===12?{year:c.year+1,month:1}:{year:c.year,month:c.month+1});
  return <Popover label={label} className="pop-date" bodyClass="pop-calendar">
    {close=><>
      <div className="pop-cal-head">
        <button type="button" onClick={back} data-cal-back="" aria-label="‹">‹</button>
        <strong data-cal-month="">{monthWord(cursor.year,cursor.month,digits,language)}</strong>
        <button type="button" onClick={forward} data-cal-forward="" aria-label="›">›</button>
      </div>
      <div className="pop-cal-grid" role="grid">
        {dayHeaders(language).map((head,index)=><span key={`${head}${index}`} className="pop-cal-dayhead" role="columnheader">{head}</span>)}
        {Array.from({length:first},(_,index)=><span key={`pad${index}`}/>)}
        {Array.from({length:length},(_,index)=>index+1).map(day=>{
          const today=day===now.getDate()&&cursor.month===now.getMonth()+1&&cursor.year===now.getFullYear();
          return <button key={day} type="button" role="gridcell" data-cal-day={iso(day)}
            className={today?'pop-cal-day today':'pop-cal-day'} aria-current={today?'date':undefined}
            onClick={()=>{onPick(iso(day));close()}}>{formatNumber(day,digits)}</button>;
        })}
      </div>
    </>}
  </Popover>;
}
