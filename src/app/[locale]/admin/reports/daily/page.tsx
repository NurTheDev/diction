import {getTranslations} from 'next-intl/server';
import mongoose from 'mongoose';
import {Link} from '@/i18n/navigation';
import {requireArchiver} from '@/lib/admin/guard';
import {dashboardDigits} from '@/lib/admin/digits';
import {formatDate,formatDigits,formatNumber} from '@/lib/admin/format';
import {monthNames,type MonthTable} from '@/lib/admin/months';
import {dhakaCalendar} from '@/lib/center/month-status';
import {loadDailyReport} from '@/lib/reports/collections-data';
import {typeLabelKey} from '@/lib/reports/vocab';
import {PrintButton} from '@/components/exams/print-button';
export const dynamic='force-dynamic';
export default async function DailyReport({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{date?:string;operator?:string}>}){
  const admin=await requireArchiver();
  const {locale}=await params;
  const query=await searchParams;
  const t=await getTranslations('reports');
  const common=await getTranslations('common');
  const digits=await dashboardDigits(admin.id);
  const months=monthNames(common.raw('months') as MonthTable);
  const currency=common('currency');
  const today=dhakaCalendar(new Date());
  const date=/^\d{4}-\d{2}-\d{2}$/.test(query.date||'')?query.date!:`${today.year}-${String(today.month).padStart(2,'0')}-${String(today.day).padStart(2,'0')}`;
  const operator=query.operator&&mongoose.isValidObjectId(query.operator)?query.operator:null;
  const {breakdown,options}=await loadDailyReport({date,operatorId:operator,locale});
  const money=(value:number)=>`${currency}${formatNumber(value,digits)}`;
  const exportQuery=`kind=daily&date=${date}${operator?`&operator=${operator}`:''}`;
  return <>
    <div className="admin-heading"><div>
      <span className="section-tag">✦ &nbsp; {t('hub.title')}</span>
      <h1>{t('daily.title')}</h1>
      <p>{t('daily.desc')}</p>
    </div></div>
    <form method="get" className="report-filters" data-daily-filters>
      <label>{t('daily.dateLabel')}<input className="admin-input" type="date" name="date" value={date}/></label>
      <label>{t('daily.operatorLabel')}
        <select className="admin-input" name="operator" data-operator-filter>
          <option value="">{t('daily.operatorAll')}</option>
          {options.map(option=><option key={option.id} value={option.id} selected={option.id===operator}>{option.name}</option>)}
        </select>
      </label>
      <button className="admin-mini-button" type="submit">{t('daily.apply')}</button>
    </form>
    <div className="report-toolbar no-print">
      <PrintButton label={t('export.print')}/>
      <Link className="admin-mini-button" data-export-csv href={`/admin/reports/export?${exportQuery}&format=csv`}>{t('export.csv')}</Link>
      <Link className="admin-mini-button" data-export-xlsx href={`/admin/reports/export?${exportQuery}&format=xlsx`}>{t('export.xlsx')}</Link>
    </div>
    <section className="report-print" data-daily-report>
      <p className="report-brand">{common('brand')}</p>
      <p className="report-sheet-title">{t('daily.title')} · {formatDate(date,digits,locale==='en'?'en':'bn')}</p>
      {breakdown.rows.length?<>
        <div className="admin-table-wrap"><table className="admin-table admin-responsive-table">
          <thead><tr>
            <th>{t('daily.receipt')}</th><th>{t('daily.student')}</th><th>{t('daily.class')}</th>
            <th>{t('daily.type')}</th><th>{t('daily.month')}</th><th>{t('daily.amount')}</th>
            <th>{t('daily.operator')}</th><th>{t('daily.note')}</th>
          </tr></thead>
          <tbody>
            {breakdown.rows.map(row=>
              <tr key={row.id} data-daily-row>
                <td data-label={t('daily.receipt')}>{formatDigits(row.receiptNo,digits)||'—'}</td>
                <td data-label={t('daily.student')}>{row.studentName} {row.studentId?`· ${row.studentId}`:''}</td>
                <td data-label={t('daily.class')}>{row.classLabel||'—'}</td>
                <td data-label={t('daily.type')}>{t(typeLabelKey(row.type))}</td>
                <td data-label={t('daily.month')}>{row.monthKey?`${months[Number(row.monthKey.slice(5,7))-1]} ${formatDigits(row.monthKey.slice(0,4),digits)}`:'—'}</td>
                <td data-label={t('daily.amount')}>{money(row.amount)}</td>
                <td data-label={t('daily.operator')}>{row.operatorName||'—'}</td>
                <td data-label={t('daily.note')}>{row.note||''}</td>
              </tr>)}
          </tbody>
        </table></div>
        <p data-daily-total>{t('daily.totalLine',{count:formatNumber(breakdown.count,digits),total:money(breakdown.total)})}</p>
        {breakdown.operators.length>1&&<ul data-daily-operators>
          {breakdown.operators.map(entry=><li key={entry.id}>{entry.name}: {formatNumber(entry.count,digits)} · {money(entry.total)}</li>)}
        </ul>}
      </>:<div className="admin-empty">{t('daily.empty')}</div>}
    </section>
  </>;
}
