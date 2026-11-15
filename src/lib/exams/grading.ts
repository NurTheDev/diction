/**
 * R5 · Exams — what a set of marks means.
 *
 * The engine that decides a grade has been in the codebase since the experimental exam screen
 * (`lib/center/exam-marks`), and it stays the one rule: this module reads through it and adds the three
 * things a result sheet owes beside the grade — the GPA point of the band it landed in, the pass or
 * fail of each subject on its own, and the class summary the owner reads before publishing.
 *
 * The rules, all of them from the brief:
 *
 *   • **Absence is not a zero.** A student marked absent is counted in the class as absent, is left out
 *     of every average, and gets no position. Folding them into a zero would drag an average down for a
 *     student who was never in the room.
 *   • **A subject below its own pass mark fails the result**, whatever the total says: the grade of a
 *     result with a failed subject is FAIL, and the scale is not consulted.
 *   • **Position is by total, ties share it, and the next position skips.** Three students on 120 are
 *     all 1st and the next is 4th — 1st, 2nd, 2nd, 4th — because a position is "how many scored more",
 *     not a row number.
 *   • **A summary that has nobody to summarize says so with `null`**, never with a zero: an average of
 *     0 over an empty class reads as "they all scored nothing".
 */
import {calculateExam,rankResults,validateBands} from '../center/exam-marks';
import type {GradeBand,GradeRange} from './vocab';

export interface ExamSubject{id:string;full:number;pass:number}
export interface MarkEntry{subject:string;obtained:number|null;absent:boolean}

export interface SubjectResult{
  subject:string;obtained:number|null;absent:boolean;passed:boolean;full:number;pass:number;
}

export interface CalculatedResult{
  total:number;fullTotal:number;percentage:number;grade:string;point:number;
  absent:boolean;failed:boolean;subjects:SubjectResult[];
}

/** Bands in, validated and normalized: sorted from the top down, the lowest floor last, points filled. */
export function normalizeBands(bands:(GradeBand|{min:number;label:string;point?:number})[]):GradeBand[]{
  const checked=validateBands(bands.map(band=>({min:band.min,label:band.label})));
  const points=new Map(bands.map(band=>[band.min,band.point??0]));
  return checked.map(band=>({min:band.min,label:band.label,point:points.get(band.min)??0}));
}

/** The point of the band a percentage lands in, or 0 for a result that is absent or failed. */
export function pointFor(bands:GradeBand[],percentage:number,grade:string):number{
  if(grade==='ABSENT'||grade==='FAIL')return 0;
  const sorted=[...bands].sort((a,b)=>b.min-a.min);
  const band=sorted.find(entry=>percentage>=entry.min)||sorted[sorted.length-1];
  return band?.point??0;
}

/**
 * One student's marks → everything the result row carries.
 *
 * Throws `INVALID_MARKS` / `INVALID_GRADING` exactly as the engine does: this is the last check before
 * a write, and a mark the engine would refuse must never be summarized into a grade first.
 */
export function calculateResult(subjects:ExamSubject[],bands:GradeBand[],marks:MarkEntry[]):CalculatedResult{
  const normalized=normalizeBands(bands);
  const calculated=calculateExam(subjects,normalized,marks);
  const byId=new Map(subjects.map(subject=>[subject.id,subject]));
  const subjectResults:SubjectResult[]=marks.map(mark=>{
    const subject=byId.get(mark.subject);
    const full=subject?.full??0,pass=subject?.pass??0;
    return {
      subject:mark.subject,obtained:mark.absent?null:mark.obtained,absent:mark.absent,
      passed:!mark.absent&&mark.obtained!==null&&mark.obtained>=pass,full,pass,
    };
  });
  return {
    total:calculated.total,fullTotal:calculated.fullTotal,percentage:calculated.percentage,
    grade:calculated.grade,point:pointFor(normalized,calculated.percentage,calculated.grade),
    absent:calculated.absent,failed:calculated.failed,subjects:subjectResults,
  };
}

/** A row that can be ranked: whose it is, what it scored, and whether it was there at all. */
export interface RankableRow{student:string;total:number;grade:string}

/**
 * Positions with ties shared, as a map from student id to position.
 *
 * An absent student is not in the map at all, so a screen prints "—" for them instead of a position
 * nobody earned. The order the engine ranks in is by total, descending, which is the whole rule.
 */
export function positionOf(rows:RankableRow[]):Map<string,number>{
  const ranked=rankResults(rows.map(row=>({student:row.student,total:row.total,grade:row.grade})));
  return new Map(ranked.map(row=>[row.student,row.position]));
}

export interface SubjectSummary{
  subject:string;counted:number;absent:number;passed:number;failed:number;
  average:number|null;highest:number|null;lowest:number|null;
}

export interface ClassSummary{
  students:number;counted:number;absent:number;failed:number;passed:number;
  average:number|null;highest:number|null;lowest:number|null;passRate:number|null;
  subjects:SubjectSummary[];
}

/** One stored result, as the summary reads it. */
export interface SummaryRow{
  total:number;grade:string;marks:{subject:string;obtained:number|null;absent:boolean}[];
}

/**
 * A scale must cover 0–100 exactly once: no gap, no overlap, one grade per range, integer-free bounds.
 *
 * The check is here rather than in the action that saves a scale because it is a rule about ranges, not
 * about the request: the exam form previews a scale, the scale screen saves one, and both need the same
 * answer. A percentage that fell in a gap would have no grade, and one inside two ranges would have two.
 */
export function validateRanges(ranges:unknown[]):{ranges:GradeRange[];error?:string;params?:Record<string,string|number>}{
  if(!Array.isArray(ranges)||ranges.length<2||ranges.length>12)return {ranges:[],error:'SCALE_INVALID'};
  const parsed:GradeRange[]=ranges.map(raw=>{
    const value=raw as {min?:unknown;max?:unknown;grade?:unknown;point?:unknown};
    return {min:Number(value?.min),max:Number(value?.max),grade:String(value?.grade||'').trim().slice(0,30),point:Number(value?.point??0)};
  });
  if(parsed.some(range=>!Number.isFinite(range.min)||!Number.isFinite(range.max)||!Number.isFinite(range.point)))return {ranges:[],error:'SCALE_INVALID'};
  if(parsed.some(range=>range.min<0||range.max>100||range.min>range.max||!range.grade||range.point<0||range.point>5))return {ranges:[],error:'SCALE_INVALID'};
  if(new Set(parsed.map(range=>range.grade)).size!==parsed.length)return {ranges:[],error:'SCALE_DUPLICATE_GRADE'};
  const sorted=[...parsed].sort((a,b)=>b.min-a.min);
  if(sorted[sorted.length-1].min!==0)return {ranges:[],error:'SCALE_MISSING_ZERO'};
  if(sorted[0].max!==100)return {ranges:[],error:'SCALE_MISSING_HUNDRED'};
  for(let index=1;index<sorted.length;index+=1){
    if(sorted[index].max>=sorted[index-1].min)return {ranges:[],error:'SCALE_OVERLAP',params:{grade:sorted[index].grade}};
    if(sorted[index].max!==sorted[index-1].min-1)return {ranges:[],error:'SCALE_GAP',params:{grade:sorted[index].grade,above:sorted[index-1].grade}};
  }
  return {ranges:sorted};
}

const round1=(value:number):number=>Math.round(value*10)/10;
const stats=(values:number[]):{average:number|null;highest:number|null;lowest:number|null}=>{
  if(!values.length)return {average:null,highest:null,lowest:null};
  const sum=values.reduce((total,value)=>total+value,0);
  return {average:round1(sum/values.length),highest:Math.max(...values),lowest:Math.min(...values)};
};

/**
 * The class summary: how many sat, how many were absent, how many failed, the average, the top and the
 * bottom of the class, the pass rate, and the same figures per subject.
 *
 * Every average is over the students who were PRESENT and had that subject marked — a blank cell is not
 * a zero and an absent student is not in the denominator.
 */
export function classSummary(rows:SummaryRow[],subjects:ExamSubject[]):ClassSummary{
  const present=rows.filter(row=>row.grade!=='ABSENT');
  const failed=present.filter(row=>row.grade==='FAIL').length;
  const totals=present.map(row=>row.total);
  const subjectSummaries:SubjectSummary[]=subjects.map(subject=>{
    const entries=rows.flatMap(row=>row.marks.filter(mark=>mark.subject===subject.id));
    const absent=entries.filter(entry=>entry.absent).length;
    const scored=entries.filter(entry=>!entry.absent&&entry.obtained!==null);
    const values=scored.map(entry=>Number(entry.obtained));
    return {
      subject:subject.id,counted:scored.length,absent,
      passed:scored.filter(entry=>Number(entry.obtained)>=subject.pass).length,
      failed:scored.filter(entry=>Number(entry.obtained)<subject.pass).length,
      ...stats(values),
    };
  });
  return {
    students:rows.length,counted:present.length,absent:rows.length-present.length,failed,
    passed:present.length-failed,...stats(totals),
    passRate:present.length?round1(((present.length-failed)/present.length)*100):null,
    subjects:subjectSummaries,
  };
}
