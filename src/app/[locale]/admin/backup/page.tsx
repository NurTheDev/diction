import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {getAdmin} from '@/lib/admin/guard';
import {redirect} from 'next/navigation';
import {dashboardDigits} from '@/lib/admin/digits';
import {formatDate} from '@/lib/admin/format';
import {CenterSettings} from '@/models/CenterRecords';
export const dynamic='force-dynamic';
export default async function BackupPage({params}:{params:Promise<{locale:string}>}){
  const {locale}=await params;
  const admin=await getAdmin();
  /* The narrowest door in the building: the whole database leaves through it, so only the owner's own
     role stands here. Everybody else is sent back to the Overview, exactly as the roles page does. */
  if(admin?.role!=='superadmin')redirect(`/${locale}/admin`);
  const t=await getTranslations('center');
  const digits=await dashboardDigits(admin.id);
  const settings=await CenterSettings.findOne({key:'main'}).select('lastBackupAt').lean<{lastBackupAt?:Date}|null>();
  return <>
    <div className="admin-heading"><div>
      <span className="section-tag">✦ &nbsp; {t('backup.title')}</span>
      <h1>{t('backup.title')}</h1>
      <p>{t('backup.desc')}</p>
    </div></div>
    <section className="admin-panel" data-backup-page>
      <div className="admin-panel-body">
        <p data-backup-last>{settings?.lastBackupAt
          ?t('backup.last',{date:formatDate(settings.lastBackupAt,digits,locale==='en'?'en':'bn')})
          :t('backup.lastNever')}</p>
        <div className="report-toolbar">
          <Link className="button" data-backup-json href="/admin/backup/export?format=json">{t('backup.json')}</Link>
          <Link className="button" data-backup-xlsx href="/admin/backup/export?format=xlsx">{t('backup.xlsx')}</Link>
        </div>
        <p className="admin-help">{t('backup.help')}</p>
      </div>
    </section>
  </>;
}
