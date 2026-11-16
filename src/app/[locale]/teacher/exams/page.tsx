import {redirect} from 'next/navigation';
import {Link} from '@/i18n/navigation';
import {getTranslations} from 'next-intl/server';
import {getPortalUser} from '@/lib/portal-guard';
import {getExamScope} from '@/lib/exams/exam-actor';
import {examListView} from '@/lib/exams/exam-view';
import {EXAM_TYPE_LABEL_KEYS,EXAM_STATUS_LABEL_KEYS,type ExamType,type ExamStatus} from '@/lib/exams/vocab';
import {PortalHero} from '@/components/portal/learner';
import {dashboardDigits} from '@/lib/admin/digits';
import {formatDate,formatNumber} from '@/lib/admin/format';
import {ClipboardCheck} from 'lucide-react';

export const dynamic='force-dynamic';

/**
 * R5 · A teacher's exams: the classes they take, and the marks grid for each.
 *
 * This screen is the whole of a teacher's exam world, and its narrowness is the point. The list is built
 * from the live scope (`lib/exams/exam-scope`), which is the `teachers` list on the class groups — so a
 * teacher sees the exams of the classes assigned to them and nothing else, and there is no link from here
 * to a payment, a receipt, a due, a fee ledger or the cashbook: those are not hidden by CSS, they are
 * never queried. A teacher who takes no class sees an empty list, not somebody else's.
 */
export default async function TeacherExams({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{page?:string}>}){
  const {locale}=await params;
  const user=await getPortalUser('teacher');
  if(!user)redirect(`/${locale}/login?callbackUrl=/${locale}/teacher/exams`);
  const scope=await getExamScope();
  if(!scope||!scope.teacher)redirect(`/${locale}/teacher`);
  const t=await getTranslations('exams');
  /* The teacher reads their own digit preference, exactly as the owner reads theirs: a total on a Bangla
     screen is a Bangla total. */
  const digits=await dashboardDigits(scope.userId);
  const query=await searchParams;
  const page=Number(query.page);
  const list=await examListView(scope,{},Number.isSafeInteger(page)?page:1,locale);
  return <>
    <PortalHero title={t('teacher.title')} name={user.name} showAnchors={false}/>
    <section className="portal-area"><div className="wrap portal-container">
      <div className="notice-box" data-teacher-scope>{t('teacher.scopeNote',{classes:formatNumber(scope.classGroups?.length??0,digits)})}</div>
      <section className="portal-card" id="exams">
        <div className="portal-card-head"><div className="portal-icon"><ClipboardCheck size={20}/></div>
          <div><span>{t('teacher.listHeading')}</span><h2 data-teacher-exam-total>{formatNumber(list.total,digits)}</h2></div>
        </div>
        <div className="admin-table-wrap"><table className="admin-table" data-teacher-exams>
          <thead><tr>
            <th>{t('col.exam')}</th><th>{t('col.type')}</th><th>{t('col.class')}</th>
            <th>{t('col.date')}</th><th>{t('col.status')}</th><th/></tr></thead>
          <tbody>{list.exams.map(exam=><tr key={exam.id} data-teacher-exam-row={exam.id}>
            <td>{exam.name}</td>
            <td>{t(EXAM_TYPE_LABEL_KEYS[exam.type as ExamType]||'typeLabels.other')}</td>
            <td>{exam.classes.join(', ')}</td>
            <td>{formatDate(exam.date,digits,locale==='en'?'en':'bn')}</td>
            <td data-teacher-exam-status={exam.status}>{t(EXAM_STATUS_LABEL_KEYS[exam.status as ExamStatus]||'status.draft')}</td>
            <td><Link className="admin-mini-button" href={`/teacher/exams/${exam.id}`} data-teacher-open={exam.id}>
              {exam.status==='draft'?t('teacher.enterMarks'):t('teacher.viewMarks')}
            </Link></td>
          </tr>)}</tbody>
        </table></div>
        {!list.exams.length&&<p className="admin-empty" data-teacher-empty>{t('teacher.empty')}</p>}
        {list.pages>1&&<div className="admin-pagination">
          <span>{t('page')} {formatNumber(list.page,digits)} / {formatNumber(list.pages,digits)}</span>
          <div>
            {list.page>1&&<Link className="admin-mini-button" href={`/teacher/exams?page=${list.page-1}`}>{t('previous')}</Link>}
            {list.page<list.pages&&<Link className="admin-mini-button" href={`/teacher/exams?page=${list.page+1}`}>{t('next')}</Link>}
          </div>
        </div>}
      </section>
      <p className="admin-help"><Link className="text-link" href="/teacher">{t('teacher.backToPortal')}</Link></p>
    </div></section>
  </>;
}
