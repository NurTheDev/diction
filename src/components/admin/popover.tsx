'use client';
/**
 * The reference list's two floating surfaces: a small popover anchored to whatever opened it, and a
 * calendar that is NOT the browser's date box.
 *
 * The native `type="date"` input paints mm/dd/yyyy in some locales and a spinner in others, so a
 * follow-up promised for a Dhaka day can be read back as a different day than the one that was picked.
 * The calendar here is ours: it names its months and its weekday headers through `Intl` in the
 * account's language — no hardcoded Bangla anywhere in src/ — reads a picked day back as dd/mm/yyyy in
 * the operator's digits or as "15 Nov 2026", opens on Dhaka's own month and rings Dhaka's own today, and
 * closes on Escape or a click outside.
 */
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {dhakaDay} from '@/lib/admin/today';
import {formatDigits,formatNumber,type Digits} from '@/lib/admin/format';

type Language='bn'|'en';
const intl=(language:Language)=>language==='bn'?'bn-BD':'en-GB';

/**
 * The digits a date is read in. A Bangla screen uses the digits the operator chose; an English screen
 * uses English digits, because that is what the rest of an English date already does — `shortDate`
 * writes "15 Nov 2026" there whatever the account's digit setting says. Without this the calendar head
 * announced "November 2026" in Bangla digits over cells that read back in English ones.
 */
const dateDigits=(digits:Digits,language:Language):Digits=>language==='en'?'en':digits;

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

/**
 * A labelled anchor button and the surface it opens. One tap in, one tap (or Escape) out.
 *
 * The surface is `position:fixed` and placed from the anchor's own rectangle, for two reasons that a
 * list row makes unavoidable: an `overflow:auto` table wrap clips an absolutely positioned child (the
 * last row's menu would be cut off), and a menu in the last column would hang past the viewport. Fixed
 * positioning escapes the wrap's clipping, the placement keeps the surface inside the window, it flips
 * upwards when there is no room below, and on a phone the stylesheet turns it into a bottom sheet
 * instead — so `place()` sets no inline box at all under 761px.
 */
export function Popover({label,className='',bodyClass='',children,title}:{label:ReactNode;className?:string;bodyClass?:string;children:ReactNode|((close:()=>void)=>ReactNode);title?:string}){
  const [open,setOpen]=useState(false);
  const anchor=useRef<HTMLButtonElement>(null);
  const surface=useRef<HTMLDivElement>(null);
  const [box,setBox]=useState<{top:number;left:number}|null>(null);
  const ref=useOutsideClose(()=>setOpen(false));
  useEffect(()=>{
    if(!open)return;
    /* Placed from the anchor's rectangle and then corrected against the surface's OWN measured size.
       A guessed height is what leaves a tall calendar or a six-item menu hanging past the fold, and a
       fixed box below the fold is on screen but unreachable: nothing can scroll it into view. So the
       surface is measured, flipped upwards only when it does not fit below and fits better above, and
       clamped inside the window either way — pinned to the edge, over the anchor if it must, rather
       than off the screen. The upward flip moves `top` and never uses a transform, because a transformed
       box becomes the containing block of anything fixed inside it: the calendar opens from inside a
       menu, and a transform on the menu would place the calendar against the menu instead of the window
       and drop it off the screen. */
    const place=()=>{
      if(window.innerWidth<=760){setBox(null);return}
      const rect=anchor.current?.getBoundingClientRect();
      if(!rect)return;
      const gap=6,edge=8;
      const wide=surface.current?.offsetWidth||Math.min(330,window.innerWidth-2*edge);
      const tall=surface.current?.offsetHeight||280;
      const below=window.innerHeight-rect.bottom-gap-edge;
      const above=rect.top-gap-edge;
      const up=tall>below&&above>below;
      const top=up
        ?Math.max(edge,rect.top-gap-tall)
        :Math.min(rect.bottom+gap,Math.max(edge,window.innerHeight-edge-tall));
      const left=Math.max(edge,Math.min(rect.left,window.innerWidth-wide-edge));
      setBox(previous=>previous&&previous.top===top&&previous.left===left?previous:{top,left});
    };
    place();
    const frame=requestAnimationFrame(place);
    window.addEventListener('scroll',place,true);window.addEventListener('resize',place);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',place,true);window.removeEventListener('resize',place)};
  },[open]);
  return <div className={`pop ${className}`} ref={ref}>
    <button type="button" className="pop-anchor" ref={anchor} aria-expanded={open} aria-label={title} onClick={()=>setOpen(value=>!value)}>{label}</button>
    {open&&<div className={`pop-body ${bodyClass}`} ref={surface} style={box?{top:box.top,left:box.left}:undefined}>
      {typeof children==='function'?children(()=>setOpen(false)):children}</div>}
  </div>;
}

/** The month's own name, in the account's language, with the year in the operator's digits. */
export function monthWord(year:number,month:number,digits:Digits,language:Language):string{
  const at=new Date(Date.UTC(year,month-1,1));
  const name=new Intl.DateTimeFormat(intl(language),{month:'long',timeZone:'UTC'}).format(at);
  return `${name} ${formatNumber(year,dateDigits(digits,language))}`;
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
  /* Dhaka's own day, not the machine's: the operator's midnight is six hours ahead of UTC, so a calendar
     built from `new Date()` rings yesterday's date for six hours every evening — and near a month's end
     it opens on the wrong month. `dhakaDay` is what the rule layer stores a follow-up with, so the
     calendar and the record agree about when "today" is. */
  const today=dhakaDay();
  const todayYear=Number(today.slice(0,4)),todayMonth=Number(today.slice(5,7)),todayDay=Number(today.slice(8,10));
  const [cursor,setCursor]=useState({year:todayYear,month:todayMonth});
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
          const isToday=day===todayDay&&cursor.month===todayMonth&&cursor.year===todayYear;
          return <button key={day} type="button" role="gridcell" data-cal-day={iso(day)}
            className={isToday?'pop-cal-day today':'pop-cal-day'} aria-current={isToday?'date':undefined}
            onClick={()=>{onPick(iso(day));close()}}>{formatNumber(day,dateDigits(digits,language))}</button>;
        })}
      </div>
    </>}
  </Popover>;
}

/**
 * One day field: the value travels in a hidden input under the name the query or the action already
 * reads, and what the operator sees is that day in their own format, with Clear beside it rather than a
 * hunt inside a browser widget. `MonthField` is the same shape for a YYYY-MM value.
 */
export function DayField({name,value,placeholder,clearLabel,digits,language,onChange}:{
  name:string;value:string;placeholder:string;clearLabel:string;digits:Digits;language:Language;
  onChange?:(value:string)=>void;
}){
  const [day,setDay]=useState(value);
  const pick=(next:string):void=>{setDay(next);onChange?.(next)};
  return <span className="pop-day-field" data-day-field={name}>
    <input type="hidden" name={name} value={day}/>
    <span className="admin-input pop-day-view" aria-live="polite">{day?shortDate(day,digits,language):placeholder}</span>
    <DatePopover digits={digits} language={language} label={<span className="admin-mini-button" data-day-pick={name}>{placeholder}</span>} onPick={pick}/>
    {day&&<button type="button" className="admin-mini-button" data-day-clear={name} onClick={()=>pick('')}>{clearLabel}</button>}
  </span>;
}
