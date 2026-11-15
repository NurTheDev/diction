import {Link} from '@/i18n/navigation';
import {notFound} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import mongoose from 'mongoose';
import {CenterGradingScale} from '@/models/CenterRecords';
import {getExamScope} from '@/lib/exams/exam-actor';
import {GradingScaleForm} from '@/components/admin/center-exam-forms';
import {DEFAULT_GRADING_RANGES} from '@/lib/exams/vocab';

export const dynamic='force-dynamic';

/**
 * R5 · The centre's grading scales.
 *
 * The brief asks for a configurable scale, and the model for one has existed unread since the
 * experimental exam work; this is the screen that makes it real. Two rules keep it honest:
 *
 *   • **Only the owner edits it** (`scope.scale` — Super Admin and Admin). An exam manager runs exams but
 *     does not decide what an A+ is worth centre-wide, and a teacher certainly does not.
 *   • **Editing a scale never rewrites a result.** An exam snapshots the bands it was created with, so the
 *     scales listed here are the choices for the NEXT exam. The one exception is deliberate: changing an
 *     exam's own bands recomputes that exam's stored grades, because a grade is derived from a mark and a
 *     mark is not derived from anything.
 */
export default async function GradingScalePage({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{scale?:string}>}){
  const t=await getTranslations('exams');
  const scope=await getExamScope();
  if(!scope||!scope.scale)notFound();
  const {scale}=await searchParams;
  const scales=await CenterGradingScale.find({}).sort({active:-1,name:1}).limit(20)
    .lean<{_id:mongoose.Types.ObjectId;name:string;ranges:{min:number;max:number;grade:string;point:number}[];active:boolean}[]>();
  const options=scales.map(entry=>({
    id:String(entry._id),name:entry.name,active:entry.active,
    ranges:entry.ranges.map(range=>({min:range.min,max:range.max,grade:range.grade,point:range.point})),
  }));
  const current=scale&&mongoose.isValidObjectId(scale)?options.find(entry=>entry.id===scale):null;
  return <>
    <div className="admin-heading"><div>
      <Link href="/admin/center-exams" className="text-link">← {t('scale.crumbExams')}</Link>
      <h1>{t('scale.title')}</h1>
      <p>{t('scale.desc')}</p>
    </div></div>
    <section className="admin-panel">
      <div className="admin-panel-head"><h2>{current?t('scale.editHeading'):t('scale.newHeading')}</h2></div>
      <div className="admin-panel-body">
        <GradingScaleForm scale={current?{id:current.id,name:current.name,ranges:current.ranges,active:current.active}:null} scales={options}/>
      </div>
    </section>
    <section className="admin-panel">
      <div className="admin-panel-head"><h2>{t('scale.savedHeading')}</h2><span data-scale-count>{options.length}</span></div>
      <div className="admin-table-wrap"><table className="admin-table" data-scale-list>
        <thead><tr><th>{t('scale.col.name')}</th><th>{t('scale.col.status')}</th><th>{t('scale.col.ranges')}</th><th/></tr></thead>
        <tbody>{options.map(entry=><tr key={entry.id} data-scale-row={entry.id}>
          <td>{entry.name}</td>
          <td>{entry.active?t('scale.active'):t('scale.inactive')}</td>
          <td>{entry.ranges.map(range=>`${range.grade} ${range.min}–${range.max} (${range.point})`).join(' · ')}</td>
          <td><Link className="admin-mini-button" href={`/admin/grading-scale?scale=${entry.id}`}>{t('scale.edit')}</Link></td>
        </tr>)}</tbody>
      </table></div>
      {!options.length&&<p className="admin-empty">{t('scale.empty')}</p>}
    </section>
    <section className="admin-panel">
      <div className="admin-panel-head"><h2>{t('scale.defaultHeading')}</h2></div>
      <div className="admin-panel-body">
        <p className="admin-help">{t('scale.defaultHelp')}</p>
        <div className="admin-table-wrap"><table className="admin-table" data-scale-default><thead><tr>
          <th>{t('scale.col.grade')}</th><th>{t('scale.col.from')}</th><th>{t('scale.col.to')}</th><th>{t('scale.col.point')}</th>
        </tr></thead><tbody>{DEFAULT_GRADING_RANGES.map(range=><tr key={range.grade}>
          <td>{range.grade}</td><td>{range.min}</td><td>{range.max}</td><td>{range.point}</td>
        </tr>)}</tbody></table></div>
      </div>
    </section>
  </>;
}
