import mongoose from 'mongoose';
import {notFound} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {requireAdminPage} from '@/lib/admin/guard';
import {CenterClassGroup,CenterStudent} from '@/models/CenterRecords';
import {CenterStudentForm} from '@/components/admin/center-forms';
import {CenterStudentList} from '@/components/admin/center-student-list';
import {searchCenterStudents} from '@/actions/center-students';
import {smsDialogData} from '@/lib/center/sms-dialog-data';
import {dashboardDigits} from '@/lib/admin/digits';
import {dhakaCalendar} from '@/lib/center/month-status';
import {liveClassDues} from '@/lib/center/dues-query';
import {formatNumber} from '@/lib/admin/format';
export const dynamic='force-dynamic';
type Group={_id:mongoose.Types.ObjectId;name:{bn:string;en?:string};academicYear:number;shift?:string;
  active:boolean;monthlyFee?:number;updatedAt:Date};
type RollRow={feeHistory:{amount:number}[]};

/**
 * Group 3 · the classroom hub: one class, one page.
 *
 * Before this, a class was a row on a list and everything about it lived somewhere else — the roll on
 * the students screen behind a filter, the money on the dues screen behind a picker, the enrollment
 * form on a third page that had to be told which class again. The owner's question is never "show me
 * the students list", it is "how is Class Nine going?", so the class gets a page that answers it:
 * who is on it, what a month costs, who owes, and the two things done most often — enroll somebody and
 * take their fee — one click away.
 *
 * The roll below is the same list component the Students screen runs, scoped to this class: the row
 * keeps its Edit, its Take payment, its Hold and its Remove-behind-a-question, and a fix to any of them
 * fixes both screens. The header's numbers are read live, never stored twice: the fee comes from the
 * class when the class has one and from the roll when it does not, and the dues come from the same
 * engine the dues screen reads.
 */
export default async function ClassHub({params}:{params:Promise<{locale:string;id:string}>}){
  const admin=await requireAdminPage(),{locale,id}=await params,bn=locale==='bn',digits=await dashboardDigits(admin.id);
  const t=await getTranslations('center');
  if(!mongoose.isValidObjectId(id))notFound();
  const group=await CenterClassGroup.findById(id).lean<Group|null>();
  if(!group)notFound();
  const {year,month,day}=dhakaCalendar(new Date());
  const today=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const canManage=admin.role==='admin'||admin.role==='superadmin';
  const [active,onHold,roll,sms,list]=await Promise.all([
    CenterStudent.countDocuments({classGroup:id,status:'active'}),
    CenterStudent.countDocuments({classGroup:id,status:'on_hold'}),
    CenterStudent.find({classGroup:id,status:'active'}).select('feeHistory').limit(500).lean<RollRow[]>(),
    smsDialogData(),
    searchCenterStudents({q:'',classId:id,status:'',page:1}),
  ]);
  /* What a month of this class costs: the class's own amount when the owner has set one, otherwise the
     amount most of the roll is already on — the number a phone call about this class would quote. */
  const counted=new Map<number,number>();
  for(const student of roll){
    const amount=student.feeHistory.length?Number(student.feeHistory[student.feeHistory.length-1].amount):0;
    if(amount>0)counted.set(amount,(counted.get(amount)||0)+1);
  }
  let fee=Number(group.monthlyFee)||0,best=0;
  if(!fee)for(const [amount,count] of counted)if(count>best){fee=amount;best=count}
  let owed=0,owing=0,duesFailed=false;
  try{const live=await liveClassDues(id);owed=live.total;owing=live.rows.length}catch{duesFailed=true}
  const name=(bn?group.name.bn:group.name.en)||group.name.bn;
  const choice={id:String(group._id),name,year:group.academicYear,shift:group.shift||''};
  return <>
    <div className="admin-heading" data-class-hub={String(group._id)}>
      <div>
        <Link href="/admin/students/classes" className="text-link">← {t('hub.crumb')}</Link>
        <h1 data-class-name>{name}</h1>
        <p className="admin-help" data-class-meta>
          {group.shift||t('hub.noShift')} · {formatNumber(group.academicYear,digits)} · {group.active?t('hub.active'):t('hub.archived')}
        </p>
      </div>
      <div className="center-student-actions">
        <Link href={`/admin/students/collect`} className="button button-navy" data-class-collect>{t('hub.collectFee')}</Link>
        <details className="admin-more admin-page-more" data-class-more>
          <summary>{t('hub.more')}</summary>
          <div className="admin-more-body">
            <Link href={`/admin/students/dues?class=${String(group._id)}`}>{t('hub.dueList')}</Link>
            <Link href="/admin/center-exams">{t('hub.exams')}</Link>
            <Link href={`/admin/center-exams/marksheet?class=${String(group._id)}`}>{t('hub.marksheet')}</Link>
            <Link href="/admin/students">{t('hub.allStudents')}</Link>
          </div>
        </details>
      </div>
    </div>

    <dl className="admin-kpis" data-class-kpis>
      <div><dt>{t('hub.enrolled')}</dt><dd data-class-enrolled>{formatNumber(active,digits)}</dd></div>
      <div><dt>{t('hub.onHold')}</dt><dd data-class-held>{formatNumber(onHold,digits)}</dd></div>
      <div><dt>{t('hub.monthlyFee')}</dt><dd data-class-fee>{fee>0?formatNumber(fee,digits):t('hub.feeUnknown')}</dd></div>
      <div><dt>{t('hub.owing')}</dt><dd data-class-owing>{duesFailed?t('hub.duesUnknown'):formatNumber(owing,digits)}</dd></div>
      <div><dt>{t('hub.totalDue')}</dt><dd data-class-due>{duesFailed?t('hub.duesUnknown'):formatNumber(owed,digits)}</dd></div>
    </dl>
    {duesFailed&&<p className="admin-help" data-class-dues-note>{t('hub.duesNote')}</p>}

    {/* Enrollment, already standing in this class: the operator does not choose the class twice. */}
    <details className="admin-panel center-class-box" data-class-enroll>
      <summary><strong>+ {t('hub.addStudent')}</strong></summary>
      <div className="admin-panel-body">
        <p className="admin-help">{t('hub.addStudentHelp',{name})}</p>
        <CenterStudentForm classes={[choice]} presetClassId={String(group._id)} year={year} month={month} today={today} digits={digits}/>
      </div>
    </details>

    <CenterStudentList initial={list} classes={[choice]} digits={digits} sms={sms}
      canManage={canManage} maySendSms={canManage} lockClassId={String(group._id)}/>
  </>;
}
