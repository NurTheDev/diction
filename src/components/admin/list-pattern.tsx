'use client';
/**
 * The shared list-row pattern (owner decision, group 1: build the pattern as shared components, so
 * every list reuses the same code and a fix in one place fixes every page).
 *
 * One row, one line, at most five visible controls:
 *
 *   [☐] who (name / class · school · id) | number + Call + WhatsApp | status chip | second chip |
 *       note | [Open] [Edit] [⋯]
 *
 * The chips ARE the controls: one tap opens the menu, the second commits, and a toast answers — no
 * dropdown beside a Save button. Every other verb a row has lives in the labelled ⋯ menu, whose
 * destructive end is the role's own: the verb this role may use, and otherwise the honest sentence
 * naming who may. Nothing here is a native date or month input; a day comes from `DatePopover` and a
 * month from `MonthPopover`. At 360px the row is a card with big Call and WhatsApp. Ticking a row
 * raises the bulk bar. A write that files its own row away answers through `toastOnWrite`, because an
 * effect keyed on the action state never runs once the row is unmounted.
 *
 * `docs/LIST-PATTERN.md` is the contract. A list composes these pieces and adds nothing of its own but
 * its fields, its verbs and its vocabulary — `kind` is what makes one list's row addressable in a test
 * without guessing at another's (`data-visitor-open`, `data-student-open`), and every class is painted
 * twice, in the pattern's own name and the list's, so a list keeps the CSS it already had.
 */
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {MessageCircle,MoreHorizontal,Phone} from 'lucide-react';
import {Popover} from './popover';
import {showRecycleToast} from './recycle-toast-host';

export type Language='bn'|'en';

/** A `data-*` marker with nothing in it, or with the value that names the option. */
export const attr=(name:string,value=''):Record<string,string>=>({[name]:value});

/** The pattern's class and the list's own, so existing CSS keeps applying while the pattern is shared. */
const cls=(kind:string,part:string):string=>`list-${part} ${kind}-${part}`;

/**
 * The toast for a write that keeps its row on screen. A write that removes the row — a visitor closed,
 * a student removed — has to answer through `toastOnWrite` instead, on the way back from the action.
 */
export function useRowToast(state:{status:string;message?:string}|null):void{
  useEffect(()=>{
    if(state&&state.status==='ok'&&state.message)showRecycleToast({state:{status:'ok'},success:state.message,error:''});
  },[state]);
}

/** The filter panel: open on a desktop, closed on a phone, and never hiding an active filter. */
export function ListFilters({kind,label,active,children}:{kind:string;label:string;active?:string;children:ReactNode}){
  const [open,setOpen]=useState(true);
  useEffect(()=>{if(window.innerWidth<900)setOpen(false)},[]);
  return <details className={`admin-help-panel ${cls(kind,'filters')}`} {...attr(`data-${kind}-filters`)} open={open||undefined}
    onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="admin-mini-button">{label}{active?` · ${active}`:''}</summary>
    {children}
  </details>;
}

/**
 * One tick in the filter panel. A list whose filters travel in the address bar renders it uncontrolled
 * (`defaultChecked`, inside a GET form); a list that searches by name or number keeps people out of the
 * URL and drives the same tick from its own state.
 */
export function FilterToggle({name,label,checked,onChange,defaultChecked}:{
  name:string;label:string;checked?:boolean;onChange?:(on:boolean)=>void;defaultChecked?:boolean;
}){
  return <label className="list-filter-toggle">
    {onChange
      ?<input type="checkbox" name={name} value="1" checked={!!checked} onChange={event=>onChange(event.target.checked)}/>
      :<input type="checkbox" name={name} value="1" defaultChecked={defaultChecked}/>}
    <span>{label}</span>
  </label>;
}

/** The row itself, addressable as `tr[data-{kind}-row]`. */
export function ListRow({kind,children}:{kind:string;children:ReactNode}){
  return <tr className={cls(kind,'row')} {...attr(`data-${kind}-row`)}>{children}</tr>;
}

/**
 * A cell that only wraps something the list owns — the tick, a chip, a menu, a read-out. `part` is the
 * cell's place in the row (`check`, `status`, `follow`, `dues`), which is what the pattern's CSS gives a
 * width and an order in the card, and what `data-label` paints beside it on a phone.
 */
export function Cell({kind,part,label,children}:{kind:string;part:string;label:string;children:ReactNode}){
  return <td className={cls(kind,part)} data-label={label}>{children}</td>;
}

/** The class list a pattern table carries: the shell's, the pattern's, and the list's own widths. */
export const listTableClass=(kind:string):string=>`admin-table list-table ${kind}-table`;

/** The identity cell: the name on one line with a flag beside it, then class · school · id on a second. */
export function WhoCell({kind,label,name,flags,sub}:{kind:string;label:string;name:string;flags?:string[];sub:string}){
  return <td className={cls(kind,'who')} data-label={label}>
    {/* Two lines and no third: a flag rides beside the name rather than adding a line, so the row stays
        inside its height budget. */}
    {/* A long name is what the row's height budget truncates, so the whole of it rides in the title:
        the operator reads the name, not an ellipsis, without the row growing a third line. */}
    <span className={cls(kind,'name')}><strong title={name}>{name}</strong>
      {(flags||[]).slice(0,1).map((flag,index)=><span key={index} className="lead-flag">{flag}</span>)}</span>
    <span className={cls(kind,'sub')}>{sub}</span>
  </td>;
}

/** The number cell: the number printed for the roles that call, and the two destinations beside it. */
export function PhoneCell({kind,label,destination,printed,masked,noPhone,callLabel,whatsappLabel}:{
  kind:string;label:string;destination:{tel:string;whatsapp:string}|null;printed?:string;masked?:string;
  noPhone:string;callLabel:string;whatsappLabel:string;
}){
  return <td className={cls(kind,'call')} data-label={label}>
    {destination
      ?<span className={cls(kind,'phone')}>
        <span className={cls(kind,'number')} {...attr(`data-${kind}-phone`)}>{printed||masked}</span>
        <a className={`admin-mini-button ${cls(kind,'dial')}`} href={destination.tel} {...attr(`data-${kind}-call`)}>
          <Phone size={15} aria-hidden="true"/>{callLabel}</a>
        <a className={`admin-mini-button ${cls(kind,'dial')}`} href={destination.whatsapp} target="_blank" rel="noreferrer"
          {...attr(`data-${kind}-wa`)}><MessageCircle size={15} aria-hidden="true"/>{whatsappLabel}</a>
      </span>
      :<span className="admin-help">{noPhone}</span>}
  </td>;
}

/** The last-note cell: one line that truncates, or a dash rather than an empty hole in the row. */
export function NoteCell({kind,label,text,empty}:{kind:string;label:string;text:string;empty:string}){
  return <td className={cls(kind,'note')} data-label={label}>
    {text?<span className={cls(kind,'note-text')} title={text}>{text}</span>:<span className="admin-help">{empty}</span>}
  </td>;
}

/**
 * The status chip: the badge IS the menu — tap the badge, tap the new status, read the toast. Two taps,
 * and no Save button anywhere. `extra` is the warning badge a list paints beside it (a do-not-contact
 * row keeps its own), and `hideCurrent` keeps the status it already has out of its own menu.
 */
export function StatusChipMenu<T extends string>({kind,value,options,labelOf,badgeOf,title,onPick,extra,hideCurrent=true}:{
  kind:string;value:T;options:readonly T[];labelOf:(option:T)=>string;badgeOf:(option:T)=>string;title:string;
  onPick:(option:T)=>void;extra?:ReactNode;hideCurrent?:boolean;
}){
  return <span className={cls(kind,'status-cell')}>
    <div className="pop-form">
      <Popover title={title} className="pop-status" label={
        <span className={`admin-badge ${badgeOf(value)}`} {...attr('data-status-badge')}>{labelOf(value)}</span>}>
        {close=><div className="pop-menu" role="menu" {...attr('data-status-menu')}>
          {/* Not `type="submit"` with `onClick={close}`: closing the menu detaches the button before the
              browser runs the click's activation behaviour, so a submit button that shuts its own menu
              never submits and the tap looks accepted while nothing is written. Every item here hands
              its action the FormData itself and then closes. */}
          {options.map(option=>hideCurrent&&option===value?null:
            <button key={option} type="button" role="menuitem" {...attr('data-status-option',option)}
              onClick={()=>{onPick(option);close()}}>
              <span className={`admin-badge ${badgeOf(option)}`}>{labelOf(option)}</span></button>)}
        </div>}
      </Popover>
    </div>
    {extra}
  </span>;
}

/** A chip that opens something: a menu of verbs, a calendar, a month picker, or a read-out of a total. */
export function ChipPopover({title,className,label,children}:{title?:string;className?:string;label:ReactNode;children:ReactNode|((close:()=>void)=>ReactNode)}){
  return <div className="pop-form">
    <Popover title={title} className={className} label={label}>{children}</Popover>
  </div>;
}

/**
 * One of the pattern's chips. `value` is what a test reads it by and `tone` is what colours it, and the
 * two are not always the same word: a follow-up promised for tomorrow reads `tomorrow` and is coloured
 * `later`, because the colour is about how soon, not about which day.
 */
export function ListChip({marker,value,tone,className,children}:{
  marker:string;value:string;tone:string;className?:string;children:ReactNode;
}){
  return <span className={`list-chip ${tone}${className?` ${className}`:''}`} {...attr(`data-${marker}-chip`,value)}>{children}</span>;
}

/** The ⋯ menu: everything a row can do that is not one of its five visible controls. */
export function RowMenu({title,label,children}:{title:string;label?:ReactNode;children:(close:()=>void)=>ReactNode}){
  return <Popover title={title} className="pop-more"
    label={label??<span className="pop-dots"><MoreHorizontal size={18} aria-hidden="true"/></span>}>
    {close=><div className="pop-menu" role="menu" {...attr('data-more-menu')}>{children(close)}</div>}
  </Popover>;
}

/**
 * A form inside the ⋯ menu, for the verbs that need words from the operator — a reason, a leave month.
 * It is a real submit rather than a button that builds its own FormData, and a submit cannot close its
 * menu on click, because closing detaches the form before the browser runs the click's activation
 * behaviour. So the menu closes when the write lands instead, and stays open on a refusal, where the
 * operator can correct what they typed. A menu left open over a row it has just changed is a sheet left
 * across the operator's work: on a phone it covers the list, and the next tap lands on the menu.
 */
export function MenuForm({marker,action,state,onDone,submitLabel,disabled,children}:{
  marker:string;action:(form:FormData)=>void;state:{status:string}|null;onDone:()=>void;
  submitLabel:string;disabled?:boolean;children:ReactNode;
}){
  const last=useRef(state);
  useEffect(()=>{
    if(state===last.current)return;
    last.current=state;
    if(state?.status==='ok')onDone();
  },[state,onDone]);
  return <form action={action} className="pop-inline" {...attr(`data-more-${marker}`)} onClick={event=>event.stopPropagation()}>
    {children}
    <button type="submit" role="menuitem" disabled={disabled}>{submitLabel}</button>
  </form>;
}

/** The sentence at the foot of a ⋯ menu: who may use the verb this role does not have. */
export function MenuHint({text,adminOnly}:{text:string;adminOnly?:boolean}){
  return <span className="admin-help pop-hint" {...(adminOnly?attr('data-more-admin-only'):undefined)}>{text}</span>;
}

/** The action cell: the row's visible controls, then its ⋯, then anything the list owns (a drawer). */
export function ActCell({kind,label,openLabel,editLabel,onOpen,onEdit,menu,children}:{
  kind:string;label:string;openLabel?:string;editLabel?:string;onOpen?:()=>void;onEdit?:()=>void;
  menu?:ReactNode;children?:ReactNode;
}){
  return <td className={cls(kind,'act')} data-label={label}>
    {onOpen&&openLabel&&<button type="button" className="admin-mini-button" {...attr(`data-${kind}-open`)} onClick={onOpen}>{openLabel}</button>}
    {onEdit&&editLabel&&<button type="button" className="admin-mini-button" {...attr(`data-${kind}-edit`)} onClick={onEdit}>{editLabel}</button>}
    {menu}
    {children}
  </td>;
}

/** The bulk bar: it exists only while rows are ticked, and it says how many. */
export function BulkBar({kind,countLabel,clearLabel,onClear,children}:{
  kind:string;countLabel:string;clearLabel:string;onClear:()=>void;children:ReactNode;
}){
  return <div className="list-bulk-bar" {...attr(`data-${kind}-bulk-bar`)}>
    <strong {...attr('data-bulk-count')}>{countLabel}</strong>
    {children}
    <button type="button" className="admin-mini-button" {...attr('data-bulk-clear')} onClick={onClear}>{clearLabel}</button>
  </div>;
}

/** One popover of choices on the bulk bar — the same two taps as the row's own chip. */
export function BulkMenu({marker,title,label,children}:{marker:string;title:string;label:string;children:(close:()=>void)=>ReactNode}){
  return <div className="pop-form">
    <Popover title={title} label={<span className="admin-mini-button" {...attr(`data-bulk-${marker}`)}>{label}</span>}>
      {close=><div className="pop-menu" role="menu">{children(close)}</div>}
    </Popover>
  </div>;
}

/**
 * The inline edit a row opens: the fields, then Save and Cancel, then the refusal in the catalogue's own
 * words. It is a form with a real submit, so the browser's own validation and the action's own state are
 * the same thing the operator sees.
 */
export function RowEditForm({kind,action,pending,onCancel,saveLabel,cancelLabel,error,children}:{
  kind:string;action:(form:FormData)=>void;pending?:boolean;onCancel:()=>void;saveLabel:string;cancelLabel:string;
  error?:string;children:ReactNode;
}){
  return <form action={action} className={`list-edit-form ${kind}-edit-form`}>
    {children}
    {error&&<p className="admin-feedback error" role="alert">{error}</p>}
    <div className="list-edit-actions">
      <button type="submit" className="button button-navy" {...attr(`data-${kind}-edit-save`)} disabled={pending}>{saveLabel}</button>
      <button type="button" className="admin-mini-button" {...attr(`data-${kind}-edit-cancel`)} onClick={onCancel}>{cancelLabel}</button>
    </div>
  </form>;
}
