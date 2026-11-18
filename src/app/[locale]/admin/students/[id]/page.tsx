import {getTranslations} from 'next-intl/server';
import {notFound} from 'next/navigation';
import mongoose from 'mongoose';
import {Link} from '@/i18n/navigation';
import {requireAdminPage} from '@/lib/admin/guard';
import {CenterClassGroup,CenterStudent} from '@/models/CenterRecords';
import {dashboardDigits} from '@/lib/admin/digits';
import {formatDate,formatDigits,formatNumber} from '@/lib/admin/format';
import {dhakaCalendar} from '@/lib/center/month-status';
import {CenterStudentForm} from '@/components/admin/center-forms';
import {StudentRemoveButton,StudentStatusChip} from '@/components/admin/student-profile-actions';
import {StudentFeeButton,StudentTransferButton} from '@/components/admin/student-money-doors';import {AdminStudentResults} from '@/components/exams/admin-student-results';import SmsDialogHost from '@/components/admin/sms-dialog-host';import {loadCashStudent} from '@/actions/center-daily';import {PaymentHistory} from '@/components/admin/center-payment-history';
export const dynamic='force-dynamic';
export default async function StudentProfile({params,searchParams}:{params:Promise<{locale:string;id:string}>;searchParams:Promise<{edit?:string;tab?:string;year?:string;report?:string}>}){const ts=await getTranslations('sms');const admin=await requireAdminPage(),{locale,id}=await params;if(!mongoose.isValidObjectId(id))notFound();const t=await getTranslations('center'),common=await getTranslations('common'),exams=await getTranslations('exams'),currency=common('currency'),digits=await dashboardDigits(admin.id),language=locale==='bn'?'bn':'en',q=await searchParams;const x=await CenterStudent.findOne({_id:id,status:{$ne:'removed'}}).lean<Record<string,any>>();if(!x)notFound();const canManage=admin.role==='admin'||admin.role==='superadmin';const g=await CenterClassGroup.findById(x.classGroup).select('name shift academicYear').lean<Record<string,any>>();const today=dhakaCalendar(new Date()),date=`${today.year}-${String(today.month).padStart(2,'0')}-${String(today.day).padStart(2,'0')}`;const name=(locale==='en'?x.name.en:x.name.bn)||x.name.bn;const item={id,revision:x.updatedAt.toISOString(),version:x.revision??0,nameBn:x.name.bn,nameEn:x.name.en||'',roll:x.roll||'',school:x.school||'',guardianName:x.guardianName,guardianPhone:x.guardianPhone,studentPhone:x.studentPhone||'',altPhone:x.altPhone||'',address:x.address||'',admissionDate:x.admissionDate,notes:x.notes||''};if(q.edit==='1')return <><div className="admin-heading"><div><h1>{t('edit')}</h1><p>{name}</p></div><Link className="admin-mini-button" href={`/admin/students/${id}`}>{t('back')}</Link></div><section className="admin-panel"><div className="admin-panel-body"><CenterStudentForm item={item} classes={[]} year={today.year} month={today.month} today={date} digits={digits}/></div></section></>;
 if(q.tab==='payments'){const year=Number(q.year)||g?.academicYear||today.year;const payment=await loadCashStudent(id,year);return <><div className="admin-heading"><div><Link href={`/admin/students/${id}`} className="text-link">← {t('profile')}</Link><h1>{name}</h1></div><Link href={`/admin/students/${id}/collect`} className="admin-mini-button">{t('cashFees')}</Link></div><nav className="daily-chips" data-student-tabs><Link href={`/admin/students/${id}`}>{t('profileTab')}</Link><Link href={`/admin/students/${id}?tab=payments`}>{t('paymentHistory')}</Link><Link href={`/admin/students/${id}?tab=results`}>{exams('results.tab')}</Link></nav><form method="get" className="admin-filter"><input type="hidden" name="tab" value="payments"/><label>{t('yearWord')}<input name="year" className="admin-input" defaultValue={year} inputMode="numeric"/></label><button className="admin-mini-button">{t('viewButton')}</button></form><PaymentHistory student={payment}/></>}
 if(q.tab==='results')return <><div className="admin-heading"><div><Link href={`/admin/students/${id}`} className="text-link">← {t('profile')}</Link><h1>{name}</h1><p>{exams('results.title')}</p></div></div><nav className="daily-chips" data-student-tabs><Link href={`/admin/students/${id}`}>{t('profileTab')}</Link><Link href={`/admin/students/${id}?tab=payments`}>{t('paymentHistory')}</Link><Link href={`/admin/students/${id}?tab=results`}>{exams('results.tab')}</Link></nav><AdminStudentResults studentId={id} report={q.report} locale={locale} digits={digits}/></>
 const months=t.raw('monthNames') as string[];const fees=(x.feeHistory as {effectiveFrom:{year:number;month:number};amount:number;reason?:string}[]).slice().sort((a,b)=>b.effectiveFrom.year-a.effectiveFrom.year||b.effectiveFrom.month-a.effectiveFrom.month);
 /* S1 · what the three doors write and what the two histories read. The classes offered are the ones
    the centre runs, in the page's own language; the price on the form is the one this month is billed
    at; the pause the sheet may not offer a resume inside is the open one. */
 const choices=(await CenterClassGroup.find({active:true}).select('name academicYear shift')
   .sort({academicYear:-1,order:1,'name.bn':1}).limit(200)
   .lean<{_id:unknown;name:{bn:string;en?:string};academicYear:number;shift?:string}[]>())
   .map(group=>({id:String(group._id),name:(locale==='en'?group.name.en:group.name.bn)||group.name.bn,year:group.academicYear,shift:group.shift||''}));
 const kit={id,digits,language:locale==='en'?'en' as const:'bn' as const};
 const todayIndex=today.year*12+today.month;
 const currentFee=fees.find(fee=>fee.effectiveFrom.year*12+fee.effectiveFrom.month<=todayIndex)?.amount??fees[0]?.amount??null;
 const holds=(x.holds as {start:{year:number;month:number};end?:{year:number;month:number}|null;reason?:string}[]||[])
   .map(hold=>({start:hold.start,end:hold.end||null,reason:hold.reason||''}));
 const openHold=[...holds].reverse().find(hold=>!hold.end);
 const holdFrom=openHold?`${openHold.start.year}-${String(openHold.start.month).padStart(2,'0')}`:'';
 const steps=(x.classHistory as {classGroup:unknown;name?:{bn?:string;en?:string}|null;effectiveFrom:{year:number;month:number};reason?:string}[]||[])
   .map(step=>({
      /* A line an older write left nameless is named from the class the student is in today, which is
         the only name the record can offer for it: the timeline reads instead of printing a blank. */
      name:(locale==='en'?step.name?.en:step.name?.bn)||step.name?.bn
        ||(String(step.classGroup)===String(x.classGroup)&&g?(locale==='en'?g.name.en:g.name.bn)||g.name.bn:''),
      from:step.effectiveFrom,reason:step.reason||''}));
 /* A student nobody has moved yet has one class and one month it started: the timeline says so rather
    than printing an empty panel, because the question "which class was this child in in March?" has an
    answer for every child the centre has ever run. */
 const timeline=steps.length?steps:[{name:g?`${(locale==='en'?g.name.en:g.name.bn)||g.name.bn}`:'',from:{year:x.startMonth.year,month:x.startMonth.month} as {year:number;month:number},reason:''}];
 const monthLabel=(value:{year:number;month:number}):string=>`${months[value.month-1]||''} ${formatNumber(value.year,digits)}`;const rows:[string,string][]=[[t('id'),formatDigits(x.studentId,digits)],[t('class'),g?`${(locale==='en'?g.name.en:g.name.bn)||g.name.bn}${g.shift?' · '+g.shift:''}`:'—'],[t('guardian'),x.guardianName],[t('guardianPhone'),formatDigits(x.guardianPhone,digits)],[t('studentPhone'),formatDigits(x.studentPhone||'',digits)],[t('altPhone'),formatDigits(x.altPhone||'',digits)],[t('school'),x.school||''],[t('roll'),formatDigits(x.roll||'',digits)],[t('address'),x.address||''],[t('admissionDate'),formatDate(x.admissionDate,digits,language)],[t('start'),`${months[x.startMonth.month-1]} ${formatNumber(x.startMonth.year,digits)}`],[t('notes'),x.notes||'']];return <><div className="admin-heading"><div><Link href="/admin/students" className="text-link">← {t('back')}</Link><h1>{name}</h1><p>{t('id')}: {formatDigits(x.studentId,digits)}</p></div><div data-profile-actions><Link href={`/admin/students/${id}?edit=1`} className="admin-mini-button" data-profile-edit>{t('edit')}</Link> {canManage&&<StudentRemoveButton id={id} digits={digits} language={language}/>} <SmsDialogHost request={{source:'student',id}} title={ts('titles.student')} label={ts('labels.sms')} defaultTemplateKey="due_reminder"/> <Link href={`/admin/students/${id}/collect`} className="admin-mini-button" data-profile-payment>{t('cashFees')}</Link> <StudentTransferButton kit={kit} classes={choices} currentClassId={String(x.classGroup||'')}/> <StudentFeeButton kit={kit} fee={currentFee} currency={currency}/></div></div><nav className="daily-chips" data-student-tabs><Link href={`/admin/students/${id}`}>{t('profileTab')}</Link><Link href={`/admin/students/${id}?tab=payments`}>{t('paymentHistory')}</Link><Link href={`/admin/students/${id}?tab=results`} data-tab-results>{exams('results.tab')}</Link></nav><section className="admin-panel"><div className="admin-panel-head"><h2>{t('profile')}</h2>
{/* The badge is the hold switch, not a picture of it: two taps change the status, a toast answers and
    the page re-reads — the same component the list row uses, so the two cannot drift apart. The header
    keeps the four labelled doors and loses the standalone Hold button that duplicated it. */}
<span data-profile-status><StudentStatusChip kit={kit} status={x.status==='on_hold'?'on_hold':'active'} holdFrom={holdFrom}/></span></div><div className="admin-panel-body"><dl className="center-profile">{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'—'}</dd></div>)}</dl></div></section><section className="admin-panel"><div className="admin-panel-head"><h2>{t('fee')}</h2></div><div className="admin-panel-body"><ul className="center-fees">{fees.map((f,i)=><li key={i}>{monthLabel(f.effectiveFrom)} — {formatNumber(f.amount,digits)} {currency}{f.reason?` · ${f.reason}`:''}</li>)}</ul></div></section>
    {/* S1 · the two histories a profile owes: the classes this student has sat in and the months the
        fee run skipped. Both are read off the record, month by month, because both are about money —
        which class a month belongs to, and which months were never billed. */}
    <section className="admin-panel" data-class-history><div className="admin-panel-head"><h2>{t('history.classTitle')}</h2></div><div className="admin-panel-body">
      <ul className="center-fees">{timeline.map((step,i)=><li key={i} data-class-step={i}>{monthLabel(step.from)} — {step.name||'—'}{step.reason?` · ${step.reason}`:''}</li>)}</ul>
    </div></section>
    {!!holds.length&&<section className="admin-panel" data-student-holds><div className="admin-panel-head"><h2>{t('history.holdTitle')}</h2></div><div className="admin-panel-body">
      <ul className="center-fees">{holds.map((hold,i)=><li key={i} data-hold-step={i}>{monthLabel(hold.start)} — {hold.end?monthLabel(hold.end):t('history.open')}{hold.reason?` · ${hold.reason}`:''}</li>)}</ul>
      <p className="admin-help">{t('history.holdHelp')}</p>
    </div></section>}</>}
