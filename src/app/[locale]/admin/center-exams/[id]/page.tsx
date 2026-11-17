import {Link} from '@/i18n/navigation';
import {notFound} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {dashboardDigits} from '@/lib/admin/digits';
import {formatDate,formatNumber} from '@/lib/admin/format';
import {getExamScope} from '@/lib/exams/exam-actor';
import {examDetailView,gradingScales} from '@/lib/exams/exam-view';
import {resultSmsAudience} from '@/lib/center/exam-result-audience';
import {EXAM_TYPE_LABEL_KEYS,EXAM_STATUS_LABEL_KEYS,type ExamType,type ExamStatus} from '@/lib/exams/vocab';
import {ExamShapeForm,PublishCenterExam} from '@/components/admin/center-exam-forms';
import {ExamMarksPanel} from '@/components/exams/marks-grid';
import {SendExamResults} from '@/components/admin/exam-result-send';
import {ExamResultsTable,ExamSummaryPanel} from '@/components/exams/exam-result-table';

export const dynamic='force-dynamic';

/**
 * R5 · One exam: its shape, its marks grid, its stored results and the class summary.
 *
 * The screen is built from the actor's scope, so the same address shows an admin the whole centre and a
 * teacher (who reaches their own copy of this screen at `/teacher/exams/[id]`) only the classes they take.
 * Three things are deliberate:
 *
 *   • **The grid is the only way in.** Marks are entered by typing, pasting or uploading into one grid, and
 *     every route through it is checked by the same engine, so there is no side door that skips validation.
 *   • **A published exam is read-only here too.** The publish form becomes an unpublish form, and the grid
 *     stops accepting keys — correcting a result somebody has already been told about is a separate,
 *     logged decision rather than a keystroke.
 *   • **The summary is the stored results' own**, not the grid's live guess: what the owner reads beside
 *     the publish button is what was written, so publishing is a decision made on real numbers.
 */
export default async function ExamDetail({params}:{params:Promise<{locale:string;id:string}>}){
  const t=await getTranslations('exams');
  const scope=await getExamScope();
  if(!scope)notFound();
  const {locale,id}=await params;
  const view=await examDetailView(id,scope,locale);
  if(!view)notFound();
  const [digits,scales]=await Promise.all([dashboardDigits(scope.userId),gradingScales()]);
  const published=view.status==='published';
  /* The publish prompt asks "send the result SMS now?" and answers with a number, so the number is counted
     here — while the exam is still a draft, which is the only moment the question can be asked. A
     published exam shows no prompt, so it is not asked and nothing is counted for it. */
  const sms=scope.publish&&!published?await resultSmsAudience(view.id):undefined;
  return <>
    <div className="admin-heading"><div>
      <Link href="/admin/center-exams" className="text-link">← {t('detail.crumbExams')}</Link>
      <h1 data-exam-name>{view.name}</h1>
      <p data-exam-meta>{formatDate(view.date,digits,locale==='en'?'en':'bn')} · {t(EXAM_TYPE_LABEL_KEYS[view.type as ExamType]||'typeLabels.other')} · {t(EXAM_STATUS_LABEL_KEYS[view.status as ExamStatus]||'status.draft')} · {view.classes.join(', ')}</p>
      {view.scaleName&&<p className="admin-help" data-exam-scale-name>{t('detail.scaleUsed',{scale:view.scaleName})}</p>}
    </div></div>
    {view.tooMany&&<p role="alert" className="admin-feedback error">{t('detail.tooManyRecords')}</p>}
    <section className="admin-panel">
      <div className="admin-panel-head"><h2>{t('detail.subjectsHeading')}</h2></div>
      <div className="admin-panel-body">
        <table className="admin-table" data-exam-subjects><thead><tr>
          <th>{t('col.subject')}</th><th>{t('col.fullMarks')}</th><th>{t('col.passMarks')}</th>
        </tr></thead><tbody>{view.subjects.map(subject=><tr key={subject.id}>
          <td>{subject.name}</td><td>{subject.full}</td><td>{subject.pass}</td>
        </tr>)}</tbody></table>
        <p className="admin-help" data-exam-bands>{t('detail.bandsHeading')}: {view.bands.map(band=>`${band.min}% ${band.label} (${band.point})`).join(' · ')}</p>
      </div>
    </section>
    {scope.manage&&<section className="admin-panel">
      <div className="admin-panel-head"><h2>{published?t('detail.editLockedHeading'):t('detail.editHeading')}</h2></div>
      <div className="admin-panel-body">
        {published
          ? <p className="admin-help" data-edit-locked>{t('detail.editLocked')}</p>
          : <details className="center-exam-edit" data-exam-edit><summary>{t('detail.editSummary')}</summary>
              <ExamShapeForm digits={digits} mode="edit"
                groups={view.classes}
                scales={scales}
                value={{id:view.id,name:view.name,type:view.type,date:view.date,scaleName:view.scaleName,
                  classIds:view.classes.map(entry=>entry.id),
                  subjects:view.subjects.map(subject=>({name:subject.name,full:subject.full,pass:subject.pass,parts:subject.parts})),
                  bands:view.bands}}/>
            </details>}
      </div>
    </section>}
    <section className="admin-panel">
      <div className="admin-panel-head"><h2>{t('detail.enterMarksHeading')}</h2><span data-exam-progress>{formatNumber(view.results.length,digits)} / {formatNumber(view.students.length,digits)}</span></div>
      <p className="admin-help" style={{padding:'0 1rem'}}>{t('detail.marksHelp')}</p>
      <div className="admin-panel-body">
        <ExamMarksPanel examId={view.id} subjects={view.subjects} students={view.students} bands={view.bands}
          canWrite={scope.manage||scope.teacher} digits={digits} published={published}/>
      </div>
    </section>
    {/* Group 3: telling the guardians is its own step, not a checkbox somebody remembers — so the send
        sits under the marks with the proof of what went out one click past it. */}
    {scope.publish&&<section className="admin-panel" data-exam-results-sms>
      <div className="admin-panel-head"><h2>{t('results.heading')}</h2></div>
      <p className="admin-help" style={{padding:'0 1rem'}}>{t('results.panelHelp')}</p>
      <div className="admin-panel-body"><SendExamResults exam={view.id} published={published} digits={digits}/></div>
    </section>}
    {scope.publish&&<section className="admin-panel">
      <div className="admin-panel-head"><h2>{published?t('detail.publishedHeading'):t('detail.publishHeading')}</h2></div>
      <div className="admin-panel-body"><PublishCenterExam exam={view.id} published={published} sms={sms} digits={digits}/></div>
    </section>}
    <section className="admin-panel">
      <div className="admin-panel-head"><h2>{t('detail.savedResultsHeading')}</h2><span>{formatNumber(view.results.length,digits)}</span></div>
      <p className="admin-help" style={{padding:'0 1rem'}}>{t('detail.rankHelp')}</p>
      <div className="admin-panel-body"><ExamSummaryPanel summary={view.summary} digits={digits}/></div>
      <ExamResultsTable results={view.results} subjects={view.subjects} digits={digits} showClass={view.classes.length>1}/>
    </section>
  </>;
}
