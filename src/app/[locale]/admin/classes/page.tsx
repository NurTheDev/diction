import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {requireAdminPage} from '@/lib/admin/guard';
import {dashboardDigits} from '@/lib/admin/digits';
import {dhakaCalendar} from '@/lib/center/month-status';
import {classBoard} from '@/lib/classes/class-view';
import {ClassManagement} from '@/components/admin/class-management';

export const dynamic='force-dynamic';

/**
 * O1 · Class and batch management, as its own screen.
 *
 * A class used to be a row in a list under the student screens: a name, an edit fold, and a link. The
 * four things an owner actually asks about a class — which shifts it runs, which room it sits in, how
 * many children are on it, how many batches are going — were on other screens or on none, so answering
 * "how full is Class Seven?" meant opening the roll and counting. This page reads the whole board in one
 * pass (`classBoard`) and hands it to one component, and it sits in the menu under the students and
 * academics group, one tap from the roll and the timetable it leads to.
 *
 * The gate is the administrator's: a class is what a fee, a roll and a timetable all hang from, so the
 * screens that write one are the same ones that may — and the menu offers this door to nobody else.
 */
export default async function Classes({params}:{params:Promise<{locale:string}>}){
  const admin=await requireAdminPage();
  const {locale}=await params;
  const t=await getTranslations('classAdmin');
  const [digits,board]=await Promise.all([dashboardDigits(admin.id),classBoard(locale)]);
  const canEdit=admin.role==='admin'||admin.role==='superadmin';
  return <>
    <div className="admin-heading">
      <div>
        <Link href="/admin/students" className="text-link">← {t('section')}</Link>
        <h1 data-class-title>{t('title')}</h1>
        <p data-class-desc>{t('desc')}</p>
      </div>
    </div>
    <ClassManagement cards={board.cards} batchOptions={board.batchOptions}
      year={dhakaCalendar(new Date()).year} digits={digits} canEdit={canEdit}/>
  </>;
}
