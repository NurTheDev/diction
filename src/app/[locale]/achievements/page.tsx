import Link from 'next/link';
import {connection} from 'next/server';
import {listPublishedAchievements} from '@/lib/content/achievements';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}){const {locale}=await params;return {title:locale==='bn'?'শিক্ষার্থীদের অর্জন':'Student achievements'}}
export default async function Achievements({params}:{params:Promise<{locale:string}>}){await connection();const {locale}=await params,bn=locale==='bn';const items=await listPublishedAchievements();return <section className="plain wrap"><h1>{bn?'শিক্ষার্থীদের অর্জন':'Student achievements'}</h1>{!items.length?<p>{bn?'এখনো কোনো অর্জন প্রকাশিত হয়নি।':'There are no published achievements yet.'}</p>:<div className="public-card-grid">{items.map(item=><article className="public-card" key={item.slug}><img src={`/api/achievement-image/${item.slug}`} alt="" loading="lazy" style={{width:'100%',height:'auto',borderRadius:8}}/><h2>{bn?item.title:item.titleEn}</h2><p>{bn?item.name:item.nameEn}</p><Link href={`/${locale}/achievements/${item.slug}`}>{bn?'বিস্তারিত দেখুন':'View achievement'}</Link></article>)}</div>}</section>}
