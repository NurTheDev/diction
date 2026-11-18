'use server';
/**
 * O1 · Class and batch management — the write side.
 *
 * One screen, two writes, and both are the owner's:
 *
 * · **A class is written whole.** The name in both languages, the level, the room, the shifts it runs
 *   and the month it costs travel as one form, because they are one decision — "there is a Class Seven,
 *   morning and evening, in Room-1201, at ৳1200". A new class is created; a class with an id is changed,
 *   and the change is refused if somebody else changed it first (`revision`), which is the same guard the
 *   student editor has always used: two operators, one class, and the second one is told rather than
 *   quietly overwriting the first.
 * · **A batch belongs to a class.** The batch's own screen keeps writing what a batch is — its title, its
 *   teacher, its hours — and this screen writes the one fact it was missing: which class it runs inside.
 *   Assigning is idempotent and total for the class being edited: the batches ticked are given this
 *   class, and any batch this class held that is no longer ticked is let go. Nothing else's assignment
 *   is touched, so two classes can never hold one batch.
 *
 * Both writes answer with the operator's own sentence in the language they are reading, which is what the
 * toast in the corner says; a refusal answers with the fields that were wrong so the form can point at
 * them instead of shaking.
 */
import mongoose from 'mongoose';
import {revalidatePath} from 'next/cache';
import {getTranslations} from 'next-intl/server';
import {requireAdmin} from '@/lib/admin/guard';
import {classGroupSchema,shiftsOf} from '@/schemas/center';
import {CenterActivityLog,CenterClassGroup} from '@/models/CenterRecords';
import {Batch} from '@/models/Academic';
import {appendFileSync,mkdirSync} from 'node:fs';
import {CLASS_SHIFT_KEYS,isShiftKey} from '@/lib/classes/class-shared';

/**
 * The server's own account of a write, appended where the verification run reads its logs.
 *
 * A server action that answers 500 leaves no trace an operator or a test can read: the console of the
 * app process is not part of the evidence, the sheet shows nothing because nothing came back, and the
 * route's boundary shows a minified recovery error rather than the failure underneath it. Two runs in
 * a row ended that way. So each write writes down its entry, its answer and — if it throws anywhere,
 * even outside its own catch — the failure's first lines, best-effort, because evidence that cannot be
 * written is not a reason to lose the write itself.
 */
const actionLog=(line:string):void=>{
  /* A test-mode channel only: in production the server's console is the right place for a stack, and a
     file in the working directory is not. */
  if(process.env.CENTER_DATA_MODE!=='test')return;
  const text=`${new Date().toISOString()} ${line}\n`;
  for(const dir of ['verify-output/logs','test-results/ci-latest/logs']){
    try{mkdirSync(dir,{recursive:true});appendFileSync(`${dir}/class-admin-action.txt`,text)}catch{void 0}
  }
};

export type ClassActionState={
  status:'idle'|'ok'|'invalid'|'duplicate'|'conflict'|'error';
  /** The class the write was about, so the caller can keep its own card open. */
  classId?:string;
  /** Which boxes were wrong: a form points at them rather than saying "something was". */
  fields?:string[];
  /** The operator's own sentence for what happened. */
  message?:string;
  /**
   * The failure's own first line, for the sheet's `title` and for nothing else on the screen: an
   * operator is told "the write did not land", and the next reader — a test, a log, a cursor resting on
   * the sentence — can see which of the fifty ways that was. The message, never the stack.
   */
  detail?:string;
};

const idle:ClassActionState={status:'idle'};

/* A class is read from four addresses: this screen, the legacy list it replaces, the class's own hub,
   and the routine that is written for it — so a write re-reads all four, in both languages. */
const refresh=(classId=''):void=>{
  for(const lang of ['bn','en']){
    revalidatePath(`/${lang}/admin/classes`);
    revalidatePath(`/${lang}/admin/students/classes`);
    revalidatePath(`/${lang}/admin/batches`);
    revalidatePath(`/${lang}/admin/routine/master`);
    if(mongoose.isValidObjectId(classId))revalidatePath(`/${lang}/admin/students/classes/${classId}`);
  }
};

/** The Bangla word behind a shift key, read from the catalog: no Bangla literal lives in this file. */
async function shiftWord(key:string):Promise<string>{
  const t=await getTranslations({locale:'bn',namespace:'classAdmin'});
  const word=isShiftKey(key)?t(key==='morning'?'shiftMorning':key==='day'?'shiftDay':'shiftEvening'):'';
  return String(word||'');
}

/** What a class's own shift word becomes when the boxes say otherwise — the first box, in Bangla. */
async function shiftOf(shifts:string[],current:string):Promise<string>{
  if(!shifts.length)return current;
  if(current.trim()&&!isShiftKey(current))return current; // the owner's own word is never overwritten
  const word=await shiftWord(shifts[0]);
  return word||current;
}

/**
 * Create a class, or change the one the form names.
 *
 * The academic year is written once, on creation, and is immutable after it: a fee history is read
 * against the year it was taken in, so a class that changes its year silently moves every receipt it
 * has ever had. The form does not offer the box on an edit, and this action refuses a year that is not
 * the class's own.
 */
export async function saveClassGroupAction(previous:ClassActionState,form:FormData):Promise<ClassActionState>{
  void previous;
  actionLog(`enter save nameBn="${String(form.get('nameBn')||'')}" id="${String(form.get('id')||'')}"`);
  let admin:{id:string;role:string};
  try{admin=await requireAdmin()}catch(error){
    actionLog(`requireAdmin threw: ${String((error as Error)?.stack||error).split('\n').slice(0,3).join(' | ')}`);
    return {status:'error'};
  }
  if(admin.role!=='admin'&&admin.role!=='superadmin')return {status:'error'};
  const parsed=classGroupSchema.safeParse(Object.fromEntries(form));
  if(!parsed.success){
    const fields=[...new Set(parsed.error.issues.map(issue=>String(issue.path[0]||'')))];
    return {status:'invalid',fields:fields.length?fields:undefined};
  }
  const value=parsed.data;
  const shifts=shiftsOf(form);
  if(shifts.length>CLASS_SHIFT_KEYS.length)return {status:'invalid',fields:['shifts']};
  const active=form.get('active')==='on';
  const id=String(value.id||'').trim();
  const isEdit=mongoose.isValidObjectId(id);
  if(id&&!isEdit)return {status:'invalid',fields:['id']};
  const fee=value.monthlyFee===null||value.monthlyFee===undefined?null:Math.round(value.monthlyFee);
  /* The session is opened inside the try, not before it: a connection that refuses a session is a write
     the operator is told about, not a route that dies under them. A refusal keeps the draft; a death
     loses the screen. */
  let session:mongoose.ClientSession|null=null;
  try{
    await CenterClassGroup.init();
    session=await mongoose.startSession();
    const tx=session;
    let classId=id;
    await session.withTransaction(async()=>{
      if(!isEdit){
        const shift=await shiftOf(shifts,'');
        const [created]=await CenterClassGroup.create([{
          name:{bn:value.nameBn,en:value.nameEn},level:value.level,shift,shifts,room:value.room,
          academicYear:value.academicYear,active:true,monthlyFee:fee??0,order:0,
        }],{session:tx});
        classId=String(created._id);
        await CenterActivityLog.create([{actor:admin.id,action:'class.create',target:created._id,
          after:{name:created.name,academicYear:value.academicYear,shift,shifts,room:value.room,
            monthlyFee:created.monthlyFee}}],{session:tx});
        return;
      }
      /* Somebody else's write is refused rather than overwritten: the form posts the class's own
         `updatedAt`, and a class that has moved since is a conflict the operator is told about. */
      const revision=String(form.get('revision')||'');
      const current=await CenterClassGroup.findOne({_id:id}).session(tx)
        .lean<{_id:mongoose.Types.ObjectId;updatedAt:Date;academicYear:number;shift:string}>();
      if(!current)throw new Error('MISSING');
      if(!/^\d{4}-\d{2}-\d{2}T/.test(revision)||current.updatedAt.toISOString()!==revision)
        throw new Error('STALE');
      if(Number(value.academicYear)!==Number(current.academicYear))throw new Error('YEAR');
      const shift=await shiftOf(shifts,String(current.shift||''));
      const after={name:{bn:value.nameBn,en:value.nameEn},level:value.level,shift,shifts,
        room:value.room,active,...(fee===null?{}:{monthlyFee:fee})};
      await CenterClassGroup.updateOne({_id:id},{$set:after},{session:tx});
      await CenterActivityLog.create([{actor:admin.id,action:'class.update',target:current._id,after}],
        {session:tx});
    });
    const t=await getTranslations('classAdmin');
    refresh(classId);
    actionLog(`${isEdit?'updated':'created'} classId=${classId}`);
    return {status:'ok',classId,message:String(isEdit?t('saved'):t('created'))};
  }catch(error){
    const message=(error as Error).message;
    actionLog(`save threw: ${String((error as Error)?.stack||error).split('\n').slice(0,4).join(' | ')}`);
    const detail=String(message||error).split('\n')[0].slice(0,200);
    if(message==='STALE')return {status:'conflict',classId:id,detail};
    if(message==='YEAR')return {status:'invalid',classId:id,fields:['academicYear'],detail};
    if(message==='MISSING')return {status:'error',classId:id,detail};
    return {status:(error as {code?:number}).code===11000?'duplicate':'error',classId:id,detail};
  }finally{await session?.endSession()}
}

/**
 * Give this class the batches ticked, and let go of the ones that are not.
 *
 * A batch runs inside one class, so assigning it here also removes it from any class that held it —
 * the alternative is a batch on two cards and a count that adds up to more batches than the centre has.
 */
export async function assignClassBatchesAction(previous:ClassActionState,form:FormData):Promise<ClassActionState>{
  void previous;
  actionLog(`enter batches id="${String(form.get('id')||'')}"`);
  let admin:{id:string;role:string};
  try{admin=await requireAdmin()}catch(error){
    actionLog(`requireAdmin threw: ${String((error as Error)?.stack||error).split('\n').slice(0,3).join(' | ')}`);
    return {status:'error'};
  }
  if(admin.role!=='admin'&&admin.role!=='superadmin')return {status:'error'};
  const classId=String(form.get('id')||'');
  if(!mongoose.isValidObjectId(classId))return {status:'invalid',fields:['id']};
  const picked=[...new Set(form.getAll('batchIds').map(value=>String(value)))]
    .filter(value=>mongoose.isValidObjectId(value));
  if(form.getAll('batchIds').some(value=>!mongoose.isValidObjectId(String(value))))
    return {status:'invalid',fields:['batchIds']};
  let session:mongoose.ClientSession|null=null;
  try{
    session=await mongoose.startSession();
    await session.withTransaction(async()=>{
      const group=await CenterClassGroup.findOne({_id:classId}).session(session!).select('_id')
        .lean<{_id:mongoose.Types.ObjectId}|null>();
      if(!group)throw new Error('MISSING');
      await Batch.updateMany({_id:{$in:picked}},{$set:{classGroup:group._id}},{session:session!});
      /* Let go of what this class held and is no longer ticked — and only that. */
      await Batch.updateMany({classGroup:group._id,_id:{$nin:picked}},{$set:{classGroup:null}},
        {session:session!});
      await CenterActivityLog.create([{actor:admin.id,action:'class.batches',target:group._id,
        after:{batches:picked}}],{session:session!});
    });
    const t=await getTranslations('classAdmin');
    refresh(classId);
    actionLog(`batches assigned classId=${classId}`);
    return {status:'ok',classId,message:String(t('batchesSaved'))};
  }catch(error){
    actionLog(`batches threw: ${String((error as Error)?.stack||error).split('\n').slice(0,4).join(' | ')}`);
    return {status:(error as Error).message==='MISSING'?'error':'error',classId,
      detail:String((error as Error).message||error).split('\n')[0].slice(0,200)};
  }finally{await session?.endSession()}
}

