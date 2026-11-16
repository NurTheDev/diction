import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {redirect} from 'next/navigation';
import {MessageCircle,Phone,Search} from 'lucide-react';
import {getAdmin} from '@/lib/admin/guard';
import {dashboardDigits} from '@/lib/admin/digits';
import {formatDate,formatNumber} from '@/lib/admin/format';
import {listCandidates} from '@/lib/teachers/candidates';
import {listNeeds,needMatches} from '@/lib/teachers/needs';
import {teacherSmsDialogData} from '@/lib/center/sms-dialog-data';
import {
  TEACHER_CLASS_LEVELS,TEACHER_RATINGS,TEACHER_SHIFTS,TEACHER_STATUSES,TEACHER_SUBJECTS,teacherListQuery,
} from '@/lib/teachers/vocab';
import {
  candidateListView,candidateRowView,ratingBadge,ratingLabel,shiftLabel,statusBadge,statusLabel,subjectLabel,
} from '@/lib/teachers/cv-ui';
import {Pagination} from '@/components/admin/pagination';
import {CvDetailDrawer,CvNeedForm,CvNeedRow,CvRowControls,CvSmsBar,CvSmsCheck,CvSmsPicker} from '@/components/admin/teacher-cvs-ui';

type Query={subject?:string;classLevel?:string;shift?:string;status?:string;rating?:string;availability?:string;
  q?:string;need?:string;page?:string};

/**
 * R4 · Find a teacher.
 *
 * The list answers "who is on file"; this screen answers "who can teach class 9 maths in the evening". It
 * is the same rule layer with a different question on top, which is why it shares the filters, the row
 * controls and the drawer instead of carrying a second copy of them:
 *
 *   • **A saved teaching need is a question written down once.** Each need counts the CVs that fit it and
 *     opens them with one tap, so the same search is not retyped every time a batch needs a teacher. The
 *     count and the matches come from the same filter a hand-set search uses (`teacherListFilter`), so a
 *     need that says nine and a filter set to the same three values cannot disagree.
 *   • **One table either way.** Opening a need renders full rows, exactly like the filtered search, so the
 *     masks, the dial links and the drawer are the same code and cannot drift between the two entrances.
 *   • **The row is dialable, WhatsApp-able and SMS-able where it stands**, and several rows can be ticked
 *     and texted together through the app's one SMS dialog with the `teacher_opening` template — the
 *     subject in that message is the subject the operator just filtered by, which is what makes the send
 *     worth sending.
 *   • **A number is a mask on screen and a `tel:` destination in the link**, exactly as on the list.
 */
export default async function FindTeacher({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<Query>}){
  const {locale}=await params;
  // Super Admin and Admin only; a role that may not see CVs is sent away rather than shown an error panel.
  const user=await getAdmin();
  if(!user)redirect(`/${locale}/admin`);
  const language=locale==='bn'?'bn':'en';
  const digits=await dashboardDigits(user.id);
  const t=await getTranslations('teacherCvs');
  const query=await searchParams;
  const checked=teacherListQuery({...query,review:'',from:'',to:''});
  const needId=(query.need||'').trim();
  const page=Math.max(1,Number(query.page)||1);
  const now=new Date();
  const [result,needs,matched,sms]=await Promise.all([
    needId?Promise.resolve(null):listCandidates({...checked,page,perPage:25},now),
    listNeeds(),
    needId?needMatches(needId,50,now):Promise.resolve([]),
    teacherSmsDialogData(),
  ]);
  const need=needs.find(entry=>entry.id===needId)||null;
  const view=result?candidateListView(result):null;
  const rows=(need?matched.map(candidateRowView):view?.rows)||[];
  const total=need?rows.length:(view?.total||0);
  const smsRows=rows.map(row=>({id:row.id,name:row.name,hasPhone:row.phones.length>0}));
  const active=[checked.subject,checked.classLevel,checked.shift,checked.status,checked.rating,checked.availability,checked.q].filter(Boolean).length;
  const queryRecord:Record<string,string>={};
  for(const [key,value] of Object.entries(checked))if(value)queryRecord[key]=String(value);

  return <>
    <div className="admin-heading">
      <div><h1>{t('findTitle')}</h1><p>{t('findDesc')}</p></div>
      <div className="list-row-actions"><Link className="admin-mini-button" href="/admin/teacher-cvs">{t('backToList')}</Link></div>
    </div>

    <CvNeedForm digits={digits}/>

    <section className="admin-panel" aria-label={t('needs.title')}>
      <div className="admin-panel-head">
        <h2>{t('needs.title')}</h2>
        <span className="admin-help" data-cv-needs-count="">{formatNumber(needs.length,digits)}</span>
      </div>
      <div className="admin-panel-body">
        {needs.length
          ?<ul className="cv-needs" data-cv-needs="">{needs.map(entry=>(
            <CvNeedRow key={entry.id} need={entry} digits={digits} matchesHref={`/admin/teacher-cvs/find?need=${entry.id}`}/>))}</ul>
          :<p className="admin-help" data-cv-needs-empty="">{t('needs.empty')}</p>}
      </div>
    </section>

    <details className="admin-help-panel" open={active>0||undefined}>
      <summary className="admin-mini-button">{t('filters.title')}{active?` · ${formatNumber(active,digits)}`:''}</summary>
      <form method="get" className="list-filter" data-cv-find-filters="">
        <label>{t('filters.subject')}<select className="admin-select" name="subject" defaultValue={checked.subject} data-cv-find-subject="">
          <option value="">{t('filters.all')}</option>
          {TEACHER_SUBJECTS.map(option=><option key={option} value={option}>{subjectLabel(t,option)}</option>)}
        </select></label>
        <label>{t('filters.classLevel')}<select className="admin-select" name="classLevel" defaultValue={checked.classLevel} data-cv-find-class="">
          <option value="">{t('filters.all')}</option>
          {TEACHER_CLASS_LEVELS.map(option=><option key={option} value={option}>{formatNumber(Number(option),digits)}</option>)}
        </select></label>
        <label>{t('filters.shift')}<select className="admin-select" name="shift" defaultValue={checked.shift} data-cv-find-shift="">
          <option value="">{t('filters.all')}</option>
          {TEACHER_SHIFTS.map(option=><option key={option} value={option}>{shiftLabel(t,option)}</option>)}
        </select></label>
        <label>{t('filters.status')}<select className="admin-select" name="status" defaultValue={checked.status}>
          <option value="">{t('filters.all')}</option>
          {TEACHER_STATUSES.map(option=><option key={option} value={option}>{statusLabel(t,option)}</option>)}
        </select></label>
        <label>{t('filters.rating')}<select className="admin-select" name="rating" defaultValue={checked.rating}>
          <option value="">{t('filters.all')}</option>
          {TEACHER_RATINGS.map(option=><option key={option} value={option}>{ratingLabel(t,option)}</option>)}
        </select></label>
        <label>{t('filters.availability')}
          <input className="admin-input" name="availability" defaultValue={checked.availability} placeholder={t('filters.availabilityPlaceholder')} data-cv-find-availability=""/>
        </label>
        <label>{t('fields.university')}
          <input className="admin-input" type="search" name="q" defaultValue={checked.q} placeholder={t('filters.qPlaceholder')} data-cv-find-q=""/>
        </label>
        <div className="cv-form-foot">
          <button type="submit" className="button button-navy" data-cv-find-apply=""><Search size={16} aria-hidden="true"/>{t('filters.apply')}</button>
          <Link className="admin-mini-button" href="/admin/teacher-cvs/find">{t('filters.reset')}</Link>
        </div>
      </form>
    </details>

    {need&&<p className="admin-feedback" role="status" data-cv-need-open="">
      {need.subject?subjectLabel(t,need.subject):t('filters.all')}
      {need.classLevels.length>0?` · ${need.classLevels.map(level=>formatNumber(Number(level),digits)).join(', ')}`:''}
      {need.shift?` · ${shiftLabel(t,need.shift)}`:''}
      {need.note?` · ${need.note}`:''} — {rows.length>0?t('needs.matches',{count:formatNumber(rows.length,digits)}):t('needs.matchesNone')}
    </p>}

    <CvSmsPicker rows={smsRows} kit={sms} digits={digits} language={language}>
      <section className="admin-panel list-panel">
        <div className="admin-panel-head">
          <h2>{need?t('needs.showMatches'):t('findTitle')}</h2>
          <span className="admin-help" data-cv-find-total="">{t('total',{count:formatNumber(total,digits)})}</span>
          <CvSmsBar digits={digits}/>
        </div>
        {rows.length?<div className="admin-table-wrap"><table className="admin-table admin-responsive-table" data-cv-find-rows="">
          <thead><tr>
            <th>{t('select')}</th><th>{t('columns.name')}</th><th>{t('columns.subjects')}</th>
            <th>{t('columns.free')}</th><th>{t('columns.contact')}</th><th>{t('columns.rating')}</th>
            <th>{t('columns.actions')}</th>
          </tr></thead>
          <tbody>{rows.map(row=>(
            <tr key={row.id} data-cv-row="" data-status={row.status}>
              <td data-label={t('select')}><CvSmsCheck row={{id:row.id,name:row.name,hasPhone:row.phones.length>0}} noPhone={t('noPhone')}/></td>
              <td data-label={t('columns.name')}><div>
                <strong>{row.name}</strong>
                <br/><span className="admin-help">{row.candidateId}</span>
                {row.university&&<><br/><span className="admin-help">{row.university}</span></>}
                {row.department&&<><br/><span className="admin-help">{row.department}</span></>}
              </div></td>
              <td data-label={t('columns.subjects')}><div>
                {row.subjects.length?row.subjects.map(subject=>subjectLabel(t,subject)).join(' · '):t('noSubjectRead')}
                {row.subjectsText&&<><br/><span className="admin-help">{row.subjectsText}</span></>}
                {row.classLevels.length>0&&<><br/><span className="admin-help">{t('columns.classes')}: {row.classLevels.map(level=>formatNumber(Number(level),digits)).join(', ')}</span></>}
              </div></td>
              <td data-label={t('columns.free')}><div>
                {row.availabilityText||'—'}
                {row.shifts.length>0&&<><br/><span className="admin-help">{row.shifts.map(shift=>shiftLabel(t,shift)).join(' · ')}</span></>}
                {row.expectedSalary!==null&&<><br/><span className="admin-help">{t('columns.salary')}: {formatNumber(row.expectedSalary,digits)}</span></>}
              </div></td>
              <td data-label={t('columns.contact')}><div className="lead-row">
                {row.phones.length?row.phones.map((phone,index)=><span key={index} className="list-row-actions">
                  {/* The mask is what is printed; the number exists only as a dial or WhatsApp destination. */}
                  <span className="admin-badge" data-cv-mask="">{phone.masked}</span>
                  <a className="admin-mini-button" href={phone.tel} data-cv-call=""><Phone size={15} aria-hidden="true"/>{t('call')}</a>
                  <a className="admin-mini-button" href={phone.whatsapp} target="_blank" rel="noreferrer" data-cv-whatsapp=""><MessageCircle size={15} aria-hidden="true"/>{t('whatsapp')}</a>
                </span>):<span className="admin-help">{t('noPhone')}</span>}
              </div></td>
              <td data-label={t('columns.rating')}><div className="list-row-actions">
                <span className={`admin-badge ${statusBadge(row.status)}`} data-cv-status="">{statusLabel(t,row.status)}</span>
                <span className={`admin-badge ${ratingBadge(row.rating)}`} data-cv-rating="">{ratingLabel(t,row.rating)}</span>
                <br/><span className="admin-help">{formatDate(row.receivedDate,digits,language)}</span>
              </div></td>
              <td data-label={t('columns.actions')}><div className="lead-row">
                <div className="list-row-actions">
                  <CvDetailDrawer seed={{id:row.id,candidateId:row.candidateId,name:row.name}} language={language} digits={digits} kit={sms}/>
                </div>
                <CvRowControls row={row} kit={sms} language={language}/>
              </div></td>
            </tr>))}
          </tbody>
        </table></div>:<div className="admin-empty" data-cv-empty="">
          <p>{active||need?t('emptyFilter'):t('empty')}</p>
          <span className="admin-help">{t('emptyHelp')}</span>
        </div>}
        <div className="admin-panel-body">
          {view
            ?<Pagination path="/admin/teacher-cvs/find" page={view.page} totalPages={view.pages} query={queryRecord} digits={digits}/>
            :<Link className="admin-mini-button" href="/admin/teacher-cvs/find">{t('filters.reset')}</Link>}
          <p className="admin-help">{t('sms.hint')}</p>
        </div>
      </section>
    </CvSmsPicker>
  </>;
}
