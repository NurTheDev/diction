import {requireStaffPermission} from '@/lib/admin/guard';
import {PracticeManager} from '@/components/admin/practice-manager';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{locale:string}>}){await requireStaffPermission('exams');const {locale}=await params;return <PracticeManager locale={locale}/>}
