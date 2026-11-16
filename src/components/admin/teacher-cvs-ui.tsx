'use client';
/**
 * R4 · The teacher CV bank's client half: quick add, the candidate drawer, the SMS picker.
 *
 * The pages are server components and query nothing; this file is where an operator's hands are. Three
 * decisions shape it:
 *
 *  1. **The reading is shown while it is typed, and the words are kept.** The quick-add subject field runs
 *     the same best-effort parser the import wizard uses (`lib/teachers/subjects`, pure, so a client
 *     component may import it) and prints the chips it suggests beside the sentence as written. Nothing is
 *     replaced: the form posts `subjectsText` exactly as typed plus the suggested subjects and classes, and
 *     a word the parser could not settle is printed as a tag suggestion rather than dropped.
 *  2. **A number is printed as a mask and exists only as a dial destination.** Rows hold
 *     `{masked,tel,whatsapp}` — see `lib/teachers/cv-ui.ts` — so this file could not paint a full number
 *     even by accident. The `tel:` and `wa.me` hrefs are the brief's own requirement.
 *  3. **The drawer writes through the actions, then re-reads.** Every write answers with one sentence in
 *     the operator's language; a timeline note, a hire or an interview change re-reads the CV so what is on
 *     screen is what is stored, not what the form hoped for.
 */
import {createContext,useActionState,useCallback,useContext,useEffect,useMemo,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {useTranslations} from 'next-intl';
import {Link} from '@/i18n/navigation';
import {Download,FileText,MessageCircle,Phone,Plus,UserPlus} from 'lucide-react';
import {
  addCvNote,hireCv,quickAddCv,reloadCvDetail,removeTeachingNeed,saveCvFields,saveTeachingNeed,
  setCvInterview,setTeachingNeedFilled,
} from '@/actions/teacher-cvs';
import {
  idleCvFormState,outcomeLabel,ratingBadge,ratingLabel,sourceLabel,statusBadge,statusLabel,subjectLabel,
  shiftLabel,type CandidateDetailView,type CandidateRowView,type CvFormState,
} from '@/lib/teachers/cv-ui';
import {readAvailability,readSalary,readSubjectsText} from '@/lib/teachers/subjects';
import {
  TEACHER_CLASS_LEVELS,TEACHER_NOTE_OUTCOMES,TEACHER_RATINGS,TEACHER_SHIFTS,TEACHER_SOURCES,
  TEACHER_STATUSES,TEACHER_SUBJECTS,
} from '@/lib/teachers/vocab';
import type {TeacherSmsKit} from '@/lib/teachers/cv-sms';
import {formatDate,formatNumber,type Digits} from '@/lib/admin/format';
import SmsDialogTrigger from './sms-dialog-trigger';
import {DeleteRow} from './delete-row';

/** What a list row hands the drawer before it has read anything: an id and the two words on the row. */
export interface CvDrawerSeed{id:string;candidateId:string;name:string}

/** `2026-02-14T09:30:00.000Z` → the value a `datetime-local` input shows, in the browser's own zone. */
function toLocalInput(iso:string):string{
  if(!iso)return '';
  const at=new Date(iso);
  if(Number.isNaN(at.getTime()))return '';
  const pad=(value:number)=>String(value).padStart(2,'0');
  return `${at.getFullYear()}-${pad(at.getMonth()+1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * One file, uploaded to Cloudinary before the form is posted.
 *
 * The CV row stores a URL and a public id and nothing else, so the browser hands the bytes to the upload
 * route (which checks the magic bytes, strips a photo's EXIF and refuses anything over 5 MB) and the form
 * carries the two strings back. A storage that is not configured answers 503 and the field says so without
 * blocking the save: a CV with no file attached is still a CV worth calling.
 */
export function CvFileField({name,kind,label,hint}:{name:string;kind:'cv'|'photo';label:string;hint:string}){
  const t=useTranslations('teacherCvs');
  const [url,setUrl]=useState(''),[publicId,setPublicId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const input=useRef<HTMLInputElement>(null);
  async function upload(file:File):Promise<void>{
    setBusy(true);setError('');
    try{
      const body=new FormData();
      body.set('file',file);
      body.set('kind',kind);
      const answer=await fetch('/api/admin/teacher-cvs/upload',{method:'POST',body:body});
      const json=await answer.json() as {ok?:boolean;url?:string;publicId?:string;error?:string};
      if(answer.ok&&json.ok&&json.url&&json.publicId){setUrl(json.url);setPublicId(json.publicId);return}
      const code=String(json.error||'');
      setError(code==='too_large'?t('errors.FILE_TOO_LARGE'):code==='invalid'?t('errors.BAD_FILE_TYPE'):t('errors.UPLOAD_FAILED'));
    }catch{setError(t('errors.UPLOAD_FAILED'))}
    finally{setBusy(false)}
  }
  return <label className="cv-file">
    <span>{label}</span>
    <input ref={input} type="file" accept={kind==='cv'?'.pdf,image/png,image/jpeg,image/webp':'image/png,image/jpeg,image/webp'}
      disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file)}}/>
    <small className="admin-help">{hint}</small>
    {busy&&<small className="admin-help" role="status">{t('loading')}</small>}
    {error&&<small className="admin-feedback error" role="alert">{error}</small>}
    {url&&<small className="admin-help" data-cv-file-saved=""><a href={url} target="_blank" rel="noreferrer">{kind==='cv'?t('drawer.cvPreview'):t('drawer.photoAlt')}</a> · {t('fields.fileStored')}</small>}
    <input type="hidden" name={name} value={url}/>
    <input type="hidden" name={`${name==='cvFile'?'cvPublicId':'photoPublicId'}`} value={publicId}/>
  </label>;
}

/** The quick add: name, number, subjects, classes, university and an optional file. Enter saves. */
export function CvQuickAdd({open=false,digits='bn',language='bn'}:{open?:boolean;digits?:Digits;language?:'bn'|'en'}){
  const t=useTranslations('teacherCvs');
  const [state,action,pending]=useActionState(quickAddCv,idleCvFormState());
  const [expanded,setExpanded]=useState(open),[more,setMore]=useState(false);
  const [subjectsText,setSubjectsText]=useState(''),[availabilityText,setAvailabilityText]=useState(''),[salaryText,setSalaryText]=useState('');
  const formRef=useRef<HTMLFormElement>(null),nameRef=useRef<HTMLInputElement>(null);
  /* React resets a form when its server action commits — including the commit that ASKS the duplicate
     question, which would erase what the operator typed before they could answer it. The typing is
     snapshotted here (never served) and poured back when the question arrives. */
  const snapshot=useRef<Record<string,string>>({});
  const subjects=useMemo(()=>readSubjectsText(subjectsText),[subjectsText]);
  const free=useMemo(()=>readAvailability(availabilityText),[availabilityText]);
  const pay=useMemo(()=>readSalary(salaryText),[salaryText]);
  useEffect(()=>{if(open)setExpanded(true)},[open]);
  useEffect(()=>{
    if(!expanded)return;
    const timer=setTimeout(()=>nameRef.current?.focus(),80);
    return ()=>clearTimeout(timer);
  },[expanded]);
  useEffect(()=>{
    if(state.status!=='ok')return;
    formRef.current?.reset();setSubjectsText('');setAvailabilityText('');setSalaryText('');snapshot.current={};
    nameRef.current?.focus();
  },[state]);
  useEffect(()=>{
    if(state.status!=='dup')return;
    const form=formRef.current;
    if(!form)return;
    for(const [key,value] of Object.entries(snapshot.current)){
      const field=form.querySelector<HTMLInputElement>(`input[name="${key}"],select[name="${key}"],textarea[name="${key}"]`);
      if(field)field.value=value;
    }
  },[state]);
  const capture=(event:FormEvent<HTMLFormElement>)=>{
    snapshot.current=Object.fromEntries([...new FormData(event.currentTarget).entries()].map(([key,value])=>[key,String(value)]));
  };
  if(!expanded){
    return <button type="button" className="button button-navy" onClick={()=>setExpanded(true)}><UserPlus size={18} aria-hidden="true"/>{t('add')}</button>;
  }
  return <section className="admin-panel" aria-label={t('addTitle')} data-cv-quick-add="">
    <div className="admin-panel-head">
      <h2>{t('addTitle')}</h2>
      <button type="button" className="admin-mini-button" onClick={()=>setExpanded(false)}>{t('close')}</button>
    </div>
    <form ref={formRef} action={action} onSubmit={capture} className="admin-panel-body list-filter">
      <p className="admin-help cv-form-hint">{t('addHint')}</p>
      <label>{t('fields.name')}
        <input ref={nameRef} className="admin-input" name="name" required maxLength={120} autoComplete="off" data-cv-name=""/>
      </label>
      <label>{t('fields.phone')}
        <input className="admin-input" name="phone" type="text" inputMode="tel" autoComplete="off" aria-describedby="cv-quick-phone" data-cv-phone=""/>
        <small id="cv-quick-phone" className="admin-help">{t('fields.phoneHint')}</small>
      </label>
      <label>{t('fields.subjectsText')}
        <input className="admin-input" name="subjectsText" maxLength={400} autoComplete="off" value={subjectsText}
          onChange={event=>setSubjectsText(event.target.value)} aria-describedby="cv-quick-subjects" data-cv-subjects-text=""/>
        <small id="cv-quick-subjects" className="admin-help">{t('fields.subjectsTextHint')}</small>
      </label>
      {/* The reading, printed as it is typed: chips the operator can see and a tag for every word the
          parser could not settle. The chips travel as hidden inputs, so what is saved is what is shown. */}
      <div className="cv-read" data-cv-read="">
        {subjects.subjects.map(subject=><span key={subject} className="admin-badge">{subjectLabel(t,subject)}</span>)}
        {subjects.classLevels.map(level=><span key={level} className="admin-badge">{formatNumber(Number(level),digits)}</span>)}
        {free.shifts.map(shift=><span key={shift} className="admin-badge">{shiftLabel(t,shift)}</span>)}
        {subjects.unparsed.length>0&&<span className="admin-help">{t('flags.subjectUnparsed',{words:subjects.unparsed.join(', ')})}</span>}
        {subjects.unparsed.map(word=><input key={word} type="hidden" name="tags" value={word}/>)}
        {subjects.subjects.map(subject=><input key={subject} type="hidden" name="subjects" value={subject}/>)}
        {subjects.classLevels.map(level=><input key={level} type="hidden" name="classLevels" value={level}/>)}
        {free.shifts.map(shift=><input key={shift} type="hidden" name="shifts" value={shift}/>)}
      </div>
      <label>{t('fields.university')}<input className="admin-input" name="university" maxLength={160} autoComplete="off" data-cv-university=""/></label>
      <button type="button" className="admin-mini-button" aria-expanded={more} onClick={()=>setMore(value=>!value)}>{t('drawer.fieldsTitle')} <span aria-hidden="true">{more?'−':'＋'}</span></button>
      {more&&<>
        <label>{t('fields.department')}<input className="admin-input" name="department" maxLength={120} autoComplete="off"/></label>
        <label>{t('fields.currentInstitute')}<input className="admin-input" name="currentInstitute" maxLength={160} autoComplete="off"/></label>
        <label>{t('fields.email')}<input className="admin-input" name="email" type="email" maxLength={160} autoComplete="off"/></label>
        <label>{t('fields.availability')}
          <input className="admin-input" name="availabilityText" maxLength={200} autoComplete="off" value={availabilityText}
            onChange={event=>setAvailabilityText(event.target.value)} aria-describedby="cv-quick-free"/>
          <small id="cv-quick-free" className="admin-help">{t('fields.availabilityHint')}</small>
        </label>
        <label>{t('fields.expectedSalary')}
          <input className="admin-input" name="expectedSalary" inputMode="numeric" autoComplete="off" value={salaryText}
            onChange={event=>setSalaryText(event.target.value)} aria-describedby="cv-quick-salary"/>
          <small id="cv-quick-salary" className="admin-help">{t('fields.expectedSalaryHint')}</small>
          {pay.expectedSalary!==null&&<small className="admin-help">{formatNumber(pay.expectedSalary,digits)}</small>}
        </label>
        <label>{t('fields.source')}
          <select className="admin-select" name="source" defaultValue="walk_in">
            {TEACHER_SOURCES.map(option=><option key={option} value={option}>{sourceLabel(t,option)}</option>)}
          </select>
        </label>
        <label>{t('fields.receivedDate')}<input className="admin-input" type="date" name="receivedDate"/></label>
        <div className="cv-class-picker">
          <span>{t('fields.subjects')}</span>
          <small className="admin-help">{t('fields.subjectsHint')}</small>
          <span className="admin-help">{t('fields.classLevelsHint')}</span>
        </div>
        <CvFileField name="cvFile" kind="cv" label={t('fields.cv')} hint={t('fields.cvHint')}/>
      </>}
      {state.status==='dup'&&<div className="cv-dup" role="alert" data-cv-dup="true">
        <p className="admin-feedback error">{state.message}</p>
        <ul className="cv-notes">{(state.duplicates||[]).map(holder=><li key={holder.id}>
          <strong>{holder.name}</strong>{' '}
          <span className="admin-help">{holder.candidateId} · {statusLabel(t,holder.status)} · {formatDate(holder.receivedDate,digits,language)}</span>{' '}
          <span className="admin-badge">{holder.masked}</span>{' '}
          <span className="admin-help">{holder.match==='phone'?t('drawer.dupMatchPhone'):t('drawer.dupMatchEmail')}</span>
        </li>)}</ul>
        <div className="cv-form-foot">
          <button type="submit" name="dupChoice" value="separate" className="admin-mini-button" disabled={pending}>{t('dupSeparate')}</button>
          <button type="button" className="admin-mini-button" disabled={pending} onClick={()=>setExpanded(false)}>{t('close')}</button>
        </div>
      </div>}
      <div className="cv-form-foot">
        <button type="submit" className="button button-navy" disabled={pending} data-cv-save=""><Plus size={18} aria-hidden="true"/>{pending?t('loading'):t('saveAnother')}</button>
        <p className="admin-help">{t('enterSaves')}</p>
        {state.status!=='idle'&&state.status!=='dup'&&<p role="status" className={`admin-feedback ${state.status==='ok'?'':'error'}`} data-cv-form-message="">{state.message}</p>}
      </div>
    </form>
  </section>;
}

/** The picker's context: which CVs are ticked, and the tally the bar reads out loud. */
interface CvSmsContextValue{
  picked:string[];toggle:(id:string,on:boolean)=>void;selectPage:(on:boolean)=>void;allPicked:boolean;
  tally:{sendable:number;withoutPhone:number};kit:TeacherSmsKit;
}
const CvSmsContext=createContext<CvSmsContextValue|null>(null);

/**
 * Who a bulk send covers: the CVs on this screen, and nobody who left it. Picking is per page, so when the
 * operator changes page or filter the list re-renders with other rows and any picked id that is no longer
 * on screen drops out of the send rather than riding along invisibly — the button counts the ids it will
 * actually hand over, so the number the operator reads is the number that goes.
 */
export function CvSmsPicker({rows,kit,digits='bn',language='bn',children}:{
  rows:{id:string;name:string;hasPhone:boolean}[];kit:TeacherSmsKit|null;digits?:Digits;language?:'bn'|'en';children:ReactNode;
}){
  const t=useTranslations('teacherCvs');
  const [picked,setPicked]=useState<string[]>([]);
  const ids=useMemo(()=>rows.filter(row=>row.hasPhone).map(row=>row.id),[rows]);
  const live=useMemo(()=>new Set(ids),[ids]);
  const sendIds=useMemo(()=>picked.filter(id=>live.has(id)),[picked,live]);
  const toggle=useCallback((id:string,on:boolean)=>{
    setPicked(current=>on?[...new Set([...current,id])]:current.filter(value=>value!==id));
  },[]);
  const selectPage=useCallback((on:boolean)=>setPicked(on?ids:[]),[ids]);
  const allPicked=ids.length>0&&ids.every(id=>sendIds.includes(id));
  const tally=useMemo(()=>{
    let sendable=0,withoutPhone=0;
    for(const row of rows){if(row.hasPhone)sendable+=1;else withoutPhone+=1}
    return {sendable,withoutPhone};
  },[rows]);
  const value=useMemo<CvSmsContextValue>(()=>({picked:sendIds,toggle,selectPage,allPicked,tally,kit:kit!}),
    [sendIds,toggle,selectPage,allPicked,tally,kit]);
  // No kit, no picker: a screen that cannot load the catalog must not offer a send.
  if(!kit)return <>{children}</>;
  return <CvSmsContext.Provider value={value}>
    {children}
    <div className="cv-sms-host" data-cv-sms-host="">
      <SmsDialogTrigger
        request={{source:'teacherCandidates',ids:sendIds}}
        templates={kit.templates}
        institutePhone={kit.institutePhone}
        title={t('sms.title')}
        label={`${t('sms.contactSelected')} · ${formatNumber(sendIds.length,digits)}`}
        defaultTemplateKey="teacher_opening"
        en={language==='en'}
        variant="navy"
        disabled={!sendIds.length}
      />
    </div>
  </CvSmsContext.Provider>;
}

/** The bar above the list: pick the page, read what is excluded. */
export function CvSmsBar({digits='bn'}:{digits?:Digits}){
  const t=useTranslations('teacherCvs');
  const sms=useContext(CvSmsContext);
  if(!sms)return null;
  return <div className="cv-sms-bar" data-cv-sms-bar="">
    <label className="admin-check">
      <input type="checkbox" className="cv-sms-check" checked={sms.allPicked} onChange={event=>sms.selectPage(event.target.checked)} aria-label={t('selectAll')}/>
      <span>{t('selectAll')}</span>
    </label>
    <span className="admin-help">{t('sms.selected',{count:formatNumber(sms.picked.length,digits)})}</span>
    {sms.tally.withoutPhone>0&&<span className="admin-help cv-sms-excluded">{t('sms.noPhone',{count:formatNumber(sms.tally.withoutPhone,digits)})}</span>}
  </div>;
}

/** One row's tick box. A CV with no number offers none, and says why instead. */
export function CvSmsCheck({row,noPhone}:{row:{id:string;name:string;hasPhone:boolean};noPhone:string}){
  const sms=useContext(CvSmsContext);
  if(!sms)return null;
  if(!row.hasPhone)return <span className="admin-help">{noPhone}</span>;
  return <input type="checkbox" className="cv-sms-check" name="smsCandidate" value={row.id} aria-label={row.name}
    checked={sms.picked.includes(row.id)} onChange={event=>sms.toggle(row.id,event.target.checked)}/>;
}

/** One row's three ways to reach a candidate: dial, WhatsApp, or the shared SMS dialog. */
export function CvRowControls({row,kit,language='bn'}:{row:CandidateRowView;kit:TeacherSmsKit|null;language?:'bn'|'en'}){
  const t=useTranslations('teacherCvs');
  const phone=row.phones[0];
  return <div className="list-row-actions">
    {phone
      ?<>
        <a className="admin-mini-button" href={phone.tel} data-cv-call=""><Phone size={15} aria-hidden="true"/>{t('call')}</a>
        <a className="admin-mini-button" href={phone.whatsapp} target="_blank" rel="noreferrer" data-cv-whatsapp=""><MessageCircle size={15} aria-hidden="true"/>{t('whatsapp')}</a>
        {kit&&<SmsDialogTrigger request={{source:'teacherCandidates',ids:[row.id]}} templates={kit.templates}
          institutePhone={kit.institutePhone} title={t('sms.title')} label={t('sms.contactSelected')}
          defaultTemplateKey="teacher_opening" en={language==='en'}/>}
      </>
      :<span className="admin-help">{t('noPhone')}</span>}
  </div>;
}

/** The drawer: fields, rating and status, the timeline, the interview, the file, the duplicates, the hire. */
export function CvDetailDrawer({seed,initial=null,autoOpen=false,language='bn',digits='bn',kit=null}:{
  seed:CvDrawerSeed;initial?:CandidateDetailView|null;autoOpen?:boolean;language?:'bn'|'en';digits?:Digits;kit?:TeacherSmsKit|null;
}){
  const t=useTranslations('teacherCvs');
  const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const [detail,setDetail]=useState<CandidateDetailView|null>(initial);
  const [loading,setLoading]=useState(false);
  const load=useCallback(async()=>{
    setLoading(true);
    const answer=await reloadCvDetail(seed.id);
    if(answer.ok)setDetail(answer.detail);
    setLoading(false);
  },[seed.id]);
  const open=useCallback(()=>{dialog.current?.showModal();if(!detail)void load()},[detail,load]);
  useEffect(()=>{if(autoOpen)open()},[]);// eslint-disable-line react-hooks/exhaustive-deps
  return <>
    <button ref={trigger} type="button" className="admin-mini-button" onClick={open} data-cv-detail="">{t('detail')}</button>
    <dialog className="overview-drawer cv-drawer" ref={dialog} aria-label={t('drawer.title')} onClose={()=>trigger.current?.focus()} data-cv-drawer="">
      <header>
        <h2>{seed.name}</h2>
        <button type="button" className="admin-mini-button" onClick={()=>dialog.current?.close()}>{t('close')}</button>
      </header>
      <p className="admin-help">{t('drawer.idLabel')} {seed.candidateId}</p>
      {loading&&<p className="admin-help" role="status">{t('loading')}</p>}
      <CvDetailBody seed={seed} detail={detail} reload={load} language={language} digits={digits} kit={kit} close={()=>dialog.current?.close()}/>
    </dialog>
  </>;
}

function CvDetailBody({seed,detail,reload,language,digits,kit,close}:{
  seed:CvDrawerSeed;detail:CandidateDetailView|null;reload:()=>Promise<void>;language:'bn'|'en';digits:Digits;kit:TeacherSmsKit|null;close:()=>void;
}){
  const t=useTranslations('teacherCvs');
  const [fieldState,fieldAction,fieldPending]=useActionState(saveCvFields,idleCvFormState());
  const [noteState,noteAction,notePending]=useActionState(addCvNote,idleCvFormState());
  const [whenState,whenAction,whenPending]=useActionState(setCvInterview,idleCvFormState());
  const [hireState,hireAction,hirePending]=useActionState(hireCv,idleCvFormState());
  const row=detail?.row;
  // A write that changed the record re-reads it, so the timeline and the duplicate list are the truth.
  useEffect(()=>{
    if(fieldState.status!=='ok'&&noteState.status!=='ok'&&whenState.status!=='ok'&&hireState.status!=='ok')return;
    void reload();
  },[fieldState,noteState,whenState,hireState,reload]);
  const message=([fieldState,noteState,whenState,hireState] as CvFormState[]).filter(state=>state.status!=='idle').slice(-1)[0];
  if(!detail||!row){
    return <p className="admin-help">{detail?t('loading'):t('errors.MISSING')}</p>;
  }
  return <>
    {message&&<p role="status" className={`admin-feedback ${message.status==='ok'?'':'error'}`} data-cv-drawer-message="">{message.message}</p>}
    <p className="admin-help">{t('drawer.hint')}</p>

    <div className="cv-drawer-badges">
      <span className={`admin-badge ${statusBadge(row.status)}`}>{statusLabel(t,row.status)}</span>
      <span className={`admin-badge ${ratingBadge(row.rating)}`}>{ratingLabel(t,row.rating)}</span>
      <span className="admin-badge">{sourceLabel(t,row.source)}</span>
      {row.hired&&<span className="admin-badge enabled">{t('drawer.hiredAs')}</span>}
      {row.review&&<span className="admin-badge pending">{t('reviewBadge')}</span>}
    </div>

    <h3>{t('drawer.ratingTitle')}</h3>
    <form action={fieldAction} className="list-filter cv-drawer-form">
      <input type="hidden" name="id" value={seed.id}/>
      <label>{t('fields.status')}
        <select className="admin-select" name="status" defaultValue={row.status} data-cv-status="">
          {TEACHER_STATUSES.map(option=><option key={option} value={option}>{statusLabel(t,option)}</option>)}
        </select>
      </label>
      <label>{t('fields.rating')}
        <select className="admin-select" name="rating" defaultValue={row.rating} data-cv-rating="">
          {TEACHER_RATINGS.map(option=><option key={option} value={option}>{ratingLabel(t,option)}</option>)}
        </select>
      </label>
      <label>{t('fields.source')}
        <select className="admin-select" name="source" defaultValue={row.source}>
          {TEACHER_SOURCES.map(option=><option key={option} value={option}>{sourceLabel(t,option)}</option>)}
        </select>
      </label>
      <div className="cv-form-foot"><button type="submit" className="button button-navy" disabled={fieldPending} data-cv-save-status="">{t('save')}</button></div>
    </form>

    <h3>{t('drawer.fieldsTitle')}</h3>
    <dl className="cv-fields">
      <div><dt>{t('fields.university')}</dt><dd>{row.university||'—'}</dd></div>
      <div><dt>{t('fields.department')}</dt><dd>{row.department||'—'}</dd></div>
      <div><dt>{t('fields.currentInstitute')}</dt><dd>{row.currentInstitute||'—'}</dd></div>
      <div><dt>{t('fields.subjectsText')}</dt><dd>{row.subjectsText||'—'}</dd></div>
      <div><dt>{t('fields.subjects')}</dt><dd>{row.subjects.length?row.subjects.map(subject=>subjectLabel(t,subject)).join(' · '):t('noSubjectRead')}</dd></div>
      <div><dt>{t('fields.classLevels')}</dt><dd>{row.classLevels.length?row.classLevels.map(level=>formatNumber(Number(level),digits)).join(' · '):'—'}</dd></div>
      <div><dt>{t('fields.availability')}</dt><dd>{row.availabilityText||'—'}</dd></div>
      <div><dt>{t('fields.shifts')}</dt><dd>{row.shifts.length?row.shifts.map(shift=>shiftLabel(t,shift)).join(' · '):'—'}</dd></div>
      <div><dt>{t('fields.expectedSalary')}</dt><dd>{row.expectedSalary===null?'—':formatNumber(row.expectedSalary,digits)}</dd></div>
      <div><dt>{t('fields.email')}</dt><dd>{row.email||'—'}</dd></div>
      <div><dt>{t('fields.tags')}</dt><dd>{row.tags.length?row.tags.join(' · '):'—'}</dd></div>
      <div><dt>{t('fields.receivedDate')}</dt><dd>{formatDate(row.receivedDate,digits,language)}</dd></div>
    </dl>
    <form action={fieldAction} className="list-filter cv-drawer-form">
      <input type="hidden" name="id" value={seed.id}/>
      <label>{t('fields.university')}<input className="admin-input" name="university" defaultValue={row.university} maxLength={160}/></label>
      <label>{t('fields.department')}<input className="admin-input" name="department" defaultValue={row.department} maxLength={120}/></label>
      <label>{t('fields.currentInstitute')}<input className="admin-input" name="currentInstitute" defaultValue={row.currentInstitute} maxLength={160}/></label>
      <label>{t('fields.subjectsText')}
        <input className="admin-input" name="subjectsText" defaultValue={row.subjectsText} maxLength={400}/>
        <small className="admin-help">{t('fields.subjectsTextHint')}</small>
      </label>
      <label>{t('fields.availability')}<input className="admin-input" name="availabilityText" defaultValue={row.availabilityText} maxLength={200}/></label>
      <label>{t('fields.email')}<input className="admin-input" name="email" type="email" defaultValue={row.email} maxLength={160}/></label>
      <label>{t('fields.expectedSalary')}<input className="admin-input" name="expectedSalary" inputMode="numeric"
        defaultValue={row.expectedSalary===null?'':String(row.expectedSalary)}/></label>
      <label>{t('fields.tags')}<input className="admin-input" name="tags" defaultValue={row.tags.join(', ')} maxLength={400}/></label>
      <div className="cv-chips">
        {TEACHER_SUBJECTS.map(subject=><label key={subject} className="admin-check">
          <input type="checkbox" name="subjects" value={subject} defaultChecked={row.subjects.includes(subject)}/><span>{subjectLabel(t,subject)}</span>
        </label>)}
      </div>
      <div className="cv-chips">
        {TEACHER_CLASS_LEVELS.map(level=><label key={level} className="admin-check">
          <input type="checkbox" name="classLevels" value={level} defaultChecked={row.classLevels.includes(level)}/><span>{formatNumber(Number(level),digits)}</span>
        </label>)}
      </div>
      <div className="cv-chips">
        {TEACHER_SHIFTS.map(shift=><label key={shift} className="admin-check">
          <input type="checkbox" name="shifts" value={shift} defaultChecked={row.shifts.includes(shift)}/><span>{shiftLabel(t,shift)}</span>
        </label>)}
      </div>
      <div className="cv-form-foot"><button type="submit" className="button button-navy" disabled={fieldPending} data-cv-save-fields="">{t('save')}</button></div>
    </form>

    <h3>{t('drawer.cvTitle')}</h3>
    {row.cvFile
      ?<p className="list-row-actions">
        <a className="admin-mini-button" href={row.cvFile} target="_blank" rel="noreferrer" data-cv-preview=""><FileText size={15} aria-hidden="true"/>{t('drawer.cvPreview')}</a>
        <a className="admin-mini-button" href={row.cvFile} download rel="noreferrer" data-cv-download=""><Download size={15} aria-hidden="true"/>{t('drawer.cvDownload')}</a>
      </p>
      :<p className="admin-help">{t('noCv')}</p>}
    {row.photo&&<p><img className="cv-photo" src={row.photo} alt={t('drawer.photoAlt')}/></p>}

    <h3>{t('drawer.interviewTitle')}</h3>
    <form action={whenAction} className="list-filter cv-drawer-form">
      <input type="hidden" name="id" value={seed.id}/>
      <label>{t('drawer.interviewAt')}
        <input className="admin-input" type="datetime-local" name="interviewAt" defaultValue={toLocalInput(row.interviewAt)} data-cv-interview=""/>
      </label>
      <div className="cv-form-foot">
        <button type="submit" className="button button-navy" disabled={whenPending}>{t('drawer.interviewSave')}</button>
        <button type="submit" name="interviewAt" value="" className="admin-mini-button" disabled={whenPending}>{t('drawer.interviewClear')}</button>
      </div>
      {row.interviewAt
        ?<p className="admin-help">{formatDate(row.interviewAt,digits,language)}</p>
        :<p className="admin-help">{t('drawer.interviewNone')}</p>}
    </form>

    <h3>{t('drawer.notesTitle')}</h3>
    {detail.notes.length
      ?<ol className="cv-notes" data-cv-notes="">{detail.notes.map((note,index)=>(
        <li key={index}>
          <strong>{formatDate(note.at,digits,language)}</strong> <span className="admin-help">{note.byName}</span>
          {note.outcome&&<span className="admin-badge"> {outcomeLabel(t,note.outcome)}</span>}
          <p>{note.text}</p>
        </li>))}</ol>
      :<p className="admin-help">{t('drawer.noNotes')}</p>}
    <form action={noteAction} className="cv-drawer-form">
      <input type="hidden" name="id" value={seed.id}/>
      <label>{t('drawer.noteText')}
        <textarea className="admin-input" name="text" rows={3} maxLength={1000} required placeholder={t('drawer.notePlaceholder')} data-cv-note=""/>
      </label>
      <label>{t('drawer.noteOutcome')}
        <select className="admin-select" name="outcome" defaultValue="">
          <option value="">{t('drawer.outcomeNone')}</option>
          {TEACHER_NOTE_OUTCOMES.map(option=><option key={option} value={option}>{outcomeLabel(t,option)}</option>)}
        </select>
      </label>
      <div className="cv-form-foot"><button type="submit" className="button button-navy" disabled={notePending} data-cv-add-note="">{t('drawer.addNote')}</button></div>
    </form>

    <h3>{t('drawer.duplicatesTitle')}</h3>
    <p className="admin-help">{t('drawer.dupHint')}</p>
    {detail.duplicates.length
      ?<ul className="cv-notes" data-cv-dups="">{detail.duplicates.map(holder=><li key={holder.id}>
        <strong>{holder.name}</strong>{' '}
        <span className="admin-help">{holder.candidateId} · {statusLabel(t,holder.status)} · {formatDate(holder.receivedDate,digits,language)}</span>{' '}
        <span className="admin-badge">{holder.masked}</span>{' '}
        <span className="admin-help">{holder.match==='phone'?t('drawer.dupMatchPhone'):t('drawer.dupMatchEmail')}</span>{' '}
        <Link className="admin-mini-button" href={{pathname:'/admin/teacher-cvs',query:{q:holder.candidateId}}}>{t('drawer.dupOpen')}</Link>
      </li>)}</ul>
      :<p className="admin-help">{t('drawer.dupNone')}</p>}

    <h3>{t('drawer.hireTitle')}</h3>
    {row.hired
      ?<div className="cv-hired" data-cv-hired="">
        <p>{t('drawer.hiredAs')}</p>
        {detail.teacher&&<>
          <p className="admin-help">{detail.teacher.name} · {detail.teacher.slug}{detail.teacher.published?'':` · ${t('drawer.hiredUnpublished')}`}</p>
          <p className="list-row-actions">
            <Link className="admin-mini-button" href={{pathname:'/admin/faculty'}}>{t('drawer.openFaculty')}</Link>
          </p>
        </>}
      </div>
      :<form action={hireAction} className="cv-drawer-form">
        <input type="hidden" name="id" value={seed.id}/>
        <input type="hidden" name="name" value={row.name}/>
        <p className="admin-help">{t('drawer.hireHint')}</p>
        <div className="cv-form-foot"><button type="submit" className="button button-navy" disabled={hirePending} data-cv-hire="">{t('drawer.hire')}</button></div>
      </form>}

    <h3>{t('drawer.binTitle')}</h3>
    <p className="admin-help">{t('drawer.binHint')}</p>
    <div className="overview-drawer-actions">
      <DeleteRow kind="teacherCandidate" id={seed.id} name={seed.name} onDone={close}/>
      {kit&&row.phones.length>0&&<SmsDialogTrigger request={{source:'teacherCandidates',ids:[seed.id]}} templates={kit.templates}
        institutePhone={kit.institutePhone} title={t('sms.title')} label={t('sms.contactSelected')} defaultTemplateKey="teacher_opening" en={language==='en'}/>}
      <span className="admin-help">{t('drawer.savedAt')} {formatDate(row.receivedDate,digits,language)}</span>
    </div>
  </>;
}

/** The Find-a-teacher screen's own form: save what the centre is looking for. */
export function CvNeedForm({digits='bn'}:{digits?:Digits}){
  const t=useTranslations('teacherCvs');
  const [state,action,pending]=useActionState(saveTeachingNeed,idleCvFormState());
  return <section className="admin-panel" aria-label={t('needs.title')} data-cv-need-form="">
    <div className="admin-panel-head"><h2>{t('needs.title')}</h2></div>
    <form action={action} className="admin-panel-body list-filter">
      <p className="admin-help cv-form-hint">{t('needs.desc')}</p>
      <label>{t('needs.subject')}
        <select className="admin-select" name="subject" defaultValue="" data-cv-need-subject="">
          <option value="">{t('filters.all')}</option>
          {TEACHER_SUBJECTS.map(option=><option key={option} value={option}>{subjectLabel(t,option)}</option>)}
        </select>
      </label>
      <label>{t('needs.shift')}
        <select className="admin-select" name="shift" defaultValue="">
          <option value="">{t('filters.all')}</option>
          {TEACHER_SHIFTS.map(option=><option key={option} value={option}>{shiftLabel(t,option)}</option>)}
        </select>
      </label>
      <label>{t('needs.note')}<input className="admin-input" name="note" maxLength={300} placeholder={t('needs.notePlaceholder')}/></label>
      <div className="cv-chips">
        {TEACHER_CLASS_LEVELS.map(level=><label key={level} className="admin-check">
          <input type="checkbox" name="classLevels" value={level}/><span>{formatNumber(Number(level),digits)}</span>
        </label>)}
      </div>
      <div className="cv-form-foot">
        <button type="submit" className="button button-navy" disabled={pending} data-cv-need-save="">{t('needs.add')}</button>
        {state.status!=='idle'&&<p role="status" className={`admin-feedback ${state.status==='ok'?'':'error'}`}>{state.message}</p>}
      </div>
    </form>
  </section>;
}

/** One saved need, with the buttons that fill it, open its matches or remove it. */
export function CvNeedRow({need,matchesHref,digits='bn'}:{
  need:{id:string;subject:string;classLevels:string[];shift:string;note:string;filled:boolean;matches:number};
  matchesHref:string;digits?:Digits;
}){
  const t=useTranslations('teacherCvs');
  const [filledState,filledAction,filledPending]=useActionState(setTeachingNeedFilled,idleCvFormState());
  const [removedState,removedAction,removedPending]=useActionState(removeTeachingNeed,idleCvFormState());
  const message=[filledState,removedState].filter(entry=>entry.status!=='idle').slice(-1)[0];
  return <li className="cv-need" data-cv-need="">
    <div>
      <strong>{need.subject?subjectLabel(t,need.subject):t('filters.all')}</strong>
      {need.classLevels.length>0&&<span className="admin-help"> · {need.classLevels.map(level=>formatNumber(Number(level),digits)).join(', ')}</span>}
      {need.shift&&<span className="admin-help"> · {shiftLabel(t,need.shift)}</span>}
      {need.note&&<p className="admin-help">{need.note}</p>}
      <p className="admin-help">{need.matches>0?t('needs.matches',{count:formatNumber(need.matches,digits)}):t('needs.matchesNone')}</p>
      {need.filled&&<span className="admin-badge enabled">{t('needs.filled')}</span>}
      {message&&<p role="status" className={`admin-feedback ${message.status==='ok'?'':'error'}`}>{message.message}</p>}
    </div>
    <div className="list-row-actions">
      {need.matches>0&&<Link className="admin-mini-button" href={matchesHref} data-cv-need-open="">{t('needs.showMatches')}</Link>}
      <form action={filledAction}>
        <input type="hidden" name="needId" value={need.id}/>
        <input type="hidden" name="filled" value={need.filled?'false':'true'}/>
        <button type="submit" className="admin-mini-button" disabled={filledPending}>{need.filled?t('needs.markOpen'):t('needs.markFilled')}</button>
      </form>
      <form action={removedAction}>
        <input type="hidden" name="needId" value={need.id}/>
        <button type="submit" className="admin-mini-button admin-danger-text" disabled={removedPending}>{t('needs.remove')}</button>
      </form>
    </div>
  </li>;
}
