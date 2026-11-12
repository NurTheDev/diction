import {getCurrentUser} from '@/lib/current-user';
/** Always check the live role and session version rather than trusting the JWT alone. */
export async function getAdmin(){const user=await getCurrentUser();return user&&(user.role==='admin'||user.role==='superadmin')?user:null;}
export async function requireAdmin(){const admin=await getAdmin();if(!admin)throw new Error('UNAUTHORIZED');return admin;}

/** Restricted roles are distinct from full admins, so legacy guards remain fail-closed. */
export type StaffPermission='content'|'exams';
export async function getStaff(){const user=await getCurrentUser();return user&&['superadmin','admin','content_editor','exam_manager'].includes(user.role)?user:null}
export async function getStaffPermission(permission:StaffPermission){const user=await getStaff();if(!user)return null;return user.role==='admin'||user.role==='superadmin'||(permission==='content'&&user.role==='content_editor')||(permission==='exams'&&user.role==='exam_manager')?user:null}
export async function requireStaffPermission(permission:StaffPermission){const user=await getStaffPermission(permission);if(!user)throw new Error('UNAUTHORIZED');return user}
