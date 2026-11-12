import assert from 'node:assert/strict';
import {monthStatus,dhakaCalendar,includeInDefaultDueList} from '../src/lib/center/month-status';
import {normalizePhone} from '../src/lib/center/phone';
const base={startMonth:{year:2026,month:1},feeHistory:[{effectiveFrom:{year:2026,month:1},amount:1000},{effectiveFrom:{year:2026,month:7},amount:1500}]};
const result=(month:number,now:string,extra:Record<string,unknown>={})=>monthStatus({...base,month:{year:2026,month},now:new Date(now),...extra});
assert.equal(result(11,'2026-11-10T17:59:00Z').status,'PENDING'); // 23:59 on the 10th, Dhaka
assert.equal(result(11,'2026-11-10T18:00:00Z').status,'DUE'); // 00:00 on the 11th
assert.equal(result(11,'2026-11-30T12:00:00Z').status,'DUE');
assert.equal(result(10,'2026-11-01T01:00:00Z').status,'DUE');
assert.equal(result(12,'2026-11-11T01:00:00Z').status,'UPCOMING');assert.equal(result(12,'2026-11-11T01:00:00Z',{paid:1500}).status,'PAID');assert.equal(result(12,'2026-11-11T01:00:00Z',{paid:200}).status,'PARTIAL');assert.equal(result(10,'2026-11-11T01:00:00Z',{paid:200}).status,'DUE');
assert.equal(result(11,'2026-11-11T01:00:00Z',{paid:300}).status,'DUE');assert.equal(result(11,'2026-11-11T01:00:00Z',{paid:300}).due,1200);assert.equal(result(11,'2026-11-11T01:00:00Z',{paid:300}).overdue,true);assert.equal(result(11,'2026-11-09T01:00:00Z',{paid:300}).overdue,false);
assert.equal(result(11,'2026-11-11T01:00:00Z',{paid:1600}).status,'PAID');assert.equal(result(11,'2026-11-11T01:00:00Z',{paid:1600}).overpayment,100);
assert.equal(result(5,'2026-11-11T01:00:00Z').fee,1000);assert.equal(result(8,'2026-11-11T01:00:00Z').fee,1500);
assert.equal(result(11,'2026-11-11T01:00:00Z',{waived:true}).status,'WAIVED');
assert.deepEqual(result(8,'2026-11-11T01:00:00Z',{holds:[{start:{year:2026,month:8},end:{year:2026,month:9}}],paid:400}),{status:'HELD',fee:1500,paid:400,due:0,overpayment:0,advance:400,overdue:false});
assert.equal(result(7,'2026-11-11T01:00:00Z',{holds:[{start:{year:2026,month:8},end:{year:2026,month:9}}]}).status,'DUE');assert.equal(result(10,'2026-11-11T01:00:00Z',{holds:[{start:{year:2026,month:8},end:{year:2026,month:9}}]}).status,'DUE');
assert.equal(result(11,'2026-11-11T01:00:00Z',{leaveDate:'2026-10-12'}).status,'NOT_APPLICABLE');assert.equal(result(10,'2026-11-11T01:00:00Z',{leaveDate:'2026-10-12'}).status,'DUE');
assert.equal(includeInDefaultDueList('on_hold'),false);assert.equal(includeInDefaultDueList('removed'),false);assert.equal(includeInDefaultDueList('active'),true);
assert.equal(dhakaCalendar(new Date('2026-11-10T18:00:00Z')).day,11);
for(const p of ['০১৭১২৩৪৫৬৭৮','+8801712345678','8801712345678','1712345678','01712345678'])assert.equal(normalizePhone(p),'01712345678');for(const p of ['01212345678','01712abc345678','+880001712345678','123'])assert.equal(normalizePhone(p),null);
console.log('Center month status and phone normalization tests passed.');
