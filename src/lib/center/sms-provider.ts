/**
 * Server-only SMS provider layer (R2).
 *
 * Implemented against BulkSMSBD's current official API documentation
 * (https://bulksmsbd.com/bulksms-api-bangladesh.php, read 2026-11-12):
 *   Single SMS   POST/GET https://bulksmsbd.net/api/smsapi      api_key, type, number, senderid, message
 *   Many SMS     POST/GET https://bulksmsbd.net/api/smsapimany  api_key, senderid, messages
 *   Balance      POST/GET https://bulksmsbd.net/api/getBalanceApi  api_key
 *   number format 8801XXXXXXXXX; every documented response code is mapped to a plain Bangla sentence.
 *
 * No automatic retry inside `submitBulkSmsBd`: an HTTP timeout may occur after provider submission,
 * and provider acceptance is not delivery. Callers (src/lib/center/sms-send.ts) own authorization,
 * opt-outs, quiet hours, batching, retries, idempotency and durable audit.
 *
 * Credentials live only in BULKSMSBD_API_KEY / BULKSMSBD_SENDER_ID, are read here and nowhere else,
 * and are redacted from every string this module can return or throw.
 */
import 'server-only';
import bnMessages from '@/messages/bn.json';
import enMessages from '@/messages/en.json';

const basic="@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const extension='^{}\\[~]|€';

/** GSM-7 counts septets (160/153); anything else — Bangla included — is Unicode (70/67). */
export function estimateSms(message:string){if(!message)throw Error('EMPTY_MESSAGE');let septets=0,gsm=true;for(const char of message){if(basic.includes(char))septets++;else if(extension.includes(char))septets+=2;else{gsm=false;break}}if(gsm)return {encoding:'GSM-7' as const,units:septets,segments:septets<=160?1:Math.ceil(septets/153)};const units=message.length;return {encoding:'Unicode' as const,units,segments:units<=70?1:Math.ceil(units/67)}}

export const SMS_SINGLE_URL='https://bulksmsbd.net/api/smsapi';
export const SMS_MANY_URL='https://bulksmsbd.net/api/smsapimany';
export const SMS_BALANCE_URL='https://bulksmsbd.net/api/getBalanceApi';
/** Spec: batches of about 100 recipients per provider call. */
export const SMS_BATCH_SIZE=100;

/** Every code in the provider's published table, in the operator's language. */
export /** Provider codes as catalog keys: the operator reads them in their own language, and B.2 keeps the
 * official English wording next to the Bangla one in the message files. */
const SMS_CODE_KEYS:Record<string,string>={  '202':'202',
  '1001':'1001',
  '1002':'1002',
  '1003':'1003',
  '1005':'1005',
  '1006':'1006',
  '1007':'1007',
  '1011':'1011',
  '1012':'1012',
  '1013':'1013',
  '1014':'1014',
  '1015':'1015',
  '1016':'1016',
  '1017':'1017',
  '1018':'1018',
  '1019':'1019',
  '1020':'1020',
  '1021':'1021',
  '1031':'1031',
  '1032':'1032'};

export function smsCodeMessageKey(code:string):string{
  if(!code)return 'codesNone';
  return SMS_CODE_KEYS[code]?'codes.'+code:'codesUnknown';
}

/** The sentence for a provider code, in one language, straight from the catalog. */
export function smsCodeMessage(code:string|undefined,language:'bn'|'en'='bn'):string{
  const catalog=(language==='bn'?bnMessages.sms:enMessages.sms) as unknown as {codes:Record<string,string>;codesNone:string;codesUnknown:string};
  if(!code)return catalog.codesNone;
  if(SMS_CODE_KEYS[code])return catalog.codes[code];
  return String(catalog.codesUnknown).replace('{code}',code);
}

/** True when the body needs the provider's Unicode type — Bangla always does. */
export function smsNeedsUnicode(message:string):boolean{return estimateSms(message).encoding==='Unicode'}

export type SmsOutcome={status:'submitted'|'rejected'|'unknown';code?:string};

export function smsCredentials():{apiKey:string;senderId:string}|null{
  const apiKey=process.env.BULKSMSBD_API_KEY,senderId=process.env.BULKSMSBD_SENDER_ID;
  return apiKey&&senderId?{apiKey,senderId}:null;
}

/** Startup validation: reports what is missing without echoing any value. */
export function validateSmsCredentials():{ok:boolean;missing:string[]}{
  const missing:string[]=[];
  if(!process.env.BULKSMSBD_API_KEY)missing.push('BULKSMSBD_API_KEY');
  if(!process.env.BULKSMSBD_SENDER_ID)missing.push('BULKSMSBD_SENDER_ID');
  return {ok:missing.length===0,missing};
}

/** Scrub credentials out of anything that could reach a log, an audit row or the browser. */
export function redactSmsSecrets(text:string):string{
  let out=String(text);
  for(const value of [process.env.BULKSMSBD_API_KEY,process.env.BULKSMSBD_SENDER_ID]){
    if(value&&value.length>3)out=out.split(value).join('***');
  }
  return out;
}

function parseCode(data:unknown):string{
  if(!data||typeof data!=='object')return '';
  const obj=data as Record<string,unknown>,value=obj.response_code??obj.code;
  return typeof value==='number'||typeof value==='string'?String(value):'';
}

export async function submitBulkSmsBd({phone,message,fetcher=fetch}:{phone:string;message:string;fetcher?:typeof fetch}):Promise<SmsOutcome>{
  if(process.env.CENTER_SMS_WRITE_ENABLED!=='true')throw Error('SMS_DISABLED');
  const credentials=smsCredentials();
  if(!credentials)throw Error('SMS_NOT_CONFIGURED');
  if(!/^01[3-9]\d{8}$/.test(phone)||!message.trim()||message.length>2000)throw Error('SMS_INVALID');
  try{
    // `type` is a documented parameter: Bangla bodies go as unicode, ASCII bodies as text.
    const body=new URLSearchParams({api_key:credentials.apiKey,type:smsNeedsUnicode(message)?'unicode':'text',senderid:credentials.senderId,number:'88'+phone,message});
    const response=await fetcher(SMS_SINGLE_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(15000),cache:'no-store',redirect:'error'});
    const text=redactSmsSecrets((await response.text()).slice(0,20000));
    let data:unknown;try{data=JSON.parse(text)}catch{return {status:'unknown'}}
    const code=parseCode(data);
    if(!code)return {status:'unknown'};
    if(response.ok&&code==='202')return {status:'submitted',code};
    if(/^10\d{2}$/.test(code))return {status:'rejected',code};
    return {status:'unknown',code};
  }catch{return {status:'unknown'}}
}

export type SmsManyItem={phone:string;message:string};

/** Serialize the provider's "mixed phone number and message" body: `880171…,msg;880181…,msg`. */
export function serializeSmsMany(items:SmsManyItem[]):string{
  return items.map(item=>`88${item.phone},${item.message}`).join(';');
}

/** One-to-many / many-to-many submission. Rejects the whole call, so callers re-batch. */
export async function submitManyBulkSmsBd({items,fetcher=fetch}:{items:SmsManyItem[];fetcher?:typeof fetch}):Promise<SmsOutcome>{
  if(process.env.CENTER_SMS_WRITE_ENABLED!=='true')throw Error('SMS_DISABLED');
  const credentials=smsCredentials();
  if(!credentials)throw Error('SMS_NOT_CONFIGURED');
  if(!items.length)throw Error('SMS_INVALID');
  if(items.some(item=>!/^01[3-9]\d{8}$/.test(item.phone)||!item.message.trim()||item.message.length>2000))throw Error('SMS_INVALID');
  try{
    const body=new URLSearchParams({api_key:credentials.apiKey,senderid:credentials.senderId,messages:serializeSmsMany(items)});
    const response=await fetcher(SMS_MANY_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(30000),cache:'no-store',redirect:'error'});
    const text=redactSmsSecrets((await response.text()).slice(0,20000));
    let data:unknown;try{data=JSON.parse(text)}catch{return {status:'unknown'}}
    const code=parseCode(data);
    if(!code)return {status:'unknown'};
    if(response.ok&&code==='202')return {status:'submitted',code};
    if(/^10\d{2}$/.test(code))return {status:'rejected',code};
    return {status:'unknown',code};
  }catch{return {status:'unknown'}}
}

export type SmsBalance={ok:true;balance:number}|{ok:false;code?:string};

/** Live balance for the settings page. Never returns the key, even in the failure branch. */
export async function getBulkSmsBdBalance({fetcher=fetch}:{fetcher?:typeof fetch}={}):Promise<SmsBalance>{
  const credentials=smsCredentials();
  if(!credentials)return {ok:false};
  try{
    const url=`${SMS_BALANCE_URL}?api_key=${encodeURIComponent(credentials.apiKey)}`;
    const response=await fetcher(url,{method:'GET',signal:AbortSignal.timeout(15000),cache:'no-store',redirect:'error'});
    const text=redactSmsSecrets((await response.text()).slice(0,2000)).trim();
    let data:unknown;try{data=JSON.parse(text)}catch{data=null}
    const code=parseCode(data);
    if(code&&code!=='202'&&/^10\d{2}$/.test(code))return {ok:false,code};
    const candidate=data&&typeof data==='object'?((data as Record<string,unknown>).balance??(data as Record<string,unknown>).amount):text;
    if(typeof candidate==='number'&&Number.isFinite(candidate))return {ok:true,balance:candidate};
    // Only a single plain decimal is accepted. Stripping punctuation from prose ("not a number")
    // yields '' and Number('') is 0, which would report a false zero balance and a bogus
    // low-balance warning — so anything that is not a number is reported as unreadable instead.
    const digits=String(candidate??'').replace(/[^\d.-]/g,'');
    if(!/^-?\d+(?:\.\d+)?$/.test(digits))return {ok:false,code:code||undefined};
    const balance=Number(digits);
    if(!Number.isFinite(balance))return {ok:false,code:code||undefined};
    return {ok:true,balance};
  }catch{return {ok:false}}
}

/**
 * The provider the rest of the app talks to. `SMS_PROVIDER=mock` (the default, and forced in test
 * mode) sends nothing and records "Sent (mock)"; `bulksmsbd` uses the documented endpoints above.
 */
export type SmsProviderName='mock'|'bulksmsbd';

export interface SmsProvider{
  readonly name:SmsProviderName;
  readonly configured:boolean;
  send(phone:string,message:string):Promise<SmsOutcome>;
  sendMany(items:SmsManyItem[]):Promise<SmsOutcome>;
  balance():Promise<SmsBalance>;
}

export function smsProviderName():SmsProviderName{
  return process.env.SMS_PROVIDER==='bulksmsbd'?'bulksmsbd':'mock';
}

/** The mock never touches the network, so a test run can send 500 messages safely. */
export function createMockProvider(log:(line:string)=>void=()=>{}):SmsProvider{
  return {
    name:'mock',
    configured:true,
    async send(phone,message){log(`Sent (mock) to ${phone}: ${message.slice(0,80)}`);return {status:'submitted',code:'202'}},
    async sendMany(items){for(const item of items)log(`Sent (mock) to ${item.phone}: ${item.message.slice(0,80)}`);return {status:'submitted',code:'202'}},
    async balance(){return {ok:true,balance:Number(process.env.SMS_MOCK_BALANCE??9999)}},
  };
}

export function createBulkSmsBdProvider(fetcher:typeof fetch=fetch):SmsProvider{
  const configured=validateSmsCredentials().ok;
  return {
    name:'bulksmsbd',
    configured,
    send:(phone,message)=>submitBulkSmsBd({phone,message,fetcher}),
    sendMany:items=>submitManyBulkSmsBd({items,fetcher}),
    balance:()=>getBulkSmsBdBalance({fetcher}),
  };
}

export function createSmsProvider(fetcher:typeof fetch=fetch,log:(line:string)=>void=(line)=>console.log(redactSmsSecrets(line))):SmsProvider{
  return smsProviderName()==='bulksmsbd'?createBulkSmsBdProvider(fetcher):createMockProvider(log);
}
