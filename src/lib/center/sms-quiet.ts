/**
 * Quiet hours (R2). Pure module: the window is evaluated in Asia/Dhaka, because that is the
 * institute's operating timezone and the same basis src/lib/center/month-status.ts uses.
 *
 * The default window is 21:00 → 07:00, which crosses midnight, so a naive `start<=t&&t<end`
 * comparison would be wrong for most of the night. Both orders are handled here and unit-tested.
 */

export const DEFAULT_QUIET_START='21:00';
export const DEFAULT_QUIET_END='07:00';

const CLOCK=/^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Minutes after midnight, or null for anything that is not HH:MM. Never guesses a time. */
export function parseClock(value:string|undefined|null):number|null{
  const text=String(value||'').trim();
  const match=text.match(CLOCK);
  if(!match)return null;
  return Number(match[1])*60+Number(match[2]);
}

function dhakaMinutes(now:Date):number{
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(now);
  const hour=Number(parts.find(p=>p.type==='hour')?.value);
  const minute=Number(parts.find(p=>p.type==='minute')?.value);
  // en-GB with hour12:false can render midnight as "24".
  return ((hour%24)*60)+(Number.isFinite(minute)?minute:0);
}

/**
 * True when `now` falls inside the quiet window. An invalid or empty setting disables quiet hours
 * rather than blocking every send; a window whose start equals its end is treated as empty.
 */
export function inQuietHours(quietStart:string|undefined,quietEnd:string|undefined,now:Date=new Date()):boolean{
  const start=parseClock(quietStart??DEFAULT_QUIET_START),end=parseClock(quietEnd??DEFAULT_QUIET_END);
  if(start===null||end===null)return false;
  if(start===end)return false;
  const current=dhakaMinutes(now);
  return start<end?current>=start&&current<end:current>=start||current<end;
}

/**
 * When the next send window opens, in Dhaka time. Used to tell a queued batch when it may flush,
 * and to show the operator "queued until 07:00" instead of a silent no-op.
 */
export function quietUntilLabel(quietEnd:string|undefined):string{
  const end=parseClock(quietEnd??DEFAULT_QUIET_END);
  if(end===null)return DEFAULT_QUIET_END;
  return `${String(Math.floor(end/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}`;
}

/** Milliseconds from `now` until the quiet window closes (0 when not quiet). */
export function msUntilQuietEnds(quietStart:string|undefined,quietEnd:string|undefined,now:Date=new Date()):number{
  if(!inQuietHours(quietStart,quietEnd,now))return 0;
  const end=parseClock(quietEnd??DEFAULT_QUIET_END);
  if(end===null)return 0;
  const current=dhakaMinutes(now);
  const delta=(end-current+1440)%1440;
  return delta*60*1000;
}
