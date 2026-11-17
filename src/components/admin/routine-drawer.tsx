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
 *
 * Two more things the centre's own paper schedule asked for, both living here so that the week and the
 * day sheet offer one clock rather than two:
 *
 *   • **A period is fifty minutes long and the end follows the start.** The chips name the lengths a
 *     period is offered in — fifty, forty-five, forty, sixty — and while one of them is pressed the end
 *     time is the start plus that length, written by the arithmetic in `lib/routine/time` rather than by
 *     the operator in their head. `Custom` switches the chain off; a period whose own two times match no
 *     chip opens with Custom already on, so nothing is rounded to fit a preset.
 *   • **Both clocks are read at once.** The record stores `HH:MM` on a twenty-four hour clock, and the
 *     field says the time twice: on twelve hours with the part of the day beside it, and on twenty-four
 *     under the name of the clock the record keeps — a sheet printed for a guardian reads one and the
 *     database reads the other. A time can also simply be typed.
 */
import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {useTranslations} from 'next-intl';
import {asciiDigits,formatNumber,type Digits} from '@/lib/admin/format';
import {
  DEFAULT_PERIOD_MINUTES,MINUTE_STEPS,PERIOD_DURATIONS,clock12Word,clockMinutes,clockOfMinutes,clockWord,
  endAfter,hourWord,minuteWord,presetFor,rangeWord,
} from '@/lib/routine/time';
import {dayPeriodKey} from '@/lib/admin/format';
import type {RoutineClash} from '@/lib/routine/conflicts';

/**
 * One clash as the operator reads it: who, where, and the time it landed on. Every routine surface that
 * can answer `clash` — the period drawer, the daily sheet, a bulk tool, a restore — composes its warning
 * with this, so the sentence is the same sentence everywhere.
 */
export function useClashSentence(){
  const t=useTranslations('routine');
  return (clash:RoutineClash,digits:Digits):string=>{
    const params={who:clash.who,otherClass:clash.otherClass,otherSubject:clash.otherSubject,
      time:rangeWord(clash.otherStart,clash.otherEnd,digits)};
    if(clash.kind==='teacher')return t('clashes.teacher',params);
    return t('clashes.room',params);
  };
}

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

/**
 * The length chips, and the length a form is holding.
 *
 * `null` is Custom: both times are the operator's to write and neither follows the other. The number
 * lives in the form's own state and picking a chip calls `onPick`, because a chip is a write to the
 * draft's end time and only the form owns the draft.
 */
export function DurationChips({minutes,digits,onPick}:{
  minutes:number|null;digits:Digits;onPick:(minutes:number|null)=>void;
}){
  const t=useTranslations('routine');
  return <div className="routine-duration" data-duration-chips role="group" aria-label={t('period.duration')}>
    <span className="routine-duration-word" data-duration-label>{t('period.duration')}</span>
    <span className="routine-duration-chips">
      {PERIOD_DURATIONS.map(preset=><button type="button" key={preset}
        className={`routine-chip${minutes===preset?' routine-chip-on':''}`} data-duration-chip={preset}
        aria-pressed={minutes===preset} onClick={()=>onPick(preset)}>
        {t('period.durationMinutes',{minutes:formatNumber(preset,digits)})}
      </button>)}
      <button type="button" className={`routine-chip${minutes===null?' routine-chip-on':''}`}
        data-duration-chip="custom" aria-pressed={minutes===null} onClick={()=>onPick(null)}>
        {t('period.durationCustom')}
      </button>
    </span>
    <small className="admin-help" data-duration-help>
      {minutes===null?t('period.durationCustomHelp'):t('period.durationHelp')}</small>
  </div>;
}

/**
 * The chip a period's own two times press.
 *
 * A drawer opened on a stored period opens on the chip its length names — a forty-five minute period
 * stays forty-five — and one opened on a period no chip describes opens on Custom, so opening a drawer
 * never quietly moves an end time. A new period, which has no times of its own yet, opens on fifty.
 */
export function durationOf(start:string,end:string,fallback:number|null=DEFAULT_PERIOD_MINUTES):number|null{
  const preset=presetFor(start,end);
  if(preset)return preset;
  return clockMinutes(start)>=0&&clockMinutes(end)>=0?null:fallback;
}

/** The end time a start drags along with it, or the end the operator wrote when no chip is pressed. */
export function chainedEnd(start:string,end:string,minutes:number|null):string{
  return minutes?endAfter(start,minutes):end;
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
 *
 * Beside the two selects is a box to type a time into, because an operator who knows a period starts at
 * 09:20 should not have to make two picks to say so. It reads Bangla or ASCII digits, takes `9:20` as
 * readily as `09:20`, and writes the same hidden value the selects write. Text that is not a time yet —
 * the `9:` on the way to `9:20` — is left alone rather than refused mid-typing.
 */
export function TimeField({name,value,digits,onChange}:{
  name:string;value:string;digits:Digits;onChange?:(value:string)=>void;
}){
  const t=useTranslations('routine'),common=useTranslations('common');
  const [clock,setClock]=useState(()=>split(value));
  const [lastValue,setLastValue]=useState(value);
  const [typed,setTyped]=useState('');
  useEffect(()=>{
    if(value===lastValue)return;
    setClock(split(value));
    setLastValue(value);
    setTyped('');
  },[value,lastValue]);
  const write=(next:{hour:number;minute:number}):void=>{
    setClock(next);
    const written=clockOfMinutes(next.hour*60+next.minute);
    onChange?.(written);
  };
  /* A typed time is folded to ASCII digits first — a schedule copied out of a Bangla spreadsheet writes
     the same clock in Bangla digits — and is acted on only once it is a whole clock, so half a keystroke
     changes nothing. */
  const onTyped=(text:string):void=>{
    setTyped(text);
    const match=/^([01]?\d|2[0-3]):([0-5]\d)$/.exec(asciiDigits(text).trim());
    if(match)write({hour:Number(match[1]),minute:Number(match[2])});
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
    <span className="routine-time-typed">
      <input className="admin-input" data-time-typed={name} inputMode="numeric" maxLength={5}
        placeholder="09:20" value={typed} aria-label={t('period.typedTime')}
        title={t('period.typedTimeHelp')} onChange={event=>onTyped(event.target.value)}/>
    </span>
    <small className="routine-time-clocks">
      <span data-time-word={name}>
        {t('period.clock12')}: {common(`dayPeriod.${dayPeriodKey(clock.hour)}`)} {clock12Word(hhmm,digits)}
      </span>
      <span data-time-24={name}>{t('period.clock24')}: {clockWord(hhmm,digits)}</span>
    </small>
  </span>;
}
