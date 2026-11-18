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
 *
 * S2 · this is now the ONE place a class is written (F-04). The class list under Students used to carry
 * its own smaller editor — a name, a shift word, a fee and the teachers — and the two wrote different
 * fields to the same record, so a class edited on one screen lost facts the other screen owned. Both
 * surfaces now post here, this form carries every field the record has (both names, the level, the shifts
 * and the shift word derived from them, the room, the fee and what a zero means, the teachers, and
 * whether the class is running), and three rules travel with it:
 *
 * · **the shifts are canonical** (F-08) — `shifts[]` holds the keys and `shift` is always the first key's
 *   own Bangla label, so a routine query, a dues query and a card cannot disagree about one class;
 * · **a class with children on it is not closed** (F-05) — archiving counts the students first and
 *   refuses with the number of them and the way out, because a closed class is a class nobody enrols
 *   into and the children on it would keep owing fees on a roll nobody reads;
 * · **a fee says which of two things it is** (F-16) — a number is that number, a tick on an empty box is
 *   a class that is free, an emptied box that held a number is a fee deliberately cleared, and an empty
 *   box that never held one leaves the stored fee alone.
 */
import mongoose from 'mongoose';
import {revalidatePath} from 'next/cache';
import {getLocale,getTranslations} from 'next-intl/server';
import {requireAdmin} from '@/lib/admin/guard';
import {classGroupSchema,shiftsOf} from '@/schemas/center';
import {CenterActivityLog,CenterClassGroup,CenterStudent} from '@/models/CenterRecords';
import {Batch} from '@/models/Academic';
import {User} from '@/models/User';
import {appendFileSync,mkdirSync} from 'node:fs';
import {formatNumber,type Digits} from '@/lib/admin/format';
import {CLASS_SHIFT_KEYS,isShiftKey,shiftKeyOfWord} from '@/lib/classes/class-shared';

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
  /* `refused` is F-05's own answer: the write is not wrong, it is not allowed yet, and the screen says
     what has to happen first rather than shaking at the operator. */
  status:'idle'|'ok'|'invalid'|'duplicate'|'conflict'|'refused'|'error';
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
  /** How many students are still on a class somebody tried to close, when that is the refusal. */
  count?:number;
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

/** The three labels in the day's order, read from the catalog once per write. */
async function shiftWords():Promise<string[]>{
  const words:string[]=[];
  for(const key of CLASS_SHIFT_KEYS)words.push(await shiftWord(key));
  return words;
}

/** Which language the operator is reading, so a refusal arrives in it and in their own digits. */
async function languageOf():Promise<Digits>{
  try{return (await getLocale())==='en'?'en':'bn'}catch{return 'bn'}
}

/**
 * F-05 · The sentence a refused archive answers with — the count in the operator's own digits, and the
 * way out in the same breath, because "you may not" without "here is what to do" is a dead end.
 */
async function archiveRefused(running:number):Promise<string>{
  const language=await languageOf();
  const t=await getTranslations({locale:language,namespace:'classAdmin'});
  return String(t('archiveRefused',{count:formatNumber(running,language)}));
}

/**
 * F-08 · The one shift word the routine reads, derived rather than remembered.
 *
 * The boxes are the truth: `shifts[]` holds the canonical keys and the word is the first key's own Bangla
 * label, in the order the day happens. Deriving it is what keeps a routine query, a dues query and a card
 * from disagreeing about one class — a class written by one screen as `morning` and by another as a word
 * the owner typed answered two different questions depending on who asked.
 *
 * A word the owner typed before the boxes existed is kept while no box is ticked, because dropping it
 * would leave that class's routine with nothing to read; the moment it IS one of the three labels it
 * belongs to a box, and an unticked box means the class no longer runs that shift.
 */
function shiftOf(words:string[],shifts:string[],current:string):string{
  if(shifts.length){
    const at=(CLASS_SHIFT_KEYS as readonly string[]).indexOf(shifts[0]);
    return (at>=0?words[at]:'')||String(current||'');
  }
  const word=String(current||'').trim();
  if(!word)return '';
  return words.includes(word)?'':word;
}

/**
 * F-16 · What the fee box and the tick beside it write.
 *
 * One number cannot say both "this class is free" and "nobody has priced this class yet", and a form that
 * turned one into the other either started billing a class nobody priced or quietly forgave one the centre
 * runs for free. So the box carries the number, the tick carries the free class, and the form posts the
 * fee it OPENED with (`feeWas`) — which is what makes clearing a fee an act the operator performs rather
 * than something a half-filled submit does on its way past. A form that posts no fee and no `feeWas`
 * leaves the stored fee exactly as it was, which is what every caller before this one meant.
 */
function feeWrite(fee:number|null,free:boolean,hadFee:boolean):{monthlyFee:number;feeFree:boolean}|null{
  if(fee!==null)return {monthlyFee:fee,feeFree:false};
  if(free)return {monthlyFee:0,feeFree:true};
  if(hadFee)return {monthlyFee:0,feeFree:false};
  return null;
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
  /* F-16 · the tick that says a zero is a free class, and the fee the form opened with, which is what
     tells an emptied box from a box that never held a number. */
  const feeFree=form.get('feeFree')==='on';
  const hadFee=/^\d+$/.test(String(form.get('feeWas')||'').trim());
  const write=feeWrite(fee,feeFree,hadFee);
  /* F-04 · the teachers travel with the class now, so one form writes the whole record. R5's rule comes
     with them: an assignment is an authorization, so an id nobody can sign in with is not stored at all,
     and an id that belongs to another role is a refusal rather than a dead entry that looks live. */
  const teacherIds=[...new Set(form.getAll('teacherIds').map(entry=>String(entry).trim()))].filter(Boolean);
  if(teacherIds.length>12||teacherIds.some(entry=>!mongoose.isValidObjectId(entry)))
    return {status:'invalid',fields:['teacherIds']};
  if(teacherIds.length){
    const allowed=await User.find({_id:{$in:teacherIds},role:'teacher',active:true}).select('_id')
      .lean<{_id:mongoose.Types.ObjectId}[]>();
    if(allowed.length!==teacherIds.length)return {status:'invalid',fields:['teacherIds']};
  }
  const teachers=teacherIds.map(entry=>new mongoose.Types.ObjectId(entry));
  const words=await shiftWords();
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
        const shift=shiftOf(words,shifts,'');
        const [created]=await CenterClassGroup.create([{
          name:{bn:value.nameBn,en:value.nameEn},level:value.level,shift,shifts,room:value.room,
          academicYear:value.academicYear,active:true,monthlyFee:write?.monthlyFee??0,
          feeFree:write?.feeFree===true,order:0,teachers,
        }],{session:tx});
        classId=String(created._id);
        await CenterActivityLog.create([{actor:admin.id,action:'class.create',target:created._id,
          after:{name:created.name,academicYear:value.academicYear,shift,shifts,room:value.room,
            monthlyFee:created.monthlyFee,feeFree:created.feeFree,teachers:teacherIds}}],{session:tx});
        return;
      }
      /* Somebody else's write is refused rather than overwritten: the form posts the class's own
         `updatedAt`, and a class that has moved since is a conflict the operator is told about. */
      const revision=String(form.get('revision')||'');
      const current=await CenterClassGroup.findOne({_id:id}).session(tx)
        .lean<{_id:mongoose.Types.ObjectId;updatedAt:Date;academicYear:number;shift:string;
          shifts?:string[];active?:boolean}>();
      if(!current)throw new Error('MISSING');
      if(!/^\d{4}-\d{2}-\d{2}T/.test(revision)||current.updatedAt.toISOString()!==revision)
        throw new Error('STALE');
      if(Number(value.academicYear)!==Number(current.academicYear))throw new Error('YEAR');
      /* F-05 · closing a class is refused while children are still on it. The count is read inside the
         transaction, so a student enrolled between the check and the write refuses the archive rather
         than being left on a roll nobody opens; held students count, because a hold is a pause on a
         class the centre still runs, and removed ones do not, because they have left it. */
      if(!active&&current.active!==false){
        /* The same count the Recycle Bin quotes when it refuses to file a class away — a student who has
           left does not hold a class open, and one who is paused does, because a pause is a seat kept. */
        const running=await CenterStudent
          .countDocuments({classGroup:current._id,status:{$ne:'removed'}}).session(tx);
        if(running>0)throw new Error(`ARCHIVE_REFUSED:${running}`);
      }
      /* F-08 · a class written before the boxes holds its shift as a word and no keys at all; the first
         save through this form gives it the canonical key that word means, so the boxes open ticked and
         the word and the keys agree from then on. A class that already has keys keeps whatever the
         operator ticked, including none of them. */
      const stored=(current.shifts||[]).map(entry=>String(entry)).filter(Boolean);
      const picked=shifts.length?shifts
        :stored.length?[]
        :(()=>{const key=shiftKeyOfWord(String(current.shift||''),words);return key?[key]:[]})();
      const shift=shiftOf(words,picked,String(current.shift||''));
      const after={name:{bn:value.nameBn,en:value.nameEn},level:value.level,shift,shifts:picked,
        room:value.room,active,teachers,...(write??{})};
      await CenterClassGroup.updateOne({_id:id},{$set:after},{session:tx});
      await CenterActivityLog.create([{actor:admin.id,action:'class.update',target:current._id,
        after:{...after,teachers:teacherIds}}],{session:tx});
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
    if(message.startsWith('ARCHIVE_REFUSED:')){
      const running=Number(message.slice('ARCHIVE_REFUSED:'.length))||0;
      actionLog(`archive refused classId=${id} running=${running}`);
      return {status:'refused',classId:id,count:running,message:await archiveRefused(running),detail};
    }
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

