import {getTranslations} from 'next-intl/server';
import {practiceList} from '@/lib/content/practice-tests';
import {Link} from '@/i18n/navigation';
import type {Metadata} from 'next';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{const {locale}=await params;const pub=await getTranslations({locale,namespace:'publicPages.practice'});return {title:pub('title'),description:pub('tagline')}}
export default async function Page({params}:{params:Promise<{locale:string}>}){const {locale}=await params,bn=locale==='bn',items=await practiceList();const pub=await getTranslations('publicPages.practice');return <><section className="page-hero"><div className="wrap"><h1>{pub('title')}</h1><p>{pub('hero')}</p></div></section><section className="content-section"><div className="wrap sheet-list"><p>{pub('intro')}</p>{items.length?items.map(i=><article className="public-card" key={i.slug}><h2><Link href={`/practice-tests/${i.slug}`}>{i.title}</Link></h2><p>{[i.subject,i.grade].filter(Boolean).join(' · ')}</p><Link href={`/practice-tests/${i.slug}`}>{pub('start')}</Link></article>):<p>{pub('empty')}</p>}</div></section></>}
