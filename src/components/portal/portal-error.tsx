'use client';
import {useTranslations} from 'next-intl';
export function PortalError({reset}:{reset:()=>void}){const t=useTranslations('academic');return <section className="portal-area"><div className="wrap portal-container"><div className="portal-card"><p>{t('unavailable')}</p><button className="button button-navy" onClick={reset}>{t('tryAgain')}</button></div></div></section>}
