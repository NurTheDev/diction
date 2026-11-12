import {getCurrentUser} from '@/lib/current-user';
type PortalRole='student'|'teacher'|'parent';
/** Re-check the active account, version and exact role for every portal read or mutation. */
export async function getPortalUser(role:PortalRole){const user=await getCurrentUser();return user?.role===role?user:null;}
export async function requirePortalUser(role:PortalRole){const user=await getPortalUser(role);if(!user)throw new Error('UNAUTHORIZED');return user;}
