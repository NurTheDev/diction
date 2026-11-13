'use client';
/**
 * SMS centre client components (R2): the settings form, the operator's own test message, an
 * explicit retry of one batch's failures, and the template editor.
 *
 * Every one of them goes through a server action, so authorization is re-checked on the server —
 * hiding a button is presentation, never permission.
 */
import {useActionState} from 'react';
import {retryAutoSms,retrySmsBatch,saveSmsSettings,saveSmsTemplate,sendTestSmsAction} from '@/actions/sms';
import type {ActionState} from '@/actions/admin';
import type {SmsSettingsRow,SmsTemplateRow} from '@/lib/center/sms-send';

/** Status text for a form that has just been answered by its action. */
function Feedback({state,bn}:{state:ActionState;bn:boolean}){
  if(state.status==='idle')return null;
  const ok=state.status==='ok';
  const text=state.message||(ok?(bn?'সংরক্ষিত হয়েছে।':'Saved.'):(bn?'হয়নি। আবার চেষ্টা করুন।':'That did not work. Please try again.'));
  return <p className={`admin-feedback ${ok?'ok':'error'}`} role="status" aria-live="polite">{text}</p>;
}

export function SmsSettingsForm({locale,settings,providerName,balanceOk,balance}:{locale:string;settings:SmsSettingsRow;providerName:string;balanceOk:boolean;balance:number|null}){
  const bn=locale!=='en';
  const [state,action,pending]=useActionState(saveSmsSettings,{status:'idle'} as ActionState);
  return <section className="admin-panel"><div className="admin-panel-head"><h2>{bn?'সেটিংস':'Settings'}</h2></div><div className="admin-panel-body">
    <form action={action} className="sheet-form">
      <label>{bn?'প্রতি এসএমএস খরচ (টাকা)':'Cost per SMS (taka)'}
        <input name="smsUnitCost" type="number" step="0.01" min="0" max="1000" required defaultValue={settings.unitCost}/>
      </label>
      <label>{bn?'নীরব সময় শুরু':'Quiet hours start'}
        <input name="quietStart" type="time" required defaultValue={settings.quietStart}/>
      </label>
      <label>{bn?'নীরব সময় শেষ':'Quiet hours end'}
        <input name="quietEnd" type="time" required defaultValue={settings.quietEnd}/>
      </label>
      <label>{bn?'একজনের দৈনিক এসএমএস সীমা (০ মানে অসীম)':'Daily SMS limit per user (0 = no limit)'}
        <input name="dailySmsLimitPerUser" type="number" min="0" max="10000" step="1" required defaultValue={settings.dailySmsLimitPerUser??30}/>
      </label>
      <label>{bn?'প্রতিষ্ঠানের নম্বর':'Institute phone'}
        <input name="institutePhone" type="tel" maxLength={20} defaultValue={settings.institutePhone} placeholder="01XXXXXXXXX"/>
      </label>
      <label>{bn?'বকেয়া স্মারক পাঠানোর দিন':'Day of month for the due reminder'}
        <input name="autoDueDay" type="number" min="1" max="31" required defaultValue={settings.autoDueDay}/>
      </label>
      <fieldset className="admin-fieldset">
        <legend>{bn?'স্বয়ংক্রিয় পাঠানো':'Auto-send'}</legend>
        <label className="admin-check"><input name="autoReceipt" type="checkbox" defaultChecked={settings.autoReceipt}/>{bn?'পেমেন্টের পরে রসিদ':'Receipt after a payment'}</label>
        <label className="admin-check"><input name="autoResult" type="checkbox" defaultChecked={settings.autoResult}/>{bn?'ফলাফল প্রকাশের পরে':'After results are published'}</label>
        <label className="admin-check"><input name="autoDue" type="checkbox" defaultChecked={settings.autoDue}/>{bn?'নির্ধারিত দিনে বকেয়া স্মারক':'Due reminder on the chosen day'}</label>
        <small>{bn?'সবগুলো ডিফল্টভাবে বন্ধ থাকে; সক্রিয় করলে আসল এসএমএস চলে যেতে পারে।':'All of these ship OFF. Switching one on can send real messages.'}</small>
      </fieldset>
      <p className="admin-help">{bn?`প্রদানকারী ${providerName} · ব্যালেন্স ${balanceOk&&balance!==null?balance:(bn?'পড়া যায়নি':'unreadable')}`:`Provider ${providerName} · balance ${balanceOk&&balance!==null?balance:'unreadable'}`}</p>
      <button className="button button-navy" disabled={pending}>{pending?(bn?'সংরক্ষণ হচ্ছে…':'Saving…'):(bn?'সেটিংস সংরক্ষণ':'Save settings')}</button>
      <Feedback state={state} bn={bn}/>
    </form>
  </div></section>;
}

export function SmsTestForm({locale,ownPhone}:{locale:string;ownPhone:string}){
  const bn=locale!=='en';
  const [state,action,pending]=useActionState(sendTestSmsAction,{status:'idle'} as ActionState);
  return <section className="admin-panel"><div className="admin-panel-head"><h2>{bn?'পরীক্ষামূলক এসএমএস':'Test message'}</h2></div><div className="admin-panel-body">
    <form action={action} className="admin-inline">
      <label>{bn?'নিজের নম্বর':'Your own number'}
        <input name="phone" type="tel" required maxLength={20} defaultValue={ownPhone} placeholder="01XXXXXXXXX"/>
      </label>
      <button className="button button-navy" disabled={pending}>{pending?(bn?'পাঠানো হচ্ছে…':'Sending…'):(bn?'পরীক্ষা পাঠান':'Send test')}</button>
      <Feedback state={state} bn={bn}/>
    </form>
    <p className="admin-help">{bn?'শুধু নিজের নম্বরে পাঠান — সংযোগ, সেন্ডার আইডি ও আইপি হোয়াইটলিস্ট যাচাই করতে। কোনো শিক্ষার্থীকে পরীক্ষার বার্তা যায় না।':'Send only to your own number, to prove the credentials, sender id and IP whitelist. No student ever receives a test message.'}</p>
  </div></section>;
}

export function SmsRetryButton({locale,batchId,failed}:{locale:string;batchId:string;failed:number}){
  const bn=locale!=='en';
  const [state,action,pending]=useActionState(retrySmsBatch,{status:'idle'} as ActionState);
  return <form action={action} className="admin-inline">
    <input type="hidden" name="batchId" value={batchId}/>
    <button className="admin-mini-button" disabled={pending} title={bn?'আগের ফলাফল "অজানা" থাকলে আবার পাঠালে দ্বিত্ব হতে পারে':'if a previous outcome was unknown, retrying may duplicate'}>
      {pending?(bn?'পাঠানো হচ্ছে…':'Sending…'):(bn?`${failed} রিট্রাই`:`Retry ${failed}`)}
    </button>
    {state.status!=='idle'&&<span className={`admin-feedback ${state.status==='ok'?'ok':'error'}`}>{state.message||(state.status==='ok'?'✓':'✗')}</span>}
  </form>;
}

export function SmsTemplateEditor({locale,template}:{locale:string;template:SmsTemplateRow}){
  const bn=locale!=='en';
  const [state,action,pending]=useActionState(saveSmsTemplate,{status:'idle'} as ActionState);
  if(template.key==='custom'){
    return <article className="admin-template"><h3>{template.name}</h3>
      <p className="admin-help">{bn?'নিজের লেখা বার্তা পাঠানোর সময় লিখে দিতে হয়; সংরক্ষণ করা হয় না।':'Free text is typed at send time and is never stored as a template.'}</p></article>;
  }
  return <article className="admin-template">
    <h3>{template.name} {template.edited&&<span className="admin-badge">{bn?'সম্পাদিত':'edited'}</span>}</h3>
    <form action={action}>
      <input type="hidden" name="key" value={template.key}/>
      <label>{bn?'নাম':'Name'}<input name="name" maxLength={120} required defaultValue={template.name}/></label>
      <label>{bn?'বার্তা (বাংলায়)':'Message (Bangla)'}<textarea name="body" maxLength={2000} rows={3} required defaultValue={template.body}/></label>
      <label className="admin-check"><input name="active" type="checkbox" defaultChecked={template.active}/>{bn?'সক্রিয়':'Active'}</label>
      {template.variables.length>0&&<small>{bn?'ঘর':'Chips'}: <code>{template.variables.map(v=>`{${v}}`).join(' ')}</code></small>}
      {template.feeRelated&&<small>{bn?'ফি-সংশ্লিষ্ট: হোল্ডে থাকা শিক্ষার্থীকে এই বার্তা যায় না।':'Fee-related: held students never receive this message.'}</small>}
      <button className="admin-mini-button" disabled={pending}>{pending?(bn?'সংরক্ষণ হচ্ছে…':'Saving…'):(bn?'টেমপ্লেট সংরক্ষণ':'Save template')}</button>
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
  const bn=locale!=='en';
  const [state,action,pending]=useActionState(retryAutoSms,{status:'idle'} as ActionState);
  return <form action={action} className="admin-inline">
    <input type="hidden" name="problemId" value={problemId}/>
    <button className="admin-mini-button" disabled={pending}
      title={bn?'আবার পাঠালে খরচ হবে — একবারই চাপুন':'Retrying sends again and costs money — press it once'}>
      {pending?(bn?'পাঠানো হচ্ছে…':'Sending…'):(attempts>1?(bn?'আবার চেষ্টা করুন':'Try again'):(bn?'রিট্রাই':'Retry'))}
    </button>
    {state.status!=='idle'&&<span className={`admin-feedback ${state.status==='ok'?'ok':'error'}`}>{state.message||(state.status==='ok'?'✓':'✗')}</span>}
  </form>;
}
