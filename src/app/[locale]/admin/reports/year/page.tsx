import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {requireArchiverPage} from '@/lib/admin/guard';
import {dashboardDigits} from '@/lib/admin/digits';
import {formatNumber} from '@/lib/admin/format';
import {dhakaCalendar} from '@/lib/center/month-status';
import {loadYearSummary} from '@/lib/reports/year-summary-data';
import {PrintButton} from '@/components/exams/print-button';
export const dynamic='force-dynamic';
export default async function YearSummaryPage({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{year?:string}>}){
  const admin=await requireArchiverPage();
  const {locale}=await params;
  const query=await searchParams;
  const t=await getTranslations('reports');
  const common=await getTranslations('common');
  const digits=await dashboardDigits(admin.id);
  const currency=common('currency');
  const today=dhakaCalendar(new Date());
  const parsed=Number(String(query.year||'').replace(/[\u09e6-\u09ef]/g,c=>String(c.charCodeAt(0)-0x09e6)));
  const year=Number.isInteger(parsed)&&parsed>=1900&&parsed<=2200?parsed:today.year;
  const summary=await loadYearSummary(year,locale);
  const money=(value:number)=>`${currency}${formatNumber(value,digits)}`;
  const exportQuery=`kind=year&year=${year}`;
  return <>
    <div className="admin-heading"><div>
      <span className="section-tag">✦ &nbsp; {t('hub.title')}</span>
      <h1>{t('year.title')}</h1>
      <p>{t('year.desc')}</p>
    </div></div>
    <form method="get" className="report-filters" data-year-filters>
      <label>{t('year.yearLabel')}<input className="admin-input" type="number" name="year" min={1900} max={2200} defaultValue={String(year)}/></label>
      <button className="admin-mini-button" type="submit">{t('year.apply')}</button>
    </form>
    <div className="report-toolbar no-print">
      <PrintButton label={t('export.print')}/>
      <Link className="admin-mini-button" data-export-csv href={`/admin/reports/export?${exportQuery}&format=csv`}>{t('export.csv')}</Link>
      <Link className="admin-mini-button" data-export-xlsx href={`/admin/reports/export?${exportQuery}&format=xlsx`}>{t('export.xlsx')}</Link>
    </div>
    <section className="report-print" data-year-report>
      <p className="report-brand">{common('brand')}</p>
      <p className="report-sheet-title">{t('year.title')} · {formatNumber(year,digits)}</p>
      {summary.classes.length?<>
        <div className="admin-table-wrap"><table className="admin-table admin-responsive-table">
          <thead><tr>
            <th>{t('year.classColumn')}</th><th>{t('year.students')}</th><th>{t('year.expected')}</th>
            <th>{t('year.collected')}</th><th>{t('year.outstanding')}</th><th>{t('year.pending')}</th>
            <th>{t('year.waived')}</th><th>{t('year.extras')}</th>
          </tr></thead>
          <tbody>
            {summary.classes.map(row=><tr key={row.classLabel} data-year-row>
              <td data-label={t('year.classColumn')}>{row.classLabel||'—'}</td>
              <td data-label={t('year.students')}>{formatNumber(row.students,digits)}</td>
              <td data-label={t('year.expected')}>{money(row.expected)}</td>
              <td data-label={t('year.collected')}>{money(row.collected)}</td>
              <td data-label={t('year.outstanding')}>{money(row.outstanding)}</td>
              <td data-label={t('year.pending')}>{money(row.pending)}</td>
              <td data-label={t('year.waived')}>{money(row.waived)}</td>
              <td data-label={t('year.extras')}>{money(row.extras)}</td>
            </tr>)}
          </tbody>
          <tfoot>
            <tr data-year-totals>
              <td>{t('year.totals')}</td>
              <td>{formatNumber(summary.totals.students,digits)}</td>
              <td>{money(summary.totals.expected)}</td>
              <td>{money(summary.totals.collected)}</td>
              <td>{money(summary.totals.outstanding)}</td>
              <td>{money(summary.totals.pending)}</td>
              <td>{money(summary.totals.waived)}</td>
              <td>{money(summary.totals.extras)}</td>
            </tr>
          </tfoot>
        </table></div>
        <p className="notice-box">{t('year.help')}</p>
      </>:<div className="admin-empty">{t('year.empty')}</div>}
    </section>
  </>;
}
