import {NextResponse} from 'next/server';
import {connectDB} from '@/lib/db';
import {MediaFile} from '@/models/MediaFile';
export const runtime='nodejs';
/** Media uploaded for the public website is public, never use this for private files. */
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;if(!/^[a-f\d]{24}$/i.test(id))return new Response(null,{status:404});try{await connectDB();const media=await MediaFile.findOne({_id:id,storage:'mongo',format:'webp'}).select('+data');if(!media?.data)return new Response(null,{status:404});return new NextResponse(new Uint8Array(media.data),{headers:{'Content-Type':'image/webp','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':'public, max-age=3600'}})}catch{return new Response(null,{status:503})}}
