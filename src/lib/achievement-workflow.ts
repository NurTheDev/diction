import {NextResponse} from 'next/server';
import {getAdmin} from '@/lib/admin/guard';
import {checkRateLimit} from '@/lib/rate-limit';
import {achievementWorkflowEnabled} from '@/lib/achievement-flags';
export async function authorizeAchievementRequest(request:Request,mutation:boolean){
 if(!achievementWorkflowEnabled())return {error:NextResponse.json({error:'disabled'},{status:503})};
 if(mutation){try{const origin=request.headers.get('origin'),host=request.headers.get('host');if(!origin||!host||!process.env.NEXTAUTH_URL||new URL(origin).origin!==new URL(process.env.NEXTAUTH_URL).origin||new URL(origin).host!==host)return {error:NextResponse.json({error:'forbidden'},{status:403})}}catch{return {error:NextResponse.json({error:'forbidden'},{status:403})}}}
 const admin=await getAdmin();if(!admin)return {error:NextResponse.json({error:'unauthorized'},{status:401})};
 if(!await checkRateLimit(`achievements:${admin.id}`,mutation?30:120))return {error:NextResponse.json({error:'rate'},{status:429})};
 return {admin};
}
export async function boundedJson(request:Request,max=4_000_000){
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new Error('invalid');
 const length=Number(request.headers.get('content-length')||0);if(!Number.isFinite(length)||length>max)throw new Error('too_large');
 const reader=request.body?.getReader();if(!reader)throw new Error('invalid');const chunks:Uint8Array[]=[];let total=0;
 while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){await reader.cancel();throw new Error('too_large')}chunks.push(value)}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown}catch{throw new Error('invalid')}
}
export function decodedDataUrl(value:string,mime:'image/jpeg'|'image/png',maxBytes:number){const prefix=`data:${mime};base64,`;if(!value.startsWith(prefix))throw new Error('invalid');const raw=value.slice(prefix.length);if(!raw||raw.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(raw))throw new Error('invalid');const bytes=Buffer.from(raw,'base64');if(bytes.length>maxBytes||bytes.toString('base64')!==raw)throw new Error('invalid');return bytes}
export const privateHeaders={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'};
