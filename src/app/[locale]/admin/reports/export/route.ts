/**
 * R6 slice 1 — one export door for every report table: `?kind=daily|monthly|audit|ledger|year` and
 * `format=csv|xlsx`. The same loaders the screens read, the same catalogs the screens read for the
 * header words, and the two formats the export engine guarantees: a CSV whose cells are all quoted
 * with formula-like ones prefixed, and an `.xlsx` whose text cells are inline strings no spreadsheet
 * will ever evaluate.
 *
 * A GET that answers a file, not a server action: the operator's browser downloads it, a cron or a
 * script can fetch it with a session cookie, and a refresh re-downloads rather than re-posts.
 */
import {NextResponse} from 'next/server';
import {getTranslations} from 'next-intl/server';
import mongoose from 'mongoose';
import {getArchiver} from '@/lib/admin/guard';
import {dhakaCalendar} from '@/lib/center/month-status';
import {CSV_MIME,XLSX_MIME,csvOf,xlsxOf,type SheetCell} from '@/lib/reports/export';
import {loadDailyReport} from '@/lib/reports/collections-data';
import {loadMonthlyReport} from '@/lib/reports/collections-data';
import {loadReceiptAudit} from '@/lib/reports/receipt-audit-data';
import {loadStudentStatement} from '@/lib/reports/ledger-data';
import {loadYearSummary} from '@/lib/reports/year-summary-data';
import {ledgerKindLabelKey,typeLabelKey} from '@/lib/reports/vocab';

export const dynamic='force-dynamic';

type Built={title:string;header:string[];rows:SheetCell[][]};

async function build(kind:string,url:URL,locale:string,t:Awaited<ReturnType<typeof getTranslations>>):Promise<Built|null>{
  if(kind==='daily'){
    const date=/^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date')||'')?url.searchParams.get('date')!:'';
    if(!date)return null;
    const operator=url.searchParams.get('operator');
    const {breakdown}=await loadDailyReport({date,operatorId:operator&&mongoose.isValidObjectId(operator)?operator:null,locale});
    return {
      title:`${t('daily.title')} ${date}`,
      header:[t('daily.receipt'),t('daily.student'),t('daily.class'),t('daily.type'),t('daily.month'),t('daily.amount'),t('daily.operator'),t('daily.note')],
      rows:breakdown.rows.map(row=>[row.receiptNo,row.studentName,row.classLabel,t(typeLabelKey(row.type)),row.monthKey||'',row.amount,row.operatorName,row.note]),
    };
  }
  if(kind==='monthly'){
    const year=Number(url.searchParams.get('year')||''),month=Number(url.searchParams.get('month')||'');
    if(!Number.isInteger(year)||year<1900||year>2200||!Number.isInteger(month)||month<1||month>12)return null;
    const {matrix}=await loadMonthlyReport({year,month,locale});
    const rows:SheetCell[][]=matrix.classLabels.map((label,classIndex)=>[
      label,...matrix.cells[classIndex],matrix.classTotals[classIndex]]);
    rows.push([t('monthly.total'),...matrix.dayTotals,matrix.grand]);
    return {
      title:`${t('monthly.title')} ${year}-${String(month).padStart(2,'0')}`,
      header:[t('monthly.classColumn'),...Array.from({length:matrix.daysInMonth},(_,index)=>String(index+1)),t('monthly.total')],
      rows,
    };
  }
  if(kind==='audit'){
    const audit=await loadReceiptAudit();
    const rows:SheetCell[][]=[
      ...audit.duplicates.map(duplicate=>[
        t('audit.duplicates'),duplicate.receiptNo,duplicate.count,
        duplicate.rows.map(row=>row.studentName).join('; '),
        duplicate.rows.map(row=>row.paidOn).join('; ')]),
      ...audit.gaps.map(gap=>[
        t('audit.gaps'),`${gap.from}-${gap.to}`,gap.missingCount,
        t('audit.between',{before:gap.after.receiptNo,after:gap.before.receiptNo}),
        `${gap.after.studentName}; ${gap.before.studentName}`]),
    ];
    return {title:t('audit.title'),header:[t('statement.kind'),t('audit.receipt'),t('year.students'),t('statement.detail'),t('statement.date')],rows};
  }
  if(kind==='ledger'){
    const student=url.searchParams.get('student')||'';
    if(!mongoose.isValidObjectId(student))return null;
    const view=await loadStudentStatement(student,locale);
    if(!view)return null;
    return {
      title:`${t('statement.title')} ${view.student.studentId}`,
      header:[t('statement.date'),t('statement.kind'),t('statement.detail'),t('statement.amount'),t('statement.running')],
      rows:view.statement.entries.map(entry=>{
        const detail=entry.kind==='assessment'?t('statement.assessmentDetail',{month:entry.monthKey||''})
          :entry.kind==='waiver'?t('statement.waiverDetail',{reason:entry.reason||''})
          :entry.kind==='hold'?t('statement.holdDetail',{month:entry.monthKey||''})
          :entry.kind==='payment'?t('statement.paymentDetail',{receipt:entry.receiptNo})
          :t('statement.extraDetail',{type:t(typeLabelKey(entry.typeCode)),other:entry.otherLabel});
        return [entry.date,t(ledgerKindLabelKey(entry.kind)),detail,entry.amount,entry.runningDue];
      }),
    };
  }
  if(kind==='year'){
    const year=Number(url.searchParams.get('year')||'');
    if(!Number.isInteger(year)||year<1900||year>2200)return null;
    const summary=await loadYearSummary(year,locale);
    const rows:SheetCell[][]=summary.classes.map(row=>[
      row.classLabel,row.students,row.expected,row.collected,row.outstanding,row.pending,row.waived,row.extras]);
    rows.push([t('year.totals'),summary.totals.students,summary.totals.expected,summary.totals.collected,
      summary.totals.outstanding,summary.totals.pending,summary.totals.waived,summary.totals.extras]);
    return {
      title:`${t('year.title')} ${year}`,
      header:[t('year.classColumn'),t('year.students'),t('year.expected'),t('year.collected'),t('year.outstanding'),t('year.pending'),t('year.waived'),t('year.extras')],
      rows,
    };
  }
  return null;
}

export async function GET(request:Request,{params}:{params:Promise<{locale:string}>}){
  const {locale}=await params;
  const admin=await getArchiver();
  if(!admin)return NextResponse.json({error:'UNAUTHORIZED'},{status:403});
  const url=new URL(request.url);
  const kind=url.searchParams.get('kind')||'';
  const format=url.searchParams.get('format')==='xlsx'?'xlsx':'csv';
  const t=await getTranslations({locale,namespace:'reports'});
  const built=await build(kind,url,locale,t);
  if(!built)return NextResponse.json({error:'UNKNOWN_REPORT'},{status:404});
  const today=dhakaCalendar(new Date());
  const stamp=`${today.year}-${String(today.month).padStart(2,'0')}-${String(today.day).padStart(2,'0')}`;
  const filename=`diction-${kind}-${stamp}.${format}`;
  const headers={'Content-Disposition':`attachment; filename="${filename}"`};
  if(format==='xlsx'){
    const bytes=xlsxOf(built.title,built.header,built.rows);
    const body=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength) as unknown as BodyInit;
    return new NextResponse(body,{headers:{...headers,'Content-Type':XLSX_MIME}});
  }
  /* Title row first, exactly as in the workbook, so a CSV opened cold still says what it is. */
  return new NextResponse(csvOf([built.title],[built.header,...built.rows]),
    {headers:{...headers,'Content-Type':CSV_MIME}});
}
