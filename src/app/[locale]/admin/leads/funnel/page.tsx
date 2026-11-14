import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {redirect} from 'next/navigation';
import {getArchiver} from '@/lib/admin/guard';
import {dashboardDigits} from '@/lib/admin/digits';
import {dhakaDay} from '@/lib/admin/today';
import {formatClass,formatMonth,formatNumber,type Digits} from '@/lib/admin/format';
import {FUNNEL_NO_CLASS,leadFunnel} from '@/lib/leads/funnel';
import {funnelFileName} from '@/lib/leads/funnel-csv';
import {sourceLabel} from '@/lib/leads/lead-ui';
import {LEAD_SOURCES,type LeadSource} from '@/lib/leads/vocab';
import {LeadFunnelExport} from '@/components/admin/lead-funnel-export';
import {CalendarCheck,GraduationCap,TrendingUp,Users} from 'lucide-react';

type Query={breakdown?:string;from?:string;to?:string;source?:string;classGroup?:string};

/**
 * R3 wave C · the visitor funnel: visitors → trial booked → admitted, by month, source and class,
 * with the three conversion rates beside the counts and the whole table one tap from a CSV.
 *
 * The page holds no arithmetic and no vocabulary. `src/lib/leads/funnel.ts` decides what counts as a
 * trial and what counts as an admission and writes those definitions down where a screen cannot
 * quietly change them; the catalogs hold every word; `formatMonth`, `formatClass` and `formatNumber`
 * hold the digits, so a Bangla screen reads Bangla digits and an English screen reads Latin ones
 * exactly as the rest of the admin does. What is left here is the two things only a page can do:
 * refuse a role that may not see visitors, and lay the numbers out where a phone can read them.
 *
 * The CSV is offered by a client component that receives the rows this page already built — the file
 * is the table on screen, not a second opinion of it.
 */
export default async function LeadsFunnel({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<Query>}){
  const {locale}=await params;
  /**
   * The same refusal the Visitors list gives: a role that may not see visitors is sent to its own
   * Overview rather than shown the database error page, because "could not load data" sends an owner
   * looking at the connection when the real answer is the role.
   */
  const user=await getArchiver();
  if(!user)redirect(`/${locale}/admin`);
  const language=locale==='bn'?'bn':'en';
  const digits=await dashboardDigits(user.id);
  const t=await getTranslations('leads');
  const query=await searchParams;
  const now=new Date();
  const result=await leadFunnel({
    breakdown:query.breakdown,from:query.from,to:query.to,source:query.source,classGroup:query.classGroup,
  },now);
  const {breakdown,from,to,source,classGroup}=result.query;

  /**
   * Bucket keys are what the database groups by (`2026-01`, `walk_in`, `7`, `none`); the words are the
   * catalog's. Two label sets on purpose: the screen follows the operator's digit preference, while the
   * CSV keeps Latin digits so Excel can still add the column up — a spreadsheet is data, not a page.
   */
  const screenLabel=(key:string):string=>breakdown==='month'
    ? formatMonth(key,digits,language)
    : breakdown==='source'
      ? sourceLabel(t,key as LeadSource)
      : key===FUNNEL_NO_CLASS?t('funnel.classNone'):formatClass(Number(key),digits,language,t('colClass'));
  const csvLabel=(key:string):string=>breakdown==='month'
    ? formatMonth(key,'en',language)
    : breakdown==='source'
      ? sourceLabel(t,key as LeadSource)
      : key===FUNNEL_NO_CLASS?t('funnel.classNone'):formatClass(Number(key),'en',language,t('colClass'));
  const bucketHead=breakdown==='month'?t('funnel.colMonth'):breakdown==='source'?t('funnel.colSource'):t('colClass');
  const rate=(value:number|null,use:Digits):string=>value===null
    ? t('funnel.noRate')
    : t('funnel.percent',{value:formatNumber(value,use)});
  const csvRate=(value:number|null):string=>value===null?'':`${formatNumber(value,'en')}%`;
  const count=(value:number,use:Digits):string=>formatNumber(value,use);

  const columns=[bucketHead,t('funnel.stageVisitors'),t('funnel.stageTrial'),t('funnel.stageAdmitted'),
    t('funnel.rateVisitorTrial'),t('funnel.rateTrialAdmitted'),t('funnel.rateVisitorAdmitted')];
  const csvRows=[
    ...result.rows.map(row=>[csvLabel(row.key),row.visitors,row.trial,row.admitted,csvRate(row.visitorToTrial),csvRate(row.trialToAdmitted),csvRate(row.visitorToAdmitted)]),
    [t('funnel.totalRow'),result.totals.visitors,result.totals.trial,result.totals.admitted,csvRate(result.totals.visitorToTrial),csvRate(result.totals.trialToAdmitted),csvRate(result.totals.visitorToAdmitted)],
  ];

  const stages=[
    {label:t('funnel.stageVisitors'),value:count(result.totals.visitors,digits),icon:Users},
    {label:t('funnel.stageTrial'),value:count(result.totals.trial,digits),icon:CalendarCheck},
    {label:t('funnel.stageAdmitted'),value:count(result.totals.admitted,digits),icon:GraduationCap},
  ];
  const rates=[
    {label:t('funnel.rateVisitorTrial'),value:rate(result.totals.visitorToTrial,digits)},
    {label:t('funnel.rateTrialAdmitted'),value:rate(result.totals.trialToAdmitted,digits)},
    {label:t('funnel.rateVisitorAdmitted'),value:rate(result.totals.visitorToAdmitted,digits)},
  ];
  const empty=result.totals.visitors===0;
  const activeFilters=[from,to,source,classGroup].filter(Boolean).length;
  return <>
    <div className="admin-heading">
      <div>
        <h1>{t('funnel.title')}</h1>
        <p>{t('funnel.desc')}</p>
      </div>
      <div className="list-row-actions">
        <Link className="admin-mini-button" href="/admin/leads">{t('title')}</Link>
        <Link className="admin-mini-button" href="/admin/leads/import">{t('import.title')}</Link>
      </div>
    </div>

    <details className="admin-help-panel" open={activeFilters>0||breakdown!=='month'||undefined}>
      <summary className="admin-mini-button">{t('filters')}{activeFilters?` · ${formatNumber(activeFilters,digits)}`:''}</summary>
      {/* A GET form with no free-text field: every value it can carry is checked against the
          vocabulary again by `funnelQuery`, so a crafted URL is ignored rather than trusted. */}
      <form method="get" className="list-filter">
        <label>{t('funnel.breakdown')}<select className="admin-select" name="breakdown" defaultValue={breakdown}>
          <option value="month">{t('funnel.byMonth')}</option>
          <option value="source">{t('funnel.bySource')}</option>
          <option value="class">{t('funnel.byClass')}</option>
        </select></label>
        <label>{t('from')}<input className="admin-input" type="date" name="from" defaultValue={from}/></label>
        <label>{t('to')}<input className="admin-input" type="date" name="to" defaultValue={to}/></label>
        <label>{t('source')}<select className="admin-select" name="source" defaultValue={source}>
          <option value="">{t('all')}</option>
          {LEAD_SOURCES.map(option=><option key={option} value={option}>{sourceLabel(t,option)}</option>)}
        </select></label>
        <label>{t('classGroup')}<select className="admin-select" name="classGroup" defaultValue={classGroup}>
          <option value="">{t('all')}</option>
          {Array.from({length:12},(_,index)=>index+1).map(value=><option key={value} value={String(value)}>{formatClass(value,digits,language,t('colClass'))}</option>)}
        </select></label>
        <div className="lead-form-foot">
          <button type="submit" className="button button-navy">{t('apply')}</button>
          <Link className="admin-mini-button" href="/admin/leads/funnel">{t('reset')}</Link>
        </div>
      </form>
    </details>

    <div className="admin-kpis funnel-kpis">
      {stages.map(({label,value,icon:Icon})=><div className="admin-kpi" key={label}>
        <div className="admin-kpi-top"><span>{label}</span><Icon size={20} aria-hidden="true"/></div>
        <strong>{value}</strong>
      </div>)}
    </div>
    <div className="admin-kpis funnel-kpis">
      {rates.map(({label,value})=><div className="admin-kpi funnel-rate" key={label}>
        <div className="admin-kpi-top"><span>{label}</span><TrendingUp size={20} aria-hidden="true"/></div>
        <strong>{value}</strong>
      </div>)}
    </div>

    <section className="admin-panel list-panel">
      <div className="admin-panel-head">
        <h2>{breakdown==='month'?t('funnel.byMonth'):breakdown==='source'?t('funnel.bySource'):t('funnel.byClass')}</h2>
        <span className="admin-help">{t('totalLeads',{count:formatNumber(result.totals.visitors,digits)})}</span>
        <LeadFunnelExport columns={columns} rows={csvRows} label={t('funnel.exportCsv')} hint={t('funnel.exportHint')}
          fileName={funnelFileName(breakdown,dhakaDay(now))}/>
      </div>
      {empty
        ? <div className="admin-empty"><strong>{t('funnel.emptyTitle')}</strong><p>{t('funnel.emptyBody')}</p></div>
        : <div className="admin-table-wrap"><table className="admin-table admin-responsive-table funnel-table">
          <thead><tr>
            <th>{bucketHead}</th>
            <th>{t('funnel.stageVisitors')}</th>
            <th>{t('funnel.stageTrial')}</th>
            <th>{t('funnel.stageAdmitted')}</th>
            <th>{t('funnel.rateVisitorTrial')}</th>
            <th>{t('funnel.rateTrialAdmitted')}</th>
            <th>{t('funnel.rateVisitorAdmitted')}</th>
          </tr></thead>
          <tbody>{result.rows.map(row=><tr key={row.key}>
            <td data-label={bucketHead}><strong>{screenLabel(row.key)}</strong></td>
            <td data-label={t('funnel.stageVisitors')}>{count(row.visitors,digits)}</td>
            <td data-label={t('funnel.stageTrial')}>{count(row.trial,digits)}</td>
            <td data-label={t('funnel.stageAdmitted')}>{count(row.admitted,digits)}</td>
            <td data-label={t('funnel.rateVisitorTrial')}>{rate(row.visitorToTrial,digits)}</td>
            <td data-label={t('funnel.rateTrialAdmitted')}>{rate(row.trialToAdmitted,digits)}</td>
            <td data-label={t('funnel.rateVisitorAdmitted')}>{rate(row.visitorToAdmitted,digits)}</td>
          </tr>)}</tbody>
          <tfoot><tr>
            <td data-label={bucketHead}><strong>{t('funnel.totalRow')}</strong></td>
            <td data-label={t('funnel.stageVisitors')}><strong>{count(result.totals.visitors,digits)}</strong></td>
            <td data-label={t('funnel.stageTrial')}><strong>{count(result.totals.trial,digits)}</strong></td>
            <td data-label={t('funnel.stageAdmitted')}><strong>{count(result.totals.admitted,digits)}</strong></td>
            <td data-label={t('funnel.rateVisitorTrial')}><strong>{rate(result.totals.visitorToTrial,digits)}</strong></td>
            <td data-label={t('funnel.rateTrialAdmitted')}><strong>{rate(result.totals.trialToAdmitted,digits)}</strong></td>
            <td data-label={t('funnel.rateVisitorAdmitted')}><strong>{rate(result.totals.visitorToAdmitted,digits)}</strong></td>
          </tr></tfoot>
        </table></div>}
      {/* The definitions, on the page: a rate somebody cannot explain is a rate somebody will not
          trust, and the owner reads this report once a month rather than once a sprint. */}
      <div className="admin-panel-body funnel-notes">
        <p className="admin-help">{t('funnel.cohortNote')}</p>
        <p className="admin-help">{t('funnel.trialAdmittedNote')}</p>
        <p className="admin-help">{t('funnel.binNote')}</p>
        <p className="admin-help">{t('funnel.noRateNote')}</p>
        {result.monthsFilled&&<p className="admin-help">{t('funnel.monthsFilledNote')}</p>}
      </div>
    </section>
  </>;
}
