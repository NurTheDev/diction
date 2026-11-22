'use client';
/**
 * The Students list — the first list composed from the shared pattern (`list-pattern.tsx`), so its
 * row, its filters, its bulk bar and its inline edit are the same code the Visitors list runs, and a
 * fix to any of them fixes both pages.
 *
 *   [filters: search · class · status · show removed]
 *   [☐] Name / id · class | number + Call + WhatsApp | status badge | dues chip | note | [Edit] [⋯]
 *   [bulk bar: 2 selected · SMS 2 selected · clear]
 *
 * Three things this page owns and the pattern does not:
 *
 *  • Its search is a POST, not an address bar. A name, a guardian's mobile or a student id never
 *    travels in a URL, a log or a browser history — so the filters are driven from state here rather
 *    than from `searchParams`, and the same `FilterToggle` the visitors list uses is controlled.
 *  • Its rows are re-read after every write. The list is client state, so `router.refresh()` alone
 *    would leave a held student looking active and a removed one still on the page.
 *  • Removed students are filed away, not deleted: the default list is the students the centre is
 *    running, and the show-removed tick is where the ones it stopped running went — the same shape as
 *    the visitors list's show-closed tick. A row behind that tick is Restore, not Remove.
 *
 * The bulk bar exists only while rows are ticked, and it says how many; a new search clears the
 * selection, so a page of ticks can never be sent to a list nobody is looking at.
 */
import {useCallback,useEffect,useRef,useState,useTransition} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {searchCenterStudents,type CenterSearchResult} from '@/actions/center-students';
import {formatNumber,type Digits} from '@/lib/admin/format';
import type {ClassChoice} from './center-forms';
import {BulkBar,FilterToggle,ListFilters} from './list-pattern';
import {listTableClass} from './list-class';
import {StudentRow,type StudentRowKit} from './students-row';
import SendSmsDialog,{type SmsTemplateOption} from './send-sms-dialog';

/** How many students a page holds — the search's own limit and the pager's own arithmetic, in one place
    so a page that has emptied is stepped back from by the number the server actually used (F-14). */
const PER_PAGE=20;

export function CenterStudentList({initial,classes,digits,sms,canManage,maySendSms,lockClassId}:{
  initial:CenterSearchResult;classes:ClassChoice[];digits:Digits;
  sms:{templates:SmsTemplateOption[];institutePhone:string};
  /** Only an Admin or a Super Admin removes or restores a student; the row says so to anybody else. */
  canManage:boolean;maySendSms:boolean;
  /** Group 3: a class page's list. The class is where the operator is standing, so it is not a filter
      they could change — the picker stays out and every read is this class's roll. */
  lockClassId?:string;
}){
  const t=useTranslations('center'),a=useTranslations('admin'),ts=useTranslations('sms'),common=useTranslations('common'),locale=useLocale();
  const language=locale==='en'?'en':'bn';
  const [result,setResult]=useState(initial);
  const [q,setQ]=useState(''),[classId,setClass]=useState(lockClassId||''),[status,setStatus]=useState(''),[removed,setRemoved]=useState(false);
  const [busy,start]=useTransition();
  /** Whether the operator has driven this list themselves, which is what decides whether a re-read from
      the server replaces the rows or is answered with the list the operator is actually looking at. */
  const touched=useRef(false);
  const [picked,setPicked]=useState<string[]>([]),[smsOpen,setSmsOpen]=useState(false);

  /* One way in and one way out: every filter, every page and every write re-reads through here, so the
     rows on screen are always the server's answer and never a stale client copy. Ticks that survive the
     re-read are kept — a bulk SMS in progress must not lose its selection because a row was held — and
     ticks that no longer exist on the page are dropped, so the bar never counts an invisible student. */
  function search(page:number,filter={q,classId,status,removed}){
    touched.current=true;
    start(async()=>{
      let target=Math.max(1,page);
      /* F-14 · a page that has emptied under the operator's feet is stepped back from, not shown. Taking
         the last student off the last page — by removing them, by moving them to another class, by a
         filter that no longer matches — left a table with no rows under a pager that still counted the
         page it was standing on, and the only way off it was a click that went nowhere. */
      for(let attempt=0;attempt<3;attempt++){
        const next=await searchCenterStudents({q:filter.q,classId:filter.classId,status:filter.status,page:target,removed:filter.removed});
        const lastPage=Math.max(1,Math.ceil(next.total/PER_PAGE));
        if(!next.items.length&&next.total>0&&target>lastPage){target=lastPage;continue}
        setResult(next);
        const ids=new Set(next.items.map(item=>item.id));
        setPicked(current=>current.filter(id=>ids.has(id)));
        return;
      }
    });
  }
  const onChanged=useCallback(()=>search(result.page),[result.page,q,classId,status,removed]);

  /* F-11 · the page this list is rendered inside is re-read by the router after every write, and a list
     held only in client state would keep showing the roll from before it: a student enrolled on the class
     page arrived in the database, in the header's own count and in nobody's table until somebody reloaded.
     So the server's answer is adopted when it arrives — as long as the operator has not driven the list
     somewhere else themselves, in which case their filters and their page are kept and re-read instead of
     being replaced by a list they did not ask for. */
  const stamp=[initial.total,initial.page,initial.removed?'removed':'live',
    initial.items.map(item=>`${item.id}:${item.revision}:${item.status}`).join('|')].join('#');
  useEffect(()=>{
    if(!touched.current){setResult(initial);return}
    search(result.page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[stamp]);

  const pageIds=result.items.map(item=>item.id);
  const allPicked=pageIds.length>0&&pageIds.every(id=>picked.includes(id));
  const toggle=(id:string,on:boolean):void=>setPicked(current=>on?[...new Set([...current,id])]:current.filter(x=>x!==id));
  const kit:StudentRowKit={digits,language,currency:common('currency'),canManage,maySendSms,
    templates:sms.templates,institutePhone:sms.institutePhone,smsTitle:ts('titles.students'),classes,
    onChanged,picked,onTick:toggle};
  /* What the panel's own summary says while a filter is on: a collapsed panel must never be the only
     sign that the list in front of the operator is not the whole list. */
  const active=[
    classId?classes.find(c=>c.id===classId)?.name||t('class'):'',
    status?t(status==='on_hold'?'onHold':status==='removed'?'removed':'active'):'',
    removed?t('row.removedShown'):'',
  ].filter(Boolean).join(' · ');
  const pages=Math.max(1,Math.ceil(result.total/PER_PAGE));

  return <>
    <ListFilters kind="student" label={t('row.filters')} active={active}>
      <form className="admin-filter list-filter" onSubmit={event=>{event.preventDefault();search(1)}}>
        <label><span>{t('searchLabel')}</span>
          <input name="q" className="admin-input" value={q} onChange={event=>setQ(event.target.value)} placeholder={t('search')}/></label>
        {!lockClassId&&<label><span>{t('class')}</span>
          <select className="admin-select" name="class" value={classId} onChange={event=>setClass(event.target.value)}>
            <option value="">{t('allClasses')}</option>
            {classes.map(c=><option key={c.id} value={c.id}>{c.name} {c.shift} · {formatNumber(c.year,digits)}</option>)}
          </select></label>}
        <label><span>{t('status')}</span>
          <select className="admin-select" name="status" value={status} onChange={event=>setStatus(event.target.value)}>
            <option value="">{t('allStatus')}</option>
            <option value="active">{t('active')}</option>
            <option value="on_hold">{t('onHold')}</option>
            <option value="removed">{t('removed')}</option>
          </select></label>
        {/* The third filter is a tick rather than a select, because it is not one status among others:
            it widens the list to the students the centre stopped running. */}
        <FilterToggle name="removed" label={t('row.showRemoved')} checked={removed} onChange={setRemoved}/>
        <button type="submit" className="button button-navy" disabled={busy}>{t('searchLabel')}</button>
      </form>
    </ListFilters>

    <section className="admin-panel list-panel" aria-busy={busy}>
      <div className="admin-panel-head">
        <h2>{t('list')}</h2>
        <span className="admin-help">{t('results',{count:formatNumber(result.total,digits)})}</span>
      </div>

      {result.error
        ?<div className="admin-empty" role="alert">{t('failure')}</div>
        :result.items.length
          ?<div className="admin-table-wrap">
            <table className={`${listTableClass('student')} admin-responsive-table`}>
              <thead><tr>
                <th className="student-check list-check" aria-label={t('row.bulk')}>
                  <input type="checkbox" aria-label={t('selectAll')} checked={allPicked}
                    onChange={event=>setPicked(event.target.checked?pageIds:[])}/>
                </th>
                <th className="student-who list-who">{t('row.who')}</th>
                <th className="student-call list-call">{t('row.contact')}</th>
                <th className="student-status list-status">{t('row.statusCol')}</th>
                <th className="student-dues list-dues">{t('row.duesCol')}</th>
                <th className="student-note list-note">{t('row.lastNote')}</th>
                <th className="student-act list-act">{t('row.actCol')}</th>
              </tr></thead>
              <tbody>{result.items.map(student=><StudentRow key={student.id} student={student} kit={kit}/>)}</tbody>
            </table>
          </div>
          :<div className="admin-empty" data-list-empty>{q||classId||status||removed?t('emptySearch'):t('empty')}</div>}

      {/* The bulk bar: it exists only while rows are ticked, it says how many, and its one verb is the
          message the operator came here to send — the row's own ⋯ holds everything else. */}
      {picked.length>0&&<BulkBar kind="student" countLabel={t('row.bulkSelected',{count:formatNumber(picked.length,digits)})}
        clearLabel={t('row.clearSelection')} onClear={()=>setPicked([])}>
        <button type="button" className="admin-mini-button" data-sms-open="" onClick={()=>setSmsOpen(true)}>
          {t('smsSelected',{count:formatNumber(picked.length,digits)})}</button>
      </BulkBar>}

      {smsOpen&&<SendSmsDialog open onClose={()=>setSmsOpen(false)} request={{source:'students',ids:picked}}
        templates={sms.templates} institutePhone={sms.institutePhone} title={ts('titles.students')}
        defaultTemplateKey="due_reminder" en={language==='en'} onSent={()=>setPicked([])}/>}

      <div className="admin-pagination" data-list-page={result.page} data-list-pages={pages}
        data-list-total={result.total}>
        <span>{a('page')} {formatNumber(result.page,digits)} {a('of')} {formatNumber(pages,digits)}</span>
        <div>
          {result.page>1&&<button type="button" className="admin-mini-button" disabled={busy} onClick={()=>search(result.page-1)}>{a('previous')}</button>}
          {result.page<pages&&<button type="button" className="admin-mini-button" disabled={busy} onClick={()=>search(result.page+1)}>{a('next')}</button>}
        </div>
      </div>
    </section>
  </>;
}
