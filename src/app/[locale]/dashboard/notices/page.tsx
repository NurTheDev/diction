import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {getPortalUser} from '@/lib/portal-guard';
import {pageNumber} from '@/lib/admin/helpers';
import {NoticeLibrary} from '@/components/portal-notices/notice-library';
export const metadata:Metadata={robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default async function Notices({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{page?:string}>}){const {locale}=await params,user=await getPortalUser('student');if(!user)redirect(`/${locale}/login`);return <NoticeLibrary user={{id:user.id,role:'student'}} locale={locale} page={pageNumber((await searchParams).page)}/>}
