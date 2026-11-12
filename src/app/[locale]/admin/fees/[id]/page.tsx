import {requireAdmin} from '@/lib/admin/guard';
import {FeeDetail} from '@/components/fees/fee-detail';
export const dynamic='force-dynamic';
export default async function Invoice({params,searchParams}:{params:Promise<{locale:string;id:string}>;searchParams:Promise<{page?:string}>}){const user=await requireAdmin(),{locale,id}=await params;return <FeeDetail role="admin" userId={user.id} locale={locale} id={id} requestedPage={(await searchParams).page}/>}
