import {ArchiveRow} from './archive-row';
import {DeleteRow} from './delete-row';
import {canArchiveKind,type RecycleKind} from '@/lib/admin/recycle-kinds';

/**
 * The destructive controls for one list row (R1 §E4/§E6): Archive for staff and above, Delete
 * (30 days in the Recycle Bin, with Undo) for admin and super admin. Both server actions re-check
 * the role, so these flags only decide what is rendered.
 */
export function RowControls({kind,id,name,canDelete,canArchive,onDone}:{kind:RecycleKind;id:string;name:string;canDelete:boolean;canArchive:boolean;onDone?:()=>void}){
  const archivable=canArchive&&canArchiveKind(kind);
  return <div className="admin-bin-actions">
    {archivable&&<ArchiveRow kind={kind} id={id} onDone={onDone}/>}
    {canDelete&&<DeleteRow kind={kind} id={id} name={name} canArchive={archivable} onDone={onDone}/>}
  </div>;
}
