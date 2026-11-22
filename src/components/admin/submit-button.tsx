'use client';
/**
 * O1 · a save that says it is saving.
 *
 * A form that answers nothing between the click and the write is a form an operator clicks twice: the
 * second click lands on a drawer that has already closed, or posts the same write again, and the only
 * evidence either way is a database nobody is looking at. So every write this centre offers goes through
 * one button, and that button does three things while its request is in flight —
 *
 *   • it is **disabled**, so a second click is not a second write;
 *   • it **turns a spinner**, so the wait is visibly the machine's and not a dead screen;
 *   • it **changes its own word** to "saving…", so the operator can read what the wait is for without
 *     hunting for a status line somewhere else on the page.
 *
 * The idle button is the button that was there before: same label, same classes, same `data-` hooks and
 * the same `name`/`value` a form action reads — a `force=on` submit stays a `force=on` submit. Anything
 * a caller passes that this file does not declare travels straight onto the `<button>`, which is how the
 * hooks every screen is tested by keep working without this component knowing their names.
 */
import {useTranslations} from 'next-intl';
import type {ButtonHTMLAttributes,ReactNode} from 'react';

export interface SubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>{
  /** The form's own "a request is in flight": `pending` from `useActionState`, or a local one. */
  pending?:boolean;
  /** What the button says while it waits. Defaults to the one word every screen means: Saving… */
  busyLabel?:ReactNode;
  /** What the button says when it is not waiting. */
  label:ReactNode;
}

export function SubmitButton({pending=false,busyLabel,label,className,type='submit',disabled,
  ...rest}:SubmitButtonProps){
  const common=useTranslations('common');
  return <button type={type} {...rest} disabled={disabled||pending} aria-busy={pending||undefined}
    className={`${className||'button button-navy'}${pending?' button-busy':''}`}>
    {pending&&<span className="admin-spinner" aria-hidden="true"/>}
    {pending?(busyLabel??common('saving')):label}
  </button>;
}
