'use client';
import {useId,useState} from 'react';
import {useTranslations} from 'next-intl';
import {Link} from '@/i18n/navigation';
import type {SocialProof} from '@/schemas/social-proof';
import {SettingsForm,type SettingsValue} from './site-settings-form';
import {ThemeForm} from './theme-form';
import {SocialProofForm} from './social-proof-form';
export type SettingsTab='basic'|'contact'|'social'|'logo'|'proof';
export function SettingsScreen({values,primary,action,proof,binned}:{values:SettingsValue;primary:string;action:string;proof:SocialProof;binned:SocialProof['milestones']}){const t=useTranslations('adminModules'),id=useId(),[tab,setTab]=useState<SettingsTab>('basic');const tabs:SettingsTab[]=['basic','contact','social','logo','proof'];return <><div className="admin-settings-nav"><div className="admin-settings-tabs" aria-label={t('settingsDesc')} role="tablist">{tabs.map((key,i)=><button type="button" key={key} role="tab" aria-selected={tab===key} aria-controls={`${id}-${key}`} id={`${id}-tab-${key}`} tabIndex={tab===key?0:-1} onClick={()=>setTab(key)} onKeyDown={e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;e.preventDefault();const index=(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length;setTab(tabs[index]);document.getElementById(`${id}-tab-${tabs[index]}`)?.focus()}}>{t(key)}</button>)}</div><Link className="admin-mini-button" href="/admin/hero">{t('banner')}</Link></div><p className="admin-help">{t('settingsNote')}</p><section className="admin-panel"><div className="admin-panel-body"><SettingsForm values={values} tab={tab} setTab={setTab} id={id}/><div hidden={tab!=='logo'}><h2>{t('logo')}</h2><ThemeForm primary={primary} action={action}/></div><div hidden={tab!=='proof'} role="tabpanel" id={`${id}-proof`} aria-labelledby={`${id}-tab-proof`}><SocialProofForm initial={proof} binned={binned}/></div></div></section></>}
