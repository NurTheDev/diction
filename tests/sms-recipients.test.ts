/**
 * R2 · Recipient resolution. Pure module, no database: every rule that decides whether a family
 * receives a message, and every reason shown for a number that was dropped.
 */
import assert from 'node:assert/strict';
import {SMS_SKIP_LABELS,SMS_SKIP_REASONS,chunkRecipients,isHeldNow,resolveRecipients,type SmsCandidateStudent} from '../src/lib/center/sms-recipients';

const NOW=new Date('2026-11-12T12:00:00+06:00');

function student(over:Partial<SmsCandidateStudent>={}):SmsCandidateStudent{
  return {id:'s1',nameBn:'রহিম',status:'active',guardianPhone:'01711111111',...over};
}

function run(){
  // 1. Removed students never receive anything, and opted-out students are respected.
  const removed=resolveRecipients([student({status:'removed'})],{audience:'guardian',feeMessage:true,now:NOW});
  assert.equal(removed.recipients.length,0,'a removed student is never sent to');
  assert.equal(removed.skipped[0].reason,'removed');
  const optedOut=resolveRecipients([student({smsOptOut:true})],{audience:'guardian',feeMessage:true,now:NOW});
  assert.equal(optedOut.recipients.length,0);
  assert.equal(optedOut.skipped[0].reason,'opted_out');
  // Every reason in the closed vocabulary carries both labels, so the dialog can never show a hole.
  for(const reason of SMS_SKIP_REASONS){
    assert.ok(SMS_SKIP_LABELS[reason].bn.trim(),`${reason} needs a Bangla label`);
    assert.ok(SMS_SKIP_LABELS[reason].en.trim(),`${reason} needs an English label`);
  }

  // 2. Held students: excluded from FEE messages, still reachable for non-fee ones.
  const heldFee=resolveRecipients([student({holds:[{start:{year:2026,month:1}}]})],{audience:'guardian',feeMessage:true,now:NOW});
  assert.equal(heldFee.recipients.length,0,'a held student must not receive a fee demand');
  assert.equal(heldFee.skipped[0].reason,'held');
  const heldNonFee=resolveRecipients([student({holds:[{start:{year:2026,month:1}}]})],{audience:'guardian',feeMessage:false,now:NOW});
  assert.equal(heldNonFee.recipients.length,1,'a held student may receive a non-fee message');
  assert.equal(isHeldNow(student({status:'on_hold'}),NOW),true,'status on_hold counts as held');
  assert.equal(isHeldNow(student({holds:[{start:{year:2026,month:1},end:{year:2026,month:6}}]}),NOW),false,'a hold that ended is not held');
  assert.equal(isHeldNow(student({holds:[{start:{year:2026,month:1},end:{year:2026,month:12}}]}),NOW),true,'a hold covering this month is held');

  // 3. Missing and invalid numbers are reported separately, with the offending text kept.
  const missing=resolveRecipients([student({guardianPhone:''})],{audience:'guardian',feeMessage:false,now:NOW});
  assert.equal(missing.skipped[0].reason,'missing_phone');
  const invalid=resolveRecipients([student({guardianPhone:'0171111'})],{audience:'guardian',feeMessage:false,now:NOW});
  assert.equal(invalid.skipped[0].reason,'invalid_phone');
  assert.equal(invalid.skipped[0].phone,'0171111','the operator sees which number was rejected');
  const letters=resolveRecipients([student({guardianPhone:'01711abc11'})],{audience:'guardian',feeMessage:false,now:NOW});
  assert.equal(letters.skipped[0].reason,'invalid_phone','letters are never silently stripped');
  const tooLong=resolveRecipients([student({guardianPhone:'০১৭১১১১১১১১১'})],{audience:'guardian',feeMessage:false,now:NOW});
  assert.equal(tooLong.recipients.length,0,'a 12-digit Bangla number is rejected, not truncated');
  assert.equal(tooLong.skipped[0].reason,'invalid_phone');

  // 4. Normalization: every accepted input shape becomes 01XXXXXXXXX.
  for(const raw of ['01711111111','+8801711111111','8801711111111','1711111111','০১৭১১১১১১১১',' 01711111111 ']){
    const resolved=resolveRecipients([student({guardianPhone:raw})],{audience:'guardian',feeMessage:false,now:NOW});
    assert.equal(resolved.recipients[0]?.phone,'01711111111',`${raw} must normalize to 01711111111`);
  }

  // 5. Audience selection picks the right numbers, and "both" never duplicates one number.
  const both=resolveRecipients([student({guardianPhone:'01711111111',studentPhone:'01822222222',altPhone:'01933333333'})],{audience:'both',feeMessage:false,now:NOW});
  assert.deepEqual(both.recipients.map(r=>r.phone).sort(),['01711111111','01822222222','01933333333']);
  const sameTwice=resolveRecipients([student({guardianPhone:'01711111111',studentPhone:'01711111111'})],{audience:'both',feeMessage:false,now:NOW});
  assert.equal(sameTwice.recipients.length,1,'the same number listed twice sends once');
  const guardianOnly=resolveRecipients([student({guardianPhone:'',altPhone:'',studentPhone:'01822222222'})],{audience:'guardian',feeMessage:false,now:NOW});
  assert.equal(guardianOnly.recipients.length,0,'guardian audience must not fall back to the student number');
  assert.equal(guardianOnly.skipped[0].reason,'missing_phone');

  // 6. Sibling grouping: one message per phone, names joined, money summed.
  const siblings=[
    student({id:'a',nameBn:'রহিম',guardianPhone:'01711111111',values:{month:'মার্চ',due_amount:500,class:'৭'}}),
    student({id:'b',nameBn:'করিম',guardianPhone:'01711111111',values:{month:'মার্চ',due_amount:700,class:'৭'}}),
  ];
  const grouped=resolveRecipients(siblings,{audience:'guardian',feeMessage:true,onePerPhone:true,now:NOW});
  assert.equal(grouped.recipients.length,1,'siblings on one number get one message');
  assert.equal(grouped.recipients[0].grouped,true);
  assert.deepEqual(grouped.recipients[0].studentIds,['a','b']);
  assert.equal(grouped.recipients[0].studentName,'রহিম ও করিম');
  assert.equal(grouped.recipients[0].values.due_amount,1200,'the guardian is told the total, not one child’s share');
  assert.equal(grouped.recipients[0].values.class,'৭');

  // 7. Grouping is REFUSED when a merged message could not state the money honestly.
  const ambiguous=[
    student({id:'a',nameBn:'রহিম',guardianPhone:'01711111111',values:{due_amount:500}}),
    student({id:'b',nameBn:'করিম',guardianPhone:'01711111111',values:{due_amount:''}}),
  ];
  const refused=resolveRecipients(ambiguous,{audience:'guardian',feeMessage:true,onePerPhone:true,now:NOW});
  assert.equal(refused.recipients.length,2,'each sibling gets their own correct message instead');
  assert.equal(refused.recipients.every(r=>!r.grouped),true);
  assert.equal(refused.groupingRefused.length,1,'the dialog must explain why grouping did not happen');
  const mixedClasses=[
    student({id:'a',nameBn:'রহিম',guardianPhone:'01711111111',values:{class:'৭'}}),
    student({id:'b',nameBn:'করিম',guardianPhone:'01711111111',values:{class:'৯'}}),
  ];
  assert.equal(resolveRecipients(mixedClasses,{audience:'guardian',feeMessage:false,onePerPhone:true,now:NOW}).recipients.length,2,'two different classes are not merged into one message');

  // 8. Identical messages to one number collapse; different ones do not.
  const sameMessage=[
    student({id:'a',nameBn:'রহিম',guardianPhone:'01711111111',values:{month:'মার্চ'}}),
    student({id:'b',nameBn:'রহিম',guardianPhone:'01711111111',values:{month:'মার্চ'}}),
  ];
  const collapsed=resolveRecipients(sameMessage,{audience:'guardian',feeMessage:false,now:NOW});
  assert.equal(collapsed.recipients.length,1);
  assert.equal(collapsed.skipped[0].reason,'duplicate');

  // 9. Batching helper: 500 into chunks of 100 is exactly 5 full chunks.
  const chunks=chunkRecipients(Array.from({length:500},(_,i)=>i),100);
  assert.equal(chunks.length,5);
  assert.equal(chunks.every(chunk=>chunk.length===100),true);
  assert.equal(chunkRecipients(Array.from({length:250},(_,i)=>i),100).at(-1)!.length,50,'the last chunk holds the remainder');
  assert.deepEqual(chunkRecipients([],100),[]);

  console.log('SMS recipients: removed and opted-out students are never sent to, held students are excluded from fee messages only, missing/invalid numbers are reported with reasons, every accepted phone shape normalizes to 01XXXXXXXXX, siblings group into one message with a summed total (refused when the amount is ambiguous), and 500 recipients batch into five chunks of 100.');
}

run();
