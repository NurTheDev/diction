'use client';

/**
 * SendSmsDialog (R2) — the ONE compose surface the spec asks for.
 *
 * Reused by every entry point (due list, student profile, the student list's bulk action, the payment
 * success screen, Visitors, Teacher CVs and the SMS page's "new message"). Each caller passes a
 * machine-readable source request plus the template catalog; nothing about who may be contacted is
 * decided here — that is sms-recipients.ts, reached only through /api/admin/sms/send.
 *
 * The four steps are the spec's four steps: recipients (skipped numbers with their reasons, the
 * guardian|student|both choice, one-message-per-phone for siblings), the message (template picker or
 * custom text with variable chips), a live preview of the first three messages with characters,
 * segments and cost against the balance, and finally ONE green send button followed by progress, a
 * result summary and "Retry failed".
 *
 * Double-clicking send cannot send twice: the button is disabled the moment it is clicked and the
 * same requestId travels with every call, which the batch's unique index enforces server-side.
 */

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AlertTriangle,CheckCircle2,Loader2,Send,X} from 'lucide-react';
import {SMS_VARIABLES} from '@/lib/center/sms-templates';
import {dailyLimitLine} from '@/lib/center/sms-staff';
import type {SmsSkipReason} from '@/lib/center/sms-recipients';

export type SmsSendRequest={
  source:'dues'|'class'|'students'|'student'|'receipt'|'lead'|'leads';
  classGroup?:string;
  ids?:string[];
  id?:string;
  receipt?:{student:string;amount:number;month:string;receiptNo:string;dueDate?:string};
};

export type SmsTemplateOption={key:string;name:string;body:string;active:boolean;edited:boolean};

export type SmsPreview={
  phones:number;messages:number;segments:number;cost:number;unitCost:number;
  balance:number|null;balanceOk:boolean;lowBalance:boolean;
  quiet:boolean;quietUntil:string;blocked:string|null;month:string;body:string;
  recipients:{phone:string;studentName:string;preview:string;segments:number;cost:number}[];
  skipped:{reason:SmsSkipReason;labelBn:string;labelEn:string;studentName:string;phone:string}[];
  skippedCount:number;
  groupingRefused:{phone:string;reason:string}[];
  duplicates:{id:string;name:string}[];
};

export type SmsSendResult={
  ok:boolean;blocked?:string;error?:string;message?:string;
  batchId?:string;status?:string;
  sent?:number;failed?:number;skipped?:number;queued?:number;
  quietUntil?:string;monthTotals?:{sent:number;failed:number;skipped:number;queued:number;segments:number;cost:number};
};

/** What /api/admin/sms/send returns: one shape for preview, send and retry. */
/** R3.11: the route also answers with the day's ceiling and, when it refuses, with the sentence to show. */
export type SmsCallResult=SmsSendResult&{preview?:SmsPreview;institutePhone?:string;className?:string;detail?:string;
  daily?:{limit:number;sent:number;remaining:number}|null;messageBn?:string;messageEn?:string};

type Props={
  open:boolean;
  onClose:()=>void;
  request:SmsSendRequest;
  templates:SmsTemplateOption[];
  titleBn:string;
  titleEn:string;
  defaultTemplateKey?:string;
  institutePhone?:string;
  en?:boolean;
  /** Called after a send or a retry succeeded, so the caller can refresh its own screen. */
  onSent?:()=>void;
  /**
   * R3.11: the message is shown, not written. A staff sender gets the visitor thank-you word for word
   * — no textarea, no variable chips — and the server refuses any custom text from them anyway
   * (`smsSendPolicyRefusal`), so hiding the box is the same rule seen from the front.
   */
  lockedText?:boolean;
};

const STEPS_BN=['প্রাপক','বার্তা','প্রিভিউ','পাঠানো'];
const STEPS_EN=['Recipients','Message','Preview','Send'];

function newRequestId():string{
  if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')return crypto.randomUUID();
  return 'sms-0000-0000-0000-000000000000';
}

/** Segments follow the spec: 70 per Unicode message, 67 per part once it has to be split. */
export function segmentCount(text:string):number{
  const length=[...text].length;
  if(!length)return 0;
  return length<=70?1:Math.ceil(length/67);
}

export default function SendSmsDialog({open,onClose,request,templates,titleBn,titleEn,defaultTemplateKey='due_reminder',institutePhone='',en=false,onSent,lockedText=false}:Props){
  const t=useCallback((bn:string,label:string)=>(en?label:bn),[en]);
  /** A visitor send (R3.9): one number per lead, no fee chips, and no guardian/student choice to make. */
  const isLead=request.source==='lead'||request.source==='leads';
  const [step,setStep]=useState(1);
  const [templateKey,setTemplateKey]=useState(defaultTemplateKey);
  const [text,setText]=useState('');
  /** {subject} is the one variable no source can know: a notice topic, or the subject a teacher is needed for. */
  const [subject,setSubject]=useState('');
  const [target,setTarget]=useState<'guardian'|'student'|'both'>('guardian');
  /**
   * A lead's only number is carried as its guardian number, so a visitor send is always a guardian send.
   * The picker does not offer the choice (there is no second number to choose), and the request does not
   * trust the state either: 'student' or 'both' against a lead would resolve to NOBODY, and a send that
   * quietly covers nobody is worse than a radio button that is not there.
   */
  const sendTarget=isLead?'guardian':target;
  const [groupSiblings,setGroupSiblings]=useState(true);
  const [force,setForce]=useState(false);
  const [skipDuplicates,setSkipDuplicates]=useState(false);
  const [showRecipients,setShowRecipients]=useState(false);
  const [preview,setPreview]=useState<SmsPreview|null>(null);
  /** R3.11: what today's ceiling leaves for this operator, reported by every preview. */
  const [daily,setDaily]=useState<{limit:number;sent:number;remaining:number}|null>(null);
  const [previewError,setPreviewError]=useState('');
  const [loadingPreview,setLoadingPreview]=useState(false);
  const [sending,setSending]=useState(false);
  /** R3.11: the whole answer, not just the send summary — a refusal can carry the sentence to show. */
  const [result,setResult]=useState<SmsCallResult|null>(null);
  const [retrying,setRetrying]=useState(false);
  const [requestId,setRequestId]=useState('');
  const textRef=useRef<HTMLTextAreaElement|null>(null);
  const sendRef=useRef<HTMLButtonElement|null>(null);

  // A caller that rebuilds its request object on every render must not reset an open dialog, so the
  // reset keys on the serialized request rather than on object identity.
  const requestKey=useMemo(()=>JSON.stringify(request),[request]);
  const requestRef=useRef(request);
  useEffect(()=>{requestRef.current=request},[request,requestKey]);

  useEffect(()=>{
    if(!open)return;
    setStep(1);setResult(null);setSending(false);setRetrying(false);setForce(false);
    setSkipDuplicates(false);setShowRecipients(false);setPreview(null);setPreviewError('');
    setRequestId(newRequestId());setTemplateKey(defaultTemplateKey);setText('');setSubject('');
  },[open,requestKey,defaultTemplateKey]);

  useEffect(()=>{
    if(!open)return;
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!sending)onClose()};
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[open,onClose,sending]);

  const call=useCallback(async(payload:Record<string,unknown>):Promise<{status:number;data:SmsCallResult|null}>=>{
    try{
      const response=await fetch('/api/admin/sms/send',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...requestRef.current,...payload}),
      });
      const data=await response.json().catch(()=>null);
      return {status:response.status,data:(data||null) as SmsCallResult|null};
    }catch{
      return {status:0,data:null};
    }
  },[]);

  const loadPreview=useCallback(async()=>{
    if(!requestId)return;
    setLoadingPreview(true);
    const {status,data}=await call({mode:'preview',requestId,templateKey,text,subject,target:sendTarget,groupSiblings});
    if(status&&data?.ok&&data.preview){setPreview(data.preview);setPreviewError('')}
    else{setPreview(data?.preview||null);setDaily(data?.daily||null);setPreviewError(String((en?data?.messageEn:data?.messageBn)||data?.detail||data?.error||data?.blocked||(status?'UNAVAILABLE':'NETWORK')))}
    setLoadingPreview(false);
  },[call,requestId,templateKey,text,subject,sendTarget,groupSiblings]);

  // Debounced, so typing a custom message does not fire a request per keystroke.
  useEffect(()=>{
    if(!open||!requestId)return;
    const timer=setTimeout(()=>{void loadPreview()},text?450:0);
    return ()=>clearTimeout(timer);
  },[open,requestId,loadPreview,text]);

  const skippedGroups=useMemo(()=>{
    const items=preview?.skipped||[];
    const counts=new Map<SmsSkipReason,{labelBn:string;labelEn:string;count:number}>();
    for(const item of items){
      const found=counts.get(item.reason);
      if(found)found.count+=1;
      else counts.set(item.reason,{labelBn:item.labelBn,labelEn:item.labelEn,count:1});
    }
    return [...counts.entries()].map(([reason,value])=>({reason,...value}));
  },[preview]);

  if(!open)return null;

  const activeTemplate=templates.find(item=>item.key===templateKey)||null;
  const body=templateKey==='custom'?text:(result?.ok?'':activeTemplate?.body||preview?.body||'');
  const characters=[...(preview?.body||body)].length;
  const emptyMessage=templateKey==='custom'&&!text.trim();
  const needsSubject=/\{subject\}/.test(preview?.body||body);
  // A blocked plan is the server telling us the message would go out with a hole in it. The operator
  // gets the reason plus, for the two fixable ones, the field that fixes it.
  const planBlocked=preview?.blocked&&preview.blocked!=='EMPTY_MESSAGE'?preview.blocked:'';
  const hardError=previewError&&!emptyMessage&&previewError!=='EMPTY_MESSAGE'
    ?previewError
    :planBlocked.startsWith('UNRENDERED_VARIABLE')
      ?t(`${planBlocked.slice(planBlocked.indexOf(':')+1)} এর মান নেই — নিচে পূরণ করুন।`,`${planBlocked.slice(planBlocked.indexOf(':')+1)} has no value — fill it in below.`)
      :planBlocked;
  const quietBlocked=!!preview?.quiet&&!force;
  const canSend=!!preview&&preview.phones>0&&!hardError&&!emptyMessage&&!preview.blocked;

  const insertChip=(chip:string)=>{
    const token=`{${chip}}`;
    const field=textRef.current;
    if(templateKey!=='custom'){setTemplateKey('custom');setText(token);return}
    if(!field){setText(value=>`${value}${token}`);return}
    const start=field.selectionStart??text.length,end=field.selectionEnd??text.length;
    setText(`${text.slice(0,start)}${token}${text.slice(end)}`);
    requestAnimationFrame(()=>{field.focus();field.setSelectionRange(start+token.length,start+token.length)});
  };

  const send=async()=>{
    if(sending||!requestId||!canSend)return;
    setSending(true);setResult(null);
    const {status,data}=await call({mode:'send',requestId,templateKey,text,subject,target:sendTarget,groupSiblings,force,skipDuplicates});
    if(data&&(data.ok||data.blocked))setResult(data);
    else setResult({ok:false,error:String(data?.detail||data?.error||(status?'UNAVAILABLE':'NETWORK')),message:String((en?data?.messageEn:data?.messageBn)||'')||t('পাঠানো যায়নি','Could not send')});
    setSending(false);
    if(data?.ok&&data.batchId&&data.status!=='queued')onSent?.();
    sendRef.current?.focus();
  };

  const retry=async()=>{
    const batchId=result?.batchId||'';
    if(!batchId||retrying)return;
    setRetrying(true);
    const {data}=await call({mode:'retry',batchId});
    if(data?.ok)setResult(current=>current?{...current,failed:data.failed??0,sent:(current.sent||0)+(data.sent||0),status:data.failed?'partial':'done'}:current);
    else setResult(current=>current?{...current,error:String(data?.error||'UNAVAILABLE')}:current);
    setRetrying(false);
    if(data?.ok&&!data.failed)onSent?.();
  };

  return (
    <div className="sms-overlay" onClick={()=>{if(!sending)onClose()}}>
      <div className="sms-dialog" role="dialog" aria-modal="true" aria-label={en?titleEn:titleBn} data-sms-dialog="" onClick={event=>event.stopPropagation()}>
        <header className="sms-head">
          <div>
            <h2>{en?titleEn:titleBn}</h2>
            <p className="admin-help">{t('ধাপ','Step')} {step} / 4 — {(en?STEPS_EN:STEPS_BN)[step-1]}</p>
          </div>
          <button type="button" className="admin-mini-button" onClick={onClose} disabled={sending} aria-label={t('বন্ধ করুন','Close')}>
            <X aria-hidden="true" size={14} />
          </button>
        </header>

        <ol className="sms-steps" aria-hidden="true">
          {[1,2,3,4].map(item=><li key={item} data-active={item===step?'true':'false'} data-done={item<step?'true':'false'}>{item}</li>)}
        </ol>

        {step===1&&(
          <section className="sms-step" data-sms-step="1">
            <p className="admin-help" data-sms-summary="">
              {loadingPreview&&!preview
                ?t('প্রাপক গণনা হচ্ছে…','Counting recipients…')
                :preview
                  ?`${t('মোট','Total')} ${preview.phones} ${t('নম্বর','numbers')} · ${preview.messages} ${t('বার্তা','messages')} · ${preview.segments} ${t('সেগমেন্ট','segments')}`
                  :t('প্রাপক গণনা হচ্ছে…','Counting recipients…')}
            </p>
            {daily&&<p className="admin-help" data-sms-daily="">{dailyLimitLine(daily.limit,daily.remaining,en?'en':'bn')}</p>}
            {hardError&&<p className="admin-feedback error" role="status">{hardError}</p>}

            <fieldset className="admin-fieldset">
              <legend>{isLead?t('ভিজিটরের নম্বর','The visitor number'):t('কাকে পাঠাবেন','Who receives it')}</legend>
              {/* A lead has one number, the first one written on the sheet — not a guardian's and a
                  student's. Offering the choice would offer two ways to reach nobody, so it is not
                  offered, and the send goes to that one number as a guardian message. */}
              {isLead
                ?<p className="admin-help">{t('লিডের প্রথম নম্বরটিতেই পাঠানো হয়।','It goes to the first number on the lead.')}</p>
                :([['guardian',t('অভিভাবক','Guardian')],['student',t('শিক্ষার্থী','Student')],['both',t('উভয়','Both')]] as const).map(([value,label])=>(
                  <label className="admin-check" key={value}>
                    <input type="radio" name="smsTarget" value={value} checked={target===value} onChange={()=>setTarget(value)} />
                    {label}
                  </label>
                ))}
              <label className="admin-check">
                <input type="checkbox" name="smsGroupSiblings" checked={groupSiblings} onChange={event=>setGroupSiblings(event.target.checked)} />
                {isLead
                  ?t('একই নম্বরে একটিই বার্তা (একই পরিবারের ভিজিটর একসাথে)','One message per number (one family, one message)')
                  :t('একই নম্বরে একটিই বার্তা (ভাইবোন একসাথে, মোট টাকা)','One message per phone (siblings combined, with the total)')}
              </label>
            </fieldset>

            {!!preview?.duplicates.length&&(
              <fieldset className="admin-fieldset" data-sms-duplicates="">
                <legend>{t('গত ২৪ ঘণ্টায় একই টেমপ্লেট পাঠানো হয়েছে','Same template already sent in the last 24 hours')}</legend>
                <p className="admin-help">{preview.duplicates.map(item=>item.name||item.id).join(', ')}</p>
                <label className="admin-check">
                  <input type="checkbox" name="smsSkipDuplicates" checked={skipDuplicates} onChange={event=>setSkipDuplicates(event.target.checked)} />
                  {t('এদের বাদ দিন','Skip those')}
                </label>
              </fieldset>
            )}

            {!!skippedGroups.length&&(
              <div className="sms-skipped" data-sms-skipped="">
                <strong>{t(`${preview?.skippedCount||0}টি নম্বর বাদ পড়েছে`,`${preview?.skippedCount||0} numbers skipped`)}</strong>
                <ul>
                  {skippedGroups.map(item=>(
                    <li key={item.reason}>{en?item.labelEn:item.labelBn} — <span className="admin-help">{item.count}</span></li>
                  ))}
                </ul>
              </div>
            )}

            {!!preview?.groupingRefused.length&&(
              <p className="admin-feedback" data-sms-grouping-refused="">
                {t('কয়েকটি নম্বরে ভাইবোন একসাথে করা যায়নি — যোগ করা টাকা সঠিক হতো না, তাই আলাদা বার্তা যাবে।',
                  'A few phones could not be combined: the merged total would not have been accurate, so they are sent separately.')}
              </p>
            )}

            <button type="button" className="admin-mini-button" onClick={()=>setShowRecipients(value=>!value)} data-sms-recipients-toggle="" aria-expanded={showRecipients}>
              {showRecipients?t('তালিকা লুকান','Hide the list'):t('প্রাপকের তালিকা দেখুন','Show the recipient list')}
            </button>
            {showRecipients&&(
              <div className="admin-table-wrap">
                <table className="admin-table" data-sms-recipients="">
                  <thead>
                    <tr>
                      <th scope="col">{t('শিক্ষার্থী','Student')}</th>
                      <th scope="col">{t('নম্বর','Phone')}</th>
                      <th scope="col">{t('সেগমেন্ট','Segments')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview?.recipients||[]).map(item=>(
                      <tr key={item.phone}><td>{item.studentName||'—'}</td><td dir="ltr">{item.phone}</td><td>{item.segments}</td></tr>
                    ))}
                    {!(preview?.recipients||[]).length&&(
                      <tr><td colSpan={3} className="admin-empty">{t('পাঠানোর মতো কেউ নেই','Nobody to message')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {step===2&&(
          <section className="sms-step" data-sms-step="2">
            <fieldset className="admin-fieldset">
              <legend>{t('টেমপ্লেট','Template')}</legend>
              {templates.map(item=>(
                <label className="admin-check" key={item.key}>
                  <input type="radio" name="smsTemplate" value={item.key} checked={templateKey===item.key}
                    onChange={()=>{setTemplateKey(item.key);if(item.key!=='custom')setText('')}} />
                  {item.name}
                  {item.edited?` · ${t('সম্পাদিত','edited')}`:''}
                  {!item.active?` · ${t('নিষ্ক্রিয়','inactive')}`:''}
                </label>
              ))}
            </fieldset>

            {/* R3.11: a staff sender reads the message, they do not write it — the thank-you, word for
                word, with no textarea and no chips to bend it into something else. */}
            {lockedText
              ?<p className="admin-help" data-sms-locked="">{activeTemplate?.body||''}</p>
              :<label className="admin-check sms-text-label" htmlFor="sms-custom-text">
                <span>{t('বার্তা','Message')}</span>
                <textarea id="sms-custom-text" className="admin-textarea" name="smsText" ref={textRef} rows={templateKey==='custom'?6:3}
                  value={templateKey==='custom'?text:(activeTemplate?.body||'')}
                  onChange={event=>{setTemplateKey('custom');setText(event.target.value)}}
                  placeholder={t('এখানে লিখুন…','Write here…')} />
              </label>}
            {!lockedText&&<div className="sms-chips" data-sms-chips="">
              {SMS_VARIABLES.map(chip=>(
                <button type="button" key={chip} className="admin-mini-button" data-sms-chip={chip} onClick={()=>insertChip(chip)}>
                  {`{${chip}}`}
                </button>
              ))}
            </div>}
            {needsSubject&&(
              <label className="admin-check sms-text-label" htmlFor="sms-subject">
                <span>{t('বিষয় ({subject} এর মান)','Subject (the value of {subject})')}</span>
                <input id="sms-subject" className="admin-input" name="smsSubject" value={subject} maxLength={120}
                  onChange={event=>setSubject(event.target.value)}
                  placeholder={t('যেমন: নোটিশ / গণিত শিক্ষক প্রয়োজন','e.g. a notice topic, or the subject a teacher is needed for')} />
              </label>
            )}
            {institutePhone&&<p className="admin-help">{t('প্রতিষ্ঠানের নম্বর','Institute phone')}: <span dir="ltr">{institutePhone}</span></p>}
          </section>
        )}

        {step===3&&(
          <section className="sms-step" data-sms-step="3">
            <div className="sms-previews" data-sms-previews="">
              {(preview?.recipients||[]).map(item=>(
                <article className="sms-preview" key={item.phone} data-sms-preview="">
                  <header><strong>{item.studentName||item.phone}</strong><span dir="ltr">{item.phone}</span></header>
                  <p className="admin-cell-message" dir="auto">{item.preview}</p>
                  <footer className="admin-help">{item.segments} {t('সেগমেন্ট','segments')} · ৳{item.cost.toFixed(2)}</footer>
                </article>
              ))}
              {!(preview?.recipients||[]).length&&<p className="admin-empty">{t('পাঠানোর মতো বার্তা নেই।','There is nothing to send.')}</p>}
            </div>

            <dl className="admin-defs" data-sms-figures="">
              <div><dt>{t('অক্ষর','Characters')}</dt><dd data-sms-characters="">{characters}</dd></div>
              <div><dt>{t('বার্তা','Messages')}</dt><dd data-sms-messages="">{preview?.messages??0}</dd></div>
              <div><dt>{t('সেগমেন্ট','Segments')}</dt><dd data-sms-segments="">{preview?.segments??0}</dd></div>
              <div><dt>{t('আনুমানিক খরচ','Estimated cost')}</dt><dd data-sms-cost="">৳{(preview?.cost??0).toFixed(2)}</dd></div>
              <div><dt>{t('ব্যালান্স','Balance')}</dt><dd data-sms-balance="">
                {preview?.balanceOk?`৳${(preview?.balance??0).toFixed(2)}`:t('পাওয়া যায়নি','Unavailable')}
              </dd></div>
            </dl>

            {preview?.lowBalance&&(
              <p className="admin-feedback error" role="status" data-sms-low-balance="">
                <AlertTriangle aria-hidden="true" size={14} /> {t('ব্যালান্স যথেষ্ট নয় — কিছু বার্তা জমা হবে না।','Not enough balance: some messages will not be submitted.')}
              </p>
            )}
            {preview?.quiet&&(
              <p className="admin-feedback" role="status" data-sms-quiet="">
                {t('এখন নিঃশব্দ সময়','Quiet hours now')} ({preview.quietUntil}) — {t('পাঠালে কিউতে জমা হবে।','sending now queues the batch.')}
                <label className="admin-check">
                  <input type="checkbox" name="smsForce" checked={force} onChange={event=>setForce(event.target.checked)} data-sms-force="" />
                  {t('তবুও এখন পাঠান','Send anyway')}
                </label>
              </p>
            )}
          </section>
        )}

        {step===4&&(
          <section className="sms-step" data-sms-step="4">
            {!result&&(
              <>
                <p className="admin-help" data-sms-confirm="">
                  {t(`${preview?.messages??0}টি বার্তা, আনুমানিক খরচ ৳${(preview?.cost??0).toFixed(2)}।`,
                    `${preview?.messages??0} messages, about ৳${(preview?.cost??0).toFixed(2)}.`)}
                  {quietBlocked?` ${t('কিউতে জমা হবে।','They will be queued.')}`:''}
                  {preview?.skippedCount?` ${t(`${preview.skippedCount}টি নম্বর বাদ।`,`${preview.skippedCount} numbers skipped.`)}`:''}
                </p>
                {sending&&(
                  <div className="sms-progress" data-sms-progress="" role="status" aria-live="polite">
                    <Loader2 aria-hidden="true" size={15} className="sms-spin" />
                    <span>{t('পাঠানো হচ্ছে…','Sending…')}</span>
                    <div className="sms-bar"><span /></div>
                  </div>
                )}
              </>
            )}

            {result&&(
              <div className="sms-result" data-sms-result="" role="status" aria-live="polite">
                {result.ok?<CheckCircle2 aria-hidden="true" size={16} className="sms-ok" />:<AlertTriangle aria-hidden="true" size={16} className="sms-bad" />}
                <div>
                  <strong data-sms-result-title="">
                    {result.ok
                      ?result.status==='queued'
                        ?t('কিউতে জমা হয়েছে','Queued')
                        :result.status==='existing'
                          ?t('আগের বার্তাই গণনা হয়েছে','Counted from the earlier send')
                          :t('পাঠানো হয়েছে','Sent')
                      :t('পাঠানো যায়নি','Not sent')}
                  </strong>
                  <p className="admin-help" data-sms-result-text="">
                    {result.ok
                      ?result.status==='queued'
                        ?`${t('নিঃশব্দ সময় শেষে যাবে','It will go out when quiet hours end')} (${result.quietUntil||''}). ${t('বাদ','Skipped')}: ${result.skipped??0}`
                        :`${t('সফল','Sent')}: ${result.sent??0} · ${t('ব্যর্থ','Failed')}: ${result.failed??0} · ${t('বাদ','Skipped')}: ${result.skipped??0}`
                      // A sentence the server wrote for the operator outranks the code it filed the
                      // refusal under (R3.11): "DAILY_LIMIT" is a fact for a log, not an answer for a
                      // person who just pressed send and needs to know when they may press it again.
                      :String((en?result.messageEn:result.messageBn)||result.message||result.blocked||result.error||'UNAVAILABLE')}
                  </p>
                  {result.ok&&result.monthTotals&&(
                    <p className="admin-help" data-sms-month="">{t('এই মাসে','This month')}: {result.monthTotals.sent} {t('সফল','sent')} · ৳{result.monthTotals.cost.toFixed(2)}</p>
                  )}
                </div>
                {result.ok&&(result.failed??0)>0&&(
                  <button type="button" className="admin-mini-button" onClick={()=>void retry()} disabled={retrying} data-sms-retry="">
                    {retrying?t('আবার পাঠানো হচ্ছে…','Retrying…'):t('ব্যর্থগুলো আবার পাঠান','Retry failed')}
                  </button>
                )}
                {result.ok&&result.status==='existing'&&(
                  <p className="admin-help">{t('একই অনুরোধ দুবার পাঠানো হয়নি।','The same request was not sent twice.')}</p>
                )}
              </div>
            )}
          </section>
        )}

        <footer className="sms-foot">
          <button type="button" className="admin-mini-button" onClick={()=>setStep(value=>Math.max(1,value-1))} disabled={step===1||sending} data-sms-back="">
            {t('পেছনে','Back')}
          </button>
          {step<4?(
            <button type="button" className="button button-navy" onClick={()=>setStep(value=>Math.min(4,value+1))} disabled={!!hardError} data-sms-next="">
              {t('পরবর্তী','Next')}
            </button>
          ):!result?(
            <button type="button" ref={sendRef} className="button sms-send" onClick={()=>void send()} disabled={!canSend||sending} data-sms-send="">
              {sending?<Loader2 aria-hidden="true" size={15} className="sms-spin" />:<Send aria-hidden="true" size={15} />}
              {t(`পাঠান (${preview?.messages??0})`,`Send (${preview?.messages??0})`)}
            </button>
          ):(
            <button type="button" className="button button-navy" onClick={onClose} data-sms-done="">{t('শেষ','Done')}</button>
          )}
        </footer>
      </div>
    </div>
  );
}
