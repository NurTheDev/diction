import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {MessageCircle,Phone} from 'lucide-react';
import {followUpBoard} from '@/lib/leads/leads';
import {followUpBadge,rowView,statusBadge,statusLabel} from '@/lib/leads/lead-ui';
import {formatClass,formatDate,formatNumber,type Digits} from '@/lib/admin/format';
import {LeadDetailDrawer,LeadRowControls} from './leads-ui';

/**
 * "Today's follow-ups" on the Overview (R3 wave B).
 *
 * The overdue count is its own number and never folded into today's: a parent nobody called three days
 * ago is a different problem from one due now, and hiding it inside a total is how a promise gets broken
 * twice. The board comes from `followUpBoard()` in the rule layer — one range query over an ISO day in
 * Asia/Dhaka, oldest promise first — so this widget, the Visitors list and the daily cron job cannot
 * disagree about what "today" means.
 *
 * Rows carry the same controls as the list (dial, WhatsApp, status, the five follow-up buttons, the
 * drawer), because the point of the widget is to work the queue from here, not to be a summary of it.
 */
export async function LeadFollowUps({digits='bn',language='bn',limit=6}:{digits?:Digits;language?:'bn'|'en';limit?:number}){
  const t=await getTranslations('leads');
  const board=await followUpBoard(new Date(),limit);
  return <section className="admin-panel">
    <div className="admin-panel-head">
      <h2>{t('followUpsTitle')}</h2>
      <Link className="text-link" href="/admin/leads?followUp=today">{t('viewAll')} →</Link>
    </div>
    <div className="admin-panel-body">
      <p className="admin-inline">
        <span className="admin-badge pending">{t('todayBadge',{n:formatNumber(board.today,digits)})}</span>
        <span className={`admin-badge ${board.overdue?'rejected':''}`}>{t('overdueBadge',{n:formatNumber(board.overdue,digits)})}</span>
        <span className="admin-help">{t('followUpsDesc')}</span>
      </p>
      {board.rows.length?<div className="admin-table-wrap"><table className="admin-table admin-responsive-table">
        <thead><tr><th>{t('colVisitor')}</th><th>{t('colContact')}</th><th>{t('colFollowUp')}</th><th>{t('colActions')}</th></tr></thead>
        <tbody>{board.rows.map(row=>{
          const view=rowView(row);
          return <tr key={row.id}>
            <td data-label={t('colVisitor')}><div>
              <strong>{row.studentName}</strong>
              <br/><span className="admin-help">{row.leadId}{row.classGroup?` · ${formatClass(row.classGroup,digits,language)}`:row.classLabel?` · ${row.classLabel}`:''}</span>
            </div></td>
            <td data-label={t('colContact')}><div className="lead-row">
              {view.phones.length?view.phones.map((phone,index)=><span key={index} className="list-row-actions">
                <span className="admin-badge">{phone.masked}</span>
                <a className="admin-mini-button" href={phone.tel}><Phone size={15} aria-hidden="true"/>{t('call')}</a>
                <a className="admin-mini-button" href={phone.whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={15} aria-hidden="true"/>{t('whatsapp')}</a>
              </span>):<span className="admin-help">{t('noPhone')}</span>}
            </div></td>
            <td data-label={t('colFollowUp')}><div className="list-row-actions">
              {row.nextFollowUp&&<span className={`admin-badge ${followUpBadge(row.followUp)}`}>{formatDate(row.nextFollowUp,digits,language)}</span>}
              <span className={`admin-badge ${statusBadge(row.status)}`}>{statusLabel(row.status,language)}</span>
            </div></td>
            <td data-label={t('colActions')}><div className="lead-row">
              <div className="list-row-actions"><LeadDetailDrawer seed={view} language={language} digits={digits}/></div>
              <LeadRowControls row={view} language={language}/>
            </div></td>
          </tr>;
        })}</tbody>
      </table></div>:<div className="admin-empty"><p>{t('noneDue')}</p></div>}
    </div>
  </section>;
}
