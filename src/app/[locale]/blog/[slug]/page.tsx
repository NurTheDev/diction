import type {Metadata} from 'next';
import Image from 'next/image';
import {notFound} from 'next/navigation';
import {getTranslations,setRequestLocale} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {ArrowLeft} from 'lucide-react';
import {publicEditorial,publicBlogBySlug} from '@/lib/content/editorial';
import {getPublicSheet} from '@/lib/content/public-sheets';
import {BlogVideo} from '@/components/editorial/blog-video';
import {Share} from '@/components/editorial/share';
export const dynamic='force-dynamic';
export async function generateStaticParams(){return (await publicEditorial('blog','en')).map(p=>({slug:p.slug}));}
const article=publicBlogBySlug;
export async function generateMetadata({params}:{params:Promise<{locale:string;slug:string}>}):Promise<Metadata>{const {locale,slug}=await params;const post=await article(locale,slug);if(!post)return {};return {title:post.title,description:post.summary,openGraph:{title:post.title,description:post.summary,...(post.imageUrl?{images:[post.imageUrl]}:{})},alternates:{languages:{bn:`/bn/blog/${slug}`,en:`/en/blog/${slug}`}}};}
export default async function BlogArticle({params}:{params:Promise<{locale:string;slug:string}>}){const {locale,slug}=await params;setRequestLocale(locale);const post=await article(locale,slug);if(!post)notFound();const sheet=post.sheetSlug?await getPublicSheet(post.sheetSlug):null;const p=await getTranslations('pages');const t=await getTranslations('editorial');const pub=await getTranslations('publicPages.blog');return <><section className="page-hero"><div className="wrap"><Link className="text-link" href="/blog"><ArrowLeft size={15}/>{p('blogTag')}</Link><h1>{post.title}</h1><p>{post.summary}</p><div className="editorial-meta">{t('date')}: {new Intl.DateTimeFormat(locale==='bn'?'bn-BD':'en-GB',{dateStyle:'medium',timeZone:'Asia/Dhaka'}).format(new Date(post.createdAt))}</div></div></section><section className="content-section"><div className="wrap" style={{maxWidth:850}}>{post.imageUrl&&<div className="story-image" style={{marginBottom:30}}><Image src={post.imageUrl} alt={post.title} fill sizes="(max-width:800px) 100vw, 850px"/></div>}<article className="article-body" dangerouslySetInnerHTML={{__html:post.body}}/>{post.extraImages.length>0&&<section className="blog-resource"><h2>{pub('images')}</h2><div className="blog-image-grid">{post.extraImages.map((url,i)=><figure key={`${url}-${i}`}><img src={url} alt={`${post.title} — ${pub('imageAlt')} ${i+1}`} loading="lazy"/></figure>)}</div></section>}{post.videoId&&<BlogVideo id={post.videoId}/>}{sheet&&<section className="blog-resource"><h2>{pub('sheet')}</h2><p>{locale==='bn'?sheet.title.bn:sheet.title.en||sheet.title.bn}</p><Link className="button button-navy" href={`/lecture-sheets/${sheet.slug}`}>{pub('sheetCta')}</Link></section>}<div className="form-actions"><Link className="text-link" href="/blog"><ArrowLeft size={15}/>{p('blogTag')}</Link><Share/></div></div></section></>}
