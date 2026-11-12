import {requireStaffPermission} from '@/lib/admin/guard';
import {PublicSheetManager} from '@/components/admin/public-sheet-manager';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{locale:string}>}){await requireStaffPermission('content');const {locale}=await params;return <PublicSheetManager locale={locale}/>}
