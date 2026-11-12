'use client';
import {usePathname} from 'next/navigation';
import {useTranslations} from 'next-intl';
export function PublicLoading(){const path=usePathname()||'';const t=useTranslations('quickChat');if(/^\/(?:bn|en)\/(?:admin(?:-preview)?|dashboard|teacher|parent|portal(?:-preview)?|account|study-preview)(?:\/|$)/.test(path))return <div className="plain" role="status">{t('loading')}</div>;return <section className="public-loading" role="status" aria-live="polite" aria-busy="true"><div className="loading-mark" aria-hidden="true"><span/><span/><span/></div><strong>{t('loading')}</strong><small>{t('loadingSub')}</small><div className="loading-skeleton" aria-hidden="true"><i/><i/><i/></div></section>}
