import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {requireArchiver} from '@/lib/admin/guard';
import {dashboardDigits} from '@/lib/admin/digits';
import {formatNumber} from '@/lib/admin/format';
import {monthNames,type MonthTable} from '@/lib/admin/months';
import {dhakaCalendar} from '@/lib/center/month-status';
import {loadMonthlyReport} from '@/lib/reports/collections-data';
import {typeLabelKey} from '@/lib/reports/vocab';
import {PrintButton} from '@/components/exams/print-button';
export const dynamic='force-dynamic';
export default async function MonthlyReport({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{year?:string;month?:string}>}){
  const admin=await requireArchiver();
  const {locale}=await params;
  const query=await searchParams;
  const t=await getTranslations('reports');
  const common=await getTranslations('common');
  const digits=await dashboardDigits(admin.id);
  const months=monthNames(common.raw('months') as MonthTable);
  const currency=common('currency');
  const today=dhakaCalendar(new Date());
  const yearParsed=Number(String(query.year||'').replace(/[\u09e6-\u09ef]/g,c=>String(c.charCodeAt(0)-0x09e6)));
  const year=Number.isInteger(yearParsed)&&yearParsed>=1900&&yearParsed<=2200?yearParsed:today.year;
  const monthParsed=Number(String(query.month||'').replace(/[\u09e6-\u09ef]/g,c=>String(c.charCodeAt(0)-0x09e6)));
  const month=Number.isInteger(monthParsed)&&monthParsed>=1&&monthParsed<=12?monthParsed:today.month;
  const {matrix}=await loadMonthlyReport({year,month,locale});
  const money=(value:number)=>value?`${currency}${formatNumber(value,digits)}`:'';
  const exportQuery=`kind=monthly&year=${year}&month=${month}`;
  return <>
    <div className="admin-heading"><div>
      <span className="section-tag">✦ &nbsp; {t('hub.title')}</span>
      <h1>{t('monthly.title')}</h1>
      <p>{t('monthly.desc')}</p>
    </div></div>
    <form method="get" className="report-filters" data-monthly-filters>
      <label>{t('monthly.yearLabel')}<input className="admin-input" type="number" name="year" min={1900} max={2200} value={String(year)}/></label>
      <label>{t('monthly.monthLabel')}
        <select className="admin-input" name="month" data-month-filter>
          {months.map((name,index)=><option key={index} value={String(index+1)} selected={index+1===month}>{name}</option>)}
        </select>
      </label>
      <button className="admin-mini-button" type="submit">{t('monthly.apply')}</button>
    </form>
    <div className="report-toolbar no-print">
      <PrintButton label={t('export.print')}/>
      <Link className="admin-mini-button" data-export-csv href={`/admin/reports/export?${exportQuery}&format=csv`}>{t('export.csv')}</Link>
      <Link className="admin-mini-button" data-export-xlsx href={`/admin/reports/export?${exportQuery}&format=xlsx`}>{t('export.xlsx')}</Link>
    </div>
    <section className="report-print" data-monthly-matrix>
      <p className="report-brand">{common('brand')}</p>
      <p className="report-sheet-title">{t('monthly.title')} · {months[month-1]} {formatNumber(year,digits)}</p>
      {matrix.grand||matrix.classLabels.length?<>
        <div className="admin-table-wrap"><table className="admin-table matrix-table">
          <thead><tr>
            <th>{t('monthly.classColumn')}</th>
            {Array.from({length:matrix.daysInMonth},(_,index)=><th key={index} scope="col">{formatNumber(index+1,digits)}</th>)}
            <th>{t('monthly.total')}</th>
          </tr></thead>
          <tbody>
            {matrix.classLabels.map((label,classIndex)=><tr key={label}>
              <td>{label||'—'}</td>
              {matrix.cells[classIndex].map((cell,day)=><td key={day} data-mx-cell={cell?String(cell):undefined}>{money(cell)}</td>)}
              <td data-mx-class-total={String(matrix.classTotals[classIndex])}>{currency}{formatNumber(matrix.classTotals[classIndex],digits)}</td>
            </tr>)}
          </tbody>
          <tfoot>
            <tr data-mx-day-totals>
              <td>{t('monthly.total')}</td>
              {matrix.dayTotals.map((cell,day)=><td key={day}>{money(cell)}</td>)}
              <td data-mx-grand={String(matrix.grand)}>{currency}{formatNumber(matrix.grand,digits)}</td>
            </tr>
          </tfoot>
        </table></div>
        {matrix.typeTotals.length>0&&<ul data-monthly-types>
          <li><strong>{t('monthly.typesTitle')}</strong></li>
          {matrix.typeTotals.map(entry=><li key={entry.type}>{t(typeLabelKey(entry.type))}: {currency}{formatNumber(entry.total,digits)}</li>)}
        </ul>}
      </>:<div className="admin-empty">{t('monthly.empty')}</div>}
    </section>
  </>;
}
