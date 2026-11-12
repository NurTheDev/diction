'use client';
import {useActionState,useState} from 'react';
import {useTranslations} from 'next-intl';
import {saveSocialProof} from '@/actions/social-proof';
import type {ActionState} from '@/actions/admin';
import type {SocialProof} from '@/schemas/social-proof';

type Milestone=SocialProof['milestones'][number];
export function SocialProofForm({initial}:{initial:SocialProof}){
 const t=useTranslations('proof'),a=useTranslations('admin');
 const [state,action,pending]=useActionState(saveSocialProof,{status:'idle'} as ActionState);
 const [milestones,setMilestones]=useState<Milestone[]>(initial.milestones);
 function edit(i:number,part:'year'|'bn'|'en',value:string){setMilestones(rows=>rows.map((row,n)=>n!==i?row:part==='year'?{...row,year:Number(value)}:{...row,title:{...row.title,[part]:value}}))}
 return <form className="admin-edit social-proof-form" style={{maxWidth:'none'}} action={action}>
  <p>{t('adminNote')}</p><label className="proof-check"><input type="checkbox" name="published" defaultChecked={initial.published}/> {t('publish')}</label>
  <div className="admin-slot-grid"><label>{t('students')}<input className="admin-input" type="number" name="studentCount" min="1" max="10000000" step="1" defaultValue={initial.studentCount??''}/></label><label className="proof-check"><input type="checkbox" name="studentMinimum" defaultChecked={initial.studentMinimum}/> {t('minimum')}</label><label>{t('rating')}<input className="admin-input" type="number" name="rating" min="0.1" max="5" step="0.1" defaultValue={initial.rating??''}/></label><label>{t('ratingCount')}<input className="admin-input" type="number" name="ratingCount" min="1" max="10000000" step="1" defaultValue={initial.ratingCount??''}/></label></div>
  <h3>{t('timeline')}</h3><p>{t('timelineHelp')}</p>
  <input type="hidden" name="milestones" value={JSON.stringify(milestones)}/>
  {milestones.map((row,i)=><fieldset className="proof-milestone" key={i}><legend>{t('timeline')} {i+1}</legend><label>{t('year')}<input className="admin-input" type="number" min="1900" max={new Date().getFullYear()} required value={row.year||''} onChange={e=>edit(i,'year',e.target.value)}/></label><label>{t('titleBn')}<input className="admin-input" required minLength={2} maxLength={160} value={row.title.bn} onChange={e=>edit(i,'bn',e.target.value)}/></label><label>{t('titleEn')}<input className="admin-input" required minLength={2} maxLength={160} value={row.title.en} onChange={e=>edit(i,'en',e.target.value)}/></label><button type="button" className="admin-mini-button" onClick={()=>setMilestones(rows=>rows.filter((_,n)=>n!==i))}>{t('remove')}</button></fieldset>)}
  <button type="button" className="admin-mini-button" disabled={milestones.length>=8} onClick={()=>setMilestones(rows=>[...rows,{year:new Date().getFullYear(),title:{bn:'',en:''}}])}>{t('add')}</button>
  <button className="button button-navy" disabled={pending}>{pending?a('saving'):a('save')}</button>{state.status!=='idle'&&<p role="status" className={`admin-feedback ${state.status==='ok'?'':'error'}`}>{state.status==='ok'?a('saved'):t('invalid')}</p>}
 </form>
}
