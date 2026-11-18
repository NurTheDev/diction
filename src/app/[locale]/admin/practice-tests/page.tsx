import {requireStaffPermissionPage} from '@/lib/admin/guard';
import {PracticeManager} from '@/components/admin/practice-manager';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{locale:string}>}){const user=await requireStaffPermissionPage('exams');return <PracticeManager canDelete={user.role==='admin'||user.role==='superadmin'}/>}
