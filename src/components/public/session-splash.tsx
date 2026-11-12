'use client';
import {useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import {useTranslations} from 'next-intl';
import Image from 'next/image';

const sessionKey='diction-intro-seen-v1';
/** A transient, skippable introduction; disabled for reduced motion or unavailable storage. */
export function SessionSplash({logo}:{logo:string}){
 const t=useTranslations('splash');const pathname=usePathname();const [visible,setVisible]=useState(false);const dialog=useRef<HTMLDialogElement>(null);const shownHere=useRef(false);
 useEffect(()=>{
  if(!/^\/(?:bn|en)\/?$/.test(pathname)){dialog.current?.close();setVisible(false);return}
  if(shownHere.current||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  try{if(sessionStorage.getItem(sessionKey))return;sessionStorage.setItem(sessionKey,'1');shownHere.current=true}catch{return}
  setVisible(true);
 },[pathname]);
 useEffect(()=>{if(!visible||!dialog.current)return;if(!dialog.current.open)dialog.current.showModal();const timer=window.setTimeout(()=>{if(dialog.current?.open)dialog.current.close();else setVisible(false)},2600);return ()=>window.clearTimeout(timer)},[visible]);
 if(!visible)return null;
 return <dialog ref={dialog} className="session-splash" aria-labelledby="splash-title" onClose={()=>setVisible(false)}><div className="splash-card"><div className="splash-mark"><Image src={logo} width={100} height={68} alt="" style={{width:100,height:"auto"}}/></div><h2 id="splash-title">{t('title')}</h2><p>{t('tagline')}</p><button type="button" className="button button-navy" autoFocus onClick={()=>dialog.current?.close()}>{t('skip')}</button></div></dialog>;
}
