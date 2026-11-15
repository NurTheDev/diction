'use client';
/**
 * The visitors list's filter block (owner review, 2026-11-15).
 *
 * Two things changed here. The panel is OPEN on a desktop, because the front desk reads the list
 * through its filters and a collapsed panel means the chips above it are the only sign a filter is on;
 * on a phone it starts closed, where screen space is the scarce thing. And the two date filters are no
 * longer `type="date"`: the native box paints mm/dd/yyyy in some locales and a spinner in others, so
 * this page has no native date input at all — a day is picked from our calendar popover and read back
 * as dd/mm/yyyy or "15 Nov 2026".
 */
import {useEffect,useState,type ReactNode} from 'react';
import {DatePopover,shortDate} from './popover';
import type {Digits} from '@/lib/admin/format';

/** The filter panel: expanded on a desktop, collapsed on a phone, and never hiding an active filter. */
export function LeadFilters({label,active,children}:{label:string;active:string;children:ReactNode}){
  const [open,setOpen]=useState(true);
  useEffect(()=>{if(window.innerWidth<900)setOpen(false)},[]);
  return <details className="admin-help-panel lead-filters" data-lead-filters="" open={open||undefined}
    onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="admin-mini-button">{label}{active?` · ${active}`:''}</summary>
    {children}
  </details>;
}

/**
 * One date filter. The value travels in a hidden input under the name the query already reads, and what
 * the operator sees is the day in their own format — so there is nothing native left to misread, and
 * clearing it is a button beside the day rather than a hunt inside a browser widget.
 */
export function FilterDayField({name,value,placeholder,clearLabel,digits,language}:{
  name:string;value:string;placeholder:string;clearLabel:string;digits:Digits;language:'bn'|'en';
}){
  const [day,setDay]=useState(value);
  return <span className="pop-day-field" data-day-field={name}>
    <input type="hidden" name={name} value={day}/>
    <span className="admin-input pop-day-view" aria-live="polite">{day?shortDate(day,digits,language):placeholder}</span>
    <DatePopover digits={digits} language={language} label={<span className="admin-mini-button" data-day-pick={name}>{placeholder}</span>} onPick={setDay}/>
    {day&&<button type="button" className="admin-mini-button" data-day-clear={name} onClick={()=>setDay('')}>{clearLabel}</button>}
  </span>;
}
