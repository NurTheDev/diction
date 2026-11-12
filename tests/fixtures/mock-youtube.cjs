/* Test-only YouTube Data API mock. Never loaded in production. */
const previous=globalThis.fetch;
globalThis.fetch=async function(input,init){
 const raw=typeof input==='string'?input:input instanceof URL?input.toString():input.url;
 const url=new URL(raw);
 if(url.hostname==='www.googleapis.com'&&url.pathname.startsWith('/youtube/v3/')){
  if(new Headers(init?.headers).get('x-goog-api-key')!=='fake-youtube-key')return new Response('{}',{status:403});
  let data;
  if(url.pathname.endsWith('/channels')){
   data={items:[{contentDetails:{relatedPlaylists:{uploads:'UU_test_uploads'}}}]};
  }else if(url.pathname.endsWith('/playlistItems')){
   data=url.searchParams.has('pageToken')
    ?{items:[{snippet:{title:'Mock second upload',description:'',resourceId:{videoId:'LG4k0TDgC9k'}}}]}
    :{nextPageToken:'next-page',items:[{snippet:{title:'Mock first upload',description:'',resourceId:{videoId:'DKIrRxaLgBo'}}},{snippet:{title:'Private upload',description:'',resourceId:{videoId:'12345678901'}}}]};
  }else if(url.pathname.endsWith('/videos')){
   data={items:(url.searchParams.get('id')||'').split(',').map(id=>({id,status:{privacyStatus:id==='12345678901'?'private':'public'}}))};
  }else return new Response('{}',{status:404});
  return Response.json(data);
 }
 return previous(input,init);
};
