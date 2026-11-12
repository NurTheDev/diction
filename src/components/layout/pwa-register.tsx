'use client';
import {useEffect} from 'react';
export function PwaRegister(){useEffect(()=>{if(process.env.NODE_ENV==='production'&&'serviceWorker' in navigator&&window.isSecureContext){navigator.serviceWorker.register('/sw.js').catch(()=>{/* Offline support is optional. */});}},[]);return null;}
