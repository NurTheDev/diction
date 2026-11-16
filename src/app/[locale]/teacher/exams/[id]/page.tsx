import {redirect} from 'next/navigation';
import {Link} from '@/i18n/navigation';
import {NextIntlClientProvider} from 'next-intl';
import {getMessages,getTranslations} from 'next-intl/server';
import {pickedMessages} from '@/i18n/client-namespaces';
import {getPortalUser} from '@/lib/portal-guard';
import {dashboardDigits} from '@/lib/admin/digits';
import {formatDate,formatNumber} from '@/lib/admin/format';
import {getExamScope} from '@/lib/exams/exam-actor';
import {examDetailView} from '@/lib/exams/exam-view';
import {EXAM_TYPE_LABEL_KEYS,EXAM_STATUS_LABEL_KEYS,type ExamType,type ExamStatus} from '@/lib/exams/vocab';
import {ExamMarksPanel} from '@/components/exams/marks-grid';
import {ExamResultsTable,ExamSummaryPanel} from '@/components/exams/exam-result-table';
import {PortalHero} from '@/components/portal/learner';

export const dynamic='force-dynamic';

/**
 * R5 · A teacher's marks grid for one exam.
 *
 * The same grid the owner uses, with one difference that is the whole point of the screen: it is scoped.
 * `examDetailView` intersects the exam's classes with the classes this teacher is assigned to before it
 * reads a single student, so an exam covering 9-A and 9-B shows a teacher of 9-A only 9-A — and an exam
 * covering a class they do not take is a not-found, not an empty grid.
 *
 * A teacher can enter marks in a draft and read a published result. They cannot create or edit an exam,
 * cannot publish one, cannot change the grading scale, and cannot reach a payment, a receipt, a due, a fee
 * ledger or the cashbook from here: nothing on this screen queries one.
 */
export default async function TeacherExamDetail({params}:{params:Promise<{locale:string;id:string}>}){
  const {locale,id}=await params;
  const user=await getPortalUser('teacher');
  if(!user)redirect(`/${locale}/login?callbackUrl=/${locale}/teacher/exams`);
  const scope=await getExamScope();
  if(!scope||!scope.teacher)redirect(`/${locale}/teacher`);
  const t=await getTranslations('exams');
  const view=await examDetailView(id,scope,locale);
  if(!view)redirect(`/${locale}/teacher/exams`);
  const digits=await dashboardDigits(scope.userId);
  const published=view.status==='published';
  /* The grid is a client component and reads `exams`, and this page is not in the admin tree: the public
     layout ships only the groups the public site's own client components read, so without a provider here
     the grid would paint the catalog's key paths where its sentences belong — every button, every status
     line, every refusal, on the screen R5 exists for. Only `exams` is shipped, deliberately: the rest of
     the catalog is admin copy, and a teacher's screen should carry no fee or dues vocabulary even in the
     bytes behind the visible ones. */
  const gridMessages=pickedMessages(await getMessages(),['exams']);
  return <>
    <PortalHero title={t('teacher.title')} name={user.name} showAnchors={false}/>
    <section className="portal-area"><div className="wrap portal-container">
      <section className="portal-card" id="exam-marks">
        <div className="portal-card-head"><div><span>{t('teacher.marksHeading')}</span>
          <h2 data-teacher-exam-name>{view.name}</h2></div>
        </div>
        <p className="admin-help" data-teacher-exam-meta>
          {formatDate(view.date,digits,locale==='en'?'en':'bn')} · {t(EXAM_TYPE_LABEL_KEYS[view.type as ExamType]||'typeLabels.other')} · {t(EXAM_STATUS_LABEL_KEYS[view.status as ExamStatus]||'status.draft')} · {view.classes.map(entry=>entry.name).join(', ')}
        </p>
        {view.tooMany&&<p role="alert" className="admin-feedback error">{t('detail.tooManyRecords')}</p>}
        <p className="admin-help">{published?t('teacher.publishedNote'):t('teacher.draftNote')}</p>
        <NextIntlClientProvider messages={gridMessages}>
          <ExamMarksPanel examId={view.id} subjects={view.subjects} students={view.students} bands={view.bands}
            canWrite={!published} digits={digits} published={published}/>
        </NextIntlClientProvider>
      </section>
      <section className="portal-card" id="exam-results">
        <div className="portal-card-head"><div><span>{t('detail.savedResultsHeading')}</span>
          <h2 data-teacher-result-count>{formatNumber(view.results.length,digits)}</h2></div>
        </div>
        <ExamSummaryPanel summary={view.summary} digits={digits}/>
        <ExamResultsTable results={view.results} subjects={view.subjects} digits={digits} showClass={view.classes.length>1}/>
      </section>
      <p className="admin-help"><Link className="text-link" href="/teacher/exams">← {t('teacher.backToList')}</Link></p>
    </div></section>
  </>;
}
