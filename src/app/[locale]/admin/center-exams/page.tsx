import {Link} from '@/i18n/navigation';
import {getTranslations} from 'next-intl/server';
import {CenterClassGroup} from '@/models/CenterRecords';
import {scopeFilter} from '@/lib/exams/exam-scope';
import {getExamScope} from '@/lib/exams/exam-actor';
import {examListView,gradingScales} from '@/lib/exams/exam-view';
import {EXAM_TYPES,EXAM_TYPE_LABEL_KEYS,EXAM_STATUSES,EXAM_STATUS_LABEL_KEYS} from '@/lib/exams/vocab';
import {ExamShapeForm} from '@/components/admin/center-exam-forms';
import {DeleteRow} from '@/components/admin/delete-row';
import {notFound} from 'next/navigation';
import {dashboardDigits} from '@/lib/admin/digits';
import {formatNumber} from '@/lib/admin/format';

export const dynamic='force-dynamic';

const emptyExam={id:'',name:'',type:'monthly',date:'',scaleName:'',classIds:[],subjects:[],bands:[]};

/**
 * R5 · The centre's exams: what has been held, what is still a draft, and the form that starts one.
 *
 * The list is built from the live actor's scope, so an exam manager sees every class and a teacher (who
 * never reaches this screen — theirs is `/teacher/exams`) would see only their own. Writing needs
 * `scope.manage`, and deleting stays where the Recycle Bin puts it: admin and super admin only.
 */
export default async function Exams({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{page?:string;type?:string;status?:string;classId?:string}>}){
  const t=await getTranslations('exams');
  const scope=await getExamScope();
  if(!scope)notFound();
  const {locale}=await params;
  // The operator's own digit preference, read once: a total on a Bangla screen is a Bangla total.
  const digits=await dashboardDigits(scope.userId);
  const query=await searchParams;
  const page=Number(query.page);
  const [list,scales,groups]=await Promise.all([
    examListView(scope,{type:query.type,status:query.status,classId:query.classId},Number.isSafeInteger(page)?page:1,locale),
    gradingScales(),
    CenterClassGroup.find({active:true,...scopeFilter(scope)}).select('name academicYear shift').sort({academicYear:-1,order:1}).limit(200)
      .lean<{_id:unknown;name:{bn:string;en?:string};academicYear:number;shift?:string}[]>(),
  ]);
  const choices=groups.map(group=>({
    id:String(group._id),
    name:`${(locale==='en'?group.name.en||group.name.bn:group.name.bn)}${group.shift?` · ${group.shift}`:''} · ${group.academicYear}`,
  }));
  const canDelete=scope.role==='admin'||scope.role==='superadmin';
  // Paging keeps the filters: turning to page 2 of "draft model tests" must not quietly show everything.
  const filterQuery=(page:number):string=>{
    const next=new URLSearchParams();
    if(query.type)next.set('type',query.type);
    if(query.status)next.set('status',query.status);
    if(query.classId)next.set('classId',query.classId);
    if(page>1)next.set('page',String(page));
    const text=next.toString();
    return text?`?${text}`:'';
  };
  return <>
    <div className="admin-heading"><div>
      <h1>{t('list.title')}</h1>
      <p>{t('list.desc')}</p>
      <p className="admin-help"><Link className="text-link" href="/admin/grading-scale" data-link-scale>{t('list.scaleLink')}</Link></p>
    </div></div>
    {scope.manage&&<section className="admin-panel"><div className="admin-panel-head"><h2>{t('list.createHeading')}</h2></div>
      <div className="admin-panel-body"><ExamShapeForm mode="create" groups={choices} scales={scales} value={emptyExam}/></div>
    </section>}
    <section className="admin-panel">
      <div className="admin-panel-head"><h2>{t('list.heading')}</h2><span data-exam-total>{formatNumber(list.total,digits)}</span></div>
      <form className="admin-filters" method="get" data-exam-filters>
        <label>{t('filter.type')}<select className="admin-select" name="type" defaultValue={query.type||''}>
          <option value="">{t('filter.any')}</option>
          {EXAM_TYPES.map(type=><option value={type} key={type}>{t(EXAM_TYPE_LABEL_KEYS[type])}</option>)}
        </select></label>
        <label>{t('filter.status')}<select className="admin-select" name="status" defaultValue={query.status||''}>
          <option value="">{t('filter.any')}</option>
          {EXAM_STATUSES.map(status=><option value={status} key={status}>{t(EXAM_STATUS_LABEL_KEYS[status])}</option>)}
        </select></label>
        <label>{t('filter.class')}<select className="admin-select" name="classId" defaultValue={query.classId||''}>
          <option value="">{t('filter.any')}</option>
          {choices.map(choice=><option value={choice.id} key={choice.id}>{choice.name}</option>)}
        </select></label>
        <button className="admin-mini-button" type="submit">{t('filter.apply')}</button>
        {(query.type||query.status||query.classId)&&<Link className="admin-mini-button" href="/admin/center-exams">{t('filter.clear')}</Link>}
      </form>
      <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr>
          <th>{t('col.exam')}</th><th>{t('col.type')}</th><th>{t('col.class')}</th><th>{t('col.date')}</th>
          <th>{t('col.status')}</th><th>{t('col.results')}</th>{canDelete&&<th>{t('col.delete')}</th>}
        </tr></thead>
        <tbody>{list.exams.map(exam=><tr key={exam.id} data-exam-row={exam.id}>
          <td><Link className="text-link" href={`/admin/center-exams/${exam.id}`}>{exam.name}</Link></td>
          <td>{t(EXAM_TYPE_LABEL_KEYS[exam.type as keyof typeof EXAM_TYPE_LABEL_KEYS]||'typeLabels.other')}</td>
          <td>{exam.classes.join(', ')}</td>
          <td>{exam.date}</td>
          <td data-exam-status={exam.status}>{t(EXAM_STATUS_LABEL_KEYS[exam.status as keyof typeof EXAM_STATUS_LABEL_KEYS]||'status.draft')}</td>
          <td>{exam.results}</td>
          {canDelete&&<td><DeleteRow kind="centerExam" id={exam.id} name={exam.name} canArchive={false}/></td>}
        </tr>)}</tbody>
      </table></div>
      {!list.exams.length&&<p className="admin-empty">{t('list.empty')}</p>}
      <div className="admin-pagination">
        <span>{t('page')} {formatNumber(list.page,digits)} / {formatNumber(list.pages,digits)}</span>
        <div>
          {list.page>1&&<Link className="admin-mini-button" href={`/admin/center-exams${filterQuery(list.page-1)}`}>{t('previous')}</Link>}
          {list.page<list.pages&&<Link className="admin-mini-button" href={`/admin/center-exams${filterQuery(list.page+1)}`}>{t('next')}</Link>}
        </div>
      </div>
    </section>
  </>;
}
