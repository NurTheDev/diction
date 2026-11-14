/**
 * The shape a library hands back when it has something to say and no language of its own.
 *
 * `src/lib/**` never imports next-intl, so a library cannot render a sentence for the reader. What it
 * can do is name one: a key that points into the catalogs, plus the values that fill it. The screen
 * that catches the message translates it, in the reader's language, exactly like the SMS layer does
 * with `messageKey` and its params.
 *
 * `ImportMessageError` is the same idea for a refusal. It carries the key and the params, and its
 * `message` is the Bangla rendering, because a thrown message is what a test asserts on and what a
 * log line shows — `tests/workbook-import-browser.integration.ts` requires
 * /শিক্ষার্থীর তথ্য বদলেছে/ to be in the rejection of `undoWorkbookImport`. Server-side callers build
 * that message with `throwImport` from `./import-text`, which reads the Bangla catalog, so the
 * sentence still lives in one place.
 */
export type MessageParams=Record<string,string>;

/** One sentence, named: `reasons.sharedMonthDue` with `{month:'6'}` to fill it. */
export type MessageRef={key:string;params?:MessageParams};

export class ImportMessageError extends Error{
  constructor(readonly key:string,readonly params:MessageParams|undefined,message:string){
    super(message);
    this.name='ImportMessageError';
  }
}
