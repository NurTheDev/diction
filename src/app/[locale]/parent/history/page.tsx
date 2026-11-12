import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {getPortalUser} from '@/lib/portal-guard';
import {pageNumber} from '@/lib/admin/helpers';
import {AcademicHistory} from '@/components/academic-history/history';
export const metadata:Metadata={robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default async function History({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{page?:string;tab?:string}>}){const {locale}=await params,user=await getPortalUser('parent');if(!user)redirect(`/${locale}/login`);const search=await searchParams;return <AcademicHistory role="parent" userId={user.id} locale={locale} page={pageNumber(search.page)} tab={search.tab==='attendance'?'attendance':'results'}/>}
