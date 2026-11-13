/** Midnight-to-midnight in Bangladesh time (UTC+06), independent of server timezone. */
export function dhakaDay(now=new Date()):string{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}

export function dhakaToday(now=new Date()){const day=dhakaDay(now);const start=new Date(`${day}T00:00:00+06:00`);return {start,end:new Date(start.getTime()+86400000)};}
