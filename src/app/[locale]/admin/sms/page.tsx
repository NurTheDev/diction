import mongoose from 'mongoose';
import {getTranslations} from 'next-intl/server';
import {requireAdmin} from '@/lib/admin/guard';
import {dashboardDigits} from '@/lib/admin/digits';
import {formatNumber,formatDate,formatTime,formatDigits} from '@/lib/admin/format';
import {CenterClassGroup,CenterSmsBatch,CenterSmsLog} from '@/models/CenterRecords';
import {User} from '@/models/User';
import {loadSmsSettings,loadSmsTemplates,monthSmsTotals} from '@/lib/center/sms-send';
import {createSmsProvider,smsProviderName,validateSmsCredentials} from '@/lib/center/sms-provider';
import {SMS_VARIABLES} from '@/lib/center/sms-templates';
import {SmsSettingsForm,SmsTestForm,SmsRetryButton,SmsTemplateEditor} from '@/components/admin/sms-panel';
import SmsNewMessage from '@/components/admin/sms-new-message';
import {SmsAutoProblems} from '@/components/admin/sms-auto-problems';

export const dynamic='force-dynamic';

type BatchRow={_id:mongoose.Types.ObjectId;purpose:string;templateKey?:string;status:string;recipientCount:number;sentCount:number;failedCount:number;skippedCount:number;estimatedCost:number;quiet:boolean;scheduledFor?:Date;createdAt:Date};
type LogRow={_id:mongoose.Types.ObjectId;phone:string;message:string;status:string;reason?:string;providerCode?:string;providerMessage?:string;segments:number;cost:number;templateKey?:string;sentAt?:Date;createdAt:Date;student?:{name:{bn:string;en?:string};studentId:string}};

const STATUSES=['sent','failed','skipped','queued'] as const;

/**
 * The SMS centre (R2): connection status, live balance, this month's stored cost, the settings the
 * spec lists, the editable templates, and the history with filters and an explicit retry.
 *
 * Nothing here exposes a credential — only the provider's NAME and whether it is configured. The
 * balance is fetched server-side and rendered as a number.
 */
export default async function SmsPage({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{status?:string;template?:string;q?:string}>}){
  const actor=await requireAdmin();
  const {locale}=await params;
  const query=await searchParams;
  const bn=locale!=='en';
  const digits=await dashboardDigits(actor.id);

  // The session user carries no phone, so the test-message form reads the operator's own number
  // from the record — "send a test SMS to my own number" must not mean retyping it.
  const [settings,templates,totals,me,groups]=await Promise.all([
    loadSmsSettings(),loadSmsTemplates(),monthSmsTotals(),
    User.findById(actor.id).select('phone').lean<{phone?:string}|null>(),
    CenterClassGroup.find({active:true}).select('name').sort({academicYear:-1,order:1}).limit(200)
      .lean<{_id:mongoose.Types.ObjectId;name:{bn:string;en?:string}}[]>(),
  ]);

  // Live balance. The mock provider answers instantly and without a network call, so this is safe
  // in test mode; bulksmsbd performs the documented getBalanceApi call. Either way only the number
  // is rendered — never a credential.
  const providerName=smsProviderName();
  const credentials=validateSmsCredentials();
  const writeGate=process.env.CENTER_SMS_WRITE_ENABLED==='true';
  let balance:{ok:true;balance:number}|{ok:false;code?:string}={ok:false};
  try{balance=await createSmsProvider().balance()}catch{balance={ok:false}}

  const status=STATUSES.includes(query.status as typeof STATUSES[number])?query.status as typeof STATUSES[number]:undefined;
  const template=templates.some(t=>t.key===query.template)?query.template:undefined;
  const search=String(query.q||'').trim().slice(0,80);
  const filter:mongoose.FilterQuery<LogRow>={};
  if(status)filter.status=status;
  if(template)filter.templateKey=template;
  if(search)filter.$or=[{phone:{ $regex:search.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}},{'student.name.bn':{$regex:search.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}}];

  const [logs,batches]=await Promise.all([
    CenterSmsLog.find(filter).sort({createdAt:-1}).limit(100).populate('student','name studentId').lean<LogRow[]>(),
    CenterSmsBatch.find({}).sort({createdAt:-1}).limit(30).lean<BatchRow[]>(),
  ]);

  const ts=await getTranslations('sms');
  const language:'bn'|'en'=bn?'bn':'en';
  const currency=await (await getTranslations('common'))('currency');
  const cost=(value:number)=>`${currency}${formatNumber(Math.round(value*100)/100,digits)}`;

  return <>
    <div className="admin-heading"><div>
      <h1>{ts('page.sms')}</h1>
      <p>{ts('page.providerBalanceCost')}</p>
    </div></div>

    {/* Above the connection panel on purpose: an automatic send that did not go out is the one thing
        on this page the operator must act on, and it is invisible everywhere else. */}
    <SmsAutoProblems digits={digits}/>

    <section className="admin-panel"><div className="admin-panel-head"><h2>{ts('page.connection')}</h2></div><div className="admin-panel-body">
      <dl className="admin-defs">
        <div><dt>{ts('page.provider')}</dt><dd><code>{providerName}</code> {providerName==='mock'&&<span className="admin-badge">{ts('page.nothingSent')}</span>}</dd></div>
        <div><dt>{ts('page.credentials')}</dt><dd>{credentials.ok
          ? <span className="admin-badge enabled">{ts('page.configured')}</span>
          : <span className="admin-badge disabled">{ts('page.missing')}: {credentials.missing.join(', ')}</span>}</dd></div>
        <div><dt>{ts('page.sendingGate')}</dt><dd>{writeGate
          ? <span className="admin-badge enabled">CENTER_SMS_WRITE_ENABLED=true</span>
          : <span className="admin-badge disabled">{ts('page.offRealSms')}</span>}</dd></div>
        <div><dt>{ts('page.balance')}</dt><dd>{balance.ok?formatNumber(balance.balance,digits):ts('page.couldRead')}{balance.ok===false&&'code' in balance&&balance.code?` (${balance.code})`:''}</dd></div>
      </dl>
      <p className="admin-help">{ts('page.apiKeySender')}</p>
    </div></section>

    <section className="admin-panel"><div className="admin-panel-head"><h2>{ts('page.month')}</h2></div><div className="admin-panel-body">
      <dl className="admin-defs">
        <div><dt>{ts('page.sent')}</dt><dd>{formatNumber(totals.sent,digits)}</dd></div>
        <div><dt>{ts('page.failed')}</dt><dd>{formatNumber(totals.failed,digits)}</dd></div>
        <div><dt>{ts('page.queued')}</dt><dd>{formatNumber(totals.queued,digits)}</dd></div>
        <div><dt>{ts('page.skipped')}</dt><dd>{formatNumber(totals.skipped,digits)}</dd></div>
        <div><dt>{ts('page.segments')}</dt><dd>{formatNumber(totals.segments,digits)}</dd></div>
        <div><dt>{ts('page.cost')}</dt><dd>{cost(totals.cost)}</dd></div>
      </dl>
      <p className="admin-help">{ts('page.costStoredEvery')}</p>
    </div></section>

    <SmsSettingsForm locale={locale} settings={settings} providerName={providerName} balanceOk={balance.ok} balance={balance.ok?balance.balance:null}/>
    <SmsTestForm locale={locale} ownPhone={me?.phone||''}/>

    <section className="admin-panel"><div className="admin-panel-head"><h2>{ts('page.newMessage')}</h2></div><div className="admin-panel-body">
      <SmsNewMessage en={!bn} institutePhone={settings.institutePhone}
        classes={groups.map(group=>({id:String(group._id),name:(bn?group.name.bn:group.name.en)||group.name.bn}))}
        templates={templates.filter(row=>row.active||row.key==='custom')} />
    </div></section>

    <section className="admin-panel"><div className="admin-panel-head"><h2>{ts('page.templates')}</h2></div><div className="admin-panel-body">
      <p className="admin-help">{ts('page.messageContentStays')} <code>{[...SMS_VARIABLES].map(v=>`{${v}}`).join(' ')}</code></p>
      {templates.map(template=><SmsTemplateEditor key={template.key} locale={locale} template={template}/>)}
    </div></section>

    <section className="admin-panel"><div className="admin-panel-head"><h2>{ts('page.batches')}</h2></div><div className="admin-panel-body">
      {batches.length===0&&<p className="admin-empty">{ts('page.batchesYet')}</p>}
      {batches.length>0&&<div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>{ts('page.when')}</th><th>{ts('page.purpose')}</th><th>{ts('page.status')}</th><th>{ts('page.recipients')}</th><th>{ts('page.sentFailed')}</th><th>{ts('page.cost2')}</th><th/></tr></thead>
        <tbody>{batches.map(batch=><tr key={String(batch._id)}>
          <td>{formatDate(batch.createdAt,digits,language)}<br/><small>{formatTime(batch.createdAt,digits,language)}</small>{batch.quiet&&<><br/><small>{ts('page.queuedQuietHours')}</small></>}{batch.scheduledFor&&<><br/><small>{ts('page.scheduled')}: {formatTime(batch.scheduledFor,digits,language)}</small></>}</td>
          <td>{batch.templateKey||batch.purpose}</td>
          <td><span className={`admin-badge ${batch.status==='done'?'enabled':batch.status==='failed'?'disabled':''}`}>{batch.status}</span></td>
          <td>{formatNumber(batch.recipientCount,digits)}</td>
          <td>{formatNumber(batch.sentCount,digits)} / {formatNumber(batch.failedCount,digits)}{batch.skippedCount>0&&<small> · {formatNumber(batch.skippedCount,digits)} {ts('page.skipped2')}</small>}</td>
          <td>{cost(batch.estimatedCost)}</td>
          <td>{batch.failedCount>0&&<SmsRetryButton locale={locale} batchId={String(batch._id)} failed={batch.failedCount}/>}</td>
        </tr>)}</tbody>
      </table></div>}
    </div></section>

    <section className="admin-panel"><div className="admin-panel-head"><h2>{ts('page.history')}</h2></div><div className="admin-panel-body">
      <form method="get" className="admin-filter">
        <label>{ts('page.status2')} <select name="status" className="admin-select" defaultValue={status||''}>
          <option value="">{ts('page.all')}</option>
          {STATUSES.map(value=><option key={value} value={value}>{ts(`statuses.${value}`)}</option>)}
        </select></label>
        <label>{ts('page.template')} <select name="template" className="admin-select" defaultValue={template||''}>
          <option value="">{ts('page.all2')}</option>
          {templates.map(row=><option key={row.key} value={row.key}>{row.name}</option>)}
          <option value="test">{ts('page.test')}</option>
        </select></label>
        <label>{ts('page.search')} <input name="q" defaultValue={search} maxLength={80} placeholder={ts('page.numberName')}/></label>
        <button className="button button-navy">{ts('page.filter')}</button>
      </form>
      {logs.length===0&&<p className="admin-empty">{ts('page.records')}</p>}
      {logs.length>0&&<div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>{ts('page.when2')}</th><th>{ts('page.student')}</th><th>{ts('page.number')}</th><th>{ts('page.message')}</th><th>{ts('page.status3')}</th><th>{ts('page.seg')}</th><th>{ts('page.cost3')}</th></tr></thead>
        <tbody>{logs.map(log=><tr key={String(log._id)}>
          <td>{formatDate(log.sentAt||log.createdAt,digits,language)}<br/><small>{formatTime(log.sentAt||log.createdAt,digits,language)}</small></td>
          <td>{log.student?`${log.student.name.bn} · ${log.student.studentId}`:'—'}</td>
          <td>{formatDigits(log.phone,digits)}</td>
          <td className="admin-cell-message"><span title={log.message}>{log.message.slice(0,90)}{log.message.length>90?'…':''}</span>{log.providerMessage&&<><br/><small>{log.providerMessage}</small></>}{log.reason&&<><br/><small>{ts('page.reason')}: {log.reason}</small></>}</td>
          <td><span className={`admin-badge ${log.status==='sent'?'enabled':log.status==='failed'?'disabled':''}`}>{log.status}</span></td>
          <td>{formatNumber(log.segments,digits)}</td>
          <td>{cost(log.cost)}</td>
        </tr>)}</tbody>
      </table></div>}
    </div></section>
  </>;
}
