/**
 * Recycle Bin fields, shared by every record type that participates in soft delete (R1).
 *
 * Rules these fields encode (owner brief, R1): a delete moves the record to the Recycle Bin for
 * 30 days, during which it can be restored; after that the scheduled job purges it for good (and
 * removes its Cloudinary assets). Nothing here ever hard-deletes on its own.
 *
 * Live-vs-bin queries use `$type` on purpose: rows created before R1 have no `deletedAt` at all,
 * and they must stay visible. `deletedAt` is a Date only once a record is in the bin.
 */
import {Schema, type Types} from 'mongoose';

export interface RecycleFields{
  deletedAt?: Date|null;
  deletedBy?: Types.ObjectId|null;
  purgeAt?: Date|null;
}

/** 30 days in the bin, then the scheduled job purges. Fixed by the brief; not a setting. */
export const RECYCLE_RETENTION_DAYS=30;

export function purgeAtFor(now:Date):Date{
  return new Date(now.getTime()+RECYCLE_RETENTION_DAYS*24*60*60*1000);
}

/**
 * Add deletedAt/deletedBy/purgeAt, the purge index, and the invariant that makes the bin safe:
 * every query that does not mention `deletedAt` only sees live rows, for reads AND writes. A
 * binned record therefore disappears from every list, cannot be edited, and cannot be deleted
 * twice — without thirty call sites each remembering a filter. Queries that pass a deletedAt
 * condition (the bin page, restore, purge) or the `recycleAny` option opt out deliberately.
 */
export function addRecycleFields(schema:Schema):void{
  schema.add({
    deletedAt:{type:Date,default:null},
    deletedBy:{type:Schema.Types.ObjectId,ref:'User',default:null},
    purgeAt:{type:Date,default:null},
  });
  schema.index({purgeAt:1},{partialFilterExpression:{purgeAt:{$type:'date'}}});
  const hideBinned=function(this:{options?:{recycleAny?:boolean};getFilter:()=>Record<string,unknown>}){
    if(this.options?.recycleAny)return;
    const filter=this.getFilter();
    if(!filter||typeof filter!=='object'||'deletedAt' in filter)return;
    filter.deletedAt={$not:{$type:'date'}};
  };
  for(const hook of ['find','findOne','countDocuments','findOneAndUpdate','findOneAndReplace','findOneAndDelete','updateOne','updateMany','deleteOne','deleteMany']){
    schema.pre(hook as never,hideBinned as never);
  }
}

/** Documents not in the bin: deletedAt missing (pre-R1 rows) or null. */
export const liveFilter={deletedAt:{$not:{$type:'date'}}} as const;
/** Documents sitting in the bin. */
export const binFilter={deletedAt:{$type:'date'}} as const;
