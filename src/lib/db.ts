import mongoose from 'mongoose';
import {serverEnv} from './env';
import {databaseName} from './center/data-mode';
const globalForDb=globalThis as typeof globalThis & {mongooseCache?:{conn:typeof mongoose|null,promise:Promise<typeof mongoose>|null,dbName?:string}};
const cache=globalForDb.mongooseCache ??= {conn:null,promise:null};
export async function connectDB(){const dbName=databaseName();if(cache.dbName&&cache.dbName!==dbName)throw Error('Database mode changed; restart the server');if(cache.conn)return cache.conn; const {MONGODB_URI}=serverEnv();cache.dbName=dbName; cache.promise ??= mongoose.connect(MONGODB_URI,{dbName,bufferCommands:false,maxPoolSize:5}); try{cache.conn=await cache.promise;return cache.conn;}catch(error){cache.promise=null;throw error;}}
