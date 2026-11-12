import {redirect,notFound} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {getPortalUser} from '@/lib/portal-guard';
import {Student} from '@/models/Academic';
import {ModelTest,TestAttempt} from '@/models/ModelTest';
import {idSchema} from '@/schemas/admin';
import {StartTest} from '@/components/model-test/start';
import {TestRunner} from '@/components/model-test/runner';
import {TestReview} from '@/components/model-test/review';
export const dynamic='force-dynamic';
export default async function TestPage({params}:{params:Promise<{locale:string;id:string}>}){const {locale,id}=await params;const user=await getPortalUser('student');if(!user)redirect(`/${locale}/login?callbackUrl=/${locale}/dashboard/model-tests/${id}`);if(!idSchema.safeParse(id).success)notFound();const profile=await Student.findOne({user:user.id}).lean();if(!profile)redirect(`/${locale}/dashboard`);const [test,attempt]=await Promise.all([ModelTest.findOne({_id:id,grade:profile.grade}).lean(),TestAttempt.findOne({student:profile._id,test:id}).select('+snapshot').lean()]);if(!test||(!test.published&&!attempt))notFound();const t=await getTranslations('modelTest');return <><section className="study-hero"><div className="wrap"><Link href="/dashboard/model-tests" className="study-back">← {t('back')}</Link><h1>{locale==='bn'?test.titleBn:test.titleEn}</h1><p>{t('class')} {test.grade} · {test.minutes} {t('minutes')}</p></div></section><section className="study-area"><div className="wrap" style={{maxWidth:850}}>{!attempt?<div className="portal-card"><p>{t('instructions')}</p><p className="study-note">{t('penalty')}: {test.penalty}</p><StartTest id={id}/></div>:attempt.status==='active'?<TestRunner attemptId={String(attempt._id)} deadline={attempt.deadline.toISOString()} questions={attempt.snapshot.map(q=>({prompt:locale==='bn'?q.promptBn:q.promptEn,options:q.options.map(o=>locale==='bn'?o.bn:o.en)}))} initialAnswers={attempt.answers}/>:<><h2 className="content-heading">{t('result')}</h2><TestReview score={attempt.score??0} questions={attempt.snapshot.map((q,i)=>({prompt:locale==='bn'?q.promptBn:q.promptEn,options:q.options.map(o=>locale==='bn'?o.bn:o.en),answer:attempt.answers[i],correct:q.correct,solution:locale==='bn'?q.solutionBn:q.solutionEn}))}/></>}</div></section></>}
