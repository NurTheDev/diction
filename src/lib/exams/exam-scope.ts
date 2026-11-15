/**
 * R5 · Who may do what with an exam — one answer, read by every exam screen and action.
 *
 * The brief's rule is a wall, not a preference: **a teacher enters marks only for the class groups they
 * are assigned to, and never sees payment data.** So scope is decided here, once, from the live account
 * and the live class list, and every caller asks this module rather than reasoning about roles itself.
 * A screen that guessed would eventually guess wrong in the direction that leaks a ledger.
 *
 * What each role gets:
 *
 *   • **Super Admin / Admin** — everything, every class: create, edit, publish, unpublish, set the scale.
 *   • **Exam Manager** — create, edit and publish for every class, but not the grading scale (that is a
 *     centre-wide policy, and the manager's remit is the exam) and not deletion.
 *   • **Staff** — read and archive/restore through the Recycle Bin, never create or edit: the same floor
 *     the rest of the admin uses (`getListAccess`), so giving staff a view of the exam list widened no
 *     write anywhere.
 *   • **Teacher** — the marks grid for the classes assigned to them, and nothing else: no create, no
 *     edit of the exam's shape, no publish, no scale, and no class they do not take.
 *   • **Every other role, or a role switched off in Role Management** — refused, fail-closed.
 *
 * A teacher's scope is the `teachers` list on `CenterClassGroup`, read fresh on every request: moving a
 * teacher onto or off a class changes what they can mark on the next page load, with no session to
 * invalidate and nothing to remember.
 */
import {CenterClassGroup} from '../../models/CenterRecords';

export interface ExamScope{
  userId:string;role:string;name:string;
  /** May create an exam and change its shape (name, type, date, classes, subjects, bands). */
  manage:boolean;
  /** May publish, and unpublish a published exam. */
  publish:boolean;
  /** May set the centre's grading scale. */
  scale:boolean;
  /** May archive/restore through the Recycle Bin. */
  archive:boolean;
  /** The class groups this actor may touch, or `null` for "every class". */
  classGroups:string[]|null;
  /** True when the scope came from a teacher account: the payment-free portal shape applies. */
  teacher:boolean;
}

/** The assigned class groups of one teacher, as ids; a teacher on no class has an empty scope. */
export async function teacherClassGroups(userId:string):Promise<string[]>{
  const groups=await CenterClassGroup.find({teachers:userId}).select('_id').lean<{_id:unknown}[]>();
  return groups.map(group=>String(group._id));
}

/** True when this scope reaches every one of the exam's class groups. */
export function scopeCovers(scope:ExamScope,classGroups:unknown[]):boolean{
  if(!scope.classGroups)return true;
  const allowed=new Set(scope.classGroups);
  const list=classGroups.map(group=>String(group));
  return list.length>0&&list.every(group=>allowed.has(group));
}

/** True when this scope reaches one class group — the check the marks write and the roster read use. */
export function scopeCoversClass(scope:ExamScope,classGroup:unknown):boolean{
  if(!scope.classGroups)return true;
  return scope.classGroups.includes(String(classGroup));
}

/**
 * The classes this actor may work in, from a full class list.
 *
 * A teacher's every exam screen is filtered through this before anything else is read, which is how the
 * "assigned class groups only" rule holds even for a list query that would otherwise name a class they
 * do not take.
 */
export function scopeFilter(scope:ExamScope):{_id:{$in:string[]}}|Record<string,never>{
  return scope.classGroups?{_id:{$in:scope.classGroups}}:{};
}
