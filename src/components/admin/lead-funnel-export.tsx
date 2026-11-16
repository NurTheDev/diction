'use client';
/**
 * R3 · The funnel's CSV button.
 *
 * Client-side on purpose: the file is the table the operator is looking at, so it is built from the
 * same rows that were just rendered — one source of truth, no second query that could disagree with
 * the screen, and no new server route to authorize. The labels arrive already translated and the
 * numbers already Latin (see `src/lib/leads/funnel-csv.ts`), so this component holds no vocabulary
 * and no locale of its own: it turns rows into a Blob and hands it to the browser.
 */
import {Download} from 'lucide-react';
import {funnelCsv,type FunnelCsvCell} from '@/lib/leads/funnel-csv';

export function LeadFunnelExport({columns,rows,fileName,label,hint}:{
  columns:string[];rows:FunnelCsvCell[][];fileName:string;label:string;hint:string;
}){
  function download(){
    const blob=new Blob([funnelCsv(columns,rows)],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;
    anchor.download=fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Long enough for the browser to have taken the file, short enough not to hold the memory.
    setTimeout(()=>URL.revokeObjectURL(url),4000);
  }
  return <div className="lead-funnel-export">
    <button type="button" className="admin-mini-button" onClick={download}>
      <Download size={15} aria-hidden="true"/>{label}
    </button>
    <span className="admin-help">{hint}</span>
  </div>;
}
