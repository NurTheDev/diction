import mongoose from 'mongoose';
import {getAdmin} from '@/lib/admin/guard';
import {CenterClassGroup} from '@/models/CenterRecords';
import {liveClassDues} from '@/lib/center/dues-query';
import {dueCsv} from '@/lib/center/due-csv';
export const dynamic='force-dynamic';
export async function GET(request:Request){const admin=await getAdmin();if(!admin)return new Response('Forbidden',{status:403,headers:{'Cache-Control':'no-store'}});const id=new URL(request.url).searchParams.get('class')||'';if(!mongoose.isValidObjectId(id))return new Response('Invalid class',{status:400,headers:{'Cache-Control':'no-store'}});try{if(!await CenterClassGroup.exists({_id:id,active:true}))return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});const result=await liveClassDues(id);const body=dueCsv(result.rows.map(r=>({studentId:r.student.studentId,name:r.student.name.bn,months:r.months.map(m=>`${m.year}-${String(m.month).padStart(2,'0')}: ${m.due}`).join('; '),total:r.total})));return new Response(body,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="center-overdue.csv"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})}catch{return new Response('Unable to calculate a complete report',{status:503,headers:{'Cache-Control':'no-store'}})}}
