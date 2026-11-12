import {requireAdmin} from '@/lib/admin/guard';
import {pageNumber} from '@/lib/admin/helpers';
import {FeeList} from '@/components/fees/fee-list';
export const dynamic='force-dynamic';
export default async function Fees({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{page?:string}>}){const user=await requireAdmin();return <FeeList role="admin" userId={user.id} locale={(await params).locale} page={pageNumber((await searchParams).page)}/>}
