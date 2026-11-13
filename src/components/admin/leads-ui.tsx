'use client';
/**
 * R3 wave B — the interactive half of the Visitors screens: quick-add, the search by number, a row's
 * controls and the detail drawer.
 *
 * Three rules shape this file:
 *
 *  1. No rule is decided here. The five follow-up buttons send a KEY, never a date, and
 *     `nextFollowUpDay()` in `src/lib/leads/vocab.ts` turns it into a Dhaka day; the status dropdown
 *     sends a value the vocabulary already contains and `updateLeadStatus()` owns "do not contact" being
 *     sticky. A screen that computed a date in the browser would disagree with the cron job by six hours.
 *  2. A number is never printed. Rows are handed `LeadPhoneView`s, which carry a mask plus the `tel:` and
 *     `wa.me` destinations the brief requires; the search answers with masks only, so nothing here can
 *     echo back the digits somebody typed.
 *  3. The space above the list stays empty. Quick-add and the search are two buttons until they are
 *     opened, the optional fields are behind a `<details>`, and Enter in the name field saves — the front
 *     desk writes a queue of people, so a saved lead clears the panel and puts the cursor back on the name.
 */
import {useActionState,useEffect,useRef,useState,type FormEvent} from 'react';
import {useTranslations} from 'next-intl';
import {Link,useRouter} from '@/i18n/navigation';
import {MessageCircle,Phone,Plus,Search,UserPlus} from 'lucide-react';
import {
  changeLeadStatus,chooseLeadFollowUp,liftContactBlock,loadLeadDetail,mergeTwoLeads,quickAddLead,
  searchLeadsByNumber,tieLeadFamilies,writeLeadNote,
} from '@/actions/leads';
import {
  FOLLOW_UP_CLEAR,FOLLOW_UP_KEYS,LEAD_NOTE_OUTCOME_OPTIONS,LEAD_SOURCE_OPTIONS,LEAD_STATUS_OPTIONS,
  followUpBadge,followUpLabel,groupLabel,idleLeadForm,leadFormMessage,mediumLabel,noteOutcomeLabel,
  shiftLabel,sourceLabel,statusBadge,statusLabel,
  type LeadDetailView,type LeadDrawerSeed,type LeadFormState,type LeadListFiltersShape,type LeadPhoneView,
  type LeadRowView,type LeadSearchActionState,type LeadSearchHitView,
} from '@/lib/leads/lead-ui';
import {leadListQuery} from '@/lib/leads/vocab';
import SmsDialogTrigger from './sms-dialog-trigger';
import type {LeadSmsKit} from '@/lib/leads/lead-sms';
import {formatClass,formatDate,formatNumber,formatTime,type Digits} from '@/lib/admin/format';

const IDLE_SEARCH:LeadSearchActionState={status:'idle',hits:[],total:0,masked:'',messageBn:'',messageEn:''};

/** The quick-add panel: four fields is a complete lead, everything else is behind "more". */
export function LeadQuickAdd({open=false,language='bn',digits='bn'}:{open?:boolean;language?:'bn'|'en';digits?:Digits}){
  const t=useTranslations('leads');
  const [state,action,pending]=useActionState(quickAddLead,idleLeadForm);
  const [expanded,setExpanded]=useState(open),[more,setMore]=useState(false),[followUp,setFollowUp]=useState('');
  const formRef=useRef<HTMLFormElement>(null),nameRef=useRef<HTMLInputElement>(null);
  // `?new=1` — what the mobile bottom bar's plus links to — opens the panel on arrival.
  useEffect(()=>{if(open)setExpanded(true)},[open]);
  useEffect(()=>{
    if(!expanded)return;
    const timer=setTimeout(()=>nameRef.current?.focus(),80);
    return ()=>clearTimeout(timer);
  },[expanded]);
  // Saved: empty the panel and start the next visitor. The message keeps the id that was written.
  useEffect(()=>{
    if(state.status!=='ok')return;
    formRef.current?.reset();setFollowUp('');nameRef.current?.focus();
  },[state]);
  if(!expanded){
    return <button type="button" className="button button-navy" onClick={()=>setExpanded(true)}><UserPlus size={18} aria-hidden="true"/>{t('add')}</button>;
  }
  return <section className="admin-panel" aria-label={t('addTitle')}>
    <div className="admin-panel-head"><h2>{t('addTitle')}</h2><button type="button" className="admin-mini-button" onClick={()=>setExpanded(false)}>{t('close')}</button></div>
    <form ref={formRef} action={action} className="admin-panel-body list-filter">
      <label>{t('studentName')}<input ref={nameRef} className="admin-input" name="studentName" required maxLength={120} autoComplete="off"/></label>
      <label>{t('phone')}
        <input className="admin-input" name="phone" type="text" inputMode="tel" autoComplete="off" aria-describedby="lead-quick-phone"/>
        <small id="lead-quick-phone" className="admin-help">{t('phoneHint')}</small>
      </label>
      <label>{t('classLabel')}
        <input className="admin-input" name="classLabel" maxLength={60} autoComplete="off" aria-describedby="lead-quick-class"/>
        <small id="lead-quick-class" className="admin-help">{t('classHint')}</small>
      </label>
      <label>{t('school')}<input className="admin-input" name="school" maxLength={160} autoComplete="off"/></label>
      <button type="button" className="admin-mini-button" aria-expanded={more} onClick={()=>setMore(value=>!value)}>{t('fields')} <span aria-hidden="true">{more?'−':'＋'}</span></button>
      {more&&<>
        <label>{t('guardianName')}<input className="admin-input" name="guardianName" maxLength={120} autoComplete="off"/></label>
        <label>{t('interestedIn')}<input className="admin-input" name="interestedIn" maxLength={200} autoComplete="off"/></label>
        <label>{t('source')}<select className="admin-select" name="source" defaultValue="walk_in">{LEAD_SOURCE_OPTIONS.map(option=><option key={option} value={option}>{sourceLabel(option,language)}</option>)}</select></label>
        <label>{t('status')}<select className="admin-select" name="status" defaultValue="new">{LEAD_STATUS_OPTIONS.map(option=><option key={option} value={option}>{statusLabel(option,language)}</option>)}</select></label>
        <label>{t('nextFollowUp')}
          <select className="admin-select" name="followUp" value={followUp} onChange={event=>setFollowUp(event.target.value)}>
            <option value="">{t('followUpNone')}</option>
            {FOLLOW_UP_KEYS.map(option=><option key={option} value={option}>{followUpLabel(option,language)}</option>)}
          </select>
        </label>
        {followUp==='custom'&&<label>{t('customDay')}<input className="admin-input" name="customDay" type="date"/></label>}
        <label>{t('note')}<input className="admin-input" name="note" maxLength={1000} autoComplete="off"/></label>
      </>}
      {/* R3.10: the number typed is already on the list. The form keeps what was typed — nothing is reset
          until a save succeeds — and the three answers are three submit buttons, so the choice travels in
          the same post as the fields it applies to and never as a second round trip. */}
      {state.status==='dup'&&<div className="lead-dup" role="alert" data-dup-ask="true">
        <p className="admin-feedback error">{leadFormMessage(state,language)}</p>
        <ul className="lead-notes lead-family">{(state.holders||[]).map(holder=><li key={holder.id}>
          <strong>{holder.studentName}</strong>{' '}
          <span className="admin-help">{holder.leadId} · {statusLabel(holder.status,language)} · {formatDate(holder.date,digits,language)}</span>{' '}
          <span className="admin-badge">{holder.masked}</span>
          <button type="submit" name="dupMerge" value={holder.id} className="admin-mini-button" disabled={pending}>{t('dupMergeInto',{name:holder.studentName})}</button>
        </li>)}</ul>
        <div className="lead-form-foot">
          <button type="submit" name="dupChoice" value="sibling" className="admin-mini-button" disabled={pending}>{t('dupSibling')}</button>
          <button type="submit" name="dupChoice" value="separate" className="admin-mini-button" disabled={pending}>{t('dupSeparate')}</button>
        </div>
      </div>}
      <div className="lead-form-foot">
        <button type="submit" className="button button-navy" disabled={pending}><Plus size={18} aria-hidden="true"/>{pending?t('loading'):t('saveAnother')}</button>
        <p className="admin-help">{t('enterSaves')}</p>
        {state.status!=='idle'&&state.status!=='dup'&&<p role="status" className={`admin-feedback ${state.status==='ok'?'':'error'}`}>{leadFormMessage(state,language)}</p>}
      </div>
    </form>
  </section>;
}

/** One search hit is enough of a lead to open the same drawer a list row opens. */
function seedOf(hit:LeadSearchHitView):LeadDrawerSeed{
  return {
    id:hit.id,leadId:hit.leadId,studentName:hit.studentName,guardianName:hit.guardianName,date:hit.date,
    phones:hit.phones,classLabel:hit.classLabel,classGroup:hit.classGroup,school:hit.school,status:hit.status,
    doNotContact:hit.doNotContact,contactable:hit.contactable,nextFollowUp:hit.nextFollowUp,followUp:hit.followUp,
  };
}

function ContactLinks({phones}:{phones:LeadPhoneView[]}){
  const t=useTranslations('leads');
  if(!phones.length)return <span className="admin-help">{t('noPhone')}</span>;
  return <span className="overview-row-actions">
    {phones.map((phone,index)=><span key={index} className="admin-inline">
      <span className="admin-badge">{phone.masked}</span>
      <a className="admin-mini-button" href={phone.tel}><Phone size={15} aria-hidden="true"/>{t('call')}</a>
      <a className="admin-mini-button" href={phone.whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={15} aria-hidden="true"/>{t('whatsapp')}</a>
    </span>)}
  </span>;
}

/**
 * ONE search box with two destinations, because the two kinds of text may travel differently.
 *
 * A name, a school or a lead id is safe in a URL — that is what makes a filtered list shareable between
 * two admins — so it is pushed as a query parameter. Anything phone-shaped is refused by
 * `leadListQuery()`, the same function that builds the href, and instead posts to a server action: the
 * digits live in one request body and in no address bar, no history entry, no `Referer` and no access
 * log. The answer comes back masked, so nothing echoes the search into a place it could be copied from.
 */
export function LeadSearch({language='bn',digits='bn',current}:{language?:'bn'|'en';digits?:Digits;current:LeadListFiltersShape}){
  const t=useTranslations('leads');
  const router=useRouter();
  const [state,action,pending]=useActionState(searchLeadsByNumber,IDLE_SEARCH);
  const [open,setOpen]=useState(false);
  const inputRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    if(!open)return;
    const timer=setTimeout(()=>inputRef.current?.focus(),80);
    return ()=>clearTimeout(timer);
  },[open]);
  function onSubmit(event:FormEvent<HTMLFormElement>){
    const typed=(inputRef.current?.value||'').trim();
    // The typed text goes in last, so it wins over whatever `q` the page arrived with.
    const target=leadListQuery({locale:'bn',...current,q:typed});
    if(target.numberShaped)return; // let the form post to the action and answer it there
    event.preventDefault();
    // Only a word search reaches this line, and a word search navigates — so folding the panel away here
    // cannot take a posted number search with it. It once did: `preventDefault()` was called before the
    // decision had been made, React runs this handler before the one that dispatches a form action, and
    // stopping the submit stopped the action too.
    //
    // And it only navigates when there is somewhere to go. An empty box builds the URL the address bar
    // already holds, and pushing that folded the panel away with nothing answered — which is what an
    // operator meets if the box was cleared for them (React resets a form when its action commits, so the
    // search that just answered empties it) and they press search again. Nothing typed and nothing
    // filtered now leaves the box exactly where it is.
    const here=new URL(window.location.href);
    const there=new URL(target.href,here.origin);
    if(here.pathname===there.pathname&&here.search===there.search)return;
    setOpen(false);
    router.push(target.href.replace(/^\/bn/,''));
  }
  if(!open){
    return <button type="button" className="admin-mini-button" onClick={()=>setOpen(true)}><Search size={18} aria-hidden="true"/>{t('search')}</button>;
  }
  const refused=state.status==='refused'||state.status==='error'||state.status==='unauthorized';
  const message=state.status==='idle'?'':(language==='bn'?state.messageBn:state.messageEn);
  return <section className="admin-panel" aria-label={t('search')}>
    <div className="admin-panel-head"><h2>{t('search')}</h2><button type="button" className="admin-mini-button" onClick={()=>setOpen(false)}>{t('close')}</button></div>
    <form action={action} onSubmit={onSubmit} className="admin-panel-body list-filter">
      <label>{t('filterText')}
        <input ref={inputRef} className="admin-input" name="phone" type="text" inputMode="text" autoComplete="off" defaultValue={current.q||''} aria-describedby="lead-search-help"/>
        <small id="lead-search-help" className="admin-help">{t('searchNumberHelp')}</small>
      </label>
      <div className="lead-form-foot">
        <button type="submit" className="button button-navy" disabled={pending}><Search size={18} aria-hidden="true"/>{pending?t('loading'):t('search')}</button>
        {state.status==='found'&&<span className="admin-badge">{t('totalLeads',{count:formatNumber(state.total,digits)})}</span>}
        {message&&<p role="status" className={`admin-feedback ${refused?'error':''}`}>{message}</p>}
      </div>
    </form>
    {state.status==='found'&&<div className="admin-panel-body"><div className="admin-table-wrap"><table className="admin-table admin-responsive-table">
      <caption className="admin-help">{t('searchResults')}</caption>
      <thead><tr><th>{t('colVisitor')}</th><th>{t('colContact')}</th><th>{t('colStatus')}</th><th>{t('colActions')}</th></tr></thead>
      <tbody>{state.hits.map(hit=><tr key={hit.id}>
        <td data-label={t('colVisitor')}><div><strong>{hit.studentName}</strong><br/><span className="admin-help">{hit.leadId}{hit.classGroup?` · ${formatClass(hit.classGroup,digits,language)}`:hit.classLabel?` · ${hit.classLabel}`:''}</span></div></td>
        <td data-label={t('colContact')}><div><ContactLinks phones={hit.phones}/></div></td>
        <td data-label={t('colStatus')}><div><span className={`admin-badge ${statusBadge(hit.status)}`}>{statusLabel(hit.status,language)}</span>{hit.followUp!=='none'&&hit.nextFollowUp&&<span className={`admin-badge ${followUpBadge(hit.followUp)}`}>{formatDate(hit.nextFollowUp,digits,language)}</span>}</div></td>
        <td data-label={t('colActions')}><div className="list-row-actions"><LeadDetailDrawer seed={seedOf(hit)} language={language} digits={digits}/></div></td>
      </tr>)}</tbody>
    </table></div></div>}
  </section>;
}

/**
 * A row's controls: the inline status dropdown, the five quick follow-up buttons plus "clear", and the
 * deliberate action that lifts a do-not-contact block. The buttons send keys, not dates.
 */
export function LeadRowControls({row,language='bn'}:{row:LeadRowView;language?:'bn'|'en'}){
  const t=useTranslations('leads');
  const [statusState,statusAction,statusPending]=useActionState(changeLeadStatus,idleLeadForm);
  const [followState,followAction,followPending]=useActionState(chooseLeadFollowUp,idleLeadForm);
  const [liftState,liftAction,liftPending]=useActionState(liftContactBlock,idleLeadForm);
  const busy=statusPending||followPending||liftPending;
  const states=[statusState,followState,liftState];
  const message=states.map(state=>leadFormMessage(state,language)).filter(Boolean).pop()||'';
  const failed=states.some(state=>state.status==='error');
  return <div className="lead-row">
    <form action={statusAction} className="list-row-actions">
      <input type="hidden" name="id" value={row.id}/>
      <label className="admin-help" htmlFor={`lead-status-${row.id}`}>{t('colStatus')}</label>
      <select id={`lead-status-${row.id}`} className="admin-select" name="status" defaultValue={row.status}>
        {LEAD_STATUS_OPTIONS.map(option=><option key={option} value={option}>{statusLabel(option,language)}</option>)}
      </select>
      <button type="submit" className="admin-mini-button" disabled={busy}>{t('save')}</button>
    </form>
    <form action={followAction} className="list-row-actions">
      <input type="hidden" name="id" value={row.id}/>
      {FOLLOW_UP_KEYS.filter(key=>key!=='custom').map(key=><button key={key} type="submit" name="followUp" value={key} className="admin-mini-button" disabled={busy}>{followUpLabel(key,language)}</button>)}
      <input className="admin-input" type="date" name="customDay" aria-label={t('customDay')}/>
      <button type="submit" name="followUp" value="custom" className="admin-mini-button" disabled={busy}>{followUpLabel('custom',language)}</button>
      <button type="submit" name="followUp" value={FOLLOW_UP_CLEAR} className="admin-mini-button" disabled={busy}>{followUpLabel(FOLLOW_UP_CLEAR,language)}</button>
    </form>
    {row.doNotContact&&<form action={liftAction} className="list-row-actions">
      <input type="hidden" name="id" value={row.id}/>
      <input type="hidden" name="allowed" value="true"/>
      <span className="admin-help">{t('blockedHelp')}</span>
      <button type="submit" className="admin-mini-button" disabled={busy}>{t('allowContact')}</button>
    </form>}
    {message&&<p role="status" className={`admin-feedback ${failed?'error':''}`}>{message}</p>}
  </div>;
}

/**
 * The drawer's contents, shared with the lead's own page: fields, the numbers as masks plus their dial
 * destinations, the flags the importer or quick-add left behind, the notes timeline and the family.
 */
function LeadDetailBody({seed,detail,loading,noteState,noteAction,notePending,reload,language,digits,sms=null}:{
  seed:LeadDrawerSeed;detail:LeadDetailView|null;loading:boolean;noteState:LeadFormState;
  noteAction:(payload:FormData)=>void;notePending:boolean;reload:()=>void;language:'bn'|'en';digits:Digits;
  /**
   * Present only where the screen loaded the visitor template catalog (R3.9). Absent means no Send SMS
   * here at all — the drawer a NUMBER SEARCH opens is a lookup of somebody else's family, not a place to
   * start a send, and it does not carry the catalog.
   */
  sms?:LeadSmsKit|null;
}){
  const t=useTranslations('leads');
  const [mergeState,mergeAction,mergePending]=useActionState(mergeTwoLeads,idleLeadForm);
  const [tieState,tieAction,tiePending]=useActionState(tieLeadFamilies,idleLeadForm);
  // A merge or a tie changes this very drawer (family, notes, numbers), so it is read again after one.
  useEffect(()=>{
    if(mergeState.status!=='ok'&&tieState.status!=='ok')return;
    reload();
  },[mergeState,tieState,reload]);
  function confirmMerge(event:FormEvent<HTMLFormElement>){
    if(!window.confirm(t('dupMergeConfirm')))event.preventDefault();
  }
  const row=detail?.row;
  const phones=row?.phones||seed.phones;
  const classText=row?.classGroup?formatClass(row.classGroup,digits,language):(row?.classLabel||seed.classLabel||'');
  const fields:[string,string][]=[
    [t('leadId'),seed.leadId],
    [t('date'),formatDate(seed.date,digits,language)],
    [t('guardianName'),row?.guardianName||seed.guardianName||''],
    [t('classLabel'),classText],
    [t('school'),row?.school||seed.school||''],
    [t('group'),row?groupLabel(row.group,language):''],
    [t('shift'),row?shiftLabel(row.shift,language):''],
    [t('medium'),row?mediumLabel(row.medium,language):''],
    [t('source'),row?sourceLabel(row.source,language):''],
    [t('interestedIn'),row?.interestedIn||''],
    [t('colStatus'),statusLabel(seed.status,language)],
    [t('nextFollowUp'),seed.nextFollowUp?formatDate(seed.nextFollowUp,digits,language):t('followUpNone')],
  ];
  return <>
    <div className="overview-drawer-actions">
      {phones.length?phones.map((phone,index)=><span key={index} className="admin-inline">
        {/* The mask is what is printed; the number itself exists only as a dial or WhatsApp destination. */}
        <span className="admin-badge">{phone.masked}</span>
        <a className="admin-mini-button" href={phone.tel}><Phone size={15} aria-hidden="true"/>{t('call')}</a>
        <a className="admin-mini-button" href={phone.whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={15} aria-hidden="true"/>{t('whatsapp')}</a>
      </span>):<span className="admin-help">{t('noPhone')}</span>}
      <Link className="admin-mini-button" href={`/admin/leads/${seed.id}`}>{t('fields')}</Link>
      {/* Send SMS (R3.9), offered only for a visitor who may be contacted. The rule is not decided here:
          `canContact()` set `contactable` when the row was read and the send pipeline checks it again when
          the plan is built, so this button hiding is a courtesy, never the gate. */}
      {sms&&seed.contactable!==false&&!seed.doNotContact&&<SmsDialogTrigger
        request={{source:'lead',id:seed.id}}
        templates={sms.templates}
        institutePhone={sms.institutePhone}
        titleBn={t('smsOneTitle')}
        titleEn="SMS this visitor"
        labelBn={t('smsLabel')}
        labelEn="Send SMS"
        defaultTemplateKey="visitor_thanks"
        en={language==='en'}
      />}
    </div>
    {seed.doNotContact&&<p className="admin-feedback error">{t('doNotContact')} — {t('blockedHelp')}</p>}
    <dl>{fields.filter(([,value])=>value).map(([label,value],index)=><div key={index}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {!!(row?.flags||[]).length&&<><h3>{t('flags')}</h3>{/* The flag's own sentence, never the raw cell it quotes: a cell can hold a second valid number. */}
      {row!.flags.map((flag,index)=><p key={index} className="lead-flag">{language==='bn'?flag.messageBn:flag.messageEn}</p>)}</>}
    <h3>{t('notes')}</h3>
    {loading&&<p className="admin-help" role="status">{t('loading')}</p>}
    {!loading&&detail&&<ul className="lead-notes">{detail.notes.length?detail.notes.map((note,index)=><li key={index}>
      <small><time dateTime={note.at.toISOString()}>{formatDate(note.at,digits,language)} · {formatTime(note.at,digits,language)}</time>{note.byName?` · ${note.byName}`:''}{note.outcome?` · ${noteOutcomeLabel(note.outcome,language)}`:''}</small>
      {note.text}
    </li>):<li className="admin-help">{t('noNotes')}</li>}</ul>}
    <form action={noteAction} className="list-filter">
      <input type="hidden" name="id" value={seed.id}/>
      <label>{t('noteText')}<input className="admin-input" name="text" required maxLength={1000} autoComplete="off"/></label>
      <label>{t('noteOutcome')}
        <select className="admin-select" name="outcome" defaultValue="">
          <option value="">—</option>
          {LEAD_NOTE_OUTCOME_OPTIONS.map(option=><option key={option} value={option}>{noteOutcomeLabel(option,language)}</option>)}
        </select>
      </label>
      <div className="lead-form-foot">
        <button type="submit" className="admin-mini-button" disabled={notePending}>{notePending?t('loading'):t('addNote')}</button>
        {noteState.status!=='idle'&&<p role="status" className={`admin-feedback ${noteState.status==='ok'?'':'error'}`}>{leadFormMessage(noteState,language)}</p>}
      </div>
    </form>
    {!!(detail?.family||[]).length&&<><h3>{t('family')}</h3>{/* Its own class beside `lead-notes`: the timeline and the family are two lists, and a test (or a stylesheet) that means one of them must be able to say which. */}<ul className="lead-notes lead-family">{detail!.family.map(member=><li key={member.id}>
      <Link href={`/admin/leads/${member.id}`}>{member.studentName}</Link> <span className="admin-help">{member.leadId} · {statusLabel(member.status,language)}</span>
    </li>)}</ul></>}
    {/* R3.10: leads outside the family that hold one of this lead's numbers. Two deliberate answers:
        tie them into one family (both leads stay), or fold the other one into this one (it is binned,
        behind the browser's own confirm). Neither is offered for a lead already in the family list. */}
    {!!(detail?.dupMates||[]).length&&<><h3>{t('dupMatesTitle')}</h3>
      <ul className="lead-notes lead-family" data-dup-mates="true">{detail!.dupMates.map(mate=><li key={mate.id}>
        <strong>{mate.studentName}</strong> <span className="admin-help">{mate.leadId} · {statusLabel(mate.status,language)}</span> <span className="admin-badge">{mate.masked}</span>
        <span className="admin-inline">
          <form action={tieAction} className="admin-inline">
            <input type="hidden" name="id" value={seed.id}/><input type="hidden" name="otherId" value={mate.id}/>
            <button type="submit" className="admin-mini-button" disabled={mergePending||tiePending}>{t('dupTie')}</button>
          </form>
          <form action={mergeAction} className="admin-inline" onSubmit={confirmMerge}>
            <input type="hidden" name="targetId" value={seed.id}/><input type="hidden" name="sourceId" value={mate.id}/>
            <button type="submit" className="admin-mini-button" disabled={mergePending||tiePending}>{t('dupMerge')}</button>
          </form>
        </span>
      </li>)}</ul>
      {(mergeState.status!=='idle'||tieState.status!=='idle')&&<p role="status" className={`admin-feedback ${mergeState.status==='error'||tieState.status==='error'?'error':''}`}>{leadFormMessage(mergeState,language)||leadFormMessage(tieState,language)}</p>}
    </>}
  </>;
}

/**
 * One lead's contents and the note form, for both the drawer and the lead's own page. A list row opens it
 * with only what the row already has and the rest loads when it opens, so twenty rows do not cost twenty
 * queries; the page passes `initial` and it is there immediately.
 */
function useLeadDetail(seed:LeadDrawerSeed,initial:LeadDetailView|null){
  const [detail,setDetail]=useState<LeadDetailView|null>(initial);
  const [loading,setLoading]=useState(false);
  const [noteState,noteAction,notePending]=useActionState(writeLeadNote,idleLeadForm);
  async function load(){
    if(detail)return;
    setLoading(true);
    setDetail(await loadLeadDetail(seed.id));
    setLoading(false);
  }
  // A note that was just written has to appear in the timeline, so the detail is read again after one.
  useEffect(()=>{
    if(noteState.status!=='ok')return;
    reload();
  },[noteState,seed.id]);// eslint-disable-line react-hooks/exhaustive-deps
  function reload(){
    setLoading(true);
    void loadLeadDetail(seed.id).then(loaded=>{if(loaded)setDetail(loaded);setLoading(false)});
  }
  return {detail,loading,load,reload,noteState,noteAction,notePending};
}

/** The detail drawer: the same `<dialog>` sheet the admissions and bookings rows already open. */
export function LeadDetailDrawer({seed,initial=null,autoOpen=false,language='bn',digits='bn',sms=null}:{
  seed:LeadDrawerSeed;initial?:LeadDetailView|null;autoOpen?:boolean;language?:'bn'|'en';digits?:Digits;sms?:LeadSmsKit|null;
}){
  const t=useTranslations('leads');
  const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const {detail,loading,load,reload,noteState,noteAction,notePending}=useLeadDetail(seed,initial);
  function openDialog(){dialog.current?.showModal();void load()}
  useEffect(()=>{if(autoOpen)openDialog()},[]);// eslint-disable-line react-hooks/exhaustive-deps
  return <>
    <button ref={trigger} type="button" className="admin-mini-button" onClick={openDialog}>{t('detail')}</button>
    <dialog className="overview-drawer" ref={dialog} aria-label={t('fields')} onClose={()=>trigger.current?.focus()}>
      <header><h2>{seed.studentName}</h2><button type="button" className="admin-mini-button" onClick={()=>dialog.current?.close()}>{t('close')}</button></header>
      <p className="admin-help">{t('leadId')} {seed.leadId}</p>
      <LeadDetailBody seed={seed} detail={detail} loading={loading} noteState={noteState} noteAction={noteAction} notePending={notePending} reload={reload} language={language} digits={digits} sms={sms}/>
    </dialog>
  </>;
}

/** The lead's own page: the same contents, inline, so a printed sheet or an audit row can be followed. */
export function LeadDetailInline({seed,initial,language='bn',digits='bn',sms=null}:{
  seed:LeadDrawerSeed;initial:LeadDetailView|null;language?:'bn'|'en';digits?:Digits;sms?:LeadSmsKit|null;
}){
  const {detail,loading,reload,noteState,noteAction,notePending}=useLeadDetail(seed,initial);
  return <LeadDetailBody seed={seed} detail={detail} loading={loading} noteState={noteState} noteAction={noteAction} notePending={notePending} reload={reload} language={language} digits={digits} sms={sms}/>;
}
