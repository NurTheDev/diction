'use client';
import {useActionState,useState} from 'react';
import {useTranslations} from 'next-intl';
import {saveTheme} from '@/actions/theme';
import {safeThemeColor} from '@/schemas/theme';
import type {ActionState} from '@/actions/admin';
export function ThemeForm({primary,action}:{primary:string;action:string}){const t=useTranslations('theme'),a=useTranslations('admin');const [p,setP]=useState(primary),[c,setC]=useState(action);const [state,submit,pending]=useActionState(saveTheme,{status:'idle'} as ActionState);const valid=safeThemeColor(p)&&safeThemeColor(c);return <form className="admin-edit" action={submit}><div className="admin-slot-grid"><label>{t('primary')}<input type="color" name="primary" value={p} onChange={e=>setP(e.target.value)}/><span>{p.toUpperCase()}</span></label><label>{t('action')}<input type="color" name="action" value={c} onChange={e=>setC(e.target.value)}/><span>{c.toUpperCase()}</span></label></div><small>{t('help')}</small>{!valid&&<p className="admin-feedback error" role="alert">{t('contrast')}</p>}<button className="button button-navy" disabled={pending||!valid}>{pending?a('saving'):a('save')}</button>{state.status!=='idle'&&<p role="status" className={`admin-feedback ${state.status==='ok'?'':'error'}`}>{state.status==='ok'?a('saved'):a('failure')}</p>}</form>}
