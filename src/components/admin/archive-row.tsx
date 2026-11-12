'use client';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {archiveItem} from '@/actions/recycle';
import {ActionFeedback} from './action-feedback';
import type {ActionState} from '@/actions/admin';
import type {RecycleKind} from '@/lib/admin/recycle';

const idle:ActionState={status:'idle'};

/** Archive/hide without deleting — the staff floor (staff, admin, super admin). */
export function ArchiveRow({kind,id}:{kind:RecycleKind;id:string}){
  const t=useTranslations('adminWork'),router=useRouter(),[pending,start]=useTransition();
  const [state,setState]=useState<ActionState>(idle);
  const run=()=>start(async()=>{
    const data=new FormData();data.set('kind',kind);data.set('id',id);
    const result=await archiveItem(idle,data);
    setState(result);
    if(result.status!=='error')router.refresh();
  });
  return <><button type="button" className="admin-mini-button" disabled={pending} onClick={run}>{t('archive')}</button>
    {state.status!=='idle'&&<ActionFeedback state={state} success={t('archived')} error={t('deleteFailed')}/>}</>;
}
