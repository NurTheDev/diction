import {getAdmin} from '@/lib/admin/guard';
import {checkRateLimit} from '@/lib/rate-limit';
import {sameOrigin} from '@/lib/practice-security';
export async function roleManager(request:Request,mutation:boolean){if(mutation&&!sameOrigin(request))return null;const user=await getAdmin();if(user?.role!=='superadmin'||!await checkRateLimit(`role-management:${user.id}`,30))return null;return user}
