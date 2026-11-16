import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {requireArchiver} from '@/lib/admin/guard';
export const dynamic='force-dynamic';
export default async function ReportsHub({params}:{params:Promise<{locale:string}>}){
  await requireArchiver();
  const {locale}=await params;
  const t=await getTranslations('reports');
  const cards:[string,string,string][]=[
    ['/admin/reports/daily',t('hub.daily'),t('daily.desc')],
    ['/admin/reports/monthly',t('hub.monthly'),t('monthly.desc')],
    ['/admin/reports/receipt-audit',t('hub.audit'),t('audit.desc')],
    ['/admin/reports/year',t('hub.year'),t('year.desc')],
  ];
  return <>
    <div className="admin-heading"><div>
      <span className="section-tag">✦ &nbsp; {t('hub.title')}</span>
      <h1>{t('hub.title')}</h1>
      <p>{t('hub.desc')}</p>
    </div></div>
    <div data-reports-hub>
      {cards.map(([href,title,desc])=>
        <section className="admin-panel" key={href}>
          <div className="admin-panel-body">
            <strong><Link className="text-link" href={href}>{title}</Link></strong>
            <p>{desc}</p>
            <Link className="admin-mini-button" href={href}>{t('hub.open')}</Link>
          </div>
        </section>)}
    </div>
  </>;
}
