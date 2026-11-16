import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {getPortalUser} from '@/lib/portal-guard';
import {PortalResults} from '@/components/exams/portal-results';
export const metadata:Metadata={robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
/**
 * R5 slice 2 · The guardian's Results tab: the published centre results of the children on this account's
 * own number, with a switcher when there is more than one. No fee, payment, receipt or due is read here —
 * the reader behind it selects marks, totals, grades and positions and nothing else.
 */
export default async function ParentResults({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{student?:string;report?:string}>}){
  const {locale}=await params;
  const user=await getPortalUser('parent');
  if(!user)redirect(`/${locale}/login?callbackUrl=/${locale}/parent/results`);
  const q=await searchParams;
  return <PortalResults user={{id:user.id,role:user.role,name:user.name}} locale={locale} base="/parent/results" student={q.student} report={q.report}/>;
}
