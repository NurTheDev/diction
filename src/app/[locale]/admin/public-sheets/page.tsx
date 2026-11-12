import {requireStaffPermission} from '@/lib/admin/guard';
import {PublicSheetManager} from '@/components/admin/public-sheet-manager';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{locale:string}>}){const user=await requireStaffPermission('content');const {locale}=await params;const canDelete=user.role==='admin'||user.role==='superadmin';return <PublicSheetManager locale={locale} canDelete={canDelete} canArchive={canDelete}/>}
