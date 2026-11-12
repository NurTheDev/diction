import mongoose from 'mongoose';
import {requireAdmin} from '@/lib/admin/guard';
import {loadCashStudent,todayCenterCash} from '@/actions/center-daily';
import {DailyCollection} from '@/components/admin/center-daily-collection';
export const dynamic='force-dynamic';
export default async function Daily({searchParams}:{searchParams:Promise<{student?:string;year?:string;month?:string;fee?:string}>}){await requireAdmin();const q=await searchParams,today=await todayCenterCash(),year=Number(q.year)||Number(today.today.slice(0,4)),month=Number(q.month)||0;let initial=null;if(q.student&&mongoose.isValidObjectId(q.student))try{initial=await loadCashStudent(q.student,year)}catch{}return <DailyCollection initial={initial} initialMonth={month>=1&&month<=12?month:0} initialExtra={q.fee==='admission'?'admission':''} initialToday={today}/>}
