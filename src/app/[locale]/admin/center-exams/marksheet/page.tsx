import mongoose from 'mongoose';
import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {dashboardDigits} from '@/lib/admin/digits';
import {formatDate,formatNumber} from '@/lib/admin/format';
import {getExamScope} from '@/lib/exams/exam-actor';
import {scopeCoversClass} from '@/lib/exams/exam-scope';
import {CenterClassGroup,CenterExam,CenterExamResult,CenterStudent} from '@/models/CenterRecords';
import {buildMarksheet,marksheetMonths,type MarksheetExam,type MarksheetStudent} from '@/lib/exams/marksheet';
import {MarksheetPrintButton} from '@/components/exams/marksheet-print';

export const dynamic='force-dynamic';
type Group={_id:mongoose.Types.ObjectId;name:{bn:string;en?:string};academicYear:number;shift?:string};
type ExamRow={_id:mongoose.Types.ObjectId;name:{bn:string;en?:string};date:string;subjects:{fullMarks:number}[]};
type RollRow={_id:mongoose.Types.ObjectId;name:{bn:string;en?:string};studentId:string;roll?:string};
type ResultRow={_id:mongoose.Types.ObjectId;exam:mongoose.Types.ObjectId;student:mongoose.Types.ObjectId;
  total:number;fullTotal:number;marks:{absent:boolean}[]};

/**
 * Group 3 · the monthly consolidated marksheet: one class, one month, every exam held in it.
 *
 * The centre's month ends with a piece of paper. Each exam already had its own results table, so
 * answering "how did this class do in November?" meant opening four screens and adding them up by hand —
 * which is how a position ends up being somebody's opinion rather than the sheet's arithmetic. So the
 * month gets one table: every student on the roll down the side, every published exam of that month
 * across the top, the marks possible and obtained beside them, and the position that follows.
 *
 * The counting lives in `src/lib/exams/marksheet.ts`, where the rule can be read in one place: an exam
 * counts toward a student's possible total when they have a published result for it, absence counts as a
 * result worth zero, an exam nobody has marks for yet is printed but not counted, and equal totals share
 * a position with the next one skipped — the same positions the published results already carry.
 *
 * A teacher sees only the classes assigned to them, because the sheet is the exam screen's own read of
 * the centre and not a wider door into it.
 */
export default async function MonthlyMarksheet({params,searchParams}:{
  params:Promise<{locale:string}>;searchParams:Promise<{class?:string;month?:string}>;
}){
  const t=await getTranslations('exams');
  const scope=await getExamScope();
  const {locale}=await params;
  const bn=locale!=='en';
  const query=await searchParams;
  if(!scope)return <p className="admin-empty">{t('marksheet.noAccess')}</p>;
  const digits=await dashboardDigits(scope.userId);
  const months=marksheetMonths();
  const groups=await CenterClassGroup.find({active:true}).select('name academicYear shift')
    .sort({academicYear:-1,order:1,'name.bn':1}).limit(200).lean<Group[]>();
  const choices=groups.filter(group=>scopeCoversClass(scope,group._id));
  const classId=String(query.class||'');
  const chosen=choices.find(group=>String(group._id)===classId);
  const asked=String(query.month||'');
  const picked=months.find(entry=>`${entry.year}-${String(entry.month).padStart(2,'0')}`===asked)||months[0];
  const monthName=new Intl.DateTimeFormat(bn?'bn-BD':'en-GB',{month:'long',year:'numeric',timeZone:'Asia/Dhaka'})
    .format(new Date(Date.UTC(picked.year,picked.month-1,1)));
  const label=(name:{bn:string;en?:string}):string=>(bn?name.bn:name.en)||name.bn;

  /* Nothing is read until a class and a month are both chosen: the sheet is one class's month, and a
     centre-wide marksheet would be a table nobody can print. */
  let sheet=null,exams:MarksheetExam[]=[],className='',studentsCount=0;
  if(chosen){
    const lastDay=new Date(Date.UTC(picked.year,picked.month,0)).getUTCDate();
    const from=`${picked.year}-${String(picked.month).padStart(2,'0')}-01`;
    const to=`${picked.year}-${String(picked.month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    const [examRows,roll]=await Promise.all([
      CenterExam.find({classGroups:chosen._id,status:'published',date:{$gte:from,$lte:to}})
        .select('name date subjects').sort({date:1,_id:1}).limit(40).lean<ExamRow[]>(),
      CenterStudent.find({classGroup:chosen._id,status:'active'}).select('name studentId roll')
        .sort({roll:1,'name.bn':1,_id:1}).limit(600).lean<RollRow[]>(),
    ]);
    exams=examRows.map(exam=>({id:String(exam._id),name:label(exam.name),date:exam.date,
      possible:exam.subjects.reduce((sum,subject)=>sum+(Number(subject.fullMarks)||0),0)}));
    studentsCount=roll.length;
    const results=exams.length&&roll.length
      ? await CenterExamResult.find({exam:{$in:exams.map(exam=>exam.id)},student:{$in:roll.map(entry=>entry._id)}})
        .select('exam student total fullTotal marks').limit(20000).lean<ResultRow[]>()
      : [];
    const byStudent=new Map<string,Record<string,{obtained:number;possible:number;absent:boolean}>>();
    for(const result of results){
      const exam=exams.find(entry=>entry.id===String(result.exam));
      if(!exam)continue;
      const key=String(result.student);
      const absent=(result.marks||[]).length>0&&(result.marks||[]).every(mark=>mark.absent);
      const cells=byStudent.get(key)||{};
      cells[exam.id]={obtained:Number(result.total)||0,possible:Number(result.fullTotal)||exam.possible,absent};
      byStudent.set(key,cells);
    }
    const students:MarksheetStudent[]=roll.map(entry=>({
      id:String(entry._id),name:label(entry.name),studentId:entry.studentId,roll:entry.roll||'',
      results:byStudent.get(String(entry._id))||{},
    }));
    sheet=buildMarksheet(exams,students);
    className=label(chosen.name);
  }
  const ordinal=(rank:number|null,tied:boolean):string=>{
    if(rank===null)return '—';
    const word=rank===1?t('marksheet.rank.first'):rank===2?t('marksheet.rank.second'):rank===3?t('marksheet.rank.third')
      :t('marksheet.rank.other',{n:formatNumber(rank,digits)});
    return tied?`${word} · ${t('marksheet.rank.joint')}`:word;
  };

  return <>
    <div className="admin-heading">
      <div>
        <Link href="/admin/center-exams" className="text-link">← {t('marksheet.crumb')}</Link>
        <h1 data-marksheet-title>{t('marksheet.title')}</h1>
        <p className="admin-help">{t('marksheet.help')}</p>
      </div>
    </div>

    <section className="admin-panel">
      <div className="admin-panel-head"><h2>{t('marksheet.chooseHeading')}</h2></div>
      <div className="admin-panel-body">
        <form method="get" className="admin-filter report-filters" data-marksheet-form>
          <label><span>{t('marksheet.classLabel')}</span>
            <select name="class" className="admin-select" required defaultValue={chosen?String(chosen._id):''}>
              <option value="">{t('marksheet.chooseClass')}</option>
              {choices.map(group=><option key={String(group._id)} value={String(group._id)}>
                {label(group.name)}{group.shift?` · ${group.shift}`:''} · {formatNumber(group.academicYear,digits)}
              </option>)}
            </select></label>
          <label><span>{t('marksheet.monthLabel')}</span>
            <select name="month" className="admin-select" defaultValue={`${picked.year}-${String(picked.month).padStart(2,'0')}`}>
              {months.map(entry=><option key={`${entry.year}-${entry.month}`} value={`${entry.year}-${String(entry.month).padStart(2,'0')}`}>
                {new Intl.DateTimeFormat(bn?'bn-BD':'en-GB',{month:'long',year:'numeric',timeZone:'Asia/Dhaka'})
                  .format(new Date(Date.UTC(entry.year,entry.month-1,1)))}
              </option>)}
            </select></label>
          <button type="submit" className="button button-navy" data-marksheet-show>{t('marksheet.show')}</button>
        </form>
        {!choices.length&&<p className="admin-feedback error">{t('marksheet.noClasses')}</p>}
      </div>
    </section>

    {chosen&&sheet&&<section className="admin-panel">
      <div className="admin-panel-head">
        <h2 data-marksheet-heading>{t('marksheet.sheetHeading',{class:className,month:monthName})}</h2>
        <span data-marksheet-count>{t('marksheet.counts',{students:formatNumber(studentsCount,digits),exams:formatNumber(sheet.held,digits)})}</span>
      </div>
      <div className="admin-panel-body">
        <div className="report-toolbar">
          <MarksheetPrintButton/>
          {chosen&&<Link className="admin-mini-button" href={`/admin/students/classes/${String(chosen._id)}`}>{t('marksheet.openClass')}</Link>}
        </div>
        <p className="admin-help">{t('marksheet.ruleNote')}</p>
        {!sheet.held
          ? <p className="admin-empty" data-marksheet-none>{t('marksheet.noExams',{month:monthName})}</p>
          : <div className="report-print admin-table-wrap" data-marksheet>
              <p className="report-brand" data-marksheet-brand>{t('marksheet.reportTitle')}</p>
              <h3 className="report-sheet-title">{className} · {monthName}</h3>
              <table className="admin-table matrix-table" data-marksheet-table>
                <thead><tr>
                  <th scope="col">{t('marksheet.col.student')}</th>
                  {sheet.exams.map(exam=><th scope="col" key={exam.id} data-marksheet-exam={exam.id}>
                    {exam.name}<small>{formatDate(exam.date,digits,bn?'bn':'en')} · {formatNumber(exam.possible,digits)}</small>
                  </th>)}
                  <th scope="col">{t('marksheet.col.possible')}</th>
                  <th scope="col">{t('marksheet.col.obtained')}</th>
                  <th scope="col">{t('marksheet.col.percentage')}</th>
                  <th scope="col">{t('marksheet.col.rank')}</th>
                </tr></thead>
                <tbody>{sheet.rows.map(row=><tr key={row.student.id} data-marksheet-row={row.student.id}>
                  <th scope="row">{row.student.name}<small>{row.student.studentId}{row.student.roll?` · ${t('marksheet.rollWord')} ${row.student.roll}`:''}</small></th>
                  {sheet.exams.map(exam=>{
                    const cell=row.cells[exam.id];
                    return <td key={exam.id} data-marksheet-cell={exam.id}>
                      {!cell?'—':cell.absent?t('grades.absent')
                        :`${formatNumber(cell.obtained,digits)}/${formatNumber(cell.possible,digits)}`}
                    </td>;
                  })}
                  <td data-marksheet-possible>{row.possible?formatNumber(row.possible,digits):'—'}</td>
                  <td data-marksheet-obtained>{row.possible?formatNumber(row.obtained,digits):'—'}</td>
                  <td data-marksheet-percentage>{row.percentage===null?'—':formatNumber(row.percentage,digits)}</td>
                  <td data-marksheet-rank>{ordinal(row.rank,row.tied)}</td>
                </tr>)}</tbody>
                <tfoot><tr>
                  <th scope="row">{t('marksheet.footStudents',{count:formatNumber(sheet.rows.length,digits)})}</th>
                  {sheet.exams.map(exam=><td key={exam.id}>{formatNumber(exam.possible,digits)}</td>)}
                  <td>{formatNumber(sheet.totalPossible,digits)}</td>
                  <td>{formatNumber(sheet.rows.reduce((sum,row)=>sum+row.obtained,0),digits)}</td>
                  <td colSpan={2}>{t('marksheet.footNote')}</td>
                </tr></tfoot>
              </table>
            </div>}
      </div>
    </section>}
  </>;
}
