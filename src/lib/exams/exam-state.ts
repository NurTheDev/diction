/**
 * R5 · Exams — the shapes that travel between the grid, the import wizard and the server actions.
 *
 * These live here rather than in `actions/center-exams.ts` for a mechanical reason with a real
 * consequence: a `'use server'` module may export async functions and nothing else, so a type declared
 * there cannot be handed to a client component. Keeping the contract in a plain module means the grid and
 * the actions are typed against the same declaration, and a change to one is a compile error in the other
 * rather than a mismatch discovered in a browser.
 *
 * Every refusal that reaches a screen is a catalog key plus its params — never a sentence. The action
 * turns an engine code into a key, and the component paints it in the reader's language.
 */
import type {GradeBand,GradeRange} from './vocab';

/** One row the batch refused, named so the grid can mark it and say why. */
export interface ExamRefusal{studentId:string;reason:string;messageKey:string}

/** What every exam action answers with. */
export interface ExamState{
  status:'idle'|'ok'|'error';
  messageKey?:string;
  messageParams?:Record<string,string|number>;
  id?:string;
  /** How many rows a batch actually wrote. */
  saved?:number;
  /** The students whose row had moved on since the grid read it. */
  stale?:string[];
  refusals?:ExamRefusal[];
}

/** A cell of an import preview, as the browser is allowed to see it. */
export interface ImportCell{subject:string;raw:string;ok:boolean;messageKey?:string;full?:number}

/** One row of an import preview: which student it matched, and why it is not ready if it is not. */
export interface ImportRow{
  row:number;status:string;statusKey:string;studentId:string;studentName:string;matches:string[];
  cells:ImportCell[];refusals:{messageKey:string}[];
}

export interface ImportCounts{rows:number;ready:number;unmatched:number;ambiguous:number;incomplete:number;invalid:number}

/** The dry run of an upload, and the hash that ties the commit to the very same bytes. */
export interface MarksImportState extends ExamState{
  hash?:string;fileLabel?:string;sheet?:string;studentColumn?:string|null;
  subjectColumns?:{subject:string;header:string}[];unusedHeaders?:string[];
  counts?:ImportCounts;rows?:ImportRow[];
}

/** One student's row as the grid posts it: the marks, and the revision it read them from. */
export interface GridRow{studentId:string;version:number;marks:{subject:string;obtained:number|null;absent:boolean;parts?:{name:string;obtained:number|null}[]}[]}

/** The exam's shape, as a form describes it and the engine stores it. */
export interface ExamShape{
  name:string;date:string;type:string;classIds:string[];
  subjects:{name:string;full:number;pass:number;parts:{name:string;marks:number}[]}[];bands:GradeBand[];scaleName:string;
}

/** A saved scale, as the exam form's picker and the scale screen both read it. */
export interface ScaleOption{id:string;name:string;ranges:GradeRange[];active:boolean}
