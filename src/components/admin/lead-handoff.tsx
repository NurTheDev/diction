'use client';

/**
 * R3.13 · The three hand-offs, as the Visitors drawer opens them.
 *
 * What this file is careful about is what it holds. A hand-off form knows a visitor's name, class,
 * school and — for the phone — a MASK. The number itself never reaches the browser: the operator
 * presses the button and the rule layer copies the number off the lead's own record when it writes.
 * So nothing here can leak a digit into served HTML, into a browser cache or into a screenshot, and a
 * form left open on a desk shows the same `01****90` the list screen shows.
 *
 * The three dialogs live in one component because they share one truth: a hand-off either writes and
 * reports the reference it made, or it refuses and stays open with the reason on screen. Those refusal
 * sentences come from the rule layer (`lead-handoff.ts`), never from this file, so a browser test and a
 * unit test read the same words. And a hand-off that is already done is switched OFF with its reason as
 * the button's title, rather than letting an operator fill a form in and discover it afterwards.
 */

import {useActionState,useCallback,useEffect,useRef,useState} from 'react';
import {useTranslations} from 'next-intl';
import {CalendarCheck,FilePlus2,XCircle} from 'lucide-react';
import {loadLeadTrialSlots,submitLeadAdmission,submitLeadNotInterested,submitLeadTrial} from '@/actions/leads';
import {leadFormMessage,type LeadFormState,type LeadHandoffView} from '@/lib/leads/lead-ui';
import {HANDOFF_GRADES,NOT_INTERESTED_REASON_MAX,NOT_INTERESTED_REASON_MIN} from '@/lib/leads/lead-handoff';
import {subjectValues} from '@/schemas/intake';
import {formatClass,formatDate,formatNumber,formatTime,type Digits} from '@/lib/admin/format';

export type TrialSlotOption={id:string;startAt:string;endAt:string;grade:string;subject:string;seatsLeft:number};

const GENDERS=['female','male','other','prefer-not'] as const;
const MEDIUMS=['bangla','english','english-version'] as const;
const COURSE_TYPES=['individual','package'] as const;
/** Quick reasons: a tap for the four answers that actually shape the funnel, and a box for the rest. */

/**
 * The hand-off strip. `handoff` arrives with the drawer's detail: prefills already masked, plus the
 * refusal a hand-off would already meet (`ALREADY_CONVERTED`, `ALREADY_BOOKED`, `NO_PHONE`).
 */
export function LeadHandoff({leadId,handoff,language,digits,onDone}:{
  leadId:string;handoff:LeadHandoffView|null;language:'bn'|'en';digits:Digits;onDone?:()=>void;
}){
  const t=useTranslations('leads');
  const f=useTranslations('forms');
  const p=useTranslations('pages');
  const subjectLabels=p.raw('subjects') as string[];
  const genders=f.raw('genders') as string[];
  const mediums=f.raw('mediums') as string[];
  const [open,setOpen]=useState<''|'admission'|'trial'|'not-interested'>('');
  const admissionRef=useRef<HTMLDialogElement>(null);
  const trialRef=useRef<HTMLDialogElement>(null);
  const reasonRef=useRef<HTMLDialogElement>(null);

  const show=(kind:'admission'|'trial'|'not-interested')=>{
    setOpen(kind);
    const dialog=kind==='admission'?admissionRef.current:kind==='trial'?trialRef.current:reasonRef.current;
    if(dialog&&!dialog.open)dialog.showModal();
  };
  const hide=useCallback(()=>{
    setOpen('');
    for(const ref of [admissionRef,trialRef,reasonRef])if(ref.current?.open)ref.current.close();
  },[]);

  if(!handoff)return null;
  const blocked=handoff.blockedAdmission||handoff.blockedTrial;
  const blockedTitle=(code:string)=>code==='ALREADY_CONVERTED'
    ?t('handoff.alreadyAdmission')
    :code==='ALREADY_BOOKED'?t('handoff.alreadyBooked')
    :code==='NO_PHONE'?t('handoff.noPhone'):'';

  return <>
    <div className="lead-handoff" data-lead-handoff="true">
      <h3>{t('handoffTitle')}</h3>
      <p className="admin-help">{t('handoffHint')}</p>
      <div className="overview-drawer-actions">
        <button type="button" className="admin-mini-button" data-handoff-open="admission"
          disabled={!!handoff.blockedAdmission}
          title={handoff.blockedAdmission?blockedTitle(handoff.blockedAdmission.code):undefined}
          onClick={()=>show('admission')}>
          <FilePlus2 size={15} aria-hidden="true"/>{t('handoffAdmission')}
        </button>
        <button type="button" className="admin-mini-button" data-handoff-open="trial"
          disabled={!!handoff.blockedTrial}
          title={handoff.blockedTrial?blockedTitle(handoff.blockedTrial.code):undefined}
          onClick={()=>show('trial')}>
          <CalendarCheck size={15} aria-hidden="true"/>{t('handoffTrial')}
        </button>
        <button type="button" className="admin-mini-button" data-handoff-open="not-interested"
          onClick={()=>show('not-interested')}>
          <XCircle size={15} aria-hidden="true"/>{t('handoffNotInterested')}
        </button>
      </div>
      {blocked&&<p className="admin-help" data-handoff-blocked="true">{t('handoffBlocked')}:
        {t(blocked.messageKey,Object.fromEntries(Object.entries(blocked.messageParams||{}).map(([k,v])=>[k,typeof v==='number'?formatNumber(v,digits):v])) as never)}</p>}
    </div>

    {/* 1 · Convert to admission. What the lead already knows is filled in; the rest is the operator's,
        and the phone is a mask because the server takes the number from the lead itself. */}
    <dialog className="lead-handoff-dialog" ref={admissionRef} aria-label={t('handoffAdmission')}
      data-handoff-dialog="admission" onClose={()=>setOpen(current=>current==='admission'?'':current)}>
      <AdmissionBody leadId={leadId} handoff={handoff} language={language} digits={digits}
        subjectLabels={subjectLabels} genders={genders} mediums={mediums} onClose={hide} onDone={onDone}/>
    </dialog>

    {/* 2 · Book a trial. The slot list is asked for when the dialog opens and again whenever the class
        or subject changes: a seat is a fact of the moment, and a list rendered an hour ago would offer
        classes that are already full or already past. */}
    <dialog className="lead-handoff-dialog" ref={trialRef} aria-label={t('handoffTrial')}
      data-handoff-dialog="trial" onClose={()=>setOpen(current=>current==='trial'?'':current)}>
      <TrialBody leadId={leadId} handoff={handoff} language={language} digits={digits}
        subjectLabels={subjectLabels} onClose={hide} onDone={onDone}/>
    </dialog>

    {/* 3 · Not interested — which the spec will not allow without saying why. */}
    <dialog className="lead-handoff-dialog" ref={reasonRef} aria-label={t('handoffNotInterested')}
      data-handoff-dialog="not-interested" onClose={()=>setOpen(current=>current==='not-interested'?'':current)}>
      <NotInterestedBody leadId={leadId} language={language} onClose={hide} onDone={onDone}/>
    </dialog>
  </>;
}

/** What all three dialogs share: the answer sentence, and the two buttons that end the dialog. */
function DialogFoot({state,language,pending,onClose}:{
  state:LeadFormState|null;language:'bn'|'en';pending:boolean;onClose:()=>void;
}){
  const t=useTranslations('leads');
  const message=leadFormMessage(state);
  const ok=state?.status==='ok';
  return <>
    {message&&<p className={ok?'admin-feedback':'admin-feedback error'} data-handoff-message={state?.status||'idle'}
      role="status">{message}</p>}
    <div className="overview-drawer-actions">
      <button type="submit" className="button button-navy" data-handoff-submit="true" disabled={pending}>
        {pending?t('loading'):t('handoffSave')}
      </button>
      <button type="button" className="admin-mini-button" data-handoff-close="true" onClick={onClose}>
        {t('handoffCancel')}
      </button>
    </div>
    {ok&&<p className="admin-help" data-handoff-done="true">{t('handoffDone')}</p>}
  </>;
}

function AdmissionBody({leadId,handoff,language,digits,subjectLabels,genders,mediums,onClose,onDone}:{
  leadId:string;handoff:LeadHandoffView;language:'bn'|'en';digits:Digits;
  subjectLabels:string[];genders:string[];mediums:string[];onClose:()=>void;onDone?:()=>void;
}){
  const t=useTranslations('leads');
  const f=useTranslations('forms');
  const prefill=handoff.admission;
  const [state,action,pending]=useActionState<LeadFormState|null,FormData>(submitLeadAdmission,null);
  const [courseType,setCourseType]=useState<typeof COURSE_TYPES[number]>('individual');
  const done=state?.status==='ok';
  useEffect(()=>{if(done&&onDone)onDone()},[done,onDone]);
  return <form action={action} className="lead-handoff-form">
    {/* A div, not a <header>: this dialog opens INSIDE the drawer, and the drawer's own header is how
        a screen closes it — a second landmark inside it would make that ambiguous. */}
    <div className="lead-handoff-head"><h2>{t('handoffAdmission')}</h2>
      <button type="button" className="admin-mini-button" onClick={onClose}>{t('handoffClose')}</button></div>
    <input type="hidden" name="id" value={leadId}/>
    <p className="admin-help">{language==='bn'
      ?t('handoff.prefillNote')
      :'What the lead already holds is filled in; complete the rest.'}</p>
    <label><span>{f('studentName')} *</span>
      <input className="admin-input" name="studentName" defaultValue={prefill.studentName} required minLength={2} maxLength={120}/></label>
    <label><span>{f('guardianName')} *</span>
      <input className="admin-input" name="guardianName" defaultValue={prefill.guardianName} required minLength={2} maxLength={120}/></label>
    <label><span>{t('handoffPhoneMask')}</span>
      {/* Read-only and masked: the operator can see a number is there, and cannot read it. */}
      <input className="admin-input" value={prefill.phoneMask} readOnly data-handoff-phone-mask="true"/>
      <small>{t('handoffPhoneNote')}</small></label>
    <label><span>{f('grade')} *</span>
      <select className="admin-select" name="grade" defaultValue={prefill.grade||'4'} data-handoff-grade="true">
        {HANDOFF_GRADES.map(grade=><option key={grade} value={grade}>{formatClass(grade,digits,language,t('colClass'))}</option>)}
      </select></label>
    <label><span>{f('school')} *</span>
      <input className="admin-input" name="school" defaultValue={prefill.school} required minLength={2} maxLength={160}/></label>
    <label><span>{f('dob')} *</span>
      <input className="admin-input" name="dob" type="date" required data-handoff-dob="true"/></label>
    <label><span>{f('gender')} *</span>
      <select className="admin-select" name="gender" defaultValue="prefer-not">
        {GENDERS.map((value,index)=><option key={value} value={value}>{genders[index]||value}</option>)}
      </select></label>
    <label><span>{f('relation')} *</span>
      <input className="admin-input" name="relation" defaultValue={t('handoff.relationDefault')} required minLength={2} maxLength={60}/></label>
    <label><span>{f('medium')} *</span>
      <select className="admin-select" name="medium" defaultValue="bangla">
        {MEDIUMS.map((value,index)=><option key={value} value={value}>{mediums[index]||value}</option>)}
      </select></label>
    <label><span>{f('previousResult')}</span>
      <input className="admin-input" name="previousResult" maxLength={200}/></label>
    <label><span>{f('courseType')} *</span>
      <select className="admin-select" name="courseType" value={courseType} data-handoff-course="true"
        onChange={event=>setCourseType(event.target.value as typeof COURSE_TYPES[number])}>
        {COURSE_TYPES.map(value=><option key={value} value={value}>{f(value)}</option>)}
      </select></label>
    {courseType==='individual'
      ?<fieldset data-handoff-subjects="true"><legend>{f('chooseSubjects')} *</legend>
        {subjectValues.map((value,index)=><label key={value} className="admin-check">
          <input type="checkbox" name="subjects" value={value}/>{subjectLabels[index]||value}</label>)}
      </fieldset>
      :<label><span>{f('packageName')} *</span>
        <input className="admin-input" name="packageName" minLength={2} maxLength={150}/></label>}
    <label><span>{f('email')}</span>
      <input className="admin-input" name="email" type="email" maxLength={160}/></label>
    <label className="admin-check"><input type="checkbox" name="consent" value="true" defaultChecked
      data-handoff-consent="true"/>{t('handoffConsent')}</label>
    <DialogFoot state={state} language={language} pending={pending} onClose={onClose}/>
  </form>;
}

function TrialBody({leadId,handoff,language,digits,subjectLabels,onClose,onDone}:{
  leadId:string;handoff:LeadHandoffView;language:'bn'|'en';digits:Digits;subjectLabels:string[];
  onClose:()=>void;onDone?:()=>void;
}){
  const t=useTranslations('leads');
  const f=useTranslations('forms');
  const prefill=handoff.trial;
  const [state,action,pending]=useActionState<LeadFormState|null,FormData>(submitLeadTrial,null);
  const [grade,setGrade]=useState(prefill.grade||HANDOFF_GRADES[0] as string);
  const [subject,setSubject]=useState<string>(subjectValues[0] as string);
  const [slots,setSlots]=useState<TrialSlotOption[]|null>(null);
  const [slotId,setSlotId]=useState('');
  const done=state?.status==='ok';
  useEffect(()=>{if(done&&onDone)onDone()},[done,onDone]);

  const load=useCallback(async()=>{
    setSlots(null);
    try{
      const rows=await loadLeadTrialSlots(grade,subject);
      setSlots(rows);
      setSlotId(rows[0]?.id||'');
    }catch{setSlots([])}
  },[grade,subject]);
  useEffect(()=>{void load()},[load]);

  const chosen=(slots||[]).find(slot=>slot.id===slotId)||null;
  return <form action={action} className="lead-handoff-form">
    {/* A div, not a <header>: this dialog opens INSIDE the drawer, and the drawer's own header is how
        a screen closes it — a second landmark inside it would make that ambiguous. */}
    <div className="lead-handoff-head"><h2>{t('handoffTrial')}</h2>
      <button type="button" className="admin-mini-button" onClick={onClose}>{t('handoffClose')}</button></div>
    <input type="hidden" name="id" value={leadId}/>
    <input type="hidden" name="grade" value={grade}/>
    <input type="hidden" name="subject" value={subject}/>
    <input type="hidden" name="studentName" value={prefill.studentName}/>
    {chosen&&<>
      <input type="hidden" name="slotId" value={chosen.id}/>
      <input type="hidden" name="slotStartAt" value={chosen.startAt}/>
      <input type="hidden" name="slotEndAt" value={chosen.endAt}/>
    </>}
    <label><span>{f('studentName')}</span>
      <input className="admin-input" value={prefill.studentName} readOnly/></label>
    <label><span>{t('handoffPhoneMask')}</span>
      <input className="admin-input" value={prefill.phoneMask} readOnly data-handoff-phone-mask="true"/>
      <small>{t('handoffPhoneNote')}</small></label>
    <div className="admin-inline">
      <label><span>{t('handoffGrade')}</span>
        <select className="admin-select" value={grade} data-handoff-grade="true"
          onChange={event=>setGrade(event.target.value)}>
          {HANDOFF_GRADES.map(value=><option key={value} value={value}>{formatClass(value,digits,language,t('colClass'))}</option>)}
        </select></label>
      <label><span>{t('handoffSubject')}</span>
        <select className="admin-select" value={subject} data-handoff-subject="true"
          onChange={event=>setSubject(event.target.value)}>
          {subjectValues.map((value,index)=><option key={value} value={value}>{subjectLabels[index]||value}</option>)}
        </select></label>
    </div>
    <fieldset className="lead-handoff-slots" data-handoff-slots="true">
      <legend>{t('handoffSlot')} *</legend>
      {slots===null&&<p className="admin-help" data-handoff-slots-loading="true">{t('handoffSlotLoading')}</p>}
      {slots!==null&&!slots.length&&<p className="admin-help" data-handoff-slots-empty="true">{t('handoffSlotNone')}</p>}
      {(slots||[]).map(slot=><label key={slot.id} className="admin-check">
        <input type="radio" name="slot" value={slot.id} checked={slotId===slot.id} onChange={()=>setSlotId(slot.id)}/>
        <span data-handoff-slot={slot.id}>{formatDate(slot.startAt,digits,language)} · {formatTime(slot.startAt,digits,language)}
          <small>{formatNumber(slot.seatsLeft,digits)} {t('handoffSeats')}</small></span>
      </label>)}
    </fieldset>
    <label className="admin-check"><input type="checkbox" name="consent" value="true" defaultChecked
      data-handoff-consent="true"/>{t('handoffConsent')}</label>
    <DialogFoot state={state} language={language} pending={pending||slots===null||!chosen} onClose={onClose}/>
  </form>;
}

function NotInterestedBody({leadId,language,onClose,onDone}:{
  leadId:string;language:'bn'|'en';onClose:()=>void;onDone?:()=>void;
}){
  const t=useTranslations('leads');
  const chips=[t('handoffReasons.elsewhere'),t('handoffReasons.timing'),t('handoffReasons.fee'),t('handoffReasons.notNeeded')];
  const [state,action,pending]=useActionState<LeadFormState|null,FormData>(submitLeadNotInterested,null);
  const [reason,setReason]=useState('');
  const boxRef=useRef<HTMLTextAreaElement>(null);
  const done=state?.status==='ok';
  useEffect(()=>{if(done&&onDone)onDone()},[done,onDone]);
  const trimmed=reason.trim();
  const short=trimmed.length>0&&trimmed.length<NOT_INTERESTED_REASON_MIN;
  return <form action={action} className="lead-handoff-form">
    {/* A div, not a <header>: this dialog opens INSIDE the drawer, and the drawer's own header is how
        a screen closes it — a second landmark inside it would make that ambiguous. */}
    <div className="lead-handoff-head"><h2>{t('handoffNotInterested')}</h2>
      <button type="button" className="admin-mini-button" onClick={onClose}>{t('handoffClose')}</button></div>
    <input type="hidden" name="id" value={leadId}/>
    <p className="admin-help">{t('handoffReasonHint')}</p>
    <div className="lead-handoff-chips">
      {chips.map(chip=><button type="button" key={chip} className="admin-badge" data-handoff-chip={chip}
        onClick={()=>{
          setReason(chip);
          const box=boxRef.current;
          if(box){box.focus();box.setSelectionRange(chip.length,chip.length)}
        }}>{chip}</button>)}
    </div>
    <label><span>{t('handoffReason')}</span>
      <textarea className="admin-input" name="reason" ref={boxRef} rows={3} required data-handoff-reason="true"
        minLength={NOT_INTERESTED_REASON_MIN} maxLength={NOT_INTERESTED_REASON_MAX}
        placeholder={t('handoffReasonPlaceholder')} value={reason} aria-invalid={short||undefined}
        onChange={event=>setReason(event.target.value)}/>
      <small>{formatNumber(trimmed.length,'en')}/{NOT_INTERESTED_REASON_MAX}</small></label>
    <DialogFoot state={state} language={language} pending={pending||short} onClose={onClose}/>
  </form>;
}
