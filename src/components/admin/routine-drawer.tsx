'use client';
/**
 * R9 · the routine's own surfaces: the drawer an edit happens in, and the clock a period is written with.
 *
 * Two things the brief was explicit about, and both are why this file exists:
 *
 *   • **An edit happens in a drawer** with Save, Cancel and a danger zone — not in a collapsed row the
 *     operator has to hunt through, and not in a browser widget. On a desk it slides in from the right;
 *     at 360px the stylesheet turns the very same `<dialog>` into a full-screen touch sheet with tall
 *     inputs, which is what "editing a period on a phone" has to mean.
 *   • **No native time or date box.** `type="time"` paints a spinner in some browsers and a 12-hour
 *     field with no way to type a Bangla digit in others, and the calendar in `popover.tsx` exists for
 *     the same reason. So a time here is two selects — the hour and the minute — writing one hidden
 *     `HH:MM` input, with the part of the day named beside them in the screen's own language.
 */
import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {useTranslations} from 'next-intl';
import {type Digits} from '@/lib/admin/format';
import {MINUTE_STEPS,clockMinutes,clockOfMinutes,clockWord,hourWord,minuteWord} from '@/lib/routine/time';
import {dayPeriodKey} from '@/lib/admin/format';

/** The drawer shell: one `<dialog>`, a head with its title and a close, and the body a form goes in. */
export function RoutineDrawer({open,onClose,title,children}:{
  open:boolean;onClose:()=>void;title:string;children:ReactNode;
}){
  const dialog=useRef<HTMLDialogElement>(null);
  const titleId=useId();
  const t=useTranslations('routine');
  useEffect(()=>{
    const node=dialog.current;
    if(!node)return;
    /* `showModal` rather than `open`: the drawer is modal, it traps focus, Escape closes it, and on a
       phone it covers the sheet below instead of floating over it. */
    if(open&&!node.open)node.showModal();
    if(!open&&node.open)node.close();
  },[open]);
  return <dialog ref={dialog} className="routine-drawer" aria-labelledby={titleId}
    onClose={()=>onClose()} data-routine-drawer={open?'open':'closed'}>
    <div className="routine-drawer-head">
      <h2 id={titleId}>{title}</h2>
      <button type="button" className="admin-mini-button" onClick={()=>onClose()} data-drawer-close>
        {t('common.close')}
      </button>
    </div>
    <div className="routine-drawer-body">{children}</div>
  </dialog>;
}

const pad=(value:number):string=>String(value).padStart(2,'0');
const split=(value:string):{hour:number;minute:number}=>{
  const minutes=clockMinutes(value);
  return Number.isFinite(minutes)?{hour:Math.floor(minutes/60),minute:minutes%60}:{hour:8,minute:0};
};

/**
 * A time as two selects and one hidden `HH:MM` input.
 *
 * `name` is the hidden input's, so the field drops into any form the action already reads. Minutes are
 * offered in five-minute steps plus whatever the stored value says, so a period that starts at 08:07
 * still reads 08:07 instead of being quietly rounded the moment the drawer opens.
 */
export function TimeField({name,value,digits,onChange}:{
  name:string;value:string;digits:Digits;onChange?:(value:string)=>void;
}){
  const t=useTranslations('routine'),common=useTranslations('common');
  const [clock,setClock]=useState(()=>split(value));
  const [lastValue,setLastValue]=useState(value);
  useEffect(()=>{
    if(value===lastValue)return;
    setClock(split(value));
    setLastValue(value);
  },[value,lastValue]);
  const write=(next:{hour:number;minute:number}):void=>{
    setClock(next);
    const written=clockOfMinutes(next.hour*60+next.minute);
    onChange?.(written);
  };
  const minutes=[...new Set([...MINUTE_STEPS.map(step=>Number(step)),clock.minute])].sort((a,b)=>a-b);
  const hhmm=`${pad(clock.hour)}:${pad(clock.minute)}`;
  return <span className="routine-time" data-time-field={name}>
    <input type="hidden" name={name} value={hhmm}/>
    <span className="routine-time-parts">
      <select className="admin-select" aria-label={t('period.hour')} value={clock.hour} data-time-hour={name}
        onChange={event=>write({...clock,hour:Number(event.target.value)})}>
        {Array.from({length:24},(_,hour)=>hour).map(hour=>
          <option key={hour} value={hour}>{hourWord(hour,digits)}</option>)}
      </select>
      <span aria-hidden="true">:</span>
      <select className="admin-select" aria-label={t('period.minute')} value={clock.minute} data-time-minute={name}
        onChange={event=>write({...clock,minute:Number(event.target.value)})}>
        {minutes.map(minute=><option key={minute} value={minute}>{minuteWord(minute,digits)}</option>)}
      </select>
    </span>
    <small data-time-word={name}>{common(`dayPeriod.${dayPeriodKey(clock.hour)}`)} {clockWord(hhmm,digits)}</small>
  </span>;
}
