'use client';
import {useTranslations} from 'next-intl';
export default function AdminError({reset}:{error:Error;reset:()=>void}){const t=useTranslations('admin');return <div className="admin-content"><div className="admin-panel"><div className="admin-panel-body"><h2>{t('pageUnavailable')}</h2><button className="admin-mini-button" onClick={reset}>{t('back')}</button></div></div></div>}
