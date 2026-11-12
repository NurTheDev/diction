import {notFound} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {Sparkles,ArrowRight} from 'lucide-react';
import {Learner,PortalHero,ComingFeatures} from '@/components/portal/learner';
export const dynamic='force-dynamic';
export default async function PortalPreview({params}:{params:Promise<{locale:string}>}){if(process.env.NODE_ENV==='production'||process.env.PREVIEW_WITHOUT_SERVICES!=='1')notFound();const {locale}=await params;const t=await getTranslations('academic');const study=await getTranslations('study');return <><PortalHero title={t('studentPortal')} name={t('student')} preview/><section className="portal-area"><div className="wrap portal-container"><div className="portal-alert">{t('preview')}</div><Learner locale={locale} view={{id:'',name:t('student'),grade:'—',school:'',batches:[],attendance:[],results:[]}}/><div className="study-entry"><div><Sparkles size={20}/><strong>{study('title')}</strong><span>{study('description')}</span></div><Link href="/study-preview" className="button button-navy">{study('open')} <ArrowRight size={15}/></Link></div><ComingFeatures/></div></section></>}
