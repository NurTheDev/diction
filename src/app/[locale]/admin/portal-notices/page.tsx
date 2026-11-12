import {requireAdmin} from '@/lib/admin/guard';
import {pageNumber} from '@/lib/admin/helpers';
import {NoticeLibrary} from '@/components/portal-notices/notice-library';
export const dynamic='force-dynamic';
export default async function Notices({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{page?:string}>}){const user=await requireAdmin();return <NoticeLibrary user={user as typeof user & {role:'admin'|'superadmin'}} locale={(await params).locale} page={pageNumber((await searchParams).page)}/>}
