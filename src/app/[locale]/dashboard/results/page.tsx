import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {getPortalUser} from '@/lib/portal-guard';
import {PortalResults} from '@/components/exams/portal-results';
export const metadata:Metadata={robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
/**
 * R5 slice 2 · The student's own Results tab: published centre exams, their own marks and nothing else.
 * The identity question — whose results this session may read — is answered inside the reader, from this
 * account's own number; see `src/lib/exams/student-results.ts`.
 */
export default async function StudentResults({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{student?:string;report?:string}>}){
  const {locale}=await params;
  const user=await getPortalUser('student');
  if(!user)redirect(`/${locale}/login?callbackUrl=/${locale}/dashboard/results`);
  const q=await searchParams;
  return <PortalResults user={{id:user.id,role:user.role,name:user.name}} locale={locale} base="/dashboard/results" student={q.student} report={q.report}/>;
}
