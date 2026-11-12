'use client';
import {useLocale,useTranslations} from 'next-intl';
import {useRouter} from 'next/navigation';
import type {Digits} from '@/lib/admin/format';
import {useSearchParams} from 'next/navigation';
import {Link,usePathname} from '@/i18n/navigation';
import {navGroups,permitted} from './nav-items';
import {AdminHelp} from './help';
export function TopHeader({name,role,preview,logout,userId,digits}:{name:string;role:string;preview:boolean;logout:()=>Promise<void>;userId:string;digits:Digits}){
 const t=useTranslations('adminRedesign'),locale=useLocale(),router=useRouter(),path=usePathname(),params=useSearchParams();let key='overview';for(const group of navGroups)for(const [href,k] of group.items){const [p,q]=href.split('?');if(permitted(k,role)&&(path===p||(p!=='/admin'&&path.startsWith(p+'/')))&&(!q||q.split('=')[1]===(params.get('kind')||'blog')))key=k}
 if(path==='/admin-preview')key='overview';if(path==='/achievement-preview')key='achievements';
 return <header className="admin-top"><div className="admin-top-page"><span>{t('breadcrumb')} / {t('items.overview')}{key!=='overview'&&<> / {t(`items.${key}`)}</>}</span></div><div className="admin-top-right"><AdminHelp/><Link href="/" target="_blank" rel="noopener noreferrer" className="admin-mini-button">{t('viewSite')}</Link><details className="admin-user-menu"><summary>{name} <span>▾</span></summary><div className="admin-user-dropdown"><strong>{name}</strong><span>{t(`role.${role}`)}</span><label className="admin-digit-setting">{t('digits')} <select value={digits} onChange={e=>{document.cookie=`diction_digits_${userId}=${e.target.value}; Path=/; Max-Age=31536000; SameSite=Lax`;router.refresh()}}><option value="bn">{t('banglaDigits')}</option><option value="en">{t('englishDigits')}</option></select></label><a href={`/${locale==='bn'?'en':'bn'}${path}`} onClick={e=>{e.currentTarget.href=`/${locale==='bn'?'en':'bn'}${path}${window.location.search}${window.location.hash}`}}>{locale==='bn'?'English':'বাংলা'}</a><Link className="admin-site-mobile" href="/" target="_blank" rel="noopener noreferrer">{t('viewSite')}</Link>{!preview&&<><Link href="/account/security">{t('password')}</Link><Link href="/forgot-password">{t('resetPassword')}</Link><form action={logout} onSubmit={e=>{if(!window.confirm(t('logoutConfirm')))e.preventDefault()}}><button type="submit">{t('logout')}</button></form></>}</div></details></div></header>
}
