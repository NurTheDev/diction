'use client';
import {useTranslations} from 'next-intl';
export default function ErrorPage({reset}:{error:Error;reset:()=>void}){const t=useTranslations('common');return <section className="plain"><h1>{t('errorTitle')}</h1><button className="button button-navy" onClick={reset}>{t('tryAgain')}</button></section>}
