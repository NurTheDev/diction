/**
 * The automatic retry, and the line it may not cross.
 *
 * BulkSMSBD takes no idempotency key, so a second call for the same message is a second message and a
 * second charge. That makes "retry" a question about what the failure proves, not about how many
 * times we would like to try:
 *
 *   · code 1005 — the provider answered that its own internals failed, so it did not take the
 *     message. Safe to attempt again, at most twice, a short wait apart.
 *   · a `network` failure — no route, no socket, connection refused: the request never reached the
 *     provider, so nothing was submitted. Equally safe.
 *   · a `timeout` — the request left and the wire went quiet. The provider may already have taken it.
 *     NEVER auto-retried; that is the operator's explicit "Retry failed", and the dialog warns first.
 *   · anything unreadable, and every permanent code (1007 insufficient balance, 1001 bad number) —
 *     one attempt, because a retry either cannot help or cannot be proven safe.
 *
 * The attempt count is returned with the outcome and stored on the log row: an audit that cannot say
 * how many times a message went out cannot show that it went out once.
 *
 * Run: npx tsx --conditions=react-server tests/sms-retry.test.ts
 */
import assert from 'node:assert/strict';
import {smsRetryable,submitWithRetry} from '../src/lib/center/sms-send';
import {smsFailureReason,type SmsOutcome} from '../src/lib/center/sms-provider';

/** A provider call scripted answer by answer, counting what was asked of it. */
function scripted(answers:SmsOutcome[]){
  const waits:number[]=[];
  let calls=0;
  const send=async():Promise<SmsOutcome>=>answers[Math.min(calls++,answers.length-1)];
  const sleep=async(ms:number):Promise<void>=>{waits.push(ms)};
  return {send,sleep,waits,calls:()=>calls};
}

async function main(){
  // 1. A message that goes out first time is asked for exactly once, and nothing waits.
  const first=scripted([{status:'submitted',code:'202'}]);
  assert.deepEqual(await submitWithRetry(first.send,[600,1800],first.sleep),{outcome:{status:'submitted',code:'202'},attempts:1});
  assert.equal(first.calls(),1,'a submitted message is never sent again');
  assert.deepEqual(first.waits,[],'and nothing waits for it');

  // 2. One 1005, then it goes out: two attempts, one short wait.
  const hiccup=scripted([{status:'rejected',code:'1005'},{status:'submitted',code:'202'}]);
  assert.deepEqual(await submitWithRetry(hiccup.send,[600,1800],hiccup.sleep),{outcome:{status:'submitted',code:'202'},attempts:2});
  assert.deepEqual(hiccup.waits,[600],'the retry waits before it goes back');

  // 3. Two 1005s, then it goes out: the second retry is the last one offered.
  const slow=scripted([{status:'rejected',code:'1005'},{status:'rejected',code:'1005'},{status:'submitted',code:'202'}]);
  assert.equal((await submitWithRetry(slow.send,[600,1800],slow.sleep)).attempts,3);
  assert.deepEqual(slow.waits,[600,1800],'the second wait is longer, so a real outage is not hammered');

  // 4. A provider that stays broken stops after two retries: three attempts, and the failure stands.
  const broken=scripted([{status:'rejected',code:'1005'}]);
  const exhausted=await submitWithRetry(broken.send,[600,1800],broken.sleep);
  assert.equal(exhausted.attempts,3,'two retries on top of the first attempt, never more');
  assert.equal(broken.calls(),3);
  assert.equal(exhausted.outcome.status,'rejected','and the last answer is the one reported');

  // 5. A request that never reached the provider is worth another attempt.
  const dark=scripted([{status:'unknown',reason:'network'},{status:'submitted',code:'202'}]);
  assert.equal((await submitWithRetry(dark.send,[600,1800],dark.sleep)).attempts,2,'no route, no socket: nothing was submitted, so trying again is safe');

  // 6. The line it may not cross: a timeout on the wire is one attempt and no more.
  for(const outcome of [{status:'unknown',reason:'timeout'},
                        {status:'unknown',reason:'unreadable'},
                        {status:'unknown',reason:'http'},
                        {status:'unknown',reason:'code',code:'9999'},
                        {status:'rejected',code:'1007'},
                        {status:'rejected',code:'1001'}] as SmsOutcome[]){
    const probe=scripted([outcome,{status:'submitted',code:'202'}]);
    const result=await submitWithRetry(probe.send,[600,1800],probe.sleep);
    assert.equal(result.attempts,1,`${outcome.reason||outcome.code} is not retried: it does not prove the message was not sent`);
    assert.equal(probe.calls(),1);
    assert.equal(smsRetryable(outcome),false);
  }
  assert.equal(smsRetryable({status:'submitted',code:'202'}),false,'and a submitted message is never a retry candidate');

  // 7. The classification itself: only a failure that provably never left the machine reads `network`.
  for(const code of ['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','EHOSTUNREACH','ENETUNREACH','ENETDOWN','UND_ERR_CONNECT_TIMEOUT']){
    assert.equal(smsFailureReason(Object.assign(Error('fetch failed'),{code})),'network',`${code} never reached the provider`);
    assert.equal(smsFailureReason(Object.assign(Error('fetch failed'),{cause:{code}})),'network',`and the same code nested in a cause is read too (${code})`);
  }
  assert.equal(smsFailureReason(Object.assign(Error('This operation was aborted'),{name:'TimeoutError'})),'timeout','our own 15/30 second deadline is the risky case');
  assert.equal(smsFailureReason(Object.assign(Error('aborted'),{code:'ABORT_ERR'})),'timeout');
  for(const code of ['UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','ECONNRESET','EPIPE','SOMETHING_NEW']){
    assert.equal(smsFailureReason(Object.assign(Error('fetch failed'),{code})),'timeout',`${code} may have happened after submission, so it is treated as the risky case`);
  }
  assert.equal(smsFailureReason(undefined),'timeout','and an unrecognizable failure is never assumed safe');

  // 8. The waits are injectable, so a test run does not spend 2.4 seconds per chunk.
  const instant=scripted([{status:'rejected',code:'1005'},{status:'rejected',code:'1005'},{status:'submitted',code:'202'}]);
  assert.equal((await submitWithRetry(instant.send,[0,0],instant.sleep)).attempts,3);
  assert.deepEqual(instant.waits,[0,0],'a zero wait is still recorded, so the attempts are still counted');

  console.log('SMS retry: 1005 and a request that never reached the provider are attempted at most twice more, a short wait apart; a timeout on the wire, an unreadable answer and every permanent code are attempted exactly once, and the attempt count comes back with the outcome.');
}

void main();
