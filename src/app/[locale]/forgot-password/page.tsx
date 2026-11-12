import type {Metadata} from 'next';
import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {recoveryEnabled} from '@/lib/recovery';
import {RequestResetForm} from '@/components/forms/recovery-forms';
export const metadata:Metadata={robots:{index:false,follow:false},referrer:'no-referrer'};
export const dynamic='force-dynamic';
export default async function ForgotPassword({params}:{params:Promise<{locale:string}>}){const {locale}=await params;const t=await getTranslations('recovery');return <section className="plain wrap"><div className="login-box"><h1>{t('forgotTitle')}</h1><p>{t('forgotDesc')}</p>{recoveryEnabled()?<RequestResetForm locale={locale==='bn'?'bn':'en'}/>:<p className="notice-box" role="status">{t('unavailable')}</p>}<p><Link className="text-link" href="/login">{t('backLogin')}</Link></p></div></section>}
