import {getStaffPermission} from '@/lib/admin/guard';
import {checkRateLimit} from '@/lib/rate-limit';
export function sameOrigin(request:Request){try{const origin=request.headers.get('origin'),host=request.headers.get('host');return !!origin&&!!host&&!!process.env.NEXTAUTH_URL&&new URL(origin).origin===new URL(process.env.NEXTAUTH_URL).origin&&new URL(origin).host===host}catch{return false}}
export async function adminPractice(request:Request,mutation:boolean){if(mutation&&!sameOrigin(request))return null;const admin=await getStaffPermission('exams');if(!admin||!await checkRateLimit(`practice-admin:${admin.id}`,60))return null;return admin}
export const noStore={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
