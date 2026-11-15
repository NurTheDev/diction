/**
 * R5 slice 2 · One student's results, as the three things a reader actually wants: the table of past
 * exams, the trend across them, and the way into a printable report card.
 *
 * A server component on purpose. It is rendered by an admin profile and by two portal routes, and every
 * word it paints comes from `getTranslations` on the server, so no provider has to be shipped to a portal
 * tree for it and no client bundle carries the catalog group it reads. The chart is drawn as SVG for the
 * same reason: a trend that has to be printable, and that a screenshot has to prove, is not a chart
 * library's job.
 *
 * The numbers come from the reader, never recomputed here — `src/lib/exams/student-results.ts` quotes the
 * stored rows, so a report card and the exam's own result table cannot disagree about a total.
 */
import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {formatDate,formatNumber,type Digits} from '@/lib/admin/format';
import {chartOf} from '@/lib/exams/result-trend';
import {EXAM_TYPE_LABEL_KEYS,type ExamType} from '@/lib/exams/vocab';
import type {StudentResult,StudentResultHistory} from '@/lib/exams/student-results';

const CHART={width:680,height:210,pad:34};

/** The mark in one subject: its own number against its own full mark, or the word for absence. */
function SubjectMarks({result,digits,absentWord}:{result:StudentResult;digits:Digits;absentWord:string}){
  return <ul className="result-subjects" data-result-subjects={result.examId}>
    {result.subjects.map(subject=>(
      <li key={subject.name}>
        <span>{subject.name}</span>
        {subject.absent||subject.obtained===null
          ? <em data-subject-absent>{absentWord}</em>
          : <b>{formatNumber(subject.obtained,digits)}/{formatNumber(subject.full,digits)}</b>}
      </li>
    ))}
  </ul>;
}

/**
 * The history table: one row per published exam, newest first, with that exam's own subjects inside it.
 * Subjects stay inside the row rather than getting a row each, because the question a parent asks is
 * "how did this exam go", and twenty rows of one subject each answers a different one.
 */
export async function ResultHistory({history,digits,language,reportHref}:{
  history:StudentResultHistory;digits:Digits;language:'bn'|'en';reportHref:(examId:string)=>string;
}){
  const t=await getTranslations('exams');
  const absentWord=t('grades.absent');
  return <>
    <section className="admin-panel" data-result-history>
      <div className="admin-panel-head">
        <h2>{t('results.title')}</h2>
        <span data-result-count>{formatNumber(history.results.length,digits)}</span>
      </div>
      <p className="admin-help">{t('results.publishedOnly')}</p>
      {history.results.length===0
        ? <p className="portal-empty" data-result-empty>{t('results.empty')}</p>
        : <div className="admin-table-wrap">
            <table className="admin-table" data-result-table>
              <thead><tr>
                <th>{t('col.exam')}</th><th>{t('col.date')}</th><th>{t('col.class')}</th>
                <th>{t('col.subject')}</th><th>{t('col.total')}</th><th>{t('col.percentage')}</th>
                <th>{t('col.grade')}</th><th>{t('col.rank')}</th><th>{t('results.report')}</th>
              </tr></thead>
              <tbody>
                {history.results.map(result=>(
                  <tr key={result.examId} data-result-row={result.examId}>
                    <td>{result.name}<br/><small>{t(EXAM_TYPE_LABEL_KEYS[result.type as ExamType]||'typeLabels.other')}</small></td>
                    <td>{formatDate(result.date,digits,language)}</td>
                    <td>{result.className||'—'}</td>
                    <td><SubjectMarks result={result} digits={digits} absentWord={absentWord}/></td>
                    <td data-result-total>{result.absent?'—':`${formatNumber(result.total,digits)}/${formatNumber(result.fullTotal,digits)}`}</td>
                    <td data-result-percent>{result.absent?'—':formatNumber(Math.round(result.percentage*100)/100,digits)}</td>
                    <td data-result-grade>{result.grade}</td>
                    <td data-result-position>{result.position?formatNumber(result.position,digits):t('results.positionNone')}</td>
                    <td><Link className="admin-mini-button" href={reportHref(result.examId)} data-report-link={result.examId}>{t('results.reportLink')}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
    </section>
    <ResultTrend history={history} digits={digits} language={language}/>
  </>;
}

/**
 * The improvement trend: percentage across consecutive published exams, oldest on the left.
 *
 * The axis is the whole 0–100 scale and not the data's own neighbourhood, so a two-point rise is drawn as
 * the small thing it is; the exact size of the step is printed beside it. An exam the student was absent
 * from is left out of the line — absence is not a score, and plotting it as 0 would draw a fall that never
 * happened — but the count of skipped exams is said out loud rather than hidden.
 */
export async function ResultTrend({history,digits,language}:{history:StudentResultHistory;digits:Digits;language:'bn'|'en'}){
  const t=await getTranslations('exams');
  const {trend}=history;
  if(trend.points.length<2){
    return <section className="admin-panel" data-result-trend>
      <div className="admin-panel-head"><h2>{t('results.trendTitle')}</h2></div>
      <p className="portal-empty" data-trend-empty>{t('results.trendEmpty')}</p>
    </section>;
  }
  const chart=chartOf(trend.points,CHART);
  const word=trend.direction==='up'?t('results.up'):trend.direction==='down'?t('results.down'):t('results.same');
  return <section className="admin-panel" data-result-trend>
    <div className="admin-panel-head">
      <h2>{t('results.trendTitle')}</h2>
      <span data-trend-change>{word}{trend.change!==null?` ${trend.change>0?'+':''}${formatNumber(trend.change,digits)}`:''}</span>
    </div>
    <p className="admin-help">{t('results.trendHelp')}</p>
    <div className="admin-panel-body">
      <figure className="result-trend-figure">
        <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} className="result-trend" role="img"
          aria-label={`${t('results.trendTitle')} — ${t('results.axisPercent')} ${formatNumber(chart.axis.min,digits)}–${formatNumber(chart.axis.max,digits)}`}
          data-trend-chart>
          <line x1={CHART.pad} y1={chart.ceiling} x2={CHART.width-CHART.pad} y2={chart.ceiling} className="trend-grid"/>
          <line x1={CHART.pad} y1={chart.floor} x2={CHART.width-CHART.pad} y2={chart.floor} className="trend-axis"/>
          <text x={CHART.pad-6} y={chart.ceiling+4} textAnchor="end" className="trend-tick">{formatNumber(chart.axis.max,digits)}</text>
          <text x={CHART.pad-6} y={chart.floor+4} textAnchor="end" className="trend-tick">{formatNumber(chart.axis.min,digits)}</text>
          <text x={6} y={CHART.height/2} className="trend-tick" transform={`rotate(-90 6 ${CHART.height/2})`} textAnchor="middle">{t('results.axisPercent')}</text>
          <path d={chart.line} className="trend-line" fill="none"/>
          {chart.dots.map(dot=>(
            <g key={dot.point.id} data-trend-point={dot.point.id}>
              <circle cx={dot.x} cy={dot.y} r={4} className="trend-dot"/>
              <text x={dot.x} y={dot.y-10} textAnchor="middle" className="trend-value">{formatNumber(Math.round(dot.point.percentage*100)/100,digits)}</text>
              {/* The date under a dot is chrome, not data: it takes the page's language, so an English
                  screen reads an English month and the language sweep can prove it. */}
              <text x={dot.x} y={chart.floor+16} textAnchor="middle" className="trend-label">{formatDate(dot.point.date,digits,language)}</text>
              <title>{t('results.chartPoint',{exam:dot.point.name,percentage:formatNumber(Math.round(dot.point.percentage*100)/100,digits),position:dot.point.position?formatNumber(dot.point.position,digits):t('results.positionNone')})}</title>
            </g>
          ))}
        </svg>
        <figcaption data-trend-caption>
          {trend.best?`${t('summary.highest')}: ${formatNumber(trend.best.percentage,digits)} · ${trend.best.name}`:''}
          {trend.skippedAbsent?` · ${t('grades.absent')}: ${formatNumber(trend.skippedAbsent,digits)}`:''}
        </figcaption>
      </figure>
    </div>
  </section>;
}
