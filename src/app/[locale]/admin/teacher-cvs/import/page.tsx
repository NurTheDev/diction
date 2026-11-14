import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {redirect} from 'next/navigation';
import {getAdmin} from '@/lib/admin/guard';
import {dashboardDigits} from '@/lib/admin/digits';
import {cvImportHistory} from '@/lib/teachers/import-commit';
import {CvImportWizard} from '@/components/admin/teacher-cv-import';

/**
 * R4 · The CV import wizard's page.
 *
 * All the work happens in the wizard component and the two import modules; this page only decides who may
 * stand here (Super Admin and Admin — the widest write the CV bank has), loads the batch history the undo
 * button needs, and paints the heading in the reader's language.
 */
export default async function TeacherCvImport({params}:{params:Promise<{locale:string}>}){
  const {locale}=await params;
  const user=await getAdmin();
  if(!user)redirect(`/${locale}/admin`);
  const digits=await dashboardDigits(user.id);
  const t=await getTranslations('teacherCvs');
  const history=await cvImportHistory(20);
  return <>
    <div className="admin-heading">
      <div><h1>{t('import.title')}</h1><p>{t('import.desc')}</p></div>
      <div className="list-row-actions">
        <Link className="admin-mini-button" href="/admin/teacher-cvs">{t('backToList')}</Link>
        <Link className="admin-mini-button" href="/admin/teacher-cvs/find">{t('find')}</Link>
      </div>
    </div>
    <CvImportWizard history={history} digits={digits}/>
  </>;
}
