import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {requireArchiverPage} from '@/lib/admin/guard';
import {dashboardDigits} from '@/lib/admin/digits';
import {formatDate,formatDigits,formatNumber} from '@/lib/admin/format';
import {loadReceiptAudit} from '@/lib/reports/receipt-audit-data';
import {PrintButton} from '@/components/exams/print-button';
export const dynamic='force-dynamic';
export default async function ReceiptAudit({params}:{params:Promise<{locale:string}>}){
  const admin=await requireArchiverPage();
  const {locale}=await params;
  const t=await getTranslations('reports');
  const common=await getTranslations('common');
  const digits=await dashboardDigits(admin.id);
  const language=locale==='en'?'en':'bn';
  const audit=await loadReceiptAudit();
  const currency=common('currency');
  const clean=audit.duplicates.length===0&&audit.gaps.length===0;
  return <>
    <div className="admin-heading"><div>
      <span className="section-tag">✦ &nbsp; {t('hub.title')}</span>
      <h1>{t('audit.title')}</h1>
      <p>{t('audit.desc')}</p>
    </div></div>
    <div className="report-toolbar no-print">
      <PrintButton label={t('export.print')}/>
      <Link className="admin-mini-button" data-export-csv href="/admin/reports/export?kind=audit&format=csv">{t('export.csv')}</Link>
      <Link className="admin-mini-button" data-export-xlsx href="/admin/reports/export?kind=audit&format=xlsx">{t('export.xlsx')}</Link>
    </div>
    <section className="report-print" data-receipt-audit>
      <p className="report-brand">{common('brand')}</p>
      <p className="report-sheet-title">{t('audit.title')}</p>
      <p data-audit-scanned>{t('audit.scanned',{count:formatNumber(audit.scanned,digits)})}</p>
      {audit.smallest!==null&&audit.largest!==null&&
        <p data-audit-range>{t('audit.range',{from:formatNumber(audit.smallest,digits),to:formatNumber(audit.largest,digits)})}</p>}
      {clean
        ?<div className="admin-empty" data-audit-clean>
            <strong>{t('audit.clean')}</strong>
            <p>{t('audit.cleanHelp')}</p>
          </div>
        :<>
          <section className="admin-panel" data-audit-duplicates>
            <div className="admin-panel-head"><h2>{t('audit.duplicates')}</h2></div>
            <div className="admin-panel-body">
              <p>{t('audit.duplicatesHelp')}</p>
              {audit.duplicates.length?audit.duplicates.map(duplicate=>
                <div className="notice-box" key={duplicate.receiptNo} data-audit-duplicate>
                  <strong>{t('audit.receipt')} {formatDigits(duplicate.receiptNo,digits)} · {t('audit.times',{count:formatNumber(duplicate.count,digits)})}</strong>
                  <ul>
                    {duplicate.rows.map(row=>
                      <li key={row.id}>
                        {row.studentName} · {row.paidOn?formatDate(row.paidOn,digits,language):''} · {currency}{formatNumber(row.amount,digits)}{' '}
                        <Link className="text-link" data-audit-review href={`/admin/reports/statement/${row.studentId}`}>{t('audit.review')}</Link>
                      </li>)}
                  </ul>
                </div>)
                :<div className="admin-empty">{t('audit.clean')}</div>}
            </div>
          </section>
          <section className="admin-panel" data-audit-gaps>
            <div className="admin-panel-head"><h2>{t('audit.gaps')}</h2></div>
            <div className="admin-panel-body">
              <p>{t('audit.gapsHelp')}</p>
              {audit.gaps.length?audit.gaps.map((gap,index)=>
                <div className="notice-box" key={index} data-audit-gap>
                  <strong>{t('audit.gapMissing',{from:formatNumber(gap.from,digits),to:formatNumber(gap.to,digits),count:formatNumber(gap.missingCount,digits)})}</strong>
                  <p>{t('audit.between',{before:formatDigits(gap.after.receiptNo,digits),after:formatDigits(gap.before.receiptNo,digits)})}</p>
                  <ul>
                    <li>{gap.after.studentName} · {gap.after.paidOn?formatDate(gap.after.paidOn,digits,language):''}{' '}
                      <Link className="text-link" data-audit-review href={`/admin/reports/statement/${gap.after.studentId}`}>{t('audit.review')}</Link></li>
                    <li>{gap.before.studentName} · {gap.before.paidOn?formatDate(gap.before.paidOn,digits,language):''}{' '}
                      <Link className="text-link" data-audit-review href={`/admin/reports/statement/${gap.before.studentId}`}>{t('audit.review')}</Link></li>
                  </ul>
                </div>)
                :<div className="admin-empty">{t('audit.clean')}</div>}
            </div>
          </section>
        </>}
      {audit.unsequenced.length>0&&
        <section className="admin-panel" data-audit-unsequenced>
          <div className="admin-panel-head"><h2>{t('audit.unsequenced')}</h2></div>
          <div className="admin-panel-body">
            <p>{t('audit.unsequencedHelp')}</p>
            <ul>
              {audit.unsequenced.map(row=>
                <li key={row.id}>{row.receiptNo} · {row.studentName} · {row.paidOn?formatDate(row.paidOn,digits,language):''}{' '}
                  <Link className="text-link" data-audit-review href={`/admin/reports/statement/${row.studentId}`}>{t('audit.review')}</Link></li>)}
            </ul>
          </div>
        </section>}
    </section>
  </>;
}
