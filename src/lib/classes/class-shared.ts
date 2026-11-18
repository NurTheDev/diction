/**
 * O1 · Class and batch management — the words and shapes, with no database behind them.
 *
 * This module exists because of one rule that is easy to break and impossible to see on a screen that
 * works: **a client component may only import modules that hold nothing but words, shapes and
 * arithmetic.** The class board's read lives in `class-view.ts`, which opens a Mongoose connection and
 * registers models. A client component that imports one helper from it drags that whole module into the
 * browser bundle, and there the model registration has nothing to register against — so the screen
 * renders on the server, arrives in the browser, and dies at hydration with a sentence about a model
 * that does not exist. The operator sees "the data could not be read" on a screen whose data was read
 * perfectly well, and the only trace is a client-side error nobody is looking at.
 *
 * So the three things the screen and its server action both need — the shift keys a checkbox writes,
 * the test for one, and the rule that says which words a card shows — live here, where they cost
 * nothing, and `class-view.ts` hands them on for the server's convenience. Nothing in this file may
 * import a model, Mongoose, or a server action.
 */

/** The shift keys this screen's own checkboxes write. A word already on the class is left as it is. */
export const CLASS_SHIFT_KEYS=['morning','day','evening'] as const;
export type ClassShiftKey=typeof CLASS_SHIFT_KEYS[number];

/** True when a stored shift is one of the three keys, so the card may translate it. */
export function isShiftKey(value:string):value is ClassShiftKey{
  return (CLASS_SHIFT_KEYS as readonly string[]).includes(String(value||'').trim().toLowerCase());
}

/**
 * What a class's card says its shifts are.
 *
 * A class written before this screen holds one free word in `shift` — the owner's own, sometimes in
 * Bangla — and that word is shown exactly as it stands. A class written here holds keys, and each key
 * is shown through the catalog in the language being read. Both arrive in one list, so a card never
 * says "no shift" about a class that has one.
 */
export function shiftWordsOf(card:{shifts:string[];shift:string}):string[]{
  const keys=card.shifts.map(value=>String(value).trim()).filter(Boolean);
  if(keys.length)return [...new Set(keys)];
  const word=String(card.shift||'').trim();
  return word?[word]:[];
}

/**
 * F-08 · A shift word a class wore before the boxes existed, recognised as one of the three keys.
 *
 * The owner's own word is kept exactly as it stands — a class that says "প্রভাতী" is not a morning
 * class and nothing here may decide that it is. But a word that IS one of the three labels is the same
 * fact the box would have written, so the first save of such a class puts the canonical key in
 * `shifts[]` beside it. From then on the boxes are the truth and the derived label always agrees with
 * them, which is what keeps a routine query, a dues query and a card reading one class one way.
 */
export function shiftKeyOfWord(word:string,labels:readonly string[]):ClassShiftKey|undefined{
  const value=String(word||'').trim();
  if(!value)return undefined;
  const at=labels.findIndex(label=>label===value);
  return at>=0?CLASS_SHIFT_KEYS[at]:undefined;
}

/**
 * F-16 · What the fee box on a class form holds, and what the operator meant by it.
 *
 * One number cannot say both "this class is free" and "nobody has decided this class's fee yet", so the
 * form carries the flag beside the box: an empty box with the tick off is the gap, an empty box with the
 * tick on is a free class, and a number in the box is that number. Clearing a fee that was set is
 * therefore an act the operator performs — empty the box, leave the tick off — and never something a
 * half-filled submit does on its way past.
 */
export type ClassFeeState={fee:string;free:boolean};
export function feeStateOf(monthlyFee:number,feeFree:boolean):ClassFeeState{
  const amount=Number(monthlyFee);
  if(!Number.isFinite(amount)||amount<=0)return {fee:'',free:feeFree===true};
  return {fee:String(Math.round(amount)),free:false};
}
/** True when a stored class advertises no price at all — neither a number nor the word "free". */
export function feeUnset(monthlyFee:number,feeFree:boolean):boolean{
  return !(Number(monthlyFee)>0)&&feeFree!==true;
}

/** One class as its card shows it. */
export interface ClassCardView{
  id:string;
  /** Both names, because a card shows the Bangla one and an edit form has to fill in both. */
  nameBn:string;nameEn:string;
  /** The name in the language being read, falling back to Bangla — a class without an English name
      still has a name. */
  name:string;
  level:string;
  /** The class's own shift word as the routine knows it, and the shifts this screen's boxes wrote. */
  shift:string;shifts:string[];
  room:string;
  academicYear:number;
  active:boolean;
  monthlyFee:number;
  /** F-16 · the sentence behind a zero: this class is deliberately free of charge. */
  feeFree:boolean;
  /** Children enrolled on this class right now — `active`, not held, not removed. */
  students:number;
  /** Batches assigned to this class that are still running. */
  batches:number;
  teachers:string[];
  /** The same assignment as ids, because the edit form's own boxes have to open already ticked. */
  teacherIds:string[];
  /** The class's own `updatedAt`, which is what an edit posts back so a stale write is refused. */
  revision:string;
}

/** A batch an operator may assign to a class. */
export interface BatchOption{id:string;name:string;grade:string;classId:string}

/** A teacher account a class may be given. F-04 · the one editor writes the teachers too, so the board
    hands it the same list the class list has always handed its own fold. */
export interface TeacherOption{id:string;name:string}

export interface ClassBoardView{
  cards:ClassCardView[];
  batchOptions:BatchOption[];
  teacherOptions:TeacherOption[];
  /** Every class the centre holds, live ones first — the cards are all of them, in that order. */
  total:number;
}
