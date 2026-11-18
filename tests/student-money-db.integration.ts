/**
 * S1 · the record and the two dues reads, against a disposable database.
 *
 * The rules themselves are proved without a machine to run them on (tests/student-money-core.test.ts).
 * What only a database can settle is the other half of each finding: that the line a planner returns is
 * a line the record ACCEPTS and reads back — a pause stored as a range of months, a class timeline with
 * the name each class wore, a price history the dues engine bills by — and that the two reads the centre
 * looks at answer for a paused student the way F-01 says they must:
 *
 *   · the class's own due list and the all-class summary both carry the arrears a student owed BEFORE
 *     the pause, for as long as the pause runs;
 *   · the months inside the pause are in neither, and are in neither again after the pause is lifted,
 *     which is what "unholding must not back-bill" means once it is a stored range rather than a flag;
 *   · the read a fee MESSAGE is composed from still leaves a paused student out, because R2.3 has not
 *     changed: a paused student receives no demand for money.
 *
 * Synthetic records only, written with ids and names of their own and deleted by the same query, so a
 * run beside the app's own seeded centre changes nothing it did not create.
 *
 * Run: npm run test:s1:db
 */
import assert from 'node:assert/strict';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {CenterClassGroup,CenterPayment,CenterStudent} from '../src/models/CenterRecords';
import {dhakaCalendar} from '../src/lib/center/month-status';
import {monthKey} from '../src/lib/center/dues';
import {liveClassDues,liveClassDueSummary} from '../src/lib/center/dues-query';
import {
  monthWordOf,planClassTransfer,planFeeChange,planHold,planLift,settledMonthInRange,
  type ClassStepRow,type FeeStepRow,type HoldRow,
} from '../src/lib/center/student-changes';

const FEE=1000,RAISED=1500,RAISED2=1800;
/** Dhaka's own month, and a `now` late enough in it that the month is past its due day. */
const today=dhakaCalendar(new Date());
const now=new Date(Date.UTC(today.year,today.month-1,20,6));
const at=(back:number):{year:number;month:number}=>{
  const index=today.year*12+today.month-1-back;
  return {year:Math.floor(index/12),month:(index%12)+1};
};
const START=at(3);                     // four fee months: three behind Dhaka's month, and this one
const HOLD_FROM=at(1);                 // the pause begins last month
const RESUME=at(-1);                   // and the student resumes next month
const ymWord=(value:{year:number;month:number}):string=>monthWordOf(value);

type Stored={_id:mongoose.Types.ObjectId;studentId:string;status:string;classGroup:mongoose.Types.ObjectId;
  startMonth:{year:number;month:number};revision:number;
  holds:{start:{year:number;month:number};end?:{year:number;month:number}|null;reason:string;recordedBy?:unknown;endedBy?:unknown;closedAt?:Date}[];
  classHistory:{classGroup:mongoose.Types.ObjectId;name?:{bn:string;en?:string};effectiveFrom:{year:number;month:number};reason?:string;changedBy?:unknown;changedAt?:Date}[];
  feeHistory:{effectiveFrom:{year:number;month:number};amount:number;reason?:string;changedBy?:unknown;changedAt?:Date}[]};
const read=(id:mongoose.Types.ObjectId):Promise<Stored|null>=>
  CenterStudent.findById(id).lean<Stored|null>();

/** The months one student owes, from the same read the class's own due list is painted from. */
async function owed(classId:string,studentId:mongoose.Types.ObjectId,held=true):Promise<{total:number;months:string[]}>{
  const rows=(await liveClassDues(classId,now,undefined,{held})).rows;
  const row=rows.find(entry=>String(entry.student._id)===String(studentId));
  return {total:row?.total??0,months:(row?.months||[]).map(month=>monthKey(month.year,month.month))};
}

async function run(){
  await preflight({mongo:true,test:'tests/student-money-db.integration.ts — needs a MongoDB (or TEST_MONGO_URI from npm run test-mode)'});
  const shared=process.env.TEST_ORIGIN?process.env.TEST_MONGO_URI:null;
  const mongo=shared?{getUri:()=>shared as string,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  try{
    await CenterStudent.deleteMany({studentId:/^S1DB-/});
    await CenterClassGroup.deleteMany({'name.bn':/^S1DB/});
    await CenterPayment.deleteMany({groupId:'s1db'});
    const actor=await User.create({name:'S1DB actor',passwordHash:'x',role:'admin',email:`s1db-${Date.now()}@example.test`});
    const actorId=String(actor._id);

    const classA=await CenterClassGroup.create({name:{bn:'S1DB নবম শ্রেণি',en:'S1DB Class Nine'},academicYear:today.year,active:true});
    const classB=await CenterClassGroup.create({name:{bn:'S1DB দশম শ্রেণি',en:'S1DB Class Ten'},academicYear:today.year,active:true});
    const feeHistory:FeeStepRow[]=[{effectiveFrom:START,amount:FEE}];
    /* One student who has paid nothing, and one who has paid every month but this: the pause is proved
       on the first, and the rule that keeps a price out of a settled month on the second. */
    const arrears=await CenterStudent.create({studentId:'S1DB-ARREARS',name:{bn:'S1DB বকেয়া শিক্ষার্থী',en:'S1DB arrears'},
      classGroup:classA._id,startMonth:START,guardianPhone:'01711000101',feeHistory,status:'active'});
    const payer=await CenterStudent.create({studentId:'S1DB-PAYER',name:{bn:'S1DB পরিশোধিত শিক্ষার্থী',en:'S1DB payer'},
      classGroup:classA._id,startMonth:START,guardianPhone:'01711000102',feeHistory,status:'active'});
    for(const back of [3,2,1]){
      const month=at(back);
      await CenterPayment.create({student:payer._id,classGroupAtPayment:classA._id,type:'monthly',
        academicYear:month.year,month:month.month,amount:FEE,receiptNo:`S1DB-${back}`,
        paidOn:`${ymWord(month)}-05`,receivedBy:actor._id,groupId:'s1db'});
    }
    const paymentsOf=async(id:mongoose.Types.ObjectId):Promise<Record<string,number>>=>{
      const rows=await CenterPayment.aggregate<{_id:{year:number;month:number};paid:number}>([
        {$match:{student:id,type:'monthly',status:'valid'}},
        {$group:{_id:{year:'$academicYear',month:'$month'},paid:{$sum:'$amount'}}}]);
      const out:Record<string,number>={};
      for(const row of rows)out[monthKey(row._id.year,row._id.month)]=row.paid;
      return out;
    };

    // ── 1. before the pause: four months owed, and both dues reads say so ──────────────────────────
    assert.deepEqual(await owed(String(classA._id),arrears._id),
      {total:FEE*4,months:[ymWord(at(3)),ymWord(at(2)),ymWord(at(1)),ymWord(at(0))]},
      'a student who has paid nothing owes every month since the month the fee started');
    const summaryOf=async(classId:string)=>{
      const row=(await liveClassDueSummary(now)).rows.find(entry=>entry.classId===classId);
      assert.ok(row,'the centre\'s own summary carries a line for this class');
      return {total:row.total,active:row.active,owing:row.owing,monthlyFee:row.monthlyFee,partial:row.partial};
    };
    const summaryBefore=await summaryOf(String(classA._id));
    assert.deepEqual(summaryBefore,{total:FEE*5,active:2,owing:2,monthlyFee:FEE,partial:false},
      'the summary carries what the class is owed, counts the two students it runs, and quotes the price '
      +'the class runs at because it has none of its own');

    // ── 2. the pause: a range on the record, and the months before it still owed ───────────────────
    const paused=planHold({status:'active',holds:[]},{fromMonth:HOLD_FROM,reason:'S1DB পরীক্ষার বিরতি',actorId:actorId,now});
    const heldDoc=await CenterStudent.findById(arrears._id);
    assert.ok(heldDoc,'the student the pause is written to is in the database');
    heldDoc!.set('status',paused.status);
    heldDoc!.set('holds',paused.holds);
    heldDoc!.revision+=1;
    await heldDoc!.save();
    const afterHold=await read(arrears._id);
    assert.equal(afterHold?.status,'on_hold','the record reads the pause back as the status the badge shows');
    assert.equal(afterHold?.holds.length,1,'and as one line of history, not as a flag');
    assert.equal(ymWord(afterHold!.holds[0].start),ymWord(HOLD_FROM),'the line starts at the month the centre stopped billing');
    assert.equal(afterHold!.holds[0].end??null,null,'and is open while the student is away');
    assert.equal(afterHold!.holds[0].reason,'S1DB পরীক্ষার বিরতি','it carries the reason the operator typed');
    assert.equal(String(afterHold!.holds[0].recordedBy),actorId,'and who wrote it');
    /* The finding: the two months before the pause are still owed, on both reads the centre looks at. */
    assert.deepEqual(await owed(String(classA._id),arrears._id),
      {total:FEE*2,months:[ymWord(at(3)),ymWord(at(2))]},
      'while the pause runs, the months before it are still owed and the months inside it are billed by nobody');
    const summaryHeld=await summaryOf(String(classA._id));
    assert.equal(summaryHeld.total,FEE*3,
      'the all-class summary keeps the paused student\'s arrears in the total: two months of theirs and one of the payer\'s');
    assert.equal(summaryHeld.active,1,'while counting one student running, because the other is paused');
    assert.equal(summaryHeld.owing,2,'and two students owing, because a pause is not a pardon');
    assert.equal(summaryHeld.partial,false,'with nothing the engine could not read');
    assert.deepEqual(await owed(String(classA._id),arrears._id,false),{total:0,months:[]},
      'and the read a fee message is composed from leaves the paused student out, as it always has');
    /* A pause nobody wrote a reason for is still a pause: the reason is optional on the record. */
    const noReason=planHold({status:'active',holds:[]},{fromMonth:HOLD_FROM,actorId:actorId,now});
    const second=await CenterStudent.create({studentId:'S1DB-NOREASON',name:{bn:'S1DB কারণহীন'},classGroup:classB._id,
      startMonth:START,guardianPhone:'01711000103',feeHistory,status:'on_hold',holds:noReason.holds});
    assert.equal((await read(second._id))?.holds[0].reason,'','a reason nobody typed is stored as no reason');
    /* A pause written before S1: a status and no months, which is the shape every pause on the record
       had before this slice. There is no month to bill up to and none to stop at, so both reads count it
       for nothing rather than inventing a debt for the very months the centre paused. */
    const flagOnly=await CenterStudent.create({studentId:'S1DB-FLAGONLY',name:{bn:'S1DB পুরোনো হোল্ড'},classGroup:classB._id,
      startMonth:START,guardianPhone:'01711000104',feeHistory,status:'on_hold'});
    assert.equal((await read(flagOnly._id))!.holds.length,0,'the record really has no months on it');
    assert.deepEqual(await owed(String(classB._id),flagOnly._id),{total:0,months:[]},
      'and a pause with no month is on no due list, because a line on that list is a demand');

    // ── 3. lifting the pause closes the range and back-bills nothing ──────────────────────────────
    const beforeLift=await owed(String(classA._id),arrears._id);
    /* Whole rows, not a picked-over copy: a range carries the operator who wrote it, and the schema
       requires that name, so a lift that dropped it would be refused by the record it is closing. */
    const lifted=planLift({status:'on_hold',holds:afterHold!.holds as unknown as HoldRow[]},
      {resumeMonth:RESUME,actorId:actorId,now});
    const liftDoc=await CenterStudent.findById(arrears._id);
    liftDoc!.set('status',lifted.status);
    liftDoc!.set('holds',lifted.holds);
    liftDoc!.revision+=1;
    await liftDoc!.save();
    const afterLift=await read(arrears._id);
    assert.equal(afterLift?.status,'active','the student is running again');
    assert.equal(ymWord(afterLift!.holds[0].end!),ymWord(at(0)),
      'the pause ends the month BEFORE the one the student resumes in, so the resume month is a month the centre bills');
    assert.equal(String(afterLift!.holds[0].endedBy),actorId,'and the record says who lifted it');
    assert.ok(afterLift!.holds[0].closedAt instanceof Date,'and when');
    assert.deepEqual(await owed(String(classA._id),arrears._id),beforeLift,
      'lifting the pause changes nothing that was owed: the months inside the closed range are never billed again');
    assert.equal((await summaryOf(String(classA._id))).total,summaryHeld.total,
      'and the centre\'s summary is the same number after the lift as it was during the pause');

    // ── 4. the move: a line on the timeline, and the roll the student is on ───────────────────────
    const moved=planClassTransfer(
      {classGroup:String(afterLift!.classGroup),startMonth:afterLift!.startMonth,classHistory:[]},
      {targetClassId:String(classB._id),targetClassName:{bn:'S1DB দশম শ্রেণি',en:'S1DB Class Ten'},
        from:{id:String(classA._id),name:{bn:'S1DB নবম শ্রেণি',en:'S1DB Class Nine'}},
        effectiveMonth:at(0),reason:'S1DB বিভাগ বদল',actorId:actorId,now});
    const moveDoc=await CenterStudent.findById(arrears._id);
    moveDoc!.classGroup=new mongoose.Types.ObjectId(String(classB._id));
    moveDoc!.set('classHistory',moved.classHistory);
    moveDoc!.revision+=1;
    await moveDoc!.save();
    const afterMove=await read(arrears._id);
    assert.equal(String(afterMove?.classGroup),String(classB._id),'the roll the student is on is the class they moved to');
    assert.equal(await CenterStudent.countDocuments({classGroup:classB._id,status:'active',studentId:'S1DB-ARREARS'}),1,
      'and a roster read of that class finds them');
    assert.equal(await CenterStudent.countDocuments({classGroup:classA._id,studentId:'S1DB-ARREARS'}),0,
      'while the class they left no longer does');
    const steps=(afterMove?.classHistory||[]) as unknown as ClassStepRow[];
    assert.equal(steps.length,2,'the history holds the class they left beside the class they arrived on');
    assert.equal(String(steps[0].classGroup),String(classA._id),'the first line is the class they were in');
    assert.equal(ymWord(steps[0].effectiveFrom),ymWord(START),'from the month they enrolled, which the first move backfills');
    assert.equal(steps[0].name?.bn,'S1DB নবম শ্রেণি','carrying the name that class wore, so the line reads without a join');
    assert.equal(String(steps[1].classGroup),String(classB._id),'the second line is the move itself');
    assert.equal(ymWord(steps[1].effectiveFrom),ymWord(at(0)),'from the month the operator picked');
    assert.equal(steps[1].reason,'S1DB বিভাগ বদল','with the reason, who and when beside it');
    assert.equal(String(steps[1].changedBy),actorId,'the record says who moved the student');
    /* The money follows the student, and the two classes read it where it now belongs. */
    assert.deepEqual(await owed(String(classA._id),arrears._id),{total:0,months:[]},
      'the class the student left owes nothing for them any more');
    assert.deepEqual(await owed(String(classB._id),arrears._id),beforeLift,
      'and the class they arrived on owes exactly what they brought with them');
    const summaryMoved=await summaryOf(String(classA._id));
    assert.equal(summaryMoved.total,FEE,'the class the student left is left with the payer alone');
    assert.equal(summaryMoved.active,1,'and one student on its roll');
    assert.equal((await summaryOf(String(classB._id))).total,FEE*4,
      'while the class they arrived on carries the arrears they brought beside the pause that was already '
      +'there — and nothing for the pause the record has no month for');

    // ── 5. the price: from its month, and never over a month already settled ──────────────────────
    const payerPayments=await paymentsOf(payer._id);
    assert.deepEqual(settledMonthInRange(payerPayments,at(1),at(0)),at(1),
      'the month the centre last took money for is the month a price may not reach back into');
    const payerDoc=await CenterStudent.findById(payer._id);
    const payerHistory=(payerDoc!.feeHistory as unknown as FeeStepRow[])
      .map(entry=>({effectiveFrom:{year:entry.effectiveFrom.year,month:entry.effectiveFrom.month},amount:Number(entry.amount)}));
    assert.throws(()=>planFeeChange({startMonth:START,feeHistory:payerHistory},
      {amount:RAISED,effectiveMonth:at(1),today,payments:payerPayments,reason:'S1DB পিছিয়ে বৃদ্ধি',actorId:actorId,now}),
      /SETTLED_MONTH/,'a price written from a settled month is refused rather than written');
    assert.equal((await read(payer._id))?.feeHistory.length,1,'and a refusal leaves the record exactly as it was');
    const beforePrice=await owed(String(classA._id),payer._id);
    assert.deepEqual(beforePrice,{total:FEE,months:[ymWord(at(0))]},
      'the payer owes this month alone, at the price this month had');
    /* What a price write does to the record: a line added, sorted by the month it takes effect from, and
       never an edit of the line before it. */
    const writePrice=async(amount:number,effectiveFrom:{year:number;month:number},reason:string):Promise<FeeStepRow[]>=>{
      const doc=await CenterStudent.findById(payer._id);
      const history=(doc!.feeHistory as unknown as FeeStepRow[])
        .map(entry=>({effectiveFrom:{year:entry.effectiveFrom.year,month:entry.effectiveFrom.month},amount:Number(entry.amount)}));
      const planned=planFeeChange({startMonth:START,feeHistory:history},
        {amount,effectiveMonth:effectiveFrom,today,payments:payerPayments,reason,actorId:actorId,now});
      doc!.set('feeHistory',planned.feeHistory);
      doc!.revision+=1;
      await doc!.save();
      return (await read(payer._id))!.feeHistory as unknown as FeeStepRow[];
    };
    /* A price for a month nobody has reached is stored like any other, and changes nothing today — not
       what this month is owed, and not the price the class is quoted at. */
    const futureLines=await writePrice(RAISED,at(-1),'S1DB আগাম বৃদ্ধি');
    assert.equal(futureLines.length,2,'the price is a line added to the history');
    assert.equal(futureLines[0].amount,FEE,'the price the settled months were billed at is untouched');
    assert.equal(futureLines[1].amount,RAISED,'and the new line carries the price and the month it was written for');
    assert.equal(ymWord(futureLines[1].effectiveFrom),ymWord(at(-1)),'which is a month nobody has reached');
    assert.equal(futureLines[1].reason,'S1DB আগাম বৃদ্ধি','with the reason beside it');
    assert.equal(String(futureLines[1].changedBy),actorId,'who changed it');
    assert.ok(futureLines[1].changedAt instanceof Date,'and when');
    assert.deepEqual(await owed(String(classA._id),payer._id),beforePrice,
      'so this month is still owed at the price it has: a price for later re-prices nothing today');
    assert.equal((await summaryOf(String(classA._id))).monthlyFee,FEE,
      'and the class is still quoted at the price it runs at, not at the one written for a month to come');
    /* The same line for a month that HAS arrived is the price that month is billed at from then on. */
    const arrivedLines=await writePrice(RAISED2,at(0),'S1DB বার্ষিক বৃদ্ধি');
    assert.equal(arrivedLines.length,3,'a second change is a third line, and no line was edited to make room');
    assert.deepEqual(arrivedLines.map(line=>ymWord(line.effectiveFrom)),
      [ymWord(START),ymWord(at(0)),ymWord(at(-1))],'the history reads in the order the prices take effect');
    assert.deepEqual(await owed(String(classA._id),payer._id),{total:RAISED2,months:[ymWord(at(0))]},
      'this month is now owed at the price that has arrived, and no settled month is owed anything at all');
    assert.equal((await summaryOf(String(classA._id))).monthlyFee,RAISED2,
      'and the class is quoted at the price it runs at now');
    const receipts=await CenterPayment.find({student:payer._id}).lean<{amount:number;academicYear:number;month:number}[]>();
    assert.equal(receipts.length,3,'the receipts behind the settled months are still three');
    assert.deepEqual(receipts.map(receipt=>receipt.amount),[FEE,FEE,FEE],
      'and not one of them was re-priced by a change that came after it');

    // ── 6. the way out of a pause with no month, which is what the row's own sentence promises ─────
    const writeHold=async(id:mongoose.Types.ObjectId,status:string,holds:HoldRow[]):Promise<void>=>{
      const doc=await CenterStudent.findById(id);
      doc!.set('status',status);doc!.set('holds',holds);doc!.revision+=1;
      await doc!.save();
    };
    const legacyLift=planLift({status:'on_hold',holds:[]},{resumeMonth:RESUME,actorId:actorId,now});
    assert.equal(legacyLift.closed,null,'lifting a flag closes nothing, because there was no range to close');
    await writeHold(flagOnly._id,legacyLift.status,legacyLift.holds);
    assert.equal((await read(flagOnly._id))!.status,'active','and the student the flag paused is running again');
    const legacyHold=planHold({status:'active',holds:[]},{fromMonth:HOLD_FROM,reason:'S1DB মাসসহ বিরতি',actorId:actorId,now});
    await writeHold(flagOnly._id,legacyHold.status,legacyHold.holds);
    assert.deepEqual(await owed(String(classB._id),flagOnly._id),
      {total:FEE*2,months:[ymWord(at(3)),ymWord(at(2))]},
      'so the pause the record now has a month for is counted for the months before it — the arrears the '
      +'flag was hiding, which is what the row tells the operator to go and do');
    assert.equal((await summaryOf(String(classB._id))).owing,3,
      'and the centre\'s summary counts them as somebody owing, without counting them as running');
    assert.equal((await summaryOf(String(classB._id))).active,1,
      'and the one student that class runs is the one who moved onto it');
    assert.equal((await summaryOf(String(classB._id))).total,FEE*6,'which is what the three of them owe between them');
    await CenterPayment.deleteMany({groupId:'s1db'});
    await CenterStudent.deleteMany({studentId:/^S1DB-/});
    await CenterClassGroup.deleteMany({'name.bn':/^S1DB/});
    await User.deleteOne({_id:actor._id});

    console.log('Student money record: a pause stored as a range whose earlier arrears stay on both dues reads, '+
      'a pause with no month on it counted for nothing until it is given one, a lift that closes the range and '+
      'back-bills nothing, a move that writes the class timeline and moves the roll, and a price that takes effect '+
      'from its month — quoted only once that month arrives — while every settled month keeps the price it was settled at.');
  }finally{
    await mongoose.disconnect();
    await mongo.stop();
  }
}
run().catch(error=>{console.error(error);process.exit(1)});
