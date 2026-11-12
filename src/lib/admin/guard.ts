import {getCurrentUser} from '@/lib/current-user';
import {CenterSettings} from '@/models/CenterRecords';

/** A managed role can be switched off as a whole (R1 §E6 third wave): nobody holding it keeps admin access. */
async function roleDisabled(role:string):Promise<boolean>{try{const settings=await CenterSettings.findOne({}).select('disabledRoles').lean() as {disabledRoles?:string[]}|null;return !!settings&&(settings.disabledRoles||[]).includes(role)}catch{return false}}
/** Always check the live role and session version rather than trusting the JWT alone. */
export async function getAdmin(){const user=await getCurrentUser();if(!user||(user.role!=='admin'&&user.role!=='superadmin'))return null;return (await roleDisabled(user.role))?null:user;}
export async function requireAdmin(){const admin=await getAdmin();if(!admin)throw new Error('UNAUTHORIZED');return admin;}

/** Restricted roles are distinct from full admins, so legacy guards remain fail-closed. */
export type StaffPermission='content'|'exams';
export async function getStaff(){const user=await getCurrentUser();if(!user||!['superadmin','admin','staff','content_editor','exam_manager'].includes(user.role))return null;return (await roleDisabled(user.role))?null:user}
/** Archive/hide is the staff floor (owner decision 2026-11-12): staff, admin and super admin. Delete stays behind requireAdmin. */
export async function getArchiver(){const user=await getCurrentUser();if(!user||!['superadmin','admin','staff'].includes(user.role))return null;return (await roleDisabled(user.role))?null:user}
export async function requireArchiver(){const archiver=await getArchiver();if(!archiver)throw new Error('UNAUTHORIZED');return archiver}
export async function getStaffPermission(permission:StaffPermission){const user=await getStaff();if(!user)return null;return user.role==='admin'||user.role==='superadmin'||(permission==='content'&&user.role==='content_editor')||(permission==='exams'&&user.role==='exam_manager')?user:null}
/**
 * List access, one step below authoring: `staff` may open the list to archive or hide a record and
 * to restore it from the Recycle Bin, but never to create, edit or delete. Authoring keeps using
 * getStaffPermission(), so no write action was widened by giving staff a view.
 */
export async function getListAccess(permission:StaffPermission){const user=await getStaff();if(!user)return null;return user.role==='staff'?user:getStaffPermission(permission)}
export async function requireListAccess(permission:StaffPermission){const user=await getListAccess(permission);if(!user)throw new Error('UNAUTHORIZED');return user}
export async function requireStaffPermission(permission:StaffPermission){const user=await getStaffPermission(permission);if(!user)throw new Error('UNAUTHORIZED');return user}
