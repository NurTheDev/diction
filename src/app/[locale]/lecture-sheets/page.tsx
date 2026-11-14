import {getTranslations} from 'next-intl/server';
import type {Metadata} from 'next';
import {getPublicSheets} from '@/lib/content/public-sheets';
import {Link} from '@/i18n/navigation';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{const {locale}=await params;const pub=await getTranslations({locale,namespace:'publicPages.sheets'});return {title:pub('title'),description:pub('tagline'),alternates:{canonical:`/${locale}/lecture-sheets`}}}
export default async function Sheets({params}:{params:Promise<{locale:string}>}){const {locale}=await params,bn=locale==='bn',items=await getPublicSheets();const pub=await getTranslations('publicPages.sheets');return <><section className="page-hero"><div className="wrap"><h1>{pub('title')}</h1><p>{pub('hero')}</p></div></section><section className="content-section"><div className="wrap sheet-list">{items.length?items.map(i=><article className="public-card" key={i.slug}><p>{[i.className,i.subject].filter(Boolean).join(' · ')}</p><h2><Link href={`/lecture-sheets/${i.slug}`}>{bn?i.title.bn:i.title.en||i.title.bn}</Link></h2><p>{bn?i.description.bn:i.description.en||i.description.bn}</p><Link href={`/lecture-sheets/${i.slug}`}>{pub('view')}</Link></article>):<p>{pub('empty')}</p>}</div></section></>}
