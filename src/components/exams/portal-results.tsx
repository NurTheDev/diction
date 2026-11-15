/**
 * R5 slice 2 · The portal's Results tab: one student's published results, and nothing else.
 *
 * The isolation is the whole feature, and it is structural rather than a filter applied late:
 *
 *   • **Whose.** `portalResultStudents` answers from the signed-in account's own phone number — the same
 *     evidence the centre already trusts, because it is where a result SMS goes. An account with no number,
 *     or a number on no student record, gets the empty state and no query for anybody's marks.
 *   • **What.** Only `status:'published'` exams. A draft is the operator's working paper: marks that may
 *     still move and positions publishing has not finished ranking.
 *   • **Nothing else.** The reader this renders from selects marks, totals, grades and positions. It never
 *     asks for a fee, a payment, a receipt, a due or a guardian number, so there is no field here that
 *     could leak into a student's browser — and `tests/exam-results.integration.ts` serializes what the
 *     portal receives and fails on a payment word.
 *
 * Chrome is catalog text and data is data: the card head names the tab, and a child's name — which on an
 * English address is still Bangla, because it is what the operator typed — sits in the body below it.
 */
import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {PortalHero} from '@/components/portal/learner';
import {dashboardDigits} from '@/lib/admin/digits';
import {dhakaCalendar} from '@/lib/center/month-status';
import {portalResultStudents,studentReportCard,studentResultHistory} from '@/lib/exams/student-results';
import {ResultHistory} from './result-history';
import {ReportCard} from './report-card';

export async function PortalResults({user,locale,base,student,report}:{
  user:{id:string;role:string;name:string};
  locale:string;base:string;student?:string;report?:string;
}){
  const t=await getTranslations('exams');
  const digits=await dashboardDigits(user.id);
  const language=locale==='en'?'en':'bn';
  const now=dhakaCalendar(new Date());
  const generatedOn=`${now.year}-${String(now.month).padStart(2,'0')}-${String(now.day).padStart(2,'0')}`;
  const linked=await portalResultStudents(user);
  const chosen=linked.find(entry=>entry.id===student)||linked[0]||null;
  /* The one thing this address asks for is resolved before anything is painted, so the page reads top to
     bottom and asks the database once: a card when a report is named, otherwise the whole history. */
  const history=chosen&&!report?await studentResultHistory(chosen.id,locale):null;
  const answer=chosen&&report?await studentReportCard(chosen.id,report,locale):null;
  return <>
    <PortalHero title={t('results.portalTitle')} name={user.name} showAnchors={false}/>
    <section className="portal-area"><div className="wrap portal-container">
      <div className="portal-card portal-wide">
        <div className="portal-card-head"><div className="portal-icon">✦</div><h2>{t('results.portalTitle')}</h2></div>
        {!chosen
          ? <p className="portal-empty" data-portal-results-empty>{t('results.linkedNone')}</p>
          : <>
              <p className="admin-help" data-portal-results-who>
                {chosen.relation==='child'?t('results.childOf',{name:chosen.name}):chosen.name} · {t('results.publishedOnly')}
              </p>
              {linked.length>1&&<nav className="history-tabs" data-portal-children>
                {linked.map(entry=><Link key={entry.id} href={`${base}?student=${entry.id}`}
                  aria-current={chosen.id===entry.id?'page':undefined}>{entry.name}</Link>)}
              </nav>}
            </>}
      </div>
      {chosen&&(report
        ? answer?.card
          ? <ReportCard card={answer.card} digits={digits} language={language} generatedOn={generatedOn}
              backHref={`${base}?student=${chosen.id}`}/>
          : <div className="portal-card portal-wide"><p className="portal-empty" data-report-missing={answer?.reason||''}>
              {answer?.reason==='NO_RESULT'?t('report.noResult'):t('report.notPublished')}</p></div>
        : history
          ? <ResultHistory history={history} digits={digits} language={language}
              reportHref={examId=>`${base}?student=${chosen.id}&report=${examId}`}/>
          : <div className="portal-card portal-wide"><p className="portal-empty" data-result-empty>{t('results.empty')}</p></div>)}
    </div></section>
  </>;
}
