import {connectDB} from '@/lib/db';
import {PracticeTest} from '@/models/PracticeTest';
function configured(){return !!process.env.MONGODB_URI&&!!process.env.NEXTAUTH_SECRET&&!!process.env.NEXTAUTH_URL&&!(process.env.NODE_ENV!=='production'&&process.env.PREVIEW_WITHOUT_SERVICES==='1')}
export async function practiceList(){if(!configured())return [];await connectDB();return PracticeTest.find({published:true}).select('title subject grade slug createdAt').sort({createdAt:-1}).limit(200).lean()}
export async function practiceBySlug(slug:string){if(!configured()||slug.length>80||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return null;await connectDB();return PracticeTest.findOne({slug,published:true}).select('+questions').lean()}
