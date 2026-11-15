'use client';
import {useTranslations} from 'next-intl';
import {ArchiveRow} from './archive-row';
import {DeleteRow} from './delete-row';
import {canArchiveKind,type RecycleKind} from '@/lib/admin/recycle-kinds';

/**
 * The destructive controls for one list row (R1 §E4/§E6): Archive for staff and above, Delete
 * (30 days in the Recycle Bin, with Undo) for admin and super admin. Both server actions re-check
 * the role, so these flags only decide what is rendered.
 */
export function RowControls({kind,id,name,canDelete,canArchive,onDone}:{kind:RecycleKind;id:string;name:string;canDelete:boolean;canArchive:boolean;onDone?:()=>void}){
  const t=useTranslations('nav'),archivable=canArchive&&canArchiveKind(kind);
  const controls=<>{archivable&&<ArchiveRow kind={kind} id={id} onDone={onDone}/>}
    {canDelete&&<DeleteRow kind={kind} id={id} name={name} canArchive={archivable} onDone={onDone}/>}</>;
  /* Desk widths show the destructive pair outright; a phone row is a card, and a card keeps its
     Edit button visible and folds the rest into one labelled More menu. */
  return <div className="admin-bin-actions">
    <span className="admin-row-direct">{controls}</span>
    <details className="admin-more admin-more-row"><summary>{t('more')}</summary><div className="admin-more-body">{controls}</div></details>
  </div>;
}
