'use client';
import {useTranslations} from 'next-intl';
export default function Loading(){const t=useTranslations('common');return <section className="portal-area" aria-busy="true" aria-live="polite"><div className="wrap portal-container"><div className="portal-card">{t('loading')}</div></div></section>}
