/**
 * R6 slice 2 — the Super Admin's backup door: `?format=json|xlsx`, nothing else. A backup is the one
 * file that holds every child's record and every taka the centre took, so the door is the narrowest
 * in the building: a super admin session, or a redirect away for anybody else — including staff, who
 * read the reports but do not carry the whole database out of it.
 *
 * A successful export is written down twice: `lastBackupAt` on the settings row, which is what the
 * monthly reminder on Overview counts from, and one `backup.export` line in the activity log, which
 * is what an owner reads a month from now when they ask who took a copy, and when.
 */
import {NextResponse} from 'next/server';
import {getAdmin} from '@/lib/admin/guard';
import {audit} from '@/lib/admin/helpers';
import {CenterSettings} from '@/models/CenterRecords';
import {collectBackup,backupSheets} from '@/lib/admin/backup';
import {XLSX_MIME,xlsxSheets} from '@/lib/reports/export';
import {dhakaCalendar} from '@/lib/center/month-status';

export const dynamic='force-dynamic';

export async function GET(request:Request,{params}:{params:Promise<{locale:string}>}){
  const {locale}=await params;
  const admin=await getAdmin();
  if(admin?.role!=='superadmin')return NextResponse.redirect(new URL(`/${locale}/admin`,request.url));
  const url=new URL(request.url);
  const format=url.searchParams.get('format')==='xlsx'?'xlsx':'json';
  const backup=await collectBackup();
  const now=new Date();
  await CenterSettings.updateOne({key:'main'},{$set:{lastBackupAt:now},$setOnInsert:{key:'main'}},{upsert:true,runValidators:true});
  await audit(admin.id,'backup.export',format);
  const today=dhakaCalendar(now);
  const stamp=`${today.year}-${String(today.month).padStart(2,'0')}-${String(today.day).padStart(2,'0')}`;
  if(format==='xlsx'){
    const body=Buffer.from(xlsxSheets(backupSheets(backup.collections))) as unknown as BodyInit;
    return new NextResponse(body,{headers:{
      'Content-Type':XLSX_MIME,
      'Content-Disposition':`attachment; filename="diction-backup-${stamp}.xlsx"`,
    }});
  }
  return new NextResponse(JSON.stringify(backup,null,2),{headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Content-Disposition':`attachment; filename="diction-backup-${stamp}.json"`,
  }});
}
