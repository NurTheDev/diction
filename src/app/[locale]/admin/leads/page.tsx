import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {redirect} from 'next/navigation';
import {getArchiver} from '@/lib/admin/guard';
import {dashboardDigits} from '@/lib/admin/digits';
import {pageNumber} from '@/lib/admin/helpers';
import {formatClass,formatDate,formatNumber} from '@/lib/admin/format';
import {leadStatusCounts,listLeads} from '@/lib/leads/leads';
import {visitorSmsDialogData} from '@/lib/center/sms-dialog-data';
import {leadListQuery,LEAD_GROUPS,LEAD_MEDIUMS,LEAD_SHIFTS,LEAD_SOURCES,LEAD_STATUSES} from '@/lib/leads/vocab';
import {
  followUpBadge,groupLabel,mediumLabel,rowView,shiftLabel,sourceLabel,statusBadge,statusLabel,
  type LeadListFiltersShape,
} from '@/lib/leads/lead-ui';
import {Pagination} from '@/components/admin/pagination';
import {LeadDetailDrawer,LeadQuickAdd,LeadRowControls,LeadSearch} from '@/components/admin/leads-ui';
import {LeadSmsBar,LeadSmsCheck,LeadSmsPicker} from '@/components/admin/lead-sms';
import {Phone,MessageCircle} from 'lucide-react';

type Query={q?:string;status?:string;classGroup?:string;group?:string;shift?:string;medium?:string;source?:string;
  followUp?:string;from?:string;to?:string;page?:string;new?:string};

const one=(value:string|undefined,allowed:readonly string[]):string=>(value&&allowed.includes(value)?value:'');
const day=(value:string|undefined):string=>(value&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:'');

/**
 * The Visitors list — the screen that replaces the owner's spreadsheet.
 *
 * Above the list there are exactly two controls, quick-add and search, because the front desk looks at
 * this page dozens of times a day and everything else (filters, chips) is one tap away but not in the
 * way. `?new=1` opens quick-add, which is what the mobile bottom bar's plus links to.
 *
 * Nothing here queries `Lead`: the rows, the counts and the refusals all come from `src/lib/leads/leads.ts`,
 * so this page cannot disagree with the rule layer, the importer or the cron job.
 */
export default async function Leads({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<Query>}){
  const {locale}=await params;
  /**
   * A role that may not see visitors is sent away rather than shown an error panel. `requireArchiver()`
   * throws, and what catches a throw here is `admin/error.tsx` — "could not load data, check the database
   * connection and permissions" — which is the wrong sentence for a teacher who is simply not allowed in,
   * and a sentence that sends an owner looking at the database instead of at the role. The Recycle Bin and
   * the Overview already refuse a role this way. The ACTIONS keep `requireArchiver()`: an action answers
   * the form that called it and has nowhere to send anybody, so it throws and the form says no.
   */
  const user=await getArchiver();
  if(!user)redirect(`/${locale}/admin`);
  const language=locale==='bn'?'bn':'en';
  const digits=await dashboardDigits(user.id);
  const t=await getTranslations('leads');
  const query=await searchParams;

  // Every filter is checked against its vocabulary before it is used: an invented status or a class of 99
  // is ignored rather than trusted, and `listLeads` checks them again because it is the one that queries.
  const q=(query.q||'').trim().slice(0,80);
  const status=one(query.status,LEAD_STATUSES);
  const group=one(query.group,LEAD_GROUPS);
  const shift=one(query.shift,LEAD_SHIFTS);
  const medium=one(query.medium,LEAD_MEDIUMS);
  const source=one(query.source,LEAD_SOURCES);
  const followUp=one(query.followUp,['today','overdue','none']) as ''|'today'|'overdue'|'none';
  const classGroup=one(query.classGroup,['1','2','3','4','5','6','7','8','9','10','11','12']);
  const from=day(query.from),to=day(query.to);
  const page=pageNumber(query.page);
  const openQuickAdd=query.new==='1';

  const now=new Date();
  const [result,counts]=await Promise.all([
    listLeads({q,status,classGroup,group,shift,medium,source,followUp:followUp||undefined,from,to,page,perPage:20},now),
    leadStatusCounts(),
  ]);
  /**
   * Who may press send. The SMS route has been `getAdmin()` since R2 because a send spends real money, so
   * a Staff user picking visitors would end in a 403 — which is why Staff gets no picker at all rather
   * than a picker that refuses (docs/R3-COVERAGE.md §9 records the owner's decision that is still owed).
   * No second guard call is needed: `getArchiver()` above already returned this user, and every guard
   * answers null when the user's own role is disabled, so an admin or super admin standing here is one
   * `getAdmin()` would return too.
   */
  const maySendSms=user.role==='admin'||user.role==='superadmin';
  /**
   * The visitor SMS catalog, loaded only for a role that may send: the picker and every drawer on this
   * page then offer the same narrowed set of templates (`visitorSmsDialogData()`: only the ones whose
   * chips a lead can actually fill, `visitor_thanks` among them) and the same center number. A screen
   * that cannot load it must not offer a send, so `null` means "no picker here", never an empty one.
   */
  const sms=maySendSms?await visitorSmsDialogData():null;
  /**
   * The rows the bulk send may pick from: this page of this filter, and nothing else. `contactable` comes
   * from the rule layer (`canContact()`), so a lead marked "do not contact" is not selectable here and is
   * counted as excluded by the bar — and it is checked a third time when the plan is built.
   */
  const smsRows=result.rows.map(row=>({id:row.id,studentName:row.studentName,contactable:row.contactable,hasPhone:(row.phones||[]).length>0}));
  const current:LeadListFiltersShape={q:q||undefined,status:status||undefined,classGroup:classGroup||undefined,group:group||undefined,shift:shift||undefined,medium:medium||undefined,source:source||undefined,followUp:followUp||undefined,from:from||undefined,to:to||undefined};

  /**
   * `leadListQuery` is the only thing that builds a list URL here, because it is also the thing that
   * refuses to put a phone-shaped search in one. It hands back a locale-prefixed href and `Link` adds the
   * locale itself, so the prefix comes off again — which is also why the chips and the reset link are
   * `Link`s and not `<a>`s: a bare anchor to a locale-less path is a 404.
   */
  const hrefOf=(overrides:Partial<LeadListFiltersShape>):string=>leadListQuery({locale:'bn',...current,...overrides}).href.replace(/^\/bn/,'');
  // The "all" chip counts every lead, not the ones the current filters left: `result.total` is filtered.
  const everyLead=counts.reduce((sum,entry)=>sum+entry.count,0);
  const activeFilters=[status,classGroup,group,shift,medium,source,followUp,from,to,q].filter(Boolean).length;
  const queryRecord:Record<string,string>={};
  for(const [key,value] of Object.entries(current))if(value)queryRecord[key]=value;

  return <>
    <div className="admin-heading"><div><h1>{t('title')}</h1><p>{t('desc')}</p></div></div>

    <div className="lead-tools">
      <LeadQuickAdd open={openQuickAdd} language={language}/>
      <LeadSearch language={language} digits={digits} current={current}/>
    </div>

    {result.refusedPhone&&<p className="admin-feedback error" role="status">{t('searchNumberHelp')}</p>}

    <nav className="lead-chips" aria-label={t('colStatus')}>
      <Link href={hrefOf({status:undefined})} className={status?'':'selected'}>{t('all')} <span>{formatNumber(everyLead,digits)}</span></Link>
      {counts.map(entry=><Link key={entry.status} href={hrefOf({status:entry.status})} className={status===entry.status?'selected':''}>
        {statusLabel(entry.status,language)} <span>{formatNumber(entry.count,digits)}</span>
      </Link>)}
    </nav>

    <details className="admin-help-panel" open={activeFilters>0||undefined}>
      <summary className="admin-mini-button">{t('filters')}{activeFilters?` · ${formatNumber(activeFilters,digits)}`:''}</summary>
      {/* A GET form on purpose — but with no free-text field in it. Text is searched by LeadSearch, which
          decides whether what was typed may travel in a URL at all. The hidden `q` is only echoed back
          when it is not phone-shaped, so a crafted URL cannot be re-emitted by this page. */}
      <form method="get" className="list-filter">
        {q&&!result.refusedPhone&&<input type="hidden" name="q" value={q}/>}
        <label>{t('colStatus')}<select className="admin-select" name="status" defaultValue={status}>
          <option value="">{t('all')}</option>
          {LEAD_STATUSES.map(option=><option key={option} value={option}>{statusLabel(option,language)}</option>)}
        </select></label>
        <label>{t('classGroup')}<select className="admin-select" name="classGroup" defaultValue={classGroup}>
          <option value="">{t('all')}</option>
          {Array.from({length:12},(_,index)=>index+1).map(value=><option key={value} value={String(value)}>{formatClass(value,digits,language)}</option>)}
        </select></label>
        <label>{t('group')}<select className="admin-select" name="group" defaultValue={group}>
          <option value="">{t('all')}</option>
          {LEAD_GROUPS.map(option=><option key={option} value={option}>{groupLabel(option,language)}</option>)}
        </select></label>
        <label>{t('shift')}<select className="admin-select" name="shift" defaultValue={shift}>
          <option value="">{t('all')}</option>
          {LEAD_SHIFTS.map(option=><option key={option} value={option}>{shiftLabel(option,language)}</option>)}
        </select></label>
        <label>{t('medium')}<select className="admin-select" name="medium" defaultValue={medium}>
          <option value="">{t('all')}</option>
          {LEAD_MEDIUMS.map(option=><option key={option} value={option}>{mediumLabel(option,language)}</option>)}
        </select></label>
        <label>{t('source')}<select className="admin-select" name="source" defaultValue={source}>
          <option value="">{t('all')}</option>
          {LEAD_SOURCES.map(option=><option key={option} value={option}>{sourceLabel(option,language)}</option>)}
        </select></label>
        <label>{t('colFollowUp')}<select className="admin-select" name="followUp" defaultValue={followUp}>
          <option value="">{t('all')}</option>
          <option value="today">{t('dueToday')}</option>
          <option value="overdue">{t('overdue')}</option>
          <option value="none">{t('followUpNone')}</option>
        </select></label>
        <label>{t('from')}<input className="admin-input" type="date" name="from" defaultValue={from}/></label>
        <label>{t('to')}<input className="admin-input" type="date" name="to" defaultValue={to}/></label>
        <div className="lead-form-foot">
          <button type="submit" className="button button-navy">{t('apply')}</button>
          <Link className="admin-mini-button" href={hrefOf({q:undefined,status:undefined,classGroup:undefined,group:undefined,shift:undefined,medium:undefined,source:undefined,followUp:undefined,from:undefined,to:undefined})}>{t('reset')}</Link>
        </div>
      </form>
    </details>

    <LeadSmsPicker rows={smsRows} kit={sms} digits={digits} language={language}>
    <section className="admin-panel list-panel">
      <div className="admin-panel-head">
        <h2>{followUp==='today'?t('dueToday'):followUp==='overdue'?t('overdue'):t('title')}</h2>
        <span className="admin-help">{t('totalLeads',{count:formatNumber(result.total,digits)})}</span>
        <LeadSmsBar digits={digits}/>
      </div>
      {result.rows.length?<div className="admin-table-wrap"><table className="admin-table admin-responsive-table">
        <thead><tr>
          {/* The column exists only where a send may happen: for a role that gets no picker, an always-empty
              column with a heading on it is noise the list did not have before. */}
          {sms&&<th>{t('smsColumn')}</th>}<th>{t('colDate')}</th><th>{t('colVisitor')}</th><th>{t('colClass')}</th><th>{t('colContact')}</th>
          <th>{t('colStatus')}</th><th>{t('colFollowUp')}</th><th>{t('colActions')}</th>
        </tr></thead>
        <tbody>{result.rows.map(row=>{
          const view=rowView(row);
          const pick={id:row.id,studentName:row.studentName,contactable:row.contactable,hasPhone:(row.phones||[]).length>0};
          return <tr key={row.id}>
            {sms&&<td data-label={t('smsColumn')}><LeadSmsCheck row={pick}/></td>}
            <td data-label={t('colDate')}><time dateTime={row.date}>{formatDate(row.date,digits,language)}</time></td>
            <td data-label={t('colVisitor')}><div>
              <strong>{row.studentName}</strong>
              {row.guardianName&&<><br/><span className="admin-help">{row.guardianName}</span></>}
              <br/><span className="admin-help">{row.leadId}{row.converted?` · ${t('converted')}`:''}</span>
              {row.flags.slice(0,2).map((flag,index)=><p key={index} className="lead-flag">{language==='bn'?flag.messageBn:flag.messageEn}</p>)}
            </div></td>
            <td data-label={t('colClass')}><div>
              {row.classGroup?formatClass(row.classGroup,digits,language):(row.classLabel||t('unknownValue'))}
              {row.school&&<><br/><span className="admin-help">{row.school}</span></>}
              {row.interestedIn&&<><br/><span className="admin-help">{row.interestedIn}</span></>}
            </div></td>
            <td data-label={t('colContact')}><div className="lead-row">
              {view.phones.length?view.phones.map((phone,index)=><span key={index} className="list-row-actions">
                {/* The mask is what is printed; the number itself exists only as a dial or WhatsApp
                    destination, which is the one place the brief allows it. */}
                <span className="admin-badge">{phone.masked}</span>
                <a className="admin-mini-button" href={phone.tel}><Phone size={15} aria-hidden="true"/>{t('call')}</a>
                <a className="admin-mini-button" href={phone.whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={15} aria-hidden="true"/>{t('whatsapp')}</a>
              </span>):<span className="admin-help">{t('noPhone')}</span>}
            </div></td>
            <td data-label={t('colStatus')}><div className="list-row-actions">
              <span className={`admin-badge ${statusBadge(row.status)}`}>{statusLabel(row.status,language)}</span>
              {row.doNotContact&&<span className="admin-badge disabled">{t('doNotContact')}</span>}
            </div></td>
            <td data-label={t('colFollowUp')}><div>
              {row.nextFollowUp
                ?<span className={`admin-badge ${followUpBadge(row.followUp)}`}>{formatDate(row.nextFollowUp,digits,language)}</span>
                :<span className="admin-help">{t('followUpNone')}</span>}
              {row.lastNote&&<><br/><span className="admin-help">{t('lastNote')}: {row.lastNote.text}</span></>}
            </div></td>
            <td data-label={t('colActions')}><div className="lead-row">
              <div className="list-row-actions"><LeadDetailDrawer seed={view} language={language} digits={digits} sms={sms}/></div>
              <LeadRowControls row={view} language={language}/>
            </div></td>
          </tr>;
        })}</tbody>
      </table></div>:<div className="admin-empty">
        <p>{activeFilters||q?t('emptyFilter'):t('empty')}</p>
        <span className="admin-help">{t('emptyHelp')}</span>
      </div>}
      <div className="admin-panel-body">
        <Pagination path="/admin/leads" page={result.page} totalPages={result.pages} query={queryRecord} digits={digits}/>
        <p className="admin-help">{t('archiveHint')}</p>
      </div>
    </section>
    </LeadSmsPicker>
  </>;
}
