/**
 * R9 · the clashes a timetable can have, and the rule that they never stop a save.
 *
 * Two things go wrong in a routine and both are visible only across classes: the same teacher written
 * into two rooms at the same minute, and the same room written into two classes at the same minute.
 * Neither is a data error — a centre genuinely does double-book a room for ten minutes while a class
 * changes over, and an owner who is told "no" by their own timetable stops using it. So a clash is a
 * WARNING with the names and the times in it, the save offers a prominent "save anyway", and the write
 * goes through when the operator says so. Nothing here throws, refuses or blocks.
 *
 * Pure on purpose: the same function decides the banner a page loads with and the answer a save gives,
 * so a clash cannot be shown on the grid and then silently accepted, or refused after being shown as
 * nothing.
 */
import {overlaps} from './time';

/** A period as the clash check reads it: where it sits, who takes it, which room, whose class. */
export interface RoutineSlot{
  /** The period's own id, so a period never clashes with itself when it is being edited. */
  periodId?:string;
  /** Whose class the period belongs to, so a page scoped to one class can show only its own clashes. */
  classId?:string;
  weekday:number;
  start:string;
  end:string;
  /** The teacher's account id, or empty for a period nobody takes yet. */
  teacher?:string|null;
  room?:string;
  /** What the operator reads: the class name, the subject, the teacher's name. */
  className?:string;
  subject?:string;
  teacherName?:string;
}

export type ClashKind='teacher'|'room';

/** One clash, with everything a sentence about it needs — the words are the catalogs', not this file's. */
export interface RoutineClash{
  kind:ClashKind;
  /** The two classes the clash is between — equal when it is one class arguing with itself. */
  classId?:string;
  otherClassId?:string;
  weekday:number;
  start:string;
  end:string;
  /** The teacher's name, or the room, whichever is double-booked. */
  who: string;
  /** The other period: its class, its subject and the time it runs. */
  otherClass: string;
  otherSubject: string;
  otherStart: string;
  otherEnd: string;
}

const trim=(value:unknown):string=>String(value??'').trim();
const idOf=(value:unknown):string=>trim(value).toLowerCase();
/** A room is the same room however it is spelled: trimmed, folded, inner spaces squeezed. */
export const roomKey=(value:unknown):string=>trim(value).toLowerCase().replace(/\s+/g,' ');

/** Two periods share a minute of the same weekday. */
function sameTime(a:RoutineSlot,b:RoutineSlot):boolean{
  return a.weekday===b.weekday&&overlaps(a.start,a.end,b.start,b.end);
}

const isSelf=(a:RoutineSlot,b:RoutineSlot):boolean=>!!a.periodId&&idOf(a.periodId)===idOf(b.periodId);

/**
 * The clashes one period has against a list of others — the check a save runs.
 *
 * A period with no teacher clashes with nothing on teacher, and a period with no room clashes with
 * nothing on room: an unfilled slot is not a double booking, it is a slot nobody has been put in yet.
 */
export function clashesFor(proposed:RoutineSlot,others:RoutineSlot[]):RoutineClash[]{
  const out:RoutineClash[]=[];
  for(const other of others){
    if(isSelf(proposed,other)||!sameTime(proposed,other))continue;
    const teacher=idOf(proposed.teacher),otherTeacher=idOf(other.teacher);
    if(teacher&&teacher===otherTeacher){
      out.push({kind:'teacher',weekday:proposed.weekday,start:proposed.start,end:proposed.end,
        classId:trim(proposed.classId),otherClassId:trim(other.classId),
        who:trim(proposed.teacherName)||teacher,
        otherClass:trim(other.className),otherSubject:trim(other.subject),
        otherStart:other.start,otherEnd:other.end});
    }
    const room=roomKey(proposed.room),otherRoom=roomKey(other.room);
    if(room&&room===otherRoom){
      out.push({kind:'room',weekday:proposed.weekday,start:proposed.start,end:proposed.end,
        classId:trim(proposed.classId),otherClassId:trim(other.classId),
        who:trim(proposed.room),
        otherClass:trim(other.className),otherSubject:trim(other.subject),
        otherStart:other.start,otherEnd:other.end});
    }
  }
  /* One line per clashing period per kind, in the order the day runs: the banner reads top to bottom
     the way the grid does, and a period double-booked on both teacher and room says both. */
  return out.sort((a,b)=>a.kind.localeCompare(b.kind)||a.otherStart.localeCompare(b.otherStart));
}

/**
 * Every clash in a set of periods — the check a page loads with, so a week that already double-books a
 * teacher says so before anybody opens an editor. Each pair is reported once, from the earlier period's
 * point of view, which keeps a banner about two periods to two lines rather than four.
 */
export function scanSlots(slots:RoutineSlot[]):RoutineClash[]{
  const seen=new Set<string>();
  const out:RoutineClash[]=[];
  for(const slot of slots){
    for(const clash of clashesFor(slot,slots)){
      const key=[clash.kind,clash.weekday,idOf(clash.who),clash.start,clash.otherStart,clash.otherClass].join('~');
      const mirror=[clash.kind,clash.weekday,idOf(clash.who),clash.otherStart,clash.start,clash.otherClass].join('~');
      if(seen.has(key)||seen.has(mirror))continue;
      seen.add(key);
      out.push(clash);
    }
  }
  return out.sort((a,b)=>a.weekday-b.weekday||a.start.localeCompare(b.start)||a.kind.localeCompare(b.kind));
}

/** How many periods a day holds, and how many minutes of teaching that is — the grid's own footer. */
export function dayTotals(slots:RoutineSlot[]):{periods:number;minutes:number}{
  let minutes=0;
  for(const slot of slots){
    const [start,end]=[slot.start,slot.end];
    const [a,b]=[Number(start.slice(0,2))*60+Number(start.slice(3,5)),Number(end.slice(0,2))*60+Number(end.slice(3,5))];
    if(Number.isFinite(a)&&Number.isFinite(b)&&b>a)minutes+=b-a;
  }
  return {periods:slots.length,minutes};
}

/** Periods per teacher per weekday, so an assignment's "periods a week" can be read against the week. */
export function teacherLoad(slots:RoutineSlot[]):Map<string,number>{
  const load=new Map<string,number>();
  for(const slot of slots){
    const teacher=idOf(slot.teacher);
    if(!teacher)continue;
    load.set(teacher,(load.get(teacher)||0)+1);
  }
  return load;
}
