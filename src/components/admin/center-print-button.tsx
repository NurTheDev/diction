'use client';
import {useTranslations} from 'next-intl';
export function CenterPrintButton(){const t=useTranslations('center');return <button type="button" className="admin-mini-button" onClick={()=>window.print()}>{t('print')}</button>}
