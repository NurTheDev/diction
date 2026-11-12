import {redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {getArchiver} from '@/lib/admin/guard';
import {dashboardDigits} from '@/lib/admin/digits';
import {binList,binCounts,recycleRegistry,type RecycleKind} from '@/lib/admin/recycle';
import {formatDate,formatNumber} from '@/lib/admin/format';
import {BinRow} from '@/components/admin/bin-row';
export const dynamic='force-dynamic';

const kinds=new Set(recycleRegistry.map(def=>def.kind));
const DAY=24*60*60*1000;

/**
 * Recycle Bin (R1 §E4). Every binned record across the twelve participating types, with a type
 * filter, search, days left before the scheduled purge, Restore for staff and above, and Delete
 * forever for Super Admin only behind a typed-name confirmation.
 */
export default async function RecycleBin({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{kind?:string;q?:string}>}){
  const {locale}=await params;
  const user=await getArchiver();
  if(!user)redirect(`/${locale}/admin`);
  const query=await searchParams;
  const kind=kinds.has(query.kind as RecycleKind)?query.kind as RecycleKind:undefined;
  const q=(query.q||'').trim().slice(0,80).toLowerCase();
  const language=locale==='bn'?'bn':'en';
  const digits=await dashboardDigits(user.id);
  const t=await getTranslations('recycleBin'),r=await getTranslations('adminRedesign');
  const [entries,counts]=await Promise.all([binList(kind),binCounts()]);
  const total=kind?counts[kind]??0:Object.values(counts).reduce((sum,value)=>sum+value,0);
  const rows=entries.filter(entry=>!q||entry.name.toLowerCase().includes(q)||entry.id.includes(q));
  const canPurge=user.role==='superadmin';
  const now=Date.now();
  return <>
    <div className="admin-heading">
      <div><h1>{t('title')}</h1><p>{t('sub')}</p></div>
    </div>
    <form className="admin-filter list-filter" aria-label={t('search')}>
      <label><span>{t('kind')}</span>
        <select name="kind" className="admin-select" defaultValue={kind??''}>
          <option value="">{t('filterAll')}</option>
          {recycleRegistry.map(def=><option key={def.kind} value={def.kind}>{language==='bn'?def.labelBn:def.labelEn}</option>)}
        </select>
      </label>
      <label><span>{t('search')}</span><input name="q" className="admin-input" defaultValue={q} placeholder={t('search')}/></label>
      <button className="button button-navy">{t('search')}</button>
    </form>
    <section className="admin-panel list-panel">
      <div className="admin-panel-head"><h2>{t('title')}</h2><span className="admin-help">{formatNumber(total,digits)}</span></div>
      {rows.length?<div className="admin-table-wrap"><table className="admin-table admin-responsive-table">
        <thead><tr><th>{t('name')}</th><th>{t('kind')}</th><th>{t('deleted')}</th><th>{t('daysLeftHeader')}</th><th>{r('action')}</th></tr></thead>
        <tbody>{rows.map(entry=>{
          const days=entry.purgeAt?Math.max(0,Math.ceil((entry.purgeAt.getTime()-now)/DAY)):0;
          return <tr key={`${entry.kind}:${entry.id}`}>
            <td data-label={t('name')}><span className="admin-bin-name">{entry.name}</span></td>
            <td data-label={t('kind')}>{language==='bn'?entry.labelBn:entry.labelEn}</td>
            <td data-label={t('deleted')}>{entry.deletedAt?formatDate(entry.deletedAt,digits,language):'—'}</td>
            <td data-label={t('daysLeft')}>{t('daysLeft',{days:formatNumber(days,digits)})}</td>
            <td><BinRow kind={entry.kind} id={entry.id} name={entry.name} canPurge={canPurge}/></td>
          </tr>;
        })}</tbody>
      </table></div>:<div className="admin-empty"><p>{q||kind?t('noResults'):t('empty')}</p></div>}
    </section>
  </>;
}
