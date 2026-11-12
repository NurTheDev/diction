import {notFound} from 'next/navigation';
import {StudyLab} from '@/components/study/study-lab';
import {dhakaDay} from '@/lib/study-date';
import {makeChallenge} from '@/lib/study';
export const dynamic='force-dynamic';
export default async function StudyPreview({params}:{params:Promise<{locale:string}>}){if(process.env.NODE_ENV==='production'||process.env.PREVIEW_WITHOUT_SERVICES!=='1')notFound();const {locale}=await params;const today=dhakaDay();return <StudyLab locale={locale} preview view={{question:makeChallenge(today,'8').question,completed:false,xp:0,streak:0,focusSessions:0,today,planner:null}}/>}
