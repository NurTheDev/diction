import {NextResponse} from 'next/server';
import {getPublicSettings} from '@/lib/content/settings';
import {channelVideos,readCursor} from '@/lib/youtube-channel';
export const runtime='nodejs';
export async function GET(request:Request){const cursor=new URL(request.url).searchParams.get('cursor')||'';const secret=process.env.NEXTAUTH_SECRET;if(!cursor||cursor.length>1800||!secret||secret.length<32)return NextResponse.json({error:'invalid'},{status:400});const site=await getPublicSettings('en');if(!readCursor(cursor,site.youtube,secret))return NextResponse.json({error:'invalid'},{status:400});const result=await channelVideos(site.youtube,cursor);if(result.status!=='live')return NextResponse.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});return NextResponse.json({videos:result.videos,cursor:result.cursor},{headers:{'Cache-Control':'public, max-age=300'}})}
