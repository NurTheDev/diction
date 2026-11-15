/**
 * R5 slice 2 · What a result SMS says.
 *
 * The spec fixes the sentence — the exam-result template's wording in `docs/SPEC.md` §R5 — and four of its
 * five chips belong to one student, not to the class: their own
 * subject-wise marks, their own total, their own position. So this module is the single place that turns a
 * stored result into those four strings, and `autoSendClassResults` attaches them per recipient through the
 * candidate's own `values` bag, which `resolveRecipients` already merges over the class-wide ones.
 *
 * It is pure on purpose. The sentence a family reads on result day is the one thing about this feature that
 * cannot be re-sent, so it is testable with no provider, no database, no session and no send: the reader
 * that fetches the rows lives in `exam-view.ts`, next to the other reads of stored results.
 *
 * Two decisions worth naming:
 *
 *   • **A student with nothing to report gets NO values**, and `buildSmsPlan` then skips them as
 *     `missing_value` — the sanctioned refusal, counted in the batch summary rather than hidden. An absent
 *     student is the case that matters: a result message saying "ফলাফল: —। মোট ০/১৫০, অবস্থান নেই" is a
 *     message that tells a parent their child failed, which is not what the register says.
 *   • **Numbers are Bangla digits**, because the template catalog is Bangla and a sentence that switches
 *     script mid-way is a sentence nobody's family reads twice. `formatNumber(value,'bn')` is the same
 *     helper every screen uses, so the SMS and the result table cannot disagree about a total.
 */
import {formatNumber} from '@/lib/admin/format';

export type ResultMessageSubject={id:string;name:string};
export type ResultMessageMark={subject:string;obtained:number|null;absent:boolean};
export type ResultMessageValues={exam:string;marks:string;total:string;rank:string};

/**
 * A subject with no mark reads as a dash rather than as a zero or as a word: a zero would claim the child
 * sat and scored nothing. The subject names around it are data the owner typed, which is why no catalog
 * string is read here and none is needed — the marks list is assembled from the exam itself.
 */
const NO_MARK='—';

/** A result row, the exam's shape, and the position publishing wrote — or `null` when there is nothing to say. */
export function resultMessage(input:{
  examName:string;
  subjects:ResultMessageSubject[];
  marks:ResultMessageMark[];
  total:number|null;
  fullTotal:number|null;
  position?:number|null;
  absent?:boolean;
}):ResultMessageValues|null{
  if(input.absent)return null;
  if(!input.examName.trim())return null;
  if(input.total===null||input.fullTotal===null)return null;
  // No position means publishing has not ranked this row, and a rank chip with nothing behind it would
  // render as a hole in the sentence — the plan refuses that recipient anyway, so refuse it here first.
  if(!input.position||input.position<1)return null;
  if(!input.subjects.length)return null;
  const scored=input.marks.filter(mark=>!mark.absent&&mark.obtained!==null);
  if(!scored.length)return null;
  const marks=input.subjects.map(subject=>{
    const mark=input.marks.find(entry=>entry.subject===subject.id);
    if(!mark||mark.absent||mark.obtained===null)return `${subject.name} ${NO_MARK}`;
    return `${subject.name} ${formatNumber(mark.obtained,'bn')}`;
  }).join(', ');
  return {
    exam:input.examName.trim(),
    marks,
    total:`${formatNumber(input.total,'bn')}/${formatNumber(input.fullTotal,'bn')}`,
    rank:formatNumber(input.position,'bn'),
  };
}
