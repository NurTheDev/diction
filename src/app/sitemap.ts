import type {MetadataRoute} from 'next';
import {practiceList} from '@/lib/content/practice-tests';
import {getPublicSheets} from '@/lib/content/public-sheets';
import {publicEditorial} from '@/lib/content/editorial';
export const dynamic='force-dynamic';
const pages=['','about','courses','teachers','facilities','contact','study-buddy','admission','trial-class','demo-classes','blog','practice-tests','lecture-sheets','gallery','notices','results','privacy','terms'];
export default async function sitemap():Promise<MetadataRoute.Sitemap>{const base=process.env.NEXTAUTH_URL;if(!base)return [];const root=base.replace(/\/$/,'');const posts=await publicEditorial('blog','en');const sheets=await getPublicSheets();const practice=await practiceList();return ['bn','en'].flatMap(locale=>[...pages.map(page=>({url:`${root}/${locale}${page?`/${page}`:''}`,changeFrequency:'weekly' as const,priority:page?0.7:1})),...practice.map(test=>({url:`${root}/${locale}/practice-tests/${test.slug}`,changeFrequency:'monthly' as const,priority:0.6})),...sheets.map(sheet=>({url:`${root}/${locale}/lecture-sheets/${sheet.slug}`,lastModified:sheet.updatedAt,changeFrequency:'monthly' as const,priority:0.6})),...posts.map(post=>({url:`${root}/${locale}/blog/${post.slug}`,changeFrequency:'weekly' as const,priority:0.6}))]);}
