import {NextResponse} from 'next/server';
import {getPublishedAchievement} from '@/lib/content/achievements';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(_:Request,{params}:{params:Promise<{slug:string}>}){try{const {slug}=await params;const item=await getPublishedAchievement(slug,true);if(!item?.png)return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});return new NextResponse(new Uint8Array(Buffer.isBuffer(item.png)?item.png:item.png.buffer),{headers:{'Content-Type':'image/png','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':'no-store, max-age=0','X-Robots-Tag':'noarchive'}})}catch{return new Response(null,{status:503,headers:{'Cache-Control':'no-store'}})}}
