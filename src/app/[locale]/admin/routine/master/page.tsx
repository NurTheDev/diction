import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {requireArchiver} from '@/lib/admin/guard';
import {dashboardDigits} from '@/lib/admin/digits';
import {formatNumber} from '@/lib/admin/format';
import {dayHeaders,type Language} from '@/components/admin/list-dates';
import {assignments,centreWeek,jointOptionsForWeek,knownRooms,knownShifts,masterWeek,routineClasses,
  shiftsForClass,teacherOptions} from '@/lib/routine/read';
import {shiftDate} from '@/lib/routine/time';
import {dhakaDay} from '@/lib/admin/today';
import {dayTotals,scanSlots,type RoutineSlot} from '@/lib/routine/conflicts';
import {RoutineMasterBoard} from '@/components/admin/routine-master';
import {RoutineAssignments} from '@/components/admin/routine-assignments';
export const dynamic='force-dynamic';

/**
 * R9 · the master routine: the week the centre teaches, class by class, shift by shift.
 *
 * This page is the permanent half of the routine. It answers one question — "what does নবম শ্রেণি do on
 * Tuesday?" — and it answers it with a grid of seven days in which every period carries a visible Edit
 * button and every day a visible "+ Add period", because a routine that can only be changed from inside a
 * menu is a routine nobody changes.
 *
 * Three decisions are visible here rather than hidden in the code:
 *
 *   • **A clash warns, it never blocks.** `scanSlots` reads the whole centre's week at once — a teacher
 *     double-booked is only visible from the class they were double-booked out of — and the lines that
 *     involve the class being looked at become the banner above the grid. The same check runs again on
 *     save, so what the grid says and what the drawer says cannot disagree.
 *   • **An empty column is not a missing one.** A day nobody has written yet has no document, and the grid
 *     draws it as a day that is simply empty and waiting.
 *   • **The page is staff-readable.** A front-desk account sees the week and can archive a record; only an
 *     administrator or the owner sees the buttons that write, which is the same split the rest of the
 *     admin panel uses.
 */
export default async function RoutineMasterPage({params,searchParams}:{
  params:Promise<{locale:string}>;searchParams:Promise<{classId?:string;shift?:string}>;}){
  const admin=await requireArchiver();
  const {locale}=await params,query=await searchParams;
  const language:Language=locale==='en'?'en':'bn';
  const t=await getTranslations('routine');
  const digits=await dashboardDigits(admin.id);
  const canWrite=admin.role==='admin'||admin.role==='superadmin';
  const classes=await routineClasses(language);
  const asked=String(query.classId||'');
  const chosen=classes.find(group=>group.id===asked)||classes[0]||null;

  if(!chosen)return <>
    <div className="admin-heading"><div>
      <span className="section-tag">✦ &nbsp; {t('master.title')}</span>
      <h1>{t('master.title')}</h1><p className="admin-help">{t('master.sub')}</p>
    </div></div>
    <section className="admin-panel" data-routine-empty>
      <div className="admin-panel-body">
        <strong>{t('master.noClasses')}</strong>
        <p className="admin-help">{t('master.noClassesHelp')}</p>
        {canWrite&&<Link className="button button-navy" href="/admin/students/classes">{t('master.createClass')}</Link>}
      </div>
    </section>
  </>;

  const shifts=await shiftsForClass(chosen.id,chosen.shift);
  const askedShift=String(query.shift||'');
  const shift=shifts.includes(askedShift)?askedShift:(shifts[0]||chosen.shift||'');
  const [days,slots,teachers,rooms,assignmentRows,everyShift]=await Promise.all([
    masterWeek(chosen.id,shift,language),centreWeek(),teacherOptions(),knownRooms(),
    assignments(language,chosen.id),knownShifts(),
  ]);
  /* The replacement tool's own range, decided here rather than in the browser: Dhaka's today, and a
     fortnight on, which is as long as a sick leave usually is and as far as it is worth offering. */
  const today=dhakaDay();
  const until=shiftDate(today,13);
  const joints=jointOptionsForWeek(slots);
  /* Only the clashes this class is a party to: a page about one class does not lecture about two others. */
  const clashes=scanSlots(slots).filter(clash=>clash.classId===chosen.id||clash.otherClassId===chosen.id);
  const own:RoutineSlot[]=days.flatMap(day=>day.periods.map(period=>({
    periodId:period.id,classId:chosen.id,weekday:day.weekday,start:period.start,end:period.end,
    teacher:period.teacherId,room:period.room,className:chosen.name,subject:period.subjectBn,
    teacherName:period.teacherName})));
  const totals=dayTotals(own);
  const teachingDays=days.filter(day=>day.active&&day.periods.length>0).length;
  const involved=new Set(own.filter(slot=>slot.teacher).map(slot=>String(slot.teacher))).size;
  const dailyHref=`/admin/routine/daily?classId=${chosen.id}${shift?`&shift=${encodeURIComponent(shift)}`:''}`;

  return <>
    <div className="admin-heading" data-routine-master={chosen.id}>
      <div>
        <span className="section-tag">✦ &nbsp; {t('master.title')}</span>
        <h1 data-master-heading>{t('master.title')}</h1>
        <p className="admin-help" data-master-sub>{t('master.sub')}</p>
        {/* The class name only: the shift is the owner's own word and may be written in Bangla, and the
            heading is one of the boxes the two-language sweep reads on an English address. The shift has
            its own line inside the panel body, where data is allowed to be in its own language. */}
        <p className="admin-help" data-master-class>{chosen.name}</p>
      </div>
      <div className="center-student-actions">
        <Link href={dailyHref} className="button button-navy" data-master-to-daily>{t('master.toDaily')}</Link>
      </div>
    </div>

    <dl className="admin-kpis" data-master-kpis>
      <div><dt>{t('master.kpiPeriods')}</dt>
        <dd data-kpi-periods>{t('master.periodCount',{count:formatNumber(totals.periods,digits)})}</dd></div>
      <div><dt>{t('master.kpiMinutes')}</dt>
        <dd data-kpi-minutes>{t('master.minutes',{minutes:formatNumber(totals.minutes,digits)})}</dd></div>
      <div><dt>{t('master.kpiTeachers')}</dt><dd data-kpi-teachers>{formatNumber(involved,digits)}</dd></div>
      <div><dt>{t('master.kpiDaysOn')}</dt><dd data-kpi-days>{formatNumber(teachingDays,digits)}</dd></div>
      <div><dt>{t('master.kpiClashes')}</dt><dd data-kpi-clashes>{formatNumber(clashes.length,digits)}</dd></div>
    </dl>

    <section className="admin-panel" data-master-filters>
      <div className="admin-panel-head"><h2>{t('master.title')}</h2></div>
      <div className="admin-panel-body">
        <form method="get" className="admin-filter report-filters" data-master-form>
          <label><span>{t('master.classLabel')}</span>
            <select className="admin-select" name="classId" data-master-class-select defaultValue={chosen.id}>
              <option value="">{t('master.chooseClass')}</option>
              {classes.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}
            </select></label>
          <label><span>{t('master.shiftLabel')}</span>
            <select className="admin-select" name="shift" data-master-shift-select defaultValue={shift}>
              {(shifts.length?shifts:[shift]).filter(Boolean).map(value=><option key={value} value={value}>{value}</option>)}
              {!shifts.length&&<option value="">{t('master.noShift')}</option>}
            </select></label>
          <button type="submit" className="button button-navy" data-master-show>{t('master.show')}</button>
        </form>
      </div>
    </section>

    <section className="admin-panel" data-master-week-panel>
      <div className="admin-panel-head"><h2>{chosen.name}</h2></div>
      <div className="admin-panel-body">
        <p className="admin-help" data-master-shift-line>{t('master.shiftLabel')}: {shift||t('master.noShift')}</p>
        <p className="admin-help" data-master-week-help>{t('master.weekHelp')}</p>
        <RoutineMasterBoard classId={chosen.id} className={chosen.name} shift={shift} days={days}
          classes={classes.map(group=>({id:group.id,name:group.name}))} shifts={everyShift}
          today={today} until={until}
          weekdays={dayHeaders(language)} teachers={teachers} rooms={rooms} joints={joints} clashes={clashes}
          digits={digits} canEdit={canWrite} canDelete={canWrite}/>
      </div>
    </section>

    <RoutineAssignments assignments={assignmentRows} teachers={teachers} classes={classes} classId={chosen.id}
      digits={digits} canEdit={canWrite} canDelete={canWrite}/>
  </>;
}
