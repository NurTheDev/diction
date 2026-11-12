import {notFound} from 'next/navigation';
import {practiceBySlug} from '@/lib/content/practice-tests';
import {PracticeExam} from '@/components/public/practice-exam';
import type {Metadata} from 'next';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const {slug}=await params;const t=await practiceBySlug(slug);return t?{title:t.title,description:`${t.subject} practice test`}:{robots:{index:false}}}
export default async function Page({params}:{params:Promise<{locale:string;slug:string}>}){const {locale,slug}=await params,t=await practiceBySlug(slug);if(!t)notFound();return <section className="content-section"><div className="wrap"><PracticeExam locale={locale} slug={slug} title={t.title} subject={t.subject} grade={t.grade} questions={t.questions.map(q=>({prompt:q.prompt,options:q.options}))}/></div></section>}
