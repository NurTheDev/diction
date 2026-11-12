'use client';
import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {Link2} from 'lucide-react';
export function Share(){const t=useTranslations('editorial');const [copied,setCopied]=useState(false);const [error,setError]=useState(false);return <button className="button button-white" onClick={async()=>{try{await navigator.clipboard.writeText(window.location.href);setCopied(true);setError(false)}catch{setError(true)}}}><Link2 size={16}/>{copied?t('copied'):error?t('copyError'):t('copyLink')}</button>}
