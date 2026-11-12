import {intakeEnabled} from '@/lib/service-status';
import {AvailabilityNotice} from '@/components/forms/availability-notice';
import {getTranslations,setRequestLocale} from 'next-intl/server';
import type {Metadata} from 'next';
import {TrialForm} from '@/components/forms/trial-form';
import {IntakeHero} from '@/components/forms/shared';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{const {locale}=await params;const t=await getTranslations({locale,namespace:'forms'});return {title:t('trialTag'),description:t('trialDesc')};}
export default async function Trial({params}:{params:Promise<{locale:string}>}){const {locale}=await params;setRequestLocale(locale);const t=await getTranslations('forms');return <><IntakeHero tag={t('trialTag')} title={t('trialTitle')} description={t('trialDesc')}/><section className="intake-section"><div className="wrap">{intakeEnabled()?<TrialForm/>:<AvailabilityNotice/>}</div></section></>}
