'use server';
import {randomInt} from 'node:crypto';
import mongoose from 'mongoose';
import {revalidatePath} from 'next/cache';
import {requireAdmin} from '@/lib/admin/guard';
import {acquireCenterLocks,identityLock,studentLock,normalizeIdentityName} from '@/lib/center/import-locks';
import {centerClassSchema,centerStudentSchema,centerStudentEditSchema,
  centerStudentFeeSchema,centerStudentHoldSchema,centerStudentTransferSchema} from '@/schemas/center';
import {CenterActivityLog,CenterClassGroup,CenterPayment,CenterStudent} from '@/models/CenterRecords';
import {User} from '@/models/User';
import {getTranslations} from 'next-intl/server';
/* S1 · the rules a pause, a move and a price change are made of. They live in a module of their own and
   take plain records, so what a change means is proved without a database and without this door. */
import {monthIndexOf,monthWordOf,planClassTransfer,planFeeChange,planHold,planLift,readMonthWord,
  settledMonthInRange} from '@/lib/center/student-changes';
import {dhakaCalendar} from '@/lib/center/month-status';
import {monthKey} from '@/lib/center/dues';
import {dashboardDigits} from '@/lib/admin/digits';
import {formatNumber} from '@/lib/admin/format';
export type CenterActionState={status:'idle'|'ok'|'invalid'|'duplicate'|'conflict'|'error';studentId?:string;fields?:string[];/** The operator's own sentence for what the write did, in the language they are reading. */message?:string};
const refresh=()=>{for(const lang of ['bn','en']){revalidatePath(`/${lang}/admin/students`);revalidatePath(`/${lang}/admin/students/dues`);revalidatePath(`/${lang}/admin/students/classes`)}};
/** Group 3: a class has its own page, so a write to a student re-reads the class that student is on. */
const refreshClass=(classId:string)=>{if(!mongoose.isValidObjectId(classId))return;for(const lang of ['bn','en'])revalidatePath(`/${lang}/admin/students/classes/${classId}`)};
export async function createCenterClass(_:CenterActionState,form:FormData):Promise<CenterActionState>{const admin=await requireAdmin();await CenterClassGroup.init();const parsed=centerClassSchema.safeParse(Object.fromEntries(form));if(!parsed.success)return {status:'invalid'};const p=parsed.data;const session=await mongoose.startSession();try{await session.withTransaction(async()=>{const [created]=await CenterClassGroup.create([{name:{bn:p.nameBn,en:p.nameEn},level:p.level,shift:p.shift,academicYear:p.academicYear,active:true,order:0}],{session});await CenterActivityLog.create([{actor:admin.id,action:'class.create',target:created._id,after:{name:created.name,academicYear:p.academicYear,shift:p.shift}}],{session})});refresh();return {status:'ok'}}catch(e){return {status:(e as {code?:number}).code===11000?'duplicate':'error'}}finally{await session.endSession()}}
export async function createCenterStudent(_:CenterActionState,form:FormData):Promise<CenterActionState>{const admin=await requireAdmin(),v=centerStudentSchema.safeParse(Object.fromEntries(form));if(!v.success)return {status:'invalid',fields:v.error.issues.map(i=>String(i.path[0]))};const p=v.data;await CenterStudent.init();if(!await CenterClassGroup.exists({_id:p.classGroup,active:true}))return {status:'invalid',fields:['classGroup']};if(form.get('acceptDuplicate')!=='on'&&await CenterStudent.exists({'name.bn':p.nameBn,classGroup:p.classGroup,guardianPhone:p.guardianPhone,status:{$ne:'removed'}}))return {status:'duplicate'};
 for(let attempt=0;attempt<3;attempt++){const code=`DC-${randomInt(10000000,100000000)}`,session=await mongoose.startSession();try{let id='';await session.withTransaction(async()=>{await acquireCenterLocks([identityLock(p.classGroup,p.nameBn,p.guardianPhone)],session);const current=await CenterClassGroup.findOne({_id:p.classGroup,active:true}).select('name').session(session).lean<{name:{bn:string;en:string}}|null>();if(!current)throw new Error('Class unavailable');if(form.get('acceptDuplicate')!=='on'){const candidates=await CenterStudent.find({classGroup:p.classGroup,guardianPhone:p.guardianPhone,status:{$ne:'removed'}}).select('name.bn').session(session).lean<{name:{bn:string}}[]>();if(candidates.some(c=>normalizeIdentityName(c.name.bn)===normalizeIdentityName(p.nameBn)))throw new Error('DUPLICATE')}const start={year:p.startYear,month:p.startMonth};const [created]=await CenterStudent.create([{studentId:code,name:{bn:p.nameBn,en:p.nameEn},classGroup:p.classGroup,roll:p.roll,school:p.school,guardianName:p.guardianName,guardianPhone:p.guardianPhone,studentPhone:p.studentPhone,altPhone:p.altPhone,address:p.address,admissionDate:p.admissionDate,startMonth:start,feeHistory:[{effectiveFrom:start,amount:p.monthlyFee}],classHistory:[{classGroup:p.classGroup,name:{bn:current.name.bn,en:current.name.en||''},effectiveFrom:start,changedBy:admin.id,changedAt:new Date()}],status:'active',notes:p.notes}],{session});id=String(created._id);await CenterActivityLog.create([{actor:admin.id,action:'student.create',target:created._id,after:created.toObject()}],{session})});refresh();refreshClass(p.classGroup);return {status:'ok',studentId:id}}catch(e){if((e as Error).message==='DUPLICATE')return {status:'duplicate'};if((e as {code?:number}).code!==11000)return {status:'error'}}finally{await session.endSession()}}return {status:'error'}
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
  /** What the student owes now. `null` is "not counted" — a removed student is outside the dues engine,
      and a class too big to read costs the row its total rather than reporting a wrong one. A paused
      student IS counted, because S1 stopped a pause from forgiving the months before it: the chip reads
      the arrears the student arrived with, and the months inside the pause are not in it. */
  dues:number|null;dueMonths:{year:number;month:number;due:number}[];
  /** The month the pause the row is inside took effect, as `YYYY-MM`, or empty when there is none. */
  holdFrom:string};
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
      const holdFrom=hold&&hold.start?`${hold.start.year}-${String(hold.start.month).padStart(2,'0')}`:'';
      /* A pause with no month on it is a pause the fee run cannot place, so the row reads "not counted"
         rather than "no dues": the first names a gap somebody can close by giving the pause its month,
         the second reads as an account that is settled. */
      const heldNoMonth=s.status==='on_hold'&&!(s.holds||[]).some(h=>h.start);
      return {id:String(s._id),studentId:s.studentId,nameBn:s.name.bn,nameEn:s.name.en||'',
        classId:String(s.classGroup),classBn:group?.bn||'',classEn:group?.en||'',
        guardianPhone:s.guardianPhone,guardianName:s.guardianName||'',studentPhone:s.studentPhone||'',altPhone:s.altPhone||'',
        roll:s.roll||'',school:s.school||'',notes:s.notes||'',address:s.address||'',admissionDate:s.admissionDate||'',
        status:s.status,
        fee:history.find(f=>f.effectiveFrom.year*12+f.effectiveFrom.month<=current)?.amount??history[history.length-1]?.amount??null,
        revision:s.updatedAt.toISOString(),version:s.revision??0,
        leaveMonth:s.removal?.leaveDate||'',removalReason:s.removal?.reason||'',holdReason:hold?.reason||'',
        dues:s.status==='removed'||heldNoMonth||owed.failed.has(String(s.classGroup))?null:(due?.total??0),
        dueMonths:due?.months??[],holdFrom};
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
/* The three histories a student carries, read as plain records. The model infers `any` for a subdocument
   array, and a planner that receives `any` is a planner nobody can prove: each is named here, and the
   door hands its planners these shapes and nothing else. */
/* An actor's id read off a stored row: the record holds an ObjectId where a planner's row declares the
   string it plans with. */
const stampOf=(value:unknown):string|undefined=>value?String(value):undefined;
type HoldLike={start:{year:number;month:number};end?:{year:number;month:number}|null;reason?:string;
  recordedBy?:unknown;endedBy?:unknown;createdAt?:Date;closedAt?:Date};
type ClassStepLike={classGroup:unknown;name?:{bn?:string;en?:string}|null;reason?:string;
  changedBy?:unknown;changedAt?:Date;effectiveFrom:{year:number;month:number}};
type FeeStepLike={amount?:number;reason?:string;changedBy?:unknown;changedAt?:Date;effectiveFrom:{year:number;month:number}};

/* S1 · F-01: a pause is a range of months, not a flag. The badge and the ⋯ menu both arrive here with
   the month the operator picked — `fromMonth` for a pause, `resume` for lifting one — and the record
   keeps one open range at a time: a pause appends it, a lift closes it at the month BEFORE the one the
   student resumes in, so the resume month is billed and every month inside the range stays unbilled for
   good. Nothing here touches what the student owed before the pause, which is why a paused student's
   arrears are still on the class's due list: a pause stops the meter, it does not forgive the run. */
export async function setStudentHold(_:CenterActionState,form:FormData):Promise<CenterActionState>{
  const admin=await requireAdmin(),v=centerStudentHoldSchema.safeParse(Object.fromEntries(form));
  if(!v.success)return {status:'invalid',fields:v.error.issues.map(issue=>String(issue.path[0]||''))};
  const {id,reason}=v.data,hold=v.data.hold==='1',month=readMonthWord(hold?v.data.fromMonth:v.data.resume);
  if(!month)return {status:'invalid',fields:[hold?'fromMonth':'resume']};
  const t=await getTranslations('center');
  /* Every sentence this action can answer with is fetched BEFORE the write, the way the class door does
     it: a throw after a committed transaction must never turn an `ok` into an `error` and leave the
     operator with a write they were told had failed. */
  const words={ok:t(hold?'row.holdOk':'row.unholdOk'),already:t('holdDoor.already'),notHeld:t('holdDoor.notHeld'),
    tooEarly:t('holdDoor.tooEarly'),removed:t('holdDoor.removed'),failed:t('failure')};
  let classGroup='';
  const session=await mongoose.startSession();
  try{
    await session.withTransaction(async()=>{
      await acquireCenterLocks([studentLock(id)],session);
      const student=await CenterStudent.findById(id).session(session);
      if(!student||student.status==='removed')throw Error('NOT_HOLDABLE');
      classGroup=String(student.classGroup||'');
      /* Read as plain months, not spread out of Mongoose: a subdocument carries its fields behind
         getters, so spreading one copies its internals and the planner would read an empty record.
         Whole rows all the same. A pause the record already holds carries the name of whoever wrote it,
         and the schema requires that name, so a lift that handed the planner a picked-over copy was
         refused by the very record it was closing: the door answered "not saved" and no lift of a stored
         pause could ever be written. The stamps of an older move or an older price travel for the same
         reason — a timeline that forgets who made its earlier lines is a timeline nobody can trust. */
      const holds=((student.holds||[]) as HoldLike[]).map(entry=>({start:{year:entry.start.year,month:entry.start.month},
        end:entry.end?{year:entry.end.year,month:entry.end.month}:undefined,reason:entry.reason||'',
        recordedBy:stampOf(entry.recordedBy),endedBy:stampOf(entry.endedBy),createdAt:entry.createdAt,closedAt:entry.closedAt}));
      const now=new Date();
      let heldUntil='';
      if(hold){
        const planned=planHold({status:student.status,holds},{fromMonth:month,reason,actorId:admin.id,now});
        student.set('status',planned.status);student.set('holds',planned.holds);
      }else{
        const planned=planLift({status:student.status,holds},{resumeMonth:month,actorId:admin.id,now});
        student.set('status',planned.status);student.set('holds',planned.holds);
        heldUntil=planned.closed&&planned.closed.end?monthWordOf(planned.closed.end):'';
      }
      student.revision+=1;
      await student.save({session});
      await CenterActivityLog.create([{actor:admin.id,action:hold?'student.hold':'student.unhold',target:student._id,
        after:hold?{status:'on_hold',fromMonth:monthWordOf(month),reason:reason||''}
          :{status:'active',resumeMonth:monthWordOf(month),heldUntil}}],{session});
    });
    refresh();refreshClass(classGroup);
    return {status:'ok',message:words.ok};
  }catch(error){
    const code=(error as Error).message;
    if(process.env.CENTER_DATA_MODE==='test')console.error('Hold test error:',error);
    /* Each refusal is the planner's own rule, named: a second open pause, a lift with nothing to lift,
       and a resume month that would close the range backwards. */
    return code==='ALREADY_HELD'?{status:'invalid',fields:['fromMonth'],message:words.already}
      :code==='NOT_HELD'?{status:'invalid',fields:['resume'],message:words.notHeld}
      :code==='RESUME_TOO_EARLY'?{status:'invalid',fields:['resume'],message:words.tooEarly}
      :code==='NOT_HOLDABLE'?{status:'error',message:words.removed}
      :{status:'error',message:words.failed};
  }finally{await session.endSession()}
}

/* S1 · F-02: a student moves to another class from a month, and the classes they sat in before it stay
   on the record. `classGroup` is the class they are in — the roll, the dues and the routine all read it
   — and `classHistory` is the timeline behind it, one line per move, so a month's class context is a
   fact somebody can print rather than a memory. Both class pages are re-read: the one the student left
   loses a row and the one they arrived on gains one. */
export async function transferStudentClass(_:CenterActionState,form:FormData):Promise<CenterActionState>{
  const admin=await requireAdmin(),v=centerStudentTransferSchema.safeParse(Object.fromEntries(form));
  if(!v.success)return {status:'invalid',fields:v.error.issues.map(issue=>String(issue.path[0]||''))};
  const {id,classGroup:targetId,reason}=v.data,month=readMonthWord(v.data.month);
  if(!month)return {status:'invalid',fields:['month']};
  const t=await getTranslations('center');
  const words={ok:t('transferDoor.ok'),same:t('transferDoor.same'),noClass:t('transferDoor.noClass'),
    before:t('transferDoor.beforeStart'),removed:t('transferDoor.removed'),failed:t('failure')};
  let from='',to='';
  const session=await mongoose.startSession();
  try{
    await session.withTransaction(async()=>{
      await acquireCenterLocks([studentLock(id)],session);
      const student=await CenterStudent.findById(id).session(session);
      if(!student||student.status==='removed')throw Error('NOT_TRANSFERABLE');
      /* Only a class the centre runs takes a student: an archived class is a history line, not a roll. */
      const target=await CenterClassGroup.findOne({_id:targetId,active:true}).select('name').session(session)
        .lean<{name:{bn:string;en?:string}}|null>();
      if(!target)throw Error('NO_CLASS');
      from=String(student.classGroup||'');to=targetId;
      const current=mongoose.isValidObjectId(from)
        ?await CenterClassGroup.findById(from).select('name').session(session).lean<{name:{bn:string;en?:string}}|null>()
        :null;
      const planned=planClassTransfer(
        {classGroup:from,startMonth:{year:student.startMonth.year,month:student.startMonth.month},
          classHistory:((student.classHistory||[]) as ClassStepLike[]).map(entry=>({classGroup:String(entry.classGroup),
            name:{bn:entry.name?.bn||'',en:entry.name?.en||''},reason:entry.reason||'',
            changedBy:stampOf(entry.changedBy),changedAt:entry.changedAt,
            effectiveFrom:{year:entry.effectiveFrom.year,month:entry.effectiveFrom.month}}))},
        {targetClassId:targetId,targetClassName:{bn:target.name.bn,en:target.name.en||''},
          from:{id:from,name:{bn:current?.name.bn||'',en:current?.name.en||''}},
          effectiveMonth:month,reason,actorId:admin.id,now:new Date()});
      student.classGroup=new mongoose.Types.ObjectId(targetId);
      student.set('classHistory',planned.classHistory);
      student.revision+=1;
      await student.save({session});
      await CenterActivityLog.create([{actor:admin.id,action:'student.transfer',target:student._id,
        before:{classGroup:from},after:{classGroup:to,effectiveMonth:monthWordOf(month),reason:reason||''}}],{session});
    });
    refresh();refreshClass(from);refreshClass(to);
    return {status:'ok',message:words.ok};
  }catch(error){
    const code=(error as Error).message;
    if(process.env.CENTER_DATA_MODE==='test')console.error('Transfer test error:',error);
    return code==='SAME_CLASS'?{status:'invalid',fields:['classGroup'],message:words.same}
      :code==='NO_CLASS'?{status:'invalid',fields:['classGroup'],message:words.noClass}
      :code==='BEFORE_START'?{status:'invalid',fields:['month'],message:words.before}
      :code==='NOT_TRANSFERABLE'?{status:'error',message:words.removed}
      :{status:'error',message:words.failed};
  }finally{await session.endSession()}
}

/* S1 · F-03: the price moves from a month, and the months before it keep the price they were billed at.
   The dues engine already reads `feeHistory` that way — each month takes the newest line whose
   `effectiveFrom` has arrived — so this door adds a line and changes nothing else. The one thing it
   refuses is reaching back over money the centre has taken: a month that was settled at a price was
   settled at that price, and the refusal names the month that stopped it. */
export async function updateStudentMonthlyFee(_:CenterActionState,form:FormData):Promise<CenterActionState>{
  const admin=await requireAdmin(),v=centerStudentFeeSchema.safeParse(Object.fromEntries(form));
  if(!v.success)return {status:'invalid',fields:v.error.issues.map(issue=>String(issue.path[0]||''))};
  const {id,fee,reason}=v.data,month=readMonthWord(v.data.month);
  if(!month)return {status:'invalid',fields:['month']};
  const t=await getTranslations('center');
  /* The month a refusal is about is printed in the operator's own words and digits: a Bangla screen that
     answers "2026-02" is an answer nobody can read against the receipt in their hand. */
  const digits=await dashboardDigits(admin.id),months=t.raw('monthNames') as string[];
  const monthLabel=(value:{year:number;month:number}):string=>
    `${months[value.month-1]||''} ${formatNumber(value.year,digits)}`;
  const words={ok:t('feeDoor.ok'),before:t('feeDoor.beforeStart'),removed:t('feeDoor.removed'),failed:t('failure'),
    settled:t('feeDoor.settled')};
  let classGroup='',settledLabel='';
  const session=await mongoose.startSession();
  try{
    await session.withTransaction(async()=>{
      await acquireCenterLocks([studentLock(id)],session);
      const student=await CenterStudent.findById(id).session(session);
      if(!student||student.status==='removed')throw Error('NOT_BILLABLE');
      classGroup=String(student.classGroup||'');
      /* What the centre has already taken, month by month — the same sum the dues engine reads. */
      const paid=await CenterPayment.aggregate<{_id:{year:number;month:number};paid:number}>([
        {$match:{student:new mongoose.Types.ObjectId(id),type:'monthly',status:'valid'}},
        {$group:{_id:{year:'$academicYear',month:'$month'},paid:{$sum:'$amount'}}},
      ]).session(session);
      const payments:Record<string,number>={};
      for(const row of paid)payments[monthKey(row._id.year,row._id.month)]=row.paid;
      const today=dhakaCalendar(new Date()),now=new Date();
      const settled=settledMonthInRange(payments,month,today);
      if(settled)settledLabel=monthLabel(settled);
      const history=((student.feeHistory||[]) as FeeStepLike[]).map(entry=>({amount:Number(entry.amount)||0,
        reason:entry.reason||'',changedBy:stampOf(entry.changedBy),changedAt:entry.changedAt,
        effectiveFrom:{year:entry.effectiveFrom.year,month:entry.effectiveFrom.month}}));
      const was=history.filter(entry=>monthIndexOf(entry.effectiveFrom)<=monthIndexOf(today))
        .sort((a,b)=>monthIndexOf(b.effectiveFrom)-monthIndexOf(a.effectiveFrom))[0]?.amount??0;
      const planned=planFeeChange(
        {startMonth:{year:student.startMonth.year,month:student.startMonth.month},feeHistory:history},
        {amount:fee,effectiveMonth:month,today,payments,reason,actorId:admin.id,now});
      student.set('feeHistory',planned.feeHistory);
      student.revision+=1;
      await student.save({session});
      await CenterActivityLog.create([{actor:admin.id,action:'student.fee',target:student._id,
        before:{amount:was},after:{amount:fee,effectiveMonth:monthWordOf(month),reason:reason||''}}],{session});
    });
    refresh();refreshClass(classGroup);
    return {status:'ok',message:words.ok};
  }catch(error){
    const code=(error as Error).message;
    if(process.env.CENTER_DATA_MODE==='test')console.error('Fee test error:',error);
    return code==='SETTLED_MONTH'
      ?{status:'invalid',fields:['month'],message:settledLabel?t('feeDoor.settledMonth',{month:settledLabel}):words.settled}
      :code==='BEFORE_START'?{status:'invalid',fields:['month'],message:words.before}
      :code==='NOT_BILLABLE'?{status:'error',message:words.removed}
      :{status:'error',message:words.failed};
  }finally{await session.endSession()}
}
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
