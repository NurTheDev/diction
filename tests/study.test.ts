import assert from 'node:assert/strict';
import {aiStatus,chatRequestBody,GEMINI_COMPAT_BASE,openChatStream,providerErrorKind} from '../src/lib/ai';
import {answerSchema,plannerSchema,focusSchema,chatSchema} from '../src/schemas/study';
import {dhakaDay,addDays,makePlan} from '../src/lib/study-date';
import {makeChallenge} from '../src/lib/study';
const today=dhakaDay();const tomorrow=addDays(today,1);const q=makeChallenge(today,'8');
assert.equal(makeChallenge(today,'8').answer,q.answer);
assert.notEqual(makeChallenge(today,'8').question,makeChallenge(addDays(today,1),'8').question);
assert.notEqual(makeChallenge(today,'4').question,makeChallenge(today,'8').question);
assert.equal(answerSchema.safeParse({answer:''}).success,false);
assert.equal(answerSchema.safeParse({answer:'23'}).success,true);
assert.equal(plannerSchema.safeParse({examDate:tomorrow,subjects:'Math, English',minutes:60}).success,true);
assert.equal(plannerSchema.safeParse({examDate:today,subjects:'Math',minutes:60}).success,false);
assert.equal(plannerSchema.safeParse({examDate:tomorrow,subjects:'a,b,c,d,e,f,g',minutes:60}).success,false);
assert.equal(makePlan(today,addDays(today,25),['Math','English'],60).length,14);
assert.equal(focusSchema.safeParse({sessionId:'550e8400-e29b-41d4-a716-446655440000',minutes:25}).success,true);
assert.equal(chatSchema.safeParse({consent:true,locale:'bn',messages:[{role:'user',content:'গণিত বুঝিয়ে দাও'}]}).success,true);
assert.equal(chatSchema.safeParse({consent:true,locale:'bn',messages:[{role:'assistant',content:'hello'}]}).success,false);
assert.equal(chatSchema.safeParse({consent:false,locale:'bn',messages:[{role:'user',content:'Hi'}]}).success,false);
assert.equal(aiStatus({}).ready,false);const aiEnv={DATA_COLLECTION_ENABLED:'true',AI_STUDY_BUDDY_ENABLED:'true',GEMINI_API_KEY:'fake-key',AI_MODEL:'gemini-3.8-flash'};assert.equal(aiStatus(aiEnv).ready,true);assert.equal(aiStatus({...aiEnv,AI_STUDY_BUDDY_ENABLED:'false'}).ready,false);assert.equal(aiStatus({...aiEnv,NODE_ENV:'development',PREVIEW_WITHOUT_SERVICES:'1'}).ready,false);assert.equal(aiStatus({...aiEnv,AI_API_BASE_URL:'http://localhost'}).ready,false);assert.equal(aiStatus({...aiEnv,AI_API_BASE_URL:'https://user:pass@example.com/'}).ready,false);assert.equal(aiStatus({...aiEnv,AI_MODEL:'invalid model'}).ready,false);assert.equal(GEMINI_COMPAT_BASE,'https://generativelanguage.googleapis.com/v1beta/openai');
(async()=>{
  /* A busy free provider is retried before the stream is read, and the retry's success is returned. */
  const realFetch=globalThis.fetch;
  try{
    let calls=0;
    globalThis.fetch=(async()=>{calls++;return calls<3?new Response('busy',{status:503}):Response.json({choices:[{message:{content:'ok'}}]})}) as unknown as typeof fetch;
    const config={key:'fake-key',model:'gemini-3.8-flash',base:GEMINI_COMPAT_BASE};
    const response=await openChatStream(config,{model:config.model,stream:true,messages:[]});
    assert.equal(calls,3,'a busy provider is retried');
    assert.equal(response.status,200,'the successful retry is returned');
  }finally{globalThis.fetch=realFetch}
  const config={key:'fake-key',model:'gemini-3.8-flash',base:GEMINI_COMPAT_BASE};
  assert.equal(chatRequestBody(config,[{role:'user',content:'Hi'}]).reasoning_effort,'low','Gemini gets a small thinking budget');
  assert.equal(chatRequestBody({...config,base:'https://example.test/v1'},[{role:'user',content:'Hi'}]).reasoning_effort,undefined,'other providers are not sent a Gemini-only field');
  assert.equal(chatRequestBody(config,[{role:'user',content:'Hi'}]).max_tokens,4096);
  assert.equal(await providerErrorKind(new Response('[{"error":{"status":"UNAVAILABLE"}}]',{status:503})),'busy');
  assert.equal(await providerErrorKind(new Response('{"error":{"details":[{"violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}]}}',{status:429})),'daily');
  assert.equal(await providerErrorKind(new Response('{"error":{"status":"RESOURCE_EXHAUSTED"}}',{status:429})),'rate');
  assert.equal(await providerErrorKind(new Response('{}',{status:404})),'model');
  console.log('Study feature validation tests passed.');
})().catch(error=>{console.error(error);process.exit(1)});
