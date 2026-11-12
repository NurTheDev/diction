import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {getCurrentUser} from '@/lib/current-user';
import {ChangePasswordForm} from '@/components/forms/change-password-form';
export const metadata:Metadata={robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default async function Security({params}:{params:Promise<{locale:string}>}){const {locale}=await params;if(!await getCurrentUser())redirect(`/${locale}/login?callbackUrl=/${locale}/account/security`);const t=await getTranslations('recovery');return <section className="plain wrap"><div className="login-box"><h1>{t('changeTitle')}</h1><p>{t('changeDesc')}</p><ChangePasswordForm/></div></section>}
