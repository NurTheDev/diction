import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {redirect} from 'next/navigation';
import {getArchiver} from '@/lib/admin/guard';
import {dashboardDigits} from '@/lib/admin/digits';
import {pageNumber} from '@/lib/admin/helpers';
import {formatClass,formatNumber} from '@/lib/admin/format';
import {leadStatusCounts,listLeads} from '@/lib/leads/leads';
import {visitorSmsDialogData} from '@/lib/center/sms-dialog-data';
import {leadListQuery,LEAD_GROUPS,LEAD_MEDIUMS,LEAD_SHIFTS,LEAD_SOURCES,LEAD_STATUSES} from '@/lib/leads/vocab';
import {
  groupLabel,mediumLabel,rowView,shiftLabel,sourceLabel,statusLabel,
  type LeadListFiltersShape,
} from '@/lib/leads/lead-ui';
import {Pagination} from '@/components/admin/pagination';
import {LeadQuickAdd,LeadSearch} from '@/components/admin/leads-ui';
import {LeadSmsBar,LeadSmsPicker} from '@/components/admin/lead-sms';
import {LeadBulkBar,VisitorRows} from '@/components/admin/visitors-row';
import {FilterDayField,LeadFilters} from '@/components/admin/visitors-filters';
import {FilterToggle,listTableClass} from '@/components/admin/list-pattern';

type Query={q?:string;status?:string;classGroup?:string;group?:string;shift?:string;medium?:string;source?:string;
  followUp?:string;from?:string;to?:string;page?:string;new?:string;closed?:string;stale?:string};

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
async function leadsBody(params:Promise<{locale:string}>,searchParams:Promise<Query>){
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
  /* Two ticks, not two more dropdowns: closed visitors are filed away by default and come back with
     "show closed", and the stale list is a question an operator asks rather than a banner they endure. */
  const showClosed=query.closed==='1',stale=query.stale==='1';
  const page=pageNumber(query.page);
  const openQuickAdd=query.new==='1';

  const now=new Date();
  console.error('LEADS render start',user.role);
  const [result,counts]=await Promise.all([
    listLeads({q,status,classGroup,group,shift,medium,source,followUp:followUp||undefined,from,to,page,perPage:20,showClosed,stale},now),
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
  const maySendSms=user.role==='admin'||user.role==='superadmin'||user.role==='staff';
  /**
   * The visitor SMS catalog, loaded only for a role that may send: the picker and every drawer on this
   * page then offer the same narrowed set of templates (`visitorSmsDialogData()`: only the ones whose
   * chips a lead can actually fill, `visitor_thanks` among them) and the same center number. A screen
   * that cannot load it must not offer a send, so `null` means "no picker here", never an empty one.
   */
  const sms=maySendSms?await visitorSmsDialogData(user.role):null;
  /**
   * Who may do what to a visitor, and who may read a number. Both follow the policy every other list
   * uses (`RowControls`): Delete is Admin and Super Admin, Archive is the floor all three roles have,
   * and the number is printed for the signed-in roles that call visitors — the front desk dials from
   * this list, so a mask here costs a call. It is printed, and that is all: it never enters a URL, a
   * log line, an audit target or an analytics event, and every other screen keeps the mask.
   */
  const canDelete=user.role==='admin'||user.role==='superadmin';
  const canArchive=['superadmin','admin','staff'].includes(user.role);
  const seesNumbers=canArchive;
  /**
   * The rows the bulk send may pick from: this page of this filter, and nothing else. `contactable` comes
   * from the rule layer (`canContact()`), so a lead marked "do not contact" is not selectable here and is
   * counted as excluded by the bar — and it is checked a third time when the plan is built.
   */
  console.error('LEADS rows',result.rows.length);
  const items=result.rows.map(row=>({row:rowView(row),fullPhone:seesNumbers?(row.phones?.[0]?.normalized||''):''}));
  const exotic=(value:unknown,path:string):string[]=>{
    if(value===null||value===undefined)return[];
    if(value instanceof Date)return[`${path}:date`];
    if(Array.isArray(value))return value.flatMap((entry,index)=>exotic(entry,`${path}[${index}]`));
    if(typeof value==='object')return Object.entries(value as Record<string,unknown>).flatMap(([key,entry])=>exotic(entry,`${path}.${key}`));
    return[];
  };
  const shapeProbe={
    count:items.length,
    rowKinds:[...new Set(items.flatMap(item=>exotic(item.row,'row')))],
    kitKinds:sms?exotic(sms,'kit'):[],
    createdTypes:items.map(item=>typeof (item.row as {createdAt?:unknown}).createdAt),
  };
  const smsRows=result.rows.map(row=>({id:row.id,studentName:row.studentName,contactable:row.contactable,hasPhone:(row.phones||[]).length>0}));
  const current:LeadListFiltersShape={q:q||undefined,status:status||undefined,classGroup:classGroup||undefined,group:group||undefined,shift:shift||undefined,medium:medium||undefined,source:source||undefined,followUp:followUp||undefined,from:from||undefined,to:to||undefined,
    closed:showClosed||undefined,stale:stale||undefined};

  /**
   * `leadListQuery` is the only thing that builds a list URL here, because it is also the thing that
   * refuses to put a phone-shaped search in one. It hands back a locale-prefixed href and `Link` adds the
   * locale itself, so the prefix comes off again — which is also why the chips and the reset link are
   * `Link`s and not `<a>`s: a bare anchor to a locale-less path is a 404.
   */
  const hrefOf=(overrides:Partial<LeadListFiltersShape>):string=>leadListQuery({locale:'bn',...current,...overrides}).href.replace(/^\/bn/,'');
  // The "all" chip counts every lead, not the ones the current filters left: `result.total` is filtered.
  const everyLead=counts.reduce((sum,entry)=>sum+entry.count,0);
  const activeFilters=[status,classGroup,group,shift,medium,source,followUp,from,to,q].filter(Boolean).length+(showClosed?1:0)+(stale?1:0);
  const queryRecord:Record<string,string>={};
  for(const [key,value] of Object.entries(current))if(value)queryRecord[key]=value===true?'1':String(value);

  return <>
    <div className="admin-heading"><div><h1>{t('title')}</h1><p>{t('desc')}</p></div></div>

    <div className="lead-tools">
      <LeadQuickAdd open={openQuickAdd} language={language} digits={digits}/>
      <LeadSearch language={language} digits={digits} current={current}/>
    </div>

    {result.refusedPhone&&<p className="admin-feedback error" role="status">{t('searchNumberHelp')}</p>}

    <nav className="lead-chips" aria-label={t('colStatus')}>
      <Link href={hrefOf({status:undefined})} className={status?'':'selected'}>{t('all')} <span>{formatNumber(everyLead,digits)}</span></Link>
      {counts.map(entry=><Link key={entry.status} href={hrefOf({status:entry.status})} className={status===entry.status?'selected':''}>
        {statusLabel(t,entry.status)} <span>{formatNumber(entry.count,digits)}</span>
      </Link>)}
    </nav>

    <LeadFilters label={t('filters')} active={activeFilters?formatNumber(activeFilters,digits):''}>
      {/* A GET form on purpose — but with no free-text field in it. Text is searched by LeadSearch, which
          decides whether what was typed may travel in a URL at all. The hidden `q` is only echoed back
          when it is not phone-shaped, so a crafted URL cannot be re-emitted by this page. */}
      <form method="get" className="list-filter">
        {q&&!result.refusedPhone&&<input type="hidden" name="q" value={q}/>}
        <label>{t('colStatus')}<select className="admin-select" name="status" defaultValue={status}>
          <option value="">{t('all')}</option>
          {LEAD_STATUSES.map(option=><option key={option} value={option}>{statusLabel(t,option)}</option>)}
        </select></label>
        <label>{t('classGroup')}<select className="admin-select" name="classGroup" defaultValue={classGroup}>
          <option value="">{t('all')}</option>
          {Array.from({length:12},(_,index)=>index+1).map(value=><option key={value} value={String(value)}>{formatClass(value,digits,language,t('colClass'))}</option>)}
        </select></label>
        <label>{t('group')}<select className="admin-select" name="group" defaultValue={group}>
          <option value="">{t('all')}</option>
          {LEAD_GROUPS.map(option=><option key={option} value={option}>{groupLabel(t,option)}</option>)}
        </select></label>
        <label>{t('shift')}<select className="admin-select" name="shift" defaultValue={shift}>
          <option value="">{t('all')}</option>
          {LEAD_SHIFTS.map(option=><option key={option} value={option}>{shiftLabel(t,option)}</option>)}
        </select></label>
        <label>{t('medium')}<select className="admin-select" name="medium" defaultValue={medium}>
          <option value="">{t('all')}</option>
          {LEAD_MEDIUMS.map(option=><option key={option} value={option}>{mediumLabel(t,option)}</option>)}
        </select></label>
        <label>{t('source')}<select className="admin-select" name="source" defaultValue={source}>
          <option value="">{t('all')}</option>
          {LEAD_SOURCES.map(option=><option key={option} value={option}>{sourceLabel(t,option)}</option>)}
        </select></label>
        <FilterToggle name="closed" label={t('showClosed')} defaultChecked={showClosed}/>
        <FilterToggle name="stale" label={t('staleOnly')} defaultChecked={stale}/>
        <label>{t('colFollowUp')}<select className="admin-select" name="followUp" defaultValue={followUp}>
          <option value="">{t('all')}</option>
          <option value="today">{t('dueToday')}</option>
          <option value="overdue">{t('overdue')}</option>
          <option value="none">{t('followUpNone')}</option>
        </select></label>
        {/* No native date box on this page: a day is picked from the calendar popover and read back as
            dd/mm/yyyy (Bangla digits) or "15 Nov 2026", in whichever language the account reads. */}
        <label>{t('from')}<FilterDayField name="from" value={from} placeholder={t('from')} clearLabel={t('reset')} digits={digits} language={language}/></label>
        <label>{t('to')}<FilterDayField name="to" value={to} placeholder={t('to')} clearLabel={t('reset')} digits={digits} language={language}/></label>
        <div className="lead-form-foot">
          <button type="submit" className="button button-navy">{t('apply')}</button>
          <Link className="admin-mini-button" href={hrefOf({q:undefined,status:undefined,classGroup:undefined,group:undefined,shift:undefined,medium:undefined,source:undefined,followUp:undefined,from:undefined,to:undefined,closed:undefined,stale:undefined})}>{t('reset')}</Link>
        </div>
      </form>
    </LeadFilters>

    <LeadSmsPicker rows={smsRows} kit={sms} digits={digits} language={language}>
    <section className="admin-panel list-panel">
      <div className="admin-panel-head">
        <h2>{followUp==='today'?t('dueToday'):followUp==='overdue'?t('overdue'):t('title')}</h2>
        <span className="admin-help">{t('totalLeads',{count:formatNumber(result.total,digits)})}</span>
        <LeadSmsBar digits={digits}/>
        <LeadBulkBar canDelete={canDelete} canArchive={canArchive} digits={digits} language={language}/>
      </div>
      {result.rows.length?<div className="admin-table-wrap visitor-wrap"><table className={`${listTableClass('visitor')} admin-responsive-table`}>
        <thead><tr>
          {/* The tick column carries no heading: a checkbox needs no name, and the bulk bar that
              appears the moment one is ticked says what the ticks are for. It exists only where a send
              may happen — for a role with no picker there is nothing to tick and no bulk bar to read. */}
          {sms&&<th className="visitor-check list-check" aria-label={t('row.bulk')}></th>}
          <th className="visitor-who list-who">{t('colVisitor')}</th><th className="visitor-call list-call">{t('colContact')}</th>
          <th className="visitor-status list-status">{t('colStatus')}</th><th className="visitor-follow list-follow">{t('colFollowUp')}</th>
          <th className="visitor-note list-note">{t('lastNote')}</th><th className="visitor-act list-act">{t('colActions')}</th>
        </tr></thead>
        <tbody><VisitorRows items={items}
          canDelete={canDelete} canArchive={canArchive} sms={sms} language={language} digits={digits} hasCheck={Boolean(sms)}/></tbody>
        {/* CI diagnostic: what shape each row view carries, named where a probe request can read it. */}
        <span hidden data-items-diag={JSON.stringify(shapeProbe)}/>

      </table></div>:<div className="admin-empty">
        <p>{activeFilters||q?t('emptyFilter'):t('empty')}</p>
        <span className="admin-help">{t('emptyHelp')}</span>
      </div>}
      <div className="admin-panel-body">
        <Pagination path="/admin/leads" page={result.page} totalPages={result.pages} query={queryRecord} digits={digits}/>
        {/* The eighteen-month notice used to sit here as a sentence everybody read and nobody could act
            on. It is a filter now: asked for, it lists the quiet visitors and says, in the panel's own
            voice, that the list is a suggestion and nothing is removed on its own. */}
        {stale&&<p className="admin-help" data-stale-hint="">{t('staleHint')}</p>}
      </div>
    </section>
    </LeadSmsPicker>
  </>;
}

/** CI diagnostic: an await that throws here used to arrive as an opaque digest and an empty
    main; the catch paints the error where every suite and screenshot can read it. */
export default async function Leads({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<Query>}){
  try{return await leadsBody(params,searchParams)}catch(error){
    const text=error instanceof Error?`${error.message} :: ${(error.stack||'').split('\n').slice(0,4).join(' | ')}`:String(error);
    return <div data-page-diag="" className="admin-panel"><h1>Visitors</h1><pre className="admin-feedback error">{text}</pre></div>;
  }
}
