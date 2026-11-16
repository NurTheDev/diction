import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {CalendarRange,Contact,MessageSquare,MessageSquareQuote,Plus,Wallet,UsersRound} from 'lucide-react';
import {formatNumber,type Digits} from '@/lib/admin/format';
import {permitted} from './nav-items';
import type {DailyOperations as Operations} from '@/lib/admin/daily-operations';

/**
 * Group 2 · the Overview's first tier: today's work, in four numbers and four verbs.
 *
 * The screen an operator opens first used to open on website maintenance — a banner, a blog post, an
 * achievement — with the day's money, the visitors we promised to call and the credit left for a
 * reminder below the fold. This tier is the morning instead: what came in, who is running and what they
 * owe, who is waiting for a call, and whether a message can still go out. Each card is the door to the
 * screen that works it, and the four verbs under them are the four things a manager does before lunch.
 *
 * The colours are the state, not decoration: green is a day that is going fine, amber is a number that
 * wants attention (nothing collected yet, money owed, a balance that could not be read) and red is a
 * promise whose day has passed or a send that did not go out. A read that failed says so in words —
 * "not counted" — because a zero that is really an outage is the one number that gets acted on wrongly.
 *
 * Nothing here decides who may see it: the page answers that, and a verb the operator's role may not
 * use is not offered, because a button that ends in a refusal is worse than no button (`permitted`).
 */
export async function DailyOperations({data,digits,role,currency}:{
  data:Operations;digits:Digits;role:string;currency:string;
}){
  const t=await getTranslations('adminRedesign');
  const money=(value:number):string=>`${currency}${formatNumber(value,digits)}`;
  const notCounted=t('operations.notCounted');

  const cards=[
    {
      marker:'cash',href:'/admin/students/collect',icon:Wallet,
      label:t('operations.cash'),
      value:data.cash.error?notCounted:money(data.cash.total),
      /* A day with nothing collected yet is not an error, but it is the number a manager looks again at. */
      tone:data.cash.error?'idle':data.cash.total>0?'good':'warn',
      sub:data.cash.error?t('operations.readFailed'):t('operations.cashSub',{receipts:formatNumber(data.cash.receipts,digits)}),
    },
    {
      marker:'dues',href:'/admin/students/dues',icon:UsersRound,
      label:t('operations.outstanding'),
      value:data.dues.error?notCounted:money(data.dues.outstanding),
      tone:data.dues.error?'idle':data.dues.outstanding>0?'warn':'good',
      sub:data.students.error?t('operations.readFailed')
        :t('operations.studentsSub',{active:formatNumber(data.students.active,digits),held:formatNumber(data.students.held,digits)}),
    },
    {
      marker:'visitors',href:'/admin/leads?followUp=today',icon:Contact,
      label:t('operations.followUps'),
      value:data.leads.error?notCounted:formatNumber(data.leads.dueToday,digits),
      /* Overdue stays its own number and its own colour: a parent nobody called three days ago is a
         different problem from one due now, and folding it into a total is how a promise is broken twice. */
      tone:data.leads.error?'idle':data.leads.overdue>0?'alert':data.leads.dueToday>0?'warn':'good',
      sub:data.leads.error?t('operations.readFailed'):t('operations.visitorsSub',{fresh:formatNumber(data.leads.newToday,digits)})+
        (data.leads.overdue>0?` · ${t('operations.overdue',{late:formatNumber(data.leads.overdue,digits)})}`:''),
    },
    {
      marker:'sms',href:'/admin/sms',icon:MessageSquare,
      label:t('operations.sms'),
      value:data.sms.balance.ok?formatNumber(data.sms.balance.balance,digits):t('operations.smsUnreadable'),
      tone:data.sms.problems>0?'alert':data.sms.balance.ok?'good':'warn',
      sub:data.sms.problems>0?t('operations.smsAlerts',{count:formatNumber(data.sms.problems,digits)}):t('operations.smsClear'),
    },
  ] as const;

  /* The four verbs of a morning: money in, a visitor recorded, the class routine, a message sent. */
  const verbs=[
    {key:'centerDailyCash',href:'/admin/students/collect',icon:Wallet,label:t('operations.collect')},
    {key:'leads',href:'/admin/leads?new=1',icon:Plus,label:t('operations.newVisitor')},
    {key:'batches',href:'/admin/batches',icon:CalendarRange,label:t('operations.routine')},
    {key:'sms',href:'/admin/sms',icon:MessageSquareQuote,label:t('operations.sendSms')},
  ].filter(verb=>permitted(verb.key,role));

  return <section className="admin-ops" data-daily-operations="">
    <div className="admin-tier-head">
      <h2>{t('operations.title')}</h2>
      <p>{t('operations.lede')}</p>
    </div>
    <div className="admin-kpis ops-kpis">
      {cards.map(card=>{
        const Icon=card.icon;
        return <Link href={card.href} className={`admin-kpi ops-kpi tone-${card.tone}`} data-ops-card={card.marker} key={card.marker}>
          <div className="admin-kpi-top"><span>{card.label}</span><Icon size={20} aria-hidden="true"/></div>
          <strong className="ops-number">{card.value}</strong>
          <span className={`ops-sub${card.marker==='visitors'&&data.leads.overdue>0?' ops-sub-alert':''}`}>{card.sub}</span>
          <span className="overview-view">{t('view')} →</span>
        </Link>;
      })}
    </div>
    {verbs.length>0&&<nav className="admin-quick-actions" data-quick-actions="" aria-label={t('operations.quick')}>
      {verbs.map(verb=>{
        const Icon=verb.icon;
        return <Link href={verb.href} className="button button-navy quick-action" data-quick-action={verb.key} key={verb.key}>
          <Icon size={18} aria-hidden="true"/>{verb.label}
        </Link>;
      })}
    </nav>}
  </section>;
}
