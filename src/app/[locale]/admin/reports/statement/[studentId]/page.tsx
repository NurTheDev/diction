import {getTranslations} from 'next-intl/server';
import mongoose from 'mongoose';
import {notFound} from 'next/navigation';
import {Link} from '@/i18n/navigation';
import {requireArchiver} from '@/lib/admin/guard';
import {dashboardDigits} from '@/lib/admin/digits';
import {formatDate,formatDigits,formatNumber} from '@/lib/admin/format';
import {monthNames,type MonthTable} from '@/lib/admin/months';
import {loadStudentStatement} from '@/lib/reports/ledger-data';
import {ledgerKindLabelKey,studentStatusLabelKey,typeLabelKey} from '@/lib/reports/vocab';
import {PrintButton} from '@/components/exams/print-button';
export const dynamic='force-dynamic';
export default async function StudentStatement({params}:{params:Promise<{locale:string;studentId:string}>}){
  const admin=await requireArchiver();
  const {locale,studentId}=await params;
  if(!mongoose.isValidObjectId(studentId))notFound();
  const t=await getTranslations('reports');
  const common=await getTranslations('common');
  const digits=await dashboardDigits(admin.id);
  const language=locale==='en'?'en':'bn';
  const months=monthNames(common.raw('months') as MonthTable);
  const currency=common('currency');
  const view=await loadStudentStatement(studentId,locale);
  if(!view)notFound();
  const {student,statement,waiverReasons}=view;
  const monthWord=(monthKey:string|null)=>monthKey
    ?`${months[Number(monthKey.slice(5,7))-1]} ${formatDigits(monthKey.slice(0,4),digits)}`
    :'';
  const detailOf=(entry:{kind:string;monthKey:string|null;receiptNo:string;typeCode:string;otherLabel:string;reason:string})=>{
    if(entry.kind==='assessment')return t('statement.assessmentDetail',{month:monthWord(entry.monthKey)});
    if(entry.kind==='waiver')return t('statement.waiverDetail',{reason:(entry.monthKey&&waiverReasons[entry.monthKey])||t('statement.none')});
    if(entry.kind==='hold')return t('statement.holdDetail',{month:monthWord(entry.monthKey)});
    if(entry.kind==='payment')return t('statement.paymentDetail',{receipt:formatDigits(entry.receiptNo,digits)});
    return t('statement.extraDetail',{type:t(typeLabelKey(entry.typeCode)),other:entry.otherLabel?` — ${entry.otherLabel}`:''});
  };
  const money=(value:number)=>`${currency}${formatNumber(value,digits)}`;
  const exportQuery=`kind=ledger&student=${student.id}`;
  return <>
    <div className="admin-heading"><div>
      <span className="section-tag">✦ &nbsp; {t('hub.title')}</span>
      <h1>{student.name}</h1>
      <p>{t('statement.desc')}</p>
    </div></div>
    <p><Link className="text-link" href={`/admin/students/${student.id}`}>{t('statement.back')}</Link></p>
    <div className="report-toolbar no-print">
      <PrintButton label={t('export.print')}/>
      <Link className="admin-mini-button" data-export-csv href={`/admin/reports/export?${exportQuery}&format=csv`}>{t('export.csv')}</Link>
      <Link className="admin-mini-button" data-export-xlsx href={`/admin/reports/export?${exportQuery}&format=xlsx`}>{t('export.xlsx')}</Link>
    </div>
    <section className="report-print" data-ledger-statement>
      <p className="report-brand">{common('brand')}</p>
      <p className="report-sheet-title">{t('statement.title')} · {student.name} · {student.studentId}</p>
      <p data-ledger-who>{student.classLabel} · {t('statement.roll')} {formatDigits(student.roll,digits)||'—'} · {t('statement.statusWord')} {t(studentStatusLabelKey(student.status))}</p>
      {statement.entries.length?<>
        <div className="admin-table-wrap"><table className="admin-table admin-responsive-table">
          <thead><tr>
            <th>{t('statement.date')}</th><th>{t('statement.kind')}</th><th>{t('statement.detail')}</th>
            <th>{t('statement.amount')}</th><th>{t('statement.running')}</th>
          </tr></thead>
          <tbody>
            {statement.entries.map((entry,index)=><tr key={index} data-ledger-row data-ledger-kind={entry.kind} data-ledger-date={entry.date} data-running={String(entry.runningDue)}>
              <td data-label={t('statement.date')}>{formatDate(entry.date,digits,language)}</td>
              <td data-label={t('statement.kind')}>{t(ledgerKindLabelKey(entry.kind))}</td>
              <td data-label={t('statement.detail')}>{detailOf(entry)}</td>
              <td data-label={t('statement.amount')}>{entry.amount?money(entry.amount):''}</td>
              <td data-label={t('statement.running')}>{money(entry.runningDue)}</td>
            </tr>)}
          </tbody>
        </table></div>
      </>:<div className="admin-empty">{t('statement.none')}</div>}
      <section className="admin-panel" data-ledger-summary>
        <div className="admin-panel-head"><h2>{t('statement.summaryTitle')}</h2></div>
        <div className="admin-panel-body">
          <ul>
            <li data-summary-assessed>{t('statement.assessed')}: {money(statement.summary.assessed)}</li>
            <li data-summary-waived>{t('statement.waivedTotal')}: {money(statement.summary.waived)}</li>
            <li data-summary-paid>{t('statement.paidMonthly')}: {money(statement.summary.paidMonthly)}</li>
            <li data-summary-extras>{t('statement.extras')}: {money(statement.summary.extras)}</li>
            <li data-summary-advance>{t('statement.advance')}: {money(statement.summary.advance)}</li>
            <li data-summary-outstanding data-outstanding={String(statement.summary.outstanding)}>{t('statement.outstanding')}: {money(statement.summary.outstanding)}</li>
            <li data-summary-due-months>{t('statement.dueMonths')}: {statement.summary.dueMonths.length
              ?statement.summary.dueMonths.map(m=>`${monthWord(m.monthKey)} (${money(m.due)})`).join(', ')
              :t('statement.none')}</li>
          </ul>
        </div>
      </section>
    </section>
  </>;
}
