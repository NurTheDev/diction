'use client';
/**
 * The Students list's row — the first list built FROM the shared pattern rather than beside it
 * (owner decision, group 1). Everything a row is comes from `list-pattern.tsx`; this file adds only
 * what is a student's: the fields, the verbs, the dues read-out and the words.
 *
 *   [☐] Name / id · class | number + Call + WhatsApp | status badge | dues chip | note | [Edit] [⋯]
 *
 * Four visible controls — the tick, the badge, the dues chip, Edit and ⋯ — and the badge IS the
 * hold switch: one tap opens it, the second commits, and a toast answers. The ⋯ holds everything
 * else a row can do, labelled: View profile, Send SMS, Take payment, Hold or Lift hold, and at its
 * destructive end Remove, which asks for a leave month and a reason before it moves anything — or,
 * for a role that may not remove, the honest sentence naming who may. A removed row's ⋯ is Restore,
 * with the month the fee starts again and why.
 *
 * Nothing here is a native date or month box: the leave month comes from `MonthField` and the
 * admission day from `DayField`, both of which read the value back in the operator's own digits and
 * language. The number is printed because every role that can open this list dials from it, and it
 * still travels nowhere but the `tel:` and `wa.me` destinations — not in a URL, a log or an audit
 * target. Edit opens the row's own inline form; a write that files the row away (Remove, Restore)
 * answers through `toastOnWrite`, because an effect keyed on the action state never runs once the
 * row is unmounted.
 */
import {useActionState,useEffect,useRef,useState,type ReactNode} from 'react';
import {useTranslations} from 'next-intl';
import {Link} from '@/i18n/navigation';
import {
  removeCenterStudent,restoreCenterStudent,setStudentHold,updateCenterStudent,
  type CenterActionState,type CenterSearchItem,
} from '@/actions/center-students';
import {toastOnWrite} from './recycle-toast-host';
import {DayField} from './popover';
import {MonthField,shortMonth} from './month-popover';
import {
  ActCell,Cell,ChipPopover,ListChip,ListRow,MenuForm,MenuHint,NoteCell,PhoneCell,RowEditForm,RowMenu,
  StatusChipMenu,WhoCell,attr,
} from './list-pattern';
import SendSmsDialog,{type SmsTemplateOption} from './send-sms-dialog';
import {formatDigits,formatNumber,type Digits} from '@/lib/admin/format';

/** This list's own name in the pattern's markers and classes: `data-student-edit`, `.student-who`. */
const KIND='student';
const idle:CenterActionState={status:'idle'};

/* Hold and Edit keep their row on screen; Remove and Restore file it away, so those two raise their
   toast on the way back from the write rather than from an effect that would never run. All four go
   through `toastOnWrite` so a row answers the same way whichever verb it was. */
const holdWrite=toastOnWrite<CenterActionState,CenterActionState>(setStudentHold);
const removeWrite=toastOnWrite<CenterActionState,CenterActionState>(removeCenterStudent);
const restoreWrite=toastOnWrite<CenterActionState,CenterActionState>(restoreCenterStudent);
const editWrite=toastOnWrite<CenterActionState,CenterActionState>(updateCenterStudent);

/** What every row on the page shares, so the row itself carries one student and nothing else. */
export type StudentRowKit={
  digits:Digits;language:'bn'|'en';currency:string;
  /** Only an Admin or a Super Admin removes a student; everybody else reads the sentence that says so. */
  canManage:boolean;
  /** The kit the SMS dialog needs, and the title the caller gives it. */
  maySendSms:boolean;templates:SmsTemplateOption[];institutePhone:string;smsTitle:string;
  /** Re-read the list: a row's status, dues and notes all live in the parent's search result. */
  onChanged:()=>void;
  /** The bulk bar's selection, which the row's own tick belongs to. */
  picked:string[];onTick:(id:string,on:boolean)=>void;
};

/**
 * One re-read per write that answered. The row cannot refresh itself — its numbers, its dues, its
 * status and the two version numbers an edit is checked against are all the parent's search result —
 * and it must not re-read on every render either, or the re-read that drops a removed row would keep
 * asking for it. So the write states are compared by identity, and any answer but `idle` re-reads once:
 * a refusal has to re-read too, because a conflict means somebody else wrote first, and the form that
 * stays open with the old version numbers would be refused again for as long as the operator typed.
 * What they typed survives the re-read — the fields are uncontrolled — and the second Save lands.
 */
function useReread(onChanged:()=>void,states:CenterActionState[]):void{
  const last=useRef(states);
  useEffect(()=>{
    const changed=states.some((state,index)=>state!==last.current[index]);
    last.current=states;
    if(changed&&states.some(state=>state.status!=='idle'))onChanged();
  });
}

/** The badge a status wears, and the two statuses a row can be switched between in one tap each. */
const STATUS_OPTIONS=['active','on_hold'] as const;
type Status=typeof STATUS_OPTIONS[number];
const statusBadge=(status:string):string=>status==='active'?'enabled':status==='on_hold'?'pending':'disabled';

/** One labelled item in the ⋯ menu: a button that does the thing, then closes the menu it lives in. */
function MenuItem({marker,onClick,disabled,children}:{marker:string;onClick?:()=>void;disabled?:boolean;children:ReactNode}){
  return <button type="button" role="menuitem" {...attr(`data-more-${marker}`)} disabled={disabled}
    /* A menu item hands its action the FormData itself and then closes: `type="submit"` with
       `onClick={close}` never submits, because closing detaches the button before the browser runs the
       click's activation behaviour, and the tap looks accepted while nothing is written. */
    onClick={onClick}>{children}</button>;
}

export function StudentRow({student,kit}:{student:CenterSearchItem;kit:StudentRowKit}){
  const t=useTranslations('center');
  const {digits,language,currency,canManage,maySendSms,templates,institutePhone,smsTitle,onChanged}=kit;
  const [holdState,holdAction,holdPending]=useActionState(holdWrite,idle);
  const [removeState,removeAction,removePending]=useActionState(removeWrite,idle);
  const [restoreState,restoreAction,restorePending]=useActionState(restoreWrite,idle);
  const [editState,editAction,editPending]=useActionState(editWrite,idle);
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState<CenterSearchItem|null>(null);
  const [smsOpen,setSmsOpen]=useState(false);
  /* The month a Remove or a Restore carries is picked, and until it is, the verb is a dead button: a
     hidden input is barred from constraint validation, so `required` cannot do this work. */
  const [leaveMonth,setLeaveMonth]=useState(''),[resumeMonth,setResumeMonth]=useState('');
  useReread(onChanged,[holdState,removeState,restoreState,editState]);
  /* A saved edit closes its own form, the way `MenuForm` closes its menu when the write lands: a form
     left open over the row it has just written is a sheet left across the operator's work, and on a
     phone it covers the list. A refusal leaves it open, with what they typed still in it. */
  const lastEdit=useRef(editState);
  useEffect(()=>{
    if(editState===lastEdit.current)return;
    lastEdit.current=editState;
    if(editState.status==='ok'){setEditing(false);setDraft(null)}
  },[editState]);

  const held=student.status==='on_hold',removed=student.status==='removed';
  const name=(language==='en'?student.nameEn:student.nameBn)||student.nameBn;
  const classLabel=(language==='en'?student.classEn:student.classBn)||student.classBn||'—';
  /* The row's second line is its identity: id · class, and for a row that has left, the month it left
     for — the one fact about a removed student the list owes without opening anything. */
  const sub=removed&&student.leaveMonth
    ?`${formatDigits(student.studentId,digits)} · ${shortMonth(student.leaveMonth,digits,language)}`
    :`${formatDigits(student.studentId,digits)} · ${classLabel}`;
  const phone=formatDigits(student.guardianPhone,digits);
  /* `tel:` and `wa.me` are the only two places a number travels. Both are destinations, not records:
     nothing here puts the digits in a query string, a log line or an audit target. */
  const destination=student.guardianPhone
    ?{tel:`tel:${student.guardianPhone}`,whatsapp:`https://wa.me/${student.guardianPhone.replace(/^0/,'880')}`}
    :null;
  const statusLabel=(status:string):string=>t(status==='on_hold'?'onHold':status==='removed'?'removed':'active');
  const months=t.raw('monthNames') as string[];

  /** One write of the hold switch, from the badge or from the ⋯ menu — the same action, the same words. */
  const submitHold=(next:'active'|'on_hold'):void=>{
    const form=new FormData();
    form.set('id',student.id);
    form.set('hold',next==='on_hold'?'1':'');
    holdAction(form);
  };

  const dues=student.dues;
  const dueChip=dues==null
    ?<ListChip marker="dues" value="none" tone="none">{t('row.duesNone')}</ListChip>
    :dues===0
      ?<ListChip marker="dues" value="clear" tone="clear">{t('row.duesClear')}</ListChip>
      :<ListChip marker="dues" value="due" tone="due">{t('row.duesTotal',{amount:formatNumber(dues,digits)})}</ListChip>;

  return <>
    <ListRow kind={KIND}>
      <Cell kind={KIND} part="check" label={t('row.bulk')}>
        {/* The tick is what the bulk bar counts, and it keeps the name the SMS flow already reads. A
            student the centre has stopped running is not a recipient: no tick on a removed row. */}
        {maySendSms&&!removed&&<input type="checkbox" name="smsStudent" value={student.id} aria-label={name}
          data-student-tick="" onChange={event=>kit.onTick?.(student.id,event.target.checked)}
          checked={!!kit.picked?.includes(student.id)}/>}
      </Cell>
      <WhoCell kind={KIND} label={t('row.who')} name={name} sub={sub}/>
      <PhoneCell kind={KIND} label={t('row.contact')} destination={destination} printed={phone}
        noPhone={t('row.noPhone')} callLabel={t('row.call')} whatsappLabel={t('row.whatsapp')}/>
      <Cell kind={KIND} part="status" label={t('row.statusCol')}>
        {/* Removed is not a status an operator switches into: it needs a leave month and a reason, so it
            lives in the ⋯ menu as Remove, and the badge only offers the two it can do in one tap. */}
        {removed
          /* A removed row's badge is a badge and not a menu: the way back is Restore, in the ⋯, with a
             month and a reason — not a status an operator flicks to. */
          ?<span className="list-status-cell"><span className={`admin-badge ${statusBadge(student.status)}`} {...attr('data-status-badge')}>{statusLabel(student.status)}</span></span>
          :<StatusChipMenu<Status> kind={KIND} value={student.status==='on_hold'?'on_hold':'active'} options={STATUS_OPTIONS}
            labelOf={statusLabel} badgeOf={statusBadge} title={t('row.statusCol')}
            onPick={option=>submitHold(option)}/>}
      </Cell>
      <Cell kind={KIND} part="dues" label={t('row.duesCol')}>
        {/* The chip is the total; one tap opens the months behind it, because a number with no months
            behind it is an argument with the guardian rather than an answer. */}
        <ChipPopover title={t('row.duesMonths')} label={dueChip}>
          <div className="pop-menu" {...attr('data-dues-months',String(dues??'none'))}>
            {student.dueMonths.length
              ?student.dueMonths.map(due=><span key={`${due.year}-${due.month}`} className="pop-item admin-help">
                {months[due.month-1]} {formatNumber(due.year,digits)} — {formatNumber(due.due,digits)} {currency}</span>)
              :<span className="pop-item admin-help">{dues==null?t('row.notCounted'):t('row.noDues')}</span>}
          </div>
        </ChipPopover>
      </Cell>
      <NoteCell kind={KIND} label={t('row.lastNote')} text={student.notes} empty={t('row.emptyNote')}/>
      <ActCell kind={KIND} label={t('row.actCol')} editLabel={removed?undefined:t('row.edit')}
        onEdit={removed?undefined:()=>{
          if(editing)setEditing(false);
          else{setDraft(student);setEditing(true)}
        }}
        /* The row's own SMS dialog lives in the action cell, where the visitors row keeps its drawer: a
           `<dialog>` inside a `<tbody>` is not a row, and a browser is allowed to move it out. */
        menu={<RowMenu title={t('row.more')}>{close=><>
          <span className="pop-item"><Link className="admin-mini-button" href={`/admin/students/${student.id}`}
            {...attr('data-more-view')} onClick={close}>{t('view')}</Link></span>
          {maySendSms&&<MenuItem marker="sms" onClick={()=>{setSmsOpen(true);close()}}>{t('row.sendSms')}</MenuItem>}
          <span className="pop-item"><Link className="admin-mini-button" href={`/admin/students/${student.id}/collect`}
            {...attr('data-more-payment')} onClick={close}>{t('row.payment')}</Link></span>
          {!removed&&<MenuItem marker="hold" disabled={holdPending} onClick={()=>{submitHold(held?'active':'on_hold');close()}}>
            {held?t('unhold'):t('hold')}</MenuItem>}
          {canManage
            ?removed
              /* Restore is Remove's mirror image: the month the fee starts again and the reason, typed
                 by a person, before the row comes back into the list the centre works from. */
              ?<MenuForm marker="restore" action={restoreAction} state={restoreState} onDone={close}
                submitLabel={t('restore.submit')} disabled={restorePending||!resumeMonth}>
                <input type="hidden" name="id" value={student.id}/>
                <label className="admin-help">{t('restore.resumeLabel')}
                  <MonthField name="resume" value="" placeholder={t('row.pickMonth')} clearLabel={t('row.clear')}
                    digits={digits} language={language} onChange={setResumeMonth}/></label>
                <label className="admin-help">{t('restore.reasonLabel')}
                  <input className="admin-input" name="reason" minLength={3} maxLength={500} required placeholder={t('row.restoreHint')}/></label>
                {restoreState.status!=='idle'&&restoreState.status!=='ok'
                  &&<span className="admin-help pop-hint">{restoreState.status==='duplicate'?t('restore.duplicate'):t('restore.failed')}</span>}
              </MenuForm>
              :<MenuForm marker="remove" action={removeAction} state={removeState} onDone={close}
                submitLabel={t('remove')} disabled={removePending||!leaveMonth}>
                <input type="hidden" name="id" value={student.id}/>
                {/* The month is picked, never typed: `type="month"` paints mm/yyyy in one browser and a
                    spinner in the next, and a leave month decides which months the fee run skips. */}
                <label className="admin-help">{t('removeLeave')}
                  <MonthField name="leave" value="" placeholder={t('row.pickMonth')} clearLabel={t('row.clear')}
                    notAfter={undefined} digits={digits} language={language} onChange={setLeaveMonth}/></label>
                <label className="admin-help">{t('removeReason')}
                  <textarea className="admin-input" name="reason" rows={2} minLength={3} maxLength={500} required placeholder={t('row.removeHint')}/></label>
                {removeState.status!=='idle'&&removeState.status!=='ok'
                  &&<span className="admin-help pop-hint">{t('removeInvalid')}</span>}
              </MenuForm>
            :<MenuHint adminOnly text={t('row.removeAdminOnly')}/>}
          {/* The reason a row looks the way it does is read where the verb is, not on another page. */}
          {held&&student.holdReason&&<MenuHint text={t('row.holdReason',{reason:student.holdReason})}/>}
          {removed&&student.removalReason&&<MenuHint text={t('row.removedNote',{
            month:shortMonth(student.leaveMonth,digits,language),reason:student.removalReason})}/>}
        </>}</RowMenu>}>
        {smsOpen&&<SendSmsDialog open onClose={()=>setSmsOpen(false)} request={{source:'students',ids:[student.id]}}
          templates={templates} institutePhone={institutePhone} title={smsTitle} defaultTemplateKey="due_reminder"
          en={language==='en'} onSent={onChanged}/>}
      </ActCell>
    </ListRow>
    {/* The inline edit is its own row: the display row keeps its height budget and its four controls
        while the fields are open, and closing them puts the row back exactly as it was. */}
    {editing&&!removed&&draft&&<tr className="list-edit-row" {...attr(`data-${KIND}-edit-row`)}>
      <td colSpan={7} className="list-edit-cell">
        <RowEditForm kind={KIND} action={editAction} pending={editPending} saveLabel={t('row.save')}
          cancelLabel={t('row.cancel')} onCancel={()=>setEditing(false)}
          error={editState.status==='conflict'?t('conflict'):editState.status==='duplicate'?t('duplicate'):
            editState.status==='invalid'||editState.status==='error'?t('invalid'):undefined}>
          {/* The two numbers the write is checked against: without them the action refuses the edit as
              somebody else's, which is what makes two operators on one student safe. */}
          <input type="hidden" name="id" value={student.id}/>
          <input type="hidden" name="revision" value={student.revision}/>
          <input type="hidden" name="version" value={String(student.version)}/>
          <div className="list-edit-grid">
            <label>{t('nameBn')}<input className="admin-input" name="nameBn" defaultValue={draft.nameBn} required maxLength={120}/></label>
            <label>{t('nameEn')}<input className="admin-input" name="nameEn" defaultValue={draft.nameEn} maxLength={120}/></label>
            <label>{t('roll')}<input className="admin-input" name="roll" defaultValue={draft.roll} maxLength={40} inputMode="numeric"/></label>
            <label>{t('school')}<input className="admin-input" name="school" defaultValue={draft.school} maxLength={160}/></label>
            <label>{t('guardian')}<input className="admin-input" name="guardianName" defaultValue={draft.guardianName} required maxLength={120}/></label>
            <label>{t('guardianPhone')}<input className="admin-input" name="guardianPhone" defaultValue={draft.guardianPhone} required inputMode="tel"/></label>
            <label>{t('studentPhone')}<input className="admin-input" name="studentPhone" defaultValue={draft.studentPhone} inputMode="tel"/></label>
            <label>{t('altPhone')}<input className="admin-input" name="altPhone" defaultValue={draft.altPhone} inputMode="tel"/></label>
            <label>{t('address')}<input className="admin-input" name="address" defaultValue={draft.address} maxLength={500}/></label>
            <label>{t('admissionDate')}
              <DayField name="admissionDate" value={draft.admissionDate} placeholder={t('row.pickDay')}
                clearLabel={t('row.clear')} digits={digits} language={language}/></label>
          </div>
          <label>{t('notes')}<textarea className="admin-input" name="notes" rows={2} defaultValue={draft.notes} maxLength={3000}/></label>
          <p className="admin-help">{t('editHint')}</p>
        </RowEditForm>
      </td>
    </tr>}
  </>;
}
