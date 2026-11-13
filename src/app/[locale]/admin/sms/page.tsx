import mongoose from 'mongoose';
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

  const t=(b:string,e:string)=>bn?b:e;
  const cost=(value:number)=>`${bn?'৳':'৳ '}${formatNumber(Math.round(value*100)/100,digits)}`;

  return <>
    <div className="admin-heading"><div>
      <h1>{t('এসএমএস','SMS')}</h1>
      <p>{t('প্রদানকারী, ব্যালেন্স, খরচ, টেমপ্লেট ও পাঠানোর ইতিহাস — এক জায়গায়।','Provider, balance, cost, templates and sending history in one place.')}</p>
    </div></div>

    {/* Above the connection panel on purpose: an automatic send that did not go out is the one thing
        on this page the operator must act on, and it is invisible everywhere else. */}
    <SmsAutoProblems digits={digits}/>

    <section className="admin-panel"><div className="admin-panel-head"><h2>{t('সংযোগ','Connection')}</h2></div><div className="admin-panel-body">
      <dl className="admin-defs">
        <div><dt>{t('প্রদানকারী','Provider')}</dt><dd><code>{providerName}</code> {providerName==='mock'&&<span className="admin-badge">{t('কিছু পাঠানো হয় না','nothing is sent')}</span>}</dd></div>
        <div><dt>{t('ক্রেডেনশিয়াল','Credentials')}</dt><dd>{credentials.ok
          ? <span className="admin-badge enabled">{t('সেট করা আছে','configured')}</span>
          : <span className="admin-badge disabled">{t('অনুপস্থিত','missing')}: {credentials.missing.join(', ')}</span>}</dd></div>
        <div><dt>{t('পাঠানোর গেট','Sending gate')}</dt><dd>{writeGate
          ? <span className="admin-badge enabled">CENTER_SMS_WRITE_ENABLED=true</span>
          : <span className="admin-badge disabled">{t('বন্ধ — আসল এসএমএস যাবে না','off — no real SMS will leave')}</span>}</dd></div>
        <div><dt>{t('ব্যালেন্স','Balance')}</dt><dd>{balance.ok?formatNumber(balance.balance,digits):t('পড়া যায়নি','could not be read')}{balance.ok===false&&'code' in balance&&balance.code?` (${balance.code})`:''}</dd></div>
      </dl>
      <p className="admin-help">{t('এপিআই কী ও সেন্ডার আইডি শুধু সার্ভারে থাকে; এই পেজে কখনো দেখানো হয় না।','The API key and sender id stay on the server; they are never rendered on this page.')}</p>
    </div></section>

    <section className="admin-panel"><div className="admin-panel-head"><h2>{t('এই মাসের হিসাব','This month')}</h2></div><div className="admin-panel-body">
      <dl className="admin-defs">
        <div><dt>{t('পাঠানো','Sent')}</dt><dd>{formatNumber(totals.sent,digits)}</dd></div>
        <div><dt>{t('ব্যর্থ','Failed')}</dt><dd>{formatNumber(totals.failed,digits)}</dd></div>
        <div><dt>{t('কিউতে','Queued')}</dt><dd>{formatNumber(totals.queued,digits)}</dd></div>
        <div><dt>{t('বাদ পড়া','Skipped')}</dt><dd>{formatNumber(totals.skipped,digits)}</dd></div>
        <div><dt>{t('সেগমেন্ট','Segments')}</dt><dd>{formatNumber(totals.segments,digits)}</dd></div>
        <div><dt>{t('খরচ','Cost')}</dt><dd>{cost(totals.cost)}</dd></div>
      </dl>
      <p className="admin-help">{t('খরচ প্রতিটি লগ রো-তে জমা থাকে, তাই আজকের ইউনিট খরচ বদলালেও পুরনো হিসাব বদলায় না।','Cost is stored on every log row, so changing today’s unit cost never rewrites history.')}</p>
    </div></section>

    <SmsSettingsForm locale={locale} settings={settings} providerName={providerName} balanceOk={balance.ok} balance={balance.ok?balance.balance:null}/>
    <SmsTestForm locale={locale} ownPhone={me?.phone||''}/>

    <section className="admin-panel"><div className="admin-panel-head"><h2>{t('নতুন বার্তা','New message')}</h2></div><div className="admin-panel-body">
      <SmsNewMessage en={!bn} institutePhone={settings.institutePhone}
        classes={groups.map(group=>({id:String(group._id),name:(bn?group.name.bn:group.name.en)||group.name.bn}))}
        templates={templates.filter(row=>row.active||row.key==='custom')} />
    </div></section>

    <section className="admin-panel"><div className="admin-panel-head"><h2>{t('টেমপ্লেট','Templates')}</h2></div><div className="admin-panel-body">
      <p className="admin-help">{t('বার্তার লেখা বাংলায় থাকে। বন্ধনীতে থাকা ঘরগুলো বসানো যায়:','Message content stays Bangla. These chips can be inserted:')} <code>{[...SMS_VARIABLES].map(v=>`{${v}}`).join(' ')}</code></p>
      {templates.map(template=><SmsTemplateEditor key={template.key} locale={locale} template={template}/>)}
    </div></section>

    <section className="admin-panel"><div className="admin-panel-head"><h2>{t('ব্যাজ','Batches')}</h2></div><div className="admin-panel-body">
      {batches.length===0&&<p className="admin-empty">{t('এখনো কোনো ব্যাজ নেই।','No batches yet.')}</p>}
      {batches.length>0&&<div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>{t('সময়','When')}</th><th>{t('উদ্দেশ্য','Purpose')}</th><th>{t('অবস্থা','Status')}</th><th>{t('প্রাপক','Recipients')}</th><th>{t('পাঠানো/ব্যর্থ','Sent/failed')}</th><th>{t('খরচ','Cost')}</th><th/></tr></thead>
        <tbody>{batches.map(batch=><tr key={String(batch._id)}>
          <td>{formatDate(batch.createdAt,digits,bn?'bn':'en')}<br/><small>{formatTime(batch.createdAt,digits,bn?'bn':'en')}</small>{batch.quiet&&<><br/><small>{t('কুয়ায়েট আওয়ার্সে কিউ','queued by quiet hours')}</small></>}{batch.scheduledFor&&<><br/><small>{t('পাঠানোর সময়','scheduled')}: {formatTime(batch.scheduledFor,digits,bn?'bn':'en')}</small></>}</td>
          <td>{batch.templateKey||batch.purpose}</td>
          <td><span className={`admin-badge ${batch.status==='done'?'enabled':batch.status==='failed'?'disabled':''}`}>{batch.status}</span></td>
          <td>{formatNumber(batch.recipientCount,digits)}</td>
          <td>{formatNumber(batch.sentCount,digits)} / {formatNumber(batch.failedCount,digits)}{batch.skippedCount>0&&<small> · {formatNumber(batch.skippedCount,digits)} {t('বাদ','skipped')}</small>}</td>
          <td>{cost(batch.estimatedCost)}</td>
          <td>{batch.failedCount>0&&<SmsRetryButton locale={locale} batchId={String(batch._id)} failed={batch.failedCount}/>}</td>
        </tr>)}</tbody>
      </table></div>}
    </div></section>

    <section className="admin-panel"><div className="admin-panel-head"><h2>{t('ইতিহাস','History')}</h2></div><div className="admin-panel-body">
      <form method="get" className="admin-filter">
        <label>{t('অবস্থা','Status')} <select name="status" className="admin-select" defaultValue={status||''}>
          <option value="">{t('সব','All')}</option>
          {STATUSES.map(value=><option key={value} value={value}>{t({sent:'পাঠানো',failed:'ব্যর্থ',skipped:'বাদ পড়া',queued:'কিউতে'}[value],value)}</option>)}
        </select></label>
        <label>{t('টেমপ্লেট','Template')} <select name="template" className="admin-select" defaultValue={template||''}>
          <option value="">{t('সব','All')}</option>
          {templates.map(row=><option key={row.key} value={row.key}>{row.name}</option>)}
          <option value="test">{t('পরীক্ষা','Test')}</option>
        </select></label>
        <label>{t('খোঁজ','Search')} <input name="q" defaultValue={search} maxLength={80} placeholder={t('নম্বর বা নাম','number or name')}/></label>
        <button className="button button-navy">{t('ছাঁকুন','Filter')}</button>
      </form>
      {logs.length===0&&<p className="admin-empty">{t('কোনো রেকর্ড নেই।','No records.')}</p>}
      {logs.length>0&&<div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>{t('সময়','When')}</th><th>{t('শিক্ষার্থী','Student')}</th><th>{t('নম্বর','Number')}</th><th>{t('বার্তা','Message')}</th><th>{t('অবস্থা','Status')}</th><th>{t('সেগমেন্ট','Seg.')}</th><th>{t('খরচ','Cost')}</th></tr></thead>
        <tbody>{logs.map(log=><tr key={String(log._id)}>
          <td>{formatDate(log.sentAt||log.createdAt,digits,bn?'bn':'en')}<br/><small>{formatTime(log.sentAt||log.createdAt,digits,bn?'bn':'en')}</small></td>
          <td>{log.student?`${log.student.name.bn} · ${log.student.studentId}`:'—'}</td>
          <td>{formatDigits(log.phone,digits)}</td>
          <td className="admin-cell-message"><span title={log.message}>{log.message.slice(0,90)}{log.message.length>90?'…':''}</span>{log.providerMessage&&<><br/><small>{log.providerMessage}</small></>}{log.reason&&<><br/><small>{t('কারণ','reason')}: {log.reason}</small></>}</td>
          <td><span className={`admin-badge ${log.status==='sent'?'enabled':log.status==='failed'?'disabled':''}`}>{log.status}</span></td>
          <td>{formatNumber(log.segments,digits)}</td>
          <td>{cost(log.cost)}</td>
        </tr>)}</tbody>
      </table></div>}
    </div></section>
  </>;
}
