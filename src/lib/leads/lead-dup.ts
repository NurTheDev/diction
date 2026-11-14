/**
 * R3.10 — duplicate phones: the PLAN, and nothing but the plan.
 *
 * The spec's duplicate rule is one sentence with three duties: WARN when a number is already on a lead,
 * SHOW the leads that hold it, and offer "add as sibling" or merge. Two of those duties are reads
 * (`duplicateHolders()` in `leads.ts`) and one is a write; this module owns the thinking behind the
 * write, with no database and no `node:` import, because a merge that overwrites a field somebody
 * filled in is worse than no merge at all and that rule must be provable on its own.
 *
 * Three decisions live here:
 *
 *  - A merge only FILLS. A field the target already has is the target's, even when the source's value
 *    is newer or longer: overwriting would let a mis-tap erase a school name or a guardian, and the
 *    operator who meant to correct a field has the drawer for that. Empty means `''` for text and
 *    `null` for the class group.
 *  - A merge MOVES everything else: every phone the target does not already hold (matched on the
 *    normalized number, keeping the target's own spelling of a shared one), every note with its writer
 *    and its moment, every flag with the raw cell it quotes. Nothing is summarized away.
 *  - A merge keeps the TARGET's family key, and re-points the source's family to it when the two
 *    differed: after the merge they are one household, and the family list is one query on one key.
 *    Tying two leads that stay separate (`tieFamilyKeys`) adopts the SMALLER of their two keys, the
 *    same rule `resolveFamilyKey()` uses when two families turn out to be one, so a tie and a merge
 *    can never disagree about which key a household carries.
 *
 * What this module will NOT do: merge a lead that became something. A source carrying an admission, a
 * trial booking or a student reference is refused here, before the Recycle Bin refuses to bin it, so
 * the operator reads a reason about the conversion rather than about references.
 */
import {familyKeyFromPhones} from './vocab';

/** A phone as both halves the model stores: the normalized number and the text as it was written. */
export interface LeadDupPhone{normalized:string;original:string}
export interface LeadDupNote{at:Date;text:string;outcome:string;by:string}
export interface LeadDupFlag{field:string;code:string;original:string;messageBn:string;messageEn:string;suggested:string}

/**
 * The plain shape the planner reads. `leads.ts` builds one from a live document; a quick-add merge
 * builds the SOURCE side from the form instead, which is why the source of a merge need not exist as
 * a row yet. `converted` and `binned` are the two facts the planner refuses on.
 */
export interface LeadDupDoc{
  id:string;leadId:string;studentName:string;
  guardianName:string;school:string;classLabel:string;classGroup:number|null;
  newSession:boolean;exam:'ssc'|'hsc'|null;examYear:number|null;interestedIn:string;
  phones:LeadDupPhone[];notes:LeadDupNote[];flags:LeadDupFlag[];
  familyKey:string|null;converted:boolean;binned:boolean;
}

export type LeadMergeRefusal={ok:false;code:'MISSING'|'SAME_LEAD'|'SOURCE_CONVERTED';messageKey:string;messageParams:Record<string,string|number>};
function refusal(code:LeadMergeRefusal['code'],messageKey:string,messageParams:Record<string,string|number>={}):LeadMergeRefusal{
  return {ok:false,code,messageKey,messageParams};
}

export interface LeadMergePlan{
  ok:true;
  /** Phones the source holds and the target does not, matched on the normalized number. */
  phonesToAdd:LeadDupPhone[];
  /** Only the fields the target left empty. Never an overwrite. */
  fieldPatch:Record<string,unknown>;
  /** Every note the source has, with its writer and its moment. */
  notesToMove:LeadDupNote[];
  /** The source's flags the target does not already carry, compared on field+code+raw cell. */
  flagsToAdd:LeadDupFlag[];
  /** The key the target ends up carrying. */
  familyKey:string|null;
  /** Set together: every lead still wearing `repointFrom` is moved to `repointTo`. */
  repointFrom:string|null;repointTo:string|null;
  movedNotes:number;movedPhones:number;
}

export function planLeadMerge(target:LeadDupDoc,source:LeadDupDoc):LeadMergePlan|LeadMergeRefusal{
  if(!target||!source||target.binned||source.binned){
    return refusal('MISSING','errors.MISSING');
  }
  if(target.id===source.id)return refusal('SAME_LEAD','errors.SAME_LEAD_MERGE');
  if(source.converted){
    return refusal('SOURCE_CONVERTED','errors.SOURCE_CONVERTED',{student:source.studentName});
  }
  const held=new Set((target.phones||[]).map(phone=>phone.normalized));
  const phonesToAdd=(source.phones||[]).filter(phone=>phone.normalized&&!held.has(phone.normalized));
  const fieldPatch:Record<string,unknown>={};
  if(!target.guardianName&&source.guardianName)fieldPatch.guardianName=source.guardianName;
  if(!target.school&&source.school)fieldPatch.school=source.school;
  if(!target.interestedIn&&source.interestedIn)fieldPatch.interestedIn=source.interestedIn;
  if(target.classGroup==null&&source.classGroup!=null){
    fieldPatch.classLabel=source.classLabel;fieldPatch.classGroup=source.classGroup;
    fieldPatch.newSession=source.newSession;fieldPatch.exam=source.exam;fieldPatch.examYear=source.examYear;
  }else if(!target.classLabel&&source.classLabel){
    fieldPatch.classLabel=source.classLabel;
  }
  const flagKey=(flag:LeadDupFlag):string=>[flag.field,flag.code,flag.original].join('|');
  const owned=new Set((target.flags||[]).map(flagKey));
  const flagsToAdd=(source.flags||[]).filter(flag=>!owned.has(flagKey(flag)));
  const notesToMove=[...(source.notes||[])];
  let familyKey=target.familyKey,repointFrom:string|null=null,repointTo:string|null=null;
  if(!familyKey&&source.familyKey)familyKey=source.familyKey;
  else if(familyKey&&source.familyKey&&source.familyKey!==familyKey){
    repointFrom=source.familyKey;repointTo=familyKey;
  }
  return {ok:true,phonesToAdd,fieldPatch,notesToMove,flagsToAdd,familyKey,repointFrom,repointTo,
    movedNotes:notesToMove.length,movedPhones:phonesToAdd.length};
}

/**
 * "Add as sibling": the new row joins the family that already holds the number, so it inherits that
 * family's key — including when the holder has none yet and the key must be computed from the numbers
 * in front of us. Never the key the new row's own numbers would compute: that is exactly the split
 * `resolveFamilyKey()` exists to prevent.
 */
export function keyForSibling(holderKey:string|null,phones:string[]):string|null{
  return holderKey||familyKeyFromPhones(phones);
}

/**
 * "Keep as a separate lead": two unrelated people can share one number (a shop, a landlord), and the
 * operator saying so must not tie them into one family — so the new row carries NO family key at all,
 * even though computing one from its own numbers would have echoed the holder's key back (the smallest
 * normalized number of the shared number is the same number). The holder keeps its key, the family
 * list stays honest, and the drawer's "shares this number with" block still finds both rows; a later
 * `tieLeadFamily()` is how they become a family on purpose.
 */
export function keyForSeparate(_phones:string[]):string|null{
  return null;
}

/**
 * Tying two leads that STAY two leads: both end up on one family key. With two keys in play the smaller
 * one wins and the other is re-pointed everywhere it is worn; with one, the untied lead adopts it; with
 * none, the key is computed from the union of their numbers — and still never recomputed afterwards.
 */
export function tieFamilyKeys(self:LeadDupDoc,other:LeadDupDoc):{
  familyKey:string|null;repointFrom:string|null;repointTo:string|null;
}{
  const keys=[...new Set([self.familyKey,other.familyKey].filter((key):key is string=>!!key))].sort();
  if(keys.length===2)return {familyKey:keys[0],repointFrom:keys[1],repointTo:keys[0]};
  if(keys.length===1)return {familyKey:keys[0],repointFrom:null,repointTo:null};
  return {
    familyKey:familyKeyFromPhones([...(self.phones||[]),...(other.phones||[])].map(phone=>phone.normalized)),
    repointFrom:null,repointTo:null,
  };
}
