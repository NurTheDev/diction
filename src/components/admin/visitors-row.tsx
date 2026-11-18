'use client';
/**
 * The Visitors list's row — the page the pattern was finished on (owner review, 2026-11-15), and now a
 * composition of the shared pieces in `list-pattern.tsx` rather than a private copy of them, so a fix to
 * the pattern fixes this page and every list that came after it.
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
import {useActionState,useRef,type MutableRefObject} from 'react';
import {useTranslations} from 'next-intl';
import {MessageSquare} from 'lucide-react';
import {useRouter} from '@/i18n/navigation';
import {
  bulkLeadFollowUp,bulkLeadStatus,bulkLeadRemove,changeLeadStatus,chooseLeadFollowUp,liftContactBlock,
  markLeadUninterested,
} from '@/actions/leads';
import {
  FOLLOW_UP_KEYS,FOLLOW_UP_CLEAR,LEAD_STATUS_OPTIONS,idleLeadForm,statusBadge,statusLabel,type LeadFormState,
  type LeadRowView,
} from '@/lib/leads/lead-ui';
import type {LeadSmsKit} from '@/lib/leads/lead-sms';
import {DatePopover} from './popover';
import {shortDate} from './list-dates';
import {toastOnWrite} from './recycle-toast-host';
import {
  ActCell,BulkBar,BulkMenu,Cell,ChipPopover,ListChip,ListRow,MenuForm,MenuHint,NoteCell,PhoneCell,RowMenu,
  StatusChipMenu,WhoCell,useRowToast,
} from './list-pattern';
import {attr} from './list-class';
import {useLeadSmsContext,LeadSmsCheck} from './lead-sms';
import {LeadDetailDrawer,type DrawerApi} from './leads-ui';
import SmsDialogTrigger from './sms-dialog-trigger';
import {ArchiveRow} from './archive-row';
import {canArchiveKind} from '@/lib/admin/recycle-kinds';
import {DeleteRow} from './delete-row';
import {formatClass,formatDigits,inDigits,type Digits} from '@/lib/admin/format';
import {dhakaDay} from '@/lib/admin/today';

type Language='bn'|'en';
/** This list's own name in the pattern's markers and classes: `data-visitor-open`, `.visitor-who`. */
const KIND='visitor';

/* Two of these writes can file this very row away — a closed status, or a close with a reason — and the
   refresh unmounts the row before an effect could answer, so they raise their toast on the way back from
   the write instead. A follow-up never removes a row, and the bulk bar lives outside the rows it
   changes, so both of those still answer in place. */
const statusWrite=toastOnWrite(changeLeadStatus);
const notInterestedWrite=toastOnWrite(markLeadUninterested);
const allowContactWrite=toastOnWrite(liftContactBlock);

const followWord=(t:(key:string)=>string,key:string):string=>
  key==='today'?t('row.today'):key==='tomorrow'?t('row.tomorrow'):key==='three_days'?t('row.in3'):t('row.nextWeek');

/** The status badge is the menu: tap the badge, tap the new status, read the toast. Two taps. */
export function StatusMenu({row}:{row:LeadRowView}){
  const t=useTranslations('leads');
  const [state,action]=useActionState<LeadFormState|null,FormData>(statusWrite,null);
  return <StatusChipMenu kind={KIND} value={row.status} options={LEAD_STATUS_OPTIONS} title={t('colStatus')}
    labelOf={option=>statusLabel(t,option)} badgeOf={option=>statusBadge(option)}
    onPick={option=>{const form=new FormData();form.set('id',row.id);form.set('status',option);action(form)}}
    extra={row.doNotContact?<span className="admin-badge disabled" data-dnc="">{t('doNotContact')}</span>:null}/>;
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
  useRowToast(state);
  const chip=()=>{
    if(!row.nextFollowUp)return <ListChip marker="follow" value="none" tone="none">{t('row.noFollow')}</ListChip>;
    if(row.followUp==='today')return <ListChip marker="follow" value="today" tone="today">{t('row.today')}</ListChip>;
    if(row.followUp==='overdue'&&row.nextFollowUp){
      /* Noon in Dhaka anchors the count to the operator's own day, the day the record was written in. */
      const days=Math.max(1,Math.round((Date.now()-new Date(`${row.nextFollowUp}T12:00:00+06:00`).getTime())/86400000));
      return <ListChip marker="follow" value="overdue" tone="overdue">{t('row.overdueDays',inDigits(digits)({count:days}))}</ListChip>;
    }
    /* Dhaka's tomorrow, not UTC's: the rule layer writes the day in Asia/Dhaka, so a chip that compared
       it with a UTC date would call the same day "later" for six hours every evening. */
    const tomorrow=dhakaDay(new Date(Date.now()+86400000));
    return row.nextFollowUp===tomorrow
      ?<ListChip marker="follow" value="tomorrow" tone="later">{t('row.tomorrow')}</ListChip>
      :<ListChip marker="follow" value="later" tone="later">{shortDate(row.nextFollowUp,digits,language)}</ListChip>;
  };
  return <ChipPopover title={t('colFollowUp')} className="pop-follow" label={chip()}>
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
  </ChipPopover>;
}

/** The ⋯ menu: the four things a row can become, a separator, then the destructive pair the role allows. */
export function RowMoreMenu({row,canDelete,canArchive,sms,language,drawer}:{
  row:LeadRowView;canDelete:boolean;canArchive:boolean;sms:LeadSmsKit|null;language:Language;drawer:MutableRefObject<DrawerApi>;
}){
  const t=useTranslations('leads');
  const [state,action]=useActionState<LeadFormState|null,FormData>(notInterestedWrite,null);
  const [,liftAction]=useActionState(allowContactWrite,idleLeadForm);
  /**
   * A visitor has no archive state — `recycleKinds` gives the `lead` kind a bin path and no
   * `archiveSet`, the way a private record with nothing to unpublish has none — so offering Archive
   * here would be a button that answers "failed". Staff get the honest sentence instead, and the verb
   * that IS theirs: marking a visitor not interested closes the row without deleting anybody's record.
   * When this pattern is copied to a kind that has an archive path, the same line renders Archive.
   */
  const archivable=canArchive&&canArchiveKind('lead');
  return <RowMenu title={t('row.more')}>
    {close=><>
      {sms&&<div role="menuitem" className="pop-item" data-more-sms=""><SmsDialogTrigger
        request={{source:'lead',id:row.id}} templates={sms.templates} institutePhone={sms.institutePhone}
        title={t('smsOneTitle')} label={t('row.sendSms')} defaultTemplateKey="visitor_thanks"
        en={language==='en'} lockedText={sms.allowTextEdit===false}/></div>}
      <button type="button" role="menuitem" data-more-trial="" onClick={()=>{close();drawer.current?.open('handoff')}}>{t('row.bookTrial')}</button>
      <button type="button" role="menuitem" data-more-convert="" onClick={()=>{close();drawer.current?.open('handoff')}}>{t('row.convert')}</button>
      {/* Closing a visitor as not interested is a typed reason, required and validated by the rule layer. */}
      <MenuForm marker="notinterested" action={action} state={state} onDone={close} submitLabel={t('row.notInterested')}>
        <input type="hidden" name="id" value={row.id}/>
        <input className="admin-input" name="reason" required minLength={3} maxLength={200}
          placeholder={t('row.notInterested')} aria-label={t('row.notInterested')}/>
      </MenuForm>
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
      <MenuHint text={canDelete?t('row.deleteHint'):t('row.deleteAdminOnly')} adminOnly={!canDelete}/>
    </>}
  </RowMenu>;
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
  return <ListRow kind={KIND}>
    {hasCheck&&<Cell kind={KIND} part="check" label={t('row.bulk')}>
      <LeadSmsCheck row={{id:row.id,studentName:row.studentName,contactable:row.contactable,hasPhone:row.phones.length>0}}/>
    </Cell>}
    <WhoCell kind={KIND} label={t('colVisitor')} name={row.studentName}
      flags={row.flags.map(flag=>language==='bn'?flag.messageBn:flag.messageEn)}
      sub={[klass,row.school,row.leadId+(row.converted?` · ${t('converted')}`:'')].filter(Boolean).join(' · ')}/>
    <PhoneCell kind={KIND} label={t('colContact')} printed={fullPhone?formatDigits(fullPhone,digits):fullPhone} masked={row.phones[0]?.masked}
      destination={row.phones.length?{tel:row.phones[0].tel,whatsapp:row.phones[0].whatsapp}:null}
      noPhone={t('noPhone')} callLabel={t('call')} whatsappLabel={t('whatsapp')}/>
    <Cell kind={KIND} part="status" label={t('colStatus')}><StatusMenu row={row}/></Cell>
    <Cell kind={KIND} part="follow" label={t('colFollowUp')}><FollowUpChip row={row} digits={digits} language={language}/></Cell>
    <NoteCell kind={KIND} label={t('lastNote')} text={row.lastNote?.text||''} empty="—"/>
    <ActCell kind={KIND} label={t('colActions')} openLabel={t('row.open')} editLabel={t('row.edit')}
      onOpen={()=>drawer.current?.open('view')} onEdit={()=>drawer.current?.open('edit')}
      menu={<RowMoreMenu row={row} canDelete={canDelete} canArchive={canArchive} sms={sms} language={language} drawer={drawer}/>}>
      <LeadDetailDrawer seed={row} triggerless apiRef={drawer} editRow={row} fullPhone={fullPhone}
        language={language} digits={digits} sms={sms} onEditSaved={()=>router.refresh()}/>
    </ActCell>
  </ListRow>;
}

/**
 * The rows, composed on the client from plain data — the same channel the students list uses. A server
 * component handing the browser one client row at a time is what the students page never did, and the
 * list is one surface anyway: one component owns the map, so the page hands over data and nothing else.
 */
export function VisitorRows({items,canDelete,canArchive,sms,language,digits,hasCheck}:{
  items:{row:LeadRowView;fullPhone:string}[];canDelete:boolean;canArchive:boolean;sms:LeadSmsKit|null;
  language:Language;digits:Digits;hasCheck:boolean;
}){
  return <>{items.map(({row,fullPhone})=><VisitorRow key={row.id} row={row} fullPhone={fullPhone}
    canDelete={canDelete} canArchive={canArchive} sms={sms} language={language} digits={digits}
    hasCheck={hasCheck}/>)}</>;
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
  useRowToast(statusState);useRowToast(followState);useRowToast(removeState);
  if(!sms||sms.picked.length===0)return null;
  const ids=sms.picked;
  const all=(extra?:[string,string]):FormData=>{
    const form=new FormData();
    ids.forEach(id=>form.append('ids',id));
    if(extra)form.set(extra[0],extra[1]);
    return form;
  };
  return <BulkBar kind="lead" onClear={()=>sms.selectPage(false)} clearLabel={t('row.clearSelection')}
    countLabel={t('row.bulkSelected',inDigits(digits)({count:ids.length}))}>
    <button type="button" className="admin-mini-button" data-bulk-thanks="" onClick={sms.openSend}>
      <MessageSquare size={15} aria-hidden="true"/>{t('row.thanks')}
    </button>
    <BulkMenu marker="status" title={t('row.bulkStatus')} label={t('row.bulkStatus')}>
      {close=><>
        {LEAD_STATUS_OPTIONS.map(option=><button key={option} type="button" role="menuitem" {...attr('data-bulk-status-option',option)}
          onClick={()=>{statusAction(all(['status',option]));close();}}>{statusLabel(t,option)}</button>)}
      </>}
    </BulkMenu>
    <BulkMenu marker="follow" title={t('row.bulkFollow')} label={t('row.bulkFollow')}>
      {close=><>
        {FOLLOW_UP_KEYS.slice(0,4).map(key=><button key={key} type="button" role="menuitem" {...attr('data-bulk-follow-option',key)}
          onClick={()=>{followAction(all(['followUp',key]));close();}}>{followWord(t,key)}</button>)}
        <DatePopover digits={digits} language={language} label={<span>{t('row.pickDate')}</span>}
          onPick={iso=>{const form=all(['followUp','custom']);form.set('customDay',iso);followAction(form);close();}}/>
        <button type="button" role="menuitem" data-bulk-follow-clear=""
          onClick={()=>{followAction(all(['followUp',FOLLOW_UP_CLEAR]));close();}}>{t('row.clear')}</button>
      </>}
    </BulkMenu>
    {/* The destructive verb is a real submit: it is not inside a menu that closes on the click, so the
        form and its hidden ids carry the selection the way a form should. */}
    {(canDelete||canArchiveKind('lead'))&&<form action={removeAction} className="pop-form">
      {ids.map(id=><input key={id} type="hidden" name="ids" value={id}/>)}
      <button type="submit" className="admin-mini-button admin-danger-text" data-bulk-remove="">{canDelete?w('deleteAction'):w('archive')}</button>
    </form>}
  </BulkBar>;
}
