import {MongoClient} from 'mongodb';
import fs from 'node:fs';
const uri=fs.readFileSync('.env.local','utf8').split('\n').find(l=>l.startsWith('MONGODB_URI=')).split('=').slice(1).join('=').trim();
const c=new MongoClient(uri,{serverSelectionTimeoutMS:20000});
try{
  await c.connect();
  const h=await c.db('admin').command({hello:1});
  console.log('CONNECTED  primary =', h.primary, '| me =', h.me);
}catch(e){
  console.log('FAILED:', e.name, '|', String(e.message).split('\n')[0]);
  const tp=e.reason; if(tp?.servers) for(const [k,v] of tp.servers)
    console.log('  ',k,'=>',v.type, v.error?('| '+String(v.error.message).split('\n')[0]):'');
}
await c.close().catch(()=>{});process.exit(0);
