'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {archiveItem} from '@/actions/recycle';
import {showRecycleToast} from './recycle-toast-host';
import type {ActionState} from '@/actions/admin';
import type {RecycleKind} from '@/lib/admin/recycle-kinds';

const idle:ActionState={status:'idle'};

/** Archive/hide without deleting — the staff floor (staff, admin, super admin). */
export function ArchiveRow({kind,id,onDone}:{kind:RecycleKind;id:string;onDone?:()=>void}){
  const t=useTranslations('adminWork'),router=useRouter(),[pending,setPending]=useState(false);
  async function run():Promise<void>{
    setPending(true);
    try{
      const data=new FormData();data.set('kind',kind);data.set('id',id);
      const result=await archiveItem(idle,data);
      showRecycleToast({state:result,success:t('archived'),error:t('deleteFailed')});
      if(result.status!=='error'){router.refresh();onDone?.()}
    }finally{setPending(false)}
  }
  return <button type="button" className="admin-mini-button" disabled={pending} onClick={()=>void run()}>{t('archive')}</button>;
}
