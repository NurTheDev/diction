import {getTranslations} from 'next-intl/server';
import {Sidebar} from './sidebar';
import {TopHeader} from './top-header';
import type {Digits} from '@/lib/admin/format';
import {signOut} from '@/lib/auth';
import {centerDataMode} from '@/lib/center/data-mode';
export async function AdminShell({children,name,locale,preview=false,superadmin=false,staffRole='admin',counts,userId='preview',digits='bn'}:{children:React.ReactNode;name:string;locale:string;preview?:boolean;superadmin?:boolean;staffRole?:string;counts?:Record<string,number>;userId?:string;digits?:Digits}){const t=await getTranslations('admin');async function logout(){'use server';await signOut({redirectTo:`/${locale}`})}const header=<TopHeader name={name} role={staffRole} preview={preview} logout={logout} userId={userId} digits={digits}/>;
return <div className="admin-shell"><Sidebar preview={preview} superadmin={superadmin} staffRole={staffRole} counts={counts} digits={digits} mobileHeader={header}/><div className="admin-main">{header}{centerDataMode()==='test'&&<div className="admin-test-banner" role="status"><span className="admin-test-full">{t('testModeBanner')}</span><span className="admin-test-short">{t('testModeShort')}</span></div>}{preview&&<div className="admin-preview-banner">{t('preview')}</div>}<main className="admin-content">{children}</main></div></div>}
