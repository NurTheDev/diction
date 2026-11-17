import mongoose from 'mongoose';
import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {requireAdminPage} from '@/lib/admin/guard';
import {CenterClassGroup,CenterDueSnapshot} from '@/models/CenterRecords';
import {DueSnapshotForm} from '@/components/admin/center-due-snapshot';
import {liveClassDues,liveClassDueSummary,type ClassDueSummaryRow} from '@/lib/center/dues-query';
import SmsDialogHost from '@/components/admin/sms-dialog-host';
import {dashboardDigits} from '@/lib/admin/digits';
import {formatNumber} from '@/lib/admin/format';
export const dynamic='force-dynamic';
type Group={_id:mongoose.Types.ObjectId;name:{bn:string;en:string};academicYear:number;shift?:string};
export default async function Dues({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{class?:string}>}){const ts=await getTranslations('sms'),t=await getTranslations('dues');const actor=await requireAdminPage();const {locale}=await params,q=await searchParams,bn=locale==='bn',digits=await dashboardDigits(actor.id),groups=await CenterClassGroup.find({active:true}).select('name academicYear shift').sort({academicYear:-1,order:1}).limit(200).lean<Group[]>(),selected=groups.find(g=>String(g._id)===q.class);let snapshots:{_id:mongoose.Types.ObjectId;takenAt:Date;rows:{amountDue:number}[]}[]=[];let data:Awaited<ReturnType<typeof liveClassDues>>|undefined,error=false;if(selected)try{data=await liveClassDues(String(selected._id));snapshots=await CenterDueSnapshot.find({classGroup:selected._id}).select('takenAt rows.amountDue').sort({takenAt:-1}).limit(20).lean<typeof snapshots>()}catch{error=true}
/* Group 3 · the All-Class Due Summary: what the whole centre is owed, one line per class, before the
     picker that opens one class. It is read once for the page rather than once per class, and a class
     the engine could not read all the way says so instead of showing a total that is quietly short. */
  let summary:{rows:ClassDueSummaryRow[];total:number;asOf:Date}|null=null,summaryFailed=false;
  try{summary=await liveClassDueSummary()}catch{summaryFailed=true}
  return <><div className="admin-heading"><div><Link href="/admin/students" className="text-link">← {t('list.crumb.students')}</Link><h1>{t('list.title')}</h1><p>{t('list.legacyNote')}</p></div></div><section className="admin-panel" data-dues-summary><div className="admin-panel-head"><h2>{t('summary.title')}</h2>{summary&&<span data-dues-summary-total>{formatNumber(summary.total,digits)} {t('list.takaUnit')}</span>}</div><div className="admin-panel-body">
      <p className="admin-help">{t('summary.help')}</p>
      {summaryFailed&&<p className="admin-feedback error" role="alert">{t('summary.failed')}</p>}
      {summary&&summary.rows.length>0&&<div className="admin-table-wrap"><table className="admin-table" data-dues-summary-table>
        <caption className="admin-help">{t('summary.caption')}</caption>
        <thead><tr><th scope="col">{t('summary.col.class')}</th><th scope="col">{t('summary.col.active')}</th><th scope="col">{t('summary.col.owing')}</th><th scope="col">{t('summary.col.fee')}</th><th scope="col">{t('summary.col.total')}</th><th scope="col">{t('summary.col.action')}</th></tr></thead>
        <tbody>{summary.rows.map(row=><tr key={row.classId} data-dues-summary-row={row.classId}>
          <th scope="row"><Link href={`/admin/students/classes/${row.classId}`} className="text-link">{(bn?row.name.bn:row.name.en)||row.name.bn}</Link><br/><small>{row.shift?`${row.shift} · `:''}{formatNumber(row.academicYear,digits)}</small></th>
          <td>{formatNumber(row.active,digits)}</td>
          <td>{formatNumber(row.owing,digits)}</td>
          <td>{row.monthlyFee>0?formatNumber(row.monthlyFee,digits):'—'}</td>
          <td>{formatNumber(row.total,digits)}{row.partial&&<small> · {t('summary.partial')}</small>}</td>
          <td><Link href={`/admin/students/dues?class=${row.classId}`} className="admin-mini-button" data-dues-summary-view={row.classId}>{t('summary.viewClass')}</Link></td>
        </tr>)}</tbody>
      </table></div>}
      {summary&&!summary.rows.length&&!summaryFailed&&<p className="admin-empty">{t('summary.none')}</p>}
    </div></section>
    <section className="admin-panel"><div className="admin-panel-body"><form method="get" className="admin-filter"><label>{t('list.classLabel')} {/* Group 3: the summary's "open this class" link arrives here with the class
            in the address, and a `defaultValue` is a word for the mount only — on a same-route navigation
            React keeps the box it already painted and the picker would sit empty above the very list it
            names. A key that changes with the address makes the box the page the address describes. */}
          <select name="class" className="admin-select" required key={selected?String(selected._id):'none'} defaultValue={selected?String(selected._id):''}><option value="">{t('list.chooseClass')}</option>{groups.map(g=><option key={String(g._id)} value={String(g._id)}>{(bn?g.name.bn:g.name.en)||g.name.bn} {g.shift||''} · {formatNumber(g.academicYear,digits)}</option>)}</select></label><button className="button button-navy">{t('list.show')}</button></form><p className="admin-help">{t('list.windowNote')}</p></div></section>{selected&&<section className="admin-panel"><div className="admin-panel-head"><h2>{t('list.overdueHeading')}</h2>{data&&<div><span>{formatNumber(data.rows.length,digits)} {t('list.studentsUnit')} · {formatNumber(data.total,digits)} {t('list.takaUnit')}</span> <a className="admin-mini-button" href={`/api/admin/center/dues-export?class=${selected._id}`}>{t('list.downloadCsv')}</a> {data.rows.length>0&&<SmsDialogHost request={{source:'dues',classGroup:String(selected._id)}} title={ts('titles.dues')} label={ts('labels.reminder')} defaultTemplateKey="due_reminder"/>}</div>}</div>{error?<p className="admin-empty" role="alert">{t('list.partialNote')}</p>:data&&<><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t('list.studentColumn')}</th><th>{t('list.monthsColumn')}</th><th>{t('list.totalColumn')}</th></tr></thead><tbody>{data.rows.map(r=><tr key={String(r.student._id)}><td><Link href={`/admin/students/${r.student._id}`} className="text-link">{(bn?r.student.name.bn:r.student.name.en)||r.student.name.bn}</Link><br/><small>{r.student.studentId}</small></td><td>{r.months.map(m=>`${formatNumber(m.month,digits)}/${formatNumber(m.year,digits)}: ${formatNumber(m.due,digits)}`).join(' · ')}</td><td>{formatNumber(r.total,digits)}</td></tr>)}</tbody></table></div>{!data.rows.length&&<p className="admin-empty">{t('list.none')}</p>}<div style={{padding:'1rem'}}><DueSnapshotForm classId={String(selected._id)} enabled={process.env.CENTER_DUE_SNAPSHOT_WRITE_ENABLED==='true'} /><h3>{t('list.snapshotsHeading')}</h3>{snapshots.map(s=><div key={String(s._id)}><Link href={`/admin/students/dues/snapshot/${s._id}`} className="text-link">{new Intl.DateTimeFormat(bn?'bn-BD':'en-GB',{timeZone:'Asia/Dhaka',dateStyle:'medium',timeStyle:'short'}).format(s.takenAt)}</Link> · {formatNumber(s.rows.length,digits)} {t('list.studentsUnit')}</div>)}</div><p className="admin-help" style={{padding:'1rem'}}>{t('list.timezoneNote')}</p></>}</section>}</>}
