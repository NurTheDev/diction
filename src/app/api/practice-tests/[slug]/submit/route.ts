import {NextResponse} from 'next/server';
import {practiceBySlug} from '@/lib/content/practice-tests';
import {practiceAnswersSchema} from '@/schemas/practice-test';
import {sameOrigin,noStore} from '@/lib/practice-security';
import {boundedJson} from '@/lib/achievement-workflow';
import {checkRateLimit} from '@/lib/rate-limit';
import {getPortalUser} from '@/lib/portal-guard';
import {Student} from '@/models/Academic';
import {PracticeResult} from '@/models/PracticeTest';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{slug:string}>}){try{if(!sameOrigin(request))return NextResponse.json({error:'forbidden'},{status:403,headers:noStore});const {slug}=await params,t=await practiceBySlug(slug);if(!t)return NextResponse.json({error:'not_found'},{status:404,headers:noStore});if(!await checkRateLimit('public-practice',30))return NextResponse.json({error:'rate'},{status:429,headers:noStore});const parsed=practiceAnswersSchema.safeParse(await boundedJson(request,2048));if(!parsed.success||parsed.data.answers.length!==t.questions.length)return NextResponse.json({error:'invalid'},{status:400,headers:noStore});const feedback=t.questions.map((q,i)=>({prompt:q.prompt,options:q.options,correct:q.correct,selected:parsed.data.answers[i],explanation:q.explanation}));const score=feedback.filter(q=>q.correct===q.selected).length;let saved=false;if(parsed.data.save&&process.env.DATA_COLLECTION_ENABLED==='true'){const user=await getPortalUser('student');const profile=user?await Student.findOne({user:user.id}).select('_id').lean():null;if(profile){await PracticeResult.create({student:profile._id,test:t._id,title:t.title,subject:t.subject,score,total:feedback.length});saved=true}}return NextResponse.json({score,total:feedback.length,feedback,saved},{headers:noStore})}catch{return NextResponse.json({error:'unavailable'},{status:503,headers:noStore})}}
