import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {getPortalUser} from '@/lib/portal-guard';
import {FeeDetail} from '@/components/fees/fee-detail';
export const metadata:Metadata={robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default async function Invoice({params,searchParams}:{params:Promise<{locale:string;id:string}>;searchParams:Promise<{page?:string}>}){const {locale,id}=await params,user=await getPortalUser('parent');if(!user)redirect(`/${locale}/login`);return <FeeDetail role="parent" userId={user.id} locale={locale} id={id} requestedPage={(await searchParams).page}/>}
