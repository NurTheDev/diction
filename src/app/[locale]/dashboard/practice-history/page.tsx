import {redirect} from 'next/navigation';
import {getPortalUser} from '@/lib/portal-guard';
import {Student} from '@/models/Academic';
import {PracticeResult} from '@/models/PracticeTest';
import {PracticeHistory} from '@/components/public/practice-history';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{locale:string}>}){const {locale}=await params;const user=await getPortalUser('student');if(!user)redirect(`/${locale}/login?callbackUrl=/${locale}/dashboard/practice-history`);const student=await Student.findOne({user:user.id}).select('_id').lean();const rows=student?await PracticeResult.find({student:student._id}).sort({createdAt:-1}).limit(100).lean():[];return <section className="content-section"><div className="wrap"><PracticeHistory linked={!!student} rows={rows.map(r=>({id:String(r._id),title:r.title,subject:r.subject,score:r.score,total:r.total,date:r.createdAt.toISOString()}))}/></div></section>}
