import {notFound} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {ArrowLeft} from 'lucide-react';
import {requireArchiver} from '@/lib/admin/guard';
import {dashboardDigits} from '@/lib/admin/digits';
import {leadDetailByKey} from '@/lib/leads/leads';
import {detailView} from '@/lib/leads/lead-ui';
import {formatDate} from '@/lib/admin/format';
import {LeadDetailInline,LeadRowControls} from '@/components/admin/leads-ui';
export const dynamic='force-dynamic';

/**
 * One visitor. The drawer on the list shows the same thing; this page exists so a link can be followed —
 * from an audit row, a printed sheet or a message between two admins — and so the notes timeline has an
 * address of its own. `leadDetailByKey()` accepts the Mongo id a row carries and the readable id
 * (`V-2026-0007`) a sheet quotes, and neither one is a phone number.
 */
export default async function LeadDetailPage({params}:{params:Promise<{locale:string;id:string}>}){
  const user=await requireArchiver();
  const {locale,id}=await params;
  const language=locale==='bn'?'bn':'en';
  const digits=await dashboardDigits(user.id);
  const t=await getTranslations('leads');
  const found=await leadDetailByKey(String(id||'').slice(0,40));
  if(!found)notFound();
  const detail=detailView(found);
  const row=detail.row;
  return <>
    <div className="admin-heading">
      <div>
        <h1>{row.studentName}</h1>
        <p>{row.leadId} · {formatDate(row.date,digits,language)}</p>
      </div>
      <Link className="admin-mini-button" href="/admin/leads"><ArrowLeft size={16} aria-hidden="true"/>{t('openLeads')}</Link>
    </div>
    <div className="admin-columns">
      <section className="admin-panel">
        <div className="admin-panel-head"><h2>{t('fields')}</h2></div>
        <div className="admin-panel-body">
          <LeadDetailInline seed={row} initial={detail} language={language} digits={digits}/>
        </div>
      </section>
      <section className="admin-panel">
        <div className="admin-panel-head"><h2>{t('colActions')}</h2></div>
        <div className="admin-panel-body"><LeadRowControls row={row} language={language}/></div>
      </section>
    </div>
  </>;
}
