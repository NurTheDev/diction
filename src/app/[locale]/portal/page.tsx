import {redirect} from 'next/navigation';
import {auth} from '@/lib/auth';
export const dynamic='force-dynamic';
/** Route a successful sign-in by role; destination pages perform fresh DB authorization. */
export default async function Portal({params}:{params:Promise<{locale:string}>}){const {locale}=await params;if(!process.env.NEXTAUTH_SECRET)redirect(`/${locale}/login`);const session=await auth();const role=(session?.user as {role?:string}|undefined)?.role;const paths:Record<string,string>={student:'dashboard',teacher:'teacher',parent:'parent',admin:'admin',superadmin:'admin',content_editor:'admin',exam_manager:'admin'};redirect(role&&paths[role]?`/${locale}/${paths[role]}`:`/${locale}/login`);}
