import {getTranslations} from 'next-intl/server';
import {PublicAssistant} from '@/components/public/public-assistant';
import {aiStatus} from '@/lib/ai';
import type {Metadata} from 'next';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{const {locale}=await params;const pub=await getTranslations({locale,namespace:'publicPages.assistant'});return {title:pub('title'),description:pub('tagline')}}
export default async function Page({params}:{params:Promise<{locale:string}>}){const {locale}=await params,bn=locale==='bn';const pub=await getTranslations('publicPages.assistant');return <><section className="page-hero"><div className="wrap"><h1>{pub('title')}</h1><p>{pub('hero')}</p></div></section><section className="content-section"><div className="wrap"><PublicAssistant locale={locale} enabled={aiStatus().ready&&process.env.PUBLIC_AI_ENABLED==='true'}/></div></section></>}
