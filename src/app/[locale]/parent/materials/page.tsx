import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {getPortalUser} from '@/lib/portal-guard';
import {pageNumber} from '@/lib/admin/helpers';
import {MaterialLibrary} from '@/components/materials/material-library';
export const metadata:Metadata={robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default async function Materials({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{page?:string}>}){const {locale}=await params;const user=await getPortalUser('parent');if(!user)redirect(`/${locale}/login`);return <MaterialLibrary user={{id:user.id,role:'parent'}} locale={locale} page={pageNumber((await searchParams).page)}/>}
