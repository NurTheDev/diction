/**
 * Group 3 · the monthly consolidated marksheet, as arithmetic over plain data.
 *
 * One class, one month, every exam held in it: a row per student, a column per exam, and the two numbers
 * a report card is actually read for — what was possible, what was obtained — with the position that
 * follows from them. This module holds the counting and nothing else, so the rule can be read in one
 * place and tested without a browser, a database or a page:
 *
 *   · An exam a student has a published result for counts toward their possible total. An exam nobody
 *     has marks for yet does not — a marksheet must not rank a child down for a column the teacher has
 *     not filled in, and it must not pretend the exam was never held either, so the column is still
 *     printed with an empty cell.
 *   · Absence is a result: it counts the exam's marks as possible and zero as obtained, because the
 *     child was on the roll and was not there. A child with no result row at all is simply not counted.
 *   · Positions are the ones the published results already use — equal totals share a position and the
 *     next position skips, so two students first means the next is third. A student with nothing counted
 *     has no position, and the sheet says so rather than putting them last.
 */

/** An exam held in the month, with the marks it was worth. */
export interface MarksheetExam{id:string;name:string;date:string;possible:number}

/** One result a student has, as the sheet reads it. `absent` is a result of its own, not a missing one. */
export interface MarksheetResult{obtained:number;possible:number;absent:boolean}

/** A student on the roll, with the results they have — keyed by exam id, missing where there is none. */
export interface MarksheetStudent{
  id:string;name:string;studentId:string;roll:string;
  results:Record<string,MarksheetResult|undefined>;
}

/** One printed row: the student, each exam's cell, the two totals and the position they earn. */
export interface MarksheetRow{
  student:MarksheetStudent;
  cells:Record<string,MarksheetResult|null>;
  obtained:number;possible:number;
  /** Rounded to one decimal, or null when nothing was counted. */
  percentage:number|null;
  /** Competition ranking: 1, 2, 2, 4. Null is "no position", not "last". */
  rank:number|null;
  /** True when somebody else shares this position, so the sheet can say "joint". */
  tied:boolean;
}

export interface Marksheet{
  exams:MarksheetExam[];
  rows:MarksheetRow[];
  /** The most any one student could have scored: every exam's marks added up. */
  totalPossible:number;
  /** How many exams the month actually held. */
  held:number;
}

/** A result worth counting: a number that is not negative and not more than the exam was worth. */
function counted(result:MarksheetResult|undefined):result is MarksheetResult{
  if(!result)return false;
  if(result.absent)return Number.isFinite(result.possible)&&result.possible>=0;
  return Number.isFinite(result.obtained)&&result.obtained>=0&&Number.isFinite(result.possible)&&result.possible>0;
}

export function buildMarksheet(exams:MarksheetExam[],students:MarksheetStudent[]):Marksheet{
  const rows:MarksheetRow[]=students.map(student=>{
    const cells:Record<string,MarksheetResult|null>={};
    let obtained=0,possible=0;
    for(const exam of exams){
      const result=student.results[exam.id];
      cells[exam.id]=counted(result)?result:null;
      if(counted(result)){
        possible+=result.possible;
        obtained+=result.absent?0:Math.min(result.obtained,result.possible);
      }
    }
    return {student,cells,obtained,possible,
      percentage:possible>0?Math.round((obtained/possible)*1000)/10:null,rank:null,tied:false};
  });
  /* Positions come from what was obtained, and only for rows that counted something: a child with no
     marks in the month has no position, which is a different sentence from "came last". */
  const ranked=rows.filter(row=>row.possible>0).sort((a,b)=>b.obtained-a.obtained||a.student.roll.localeCompare(b.student.roll,'en'));
  ranked.forEach((row,index)=>{
    const above=ranked[index-1];
    row.rank=above&&above.obtained===row.obtained?above.rank:index+1;
  });
  const byRank=new Map<number,number>();
  for(const row of ranked)if(row.rank!==null)byRank.set(row.rank,(byRank.get(row.rank)||0)+1);
  for(const row of ranked)if(row.rank!==null)row.tied=(byRank.get(row.rank)||0)>1;
  return {exams,rows,totalPossible:exams.reduce((sum,exam)=>sum+exam.possible,0),held:exams.length};
}

/** The months a marksheet can be asked for, newest first, in the centre's own calendar. */
export function marksheetMonths(now=new Date(),count=18):{year:number;month:number}[]{
  const today=new Date(now.getTime()+(6*3600*1000));
  const year=today.getUTCFullYear(),month=today.getUTCMonth()+1;
  return Array.from({length:count},(_,index)=>{
    const absolute=year*12+(month-1)-index;
    return {year:Math.floor(absolute/12),month:(absolute%12)+1};
  });
}
