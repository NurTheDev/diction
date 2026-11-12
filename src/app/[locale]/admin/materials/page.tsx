import {requireAdmin} from '@/lib/admin/guard';
import {pageNumber} from '@/lib/admin/helpers';
import {MaterialLibrary} from '@/components/materials/material-library';
export const dynamic='force-dynamic';
export default async function Materials({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{page?:string}>}){const user=await requireAdmin();const {locale}=await params;return <MaterialLibrary user={user as typeof user & {role:'admin'|'superadmin'}} locale={locale} page={pageNumber((await searchParams).page)}/>}
