// @ts-nocheck -- R3.17: the visitor funnel aggregation, against the disposable database.
/**
 * R3.17 · The visitor funnel, counted for real.
 *
 * The rules that need no database are proved in `lead-funnel.test.ts`; this suite proves the four
 * promises that only a collection can:
 *
 *   • the three stages are counted on the lead that arrived in the bucket — a trial booked in
 *     February for a January visitor belongs to January, because the report is about cohorts;
 *   • both kinds of evidence count: the intake reference the hand-off wrote (`trialBooking`,
 *     `admission`, `student`) and the operator's own word in the status dropdown;
 *   • trial → admitted divides by the leads that did both, so a direct admission raises *Admitted*
 *     and *Visitor → admitted* without pushing the trial rate past 100%;
 *   • a binned lead leaves the report exactly as it leaves the Visitors list, and the report carries
 *     no phone number anywhere — not in a bucket key, not in a total.
 *
 * Every lead here is synthetic and labelled FAKE; no real visitor data exists in this repository.
 */
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {preflight,testDbName} from './helpers/env-preflight';
import {User} from '../src/models/User';
import {Lead} from '../src/models/Lead';
import {leadFunnel} from '../src/lib/leads/funnel';
import {softDelete} from '../src/lib/admin/recycle';

const NOW=new Date(Date.UTC(2026,2,20,6,0,0)); // Dhaka sees 2026-03-20
const oid=()=>new mongoose.Types.ObjectId();

/** The cohort: eight live leads across three months, five sources and four class readings. */
const COHORT=[
  {leadId:'V-2026-0001',date:'2026-01-05',source:'walk_in',classGroup:9,status:'new'},
  {leadId:'V-2026-0002',date:'2026-01-12',source:'walk_in',classGroup:9,status:'trial_booked',trialBooking:oid()},
  {leadId:'V-2026-0003',date:'2026-01-20',source:'facebook',classGroup:10,status:'admitted',trialBooking:oid(),admission:oid()},
  {leadId:'V-2026-0004',date:'2026-02-02',source:'facebook',classGroup:10,status:'admitted',admission:oid()},
  {leadId:'V-2026-0005',date:'2026-02-14',source:'phone',classGroup:null,classLabel:'Column 1',status:'called'},
  {leadId:'V-2026-0006',date:'2026-02-18',source:'referral',classGroup:9,status:'trial_booked'},
  {leadId:'V-2026-0007',date:'2026-03-01',source:'walk_in',classGroup:12,status:'admitted',student:oid()},
  {leadId:'V-2026-0008',date:'2026-03-03',source:'other',classGroup:9,status:'do_not_contact'},
];

async function run(){
  await preflight({mongo:true,test:'tests/lead-funnel.integration.ts — run it with TEST_MONGO_URI, or let it raise its own disposable replica set'});
  const shared=process.env.TEST_MONGO_URI||null;
  const mongo=shared?{getUri:()=>shared,stop:async()=>{}}:await MongoMemoryReplSet.create({replSet:{count:1}});
  await mongoose.connect(mongo.getUri(),{dbName:testDbName()});
  if(shared){for(const c of await mongoose.connection.db.listCollections().toArray()){await mongoose.connection.db.collection(c.name).deleteMany({}).catch(()=>{})}}
  const hash=await bcrypt.hash('fake-funnel-only',12);
  const actor=await User.create({name:'FAKE Funnel',email:'fake-funnel@example.test',passwordHash:hash,role:'admin',active:true});
  const actorId=String(actor._id);
  try{
    await Lead.create(COHORT.map(entry=>({...entry,studentName:`FAKE ${entry.leadId}`,createdBy:actor._id,
      phones:[{normalized:'01711111111',original:'01711111111'}]})));

    // A ninth lead, binned: it would add a visitor, a trial and a walk-in class-9 row if the report
    // could see it, so its absence is the proof rather than an assumption.
    const binned=await Lead.create({leadId:'V-2026-0009',date:'2026-01-25',source:'walk_in',classGroup:9,
      status:'trial_booked',studentName:'FAKE Binned',createdBy:actor._id});
    assert.equal((await softDelete('lead',String(binned._id),actorId)).status,'ok','a lead with no intake row behind it bins cleanly');
    assert.equal(await Lead.countDocuments({}).setOptions({recycleAny:true}),9,'nine leads are stored…');

    // ── 1. The whole cohort ────────────────────────────────────────────────────────────────────
    const all=await leadFunnel({},NOW);
    assert.equal(all.totals.visitors,8,'…and eight of them are counted: the binned lead is not');
    assert.equal(all.totals.trial,3,'two trials by reference and one by status');
    assert.equal(all.totals.admitted,3,'an admission reference, an admission with a trial, and a student reference');
    assert.equal(all.totals.admittedFromTrial,1,'one lead did both');
    assert.equal(all.totals.visitorToTrial,37.5);
    assert.equal(all.totals.trialToAdmitted,33.3,'trial → admitted divides by the leads that did both…');
    assert.equal(all.totals.visitorToAdmitted,37.5,'…while the direct admission still counts here');
    assert.ok(!JSON.stringify(all).includes('01711111111'),'the report carries no phone number, though every lead holds one');

    // ── 2. By month: the cohort a visitor arrived in ───────────────────────────────────────────
    const byMonth=await leadFunnel({breakdown:'month'},NOW);
    assert.deepEqual(byMonth.rows.map(r=>r.key),['2026-03','2026-02','2026-01'],'newest month first, and only months with a lead');
    assert.equal(byMonth.monthsFilled,false,'nothing was filled in: no range was chosen');
    const [march,february,january]=byMonth.rows;
    assert.deepEqual({v:march.visitors,t:march.trial,a:march.admitted,b:march.admittedFromTrial},{v:2,t:0,a:1,b:0});
    assert.equal(march.visitorToTrial,0,'a month with visitors and no trial says zero…');
    assert.equal(march.trialToAdmitted,null,'…and a month with no trial at all has no trial rate');
    assert.equal(march.visitorToAdmitted,50);
    assert.deepEqual({v:february.visitors,t:february.trial,a:february.admitted,b:february.admittedFromTrial},{v:3,t:1,a:1,b:0});
    assert.equal(february.visitorToTrial,33.3);
    assert.equal(february.trialToAdmitted,0,'the February trial has not been admitted yet, which is a real zero');
    assert.deepEqual({v:january.visitors,t:january.trial,a:january.admitted,b:january.admittedFromTrial},{v:3,t:2,a:1,b:1});
    assert.equal(january.visitorToTrial,66.7);
    assert.equal(january.trialToAdmitted,50);
    assert.equal(january.visitorToAdmitted,33.3);
    assert.equal(january.visitors,3,'the binned January lead is not in January either');

    // ── 3. By source and by class: every bucket printed, zero or not ───────────────────────────
    const bySource=await leadFunnel({breakdown:'source'},NOW);
    assert.deepEqual(bySource.rows.map(r=>r.key),['walk_in','phone','facebook','referral','other'],'vocabulary order, all five');
    const source=key=>bySource.rows.find(r=>r.key===key);
    assert.deepEqual({v:source('walk_in').visitors,t:source('walk_in').trial,a:source('walk_in').admitted,b:source('walk_in').admittedFromTrial},{v:3,t:1,a:1,b:0});
    assert.equal(source('walk_in').visitorToTrial,33.3);
    assert.deepEqual({v:source('facebook').visitors,t:source('facebook').trial,a:source('facebook').admitted,b:source('facebook').admittedFromTrial},{v:2,t:1,a:2,b:1});
    assert.equal(source('facebook').visitorToAdmitted,100,'both Facebook visitors were admitted');
    assert.equal(source('facebook').trialToAdmitted,100,'and the one who trialled was one of them');
    assert.deepEqual({v:source('referral').visitors,t:source('referral').trial,a:source('referral').admitted},{v:1,t:1,a:0});
    assert.equal(source('referral').visitorToTrial,100);
    assert.equal(source('referral').trialToAdmitted,0);
    assert.equal(source('phone').visitors,1,'a source that brought one curious caller and nothing else');
    assert.equal(source('phone').trialToAdmitted,null);
    assert.equal(source('other').visitors,1);

    const byClass=await leadFunnel({breakdown:'class'},NOW);
    assert.equal(byClass.rows.length,13,'twelve classes and the leads whose class was never read');
    assert.deepEqual(byClass.rows.slice(0,12).map(r=>r.key),['1','2','3','4','5','6','7','8','9','10','11','12'],'in order, so the CSV keeps one shape');
    assert.equal(byClass.rows[12].key,'none');
    const klass=key=>byClass.rows.find(r=>r.key===key);
    assert.deepEqual({v:klass('9').visitors,t:klass('9').trial,a:klass('9').admitted,b:klass('9').admittedFromTrial},{v:4,t:2,a:0,b:0});
    assert.equal(klass('9').visitorToTrial,50,'class 9 is where the front desk is spending its calls');
    assert.deepEqual({v:klass('10').visitors,t:klass('10').trial,a:klass('10').admitted,b:klass('10').admittedFromTrial},{v:2,t:1,a:2,b:1});
    assert.deepEqual({v:klass('12').visitors,t:klass('12').trial,a:klass('12').admitted},{v:1,t:0,a:1});
    assert.equal(klass('12').visitorToAdmitted,100);
    assert.equal(klass('none').visitors,1,'the row whose class the sheet never gave up is its own bucket, not a rounding error');
    assert.equal(klass('5').visitors,0,'and a class nobody asked about is printed as zero, not hidden');
    assert.equal(klass('5').visitorToTrial,null);

    // ── 4. Ranges, filters and the months a range fills in ─────────────────────────────────────
    const oneMonth=await leadFunnel({breakdown:'month',from:'2026-02-01',to:'2026-02-28'},NOW);
    assert.equal(oneMonth.totals.visitors,3,'a range narrows the cohort');
    assert.deepEqual(oneMonth.rows.map(r=>r.key),['2026-02']);
    assert.equal(oneMonth.monthsFilled,false);
    const filled=await leadFunnel({breakdown:'month',from:'2025-12-01',to:'2026-03-31'},NOW);
    assert.deepEqual(filled.rows.map(r=>r.key),['2026-03','2026-02','2026-01','2025-12'],'the chosen range fills the month nobody visited');
    assert.equal(filled.monthsFilled,true,'and the report says so, so the zero is not mistaken for a missing month');
    const empty=filled.rows.find(r=>r.key==='2025-12');
    assert.deepEqual({v:empty.visitors,t:empty.trial,a:empty.admitted},{v:0,t:0,a:0});
    assert.equal(empty.visitorToTrial,null,'an empty month has no rates');
    const facebookOnly=await leadFunnel({breakdown:'month',source:'facebook'},NOW);
    assert.equal(facebookOnly.totals.visitors,2,'a source filter narrows the cohort, not just the rows');
    assert.deepEqual(facebookOnly.rows.map(r=>r.key),['2026-02','2026-01']);
    const classOnly=await leadFunnel({breakdown:'source',classGroup:'9'},NOW);
    assert.equal(classOnly.totals.visitors,4,'and so does a class filter');
    assert.equal(classOnly.rows.length,5,'while every source still prints');
    const reversed=await leadFunnel({breakdown:'month',from:'2026-03-05',to:'2026-01-02'},NOW);
    assert.deepEqual(reversed.rows.map(r=>r.key),['2026-03','2026-02','2026-01'],'a reversed range is read as the typo it is');
    const invented=await leadFunnel({breakdown:'nonsense',source:'tiktok',classGroup:'99'},NOW);
    assert.equal(invented.query.breakdown,'month','an invented breakdown falls back to the month report');
    assert.equal(invented.totals.visitors,8,'and invented filters are ignored rather than trusted');

    // ── 5. The two aggregations agree, for every breakdown ─────────────────────────────────────
    for(const breakdown of ['month','source','class']){
      const report=await leadFunnel({breakdown},NOW);
      const sum=report.rows.reduce((total,r)=>total+r.visitors,0);
      assert.equal(sum,report.totals.visitors,`${breakdown}: the buckets add up to the cohort, so no lead is counted twice or dropped`);
      assert.equal(report.rows.reduce((total,r)=>total+r.admitted,0),report.totals.admitted,`${breakdown}: and the admissions do too`);
    }

    // ── 6. An empty database is a report, not an error ─────────────────────────────────────────
    await Lead.deleteMany({});
    const nothing=await leadFunnel({breakdown:'month'},NOW);
    assert.equal(nothing.totals.visitors,0,'with no leads the month report has no rows…');
    assert.equal(nothing.rows.length,0);
    assert.equal(nothing.totals.visitorToTrial,null,'…and no rates');
    const nothingBySource=await leadFunnel({breakdown:'source'},NOW);
    assert.equal(nothingBySource.rows.length,5,'while the source report still prints its five buckets, all zero');
    assert.equal(nothingBySource.totals.visitors,0);

    console.log('Visitor funnel against the disposable database: eight synthetic leads across three months, five sources and four class readings counted as visitors 8 / trials 3 / admitted 3 with rates 37.5%, 33.3% and 37.5%; trials and admissions counted by intake reference and by status alike; trial → admitted divided by the leads that did both so a direct admission never pushes it past 100%; the ninth lead invisible once binned; no phone number anywhere in the report; every source and class printed at zero; a chosen range filling its empty month; buckets adding up to the cohort in all three breakdowns; and an empty database reading as a report rather than an error.');
  }finally{
    await mongoose.disconnect();
    await mongo.stop();
  }
}
run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
