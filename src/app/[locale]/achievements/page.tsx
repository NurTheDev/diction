import {getTranslations} from 'next-intl/server';
import Link from 'next/link';
import {connection} from 'next/server';
import {listPublishedAchievements} from '@/lib/content/achievements';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}){const {locale}=await params;const pub=await getTranslations({locale,namespace:'publicPages.achievements'});return {title:pub('title')}}
export default async function Achievements({params}:{params:Promise<{locale:string}>}){await connection();const {locale}=await params,bn=locale==='bn';const items=await listPublishedAchievements();const pub=await getTranslations('publicPages.achievements');return <section className="plain wrap"><h1>{pub('title')}</h1>{!items.length?<p>{pub('empty')}</p>:<div className="public-card-grid">{items.map(item=><article className="public-card" key={item.slug}><img src={`/api/achievement-image/${item.slug}`} alt="" loading="lazy" style={{width:'100%',height:'auto',borderRadius:8}}/><h2>{bn?item.title:item.titleEn}</h2><p>{bn?item.name:item.nameEn}</p><Link href={`/${locale}/achievements/${item.slug}`}>{pub('view')}</Link></article>)}</div>}</section>}
