import {NextResponse} from 'next/server';
import {roleManager} from '@/lib/admin/role-management';
import {noStore} from '@/lib/practice-security';
import {boundedJson} from '@/lib/achievement-workflow';
import {managedStaffRoles,updateStaffSchema} from '@/schemas/admin-staff';
import {User} from '@/models/User';
import {audit} from '@/lib/admin/helpers';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){try{const actor=await roleManager(request,true);if(!actor)return NextResponse.json({error:'forbidden'},{status:403,headers:noStore});const {id}=await params;if(!/^[a-f0-9]{24}$/i.test(id)||id===actor.id)return NextResponse.json({error:'invalid'},{status:400,headers:noStore});const data=updateStaffSchema.safeParse(await boundedJson(request,512));if(!data.success)return NextResponse.json({error:'invalid'},{status:400,headers:noStore});const result=await User.updateOne({_id:id,role:{$in:managedStaffRoles}},{$set:{role:data.data.role,active:data.data.active},$inc:{sessionVersion:1},$unset:{resetTokenHash:1,resetExpiresAt:1}},{runValidators:true});if(!result.matchedCount)return NextResponse.json({error:'not_found'},{status:404,headers:noStore});await audit(actor.id,'staff.role-or-status.update',id);return NextResponse.json({ok:true},{headers:noStore})}catch{return NextResponse.json({error:'unavailable'},{status:503,headers:noStore})}}
