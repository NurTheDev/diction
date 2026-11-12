/** Long-lived MongoMemoryReplSet on a fixed port for browser test runs. */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import {writeFile} from 'node:fs/promises';
(async () => {
  const mongo = await MongoMemoryReplSet.create({replSet: {count: 1}, instanceOpts: [{port: 27017}]});
  const uri = mongo.getUri();
  await writeFile('/tmp/mongo-uri.txt', uri);
  console.log('MONGO_URI=' + uri);
  console.log('MONGO_READY');
  const stop = async () => { await mongo.stop(); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  setInterval(() => {}, 1 << 30);
})();
