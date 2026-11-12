import {intakeEnabled} from '@/lib/service-status';
import {AvailabilityNotice} from '@/components/forms/availability-notice';
import {getTranslations,setRequestLocale} from 'next-intl/server';
import type {Metadata} from 'next';
import {AdmissionForm} from '@/components/forms/admission-form';
import {IntakeHero} from '@/components/forms/shared';
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{const {locale}=await params;const t=await getTranslations({locale,namespace:'forms'});return {title:t('admissionTag'),description:t('admissionDesc')};}
export default async function Admission({params}:{params:Promise<{locale:string}>}){const {locale}=await params;setRequestLocale(locale);const t=await getTranslations('forms');return <><IntakeHero tag={t('admissionTag')} title={t('admissionTitle')} description={t('admissionDesc')}/><section className="intake-section"><div className="wrap intake-shell">{intakeEnabled()?<AdmissionForm/>:<AvailabilityNotice/>}</div></section></>}
