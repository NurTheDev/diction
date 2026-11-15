/**
 * R6 slice 1, proven without a database: the four reports' mathematics and the export engine.
 *
 * The readers that touch mongoose live beside these pure functions and feed them rows; everything a
 * report *means* — a day split by operator, a month's class-by-day margins meeting at one grand total,
 * a receipt book's duplicates and gaps, a statement whose running due ends where the due list says, a
 * year whose five columns reconcile — is here, where it can run on every commit and not only in CI.
 *
 * The export half is checked at the byte level: a CSV whose every cell is quoted and whose formula-like
 * cells carry the apostrophe that stops Excel executing them, and an `.xlsx` that is a real zip — local
 * headers, central directory, CRC32 recomputed and compared — whose text cells are inline strings.
 */
import assert from 'node:assert/strict';
import {dailyBreakdown,monthlyMatrix,operatorOptions,type PaymentRow} from '../src/lib/reports/collections';
import {auditReceipts,type ReceiptRow} from '../src/lib/reports/receipt-audit';
import {ledgerStatement} from '../src/lib/reports/ledger';
import {yearSummary} from '../src/lib/reports/year-summary';
import {csvOf,xlsxOf,crc32} from '../src/lib/reports/export';

const NOW=new Date('2026-03-05T06:00:00Z'); // 5 March 2026 in Dhaka, before the tenth: this month is pending, not due

const pay=(over:Partial<PaymentRow>&{id:string;amount:number}):PaymentRow=>({
  studentId:'S-1',studentName:'নমুনা ছাত্র ক',classLabel:'নমুনা নবম ক',type:'monthly',otherLabel:'',
  monthKey:null,receiptNo:'',paidOn:'2026-01-01',operatorId:'u1',operatorName:'নমুনা ক্যাশিয়ার',note:'',...over,
});

// ── daily collection: the operator filter narrows rows and totals together ─────────────────────────
{
  const rows=[
    pay({id:'p1',amount:1000,receiptNo:'1',paidOn:'2026-03-01',operatorId:'u1',operatorName:'ক্যাশিয়ার ক'}),
    pay({id:'p2',amount:500,receiptNo:'2',paidOn:'2026-03-01',operatorId:'u2',operatorName:'ক্যাশিয়ার খ'}),
    pay({id:'p3',amount:250,receiptNo:'3',paidOn:'2026-03-01',operatorId:'u1',operatorName:'ক্যাশিয়ার ক'}),
  ];
  const all=dailyBreakdown(rows,null);
  assert.equal(all.count,3);
  assert.equal(all.total,1750);
  assert.equal(all.operators.length,2);
  const filtered=dailyBreakdown(rows,'u1');
  assert.equal(filtered.count,2,'the filter narrows the rows');
  assert.equal(filtered.total,1250,'and the total with them');
  assert.deepEqual(filtered.operators.map(o=>o.id),['u1'],'and the per-operator totals keep only whom you asked for');
  assert.equal(filtered.operators[0].total,1250);
  assert.deepEqual(operatorOptions(rows).map(o=>o.id),['u1','u2'],'the filter’s options come from the unfiltered day');
  assert.equal(dailyBreakdown([],null).total,0);
}

// ── monthly matrix: rows, columns and the grand total are three sums of the same cells ─────────────
{
  const rows=[
    pay({id:'p1',amount:1000,paidOn:'2026-02-01',classLabel:'নমুনা ক'}),
    pay({id:'p2',amount:1000,paidOn:'2026-02-01',classLabel:'নমুনা ক'}),
    pay({id:'p3',amount:700,paidOn:'2026-02-03',classLabel:'নমুনা খ'}),
    pay({id:'p4',amount:300,paidOn:'2026-02-28',classLabel:'নমুনা খ',type:'admission'}),
    pay({id:'p5',amount:999,paidOn:'2026-03-01',classLabel:'নমুনা ক'}), // another month: invisible here
  ];
  const matrix=monthlyMatrix(rows,2026,2);
  assert.deepEqual(matrix.classLabels,['নমুনা ক','নমুনা খ'],'bn collation orders the rows');
  assert.equal(matrix.daysInMonth,28,'February 2026 has 28 days');
  assert.equal(matrix.cells[0][0],2000,'two receipts on the first land in one cell');
  assert.equal(matrix.cells[1][2],700);
  assert.equal(matrix.cells[1][27],300);
  assert.equal(matrix.dayTotals[0],2000);
  assert.equal(matrix.classTotals[0],2000);
  assert.equal(matrix.classTotals[1],1000);
  assert.equal(matrix.grand,3000);
  assert.equal(matrix.dayTotals.reduce((a,b)=>a+b,0),matrix.grand,'the column of day totals sums to the grand');
  assert.equal(matrix.classTotals.reduce((a,b)=>a+b,0),matrix.grand,'and so does the column of class totals');
  const admission=matrix.typeTotals.find(entry=>entry.type==='admission');
  assert.equal(admission?.total,300,'and the heads add their own share');
}

// ── cashbook check: a number twice, and the numbers that never got written ─────────────────────────
{
  const row=(id:string,receiptNo:string,paidOn:string):ReceiptRow=>({id,receiptNo,paidOn,createdAt:paidOn,studentId:'s'+id,studentName:'নমুনা',amount:100});
  const audit=auditReceipts([
    row('a','10','2026-01-01'),
    row('b','11','2026-01-02'),
    row('c','12','2026-01-03'),
    row('d','12','2026-01-04'),   // one number, two records
    row('e','15','2026-01-05'),   // 13 and 14 were never written
    row('f','A-1','2026-01-06'),  // not a number: sequenced apart, still duplicate-checked
    row('g','A-1','2026-01-07'),
  ]);
  assert.equal(audit.scanned,5,'the five numeric receipts are the sequence');
  assert.equal(audit.smallest,10);
  assert.equal(audit.largest,15);
  assert.equal(audit.duplicates.length,2,'the numeric pair and the lettered pair both repeat');
  assert.equal(audit.duplicates[0].receiptNo,'12');
  assert.equal(audit.duplicates[0].count,2);
  assert.deepEqual(audit.duplicates[0].rows.map(r=>r.id),['c','d'],'in the order the book was written');
  assert.equal(audit.gaps.length,1);
  assert.equal(audit.gaps[0].from,13);
  assert.equal(audit.gaps[0].to,14);
  assert.equal(audit.gaps[0].missingCount,2);
  assert.equal(audit.gaps[0].after.id,'d','the gap is bounded by the receipts around it');
  assert.equal(audit.gaps[0].before.id,'e');
  assert.equal(audit.unsequenced.length,2);
  const clean=auditReceipts([row('a','1','2026-01-01'),row('b','2','2026-01-02')]);
  assert.equal(clean.duplicates.length,0);
  assert.equal(clean.gaps.length,0,'a book in order has no gaps');
}

// ── the statement: date order, and a running due that ends at the outstanding sum ──────────────────
{
  const statement=ledgerStatement({
    startMonth:{year:2026,month:1},
    feeHistory:[{effectiveFrom:{year:2026,month:1},amount:1000}],
    holds:[],
    waivers:['2026-02'],
    payments:[
      {id:'x1',paidOn:'2026-01-05',createdAt:'2026-01-05',amount:500,receiptNo:'',type:'admission',otherLabel:'',monthKey:null,note:''},
      {id:'x2',paidOn:'2026-01-10',createdAt:'2026-01-10',amount:1000,receiptNo:'1',type:'monthly',otherLabel:'',monthKey:'2026-01',note:''},
    ],
    now:NOW,dueDay:10,
  });
  const kinds=statement.entries.map(entry=>`${entry.date}:${entry.kind}`);
  assert.deepEqual(kinds,[
    '2026-01-01:assessment','2026-01-05:extra','2026-01-10:payment',
    '2026-02-01:assessment','2026-02-01:waiver','2026-03-01:assessment',
  ],'assessments open their month, a waiver follows its assessment, payments sit on their own day');
  const running=statement.entries.map(entry=>entry.runningDue);
  assert.deepEqual(running,[1000,1000,0,1000,0,1000],
    'the extra does not touch the fee balance, the receipt clears January, the waiver clears February');
  assert.equal(statement.summary.assessed,2000,'the waived month is not money the year expected');
  assert.equal(statement.summary.waived,1000);
  assert.equal(statement.summary.paidMonthly,1000);
  assert.equal(statement.summary.extras,500);
  assert.equal(statement.summary.outstanding,1000,'March is unpaid and still before its due day');
  assert.deepEqual(statement.summary.dueMonths,[{monthKey:'2026-03',due:1000}]);
  assert.equal(statement.entries[statement.entries.length-1].runningDue,statement.summary.outstanding,
    'the walk ends where the summary stands');

  const held=ledgerStatement({
    startMonth:{year:2026,month:1},
    feeHistory:[{effectiveFrom:{year:2026,month:1},amount:1000}],
    holds:[{start:{year:2026,month:1},end:null}],
    waivers:[],payments:[],now:NOW,
  });
  assert.deepEqual(held.entries.map(entry=>entry.kind),['hold','hold','hold'],
    'a held month is named, not assessed — and an open hold names every month it covers');
  assert.equal(held.summary.outstanding,0,'and it owes nothing while held');
}

// ── the year: five columns that reconcile per class ────────────────────────────────────────────────
{
  const summary=yearSummary([{
    classLabel:'নমুনা ক',
    startMonth:{year:2026,month:1},
    feeHistory:[{effectiveFrom:{year:2026,month:1},amount:1000}],
    holds:[],
    waivers:['2026-02'],
    paymentsByMonth:{'2026-01':1000,'2026-04':1000}, // an advance for a month the year has not reached
    extraPaid:500,
  }],2026,NOW,10);
  const row=summary.classes[0];
  assert.equal(row.expected,3000,'January, the waived February and March were all assessed');
  assert.equal(row.collected,2500,'every taka taken inside the year counts, the advance included');
  assert.equal(row.outstanding,1000);
  assert.equal(row.pending,1000,'March awaits its due day');
  assert.equal(row.waived,1000);
  assert.equal(row.extras,500);
  assert.equal(summary.totals.expected,3000);
  assert.equal(summary.totals.collected,2500);
}

// ── the export engine: nothing a spreadsheet could execute, and a zip that verifies ────────────────
{
  const csv=csvOf(['রশিদ','Student'],[['=1+1','+cmd','-x','@f','plain',5]]);
  assert.ok(csv.startsWith('\uFEFF'),'the BOM that makes Excel read Bangla as Bangla');
  assert.ok(csv.includes('\r\n'),'and the CRLF it expects');
  for(const dangerous of ['=1+1','+cmd','-x','@f'])
    assert.ok(csv.includes(`"'${dangerous}"`),`a formula-like cell keeps its apostrophe inside the quotes: ${dangerous}`);
  assert.ok(csv.includes('"plain"'),'an ordinary cell is merely quoted');
  assert.ok(csv.includes('"5"'),'a number goes out as its digits');

  const bytes=xlsxOf('নমুনা রিপোর্ট',['head','=sneaky'],[['text',42]]);
  assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4b),'a zip begins with PK';
  const entries:{name:string;data:Uint8Array;crc:number}[]=[];
  let at=0;
  while(at+30<=bytes.length&&bytes[at]===0x50&&bytes[at+1]===0x4b&&bytes[at+2]===0x03&&bytes[at+3]===0x04){
    const view=new DataView(bytes.buffer,bytes.byteOffset+at);
    const crc=view.getUint32(14,true),size=view.getUint32(18,true),nameLen=view.getUint16(26,true),extraLen=view.getUint16(28,true);
    const name=new TextDecoder().decode(bytes.subarray(at+30,at+30+nameLen));
    entries.push({name,data:bytes.slice(at+30+nameLen+extraLen,at+30+nameLen+extraLen+size),crc});
    at+=30+nameLen+extraLen+size;
  }
  assert.deepEqual(entries.map(entry=>entry.name),
    ['[Content_Types].xml','_rels/.rels','xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/worksheets/sheet1.xml'],
    'the five parts a workbook is');
  for(const entry of entries)
    assert.equal(crc32(entry.data),entry.crc,`the stored CRC of ${entry.name} is the CRC of its bytes`);
  const sheet=new TextDecoder().decode(entries[4].data);
  assert.ok(sheet.includes('t="inlineStr"'),'text cells are inline strings');
  assert.ok(sheet.includes('<v>42</v>'),'and numbers stay numbers');
  assert.ok(!sheet.includes('<f>'),'no cell anywhere is a formula');
  assert.ok(sheet.includes('=sneaky'),'the formula-looking text arrived as text, apostrophe-free and inert');
  const types=new TextDecoder().decode(entries[0].data);
  assert.ok(types.includes('spreadsheetml.worksheet+xml'),'and the package says what it is');
}

console.log('report-math: daily, monthly, audit, ledger, year and the export engine all hold');
