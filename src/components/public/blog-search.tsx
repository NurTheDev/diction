'use client';
import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {Search,FileText} from 'lucide-react';
/** Search UI is ready for published posts once the CMS is connected. */
export function BlogSearch(){const t=useTranslations('pages');const [query,setQuery]=useState('');return <><div className="search-box"><Search size={19}/><input aria-label={t('search')} placeholder={t('searchPlaceholder')} value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="empty-state"><div className="empty-icon"><FileText size={27}/></div><h2>{t('coming')}</h2><p>{t('blogEmpty')}</p></div></>}
