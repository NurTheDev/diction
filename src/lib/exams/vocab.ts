/**
 * R5 · Exams — the vocabulary, and the grading scale the centre starts from.
 *
 * Everything here is pure and importable from a client component (no `node:` import anywhere in
 * `src/lib/exams`), so the exam form, the marks grid, the summary panel and the import preview all
 * read the same lists the server writes with. Words are never here: a label is a catalog key under
 * `exams.` in bn.json / en.json, and the screen — not this module — decides the language.
 *
 * Three rules from the brief live here rather than in a screen:
 *
 *   1. **An exam type is a closed list.** `monthly | model_test | term | class_test | other` is what
 *      the record stores and what the filter narrows on; a type nobody listed is dropped rather than
 *      stored, because a report that groups by type cannot group by a word it has never seen.
 *   2. **A grade is a band, and the band carries its point.** The standard Bangladeshi scale below is
 *      a DEFAULT, not a law: `CenterGradingScale` holds the owner's own ranges and an exam snapshots
 *      the scale that was active when it was created, so a result published in March still reads the
 *      same in December even after the owner moved a boundary.
 *   3. **Absence is not a zero.** `A` in a cell means "this student was not there", which is a
 *      different fact from "this student scored nothing", and the two must never be averaged together.
 */

export const EXAM_TYPES=['monthly','model_test','term','class_test','other'] as const;
export type ExamType=typeof EXAM_TYPES[number];

/** Message-catalog keys: the words live in bn.json / en.json under exams.typeLabels. */
export const EXAM_TYPE_LABEL_KEYS:Record<ExamType,string>={
  monthly:'typeLabels.monthly',model_test:'typeLabels.model_test',term:'typeLabels.term',
  class_test:'typeLabels.class_test',other:'typeLabels.other',
};

export const EXAM_STATUSES=['draft','published'] as const;
export type ExamStatus=typeof EXAM_STATUSES[number];
export const EXAM_STATUS_LABEL_KEYS:Record<ExamStatus,string>={draft:'status.draft',published:'status.published'};

/** The limits the record enforces, stated once so a form and a schema cannot drift apart. */
export const MAX_EXAM_SUBJECTS=8;
export const MAX_EXAM_CLASSES=12;
export const MAX_GRADE_BANDS=12;
export const MAX_EXAM_NAME=120;
export const MAX_SUBJECT_NAME=100;

/** One band of a grading scale: a percentage floor, the grade it gives, and that grade's GPA point. */
export interface GradeRange{min:number;max:number;grade:string;point:number}

/**
 * The standard Bangladeshi secondary scale, as the ranges the owner sees and edits.
 *
 * A result is graded by the highest `min` its percentage reaches, so the `max` of a range is what the
 * scale screen prints and not a second rule: 79.5% reaches `min:70` and is an A, which is the same
 * answer the band list gives. The F range's max is the pass boundary the scale is really stating.
 */
export const DEFAULT_GRADING_RANGES:GradeRange[]=[
  {min:80,max:100,grade:'A+',point:5},
  {min:70,max:79,grade:'A',point:4},
  {min:60,max:69,grade:'A-',point:3.5},
  {min:50,max:59,grade:'B',point:3},
  {min:40,max:49,grade:'C',point:2},
  {min:33,max:39,grade:'D',point:1},
  {min:0,max:32,grade:'F',point:0},
];

/**
 * A band as the exam stores it and the grader reads it: the floor, the label, the point.
 * `point` is optional on the way in because a band written before R5 has none, and a scale that cannot
 * be read is worse than one that says "no point recorded".
 */
export interface GradeBand{min:number;label:string;point?:number}

/** Ranges as the owner edits them → bands sorted from the top down, with the lowest floor at the end. */
export function rangesToBands(ranges:GradeRange[]):GradeBand[]{
  return [...ranges].sort((a,b)=>b.min-a.min).map(range=>({min:range.min,label:range.grade,point:range.point}));
}

/** Bands as stored → the ranges the scale screen prints, with each `max` filled from the band above. */
export function bandsToRanges(bands:GradeBand[]):GradeRange[]{
  const sorted=[...bands].sort((a,b)=>b.min-a.min);
  return sorted.map((band,index)=>({
    min:band.min,
    max:index===0?100:Math.min(100,sorted[index-1].min-1),
    grade:band.label,
    point:band.point??0,
  }));
}

/**
 * What a cell may say instead of a number. `A` is what the mark sheet has always used, and the Bangla
 * word is accepted because a sheet exported from a Bangla spreadsheet writes it.
 */
export const ABSENT_TOKENS=['a','absent','abs','\u0985\u09a8\u09c1\u09aa\u09b8\u09cd\u09a5\u09bf\u09a4','\u0985\u09a8\u09c1\u09aa\u09b8\u09cd\u09a5\u09bf\u09a4\u09bf'];

/** True when the text in a cell means "was not there" rather than a score. */
export function isAbsentToken(value:string):boolean{
  return ABSENT_TOKENS.includes(String(value||'').trim().toLowerCase());
}

/** The headers a marks sheet may use for the column that says WHOSE marks these are. */
export const STUDENT_COLUMN_HEADERS=[
  'studentid','student_id','id','student','roll','rollno','roll_no','name','studentname','student_name',
  '\u0986\u0987\u09a1\u09bf','\u09b8\u09cd\u099f\u09c1\u09a1\u09c7\u09a8\u09cd\u099f \u0986\u0987\u09a1\u09bf','\u09b0\u09cb\u09b2','\u09a8\u09be\u09ae','\u09b6\u09bf\u0995\u09cd\u09b7\u09be\u09b0\u09cd\u09a5\u09c0',
];
