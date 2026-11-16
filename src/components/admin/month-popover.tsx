'use client';
/**
 * The month popover — the pattern's picker for a `YYYY-MM` value, on the same surface, the same
 * placement rules and the same phone bottom sheet as the calendar in `popover.tsx`.
 *
 * A removed student is described by two months: the month they left and the month they came back.
 * The native `type="month"` box paints mm/yyyy in some locales and a spinner in others, and the list
 * pattern has no native date or month input anywhere, so a month is picked here and read back as
 * "নভেম্বর ২০২৬" in the operator's own digits or "Nov 2026" on an English screen — the same words
 * `monthWord` gives the calendar its head.
 */
import {useState,type ReactNode} from 'react';
import {Popover,monthWord} from './popover';
import {dhakaCalendar} from '@/lib/center/month-status';
import {formatNumber,type Digits} from '@/lib/admin/format';

export type Language='bn'|'en';

/** English screens count in English digits; Bangla screens count in the operator's own setting. */
const monthDigits=(digits:Digits,language:Language):Digits=>language==='en'?'en':digits;
const monthKey=(year:number,month:number):string=>`${year}-${String(month).padStart(2,'0')}`;
const monthNumber=(value:string):number=>{
  const [year,month]=String(value).split('-').map(Number);
  return year&&month?year*12+month:0;
};
const shortNames=(language:Language):string[]=>{
  const format=new Intl.DateTimeFormat(language==='bn'?'bn-BD':'en-GB',{month:'short',timeZone:'UTC'});
  return Array.from({length:12},(_,index)=>format.format(new Date(Date.UTC(2024,index,1))));
};

/** "নভেম্বর ২০২৬" / "Nov 2026" — a picked month read back in the operator's own words. */
export function shortMonth(value:string,digits:Digits,language:Language):string{
  const [year,month]=String(value).split('-').map(Number);
  if(!year||!month)return String(value||'');
  if(language==='en'){
    const name=new Intl.DateTimeFormat('en-GB',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,1)));
    return `${name} ${formatNumber(year,'en')}`;
  }
  return monthWord(year,month,digits,language);
}

/**
 * Twelve months of one year, with `‹ ›` for the years and Dhaka's own month ringed. `notBefore` and
 * `notAfter` switch off the months the rule layer would refuse anyway — a resume month that is not
 * after the leave month, a leave month in a future nobody has paid for — so the operator is stopped
 * by a dead button rather than by an error after a submit.
 */
export function MonthPopover({onPick,digits,language,label,notBefore,notAfter}:{
  onPick:(value:string)=>void;digits:Digits;language:Language;label:ReactNode;notBefore?:string;notAfter?:string;
}){
  /* Dhaka's month, not the machine's: the operator's midnight is six hours ahead of UTC, so a picker
     built from `new Date()` opens on last month for six hours every month-end evening. */
  const now=dhakaCalendar(new Date());
  const [year,setYear]=useState(now.year);
  const names=shortNames(language);
  const off=(month:number):boolean=>{
    const value=year*12+month;
    if(notBefore&&value<monthNumber(notBefore))return true;
    return !!notAfter&&value>monthNumber(notAfter);
  };
  return <Popover label={label} className="pop-date" bodyClass="pop-calendar">
    {close=><>
      <div className="pop-cal-head">
        <button type="button" onClick={()=>setYear(value=>value-1)} data-month-back="" aria-label="‹">‹</button>
        <strong data-month-year="">{formatNumber(year,monthDigits(digits,language))}</strong>
        <button type="button" onClick={()=>setYear(value=>value+1)} data-month-forward="" aria-label="›">›</button>
      </div>
      <div className="pop-month-grid" role="grid">
        {names.map((name,index)=>{
          const month=index+1,value=monthKey(year,month),isNow=year===now.year&&month===now.month;
          return <button key={value} type="button" role="gridcell" data-month-pick={value} disabled={off(month)}
            className={isNow?'pop-month-cell now':'pop-month-cell'} aria-current={isNow?'date':undefined}
            onClick={()=>{onPick(value);close()}}>{name}</button>;
        })}
      </div>
    </>}
  </Popover>;
}

/**
 * A month in a form: the value travels in a hidden input under the name the action reads, and what the
 * operator sees is the month in their own words, with a clear beside it. A hidden input is barred from
 * constraint validation, so `required` is the caller's business — `MonthField` reports every pick
 * through `onChange` and the form disables its submit until one has happened.
 */
export function MonthField({name,value,placeholder,clearLabel,digits,language,notBefore,notAfter,onChange}:{
  name:string;value:string;placeholder:string;clearLabel:string;digits:Digits;language:Language;
  notBefore?:string;notAfter?:string;onChange?:(value:string)=>void;
}){
  const [month,setMonth]=useState(value);
  const pick=(next:string):void=>{setMonth(next);onChange?.(next)};
  return <span className="pop-day-field" data-month-field={name}>
    <input type="hidden" name={name} value={month}/>
    <span className="admin-input pop-day-view" aria-live="polite">{month?shortMonth(month,digits,language):placeholder}</span>
    <MonthPopover digits={digits} language={language} notBefore={notBefore} notAfter={notAfter}
      label={<span className="admin-mini-button" data-month-choose={name}>{placeholder}</span>} onPick={pick}/>
    {month&&<button type="button" className="admin-mini-button" data-month-clear={name} onClick={()=>pick('')}>{clearLabel}</button>}
  </span>;
}
