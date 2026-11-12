import {NextResponse} from 'next/server';
import bcrypt from 'bcryptjs';
import {roleManager} from '@/lib/admin/role-management';
import {noStore} from '@/lib/practice-security';
import {boundedJson} from '@/lib/achievement-workflow';
import {createStaffSchema} from '@/schemas/admin-staff';
import {User} from '@/models/User';
import {audit} from '@/lib/admin/helpers';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){try{if(!await roleManager(request,false))return NextResponse.json({error:'forbidden'},{status:403,headers:noStore});const items=await User.find({role:{$in:['superadmin','admin','content_editor','exam_manager']}}).select('name email role active').sort({createdAt:-1}).limit(200).lean();return NextResponse.json({items:items.map(x=>({id:String(x._id),name:x.name,email:x.email||'',role:x.role,active:x.active}))},{headers:noStore})}catch{return NextResponse.json({error:'unavailable'},{status:503,headers:noStore})}}
export async function POST(request:Request){try{const actor=await roleManager(request,true);if(!actor)return NextResponse.json({error:'forbidden'},{status:403,headers:noStore});const data=createStaffSchema.safeParse(await boundedJson(request,4096));if(!data.success)return NextResponse.json({error:'invalid'},{status:400,headers:noStore});await User.init();const hash=await bcrypt.hash(data.data.password,12);const doc=await User.create({name:data.data.name,email:data.data.email,role:data.data.role,passwordHash:hash,active:true});await audit(actor.id,'staff.create',String(doc._id));return NextResponse.json({id:String(doc._id)},{status:201,headers:noStore})}catch(e){return NextResponse.json({error:(e as {code?:number}).code===11000?'duplicate':'unavailable'},{status:(e as {code?:number}).code===11000?409:503,headers:noStore})}}
