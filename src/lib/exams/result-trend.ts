/**
 * R5 slice 2 · The improvement trend, and the geometry of the chart that draws it.
 *
 * A trend is the one number on a result screen that can be read two ways, so both the series and the
 * coordinates it is drawn at are computed here, purely, and proved in `tests/exam-result-trend.test.ts`:
 * a chart that plots a rise where the register holds a fall is worse than no chart.
 *
 * Two decisions worth naming:
 *
 *   • **An exam the child was absent from is left out of the series.** Their percentage is 0 and plotting
 *     it would draw a fall that never happened — absence is not a score. The row is still in the history
 *     table, marked absent; it is only the line that skips it.
 *   • **The vertical axis is always 0 to 100.** Squeezing the axis to fit the data makes two points a
 *     apart look like a collapse, and a percentage already has a range everybody reads. A small change is
 *     therefore drawn small, and its exact size is printed beside the chart rather than implied by it.
 */
export interface TrendExam{
  id:string;name:string;date:string;
  percentage:number;position:number|null;grade:string;absent:boolean;
}
export interface TrendPoint{id:string;name:string;date:string;percentage:number;position:number|null;grade:string}
export type TrendDirection='up'|'down'|'same'|'none';
export interface TrendSeries{
  points:TrendPoint[];
  /** Latest minus the one before it, in percentage points; null when there is no pair to compare. */
  change:number|null;
  direction:TrendDirection;
  /** The best percentage in the series, and the exam it belongs to — a trend is not only its last step. */
  best:{percentage:number;name:string}|null;
  skippedAbsent:number;
}

/** One date string as a sortable number: `YYYY-MM-DD` compares correctly as text, but a missing or
    malformed date must not reorder a series by accident, so it sorts last rather than first. */
const dateKey=(date:string):number=>{
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date||'').trim());
  return match?Number(match[1])*10000+Number(match[2])*100+Number(match[3]):Number.MAX_SAFE_INTEGER;
};

/** The series a chart draws: published exams the child sat, oldest first, with the step between the last two. */
export function trendOf(exams:TrendExam[]):TrendSeries{
  const sorted=[...exams].sort((a,b)=>dateKey(a.date)-dateKey(b.date)||a.name.localeCompare(b.name,'bn')||a.id.localeCompare(b.id));
  const sat=sorted.filter(exam=>!exam.absent);
  const points:TrendPoint[]=sat.map(exam=>({
    id:exam.id,name:exam.name,date:exam.date,
    percentage:exam.percentage,position:exam.position,grade:exam.grade,
  }));
  if(points.length<2)return {points,change:null,direction:'none',best:bestOf(points),skippedAbsent:sorted.length-sat.length};
  const last=points[points.length-1],before=points[points.length-2];
  const change=Math.round((last.percentage-before.percentage)*100)/100;
  return {
    points,change,
    direction:change>0?'up':change<0?'down':'same',
    best:bestOf(points),
    skippedAbsent:sorted.length-sat.length,
  };
}

function bestOf(points:TrendPoint[]):{percentage:number;name:string}|null{
  if(!points.length)return null;
  const top=points.reduce((best,point)=>point.percentage>best.percentage?point:best,points[0]);
  return {percentage:top.percentage,name:top.name};
}

export interface ChartSize{width:number;height:number;pad:number}
export interface ChartGeometry{
  /** The horizontal line 0 percent would sit on, and the one 100 would: the axis is the whole scale. */
  floor:number;ceiling:number;
  line:string;
  dots:{x:number;y:number;point:TrendPoint}[];
  /** The value labels the chart prints at the top and bottom of the axis, so the scale is never a guess. */
  axis:{min:number;max:number};
}

/**
 * Where the series lands on the drawing. X is evenly spaced — the exams are a sequence, not a timeline, and
 * spacing them by date would crowd three monthly exams and stretch a year between two of them. Y is the
 * percentage of a 0–100 scale mapped into the padded box, so a 0 draws on the floor and a 100 on the
 * ceiling. A single point is centred rather than pinned to the left edge, because a dot on the axis reads as
 * a starting value nobody measured.
 */
export function chartOf(points:TrendPoint[],size:ChartSize):ChartGeometry{
  const {width,height,pad}=size;
  const plotWidth=Math.max(1,width-pad*2),plotHeight=Math.max(1,height-pad*2);
  const floor=height-pad,ceiling=pad;
  const y=(percentage:number):number=>floor-(Math.min(100,Math.max(0,percentage))/100)*plotHeight;
  const x=(index:number):number=>points.length<2?pad+plotWidth/2:pad+(index/(points.length-1))*plotWidth;
  const dots=points.map((point,index)=>({x:Math.round(x(index)*100)/100,y:Math.round(y(point.percentage)*100)/100,point}));
  return {floor,ceiling,line:dots.map((dot,index)=>`${index?'L':'M'}${dot.x} ${dot.y}`).join(' '),dots,axis:{min:0,max:100}};
}
