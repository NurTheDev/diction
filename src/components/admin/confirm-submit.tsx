'use client';
import {useId,useRef} from 'react';
import {useTranslations} from 'next-intl';
/** Place inside the existing action form; no mutation runs until confirmed. */
export function ConfirmSubmit({label,disabled=false}:{label:string;disabled?:boolean}){const id=useId(),t=useTranslations('adminWork'),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);return <><button ref={trigger} type="button" className="admin-mini-button" disabled={disabled} onClick={()=>dialog.current?.showModal()}>{label}</button><dialog ref={dialog} className="admin-confirm" aria-labelledby={id} onClose={()=>trigger.current?.focus()}><h2 id={id}>{t('deleteTitle')}</h2><p>{t('deleteBody')}</p><div className="admin-confirm-actions"><button type="button" className="admin-mini-button" onClick={()=>dialog.current?.close()}>{t('deleteNo')}</button><button type="submit" className="button admin-danger" onClick={()=>dialog.current?.close()}>{t('deleteYes')}</button></div></dialog></>}
