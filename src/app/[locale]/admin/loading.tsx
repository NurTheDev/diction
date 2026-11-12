'use client';
import {useTranslations} from 'next-intl';
export default function Loading(){const t=useTranslations('adminRedesign');return <div className="admin-content" aria-busy="true" aria-live="polite"><p>{t('loading')}</p><div className="admin-skeleton" aria-hidden="true"><span/><span/><span/></div></div>}
