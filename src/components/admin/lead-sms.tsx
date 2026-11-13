'use client';
/**
 * R3.9 — the visitor side of Send SMS.
 *
 * One dialog does every send in this app (`SendSmsDialog`, R2); what this file adds is the three places a
 * lead can enter it, and the two things a lead entry point must never get wrong:
 *
 *  1. **Somebody who said "do not contact" is not texted, and the screen says so.** A blocked row offers no
 *     checkbox at all — it shows why instead — and the bar counts the blocked leads on this page out loud.
 *     That is a second layer, not the only one: `leadsForSms()` re-reads `canContact()` when the plan is
 *     built, so a visitor blocked in the minute since the page rendered is still not texted.
 *  2. **The send covers the people on screen, and nobody who left it.** Picking is per page. When the
 *     operator changes page or filter the list re-renders with other rows, and any picked id that is no
 *     longer on this screen drops out of the send rather than riding along invisibly — the button counts
 *     the ids it will actually hand over, so the number the operator reads is the number that goes.
 *
 * The picker holds the state; the bar and the row checkboxes read it through context, because the rows are
 * rendered by the server page and only the picker is a client boundary. A screen that does not wrap its
 * list in `LeadSmsPicker` renders no bar and no checkboxes at all — the context is absent, not empty.
 */
import {createContext,useCallback,useContext,useMemo,useState,type ReactNode} from 'react';
import {useTranslations} from 'next-intl';
import {MessageSquare} from 'lucide-react';
import SendSmsDialog from './send-sms-dialog';
import {leadSmsTally} from '@/lib/leads/lead-sms';
import type {LeadSmsKit} from '@/lib/leads/lead-sms';
import {formatNumber,type Digits} from '@/lib/admin/format';

/** One row of the list, as the picker needs it: an id, a name for the aria-label, and the two flags. */
export interface LeadSmsPick{id:string;studentName:string;contactable:boolean;hasPhone:boolean}

interface LeadSmsContextValue{
  /** Ids that are picked AND still on this screen — the only list a send may use. */
  picked:string[];
  toggle:(id:string,on:boolean)=>void;
  selectPage:(on:boolean)=>void;
  allPicked:boolean;
  openSend:()=>void;
  tally:{sendable:number;blocked:number;withoutPhone:number};
}

const LeadSmsContext=createContext<LeadSmsContextValue|null>(null);

export function LeadSmsPicker({rows,kit,digits='bn',language='bn',children}:{
  rows:LeadSmsPick[];kit:LeadSmsKit|null;digits?:Digits;language?:'bn'|'en';children:ReactNode;
}){
  const t=useTranslations('leads');
  const [picked,setPicked]=useState<string[]>([]);
  const [open,setOpen]=useState(false);
  // A row may only be picked if it can be contacted and has a number to be contacted on.
  const ids=useMemo(()=>rows.filter(row=>row.contactable&&row.hasPhone).map(row=>row.id),[rows]);
  const live=useMemo(()=>new Set(ids),[ids]);
  const sendIds=useMemo(()=>picked.filter(id=>live.has(id)),[picked,live]);
  const toggle=useCallback((id:string,on:boolean)=>{
    setPicked(current=>on?[...new Set([...current,id])]:current.filter(x=>x!==id));
  },[]);
  const selectPage=useCallback((on:boolean)=>setPicked(on?ids:[]),[ids]);
  const openSend=useCallback(()=>setOpen(true),[]);
  const allPicked=ids.length>0&&ids.every(id=>live.has(id)&&sendIds.includes(id));
  const tally=useMemo(()=>leadSmsTally(rows.map(row=>({contactable:row.contactable,hasPhone:row.hasPhone}))),[rows]);
  const value=useMemo<LeadSmsContextValue>(()=>({picked:sendIds,toggle,selectPage,allPicked,openSend,tally}),
    [sendIds,toggle,selectPage,allPicked,openSend,tally]);

  /**
   * No catalog, no picker. `kit` is null for a role that may not spend money on SMS — the send route has
   * been `getAdmin()` since R2 — and rendering a checkbox that ends in a 403 would be a button that lies.
   * The list renders exactly as it did before this feature, with no bar and no column contents, because
   * without a provider the context is absent and `LeadSmsBar`/`LeadSmsCheck` return nothing at all.
   * Every hook above has already run, so the two returns cannot disagree about hook order.
   */
  if(!kit)return <>{children}</>;
  return <LeadSmsContext.Provider value={value}>
    {children}
    {open&&<SendSmsDialog
      open
      onClose={()=>setOpen(false)}
      request={{source:'leads',ids:sendIds}}
      templates={kit.templates}
      institutePhone={kit.institutePhone}
      titleBn={t('smsBulkTitle')}
      titleEn="SMS the selected visitors"
      defaultTemplateKey="visitor_thanks"
      en={language==='en'}
      // Clearing the pick after a send is the point of the count on the button: the next send starts from
      // an empty selection rather than from the people who were just thanked.
      onSent={()=>setPicked([])}
    />}
  </LeadSmsContext.Provider>;
}

/** The bar above the list: pick the page, read what is excluded, open the dialog. */
export function LeadSmsBar({digits='bn'}:{digits?:Digits}){
  const t=useTranslations('leads');
  const sms=useContext(LeadSmsContext);
  if(!sms)return null;
  const excluded=[
    sms.tally.blocked>0?t('smsExcluded',{count:formatNumber(sms.tally.blocked,digits)}):'',
    sms.tally.withoutPhone>0?t('smsNoPhoneCount',{count:formatNumber(sms.tally.withoutPhone,digits)}):'',
  ].filter(Boolean).join(' · ');
  return <div className="lead-sms-bar" data-lead-sms-bar="">
    <label className="admin-check">
      <input type="checkbox" className="lead-sms-check" name="smsLeadPage" checked={sms.allPicked}
        onChange={event=>sms.selectPage(event.target.checked)} aria-label={t('smsSelectPage')}/>
      <span>{t('smsSelectPage')}</span>
    </label>
    {sms.picked.length>0&&<button type="button" className="admin-mini-button" data-sms-open="" onClick={sms.openSend}>
      <MessageSquare aria-hidden="true" size={14}/>
      {t('smsSelected',{count:formatNumber(sms.picked.length,digits)})}
    </button>}
    {excluded&&<span className="admin-help lead-sms-excluded" data-sms-excluded="">{excluded}</span>}
    <span className="admin-help">{t('smsHelp')}</span>
  </div>;
}

/**
 * One row's cell: a checkbox, or the reason there is not one. A blocked lead is never selectable here, so
 * the exclusion is visible in the list itself and not only in the dialog's skip report.
 */
export function LeadSmsCheck({row}:{row:LeadSmsPick}){
  const t=useTranslations('leads');
  const sms=useContext(LeadSmsContext);
  if(!sms)return null;
  if(!row.contactable)return <span className="admin-badge disabled" title={t('blockedHelp')} data-sms-blocked="">{t('smsBlockedRow')}</span>;
  if(!row.hasPhone)return <span className="admin-help" data-sms-nophone="">{t('noPhone')}</span>;
  return <input type="checkbox" className="lead-sms-check" name="smsLead" value={row.id} data-sms-row=""
    aria-label={t('smsPickRow',{name:row.studentName})}
    checked={sms.picked.includes(row.id)} onChange={event=>sms.toggle(row.id,event.target.checked)}/>;
}
