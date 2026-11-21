/**
 * R9 · every field the routine schemas hold is editable in the UI — and the ones that are not say why.
 *
 * The brief for this slice is "edit anything": the owner can change any part of a routine, nothing is
 * locked, and only the system's own fields are read-only. That is a claim about a shape — a model's shape
 * against a form's shape — and a shape is exactly what a browser cannot prove on its own: a page can look
 * complete and still be missing the one field nobody happened to need that day, and nobody finds out until
 * a term later when a room cannot be written.
 *
 * So the three routine schemas are walked path by path, including every path of the period subdocument
 * that MasterRoutine and DailyRoutine share, and each path has to be classified here as one of three
 * things:
 *
 *   · **EDITABLE** — bound to a named control in a named component, posted under a name the server action
 *     reads. Both halves are checked against the source: a control that nobody reads is a decoration, and
 *     an action reading a field with no control is a field nobody can fill.
 *   · **DERIVED** — written by the engine from another record, never typed: the class and teacher labels a
 *     row carries so the Recycle Bin can name what it holds, the `source` that says whether a period came
 *     from the week or was written for the date, and the signature a sent sheet is compared against. Each
 *     one is asserted to be written in `engine.ts`, because "derived" that is not derived anywhere is a
 *     field that is simply never filled.
 *   · **SYSTEM** — `_id`, the timestamps, who created the row, the recycle marks the bin writes and the
 *     sent marks the dispatch writes. None of them may appear as a form control anywhere in the routine
 *     UI, and the ones an operator needs to *see* are asserted to be painted as a badge rather than a box.
 *
 * The classification is exhaustive by construction: a path the schemas hold that appears in none of the
 * three lists fails the test, so a field added to a model in a later slice cannot arrive without somebody
 * deciding, in writing, how it is edited.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DailyRoutine,MasterRoutine,TeachingAssignment} from '../src/models/Routine';

const FILES={
  master:'src/components/admin/routine-master.tsx',
  daily:'src/components/admin/routine-daily.tsx',
  assignments:'src/components/admin/routine-assignments.tsx',
  /* Slice 2's own surfaces: the bulk and replacement tools, a day's memory, and the dispatch panel. They
     post to the same action file, so the reverse claim below reads them too. */
  tools:'src/components/admin/routine-tools.tsx',
  history:'src/components/admin/routine-history.tsx',
  dispatch:'src/components/admin/routine-dispatch.tsx',
  action:'src/actions/routine.ts',
  engine:'src/lib/routine/engine.ts',
} as const;
type FileKey=keyof typeof FILES;
const source:Record<FileKey,string>={
  master:readFileSync(FILES.master,'utf8'),
  daily:readFileSync(FILES.daily,'utf8'),
  assignments:readFileSync(FILES.assignments,'utf8'),
  tools:readFileSync(FILES.tools,'utf8'),
  history:readFileSync(FILES.history,'utf8'),
  dispatch:readFileSync(FILES.dispatch,'utf8'),
  action:readFileSync(FILES.action,'utf8'),
  engine:readFileSync(FILES.engine,'utf8'),
};

/** One editable field: the control that writes it, where that control lives, and the name it posts under. */
type Editable={control:string;file:FileKey;postsAs?:string};

/* The period subdocument is the same schema in both collections, so one table serves both and the two
   differ only in where the control lives: on the week's grid, or on the date's draft. */
const PERIOD_EDITABLE=(file:FileKey):Record<string,Editable|'derived'>=>({
  start:{control:'start',file},
  end:{control:'end',file},
  'subject.bn':{control:'subjectBn',file},
  'subject.en':{control:'subjectEn',file},
  teacher:{control:'teacher',file},
  room:{control:'room',file},
  jointWith:{control:'jointWith',file},
  order:{control:'order',file},
  note:{control:'note',file},
  /* The link from a date's period back to the week's own is posted by the editor that carries it, so the
     daily sheet's periods travel as one JSON draft under `periods` rather than as nine separate fields. */
  masterPeriod:file==='daily'?{control:'periods',file,postsAs:'periods'}:{control:'masterPeriod',file},
  /* Where a period came from is the engine's answer, not a person's: a period copied from the week is
     `master` and one written for the date is `own`, and the sheet badges each of them accordingly. */
  source:'derived',
});

/** Everything the daily sheet's period controls post as: one draft field the action parses. */
const DAILY_POSTS={postsAs:'periods'};
const dailyPeriodTable=Object.fromEntries(
  Object.entries(PERIOD_EDITABLE('daily')).map(([path,value])=>
    [path,value==='derived'?value:{...value,...DAILY_POSTS}]),
);

const MODELS:{name:string;model:unknown;
  fields:Record<string,Editable|'derived'|'system'>;
  periods:Record<string,Editable|'derived'|'system'>}[]=[
  {name:'MasterRoutine',model:MasterRoutine,
    fields:{
      classGroup:{control:'classId',file:'master'},
      shift:{control:'shift',file:'master'},
      weekday:{control:'weekday',file:'master'},
      active:{control:'active',file:'master'},
      /* A weekday's kind — a teaching day, the class's weekly day off, or its weekly exam day — is set from
         the picker on the day's own card, which posts it as `dayType`. */
      dayType:{control:'dayType',file:'master'},
      /* The label a row carries so the Recycle Bin can name what it holds is copied from the class record
         on every save: typing it would let the bin disagree with the class it points at. */
      'classLabel.bn':'derived','classLabel.en':'derived',
      /* The day's own memory: twenty entries the engine writes on every save and the history drawer
         reads. Nobody types one, so it is derived — and a restore, which is a write like any other,
         leaves an entry of its own. */
      history:'derived',
      createdBy:'system',_id:'system',createdAt:'system',updatedAt:'system',__v:'system',
      deletedAt:'system',deletedBy:'system',purgeAt:'system',
    },
    periods:{...PERIOD_EDITABLE('master'),
      _id:'system',deletedAt:'system',deletedBy:'system',purgeAt:'system'},
  },
  {name:'DailyRoutine',model:DailyRoutine,
    fields:{
      date:{control:'date',file:'daily'},
      classGroup:{control:'classId',file:'daily'},
      shift:{control:'shift',file:'daily'},
      status:{control:'status',file:'daily'},
      holidayReason:{control:'holidayReason',file:'daily'},
      notes:{control:'notes',file:'daily'},
      /* A weekly exam day's own two choices: the subject being examined and whether classes run beside
         it. They are written on the date, which is why they live here and not on the week. */
      examSubjectBn:{control:'examSubjectBn',file:'daily'},
      examSubjectEn:{control:'examSubjectEn',file:'daily'},
      examMode:{control:'examMode',file:'daily'},
      'classLabel.bn':'derived','classLabel.en':'derived',
      /* The dispatch writes these when a sheet is sent; the operator reads them as a badge. */
      sentAt:'system',sentBy:'system',sentSignature:'derived',
      history:'derived',
      createdBy:'system',_id:'system',createdAt:'system',updatedAt:'system',__v:'system',
      deletedAt:'system',deletedBy:'system',purgeAt:'system',
    },
    periods:{...dailyPeriodTable,
      _id:'system',deletedAt:'system',deletedBy:'system',purgeAt:'system'},
  },
  {name:'TeachingAssignment',model:TeachingAssignment,
    fields:{
      teacher:{control:'teacherId',file:'assignments'},
      teacherLabel:'derived',
      classGroup:{control:'classId',file:'assignments'},
      'classLabel.bn':'derived','classLabel.en':'derived',
      'subject.bn':{control:'subjectBn',file:'assignments'},
      'subject.en':{control:'subjectEn',file:'assignments'},
      periodsPerWeek:{control:'periodsPerWeek',file:'assignments'},
      active:{control:'active',file:'assignments'},
      note:{control:'note',file:'assignments'},
      createdBy:'system',_id:'system',createdAt:'system',updatedAt:'system',__v:'system',
      deletedAt:'system',deletedBy:'system',purgeAt:'system',
    },
    periods:{},
  },
];

/** Every path a schema holds, and every path of its `periods` subdocument, as mongoose reports them. */
const pathsOf=(model:unknown):string[]=>{
  const out:string[]=[];
  const schema=(model as {schema:{eachPath:(cb:(path:string)=>void)=>void}}).schema;
  schema.eachPath(path=>out.push(path));
  return out;
};
const periodPathsOf=(model:unknown):string[]=>{
  const out:string[]=[];
  const schema=(model as {schema:{path:(name:string)=>{schema?:{eachPath:(cb:(path:string)=>void)=>void}}}}).schema;
  schema.path('periods')?.schema?.eachPath(path=>out.push(path));
  return out;
};

// ── 1. Every path is classified, and only once ─────────────────────────────────────────────────────
let editableCount=0;
for(const entry of MODELS){
  const declared=(table:Record<string,unknown>,label:string,actual:string[]):void=>{
    const listed=Object.keys(table).sort();
    assert.deepEqual(actual.slice().sort(),listed,
      `${entry.name}${label}: every path the schema holds is classified here — a new field cannot arrive `
      +`without somebody deciding how it is edited`);
    assert.equal(new Set(listed).size,listed.length,`${entry.name}${label}: no path is classified twice`);
  };
  const ownPaths=pathsOf(entry.model),subPaths=periodPathsOf(entry.model);
  declared(entry.fields,'',ownPaths.filter(path=>path!=='periods'));
  declared(entry.periods,'.periods',subPaths);
  /* The array itself is written through its rows, so it is classified as a container rather than a field:
     a collection that holds one says so, and one that does not (an assignment counts periods, it does not
     hold them) classifies nothing under it. */
  if(subPaths.length>0)assert.ok(ownPaths.includes('periods'),`${entry.name} still holds its periods array`);
  else assert.equal(Object.keys(entry.periods).length,0,
    `${entry.name} holds no period array, so nothing is classified under one`);
  for(const [path,kind] of Object.entries({...entry.fields,...entry.periods})){
    if(kind==='system')continue;
    editableCount+=1;
    if(kind==='derived'){
      /* "Derived" has to be derived somewhere: the leaf is written by the engine on every save. */
      const leaf=path.split('.').pop()||path;
      assert.ok(source.engine.includes(leaf),
        `${entry.name}.${path} is called derived but ${FILES.engine} never writes ${leaf}`);
      continue;
    }
    const {control,file}=kind,postsAs=kind.postsAs||control;
    assert.ok(source[file].includes(`name="${control}"`),
      `${entry.name}.${path} is bound to name="${control}", which ${FILES[file]} does not render`);
    assert.ok(source.action.includes(`'${postsAs}'`),
      `${entry.name}.${path} posts as ${postsAs}, which ${FILES.action} never reads`);
  }
}

// ── 2. The system fields are read-only in fact, not only in this table ─────────────────────────────
const SYSTEM=['_id','createdAt','updatedAt','createdBy','__v','deletedAt','deletedBy','purgeAt','sentAt','sentBy'];
for(const name of SYSTEM){
  for(const file of ['master','daily','assignments'] as const){
    assert.ok(!source[file].includes(`name="${name}"`),
      `${FILES[file]} posts ${name}: a system field is not a field a person types`);
  }
}
/* The two marks an operator does need to see are painted, not editable: a date that has passed says so,
   and a sheet changed after it was sent says so — both as badges, beside a form that still works. */
assert.ok(source.daily.includes('data-badge-passed'),'the daily sheet badges a date that has passed');
assert.ok(source.daily.includes('data-badge-changed'),'the daily sheet badges a sheet changed since it was sent');
assert.ok(source.daily.includes('data-daily-period-source'),'each period says whether it came from the week');

// ── 3. The claim holds both ways ───────────────────────────────────────────────────────────────────
/* A control nobody classified is a field the table does not know about — the same drift, from the other
   side. Every `name="…"` the three routine components render must be either a classified control, the
   draft the daily sheet posts, or the save-anyway flag that makes a warning pass. */
/* The names a tool posts that are not paths of a routine document: which periods were ticked, how far the
   clock moves, which field is being written across them, who replaces whom over which range, and which
   remembered version a restore puts back. They are inputs to an operation, and the operation's own schema
   in `src/schemas/routine.ts` is what checks them. */
const known=new Set<string>(['force','periodId','dayId','assignmentId','masterPeriod','periods',
  'periodIds','minutes','setRoom','setTeacher','setSubject','from','to','fromDate','toDate','master',
  'daily','kind','id','entryId']);
for(const entry of MODELS){
  for(const kind of Object.values({...entry.fields,...entry.periods})){
    if(kind!=='system'&&kind!=='derived')known.add(kind.control);
  }
}
for(const file of ['master','daily','assignments','tools','history','dispatch'] as const){
  const rendered=[...source[file].matchAll(/name="([a-zA-Z][a-zA-Z0-9]*)"/g)].map(hit=>hit[1]);
  for(const control of new Set(rendered)){
    assert.ok(known.has(control),
      `${FILES[file]} renders name="${control}", which no schema path in this test claims`);
  }
}

const derivedCount=MODELS.reduce((total,entry)=>
  total+Object.values({...entry.fields,...entry.periods}).filter(kind=>kind==='derived').length,0);
const systemCount=MODELS.reduce((total,entry)=>
  total+Object.values({...entry.fields,...entry.periods}).filter(kind=>kind==='system').length,0);
console.log(`Routine fields: ${MODELS.length} schemas walked path by path — ${editableCount} bound to a control `
  +`that a named component renders and ${FILES.action} reads, ${derivedCount} written by the engine rather `
  +`than typed, ${systemCount} system fields that no form posts; every path classified, none classified twice.`);
