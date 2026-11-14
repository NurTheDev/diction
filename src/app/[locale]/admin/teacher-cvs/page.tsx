import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {redirect} from 'next/navigation';
import {MessageCircle,Phone,Search} from 'lucide-react';
import {getAdmin} from '@/lib/admin/guard';
import {dashboardDigits} from '@/lib/admin/digits';
import {pageNumber} from '@/lib/admin/helpers';
import {formatDate,formatNumber} from '@/lib/admin/format';
import {isNumberAttempt} from '@/lib/leads/lead-phone';
import {candidateStatusCounts,listCandidates,reviewCount} from '@/lib/teachers/candidates';
import {teacherSmsDialogData} from '@/lib/center/sms-dialog-data';
import {
  TEACHER_CLASS_LEVELS,TEACHER_RATINGS,TEACHER_SHIFTS,TEACHER_SOURCES,TEACHER_STATUSES,TEACHER_SUBJECTS,
  teacherListQuery,
} from '@/lib/teachers/vocab';
import {
  candidateListView,ratingBadge,ratingLabel,shiftLabel,statusBadge,statusLabel,subjectLabel,
} from '@/lib/teachers/cv-ui';
import {Pagination} from '@/components/admin/pagination';
import {CvDetailDrawer,CvQuickAdd,CvRowControls,CvSmsBar,CvSmsCheck,CvSmsPicker} from '@/components/admin/teacher-cvs-ui';

type Query={q?:string;status?:string;rating?:string;source?:string;shift?:string;subject?:string;classLevel?:string;
  availability?:string;review?:string;from?:string;to?:string;page?:string;new?:string};

/**
 * R4 · The teacher CV bank.
 *
 * The screen that replaces the pile of PDFs and the sheet nobody updates: every CV the centre has
 * received, with the sheet's own words kept beside the reading, the status and rating an operator gave
 * it, and the timeline of what was said about it. Three decisions are visible in the layout:
 *
 *   • **Quick add is one tap away and saves on Enter**, because a CV arrives by hand at the front desk
 *     and the person holding it is standing there.
 *   • **A CV older than a year is counted out loud at the top**, and nothing is deleted for it: the brief
 *     asks for a reminder, and the Recycle Bin is the only door out.
 *   • **A number is printed as a mask and dialed from a `tel:` link.** The search box refuses a
 *     phone-shaped search for the same reason the Visitors list does — a number in a URL is a number in
 *     browser history, in `Referer` and in every log between here and the proxy. The drawer answers
 *     "is this number already on file" instead, which is the question behind it.
 *
 * Nothing here queries `TeacherCandidate`: rows, counts and refusals all come from
 * `src/lib/teachers/candidates.ts`, so this page cannot disagree with the rule layer, the importer or a
 * bulk SMS.
 */
export default async function TeacherCvs({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<Query>}){
  const {locale}=await params;
  /**
   * Super Admin and Admin only, and a role that may not see CVs is sent away rather than shown an error
   * panel: `requireAdmin()` throws, and what catches a throw here is `admin/error.tsx`, which tells an
   * owner to look at the database when the real answer is the role. Teachers have no CV access at all.
   * The ACTIONS keep `requireAdmin()` — an action answers the form that called it and has nowhere to send
   * anybody, so it throws and the form says no.
   */
  const user=await getAdmin();
  if(!user)redirect(`/${locale}/admin`);
  const language=locale==='bn'?'bn':'en';
  const digits=await dashboardDigits(user.id);
  const t=await getTranslations('teacherCvs');
  const query=await searchParams;

  // A phone-shaped search never reaches a URL, so it never reaches the query either.
  const rawQ=(query.q||'').trim().slice(0,80);
  const refusedPhone=!!rawQ&&isNumberAttempt(rawQ);
  const checked=teacherListQuery({...query,q:refusedPhone?'':rawQ,page:undefined});
  const page=pageNumber(query.page);
  const now=new Date();
  const [result,counts,review]=await Promise.all([
    listCandidates({...checked,page,perPage:20},now),
    candidateStatusCounts(),
    reviewCount(now),
  ]);
  const view=candidateListView(result);
  /** The CV bank is admin-only, so the SMS kit is loaded for whoever can read this page at all. */
  const sms=await teacherSmsDialogData();
  const smsRows=view.rows.map(row=>({id:row.id,name:row.name,hasPhone:row.phones.length>0}));
  const activeFilters=[checked.status,checked.rating,checked.source,checked.shift,checked.subject,checked.classLevel,
    checked.availability,checked.review,checked.from,checked.to,checked.q].filter(Boolean).length;
  const queryRecord:Record<string,string>={};
  for(const [key,value] of Object.entries({...checked,page:undefined}))if(value)queryRecord[key]=String(value);
  const href=(overrides:Record<string,string|undefined>):string=>{
    const next=new URLSearchParams();
    for(const [key,value] of Object.entries({...queryRecord,...overrides}))if(value)next.set(key,value);
    const text=next.toString();
    return text?`/admin/teacher-cvs?${text}`:'/admin/teacher-cvs';
  };
  const everyCv=counts.reduce((sum,entry)=>sum+entry.count,0);

  return <>
    <div className="admin-heading">
      <div>
        <h1>{t('title')}</h1>
        <p>{t('desc')}</p>
      </div>
      <div className="list-row-actions">
        <Link className="admin-mini-button" href="/admin/teacher-cvs/find">{t('find')}</Link>
        <Link className="admin-mini-button" href="/admin/teacher-cvs/import">{t('importButton')}</Link>
      </div>
    </div>

    {review>0
      ?<p className="admin-feedback cv-review" role="status" data-cv-review="">{t('reviewBanner',{count:formatNumber(review,digits)})}</p>
      :<p className="admin-help" data-cv-review="none">{t('reviewNone')}</p>}

    <div className="lead-tools">
      <CvQuickAdd open={query.new==='1'} digits={digits} language={language}/>
      {/* A GET form for words that are safe in a URL — name, university, id, tag — and a refusal for a
          number, printed where the operator can read why. */}
      <form method="get" className="list-filter cv-search" aria-label={t('filters.q')}>
        <label>{t('filters.q')}
          <input className="admin-input" type="search" name="q" defaultValue={refusedPhone?'':rawQ} placeholder={t('filters.qPlaceholder')} data-cv-search=""/>
        </label>
        <button type="submit" className="button button-navy"><Search size={16} aria-hidden="true"/>{t('filters.apply')}</button>
        {checked.status&&<input type="hidden" name="status" value={checked.status}/>}
        {refusedPhone&&<p className="admin-feedback error" role="alert">{t('searchNumberHelp')}</p>}
      </form>
    </div>

    <nav className="lead-chips cv-chips-nav" aria-label={t('fields.status')}>
      <Link href={href({status:undefined})} className={checked.status?'':'selected'}>{t('filters.all')} <span>{formatNumber(everyCv,digits)}</span></Link>
      {counts.map(entry=><Link key={entry.status} href={href({status:entry.status})} className={checked.status===entry.status?'selected':''} data-cv-chip={entry.status}>
        {statusLabel(t,entry.status)} <span>{formatNumber(entry.count,digits)}</span>
      </Link>)}
    </nav>

    <details className="admin-help-panel" open={activeFilters>1||undefined}>
      <summary className="admin-mini-button">{t('filters.title')}{activeFilters?` · ${formatNumber(activeFilters,digits)}`:''}</summary>
      <form method="get" className="list-filter" data-cv-filters="">
        {checked.q&&!refusedPhone&&<input type="hidden" name="q" value={checked.q}/>}
        <label>{t('filters.status')}<select className="admin-select" name="status" defaultValue={checked.status} data-cv-filter-status="">
          <option value="">{t('filters.all')}</option>
          {TEACHER_STATUSES.map(option=><option key={option} value={option}>{statusLabel(t,option)}</option>)}
        </select></label>
        <label>{t('filters.rating')}<select className="admin-select" name="rating" defaultValue={checked.rating} data-cv-filter-rating="">
          <option value="">{t('filters.all')}</option>
          {TEACHER_RATINGS.map(option=><option key={option} value={option}>{ratingLabel(t,option)}</option>)}
        </select></label>
        <label>{t('filters.subject')}<select className="admin-select" name="subject" defaultValue={checked.subject} data-cv-filter-subject="">
          <option value="">{t('filters.all')}</option>
          {TEACHER_SUBJECTS.map(option=><option key={option} value={option}>{subjectLabel(t,option)}</option>)}
        </select></label>
        <label>{t('filters.classLevel')}<select className="admin-select" name="classLevel" defaultValue={checked.classLevel} data-cv-filter-class="">
          <option value="">{t('filters.all')}</option>
          {TEACHER_CLASS_LEVELS.map(option=><option key={option} value={option}>{formatNumber(Number(option),digits)}</option>)}
        </select></label>
        <label>{t('filters.shift')}<select className="admin-select" name="shift" defaultValue={checked.shift}>
          <option value="">{t('filters.all')}</option>
          {TEACHER_SHIFTS.map(option=><option key={option} value={option}>{shiftLabel(t,option)}</option>)}
        </select></label>
        <label>{t('filters.source')}<select className="admin-select" name="source" defaultValue={checked.source}>
          <option value="">{t('filters.all')}</option>
          {TEACHER_SOURCES.map(option=><option key={option} value={option}>{t(`sourceLabels.${option}`)}</option>)}
        </select></label>
        <label>{t('filters.availability')}
          <input className="admin-input" name="availability" defaultValue={checked.availability} placeholder={t('filters.availabilityPlaceholder')} data-cv-filter-availability=""/>
        </label>
        <label>{t('filters.from')}<input className="admin-input" type="date" name="from" defaultValue={checked.from}/></label>
        <label>{t('filters.to')}<input className="admin-input" type="date" name="to" defaultValue={checked.to}/></label>
        <label className="admin-check"><input type="checkbox" name="review" value="old" defaultChecked={checked.review==='old'}/>
          <span>{t('filters.review')}</span></label>
        <div className="cv-form-foot">
          <button type="submit" className="button button-navy">{t('filters.apply')}</button>
          <Link className="admin-mini-button" href="/admin/teacher-cvs">{t('filters.reset')}</Link>
        </div>
      </form>
    </details>

    <CvSmsPicker rows={smsRows} kit={sms} digits={digits} language={language}>
      <section className="admin-panel list-panel">
        <div className="admin-panel-head">
          <h2>{t('title')}</h2>
          <span className="admin-help" data-cv-total="">{t('total',{count:formatNumber(result.total,digits)})}</span>
          <CvSmsBar digits={digits}/>
        </div>
        {view.rows.length?<div className="admin-table-wrap"><table className="admin-table admin-responsive-table">
          <thead><tr>
            <th>{t('select')}</th><th>{t('columns.received')}</th><th>{t('columns.name')}</th>
            <th>{t('columns.subjects')}</th><th>{t('columns.contact')}</th><th>{t('columns.status')}</th>
            <th>{t('columns.actions')}</th>
          </tr></thead>
          <tbody>{view.rows.map(row=>{
            const pick={id:row.id,name:row.name,hasPhone:row.phones.length>0};
            return <tr key={row.id} data-cv-row="" data-status={row.status}>
              <td data-label={t('select')}><CvSmsCheck row={pick} noPhone={t('noPhone')}/></td>
              <td data-label={t('columns.received')}>
                <time dateTime={row.receivedDate}>{formatDate(row.receivedDate,digits,language)}</time>
                {row.review&&<><br/><span className="admin-badge pending">{t('reviewBadge')}</span></>}
              </td>
              <td data-label={t('columns.name')}><div>
                <strong>{row.name}</strong>
                <br/><span className="admin-help">{row.candidateId}</span>
                {row.university&&<><br/><span className="admin-help">{row.university}</span></>}
                {row.department&&<><br/><span className="admin-help">{row.department}</span></>}
                {row.hired&&<><br/><span className="admin-badge enabled">{t('drawer.hiredAs')}</span></>}
              </div></td>
              <td data-label={t('columns.subjects')}><div>
                {row.subjects.length?row.subjects.map(subject=>subjectLabel(t,subject)).join(' · '):t('noSubjectRead')}
                {row.classLevels.length>0&&<><br/><span className="admin-help">{t('columns.classes')}: {row.classLevels.map(level=>formatNumber(Number(level),digits)).join(', ')}</span></>}
                {row.availabilityText&&<><br/><span className="admin-help">{t('columns.free')}: {row.availabilityText}</span></>}
                {row.expectedSalary!==null&&<><br/><span className="admin-help">{t('columns.salary')}: {formatNumber(row.expectedSalary,digits)}</span></>}
              </div></td>
              <td data-label={t('columns.contact')}><div className="lead-row">
                {row.phones.length?row.phones.map((phone,index)=><span key={index} className="list-row-actions">
                  {/* The mask is what is printed; the number exists only as a dial or WhatsApp destination,
                      which is the one place the brief allows it. */}
                  <span className="admin-badge" data-cv-mask="">{phone.masked}</span>
                  <a className="admin-mini-button" href={phone.tel} data-cv-call=""><Phone size={15} aria-hidden="true"/>{t('call')}</a>
                  <a className="admin-mini-button" href={phone.whatsapp} target="_blank" rel="noreferrer" data-cv-whatsapp=""><MessageCircle size={15} aria-hidden="true"/>{t('whatsapp')}</a>
                </span>):<span className="admin-help">{t('noPhone')}</span>}
                {row.email&&<span className="admin-help">{row.email}</span>}
              </div></td>
              <td data-label={t('columns.status')}><div className="list-row-actions">
                <span className={`admin-badge ${statusBadge(row.status)}`} data-cv-status="">{statusLabel(t,row.status)}</span>
                <span className={`admin-badge ${ratingBadge(row.rating)}`} data-cv-rating="">{ratingLabel(t,row.rating)}</span>
                {row.interviewAt&&<><br/><span className="admin-help">{formatDate(row.interviewAt,digits,language)}</span></>}
                {row.lastNote&&<><br/><span className="admin-help">{t('drawer.lastNote')}: {row.lastNote.text}</span></>}
              </div></td>
              <td data-label={t('columns.actions')}><div className="lead-row">
                <div className="list-row-actions">
                  <CvDetailDrawer seed={{id:row.id,candidateId:row.candidateId,name:row.name}} language={language} digits={digits} kit={sms}/>
                </div>
                <CvRowControls row={row} kit={sms} language={language}/>
              </div></td>
            </tr>;
          })}</tbody>
        </table></div>:<div className="admin-empty" data-cv-empty="">
          <p>{activeFilters||checked.q?t('emptyFilter'):t('empty')}</p>
          <span className="admin-help">{t('emptyHelp')}</span>
        </div>}
        <div className="admin-panel-body">
          <Pagination path="/admin/teacher-cvs" page={view.page} totalPages={view.pages} query={queryRecord} digits={digits}/>
          <p className="admin-help">{t('drawer.binHint')}</p>
        </div>
      </section>
    </CvSmsPicker>
  </>;
}
