'use client';
/**
 * SMS centre client components (R2): the settings form, the operator's own test message, an
 * explicit retry of one batch's failures, and the template editor.
 *
 * Every one of them goes through a server action, so authorization is re-checked on the server —
 * hiding a button is presentation, never permission.
 */
import {useActionState} from 'react';
import {useTranslations} from 'next-intl';
import {formatNumber} from '@/lib/admin/format';
import {retryAutoSms,retrySmsBatch,saveSmsSettings,saveSmsTemplate,sendTestSmsAction} from '@/actions/sms';
import type {ActionState} from '@/actions/admin';
import type {SmsSettingsRow,SmsTemplateRow} from '@/lib/center/sms-send';

/** Status text for a form that has just been answered by its action. */
function Feedback({state,bn}:{state:ActionState;bn:boolean}){
  const ts=useTranslations('sms');
  if(state.status==='idle')return null;
  const ok=state.status==='ok';
  const text=state.message||(ok?(ts('panel.saved')):(ts('panel.didWorkPlease')));
  return <p className={`admin-feedback ${ok?'ok':'error'}`} role="status" aria-live="polite">{text}</p>;
}

export function SmsSettingsForm({locale,settings,providerName,balanceOk,balance}:{locale:string;settings:SmsSettingsRow;providerName:string;balanceOk:boolean;balance:number|null}){
  const ts=useTranslations('sms');
  const bn=locale!=='en';
  const [state,action,pending]=useActionState(saveSmsSettings,{status:'idle'} as ActionState);
  return <section className="admin-panel"><div className="admin-panel-head"><h2>{ts('panel.settings')}</h2></div><div className="admin-panel-body">
    <form action={action} className="sheet-form">
      <label>{ts('panel.costPerSms')}
        <input name="smsUnitCost" type="number" step="0.01" min="0" max="1000" required defaultValue={settings.unitCost}/>
      </label>
      <label>{ts('panel.quietHoursStart')}
        <input name="quietStart" type="time" required defaultValue={settings.quietStart}/>
      </label>
      <label>{ts('panel.quietHoursEnd')}
        <input name="quietEnd" type="time" required defaultValue={settings.quietEnd}/>
      </label>
      <label>{ts('panel.dailySmsLimit')}
        <input name="dailySmsLimitPerUser" type="number" min="0" max="10000" step="1" required defaultValue={settings.dailySmsLimitPerUser??30}/>
      </label>
      <label>{ts('panel.institutePhone')}
        <input name="institutePhone" type="tel" maxLength={20} defaultValue={settings.institutePhone} placeholder="01XXXXXXXXX"/>
      </label>
      <label>{ts('panel.dayMonthDue')}
        <input name="autoDueDay" type="number" min="1" max="31" required defaultValue={settings.autoDueDay}/>
      </label>
      <fieldset className="admin-fieldset">
        <legend>{ts('panel.autoSend')}</legend>
        <label className="admin-check"><input name="autoReceipt" type="checkbox" defaultChecked={settings.autoReceipt}/>{ts('panel.receiptPayment')}</label>
        <label className="admin-check"><input name="autoResult" type="checkbox" defaultChecked={settings.autoResult}/>{ts('panel.resultsPublished')}</label>
        <label className="admin-check"><input name="autoDue" type="checkbox" defaultChecked={settings.autoDue}/>{ts('panel.dueReminderChosen')}</label>
        <small>{ts('panel.theseShipOff')}</small>
      </fieldset>
      <p className="admin-help">{ts('panel.providerBalance',{provider:providerName,balance:String(balanceOk&&balance!==null?balance:ts('panel.unreadable'))})}</p>
      <button className="button button-navy" disabled={pending}>{pending?(ts('panel.saving')):(ts('panel.saveSettings'))}</button>
      <Feedback state={state} bn={bn}/>
    </form>
  </div></section>;
}

export function SmsTestForm({locale,ownPhone}:{locale:string;ownPhone:string}){
  const ts=useTranslations('sms');
  const bn=locale!=='en';
  const [state,action,pending]=useActionState(sendTestSmsAction,{status:'idle'} as ActionState);
  return <section className="admin-panel"><div className="admin-panel-head"><h2>{ts('panel.testMessage')}</h2></div><div className="admin-panel-body">
    <form action={action} className="admin-inline">
      <label>{ts('panel.ownNumber')}
        <input name="phone" type="tel" required maxLength={20} defaultValue={ownPhone} placeholder="01XXXXXXXXX"/>
      </label>
      <button className="button button-navy" disabled={pending}>{pending?(ts('panel.sending')):(ts('panel.sendTest'))}</button>
      <Feedback state={state} bn={bn}/>
    </form>
    <p className="admin-help">{ts('panel.sendOnlyOwn')}</p>
  </div></section>;
}

export function SmsRetryButton({locale,batchId,failed}:{locale:string;batchId:string;failed:number}){
  const ts=useTranslations('sms');
  const bn=locale!=='en';
  const [state,action,pending]=useActionState(retrySmsBatch,{status:'idle'} as ActionState);
  return <form action={action} className="admin-inline">
    <input type="hidden" name="batchId" value={batchId}/>
    <button className="admin-mini-button" disabled={pending} title={ts('panel.previousOutcomeUnknown')}>
      {pending?(ts('panel.sending')):ts('panel.retryCount',{count:formatNumber(failed,bn?'bn':'en')})}
    </button>
    {state.status!=='idle'&&<span className={`admin-feedback ${state.status==='ok'?'ok':'error'}`}>{state.message||(state.status==='ok'?'✓':'✗')}</span>}
  </form>;
}

export function SmsTemplateEditor({locale,template}:{locale:string;template:SmsTemplateRow}){
  const ts=useTranslations('sms');
  const bn=locale!=='en';
  const [state,action,pending]=useActionState(saveSmsTemplate,{status:'idle'} as ActionState);
  if(template.key==='custom'){
    return <article className="admin-template"><h3>{template.name}</h3>
      <p className="admin-help">{ts('panel.freeTextTyped')}</p></article>;
  }
  return <article className="admin-template">
    <h3>{template.name} {template.edited&&<span className="admin-badge">{ts('panel.edited')}</span>}</h3>
    <form action={action}>
      <input type="hidden" name="key" value={template.key}/>
      <label>{ts('panel.name')}<input name="name" maxLength={120} required defaultValue={template.name}/></label>
      <label>{ts('panel.messageBangla')}<textarea name="body" maxLength={2000} rows={3} required defaultValue={template.body}/></label>
      <label className="admin-check"><input name="active" type="checkbox" defaultChecked={template.active}/>{ts('panel.active')}</label>
      {template.variables.length>0&&<small>{ts('panel.chips')}: <code>{template.variables.map(v=>`{${v}}`).join(' ')}</code></small>}
      {template.feeRelated&&<small>{ts('panel.feeRelatedHeld')}</small>}
      <button className="admin-mini-button" disabled={pending}>{pending?(ts('panel.saving')):(ts('panel.saveTemplate'))}</button>
      <Feedback state={state} bn={bn}/>
    </form>
  </article>;
}

/**
 * Retry one automatic-SMS problem (R2 follow-up). A client component for two reasons: `disabled` while
 * pending is what stops a double click from paying for the same message twice, and the answer is a
 * sentence the operator has to read — a retry that fails again must say why in their own language
 * instead of silently doing nothing.
 */
export function SmsProblemRetry({locale,problemId,attempts}:{locale:string;problemId:string;attempts:number}){
  const ts=useTranslations('sms');
  const bn=locale!=='en';
  const [state,action,pending]=useActionState(retryAutoSms,{status:'idle'} as ActionState);
  return <form action={action} className="admin-inline">
    <input type="hidden" name="problemId" value={problemId}/>
    <button className="admin-mini-button" disabled={pending}
      title={ts('panel.retryingSendsAgain')}>
      {pending?(ts('panel.sending')):(attempts>1?(ts('panel.tryAgain')):(ts('panel.retry')))}
    </button>
    {state.status!=='idle'&&<span className={`admin-feedback ${state.status==='ok'?'ok':'error'}`}>{state.message||(state.status==='ok'?'✓':'✗')}</span>}
  </form>;
}
