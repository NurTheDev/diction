import {NextResponse} from 'next/server';
import {practiceBySlug} from '@/lib/content/practice-tests';
import {noStore} from '@/lib/practice-security';
export const dynamic='force-dynamic';
export async function GET(_:Request,{params}:{params:Promise<{slug:string}>}){try{const {slug}=await params,t=await practiceBySlug(slug);if(!t)return NextResponse.json({error:'not_found'},{status:404,headers:noStore});return NextResponse.json({title:t.title,subject:t.subject,grade:t.grade,questions:t.questions.map(q=>({prompt:q.prompt,options:q.options}))},{headers:noStore})}catch{return NextResponse.json({error:'unavailable'},{status:503,headers:noStore})}}
