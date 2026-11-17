'use client';
/**
 * R9 · Slice 2 · the portal's print button.
 *
 * A teacher's own schedule is worth having on paper — the staff-room wall, a fold in a pocket — so the
 * portal can hand the sheet it is showing to the printer. The button marks the body, the print stylesheet
 * reads the mark and keeps only the sheet, and the mark comes off again when the browser says the print is
 * over.
 *
 * This lives apart from the admin routine's own print button on purpose: it reads no catalog group, so a
 * teacher's screen ships no admin vocabulary in its bundle, and the words on the button are handed in by
 * the page that already has them.
 */
import {useEffect} from 'react';

export function PrintSheetButton({label,hook='notice'}:{label:string;hook?:string}){
  useEffect(()=>{
    if(typeof window==='undefined')return;
    const clear=():void=>{document.body.removeAttribute('data-print')};
    window.addEventListener('afterprint',clear);
    return ()=>window.removeEventListener('afterprint',clear);
  },[]);
  return <button type="button" className="admin-mini-button" data-print={hook}
    onClick={()=>{
      if(typeof document==='undefined')return;
      document.body.setAttribute('data-print',hook);
      window.print();
    }}>{label}</button>;
}
