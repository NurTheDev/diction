/**
 * R6 slice 1 — the cashbook check: two questions an operator cannot answer by eye once the receipt book
 * runs to hundreds of pages. Did any number get written twice? And is any number missing from the
 * sequence? Pure over payment rows; the loader is in `receipt-audit-data.ts`.
 *
 * A repeated number is not proof of wrongdoing — a shared receipt across two siblings is a sanctioned
 * flow that stores its reason — which is exactly why it belongs on an audit screen with a link to the
 * record, so a person reads the reason instead of guessing one.
 */
export type ReceiptRow={
  id:string;receiptNo:string;paidOn:string;createdAt:string;
  studentId:string;studentName:string;amount:number;
};

export type DuplicateReceipt={receiptNo:string;count:number;rows:ReceiptRow[]};
export type ReceiptGap={
  from:number;to:number;missingCount:number;
  /** The two stored payments the gap sits between, so the review starts somewhere real. */
  after:ReceiptRow;before:ReceiptRow;
};
export type ReceiptAudit={
  scanned:number;smallest:number|null;largest:number|null;
  duplicates:DuplicateReceipt[];gaps:ReceiptGap[];
  /** Valid payments whose receipt number is not a plain integer: sequenced separately, listed honestly. */
  unsequenced:ReceiptRow[];
};

const numeric=(receiptNo:string)=>/^\d+$/.test(receiptNo.trim());

export function auditReceipts(rows:ReceiptRow[]):ReceiptAudit{
  const sequenced=rows.filter(row=>numeric(row.receiptNo));
  const unsequenced=rows.filter(row=>!numeric(row.receiptNo));

  const byNumber=new Map<string,ReceiptRow[]>();
  for(const row of rows){
    const key=row.receiptNo.trim();
    const list=byNumber.get(key)||[];
    list.push(row);
    byNumber.set(key,list);
  }
  const duplicates=[...byNumber.entries()]
    .filter(([,list])=>list.length>1)
    .map(([receiptNo,list])=>({receiptNo,count:list.length,rows:[...list].sort((a,b)=>a.paidOn.localeCompare(b.paidOn)||a.createdAt.localeCompare(b.createdAt))}))
    .sort((a,b)=>Number(a.receiptNo.trim())-Number(b.receiptNo.trim())||a.receiptNo.localeCompare(b.receiptNo));

  /* Chronological sequence: receipts are issued in order, so the stored order of the payments is the
     order of the book. Walking it and comparing each number with the one before it finds both a gap
     and the two entries that bound it — which is what "review the payment record" needs. */
  const ordered=[...sequenced].sort((a,b)=>a.paidOn.localeCompare(b.paidOn)||a.createdAt.localeCompare(b.createdAt)||Number(a.receiptNo.trim())-Number(b.receiptNo.trim()));
  const gaps:ReceiptGap[]=[];
  let previous:ReceiptRow|null=null;
  for(const row of ordered){
    const value=Number(row.receiptNo.trim());
    if(previous){
      const before=Number(previous.receiptNo.trim());
      if(value>before+1)gaps.push({from:before+1,to:value-1,missingCount:value-before-1,after:previous,before:row});
    }
    /* `>=`, not `>`: when one number was written twice, the gap after it begins at the later of the two
       rows — the last line the book actually shows before the hole. */
    if(!previous||value>=Number(previous.receiptNo.trim()))previous=row;
  }
  const values=sequenced.map(row=>Number(row.receiptNo.trim()));
  return {
    scanned:sequenced.length,
    smallest:values.length?Math.min(...values):null,
    largest:values.length?Math.max(...values):null,
    duplicates,gaps,unsequenced,
  };
}
