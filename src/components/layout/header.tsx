import Image from 'next/image';
import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {MapPin,Sun} from 'lucide-react';
import type {PublicSettings} from '@/lib/content/settings';
import {HeaderNav} from './header-nav';
/** Identity and address are rendered on the server; only the interactive navigation hydrates. */
export async function Header({site}:{site:PublicSettings}){const t=await getTranslations('nav');const c=await getTranslations('common');return <><div className="topbar"><div className="wrap topinner"><div className="top-left"><Sun size={14}/><span className="top-desktop-copy">{t('top')}</span><span className="top-mobile-copy">{t('since')}</span></div><div className="top-right"><span className="top-address"><MapPin size={13} aria-hidden="true"/>{site.address}</span><span>✦ &nbsp; {t('since')}</span></div></div></div><header className="header"><div className="wrap nav"><Link href="/" className="brand"><Image className="logo" src={site.logoUrl} width={110} height={74} alt={site.name} priority/><span><span className="brand-title" style={{display:'block'}}>{site.name}</span><span className="brand-sub" style={{display:'block'}}>{c('brandSmall')}</span></span></Link><HeaderNav/></div></header></>}
