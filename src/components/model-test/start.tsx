'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {startTest} from '@/actions/model-test';
export function StartTest({id}:{id:string}){const t=useTranslations('modelTest');const router=useRouter();const [busy,setBusy]=useState(false);const [error,setError]=useState(false);const [ready,setReady]=useState(false);useEffect(()=>setReady(true),[]);return <><button className="button button-red" disabled={busy||!ready} onClick={async()=>{setBusy(true);setError(false);try{const result=await startTest(id);if(result.ok)router.refresh();else setError(true)}catch{setError(true)}finally{setBusy(false)}}}>{busy?t('starting'):t('start')}</button>{error&&<p role="alert" className="study-error">{t('error')}</p>}</>}
