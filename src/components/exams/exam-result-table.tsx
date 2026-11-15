import {getTranslations} from 'next-intl/server';
import {formatNumber,type Digits} from '@/lib/admin/format';
import type {ViewResult,ViewSubject} from '@/lib/exams/exam-view';

/**
 * R5 · The stored results of one exam, as a table.
 *
 * Shared by the owner's exam screen and the teacher's, so the two cannot drift: the same rows, the same
 * positions, the same absent mark. A position is shown as a number only when the exam has been published
 * and the class was ranked; before that it is `—`, because a position over an unfinished class is a guess.
 *
 * Digits follow the reader's own setting (Bangla by default, English if they asked for it), which is how
 * every number in the admin reads — a result sheet is not the place to invent a second convention.
 */
export async function ExamResultsTable({results,subjects,digits,showClass}:{
  results:ViewResult[];subjects:ViewSubject[];digits:Digits;showClass:boolean;
}){
  const t=await getTranslations('exams');
  const number=(value:number|null):string=>value===null?'—':formatNumber(value,digits);
  if(!results.length)return <p className="admin-empty" data-results-empty>{t('detail.noResults')}</p>;
  return <div className="admin-table-wrap"><table className="admin-table" data-exam-results>
    <thead><tr>
      <th>{t('col.student')}</th>
      {showClass&&<th>{t('col.class')}</th>}
      {subjects.map(subject=><th key={subject.id}>{subject.name}<small>{t('grid.fullOf',{full:number(subject.full)})}</small></th>)}
      <th>{t('col.total')}</th><th>{t('col.percentage')}</th><th>{t('col.grade')}</th>
      <th>{t('col.point')}</th><th>{t('col.rank')}</th>
    </tr></thead>
    <tbody>{results.map(result=><tr key={result.id} data-result-row={result.studentId}>
      <td>{result.name}</td>
      {showClass&&<td>{result.classId}</td>}
      {subjects.map(subject=>{
        const mark=result.marks[subject.id];
        return <td key={subject.id} data-result-mark={subject.id}>
          {!mark?'—':mark.absent?t('grades.absent'):number(mark.obtained)}
        </td>;
      })}
      <td data-result-total>{number(result.total)} / {number(subjects.reduce((full,subject)=>full+subject.full,0))}</td>
      <td data-result-percentage>{number(result.percentage)}</td>
      <td data-result-grade>{!result.grade?'—':result.grade==='ABSENT'?t('grades.absent'):result.grade==='FAIL'?t('grades.fail'):result.grade}</td>
      <td data-result-point>{result.point?number(result.point):'—'}</td>
      <td data-result-position>{result.position?number(result.position):'—'}</td>
    </tr>)}</tbody>
  </table></div>;
}

/**
 * The class summary of a published or in-progress exam: who sat, who was absent, who passed, the average,
 * the top and the bottom of the class, the pass rate, and each subject's own average.
 *
 * Every figure is over the students who were present, and an empty class says `—` rather than 0 — an
 * average of zero over nobody reads as "they all scored nothing", which is a different claim.
 */
export async function ExamSummaryPanel({summary,digits}:{
  summary:{students:number;counted:number;absent:number;failed:number;passed:number;average:number|null;
    highest:number|null;lowest:number|null;passRate:number|null;subjects:{subject:string;counted:number;absent:number;passed:number;failed:number;average:number|null;highest:number|null;lowest:number|null}[]};
  digits:Digits;
}){
  const t=await getTranslations('exams');
  const number=(value:number|null):string=>value===null?'—':formatNumber(Math.round(value*10)/10,digits);
  const count=(value:number):string=>formatNumber(value,digits);
  const rate=summary.passRate===null?'—':`${formatNumber(summary.passRate,digits)}%`;
  return <dl className="center-exam-summary" data-exam-summary-server>
    <div><dt>{t('summary.students')}</dt><dd data-server-students>{count(summary.students)}</dd></div>
    <div><dt>{t('summary.counted')}</dt><dd data-server-counted>{count(summary.counted)}</dd></div>
    <div><dt>{t('summary.absent')}</dt><dd data-server-absent>{count(summary.absent)}</dd></div>
    <div><dt>{t('summary.passed')}</dt><dd data-server-passed>{count(summary.passed)}</dd></div>
    <div><dt>{t('summary.failed')}</dt><dd data-server-failed>{count(summary.failed)}</dd></div>
    <div><dt>{t('summary.average')}</dt><dd data-server-average>{number(summary.average)}</dd></div>
    <div><dt>{t('summary.highest')}</dt><dd data-server-highest>{number(summary.highest)}</dd></div>
    <div><dt>{t('summary.lowest')}</dt><dd data-server-lowest>{number(summary.lowest)}</dd></div>
    <div><dt>{t('summary.passRate')}</dt><dd data-server-passrate>{rate}</dd></div>
  </dl>;
}
