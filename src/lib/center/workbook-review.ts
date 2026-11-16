import type {ImportPreview} from './import-preview';
import type {MessageRef} from './import-message';
export type Choices=Record<string,string>;
export type ReviewCell={sheet:string;row:number;name:string;slot:number;receipt:string;rawAmount:number;classification:'proposed'|'excluded'|'pending';reasons:MessageRef[];conflicts:MessageRef[];shared:boolean};
/** The reasons that mean “somebody still has to decide”. `compileWorkbook` refuses to plan a row that carries one, and it checks these keys rather than the Bangla sentence, so the wording can change without the gate moving. */
export const PENDING_REASON_KEYS=new Set(['rowDecisionPending','holdDetailsPending','redCellPending','redTextPending','donePending','doneAmountPending','aPending','incompletePending','manualAmountPending','colorUncertain','formulaPending','redAdmissionUndecided']);
const ascii=(s:string)=>s.replace(/[\u09e6-\u09ef]/g,c=>String(c.charCodeAt(0)-0x09e6)).normalize('NFKC').trim();
const numeric=(s:string)=>/^\d+$/.test(ascii(s));
export const reviewKey=(sheet:string,row:number,type:string,slot=-1)=>JSON.stringify([sheet,row,type,slot]);
const key=(sheet:string,row:number,type:string,slot=-1)=>reviewKey(sheet,row,type,slot);
export function reviewWorkbook(tabs:ImportPreview[],choices:Choices){
 const owners=new Map<string,Map<string,{sheet:string,row:number,name:string}>>();
 for(const tab of tabs)for(const row of tab.rows)for(const c of [row.admission,...row.months])if(!(row.redRow&&choices[key(tab.sheet,row.row,'row')]==='skip')&&numeric(c.receipt)){const n=ascii(c.receipt),id=JSON.stringify([tab.sheet,row.row]);let list=owners.get(n);if(!list){list=new Map();owners.set(n,list)}list.set(id,{sheet:tab.sheet,row:row.row,name:row.name})}
 const entries:ReviewCell[]=[];
 for(const tab of tabs)for(const row of tab.rows){const rowId=JSON.stringify([tab.sheet,row.row]),rowDecision=choices[key(tab.sheet,row.row,'row')];for(const [slot,c] of [row.admission,...row.months].entries()){
  const n=numeric(c.receipt)?ascii(c.receipt):'',list=n?[...(owners.get(n)?.values()||[])]:[],shared=list.length>1,ownIndex=list.findIndex(x=>JSON.stringify([x.sheet,x.row])===rowId),sharedDecision=choices[key(tab.sheet,row.row,'shared',slot)]||(ownIndex<=0?'keep':'skip');
  const rawAmount=numeric(c.amount)?Number(ascii(c.amount)):0;if(!Number.isSafeInteger(rawAmount))throw Error('unsafe amount');const reasons:MessageRef[]=[],pending:MessageRef[]=[],excluded:MessageRef[]=[];
  if(row.redRow){if(!rowDecision)pending.push({key:'rowDecisionPending'});else if(rowDecision==='skip')excluded.push({key:'ownerSkipped'});else if(rowDecision==='removed')reasons.push({key:'removedAccounting'});else if(rowDecision==='hold'){const start=choices[key(tab.sheet,row.row,'hold-start')],reason=choices[key(tab.sheet,row.row,'hold-reason')];if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(start||'')||!reason?.trim())pending.push({key:'holdDetailsPending'});else reasons.push({key:'hold',params:{start:String(start),reason:String(reason)}})}}
  if(!row.redRow&&c.redFill&&slot>0){const v=choices[key(tab.sheet,row.row,'red',slot)];if(!v)pending.push({key:'redCellPending'});else excluded.push({key:v==='due'?'redCellDue':v==='waive'?'redCellWaive':'redCellAbsent'})}
  if(!row.redRow&&c.redFill&&slot===0)pending.push({key:'redAdmissionUndecided'});
  if((c.redText&&(c.receipt||c.amount))||((slot===0)&&row.redText)){const v=choices[key(tab.sheet,row.row,'text',slot)];if(!v)pending.push({key:'redTextPending'});else if(v==='note')reasons.push({key:'redTextNote'})}
  if(c.uncertainColor)pending.push({key:'colorUncertain'});if(c.formula)pending.push({key:'formulaPending'});
  const done=slot===0&&[c.receipt,c.amount].some(x=>x.trim().toLowerCase()==='done'),a=slot>0&&[c.receipt,c.amount].some(x=>x.trim().toLowerCase()==='a');
  if(done){const v=choices[key(tab.sheet,row.row,'done',slot)];if(!v)pending.push({key:'donePending'});else if(v==='note')excluded.push({key:'doneNoteOnly'});else if(!/^\d+$/.test(ascii(choices[key(tab.sheet,row.row,'manual',slot)]||''))||Number(ascii(choices[key(tab.sheet,row.row,'manual',slot)]||''))<=0)pending.push({key:'doneAmountPending'});else reasons.push({key:'doneManualAdmission'})}
  if(a){const v=choices[key(tab.sheet,row.row,'a',slot)];if(!v)pending.push({key:'aPending'});else excluded.push({key:v==='waive'?'aWaive':v==='absent'?'aAbsent':'aSkip'})}
  if(!done&&!a&&((!!c.receipt)!=(!!c.amount))){const v=choices[key(tab.sheet,row.row,'incomplete',slot)];if(!v)pending.push({key:'incompletePending'});else if(v==='skip')excluded.push({key:'incompleteSkipped'});else if(!c.amount&&(!/^\d+$/.test(ascii(choices[key(tab.sheet,row.row,'manual',slot)]||''))||Number(ascii(choices[key(tab.sheet,row.row,'manual',slot)]||''))<=0))pending.push({key:'manualAmountPending'});else reasons.push({key:'incompleteFlagged'})}
  if(shared&&sharedDecision==='skip')excluded.push({key:slot===0?'sharedAdmissionSkipped':'sharedMonthDue'});else if(shared)reasons.push({key:'sharedKept'});
  const conflicts:MessageRef[]=shared?list.filter(x=>JSON.stringify([x.sheet,x.row])!==rowId).map(x=>({key:'conflict',params:{sheet:x.sheet,name:x.name,row:String(x.row)}})):[];
  const db=choices[key(tab.sheet,row.row,'db',slot)];if(db==='existing')excluded.push({key:'dbExistingKept'});else if(db==='skip')excluded.push({key:'dbConflictSkipped'});else if(db==='flag')reasons.push({key:'dbConflictFlagged'});const classification=excluded.length?'excluded':pending.length?'pending':'proposed';if(c.receipt||c.amount||c.redFill||c.redText||row.redRow)entries.push({sheet:tab.sheet,row:row.row,name:row.name,slot,receipt:c.receipt,rawAmount,classification,reasons:[...excluded,...pending,...reasons],conflicts,shared});
 }}
 const totals=entries.reduce((a,x)=>{a.raw+=x.rawAmount;a[x.classification]+=x.rawAmount;if(!Number.isSafeInteger(a.raw)||!Number.isSafeInteger(a[x.classification]))throw Error('unsafe total');return a},{raw:0,proposed:0,excluded:0,pending:0});return {entries,totals};
}
