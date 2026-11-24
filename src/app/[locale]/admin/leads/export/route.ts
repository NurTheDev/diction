/**
 * The Visitors report: the list on screen, as a CSV.
 *
 * A GET that answers a file, not a server action, so the operator's browser downloads it and a
 * refresh re-downloads rather than re-posts. The filters are the list's own (`leadListFilter`), so a
 * report is never a second opinion of who is on the list.
 *
 * Three deliberate choices:
 *   • **The numbers are in the file.** This is the one export whose whole purpose is "call these
 *     people", so the spreadsheet carries the normalized number. It is why the door is `getArchiver()`
 *     — the same roles that can already read a number on the list — and why the response is private,
 *     no-store, and audited with its row count.
 *   • **A phone-shaped `q` is refused, not exported.** A number is not a URL parameter in this app
 *     (`leadListQuery` already drops it for the list); exporting on one would reopen that door.
 *   • **Dates and numbers stay machine-readable.** The day strings go out exactly as stored, counts as
 *     bare numbers, and the labels in the operator's language, so Excel can still sort and add.
 */
import {NextResponse} from 'next/server';
import {getTranslations} from 'next-intl/server';
import {getArchiver} from '@/lib/admin/guard';
import {audit} from '@/lib/admin/helpers';
import {dhakaDay} from '@/lib/admin/today';
import {formatClass} from '@/lib/admin/format';
import {checkRateLimit} from '@/lib/rate-limit';
import {CSV_BOM,csvCell} from '@/lib/leads/funnel-csv';
import {groupLabel,mediumLabel,shiftLabel,sourceLabel,statusLabel} from '@/lib/leads/lead-ui';
import {leadListFilter} from '@/lib/leads/leads';
import {leadListQuery,type LeadGroup,type LeadMedium,type LeadShift,type LeadSource,type LeadStatus} from '@/lib/leads/vocab';
import {Lead} from '@/models/Lead';

export const dynamic='force-dynamic';

interface ExportDoc{
  leadId:string;date:string;studentName:string;guardianName?:string;school?:string;
  phones?:{normalized:string;original:string}[];classLabel?:string;classGroup?:number|null;
  group?:LeadGroup;shift?:LeadShift;medium?:LeadMedium;source?:LeadSource;status:LeadStatus;
  doNotContact?:boolean;nextFollowUp?:string|null;interestedIn?:string;
  notes?:{at:Date;text:string;outcome?:string}[];
  admission?:unknown;trialBooking?:unknown;student?:unknown;
}

const first=(value:string|null,allowed:readonly string[]):string=>
  value&&allowed.includes(value)?value:'';

export async function GET(request:Request,{params}:{params:Promise<{locale:string}>}){
  const {locale}=await params;
  const language=locale==='bn'?'bn':'en';
  const user=await getArchiver();
  if(!user)return NextResponse.json({error:'UNAUTHORIZED'},{status:403});
  if(!await checkRateLimit(`lead-export:${user.id}`,20))return NextResponse.json({error:'RATE'},{status:429});

  const url=new URL(request.url);
  const get=(key:string):string=>(url.searchParams.get(key)||'').trim();
  const q=get('q').slice(0,80);
  // A number belongs in an action body, never in a URL — and never in a downloaded file's name.
  if(leadListQuery({q}).refusedPhone)return NextResponse.json({error:'PHONE_SEARCH'},{status:400});

  const t=await getTranslations({locale,namespace:'leads'});
  const followUp=first(get('followUp'),['today','overdue','none']);
  const filter=leadListFilter({
    q,
    status:first(get('status'),['new','called','interested','trial_booked','admitted','not_interested','no_answer','do_not_contact']),
    classGroup:first(get('classGroup'),Array.from({length:12},(_,index)=>String(index+1))),
    group:first(get('group'),['science','arts','commerce','unknown']),
    shift:first(get('shift'),['morning','evening','any']),
    medium:first(get('medium'),['bangla','english_version','unknown']),
    source:first(get('source'),['walk_in','phone','facebook','referral','other']),
    followUp:(followUp||undefined) as 'today'|'overdue'|'none'|undefined,
    from:get('from'),to:get('to'),
    showClosed:get('closed')==='1',stale:get('stale')==='1',
  });
  const docs=await Lead.find(filter).sort({date:-1,createdAt:-1}).limit(5000).lean<ExportDoc[]>();

  const yes=t('report.yes'),no=t('report.no');
  const lastNoteOf=(doc:ExportDoc)=>(doc.notes||[]).slice().sort((a,b)=>(b.at?.getTime()||0)-(a.at?.getTime()||0))[0]||null;
  const contactable=(doc:ExportDoc)=>!(doc.doNotContact===true||doc.status==='do_not_contact');

  const columns=[
    t('leadId'),t('colDate'),t('colVisitor'),t('guardian'),t('row.phone'),t('colClass'),t('school'),
    t('group'),t('shift'),t('medium'),t('source'),t('colStatus'),t('report.colLastCall'),
    t('report.colOutcome'),t('lastNote'),t('colFollowUp'),t('report.contactable'),t('converted'),t('interested'),
  ];
  const rows=docs.map(doc=>{
    const note=lastNoteOf(doc);
    return [
      doc.leadId,doc.date,doc.studentName,doc.guardianName||'',
      doc.phones?.[0]?.normalized||'',
      doc.classGroup?formatClass(doc.classGroup,'en',language,t('colClass')):doc.classLabel||'',
      doc.school||'',groupLabel(t,doc.group||'unknown'),shiftLabel(t,doc.shift||'any'),
      mediumLabel(t,doc.medium||'unknown'),sourceLabel(t,doc.source||'walk_in'),statusLabel(t,doc.status),
      note?dhakaDay(note.at):'',note?note.outcome||'':'',note?note.text:'',
      doc.nextFollowUp||'',contactable(doc)?yes:no,
      doc.admission||doc.trialBooking||doc.student?yes:no,doc.interestedIn||'',
    ];
  });

  const body=`${CSV_BOM}${[columns,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n')}\r\n`;
  await audit(user.id,'lead.export',`rows:${rows.length}`);
  const stamp=dhakaDay(new Date());
  return new NextResponse(body,{
    headers:{
      'Content-Type':'text/csv; charset=utf-8',
      'Content-Disposition':`attachment; filename="diction-visitors-${stamp}.csv"`,
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff',
      'X-Robots-Tag':'noindex, nofollow',
    },
  });
}
