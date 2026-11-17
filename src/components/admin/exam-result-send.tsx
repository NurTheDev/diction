'use client';
/**
 * Group 3 · "Send result SMS to guardians", and the proof behind it.
 *
 * The publish prompt already asks whether to send with the results, and it keeps that question. This is
 * the button for everything after it: a mark was corrected, the box was left unticked, or a guardian's
 * number arrived late. It sends through the same engine the publish sends through, so the rule that
 * matters is the same one — a student with no published marks is skipped, never texted an empty result —
 * and the answer says how many were skipped rather than leaving the operator to wonder.
 *
 * Every class of the exam produces its own batch, so every class gets its own line and its own link into
 * the SMS history filtered to that batch: the delivery proof for this exam is one click away, not a
 * search through every message the centre has ever sent.
 */
import {useActionState,useState} from 'react';
import {useTranslations} from 'next-intl';
import {Link} from '@/i18n/navigation';
import {sendExamResultsAction,type ResultSendState} from '@/actions/center-exams';
import {formatNumber,type Digits} from '@/lib/admin/format';

/** A reason the engine returns is a code; the operator reads a sentence. Checked by tests/i18n-catalog.test.ts. */
const RESULT_SEND_REASON_KEYS:Record<string,string>={
  'no students':'results.reasonNoStudents',
  'no results':'results.reasonNoResults',
  'autoResult off':'results.reasonToggleOff',
  'no recipient':'results.reasonNoRecipient',
  EMPTY_MESSAGE:'results.reasonEmptyMessage',
  SEND_FAILED:'results.reasonFailed',
};

export function SendExamResults({exam,published,digits}:{exam:string;published:boolean;digits:Digits}){
  const t=useTranslations('exams');
  const [agreed,setAgreed]=useState(false);
  const [state,action,pending]=useActionState<ResultSendState,FormData>(sendExamResultsAction,{status:'idle'});
  const sends=state.sends||[];
  const sent=sends.reduce((sum,send)=>sum+send.sent,0);
  const skipped=sends.reduce((sum,send)=>sum+send.skipped,0);
  const failed=sends.reduce((sum,send)=>sum+send.failed,0);
  const reasonKey=(reason:string):string=>
    RESULT_SEND_REASON_KEYS[reason]||(reason.startsWith('UNRENDERED_VARIABLE')?'results.reasonUnrendered':'results.reasonOther');
  return <div className="center-exam-send" data-exam-send>
    <p className="admin-help">{published?t('results.sendHelp'):t('results.draftHelp')}</p>
    <form action={action} className="admin-edit" data-exam-send-form>
      <input type="hidden" name="exam" value={exam}/>
      <input type="hidden" name="confirm" value={agreed?'YES':'NO'}/>
      <label className="admin-check"><input type="checkbox" data-exam-send-confirm checked={agreed}
        onChange={event=>setAgreed(event.target.checked)}/> {t('results.sendConfirm')}</label>
      <button className="button button-navy" data-exam-send-submit disabled={!published||!agreed||pending}>
        {pending?t('results.sending'):t('results.sendButton')}
      </button>
    </form>
    {/* The history link is beside the button on purpose: the question "did it actually go out?" belongs
        to the moment of sending, not to a later hunt through the SMS centre. */}
    <p className="admin-help" data-exam-send-links>
      <Link className="admin-mini-button" href="/admin/sms?template=exam_result" data-exam-send-history>{t('results.historyLink')}</Link>
    </p>
    {state.status==='ok'&&<div role="status" data-exam-send-result>
      <p data-exam-send-total>{t('results.sentSummary',{sent:formatNumber(sent,digits),skipped:formatNumber(skipped,digits),failed:formatNumber(failed,digits)})}</p>
      <ul className="center-exam-send-list">{sends.map(send=><li key={send.classId} data-exam-send-class={send.classId}>
        <strong>{send.className}</strong>
        <span>{t('results.classCounts',{sent:formatNumber(send.sent,digits),skipped:formatNumber(send.skipped,digits),failed:formatNumber(send.failed,digits)})}</span>
        {send.batchId
          ? <Link className="text-link" href={`/admin/sms?batch=${send.batchId}`} data-exam-send-proof={send.classId}>{t('results.proofLink')}</Link>
          : <span className="admin-help" data-exam-send-reason={send.classId}>{t(reasonKey(send.reason))}</span>}
      </li>)}</ul>
    </div>}
    {state.status==='error'&&state.messageKey&&<p role="alert" className="admin-feedback error" data-exam-send-error>{t(state.messageKey)}</p>}
  </div>;
}
