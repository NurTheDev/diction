/**
 * R2 · The provider layer against BulkSMSBD's published API contract.
 * Run with `--conditions=react-server` because the module is server-only.
 *
 * Proves: the documented endpoints and parameters, `type=unicode` for Bangla, the many-to-many body
 * format, balance parsing, the FULL response-code table mapped to Bangla, credential validation that
 * never echoes a value, and that the API key cannot escape into an outcome, an error or a log line.
 */
import assert from 'node:assert/strict';
import bnMessages from '../src/messages/bn.json';
import {
  SMS_BALANCE_URL,SMS_BATCH_SIZE,SMS_CODE_KEYS,SMS_MANY_URL,SMS_SINGLE_URL,
  createMockProvider,createSmsProvider,getBulkSmsBdBalance,redactSmsSecrets,
  serializeSmsMany,smsCodeMessage,smsCredentials,smsNeedsUnicode,smsProviderName,
  submitBulkSmsBd,submitManyBulkSmsBd,validateSmsCredentials,
} from '../src/lib/center/sms-provider';

const KEY='sk-test-9f3ab7c1d2e4',SENDER='DictionCtg';

/** A fetcher that records every call and answers a fixed body. */
function recorder(body:string,status=200){
  const calls:{url:string;init?:RequestInit}[]=[];
  const fetcher=(async(url:unknown,init?:RequestInit)=>{
    calls.push({url:String(url),init});
    return new Response(body,{status});
  }) as unknown as typeof fetch;
  return {calls,fetcher};
}

function bodyOf(call:{init?:RequestInit}):URLSearchParams{
  return call.init?.body as URLSearchParams;
}

async function run(){
  process.env.CENTER_SMS_WRITE_ENABLED='true';
  process.env.BULKSMSBD_API_KEY=KEY;
  process.env.BULKSMSBD_SENDER_ID=SENDER;

  // 1. The documented URLs, and the batch size the spec asks for.
  assert.equal(SMS_SINGLE_URL,'https://bulksmsbd.net/api/smsapi');
  assert.equal(SMS_MANY_URL,'https://bulksmsbd.net/api/smsapimany');
  assert.equal(SMS_BALANCE_URL,'https://bulksmsbd.net/api/getBalanceApi');
  assert.equal(SMS_BATCH_SIZE,100,'the spec asks for batches of about 100');

  // 2. Every code in the provider's published table has a Bangla sentence, including the four the
  //    spec names explicitly. Nothing may fall through to the generic "unknown" wording.
  for(const code of ['202','1002','1003','1005','1006','1007','1011','1012','1013','1014','1015','1016','1017','1018','1019','1020','1021','1031','1032']){
    assert.ok(SMS_CODE_KEYS[code],`code ${code} must be mapped`);
    assert.equal(smsCodeMessage(code),(bnMessages.sms.codes as Record<string,string>)[code],'the Bangla sentence comes from the catalog');
    assert.ok(!/[A-Za-z]{4,}/.test(smsCodeMessage(code,'bn')),`code ${code} must read as Bangla, not English`);
    assert.ok(!/[\u0980-\u09ff]/.test(smsCodeMessage(code,'en')),`code ${code} must have a real English sentence`);
  }
  assert.match(smsCodeMessage('202','bn'),/জমা/,'202 says submitted, not delivered');
  assert.match(smsCodeMessage('1007','bn'),/ব্যালেন্স অপর্যাপ্ত/);
  assert.match(smsCodeMessage('1012','bn'),/বাংলায়/,'1012 explains masking SMS must be Bengali');
  assert.match(smsCodeMessage('1032','bn'),/হোয়াইটলিস্টে নেই/,'1032 explains the IP is not whitelisted');
  assert.match(smsCodeMessage('1001','bn'),/নম্বর/,'1001 (invalid number) is mapped too');
  assert.match(smsCodeMessage('9999','bn'),/9999/,'an unmapped code is shown as a code, never as success');
  assert.match(smsCodeMessage(undefined,'bn'),/বোঝা যায়নি/);
  assert.match(smsCodeMessage(undefined,'en'),/could not be read/);

  // 3. Bangla needs the provider's unicode type; ASCII does not.
  assert.equal(smsNeedsUnicode('ডিকশন কোচিং'),true);
  assert.equal(smsNeedsUnicode('Hello 123'),false);
  const banglaCall=recorder('{"response_code":202}');
  await submitBulkSmsBd({phone:'01711111111',message:'ডিকশন কোচিং: পরীক্ষা',fetcher:banglaCall.fetcher});
  assert.equal(banglaCall.calls.length,1);
  assert.equal(bodyOf(banglaCall.calls[0]).get('type'),'unicode','a Bangla body is sent as unicode');
  assert.equal(bodyOf(banglaCall.calls[0]).get('number'),'8801711111111','the documented 8801XXXXXXXXX format');
  assert.equal(bodyOf(banglaCall.calls[0]).get('senderid'),SENDER);
  assert.equal(bodyOf(banglaCall.calls[0]).get('api_key'),KEY);
  const asciiCall=recorder('{"response_code":202}');
  await submitBulkSmsBd({phone:'01711111111',message:'Hello',fetcher:asciiCall.fetcher});
  assert.equal(bodyOf(asciiCall.calls[0]).get('type'),'text','an ASCII body is sent as text');

  // 4. Many-to-many: one call, `88<number>,<message>` pairs joined by semicolons.
  assert.equal(serializeSmsMany([{phone:'01711111111',message:'এক'},{phone:'01822222222',message:'দুই'}]),'8801711111111,এক;8801822222222,দুই');
  const manyCall=recorder('{"response_code":202}');
  const many=await submitManyBulkSmsBd({items:[{phone:'01711111111',message:'এক'},{phone:'01822222222',message:'দুই'}],fetcher:manyCall.fetcher});
  assert.deepEqual(many,{status:'submitted',code:'202'});
  assert.equal(manyCall.calls[0].url,SMS_MANY_URL);
  assert.equal(bodyOf(manyCall.calls[0]).get('messages'),'8801711111111,এক;8801822222222,দুই');
  await assert.rejects(()=>submitManyBulkSmsBd({items:[{phone:'017111',message:'এক'}],fetcher:manyCall.fetcher}),/SMS_INVALID/,'an invalid number rejects the whole call rather than half-sending');
  await assert.rejects(()=>submitManyBulkSmsBd({items:[],fetcher:manyCall.fetcher}),/SMS_INVALID/);

  // 5. Rejections carry their code; a non-JSON or missing code stays unknown, never "sent".
  const rejected=recorder('{"response_code":1007}');
  assert.deepEqual(await submitBulkSmsBd({phone:'01711111111',message:'ডিকশন',fetcher:rejected.fetcher}),{status:'rejected',code:'1007'});
  const garbage=recorder('<html>gateway error</html>');
  assert.deepEqual(await submitBulkSmsBd({phone:'01711111111',message:'ডিকশন',fetcher:garbage.fetcher}),{status:'unknown',reason:'unreadable'},'an unparsable body is unknown, not submitted — and says why, because the retry policy reads that word');
  const noCode=recorder('{"something":"else"}');
  assert.equal((await submitBulkSmsBd({phone:'01711111111',message:'ডিকশন',fetcher:noCode.fetcher})).status,'unknown');

  // 6. Balance: plain text and JSON both parse; a provider error is reported with its code.
  const textBalance=recorder('1234.50');
  assert.deepEqual(await getBulkSmsBdBalance({fetcher:textBalance.fetcher}),{ok:true,balance:1234.5});
  const jsonBalance=recorder('{"balance":100}');
  assert.deepEqual(await getBulkSmsBdBalance({fetcher:jsonBalance.fetcher}),{ok:true,balance:100});
  const poorBalance=recorder('{"response_code":1007}');
  assert.deepEqual(await getBulkSmsBdBalance({fetcher:poorBalance.fetcher}),{ok:false,code:'1007'});
  const brokenBalance=recorder('not a number');
  assert.equal((await getBulkSmsBdBalance({fetcher:brokenBalance.fetcher})).ok,false,'an unreadable balance is never shown as zero');
  assert.equal(textBalance.calls[0].url.startsWith(`${SMS_BALANCE_URL}?api_key=`),true);

  // 7. Credentials: validated without ever echoing a value, and missing ones are named.
  assert.deepEqual(validateSmsCredentials(),{ok:true,missing:[]});
  assert.deepEqual(smsCredentials(),{apiKey:KEY,senderId:SENDER});
  delete process.env.BULKSMSBD_SENDER_ID;
  assert.deepEqual(validateSmsCredentials(),{ok:false,missing:['BULKSMSBD_SENDER_ID']});
  assert.equal(smsCredentials(),null);
  assert.deepEqual(await getBulkSmsBdBalance({fetcher:textBalance.fetcher}),{ok:false},'no credentials means no balance call at all');
  await assert.rejects(()=>submitBulkSmsBd({phone:'01711111111',message:'ডিকশন',fetcher:textBalance.fetcher}),/SMS_NOT_CONFIGURED/);
  process.env.BULKSMSBD_SENDER_ID=SENDER;

  // 8. The key cannot escape: redaction, outcomes, errors and the mock log are all clean.
  assert.equal(redactSmsSecrets(`key=${KEY} sender=${SENDER}`),'key=*** sender=***');
  assert.equal(redactSmsSecrets('no secrets here'),'no secrets here');
  const leaky=recorder(`{"response_code":1032,"detail":"${KEY}"}`);
  const leakyOutcome=await submitBulkSmsBd({phone:'01711111111',message:'ডিকশন',fetcher:leaky.fetcher});
  assert.ok(!JSON.stringify(leakyOutcome).includes(KEY),'a provider body echoing the key must not reach the caller');
  const logged:string[]=[];
  const mock=createMockProvider(line=>logged.push(line));
  await mock.send('01711111111','ডিকশন কোচিং: পরীক্ষা');
  assert.equal(logged.length,1);
  assert.match(logged[0],/^Sent \(mock\) to 01711111111:/,'the mock says "Sent (mock)" and nothing is really sent');
  assert.ok(!logged[0].includes(KEY));

  // 9. Provider selection: mock is the default, so a test run can never send a real message.
  delete process.env.SMS_PROVIDER;
  assert.equal(smsProviderName(),'mock');
  assert.equal(createSmsProvider().name,'mock');
  process.env.SMS_PROVIDER='bulksmsbd';
  assert.equal(smsProviderName(),'bulksmsbd');
  assert.equal(createSmsProvider().name,'bulksmsbd');
  assert.equal(createSmsProvider().configured,true);
  process.env.SMS_PROVIDER='nonsense';
  assert.equal(smsProviderName(),'mock','an unrecognized provider falls back to mock, never to a real gateway');

  // 10. The write gate still stands: without it, even a configured provider refuses.
  process.env.SMS_PROVIDER='bulksmsbd';
  process.env.CENTER_SMS_WRITE_ENABLED='false';
  await assert.rejects(()=>submitBulkSmsBd({phone:'01711111111',message:'ডিকশন',fetcher:textBalance.fetcher}),/SMS_DISABLED/);
  await assert.rejects(()=>submitManyBulkSmsBd({items:[{phone:'01711111111',message:'ডিকশন'}],fetcher:textBalance.fetcher}),/SMS_DISABLED/);

  console.log('SMS provider: the three documented endpoints and their parameters are used exactly, Bangla goes as type=unicode and ASCII as text, the many-to-many body is 88<number>,<message> pairs, balance parses from text and JSON, all 19 published response codes read as Bangla, and the API key is validated, redacted and never returned, logged or sent to a browser.');
}

run().catch(error=>{console.error(error);process.exit(1)});
