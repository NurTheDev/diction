import type {ImportPreview} from './import-preview';
export type Choices=Record<string,string>;
export type ReviewCell={sheet:string;row:number;name:string;slot:number;month:string;receipt:string;rawAmount:number;classification:'proposed'|'excluded'|'pending';reasons:string[];conflicts:string[];shared:boolean};
const ascii=(s:string)=>s.replace(/[০-৯]/g,c=>String('০১২৩৪৫৬৭৮৯'.indexOf(c))).normalize('NFKC').trim();
const numeric=(s:string)=>/^\d+$/.test(ascii(s));
export const reviewKey=(sheet:string,row:number,type:string,slot=-1)=>JSON.stringify([sheet,row,type,slot]);
const key=(sheet:string,row:number,type:string,slot=-1)=>reviewKey(sheet,row,type,slot);
const months=['ভর্তি','জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
export function reviewWorkbook(tabs:ImportPreview[],choices:Choices){
 const owners=new Map<string,Map<string,{sheet:string,row:number,name:string}>>();
 for(const tab of tabs)for(const row of tab.rows)for(const c of [row.admission,...row.months])if(!(row.redRow&&choices[key(tab.sheet,row.row,'row')]==='skip')&&numeric(c.receipt)){const n=ascii(c.receipt),id=JSON.stringify([tab.sheet,row.row]);let list=owners.get(n);if(!list){list=new Map();owners.set(n,list)}list.set(id,{sheet:tab.sheet,row:row.row,name:row.name})}
 const entries:ReviewCell[]=[];
 for(const tab of tabs)for(const row of tab.rows){const rowId=JSON.stringify([tab.sheet,row.row]),rowDecision=choices[key(tab.sheet,row.row,'row')];for(const [slot,c] of [row.admission,...row.months].entries()){
  const n=numeric(c.receipt)?ascii(c.receipt):'',list=n?[...(owners.get(n)?.values()||[])]:[],shared=list.length>1,ownIndex=list.findIndex(x=>JSON.stringify([x.sheet,x.row])===rowId),sharedDecision=choices[key(tab.sheet,row.row,'shared',slot)]||(ownIndex<=0?'keep':'skip');
  const rawAmount=numeric(c.amount)?Number(ascii(c.amount)):0;if(!Number.isSafeInteger(rawAmount))throw Error('unsafe amount');const reasons:string[]=[],pending:string[]=[],excluded:string[]=[];
  if(row.redRow){if(!rowDecision)pending.push('লাল সারির সিদ্ধান্ত বাকি');else if(rowDecision==='skip')excluded.push('মালিকের সিদ্ধান্তে শিক্ষার্থী বাদ');else if(rowDecision==='removed')reasons.push('সরানো শিক্ষার্থীর হিসাব');else if(rowDecision==='hold'){const start=choices[key(tab.sheet,row.row,'hold-start')],reason=choices[key(tab.sheet,row.row,'hold-reason')];if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(start||'')||!reason?.trim())pending.push('স্থগিতের শুরুর মাস ও কারণ বাকি');else reasons.push(`স্থগিত: ${start}, ${reason}`)}}
  if(!row.redRow&&c.redFill&&slot>0){const v=choices[key(tab.sheet,row.row,'red',slot)];if(!v)pending.push('লাল ঘরের সিদ্ধান্ত বাকি');else excluded.push(`লাল ঘর: ${v==='due'?'বকেয়া':v==='waive'?'মওকুফ':'অনুপস্থিত'}`)}
  if(!row.redRow&&c.redFill&&slot===0)pending.push('লাল ভর্তি ঘরের অর্থ নির্ধারিত নয়');
  if((c.redText&&(c.receipt||c.amount))||((slot===0)&&row.redText)){const v=choices[key(tab.sheet,row.row,'text',slot)];if(!v)pending.push('লাল লেখার সিদ্ধান্ত বাকি');else if(v==='note')reasons.push('লাল লেখা নোট হিসেবে রাখুন')}
  if(c.uncertainColor)pending.push('রং অনিশ্চিত');if(c.formula)pending.push('ফর্মুলা যাচাই বাকি');
  const done=slot===0&&[c.receipt,c.amount].some(x=>x.trim().toLowerCase()==='done'),a=slot>0&&[c.receipt,c.amount].some(x=>x.trim().toLowerCase()==='a');
  if(done){const v=choices[key(tab.sheet,row.row,'done',slot)];if(!v)pending.push('Done সিদ্ধান্ত বাকি');else if(v==='note')excluded.push('Done শুধু নোট');else if(!/^\d+$/.test(ascii(choices[key(tab.sheet,row.row,'manual',slot)]||''))||Number(ascii(choices[key(tab.sheet,row.row,'manual',slot)]||''))<=0)pending.push('Done-এর অঙ্ক হাতে দেওয়া বাকি');else reasons.push('Done: রসিদ ছাড়া ভর্তি ফি; অঙ্ক হাতে দেওয়া')}
  if(a){const v=choices[key(tab.sheet,row.row,'a',slot)];if(!v)pending.push('A সিদ্ধান্ত বাকি');else excluded.push(`A: ${v==='waive'?'মওকুফ':v==='absent'?'অনুপস্থিত':'বাদ'}`)}
  if(!done&&!a&&((!!c.receipt)!=(!!c.amount))){const v=choices[key(tab.sheet,row.row,'incomplete',slot)];if(!v)pending.push('অসম্পূর্ণ ঘরের সিদ্ধান্ত বাকি');else if(v==='skip')excluded.push('রসিদ বা অঙ্ক অসম্পূর্ণ: বাদ');else if(!c.amount&&(!/^\d+$/.test(ascii(choices[key(tab.sheet,row.row,'manual',slot)]||''))||Number(ascii(choices[key(tab.sheet,row.row,'manual',slot)]||''))<=0))pending.push('টাকার অঙ্ক হাতে দেওয়া বাকি');else reasons.push('অসম্পূর্ণ রসিদ/অঙ্ক: চিহ্নিত')}
  if(shared){const others=list.filter(x=>JSON.stringify([x.sheet,x.row])!==rowId).map(x=>`${x.sheet} / ${x.name} / সারি ${x.row}`);if(sharedDecision==='skip')excluded.push(slot===0?'একই রসিদ অন্য শিক্ষার্থীতে: ভর্তি ফি ঘর বাদ; বকেয়া যাচাই করুন':'একই রসিদ অন্য শিক্ষার্থীতে: এই মাসটি বকেয়া দেখাবে');else reasons.push('একই রসিদ অন্য শিক্ষার্থীতে: রাখা/চিহ্নিত');}
  const conflicts=shared?list.filter(x=>JSON.stringify([x.sheet,x.row])!==rowId).map(x=>`${x.sheet} / ${x.name} / সারি ${x.row}`):[];
  const db=choices[key(tab.sheet,row.row,'db',slot)];if(db==='existing')excluded.push('ডাটাবেসের বিদ্যমান পেমেন্ট রাখা হয়েছে; নতুন ঘর যোগ নয়');else if(db==='skip')excluded.push('বিদ্যমান রসিদ সংঘর্ষ: ঘর বাদ');else if(db==='flag')reasons.push('ডাটাবেসে রসিদ সংঘর্ষ: চিহ্নিত করে যোগ');const classification=excluded.length?'excluded':pending.length?'pending':'proposed';if(c.receipt||c.amount||c.redFill||c.redText||row.redRow)entries.push({sheet:tab.sheet,row:row.row,name:row.name,slot,month:months[slot],receipt:c.receipt,rawAmount,classification,reasons:[...excluded,...pending,...reasons],conflicts,shared});
 }}
 const totals=entries.reduce((a,x)=>{a.raw+=x.rawAmount;a[x.classification]+=x.rawAmount;if(!Number.isSafeInteger(a.raw)||!Number.isSafeInteger(a[x.classification]))throw Error('unsafe total');return a},{raw:0,proposed:0,excluded:0,pending:0});return {entries,totals};
}
