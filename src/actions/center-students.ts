'use server';
import {randomInt} from 'node:crypto';
import mongoose from 'mongoose';
import {revalidatePath} from 'next/cache';
import {requireAdmin} from '@/lib/admin/guard';
import {acquireCenterLocks,identityLock,studentLock,normalizeIdentityName} from '@/lib/center/import-locks';
import {centerClassSchema,centerStudentSchema,centerStudentEditSchema} from '@/schemas/center';
import {CenterActivityLog,CenterClassGroup,CenterStudent} from '@/models/CenterRecords';
import {User} from '@/models/User';
import {getTranslations} from 'next-intl/server';
export type CenterActionState={status:'idle'|'ok'|'invalid'|'duplicate'|'conflict'|'error';studentId?:string;fields?:string[];/** The operator's own sentence for what the write did, in the language they are reading. */message?:string};
const refresh=()=>{for(const lang of ['bn','en']){revalidatePath(`/${lang}/admin/students`);revalidatePath(`/${lang}/admin/students/dues`);revalidatePath(`/${lang}/admin/students/classes`)}};
/** Group 3: a class has its own page, so a write to a student re-reads the class that student is on. */
const refreshClass=(classId:string)=>{if(!mongoose.isValidObjectId(classId))return;for(const lang of ['bn','en'])revalidatePath(`/${lang}/admin/students/classes/${classId}`)};
export async function createCenterClass(_:CenterActionState,form:FormData):Promise<CenterActionState>{const admin=await requireAdmin();await CenterClassGroup.init();const parsed=centerClassSchema.safeParse(Object.fromEntries(form));if(!parsed.success)return {status:'invalid'};const p=parsed.data;const session=await mongoose.startSession();try{await session.withTransaction(async()=>{const [created]=await CenterClassGroup.create([{name:{bn:p.nameBn,en:p.nameEn},level:p.level,shift:p.shift,academicYear:p.academicYear,active:true,order:0}],{session});await CenterActivityLog.create([{actor:admin.id,action:'class.create',target:created._id,after:{name:created.name,academicYear:p.academicYear,shift:p.shift}}],{session})});refresh();return {status:'ok'}}catch(e){return {status:(e as {code?:number}).code===11000?'duplicate':'error'}}finally{await session.endSession()}}
export async function createCenterStudent(_:CenterActionState,form:FormData):Promise<CenterActionState>{const admin=await requireAdmin(),v=centerStudentSchema.safeParse(Object.fromEntries(form));if(!v.success)return {status:'invalid',fields:v.error.issues.map(i=>String(i.path[0]))};const p=v.data;await CenterStudent.init();if(!await CenterClassGroup.exists({_id:p.classGroup,active:true}))return {status:'invalid',fields:['classGroup']};if(form.get('acceptDuplicate')!=='on'&&await CenterStudent.exists({'name.bn':p.nameBn,classGroup:p.classGroup,guardianPhone:p.guardianPhone,status:{$ne:'removed'}}))return {status:'duplicate'};
 for(let attempt=0;attempt<3;attempt++){const code=`DC-${randomInt(10000000,100000000)}`,session=await mongoose.startSession();try{let id='';await session.withTransaction(async()=>{await acquireCenterLocks([identityLock(p.classGroup,p.nameBn,p.guardianPhone)],session);const current=await CenterClassGroup.exists({_id:p.classGroup,active:true}).session(session);if(!current)throw new Error('Class unavailable');if(form.get('acceptDuplicate')!=='on'){const candidates=await CenterStudent.find({classGroup:p.classGroup,guardianPhone:p.guardianPhone,status:{$ne:'removed'}}).select('name.bn').session(session).lean<{name:{bn:string}}[]>();if(candidates.some(c=>normalizeIdentityName(c.name.bn)===normalizeIdentityName(p.nameBn)))throw new Error('DUPLICATE')}const start={year:p.startYear,month:p.startMonth};const [created]=await CenterStudent.create([{studentId:code,name:{bn:p.nameBn,en:p.nameEn},classGroup:p.classGroup,roll:p.roll,school:p.school,guardianName:p.guardianName,guardianPhone:p.guardianPhone,studentPhone:p.studentPhone,altPhone:p.altPhone,address:p.address,admissionDate:p.admissionDate,startMonth:start,feeHistory:[{effectiveFrom:start,amount:p.monthlyFee}],classHistory:[{classGroup:p.classGroup,effectiveFrom:start}],status:'active',notes:p.notes}],{session});id=String(created._id);await CenterActivityLog.create([{actor:admin.id,action:'student.create',target:created._id,after:created.toObject()}],{session})});refresh();refreshClass(p.classGroup);return {status:'ok',studentId:id}}catch(e){if((e as Error).message==='DUPLICATE')return {status:'duplicate'};if((e as {code?:number}).code!==11000)return {status:'error'}}finally{await session.endSession()}}return {status:'error'}
}

export async function updateCenterStudent(_:CenterActionState,form:FormData):Promise<CenterActionState>{const admin=await requireAdmin();const id=String(form.get('id')||''),revision=String(form.get('revision')||''),versionRaw=String(form.get('version')||'');const version=Number(versionRaw);if(!mongoose.isValidObjectId(id)||!/^\d{4}-\d{2}-\d{2}T/.test(revision)||!/^\d+$/.test(versionRaw)||!Number.isSafeInteger(version))return {status:'invalid'};const parsed=centerStudentEditSchema.safeParse(Object.fromEntries(form));if(!parsed.success)return {status:'invalid',fields:parsed.error.issues.map(i=>String(i.path[0]))};const p=parsed.data;
  const savedMessage=(await getTranslations('center'))('editSaved');
  /* The class this student is on, lifted out of the transaction so the class's own page can be
     re-read after the write commits. */
  let classGroup='';
  const session=await mongoose.startSession();try{await session.withTransaction(async()=>{const before=await CenterStudent.findOne({_id:id,status:{$ne:'removed'}}).session(session).lean<{_id:mongoose.Types.ObjectId;updatedAt:Date;revision?:number;classGroup:mongoose.Types.ObjectId;[key:string]:unknown}>();if(!before||before.updatedAt.toISOString()!==revision||(before.revision??0)!==version)throw new Error('STALE');classGroup=String(before.classGroup);await acquireCenterLocks([studentLock(id),identityLock(String(before.classGroup),p.nameBn,p.guardianPhone)],session);if(form.get('acceptDuplicate')!=='on'){const candidates=await CenterStudent.find({_id:{$ne:id},classGroup:before.classGroup,guardianPhone:p.guardianPhone,status:{$ne:'removed'}}).select('name.bn').session(session).lean<{name:{bn:string}}[]>();if(candidates.some(c=>normalizeIdentityName(c.name.bn)===normalizeIdentityName(p.nameBn)))throw new Error('DUPLICATE')}const result=await CenterStudent.findOneAndUpdate({_id:id,updatedAt:before.updatedAt,...(version===0?{$or:[{revision:0},{revision:{$exists:false}}]}:{revision:version})},{$set:{name:{bn:p.nameBn,en:p.nameEn},roll:p.roll,school:p.school,guardianName:p.guardianName,guardianPhone:p.guardianPhone,studentPhone:p.studentPhone,altPhone:p.altPhone,address:p.address,admissionDate:p.admissionDate,notes:p.notes},$inc:{revision:1}},{new:true,runValidators:true,session}).lean();if(!result)throw new Error('STALE');await CenterActivityLog.create([{actor:admin.id,action:'student.update',target:before._id,before,after:result}],{session})});refresh();refreshClass(classGroup);for(const lang of ['bn','en'])revalidatePath(`/${lang}/admin/students/${id}`);
 return {status:'ok',studentId:id,message:savedMessage}}catch(e){const message=(e as Error).message;return {status:message==='STALE'?'conflict':message==='DUPLICATE'?'duplicate':'error'}}finally{await session.endSession()}}
export type CenterSearchItem={id:string;studentId:string;nameBn:string;nameEn:string;classId:string;classBn:string;classEn:string;
  guardianPhone:string;guardianName:string;studentPhone:string;altPhone:string;roll:string;school:string;notes:string;address:string;admissionDate:string;
  status:'active'|'on_hold'|'removed';fee:number|null;
  /** The two numbers an inline edit carries back, or the write is refused as somebody else's. */
  revision:string;version:number;
  /** What a removed row is described by, and the reason behind the hold a held row is inside. */
  leaveMonth:string;removalReason:string;holdReason:string;
  /** What the student owes now. `null` is "not counted" — a held or removed student is outside the dues
      engine, and a class too big to read costs the row its total rather than reporting a wrong one. */
  dues:number|null;dueMonths:{year:number;month:number;due:number}[]};
export type CenterSearchResult={items:CenterSearchItem[];total:number;page:number;error?:boolean;removed?:boolean};
/** Search uses a server-action POST rather than putting names or phone numbers in the URL. */
/** What each student on the page owes, read from the same engine the dues list reads, one pass per class. */
async function duesForStudents(classIds:string[],now:Date):Promise<{byStudent:Map<string,{total:number;months:{year:number;month:number;due:number}[]}>;failed:Set<string>}>{
  const byStudent=new Map<string,{total:number;months:{year:number;month:number;due:number}[]}>(),failed=new Set<string>();
  const {liveClassDues}=await import('@/lib/center/dues-query');
  for(const classId of [...new Set(classIds)]){
    try{
      const {rows}=await liveClassDues(classId,now);
      for(const row of rows)byStudent.set(String(row.student._id),{total:row.total,months:row.months.map(m=>({year:m.year,month:m.month,due:m.due}))});
    }catch{failed.add(classId)}
  }
  return {byStudent,failed};
}
export async function searchCenterStudents(input:{q:string;classId:string;status:string;page:number;removed?:boolean}):Promise<CenterSearchResult>{
  await requireAdmin();
  const {literalSearch}=await import('@/lib/admin/literal-search');
  const {formatDigits}=await import('@/lib/admin/format');
  const {dhakaCalendar}=await import('@/lib/center/month-status');
  const page=Number.isSafeInteger(input.page)?Math.max(1,Math.min(10000,input.page)):1;
  const q=typeof input.q==='string'?input.q.trim().slice(0,80):'';
  const classId=typeof input.classId==='string'?input.classId:'';
  const status=['active','on_hold','removed'].includes(input.status)?input.status:'';
  /* A removed student is filed away rather than deleted: the list the centre works from holds the
     students it is running, and the show-removed tick is where the ones it stopped running went — the
     same shape as the visitors list's show-closed tick. An explicit status wins over the tick, so
     asking for the removed ones by name needs no tick at all. */
  const removed=input.removed===true;
  if(classId&&!mongoose.isValidObjectId(classId))return {items:[],total:0,page,error:true,removed};
  const filter:Record<string,unknown>={status:status||(removed?{$in:['active','on_hold','removed']}:{$ne:'removed'})};
  if(classId)filter.classGroup=classId;
  if(q){const re=literalSearch(q),digits=literalSearch(formatDigits(q,'en'));filter.$or=[{'name.bn':re},{'name.en':re},{guardianPhone:digits},{studentId:digits}]}
  try{
    type Row={_id:mongoose.Types.ObjectId;studentId:string;name:{bn:string;en:string};classGroup:mongoose.Types.ObjectId;
      guardianPhone:string;guardianName:string;studentPhone:string;altPhone:string;roll:string;school:string;notes:string;address:string;
      admissionDate:string;status:'active'|'on_hold'|'removed';revision?:number;updatedAt:Date;
      feeHistory:{effectiveFrom:{year:number;month:number};amount:number}[];
      holds:{start:{year:number;month:number};end?:{year:number;month:number};reason:string}[];
      removal?:{leaveDate?:string;reason?:string}};
    type Group={_id:mongoose.Types.ObjectId;name:{bn:string;en:string}};
    const [total,students]=await Promise.all([
      CenterStudent.countDocuments(filter),
      CenterStudent.find(filter)
        .select('studentId name classGroup guardianPhone guardianName studentPhone altPhone roll school notes address admissionDate status revision updatedAt feeHistory holds removal')
        .sort({'name.bn':1,_id:1}).skip((page-1)*20).limit(20).lean<Row[]>(),
    ]);
    const groups=await CenterClassGroup.find({_id:{$in:students.map(s=>s.classGroup)}}).select('name').lean<Group[]>();
    const byId=new Map(groups.map(g=>[String(g._id),g.name]));
    const now=new Date(),today=dhakaCalendar(now),current=today.year*12+today.month;
    const owed=await duesForStudents(students.map(s=>String(s.classGroup)),now);
    return {page,total,removed,items:students.map(s=>{
      const group=byId.get(String(s.classGroup));
      const history=[...s.feeHistory].sort((a,b)=>(b.effectiveFrom.year*12+b.effectiveFrom.month)-(a.effectiveFrom.year*12+a.effectiveFrom.month));
      const due=owed.byStudent.get(String(s._id));
      /* The hold a student is inside is the one with no end, or the last one written: its reason is what
         the row owes the operator, because a held student looks idle and is not. */
      const holds=[...(s.holds||[])].reverse();
      const hold=holds.find(h=>!h.end)||holds[0];
      return {id:String(s._id),studentId:s.studentId,nameBn:s.name.bn,nameEn:s.name.en||'',
        classId:String(s.classGroup),classBn:group?.bn||'',classEn:group?.en||'',
        guardianPhone:s.guardianPhone,guardianName:s.guardianName||'',studentPhone:s.studentPhone||'',altPhone:s.altPhone||'',
        roll:s.roll||'',school:s.school||'',notes:s.notes||'',address:s.address||'',admissionDate:s.admissionDate||'',
        status:s.status,
        fee:history.find(f=>f.effectiveFrom.year*12+f.effectiveFrom.month<=current)?.amount??history[history.length-1]?.amount??null,
        revision:s.updatedAt.toISOString(),version:s.revision??0,
        leaveMonth:s.removal?.leaveDate||'',removalReason:s.removal?.reason||'',holdReason:hold?.reason||'',
        dues:s.status==='active'&&!owed.failed.has(String(s.classGroup))?(due?.total??0):null,
        dueMonths:due?.months??[]};
    })};
  }catch{return {items:[],total:0,page,error:true,removed}}
}

/** Update class labels/shift or archive; academic year remains immutable to protect financial history.
    R5: the same form assigns the teachers who take this class, because a teacher's whole exam scope is
    this list and nothing else in the app writes it. */
export async function updateCenterClass(_:CenterActionState,form:FormData):Promise<CenterActionState>{const admin=await requireAdmin(),id=String(form.get('id')||''),revision=String(form.get('revision')||''),nameBn=String(form.get('nameBn')||'').trim(),nameEn=String(form.get('nameEn')||'').trim(),shift=String(form.get('shift')||'').trim(),active=form.get('active')==='on';
  /* Group 3: what this class costs a month. It is the number the class page quotes and the number a
     new student's fee starts from, so it is written here with the rest of the class's own facts. An
     empty box means "leave it as it is" rather than "free". */
  const {formatDigits}=await import('@/lib/admin/format');
  const feeRaw=String(form.get('monthlyFee')??'').trim();
  const feeNumber=feeRaw===''?null:Number(formatDigits(feeRaw,'en'));
  if(feeNumber!==null&&(!Number.isFinite(feeNumber)||feeNumber<0||feeNumber>100000000))return {status:'invalid',fields:['monthlyFee']};
  const monthlyFee=feeNumber===null?null:Math.round(feeNumber);
  if(!mongoose.isValidObjectId(id)||!/^\d{4}-\d{2}-\d{2}T/.test(revision)||!nameBn||nameBn.length>120||nameEn.length>120||shift.length>100)return {status:'invalid'};
 /* The assigned teachers, in the order the form listed them, each one a live `teacher` account. An
    assignment is an authorization, so an id nobody can sign in with is not stored at all, and an id that
    belongs to another role is a refusal rather than a dead entry that looks live — the portal only ever
    lets a `teacher` in. Twelve is the same ceiling the exam form puts on classes. */
 const teacherIds=[...new Set(form.getAll('teacherIds').map(value=>String(value)))];
 if(teacherIds.length>12||teacherIds.some(value=>!mongoose.isValidObjectId(value)))return {status:'invalid',fields:['teacherIds']};
 if(teacherIds.length){const allowed=await User.find({_id:{$in:teacherIds},role:'teacher',active:true}).select('_id').lean<{_id:mongoose.Types.ObjectId}[]>();if(allowed.length!==teacherIds.length)return {status:'invalid',fields:['teacherIds']}}const session=await mongoose.startSession();try{await session.withTransaction(async()=>{const before=await CenterClassGroup.findById(id).session(session).lean<{_id:mongoose.Types.ObjectId;updatedAt:Date}>();if(!before||before.updatedAt.toISOString()!==revision)throw Error('STALE');const after=await CenterClassGroup.findOneAndUpdate({_id:id,updatedAt:before.updatedAt},{$set:{name:{bn:nameBn,en:nameEn},shift,active,teachers:teacherIds,...(monthlyFee===null?{}:{monthlyFee})}},{new:true,runValidators:true,session}).lean();if(!after)throw Error('STALE');await CenterActivityLog.create([{actor:admin.id,action:'class.update',target:before._id,before,after}],{session})});refresh();for(const lang of ['bn','en'])revalidatePath(`/${lang}/admin/students/classes`);return {status:'ok'}}catch(e){return {status:(e as Error).message==='STALE'?'conflict':(e as {code?:number}).code===11000?'duplicate':'error'}}finally{await session.endSession()}}

/** Restore a deliberately removed student, without silently billing the absence interval. */
/**
 * The profile header's two status doors (R8): Hold lifts a student out of the monthly run without
 * losing them, and Remove is the deliberate door to the removed list — a leave month and a reason
 * are required, only admin and super admin may walk it, and both write the activity log.
 */
export async function setStudentHold(_:CenterActionState,form:FormData):Promise<CenterActionState>{const admin=await requireAdmin(),id=String(form.get('id')||''),hold=form.get('hold')==='1';if(!mongoose.isValidObjectId(id))return {status:'invalid'};
  /* The success sentence is fetched BEFORE the write, not after it. Everything after `withTransaction`
     runs on a write that has already committed, so a throw while fetching the sentence — or while
     revalidating a path — used to land in the same `catch` as a refused write and answer `error`: the
     student was held, and the operator was told it was not, with no toast because a toast is raised only
     for `ok`. A sentence that cannot be fetched is a 500, honestly; a committed write is `ok`, always. */
  const holdMessage=(await getTranslations('center'))(hold?'row.holdOk':'row.unholdOk');
  let classGroup='';
  const session=await mongoose.startSession();try{await session.withTransaction(async()=>{const student=await CenterStudent.findById(id).session(session);if(!student||student.status==='removed')throw Error('NOT_HOLDABLE');classGroup=String(student.classGroup);student.status=hold?'on_hold':'active';student.revision+=1;await student.save({session});await CenterActivityLog.create([{actor:admin.id,action:hold?'student.hold':'student.unhold',target:student._id,after:{status:student.status}}],{session})});refresh();refreshClass(classGroup);
  return {status:'ok',message:holdMessage}}catch(error){if(process.env.CENTER_DATA_MODE==='test')console.error('Hold test error:',error);return {status:'error'}}finally{await session.endSession()}}
export async function removeCenterStudent(_:CenterActionState,form:FormData):Promise<CenterActionState>{const admin=await requireAdmin();if(admin.role!=='admin'&&admin.role!=='superadmin')return {status:'error'};const id=String(form.get('id')||''),leave=String(form.get('leave')||''),reason=String(form.get('reason')||'').trim();if(!mongoose.isValidObjectId(id)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(leave)||reason.length<3||reason.length>500)return {status:'invalid'};
  const removeMessage=(await getTranslations('center'))('row.removeOk');
  let classGroup='';
  const session=await mongoose.startSession();try{await session.withTransaction(async()=>{await acquireCenterLocks([studentLock(id)],session);const student=await CenterStudent.findById(id).session(session);if(!student||student.status==='removed')throw Error('NOT_REMOVABLE');classGroup=String(student.classGroup);student.status='removed';student.removal={removedAt:new Date(),removedBy:new mongoose.Types.ObjectId(admin.id),reason,leaveDate:leave};student.revision+=1;await student.save({session});await CenterActivityLog.create([{actor:admin.id,action:'student.remove',target:student._id,after:{leaveDate:leave,reason}}],{session})});refresh();refreshClass(classGroup);for(const lang of ['bn','en'])revalidatePath(`/${lang}/admin/students/removed`);
  return {status:'ok',message:removeMessage}}catch(error){if(process.env.CENTER_DATA_MODE==='test')console.error('Remove test error:',error);return {status:'error'}}finally{await session.endSession()}}
export async function restoreCenterStudent(_:CenterActionState,form:FormData):Promise<CenterActionState>{const admin=await requireAdmin(),id=String(form.get('id')||''),resume=String(form.get('resume')||''),reason=String(form.get('reason')||'').trim();if(!mongoose.isValidObjectId(id)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(resume)||reason.length<3||reason.length>500)return {status:'invalid'};
  const restoreMessage=(await getTranslations('center'))('restore.ok');
  let classGroup='';
  const session=await mongoose.startSession();try{await session.withTransaction(async()=>{await acquireCenterLocks([studentLock(id)],session);const student=await CenterStudent.findById(id).session(session);if(!student||student.status!=='removed'||!student.removal?.leaveDate||/^(?:Workbook import undo:|Import undo:)/.test(student.removal?.reason||''))throw Error('NOT_RESTORABLE');const leave=String(student.removal.leaveDate).slice(0,7),leaveN=Number(leave.slice(0,4))*12+Number(leave.slice(5,7)),resumeN=Number(resume.slice(0,4))*12+Number(resume.slice(5,7));if(resumeN<=leaveN)throw Error('INVALID_RESUME');await acquireCenterLocks([identityLock(String(student.classGroup),student.name.bn,student.guardianPhone)],session);const same=await CenterStudent.find({classGroup:student.classGroup,guardianPhone:student.guardianPhone,status:{$ne:'removed'},_id:{$ne:student._id}}).select('name.bn').session(session).lean<{name:{bn:string}}[]>();if(same.some(x=>normalizeIdentityName(x.name.bn)===normalizeIdentityName(student.name.bn)))throw Error('DUPLICATE');classGroup=String(student.classGroup);const history=student.removal.toObject?student.removal.toObject():student.removal;student.removalHistory.push({...history,restoredAt:new Date(),restoredBy:admin.id,restoreReason:reason,resumeMonth:resume});if(resumeN>leaveN+1){const start=leaveN+1,end=resumeN-1;student.holds.push({start:{year:Math.floor((start-1)/12),month:(start-1)%12+1},end:{year:Math.floor((end-1)/12),month:(end-1)%12+1},reason:`Removed interval: ${reason}`,recordedBy:admin.id})}student.status='active';student.removal=undefined;student.revision+=1;await student.save({session});await CenterActivityLog.create([{actor:admin.id,action:'student.restore',target:student._id,before:history,after:{resumeMonth:resume,reason}}],{session})});refresh();refreshClass(classGroup);for(const l of ['bn','en'])revalidatePath(`/${l}/admin/students/removed`);
  return {status:'ok',message:restoreMessage}}catch(e){if(process.env.CENTER_DATA_MODE==='test')console.error('Restore test error:',e);return {status:(e as Error).message==='DUPLICATE'?'duplicate':'error'}}finally{await session.endSession()}}
