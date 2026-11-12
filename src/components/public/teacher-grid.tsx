'use client';
import {safeImage} from '@/lib/safe-image';
import {useEffect,useRef,useState} from 'react';
import Image from 'next/image';
import {useTranslations} from 'next-intl';
import {ArrowUpRight,GraduationCap,X} from 'lucide-react';
import type {PublicTeacher} from '@/lib/content/faculty';
export function TeacherGrid({limit,faculty}:{limit?:number;faculty:PublicTeacher[]}){
  const t=useTranslations('pages');const [selected,setSelected]=useState<number|null>(null);const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(selected!==null&&!dialog.current?.open)dialog.current?.showModal();},[selected]);
  const visible=faculty.slice(0,limit);const teacher=selected===null?null:visible[selected];
  return <>{visible.length?<div className="teacher-grid">{visible.map((person,i)=>{const photo=safeImage(person.photoUrl);return <button type="button" className={`teacher-card${photo?' has-photo':''}`} key={person.id} onClick={()=>setSelected(i)} aria-label={`${t('teacherDetails')}: ${person.name}`} aria-haspopup="dialog"><div className={`avatar avatar-${i%4}`}>{photo?<Image src={photo} alt="" fill sizes="(max-width:700px) 50vw, 280px" style={{objectFit:'cover'}}/>:<GraduationCap size={44} strokeWidth={1.4} aria-hidden="true"/>}<span className="avatar-dots" aria-hidden="true">✦</span></div><div className="teacher-info"><span className="card-kicker">{person.director?t('directorRole'):t('faculty')}</span><h3>{person.name}</h3><p>{person.qualification}</p><span className="teacher-view">{t('teacherDetails')} <ArrowUpRight size={16} aria-hidden="true"/></span></div></button>})}</div>:<p className="portal-empty">{t('noFaculty')}</p>}
  <dialog ref={dialog} className="teacher-dialog" onClose={()=>setSelected(null)} onClick={e=>{if(e.target!==e.currentTarget)return;const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.currentTarget.close()}} aria-labelledby="teacher-dialog-title"><button type="button" className="dialog-close" aria-label={t('close')} onClick={()=>dialog.current?.close()}><X size={20}/></button>{teacher&&<><header className="teacher-profile-head"><div className="teacher-profile-avatar">{teacher.photoUrl?<Image src={teacher.photoUrl} alt="" fill sizes="90px"/>:<GraduationCap size={38} strokeWidth={1.3} aria-hidden="true"/>}</div><div className="teacher-profile-title"><span className="card-kicker">{teacher.director?t('directorRole'):t('faculty')}</span><h2 id="teacher-dialog-title">{teacher.name}</h2></div></header><div className="teacher-profile-body"><section><h3>{t('teacherQualifications')}</h3><p>{teacher.qualification}</p></section>{teacher.bio&&<section><h3>{t('teacherBiography')}</h3><p>{teacher.bio}</p></section>}</div></>}</dialog></>;
}
