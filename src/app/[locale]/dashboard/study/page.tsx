import {redirect} from 'next/navigation';
import {getPortalUser} from '@/lib/portal-guard';
import {Student} from '@/models/Academic';
import {StudyProgress,DailyCompletion,StudyPlanner} from '@/models/Study';
import {dhakaDay,addDays} from '@/lib/study-date';
import {makeChallenge} from '@/lib/study';
import {StudyLab} from '@/components/study/study-lab';
import {aiStatus} from '@/lib/ai';
export const dynamic='force-dynamic';
export default async function StudyPage({params}:{params:Promise<{locale:string}>}){const {locale}=await params;const user=await getPortalUser('student');if(!user)redirect(`/${locale}/login?callbackUrl=/${locale}/dashboard/study`);const profile=await Student.findOne({user:user.id}).lean();if(!profile)redirect(`/${locale}/dashboard`);const today=dhakaDay();const [progress,completion,planner]=await Promise.all([StudyProgress.findOne({student:profile._id}).lean(),DailyCompletion.exists({student:profile._id,day:today}),StudyPlanner.findOne({student:profile._id}).lean()]);const streak=progress&&[today,addDays(today,-1)].includes(progress.lastMathDay)?progress.mathStreak:0;return <StudyLab locale={locale} enabled={process.env.DATA_COLLECTION_ENABLED==='true'} aiEnabled={aiStatus().ready} view={{today,question:makeChallenge(today,profile.grade).question,completed:!!completion,xp:progress?.xp||0,streak,focusSessions:progress?.focusSessions||0,planner:planner?{examDate:planner.examDate,subjects:planner.subjects,minutes:planner.minutes}:null}}/>}
