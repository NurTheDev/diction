/** Server-only AI configuration. No API keys or provider response bodies are logged or returned to the browser. */
export const GEMINI_COMPAT_BASE='https://generativelanguage.googleapis.com/v1beta/openai';
export type AIStatus={dataEnabled:boolean;featureEnabled:boolean;keyConfigured:boolean;modelConfigured:boolean;endpointConfigured:boolean;preview:boolean;ready:boolean};
export type AIConfig={key:string;model:string;base:string};
export type AIMessage={role:'system'|'user'|'assistant';content:string};
export type ProviderErrorKind='rate'|'daily'|'model'|'busy'|'unavailable';
export function aiStatus(env:Record<string,string|undefined>=process.env):AIStatus{const dataEnabled=env.DATA_COLLECTION_ENABLED==='true',featureEnabled=env.AI_STUDY_BUDDY_ENABLED==='true';const keyConfigured=Boolean((env.GEMINI_API_KEY||env.AI_API_KEY||'').trim());const modelConfigured=/^[a-zA-Z0-9._/-]{1,100}$/.test((env.AI_MODEL||'').trim());let endpointConfigured=false;try{const url=new URL((env.AI_API_BASE_URL||GEMINI_COMPAT_BASE).trim());endpointConfigured=url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash}catch{/* bad URL */}const preview=env.NODE_ENV!=='production'&&env.PREVIEW_WITHOUT_SERVICES==='1';return {dataEnabled,featureEnabled,keyConfigured,modelConfigured,endpointConfigured,preview,ready:!preview&&dataEnabled&&featureEnabled&&keyConfigured&&modelConfigured&&endpointConfigured}}
export function aiConfig():AIConfig|null{if(!aiStatus().ready)return null;return {key:(process.env.GEMINI_API_KEY||process.env.AI_API_KEY||'').trim(),model:process.env.AI_MODEL!.trim(),base:(process.env.AI_API_BASE_URL||GEMINI_COMPAT_BASE).trim().replace(/\/+$/,'')}}
/**
 * Gemini 3.x thinks before it answers, and those hidden tokens count against `max_tokens`. At the
 * default "medium" effort a study answer can spend the whole 2048-token budget thinking, so the
 * stream can finish with no visible text at all. Low effort leaves room for the answer and is
 * plenty for a tutor. Other OpenAI-compatible providers may not know the field, so it is only sent
 * to Gemini's own endpoint.
 */
export function chatRequestBody(config:AIConfig,messages:AIMessage[],maxTokens=4096):Record<string,unknown>{
 const body:Record<string,unknown>={model:config.model,stream:true,max_tokens:maxTokens,messages};
 if(config.base===GEMINI_COMPAT_BASE)body.reasoning_effort='low';
 return body;
}
/**
 * A busy free provider answers 5xx ("This model is currently experiencing high demand"), which is
 * usually a temporary spike. Retry those before any of the stream has been read; a 429 will not
 * clear in the seconds a request can afford, so it is returned unchanged. The body of a retried
 * response is cancelled to release the connection.
 */
export async function openChatStream(config:AIConfig,body:Record<string,unknown>,attempts=3):Promise<Response>{
 let response:Response|null=null;
 for(let attempt=0;attempt<attempts;attempt++){
  response=await fetch(`${config.base}/chat/completions`,{method:'POST',headers:{'Authorization':`Bearer ${config.key}`,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(60000)});
  if(response.ok&&response.body)return response;
  if(response.status<500||response.status===501||attempt===attempts-1)return response;
  await response.body?.cancel().catch(()=>{});
  await new Promise(resolve=>setTimeout(resolve,600*(attempt+1)));
 }
 return response!;
}
/**
 * Google answers 429 with a quota id naming the limit. A per-day quota will not clear by waiting,
 * so the UI can say that instead of repeating "too many requests". Only the status and quota name
 * are read; the provider's message is never returned to the browser or logged.
 */
export async function providerErrorKind(response:Response):Promise<ProviderErrorKind>{
 if(response.status===429){
  let text='';
  try{text=(await response.text()).slice(0,4000)}catch{/* an unreadable body is a plain rate limit */}
  return /PerDay|per day|daily/i.test(text)?'daily':'rate';
 }
 if(response.status===400||response.status===404)return 'model';
 return response.status>=500?'busy':'unavailable';
}
