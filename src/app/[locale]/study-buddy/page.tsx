import {PublicAssistant} from '@/components/public/public-assistant';
import {aiStatus} from '@/lib/ai';
import type {Metadata} from 'next';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{const {locale}=await params;return {title:locale==='bn'?'ডিকশন AI সহকারী':'Diction AI assistant',description:locale==='bn'?'পড়াশোনা ও কোচিং সম্পর্কে প্রশ্ন করুন।':'Ask study and coaching questions.'}}
export default async function Page({params}:{params:Promise<{locale:string}>}){const {locale}=await params,bn=locale==='bn';return <><section className="page-hero"><div className="wrap"><h1>{bn?'ডিকশন AI সহকারী':'Diction AI assistant'}</h1><p>{bn?'লগইন ছাড়া পড়াশোনা, অনুশীলন ও প্রতিষ্ঠান সম্পর্কে জানুন।':'Study, practice and ask about the center without logging in.'}</p></div></section><section className="content-section"><div className="wrap"><PublicAssistant locale={locale} enabled={aiStatus().ready&&process.env.PUBLIC_AI_ENABLED==='true'}/></div></section></>}
