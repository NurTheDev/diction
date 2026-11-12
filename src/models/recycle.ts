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

/** Add deletedAt/deletedBy/purgeAt plus the one index the daily purge job needs. */
export function addRecycleFields(schema:Schema):void{
  schema.add({
    deletedAt:{type:Date,default:null},
    deletedBy:{type:Schema.Types.ObjectId,ref:'User',default:null},
    purgeAt:{type:Date,default:null},
  });
  schema.index({purgeAt:1},{partialFilterExpression:{purgeAt:{$type:'date'}}});
}

/** Documents not in the bin: deletedAt missing (pre-R1 rows) or null. */
export const liveFilter={deletedAt:{$not:{$type:'date'}}} as const;
/** Documents sitting in the bin. */
export const binFilter={deletedAt:{$type:'date'}} as const;
