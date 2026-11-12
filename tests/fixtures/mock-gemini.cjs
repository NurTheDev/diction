/* Test-only upstream interception. No production imports use this file. */
const originalFetch=globalThis.fetch;
globalThis.fetch=async function(input,init){const url=typeof input==='string'?input:input instanceof URL?input.toString():input.url;if(url==='https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'){
 const headers=new Headers(init?.headers),body=JSON.parse(init?.body||'{}');
 if(headers.get('authorization')==='Bearer fake-test-key'&&body.model==='gemini-3.8-flash'&&body.stream===false&&body.messages?.[0]?.content==='What is 2+2? Answer briefly.')return Response.json({choices:[{message:{content:'4'}}]});
 if(headers.get('authorization')!=='Bearer fake-test-key'||body.model!=='gemini-3.8-flash'||body.stream!==true||!body.messages?.[0]?.content?.includes('class 8'))return new Response('mock configuration mismatch',{status:500});
 const stream=new ReadableStream({start(controller){const encoder=new TextEncoder();controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Mocked answer: "}}]}\n\n'));controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"two plus two is four."}}]}\n\ndata: [DONE]\n\n'));controller.close()}});
 return new Response(stream,{status:200,headers:{'Content-Type':'text/event-stream'}});
 }return originalFetch(input,init)};
