/** Recycle Bin policy, Mongo-free: the sentences an owner reads must be exact and stable. */
import assert from 'node:assert/strict';
import {blockedMessage,purgeExpired,kindDef,recycleRegistry,restoreRecord,softDelete,type ReferenceCount} from '../src/lib/admin/recycle';
import {RECYCLE_RETENTION_DAYS,purgeAtFor,liveFilter,binFilter} from '../src/models/recycle';

// The brief's own example sentence, in both languages, composed from the catalogue the UI reads.
import bnMessages from '../src/messages/bn.json';
import enMessages from '../src/messages/en.json';
const resolve=(catalog:unknown,key:string):string=>key.split('.').reduce((node:unknown,part:string)=>(node as Record<string,unknown>)?.[part],catalog) as string;
const fill=(template:string,params:Record<string,unknown>):string=>template.replace(/\{(\w+)\}/g,(_,name)=>String(params[name]??''));
const tbn=(key:string,params?:Record<string,unknown>)=>fill(resolve(bnMessages.recycleBin,key),params||{});
const ten=(key:string,params?:Record<string,unknown>)=>fill(resolve(enMessages.recycleBin,key),params||{});
const students:ReferenceCount[]=[{count:14,messageKey:'recycleBin.kinds.k2'}];
assert.equal(blockedMessage(students,'bn'),`১৪ ${resolve(bnMessages.recycleBin,'kinds.k2')} — মুছে ফেলা যাবে না। আর্কাইভ করুন।`);
assert.equal(blockedMessage(students,'en'),'14 '+resolve(enMessages.recycleBin,'kinds.k2')+' — cannot be deleted. Archive it instead.');

// Several reasons are joined, and Bangla digits are used for Bangla.
const two:ReferenceCount[]=[students[0],{count:3,messageKey:'recycleBin.kinds.k3'}];
assert.equal(blockedMessage(two,'bn'),`১৪ ${resolve(bnMessages.recycleBin,'kinds.k2')}; ৩ ${resolve(bnMessages.recycleBin,'kinds.k3')} — মুছে ফেলা যাবে না। আর্কাইভ করুন।`);

// Retention is 30 days, computed from the moment of deletion.
assert.equal(RECYCLE_RETENTION_DAYS,30);
const now=new Date('2026-11-12T09:00:00Z');
assert.equal(purgeAtFor(now).toISOString(),new Date('2026-12-12T09:00:00Z').toISOString());

// Live-vs-bin filters must keep pre-R1 rows (no deletedAt at all) visible.
assert.deepEqual(liveFilter,{deletedAt:{$not:{$type:'date'}}});
assert.deepEqual(binFilter,{deletedAt:{$type:'date'}});

// Registry integrity: unique kinds, names in both languages, and the blocking kinds really count.
const kinds=recycleRegistry.map(entry=>entry.kind);
assert.equal(new Set(kinds).size,kinds.length,'every recycle kind is unique');
for(const entry of recycleRegistry){
  assert.ok(entry.labelBn.trim()&&entry.labelEn.trim(),`${entry.kind} needs labels in both languages`);
  assert.equal(typeof entry.nameOf,'function');
}
for(const blocking of ['classGroup','centerExam','media'] as const){
  assert.equal(typeof kindDef(blocking).references,'function',`${blocking} must count its references before delete`);
}
for(const simple of ['editorial','course','portalNotice','faq','facility','practiceTest','publicSheet','material','achievementRecord'] as const){
  assert.equal(kindDef(simple).references,undefined,`${simple} is simple content: delete goes straight to the bin`);
}
assert.throws(()=>kindDef('nope' as never));

// Cloudinary assets are destroyed at purge, and only for cloudinary-backed media.
const mediaAssets=kindDef('media').assets!;
assert.deepEqual(mediaAssets({_id:'' as never,storage:'mongo',publicId:'x'}),[]);
assert.deepEqual(mediaAssets({_id:'' as never,storage:'cloudinary',publicId:'dictioncoaching/abc'}),[{publicId:'dictioncoaching/abc',resource:'image'}]);

// The five engine functions are the only way in, and they are all exported for actions, the bin
// page and the scheduled job alike.
for(const fn of [softDelete,restoreRecord,purgeExpired])assert.equal(typeof fn,'function');

console.log('Recycle policy: exact Bangla/English blocked sentences, 30-day retention, live-vs-bin filters and registry integrity.');
