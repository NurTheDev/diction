import {connectDB} from '@/lib/db';
import {PublicSheet} from '@/models/PublicSheet';
function configured(){return !!process.env.MONGODB_URI&&!!process.env.NEXTAUTH_SECRET&&!!process.env.NEXTAUTH_URL&&!(process.env.NODE_ENV!=='production'&&process.env.PREVIEW_WITHOUT_SERVICES==='1')}
export async function getPublicSheets(){if(!configured())return [];await connectDB();return await PublicSheet.find({published:true}).select('slug title description className subject bytes createdAt updatedAt').sort({createdAt:-1}).limit(500).lean()}
export async function getPublicSheet(slug:string,withFile=false){if(!configured()||slug.length>80||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return null;await connectDB();const q=PublicSheet.findOne({slug,published:true});if(withFile)q.select('+data');return await q.lean()}
