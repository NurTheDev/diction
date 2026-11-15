/**
 * R6 slice 2 — the full backup: every collection the centre owns, read once, serialized plainly, and
 * handed to the export route in two shapes (JSON, and a workbook with one sheet per collection).
 *
 * Two rules decide what leaves the database. Nothing secret travels: the user collection is projected
 * without `passwordHash`, because a backup file lives on laptops and drives and must never be a
 * password oracle. And nothing is invented: rows go out as they are stored, ids as strings, dates as
 * ISO, nested shapes as JSON text inside a cell — a backup somebody has to squint at is a backup
 * somebody will not restore.
 */
import 'server-only';
import {
  CenterActivityLog,CenterCashBatch,CenterClassGroup,CenterDueSnapshot,CenterExam,CenterExamResult,
  CenterFeeWaiver,CenterGradingScale,CenterPayment,CenterSettings,CenterSmsBatch,CenterSmsLog,
  CenterSmsTemplate,CenterStudent,
} from '@/models/CenterRecords';
import {User} from '@/models/User';
import type {WorkbookSheet} from '@/lib/reports/export';

export type BackupCollection={name:string;rows:Record<string,unknown>[]};

const plain=(value:unknown):unknown=>JSON.parse(JSON.stringify(value)) as unknown;

export async function collectBackup():Promise<{generatedAt:string;collections:BackupCollection[]}>{
  const [users,students,classes,payments,cashBatches,waivers,exams,results,scales,templates,smsBatches,smsLogs,settings,activity,dueSnapshots]=
    await Promise.all([
      User.find({}).select('-passwordHash').sort({_id:1}).lean(),
      CenterStudent.find({}).sort({_id:1}).lean(),
      CenterClassGroup.find({}).sort({_id:1}).lean(),
      CenterPayment.find({}).sort({_id:1}).lean(),
      CenterCashBatch.find({}).sort({_id:1}).lean(),
      CenterFeeWaiver.find({}).sort({_id:1}).lean(),
      CenterExam.find({}).sort({_id:1}).lean(),
      CenterExamResult.find({}).sort({_id:1}).lean(),
      CenterGradingScale.find({}).sort({_id:1}).lean(),
      CenterSmsTemplate.find({}).sort({_id:1}).lean(),
      CenterSmsBatch.find({}).sort({_id:1}).lean(),
      CenterSmsLog.find({}).sort({_id:1}).lean(),
      CenterSettings.find({}).sort({_id:1}).lean(),
      CenterActivityLog.find({}).sort({_id:1}).lean(),
      CenterDueSnapshot.find({}).sort({_id:1}).lean(),
    ]);
  const collections:BackupCollection[]=[
    {name:'users',rows:users},{name:'students',rows:students},{name:'classGroups',rows:classes},
    {name:'payments',rows:payments},{name:'cashBatches',rows:cashBatches},{name:'feeWaivers',rows:waivers},
    {name:'exams',rows:exams},{name:'examResults',rows:results},{name:'gradingScales',rows:scales},
    {name:'smsTemplates',rows:templates},{name:'smsBatches',rows:smsBatches},{name:'smsLogs',rows:smsLogs},
    {name:'settings',rows:settings},{name:'activityLogs',rows:activity},{name:'dueSnapshots',rows:dueSnapshots},
  ].map(collection=>({name:collection.name,rows:collection.rows.map(row=>plain(row) as Record<string,unknown>)}));
  return {generatedAt:new Date().toISOString(),collections};
}

const cellOf=(value:unknown):string|number=>{
  if(typeof value==='number'&&Number.isFinite(value))return value;
  if(typeof value==='string')return value;
  if(value===null||value===undefined)return '';
  if(typeof value==='boolean')return value?'true':'false';
  return JSON.stringify(value);
};

/** One sheet per collection: the union of the rows' own keys becomes the header, in first-seen order. */
export function backupSheets(collections:BackupCollection[]):WorkbookSheet[]{
  return collections.map(collection=>{
    const header:string[]=[];
    for(const row of collection.rows)
      for(const key of Object.keys(row))if(!header.includes(key))header.push(key);
    return {
      name:collection.name,
      title:collection.name,
      header,
      rows:collection.rows.map(row=>header.map(key=>cellOf(row[key]))),
    };
  });
}
