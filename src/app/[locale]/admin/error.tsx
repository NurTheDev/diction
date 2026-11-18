'use client';
import {useTranslations} from 'next-intl';
/**
 * The screen a failed admin route lands on.
 *
 * The sentence is deliberately plain — "the data could not be read, check the connection and the
 * permissions" — because that is what is true for every failure that reaches here, and an operator is
 * not helped by a stack trace. But a screen that says nothing about *which* failure it is costs the
 * next reader a whole run to find out: this route has died twice in verification — once on a client
 * bundle that held a Mongoose model, once mid-write on a server action — and both deaths looked
 * identical from the outside. So the boundary carries the failure's own first line in a `title`, where
 * a cursor can read it and a test can: the message, never the stack, and never more than one line.
 */
export default function AdminError({error,reset}:{error:Error;reset:()=>void}){
  const t=useTranslations('admin');
  const why=String(error?.message||error||'').split('\n')[0].slice(0,200);
  return <div className="admin-content" data-admin-error={why||'no message'} title={why||'no message'}>
    <div className="admin-panel"><div className="admin-panel-body">
      <h2>{t('pageUnavailable')}</h2>
      <button className="admin-mini-button" onClick={reset}>{t('back')}</button>
    </div></div>
  </div>;
}
