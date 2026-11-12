'use client';
import {useActionState,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {saveSocialProof,deleteProofMilestoneItem,restoreProofMilestoneItem} from '@/actions/social-proof';
import {showRecycleToast} from './recycle-toast-host';
import type {FeedbackAction} from './action-feedback';
import type {ActionState} from '@/actions/admin';
import type {SocialProof} from '@/schemas/social-proof';

type Milestone=SocialProof['milestones'][number];
type Binned=Milestone&{deletedAt?:string|Date;purgeAt?:string|Date};
const idle:ActionState={status:'idle'};
const DAY=24*60*60*1000;
function payload(index:number):FormData{const data=new FormData();data.set('index',String(index));return data}

/**
 * Milestone delete keeps the R1 promise on a list that lives inside one settings document: the
 * dialog names the milestone and states the 30-day consequence, the toast offers Undo, and the bin
 * below restores until the daily job purges. Same strings, same host, same staff floor.
 */
function MilestoneDelete({index,name}:{index:number;name:string}){
  const w=useTranslations('adminWork'),router=useRouter();
  const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const [pending,setPending]=useState(false);
  async function run(work:()=>Promise<ActionState>,success:string,actions?:FeedbackAction[]):Promise<void>{
    setPending(true);
    try{
      const result=await work();
      showRecycleToast({state:result,success,error:w('deleteFailed'),conflict:result.message,actions:actions??[]});
      if(result.status!=='error')router.refresh();
    }finally{setPending(false)}
  }
  const restore=()=>run(()=>restoreProofMilestoneItem(idle,payload(index)),w('restoredBin'));
  async function remove():Promise<void>{
    setPending(true);
    try{
      const result=await deleteProofMilestoneItem(idle,payload(index));
      const actions:FeedbackAction[]=result.status==='ok'?[{label:w('undoDelete'),run:()=>void restore()}]:[];
      showRecycleToast({state:result,success:w('movedBin'),error:w('deleteFailed'),conflict:result.message,actions});
      if(result.status!=='error')router.refresh();
    }finally{setPending(false)}
  }
  return <>
    <button ref={trigger} type="button" className="admin-mini-button admin-danger-text" disabled={pending} onClick={()=>dialog.current?.showModal()}>{w('deleteAction')}</button>
    <dialog ref={dialog} className="admin-confirm" onClose={()=>trigger.current?.focus()}>
      <h2>{w('deleteNamed',{name})}</h2>
      <p>{w('softBody')}</p>
      <div className="admin-confirm-actions">
        <button type="button" className="admin-mini-button" onClick={()=>dialog.current?.close()}>{w('deleteNo')}</button>
        <button type="button" className="button admin-danger" disabled={pending} onClick={()=>{dialog.current?.close();void remove()}}>{w('deleteYes')}</button>
      </div>
    </dialog>
  </>;
}

function MilestoneRestore({index}:{index:number}){
  const w=useTranslations('adminWork'),b=useTranslations('recycleBin'),router=useRouter();
  const [pending,setPending]=useState(false);
  async function restore():Promise<void>{
    setPending(true);
    try{
      const result=await restoreProofMilestoneItem(idle,payload(index));
      showRecycleToast({state:result,success:w('restoredBin'),error:w('deleteFailed'),conflict:result.message,actions:[]});
      if(result.status!=='error')router.refresh();
    }finally{setPending(false)}
  }
  return <button type="button" className="admin-mini-button" disabled={pending} onClick={()=>void restore()}>{b('restore')}</button>;
}

export function SocialProofForm({initial,binned}:{initial:SocialProof;binned:Binned[]}){
 const t=useTranslations('proof'),a=useTranslations('admin');
 const [state,action,pending]=useActionState(saveSocialProof,{status:'idle'} as ActionState);
 const [milestones,setMilestones]=useState<Milestone[]>(initial.milestones);
 function edit(i:number,part:'year'|'bn'|'en',value:string){setMilestones(rows=>rows.map((row,n)=>n!==i?row:part==='year'?{...row,year:Number(value)}:{...row,title:{...row.title,[part]:value}}))}
 return <form className="admin-edit social-proof-form" style={{maxWidth:'none'}} action={action}>
  <p>{t('adminNote')}</p><label className="proof-check"><input type="checkbox" name="published" defaultChecked={initial.published}/> {t('publish')}</label>
  <div className="admin-slot-grid"><label>{t('students')}<input className="admin-input" type="number" name="studentCount" min="1" max="10000000" step="1" defaultValue={initial.studentCount??''}/></label><label className="proof-check"><input type="checkbox" name="studentMinimum" defaultChecked={initial.studentMinimum}/> {t('minimum')}</label><label>{t('rating')}<input className="admin-input" type="number" name="rating" min="0.1" max="5" step="0.1" defaultValue={initial.rating??''}/></label><label>{t('ratingCount')}<input className="admin-input" type="number" name="ratingCount" min="1" max="10000000" step="1" defaultValue={initial.ratingCount??''}/></label></div>
  <h3>{t('timeline')}</h3><p>{t('timelineHelp')}</p>
  <input type="hidden" name="milestones" value={JSON.stringify(milestones)}/>
  {milestones.map((row,i)=><fieldset className="proof-milestone" key={i}><legend>{t('timeline')} {i+1}</legend><label>{t('year')}<input className="admin-input" type="number" min="1900" max={new Date().getFullYear()} required value={row.year||''} onChange={e=>edit(i,'year',e.target.value)}/></label><label>{t('titleBn')}<input className="admin-input" required minLength={2} maxLength={160} value={row.title.bn} onChange={e=>edit(i,'bn',e.target.value)}/></label><label>{t('titleEn')}<input className="admin-input" required minLength={2} maxLength={160} value={row.title.en} onChange={e=>edit(i,'en',e.target.value)}/></label><MilestoneDelete index={i} name={`${row.title.bn||row.title.en} (${row.year})`}/></fieldset>)}
  <button type="button" className="admin-mini-button" disabled={milestones.length>=8} onClick={()=>setMilestones(rows=>[...rows,{year:new Date().getFullYear(),title:{bn:'',en:''}}])}>{t('add')}</button>
  <button className="button button-navy" disabled={pending}>{pending?a('saving'):a('save')}</button>{state.status!=='idle'&&<p role="status" className={`admin-feedback ${state.status==='ok'?'':'error'}`}>{state.status==='ok'?a('saved'):t('invalid')}</p>}
  <h3>{t('binTitle')}</h3><p>{t('binHelp')}</p>
  {binned.length?binned.map((row,i)=>{const purgeAt=row.purgeAt?new Date(row.purgeAt).getTime():0;const days=Math.max(0,Math.ceil((purgeAt-Date.now())/DAY));return <div className="admin-bin-actions proof-bin-row" key={`bin-${i}`}><strong>{row.title?.bn||row.title?.en} ({row.year})</strong><span>{days} {t('daysLeft')}</span><MilestoneRestore index={i}/></div>}):<p className="admin-empty">{t('emptyBin')}</p>}
 </form>;
}
