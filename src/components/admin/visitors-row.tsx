'use client';
/**
 * The reference list row (owner review, 2026-11-15) — the pattern every other admin list copies once
 * this page is approved.
 *
 *   [☐] Name / Class · School / V-id | number + Call + WhatsApp | status badge | follow-up chip |
 *       last note | [Open] [Edit] [⋯]
 *
 * One line, at most five visible controls, and the badge and the chip ARE the controls: one tap opens
 * the menu, the second commits, and a toast answers — no dropdown plus a Save button, and no native
 * date box anywhere. Everything else a row could do (send SMS, book a trial, convert to an admission,
 * mark not interested, archive or delete) lives in the labelled ⋯ menu, and Edit opens the drawer in
 * edit mode with every field on it.
 *
 * The number is printed for the roles that call visitors — Admin, Super Admin and Staff, signed in —
 * because a front desk dials from this list. It still never travels in a URL, a log, an audit target or
 * an analytics event: the only links that carry it are the `tel:` and `wa.me` destinations, and the
 * drawer, the search results, the funnel and the Overview still show the mask.
 */
import {useActionState,useEffect,useRef,type MutableRefObject} from 'react';
import {useTranslations} from 'next-intl';
import {MessageCircle,MessageSquare,MoreHorizontal,Phone} from 'lucide-react';
import {useRouter} from '@/i18n/navigation';
import {
  bulkLeadFollowUp,bulkLeadStatus,bulkLeadRemove,changeLeadStatus,chooseLeadFollowUp,liftContactBlock,
  markLeadUninterested,
} from '@/actions/leads';
import {
  FOLLOW_UP_KEYS,FOLLOW_UP_CLEAR,LEAD_STATUS_OPTIONS,idleLeadForm,statusBadge,statusLabel,type LeadRowView,
} from '@/lib/leads/lead-ui';
import type {LeadSmsKit} from '@/lib/leads/lead-sms';
import {Popover,DatePopover,shortDate} from './popover';
import {showRecycleToast} from './recycle-toast-host';
import {useLeadSmsContext,LeadSmsCheck} from './lead-sms';
import {LeadDetailDrawer,type DrawerApi} from './leads-ui';
import SmsDialogTrigger from './sms-dialog-trigger';
import {ArchiveRow} from './archive-row';
import {canArchiveKind} from '@/lib/admin/recycle-kinds';
import {DeleteRow} from './delete-row';
import {formatClass,inDigits,type Digits} from '@/lib/admin/format';
import {dhakaDay} from '@/lib/admin/today';

type Language='bn'|'en';

/** Every write on this row answers with a toast, so a change is never only a re-rendered list. */
function useToast(state:{status:string;message?:string}|null){
  useEffect(()=>{
    if(state&&state.status==='ok'&&state.message)showRecycleToast({state:{status:'ok'},success:state.message,error:''});
  },[state]);
}

const followWord=(t:(key:string)=>string,key:string):string=>
  key==='today'?t('row.today'):key==='tomorrow'?t('row.tomorrow'):key==='three_days'?t('row.in3'):t('row.nextWeek');

/** The status badge is the menu: tap the badge, tap the new status, read the toast. Two taps. */
export function StatusMenu({row}:{row:LeadRowView}){
  const t=useTranslations('leads');
  const [state,action]=useActionState(changeLeadStatus,null);
  useToast(state);
  return <span className="visitor-status-cell">
    <div className="pop-form">
      <Popover title={t('colStatus')} className="pop-status" label={
        <span className={`admin-badge ${statusBadge(row.status)}`} data-status-badge="">{statusLabel(t,row.status)}</span>}>
        {close=><div className="pop-menu" role="menu" data-status-menu="">
          {/* Not `type="submit"` with `onClick={close}`: closing the menu detaches the button before the
              browser runs the click's activation behaviour, so a submit button that shuts its own menu
              never submits and the tap looks accepted while nothing is written. The item hands the
              action its own FormData and then closes — the same way the calendar below picks a day. */}
          {LEAD_STATUS_OPTIONS.map(option=>option===row.status?null:
            <button key={option} type="button" role="menuitem" data-status-option={option}
              onClick={()=>{const form=new FormData();form.set('id',row.id);form.set('status',option);action(form);close();}}>
              <span className={`admin-badge ${statusBadge(option)}`}>{statusLabel(t,option)}</span></button>)}
        </div>}
      </Popover>
    </div>
    {row.doNotContact&&<span className="admin-badge disabled" data-dnc="">{t('doNotContact')}</span>}
  </span>;
}

/**
 * The follow-up chip. "Today", "Tomorrow", "Overdue 2 days", a later day as dd/mm/yyyy, or
 * "No follow-up" — and one tap on it offers Today / Tomorrow / In 3 days / Next week / Pick a date /
 * Clear. The picked day lands on the same `chooseLeadFollowUp` action the drawer uses, so a row and a
 * drawer cannot disagree about what a follow-up is.
 */
export function FollowUpChip({row,digits,language}:{row:LeadRowView;digits:Digits;language:Language}){
  const t=useTranslations('leads');
  const [state,action]=useActionState(chooseLeadFollowUp,null);
  useToast(state);
  const chip=()=>{
    if(!row.nextFollowUp)return <span className="lead-chip none" data-follow-chip="none">{t('row.noFollow')}</span>;
    if(row.followUp==='today')return <span className="lead-chip today" data-follow-chip="today">{t('row.today')}</span>;
    if(row.followUp==='overdue'){
      /* Noon in Dhaka anchors the count to the operator's own day, the day the record was written in. */
      const days=Math.max(1,Math.round((Date.now()-new Date(`${row.nextFollowUp}T12:00:00+06:00`).getTime())/86400000));
      return <span className="lead-chip overdue" data-follow-chip="overdue">{t('row.overdueDays',inDigits(digits)({count:days}))}</span>;
    }
    /* Dhaka's tomorrow, not UTC's: the rule layer writes the day in Asia/Dhaka, so a chip that compared
       it with a UTC date would call the same day "later" for six hours every evening. */
    const tomorrow=dhakaDay(new Date(Date.now()+86400000));
    return row.nextFollowUp===tomorrow
      ?<span className="lead-chip later" data-follow-chip="tomorrow">{t('row.tomorrow')}</span>
      :<span className="lead-chip later" data-follow-chip="later">{shortDate(row.nextFollowUp,digits,language)}</span>;
  };
  return <div className="pop-form">
    <Popover title={t('colFollowUp')} className="pop-follow" label={chip()}>
      {close=><div className="pop-menu" role="menu" data-follow-menu="">
        {FOLLOW_UP_KEYS.slice(0,4).map(key=><button key={key} type="button" role="menuitem" data-follow-option={key}
          onClick={()=>{const form=new FormData();form.set('id',row.id);form.set('followUp',key);action(form);close();}}>{followWord(t,key)}</button>)}
        <DatePopover digits={digits} language={language} label={<span data-follow-pick="">{t('row.pickDate')}</span>}
          onPick={iso=>{
            const form=new FormData();form.set('id',row.id);form.set('followUp','custom');form.set('customDay',iso);
            action(form);close();
          }}/>
        <button type="button" role="menuitem" data-follow-clear=""
          onClick={()=>{const form=new FormData();form.set('id',row.id);form.set('followUp',FOLLOW_UP_CLEAR);action(form);close();}}>{t('row.clear')}</button>
      </div>}
    </Popover>
  </div>;
}

/** The ⋯ menu: the four things a row can become, a separator, then the destructive pair the role allows. */
export function RowMoreMenu({row,canDelete,canArchive,sms,language,drawer}:{
  row:LeadRowView;canDelete:boolean;canArchive:boolean;sms:LeadSmsKit|null;language:Language;drawer:MutableRefObject<DrawerApi>;
}){
  const t=useTranslations('leads');
  const [state,action]=useActionState(markLeadUninterested,null);
  const [liftState,liftAction]=useActionState(liftContactBlock,idleLeadForm);
  useToast(state);useToast(liftState);
  /**
   * A visitor has no archive state — `recycleKinds` gives the `lead` kind a bin path and no
   * `archiveSet`, the way a private record with nothing to unpublish has none — so offering Archive
   * here would be a button that answers "failed". Staff get the honest sentence instead, and the verb
   * that IS theirs: marking a visitor not interested closes the row without deleting anybody's record.
   * When this pattern is copied to a kind that has an archive path, the same line renders Archive.
   */
  const archivable=canArchive&&canArchiveKind('lead');
  return <Popover title={t('row.more')} className="pop-more" label={<span className="pop-dots"><MoreHorizontal size={18} aria-hidden="true"/></span>}>
    {close=><div className="pop-menu" role="menu" data-more-menu="">
      {sms&&<div role="menuitem" className="pop-item" data-more-sms=""><SmsDialogTrigger
        request={{source:'lead',id:row.id}} templates={sms.templates} institutePhone={sms.institutePhone}
        title={t('smsOneTitle')} label={t('row.sendSms')} defaultTemplateKey="visitor_thanks"
        en={language==='en'} lockedText={sms.allowTextEdit===false}/></div>}
      <button type="button" role="menuitem" data-more-trial="" onClick={()=>{close();drawer.current?.open('handoff')}}>{t('row.bookTrial')}</button>
      <button type="button" role="menuitem" data-more-convert="" onClick={()=>{close();drawer.current?.open('handoff')}}>{t('row.convert')}</button>
      <form action={action} className="pop-inline" data-more-notinterested="" onClick={event=>event.stopPropagation()}>
        <input type="hidden" name="id" value={row.id}/>
        <input className="admin-input" name="reason" required minLength={3} maxLength={200}
          placeholder={t('row.notInterested')} aria-label={t('row.notInterested')}/>
        <button type="submit" role="menuitem">{t('row.notInterested')}</button>
      </form>
      {/* Lifting a block is rare, deliberate and only ever on a blocked row, so it is not one of the
          row's five visible controls — it belongs with the rest of what a row can become. The badge on
          the row is the warning; this is the way back. */}
      {row.doNotContact&&<div className="pop-item" data-more-allow="" onClick={event=>event.stopPropagation()}>
        <button type="button" role="menuitem"
          onClick={()=>{const form=new FormData();form.set('id',row.id);form.set('allowed','true');liftAction(form);close();}}>{t('allowContact')}</button>
      </div>}
      <hr className="pop-sep"/>
      {/* Delete is Admin and Super Admin; Archive is the floor every role that may write here has. */}
      {(archivable||canDelete)&&<div className="pop-item pop-destructive" role="menuitem" data-more-destructive="">
        {archivable&&<span data-row-archive=""><ArchiveRow kind="lead" id={row.id} onDone={close}/></span>}
        {canDelete&&<span data-row-delete=""><DeleteRow kind="lead" id={row.id} name={row.studentName}
          canDelete={canDelete} canArchive={archivable} onDone={close}/></span>}
      </div>}
      {canDelete
        ?<span className="admin-help pop-hint">{t('row.deleteHint')}</span>
        :<span className="admin-help pop-hint" data-more-admin-only="">{t('row.deleteAdminOnly')}</span>}
    </div>}
  </Popover>;
}

/**
 * One visitor, one line. The drawer belongs to the row, opened by the row's own three buttons — which
 * is why it is `triggerless` here: a fourth button labelled "details" is exactly the long action cell
 * this row replaced.
 */
export function VisitorRow({row,fullPhone,canDelete,canArchive,sms,language,digits,hasCheck}:{
  row:LeadRowView;fullPhone:string;canDelete:boolean;canArchive:boolean;sms:LeadSmsKit|null;
  language:Language;digits:Digits;hasCheck:boolean;
}){
  const t=useTranslations('leads');
  const router=useRouter();
  const drawer=useRef<DrawerApi>(null);
  const klass=row.classGroup?formatClass(row.classGroup,digits,language,t('colClass')):(row.classLabel||t('unknownValue'));
  return <tr className="visitor-row" data-visitor-row="">
    {hasCheck&&<td className="visitor-check" data-label={t('row.bulk')}>
      <LeadSmsCheck row={{id:row.id,studentName:row.studentName,contactable:row.contactable,hasPhone:row.phones.length>0}}/>
    </td>}
    <td className="visitor-who" data-label={t('colVisitor')}>
      {/* Two lines and no third: the name, then class · school · V-id on one line that truncates. A
          flag rides beside the name rather than adding a line, so the row stays inside 72px. */}
      <span className="visitor-name"><strong>{row.studentName}</strong>
        {row.flags.slice(0,1).map((flag,index)=><span key={index} className="lead-flag">{language==='bn'?flag.messageBn:flag.messageEn}</span>)}</span>
      <span className="visitor-sub">{[klass,row.school,row.leadId+(row.converted?` · ${t('converted')}`:'')].filter(Boolean).join(' · ')}</span>
    </td>
    <td className="visitor-call" data-label={t('colContact')}>
      {row.phones.length
        ?<span className="visitor-phone">
          <span className="visitor-number" data-visitor-phone="">{fullPhone||row.phones[0].masked}</span>
          <a className="admin-mini-button visitor-dial" href={row.phones[0].tel} data-visitor-call=""><Phone size={15} aria-hidden="true"/>{t('call')}</a>
          <a className="admin-mini-button visitor-dial" href={row.phones[0].whatsapp} target="_blank" rel="noreferrer" data-visitor-wa=""><MessageCircle size={15} aria-hidden="true"/>{t('whatsapp')}</a>
        </span>
        :<span className="admin-help">{t('noPhone')}</span>}
    </td>
    <td className="visitor-status" data-label={t('colStatus')}><StatusMenu row={row}/></td>
    <td className="visitor-follow" data-label={t('colFollowUp')}><FollowUpChip row={row} digits={digits} language={language}/></td>
    <td className="visitor-note" data-label={t('lastNote')}>
      {row.lastNote?<span className="visitor-note-text" title={row.lastNote.text}>{row.lastNote.text}</span>:<span className="admin-help">—</span>}
    </td>
    <td className="visitor-act" data-label={t('colActions')}>
      <button type="button" className="admin-mini-button" data-visitor-open="" onClick={()=>drawer.current?.open('view')}>{t('row.open')}</button>
      <button type="button" className="admin-mini-button" data-visitor-edit="" onClick={()=>drawer.current?.open('edit')}>{t('row.edit')}</button>
      <RowMoreMenu row={row} canDelete={canDelete} canArchive={canArchive} sms={sms} language={language} drawer={drawer}/>
      <LeadDetailDrawer seed={row} triggerless apiRef={drawer} editRow={row} fullPhone={fullPhone}
        language={language} digits={digits} sms={sms} onEditSaved={()=>router.refresh()}/>
    </td>
  </tr>;
}

/**
 * The bulk bar: it appears the moment a row is ticked and offers the four things an operator does to a
 * handful of visitors at once — thank them by SMS, move their status, set one follow-up day for all of
 * them, or clear them out (Delete for Admin and Super Admin, Archive for Staff).
 *
 * It reads the SMS picker's selection rather than keeping a second one, so a visitor who said "do not
 * contact" — whom the picker will not let anybody tick — is not bulk-acted on either.
 */
export function LeadBulkBar({canDelete,canArchive,digits,language}:{canDelete:boolean;canArchive:boolean;digits:Digits;language:Language}){
  const t=useTranslations('leads');
  /* The destructive verbs come from the recycle engine's own vocabulary rather than a second copy of it:
     the row's menu names the same act with `adminWork.deleteAction`, and one screen needs one word for
     one verb — the bar used to say a transliteration of the English while the menu said the Bangla verb. */
  const w=useTranslations('adminWork');
  const sms=useLeadSmsContext();
  const [statusState,statusAction]=useActionState(bulkLeadStatus,null);
  const [followState,followAction]=useActionState(bulkLeadFollowUp,null);
  const [removeState,removeAction]=useActionState(bulkLeadRemove,null);
  useToast(statusState);useToast(followState);useToast(removeState);
  if(!sms||sms.picked.length===0)return null;
  const ids=sms.picked;
  return <div className="lead-bulk-bar" data-lead-bulk-bar="">
    <strong data-bulk-count="">{t('row.bulkSelected',inDigits(digits)({count:ids.length}))}</strong>
    <button type="button" className="admin-mini-button" data-bulk-thanks="" onClick={sms.openSend}>
      <MessageSquare size={15} aria-hidden="true"/>{t('row.thanks')}
    </button>
    {/* Every item in a menu hands its action the FormData itself and then closes the menu. A submit
        button that shuts its own menu is detached before the browser runs the click's activation
        behaviour, so it never submits: the tap looks accepted and nothing is written. */}
    <div className="pop-form">
      <Popover title={t('row.bulkStatus')} label={<span className="admin-mini-button" data-bulk-status="">{t('row.bulkStatus')}</span>}>
        {close=><div className="pop-menu" role="menu">
          {LEAD_STATUS_OPTIONS.map(option=><button key={option} type="button" role="menuitem" data-bulk-status-option={option}
            onClick={()=>{const form=new FormData();ids.forEach(id=>form.append('ids',id));form.set('status',option);statusAction(form);close();}}>{statusLabel(t,option)}</button>)}
        </div>}
      </Popover>
    </div>
    <div className="pop-form">
      <Popover title={t('row.bulkFollow')} label={<span className="admin-mini-button" data-bulk-follow="">{t('row.bulkFollow')}</span>}>
        {close=><div className="pop-menu" role="menu">
          {FOLLOW_UP_KEYS.slice(0,4).map(key=><button key={key} type="button" role="menuitem" data-bulk-follow-option={key}
            onClick={()=>{const form=new FormData();ids.forEach(id=>form.append('ids',id));form.set('followUp',key);followAction(form);close();}}>{followWord(t,key)}</button>)}
          <DatePopover digits={digits} language={language} label={<span>{t('row.pickDate')}</span>}
            onPick={iso=>{
              const form=new FormData();ids.forEach(id=>form.append('ids',id));form.set('followUp','custom');form.set('customDay',iso);
              followAction(form);close();
            }}/>
          <button type="button" role="menuitem" data-bulk-follow-clear=""
            onClick={()=>{const form=new FormData();ids.forEach(id=>form.append('ids',id));form.set('followUp',FOLLOW_UP_CLEAR);followAction(form);close();}}>{t('row.clear')}</button>
        </div>}
      </Popover>
    </div>
        {/* The destructive verb is a real submit: it is not inside a menu that closes on the click, so the
        form and its hidden ids carry the selection the way a form should. */}
    {(canDelete||canArchiveKind('lead'))&&<form action={removeAction} className="pop-form">
      {ids.map(id=><input key={id} type="hidden" name="ids" value={id}/>)}
      <button type="submit" className="admin-mini-button admin-danger-text" data-bulk-remove="">{canDelete?w('deleteAction'):w('archive')}</button>
    </form>}
    <button type="button" className="admin-mini-button" data-bulk-clear="" onClick={()=>sms.selectPage(false)}>{t('row.clearSelection')}</button>
  </div>;
}
