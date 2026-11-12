import {intakeEnabled} from '@/lib/service-status';
import {AvailabilityNotice} from '@/components/forms/availability-notice';
import {getTranslations,setRequestLocale} from 'next-intl/server';
import {IntakeHero} from '@/components/forms/shared';
import {TrackingForm} from '@/components/forms/tracking-form';
export default async function Tracking({params}:{params:Promise<{locale:string}>}){const {locale}=await params;setRequestLocale(locale);const t=await getTranslations('forms');return <><IntakeHero tag={t('admissionTag')} title={t('trackTitle')} description={t('trackDesc')}/><section className="intake-section"><div className="wrap">{intakeEnabled()?<TrackingForm/>:<AvailabilityNotice/>}</div></section></>}
