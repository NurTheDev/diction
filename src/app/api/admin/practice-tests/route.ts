import {NextResponse} from 'next/server';
import {adminPractice,noStore} from '@/lib/practice-security';
import {boundedJson} from '@/lib/achievement-workflow';
import {practiceTestSchema} from '@/schemas/practice-test';
import {PracticeTest} from '@/models/PracticeTest';
import {audit} from '@/lib/admin/helpers';
import {createSlug} from '@/lib/admin/slug';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(r:Request){try{if(!await adminPractice(r,false))return NextResponse.json({error:'unauthorized'},{status:401,headers:noStore});const items=await PracticeTest.find().select('title subject grade slug published createdAt').sort({createdAt:-1}).limit(200).lean();return NextResponse.json({items:items.map(i=>({id:String(i._id),slug:i.slug,title:i.title,subject:i.subject,grade:i.grade,published:i.published}))},{headers:noStore})}catch{return NextResponse.json({error:'unavailable'},{status:503,headers:noStore})}}
export async function POST(r:Request){try{const admin=await adminPractice(r,true);if(!admin)return NextResponse.json({error:'forbidden'},{status:403,headers:noStore});const data=practiceTestSchema.safeParse(await boundedJson(r,160000));if(!data.success)return NextResponse.json({error:'invalid'},{status:400,headers:noStore});const doc=await PracticeTest.create({...data.data,slug:createSlug(data.data.title,'practice'),published:false,createdBy:admin.id});await audit(admin.id,'practice.create',String(doc._id));return NextResponse.json({id:String(doc._id),slug:doc.slug},{status:201,headers:noStore})}catch{return NextResponse.json({error:'unavailable'},{status:503,headers:noStore})}}
