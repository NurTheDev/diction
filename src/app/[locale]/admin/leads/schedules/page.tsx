import {Link} from '@/i18n/navigation';
import {ArrowLeft,CalendarClock,Eye,Send} from 'lucide-react';
import {getTranslations} from 'next-intl/server';
import {LeadScheduleCancel,LeadScheduleForm} from '@/components/admin/lead-schedule-form';
import {listTableClass} from '@/components/admin/list-class';
import {dashboardDigits} from '@/lib/admin/digits';
import {formatClass,formatDate,formatNumber} from '@/lib/admin/format';
import {requireAdminPage} from '@/lib/admin/guard';
import {dhakaDay} from '@/lib/admin/today';
import {visitorSmsDialogData} from '@/lib/center/sms-dialog-data';
import {listLeadSchedules} from '@/lib/leads/lead-schedule-db';
import {smsTemplateName} from '@/lib/center/sms-templates';
import {
  LEAD_SCHEDULE_STATUS_BADGE,LEAD_SCHEDULE_STATUS_LABEL_KEYS,leadScheduleFailureKey,
} from '@/lib/leads/lead-schedule';
import {CONTACTABLE_LEAD_FILTER,LEAD_CLOSED_STATUSES} from '@/lib/leads/vocab';
import {Lead} from '@/models/Lead';
import {type LeadScheduleRow} from '@/lib/leads/lead-schedule-db';

export const dynamic='force-dynamic';

/**
 * Scheduled visitor messages: write one, read what is waiting, cancel what changed its mind.
 *
 * The page is admin-only for the same reason the SMS centre is: a schedule spends the centre's balance
 * later, without an operator present to see the mistake. The list shows the audience the schedule was
 * written for and the counts the pipeline actually produced, so "scheduled for 42" and "sent 39,
 * skipped 3" are different facts and both stay readable.
 */
export default async function LeadSchedulesPage({params}:{params:Promise<{locale:string}>}){
  const {locale}=await params;
  const user=await requireAdminPage();
  const language=locale==='bn'?'bn':'en';
  const [digits,t,smsT,kit,schedules,counts]=await Promise.all([
    dashboardDigits(user.id),
    getTranslations('leads'),
    getTranslations('sms'),
    visitorSmsDialogData('admin'),
    listLeadSchedules(),
    Lead.aggregate<{_id:number|null;count:number}>([
      {$match:{$and:[{...CONTACTABLE_LEAD_FILTER},{status:{$nin:[...LEAD_CLOSED_STATUSES]}}]}},
      {$match:{'phones.0':{$exists:true}}},
      {$group:{_id:'$classGroup',count:{$sum:1}}},
    ]),
  ]);
  const smsNames=smsT.raw('templates') as Record<string,string>;

  const byClass=new Map<number,number>();
  for(const row of counts)if(typeof row._id==='number')byClass.set(row._id,row.count);
  const total=counts.reduce((sum,row)=>sum+row.count,0);
  const classCounts=[
    {value:'',count:total},
    ...Array.from({length:12},(_,index)=>index+1).map(value=>({value:String(value),count:byClass.get(value)||0})),
  ];
  const templates=kit.templates
    // `custom` is a catalog entry too; the form's own "write my own" is the single custom choice.
    .filter(template=>template.key!=='custom')
    .map(template=>({key:template.key,name:smsTemplateName(smsNames,template.name),body:template.body}));
  const templateName=(key:string):string=>key==='custom'
    ? t('schedules.custom')
    : templates.find(template=>template.key===key)?.name||key;
  const statusLabel=(status:LeadScheduleRow['status']):string=>t(LEAD_SCHEDULE_STATUS_LABEL_KEYS[status]);
  const audience=(row:LeadScheduleRow):string=>row.classGroup
    ? formatClass(row.classGroup,digits,language,t('colClass'))
    : t('schedules.everyClass');
  const messageOf=(row:LeadScheduleRow):string=>row.templateKey==='custom'
    ? row.text
    : templateName(row.templateKey);
  const today=dhakaDay(new Date());

  const rows=(list:LeadScheduleRow[],cancelable:boolean)=>list.length
    ? <div className="admin-table-wrap">
      <table className={`${listTableClass('visitor')} admin-responsive-table lead-schedule-table`}>
        <thead><tr>
          <th>{t('schedules.colWhen')}</th>
          <th>{t('schedules.colName')}</th>
          <th>{t('schedules.colAudience')}</th>
          <th>{t('schedules.colMessage')}</th>
          <th>{t('schedules.colCounts')}</th>
          <th>{t('schedules.colStatus')}</th>
          <th className="visitor-act list-act">{t('colActions')}</th>
        </tr></thead>
        <tbody>{list.map(row=><tr key={row.id}>
          <td>
            <strong>{formatDate(row.scheduledFor,digits,language)}</strong>
            <span className="admin-help">{t('schedules.windowTime')}</span>
          </td>
          <td>{row.title||t('schedules.noName')}</td>
          <td>{audience(row)}</td>
          <td className="lead-schedule-message"><span>{messageOf(row)}</span></td>
          <td>
            <span className="admin-help">{t('schedules.expected',{count:formatNumber(row.expectedCount,digits)})}</span>
            {row.status!=='scheduled'&&row.status!=='cancelled'&&<span className="admin-help">
              {t('schedules.result',{
                sent:formatNumber(row.sentCount,digits),failed:formatNumber(row.failedCount,digits),
                skipped:formatNumber(row.skippedCount,digits),
              })}
            </span>}
            {row.failure&&<span className="admin-help" data-schedule-failure="">{t(leadScheduleFailureKey(row.failure))}</span>}
          </td>
          <td><span className={`admin-badge ${LEAD_SCHEDULE_STATUS_BADGE[row.status]}`}>{statusLabel(row.status)}</span></td>
          <td className="visitor-act list-act">
            {cancelable&&row.status==='scheduled'&&<LeadScheduleCancel id={row.id}/>}
            {!cancelable&&<span className="admin-help">—</span>}
          </td>
        </tr>)}</tbody>
      </table>
    </div>
    : <div className="admin-empty"><p>{t('schedules.empty')}</p><span className="admin-help">{t('schedules.emptyHelp')}</span></div>;

  return <>
    <div className="admin-heading">
      <div>
        <h1>{t('schedules.title')}</h1>
        <p>{t('schedules.desc')}</p>
      </div>
      <div className="list-row-actions">
        <Link className="admin-mini-button" href="/admin/leads"><ArrowLeft size={16} aria-hidden="true"/>{t('title')}</Link>
      </div>
    </div>

    <section className="admin-panel">
      <div className="admin-panel-head"><h2><Send size={18} aria-hidden="true"/> {t('schedules.createTitle')}</h2></div>
      <div className="admin-panel-body">
        <LeadScheduleForm templates={templates} classCounts={classCounts} today={today}
          language={language} digits={digits} institutePhone={kit.institutePhone}/>
      </div>
    </section>

    <section className="admin-panel">
      <div className="admin-panel-head">
        <h2><CalendarClock size={18} aria-hidden="true"/> {t('schedules.upcoming')}</h2>
        <span className="admin-help">{formatNumber(schedules.upcoming.length,digits)}</span>
      </div>
      {rows(schedules.upcoming,true)}
    </section>

    <section className="admin-panel">
      <div className="admin-panel-head">
        <h2><Eye size={18} aria-hidden="true"/> {t('schedules.history')}</h2>
        <span className="admin-help">{formatNumber(schedules.recent.length,digits)}</span>
      </div>
      {rows(schedules.recent,false)}
    </section>
  </>;
}
