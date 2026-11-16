/**
 * R5 slice 2 · The results tab of an admin student profile, and its report card.
 *
 * One component so the admin tree and the portal read the same two screens from the same reader: the
 * history table with its trend, and the printable card for one exam. The profile page stays the dense
 * one-line page it has always been and hands over an id and a question mark.
 */
import {getTranslations} from 'next-intl/server';
import {dhakaCalendar} from '@/lib/center/month-status';
import type {Digits} from '@/lib/admin/format';
import {studentReportCard,studentResultHistory} from '@/lib/exams/student-results';
import {ResultHistory} from './result-history';
import {ReportCard} from './report-card';

/** Today in Dhaka as the card dates itself: a report card printed in a month it was not made in is a lie. */
const today=():string=>{
  const now=dhakaCalendar(new Date());
  return `${now.year}-${String(now.month).padStart(2,'0')}-${String(now.day).padStart(2,'0')}`;
};

export async function AdminStudentResults({studentId,report,locale,digits}:{
  studentId:string;report?:string;locale:string;digits:Digits;
}){
  const t=await getTranslations('exams');
  const language=locale==='en'?'en':'bn';
  const back=`/admin/students/${studentId}?tab=results`;
  if(report){
    const answer=await studentReportCard(studentId,report,locale);
    if(!answer.card)return <section className="admin-panel"><div className="admin-panel-body">
      <p className="portal-empty" data-report-missing={answer.reason||''}>
        {answer.reason==='NO_RESULT'?t('report.noResult'):t('report.notPublished')}</p></div></section>;
    return <ReportCard card={answer.card} digits={digits} language={language} generatedOn={today()} backHref={back}/>;
  }
  const history=await studentResultHistory(studentId,locale);
  if(!history)return <section className="admin-panel"><div className="admin-panel-body">
    <p className="portal-empty" data-result-missing>{t('results.empty')}</p></div></section>;
  return <ResultHistory history={history} digits={digits} language={language}
    reportHref={examId=>`${back}&report=${examId}`}/>;
}
