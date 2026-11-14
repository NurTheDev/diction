import {getTranslations} from 'next-intl/server';
import type {Metadata} from 'next';
import {PdfPreview} from '@/components/public/pdf-preview';
import {notFound} from 'next/navigation';
import {getPublicSheet} from '@/lib/content/public-sheets';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string;slug:string}>}):Promise<Metadata>{const {locale,slug}=await params;try{const i=await getPublicSheet(slug);if(!i)return {title:'Not found',robots:{index:false}};const title=locale==='bn'?i.title.bn:i.title.en||i.title.bn,description=(locale==='bn'?i.description.bn:i.description.en||i.description.bn)||title;return {title,description,openGraph:{title,description},alternates:{canonical:`/${locale}/lecture-sheets/${slug}`}}}catch{return {robots:{index:false}}}}
export default async function Sheet({params}:{params:Promise<{locale:string;slug:string}>}){const {locale,slug}=await params,bn=locale==='bn';const i=await getPublicSheet(slug);if(!i)notFound();const pub=await getTranslations('publicPages.sheets');return <section className="content-section"><div className="wrap sheet-detail"><p>{[i.className,i.subject].filter(Boolean).join(' · ')}</p><h1>{bn?i.title.bn:i.title.en||i.title.bn}</h1><p>{bn?i.description.bn:i.description.en||i.description.bn}</p><a className="button button-red" href={`/api/public-sheets/${slug}`} target="_blank" rel="noopener noreferrer">{pub('openPdf')}</a><PdfPreview locale={locale} url={`/api/public-sheets/${slug}`}/><p>{pub('note')}</p></div></section>}
