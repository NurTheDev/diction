import type {Metadata} from 'next';
import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {recoveryEnabled} from '@/lib/recovery';
import {CompleteResetForm} from '@/components/forms/recovery-forms';
export const metadata:Metadata={robots:{index:false,follow:false},referrer:'no-referrer'};
export const dynamic='force-dynamic';
export default async function ResetPassword(){const t=await getTranslations('recovery');return <section className="plain wrap"><div className="login-box"><h1>{t('resetTitle')}</h1><p>{t('resetDesc')}</p><noscript><p className="alert">{t('javascript')}</p></noscript>{recoveryEnabled()?<CompleteResetForm/>:<p className="notice-box" role="status">{t('unavailable')}</p>}<p><Link className="text-link" href="/forgot-password">{t('requestAgain')}</Link></p></div></section>}
