import assert from 'node:assert/strict';import {centerDataMode,databaseName} from '../src/lib/center/data-mode';import {testDbName} from './helpers/env-preflight';
assert.equal(databaseName('test'),'dictioncoaching_test');assert.equal(databaseName('production'),'dictioncoaching');assert.equal(databaseName(''),'dictioncoaching');assert.equal(centerDataMode('test'),'test');assert.throws(()=>databaseName('testing'));
/* Regression: a browser test that connects to `dictioncoaching` while the app serves
   `dictioncoaching_test` seeds users nobody can log in with, and every locator then times out.
   The name a test uses must always be the name the app resolved. */
{const saved={db:process.env.TEST_MONGO_DB,uri:process.env.TEST_MONGO_URI,mode:process.env.CENTER_DATA_MODE};
 delete process.env.TEST_MONGO_DB;delete process.env.TEST_MONGO_URI;delete process.env.CENTER_DATA_MODE;
 assert.equal(testDbName(),'dictioncoaching','no signals: the production name');
 process.env.CENTER_DATA_MODE='test';
 assert.equal(testDbName(),databaseName('test'),'test mode agrees with the app resolver');
 process.env.TEST_MONGO_URI='mongodb://127.0.0.1:46629/?replicaSet=testset';
 assert.equal(testDbName(),'dictioncoaching_test','a replica-set URI with no database keeps test mode');
 process.env.TEST_MONGO_URI='mongodb://127.0.0.1:27017/somename';
 assert.equal(testDbName(),'somename','the database in the URI path is used');
 process.env.TEST_MONGO_URI='mongodb://user:secret@127.0.0.1:27017/somename?retryWrites=true';
 assert.equal(testDbName(),'somename','credentials and query strings do not confuse the parser');
 process.env.TEST_MONGO_DB='dictioncoaching_test';
 assert.equal(testDbName(),'dictioncoaching_test','the name test mode published wins');
 assert.equal(testDbName('other'),'dictioncoaching_test','the published name beats a fallback');
 if(saved.db===undefined)delete process.env.TEST_MONGO_DB;else process.env.TEST_MONGO_DB=saved.db;
 if(saved.uri===undefined)delete process.env.TEST_MONGO_URI;else process.env.TEST_MONGO_URI=saved.uri;
 if(saved.mode===undefined)delete process.env.CENTER_DATA_MODE;else process.env.CENTER_DATA_MODE=saved.mode;}
console.log('Database mode: test and production names separated; invalid values fail closed; attached tests resolve the same database the app serves.');
