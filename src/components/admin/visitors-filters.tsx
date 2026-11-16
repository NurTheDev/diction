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
import {type ReactNode} from 'react';
import {DayField} from './popover';
import {ListFilters} from './list-pattern';
import type {Digits} from '@/lib/admin/format';

/** The filter panel: expanded on a desktop, collapsed on a phone, and never hiding an active filter.
    It is the shared one — this page's own name is what makes it `data-lead-filters` in a test. */
export function LeadFilters({label,active,children}:{label:string;active:string;children:ReactNode}){
  return <ListFilters kind="lead" label={label} active={active}>{children}</ListFilters>;
}

/**
 * One date filter — the pattern's own day field, named for this page. The value travels in a hidden
 * input under the name the query already reads, and what the operator sees is the day in their own
 * format, so there is nothing native left to misread.
 */
export function FilterDayField(props:{name:string;value:string;placeholder:string;clearLabel:string;digits:Digits;language:'bn'|'en'}){
  return <DayField {...props}/>;
}
