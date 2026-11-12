import assert from 'node:assert/strict';
import {serverEnv} from '../src/lib/env';
const prior={...process.env};
try{
 process.env.MONGODB_URI='mongodb://127.0.0.1:27017/test';process.env.NEXTAUTH_SECRET='x'.repeat(32);Object.assign(process.env,{NODE_ENV:'production'});
 process.env.NEXTAUTH_URL='https://diction.invalid';process.env.AUTH_URL='https://diction.invalid';assert.equal(serverEnv().NEXTAUTH_URL,'https://diction.invalid');
 for(const bad of ['http://diction.invalid','https://user:pass@diction.invalid','https://diction.invalid/path','https://diction.invalid/?x=1','https://diction.invalid/#x','ftp://diction.invalid']){process.env.NEXTAUTH_URL=bad;delete process.env.AUTH_URL;assert.throws(()=>serverEnv(),/Invalid server environment/,bad)}
 process.env.NEXTAUTH_URL='http://127.0.0.1:3000';process.env.AUTH_URL='http://127.0.0.1:3000';assert.equal(serverEnv().NEXTAUTH_URL,'http://127.0.0.1:3000');
 process.env.AUTH_URL='http://127.0.0.1:3001';assert.throws(()=>serverEnv(),/must match/);
 console.log('Canonical-origin and production HTTPS environment validation passed.');
}finally{process.env=prior}
