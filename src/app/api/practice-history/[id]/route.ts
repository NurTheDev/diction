import {getPortalUser} from '@/lib/portal-guard';
import {Student} from '@/models/Academic';
import {PracticeResult} from '@/models/PracticeTest';
import {sameOrigin,noStore} from '@/lib/practice-security';
import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){try{if(!sameOrigin(request))return NextResponse.json({error:'forbidden'},{status:403,headers:noStore});const user=await getPortalUser('student');if(!user)return NextResponse.json({error:'unauthorized'},{status:401,headers:noStore});const {id}=await params;if(!/^[a-f0-9]{24}$/i.test(id))return NextResponse.json({error:'not_found'},{status:404,headers:noStore});const student=await Student.findOne({user:user.id}).select('_id').lean();if(!student)return NextResponse.json({error:'not_found'},{status:404,headers:noStore});const r=await PracticeResult.deleteOne({_id:id,student:student._id});return NextResponse.json({ok:!!r.deletedCount},{status:r.deletedCount?200:404,headers:noStore})}catch{return NextResponse.json({error:'unavailable'},{status:503,headers:noStore})}}
