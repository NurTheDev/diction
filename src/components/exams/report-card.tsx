/**
 * R5 slice 2 · The report card: one student, one exam, printable.
 *
 * Everything on it is a stored fact quoted, not a number worked out here — the marks, the total, the
 * percentage, the grade, the point and the position come from the row publishing wrote, through
 * `studentReportCard`, so a card and the exam's own result table cannot disagree. The institute's name is
 * the catalog's brand, the same one the public site prints, because a card with a name nobody maintains is
 * a card that goes out wrong the day the centre is renamed.
 *
 * The remarks block is a **placeholder on purpose**: no schema field holds a teacher's remark, and a card
 * that printed an invented sentence under a heading would be forging the one part a family reads aloud. So
 * the heading, an empty ruled space and a line saying nothing has been written yet are what ships, and the
 * space is there for a hand.
 *
 * Print styles live in `globals.css` under `@media print`: the card is the only thing on the page, so the
 * shell around it — the admin bar, the sidebar, the portal hero — is hidden rather than shrunk.
 */
import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {formatDate,formatNumber,type Digits} from '@/lib/admin/format';
import type {ReportCardData} from '@/lib/exams/student-results';
import {EXAM_TYPE_LABEL_KEYS,type ExamType} from '@/lib/exams/vocab';
import {PrintButton} from './print-button';

export async function ReportCard({card,digits,language,generatedOn,backHref}:{
  card:ReportCardData;digits:Digits;language:'bn'|'en';generatedOn:string;backHref:string;
}){
  const t=await getTranslations('exams');
  const common=await getTranslations('common');
  const {result,student}=card;
  const dash='—';
  return <>
    <div className="admin-heading report-toolbar no-print">
      <div><Link href={backHref} className="text-link">← {t('report.backToResults')}</Link></div>
      <PrintButton label={t('report.print')}/>
    </div>
    <article className="report-card" data-report-card>
      <header className="report-head">
        <strong data-report-brand>{common('brand')}</strong>
        <h1>{t('report.title')}</h1>
        <p data-report-generated>{t('report.generatedOn')}: {formatDate(generatedOn,digits,language)}</p>
      </header>
      <dl className="report-who" data-report-student>
        <div><dt>{t('col.student')}</dt><dd>{student.name}</dd></div>
        <div><dt>{t('report.studentId')}</dt><dd>{student.idLabel?formatDigitsLabel(student.idLabel,digits):dash}</dd></div>
        <div><dt>{t('report.roll')}</dt><dd>{student.roll?formatDigitsLabel(student.roll,digits):dash}</dd></div>
        <div><dt>{t('col.class')}</dt><dd>{student.className||dash}</dd></div>
        <div><dt>{t('col.exam')}</dt><dd data-report-exam>{result.name}</dd></div>
        <div><dt>{t('col.type')}</dt><dd>{t(EXAM_TYPE_LABEL_KEYS[result.type as ExamType]||'typeLabels.other')}</dd></div>
        <div><dt>{t('col.date')}</dt><dd>{formatDate(result.date,digits,language)}</dd></div>
      </dl>
      <h2>{t('report.subjects')}</h2>
      <div className="admin-table-wrap">
        <table className="admin-table" data-report-subjects>
          <thead><tr>
            <th>{t('col.subject')}</th><th>{t('report.obtained')}</th><th>{t('col.fullMarks')}</th>
            <th>{t('col.passMarks')}</th>
          </tr></thead>
          <tbody>
            {result.subjects.map(subject=>(
              <tr key={subject.name} data-report-subject={subject.name}>
                <td>{subject.name}</td>
                <td>{subject.absent||subject.obtained===null?t('grades.absent'):formatNumber(subject.obtained,digits)}</td>
                <td>{formatNumber(subject.full,digits)}</td>
                <td>{formatNumber(subject.pass,digits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="report-total" data-report-summary>
        <div><dt>{t('col.total')}</dt><dd data-report-total>{result.absent?dash:`${formatNumber(result.total,digits)}/${formatNumber(result.fullTotal,digits)}`}</dd></div>
        <div><dt>{t('col.percentage')}</dt><dd data-report-percent>{result.absent?dash:formatNumber(Math.round(result.percentage*100)/100,digits)}</dd></div>
        <div><dt>{t('col.grade')}</dt><dd data-report-grade>{result.grade}</dd></div>
        <div><dt>{t('report.point')}</dt><dd data-report-point>{formatNumber(result.point,digits)}</dd></div>
        <div><dt>{t('col.rank')}</dt><dd data-report-position>{result.position?formatNumber(result.position,digits):t('results.positionNone')}</dd></div>
      </dl>
      {result.absent&&<p className="admin-help" data-report-absent>{t('report.absentNote')}</p>}
      <section className="report-remarks" data-report-remarks>
        <h2>{t('report.remarks')}</h2>
        <p className="admin-help">{t('report.remarksPlaceholder')}</p>
        <div className="report-rule" aria-hidden="true"/>
        <div className="report-rule" aria-hidden="true"/>
      </section>
      <footer className="report-sign">
        <div><span className="report-rule"/><small>{t('report.signGuardian')}</small></div>
        <div><span className="report-rule"/><small>{t('report.signHead')}</small></div>
      </footer>
    </article>
  </>;
}

/** A readable id or roll is digits and letters together: only the digits inside it take the page's script. */
function formatDigitsLabel(value:string,digits:Digits):string{
  return value.replace(/[0-9\u09E6-\u09EF]/g,character=>{
    const at=character.charCodeAt(0)-(character>='\u09E6'?0x09E6:0x30);
    return formatNumber(at,digits);
  });
}
