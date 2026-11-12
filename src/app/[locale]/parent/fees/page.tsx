import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {getPortalUser} from '@/lib/portal-guard';
import {pageNumber} from '@/lib/admin/helpers';
import {FeeList} from '@/components/fees/fee-list';
export const metadata:Metadata={robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default async function Fees({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{page?:string}>}){const {locale}=await params,user=await getPortalUser('parent');if(!user)redirect(`/${locale}/login`);return <FeeList role="parent" userId={user.id} locale={locale} page={pageNumber((await searchParams).page)}/>}
