import {redirect} from 'next/navigation';
import {Link} from '@/i18n/navigation';
import {getTranslations} from 'next-intl/server';
import {CalendarDays} from 'lucide-react';
import {getPortalUser} from '@/lib/portal-guard';
import {PortalHero} from '@/components/portal/learner';
import {PrintSheetButton} from '@/components/portal/print-sheet';
import {teacherSchedule} from '@/lib/routine/read';
import {dashboardDigits} from '@/lib/admin/digits';
import {formatNumber} from '@/lib/admin/format';
import {dayHeading,rangeWord} from '@/lib/routine/time';

export const dynamic='force-dynamic';

/**
 * R9 · Slice 2 · a teacher's own routine: today, and the seven days from today.
 *
 * The question a teacher asks is never "what does নবম শ্রেণি do on Tuesday" — it is "where am I at ten
 * o'clock, and what does the week look like for me". So this screen is built the other way round from the
 * admin's: one person's periods, across every class that holds them, on Dhaka's dates.
 *
 * It reads through the same split the routine is written with. A date that has its own working sheet is
 * shown as the sheet says it is — a substitute, a moved room, a holiday — and a date that has none is
 * shown as the week says it is, so a teacher who has been replaced for a day sees the replacement and not
 * their own name. Nothing else is queried here: no fee, no due, no result, no other teacher's schedule.
 *
 * The schedule is also paper: the print button hands the very same seven days to the printer, which is
 * what a staff-room wall wants.
 */
export default async function TeacherRoutine({params}:{params:Promise<{locale:string}>}){
  const {locale}=await params;
  const user=await getPortalUser('teacher');
  if(!user)redirect(`/${locale}/login?callbackUrl=/${locale}/teacher/routine`);
  const language=locale==='en'?'en':'bn';
  const t=await getTranslations('routine');
  const digits=await dashboardDigits(user.id);
  const schedule=await teacherSchedule(user.id,language);
  const days=schedule?.week||[];
  const total=days.reduce((sum,day)=>sum+day.rows.length,0);
  const subjectOf=(row:{subjectBn:string;subjectEn:string}):string=>
    language==='en'?(row.subjectEn||row.subjectBn):row.subjectBn;
  return <>
    <PortalHero title={t('portal.title')} name={user.name} showAnchors={false}/>
    <section className="portal-area"><div className="wrap portal-container">
      <div className="notice-box" data-teacher-routine-scope>
        {t('portal.sub')} · {t('portal.periods',{count:formatNumber(total,digits)})}
      </div>
      <section className="portal-card" id="routine">
        <div className="portal-card-head">
          <div className="portal-icon"><CalendarDays size={20}/></div>
          <div><span>{t('portal.upcoming')}</span>
            <h2 data-teacher-routine-total>{formatNumber(total,digits)}</h2></div>
          <PrintSheetButton label={t('portal.print')}/>
        </div>
        {total===0&&<p className="portal-empty" data-teacher-routine-none>{t('portal.none')}</p>}
        {/* The seven days are the printed sheet as well, so the print stylesheet keeps this and drops the
            rest of the portal around it. */}
        <div className="teacher-schedule" data-teacher-schedule data-print-sheet>
          {days.map((day,index)=><div className="teacher-day" key={day.date} data-teacher-day={day.date}
            data-teacher-day-today={index===0?'yes':'no'}>
            <h3 data-teacher-day-heading>
              {index===0?`${t('portal.today')} · ${dayHeading(day.date,digits,language)}`
                :dayHeading(day.date,digits,language)}</h3>
            {day.rows.length===0
              ? <p className="admin-help" data-teacher-day-none>{t('portal.noneDay')}</p>
              : <>
                <p className="admin-help" data-teacher-day-count>
                  {t('portal.periods',{count:formatNumber(day.rows.length,digits)})}</p>
                <ul className="teacher-rows">
                  {day.rows.map((row,position)=>
                    <li key={`${row.start}${row.classId}${position}`}
                      data-teacher-row={`${row.classId}:${row.start}`}>
                      <span data-teacher-row-time>{rangeWord(row.start,row.end,digits)}</span>
                      <span data-teacher-row-class>{row.className}{row.shift?` · ${row.shift}`:''}</span>
                      <span data-teacher-row-subject>{subjectOf(row)}</span>
                      {row.room&&<span data-teacher-row-room>{t('portal.roomWord',{room:row.room})}</span>}
                      {row.daily&&<span className="admin-badge" data-teacher-row-daily>
                        {t('portal.daily')}</span>}
                    </li>)}
                </ul>
              </>}
          </div>)}
        </div>
      </section>
      <p className="admin-help">
        <Link className="text-link" href="/teacher" data-teacher-routine-back>{t('portal.back')}</Link>
      </p>
    </div></section>
  </>;
}
